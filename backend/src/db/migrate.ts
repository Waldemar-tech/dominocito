import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');

  // Get all .sql files sorted by name (001_, 002_, etc.)
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    // Create migrations tracking table if needed
    await client.query(`
      CREATE TABLE IF NOT EXISTS dc_migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      // Check if already applied
      const check = await client.query(
        'SELECT id FROM dc_migrations WHERE filename = $1',
        [file]
      );
      if (check.rows.length > 0) {
        console.log(`⏭️  Skipping already-applied migration: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`🚀 Running migration: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO dc_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ Migration applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration failed: ${file}`, err);
        throw err;
      }
    }

    console.log('✅ All migrations completed');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
