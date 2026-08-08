const express = require('express');
const router = express.Router();

// Import all route files (NO middleware imports here!)
const authRoutes = require('./v1/auth.routes');
const userRoutes = require('./v1/users.routes');
const postRoutes = require('./v1/posts.routes');
const commentRoutes = require('./v1/comments.routes');
const likeRoutes = require('./v1/likes.routes');
const shareRoutes = require('./v1/shares.routes');
const messageRoutes = require('./v1/messages.routes');
const reportRoutes = require('./v1/reports.routes');
const notificationRoutes = require('./v1/notifications.routes');
const analyticsRoutes = require('./v1/analytics.routes');
const adminRoutes = require('./v1/admin.routes');
const labRoutes = require('./v1/lab.routes');

// Register all routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/likes', likeRoutes);
router.use('/shares', shareRoutes);
router.use('/messages', messageRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);
router.use('/lab', labRoutes);

// Welcome route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Social Media API v1',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      posts: '/api/v1/posts',
      messages: '/api/v1/messages',
      analytics: '/api/v1/analytics'
    }
  });
});

module.exports = router;