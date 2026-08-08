const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const lab = require('../../controllers/lab.controller');

// NOTE on /jwt-demo: it is deliberately mounted WITHOUT `protect` below,
// because the whole point of that lab is an endpoint that trusts a token's
// claims without verifying its signature — running it behind real
// signature-checking auth would defeat the exercise. Every other route
// requires a real, valid login (most real-world vulnerabilities are
// exploited by an authenticated-but-lower-privileged user, not an outsider).
router.get('/jwt-demo', lab.labJwtDemo);

router.use(protect);

// Easy
router.get('/accounts/:id', lab.getLabAccount);
router.get('/users/:id/raw', lab.getRawUser);
router.get('/admin-panel', lab.getAdminPanel);
router.post('/login', lab.labLogin);

// Normal
router.post('/comments', lab.postLabComment);
router.get('/comments', lab.getLabComments);
router.get('/search', lab.labSearch);
router.get('/wallet/:id/gift', lab.labWalletGift);
router.get('/redirect', lab.labRedirect);

// Hard
router.get('/reports', lab.labReportsSearch);
router.patch('/profile/mass-assign', lab.labMassAssign);
router.post('/link-preview', lab.labLinkPreview);

// Progress
router.get('/progress', lab.getLabProgress);

module.exports = router;
