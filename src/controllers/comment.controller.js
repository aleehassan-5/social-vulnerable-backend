const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');
const { emitNotification } = require('../../socket');

// @desc    Add a comment to a post
// @route   POST /api/v1/comments
// @access  Private
const addComment = async (req, res, next) => {
  try {
    const { postId, content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return next(new ApiError(400, 'Comment content is required'));
    }

    // Check if post exists
    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false }
    });

    if (!post) {
      return next(new ApiError(404, 'Post not found'));
    }

    // Create comment - Using 'author' instead of 'user' based on your schema
    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId: postId,
        authorId: userId,  // Use authorId instead of userId
      },
      include: {
        author: {  // Use 'author' instead of 'user'
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      }
    });

    // Update comment count on post
    await prisma.post.update({
      where: { id: postId },
      data: { commentsCount: { increment: 1 } }
    });

    // Notify post author (if not self-commenting)
    if (post.authorId !== userId) {
      const notif = await prisma.notification.create({
        data: {
          userId:  post.authorId,
          type:    'COMMENT',
          actorId: userId,
          postId,
          message: `${req.user.fullName} commented on your post`,
        }
      });

      const io = req.app.get('io');
      emitNotification(io, post.authorId, {
        id:        notif.id,
        type:      'COMMENT',
        message:   notif.message,
        actorId:   userId,
        postId,
        createdAt: notif.createdAt,
      });
    }

    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    next(error);
  }
};

// @desc    Get comments for a post
// @route   GET /api/v1/comments/:postId
// @access  Public
const getComments = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const comments = await prisma.comment.findMany({
      where: { postId, isDeleted: false },
      include: {
        author: {  // Use 'author' instead of 'user'
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        _count: {
          select: { likes: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: comments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    next(error);
  }
};

// @desc    Delete a comment
// @route   DELETE /api/v1/comments/:id
// @access  Private
const deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const comment = await prisma.comment.findFirst({
      where: { id, authorId: userId, isDeleted: false }  // Use authorId
    });

    if (!comment) {
      return next(new ApiError(404, 'Comment not found or already deleted'));
    }

    await prisma.comment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });

    // Update comment count on post
    await prisma.post.update({
      where: { id: comment.postId },
      data: { commentsCount: { decrement: 1 } }
    });

    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    next(error);
  }
};

module.exports = {
  addComment,
  getComments,
  deleteComment
};