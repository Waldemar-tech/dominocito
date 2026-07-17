/**
 * Motor de PARTIDO (dominó venezolano a puntos)
 *
 * Un PARTIDO son varias MANOS jugadas hasta que una pareja llega o pasa el
 * objetivo (ej. 100). Cada mano es un GameState del motor de mano
 * (domino-classic.ts); este módulo las orquesta:
 *
 *   - lleva el marcador acumulado por pareja
 *   - decide quién SALE en cada mano (rotación de asientos a la derecha)
 *   - suma el puntaje de cada mano al marcador
 *   - detecta cuándo terminó el PARTIDO
 *
 * Reglas confirmadas con el usuario:
 *   - Mano 1: abre el 6:6 (doble más alto), ficha obligatoria.
 *   - Mano 2+: abre el siguiente asiento a la derecha (rotación), ficha LIBRE.
 *   - Tras tranca: se respeta la misma rotación.
 *   - Puntos por dominó: la pareja ganadora suma las fichas de los rivales.
 *   - Puntos por tranca: el equipo con MÁS puntos pierde; el rival suma esos puntos.
 *   - Fin del partido: gana quien LLEGA O PASA el objetivo.
 *
 * NO toca wallet ni pagos. Solo reporta quién ganó el partido.
 *
 * El MatchState NO reemplaza al GameState: lo CONTIENE (currentHand).
 * Así el motor de mano ya probado queda intacto.
 */

import {
  GameState,
  PlayerState,
  createInitialState,
  seatOrder,
  handScoreForMatch,
} from './domino-classic';

export interface MatchState {
  roomId: number;
  status: 'playing' | 'finished';
  /** Objetivo de puntos para ganar el partido (100, 200, o custom). */
  targetScore: number;
  /** Marcador acumulado por pareja. */
  score: Record<0 | 1, number>;
  /** Número de mano actual (1-based). */
  handNumber: number;
  /** Asiento que ABRE la mano actual. */
  currentStarterPosition: number;
  /** Snapshot de los jugadores del partido (identidad + equipos, sin manos). */
  roster: Array<Pick<PlayerState, 'userId' | 'username' | 'position' | 'team'>>;
  /** La mano en curso. */
  currentHand: GameState;
  /** Historial de manos: cuánto sumó cada una. */
  history: Array<{
    handNumber: number;
    winningTeam: 0 | 1 | null;
    points: number;
    winType: 'domino' | 'closed' | null;
    starterPosition: number;
  }>;
  /** Pareja ganadora del PARTIDO (cuando status === 'finished'). */
  winnerTeam: 0 | 1 | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Asientos ocupados, ordenados. Reusa la lógica de asientos del motor de mano. */
function seatsOf(hand: GameState): number[] {
  return seatOrder(hand);
}

/** El siguiente asiento a la derecha (rotación de salida). */
function nextStarter(hand: GameState, from: number): number {
  const seats = seatsOf(hand);
  const i = seats.indexOf(from);
  if (i === -1) return seats[0];
  return seats[(i + 1) % seats.length];
}

// ─── Crear partido ───────────────────────────────────────────
export function createMatch(
  roomId: number,
  players: PlayerState[],
  targetScore: number
): MatchState {
  if (!Number.isInteger(targetScore) || targetScore < 1) {
    throw new Error('El objetivo del partido debe ser un entero positivo');
  }

  // Mano 1: sin starter forzado → el motor usa el doble más alto (6:6).
  const firstHand = createInitialState(roomId, players);

  const roster = players.map(p => ({
    userId: p.userId,
    username: p.username,
    position: p.position,
    team: p.team,
  }));

  return {
    roomId,
    status: 'playing',
    targetScore,
    score: { 0: 0, 1: 0 },
    handNumber: 1,
    currentStarterPosition: firstHand.currentTurn,
    roster,
    currentHand: firstHand,
    history: [],
    winnerTeam: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
}

// ─── Reemplazar la mano en curso con su versión actualizada ──
/**
 * Cada vez que el motor de mano produce un nuevo GameState (jugada/pase),
 * el socket llama a esto para guardarlo dentro del partido. Si la mano
 * terminó, NO avanza sola: hay que llamar advanceAfterHand() explícitamente
 * (para dar tiempo a mostrar el resultado de la mano en la UI).
 */
export function updateCurrentHand(match: MatchState, newHand: GameState): MatchState {
  return { ...match, currentHand: newHand };
}

/** ¿La mano en curso terminó? */
export function isHandOver(match: MatchState): boolean {
  return match.currentHand.status === 'finished';
}

// ─── Avanzar el partido tras terminar una mano ───────────────
/**
 * Suma el puntaje de la mano terminada al marcador, decide si el partido
 * terminó, y si no, reparte la mano siguiente con el starter rotado.
 *
 * Devuelve el MatchState actualizado. Si el partido terminó, status pasa a
 * 'finished' y winnerTeam queda seteado; currentHand queda como la última
 * mano jugada (para mostrar el resultado final).
 */
export function advanceAfterHand(match: MatchState): MatchState {
  const hand = match.currentHand;
  if (hand.status !== 'finished') return match; // nada que hacer

  const scored = handScoreForMatch(hand);
  const newScore: Record<0 | 1, number> = { ...match.score };
  let winningTeam: 0 | 1 | null = null;

  if (scored) {
    winningTeam = scored.winningTeam;
    newScore[scored.winningTeam] += scored.points;
  }

  const historyEntry = {
    handNumber: match.handNumber,
    winningTeam,
    points: scored?.points ?? 0,
    winType: hand.winType,
    starterPosition: match.currentStarterPosition,
  };
  const history = [...match.history, historyEntry];

  // ¿Alguien llegó o pasó el objetivo?
  const reached0 = newScore[0] >= match.targetScore;
  const reached1 = newScore[1] >= match.targetScore;

  if (reached0 || reached1) {
    // Si ambos pasan en la misma mano (raro), gana el de MÁS puntos.
    let matchWinner: 0 | 1;
    if (reached0 && reached1) matchWinner = newScore[0] >= newScore[1] ? 0 : 1;
    else matchWinner = reached0 ? 0 : 1;

    return {
      ...match,
      status: 'finished',
      score: newScore,
      history,
      winnerTeam: matchWinner,
      finishedAt: Date.now(),
    };
  }

  // El partido sigue: repartir la mano siguiente con starter rotado.
  const nextStarterPos = nextStarter(hand, match.currentStarterPosition);

  // Reconstruir los players del roster (sin manos; createInitialState reparte).
  const players: PlayerState[] = match.roster.map(r => ({
    userId: r.userId,
    username: r.username,
    position: r.position,
    team: r.team,
    hand: [],
    connected: true,
  }));

  // Mano 2+: starter forzado + ficha libre (no obliga al 6:6).
  const nextHand = createInitialState(match.roomId, players, {
    starterPosition: nextStarterPos,
    freeOpening: true,
  });

  return {
    ...match,
    score: newScore,
    history,
    handNumber: match.handNumber + 1,
    currentStarterPosition: nextStarterPos,
    currentHand: nextHand,
  };
}

// ─── Migración de partidos viejos persistidos ────────────────
export function migrateMatch(match: MatchState): MatchState {
  return {
    ...match,
    score: match.score ?? { 0: 0, 1: 0 },
    history: match.history ?? [],
    winnerTeam: match.winnerTeam ?? null,
  };
}
