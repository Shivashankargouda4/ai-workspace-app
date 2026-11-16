const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const db = require('./config/db');
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
const codeRoutes = require('./routes/code');
const meetingRoutes = require('./routes/meetings');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

// Allowed CORS origins — in production, restrict strictly to configured client domain
const allowedOrigins = isProduction
  ? [CLIENT_URL, process.env.RENDER_EXTERNAL_URL].filter(Boolean)
  : [
      CLIENT_URL,
      'http://localhost:5173',
      'http://localhost:5000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5000',
    ];

const corsOriginHandler = (origin, callback) => {
  // Allow non-browser requests (mobile native, curl, postman, same-origin)
  if (!origin) return callback(null, true);

  if (allowedOrigins.includes(origin)) return callback(null, true);

  // In development, allow local network IPs for mobile testing (e.g. 192.168.x.x, 10.x.x.x)
  if (!isProduction) {
    if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) || /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
  }

  if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) {
    return callback(null, true);
  }

  if (isProduction) {
    return callback(new Error(`CORS policy: Access denied for origin ${origin}`));
  }

  callback(null, true);
};

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
});
setupChatSocket(io);
attachCollabServer(server);

// Make io accessible in requests if needed
app.set('io', io);

// Security Middlewares with Content Security Policy tuned for Monaco, TipTap & WebRTC
// Note: 'unsafe-eval' is strictly required by the Monaco Code Editor for in-browser syntax tokenization
// and Web Worker execution. 'unsafe-inline' is required for Vite styles & TipTap editor styling.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https://api.dicebear.com", "https://*.dicebear.com"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "https://*.onrender.com",
          "https://api.dicebear.com",
          ...(isProduction ? [] : ["http://localhost:*", "http://127.0.0.1:*"]),
        ],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: corsOriginHandler,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Robust API Health Check verifying PostgreSQL connection readiness
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbLatencyMs = null;
  let dbError = null;

  try {
    const t0 = Date.now();
    await db.query('SELECT 1');
    dbLatencyMs = Date.now() - t0;
    dbStatus = 'connected';
  } catch (err) {
    dbError = err.message;
  }

  const isHealthy = dbStatus === 'connected';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    service: 'AI-Powered Collaborative Workspace API',
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      ...(dbError && { error: dbError }),
    },
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
app.use('/api/code', codeRoutes);
app.use('/api/meetings', meetingRoutes);

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
    console.log('✅ PostgreSQL database schema verified and ready.');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('Fatal: Cannot start production server without database.');
      process.exit(1);
    }
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
