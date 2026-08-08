const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  likePost,
  unlikePost,
  likeComment,
  unlikeComment,
  checkPostLike
} = require('../../controllers/like.controller');

// Post likes
router.post('/post/:postId', protect, likePost);
router.delete('/post/:postId', protect, unlikePost);
router.get('/post/:postId/check', protect, checkPostLike);

// Comment likes
router.post('/comment/:commentId', protect, likeComment);
router.delete('/comment/:commentId', protect, unlikeComment);

module.exports = router;