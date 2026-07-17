const { io } = require('socket.io-client');
(async () => {
  const login = await (await fetch('http://localhost:3200/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waldobot@dominocito.local', password: 'Waldobot2026!' })
  })).json();
  const sock = io('http://localhost:3200', { transports: ['websocket'] });
  sock.on('connect', () => sock.emit('auth', { token: login.access_token }));
  sock.on('auth:ok', () => sock.emit('domino:join', { roomId: 35 }));
  sock.on('domino:state', (s) => {
    console.log('=== STATE para waldobot (viewer) ===');
    console.log('status:', s.status, 'board.length:', s.board.length, 'currentTurn:', s.currentTurn);
    console.log('leftEnd:', s.leftEnd, 'rightEnd:', s.rightEnd);
    console.log('players:');
    s.players.forEach(p => console.log('  pos=' + p.position + ' user=' + p.username + ' hand_size=' + (p.hand ? p.hand.length : 'n/a') + ' hand=' + JSON.stringify(p.hand)));
    console.log('board:');
    s.board.forEach((b, i) => console.log('  [' + i + '] ' + JSON.stringify(b.tile) + ' side=' + b.side + ' userId=' + b.userId));
    setTimeout(() => process.exit(0), 100);
  });
})();
