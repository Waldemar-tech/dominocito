const { io } = require('socket.io-client');

(async () => {
  // Get token
  const loginRes = await fetch('http://localhost:3200/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waldobot@dominocito.local', password: 'Waldobot2026!' })
  });
  const login = await loginRes.json();
  const token = login.access_token;
  console.log('[waldobot] logged in, userId=' + login.user.id);

  // Find my room (UHP7)
  const roomsRes = await fetch('http://localhost:3200/domino/rooms/mine', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const rooms = await roomsRes.json();
  const myRoom = rooms.rooms.find(r => r.code === 'UHP7');
  console.log('[waldobot] found room:', myRoom.id, myRoom.code);

  // Connect socket
  const socket = io('http://localhost:3200', { transports: ['websocket'] });
  
  socket.on('connect', () => {
    console.log('[waldobot] socket connected, id=' + socket.id);
    socket.emit('auth', { token });
  });

  socket.on('auth:ok', (data) => {
    console.log('[waldobot] auth:ok, userId=' + data.userId);
    socket.emit('domino:join', { roomId: myRoom.id });
  });

  socket.on('domino:state', (state) => {
    console.log('[waldobot] domino:state received');
    console.log('  status=' + state.status + ', players=' + state.players.length);
    state.players.forEach(p => console.log('    pos=' + p.position + ' user=' + p.username + ' hand_size=' + (p.hand ? p.hand.length : 'n/a')));
    console.log('  board.length=' + state.board.length + ', currentTurn=' + state.currentTurn);
    console.log('  moves so far:');
    state.board.forEach((b, i) => console.log('    [' + i + '] ' + JSON.stringify(b.tile) + ' side=' + b.side + ' by userId=' + b.userId));
  });

  socket.on('domino:started', (data) => {
    console.log('[waldobot] *** DOMINO:STARTED ***');
    console.log('  initial state:', JSON.stringify(data.state, null, 2).slice(0, 800));
    process.exit(0);
  });

  socket.on('error', (err) => {
    console.error('[waldobot] error:', err);
  });

  socket.on('connect_error', (err) => {
    console.error('[waldobot] connect_error:', err.message);
  });

  // Wait for join to complete, then start
  setTimeout(() => {
    console.log('[waldobot] emitting domino:start');
    socket.emit('domino:start');
  }, 2000);

  setTimeout(() => {
    console.error('[waldobot] TIMEOUT');
    process.exit(1);
  }, 10000);
})();
