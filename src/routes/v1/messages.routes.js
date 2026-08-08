const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/auth.middleware');
const {
  getOrCreateConversation,
  getConversations,
  getMessages,
  sendMessage,
  markMessageAsRead,
  deleteMessage
} = require('../../controllers/message.controller');

// Specific named routes before params
router.get('/conversations',         protect, getConversations);
router.post('/conversation/:userId', protect, getOrCreateConversation);
// These use conversationId / messageId — no clash with "conversations"
router.get('/:conversationId',        protect, getMessages);
router.post('/:conversationId',       protect, sendMessage);
router.put('/:messageId/read',        protect, markMessageAsRead);
router.delete('/:messageId',          protect, deleteMessage);

module.exports = router;
