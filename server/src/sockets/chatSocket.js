const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { resolveAuthorizedResource } = require('../utils/tenantAccess');

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

    socket.on('disconnect', () => {
      // Handled cleanup automatically by socket.io
    });
  });
}

module.exports = setupChatSocket;
