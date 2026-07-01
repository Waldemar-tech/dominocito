const { Client } = require('pg');
(async () => {
  // Probar conexión como superuser (Postgres.app usualmente deja trust en localhost)
  for (const cfg of [
    { user: 'postgres', password: '', database: 'postgres' },
    { user: 'waldobotbot', password: '', database: 'postgres' },
    { user: 'postgres', database: 'postgres' },
  ]) {
    const c = new Client({ host: 'localhost', port: 5432, ...cfg });
    try {
      await c.connect();
      const r = await c.query('SELECT current_user, version()');
      console.log('OK:', cfg, '→', r.rows[0]);
      await c.end();
      return;
    } catch (e) {
      console.log('FAIL:', cfg.user, '→', e.message.split('\n')[0]);
    }
  }
})();
