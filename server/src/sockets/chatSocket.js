const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');
const {
  addParticipant,
  updateParticipant,
  removeParticipant,
  removeSocketFromAllRooms,
  getMeetingPeers,
  isSocketInMeeting,
} = require('../utils/meetingRegistry');

function relayWebRtcSignal(io, socket, eventName, { meetingId, targetSocketId, sdp, candidate } = {}) {
  const mId = Number(meetingId);
  if (!mId || !targetSocketId) return;
  if (!isSocketInMeeting(mId, socket.id) || !isSocketInMeeting(mId, targetSocketId)) {
    return;
  }
  const sender = getMeetingPeers(mId).find((p) => p.socketId === socket.id);
  io.to(targetSocketId).emit(eventName, {
    meetingId: mId,
    fromSocketId: socket.id,
    fromUser: sender?.user || { id: socket.userId },
    ...(sdp !== undefined ? { sdp } : {}),
    ...(candidate !== undefined ? { candidate } : {}),
  });
}

function setupChatSocket(io) {
  // Socket JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Authentication error: Token required.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'super_secret_access_token_key');
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token.'));
    }
  });

  io.on('connection', (socket) => {
    // Join personal user room for direct notifications
    socket.join(`user:${socket.userId}`);

    // Join workspace room for live document list & workspace updates
    socket.on('workspace:join', async ({ workspaceId } = {}) => {
      try {
        const workspace = await resolveAuthorizedResource('workspace', workspaceId, socket.userId);
        if (!workspace) {
          socket.emit('error', { message: 'Workspace not found or access denied.' });
          return;
        }
        socket.join(`workspace:${workspace.id}`);
      } catch (err) {
        console.error('Socket workspace join error:', err);
      }
    });

    socket.on('workspace:leave', ({ workspaceId } = {}) => {
      if (workspaceId) {
        socket.leave(`workspace:${workspaceId}`);
      }
    });

    // Join channel room (verify organization membership via channel -> workspace)
    socket.on('channel:join', async ({ channelId } = {}) => {
      try {
        const channel = await resolveAuthorizedResource('channel', channelId, socket.userId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found or access denied.' });
          return;
        }
        socket.join(`channel:${channel.id}`);
      } catch (err) {
        console.error('Socket channel join error:', err);
        socket.emit('error', { message: 'Failed to join channel.' });
      }
    });

    socket.on('channel:leave', ({ channelId } = {}) => {
      if (channelId) {
        socket.leave(`channel:${channelId}`);
      }
    });

    // Handle new message (re-verify organization membership on every send)
    socket.on('message:send', async ({ channelId, content } = {}) => {
      try {
        const channel = await resolveAuthorizedResource('channel', channelId, socket.userId);
        if (!channel) {
          socket.emit('error', { message: 'Channel not found or access denied.' });
          return;
        }

        if (!content || !content.trim()) return;

        // Persist message to database first
        const result = await db.query(
          `INSERT INTO messages (channel_id, user_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, channel_id, user_id, content, created_at`,
          [channel.id, socket.userId, content.trim()]
        );
        const savedMessage = result.rows[0];

        // Fetch sender user details
        const userRes = await db.query('SELECT id, name, avatar_url FROM users WHERE id = $1', [socket.userId]);
        savedMessage.sender = userRes.rows[0];

        // Broadcast to everyone in channel
        io.to(`channel:${channel.id}`).emit('message:new', savedMessage);
      } catch (err) {
        console.error('Socket message send error:', err);
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    // Typing indicators (scoped to authorized channel members)
    socket.on('typing:start', async ({ channelId, userName } = {}) => {
      try {
        const channel = await resolveAuthorizedResource('channel', channelId, socket.userId);
        if (!channel) return;
        socket.to(`channel:${channel.id}`).emit('typing:status', {
          channelId: channel.id,
          userId: socket.userId,
          userName,
          isTyping: true,
        });
      } catch (err) {
        console.error('Socket typing start error:', err);
      }
    });

    socket.on('typing:stop', async ({ channelId } = {}) => {
      try {
        const channel = await resolveAuthorizedResource('channel', channelId, socket.userId);
        if (!channel) return;
        socket.to(`channel:${channel.id}`).emit('typing:status', {
          channelId: channel.id,
          userId: socket.userId,
          isTyping: false,
        });
      } catch (err) {
        console.error('Socket typing stop error:', err);
      }
    });

    // WebRTC Meeting Room Join / Leave / Mesh Signaling / Media Controls
    socket.on('meeting:join', async (payload = {}, ack) => {
      try {
        const {
          meetingId,
          micMuted = false,
          camOff = false,
          handRaised = false,
          screenSharing = false,
        } = payload;
        const meeting = await resolveAuthorizedResource('meeting', meetingId, socket.userId);
        if (!meeting) {
          const errMsg = 'Meeting room not found or access denied.';
          socket.emit('error', { message: errMsg });
          if (typeof ack === 'function') ack({ ok: false, error: errMsg });
          return;
        }

        const userRes = await db.query(
          'SELECT id, name, avatar_url FROM users WHERE id = $1',
          [socket.userId]
        );
        const user = userRes.rows[0] || { id: socket.userId, name: 'Member', avatar_url: null };

        socket.join(`meeting:${meeting.id}`);
        const peerState = {
          user,
          micMuted: Boolean(micMuted),
          camOff: Boolean(camOff),
          handRaised: Boolean(handRaised),
          screenSharing: Boolean(screenSharing),
        };
        const allPeers = addParticipant(meeting.id, socket.id, peerState);
        const existingPeers = allPeers.filter((p) => p.socketId !== socket.id);

        socket.emit('meeting:peers', {
          meetingId: meeting.id,
          selfSocketId: socket.id,
          peers: existingPeers,
        });
        socket.to(`meeting:${meeting.id}`).emit('meeting:peer-joined', {
          meetingId: meeting.id,
          peer: { socketId: socket.id, ...peerState },
        });
        io.to(`workspace:${meeting.workspace_id}`).emit('meetings:changed', {
          action: 'presence',
          workspaceId: meeting.workspace_id,
          meetingId: meeting.id,
          active_participants: allPeers.length,
        });

        if (typeof ack === 'function') {
          ack({ ok: true, selfSocketId: socket.id, peers: existingPeers });
        }
      } catch (err) {
        console.error('Socket meeting join error:', err);
        socket.emit('error', { message: 'Failed to join meeting room.' });
        if (typeof ack === 'function') ack({ ok: false, error: 'Failed to join meeting room.' });
      }
    });

    socket.on('meeting:leave', ({ meetingId } = {}) => {
      const mId = Number(meetingId);
      if (!mId) return;
      socket.leave(`meeting:${mId}`);
      const removed = removeParticipant(mId, socket.id);
      if (removed) {
        io.to(`meeting:${mId}`).emit('meeting:peer-left', {
          meetingId: mId,
          socketId: socket.id,
          userId: socket.userId,
        });
      }
    });

    socket.on('webrtc:offer', (payload) => relayWebRtcSignal(io, socket, 'webrtc:offer', payload));
    socket.on('webrtc:answer', (payload) => relayWebRtcSignal(io, socket, 'webrtc:answer', payload));
    socket.on('webrtc:ice-candidate', (payload) =>
      relayWebRtcSignal(io, socket, 'webrtc:ice-candidate', payload)
    );

    socket.on('meeting:media-state', ({ meetingId, micMuted, camOff, handRaised, screenSharing } = {}) => {
      const mId = Number(meetingId);
      if (!mId || !isSocketInMeeting(mId, socket.id)) return;
      const patch = {};
      if (micMuted !== undefined) patch.micMuted = Boolean(micMuted);
      if (camOff !== undefined) patch.camOff = Boolean(camOff);
      if (handRaised !== undefined) patch.handRaised = Boolean(handRaised);
      if (screenSharing !== undefined) patch.screenSharing = Boolean(screenSharing);
      const updated = updateParticipant(mId, socket.id, patch);
      if (updated) {
        socket.to(`meeting:${mId}`).emit('meeting:media-state', {
          meetingId: mId,
          socketId: socket.id,
          userId: socket.userId,
          ...patch,
        });
      }
    });

    socket.on('meeting:chat', ({ meetingId, content } = {}) => {
      const mId = Number(meetingId);
      const text = typeof content === 'string' ? content.trim() : '';
      if (!mId || !text || !isSocketInMeeting(mId, socket.id)) return;
      const sender = getMeetingPeers(mId).find((p) => p.socketId === socket.id)?.user || {
        id: socket.userId,
        name: 'Member',
      };
      io.to(`meeting:${mId}`).emit('meeting:chat', {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        meetingId: mId,
        sender,
        content: text.slice(0, 2000),
        created_at: new Date().toISOString(),
      });
    });

    socket.on('meeting:transcript-sync', ({ meetingId, transcript } = {}) => {
      const mId = Number(meetingId);
      if (!mId || typeof transcript !== 'string' || !isSocketInMeeting(mId, socket.id)) return;
      socket.to(`meeting:${mId}`).emit('meeting:transcript-sync', {
        meetingId: mId,
        transcript,
        fromUserId: socket.userId,
      });
    });

    socket.on('disconnect', () => {
      const departed = removeSocketFromAllRooms(socket.id);
      for (const { meetingId } of departed) {
        io.to(`meeting:${meetingId}`).emit('meeting:peer-left', {
          meetingId,
          socketId: socket.id,
          userId: socket.userId,
        });
      }
    });
  });
}

module.exports = setupChatSocket;
