const kingsCup = require('./kingsCup');
const clue = require('./clue');

const GAMES = {
  kingsCup: {
    id: 'kingsCup',
    name: "King's Cup",
    icon: '👑',
    tagline: '經典酒局翻牌・陪酒員與神經病',
    minPlayers: 1,
    maxPlayers: 20,
    module: kingsCup
  },
  clue: {
    id: 'clue',
    name: '妙探尋兇',
    icon: '🔍',
    tagline: '九宮格同步推理・潛伏暗殺與幽靈開圖',
    minPlayers: 4,
    maxPlayers: 9,
    module: clue
  }
};

function listGames() {
  return Object.values(GAMES).map(({ id, name, icon, tagline, minPlayers, maxPlayers }) => ({
    id,
    name,
    icon,
    tagline,
    minPlayers,
    maxPlayers
  }));
}

function getGame(gameId) {
  return GAMES[gameId] || GAMES.kingsCup;
}

module.exports = {
  listGames,
  getGame
};
