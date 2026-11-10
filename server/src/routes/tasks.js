const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/project/:projectId', taskController.getProjectTasks);
router.post('/', taskController.createTask);
router.get('/:taskId', taskController.getTaskDetails);
router.patch('/:taskId', taskController.updateTask);
router.delete('/:taskId', taskController.deleteTask);
router.post('/:taskId/comments', taskController.addTaskComment);
router.patch('/:taskId/status', taskController.updateTaskStatus);

module.exports = router;
