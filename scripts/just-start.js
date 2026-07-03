/**
 * Standalone: reconectar como BotMula a la sala QJFP y arrancar la partida.
 * Uso: node just-start.js
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
      hostname: 'localhost',
      port: 3200,
      path: '/auth/login',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        const body = JSON.parse(buf);
        if (res.statusCode !== 200) reject(body);
        else resolve(body);
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  console.log('[start] login como BotMula...');
  const { access_token, user } = await login('botmula@bots.dominocito.local', 'DominoBot2026SecurePass');
  console.log(`[start] login OK userId=${user.id}`);

  const socket = io(BACKEND, { transports: ['websocket'], reconnection: false });

  socket.on('connect', () => {
    console.log('[start] socket conectado, id=', socket.id);
    socket.emit('auth', { token: access_token });
  });

  socket.on('auth:ok', async (data) => {
    console.log('[start] auth OK', data);
    // Necesito roomId numérico
    const data2 = await new Promise((resolve) => {
      http.get(`${BACKEND}/domino/rooms/${ROOM}`, { headers: { Authorization: `Bearer ${access_token}` } }, (res) => {
        let buf = '';
        res.on('data', (c) => buf += c);
        res.on('end', () => resolve(JSON.parse(buf)));
      });
    });
    const roomId = data2.room.id;
    console.log(`[start] roomId=${roomId}, me uno al socket room`);
    socket.emit('domino:join', { roomId });
    setTimeout(() => {
      console.log('[start] emitiendo domino:start');
      socket.emit('domino:start');
    }, 500);
  });

  socket.on('auth:error', (e) => console.error('[start] auth error', e));
  socket.on('error', (e) => console.error('[start] error', e));
  socket.on('domino:state', (s) => {
    console.log(`[start] state: status=${s.status} turno=${s.currentTurn} tablero=${s.board.length} ext=${s.leftEnd}-${s.rightEnd}`);
  });
  socket.on('domino:started', (d) => {
    console.log('[start] GAME STARTED');
  });
  socket.on('domino:finished', (d) => {
    console.log(`[start] GAME FINISHED winner=${d.winnerPosition} tipo=${d.winType}`);
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[start] timeout 30s');
    process.exit(1);
  }, 30000);
})().catch((e) => {
  console.error('[start] FATAL', e);
  process.exit(1);
});
