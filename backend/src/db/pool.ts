import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || '10.1.30.50',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'DESARROLLO_DEVELOPERS_UTF8',
  user: process.env.DB_USER || 'main',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected successfully');
  } finally {
    client.release();
  }
}
