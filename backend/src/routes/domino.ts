import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────
const CODE_REGEX = /^[A-Z0-9]{4}$/;

function normalizeCode(code: string | undefined): string | null {
  if (!code || typeof code !== 'string') return null;
  const upper = code.trim().toUpperCase();
  return CODE_REGEX.test(upper) ? upper : null;
}

function isValidMaxPlayers(n: unknown): n is 2 | 4 {
  return n === 2 || n === 4;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1 (confusos)
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── POST /rooms (crear) ─────────────────────────────────────
router.post('/rooms', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const { isPrivate = true, maxPlayers = 4 } = req.body ?? {};

  if (!isValidMaxPlayers(maxPlayers)) {
    return res.status(400).json({ error: 'maxPlayers debe ser 2 o 4' });
  }
  if (typeof isPrivate !== 'boolean' && typeof isPrivate !== 'undefined') {
    return res.status(400).json({ error: 'isPrivate debe ser boolean' });
  }
  const isPriv = isPrivate !== false; // default true

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generar código único con reintentos
    let code: string | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateRoomCode();
      const existing = await client.query(
        'SELECT 1 FROM dc_domino_rooms WHERE code = $1',
        [candidate]
      );
      if (existing.rows.length === 0) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      await client.query('ROLLBACK');
      return res.status(503).json({ error: 'No se pudo generar código único' });
    }

    // Crear sala
    const roomResult = await client.query(
      `INSERT INTO dc_domino_rooms (code, host_user_id, is_private, max_players, status)
       VALUES ($1, $2, $3, $4, 'waiting')
       RETURNING id, code, host_user_id, is_private, max_players, status, created_at`,
      [code, userId, isPriv, maxPlayers]
    );
    const room = roomResult.rows[0];

    // Host entra como posición 0
    await client.query(
      `INSERT INTO dc_domino_players (room_id, user_id, position, is_connected)
       VALUES ($1, $2, 0, true)`,
      [room.id, userId]
    );

    await client.query('COMMIT');
    return res.status(201).json({ room });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating room:', err);
    return res.status(500).json({ error: 'Error al crear la sala' });
  } finally {
    client.release();
  }
});

// ─── GET /rooms/mine (mis salas activas) ─────────────────────
router.get('/rooms/mine', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const result = await pool.query(
      `SELECT
         r.id, r.code, r.host_user_id, r.is_private, r.max_players, r.status, r.created_at,
         COUNT(p.id)::int as player_count,
         host.username as host_username,
         bool_or(p.user_id = $1) as joined,
         bool_or(p.user_id = $1 AND p.is_connected) as is_connected,
         (r.host_user_id = $1) as is_host
       FROM dc_domino_rooms r
       LEFT JOIN dc_domino_players p ON p.room_id = r.id
       LEFT JOIN dc_users host ON host.id = r.host_user_id
       WHERE r.status IN ('waiting', 'playing')
         AND (
           r.host_user_id = $1
           OR EXISTS (SELECT 1 FROM dc_domino_players WHERE room_id = r.id AND user_id = $1)
         )
       GROUP BY r.id, host.username
       ORDER BY
         CASE WHEN r.status = 'playing' THEN 0 ELSE 1 END,
         r.created_at DESC
       LIMIT 50`,
      [userId]
    );
    return res.json({ rooms: result.rows });
  } catch (err: any) {
    console.error('Error listing my rooms:', err);
    return res.status(500).json({ error: 'Error al listar tus salas' });
  }
});

// ─── GET /rooms/public ───────────────────────────────────────
router.get('/rooms/public', requireAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         r.id, r.code, r.max_players, r.created_at,
         r.host_user_id,
         host.username as host_username,
         COUNT(p.id)::int as player_count
       FROM dc_domino_rooms r
       LEFT JOIN dc_domino_players p ON p.room_id = r.id
       LEFT JOIN dc_users host ON host.id = r.host_user_id
       WHERE r.is_private = false AND r.status = 'waiting'
       GROUP BY r.id, host.username
       HAVING COUNT(p.id) < r.max_players
       ORDER BY r.created_at DESC
       LIMIT 20`
    );
    return res.json({ rooms: result.rows });
  } catch (err: any) {
    console.error('Error listing public rooms:', err);
    return res.status(500).json({ error: 'Error al listar salas públicas' });
  }
});

// ─── GET /rooms/:code ────────────────────────────────────────
router.get('/rooms/:code', requireAuth, async (req: Request, res: Response) => {
  const code = normalizeCode(req.params.code);
  if (!code) {
    return res.status(400).json({ error: 'Código inválido (debe ser 4 caracteres alfanuméricos)' });
  }

  try {
    const result = await pool.query(
      `SELECT
         r.id, r.code, r.host_user_id, r.is_private, r.max_players, r.status,
         r.created_at, r.started_at, r.finished_at,
         host.username as host_username,
         json_agg(
           json_build_object(
             'user_id', p.user_id,
             'position', p.position,
             'is_connected', p.is_connected,
             'username', u.username,
             'display_name', u.username
           ) ORDER BY p.position
         ) FILTER (WHERE p.id IS NOT NULL) as players
       FROM dc_domino_rooms r
       LEFT JOIN dc_users host ON host.id = r.host_user_id
       LEFT JOIN dc_domino_players p ON p.room_id = r.id
       LEFT JOIN dc_users u ON u.id = p.user_id
       WHERE r.code = $1
       GROUP BY r.id, host.username`,
      [code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sala no encontrada' });
    }
    return res.json({ room: result.rows[0] });
  } catch (err: any) {
    console.error('Error getting room:', err);
    return res.status(500).json({ error: 'Error al obtener la sala' });
  }
});

// ─── POST /rooms/:code/join ──────────────────────────────────
router.post('/rooms/:code/join', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const code = normalizeCode(req.params.code);
  if (!code) {
    return res.status(400).json({ error: 'Código inválido (debe ser 4 caracteres alfanuméricos)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock la fila para evitar race condition
    const roomResult = await client.query(
      `SELECT id, status, max_players FROM dc_domino_rooms WHERE code = $1 FOR UPDATE`,
      [code]
    );
    if (roomResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sala no encontrada' });
    }
    const room = roomResult.rows[0];

    if (room.status !== 'waiting') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La sala ya empezó o terminó' });
    }

    // Ya adentro? idempotente
    const existingResult = await client.query(
      `SELECT position FROM dc_domino_players WHERE room_id = $1 AND user_id = $2`,
      [room.id, userId]
    );
    if (existingResult.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({
        roomId: room.id,
        position: existingResult.rows[0].position,
        alreadyJoined: true,
      });
    }

    // Contar jugadores bajo el lock
    const countResult = await client.query(
      `SELECT COUNT(*)::int as n FROM dc_domino_players WHERE room_id = $1`,
      [room.id]
    );
    if (countResult.rows[0].n >= room.max_players) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sala llena' });
    }

    // Encontrar próxima posición libre
    const positionsResult = await client.query(
      `SELECT position FROM dc_domino_players WHERE room_id = $1 ORDER BY position`,
      [room.id]
    );
    const taken = new Set(positionsResult.rows.map((r: any) => r.position));
    let nextPos = -1;
    for (let i = 0; i < room.max_players; i++) {
      if (!taken.has(i)) {
        nextPos = i;
        break;
      }
    }
    if (nextPos === -1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sala llena' });
    }

    await client.query(
      `INSERT INTO dc_domino_players (room_id, user_id, position, is_connected)
       VALUES ($1, $2, $3, true)`,
      [room.id, userId, nextPos]
    );

    await client.query('COMMIT');
    return res.status(201).json({ roomId: room.id, position: nextPos });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error joining room:', err);
    return res.status(500).json({ error: 'Error al unirse a la sala' });
  } finally {
    client.release();
  }
});

// ─── POST /rooms/:code/leave ─────────────────────────────────
router.post('/rooms/:code/leave', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  const code = normalizeCode(req.params.code);
  if (!code) {
    return res.status(400).json({ error: 'Código inválido (debe ser 4 caracteres alfanuméricos)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `DELETE FROM dc_domino_players
       WHERE user_id = $1 AND room_id IN (
         SELECT id FROM dc_domino_rooms WHERE code = $2 AND status = 'waiting'
       )
       RETURNING room_id`,
      [userId, code]
    );

    if (!result.rowCount || result.rowCount === 0) {
      await client.query('COMMIT');
      return res.status(404).json({ left: false, error: 'No estás en esa sala o ya empezó' });
    }

    const roomId = result.rows[0].room_id;

    // Si la sala queda vacía → abandoned
    const remaining = await client.query(
      `SELECT COUNT(*)::int as n FROM dc_domino_players WHERE room_id = $1`,
      [roomId]
    );
    if (remaining.rows[0].n === 0) {
      await client.query(
        `UPDATE dc_domino_rooms SET status = 'abandoned' WHERE id = $1`,
        [roomId]
      );
    }

    await client.query('COMMIT');
    return res.json({ left: true });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error leaving room:', err);
    return res.status(500).json({ error: 'Error al salir de la sala' });
  } finally {
    client.release();
  }
});

export default router;