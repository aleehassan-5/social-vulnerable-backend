const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Get or create a conversation with another user
// @route   POST /api/v1/messages/conversation/:userId
// @access  Private
const getOrCreateConversation = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (userId === currentUserId) {
      return next(new ApiError(400, 'Cannot start conversation with yourself'));
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: userId, isActive: true }
    });

    if (!otherUser) {
      return next(new ApiError(404, 'User not found'));
    }

    // Check if conversation already exists
    let conversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: userId } } },
          { isGroup: false }
        ]
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true } }
          }
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            create: [
              { userId: currentUserId },
              { userId: userId }
            ]
          }
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, username: true, fullName: true, avatar: true } }
            }
          }
        }
      });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all conversations for current user
// @route   GET /api/v1/messages/conversations
// @access  Private
const getConversations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: {
          // Return ALL participants so frontend can identify the other person
          include: {
            user: { select: { id: true, username: true, fullName: true, avatar: true } }
          }
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    res.json({ success: true, data: conversations });
  } catch (error) {
    next(error);
  }
};

// @desc    Get messages from a conversation
// @route   GET /api/v1/messages/:conversationId
// @access  Private
const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: messages.reverse(), // Chronological order
      pagination: { page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a message (REST fallback — WebSocket preferred)
// @route   POST /api/v1/messages/:conversationId
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { content, messageType = 'TEXT', mediaUrl } = req.body;
    const senderId = req.user.id;

    if (!content && !mediaUrl) {
      return next(new ApiError(400, 'Message content or media is required'));
    }

    // Verify participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } }
    });

    if (!participant) {
      return next(new ApiError(403, 'Not authorized to send messages in this conversation'));
    }

    const message = await prisma.message.create({
      data: { conversationId, senderId, content, messageType, mediaUrl },
      include: {
        sender: { select: { id: true, username: true, fullName: true, avatar: true } }
      }
    });

    // Update conversation preview
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessage: content || 'Media message',
        lastMessageAt: new Date()
      }
    });

    // Emit via socket if available
    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${conversationId}`).emit('message:received', {
        ...message,
        conversationId
      });
    }

    // Notify offline participants
    const others = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { not: senderId } }
    });

    for (const p of others) {
      await prisma.notification.create({
        data: {
          userId: p.userId,
          type: 'MESSAGE',
          actorId: senderId,
          message: `${req.user.fullName} sent you a message`
        }
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark message as read
// @route   PUT /api/v1/messages/:messageId/read
// @access  Private
const markMessageAsRead = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      return next(new ApiError(404, 'Message not found'));
    }

    // Verify participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: message.conversationId, userId } }
    });

    if (!participant) {
      return next(new ApiError(403, 'Not authorized'));
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { readAt: new Date() }
    });

    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a message (hard delete — schema has no isDeleted on Message)
// @route   DELETE /api/v1/messages/:messageId
// @access  Private
const deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await prisma.message.findFirst({
      where: { id: messageId, senderId: userId }
    });

    if (!message) {
      return next(new ApiError(404, 'Message not found or not yours'));
    }

    await prisma.message.delete({ where: { id: messageId } });

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  markMessageAsRead,
  deleteMessage
};
