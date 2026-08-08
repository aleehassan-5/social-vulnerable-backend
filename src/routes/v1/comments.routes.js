const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  addComment,
  getComments,
  deleteComment
} = require('../../controllers/comment.controller');

// Public routes
router.get('/:postId', getComments);

// Protected routes
router.post('/', protect, addComment);  // Changed from :postId to body param
router.delete('/:id', protect, deleteComment);

module.exports = router;