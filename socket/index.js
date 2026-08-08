const socketIO = require('socket.io');
const jwt      = require('jsonwebtoken');
const { prisma } = require('../src/config/database');

// In-memory online users map: userId → socketId
const onlineUsers = new Map();

function initSocket(server) {
  const io = socketIO(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const clientUrl = process.env.CLIENT_URL || '';
        const allowed =
          origin === clientUrl ||
          /localhost(:\d+)?$/.test(origin)  ||
          /\.vercel\.app$/.test(origin)     ||
          /\.onrender\.com$/.test(origin)   ||
          /\.railway\.app$/.test(origin);
        if (allowed) callback(null, true);
        else callback(new Error(`Socket CORS blocked: ${origin}`));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // ── Auth Middleware ────────────────────────────────────────────────────────
  // VULN (JWT signature not verified): unlike the REST auth middleware
  // (src/middleware/auth.middleware.js), which correctly calls jwt.verify(),
  // this socket handshake auth uses jwt.decode() — it reads the payload but
  // never checks the signature. Anyone can hand-craft a token with any
  // `id` claim (e.g. base64 a header/payload/fake-signature themselves,
  // no secret needed) and this middleware will accept it as that user,
  // giving full access to their conversations/DMs over the socket
  // (message:send, conversation:join, etc.), since the REST-authenticated
  // access token and this socket token are just plain strings — there's no
  // way to tell a genuine one from a forged one without verifying the sig.
  // FIX: use jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  // exactly like auth.middleware.js does, and reject on any verify error.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token provided'));

      const decoded = jwt.decode(token);
      if (!decoded || !decoded.id) return next(new Error('Invalid token'));
      const user    = await prisma.user.findUnique({
        where:  { id: decoded.id },
        select: { id: true, username: true, fullName: true, avatar: true, isActive: true },
      });

      if (!user || !user.isActive) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  // ── Connection ─────────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.user.id;

    onlineUsers.set(userId, socket.id);
    console.log(`✅ ${socket.user.username} connected | Online: ${onlineUsers.size}`);

    // Tell everyone this user is now online
    io.emit('user:online', { userId, username: socket.user.username });

    // ── Conversation room ──────────────────────────────────────────────────
    socket.on('conversation:join', (conversationId) => {
      socket.join(`conv:${conversationId}`);
    });
    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // ── Send message ───────────────────────────────────────────────────────
    socket.on('message:send', async (data) => {
      try {
        const { conversationId, content, messageType = 'TEXT', mediaUrl, replyToId } = data;

        if (!content && !mediaUrl) {
          return socket.emit('message:error', { error: 'Empty message' });
        }

        // Verify participant
        const participant = await prisma.conversationParticipant.findUnique({
          where: { conversationId_userId: { conversationId, userId } },
        });
        if (!participant) {
          return socket.emit('message:error', { error: 'Not a participant' });
        }

        // Save to DB
        const message = await prisma.message.create({
          data: {
            conversationId,
            senderId: userId,
            content,
            messageType,
            ...(mediaUrl  && { mediaUrl }),
            ...(replyToId && { replyToId }),
          },
          include: {
            sender: {
              select: { id: true, username: true, fullName: true, avatar: true },
            },
          },
        });

        // Update conversation preview
        await prisma.conversation.update({
          where: { id: conversationId },
          data:  { lastMessage: content || 'Media', lastMessageAt: new Date() },
        });

        // Broadcast to everyone in the room
        io.to(`conv:${conversationId}`).emit('message:received', {
          ...message,
          conversationId,
        });

        // Notify offline / out-of-room participants
        const participants = await prisma.conversationParticipant.findMany({
          where: { conversationId },
          select: { userId: true },
        });

        for (const p of participants) {
          if (p.userId === userId) continue;

          // Create DB notification
          const notif = await prisma.notification.create({
            data: {
              userId:   p.userId,
              type:     'MESSAGE',
              actorId:  userId,
              message:  `${socket.user.fullName} sent you a message`,
            },
          }).catch(() => null);

          // Push live notification to the recipient if they're online
          const recipientSocketId = onlineUsers.get(p.userId);
          if (recipientSocketId && notif) {
            io.to(recipientSocketId).emit('notification:new', {
              id:        notif.id,
              type:      'MESSAGE',
              message:   notif.message,
              actorId:   userId,
              createdAt: notif.createdAt,
            });
          }
        }
      } catch (err) {
        console.error('message:send error:', err.message);
        socket.emit('message:error', { error: 'Failed to send message' });
      }
    });

    // ── Typing indicators ──────────────────────────────────────────────────
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:start', {
        userId,
        username: socket.user.username,
      });
    });
    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('typing:stop', { userId });
    });

    // ── Mark read ──────────────────────────────────────────────────────────
    socket.on('message:read', async ({ messageId, conversationId }) => {
      try {
        await prisma.message.update({
          where: { id: messageId },
          data:  { readAt: new Date() },
        });
        io.to(`conv:${conversationId}`).emit('message:read', {
          messageId,
          userId,
          readAt: new Date(),
        });
      } catch (err) {
        console.error('message:read error:', err.message);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      onlineUsers.delete(userId);
      console.log(`❌ ${socket.user.username} disconnected (${reason}) | Online: ${onlineUsers.size}`);
      io.emit('user:offline', { userId });
    });
  });

  return io;
}

// ── Helper: emit a real-time notification to a user if they are online ────────
// Call this from any controller after creating a DB notification.
// Usage:
//   const { emitNotification } = require('../../socket');
//   emitNotification(io, recipientUserId, { id, type, message, actorId, createdAt });
function emitNotification(io, userId, payload) {
  const socketId = onlineUsers.get(userId);
  if (io && socketId) {
    io.to(socketId).emit('notification:new', payload);
  }
}

module.exports = { initSocket, onlineUsers, emitNotification };