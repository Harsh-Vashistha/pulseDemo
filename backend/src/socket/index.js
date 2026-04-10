const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (user) socket.user = user;
      }
    } catch {
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);
    socket.on('video:join', (videoId) => {
      socket.join(`video:${videoId}`);
      console.log(`[socket] ${socket.id} joined room video:${videoId}`);
    });

    socket.on('video:leave', (videoId) => {
      socket.leave(`video:${videoId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized. Call initSocket(server) first.');
  return io;
}

module.exports = { initSocket, getIO };
