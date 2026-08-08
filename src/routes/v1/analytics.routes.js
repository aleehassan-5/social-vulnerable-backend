const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middleware/auth.middleware');
const {
  getUserAnalytics,
  getPostAnalytics,
  getPlatformAnalytics,
  trackImpression,
  getTrendingPosts
} = require('../../controllers/analytics.controller');

router.get('/trending', getTrendingPosts);
router.post('/post/:postId/impression', trackImpression);
router.get('/user/:userId', protect, getUserAnalytics);
router.get('/post/:postId', protect, getPostAnalytics);
router.get('/platform', protect, restrictTo('ADMIN'), getPlatformAnalytics);

module.exports = router;