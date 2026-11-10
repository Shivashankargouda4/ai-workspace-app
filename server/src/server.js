const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const setupChatSocket = require('./sockets/chatSocket');
const { attachCollabServer, flushCollabStores } = require('./collab/hocuspocusServer');
const { ensureDatabaseReady } = require('./config/initDb');
const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/orgs');
const taskRoutes = require('./routes/tasks');
const chatRoutes = require('./routes/chat');
const aiRoutes = require('./routes/ai');
const analyticsRoutes = require('./routes/analytics');
const fileRoutes = require('./routes/files');
const docRoutes = require('./routes/docs');
const notificationRoutes = require('./routes/notifications');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  },
});
setupChatSocket(io);
attachCollabServer(server);

// Make io accessible in requests if needed
app.set('io', io);

// Security & Utility Middlewares (permissive CSP for tunnel & PWA assets)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'AI-Powered Collaborative Workspace API',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/docs', docRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve static React client if built (Single-Origin / Mobile Tunnel / Production mode)
const distPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/socket.io') ||
      req.path.startsWith('/collab')
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log('📦 Single-origin active: Serving client/dist on same port');
}

// Global Error Handler
app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File size exceeds the 10 MB limit.' });
  }
  if (err?.message && err.message.includes('is not supported.')) {
    return res.status(400).json({ error: err.message });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON request payload.' });
  }
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await ensureDatabaseReady();
  } catch (err) {
    console.error('Database initialization warning:', err.message);
  }

  server.listen(PORT, () => {
    console.log(`🚀 Workspace API Server running on port ${PORT}`);
    console.log(`🌐 Accepting requests from: ${CLIENT_URL}`);
  });
}

startServer();

async function shutdownGracefully(signal) {
  console.log(`\nReceived ${signal}, flushing collaborative document state...`);
  try {
    await flushCollabStores();
  } catch (err) {
    console.error('Flush collab stores failed:', err);
  }
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
