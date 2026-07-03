import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { pool } from '../../db/pool';

const CODE_REGEX = /^[A-Z0-9]{4}$/;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

const createRoomInput = z.object({
  isPrivate: z.boolean().optional().default(true),
  maxPlayers: z.union([z.literal(2), z.literal(4)]).optional().default(4),
});

const codeInput = z.object({ code: z.string().regex(CODE_REGEX).transform((v) => v.toUpperCase()) });

export const dominoRouter = router({
  listPublicRooms: protectedProcedure.query(async () => {
    const r = await pool.query(
      `SELECT id, code, host_user_id, max_players, status, created_at
       FROM dc_domino_rooms
       WHERE is_private = false AND status = 'waiting'
       ORDER BY created_at DESC LIMIT 50`
    );
    return r.rows;
  }),

  listMyRooms: protectedProcedure.query(async ({ ctx }) => {
    const r = await pool.query(
      `SELECT r.id, r.code, r.host_user_id, r.max_players, r.status, r.created_at
       FROM dc_domino_rooms r
       JOIN dc_domino_players p ON p.room_id = r.id
       WHERE p.user_id = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [ctx.userId]
    );
    return r.rows;
  }),

  getRoom: protectedProcedure.input(codeInput).query(async ({ input }) => {
    const r = await pool.query(
      `SELECT id, code, host_user_id, is_private, max_players, status, created_at
       FROM dc_domino_rooms WHERE code = $1 LIMIT 1`,
      [input.code]
    );
    if (r.rows.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Sala no encontrada' });
    }
    const players = await pool.query(
      `SELECT user_id, position, is_connected
       FROM dc_domino_players WHERE room_id = $1 ORDER BY position ASC`,
      [r.rows[0].id]
    );
    return { room: r.rows[0], players: players.rows };
  }),

  createRoom: protectedProcedure.input(createRoomInput).mutation(async ({ ctx, input }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let code: string | null = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generateRoomCode();
        const existing = await client.query(
          `SELECT 1 FROM dc_domino_rooms WHERE code = $1`,
          [candidate]
        );
        if (existing.rows.length === 0) { code = candidate; break; }
      }
      if (!code) {
        await client.query('ROLLBACK');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'No se pudo generar código' });
      }
      const roomResult = await client.query(
        `INSERT INTO dc_domino_rooms (code, host_user_id, is_private, max_players, status)
         VALUES ($1, $2, $3, $4, 'waiting')
         RETURNING id, code, host_user_id, is_private, max_players, status, created_at`,
        [code, ctx.userId, input.isPrivate, input.maxPlayers]
      );
      const room = roomResult.rows[0];
      await client.query(
        `INSERT INTO dc_domino_players (room_id, user_id, position, is_connected)
         VALUES ($1, $2, 0, true)`,
        [room.id, ctx.userId]
      );
      await client.query('COMMIT');
      return room;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error creando sala' });
    } finally {
      client.release();
    }
  }),

  joinRoom: protectedProcedure.input(codeInput).mutation(async ({ ctx, input }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roomR = await client.query(
        `SELECT id, max_players, status FROM dc_domino_rooms WHERE code = $1 FOR UPDATE`,
        [input.code]
      );
      if (roomR.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sala no encontrada' });
      }
      const room = roomR.rows[0];
      if (room.status !== 'waiting') {
        await client.query('ROLLBACK');
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La sala no está abierta' });
      }
      const playersR = await client.query(
        `SELECT user_id, position FROM dc_domino_players WHERE room_id = $1 FOR UPDATE`,
        [room.id]
      );
      const already = playersR.rows.find((p: { user_id: number }) => p.user_id === ctx.userId);
      if (already) {
        await client.query('COMMIT');
        return { room, rejoined: true };
      }
      if (playersR.rows.length >= room.max_players) {
        await client.query('ROLLBACK');
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sala llena' });
      }
      const usedPositions = new Set(playersR.rows.map((p: { position: number }) => p.position));
      let position = -1;
      for (let i = 0; i < room.max_players; i++) {
        if (!usedPositions.has(i)) { position = i; break; }
      }
      await client.query(
        `INSERT INTO dc_domino_players (room_id, user_id, position, is_connected)
         VALUES ($1, $2, $3, true)`,
        [room.id, ctx.userId, position]
      );
      await client.query('COMMIT');
      return { room, rejoined: false };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof TRPCError) throw err;
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error uniéndose a sala' });
    } finally {
      client.release();
    }
  }),

  leaveRoom: protectedProcedure.input(codeInput).mutation(async ({ ctx, input }) => {
    const r = await pool.query(
      `DELETE FROM dc_domino_players
       WHERE user_id = $1 AND room_id = (SELECT id FROM dc_domino_rooms WHERE code = $2)`,
      [ctx.userId, input.code]
    );
    return { left: r.rowCount ?? 0 };
  }),
});
