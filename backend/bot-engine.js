/**
 * Dominócito Bot Engine
 * Conecta bot1, bot2, bot3 vía socket y juega automáticamente.
 * Estrategia: juega la primera ficha válida. Si no puede, pasa.
 * Uso: node bot-engine.js <roomId> <roomCode>
 */

const http = require('http');
const { io } = require('socket.io-client');

const BACKEND = 'http://localhost:3200';
const BOTS = [
  { email: 'bot1@dominocito.local', password: 'bot2026', name: 'bot1' },
  { email: 'bot2@dominocito.local', password: 'bot2026', name: 'bot2' },
  { email: 'bot3@dominocito.local', password: 'bot2026', name: 'bot3' },
];

const roomId = parseInt(process.argv[2]);
const roomCode = process.argv[3];

if (!roomId || !roomCode) {
  console.error('Uso: node bot-engine.js <roomId> <roomCode>');
  process.exit(1);
}

function httpPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ host: 'localhost', port: 3200, path, method: 'POST', headers }, (res) => {
      let raw = ''; res.on('data', d => raw += d); res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function canPlayTile(tile, leftEnd, rightEnd) {
  if (leftEnd === null && rightEnd === null) return 'left';
  if (leftEnd !== null && tile[0] === leftEnd) return 'left';
  if (leftEnd !== null && tile[1] === leftEnd) return 'left';
  if (rightEnd !== null && tile[0] === rightEnd) return 'right';
  if (rightEnd !== null && tile[1] === rightEnd) return 'right';
  return false;
}

function chooseTile(hand, leftEnd, rightEnd, board) {
  // Estrategia: si es primera ficha, jugar el doble más alto
  if (board.length === 0) {
    const doubles = hand.filter(t => t[0] === t[1]).sort((a, b) => b[0] - a[0]);
    if (doubles.length > 0) return { tile: doubles[0], side: 'left' };
    // No tiene doble, jugar la más alta
    const sorted = [...hand].sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]));
    return { tile: sorted[0], side: 'left' };
  }

  // Buscar ficha jugable con mayor valor
  const playable = [];
  for (const tile of hand) {
    const side = canPlayTile(tile, leftEnd, rightEnd);
    if (side) playable.push({ tile, side });
  }
  if (playable.length === 0) return null;

  // Preferir dobles, luego mayor suma
  playable.sort((a, b) => {
    const aDouble = a.tile[0] === a.tile[1] ? 1 : 0;
    const bDouble = b.tile[0] === b.tile[1] ? 1 : 0;
    if (aDouble !== bDouble) return bDouble - aDouble;
    return (b.tile[0] + b.tile[1]) - (a.tile[0] + a.tile[1]);
  });

  return playable[0];
}

async function runBot(botConfig) {
  // Login
  const loginRes = await httpPost('/auth/login', { email: botConfig.email, password: botConfig.password });
  const token = loginRes.access_token;
  if (!token) { console.log(`[${botConfig.name}] Login fail:`, JSON.stringify(loginRes)); return; }
  console.log(`[${botConfig.name}] Login OK`);

  let myUserId = null;
  let myState = null;
  let thinkTimeout = null;

  const socket = io(BACKEND, { transports: ['websocket'] });

  function playTurn(state) {
    if (!myUserId) return;
    const me = state.players.find(p => p.userId === myUserId);
    if (!me) return;
    if (state.currentTurn !== me.position) return; // no es mi turno

    const move = chooseTile(me.hand, state.leftEnd, state.rightEnd, state.board);

    // Delay humano: 1-2.5 segundos
    const delay = 1000 + Math.random() * 1500;
    clearTimeout(thinkTimeout);
    thinkTimeout = setTimeout(() => {
      if (move) {
        console.log(`[${botConfig.name}] Jugando [${move.tile[0]}|${move.tile[1]}] -> ${move.side}`);
        socket.emit('domino:play', { tile: move.tile, side: move.side });
      } else {
        console.log(`[${botConfig.name}] Pasando turno`);
        socket.emit('domino:pass');
      }
    }, delay);
  }

  socket.on('connect', () => {
    console.log(`[${botConfig.name}] Conectado, autenticando...`);
    socket.emit('auth', { token });
  });

  socket.on('auth:ok', (d) => {
    myUserId = d.userId;
    console.log(`[${botConfig.name}] Auth OK userId:${myUserId}, uniéndome a sala ${roomId}`);
    socket.emit('domino:join', { roomId });
  });

  socket.on('domino:state', (state) => {
    myState = state;
    const me = state.players.find(p => p.userId === myUserId);
    if (me && state.currentTurn === me.position && state.status === 'playing') {
      console.log(`[${botConfig.name}] Mi turno, tengo ${me.hand.length} fichas`);
      playTurn(state);
    }
  });

  socket.on('domino:started', (d) => {
    myState = d.state;
    console.log(`[${botConfig.name}] Partida iniciada`);
    playTurn(d.state);
  });

  socket.on('domino:finished', (d) => {
    clearTimeout(thinkTimeout);
    console.log(`[${botConfig.name}] Partida terminada. Ganador pos:${d.winnerPosition} tipo:${d.winType}`);
  });

  socket.on('error', (e) => console.log(`[${botConfig.name}] Error:`, JSON.stringify(e)));
  socket.on('connect_error', (e) => console.log(`[${botConfig.name}] Conn error:`, e.message));
  socket.on('disconnect', () => console.log(`[${botConfig.name}] Desconectado`));

  return socket;
}

async function main() {
  console.log(`Bot Engine iniciando para sala ${roomCode} (id:${roomId})`);
  for (const bot of BOTS) {
    await new Promise(r => setTimeout(r, 500)); // stagger conexiones
    runBot(bot).catch(e => console.error(e.message));
  }
  console.log('Todos los bots conectados. Ctrl+C para detener.');
}

main();
