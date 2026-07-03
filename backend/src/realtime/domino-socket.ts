/**
 * Socket.IO handlers para dominó clásico
 *
 * Eventos:
 * - 'domino:join'      → cliente se une a la room del juego
 * - 'domino:play'      → cliente juega una ficha
 * - 'domino:pass'      → cliente pasa turno
 * - 'domino:start'     → host inicia la partida (cuando hay 4 jugadores)
 * - 'domino:reconnect' → cliente se reconecta, recupera estado
 * - 'domino:disconnect'→ manejo de desconexión
 *
 * El servidor mantiene el estado del juego en memoria (Map<roomId, GameState>)
 * y persiste el resultado final en dc_domino_games.
 */

import { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import {
  createInitialState,
  playTile,
  passTurn,
  getSafeState,
  GameState,
  PlayerState,
} from '../engine/domino-classic';
import jwt from 'jsonwebtoken';

const TURN_TIMEOUT_MS = 60_000; // 60 segundos por turno

// Estados en memoria de todas las salas activas
const gameStates = new Map<number, GameState>();
// Map para timeouts de turno
const turnTimers = new Map<number, NodeJS.Timeout>();
// Map de sockets por roomId/userId para emisión segura (evita data leak)
const roomSockets = new Map<number, Map<number, string>>(); // roomId → userId → socketId

interface AuthSocket extends Socket {
  userId?: number;
  username?: string;
  roomId?: number;
}

function getOrLoadState(roomId: number): GameState | null {
  return gameStates.get(roomId) || null;
}

function saveState(state: GameState) {
  gameStates.set(state.roomId, state);
}

function getUserFromSocket(socket: AuthSocket): number | null {
  return socket.userId || null;
}

// Trackear socket de un (roomId, userId)
function trackSocket(roomId: number, userId: number, socketId: string) {
  if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Map());
  roomSockets.get(roomId)!.set(userId, socketId);
}

function untrackSocket(roomId: number, userId: number, socketId: string) {
  const map = roomSockets.get(roomId);
  if (!map) return;
  if (map.get(userId) === socketId) {
    map.delete(userId);
    if (map.size === 0) roomSockets.delete(roomId);
  }
}

// Emitir 'domino:state' filtrado por usuario (mano correcta, sin leak)
function emitStateToAllPlayers(io: Server, state: GameState) {
  const map = roomSockets.get(state.roomId);
  if (!map) return;
  for (const [userId, socketId] of map.entries()) {
    io.to(socketId).emit('domino:state', getSafeState(state, userId));
  }
}

// ─── Persistir resultado final en DB ─────────────────────────
async function persistGameResult(state: GameState) {
  try {
    if (!state.winnerPosition) return;
    const winner = state.players.find(p => p.position === state.winnerPosition);
    if (!winner) return;

    const winnerUserId = state.winType === 'closed' && winner ? winner.userId : winner.userId;
    const isClosed = state.winType === 'closed';
    const pointsAwarded = state.scores[state.winnerPosition] || 0;

    const duration = state.finishedAt && state.startedAt
      ? Math.floor((state.finishedAt - state.startedAt) / 1000)
      : 0;

    await pool.query(
      `INSERT INTO dc_domino_games
         (room_id, winner_user_id, is_closed, points_awarded, rounds_played, duration_seconds, moves)
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [
        state.roomId,
        winnerUserId,
        isClosed,
        pointsAwarded,
        duration,
        JSON.stringify(state.board),
      ]
    );

    // Actualizar stats
    await pool.query(
      `INSERT INTO dc_domino_stats (user_id, games_played, games_won, games_closed, total_points, last_played_at, updated_at)
       VALUES ($1, 1, 1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         games_played = dc_domino_stats.games_played + 1,
         games_won = dc_domino_stats.games_won + 1,
         games_closed = dc_domino_stats.games_closed + $2,
         total_points = dc_domino_stats.total_points + $3,
         current_streak = dc_domino_stats.current_streak + 1,
         longest_streak = GREATEST(dc_domino_stats.longest_streak, dc_domino_stats.current_streak + 1),
         last_played_at = NOW(),
         updated_at = NOW()`,
      [winnerUserId, isClosed ? 1 : 0, pointsAwarded]
    );

    // Para los perdedores
    const losers = state.players.filter(p => p.userId !== winnerUserId);
    for (const loser of losers) {
      await pool.query(
        `INSERT INTO dc_domino_stats (user_id, games_played, current_streak, last_played_at, updated_at)
         VALUES ($1, 1, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           games_played = dc_domino_stats.games_played + 1,
           current_streak = 0,
           last_played_at = NOW(),
           updated_at = NOW()`,
        [loser.userId]
      );
    }
  } catch (err) {
    console.error('Error persisting game result:', err);
  }
}

// ─── Iniciar timer de turno ──────────────────────────────────
function startTurnTimer(io: Server, roomId: number) {
  // Limpiar timer anterior
  const existing = turnTimers.get(roomId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    // Auto-pasar al jugador cuyo turno es
    const state = getOrLoadState(roomId);
    if (!state || state.status !== 'playing') return;

    const currentPlayer = state.players.find(p => p.position === state.currentTurn);
    if (!currentPlayer) return;

    console.log(`[Domino] Auto-pass en sala ${roomId} por timeout, jugador ${currentPlayer.username}`);

    const result = passTurn(state, currentPlayer.userId);
    if (result.ok) {
      saveState(result.newState);
      emitStateToAllPlayers(io, result.newState);
      io.to(`domino:${roomId}`).emit('domino:turn_timeout', {
        userId: currentPlayer.userId,
        position: state.currentTurn,
      });

      if (result.newState.status === 'finished') {
        persistGameResult(result.newState);
        // finished: cada player ve sus propios scores, no leak
        const map = roomSockets.get(result.newState.roomId);
        if (map) {
          for (const [uid, sid] of map.entries()) {
            io.to(sid).emit('domino:finished', {
              winnerPosition: result.newState.winnerPosition,
              winType: result.newState.winType,
              scores: result.newState.scores,
            });
          }
        }
        roomSockets.delete(roomId);
        gameStates.delete(roomId);
        turnTimers.delete(roomId);
        return;
      }

      startTurnTimer(io, roomId);
    }
  }, TURN_TIMEOUT_MS);

  turnTimers.set(roomId, timer);
}

// ─── Setup principal ─────────────────────────────────────────
export function setupDominoSocket(io: Server) {
  // Namespace o path para dominó
  io.on('connection', (socket: Socket) => {
    const s = socket as AuthSocket;
    console.log(`[Domino] Socket connected: ${s.id}`);

    // ─── Auth handshake ────────────────────────────────────
    s.on('auth', (data: { token: string }) => {
      try {
        const payload = jwt.verify(data.token, process.env.JWT_SECRET!) as any;
        s.userId = payload.userId;
        s.username = payload.username;
        s.emit('auth:ok', { userId: s.userId, username: s.username });
      } catch (err) {
        s.emit('auth:error', { error: 'Token inválido' });
        s.disconnect();
      }
    });

    // ─── Join room (mesa) ──────────────────────────────────
    s.on('domino:join', async (data: { roomId: number }) => {
      try {
        const userId = s.userId!;
        const { roomId } = data;

        // Verificar que el user es parte de la mesa
        const memberResult = await pool.query(
          `SELECT p.position FROM dc_domino_players p WHERE p.room_id = $1 AND p.user_id = $2`,
          [roomId, userId]
        );
        if (memberResult.rows.length === 0) {
          s.emit('error', { event: 'domino:join', error: 'No eres parte de esta mesa' });
          return;
        }

        // Unirse al room de Socket.IO
        s.join(`domino:${roomId}`);
        s.roomId = roomId;
        trackSocket(roomId, userId, s.id);

        // Marcar como conectado en DB
        await pool.query(
          `UPDATE dc_domino_players SET is_connected = true, socket_id = $1 WHERE room_id = $2 AND user_id = $3`,
          [s.id, roomId, userId]
        );

        // Si hay estado en memoria, mandárselo
        const state = getOrLoadState(roomId);
        if (state) {
          s.emit('domino:state', getSafeState(state, userId));
        }

        // Notificar a otros (evento genérico, sin filtrar — solo userId)
        s.to(`domino:${roomId}`).emit('domino:player_joined', { userId });
      } catch (err: any) {
        console.error('[Domino] join error:', err);
        s.emit('error', { event: 'domino:join', error: err.message });
      }
    });

    // ─── Host inicia la partida ────────────────────────────
    s.on('domino:start', async () => {
      console.log(`[Domino] START received from user ${s.userId} in room ${s.roomId}`);
      try {
        const userId = s.userId!;
        const roomId = s.roomId;
        if (!roomId) {
          console.log(`[Domino] START ignored: no roomId`);
          s.emit('error', { event: 'domino:start', error: 'No estás en una sala' });
          return;
        }

        // Cargar room + players
        const roomResult = await pool.query(
          `SELECT id, host_user_id, status, max_players FROM dc_domino_rooms WHERE id = $1`,
          [roomId]
        );
        if (roomResult.rows.length === 0) return;
        const room = roomResult.rows[0];

        if (room.host_user_id !== userId) {
          s.emit('error', { event: 'domino:start', error: 'Solo el host puede iniciar' });
          return;
        }

        if (room.status !== 'waiting') {
          s.emit('error', { event: 'domino:start', error: 'La mesa ya empezó' });
          return;
        }

        // Cargar players
        const playersResult = await pool.query(
          `SELECT p.user_id, p.position, p.team, u.username
           FROM dc_domino_players p
           JOIN dc_users u ON u.id = p.user_id
           WHERE p.room_id = $1
           ORDER BY p.position`,
          [roomId]
        );

        if (playersResult.rows.length < 2) {
          s.emit('error', { event: 'domino:start', error: 'Mínimo 2 jugadores' });
          return;
        }

        // Crear estado inicial
        const players: PlayerState[] = playersResult.rows.map(r => ({
          userId: r.user_id,
          username: r.username,
          position: r.position as 0 | 1 | 2 | 3,
          team: r.team,
          hand: [],
          connected: true,
        }));

        const state = createInitialState(roomId, players);
        saveState(state);

        // Actualizar status
        await pool.query(
          `UPDATE dc_domino_rooms SET status = 'playing', started_at = NOW() WHERE id = $1`,
          [roomId]
        );

        // Mandar estado a todos (cada uno ve solo su mano) — emisión segura por socket
        for (const p of players) {
          const map = roomSockets.get(roomId);
          const sid = map?.get(p.userId);
          if (sid) io.to(sid).emit('domino:state', getSafeState(state, p.userId));
        }
        io.to(`domino:${roomId}`).emit('domino:started', { state: getSafeState(state, userId) });

        // Iniciar timer
        startTurnTimer(io, roomId);
      } catch (err: any) {
        console.error('[Domino] start error:', err);
        s.emit('error', { event: 'domino:start', error: err.message });
      }
    });

    // ─── Jugar ficha ───────────────────────────────────────
    s.on('domino:play', (data: { tile: [number, number]; side: 'left' | 'right' }) => {
      try {
        const userId = s.userId!;
        const roomId = s.roomId;
        if (!roomId) return;

        const state = getOrLoadState(roomId);
        if (!state || state.status !== 'playing') {
          s.emit('error', { event: 'domino:play', error: 'No hay juego activo' });
          return;
        }

        const result = playTile(state, userId, data.tile, data.side);
        if (!result.ok) {
          s.emit('error', { event: 'domino:play', error: result.error });
          return;
        }

        saveState(result.newState);

        // Mandar estado actualizado a todos (emisión segura por socket)
        emitStateToAllPlayers(io, result.newState);

        if (result.newState.status === 'finished') {
          persistGameResult(result.newState);
          const map = roomSockets.get(roomId);
          if (map) {
            for (const [uid, sid] of map.entries()) {
              io.to(sid).emit('domino:finished', {
                winnerPosition: result.newState.winnerPosition,
                winType: result.newState.winType,
                scores: result.newState.scores,
              });
            }
          }
          roomSockets.delete(roomId);
          gameStates.delete(roomId);
          turnTimers.delete(roomId);
          return;
        }

        // Reiniciar timer
        startTurnTimer(io, roomId);
      } catch (err: any) {
        console.error('[Domino] play error:', err);
        s.emit('error', { event: 'domino:play', error: err.message });
      }
    });

    // ─── Pasar turno ───────────────────────────────────────
    s.on('domino:pass', () => {
      try {
        const userId = s.userId!;
        const roomId = s.roomId;
        if (!roomId) return;

        const state = getOrLoadState(roomId);
        if (!state || state.status !== 'playing') {
          s.emit('error', { event: 'domino:pass', error: 'No hay juego activo' });
          return;
        }

        const result = passTurn(state, userId);
        if (!result.ok) {
          s.emit('error', { event: 'domino:pass', error: result.error });
          return;
        }

        saveState(result.newState);

        emitStateToAllPlayers(io, result.newState);

        if (result.newState.status === 'finished') {
          persistGameResult(result.newState);
          const map = roomSockets.get(roomId);
          if (map) {
            for (const [uid, sid] of map.entries()) {
              io.to(sid).emit('domino:finished', {
                winnerPosition: result.newState.winnerPosition,
                winType: result.newState.winType,
                scores: result.newState.scores,
              });
            }
          }
          roomSockets.delete(roomId);
          gameStates.delete(roomId);
          turnTimers.delete(roomId);
          return;
        }

        startTurnTimer(io, roomId);
      } catch (err: any) {
        console.error('[Domino] pass error:', err);
        s.emit('error', { event: 'domino:pass', error: err.message });
      }
    });

    // ─── Desconexión ───────────────────────────────────────
    s.on('disconnect', async () => {
      try {
        const userId = s.userId;
        const roomId = s.roomId;
        if (!userId || !roomId) return;

        // Limpiar tracking de socket
        untrackSocket(roomId, userId, s.id);

        // Marcar como desconectado en DB
        await pool.query(
          `UPDATE dc_domino_players SET is_connected = false WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );

        s.to(`domino:${roomId}`).emit('domino:player_left', { userId });
        console.log(`[Domino] User ${userId} disconnected from room ${roomId}`);
      } catch (err) {
        console.error('[Domino] disconnect error:', err);
      }
    });
  });
}
