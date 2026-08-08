# Synergy Social — Security Training Build

This build integrates intentional, documented vulnerabilities directly into
Synergy Social's **real** features and endpoints — not into a separate
`/lab` demo surface. The app behaves like a normal social platform; the
bugs are only visible by inspecting/manipulating real requests, the same
way you'd find them in an actual pentest.

The original standalone lab (`/api/v1/lab/*`, `src/controllers/lab.controller.js`,
and the frontend's Security Lab / Vuln Guide / Lab Progress pages) is left
in place as a secondary reference — a clean, isolated write-up of each bug
class if you want the "textbook" version side by side with the real one.
See the bottom of this file for the original lab setup instructions.

**Local, synthetic-data training use only.** Every issue below is a genuine
class of real-world vulnerability; do not deploy this build anywhere
reachable by anyone other than you, and don't point it at real user data.

## Vulnerability → real feature map

| # | Vulnerability | Real application feature | Endpoint / location | Difficulty |
|---|---|---|---|---|
| 1 | IDOR / BOLA | Direct Messages | `GET /api/v1/messages/:conversationId` — `message.controller.js` → `getMessages` | Easy |
| 2 | Broken Access Control | Post visibility (view single post) | `GET /api/v1/posts/:id` — `post.controller.js` → `getPost` | Easy |
| 3 | Stored XSS | Post content & comments | Frontend render — `RealPostCard.tsx` (post body + comment body), backed by `POST /api/v1/posts` and `POST /api/v1/comments`, which store `content` unsanitized | Easy |
| 4 | Reflected XSS | Search (Explore page) | `/explore?q=...` — `ExplorePage.tsx` (URL-driven query pre-fill + unescaped "No results for" render) | Easy |
| 5 | SQL Injection | User search | `GET /api/v1/users/search?q=` — `user.controller.js` → `searchUsers` (new endpoint; the frontend already called this route, it just didn't exist on the backend before) | Medium |
| 6 | CSRF | Account settings (profile update) | `PUT /api/v1/auth/profile` — reachable via cookie auth (`auth.middleware.js` cookie fallback, now populated at login) + the wildcard `*.vercel.app` CORS origin in `app.js` | Medium |
| 7 | Mass Assignment | Account settings (profile update) | `PUT /api/v1/auth/profile` — `auth.controller.js` → `updateProfile` (spreads request body, e.g. `role`, into the Prisma update) | Medium |
| 8 | Open Redirect | Post-login redirect | `AuthPage.tsx` — `?next=` param trusted and passed to `window.location.href` | Medium |
| 9 | JWT signature not verified | Real-time messaging auth | WebSocket handshake — `socket/index.js` → `io.use(...)` uses `jwt.decode()` instead of `jwt.verify()` (REST auth in `auth.middleware.js` is unaffected and still verifies correctly) | Hard |
| 10 | SSRF | Link preview in post composer | `POST /api/v1/posts/link-preview` — `post.controller.js` → `linkPreview`, wired into `FeedPage.tsx`'s composer | Hard |

Every vulnerable function has a `// VULN:` comment (what's wrong and why
it's exploitable through normal use) and a `// FIX:` comment (what the
correct implementation looks like) directly above it in the code.

## What's NOT vulnerable (intentionally)

- The core `protect` REST auth middleware (`auth.middleware.js`) still does
  a real `jwt.verify()` — only the secondary WebSocket auth path was
  weakened, to keep the rest of the app usable and stable.
- `POST /api/v1/users/:id/follow`, post/comment delete, admin role changes,
  and password change all still check ownership/role correctly.
- Media uploads still go through Cloudinary; no path traversal / arbitrary
  file write was introduced.

## Try it

- **IDOR**: log in as two different users, open a DM between them, grab the
  `conversationId`, then call `GET /messages/:conversationId` as a *third*
  user who was never part of that conversation.
- **Broken Access Control**: as User A, create a post with visibility
  `ONLY_ME`, copy its id, then fetch `GET /posts/:id` while logged in as
  User B (or logged out).
- **Stored XSS**: post or comment `<img src=x onerror=alert(document.cookie)>`.
- **Reflected XSS**: visit `/explore?q=<img src=x onerror=alert(1)>`.
- **SQL Injection**: `GET /api/v1/users/search?q=' OR '1'='1` (also try a
  payload that breaks the string and appends a `UNION SELECT` to pull
  columns from other tables).
- **Mass Assignment**: `PUT /auth/profile` with body
  `{ "role": "ADMIN" }`, then check `GET /auth/me`.
- **Open Redirect**: `/auth?next=https://example.com` — after a successful
  login you're bounced off-site.
- **JWT (socket)**: connect a Socket.IO client with
  `auth: { token: forgedJwtWithAnyIdClaim }` — no real secret needed since
  the signature is never checked here.
- **SSRF**: paste `http://localhost:5000/api/v1/admin/dashboard` (or another
  internal URL) into the post composer and watch the link-preview card.

## Fixing everything back

Each `// FIX:` comment is a direct drop-in replacement. To harden the whole
build at once: re-add the participant/visibility checks (#1, #2), sanitize
`content` on write and render as plain text or sanitized HTML (#3), escape
`query` before rendering (#4), swap `$queryRawUnsafe` string concat for the
Prisma query builder or a tagged-template `$queryRaw` (#5), add a CSRF
token check and tighten CORS origins (#6), whitelist updatable fields (#7),
validate `next` is a same-origin relative path (#8), swap `jwt.decode` for
`jwt.verify` in the socket middleware (#9), and add an SSRF guard that
resolves + rejects private/loopback/link-local hosts before fetching (#10).

---

## Original standalone lab (kept as reference)

This repo also still contains an isolated practice lab (like DVWA/WebGoat/
Juice Shop, but inside this app) — 12 vulnerabilities, one per bug class,
each with the same real endpoint it now also lives in above.

### 1. Run the migration

New tables (`LabAccount`, `LabComment`, `LabCapture`) live in
`prisma/schema.prisma`. Generate and apply the migration locally:

```bash
npx prisma migrate dev --name add_security_lab
npx prisma generate
```

This needs a real `DATABASE_URL` in your `.env` (same as normal dev setup).

### 2. Start the backend as usual

```bash
npm run dev
```

Lab routes are mounted at `/api/v1/lab/*` — see `src/routes/v1/lab.routes.js`.
All routes require a normal login **except** `GET /lab/jwt-demo`, which is
deliberately public since that's the point of the exercise.

### 3. Frontend

No extra setup — the "Security Lab", "Vuln Guide", and "Lab Progress" pages
are already wired into the sidebar. Just run the frontend as usual and log in.

Full write-up of each lab bug is in `frontend/src/lib/labData.ts`, and also
renders in-app on the **Vuln Guide** page. Every lab function is commented
with `// VULN:` / `// FIX:` — see `src/controllers/lab.controller.js`.

### Note

This is a personal training surface, not something to expose publicly or
merge patterns from into real features. Keep it on a local/dev deployment.
