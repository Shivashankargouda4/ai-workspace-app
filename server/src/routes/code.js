const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const codeController = require('../controllers/codeController');

router.use(requireAuth);

router.get('/workspace/:workspaceId', codeController.listWorkspaceCodeFiles);
router.post('/', codeController.createCodeFile);
router.get('/:fileId', codeController.getCodeFile);
router.patch('/:fileId', codeController.updateCodeFile);
router.delete('/:fileId', codeController.deleteCodeFile);

module.exports = router;
