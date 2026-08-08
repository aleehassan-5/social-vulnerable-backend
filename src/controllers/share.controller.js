const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Share a post
// @route   POST /api/v1/shares/:postId
// @access  Private
const sharePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    // Check if post exists and is not deleted
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        isDeleted: false,
        author: { isActive: true }
      }
    });
    
    if (!post) {
      return next(new ApiError(404, 'Post not found'));
    }
    
    // Check if already shared
    const existingShare = await prisma.share.findFirst({
      where: {
        userId: userId,
        postId: postId
      }
    });
    
    if (existingShare) {
      return next(new ApiError(400, 'You already shared this post'));
    }
    
    // Create share
    await prisma.share.create({
      data: {
        userId: userId,
        postId: postId
      }
    });
    
    // Update post share count
    await prisma.post.update({
      where: { id: postId },
      data: { sharesCount: { increment: 1 } }
    });
    
    // Create notification for post author
    if (post.authorId !== userId) {
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'share',
          actorId: userId,
          postId: postId,
          message: `${req.user.fullName} shared your post`
        }
      });
    }
    
    res.json({ success: true, message: 'Post shared successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unshare a post
// @route   DELETE /api/v1/shares/:postId
// @access  Private
const unsharePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    const share = await prisma.share.findFirst({
      where: {
        userId: userId,
        postId: postId
      }
    });
    
    if (!share) {
      return next(new ApiError(400, 'You have not shared this post'));
    }
    
    await prisma.share.delete({
      where: {
        id: share.id
      }
    });
    
    // Update post share count
    await prisma.post.update({
      where: { id: postId },
      data: { sharesCount: { decrement: 1 } }
    });
    
    res.json({ success: true, message: 'Share removed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get shares count for a post
// @route   GET /api/v1/shares/:postId/count
// @access  Public
const getSharesCount = async (req, res, next) => {
  try {
    const { postId } = req.params;
    
    const count = await prisma.share.count({
      where: { postId: postId }
    });
    
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if user shared a post
// @route   GET /api/v1/shares/:postId/check
// @access  Private
const checkUserShare = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    const share = await prisma.share.findFirst({
      where: {
        userId: userId,
        postId: postId
      }
    });
    
    res.json({ success: true, data: { isShared: !!share } });
  } catch (error) {
    next(error);
  }
};

// @desc    Get users who shared a post
// @route   GET /api/v1/shares/:postId/users
// @access  Public
const getShareUsers = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const shares = await prisma.share.findMany({
      where: { postId: postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      },
      skip: skip,
      take: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: shares.map(s => s.user),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sharePost,
  unsharePost,
  getSharesCount,
  checkUserShare,
  getShareUsers
};