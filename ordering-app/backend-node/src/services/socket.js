const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ADMIN_ROOM = 'admins';
let io = null;

/** Attaches Socket.IO to the HTTP server. Only authenticated admins may connect. */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, env.jwtSecret);
      if (payload.role !== 'admin') throw new Error('forbidden');
      socket.data.admin = { id: payload.sub, email: payload.email };
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(ADMIN_ROOM);
    console.log(`Admin socket connected: ${socket.data.admin.email}`);
  });

  return io;
}

function emitToAdmins(event, payload) {
  if (io) io.to(ADMIN_ROOM).emit(event, payload);
}

module.exports = { initSocket, emitToAdmins };
