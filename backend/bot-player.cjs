/**
 * Bot player - automatiza bots para probar el juego completo
 * Usage: node bot-player.cjs [--code ROOM] [--bot bot_neil] [--once]
 */
const {io} = require('socket.io-client');

const ROOM_CODE = process.argv.find(a => a.startsWith('--code='))?.split('=')[1] || 'B869';
const BOT_NAME = process.argv.find(a => a.startsWith('--bot='))?.split('=')[1] || 'bot_neil';
const ONCE = process.argv.includes('--once');

const BOT_PASSWORD = 'BotPass1234!';
const BOT_EMAIL = `${BOT_NAME}@dominocito.test`;

let socket = null;
let myUserId = null;
let gameState = null;

async function login() {
  const r = await fetch('http://localhost:3200/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: BOT_EMAIL, password: BOT_PASSWORD})
  });
  const j = await r.json();
  if (!j.access_token) { console.error('login fail:', j); process.exit(1); }
  myUserId = j.user.id;
  console.log(`[${BOT_NAME}] login ok, user.id=${myUserId}`);
  return j.access_token;
}

async function getRoomId(token) {
  const r = await fetch(`http://localhost:3200/domino/rooms/${ROOM_CODE}`, {
    headers: {Authorization: `Bearer ${token}`}
  });
  const j = await r.json();
  return j.room?.id;
}

function connectSocket(token, roomId) {
  socket = io('http://localhost:3200', {auth: {token}, transports: ['websocket']});

  socket.on('connect', () => {
    console.log(`[${BOT_NAME}] socket connected`);
    socket.emit('auth', {token});
  });

  socket.on('auth:ok', () => {
    console.log(`[${BOT_NAME}] auth ok, joining room ${roomId}`);
    socket.emit('domino:join', {roomId});
  });

  socket.on('auth:error', d => console.log(`[${BOT_NAME}] auth error`, d));

  socket.on('domino:state', state => {
    gameState = state;
    console.log(`[${BOT_NAME}] state: status=${state.status}, my turn=${isMyTurn(state)}, board=${state.board.length} tiles, hand=${getMyHand(state)?.length || 0}`);
    if (state.status === 'playing' && isMyTurn(state)) {
      setTimeout(() => playBest(state), 800 + Math.random() * 1200);
    } else if (state.status === 'finished') {
      console.log(`[${BOT_NAME}] GAME OVER: winner pos=${state.winnerPosition}, winType=${state.winType}`);
      if (ONCE) {
        setTimeout(() => process.exit(0), 1000);
      }
    }
  });

  socket.on('domino:started', () => console.log(`[${BOT_NAME}] game started!`));
  socket.on('domino:player_joined', d => console.log(`[${BOT_NAME}] player joined`, d));
  socket.on('domino:player_left', d => console.log(`[${BOT_NAME}] player left`, d));
  socket.on('error', d => console.log(`[BOT ERR]`, d));
}

function isMyTurn(state) {
  const me = state.players.find(p => p.userId === myUserId);
  return me && state.currentTurn === me.position;
}

function getMyHand(state) {
  return state.players.find(p => p.userId === myUserId)?.hand;
}

function findBestPlay(state) {
  const hand = getMyHand(state);
  if (!hand || hand.length === 0) return null;

  // Si tablero vacío, jugar la ficha más alta (suma de pips)
  if (state.board.length === 0) {
    const sorted = [...hand].sort((a, b) => (b[0]+b[1]) - (a[0]+a[1]));
    return {tile: sorted[0], side: 'right'};  // side no importa
  }

  // Si solo tengo un lado disponible, jugar ahí
  // Prioridad: jugar ficha más alta que encaje
  const leftEnd = state.leftEnd;
  const rightEnd = state.rightEnd;
  
  const playable = hand.filter(t => {
    const [a, b] = t;
    return a === leftEnd || b === leftEnd || a === rightEnd || b === rightEnd;
  });

  if (playable.length === 0) {
    return {pass: true};
  }

  // Jugar la de mayor suma
  playable.sort((a, b) => (b[0]+b[1]) - (a[0]+a[1]));
  const chosen = playable[0];
  const [a, b] = chosen;
  
  // Decidir lado: si solo encaja en uno, ese. Si encaja en ambos, ver puntos en mano
  const encajaIzq = a === leftEnd || b === leftEnd;
  const encajaDer = a === rightEnd || b === rightEnd;
  
  let side;
  if (encajaIzq && !encajaDer) side = 'left';
  else if (encajaDer && !encajaIzq) side = 'right';
  else {
    // Ambos lados: preferir el que tenga el mismo número (reducir opciones del oponente)
    // Simple: ir al lado que menos opciones deja
    side = Math.random() < 0.5 ? 'left' : 'right';
  }
  
  return {tile: chosen, side};
}

function playBest(state) {
  const play = findBestPlay(state);
  if (play.pass) {
    console.log(`[${BOT_NAME}] passing...`);
    socket.emit('domino:pass');
  } else {
    console.log(`[${BOT_NAME}] playing ${play.tile[0]}-${play.tile[1]} to ${play.side}`);
    socket.emit('domino:play', play);
  }
}

(async () => {
  const token = await login();
  const roomId = await getRoomId(token);
  if (!roomId) { console.error('room not found:', ROOM_CODE); process.exit(1); }
  console.log(`[${BOT_NAME}] room ${ROOM_CODE} = id ${roomId}`);
  connectSocket(token, roomId);
})();
