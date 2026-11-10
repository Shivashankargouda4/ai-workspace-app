const { z } = require('zod');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');

const createChannelSchema = z.object({
  workspace_id: z.coerce.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(2, 'Channel name must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-_ ]+$/i, 'Channel name may only include letters, numbers, spaces, hyphens, or underscores'),
});

const openDmSchema = z.object({
  org_id: z.coerce.number().int().positive(),
  recipient_user_id: z.coerce.number().int().positive(),
});

// Get public channels in workspace AND 1-to-1 DMs where the current user participates
const getWorkspaceChannels = async (req, res) => {
  try {
    const workspace = await resolveAuthorizedResource('workspace', req.params.workspaceId, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const result = await db.query(
      `SELECT c.*
       FROM channels c
       WHERE c.org_id = $1
         AND (
           (c.workspace_id = $2 AND c.type = 'public')
           OR (
             c.type = 'direct' AND c.dm_key IS NOT NULL AND (
               split_part(c.dm_key, ':', 2) = $3 OR split_part(c.dm_key, ':', 3) = $3
             )
           )
         )
       ORDER BY c.type ASC, c.created_at ASC`,
      [workspace.resolved_org_id, workspace.id, String(req.user.id)]
    );

    // Enrich DM channels with the peer's display name
    const dmChannels = result.rows.filter((c) => c.type === 'direct' && c.dm_key);
    const peerIds = new Set();
    for (const dm of dmChannels) {
      const [, u1, u2] = dm.dm_key.split(':').map(Number);
      const other = u1 === req.user.id ? u2 : u1;
      if (other) peerIds.add(other);
    }

    const peerMap = new Map();
    if (peerIds.size > 0) {
      const peerRes = await db.query('SELECT id, name FROM users WHERE id = ANY($1::int[])', [
        Array.from(peerIds),
      ]);
      for (const p of peerRes.rows) {
        peerMap.set(p.id, p.name);
      }
    }

    const channels = result.rows.map((c) => {
      if (c.type === 'direct' && c.dm_key) {
        const [, u1, u2] = c.dm_key.split(':').map(Number);
        const peerId = u1 === req.user.id ? u2 : u1;
        return {
          ...c,
          peer_id: peerId,
          display_name: peerMap.get(peerId) || c.name,
        };
      }
      return { ...c, display_name: c.name };
    });

    res.json({ channels });
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Failed to fetch channels.' });
  }
};

// Create a custom public channel inside an authorized workspace
const createChannel = async (req, res) => {
  try {
    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid channel name.' });
    }

    const workspace = await resolveAuthorizedResource('workspace', parsed.data.workspace_id, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const normalizedName = parsed.data.name.toLowerCase().replace(/\s+/g, '-');
    const result = await db.query(
      `INSERT INTO channels (workspace_id, org_id, name, type)
       VALUES ($1, $2, $3, 'public')
       RETURNING *`,
      [workspace.id, workspace.resolved_org_id, normalizedName]
    );

    res.status(201).json({
      channel: { ...result.rows[0], display_name: result.rows[0].name },
    });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Failed to create channel.' });
  }
};

// Create or reuse a 1-to-1 Direct Message channel between two members of the same org
const openDirectMessage = async (req, res) => {
  try {
    const parsed = openDmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid org_id and recipient_user_id are required.' });
    }

    const { org_id, recipient_user_id } = parsed.data;
    if (recipient_user_id === req.user.id) {
      return res.status(400).json({ error: 'Select a teammate to start a direct message.' });
    }

    const membersRes = await db.query(
      `SELECT om.user_id, u.name
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.org_id = $1 AND om.user_id = ANY($2::int[])`,
      [org_id, [req.user.id, recipient_user_id]]
    );

    if (membersRes.rows.length < 2) {
      return res.status(404).json({ error: 'Both users must belong to the same organization.' });
    }

    const peer = membersRes.rows.find((r) => r.user_id === recipient_user_id);
    const lowId = Math.min(req.user.id, recipient_user_id);
    const highId = Math.max(req.user.id, recipient_user_id);
    const dmKey = `dm:${lowId}:${highId}`;

    const existingRes = await db.query(
      `SELECT * FROM channels WHERE org_id = $1 AND dm_key = $2`,
      [org_id, dmKey]
    );
    if (existingRes.rows.length > 0) {
      return res.json({
        channel: { ...existingRes.rows[0], peer_id: recipient_user_id, display_name: peer.name },
      });
    }

    const wsRes = await db.query(
      `SELECT id FROM workspaces WHERE org_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [org_id]
    );
    if (wsRes.rows.length === 0) {
      return res.status(404).json({ error: 'No workspace available in organization.' });
    }

    const inserted = await db.query(
      `INSERT INTO channels (workspace_id, org_id, name, type, dm_key)
       VALUES ($1, $2, $3, 'direct', $4)
       ON CONFLICT (org_id, dm_key) WHERE dm_key IS NOT NULL
       DO UPDATE SET dm_key = EXCLUDED.dm_key
       RETURNING *`,
      [wsRes.rows[0].id, org_id, `DM ${lowId}-${highId}`, dmKey]
    );

    res.status(201).json({
      channel: { ...inserted.rows[0], peer_id: recipient_user_id, display_name: peer.name },
    });
  } catch (err) {
    console.error('Open DM error:', err);
    res.status(500).json({ error: 'Failed to open direct message.' });
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
  createChannel,
  openDirectMessage,
  getChannelMessages,
};
