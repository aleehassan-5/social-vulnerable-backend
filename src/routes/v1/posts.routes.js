const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  createPost, 
  getFeed, 
  getPost, 
  updatePost,  // ✅ ADD THIS
  deletePost, 
  getExplore,
  toggleLike,
  linkPreview
} = require('../../controllers/post.controller');

// IMPORTANT: Specific named routes MUST come before /:id to avoid being matched as IDs
router.get('/feed', protect, getFeed);
router.get('/explore', protect, getExplore);
router.post('/link-preview', protect, linkPreview);
router.get('/:id', getPost);
router.post('/', protect, createPost);
router.put('/:id', protect, updatePost);  // ✅ ADD THIS - Update post
router.post('/:id/like', protect, toggleLike);
router.delete('/:id', protect, deletePost);

module.exports = router;