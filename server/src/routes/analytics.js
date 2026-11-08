const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/overview/:orgId', requireRole('member'), analyticsController.getOrgAnalytics);

module.exports = router;
