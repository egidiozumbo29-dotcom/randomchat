require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const { hashIP, generateSessionId } = require('./utils/helpers');
const { moderateMessage, checkAutoBan, isBanned, cleanOldBans } = require('./middleware/moderation');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use('/admin', adminRoutes);

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));

// Health check + stats
app.get('/health', (req, res) => res.json({ status: 'ok', online: io.engine.clientsCount }));
app.get('/stats', (req, res) => res.json({ online: io.engine.clientsCount }));

// SPA fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Stato globale
const waitingQueue = []; // sessioni in attesa di match
const rooms = new Map(); // roomId -> { user1, user2 }
const socketToSession = new Map(); // socketId -> sessionId
const sessionToSocket = new Map(); // sessionId -> socketId

function getClientIP(handshake) {
  return handshake.headers['x-forwarded-for'] || handshake.address || 'unknown';
}

function createRoom(s1, s2) {
  const roomId = `room_${s1}_${s2}`;
  rooms.set(roomId, { user1: s1, user2: s2 });
  
  const socket1 = io.sockets.sockets.get(sessionToSocket.get(s1));
  const socket2 = io.sockets.sockets.get(sessionToSocket.get(s2));
  
  if (socket1) {
    socket1.join(roomId);
    db.prepare('UPDATE sessions SET room_id = ? WHERE id = ?').run(roomId, s1);
  }
  if (socket2) {
    socket2.join(roomId);
    db.prepare('UPDATE sessions SET room_id = ? WHERE id = ?').run(roomId, s2);
  }
  
  return roomId;
}

function destroyRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  db.prepare('UPDATE sessions SET room_id = NULL WHERE room_id = ?').run(roomId);
  rooms.delete(roomId);
}

function findNewPartner(sessionId) {
  const idx = waitingQueue.indexOf(sessionId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
  
  for (let i = 0; i < waitingQueue.length; i++) {
    const candidate = waitingQueue[i];
    if (candidate !== sessionId) {
      waitingQueue.splice(i, 1);
      return candidate;
    }
  }
  waitingQueue.push(sessionId);
  return null;
}

function leaveCurrentRoom(sessionId, socket) {
  const room = Array.from(rooms.entries()).find(([_, r]) => r.user1 === sessionId || r.user2 === sessionId);
  if (room) {
    const [roomId, roomData] = room;
    const otherId = roomData.user1 === sessionId ? roomData.user2 : roomData.user1;
    destroyRoom(roomId);
    if (socket) socket.leave(roomId);
    
    const otherSocketId = sessionToSocket.get(otherId);
    if (otherSocketId) {
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      if (otherSocket) {
        otherSocket.leave(roomId);
        otherSocket.emit('partner_left');
        // NON auto-requeue! Lascia che l'altro clicchi Next manualmente
      }
    }
  }
}

io.on('connection', (socket) => {
  const ip = getClientIP(socket.handshake);
  const ipHash = hashIP(ip);
  const sessionId = generateSessionId();
  
  socketToSession.set(socket.id, sessionId);
  sessionToSocket.set(sessionId, socket.id);
  
  // Controlla ban
  const banStatus = isBanned(sessionId, ipHash);
  if (banStatus.banned) {
    socket.emit('banned', { until: banStatus.until });
    socket.disconnect(true);
    return;
  }
  
  // Registra sessione
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id, ip_hash, created_at, last_active) VALUES (?, ?, ?, ?)')
    .run(sessionId, ipHash, now, now);
  
  socket.emit('session_created', { sessionId });
  
  socket.on('find_partner', () => {
    cleanOldBans();
    const b = isBanned(sessionId, ipHash);
    if (b.banned) {
      socket.emit('banned', { until: b.until });
      return;
    }
    
    db.prepare('UPDATE sessions SET last_active = ? WHERE id = ?').run(Date.now(), sessionId);
    leaveCurrentRoom(sessionId, socket);
    
    const partner = findNewPartner(sessionId);
    if (partner) {
      const roomId = createRoom(sessionId, partner);
      const sPartner = sessionToSocket.get(partner);
      // Il partner era già in coda = iniziatore WebRTC
      socket.emit('matched', { roomId, isInitiator: false });
      if (sPartner) io.to(sPartner).emit('matched', { roomId, isInitiator: true });
    } else {
      socket.emit('waiting');
    }
  });
  
  socket.on('send_message', ({ roomId, text }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    if (room.user1 !== sessionId && room.user2 !== sessionId) return;
    
    const mod = moderateMessage(sessionId, text);
    if (!mod.allowed) {
      socket.emit('message_blocked', { reason: mod.reason });
      if (mod.action === 'timeout') {
        socket.emit('timeout');
      }
      return;
    }
    
    db.prepare('INSERT INTO message_logs (room_id, sender_session, content, created_at) VALUES (?, ?, ?, ?)')
      .run(roomId, sessionId, text, Date.now());
    
    const payload = { sender: sessionId, text, warning: mod.warning };
    socket.to(roomId).emit('receive_message', payload);
    socket.emit('receive_message', { ...payload, isMe: true });
  });
  
  socket.on('report_user', ({ roomId, reason }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const reportedId = room.user1 === sessionId ? room.user2 : room.user1;
    if (!reportedId) return;
    
    db.prepare('INSERT INTO reports (reporter_session, reported_session, reason, created_at) VALUES (?, ?, ?, ?)')
      .run(sessionId, reportedId, reason, Date.now());
    
    socket.emit('report_sent');
    
    // Auto-ban check
    const reportedIpHash = db.prepare('SELECT ip_hash FROM sessions WHERE id = ?').get(reportedId)?.ip_hash || '';
    if (checkAutoBan(reportedId, reportedIpHash)) {
      const sReported = sessionToSocket.get(reportedId);
      if (sReported) {
        io.to(sReported).emit('banned', { until: Date.now() + 30 * 60 * 1000 });
        const reportedSocket = io.sockets.sockets.get(sReported);
        if (reportedSocket) reportedSocket.disconnect(true);
      }
    }
  });
  
  socket.on('typing', ({ roomId }) => {
    if (rooms.has(roomId)) {
      socket.to(roomId).emit('partner_typing');
    }
  });

  // WebRTC Signaling
  socket.on('webrtc-offer', ({ roomId, offer }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const otherId = room.user1 === sessionId ? room.user2 : room.user1;
    const otherSocketId = sessionToSocket.get(otherId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('webrtc-offer', { offer, from: sessionId });
    }
  });

  socket.on('webrtc-answer', ({ roomId, answer }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const otherId = room.user1 === sessionId ? room.user2 : room.user1;
    const otherSocketId = sessionToSocket.get(otherId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('webrtc-answer', { answer, from: sessionId });
    }
  });

  socket.on('webrtc-ice-candidate', ({ roomId, candidate }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const otherId = room.user1 === sessionId ? room.user2 : room.user1;
    const otherSocketId = sessionToSocket.get(otherId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('webrtc-ice-candidate', { candidate, from: sessionId });
    }
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(sessionId, socket);
    socketToSession.delete(socket.id);
    sessionToSocket.delete(sessionId);
    // Non cancelliamo la sessione dal DB per mantenere report/ban collegati
  });
});

// Broadcast utenti online ogni 5 secondi
setInterval(() => {
  io.emit('online_count', io.engine.clientsCount);
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RandomChat server running on port ${PORT}`);
});
