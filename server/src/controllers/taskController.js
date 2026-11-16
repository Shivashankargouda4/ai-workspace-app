const { z } = require('zod');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');
const { createAndPushNotification } = require('../utils/notificationService');

const createTaskSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(255),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  complexity: z.coerce.number().int().min(1).max(10).default(3),
  estimated_days: z.coerce.number().int().positive().default(3),
  due_date: z.string().nullable().optional(),
  assignee_ids: z.array(z.coerce.number().int().positive()).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  complexity: z.coerce.number().int().min(1).max(10).optional(),
  estimated_days: z.coerce.number().int().positive().optional(),
  due_date: z.string().nullable().optional(),
  assignee_ids: z.array(z.coerce.number().int().positive()).optional(),
});

const updateTaskStatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
});

const commentSchema = z.object({
  content: z.string().trim().min(1, 'Comment cannot be empty').max(2000),
});

/**
 * Confirm all assignee user IDs belong to the target organization.
 */
async function validateOrgAssignees(client, orgId, assigneeIds) {
  if (!assigneeIds || assigneeIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(assigneeIds.map(Number)));
  const memberRes = await client.query(
    `SELECT user_id FROM organization_members WHERE org_id = $1 AND user_id = ANY($2::int[])`,
    [orgId, uniqueIds]
  );
  if (memberRes.rows.length !== uniqueIds.length) {
    const err = new Error('All task assignees must belong to this organization.');
    err.statusCode = 400;
    throw err;
  }
  return uniqueIds;
}

/**
 * Compute live team_size, assignee_workload, and previous_delays_ratio from PostgreSQL,
 * call FastAPI ML `/predict`, persist `task_predictions`, and notify assignees on High Risk.
 */
async function computeLiveTaskFeaturesAndPredict(client, task, midpointProgress, io) {
  try {
    const assigneesRes = await client.query(
      'SELECT user_id FROM task_assignees WHERE task_id = $1',
      [task.id]
    );
    const assigneeIds = assigneesRes.rows.map((r) => r.user_id);
    const teamSize = Math.max(1, assigneeIds.length);

    let assigneeWorkload = 1;
    let previousDelaysRatio = 0.2;

    if (assigneeIds.length > 0) {
      const wlRes = await client.query(
        `SELECT COUNT(DISTINCT t.id)::int AS active_cnt
         FROM task_assignees ta
         JOIN tasks t ON t.id = ta.task_id
         WHERE ta.user_id = ANY($1::int[])
           AND t.org_id = $2
           AND t.status != 'done'`,
        [assigneeIds, task.org_id]
      );
      assigneeWorkload = Math.max(1, Math.round((wlRes.rows[0]?.active_cnt || 1) / assigneeIds.length));

      const delayRes = await client.query(
        `SELECT
           COUNT(*)::int AS total_with_due,
           COUNT(CASE WHEN t.due_date IS NOT NULL AND COALESCE(t.completed_at, CURRENT_TIMESTAMP) > t.due_date THEN 1 END)::int AS delayed_cnt
         FROM task_assignees ta
         JOIN tasks t ON t.id = ta.task_id
         WHERE ta.user_id = ANY($1::int[])
           AND t.org_id = $2
           AND t.due_date IS NOT NULL`,
        [assigneeIds, task.org_id]
      );
      const totalWithDue = delayRes.rows[0]?.total_with_due || 0;
      const delayedCnt = delayRes.rows[0]?.delayed_cnt || 0;
      previousDelaysRatio = totalWithDue > 0 ? Number((delayedCnt / totalWithDue).toFixed(2)) : 0.2;
    } else {
      const orgWlRes = await client.query(
        `SELECT COUNT(*)::int AS active_cnt
         FROM tasks
         WHERE org_id = $1 AND status != 'done'`,
        [task.org_id]
      );
      assigneeWorkload = Math.max(1, Math.min(15, orgWlRes.rows[0]?.active_cnt || 1));

      const orgDelayRes = await client.query(
        `SELECT
           COUNT(*)::int AS total_with_due,
           COUNT(CASE WHEN due_date IS NOT NULL AND COALESCE(completed_at, CURRENT_TIMESTAMP) > due_date THEN 1 END)::int AS delayed_cnt
         FROM tasks
         WHERE org_id = $1 AND due_date IS NOT NULL`,
        [task.org_id]
      );
      const totalWithDue = orgDelayRes.rows[0]?.total_with_due || 0;
      const delayedCnt = orgDelayRes.rows[0]?.delayed_cnt || 0;
      previousDelaysRatio = totalWithDue > 0 ? Number((delayedCnt / totalWithDue).toFixed(2)) : 0.2;
    }

    // Midpoint Progress: use the task's actual current progress value.
    // We pass it honestly to the model; the model was trained on midpoint snapshots,
    // and progress at or past the schedule midpoint is the most informative reading.
    // We never invent surrogate values — that distorts predictions.
    const effectiveMidpoint = Math.max(0, Math.min(100, task.progress || 0));

    // Normalize ML service URL — Render's fromService.property=host returns a bare hostname
    // without a scheme, so we prepend https:// when no scheme is present.
    const rawMlUrl = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
    const mlUrl = rawMlUrl.startsWith('http') ? rawMlUrl : `https://${rawMlUrl}`;
    const mlAbortController = new AbortController();
    const mlTimeout = setTimeout(() => mlAbortController.abort(), 10000);
    let mlData = null;

    try {
      const mlHeaders = { 'Content-Type': 'application/json' };
      if (process.env.ML_API_KEY) {
        mlHeaders['x-api-key'] = process.env.ML_API_KEY;
      }

      const mlResponse = await fetch(`${mlUrl}/predict`, {
        method: 'POST',
        headers: mlHeaders,
        signal: mlAbortController.signal,
        body: JSON.stringify({
          priority: task.priority || 'medium',
          complexity: task.complexity || 3,
          estimated_days: task.estimated_days || 3,
          team_size: teamSize,
          assignee_workload: assigneeWorkload,
          previous_delays_ratio: previousDelaysRatio,
          midpoint_progress: effectiveMidpoint,
        }),
      });

      if (mlResponse.ok) {
        mlData = await mlResponse.json();
      } else {
        console.warn('ML service returned non-200:', mlResponse.status);
      }
    } finally {
      clearTimeout(mlTimeout);
    }

    if (mlData) {
      const existingPred = await client.query('SELECT id FROM task_predictions WHERE task_id = $1', [task.id]);
      if (existingPred.rows.length > 0) {
        await client.query(
          `UPDATE task_predictions
           SET delay_probability = $1, risk_level = $2, model_version = $3, predicted_at = CURRENT_TIMESTAMP
           WHERE task_id = $4`,
          [mlData.delay_probability, mlData.risk_level, mlData.model_version, task.id]
        );
      } else {
        await client.query(
          `INSERT INTO task_predictions (task_id, delay_probability, risk_level, model_version, predicted_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [task.id, mlData.delay_probability, mlData.risk_level, mlData.model_version]
        );
      }

      if (mlData.risk_level === 'high' && task.status !== 'done') {
        const recipients = assigneeIds.length > 0 ? assigneeIds : task.created_by ? [task.created_by] : [];
        const pct = Math.round(Number(mlData.delay_probability) * 100);
        for (const uid of recipients) {
          await createAndPushNotification(
            io,
            {
              userId: uid,
              orgId: task.org_id,
              type: 'ml_high_risk',
              title: 'High Delay Risk Alert',
              message: `"${task.title}" reached ${pct}% predicted delay risk.`,
            },
            client
          );
        }
      }
    }

    return mlData;
  } catch (mlErr) {
    console.warn('ML dispatch notice:', mlErr.message);
    return null;
  }
}

// Get tasks for a project
const getProjectTasks = async (req, res) => {
  try {
    const project = await resolveAuthorizedResource('project', req.params.projectId, req.user.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const tasksResult = await db.query(
      `SELECT t.*,
              COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url))
                       FILTER (WHERE u.id IS NOT NULL), '[]') as assignees,
              p.delay_probability, p.risk_level
       FROM tasks t
       LEFT JOIN task_assignees ta ON t.id = ta.task_id
       LEFT JOIN users u ON ta.user_id = u.id
       LEFT JOIN task_predictions p ON t.id = p.task_id
       WHERE t.project_id = $1 AND t.org_id = $2
       GROUP BY t.id, p.delay_probability, p.risk_level
       ORDER BY t.created_at DESC`,
      [project.id, project.resolved_org_id]
    );

    res.json({ tasks: tasksResult.rows });
  } catch (error) {
    console.error('Get project tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
};

// Get single task details with assignees, comments, prediction, and audit history
const getTaskDetails = async (req, res) => {
  try {
    const authorized = await resolveAuthorizedResource('task', req.params.taskId, req.user.id);
    if (!authorized) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const [taskRes, assigneesRes, commentsRes, historyRes] = await Promise.all([
      db.query(
        `SELECT t.*, p.delay_probability, p.risk_level, p.model_version
         FROM tasks t
         LEFT JOIN task_predictions p ON t.id = p.task_id
         WHERE t.id = $1`,
        [authorized.id]
      ),
      db.query(
        `SELECT u.id, u.name, u.email, u.avatar_url
         FROM task_assignees ta
         JOIN users u ON ta.user_id = u.id
         WHERE ta.task_id = $1
         ORDER BY u.name ASC`,
        [authorized.id]
      ),
      db.query(
        `SELECT c.id, c.task_id, c.content, c.created_at,
                u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar
         FROM task_comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.task_id = $1
         ORDER BY c.created_at ASC`,
        [authorized.id]
      ),
      db.query(
        `SELECT h.id, h.old_status, h.new_status, h.old_progress, h.new_progress, h.changed_at,
                u.name AS changed_by_name
         FROM task_status_history h
         LEFT JOIN users u ON h.changed_by = u.id
         WHERE h.task_id = $1
         ORDER BY h.changed_at DESC, h.id DESC`,
        [authorized.id]
      ),
    ]);

    res.json({
      task: taskRes.rows[0],
      assignees: assigneesRes.rows,
      comments: commentsRes.rows,
      history: historyRes.rows,
    });
  } catch (error) {
    console.error('Get task details error:', error);
    res.status(500).json({ error: 'Failed to load task details.' });
  }
};

// Create a new task
const createTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const validatedData = createTaskSchema.parse(req.body);

    await client.query('BEGIN');

    const project = await resolveAuthorizedResource('project', validatedData.project_id, req.user.id, client);
    if (!project) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found.' });
    }
    const orgId = project.resolved_org_id;
    const validAssignees = await validateOrgAssignees(client, orgId, validatedData.assignee_ids);

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

    const io = req.app.get('io');
    for (const userId of validAssignees) {
      await client.query(
        'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newTask.id, userId]
      );
      if (userId !== req.user.id) {
        await createAndPushNotification(
          io,
          {
            userId,
            orgId,
            type: 'task_assigned',
            title: 'Task Assigned',
            message: `${req.user.name} assigned you to "${newTask.title}".`,
          },
          client
        );
      }
    }

    await client.query(
      `INSERT INTO task_status_history (task_id, old_status, new_status, old_progress, new_progress, changed_by)
       VALUES ($1, NULL, $2, NULL, 0, $3)`,
      [newTask.id, newTask.status, req.user.id]
    );

    await computeLiveTaskFeaturesAndPredict(client, newTask, 0, io);

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
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task.' });
  } finally {
    client.release();
  }
};

// Update task details and/or assignees
const updateTask = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const validatedData = updateTaskSchema.parse(req.body);
    await client.query('BEGIN');

    const currentTask = await resolveAuthorizedResource('task', req.params.taskId, req.user.id, client);
    if (!currentTask) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found.' });
    }

    const updatedRes = await client.query(
      `UPDATE tasks
       SET title = $1,
           description = $2,
           priority = $3,
           complexity = $4,
           estimated_days = $5,
           due_date = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        validatedData.title ?? currentTask.title,
        validatedData.description !== undefined ? (validatedData.description || '') : currentTask.description,
        validatedData.priority ?? currentTask.priority,
        validatedData.complexity ?? currentTask.complexity,
        validatedData.estimated_days ?? currentTask.estimated_days,
        validatedData.due_date !== undefined
          ? (validatedData.due_date ? new Date(validatedData.due_date) : null)
          : currentTask.due_date,
        currentTask.id,
      ]
    );
    const updatedTask = updatedRes.rows[0];
    const io = req.app.get('io');

    if (validatedData.assignee_ids !== undefined) {
      const validAssignees = await validateOrgAssignees(client, currentTask.resolved_org_id, validatedData.assignee_ids);
      const prevAssigneesRes = await client.query(
        'SELECT user_id FROM task_assignees WHERE task_id = $1',
        [currentTask.id]
      );
      const prevSet = new Set(prevAssigneesRes.rows.map((r) => r.user_id));

      await client.query('DELETE FROM task_assignees WHERE task_id = $1', [currentTask.id]);
      for (const uid of validAssignees) {
        await client.query(
          'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [currentTask.id, uid]
        );
        if (!prevSet.has(uid) && uid !== req.user.id) {
          await createAndPushNotification(
            io,
            {
              userId: uid,
              orgId: currentTask.resolved_org_id,
              type: 'task_assigned',
              title: 'Task Assigned',
              message: `${req.user.name} assigned you to "${updatedTask.title}".`,
            },
            client
          );
        }
      }
    }

    await computeLiveTaskFeaturesAndPredict(client, updatedTask, updatedTask.progress || 0, io);

    await client.query('COMMIT');
    res.json({ message: 'Task updated successfully', task: updatedTask });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task.' });
  } finally {
    client.release();
  }
};

// Delete a task
const deleteTask = async (req, res) => {
  try {
    const task = await resolveAuthorizedResource('task', req.params.taskId, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    await db.query('DELETE FROM tasks WHERE id = $1', [task.id]);
    res.json({ deleted: true, id: task.id });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
};

// Add comment to a task
const addTaskComment = async (req, res) => {
  try {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Comment is required.' });
    }

    const task = await resolveAuthorizedResource('task', req.params.taskId, req.user.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const inserted = await db.query(
      `INSERT INTO task_comments (task_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, task_id, user_id, content, created_at`,
      [task.id, req.user.id, parsed.data.content]
    );

    const assigneesRes = await db.query(
      'SELECT user_id FROM task_assignees WHERE task_id = $1',
      [task.id]
    );
    const notifyIds = new Set(assigneesRes.rows.map((r) => r.user_id));
    if (task.created_by) notifyIds.add(task.created_by);
    notifyIds.delete(req.user.id);

    const io = req.app.get('io');
    for (const uid of notifyIds) {
      await createAndPushNotification(io, {
        userId: uid,
        orgId: task.resolved_org_id,
        type: 'task_comment',
        title: 'New Task Comment',
        message: `${req.user.name} commented on "${task.title}".`,
      });
    }

    res.status(201).json({
      comment: {
        ...inserted.rows[0],
        author_id: req.user.id,
        author_name: req.user.name,
        author_avatar: req.user.avatar_url,
      },
    });
  } catch (error) {
    console.error('Add task comment error:', error);
    res.status(500).json({ error: 'Failed to post comment.' });
  }
};

// Update task status and/or progress (CRITICAL FOR ML AUDIT TRAIL)
const updateTaskStatus = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const taskId = req.params.taskId;
    const validatedData = updateTaskStatusSchema.parse(req.body);

    await client.query('BEGIN');

    const currentTask = await resolveAuthorizedResource('task', taskId, req.user.id, client);
    if (!currentTask) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found.' });
    }

    const newStatus = validatedData.status !== undefined ? validatedData.status : currentTask.status;
    let newProgress = validatedData.progress !== undefined ? validatedData.progress : currentTask.progress;

    if (newStatus === 'done' && validatedData.progress === undefined) {
      newProgress = 100;
    }

    const completedAt = newStatus === 'done' ? (currentTask.completed_at || new Date()) : null;

    const updatedRes = await client.query(
      `UPDATE tasks
       SET status = $1, progress = $2, completed_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [newStatus, newProgress, completedAt, taskId]
    );
    const updatedTask = updatedRes.rows[0];

    if (currentTask.status !== newStatus || currentTask.progress !== newProgress) {
      await client.query(
        `INSERT INTO task_status_history (task_id, old_status, new_status, old_progress, new_progress, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [taskId, currentTask.status, newStatus, currentTask.progress, newProgress, req.user.id]
      );
    }

    await computeLiveTaskFeaturesAndPredict(client, updatedTask, newProgress, req.app.get('io'));

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
  getTaskDetails,
  createTask,
  updateTask,
  deleteTask,
  addTaskComment,
  updateTaskStatus,
};
