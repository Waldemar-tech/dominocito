/**
 * Fase 1 — Lógica de equipos y sentado cruzado (M1 Parejas 2v2)
 *
 * Este módulo NO reimplementa el motor. Solo decide:
 *   - qué asiento (position) le toca a cada jugador según el modo de armado
 *   - cómo se validan los equipos antes de empezar
 *
 * El sentado cruzado es el estándar del dominó de parejas:
 *   equipo 0 → asientos 0 y 2 (enfrentados)
 *   equipo 1 → asientos 1 y 3 (enfrentados)
 * Así el turno 0→1→2→3 alterna rival · compañero · rival, que es lo que
 * hace que "se sienta" un 2v2 y no un 1v1v1v1.
 *
 * Para 1v1 (M2/M3): asientos 0 y 2 (enfrentados). Decisión registrada en
 * PLAN_FASES.md, punto A.
 */

export type GameMode = 'individual' | 'teams';
export type TeamMode = 'manual' | 'choose' | 'random';
export type TeamId = 0 | 1;

export interface SeatAssignment {
  userId: number;
  position: 0 | 1 | 2 | 3;
  team: TeamId | null;
}

export interface RoomMember {
  userId: number;
  /** En modo 'choose' o 'manual', el equipo ya elegido. null si aún no. */
  team?: TeamId | null;
}

// ─── RNG (mismo criterio que el motor: nada de Math.random con plata) ──
import { randomInt } from 'crypto';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Asientos cruzados ───────────────────────────────────────
/** Asientos de cada equipo. Equipo 0 enfrentado en 0-2, equipo 1 en 1-3. */
export const TEAM_SEATS: Record<TeamId, [number, number]> = {
  0: [0, 2],
  1: [1, 3],
};

/** Asientos para 1v1 (enfrentados). */
export const HEADS_UP_SEATS: [number, number] = [0, 2];

// ─── Validación ──────────────────────────────────────────────
export type TeamValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * ¿Los equipos están listos para empezar una partida 2v2?
 * Exige exactamente 4 jugadores, 2 por equipo, sin nadie sin equipo.
 */
export function validateTeams(members: RoomMember[]): TeamValidation {
  if (members.length !== 4) {
    return { ok: false, error: 'El modo parejas necesita exactamente 4 jugadores' };
  }
  const sinEquipo = members.filter(m => m.team !== 0 && m.team !== 1);
  if (sinEquipo.length > 0) {
    return { ok: false, error: 'Todos los jugadores deben tener un equipo asignado' };
  }
  const count0 = members.filter(m => m.team === 0).length;
  const count1 = members.filter(m => m.team === 1).length;
  if (count0 !== 2 || count1 !== 2) {
    return { ok: false, error: 'Cada equipo debe tener exactamente 2 jugadores' };
  }
  return { ok: true };
}

/** ¿Puede un jugador unirse al equipo `team` en modo 'choose'? (cupo 2). */
export function canJoinTeam(members: RoomMember[], team: TeamId): boolean {
  return members.filter(m => m.team === team).length < 2;
}

// ─── Asignación de asientos ──────────────────────────────────
/**
 * Convierte una lista de miembros (con su equipo ya definido) en asientos
 * cruzados concretos. Determinista dado el orden de entrada, salvo 'random'.
 *
 * @throws si los equipos no son válidos para 2v2.
 */
export function assignTeamSeats(members: RoomMember[], mode: TeamMode): SeatAssignment[] {
  let withTeams: Array<{ userId: number; team: TeamId }>;

  if (mode === 'random') {
    // Sorteo: mezclar los 4 y partir en dos parejas.
    const shuffled = shuffle(members.map(m => m.userId));
    withTeams = shuffled.map((userId, i) => ({ userId, team: (i < 2 ? 0 : 1) as TeamId }));
  } else {
    // 'manual' o 'choose': el equipo ya viene decidido. Validamos.
    const v = validateTeams(members);
    if (!v.ok) throw new Error(v.error);
    withTeams = members.map(m => ({ userId: m.userId, team: m.team as TeamId }));
  }

  // Repartir asientos dentro de cada equipo.
  const seatsLeft: Record<TeamId, number[]> = {
    0: [...TEAM_SEATS[0]],
    1: [...TEAM_SEATS[1]],
  };

  return withTeams.map(({ userId, team }) => {
    const position = seatsLeft[team].shift();
    if (position === undefined) {
      throw new Error(`Equipo ${team} tiene más de 2 jugadores`);
    }
    return { userId, position: position as 0 | 1 | 2 | 3, team };
  });
}

/** Asientos para modo individual: 0..n-1 por orden de entrada. */
export function assignIndividualSeats(members: RoomMember[]): SeatAssignment[] {
  return members.map((m, i) => ({ userId: m.userId, position: i as 0 | 1 | 2 | 3, team: null }));
}

/** Asientos para 1v1: los dos jugadores enfrentados (0 y 2). */
export function assignHeadsUpSeats(members: RoomMember[]): SeatAssignment[] {
  if (members.length !== 2) throw new Error('1v1 necesita exactamente 2 jugadores');
  return members.map((m, i) => ({
    userId: m.userId,
    position: HEADS_UP_SEATS[i] as 0 | 1 | 2 | 3,
    team: null,
  }));
}
