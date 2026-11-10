const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const docController = require('../controllers/docController');

router.use(requireAuth);

router.get('/workspace/:workspaceId', docController.listWorkspaceDocs);
router.post('/', docController.createDoc);
router.get('/:docId', docController.getDoc);
router.patch('/:docId', docController.renameDoc);
router.delete('/:docId', docController.deleteDoc);
router.get('/:docId/snapshots', docController.listSnapshots);
router.post('/:docId/snapshots', docController.createSnapshot);
router.post('/:docId/snapshots/:snapshotId/restore', docController.restoreSnapshot);

module.exports = router;
