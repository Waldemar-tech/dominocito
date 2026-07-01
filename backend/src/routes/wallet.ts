import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { AuthRequest } from '../types';
import { decrypt, isEncryptionConfigured } from '../crypto/encryption';

const router = Router();

// ─── Constants ────────────────────────────────────────────────
const DEPOSIT_MAX_EUR = 1000.00;

// ─── Helper: decrypt transaction description ──────────────────
function decryptDesc(row: { descripcion: string | null; desc_iv: string | null; desc_tag: string | null }): string | null {
  if (!row.descripcion) return null;
  if (row.desc_iv && row.desc_tag && isEncryptionConfigured()) {
    try {
      return decrypt(row.descripcion, row.desc_iv, row.desc_tag);
    } catch {
      return '[descripción cifrada]';
    }
  }
  return row.descripcion; // plaintext fallback
}

// ─── GET /wallet ──────────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.balance_eur, w.updated_at
       FROM dc_wallets w
       WHERE w.user_id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Wallet no encontrada' });
      return;
    }

    const wallet = result.rows[0];

    // Fetch last 20 transactions with desc columns
    const txResult = await pool.query(
      `SELECT id, tipo, amount_eur, descripcion, desc_iv, desc_tag, created_at
       FROM dc_wallet_transactions
       WHERE wallet_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [wallet.id]
    );

    const transactions = txResult.rows.map((t: { descripcion: string | null; desc_iv: string | null; desc_tag: string | null; id: number; tipo: string; amount_eur: number; created_at: Date }) => ({
      id: t.id,
      tipo: t.tipo,
      amount_eur: t.amount_eur,
      descripcion: decryptDesc(t),
      created_at: t.created_at,
    }));

    res.json({
      id: wallet.id,
      balance_eur: wallet.balance_eur,
      updated_at: wallet.updated_at,
      recent_transactions: transactions,
    });
  } catch (err) {
    console.error('Wallet error:', (err as Error).message);
    res.status(500).json({ error: 'Error al obtener wallet' });
  }
});

// ─── POST /wallet/add ─────────────────────────────────────────
router.post('/add', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const testingMode = process.env.TESTING_MODE === 'true';
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (!testingMode || nodeEnv === 'production') {
    res.status(403).json({
      error: 'Este endpoint solo está disponible en modo testing',
      hint: 'Use una pasarela de pago real en producción',
    });
    return;
  }

  const { amount_eur } = req.body;

  if (amount_eur === undefined || amount_eur === null) {
    res.status(400).json({ error: 'amount_eur es requerido' });
    return;
  }

  const rawAmount = parseFloat(amount_eur);
  if (isNaN(rawAmount) || !isFinite(rawAmount) || rawAmount <= 0) {
    res.status(400).json({ error: 'amount_eur debe ser un número positivo' });
    return;
  }

  const amount = parseFloat(rawAmount.toFixed(2));

  if (amount > DEPOSIT_MAX_EUR) {
    res.status(400).json({ error: `El depósito máximo en modo testing es €${DEPOSIT_MAX_EUR.toFixed(2)}` });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const walletResult = await client.query(
      'SELECT id, balance_eur FROM dc_wallets WHERE user_id = $1 FOR UPDATE',
      [req.user!.id]
    );

    if (walletResult.rows.length === 0) {
      res.status(404).json({ error: 'Wallet no encontrada' });
      return;
    }

    const wallet = walletResult.rows[0];
    const newBalance = parseFloat(wallet.balance_eur) + amount;

    await client.query(
      'UPDATE dc_wallets SET balance_eur = $1, updated_at = NOW() WHERE id = $2',
      [newBalance.toFixed(2), wallet.id]
    );

    // Store transaction — desc is plaintext in testing mode (no user-sensitive data)
    const desc = `Depósito testing €${amount.toFixed(2)}`;
    await client.query(
      `INSERT INTO dc_wallet_transactions (wallet_id, tipo, amount_eur, descripcion)
       VALUES ($1, 'deposito', $2, $3)`,
      [wallet.id, amount.toFixed(2), desc]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Saldo agregado correctamente (modo testing)',
      balance_eur: newBalance.toFixed(2),
      deposited_eur: amount.toFixed(2),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add funds error:', (err as Error).message);
    res.status(500).json({ error: 'Error al agregar saldo' });
  } finally {
    client.release();
  }
});

export default router;
