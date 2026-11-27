const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const gamesRegistry = require('./games');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

// 針對每位玩家發送個人化狀態（避免底牌、兇手身分與幽靈視角外洩）
function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const gameDef = gamesRegistry.getGame(room.selectedGameId);
  const publicPlayers = room.players.map(p => ({
    id: p.id,
    name: p.name,
    connected: p.connected
  }));

  room.players.forEach(player => {
    if (!player.socketId) return;
    io.to(player.socketId).emit('room_state', {
      roomCode: room.roomCode,
      hostId: room.hostId,
      phase: room.phase,
      selectedGameId: room.selectedGameId,
      availableGames: gamesRegistry.listGames(),
      players: publicPlayers,
      game: room.gameState
        ? gameDef.module.getPublicState(room.gameState, room.players, player.id)
        : null
    });
  });
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ playerName, playerId }) => {
    const cleanName = (playerName || '').trim().slice(0, 12);
    if (!cleanName || !playerId) return;

    const roomCode = generateRoomCode();
    const room = {
      roomCode,
      hostId: playerId,
      phase: 'LOBBY',
      selectedGameId: 'kingsCup',
      players: [{
        id: playerId,
        socketId: socket.id,
        name: cleanName,
        connected: true
      }],
      gameState: null
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;

    broadcastRoomState(roomCode);
  });

  socket.on('join_room', ({ roomCode, playerName, playerId }) => {
    const code = (roomCode || '').trim();
    const cleanName = (playerName || '').trim().slice(0, 12);
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error_msg', '找不到此房號，請確認後再試！');
      return;
    }

    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      existingPlayer.socketId = socket.id;
      existingPlayer.connected = true;
      if (cleanName) existingPlayer.name = cleanName;
    } else {
      if (room.phase !== 'LOBBY') {
        socket.emit('error_msg', '遊戲進行中，請等本局結束回大廳後再加入！');
        return;
      }
      if (!cleanName) {
        socket.emit('error_msg', '請輸入你的暱稱！');
        return;
      }
      room.players.push({
        id: playerId,
        socketId: socket.id,
        name: cleanName,
        connected: true
      });
    }

    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = playerId;

    broadcastRoomState(code);
  });

  socket.on('rejoin_room', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('session_expired');
      return;
    }
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (!existingPlayer) {
      socket.emit('session_expired');
      return;
    }

    existingPlayer.socketId = socket.id;
    existingPlayer.connected = true;
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;

    broadcastRoomState(roomCode);
  });

  socket.on('select_game', ({ roomCode, playerId, gameId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId || room.phase !== 'LOBBY') return;

    const gameDef = gamesRegistry.getGame(gameId);
    room.selectedGameId = gameDef.id;
    broadcastRoomState(roomCode);
  });

  socket.on('start_game', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;

    const gameDef = gamesRegistry.getGame(room.selectedGameId);
    if (room.players.length < gameDef.minPlayers) {
      socket.emit('error_msg', `《${gameDef.name}》至少需要 ${gameDef.minPlayers} 位玩家才能開始！`);
      return;
    }
    if (room.players.length > gameDef.maxPlayers) {
      socket.emit('error_msg', `《${gameDef.name}》最多支援 ${gameDef.maxPlayers} 位玩家！`);
      return;
    }

    room.phase = 'PLAYING';
    room.gameState = gameDef.module.initState(room.players);
    broadcastRoomState(roomCode);
  });

  socket.on('game_action', ({ roomCode, playerId, action, payload }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'PLAYING' || !room.gameState) return;

    const gameDef = gamesRegistry.getGame(room.selectedGameId);
    room.gameState = gameDef.module.handleAction(
      room.gameState,
      playerId,
      room.players,
      action,
      payload
    );
    broadcastRoomState(roomCode);
  });

  socket.on('back_to_lobby', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;

    room.phase = 'LOBBY';
    room.gameState = null;
    broadcastRoomState(roomCode);
  });

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data || {};
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player && player.socketId === socket.id) {
      player.connected = false;
      broadcastRoomState(roomCode);
    }
  });
});

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=========================================');
  console.log('🎮 多人派對遊戲平台已成功啟動！');
  console.log(`💻 本機測試：http://localhost:${PORT}`);
  getLocalIPs().forEach(ip => console.log(`📱 區網連線：http://${ip}:${PORT}`));
  console.log('=========================================\n');
});
