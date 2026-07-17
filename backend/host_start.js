const { io } = require('socket.io-client');
(async () => {
  const login = await (await fetch('http://localhost:3200/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'waldobot@dominocito.local', password: 'Waldobot2026!' })
  })).json();
  const sock = io('http://localhost:3200', { transports: ['websocket'] });
  sock.on('connect', () => sock.emit('auth', { token: login.access_token }));
  sock.on('auth:ok', () => {
    console.log('[host] joining room 35');
    sock.emit('domino:join', { roomId: 35 });
    setTimeout(() => {
      console.log('[host] starting game');
      sock.emit('domino:start');
    }, 1000);
  });
  sock.on('domino:started', () => { console.log('[host] game started'); setTimeout(() => process.exit(0), 500); });
  sock.on('error', (e) => console.error('[host] err:', e));
  setTimeout(() => process.exit(1), 8000);
})();
