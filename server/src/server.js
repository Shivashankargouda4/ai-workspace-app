require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const setupChatSocket = require('./sockets/chatSocket');
const authRoutes = require('./routes/auth');
const orgRoutes = require('./routes/orgs');
const taskRoutes = require('./routes/tasks');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});
setupChatSocket(io);

// Make io accessible in requests if needed
app.set('io', io);

// Security & Utility Middlewares
app.use(helmet());
app.use(
  cors({
    origin: CLIENT_URL,
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Workspace API Server running on port ${PORT}`);
  console.log(`🌐 Accepting requests from: ${CLIENT_URL}`);
});
