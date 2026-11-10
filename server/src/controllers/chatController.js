const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');

// Get channels for a workspace
const getWorkspaceChannels = async (req, res) => {
  try {
    const workspace = await resolveAuthorizedResource('workspace', req.params.workspaceId, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const result = await db.query(
      'SELECT * FROM channels WHERE workspace_id = $1 AND org_id = $2 ORDER BY created_at ASC',
      [workspace.id, workspace.resolved_org_id]
    );
    res.json({ channels: result.rows });
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Failed to fetch channels.' });
  }
};

// Get message history for a channel
const getChannelMessages = async (req, res) => {
  try {
    const channel = await resolveAuthorizedResource('channel', req.params.channelId, req.user.id);
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found.' });
    }

    const result = await db.query(
      `SELECT m.id, m.channel_id, m.content, m.created_at,
              u.id as sender_id, u.name as sender_name, u.avatar_url
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1
       ORDER BY m.created_at ASC`,
      [channel.id]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
};

module.exports = {
  getWorkspaceChannels,
  getChannelMessages,
};
