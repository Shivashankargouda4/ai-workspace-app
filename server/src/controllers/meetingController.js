const crypto = require('crypto');
const { z } = require('zod');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');
const { getMeetingParticipantCount, clearMeetingRoom } = require('../utils/meetingRegistry');
const { createAndPushNotification } = require('../utils/notificationService');

const createMeetingSchema = z.object({
  workspace_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(2, 'Meeting title is required').max(255),
});

const updateMeetingSchema = z.object({
  title: z.string().trim().min(2).max(255).optional(),
  transcript: z.string().max(200000).optional(),
  is_active: z.boolean().optional(),
});

function parsePositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function generateRoomCode() {
  return `meet-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Return WebRTC ICE configuration (Google public STUN + optional TURN server from environment).
 */
const getIceConfig = async (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (process.env.TURN_URL) {
    const turnEntry = { urls: process.env.TURN_URL };
    if (process.env.TURN_USERNAME) turnEntry.username = process.env.TURN_USERNAME;
    if (process.env.TURN_CREDENTIAL) turnEntry.credential = process.env.TURN_CREDENTIAL;
    iceServers.push(turnEntry);
  }

  res.json({ iceServers });
};

/**
 * List meetings in an authorized workspace along with live participant counts.
 */
const listWorkspaceMeetings = async (req, res) => {
  try {
    const workspaceId = parsePositiveInt(req.params.workspaceId);
    if (!workspaceId) {
      return res.status(400).json({ error: 'Invalid workspace ID.' });
    }

    const workspace = await resolveAuthorizedResource('workspace', workspaceId, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const result = await db.query(
      `SELECT m.*, u.name AS host_name
       FROM meetings m
       LEFT JOIN users u ON m.created_by = u.id
       WHERE m.workspace_id = $1 AND m.org_id = $2
       ORDER BY m.is_active DESC, m.created_at DESC, m.id DESC`,
      [workspace.id, workspace.resolved_org_id]
    );

    const meetings = result.rows.map((row) => ({
      ...row,
      active_participants: getMeetingParticipantCount(row.id),
    }));

    res.json({ meetings });
  } catch (error) {
    console.error('List meetings error:', error);
    res.status(500).json({ error: 'Failed to retrieve workspace meetings.' });
  }
};

/**
 * Create a new workspace meeting room and notify teammates.
 */
const createMeeting = async (req, res) => {
  try {
    const parsed = createMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid meeting payload.' });
    }

    const workspace = await resolveAuthorizedResource('workspace', parsed.data.workspace_id, req.user.id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found.' });
    }

    const roomCode = generateRoomCode();
    const result = await db.query(
      `INSERT INTO meetings (workspace_id, org_id, title, room_code, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [workspace.id, workspace.resolved_org_id, parsed.data.title, roomCode, req.user.id]
    );

    const createdMeeting = {
      ...result.rows[0],
      host_name: req.user.name,
      active_participants: 0,
    };

    const io = req.app.get('io');
    io?.to(`workspace:${workspace.id}`).emit('meetings:changed', {
      action: 'created',
      workspaceId: workspace.id,
      meeting: createdMeeting,
    });

    // Notify online org teammates that a video meeting started
    const membersRes = await db.query(
      'SELECT user_id FROM organization_members WHERE org_id = $1 AND user_id != $2',
      [workspace.resolved_org_id, req.user.id]
    );
    await Promise.all(
      membersRes.rows.map((m) =>
        createAndPushNotification(io, {
          userId: m.user_id,
          orgId: workspace.resolved_org_id,
          type: 'meeting_started',
          title: 'Video Meeting Started',
          message: `${req.user.name} started "${createdMeeting.title}" (${createdMeeting.room_code}).`,
        })
      )
    );

    res.status(201).json({ meeting: createdMeeting });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ error: 'Failed to create meeting room.' });
  }
};

/**
 * Resolve an authorized meeting room by shareable room_code.
 */
const resolveMeetingByCode = async (req, res) => {
  try {
    const roomCode = String(req.params.roomCode || '').trim();
    if (!roomCode) {
      return res.status(400).json({ error: 'Room code is required.' });
    }

    const lookup = await db.query('SELECT id FROM meetings WHERE room_code = $1', [roomCode]);
    if (lookup.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting room not found.' });
    }

    const meeting = await resolveAuthorizedResource('meeting', lookup.rows[0].id, req.user.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting room not found.' });
    }

    const hostRes = await db.query('SELECT name FROM users WHERE id = $1', [meeting.created_by]);
    res.json({
      meeting: {
        ...meeting,
        host_name: hostRes.rows[0]?.name || 'Host',
        active_participants: getMeetingParticipantCount(meeting.id),
      },
    });
  } catch (error) {
    console.error('Resolve meeting code error:', error);
    res.status(500).json({ error: 'Failed to resolve meeting room.' });
  }
};

/**
 * Save collaborative transcript/notes or update meeting status.
 */
const updateMeeting = async (req, res) => {
  try {
    const meetingId = parsePositiveInt(req.params.meetingId);
    if (!meetingId) {
      return res.status(400).json({ error: 'Invalid meeting ID.' });
    }

    const parsed = updateMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid meeting update.' });
    }

    const meeting = await resolveAuthorizedResource('meeting', meetingId, req.user.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting room not found.' });
    }

    const nextTitle = parsed.data.title ?? meeting.title;
    const nextTranscript = parsed.data.transcript !== undefined ? parsed.data.transcript : meeting.transcript;
    const nextActive = parsed.data.is_active !== undefined ? parsed.data.is_active : meeting.is_active;

    const result = await db.query(
      `UPDATE meetings
       SET title = $1, transcript = $2, is_active = $3
       WHERE id = $4
       RETURNING *`,
      [nextTitle, nextTranscript, nextActive, meeting.id]
    );

    const updated = {
      ...result.rows[0],
      active_participants: getMeetingParticipantCount(meeting.id),
    };

    req.app.get('io')?.to(`workspace:${meeting.workspace_id}`).emit('meetings:changed', {
      action: 'updated',
      workspaceId: meeting.workspace_id,
      meeting: updated,
    });

    res.json({ meeting: updated });
  } catch (error) {
    console.error('Update meeting error:', error);
    res.status(500).json({ error: 'Failed to update meeting.' });
  }
};

/**
 * End and delete an authorized meeting room (host, manager, or admin).
 */
const deleteMeeting = async (req, res) => {
  try {
    const meetingId = parsePositiveInt(req.params.meetingId);
    if (!meetingId) {
      return res.status(400).json({ error: 'Invalid meeting ID.' });
    }

    const meeting = await resolveAuthorizedResource('meeting', meetingId, req.user.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting room not found.' });
    }

    const isPrivileged = ['admin', 'manager'].includes(meeting.member_role);
    if (meeting.created_by !== req.user.id && !isPrivileged) {
      return res.status(403).json({ error: 'Only the host, a manager, or an admin can delete this meeting.' });
    }

    const io = req.app.get('io');
    io?.to(`meeting:${meeting.id}`).emit('meeting:ended', { meetingId: meeting.id });
    clearMeetingRoom(meeting.id);

    await db.query('DELETE FROM meetings WHERE id = $1', [meeting.id]);

    io?.to(`workspace:${meeting.workspace_id}`).emit('meetings:changed', {
      action: 'deleted',
      workspaceId: meeting.workspace_id,
      meetingId: meeting.id,
    });

    res.json({ deleted: true, id: meeting.id });
  } catch (error) {
    console.error('Delete meeting error:', error);
    res.status(500).json({ error: 'Failed to delete meeting.' });
  }
};

module.exports = {
  getIceConfig,
  listWorkspaceMeetings,
  createMeeting,
  resolveMeetingByCode,
  updateMeeting,
  deleteMeeting,
};
