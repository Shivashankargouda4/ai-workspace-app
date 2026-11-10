const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const meetingController = require('../controllers/meetingController');

router.use(requireAuth);

router.get('/ice-config', meetingController.getIceConfig);
router.get('/workspace/:workspaceId', meetingController.listWorkspaceMeetings);
router.get('/code/:roomCode', meetingController.resolveMeetingByCode);
router.post('/', meetingController.createMeeting);
router.patch('/:meetingId', meetingController.updateMeeting);
router.delete('/:meetingId', meetingController.deleteMeeting);

module.exports = router;
