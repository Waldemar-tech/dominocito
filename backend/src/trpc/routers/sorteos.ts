import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { pool } from '../../db/pool';
import { DOMINO_PIECES } from '../../types';
import { getPublicKeyPem } from '../../crypto/signing';

function enrichSorteo(sorteo: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...sorteo };
  if (typeof sorteo.winner_domino_id === 'number') {
    result.winner_domino = DOMINO_PIECES[sorteo.winner_domino_id];
  }
  if (typeof sorteo.mult_x50_domino_id === 'number') {
    result.mult_x50_domino = DOMINO_PIECES[sorteo.mult_x50_domino_id];
  }
  if (typeof sorteo.mult_x100_domino_id === 'number') {
    result.mult_x100_domino = DOMINO_PIECES[sorteo.mult_x100_domino_id];
  }
  return result;
}

export const sorteosRouter = router({
  publicKey: publicProcedure.query(() => {
    return { publicKey: getPublicKeyPem() };
  }),

  current: publicProcedure.query(async () => {
    const r = await pool.query(
      `SELECT * FROM dc_sorteos WHERE status IN ('open','betting') ORDER BY created_at DESC LIMIT 1`
    );
    if (r.rows.length === 0) return null;
    return enrichSorteo(r.rows[0]);
  }),

  getById: publicProcedure
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const r = await pool.query(`SELECT * FROM dc_sorteos WHERE id = $1 LIMIT 1`, [input.id]);
      if (r.rows.length === 0) return null;
      return enrichSorteo(r.rows[0]);
    }),

  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional().default(20) }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 20;
      const r = await pool.query(
        `SELECT * FROM dc_sorteos ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
      return r.rows.map((row: Record<string, unknown>) => enrichSorteo(row));
    }),
});
