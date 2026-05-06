const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.get('/', (req, res) => res.send('LCS Server Online'));

let playerCount = 0;
const rooms = {};

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms[code]);
  return code;
}

function getRoomOf(socketId) {
  for (const code in rooms) {
    if (rooms[code].players.find(p => p.id === socketId)) return rooms[code];
  }
  return null;
}

function broadcastRoom(room) {
  const state = {
    code:    room.code,
    hostId:  room.host,
    players: room.players.map(p => ({
      id: p.id, name: p.name, charId: p.charId, ready: p.ready
    }))
  };
  room.players.forEach(p => io.to(p.id).emit('room_update', state));
}

function removeFromRoom(socketId) {
  const room = getRoomOf(socketId);
  if (!room) return;
  room.players = room.players.filter(p => p.id !== socketId);
  if (room.players.length === 0) { delete rooms[room.code]; return; }
  if (room.host === socketId) room.host = room.players[0].id;
  broadcastRoom(room);
}

io.on('connection', socket => {
  playerCount++;
  console.log(`[+] ${socket.id}  (${playerCount} online)`);
  socket.emit('welcome', { playerCount });
  io.emit('playerCount', playerCount);

  // ── lobby events ──────────────────────────────────────

  socket.on('create_room', ({ name, charId }) => {
    removeFromRoom(socket.id);
    const code = makeCode();
    rooms[code] = {
      code, host: socket.id, started: false,
      players: [{ id: socket.id, name, charId, ready: false }]
    };
    console.log(`[ROOM] ${name} created ${code}`);
    broadcastRoom(rooms[code]);
  });

  socket.on('join_room', ({ code, name, charId }) => {
    const room = rooms[code];
    if (!room)                  return socket.emit('join_error', 'Room not found');
    if (room.started)           return socket.emit('join_error', 'Game already started');
    if (room.players.length>=10) return socket.emit('join_error', 'Room is full');
    if (room.players.find(p => p.id === socket.id)) return;
    removeFromRoom(socket.id);
    room.players.push({ id: socket.id, name, charId, ready: false });
    console.log(`[ROOM] ${name} joined ${code}`);
    broadcastRoom(room);
  });

  socket.on('move', data => {
    const room = getRoomOf(socket.id);
    if (!room || !room.started) return;
    room.players.forEach(p => {
      if (p.id !== socket.id) io.to(p.id).emit('player_moved', { id:socket.id, ...data });
    });
  });

  socket.on('leave_room', () => {
    console.log(`[ROOM] ${socket.id} left`);
    removeFromRoom(socket.id);
  });

  socket.on('player_update', ({ name, charId }) => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const p = room.players.find(p => p.id === socket.id);
    if (p) { p.name = name; p.charId = charId; }
    broadcastRoom(room);
  });

  socket.on('player_ready', () => {
    const room = getRoomOf(socket.id);
    if (!room) return;
    const p = room.players.find(p => p.id === socket.id);
    if (p) p.ready = !p.ready;
    broadcastRoom(room);
  });

  socket.on('start_game', () => {
    const room = getRoomOf(socket.id);
    if (!room || room.host !== socket.id) return;
    if (!room.players.every(p => p.ready)) return;
    room.started = true;
    console.log(`[ROOM] ${room.code} game started`);
    room.players.forEach(p =>
      io.to(p.id).emit('game_start', {
        players: room.players.map(pl => ({ id:pl.id, name:pl.name, charId:pl.charId }))
      })
    );
  });

  // ── disconnect ────────────────────────────────────────

  socket.on('disconnect', () => {
    playerCount--;
    console.log(`[-] ${socket.id}  (${playerCount} online)`);
    io.emit('playerCount', playerCount);
    removeFromRoom(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`LCS Server on port ${PORT}`));
