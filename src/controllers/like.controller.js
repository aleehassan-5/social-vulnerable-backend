const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');
const { emitNotification } = require('../../socket');

// @desc    Like a post
// @route   POST /api/v1/likes/post/:postId
// @access  Private
const likePost = async (req, res, next) => {
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
    
    // Check if already liked
    const existingLike = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });
    
    if (existingLike) {
      return next(new ApiError(400, 'You already liked this post'));
    }
    
    // Create like
    await prisma.postLike.create({
      data: {
        userId,
        postId
      }
    });
    
    // Update post like count
    await prisma.post.update({
      where: { id: postId },
      data: { likesCount: { increment: 1 } }
    });
    
    // Update user's total likes received
    await prisma.user.update({
      where: { id: post.authorId },
      data: { totalLikesReceived: { increment: 1 } }
    });
    
    // Create notification for post author
    if (post.authorId !== userId) {
      const notif = await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'LIKE',
          actorId: userId,
          postId,
          message: `${req.user.fullName} liked your post`
        }
      });

      // Emit real-time notification if author is online
      const io = req.app.get('io');
      emitNotification(io, post.authorId, {
        id:        notif.id,
        type:      'LIKE',
        message:   notif.message,
        actorId:   userId,
        postId,
        createdAt: notif.createdAt,
      });
    }
    
    res.json({ success: true, message: 'Post liked successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unlike a post
// @route   DELETE /api/v1/likes/post/:postId
// @access  Private
const unlikePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    const like = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      },
      include: {
        post: true
      }
    });
    
    if (!like) {
      return next(new ApiError(400, 'You have not liked this post'));
    }
    
    await prisma.postLike.delete({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });
    
    // Update post like count
    await prisma.post.update({
      where: { id: postId },
      data: { likesCount: { decrement: 1 } }
    });
    
    // Update user's total likes received
    await prisma.user.update({
      where: { id: like.post.authorId },
      data: { totalLikesReceived: { decrement: 1 } }
    });
    
    res.json({ success: true, message: 'Post unliked successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Like a comment
// @route   POST /api/v1/likes/comment/:commentId
// @access  Private
const likeComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    
    const comment = await prisma.comment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        author: { isActive: true }
      },
      include: {
        post: true
      }
    });
    
    if (!comment) {
      return next(new ApiError(404, 'Comment not found'));
    }
    
    const existingLike = await prisma.commentLike.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId
        }
      }
    });
    
    if (existingLike) {
      return next(new ApiError(400, 'You already liked this comment'));
    }
    
    await prisma.commentLike.create({
      data: {
        userId,
        commentId
      }
    });
    
    await prisma.comment.update({
      where: { id: commentId },
      data: { likesCount: { increment: 1 } }
    });
    
    // Create notification for comment author
    if (comment.authorId !== userId) {
      const notif = await prisma.notification.create({
        data: {
          userId: comment.authorId,
          type: 'LIKE',
          actorId: userId,
          postId: comment.postId,
          message: `${req.user.fullName} liked your comment`
        }
      });

      // Emit real-time notification if author is online
      const io = req.app.get('io');
      emitNotification(io, comment.authorId, {
        id:        notif.id,
        type:      'LIKE',
        message:   notif.message,
        actorId:   userId,
        postId:    comment.postId,
        createdAt: notif.createdAt,
      });
    }
    
    res.json({ success: true, message: 'Comment liked successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unlike a comment
// @route   DELETE /api/v1/likes/comment/:commentId
// @access  Private
const unlikeComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
    
    const like = await prisma.commentLike.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId
        }
      }
    });
    
    if (!like) {
      return next(new ApiError(400, 'You have not liked this comment'));
    }
    
    await prisma.commentLike.delete({
      where: {
        userId_commentId: {
          userId,
          commentId
        }
      }
    });
    
    await prisma.comment.update({
      where: { id: commentId },
      data: { likesCount: { decrement: 1 } }
    });
    
    res.json({ success: true, message: 'Comment unliked successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Check if user liked a post
// @route   GET /api/v1/likes/post/:postId/check
// @access  Private
const checkPostLike = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    const like = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId
        }
      }
    });
    
    res.json({ success: true, data: { isLiked: !!like } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  likePost,
  unlikePost,
  likeComment,
  unlikeComment,
  checkPostLike
};