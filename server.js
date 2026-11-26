const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const kingsCup = require('./games/kingsCup');

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

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit('room_state', {
    roomCode: room.roomCode,
    hostId: room.hostId,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected
    })),
    game: room.gameState ? kingsCup.getPublicState(room.gameState, room.players) : null
  });
}

io.on('connection', (socket) => {
  // 建立新房間
  socket.on('create_room', ({ playerName, playerId }) => {
    const cleanName = (playerName || '').trim().slice(0, 12);
    if (!cleanName || !playerId) return;

    const roomCode = generateRoomCode();
    const room = {
      roomCode,
      hostId: playerId,
      phase: 'LOBBY',
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

  // 加入現有房間（同時支援斷線重連與中途加入）
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

  // 頁面重整時自動接回原牌局
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

  // 房長開始遊戲
  socket.on('start_game', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;

    room.phase = 'PLAYING';
    room.gameState = kingsCup.initState();
    broadcastRoomState(roomCode);
  });

  // 遊戲內動作（抽牌、送出 J 規則、重新開局）
  socket.on('game_action', ({ roomCode, playerId, action, payload }) => {
    const room = rooms.get(roomCode);
    if (!room || room.phase !== 'PLAYING' || !room.gameState) return;

    room.gameState = kingsCup.handleAction(
      room.gameState,
      playerId,
      room.players,
      action,
      payload
    );
    broadcastRoomState(roomCode);
  });

  // 回到等待大廳
  socket.on('back_to_lobby', ({ roomCode, playerId }) => {
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;

    room.phase = 'LOBBY';
    room.gameState = null;
    broadcastRoomState(roomCode);
  });

  // 斷線標記（保留座位等待重連）
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

// 取得 Mac 區網 IP 方便手機連線
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n=========================================');
  console.log('👑 多人派對平台伺服器已成功啟動！');
  console.log(`💻 Mac 本機測試：http://localhost:${PORT}`);
  const ips = getLocalIPs();
  ips.forEach(ip => {
    console.log(`📱 iPhone 連線網址：http://${ip}:${PORT}`);
  });
  console.log('=========================================\n');
});