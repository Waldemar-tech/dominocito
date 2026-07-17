const { io } = require('socket.io-client');

(async () => {
  const loginRes = await fetch('http://localhost:3200/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waldobot@dominocito.local', password: 'Waldobot2026!' })
  });
  const login = await loginRes.json();
  const token = login.access_token;

  const socket = io('http://localhost:3200', { transports: ['websocket'] });
  
  socket.on('connect', () => {
    console.log('[waldobot] socket connected');
    socket.emit('auth', { token });
  });

  socket.on('auth:ok', () => {
    console.log('[waldobot] auth ok, joining room 35');
    socket.emit('domino:join', { roomId: 35 });
  });

  socket.on('domino:state', (state) => {
    console.log('[waldobot] STATE: status=' + state.status + ', board.length=' + state.board.length + ', currentTurn=' + state.currentTurn + ', leftEnd=' + state.leftEnd + ', rightEnd=' + state.rightEnd);
    if (state.board.length > 0) {
      console.log('  last move: ' + JSON.stringify(state.board[state.board.length-1]));
    }
  });

  socket.on('error', (err) => {
    console.error('[waldobot] error:', err);
  });

  // Wait join, then play double-6
  setTimeout(() => {
    console.log('[waldobot] playing [6,6] (doble más alto)');
    socket.emit('domino:play', { tile: [6, 6], side: 'left' });
  }, 2500);
})();
