const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.post('/summarize', aiController.summarize);
router.post('/action-items', aiController.extractActionItems);
router.post('/explain-code', aiController.explainCode);

module.exports = router;
