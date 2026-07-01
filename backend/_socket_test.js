const { Client } = require('pg');
(async () => {
  // Intentar conexión por socket UNIX (Postgres.app default)
  const c = new Client({
    host: '/tmp',
    port: 5432,
    user: 'waldobotbot',
    database: 'waldobotbot',
  });
  try {
    await c.connect();
    const r = await c.query('SELECT current_user, current_database()');
    console.log('OK socket:', r.rows[0]);
  } catch (e) {
    console.log('FAIL socket:', e.message);
  }
})();
