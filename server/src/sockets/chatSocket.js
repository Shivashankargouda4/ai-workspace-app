const jwt = require('jsonwebtoken');
const db = require('../config/db');

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

    // Join channel room
    socket.on('channel:join', ({ channelId }) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on('channel:leave', ({ channelId }) => {
      socket.leave(`channel:${channelId}`);
    });

    // Handle new message
    socket.on('message:send', async ({ channelId, content }) => {
      try {
        if (!content || !content.trim()) return;

        // Persist message to database first
        const result = await db.query(
          `INSERT INTO messages (channel_id, user_id, content)
           VALUES ($1, $2, $3)
           RETURNING id, channel_id, user_id, content, created_at`,
          [channelId, socket.userId, content.trim()]
        );
        const savedMessage = result.rows[0];

        // Fetch sender user details
        const userRes = await db.query('SELECT id, name, avatar_url FROM users WHERE id = $1', [socket.userId]);
        savedMessage.sender = userRes.rows[0];

        // Broadcast to everyone in channel
        io.to(`channel:${channelId}`).emit('message:new', savedMessage);
      } catch (err) {
        console.error('Socket message send error:', err);
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    // Typing indicators
    socket.on('typing:start', ({ channelId, userName }) => {
      socket.to(`channel:${channelId}`).emit('typing:status', {
        channelId,
        userId: socket.userId,
        userName,
        isTyping: true,
      });
    });

    socket.on('typing:stop', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing:status', {
        channelId,
        userId: socket.userId,
        isTyping: false,
      });
    });

    socket.on('disconnect', () => {
      // Handled cleanup automatically by socket.io
    });
  });
}

module.exports = setupChatSocket;
