import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { requireAdmin } from '../middleware/adminAuth';
import { requireServiceToken } from '../middleware/serviceAuth';
import { DOMINO_PIECES } from '../types';
import {
  generateServerSeed,
  combinedSeedHex,
  deriveDrawResultsFromHex,
  verifyServerSeed,
} from '../crypto/provablyFair';
import {
  buildResultMessage,
  signResult,
  getPublicKeyPem,
  verifyResultSignature,
} from '../crypto/signing';

const router = Router();

// ─── All admin routes require X-Admin-Key + (optionally) X-Service-Token ──
router.use(requireAdmin);
router.use(requireServiceToken);

/**
 * POST /admin/sorteos/crear
 * Creates a new sorteo with provably fair server seed commit.
 */
router.post('/sorteos/crear', async (_req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify no open sorteo already exists
    const openCheck = await client.query(
      "SELECT id FROM dc_sorteos WHERE status = 'open' LIMIT 1"
    );
    if (openCheck.rows.length > 0) {
      res.status(409).json({
        error: 'Ya existe un sorteo abierto',
        sorteo_id: openCheck.rows[0].id,
      });
      return;
    }

    // Get banca_inicio from last revealed sorteo
    const lastSorteoResult = await client.query(
      "SELECT banca_fin FROM dc_sorteos WHERE status = 'revealed' ORDER BY revealed_at DESC LIMIT 1"
    );

    const bancaInicial = parseFloat(process.env.BANCA_INICIAL || '25000');
    const porcentaje = parseFloat(process.env.BANCA_TOPE_PORCENTAJE || '20');

    let bancaInicio: number;
    if (lastSorteoResult.rows.length > 0 && lastSorteoResult.rows[0].banca_fin !== null) {
      bancaInicio = parseFloat(lastSorteoResult.rows[0].banca_fin as string);
    } else {
      bancaInicio = bancaInicial;
    }

    const topePorPiedra = parseFloat(((bancaInicio * porcentaje / 100) / 28).toFixed(2));

    // ── Provably Fair: generate server seed commit ──
    const { serverSeed, serverSeedHash } = generateServerSeed();

    // commit_hash = SHA-256 of server_seed_hash (existing column, keep compatible)
    // server_seed_hash = published immediately, server_seed stored secretly until reveal
    const result = await client.query(
      `INSERT INTO dc_sorteos
         (commit_hash, server_seed_hash, banca_inicio, tope_por_piedra, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [serverSeedHash, serverSeedHash, bancaInicio.toFixed(2), topePorPiedra.toFixed(2)]
    );

    await client.query('COMMIT');

    const sorteo = result.rows[0];

    // ⚠️  server_seed returned to admin only — store it securely!
    // In production: store in a vault, not in application memory.
    res.status(201).json({
      message: 'Sorteo creado exitosamente (Provably Fair)',
      sorteo_id: sorteo.id,
      server_seed_hash: serverSeedHash,       // Public — publish this immediately
      server_seed_admin_only: serverSeed,     // ⚠️  SECRET — store securely, reveal after sorteo
      banca_inicio: bancaInicio,
      tope_por_piedra: topePorPiedra,
      status: 'open',
      provably_fair_note: 'server_seed_hash is the SHA-256 of server_seed. Players can verify after reveal.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Crear sorteo error:', (err as Error).message);
    res.status(500).json({ error: 'Error al crear sorteo' });
  } finally {
    client.release();
  }
});

/**
 * POST /admin/sorteos/:id/revelar
 * Reveals sorteo using provably fair combined seed.
 * Body: { server_seed: string }
 */
router.post('/sorteos/:id/revelar', async (req: Request, res: Response): Promise<void> => {
  const sorteoId = parseInt(req.params.id);
  const { server_seed: serverSeed } = req.body;

  if (isNaN(sorteoId) || sorteoId <= 0) {
    res.status(400).json({ error: 'ID de sorteo inválido' });
    return;
  }

  if (!serverSeed || typeof serverSeed !== 'string') {
    res.status(400).json({ error: 'server_seed es requerido para revelar el sorteo' });
    return;
  }

  if (serverSeed.length !== 64) {
    res.status(400).json({ error: 'server_seed debe ser 64 chars hex (32 bytes)' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sorteoResult = await client.query(
      'SELECT * FROM dc_sorteos WHERE id = $1 FOR UPDATE',
      [sorteoId]
    );

    if (sorteoResult.rows.length === 0) {
      res.status(404).json({ error: 'Sorteo no encontrado' });
      return;
    }

    const sorteo = sorteoResult.rows[0];

    if (sorteo.status === 'revealed') {
      res.status(409).json({ error: 'El sorteo ya fue revelado' });
      return;
    }

    // ── Provably Fair: verify server_seed matches committed hash ──
    if (!verifyServerSeed(serverSeed, sorteo.server_seed_hash)) {
      res.status(400).json({ error: 'server_seed no coincide con server_seed_hash registrado' });
      return;
    }

    // ── Collect all bets to get representative client_seed ──
    // Use the concatenation of all client_seeds as the combined player input
    const betsResult = await client.query(
      'SELECT * FROM dc_bets WHERE sorteo_id = $1',
      [sorteoId]
    );
    const bets = betsResult.rows;

    // Aggregate client seeds (empty string if none provided)
    const allClientSeeds = bets
      .map((b: { client_seed?: string }) => b.client_seed || '')
      .filter(Boolean)
      .join('|');

    // ── Derive draw results from combined seed ──
    const combined = combinedSeedHex(serverSeed, allClientSeeds, sorteoId);
    const { winnerId, multX50Id, multX100Id } = deriveDrawResultsFromHex(combined);

    // ── Sign the result with ECDSA ──
    const timestamp = new Date().toISOString();
    const resultMessage = buildResultMessage(
      sorteoId, winnerId, multX50Id, multX100Id, serverSeed, timestamp
    );
    let resultSignature: string;
    try {
      resultSignature = signResult(resultMessage);
    } catch (signErr) {
      console.error('Signing error:', (signErr as Error).message);
      resultSignature = ''; // Don't block reveal if signing fails
    }

    // ── Calculate and pay prizes ──
    const totalApostado = bets.reduce((sum: number, b: { amount_eur: string }) => sum + parseFloat(b.amount_eur), 0);
    let totalPremios = 0;

    for (const bet of bets) {
      let multiplier = 0;
      if (bet.domino_id === winnerId) multiplier = 10;
      else if (bet.domino_id === multX50Id) multiplier = 50;
      else if (bet.domino_id === multX100Id) multiplier = 100;

      const winAmount = parseFloat((parseFloat(bet.amount_eur) * multiplier).toFixed(2));
      totalPremios += winAmount;

      await client.query(
        'UPDATE dc_bets SET payout_multiplier = $1, win_amount_eur = $2 WHERE id = $3',
        [multiplier, winAmount.toFixed(2), bet.id]
      );

      if (winAmount > 0) {
        const walletResult = await client.query(
          'SELECT id, balance_eur FROM dc_wallets WHERE user_id = $1 FOR UPDATE',
          [bet.user_id]
        );

        if (walletResult.rows.length > 0) {
          const wallet = walletResult.rows[0];
          const newBalance = parseFloat(wallet.balance_eur) + winAmount;

          await client.query(
            'UPDATE dc_wallets SET balance_eur = $1, updated_at = NOW() WHERE id = $2',
            [newBalance.toFixed(2), wallet.id]
          );

          await client.query(
            `INSERT INTO dc_wallet_transactions (wallet_id, tipo, amount_eur, descripcion)
             VALUES ($1, 'premio', $2, $3)`,
            [
              wallet.id,
              winAmount.toFixed(2),
              `Premio sorteo #${sorteoId} - Ficha ${DOMINO_PIECES[bet.domino_id].label} (x${multiplier})`,
            ]
          );
        }
      }
    }

    const bancaFin = parseFloat(sorteo.banca_inicio) + totalApostado - totalPremios;

    // ── Update sorteo: store server_seed (reveal it), signature ──
    await client.query(
      `UPDATE dc_sorteos
       SET status = 'revealed',
           revealed_at = NOW(),
           closed_at = COALESCE(closed_at, NOW()),
           seed = $1,
           server_seed = $2,
           client_seed = $3,
           winner_domino_id = $4,
           mult_x50_domino_id = $5,
           mult_x100_domino_id = $6,
           banca_fin = $7,
           result_signature = $8
       WHERE id = $9`,
      [
        combined,          // legacy seed field = combined hex
        serverSeed,        // provably fair reveal
        allClientSeeds || null,
        winnerId,
        multX50Id,
        multX100Id,
        bancaFin.toFixed(2),
        resultSignature,
        sorteoId,
      ]
    );

    await client.query(
      `INSERT INTO dc_banca_log (sorteo_id, banca_antes, banca_despues)
       VALUES ($1, $2, $3)`,
      [sorteoId, parseFloat(sorteo.banca_inicio).toFixed(2), bancaFin.toFixed(2)]
    );

    await client.query('COMMIT');

    res.json({
      message: '¡Sorteo revelado y premios pagados! (Provably Fair + ECDSA)',
      sorteo_id: sorteoId,
      winner: {
        domino_id: winnerId,
        domino_label: DOMINO_PIECES[winnerId].label,
        multiplier: 10,
      },
      mult_x50: {
        domino_id: multX50Id,
        domino_label: DOMINO_PIECES[multX50Id].label,
        multiplier: 50,
      },
      mult_x100: {
        domino_id: multX100Id,
        domino_label: DOMINO_PIECES[multX100Id].label,
        multiplier: 100,
      },
      provably_fair: {
        server_seed: serverSeed,         // Now public
        server_seed_hash: sorteo.server_seed_hash,
        client_seed: allClientSeeds || null,
        combined_seed: combined,
      },
      ecdsa_signature: resultSignature,
      signed_message: resultMessage,
      banca_inicio: parseFloat(sorteo.banca_inicio),
      total_apostado: parseFloat(totalApostado.toFixed(2)),
      total_premios_pagados: parseFloat(totalPremios.toFixed(2)),
      banca_fin: parseFloat(bancaFin.toFixed(2)),
      banca_delta: parseFloat((bancaFin - parseFloat(sorteo.banca_inicio)).toFixed(2)),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Revelar error:', (err as Error).message);
    res.status(500).json({ error: 'Error al revelar sorteo' });
  } finally {
    client.release();
  }
});

/**
 * GET /admin/stats
 * Returns admin stats (protected by admin key + service token).
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [users, sorteos, banca] = await Promise.all([
      pool.query('SELECT COUNT(*) as total FROM dc_users'),
      pool.query("SELECT status, COUNT(*) as total FROM dc_sorteos GROUP BY status"),
      pool.query("SELECT banca_fin FROM dc_sorteos WHERE status = 'revealed' ORDER BY revealed_at DESC LIMIT 1"),
    ]);

    res.json({
      total_users: parseInt(users.rows[0].total),
      sorteos_by_status: sorteos.rows,
      banca_actual: banca.rows.length > 0 ? banca.rows[0].banca_fin : process.env.BANCA_INICIAL || '25000',
    });
  } catch (err) {
    console.error('Admin stats error:', (err as Error).message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

export default router;
