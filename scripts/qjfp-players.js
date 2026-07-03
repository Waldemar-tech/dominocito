/**
 * Conecta los 3 bots a la sala QJFP y los deja jugar.
 * BotMula arranca la partida; los 3 juegan cuando les toca.
 */
const { io } = require('socket.io-client');
const http = require('http');

const BACKEND = 'http://localhost:3200';
const ROOM = 'QJFP';
const PASSWORD = 'DominoBot2026SecurePass';

function login(email) {
  const data = JSON.stringify({ email, password: PASSWORD });
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST', hostname: 'localhost', port: 3200, path: '/auth/login',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(buf)) : reject(new Error(`login: ${res.statusCode}`)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getRoom(token) {
  return new Promise((resolve, reject) => {
    http.get(`${BACKEND}/domino/rooms/${ROOM}`, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(buf)) : reject(new Error(`getRoom: ${res.statusCode}`)));
    }).on('error', reject);
  });
}

function canPlayTile(tile, leftEnd, rightEnd) {
  if (leftEnd === null && rightEnd === null) return 'right';
  if (leftEnd !== null && (tile[0] === leftEnd || tile[1] === leftEnd)) return 'left';
  if (rightEnd !== null && (tile[0] === rightEnd || tile[1] === rightEnd)) return 'right';
  return false;
}

function connectBot(name, email, isHost) {
  return new Promise((resolve, reject) => {
    (async () => {
      const auth = await login(email);
      const token = auth.access_token;
      const userId = auth.user.id;

      const sock = io(BACKEND, { transports: ['websocket'], reconnection: false });

      sock.once('connect', () => {
        console.log(`[${name}] socket conectado, auth...`);
        sock.emit('auth', { token });
      });

      sock.once('auth:ok', async () => {
        console.log(`[${name}] auth OK userId=${userId}`);
        const roomData = await getRoom(token);
        const roomId = roomData.room.id;
        sock.emit('domino:join', { roomId });
        resolve({ sock, name, token, userId, roomId });
      });

      sock.once('auth:error', (e) => reject(new Error(`auth err: ${e.error}`)));

      sock.on('domino:state', (state) => {
        if (state.status !== 'playing') return;
        const me = state.players.find((p) => p.userId === userId);
        if (!me) return;
        const isMine = me.hand.some((t) => !(t[0] === 0 && t[1] === 0));
        if (!isMine) return;
        if (state.currentTurn !== me.position) return;

        const hand = me.hand.filter((t) => !(t[0] === 0 && t[1] === 0));
        let chosen = null;
        let side = null;
        const doubles = hand.filter((t) => t[0] === t[1]);
        const others = hand.filter((t) => t[0] !== t[1]);
        for (const tile of [...doubles, ...others]) {
          const s = canPlayTile(tile, state.leftEnd, state.rightEnd);
          if (s) {
            chosen = tile;
            side = s;
            break;
          }
        }
        setTimeout(() => {
          if (chosen) {
            console.log(`[${name}] juega ${chosen[0]}|${chosen[1]} ${side} (mano ${hand.length})`);
            sock.emit('domino:play', { tile: chosen, side });
          } else {
            console.log(`[${name}] pasa (mano ${hand.length}, ext ${state.leftEnd}-${state.rightEnd})`);
            sock.emit('domino:pass');
          }
        }, 700 + Math.random() * 400);
      });

      sock.on('domino:finished', (d) => {
        console.log(`[${name}] 🏁 FINISHED winner=${d.winnerPosition} tipo=${d.winType} scores=${JSON.stringify(d.scores)}`);
      });
    })().catch(reject);
  });
}

(async () => {
  console.log('[main] conectando 3 bots a', ROOM);

  const [mula, pinta, doble] = await Promise.all([
    connectBot('BotMula', 'botmula@bots.dominocito.local'),
    connectBot('BotPinta', 'botpinta@bots.dominocito.local'),
    connectBot('BotDoble', 'botdoble@bots.dominocito.local'),
  ]);
  console.log('[main] los 3 bots autenticados y en el socket room');

  // Esperar 1s y arrancar
  await new Promise((r) => setTimeout(r, 1000));
  console.log('[main] BotMula emite domino:start');
  mula.sock.emit('domino:start');

  process.on('SIGINT', () => {
    mula.sock.disconnect(); pinta.sock.disconnect(); doble.sock.disconnect();
    process.exit(0);
  });
})().catch((e) => { console.error('[main] FATAL', e); process.exit(1); });
