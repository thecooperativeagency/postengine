import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Import routes and middleware
import { initializeDatabase } from './db/connection.js';
import investorRoutes from './routes/investors.js';
import postRoutes from './routes/posts.js';
import mentionRoutes from './routes/mentions.js';
import alertRoutes from './routes/alerts.js';
import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';

// Create Express app with HTTP server for WebSocket
const app = express();
const server = createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/mentions', mentionRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/dashboard', dashboardRoutes);

// WebSocket Handlers
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('subscribe_investor', (investorId) => {
    socket.join(`investor:${investorId}`);
    socket.emit('subscribed', { investorId });
  });

  socket.on('subscribe_ticker', (ticker) => {
    socket.join(`ticker:${ticker}`);
    socket.emit('subscribed', { ticker });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Global socket.io instance for emitting from routes
app.locals.io = io;

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Serve frontend build
import { createRequire } from 'module';
const require2 = createRequire(import.meta.url);
const path2 = require2('path');
const url2 = require2('url');
const __filename2 = url2.fileURLToPath(import.meta.url);
const __dirname2 = path2.dirname(__filename2);
const frontendDist = path2.join(__dirname2, '../../frontend/dist');
app.use(express.static(frontendDist, { index: 'index.html' }));
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path2.join(frontendDist, 'index.html'));
  } else {
    next();
  }
});

// Initialize database and start server
const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await initializeDatabase();
    console.log('Database initialized');

    server.listen(PORT, () => {
      console.log(`📊 Investment Monitor running on http://localhost:${PORT}`);
      console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

export { server, io };
