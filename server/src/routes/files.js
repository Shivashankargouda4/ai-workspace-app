const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Upload a document/asset
router.post('/upload', fileController.upload.single('file'), fileController.uploadFile);

// List files in a workspace
router.get('/workspace/:workspaceId', fileController.getWorkspaceFiles);

// Authenticated download / preview
router.get('/:fileId/download', fileController.downloadFile);

// Delete file
router.delete('/:fileId', fileController.deleteFile);

module.exports = router;
