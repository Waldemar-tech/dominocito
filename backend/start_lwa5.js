const { io } = require('socket.io-client');
(async () => {
  const login = await (await fetch('http://localhost:3200/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waldobot@dominocito.local', password: 'Waldobot2026!' })
  })).json();
  const token = login.access_token;

  const rooms = await (await fetch('http://localhost:3200/domino/rooms/mine', {
    headers: { 'Authorization': 'Bearer ' + token }
  })).json();
  const room = rooms.rooms.find(r => r.code === 'LWA5');
  console.log('[waldobot] room:', room.id, room.code, 'players:', room.player_count);

  const sock = io('http://localhost:3200', { transports: ['websocket'] });
  sock.on('connect', () => sock.emit('auth', { token }));
  sock.on('auth:ok', () => {
    console.log('[waldobot] auth ok, joining room', room.id);
    sock.emit('domino:join', { roomId: room.id });
    setTimeout(() => {
      console.log('[waldobot] emitting domino:start');
      sock.emit('domino:start');
    }, 1500);
  });
  sock.on('domino:started', (data) => {
    console.log('[waldobot] *** PARTIDA INICIADA ***');
    console.log('  mi mano:', JSON.stringify(data.state.players.find(p => p.userId === 50)?.hand));
    console.log('  turno:', data.state.currentTurn);
    process.exit(0);
  });
  sock.on('error', e => { console.error('[waldobot] error:', e); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
})();
