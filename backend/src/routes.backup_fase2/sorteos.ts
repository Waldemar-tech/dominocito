import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { betLimiter } from '../middleware/rateLimiter';
import { AuthRequest, DOMINO_PIECES } from '../types';
import { encrypt, decrypt, isEncryptionConfigured } from '../crypto/encryption';
import { getPublicKeyPem, verifyResultSignature } from '../crypto/signing';

const router = Router();

// ─── Constants ────────────────────────────────────────────────
const BET_MIN_EUR = 0.25;
const BET_MAX_EUR = 25.00;

// ─── Helper: enrich sorteo with domino labels ─────────────────
function enrichSorteo(sorteo: Record<string, unknown>) {
  const result = { ...sorteo };
  if (sorteo.winner_domino_id !== null && sorteo.winner_domino_id !== undefined) {
    result.winner_domino = DOMINO_PIECES[sorteo.winner_domino_id as number];
  }
  if (sorteo.mult_x50_domino_id !== null && sorteo.mult_x50_domino_id !== undefined) {
    result.mult_x50_domino = DOMINO_PIECES[sorteo.mult_x50_domino_id as number];
  }
  if (sorteo.mult_x100_domino_id !== null && sorteo.mult_x100_domino_id !== undefined) {
    result.mult_x100_domino = DOMINO_PIECES[sorteo.mult_x100_domino_id as number];
  }
  return result;
}

// ─── GET /public-key — ECDSA public key for signature verification ─────────────
router.get('/public-key', (_req: Request, res: Response): void => {
  try {
    const pubKey = getPublicKeyPem();
    res.json({
      algorithm: 'ECDSA P-256',
      public_key_pem: pubKey,
      usage: 'Use this key to verify sorteo result signatures at GET /sorteos/:id/verify',
    });
  } catch (err) {
    console.error('Public key error:', (err as Error).message);
    res.status(503).json({ error: 'Clave pública no disponible aún' });
  }
});

// ─── GET /sorteos/current ─────────────────────────────────────
router.get('/current', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT s.*,
              COALESCE((SELECT SUM(b.amount_eur) FROM dc_bets b WHERE b.sorteo_id = s.id), 0) AS total_apostado,
              COALESCE((SELECT COUNT(*) FROM dc_bets b WHERE b.sorteo_id = s.id), 0) AS total_apuestas
       FROM dc_sorteos s
       WHERE s.status = 'open'
       ORDER BY s.created_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No hay sorteo activo actualmente' });
      return;
    }

    const sorteo = result.rows[0];
    const betsResult = await pool.query(
      `SELECT domino_id, SUM(amount_eur) as total_apostado, COUNT(*) as num_apuestas
       FROM dc_bets WHERE sorteo_id = $1
       GROUP BY domino_id ORDER BY domino_id`,
      [sorteo.id]
    );

    // Don't expose server_seed (only hash is public before reveal)
    const { server_seed: _ss, ...safeSorteo } = sorteo;

    res.json({
      ...enrichSorteo(safeSorteo),
      apuestas_por_ficha: betsResult.rows.map((r: Record<string, unknown>) => ({
        ...r,
        domino_label: DOMINO_PIECES[r.domino_id as number]?.label,
      })),
    });
  } catch (err) {
    console.error('Current sorteo error:', (err as Error).message);
    res.status(500).json({ error: 'Error al obtener sorteo actual' });
  }
});

// ─── GET /sorteos/:id ─────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const sorteoId = parseInt(req.params.id);
  if (isNaN(sorteoId) || sorteoId <= 0) {
    res.status(400).json({ error: 'ID de sorteo inválido' });
    return;
  }

  try {
    const sorteoResult = await pool.query(
      'SELECT * FROM dc_sorteos WHERE id = $1',
      [sorteoId]
    );

    if (sorteoResult.rows.length === 0) {
      res.status(404).json({ error: 'Sorteo no encontrado' });
      return;
    }

    const sorteo = sorteoResult.rows[0];

    const betsResult = await pool.query(
      `SELECT b.domino_id, SUM(b.amount_eur) as total_apostado, COUNT(*) as num_apuestas
       FROM dc_bets b
       WHERE b.sorteo_id = $1
       GROUP BY b.domino_id
       ORDER BY b.domino_id`,
      [sorteoId]
    );

    const totalResult = await pool.query(
      'SELECT SUM(amount_eur) as total, SUM(win_amount_eur) as total_premios FROM dc_bets WHERE sorteo_id = $1',
      [sorteoId]
    );

    // Only expose server_seed after reveal (provably fair)
    const publicSorteo: Record<string, unknown> = { ...sorteo };
    if (sorteo.status !== 'revealed') {
      delete publicSorteo.server_seed; // Keep secret until reveal
    }

    res.json({
      ...enrichSorteo(publicSorteo),
      apuestas_por_ficha: betsResult.rows.map((r: Record<string, unknown>) => ({
        ...r,
        domino_label: DOMINO_PIECES[r.domino_id as number]?.label,
      })),
      total_apostado: totalResult.rows[0]?.total || 0,
      total_premios_pagados: totalResult.rows[0]?.total_premios || 0,
    });
  } catch (err) {
    console.error('Sorteo detail error:', (err as Error).message);
    res.status(500).json({ error: 'Error al obtener sorteo' });
  }
});

// ─── GET /sorteos/:id/verify — ECDSA signature verification ──
router.get('/:id/verify', async (req: Request, res: Response): Promise<void> => {
  const sorteoId = parseInt(req.params.id);
  if (isNaN(sorteoId) || sorteoId <= 0) {
    res.status(400).json({ error: 'ID de sorteo inválido' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT id, status, winner_domino_id, mult_x50_domino_id, mult_x100_domino_id,
              server_seed, server_seed_hash, client_seed, result_signature, revealed_at
       FROM dc_sorteos WHERE id = $1`,
      [sorteoId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Sorteo no encontrado' });
      return;
    }

    const sorteo = result.rows[0];

    if (sorteo.status !== 'revealed') {
      res.status(400).json({ error: 'El sorteo aún no ha sido revelado. Verification disponible después de revelar.' });
      return;
    }

    let publicKeyPem: string;
    try {
      publicKeyPem = getPublicKeyPem();
    } catch {
      res.status(503).json({ error: 'Clave pública no disponible' });
      return;
    }

    // Reconstruct the signed message
    const signedMessage = `${sorteo.id}|${sorteo.winner_domino_id}|${sorteo.mult_x50_domino_id}|${sorteo.mult_x100_domino_id}|${sorteo.server_seed}|${sorteo.revealed_at?.toISOString ? sorteo.revealed_at.toISOString() : sorteo.revealed_at}`;

    const signatureValid = sorteo.result_signature
      ? verifyResultSignature(signedMessage, sorteo.result_signature, publicKeyPem)
      : false;

    res.json({
      sorteo_id: sorteo.id,
      status: 'revealed',
      result: {
        winner: {
          domino_id: sorteo.winner_domino_id,
          domino_label: DOMINO_PIECES[sorteo.winner_domino_id]?.label,
        },
        mult_x50: {
          domino_id: sorteo.mult_x50_domino_id,
          domino_label: DOMINO_PIECES[sorteo.mult_x50_domino_id]?.label,
        },
        mult_x100: {
          domino_id: sorteo.mult_x100_domino_id,
          domino_label: DOMINO_PIECES[sorteo.mult_x100_domino_id]?.label,
        },
      },
      provably_fair: {
        server_seed: sorteo.server_seed,
        server_seed_hash: sorteo.server_seed_hash,
        client_seed: sorteo.client_seed,
        verification_steps: [
          '1. Verify: SHA-256(server_seed) === server_seed_hash',
          '2. combined = SHA-256(server_seed + client_seed + sorteo_id)',
          '3. winner = BigUInt64(combined[0..8]) % 28, etc.',
        ],
      },
      ecdsa: {
        signature: sorteo.result_signature,
        signed_message: signedMessage,
        public_key_pem: publicKeyPem,
        signature_valid: signatureValid,
        algorithm: 'ECDSA P-256 / SHA256',
      },
    });
  } catch (err) {
    console.error('Verify error:', (err as Error).message);
    res.status(500).json({ error: 'Error al verificar sorteo' });
  }
});

// ─── POST /sorteos/bet ────────────────────────────────────────
router.post('/bet', requireAuth, betLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const { sorteo_id, domino_id, amount_eur, client_seed } = req.body;

  // ── Validate sorteo_id ──
  const sorteoId = parseInt(sorteo_id);
  if (isNaN(sorteoId) || sorteoId <= 0) {
    res.status(400).json({ error: 'sorteo_id inválido' });
    return;
  }

  // ── Validate domino_id ──
  const dominoId = parseInt(domino_id);
  if (isNaN(dominoId) || dominoId < 0 || dominoId > 27) {
    res.status(400).json({ error: 'domino_id debe estar entre 0 y 27' });
    return;
  }

  // ── Validate amount_eur ──
  if (amount_eur === undefined || amount_eur === null) {
    res.status(400).json({ error: 'amount_eur es requerido' });
    return;
  }

  const rawAmount = parseFloat(amount_eur);
  if (isNaN(rawAmount) || !isFinite(rawAmount)) {
    res.status(400).json({ error: 'amount_eur debe ser un número válido' });
    return;
  }

  const amount = parseFloat(rawAmount.toFixed(2));

  if (amount < BET_MIN_EUR) {
    res.status(400).json({ error: `La apuesta mínima es €${BET_MIN_EUR.toFixed(2)}` });
    return;
  }

  if (amount > BET_MAX_EUR) {
    res.status(400).json({ error: `La apuesta máxima es €${BET_MAX_EUR.toFixed(2)}` });
    return;
  }

  // ── Validate optional client_seed ──
  let sanitizedClientSeed: string | null = null;
  if (client_seed !== undefined && client_seed !== null) {
    if (typeof client_seed !== 'string' || client_seed.length > 128) {
      res.status(400).json({ error: 'client_seed debe ser un string de máximo 128 caracteres' });
      return;
    }
    sanitizedClientSeed = client_seed.trim() || null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Lock and verify sorteo ──
    const sorteoResult = await client.query(
      'SELECT id, status, tope_por_piedra FROM dc_sorteos WHERE id = $1 FOR UPDATE',
      [sorteoId]
    );

    if (sorteoResult.rows.length === 0) {
      res.status(404).json({ error: 'Sorteo no encontrado' });
      return;
    }

    const sorteo = sorteoResult.rows[0];
    if (sorteo.status !== 'open') {
      res.status(409).json({ error: 'El sorteo no está abierto para apuestas' });
      return;
    }

    // ── Verify tope por piedra ──
    const existingBetResult = await client.query(
      'SELECT COALESCE(SUM(amount_eur), 0) as total FROM dc_bets WHERE sorteo_id = $1 AND domino_id = $2',
      [sorteoId, dominoId]
    );
    const currentTotal = parseFloat(existingBetResult.rows[0].total);
    const tope = parseFloat(sorteo.tope_por_piedra);

    if (currentTotal + amount > tope) {
      res.status(409).json({
        error: `Tope por ficha excedido. Tope: €${tope.toFixed(2)}, Actual: €${currentTotal.toFixed(2)}, Disponible: €${(tope - currentTotal).toFixed(2)}`,
        tope_por_piedra: tope,
        apostado_actual: currentTotal,
        disponible: parseFloat((tope - currentTotal).toFixed(2)),
      });
      return;
    }

    // ── Lock and verify wallet ──
    const walletResult = await client.query(
      'SELECT id, balance_eur FROM dc_wallets WHERE user_id = $1 FOR UPDATE',
      [req.user!.id]
    );

    if (walletResult.rows.length === 0) {
      res.status(404).json({ error: 'Wallet no encontrada' });
      return;
    }

    const wallet = walletResult.rows[0];
    const balance = parseFloat(wallet.balance_eur);

    if (balance < amount) {
      res.status(402).json({
        error: 'Saldo insuficiente',
        balance_eur: balance,
        amount_requerido: amount,
      });
      return;
    }

    // ── Encrypt description ──
    const descPlain = `Apuesta sorteo #${sorteoId} - Ficha ${DOMINO_PIECES[dominoId].label}`;
    let descToStore = descPlain;
    let descIv: string | null = null;
    let descTag: string | null = null;

    if (isEncryptionConfigured()) {
      const enc = encrypt(descPlain);
      descToStore = enc.ciphertext;
      descIv = enc.iv;
      descTag = enc.tag;
    }

    // ── Check for existing bet on same piece ──
    const dupResult = await client.query(
      'SELECT id, amount_eur FROM dc_bets WHERE sorteo_id = $1 AND user_id = $2 AND domino_id = $3',
      [sorteoId, req.user!.id, dominoId]
    );

    let betId: number;

    if (dupResult.rows.length > 0) {
      const existing = dupResult.rows[0];
      const newAmount = parseFloat(existing.amount_eur) + amount;
      await client.query(
        'UPDATE dc_bets SET amount_eur = $1, client_seed = COALESCE($2, client_seed) WHERE id = $3',
        [newAmount.toFixed(2), sanitizedClientSeed, existing.id]
      );
      betId = existing.id;
    } else {
      const betResult = await client.query(
        `INSERT INTO dc_bets (sorteo_id, user_id, domino_id, amount_eur, client_seed)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [sorteoId, req.user!.id, dominoId, amount.toFixed(2), sanitizedClientSeed]
      );
      betId = betResult.rows[0].id;
    }

    // ── Deduct from wallet ──
    const newBalance = balance - amount;
    await client.query(
      'UPDATE dc_wallets SET balance_eur = $1, updated_at = NOW() WHERE id = $2',
      [newBalance.toFixed(2), wallet.id]
    );

    // ── Record encrypted wallet transaction ──
    await client.query(
      `INSERT INTO dc_wallet_transactions (wallet_id, tipo, amount_eur, descripcion, desc_iv, desc_tag)
       VALUES ($1, 'apuesta', $2, $3, $4, $5)`,
      [wallet.id, amount.toFixed(2), descToStore, descIv, descTag]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Apuesta registrada',
      bet_id: betId,
      sorteo_id: sorteoId,
      domino_id: dominoId,
      domino_label: DOMINO_PIECES[dominoId].label,
      amount_eur: amount,
      balance_restante: newBalance,
      ...(sanitizedClientSeed && { client_seed: sanitizedClientSeed }),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bet error:', (err as Error).message);
    res.status(500).json({ error: 'Error al registrar apuesta' });
  } finally {
    client.release();
  }
});

export default router;
