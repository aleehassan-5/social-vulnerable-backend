const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  getUserProfile,
  updateProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  searchUsers
} = require('../../controllers/user.controller');

// Protected routes (must come before /:username to avoid conflicts)
router.put('/me', protect, updateProfile);
router.post('/:id/follow', protect, followUser);
router.delete('/:id/follow', protect, unfollowUser);

// IMPORTANT: /search must be registered before the /:username catch-all,
// or Express will treat "search" as a username lookup instead.
router.get('/search', protect, searchUsers);

// Public routes
router.get('/:username', getUserProfile);
router.get('/:id/followers', getFollowers);
router.get('/:id/following', getFollowing);

module.exports = router;