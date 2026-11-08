const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/project/:projectId', taskController.getProjectTasks);
router.post('/', taskController.createTask);
router.patch('/:taskId/status', taskController.updateTaskStatus);

module.exports = router;
