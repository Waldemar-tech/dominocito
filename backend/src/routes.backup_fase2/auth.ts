import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiter';
import { AuthRequest, JwtPayload } from '../types';
import { encrypt, decrypt, hashForLookup, isEncryptionConfigured } from '../crypto/encryption';

const router = Router();

// ─── Constants ────────────────────────────────────────────────
const ACCESS_TOKEN_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN || '900'); // 15 min
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7');

// ─── Input sanitization helpers ──────────────────────────────

function sanitizeText(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function sanitizeEmail(value: unknown): string | null {
  const text = sanitizeText(value, 320);
  if (!text) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(text)) return null;
  return text.toLowerCase();
}

function sanitizeUsername(value: unknown): string | null {
  const text = sanitizeText(value, 50);
  if (!text) return null;
  const usernameRegex = /^[a-zA-Z0-9_-]{3,50}$/;
  if (!usernameRegex.test(text)) return null;
  return text;
}

// ─── Token generation helpers ─────────────────────────────────

function generateAccessToken(userId: number, email: string, username: string): string {
  const secret = process.env.JWT_SECRET as string;
  const payload: JwtPayload = { userId, email, username };
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

async function storeRefreshToken(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  userId: number,
  tokenHash: string
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

  await client.query(
    `INSERT INTO dc_refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );
}

// ─── Email encryption helpers ─────────────────────────────────

/** Store encrypted email in dc_users. Returns fields to save. */
function encryptEmail(email: string): {
  emailForDb: string;
  emailIv: string | null;
  emailTag: string | null;
  emailHash: string;
} {
  const emailHash = hashForLookup(email);

  if (isEncryptionConfigured()) {
    const enc = encrypt(email);
    return {
      emailForDb: enc.ciphertext,
      emailIv: enc.iv,
      emailTag: enc.tag,
      emailHash,
    };
  }

  // Fallback: store plaintext when encryption not configured (dev mode)
  return { emailForDb: email, emailIv: null, emailTag: null, emailHash };
}

/** Decrypt email from dc_users row. */
function decryptEmail(row: {
  email: string;
  email_iv: string | null;
  email_tag: string | null;
}): string {
  if (row.email_iv && row.email_tag && isEncryptionConfigured()) {
    try {
      return decrypt(row.email, row.email_iv, row.email_tag);
    } catch {
      return '[encrypted]';
    }
  }
  return row.email; // plaintext fallback
}

// ─── Routes ──────────────────────────────────────────────────

// POST /auth/register
router.post('/register', registerLimiter, async (req: Request, res: Response): Promise<void> => {
  const username = sanitizeUsername(req.body.username);
  const email = sanitizeEmail(req.body.email);
  const password = req.body.password;

  if (!username) {
    res.status(400).json({ error: 'username inválido. Solo letras, números, guiones y guiones bajos (3-50 caracteres).' });
    return;
  }

  if (!email) {
    res.status(400).json({ error: 'email inválido' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'password es requerido' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    return;
  }

  if (password.length > 128) {
    res.status(400).json({ error: 'La contraseña es demasiado larga' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const emailHash = hashForLookup(email);

    // Check duplicates via email_hash and username
    const existing = await client.query(
      'SELECT id FROM dc_users WHERE email_hash = $1 OR username = $2',
      [emailHash, username]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email o username ya registrado' });
      return;
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Encrypt email
    const { emailForDb, emailIv, emailTag } = encryptEmail(email);

    // Create user
    const userResult = await client.query(
      `INSERT INTO dc_users (username, email, email_iv, email_tag, email_hash, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, created_at`,
      [username, emailForDb, emailIv, emailTag, emailHash, password_hash]
    );
    const user = userResult.rows[0];

    // Create wallet
    await client.query(
      'INSERT INTO dc_wallets (user_id, balance_eur) VALUES ($1, 50.00)',
      [user.id]
    );

    // Generate tokens
    const accessToken = generateAccessToken(user.id, email, user.username);
    const { token: refreshToken, hash: refreshHash } = generateRefreshToken();
    await storeRefreshToken(client as Parameters<typeof storeRefreshToken>[0], user.id, refreshHash);

    await client.query('COMMIT');

    res.status(201).json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_EXPIRES_IN,
      user: {
        id: user.id,
        username: user.username,
        email,           // return plaintext to caller
        created_at: user.created_at,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Register error:', (err as Error).message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  } finally {
    client.release();
  }
});

// POST /auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const email = sanitizeEmail(req.body.email);
  const password = req.body.password;

  if (!email) {
    res.status(400).json({ error: 'email inválido' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'password es requerido' });
    return;
  }

  if (password.length > 128) {
    res.status(400).json({ error: 'Credenciales inválidas' });
    return;
  }

  try {
    const emailHash = hashForLookup(email);

    // Look up by email_hash (works whether email is encrypted or not)
    const result = await pool.query(
      'SELECT id, username, email, email_iv, email_tag, password_hash FROM dc_users WHERE email_hash = $1',
      [emailHash]
    );

    // Timing-safe: always run bcrypt even if user not found
    const DUMMY_HASH = '$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxxxx';
    const hash = result.rows.length > 0 ? result.rows[0].password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hash);

    if (result.rows.length === 0 || !valid) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const user = result.rows[0];
    const plainEmail = decryptEmail(user);

    // Generate new token pair
    const accessToken = generateAccessToken(user.id, plainEmail, user.username);
    const { token: refreshToken, hash: refreshHash } = generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await pool.query(
      `INSERT INTO dc_refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, refreshHash, expiresAt.toISOString()]
    );

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_EXPIRES_IN,
      user: {
        id: user.id,
        username: user.username,
        email: plainEmail,
      },
    });
  } catch (err) {
    console.error('Login error:', (err as Error).message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// POST /auth/refresh — Refresh token rotation
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;

  if (!refresh_token || typeof refresh_token !== 'string') {
    res.status(400).json({ error: 'refresh_token es requerido' });
    return;
  }

  if (refresh_token.length > 200) {
    res.status(400).json({ error: 'refresh_token inválido' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up token — lock row for atomic rotation
    const tokenResult = await client.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
              u.username, u.email, u.email_iv, u.email_tag
       FROM dc_refresh_tokens rt
       JOIN dc_users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      res.status(401).json({ error: 'Refresh token inválido' });
      return;
    }

    const tokenRow = tokenResult.rows[0];

    // Check if revoked (token reuse attack detection)
    if (tokenRow.revoked) {
      // SECURITY: If a revoked token is used, revoke ALL tokens for this user
      // (indicates token theft — both attacker and legitimate user must re-login)
      await client.query(
        'UPDATE dc_refresh_tokens SET revoked = TRUE WHERE user_id = $1',
        [tokenRow.user_id]
      );
      await client.query('COMMIT');
      res.status(401).json({ error: 'Refresh token revocado. Por seguridad, inicie sesión nuevamente.' });
      return;
    }

    // Check expiry
    if (new Date(tokenRow.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      res.status(401).json({ error: 'Refresh token expirado. Inicie sesión nuevamente.' });
      return;
    }

    // Revoke old token (rotation)
    await client.query(
      'UPDATE dc_refresh_tokens SET revoked = TRUE WHERE id = $1',
      [tokenRow.id]
    );

    // Generate new token pair
    const plainEmail = decryptEmail(tokenRow);
    const newAccessToken = generateAccessToken(tokenRow.user_id, plainEmail, tokenRow.username);
    const { token: newRefreshToken, hash: newRefreshHash } = generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await client.query(
      `INSERT INTO dc_refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [tokenRow.user_id, newRefreshHash, expiresAt.toISOString()]
    );

    await client.query('COMMIT');

    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: ACCESS_TOKEN_EXPIRES_IN,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Refresh error:', (err as Error).message);
    res.status(500).json({ error: 'Error al refrescar token' });
  } finally {
    client.release();
  }
});

// POST /auth/logout — Revoke refresh token
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { refresh_token } = req.body;

  if (!refresh_token || typeof refresh_token !== 'string') {
    // Logout without refresh token: just acknowledge (access token expires naturally)
    res.json({ message: 'Sesión cerrada' });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

    await pool.query(
      `UPDATE dc_refresh_tokens
       SET revoked = TRUE
       WHERE token_hash = $1 AND user_id = $2`,
      [tokenHash, req.user!.id]
    );

    res.json({ message: 'Sesión cerrada correctamente' });
  } catch (err) {
    console.error('Logout error:', (err as Error).message);
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
});

// GET /auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.email_iv, u.email_tag, u.created_at,
              w.balance_eur
       FROM dc_users u
       LEFT JOIN dc_wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const row = result.rows[0];
    const plainEmail = decryptEmail(row);

    res.json({
      id: row.id,
      username: row.username,
      email: plainEmail,
      created_at: row.created_at,
      balance_eur: row.balance_eur,
    });
  } catch (err) {
    console.error('Me error:', (err as Error).message);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

export default router;
