import { router, protectedProcedure } from '../trpc';
import { pool } from '../../db/pool';

export const walletRouter = router({
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const r = await pool.query(
      `SELECT id, balance_eur, updated_at FROM dc_wallets WHERE user_id = $1 LIMIT 1`,
      [ctx.userId]
    );
    if (r.rows.length === 0) {
      // auto-create wallet if missing
      const created = await pool.query(
        `INSERT INTO dc_wallets (user_id, balance_eur) VALUES ($1, 0)
         RETURNING id, balance_eur, updated_at`,
        [ctx.userId]
      );
      return created.rows[0];
    }
    return r.rows[0];
  }),
});
