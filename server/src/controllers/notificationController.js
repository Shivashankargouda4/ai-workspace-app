const db = require('../config/db');

/**
 * List user notifications alongside live ML high-risk task alerts in the user's organizations.
 */
const getNotifications = async (req, res) => {
  try {
    const dbNotifs = await db.query(
      `SELECT id, org_id, type, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    const mlAlerts = await db.query(
      `SELECT t.id AS task_id, t.title, t.org_id, p.delay_probability, p.predicted_at
       FROM tasks t
       JOIN task_predictions p ON p.task_id = t.id
       JOIN organization_members om ON om.org_id = t.org_id
       WHERE om.user_id = $1
         AND p.risk_level = 'high'
         AND t.status != 'done'
       ORDER BY p.delay_probability DESC, p.predicted_at DESC
       LIMIT 10`,
      [req.user.id]
    );

    const unreadDbCount = dbNotifs.rows.filter((n) => !n.is_read).length;

    res.json({
      notifications: dbNotifs.rows,
      risk_alerts: mlAlerts.rows.map((row) => ({
        id: `risk-${row.task_id}`,
        type: 'ml_risk',
        title: 'High Delay Risk Alert',
        message: `"${row.title}" (${Math.round(Number(row.delay_probability) * 100)}% predicted delay risk)`,
        created_at: row.predicted_at,
        org_id: row.org_id,
      })),
      unread_count: unreadDbCount + mlAlerts.rows.length,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
};

/**
 * Mark a specific persistent notification as read for the authenticated user.
 */
const markNotificationRead = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid notification ID.' });
    }

    const result = await db.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ notification: result.rows[0] });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
};

/**
 * Mark all persistent notifications as read for the authenticated user.
 */
const markAllRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [
      req.user.id,
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read.' });
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllRead,
};
