const express = require('express');
const router = express.Router();
const orgController = require('../controllers/orgController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', orgController.getMyOrgs);
router.post('/', orgController.createOrg);

// Organization-scoped routes
router.get('/:orgId', requireRole('member'), orgController.getOrgDetails);
router.post('/:orgId/workspaces', requireRole('manager'), orgController.createWorkspace);

module.exports = router;
