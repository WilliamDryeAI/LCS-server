const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// Health check — Render pings this to keep the service alive
app.get('/', (req, res) => res.send('LCS Server Online'));

let playerCount = 0;

io.on('connection', socket => {
  playerCount++;
  console.log(`[+] ${socket.id} connected  (${playerCount} online)`);

  // Tell the new client they're connected and how many players are online
  socket.emit('welcome', { playerCount });

  // Broadcast updated count to everyone
  io.emit('playerCount', playerCount);

  socket.on('disconnect', () => {
    playerCount--;
    console.log(`[-] ${socket.id} disconnected  (${playerCount} online)`);
    io.emit('playerCount', playerCount);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`LCS Server listening on port ${PORT}`));
