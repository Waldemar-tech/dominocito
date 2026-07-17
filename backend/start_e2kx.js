const { io } = require('socket.io-client');
(async () => {
  const login = await (await fetch('http://localhost:3200/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waldobot@dominocito.local', password: 'Waldobot2026!' })
  })).json();
  const token = login.access_token;
  const rooms = await (await fetch('http://localhost:3200/domino/rooms/mine', {
    headers: { 'Authorization': '***' + token }
  })).json();
  const room = rooms.rooms.find(r => r.code === 'E2KX');
  console.log('[waldobot] room:', room.id, room.code, 'players:', room.player_count);

  const sock = io('http://localhost:3200', { transports: ['websocket'] });
  sock.on('connect', () => sock.emit('auth', { token }));
  sock.on('auth:ok', () => {
    sock.emit('domino:join', { roomId: room.id });
    setTimeout(() => sock.emit('domino:start'), 1500);
  });
  sock.on('domino:started', (data) => {
    const me = data.state.players.find(p => p.userId === 50);
    console.log('[waldobot] *** PARTIDA INICIADA ***');
    console.log('  mi mano:', JSON.stringify(me?.hand));
    console.log('  turno inicial (position):', data.state.currentTurn);
    data.state.players.forEach(p => console.log('  player pos=' + p.position + ' user=' + p.username));
    process.exit(0);
  });
  sock.on('error', e => { console.error('[waldobot] error:', e); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
})();
