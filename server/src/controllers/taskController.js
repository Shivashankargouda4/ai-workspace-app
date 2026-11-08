const { z } = require('zod');
const db = require('../config/db');

const createTaskSchema = z.object({
  project_id: z.number().int().positive(),
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  complexity: z.number().int().min(1).max(10).default(3),
  estimated_days: z.number().int().positive().default(3),
  due_date: z.string().optional(),
  assignee_ids: z.array(z.number().int().positive()).optional(),
});

const updateTaskStatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

// Get tasks for a project
const getProjectTasks = async (req, res) => {
  try {
    const projectId = req.params.projectId;

    const tasksResult = await db.query(
      `SELECT t.*, 
              COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url)) 
                       FILTER (WHERE u.id IS NOT NULL), '[]') as assignees,
              p.delay_probability, p.risk_level
       FROM tasks t
       LEFT JOIN task_assignees ta ON t.id = ta.task_id
       LEFT JOIN users u ON ta.user_id = u.id
       LEFT JOIN task_predictions p ON t.id = p.task_id
       WHERE t.project_id = $1
       GROUP BY t.id, p.delay_probability, p.risk_level
       ORDER BY t.created_at DESC`,
      [projectId]
    );

    res.json({ tasks: tasksResult.rows });
  } catch (error) {
    console.error('Get project tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
};

// Create a new task
const createTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const validatedData = createTaskSchema.parse(req.body);

    await client.query('BEGIN');

    // Get org_id from project
    const projRes = await client.query('SELECT org_id FROM projects WHERE id = $1', [validatedData.project_id]);
    if (projRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found.' });
    }
    const orgId = projRes.rows[0].org_id;

    // Insert task
    const taskRes = await client.query(
      `INSERT INTO tasks (project_id, org_id, title, description, priority, complexity, estimated_days, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        validatedData.project_id,
        orgId,
        validatedData.title,
        validatedData.description || '',
        validatedData.priority,
        validatedData.complexity,
        validatedData.estimated_days,
        validatedData.due_date ? new Date(validatedData.due_date) : null,
        req.user.id,
      ]
    );
    const newTask = taskRes.rows[0];

    // Assign members if specified
    if (validatedData.assignee_ids && validatedData.assignee_ids.length > 0) {
      for (const userId of validatedData.assignee_ids) {
        await client.query(
          'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newTask.id, userId]
        );
      }
    }

    // Insert initial status history
    await client.query(
      `INSERT INTO task_status_history (task_id, old_status, new_status, old_progress, new_progress, changed_by)
       VALUES ($1, NULL, $2, NULL, 0, $3)`,
      [newTask.id, newTask.status, req.user.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Task created successfully',
      task: newTask,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task.' });
  } finally {
    client.release();
  }
};

// Update task status and/or progress (CRITICAL FOR ML AUDIT TRAIL)
const updateTaskStatus = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const taskId = req.params.taskId;
    const validatedData = updateTaskStatusSchema.parse(req.body);

    await client.query('BEGIN');

    // Fetch existing task
    const currentRes = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (currentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found.' });
    }
    const currentTask = currentRes.rows[0];

    const newStatus = validatedData.status !== undefined ? validatedData.status : currentTask.status;
    let newProgress = validatedData.progress !== undefined ? validatedData.progress : currentTask.progress;

    // Automatically set progress to 100% when marked done
    if (newStatus === 'done' && validatedData.progress === undefined) {
      newProgress = 100;
    }

    const completedAt = newStatus === 'done' ? (currentTask.completed_at || new Date()) : null;

    // Update task
    const updatedRes = await client.query(
      `UPDATE tasks
       SET status = $1, progress = $2, completed_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [newStatus, newProgress, completedAt, taskId]
    );
    const updatedTask = updatedRes.rows[0];

    // Record in task_status_history if either status or progress changed
    if (currentTask.status !== newStatus || currentTask.progress !== newProgress) {
      await client.query(
        `INSERT INTO task_status_history (task_id, old_status, new_status, old_progress, new_progress, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [taskId, currentTask.status, newStatus, currentTask.progress, newProgress, req.user.id]
      );
    }

    // Call ML Microservice to forecast delay risk and persist in task_predictions
    try {
      const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
      const mlResponse = await fetch(`${mlUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: updatedTask.priority || 'medium',
          complexity: updatedTask.complexity || 3,
          estimated_days: updatedTask.estimated_days || 3,
          team_size: 2,
          assignee_workload: 3,
          previous_delays_ratio: 0.2,
          midpoint_progress: newProgress,
        }),
      });

      if (mlResponse.ok) {
        const mlData = await mlResponse.json();
        const existingPred = await client.query('SELECT id FROM task_predictions WHERE task_id = $1', [taskId]);
        if (existingPred.rows.length > 0) {
          await client.query(
            `UPDATE task_predictions 
             SET delay_probability = $1, risk_level = $2, model_version = $3, predicted_at = CURRENT_TIMESTAMP
             WHERE task_id = $4`,
            [mlData.delay_probability, mlData.risk_level, mlData.model_version, taskId]
          );
        } else {
          await client.query(
            `INSERT INTO task_predictions (task_id, delay_probability, risk_level, model_version)
             VALUES ($1, $2, $3, $4)`,
            [taskId, mlData.delay_probability, mlData.risk_level, mlData.model_version]
          );
        }
      }
    } catch (mlErr) {
      // Optional fallback if ML service is offline
    }

    await client.query('COMMIT');

    res.json({
      message: 'Task updated successfully',
      task: updatedTask,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Update task status error:', error);
    res.status(500).json({ error: 'Failed to update task status.' });
  } finally {
    client.release();
  }
};

module.exports = {
  getProjectTasks,
  createTask,
  updateTaskStatus,
};
