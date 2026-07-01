const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: '10.101.20.2', port: 5432,
    user: 'dominocito', password: 'DcLottopro2026',
    database: 'dominocito',
  });
  await c.connect();
  
  // Verificar sequences
  const seqs = await c.query(`
    SELECT sequence_name, last_value 
    FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  `);
  console.log('Sequences:');
  for (const s of seqs.rows) console.log(`  ${s.sequence_name} = ${s.last_value}`);
  
  // Max IDs en tablas
  const tables = ['dc_users', 'dc_wallets', 'dc_sorteos', 'dc_bets', 'dc_wallet_transactions', 'dc_banca_log', 'dc_refresh_tokens'];
  for (const t of tables) {
    const r = await c.query(`SELECT MAX(id) as max_id FROM ${t}`);
    console.log(`  ${t}.id max = ${r.rows[0].max_id}`);
  }
  
  await c.end();
})().catch(e => console.error('FAIL:', e.message));
