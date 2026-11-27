// 3x3 九宮格地點（索引 0~8 對應 3列 x 3欄）
const ROOMS = [
  '書房', '大廳', '溫室',
  '餐廳', '中庭', '酒窖',
  '廚房', '走廊', '圖書館'
];

const WEAPONS = ['燭台', '匕首', '左輪手槍', '麻繩'];

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 判斷九宮格是否為上下左右相鄰（不可原地停留、不可斜走）
function isAdjacent(fromIdx, toIdx) {
  if (fromIdx < 0 || fromIdx > 8 || toIdx < 0 || toIdx > 8) return false;
  const r1 = Math.floor(fromIdx / 3), c1 = fromIdx % 3;
  const r2 = Math.floor(toIdx / 3), c2 = toIdx % 3;
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function initState(players) {
  const killerIdx = Math.floor(Math.random() * players.length);
  const killerId = players[killerIdx].id;

  const solution = {
    killerId,
    weapon: WEAPONS[Math.floor(Math.random() * WEAPONS.length)],
    roomIndex: Math.floor(Math.random() * ROOMS.length)
  };

  // 洗牌 0~8 房間索引，確保開局每位玩家各自在不同房間
  const roomPool = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const positions = {};
  const alive = {};
  const personalFeedback = {};
  const detectiveHistory = {};

  players.forEach((p, idx) => {
    positions[p.id] = roomPool[idx % 9];
    alive[p.id] = true;
    personalFeedback[p.id] = '🕵️ 案件剛發生！請點選相鄰房間移動並展開行動。';
    detectiveHistory[p.id] = [];
  });

  return {
    round: 1,
    killerId,
    solution,
    positions,
    alive,
    pendingActions: {}, // playerId -> { targetRoom, suspectId, weapon, targetVictimId }
    personalFeedback,
    detectiveHistory,
    publicLogs: ['🏰 莊園發生離奇命案！所有玩家已分散至不同房間，請開始第 1 回合行動。'],
    winner: null, // 'DETECTIVES' | 'KILLER'
    winningPlayerNames: [],
    winReason: ''
  };
}

function resolveTurn(state, players) {
  const aliveBefore = players.filter(p => state.alive[p.id]);

  // 1. 全員同步移動至目標相鄰房間
  aliveBefore.forEach(p => {
    const act = state.pendingActions[p.id];
    if (act && typeof act.targetRoom === 'number') {
      state.positions[p.id] = act.targetRoom;
    }
  });

  const killer = players.find(p => p.id === state.killerId);
  const killerAct = state.pendingActions[state.killerId];
  let killedPlayer = null;

  // 2. 第一順位：兇手落刀判定
  if (killer && killerAct) {
    const victim = players.find(p => p.id === killerAct.targetVictimId);
    const killerRoom = state.positions[killer.id];

    if (victim && victim.id !== killer.id && state.alive[victim.id] && state.positions[victim.id] === killerRoom) {
      state.alive[victim.id] = false;
      killedPlayer = victim;
      state.personalFeedback[killer.id] = `🗡️ 暗殺成功！你在【${ROOMS[killerRoom]}】解決了【${victim.name}】。`;
      state.personalFeedback[victim.id] = `💀 你在【${ROOMS[killerRoom]}】遭到兇手暗殺，已進入幽靈開圖模式！`;
      state.publicLogs.unshift(`🩸 第 ${state.round} 回合：慘叫聲響起！【${victim.name}】在【${ROOMS[killerRoom]}】遇害了！`);
    } else {
      const targetName = victim ? victim.name : '目標';
      state.personalFeedback[killer.id] = `💨 落刀撲空！【${targetName}】並不在【${ROOMS[killerRoom]}】（成功製造不在場證明）。`;
      state.publicLogs.unshift(`🌙 第 ${state.round} 回合：昨晚莊園風平浪靜，無人遇害。`);
    }
  }

  // 檢查兇手勝利條件：存活偵探人數 <= 兇手人數 (1人)
  const aliveDetectives = players.filter(p => p.id !== state.killerId && state.alive[p.id]);
  if (aliveDetectives.length <= 1) {
    state.winner = 'KILLER';
    state.winningPlayerNames = killer ? [killer.name] : [];
    state.winReason = '存活偵探人數已與兇手相同，偵探陣營無法阻止兇手，兇手獲勝！';
    state.publicLogs.unshift(`🩸 遊戲結束！${state.winReason}`);
    state.pendingActions = {};
    return;
  }

  // 3. 第二與第三順位：存活偵探的「同房感應提示」與「幾A幾B命中數」
  const aliveNow = players.filter(p => state.alive[p.id]);
  const roundWinners = [];

  aliveNow.forEach(p => {
    const myRoom = state.positions[p.id];
    const othersInSameRoom = aliveNow.filter(other => other.id !== p.id && state.positions[other.id] === myRoom);
    const sensorText = othersInSameRoom.length > 0
      ? `👁️ 感應：你剛才在【${ROOMS[myRoom]}】感覺到房間裡還有其他人，但看清是誰前對方就離開了！`
      : `🍃 感應：剛才【${ROOMS[myRoom]}】裡只有你一個人。`;

    if (p.id === state.killerId) {
      // 兇手也看得到同房是否有人
      state.personalFeedback[p.id] += `\n${sensorText}`;
      return;
    }

    // 偵探推理計算命中數
    const act = state.pendingActions[p.id];
    if (!act) return;

    let hits = 0;
    if (act.suspectId === state.solution.killerId) hits += 1;
    if (act.weapon === state.solution.weapon) hits += 1;
    if (myRoom === state.solution.roomIndex) hits += 1;

    const suspectObj = players.find(x => x.id === act.suspectId);
    const suspectName = suspectObj ? suspectObj.name : '未知';

    state.detectiveHistory[p.id].unshift({
      round: state.round,
      suspectName,
      weapon: act.weapon,
      roomName: ROOMS[myRoom],
      hits
    });

    state.personalFeedback[p.id] =
      `🔍 推理結果（${suspectName}／${act.weapon}／${ROOMS[myRoom]}）：命中【${hits} 個】線索！\n${sensorText}`;

    if (hits === 3) {
      roundWinners.push(p.name);
    }
  });

  if (roundWinners.length > 0) {
    state.winner = 'DETECTIVES';
    state.winningPlayerNames = roundWinners;
    state.winReason = `偵探【${roundWinners.join('、')}】同時鎖定全部真相，成功破案！`;
    state.publicLogs.unshift(`🏆 案件偵破！${state.winReason}`);
  } else {
    state.round += 1;
  }

  state.pendingActions = {};
}

function handleAction(state, playerId, players, action, payload = {}) {
  if (!players || players.length === 0) return state;
  if (action === 'RESTART') return initState(players);
  if (state.winner) return state;

  if (action === 'SUBMIT_TURN') {
    if (!state.alive[playerId]) return state;

    const currentRoom = state.positions[playerId];
    const targetRoom = Number(payload.targetRoom);
    if (!isAdjacent(currentRoom, targetRoom)) return state;

    if (playerId === state.killerId) {
      const targetVictimId = payload.targetVictimId;
      const victim = players.find(p => p.id === targetVictimId);
      if (!victim || victim.id === state.killerId || !state.alive[victim.id]) return state;

      state.pendingActions[playerId] = { targetRoom, targetVictimId };
    } else {
      const { suspectId, weapon } = payload;
      const suspectExists = players.some(p => p.id === suspectId);
      if (!suspectExists || !WEAPONS.includes(weapon)) return state;

      state.pendingActions[playerId] = { targetRoom, suspectId, weapon };
    }

    // 檢查所有存活玩家是否皆已送出本回合指令
    const alivePlayers = players.filter(p => state.alive[p.id]);
    const allSubmitted = alivePlayers.every(p => Boolean(state.pendingActions[p.id]));

    if (allSubmitted) {
      resolveTurn(state, players);
    }
    return state;
  }

  return state;
}

function getPublicState(state, players, viewerId) {
  const isKiller = viewerId === state.killerId;
  const isAlive = Boolean(state.alive[viewerId]);
  const isGhost = !isAlive;

  const killerObj = players.find(p => p.id === state.killerId);

  // 存活玩家看不到其他人的位置；死亡幽靈與遊戲結束後開啟全圖上帝視角（含紅色兇手標示）
  const canSeeAllMap = isGhost || Boolean(state.winner);

  const playerList = players.map(p => ({
    id: p.id,
    name: p.name,
    alive: Boolean(state.alive[p.id]),
    submitted: Boolean(state.pendingActions[p.id]),
    roomIndex: canSeeAllMap ? state.positions[p.id] : (p.id === viewerId ? state.positions[p.id] : null),
    isKiller: canSeeAllMap ? (p.id === state.killerId) : false
  }));

  return {
    rooms: ROOMS,
    weapons: WEAPONS,
    round: state.round,
    isKiller,
    isAlive,
    isGhost,
    myRoomIndex: state.positions[viewerId],
    mySubmittedAction: state.pendingActions[viewerId] || null,
    myFeedback: state.personalFeedback[viewerId] || '',
    myHistory: state.detectiveHistory[viewerId] || [],
    // 只有兇手在進行中看得到真相；結束後對全場公開
    solution: (isKiller || state.winner) ? {
      killerName: killerObj ? killerObj.name : '',
      weapon: state.solution.weapon,
      roomName: ROOMS[state.solution.roomIndex]
    } : null,
    players: playerList,
    publicLogs: state.publicLogs.slice(0, 20),
    winner: state.winner,
    winningPlayerNames: state.winningPlayerNames,
    winReason: state.winReason
  };
}

module.exports = { initState, handleAction, getPublicState };
