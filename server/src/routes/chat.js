const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/channels/:workspaceId', chatController.getWorkspaceChannels);
router.post('/channels', chatController.createChannel);
router.post('/dm', chatController.openDirectMessage);
router.get('/messages/:channelId', chatController.getChannelMessages);

module.exports = router;
