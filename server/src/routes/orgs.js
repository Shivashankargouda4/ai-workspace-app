const express = require('express');
const router = express.Router();
const orgController = require('../controllers/orgController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', orgController.getMyOrgs);
router.post('/', orgController.createOrg);

// Organization-scoped routes with strict database role checking
router.get('/:orgId', requireRole('member'), orgController.getOrgDetails);
router.post('/:orgId/departments', requireRole('admin'), orgController.createDepartment);
router.post('/:orgId/workspaces', requireRole('manager'), orgController.createWorkspace);
router.post('/:orgId/invite', requireRole('manager'), orgController.createInvitation);
router.post('/join/:token', orgController.acceptInvitation);

module.exports = router;
