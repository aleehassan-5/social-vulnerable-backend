const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount
} = require('../../controllers/notification.controller');

// IMPORTANT: Named routes before :id param
router.get('/',            protect, getNotifications);
router.get('/count/unread', protect, getUnreadCount);
router.put('/read-all',    protect, markAllAsRead);
router.put('/:id/read',    protect, markAsRead);
router.delete('/:id',      protect, deleteNotification);

module.exports = router;
