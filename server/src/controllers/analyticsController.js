const db = require('../config/db');

// Get real-time SQL analytics for an organization
const getOrgAnalytics = async (req, res) => {
  try {
    const orgId = req.params.orgId || req.orgId || 1;

    // 1. Tasks by status
    const statusRes = await db.query(
      `SELECT status, COUNT(*)::int as count
       FROM tasks
       WHERE org_id = $1
       GROUP BY status`,
      [orgId]
    );

    // 2. Tasks by priority
    const priorityRes = await db.query(
      `SELECT priority, COUNT(*)::int as count
       FROM tasks
       WHERE org_id = $1
       GROUP BY priority`,
      [orgId]
    );

    // 3. Member workload
    const workloadRes = await db.query(
      `SELECT u.id, u.name, COUNT(ta.task_id)::int as task_count
       FROM organization_members om
       JOIN users u ON om.user_id = u.id
       LEFT JOIN task_assignees ta ON u.id = ta.user_id
       LEFT JOIN tasks t ON ta.task_id = t.id AND t.org_id = $1 AND t.status != 'done'
       WHERE om.org_id = $1
       GROUP BY u.id, u.name
       ORDER BY task_count DESC`,
      [orgId]
    );

    // 4. Overdue tasks count
    const overdueRes = await db.query(
      `SELECT COUNT(*)::int as overdue_count
       FROM tasks
       WHERE org_id = $1 
         AND due_date < CURRENT_TIMESTAMP 
         AND status != 'done'`,
      [orgId]
    );

    // 5. Total tasks & completed tasks for completion rate
    const totalRes = await db.query(
      `SELECT 
         COUNT(*)::int as total,
         COUNT(CASE WHEN status = 'done' THEN 1 END)::int as completed
       FROM tasks
       WHERE org_id = $1`,
      [orgId]
    );

    const total = totalRes.rows[0].total || 0;
    const completed = totalRes.rows[0].completed || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // 6. ML Risk distribution
    const mlRiskRes = await db.query(
      `SELECT p.risk_level, COUNT(*)::int as count
       FROM task_predictions p
       JOIN tasks t ON p.task_id = t.id
       WHERE t.org_id = $1
       GROUP BY p.risk_level`,
      [orgId]
    );

    res.json({
      summary: {
        total_tasks: total,
        completed_tasks: completed,
        completion_rate: completionRate,
        overdue_tasks: overdueRes.rows[0].overdue_count || 0,
      },
      tasks_by_status: statusRes.rows,
      tasks_by_priority: priorityRes.rows,
      member_workload: workloadRes.rows,
      ml_risk_distribution: mlRiskRes.rows,
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to compute analytics.' });
  }
};

const getOrgAuditHistory = async (req, res) => {
  try {
    const orgId = req.params.orgId || req.orgId;
    const result = await db.query(
      `SELECT h.id, h.task_id, t.title AS task_title, h.old_status, h.new_status,
              h.old_progress, h.new_progress, h.changed_at,
              u.name AS changed_by_name
       FROM task_status_history h
       JOIN tasks t ON h.task_id = t.id
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE t.org_id = $1
       ORDER BY h.changed_at DESC, h.id DESC
       LIMIT 25`,
      [orgId]
    );
    res.json({ history: result.rows });
  } catch (error) {
    console.error('Get org audit history error:', error);
    res.status(500).json({ error: 'Failed to load task audit history.' });
  }
};

module.exports = {
  getOrgAnalytics,
  getOrgAuditHistory,
};
