/**
 * Standalone: reconectar BotPinta y BotDoble a la sala QJFP para que jueguen.
 */
const { io } = require('socket.io-client');
const http = require('http');

const BACKEND = 'http://localhost:3200';
const ROOM = 'QJFP';

function login(email, password) {
  const data = JSON.stringify({ email, password });
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST',
      hostname: 'localhost', port: 3200, path: '/auth/login',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(buf)) : reject(JSON.parse(buf)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function canPlayTile(tile, leftEnd, rightEnd) {
  if (leftEnd === null && rightEnd === null) return 'right';
  if (leftEnd !== null && (tile[0] === leftEnd || tile[1] === leftEnd)) return 'left';
  if (rightEnd !== null && (tile[0] === rightEnd || tile[1] === rightEnd)) return 'right';
  return false;
}

function makeBot(name, email, password) {
  const sock = io(BACKEND, { transports: ['websocket'], reconnection: false });
  let token = null;
  let userId = null;
  let lastState = null;

  sock.on('connect', () => {
    sock.on('connect', () => {});
  });

  return new Promise((resolve, reject) => {
    (async () => {
      const auth = await login(email, password);
      token = auth.access_token;
      userId = auth.user.id;

      sock.removeAllListeners('connect');
      sock.on('connect', () => {
        console.log(`[${name}] socket on, auth...`);
        sock.emit('auth', { token });
      });

      sock.on('auth:ok', async () => {
        console.log(`[${name}] auth OK userId=${userId}`);
        // unir al room
        const roomData = await new Promise((res) => {
          http.get(`${BACKEND}/domino/rooms/${ROOM}`, { headers: { Authorization: `Bearer ${token}` } }, (r) => {
            let buf = '';
            r.on('data', (c) => buf += c);
            r.on('end', () => res(JSON.parse(buf)));
          });
        });
        const roomId = roomData.room.id;
        sock.emit('domino:join', { roomId });
        resolve({ sock, name, token, userId, roomId });
      });

      sock.on('domino:state', (state) => {
        if (state.status !== 'playing') return;
        const me = state.players.find((p) => p.userId === userId);
        if (!me) return;
        const isMine = me.hand.some((t) => !(t[0] === 0 && t[1] === 0));
        if (!isMine) return;
        lastState = state;

        if (state.currentTurn !== me.position) return;

        // Decidir jugada
        const hand = me.hand.filter((t) => !(t[0] === 0 && t[1] === 0));
        let chosen = null;
        let side = null;
        const doubles = hand.filter((t) => t[0] === t[1]);
        const others = hand.filter((t) => t[0] !== t[1]);
        const ordered = [...doubles, ...others];
        for (const tile of ordered) {
          const s = canPlayTile(tile, state.leftEnd, state.rightEnd);
          if (s) {
            chosen = tile;
            side = s;
            break;
          }
        }
        setTimeout(() => {
          if (chosen) {
            console.log(`[${name}] juego ${chosen[0]}|${chosen[1]} en ${side} (mano: ${hand.length})`);
            sock.emit('domino:play', { tile: chosen, side });
          } else {
            console.log(`[${name}] paso (mano: ${hand.length}, ext ${state.leftEnd}-${state.rightEnd})`);
            sock.emit('domino:pass');
          }
        }, 700 + Math.random() * 400);
      });

      sock.on('domino:finished', (d) => {
        console.log(`[${name}] GAME FINISHED winner=${d.winnerPosition} tipo=${d.winType}`);
      });

      sock.on('error', (e) => console.log(`[${name}] err`, e.error || e));
    })();
  });
}

(async () => {
  console.log('[rejoin] conectando BotPinta + BotDoble a QJFP');

  const pinta = await makeBot('BotPinta', 'botpinta@bots.dominocito.local', 'DominoBot2026SecurePass');
  const doble = await makeBot('BotDoble', 'botdoble@bots.dominocito.local', 'DominoBot2026SecurePass');

  console.log('[rejoin] ambos conectados');

  process.on('SIGINT', () => {
    pinta.sock.disconnect();
    doble.sock.disconnect();
    process.exit(0);
  });
})().catch((e) => { console.error('[rejoin] FATAL', e); process.exit(1); });
