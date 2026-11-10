const db = require('../config/db');

/**
 * Persist a notification row for `userId` and emit a real-time Socket.IO event
 * onto their personal `user:<id>` room. Fail-safe so domain actions never abort on notification failure.
 */
async function createAndPushNotification(io, { userId, orgId, type, title, message }, queryRunner = db) {
  if (!userId || !orgId) return null;
  try {
    const result = await queryRunner.query(
      `INSERT INTO notifications (user_id, org_id, type, title, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, org_id, type, title, message, is_read, created_at`,
      [userId, orgId, type, title, message]
    );
    const saved = result.rows[0];
    if (io && saved) {
      io.to(`user:${userId}`).emit('notification:new', saved);
    }
    return saved;
  } catch (err) {
    console.warn('Notification dispatch notice:', err.message);
    return null;
  }
}

module.exports = {
  createAndPushNotification,
};
