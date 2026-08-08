/**
 * SECURITY LAB — intentionally vulnerable endpoints (training only)
 * ────────────────────────────────────────────────────────────────
 * Every function in this file contains ONE deliberate, commented bug.
 * They exist so Syntra can practice exploiting real classes of web
 * vulnerabilities against a real app they built themselves.
 *
 * DO NOT copy patterns from this file into production controllers.
 * Each function has a `// VULN:` comment explaining the bug and a
 * `// FIX:` comment explaining how it would actually be fixed.
 *
 * Flags: on a successful exploit, the endpoint returns a `flag` field.
 * The frontend just displays/stores it — there is no server-side
 * "prove you understood it" check, this is a solo practice lab, not
 * a multiplayer CTF.
 */

const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');
const asyncHandler = require('../utils/asyncHandler');

const flag = (key) => `LAB{${key}_${Buffer.from(key).toString('hex').slice(0, 8)}}`;

const captureFlag = async (userId, flagKey) => {
  if (!userId) return;
  try {
    await prisma.labCapture.upsert({
      where: { userId_flagKey: { userId, flagKey } },
      update: {},
      create: { userId, flagKey },
    });
  } catch {
    // ignore duplicate/race — capturing twice is fine
  }
};

// Make sure the logged-in user has a LabAccount row (lazy-provision).
const ensureLabAccount = async (userId) => {
  return prisma.labAccount.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
};

/* ══════════════════════════ EASY ══════════════════════════ */

// GET /lab/accounts/:id
// VULN: Insecure Direct Object Reference (IDOR). The route trusts the
// :id in the URL and never checks it belongs to req.user — so any
// logged-in user can read (and, via the PATCH below, write) anyone
// else's lab account, including its "secret" apiKey.
// FIX: look up the account by req.user.id instead of req.params.id,
// or explicitly check `account.userId === req.user.id` before returning it.
const getLabAccount = asyncHandler(async (req, res) => {
  await ensureLabAccount(req.user.id);
  const id = Number(req.params.id);
  const account = await prisma.labAccount.findUnique({ where: { id } });
  if (!account) throw new ApiError(404, 'Lab account not found');

  const isOwn = account.userId === req.user.id;
  res.json({
    success: true,
    data: account,
    ...(isOwn ? {} : { flag: flag('idor_account_read') }),
  });
  if (!isOwn) await captureFlag(req.user.id, 'idor_account_read');
});

// GET /lab/users/:id/raw
// VULN: Sensitive data exposure — returns the full raw user row
// (passwordHash, refreshToken included) instead of a safe DTO.
// FIX: always `select` an explicit allow-list of fields, never spread
// a raw Prisma row straight into an HTTP response.
const getRawUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, 'User not found');
  await captureFlag(req.user.id, 'sensitive_data_exposure');
  res.json({ success: true, data: user, flag: flag('sensitive_data_exposure') });
});

// GET /lab/admin-panel
// VULN: Broken access control via "security through obscurity" — this
// route is never linked in the UI and has no role check at all, only
// the generic `protect` (must-be-logged-in) middleware. Any authenticated
// user who finds/guesses the URL gets admin-only data.
// FIX: add `restrictTo('ADMIN')` (already implemented in auth.middleware.js!)
const getAdminPanel = asyncHandler(async (req, res) => {
  await captureFlag(req.user.id, 'broken_access_control');
  res.json({
    success: true,
    message: 'Welcome to the hidden admin panel — this should have needed an ADMIN role.',
    flag: flag('broken_access_control'),
  });
});

// POST /lab/login  { username, password }
// VULN: No rate limiting on this specific route (the global limiter is
// 300 req/15min across the whole API, way too loose for a login form)
// and a seeded weak-password account, so it's brute-forceable.
// FIX: a strict per-IP+per-account limiter (e.g. 5 attempts / 10 min)
// on auth routes specifically, plus account lockout / captcha after N fails.
const labLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'labadmin' && password === 'admin123') {
    await captureFlag(req.user.id, 'weak_login_bruteforce');
    return res.json({ success: true, message: 'Logged in as labadmin', flag: flag('weak_login_bruteforce') });
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

/* ══════════════════════════ NORMAL ══════════════════════════ */

// POST /lab/comments  { body }
// GET  /lab/comments
// VULN: Stored XSS. The comment body is saved and returned completely
// unsanitized; the matching frontend page renders it with
// dangerouslySetInnerHTML, so a script tag saved here executes for
// every visitor who views the comments.
// FIX: sanitize on write (e.g. DOMPurify/sanitize-html) AND render as
// plain text on the frontend (never dangerouslySetInnerHTML for user content).
const postLabComment = asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  if (!body) throw new ApiError(400, 'body is required');
  const comment = await prisma.labComment.create({ data: { userId: req.user.id, body } });
  if (/<script|onerror=|onload=|javascript:/i.test(body)) {
    await captureFlag(req.user.id, 'stored_xss');
  }
  res.status(201).json({ success: true, data: comment });
});

const getLabComments = asyncHandler(async (req, res) => {
  const comments = await prisma.labComment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { user: { select: { username: true, fullName: true } } },
  });
  res.json({ success: true, data: comments });
});

// GET /lab/search?q=
// VULN: Reflected XSS. Whatever `q` is gets echoed back verbatim in the
// JSON `message`, and the lab frontend renders that message with
// dangerouslySetInnerHTML to simulate a "your search results for ..." banner.
// FIX: HTML-escape any user input before ever putting it into rendered HTML,
// regardless of whether it round-tripped through an API first.
const labSearch = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '');
  if (/<script|onerror=|onload=/i.test(q)) {
    await captureFlag(req.user.id, 'reflected_xss');
  }
  res.json({ success: true, message: `Search results for: ${q}`, results: [] });
});

// GET /lab/wallet/:id/gift?amount=50
// VULN: Cross-Site Request Forgery. This is a state-changing action
// (credits money) triggered by a plain GET with no CSRF token and no
// re-auth check beyond "is any valid session cookie present" — so an
// attacker's page can trigger it just by loading an <img src="..."> tag
// while the victim is logged in.
// FIX: use POST + a CSRF token (or SameSite=Strict cookies + custom header
// check), and never perform state changes on GET requests.
const labWalletGift = asyncHandler(async (req, res) => {
  const targetId = Number(req.params.id);
  const amount = Number(req.query.amount || 0);
  const account = await prisma.labAccount.findUnique({ where: { id: targetId } });
  if (!account) throw new ApiError(404, 'Lab account not found');
  await prisma.labAccount.update({ where: { id: targetId }, data: { balance: { increment: amount } } });
  await captureFlag(req.user.id, 'csrf_state_change');
  res.json({ success: true, message: `Gifted ${amount} to account #${targetId}`, flag: flag('csrf_state_change') });
});

// GET /lab/redirect?to=
// VULN: Open redirect — `to` is trusted and used directly, letting an
// attacker send victims to `real-app.com/lab/redirect?to=evil.com` which
// looks trustworthy (real domain) but bounces to a phishing site.
// FIX: only allow relative paths or a hard allow-list of destination hosts.
const labRedirect = asyncHandler(async (req, res) => {
  const to = String(req.query.to || '/');
  const isExternal = /^https?:\/\//i.test(to) && !to.includes(req.get('host'));
  if (isExternal) await captureFlag(req.user.id, 'open_redirect');
  res.json({ success: true, wouldRedirectTo: to, external: isExternal, ...(isExternal ? { flag: flag('open_redirect') } : {}) });
});

/* ══════════════════════════ HARD ══════════════════════════ */

// GET /lab/reports?authorUsername=
// VULN: SQL Injection. Built with a raw, string-concatenated query instead
// of Prisma's parameterized query builder (or even $queryRaw with tagged
// template params). A payload like  ' OR '1'='1  or a UNION SELECT breaks
// out of the intended query.
// FIX: use `$queryRaw` with tagged-template interpolation (auto-parameterized)
// or, better, the normal Prisma query builder — never string-concat user input into SQL.
const labReportsSearch = asyncHandler(async (req, res) => {
  const authorUsername = String(req.query.authorUsername || '');
  const sql = `SELECT id, username, email, role FROM "User" WHERE username = '${authorUsername}' LIMIT 20`;
  try {
    const rows = await prisma.$queryRawUnsafe(sql);
    if (/('|"|--|;|\bunion\b|\bor\b)/i.test(authorUsername)) {
      await captureFlag(req.user.id, 'sql_injection');
    }
    res.json({ success: true, data: rows, flag: /('|"|--|;|\bunion\b|\bor\b)/i.test(authorUsername) ? flag('sql_injection') : undefined });
  } catch (e) {
    // Even a raw DB error string leaking back to the client is itself a
    // (smaller) info-disclosure bug — intentionally left in for the lab.
    res.status(400).json({ success: false, message: 'Query failed', error: e.message });
  }
});

// GET /lab/jwt-demo   (Authorization: Bearer <token>)
// VULN: JWT verified with `jwt.decode()` instead of `jwt.verify()` — i.e.
// the signature is never actually checked. An attacker can hand-craft a
// token with `alg: none` (or any garbage signature) and any payload
// (e.g. { id: <victim>, role: "ADMIN" }) and this endpoint will trust it.
// FIX: always `jwt.verify(token, secret, { algorithms: ['HS256'] })` and
// explicitly reject `alg: none`.
const labJwtDemo = asyncHandler(async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'No token provided');

  const decoded = jwt.decode(token); // <-- the bug: no signature check
  if (!decoded) throw new ApiError(400, 'Malformed token');

  const claimedAdmin = decoded.role === 'ADMIN' || decoded.forgedAdmin === true;

  // This route intentionally runs with no real auth (see routes/v1/lab.routes.js),
  // since that's the whole vulnerability. The header below is ONLY used to know
  // whose "flags captured" list to update in the Security Lab UI — it carries
  // zero authority and proves nothing, it's just bookkeeping for your own progress page.
  const progressUserId = req.headers['x-lab-progress-user'];
  if (claimedAdmin && progressUserId) await captureFlag(String(progressUserId), 'jwt_no_verify');

  res.json({
    success: true,
    message: 'Token accepted without verifying its signature.',
    decoded,
    ...(claimedAdmin ? { flag: flag('jwt_no_verify') } : {}),
  });
});

// PATCH /lab/profile/mass-assign   { ...anything... }
// VULN: Mass assignment / privilege escalation. The whole request body is
// spread straight into the Prisma `data` object, so sending
// { "role": "ADMIN" } silently upgrades the caller's own account.
// FIX: whitelist exactly the fields a user is allowed to change
// (e.g. { fullName, bio, avatar }), never `data: { ...req.body }`.
const labMassAssign = asyncHandler(async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { ...req.body }, // <-- the bug
    select: { id: true, username: true, role: true, fullName: true, bio: true },
  });
  if (req.body?.role && req.body.role !== 'USER') {
    await captureFlag(req.user.id, 'mass_assignment_privesc');
  }
  res.json({ success: true, data: updated, flag: req.body?.role && req.body.role !== 'USER' ? flag('mass_assignment_privesc') : undefined });
});

// POST /lab/link-preview   { url }
// VULN: Server-Side Request Forgery. The server fetches whatever URL the
// client supplies with no validation — including internal/private
// addresses (127.0.0.1, 169.254.169.254 metadata endpoints, etc.) — and
// hands the raw response back to the client.
// FIX: resolve the hostname, reject private/loopback/link-local IP ranges,
// use an allow-list of external hosts, and never proxy back arbitrary responses.
const labLinkPreview = asyncHandler(async (req, res) => {
  const { url } = req.body || {};
  if (!url) throw new ApiError(400, 'url is required');

  const isInternal = /localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.|::1/i.test(url);
  if (isInternal) await captureFlag(req.user.id, 'ssrf_link_preview');

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    const text = (await r.text()).slice(0, 2000);
    res.json({ success: true, status: r.status, preview: text, ...(isInternal ? { flag: flag('ssrf_link_preview') } : {}) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message, ...(isInternal ? { flag: flag('ssrf_link_preview') } : {}) });
  }
});

/* ══════════════════════════ PROGRESS ══════════════════════════ */

// GET /lab/progress
const getLabProgress = asyncHandler(async (req, res) => {
  const captures = await prisma.labCapture.findMany({ where: { userId: req.user.id } });
  res.json({ success: true, data: captures.map(c => c.flagKey) });
});

module.exports = {
  getLabAccount,
  getRawUser,
  getAdminPanel,
  labLogin,
  postLabComment,
  getLabComments,
  labSearch,
  labWalletGift,
  labRedirect,
  labReportsSearch,
  labJwtDemo,
  labMassAssign,
  labLinkPreview,
  getLabProgress,
};
