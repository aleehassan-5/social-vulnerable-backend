const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Get user notifications
// @route   GET /api/v1/notifications
// @access  Private
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 30, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;
    
    const where = { userId };
    if (unreadOnly === 'true') where.isRead = false;
    
    const notifications = await prisma.notification.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });
    
    const total = await prisma.notification.count({ where });
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false }
    });
    
    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark notification as read
// @route   PUT /api/v1/notifications/:id/read
// @access  Private
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId
      }
    });
    
    if (!notification) {
      return next(new ApiError(404, 'Notification not found'));
    }
    
    await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });
    
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/v1/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: { isRead: true }
    });
    
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete notification
// @route   DELETE /api/v1/notifications/:id
// @access  Private
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId
      }
    });
    
    if (!notification) {
      return next(new ApiError(404, 'Notification not found'));
    }
    
    await prisma.notification.delete({
      where: { id }
    });
    
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get notification count
// @route   GET /api/v1/notifications/count/unread
// @access  Private
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });
    
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
};