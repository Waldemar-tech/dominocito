/**
 * Socket.IO handlers para dominó clásico
 *
 * Eventos entrantes:
 * - 'auth'           → fallback si el token no vino en el handshake
 * - 'domino:join'    → cliente se une a la room del juego
 * - 'domino:start'   → host inicia la partida
 * - 'domino:play'    → cliente juega una ficha
 * - 'domino:pass'    → cliente pasa turno
 *
 * Eventos salientes:
 * - 'auth:ok' / 'auth:error'
 * - 'domino:state'   → estado filtrado por jugador (nunca revela manos ajenas)
 * - 'domino:started' / 'domino:finished' / 'domino:turn_timeout'
 * - 'domino:player_joined' / 'domino:player_left'
 * - 'error'
 *
 * El servidor mantiene el estado en memoria (Map<roomId, GameState>) y lo
 * persiste en dc_domino_rooms.game_state. OJO: al ser un Map de proceso,
 * esto NO soporta pm2 cluster ni múltiples réplicas. Ver CAMBIOS.md.
 */

import { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import {
  createInitialState,
  playTile,
  passTurn,
  getSafeState,
  migrateState,
  legalMoves,
  GameState,
  PlayerState,
  Position,
} from '../engine/domino-classic';
import {
  assignTeamSeats,
  validateTeams,
  canJoinTeam,
  TeamMode,
  TeamId,
  RoomMember,
} from '../engine/domino-teams';
import {
  MatchState,
  createMatch,
  updateCurrentHand,
  advanceAfterHand,
  isHandOver,
  migrateMatch,
} from '../engine/domino-match';
import { teamOfPosition } from '../engine/domino-classic';
import jwt from 'jsonwebtoken';

const TURN_TIMEOUT_MS = 60_000;
/** Segundos que se muestran las fichas del perdedor antes de la mano siguiente. */
const HAND_REVEAL_MS = 6_000;

const gameStates = new Map<number, GameState>();
const matches = new Map<number, MatchState>();
const turnTimers = new Map<number, NodeJS.Timeout>();
const handAdvanceTimers = new Map<number, NodeJS.Timeout>();
const roomSockets = new Map<number, Map<number, string>>(); // roomId → userId → socketId

/** Anti-flood simple por socket: mínimo intervalo entre acciones de juego. */
const MIN_ACTION_INTERVAL_MS = 250;

interface AuthSocket extends Socket {
  userId?: number;
  username?: string;
  roomId?: number;
  lastActionAt?: number;
}

// ─── Estado ──────────────────────────────────────────────────
function getOrLoadState(roomId: number): GameState | null {
  return gameStates.get(roomId) || null;
}

async function loadStateFromDB(roomId: number): Promise<GameState | null> {
  try {
    const r = await pool.query(
      `SELECT game_state, match_state FROM dc_domino_rooms WHERE id = $1 AND game_state IS NOT NULL`,
      [roomId]
    );
    if (r.rows.length === 0 || !r.rows[0].game_state) return null;
    const state = migrateState(r.rows[0].game_state as GameState);
    gameStates.set(roomId, state);

    // Restaurar también el PARTIDO si existía (sobrevive al restart del backend).
    // Sin esto, al terminar la mano el partido se trataría como mano suelta y
    // el marcador acumulado se perdería.
    if (r.rows[0].match_state && !matches.has(roomId)) {
      const match = migrateMatch(r.rows[0].match_state as MatchState);
      if (match.status === 'playing') {
        // La mano vigente es la de game_state (la más fresca).
        matches.set(roomId, { ...match, currentHand: state });
        console.log(`[Domino] Restored matchState room ${roomId} (mano ${match.handNumber}, score ${match.score[0]}-${match.score[1]})`);
      }
    }

    console.log(`[Domino] Restored gameState room ${roomId} (moveCount=${state.moveCount})`);
    return state;
  } catch (err) {
    console.error('[Domino] Failed to load gameState from DB:', err);
    return null;
  }
}

/**
 * Persiste el estado. Devuelve la promesa: hay que esperarla antes de
 * limpiar game_state al terminar, o las dos escrituras corren por
 * conexiones distintas del pool y el NULL puede llegar primero.
 */
function saveState(state: GameState): Promise<unknown> {
  gameStates.set(state.roomId, state);
  return pool
    .query(`UPDATE dc_domino_rooms SET game_state = $1 WHERE id = $2`, [
      JSON.stringify(state),
      state.roomId,
    ])
    .catch(err => console.error('[Domino] Failed to persist gameState:', err));
}

// ─── Tracking de sockets ─────────────────────────────────────
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

function emitStateToAllPlayers(io: Server, state: GameState) {
  const map = roomSockets.get(state.roomId);
  if (!map) return;
  for (const [userId, socketId] of map.entries()) {
    io.to(socketId).emit('domino:state', getSafeState(state, userId));
  }
}

/**
 * FASE 1: emite el estado del LOBBY (jugadores + equipos) a toda la sala.
 * Se usa cuando alguien elige equipo o el host los reacomoda, antes de
 * que empiece la partida. No revela manos porque no hay partida todavía.
 */
async function broadcastLobby(io: Server, roomId: number) {
  try {
    const res = await pool.query(
      `SELECT p.user_id, p.position, p.team, p.is_connected, u.username
       FROM dc_domino_players p
       JOIN dc_users u ON u.id = p.user_id
       WHERE p.room_id = $1
       ORDER BY p.position`,
      [roomId]
    );
    const players = res.rows.map(r => ({
      userId: r.user_id,
      username: r.username,
      position: r.position,
      team: r.team,
      is_connected: r.is_connected,
    }));
    io.to(`domino:${roomId}`).emit('domino:lobby', { players });
  } catch (err) {
    console.error('[Domino] broadcastLobby error:', err);
  }
}

// ─── Timers ──────────────────────────────────────────────────
function clearTurnTimer(roomId: number) {
  const t = turnTimers.get(roomId);
  if (t) clearTimeout(t);
  turnTimers.delete(roomId);
}

/**
 * Auto-jugada al vencer el turno.
 *
 * Antes esto llamaba passTurn() siempre. Pero passTurn() rechaza a quien
 * SÍ puede jugar (guard anti-trampa), devolvía ok:false, no se reprogramaba
 * el timer, y la mesa quedaba congelada para siempre. Ahora: si hay jugada
 * legal, se juega la primera; si no, se pasa. Y pase lo que pase, se
 * reprograma el timer.
 */
function startTurnTimer(io: Server, roomId: number) {
  clearTurnTimer(roomId);

  const timer = setTimeout(() => {
    const state = getOrLoadState(roomId);
    if (!state || state.status !== 'playing') return;

    const current = state.players.find(p => p.position === state.currentTurn);
    if (!current) {
      console.error(`[Domino] room ${roomId}: currentTurn=${state.currentTurn} sin jugador. Abortando timer.`);
      return;
    }

    const moves = legalMoves(current.hand, state.leftEnd, state.rightEnd);
    const isOpening = state.board.length === 0;

    let result;
    if (isOpening && state.openingTile) {
      result = playTile(state, current.userId, state.openingTile, 'right');
    } else if (moves.length > 0) {
      result = playTile(state, current.userId, moves[0].tile, moves[0].side);
    } else {
      result = passTurn(state, current.userId);
    }

    if (!result.ok) {
      console.error(`[Domino] auto-move falló en room ${roomId}: ${result.error}`);
      startTurnTimer(io, roomId); // nunca dejar la mesa sin timer
      return;
    }

    io.to(`domino:${roomId}`).emit('domino:turn_timeout', {
      userId: current.userId,
      position: state.currentTurn,
    });

    void applyMove(io, roomId, result.newState);
  }, TURN_TIMEOUT_MS);

  turnTimers.set(roomId, timer);
}

// ─── Aplicar una jugada (único camino) ───────────────────────
async function applyMove(io: Server, roomId: number, newState: GameState) {
  if (newState.status === 'finished') {
    clearTurnTimer(roomId);
    await saveState(newState);

    // ¿Hay un PARTIDO a puntos activo en esta sala?
    const match = matches.get(roomId);
    if (match && match.status === 'playing') {
      await handleHandEndForMatch(io, roomId, newState, match);
      return;
    }

    // Juego suelto de una sola mano (comportamiento original).
    await persistGameResult(newState);
    const map = roomSockets.get(roomId);
    if (map) {
      for (const [uid, sid] of map.entries()) {
        io.to(sid).emit('domino:state', getSafeState(newState, uid));
        io.to(sid).emit('domino:finished', {
          winnerPosition: newState.winnerPosition,
          winnerTeam: newState.winnerTeam,
          winType: newState.winType,
          scores: newState.scores,
          handPoints: newState.handPoints,
        });
      }
    }

    gameStates.delete(roomId);
    roomSockets.delete(roomId);
    await pool
      .query(`UPDATE dc_domino_rooms SET status = 'finished', game_state = NULL WHERE id = $1`, [roomId])
      .catch(err => console.error('[Domino] cleanup failed:', err));
    return;
  }

  await saveState(newState);
  emitStateToAllPlayers(io, newState);
  startTurnTimer(io, roomId);
}

// ─── Fin de mano dentro de un PARTIDO a puntos ───────────────
/**
 * Se llama cuando una mano termina y hay un MatchState activo:
 *  1. Actualiza el partido con la mano terminada.
 *  2. Revela las fichas del equipo perdedor a todos.
 *  3. Emite el resultado de la mano + marcador acumulado.
 *  4. Tras HAND_REVEAL_MS: si el partido terminó, lo cierra;
 *     si no, reparte la mano siguiente y arranca su timer.
 */
async function handleHandEndForMatch(
  io: Server,
  roomId: number,
  finishedHand: GameState,
  match: MatchState
) {
  // 1. Meter la mano terminada en el partido y calcular el avance.
  let updated = updateCurrentHand(match, finishedHand);
  const advanced = advanceAfterHand(updated);
  matches.set(roomId, advanced);
  await saveMatch(advanced);

  // El equipo perdedor de ESTA mano (para revelar sus fichas).
  const lastEntry = advanced.history[advanced.history.length - 1];
  const losingTeam: 0 | 1 | null =
    lastEntry && lastEntry.winningTeam !== null
      ? (lastEntry.winningTeam === 0 ? 1 : 0)
      : null;

  // 2 + 3. Emitir el fin de mano con las fichas del perdedor visibles.
  const map = roomSockets.get(roomId);
  if (map) {
    for (const [uid, sid] of map.entries()) {
      io.to(sid).emit('domino:hand_finished', {
        handNumber: lastEntry?.handNumber,
        winningTeam: lastEntry?.winningTeam,
        losingTeam,
        pointsAwarded: lastEntry?.points ?? 0,
        winType: lastEntry?.winType,
        score: advanced.score,          // marcador acumulado por pareja
        targetScore: advanced.targetScore,
        // Fichas reveladas SOLO del equipo perdedor (transparencia de la cuenta).
        revealedHands: finishedHand.players
          .filter(p => p.team === losingTeam)
          .map(p => ({ position: p.position, username: p.username, hand: p.hand })),
        matchStatus: advanced.status,
        nextInMs: advanced.status === 'playing' ? HAND_REVEAL_MS : null,
      });
    }
  }

  // 4a. El PARTIDO terminó.
  if (advanced.status === 'finished') {
    await persistMatchResult(advanced);
    if (map) {
      for (const [uid, sid] of map.entries()) {
        io.to(sid).emit('domino:match_finished', {
          winnerTeam: advanced.winnerTeam,
          score: advanced.score,
          targetScore: advanced.targetScore,
          totalHands: advanced.handNumber,
        });
      }
    }
    matches.delete(roomId);
    gameStates.delete(roomId);
    roomSockets.delete(roomId);
    await pool
      .query(`UPDATE dc_domino_rooms SET status = 'finished', game_state = NULL, match_state = NULL WHERE id = $1`, [roomId])
      .catch(err => console.error('[Domino] match cleanup failed:', err));
    return;
  }

  // 4b. El partido sigue: la mano siguiente ya está repartida en advanced.currentHand.
  //     La activamos tras la cuenta regresiva.
  const nextHand = advanced.currentHand;
  gameStates.set(roomId, nextHand);
  await saveState(nextHand);

  clearHandAdvanceTimer(roomId);
  const t = setTimeout(() => {
    handAdvanceTimers.delete(roomId);
    const stillHere = matches.get(roomId);
    if (!stillHere || stillHere.status !== 'playing') return;
    // Emitir la nueva mano y arrancar su turno.
    emitStateToAllPlayers(io, nextHand);
    if (map) {
      for (const [uid, sid] of map.entries()) {
        io.to(sid).emit('domino:hand_started', {
          handNumber: stillHere.handNumber,
          starterPosition: stillHere.currentStarterPosition,
          score: stillHere.score,
        });
      }
    }
    startTurnTimer(io, roomId);
  }, HAND_REVEAL_MS);
  handAdvanceTimers.set(roomId, t);
}

function clearHandAdvanceTimer(roomId: number) {
  const t = handAdvanceTimers.get(roomId);
  if (t) clearTimeout(t);
  handAdvanceTimers.delete(roomId);
}

/** Persiste el MatchState en la DB (sobrevive reconexiones y restart). */
function saveMatch(match: MatchState): Promise<unknown> {
  matches.set(match.roomId, match);
  return pool
    .query(`UPDATE dc_domino_rooms SET match_state = $1 WHERE id = $2`, [
      JSON.stringify(match),
      match.roomId,
    ])
    .catch(err => console.error('[Domino] Failed to persist matchState:', err));
}

/** Registra el resultado del partido (sin tocar wallet — solo reporte). */
async function persistMatchResult(match: MatchState) {
  try {
    if (match.winnerTeam === null) return;
    const winners = match.roster.filter(r => r.team === match.winnerTeam);
    await pool.query(
      `INSERT INTO dc_domino_matches
         (room_id, winner_team, score_team0, score_team1, target_score, total_hands, winner_user_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        match.roomId,
        match.winnerTeam,
        match.score[0],
        match.score[1],
        match.targetScore,
        match.handNumber,
        JSON.stringify(winners.map(w => w.userId)),
      ]
    ).catch(() => {}); // si la tabla no existe aún, no romper el juego
  } catch (err) {
    console.error('[Domino] Error persisting match result:', err);
  }
}

// ─── Persistir resultado ─────────────────────────────────────
async function persistGameResult(state: GameState) {
  try {
    if (state.winnerPosition === null) return;
    const winner = state.players.find(p => p.position === state.winnerPosition);
    if (!winner) return;

    const isClosed = state.winType === 'closed';
    const pointsAwarded = state.scores[state.winnerPosition] ?? 0;
    const duration =
      state.finishedAt && state.startedAt ? Math.floor((state.finishedAt - state.startedAt) / 1000) : 0;

    await pool.query(
      `INSERT INTO dc_domino_games
         (room_id, winner_user_id, is_closed, points_awarded, rounds_played, duration_seconds, moves)
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [state.roomId, winner.userId, isClosed, pointsAwarded, duration, JSON.stringify(state.board)]
    );

    // Con equipos, gana la PAREJA. El compañero del ganador no es un perdedor.
    const useTeams = state.winnerTeam !== null && state.players.every(p => p.team === 0 || p.team === 1);
    const winners = useTeams
      ? state.players.filter(p => p.team === state.winnerTeam)
      : state.players.filter(p => p.position === state.winnerPosition);
    const losers = state.players.filter(p => !winners.some(w => w.userId === p.userId));

    for (const w of winners) {
      await pool.query(
        `INSERT INTO dc_domino_stats (user_id, games_played, games_won, games_closed, total_points, current_streak, longest_streak, last_played_at, updated_at)
         VALUES ($1, 1, 1, $2, $3, 1, 1, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           games_played  = dc_domino_stats.games_played + 1,
           games_won     = dc_domino_stats.games_won + 1,
           games_closed  = dc_domino_stats.games_closed + $2,
           total_points  = dc_domino_stats.total_points + $3,
           current_streak = dc_domino_stats.current_streak + 1,
           longest_streak = GREATEST(dc_domino_stats.longest_streak, dc_domino_stats.current_streak + 1),
           last_played_at = NOW(),
           updated_at = NOW()`,
        [w.userId, isClosed ? 1 : 0, w.position === state.winnerPosition ? pointsAwarded : 0]
      );
    }

    for (const l of losers) {
      await pool.query(
        `INSERT INTO dc_domino_stats (user_id, games_played, current_streak, last_played_at, updated_at)
         VALUES ($1, 1, 0, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           games_played = dc_domino_stats.games_played + 1,
           current_streak = 0,
           last_played_at = NOW(),
           updated_at = NOW()`,
        [l.userId]
      );
    }
  } catch (err) {
    console.error('[Domino] Error persisting game result:', err);
  }
}

// ─── Anti-flood ──────────────────────────────────────────────
function tooFast(s: AuthSocket): boolean {
  const now = Date.now();
  if (s.lastActionAt && now - s.lastActionAt < MIN_ACTION_INTERVAL_MS) return true;
  s.lastActionAt = now;
  return false;
}

// ─── Setup principal ─────────────────────────────────────────
export function setupDominoSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    const s = socket as AuthSocket;

    const verify = (token: string) =>
      jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as {
        userId: number;
        username: string;
      };

    // ─── Auth por handshake ──────────────────────────────
    const handshakeToken = (s.handshake?.auth as { token?: string } | undefined)?.token;
    if (handshakeToken) {
      try {
        const payload = verify(handshakeToken);
        s.userId = payload.userId;
        s.username = payload.username;
        s.emit('auth:ok', { userId: s.userId, username: s.username });
      } catch {
        s.emit('auth:error', { error: 'Token inválido' });
        s.disconnect();
        return;
      }
    }

    // ─── Fallback: evento 'auth' ─────────────────────────
    s.on('auth', (data: { token: string }) => {
      if (s.userId) {
        s.emit('auth:ok', { userId: s.userId, username: s.username });
        return;
      }
      try {
        const payload = verify(data?.token);
        s.userId = payload.userId;
        s.username = payload.username;
        s.emit('auth:ok', { userId: s.userId, username: s.username });
      } catch {
        s.emit('auth:error', { error: 'Token inválido' });
        s.disconnect();
      }
    });

    // ─── Join ────────────────────────────────────────────
    s.on('domino:join', async (data: { roomId: number }) => {
      try {
        if (!s.userId) { s.emit('error', { event: 'domino:join', error: 'No autenticado' }); return; }
        const roomId = Number(data?.roomId);
        if (!Number.isInteger(roomId)) return;

        const member = await pool.query(
          `SELECT position FROM dc_domino_players WHERE room_id = $1 AND user_id = $2`,
          [roomId, s.userId]
        );
        if (member.rows.length === 0) {
          s.emit('error', { event: 'domino:join', error: 'No eres parte de esta mesa' });
          return;
        }

        s.join(`domino:${roomId}`);
        s.roomId = roomId;
        trackSocket(roomId, s.userId, s.id);

        await pool.query(
          `UPDATE dc_domino_players SET is_connected = true, socket_id = $1 WHERE room_id = $2 AND user_id = $3`,
          [s.id, roomId, s.userId]
        );

        let state = getOrLoadState(roomId);
        if (!state) state = await loadStateFromDB(roomId);
        if (state) {
          s.emit('domino:state', getSafeState(state, s.userId));
          // Tras un restart del backend el timer no existe: hay que revivirlo
          // o la mesa restaurada queda congelada.
          if (state.status === 'playing' && !turnTimers.has(roomId)) {
            startTurnTimer(io, roomId);
          }
        }

        s.to(`domino:${roomId}`).emit('domino:player_joined', { userId: s.userId });
      } catch (err) {
        console.error('[Domino] join error:', err);
        s.emit('error', { event: 'domino:join', error: 'Error al unirse' });
      }
    });

    // ─── Start ───────────────────────────────────────────
    s.on('domino:start', async () => {
      try {
        if (!s.userId) return;
        const roomId = s.roomId;
        if (!roomId) {
          s.emit('error', { event: 'domino:start', error: 'No estás en una sala' });
          return;
        }

        // Lock de la sala: dos 'start' simultáneos repartían dos veces.
        const client = await pool.connect();
        let state: GameState;
        try {
          await client.query('BEGIN');
          const roomResult = await client.query(
            `SELECT id, host_user_id, status, game_mode, team_mode, target_score FROM dc_domino_rooms WHERE id = $1 FOR UPDATE`,
            [roomId]
          );
          if (roomResult.rows.length === 0) { await client.query('ROLLBACK'); return; }
          const room = roomResult.rows[0];

          if (room.host_user_id !== s.userId) {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:start', error: 'Solo el host puede iniciar' });
            return;
          }
          if (room.status !== 'waiting') {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:start', error: 'La mesa ya empezó' });
            return;
          }

          const playersResult = await client.query(
            `SELECT p.user_id, p.position, p.team, u.username
             FROM dc_domino_players p
             JOIN dc_users u ON u.id = p.user_id
             WHERE p.room_id = $1
             ORDER BY p.position`,
            [roomId]
          );
          if (playersResult.rows.length < 2) {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:start', error: 'Mínimo 2 jugadores' });
            return;
          }

          // ─── FASE 1: modo parejas (teams) ────────────────
          // Reasignamos asientos y equipos ANTES de crear el estado.
          //  - random: se sortea acá.
          //  - manual/choose: los equipos ya están en la DB; validamos 2-2.
          let seatByUser: Record<number, { position: Position; team: TeamId | null }> = {};

          if (room.game_mode === 'teams') {
            if (playersResult.rows.length !== 4) {
              await client.query('ROLLBACK');
              s.emit('error', { event: 'domino:start', error: 'El modo parejas necesita 4 jugadores' });
              return;
            }

            const members: RoomMember[] = playersResult.rows.map(r => ({
              userId: r.user_id,
              team: (r.team === 0 || r.team === 1 ? r.team : null) as TeamId | null,
            }));

            const teamMode = (room.team_mode || 'random') as TeamMode;

            if (teamMode !== 'random') {
              const v = validateTeams(members);
              if (!v.ok) {
                await client.query('ROLLBACK');
                s.emit('error', { event: 'domino:start', error: v.error });
                return;
              }
            }

            let seats;
            try {
              seats = assignTeamSeats(members, teamMode);
            } catch (e: any) {
              await client.query('ROLLBACK');
              s.emit('error', { event: 'domino:start', error: e.message || 'Error armando equipos' });
              return;
            }

            // Persistimos los asientos/equipos definitivos.
            for (const s2 of seats) {
              seatByUser[s2.userId] = { position: s2.position as Position, team: s2.team };
              await client.query(
                `UPDATE dc_domino_players SET position = $1, team = $2 WHERE room_id = $3 AND user_id = $4`,
                [s2.position, s2.team, roomId, s2.userId]
              );
            }
          }

          const players: PlayerState[] = playersResult.rows.map(r => {
            const override = seatByUser[r.user_id];
            return {
              userId: r.user_id,
              username: r.username,
              position: (override ? override.position : r.position) as Position,
              team: override ? override.team : r.team,
              hand: [],
              connected: true,
            };
          });

          state = createInitialState(roomId, players);

          // ─── PARTIDO A PUNTOS ────────────────────────────
          // Si la sala tiene objetivo de puntos Y es modo parejas, se juega un
          // PARTIDO (varias manos). Si no, es una mano suelta (como antes).
          const target = Number(room.target_score);
          const isMatch = room.game_mode === 'teams' && Number.isInteger(target) && target > 0;
          let match: MatchState | null = null;
          if (isMatch) {
            match = createMatch(roomId, players, target);
            // La primera mano del partido ES la que acabamos de crear en el motor.
            state = match.currentHand;
          }

          await client.query(
            `UPDATE dc_domino_rooms SET status = 'playing', started_at = NOW(), game_state = $2, match_state = $3 WHERE id = $1`,
            [roomId, JSON.stringify(state), match ? JSON.stringify(match) : null]
          );
          await client.query('COMMIT');
          if (match) matches.set(roomId, match);
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }

        gameStates.set(roomId, state);

        const map = roomSockets.get(roomId);
        for (const p of state.players) {
          const sid = map?.get(p.userId);
          if (!sid) continue;
          const safe = getSafeState(state, p.userId);
          io.to(sid).emit('domino:state', safe);
          io.to(sid).emit('domino:started', { state: safe });
        }

        startTurnTimer(io, roomId);
      } catch (err) {
        console.error('[Domino] start error:', err);
        s.emit('error', { event: 'domino:start', error: 'Error al iniciar' });
      }
    });

    // ─── FASE 1: elegir equipo (modo 'choose') ───────────
    // Cada jugador elige su color. Cupo 2 por equipo.
    s.on('domino:choose_team', async (data: { team: 0 | 1; roomId?: number }) => {
      try {
        if (!s.userId) return;
        // s.roomId puede perderse tras una reconexión de Socket.IO. Aceptamos
        // el roomId del payload como respaldo y re-vinculamos el socket.
        const roomId = s.roomId || Number(data?.roomId);
        if (!roomId || !Number.isInteger(roomId)) return;
        if (!s.roomId) {
          // Re-vincular: el socket se reconectó sin rehacer join.
          const member = await pool.query(
            `SELECT 1 FROM dc_domino_players WHERE room_id = $1 AND user_id = $2`,
            [roomId, s.userId]
          );
          if (member.rows.length === 0) return;
          s.join(`domino:${roomId}`);
          s.roomId = roomId;
          trackSocket(roomId, s.userId, s.id);
        }
        const team = data?.team;
        if (team !== 0 && team !== 1) {
          s.emit('error', { event: 'domino:choose_team', error: 'Equipo inválido' });
          return;
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const roomRes = await client.query(
            `SELECT game_mode, team_mode, status FROM dc_domino_rooms WHERE id = $1 FOR UPDATE`,
            [s.roomId]
          );
          const room = roomRes.rows[0];
          if (!room || room.status !== 'waiting') {
            await client.query('ROLLBACK');
            return;
          }
          if (room.game_mode !== 'teams' || room.team_mode !== 'choose') {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:choose_team', error: 'Esta sala no permite elegir equipo' });
            return;
          }

          const membersRes = await client.query(
            `SELECT user_id, team FROM dc_domino_players WHERE room_id = $1`,
            [s.roomId]
          );
          const members: RoomMember[] = membersRes.rows.map(r => ({ userId: r.user_id, team: r.team }));
          const yaEstoy = members.find(m => m.userId === s.userId);

          // Si ya estaba en ese equipo, no hago nada.
          if (yaEstoy?.team === team) { await client.query('ROLLBACK'); return; }

          // Cupo: no contar mi lugar actual si ya estaba en el otro equipo.
          const otros = members.filter(m => m.userId !== s.userId);
          if (!canJoinTeam(otros, team as TeamId)) {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:choose_team', error: 'Ese equipo está lleno' });
            return;
          }

          await client.query(
            `UPDATE dc_domino_players SET team = $1 WHERE room_id = $2 AND user_id = $3`,
            [team, s.roomId, s.userId]
          );
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }

        await broadcastLobby(io, s.roomId);
      } catch (err) {
        console.error('[Domino] choose_team error:', err);
        s.emit('error', { event: 'domino:choose_team', error: 'Error al elegir equipo' });
      }
    });

    // ─── FASE 1: el host arma/reacomoda equipos ──────────
    // Funciona en modo 'manual' y también en 'choose' (el host reacomoda).
    // data.teams = [{ userId, team }, ...] con los 4 jugadores.
    s.on('domino:set_teams', async (data: { teams: Array<{ userId: number; team: 0 | 1 }>; roomId?: number }) => {
      try {
        if (!s.userId) return;
        // Igual que choose_team: s.roomId puede perderse tras reconexión.
        const roomId = s.roomId || Number(data?.roomId);
        if (!roomId || !Number.isInteger(roomId)) return;
        if (!s.roomId) {
          const member = await pool.query(
            `SELECT 1 FROM dc_domino_players WHERE room_id = $1 AND user_id = $2`,
            [roomId, s.userId]
          );
          if (member.rows.length === 0) return;
          s.join(`domino:${roomId}`);
          s.roomId = roomId;
          trackSocket(roomId, s.userId, s.id);
        }
        const teams = data?.teams;
        if (!Array.isArray(teams) || teams.length === 0) {
          s.emit('error', { event: 'domino:set_teams', error: 'Formato inválido' });
          return;
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const roomRes = await client.query(
            `SELECT host_user_id, game_mode, status FROM dc_domino_rooms WHERE id = $1 FOR UPDATE`,
            [s.roomId]
          );
          const room = roomRes.rows[0];
          if (!room || room.status !== 'waiting') { await client.query('ROLLBACK'); return; }

          if (room.host_user_id !== s.userId) {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:set_teams', error: 'Solo el host puede armar equipos' });
            return;
          }
          if (room.game_mode !== 'teams') {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:set_teams', error: 'Esta sala no es de parejas' });
            return;
          }

          const membersRes = await client.query(
            `SELECT user_id FROM dc_domino_players WHERE room_id = $1`,
            [s.roomId]
          );
          const validUserIds = new Set(membersRes.rows.map(r => r.user_id));

          // Validar que la asignación cubra exactamente a los jugadores reales.
          const asignados = new Set(teams.map(t => t.userId));
          const cadaUno = teams.every(t => validUserIds.has(t.userId) && (t.team === 0 || t.team === 1));
          if (!cadaUno || asignados.size !== validUserIds.size) {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:set_teams', error: 'La asignación no coincide con los jugadores' });
            return;
          }

          const v = validateTeams(teams.map(t => ({ userId: t.userId, team: t.team as TeamId })));
          if (!v.ok) {
            await client.query('ROLLBACK');
            s.emit('error', { event: 'domino:set_teams', error: v.error });
            return;
          }

          for (const t of teams) {
            await client.query(
              `UPDATE dc_domino_players SET team = $1 WHERE room_id = $2 AND user_id = $3`,
              [t.team, s.roomId, t.userId]
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }

        await broadcastLobby(io, s.roomId);
      } catch (err) {
        console.error('[Domino] set_teams error:', err);
        s.emit('error', { event: 'domino:set_teams', error: 'Error al armar equipos' });
      }
    });

    // ─── Play ────────────────────────────────────────────
    s.on('domino:play', (data: { tile: [number, number]; side: 'left' | 'right' }) => {
      try {
        if (!s.userId || !s.roomId) return;
        if (tooFast(s)) return;

        const state = getOrLoadState(s.roomId);
        if (!state || state.status !== 'playing') {
          s.emit('error', { event: 'domino:play', error: 'No hay juego activo' });
          return;
        }

        const result = playTile(state, s.userId, data?.tile, data?.side);
        if (!result.ok) {
          s.emit('error', { event: 'domino:play', error: result.error });
          return;
        }

        void applyMove(io, s.roomId, result.newState);
      } catch (err) {
        console.error('[Domino] play error:', err);
        s.emit('error', { event: 'domino:play', error: 'Error al jugar' });
      }
    });

    // ─── Pass ────────────────────────────────────────────
    s.on('domino:pass', () => {
      try {
        if (!s.userId || !s.roomId) return;
        if (tooFast(s)) return;

        const state = getOrLoadState(s.roomId);
        if (!state || state.status !== 'playing') {
          s.emit('error', { event: 'domino:pass', error: 'No hay juego activo' });
          return;
        }

        const result = passTurn(state, s.userId);
        if (!result.ok) {
          s.emit('error', { event: 'domino:pass', error: result.error });
          return;
        }

        void applyMove(io, s.roomId, result.newState);
      } catch (err) {
        console.error('[Domino] pass error:', err);
        s.emit('error', { event: 'domino:pass', error: 'Error al pasar' });
      }
    });

    // ─── Disconnect ──────────────────────────────────────
    s.on('disconnect', async () => {
      try {
        const { userId, roomId } = s;
        if (!userId || !roomId) return;

        untrackSocket(roomId, userId, s.id);

        await pool.query(
          `UPDATE dc_domino_players SET is_connected = false WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );

        s.to(`domino:${roomId}`).emit('domino:player_left', { userId });

        // Si no queda nadie mirando, no tiene sentido seguir auto-jugando.
        if (!roomSockets.has(roomId)) clearTurnTimer(roomId);
      } catch (err) {
        console.error('[Domino] disconnect error:', err);
      }
    });
  });
}
