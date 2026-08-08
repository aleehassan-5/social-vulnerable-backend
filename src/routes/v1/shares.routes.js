const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  sharePost,
  unsharePost,
  getSharesCount,
  checkUserShare,
  getShareUsers
} = require('../../controllers/share.controller');

router.get('/:postId/count', getSharesCount);
router.get('/:postId/users', getShareUsers);
router.post('/:postId', protect, sharePost);
router.delete('/:postId', protect, unsharePost);
router.get('/:postId/check', protect, checkUserShare);

module.exports = router;