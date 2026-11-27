const RULES = {
  'A': { title: 'Waterfall (瀑布)', desc: '由抽牌者開始喝，每喝一口全員喝一口，最多可以喝完一整杯！' },
  '2': { title: '找人對喝', desc: '指定現場一個人陪你乾一杯！' },
  '3': { title: '自己喝', desc: '抽牌者自己喝一口！' },
  '4': { title: '所有女生喝', desc: '現場全體女性一起喝一口！' },
  '5': { title: '我從來沒有', desc: '說一件自己沒做過的事，做過的人喝；如果全場都沒做過，抽牌者自己喝！' },
  '6': { title: '所有男生喝', desc: '現場全體男性一起喝一口！' },
  '7': { title: '天堂牌', desc: '所有人立刻舉手指向天空！最慢指的人喝！' },
  '8': { title: '陪酒員', desc: '這張牌留在你身上！直到下一張 8 出現前，任何人喝酒都可以抓你陪喝！' },
  '9': { title: '真心話', desc: '問在場任何一個人問題，對方若不願回答，必須喝完手上一整杯！' },
  '10': { title: '在場所有人喝', desc: '全體乾杯！大家一起喝一口！' },
  'J': { title: 'Make a Rule', desc: '訂立一個本場遊戲的專屬規則，直到下一張 J 出現覆蓋前皆有效！' },
  'Q': { title: '神經病', desc: '這張牌留在你身上！直到下一張 Q 出現前，任何人跟你講話就必須喝！' },
  'K': { title: "King's Cup", desc: '前 3 張在公杯倒酒，抽到第 4 張的人喝完公杯所有酒！' }
};

const SUITS = [
  { sym: '♠', isRed: false },
  { sym: '♥', isRed: true },
  { sym: '♦', isRed: true },
  { sym: '♣', isRed: false }
];

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createShuffledDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ rank: r, suit: s.sym, isRed: s.isRed });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function initState() {
  return {
    deck: createShuffledDeck(),
    turnIndex: 0,
    drawId: 0,
    currentCard: null,
    kingsDrawn: 0,
    status: { drinker: '無', crazy: '無', rule: '無' },
    pendingRuleInput: false,
    isGameOver: false
  };
}

function handleAction(state, playerId, players, action, payload = {}) {
  if (!players || players.length === 0) return state;
  if (action === 'RESTART') return initState();

  const safeTurnIndex = state.turnIndex % players.length;
  const currentPlayer = players[safeTurnIndex];

  if (action === 'DRAW_CARD') {
    if (state.isGameOver || state.pendingRuleInput) return state;
    if (currentPlayer.id !== playerId || state.deck.length === 0) return state;

    const card = state.deck.pop();
    const rule = RULES[card.rank];

    state.drawId += 1;
    state.currentCard = {
      ...card,
      ruleTitle: rule.title,
      ruleDesc: rule.desc,
      drawerId: currentPlayer.id,
      drawerName: currentPlayer.name
    };

    if (card.rank === '8') state.status.drinker = currentPlayer.name;
    else if (card.rank === 'Q') state.status.crazy = currentPlayer.name;

    if (card.rank === 'K') {
      state.kingsDrawn += 1;
      if (state.kingsDrawn >= 4) {
        state.isGameOver = true;
        return state;
      }
    }

    if (card.rank === 'J') {
      state.pendingRuleInput = true;
    } else {
      state.turnIndex = (safeTurnIndex + 1) % players.length;
    }
    return state;
  }

  if (action === 'SUBMIT_RULE') {
    if (!state.pendingRuleInput || !state.currentCard || state.currentCard.drawerId !== playerId) return state;
    const cleanRule = (payload.ruleText || '').trim();
    state.status.rule = cleanRule || '（未命名規則）';
    state.pendingRuleInput = false;
    state.turnIndex = (safeTurnIndex + 1) % players.length;
    return state;
  }

  return state;
}

function getPublicState(state, players) {
  const safeTurnIndex = players.length > 0 ? state.turnIndex % players.length : 0;
  return {
    remainingCount: state.deck.length,
    turnPlayerId: players[safeTurnIndex] ? players[safeTurnIndex].id : null,
    turnPlayerName: players[safeTurnIndex] ? players[safeTurnIndex].name : '',
    drawId: state.drawId,
    currentCard: state.currentCard,
    kingsDrawn: state.kingsDrawn,
    status: state.status,
    pendingRuleInput: state.pendingRuleInput,
    isGameOver: state.isGameOver
  };
}

module.exports = { initState, handleAction, getPublicState };
