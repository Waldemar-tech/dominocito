import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { pool } from '../../db/pool';
import { JwtPayload } from '../../types';
import { encrypt, hashForLookup, isEncryptionConfigured } from '../../crypto/encryption';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCESS_TOKEN_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN || '900');
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7');

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
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO dc_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

const registerInput = z.object({
  username: z.string().regex(USERNAME_RE, 'Username inválido'),
  email: z.string().email().max(320).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(200),
});

const loginInput = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const authRouter = router({
  register: publicProcedure
    .input(registerInput)
    .mutation(async ({ input }) => {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const client = await pool.connect();
      try {
        const emailHash = isEncryptionConfigured() ? hashForLookup(input.email) : null;
        let encryptedEmail: string | null = null;
        let emailIv: string | null = null;
        let emailTag: string | null = null;
        if (isEncryptionConfigured()) {
          const enc = encrypt(input.email);
          encryptedEmail = enc.ciphertext;
          emailIv = enc.iv;
          emailTag = enc.tag;
        }
        await client.query('BEGIN');
        const existing = await client.query(
          `SELECT 1 FROM dc_users WHERE username = $1 LIMIT 1`,
          [input.username]
        );
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          throw new TRPCError({ code: 'CONFLICT', message: 'Username ya registrado' });
        }
        const insertResult = await client.query(
          `INSERT INTO dc_users (username, email, email_iv, email_tag, email_hash, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, username, email, created_at`,
          [input.username, encryptedEmail ?? input.email, emailIv, emailTag, emailHash, passwordHash]
        );
        const user = insertResult.rows[0];
        // create wallet
        await client.query(`INSERT INTO dc_wallets (user_id, balance_eur) VALUES ($1, 0)`, [user.id]);
        // tokens
        const accessToken = generateAccessToken(user.id, input.email, user.username);
        const refresh = generateRefreshToken();
        await storeRefreshToken(client, user.id, refresh.hash);
        await client.query('COMMIT');
        return {
          accessToken,
          refreshToken: refresh.token,
          user: { id: user.id, username: user.username, email: input.email },
        };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al registrar' });
      } finally {
        client.release();
      }
    }),

  login: publicProcedure
    .input(loginInput)
    .mutation(async ({ input }) => {
      const emailHash = isEncryptionConfigured() ? hashForLookup(input.email) : null;
      const result = await pool.query(
        `SELECT id, username, password_hash FROM dc_users
         WHERE ${emailHash ? 'email_hash = $1' : 'email = $1'} LIMIT 1`,
        [emailHash ?? input.email]
      );
      if (result.rows.length === 0) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Credenciales inválidas' });
      }
      const user = result.rows[0];
      const ok = await bcrypt.compare(input.password, user.password_hash);
      if (!ok) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Credenciales inválidas' });
      }
      const accessToken = generateAccessToken(user.id, input.email, user.username);
      const refresh = generateRefreshToken();
      const client = await pool.connect();
      try {
        await storeRefreshToken(client, user.id, refresh.hash);
      } finally {
        client.release();
      }
      return {
        accessToken,
        refreshToken: refresh.token,
        user: { id: user.id, username: user.username, email: input.email },
      };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const result = await pool.query(
      `SELECT id, username, email, created_at FROM dc_users WHERE id = $1 LIMIT 1`,
      [ctx.userId]
    );
    if (result.rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
    }
    return result.rows[0];
  }),
});
