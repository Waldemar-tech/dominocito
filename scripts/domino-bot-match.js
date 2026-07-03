/**
 * Dominó Bot Match — Juega una partida 1v1 con bots controlados.
 *
 * Crea 4 bots (registra + login), los conecta por Socket.IO, crea una sala
 * pública con maxPlayers=2, une a los 2 primeros, y deja que los bots jueguen
 * automáticamente. También acepta --vs-human para jugar contra Waldemar:
 *   - Crea 3 bots + deja que el humano cree/unirse a la sala.
 *
 * Uso:
 *   node domino-bot-match.js                       # 2 bots entre sí (2P)
 *   node domino-bot-match.js --vs-human           # 3 bots + 1 slot libre
 *   node domino-bot-match.js --count 4            # 4 bots (full mesa)
 *   node domino-bot-match.js --watch              # solo log, no crear bots
 */

const { io } = require('socket.io-client');
const http = require('http');

const BACKEND = 'http://localhost:3200';
const BOT_PASSWORD = 'DominoBot2026SecurePass';
const BOT_NAMES = ['BotMula', 'BotPinta', 'BotDoble', 'BotTranca'];
const SPEED_MS = 700; // delay entre jugadas para que se vea fluido

// ─── Helpers ────────────────────────────────────────────────
function httpJson(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Bot class ──────────────────────────────────────────────
class Bot {
  constructor(name, idx) {
    this.name = name;
    this.idx = idx;
    this.userId = null;
    this.username = null;
    this.token = null;
    this.socket = null;
    this.roomId = null;
    this.roomCode = null;
    this.myPosition = null;
    this.lastState = null;
    this.log = (...args) =>
      console.log(`[${this.name}]`, ...args);
  }

  async register() {
    const email = `${this.name.toLowerCase()}@bots.dominocito.local`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await httpJson('POST', '/auth/register', {
        username: this.name,
        email,
        password: BOT_PASSWORD,
      });
      if (res.status === 201) {
        this.log('registrado, userId=', res.body.user.id);
        return res.body.user;
      }
      if (res.status === 400 && /ya está|already|existe/i.test(JSON.stringify(res.body))) {
        this.log('ya existía, intento login');
        return null;
      }
      if (res.status === 429) {
        this.log(`rate-limit en register, reintento en 8s (attempt ${attempt + 1}/3)`);
        await sleep(8000);
        continue;
      }
      this.log('register status', res.status, res.body?.error || '');
      return null;
    }
    this.log('register: agotados los reintentos');
    return null;
  }

  async login() {
    const email = `${this.name.toLowerCase()}@bots.dominocito.local`;
    const res = await httpJson('POST', '/auth/login', {
      email,
      password: BOT_PASSWORD,
    });
    if (res.status !== 200) {
      throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    this.token = res.body.access_token;
    this.userId = res.body.user.id;
    this.username = res.body.user.username;
    this.log('login OK, userId=', this.userId);
  }

  connectSocket() {
    return new Promise((resolve, reject) => {
      this.socket = io(BACKEND, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      this.socket.on('connect', () => {
        this.log('socket conectado, id=', this.socket.id);
        this.socket.emit('auth', { token: this.token });
      });

      this.socket.on('auth:ok', (data) => {
        this.log('auth OK', data);
        resolve();
      });

      this.socket.on('auth:error', (err) => {
        reject(new Error(`auth error: ${err.error}`));
      });

      this.socket.on('connect_error', (err) => reject(err));

      this.socket.on('domino:state', (state) => {
        this.onState(state);
      });

      this.socket.on('domino:started', (data) => {
        this.log('GAME STARTED');
      });

      this.socket.on('domino:finished', (data) => {
        const winner = data.winnerPosition;
        const me = this.myPosition;
        const won = winner === me;
        this.log(`GAME FINISHED — winner pos=${winner} (yo=${me}) → ${won ? 'GANÉ 🏆' : 'Perdí'}`);
        this.log(`tipo: ${data.winType}, scores:`, data.scores);
      });

      this.socket.on('error', (err) => {
        this.log('ERROR', err);
      });

      this.socket.on('domino:player_joined', (data) => {
        this.log('player_joined', data);
      });

      this.socket.on('domino:turn_timeout', (data) => {
        this.log('turn_timeout', data);
      });

      setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    });
  }

  async createRoom(maxPlayers = 2, isPrivate = false) {
    const res = await httpJson(
      'POST',
      '/domino/rooms',
      { isPrivate, maxPlayers },
      { Authorization: `Bearer ${this.token}` }
    );
    if (res.status !== 201) {
      throw new Error(`createRoom failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    this.roomId = res.body.room.id;
    this.roomCode = res.body.room.code;
    this.myPosition = 0;
    this.log(`sala creada code=${this.roomCode} roomId=${this.roomId}`);
    return this.roomId;
  }

  async joinRoom(code) {
    const res = await httpJson(
      'POST',
      `/domino/rooms/${code}/join`,
      {},
      { Authorization: `Bearer ${this.token}` }
    );
    if (res.status !== 201 && res.status !== 200) {
      throw new Error(`joinRoom failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    this.roomId = res.body.roomId;
    this.myPosition = res.body.position;
    this.log(`unido a ${code} pos=${this.myPosition}`);
    return this.roomId;
  }

  socketJoinRoom() {
    this.socket.emit('domino:join', { roomId: this.roomId });
  }

  startGame() {
    this.log('emito domino:start');
    this.socket.emit('domino:start');
  }

  onState(state) {
    if (state.status !== 'playing') {
      this.log(`state status=${state.status}, ignoro`);
      return;
    }

    // ⚠️ BUG del server: emite el estado N veces (1 por jugador) en vez de filtrar
    // por socket. Para cada player p, llama getSafeState(state, p.userId) → broadcast
    // a todo el room. Resultado: recibimos N estados, solo uno tiene NUESTRA mano real.
    // Filtro: el estado correcto es aquel donde mi mano NO son placeholders [0,0].
    const myPlayer = state.players.find((p) => p.userId === this.userId);
    if (!myPlayer) {
      this.log('onState: no me encuentro en players');
      return;
    }

    const isMine = myPlayer.hand.some((t) => !(t[0] === 0 && t[1] === 0));
    if (!isMine) return; // este estado es para otro viewer, ignoro

    this.lastState = state;
    this.log(
      `state recibido: turno=${state.currentTurn} miPos=${myPlayer.position} ` +
      `mano=${myPlayer.hand.length} tablero=${state.board.length} ext=${state.leftEnd}-${state.rightEnd}`
    );

    if (state.currentTurn !== myPlayer.position) return;

    // Mi turno: decidir jugada
    const myHand = myPlayer.hand;
    sleep(SPEED_MS + Math.random() * 400).then(() => this.takeTurn(state, myHand));
  }

  // ─── Estrategia simple: jugar la primera ficha válida, o pasar ───
  takeTurn(state, myHand) {
    const left = state.leftEnd;
    const right = state.rightEnd;

    // Defend in depth: si por algún bug llegan placeholders, filtrarlos
    const realHand = myHand.filter((t) => !(t[0] === 0 && t[1] === 0));
    if (realHand.length === 0) {
      this.log('mano vacía o solo placeholders, paso');
      this.socket.emit('domino:pass');
      return;
    }

    // Buscar ficha que se pueda jugar
    let chosen = null;
    let chosenSide = null;

    // Estrategia: preferir jugar dobles primero (son más restrictivos)
    const doubles = realHand.filter((t) => t[0] === t[1]);
    const others = realHand.filter((t) => t[0] !== t[1]);
    const ordered = [...doubles, ...others];

    for (const tile of ordered) {
      if (left === null && right === null) {
        // ⚠️ WORKAROUND bug del server: primera ficha, playTile() rechaza
        // cualquier lado porque leftEnd/rightEnd son null. Pero el engine
        // llama whoStarts() y se sabe que alguien arranca. Probamos ambos lados.
        chosen = tile;
        chosenSide = 'left';
        break;
      }
      // Intentar izquierda
      if (left !== null && (tile[0] === left || tile[1] === left)) {
        chosen = tile;
        chosenSide = 'left';
        break;
      }
      // Intentar derecha
      if (right !== null && (tile[0] === right || tile[1] === right)) {
        chosen = tile;
        chosenSide = 'right';
        break;
      }
    }

    if (chosen) {
      this.log(`juego ${chosen[0]}|${chosen[1]} en ${chosenSide} (mano: ${realHand.length})`);
      this.socket.emit('domino:play', { tile: chosen, side: chosenSide });
    } else {
      this.log(`paso turno (mano: ${realHand.length}, extremos ${left}-${right})`);
      this.socket.emit('domino:pass');
    }
  }
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const vsHuman = args.includes('--vs-human');
  const countIdx = args.indexOf('--count');
  const count = countIdx > -1 ? parseInt(args[countIdx + 1], 10) : (vsHuman ? 3 : 2);
  const botNames = BOT_NAMES.slice(0, count);

  console.log(`\n🎲 Dominó Bot Match — ${count} bots (${vsHuman ? 'vs humano' : 'bot-vs-bot'})\n`);

  // 1. Registrar y loguear todos los bots
  const bots = [];
  for (let i = 0; i < botNames.length; i++) {
    const bot = new Bot(botNames[i], i);
    bots.push(bot);
    await bot.register();
    await sleep(200);
    await bot.login();
    await sleep(200);
  }

  // 2. Conectar sockets
  for (const bot of bots) {
    await bot.connectSocket();
    await sleep(150);
  }

  // 3. Bot 0 crea sala
  //   vs-human (3 bots) → mesa 4P, los 3 bots se unen, 1 slot libre
  //   --count 2          → mesa 2P, 1 bot se une
  //   --count 4          → mesa 4P, 3 bots se unen
  const maxPlayers = bots.length === 2 && !vsHuman ? 2 : 4;
  await bots[0].createRoom(maxPlayers, false);
  await sleep(300);
  bots[0].socketJoinRoom();
  await sleep(300);

  // 4. Otros bots se unen
  for (let i = 1; i < bots.length; i++) {
    // vs-human con 3 bots: los 3 se unen, el humano completa
    await bots[i].joinRoom(bots[0].roomCode);
    await bots[i].connectSocket().catch(() => {});
    await sleep(150);
    bots[i].socketJoinRoom();
    await sleep(200);
  }

  // 5. Esperar un poco y arrancar
  await sleep(500);
  if (!vsHuman) {
    bots[0].startGame();
  } else {
    console.log(`\n[MAIN] Modo vs-human: NO arranco todavía.`);
    console.log(`[MAIN] Esperando 4 jugadores en sala ${bots[0].roomCode}...`);
    console.log(`[MAIN] Polling cada 2s. Cuando se llene, arranco automáticamente.\n`);

    // Polling: arrancar cuando se llene la mesa
    const token = bots[0].token;
    const checkFull = async () => {
      try {
        const res = await httpJson(
          'GET',
          `/domino/rooms/${bots[0].roomCode}`,
          null,
          { Authorization: `Bearer ${token}` }
        );
        if (res.status === 200) {
          const room = res.body.room;
          const n = (room.players || []).length;
          process.stdout.write(`\r[POLL] mesa ${bots[0].roomCode}: ${n}/${room.max_players} jugadores   `);
          if (n >= room.max_players && room.status === 'waiting') {
            console.log(`\n[POLL] Mesa llena. Arrancando partida...`);
            bots[0].startGame();
            return true;
          }
        }
      } catch (e) {}
      return false;
    };

    const interval = setInterval(async () => {
      const done = await checkFull();
      if (done) clearInterval(interval);
    }, 2000);
  }

  // Si vs humano, mostrar info
  if (vsHuman) {
    console.log(`\n[INFO] Sala pública creada: ${bots[0].roomCode}`);
    console.log('[INFO] Slots libres: 1 (para que entres tú)');
    console.log('[INFO] Entra desde el frontend y únete con el código\n');
  }

  // Mantener vivo
  console.log('\n[MAIN] Bots corriendo. Ctrl+C para salir.\n');
  process.on('SIGINT', () => {
    console.log('\n[MAIN] Cerrando sockets...');
    for (const bot of bots) {
      try { bot.socket.disconnect(); } catch (e) {}
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[MAIN] FATAL:', err);
  process.exit(1);
});