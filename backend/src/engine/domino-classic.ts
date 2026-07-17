/**
 * Dominó Clásico — Motor de Juego
 *
 * Reglas venezolanas estándar:
 * - 2 o 4 jugadores, 28 fichas doble-6, 7 fichas por mano
 * - SALIDA OBLIGATORIA: sale el doble más alto de la mesa (normalmente el 6|6).
 *   Si nadie tiene doble, sale la ficha de más puntos.
 * - El turno va a la izquierda (siguiente asiento ocupado)
 * - Se puede pasar SOLO si no tenés ficha que sirva
 * - Gana quien se queda sin fichas ("dominó")
 * - Si se tranca (todos pasan seguido), gana quien tenga menos puntos
 * - Con 4 jugadores y equipos asignados, se resuelve por puntos de pareja
 *
 * GameState es serializable a JSON (Socket.IO + columna game_state).
 */

import { randomInt } from 'crypto';

// ─── Tipos ────────────────────────────────────────────────────
export type Tile = [number, number]; // [a, b], siempre a <= b
export type Position = 0 | 1 | 2 | 3;
export type Side = 'left' | 'right';

/** Centinela para las fichas ocultas de los oponentes. NO es una ficha real. */
export const HIDDEN_TILE: Tile = [-1, -1];

export interface PlayerState {
  userId: number;
  username: string;
  position: Position;
  team: 0 | 1 | null;
  hand: Tile[];
  connected: boolean;
}

export interface PlayedTile {
  tile: Tile;
  userId: number;
  side: Side;
  order: number;
}

export interface GameState {
  roomId: number;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  players: PlayerState[];
  currentTurn: number;              // posición (asiento) del jugador actual
  board: PlayedTile[];
  leftEnd: number | null;
  rightEnd: number | null;
  passesInRow: number;
  winnerPosition: number | null;
  winnerTeam: 0 | 1 | null;
  winType: 'domino' | 'closed' | null;
  /** Puntos ganados por el ganador (suma de las manos rivales). */
  scores: Record<number, number>;
  /** Puntos que quedaron en la mano de cada posición al terminar. */
  handPoints: Record<number, number>;
  /** Ficha de salida obligatoria (doble más alto). Se fija al repartir. */
  openingTile: Tile | null;
  /** Última posición que pasó. Usado para desempatar la tranca. */
  lastPasserPosition: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  moveCount: number;
}

export type MoveResult =
  | { ok: true; newState: GameState }
  | { ok: false; error: string };

// ─── Constantes ──────────────────────────────────────────────
const ALL_TILES: Tile[] = (() => {
  const t: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) t.push([a, b]);
  }
  return t;
})();

const TILES_PER_HAND = 7;

// ─── Utilidades ──────────────────────────────────────────────
export function tileToString(t: Tile): string {
  return `${t[0]}|${t[1]}`;
}

export function parseTile(s: string): Tile {
  const [a, b] = s.split('|').map(Number);
  return a <= b ? [a, b] : [b, a];
}

export function normalizeTile(t: Tile): Tile {
  return t[0] <= t[1] ? [t[0], t[1]] : [t[1], t[0]];
}

export function tileValue(t: Tile): number {
  return t[0] + t[1];
}

export function handValue(hand: Tile[]): number {
  return hand.reduce((sum, t) => sum + tileValue(t), 0);
}

export function isDouble(t: Tile): boolean {
  return t[0] === t[1];
}

/**
 * Valida que lo que mandó el cliente sea una ficha real de doble-6.
 * Sin esto, un cliente puede mandar basura y romper las comparaciones.
 */
export function isValidTile(t: unknown): t is Tile {
  return (
    Array.isArray(t) &&
    t.length === 2 &&
    Number.isInteger(t[0]) &&
    Number.isInteger(t[1]) &&
    t[0] >= 0 && t[0] <= 6 &&
    t[1] >= 0 && t[1] <= 6
  );
}

export function isValidSide(s: unknown): s is Side {
  return s === 'left' || s === 'right';
}

// ─── Asientos ────────────────────────────────────────────────
/**
 * Los asientos (position) NO son índices del array de players.
 * Si alguien sale del lobby quedan huecos (ej: 0 y 2 ocupados de 4).
 * Todo el avance de turno pasa por acá.
 */
export function seatOrder(state: GameState): number[] {
  return state.players.map(p => p.position).sort((a, b) => a - b);
}

export function nextPosition(state: GameState, from: number): number {
  const seats = seatOrder(state);
  const i = seats.indexOf(from);
  if (i === -1) return seats[0];
  return seats[(i + 1) % seats.length];
}

// ─── Mazo ────────────────────────────────────────────────────
/** Fisher-Yates con RNG criptográfico. Math.random() no sirve con dinero de por medio. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createDeck(): Tile[] {
  return shuffle(ALL_TILES);
}

export function dealTiles(deck: Tile[], numPlayers = 4): { hands: Tile[][]; remaining: Tile[] } {
  const hands: Tile[][] = Array.from({ length: numPlayers }, () => []);
  const tilesToDeal = numPlayers * TILES_PER_HAND;
  for (let i = 0; i < tilesToDeal; i++) {
    hands[i % numPlayers].push(deck[i]);
  }
  for (const h of hands) h.sort((a, b) => tileValue(a) - tileValue(b));
  return { hands, remaining: deck.slice(tilesToDeal) };
}

// ─── Salida obligatoria ──────────────────────────────────────
/**
 * Devuelve el índice de mano que sale y CON QUÉ ficha.
 * Doble más alto; si no hay dobles, ficha de más puntos
 * (desempate: el pip más alto, luego el más bajo — determinista).
 */
export function findOpeningTile(hands: Tile[][]): { handIdx: number; tile: Tile } {
  let bestDouble: { handIdx: number; tile: Tile } | null = null;
  for (let p = 0; p < hands.length; p++) {
    for (const t of hands[p]) {
      if (isDouble(t) && (!bestDouble || t[0] > bestDouble.tile[0])) {
        bestDouble = { handIdx: p, tile: t };
      }
    }
  }
  if (bestDouble) return bestDouble;

  let best: { handIdx: number; tile: Tile } | null = null;
  for (let p = 0; p < hands.length; p++) {
    for (const t of hands[p]) {
      if (!best) { best = { handIdx: p, tile: t }; continue; }
      const bv = tileValue(best.tile);
      const tv = tileValue(t);
      if (tv > bv || (tv === bv && Math.max(...t) > Math.max(...best.tile))) {
        best = { handIdx: p, tile: t };
      }
    }
  }
  return best ?? { handIdx: 0, tile: hands[0][0] };
}

// ─── Encaje ──────────────────────────────────────────────────
export function canPlayTile(tile: Tile, leftEnd: number | null, rightEnd: number | null): Side | false {
  if (leftEnd === null && rightEnd === null) return 'right'; // primera ficha
  if (leftEnd !== null && (tile[0] === leftEnd || tile[1] === leftEnd)) return 'left';
  if (rightEnd !== null && (tile[0] === rightEnd || tile[1] === rightEnd)) return 'right';
  return false;
}

export function hasPlayableTile(hand: Tile[], leftEnd: number | null, rightEnd: number | null): boolean {
  return hand.some(t => canPlayTile(t, leftEnd, rightEnd) !== false);
}

/** Todas las jugadas legales de una mano. Útil para el auto-play del timeout. */
export function legalMoves(hand: Tile[], leftEnd: number | null, rightEnd: number | null): Array<{ tile: Tile; side: Side }> {
  const out: Array<{ tile: Tile; side: Side }> = [];
  for (const t of hand) {
    if (leftEnd === null && rightEnd === null) { out.push({ tile: t, side: 'right' }); continue; }
    if (leftEnd !== null && (t[0] === leftEnd || t[1] === leftEnd)) out.push({ tile: t, side: 'left' });
    if (rightEnd !== null && (t[0] === rightEnd || t[1] === rightEnd)) out.push({ tile: t, side: 'right' });
  }
  return out;
}

// ─── Equipos ─────────────────────────────────────────────────
function teamsEnabled(players: PlayerState[]): boolean {
  return players.length === 4 && players.every(p => p.team === 0 || p.team === 1);
}

function computeHandPoints(players: PlayerState[]): Record<number, number> {
  const hp: Record<number, number> = {};
  for (const p of players) hp[p.position] = handValue(p.hand);
  return hp;
}

/** Puntos que se lleva el ganador: la suma de las manos rivales (o del equipo rival). */
function awardedPoints(players: PlayerState[], winnerPos: number): number {
  const winner = players.find(p => p.position === winnerPos);
  if (!winner) return 0;
  if (teamsEnabled(players) && winner.team !== null) {
    return players
      .filter(p => p.team !== winner.team)
      .reduce((s, p) => s + handValue(p.hand), 0);
  }
  return players
    .filter(p => p.position !== winnerPos)
    .reduce((s, p) => s + handValue(p.hand), 0);
}

function finishState(
  state: GameState,
  players: PlayerState[],
  winnerPos: number,
  winType: 'domino' | 'closed',
  extra: Partial<GameState> = {}
): GameState {
  const winner = players.find(p => p.position === winnerPos) ?? null;
  return {
    ...state,
    ...extra,
    players,
    status: 'finished',
    winType,
    winnerPosition: winnerPos,
    winnerTeam: winner?.team ?? null,
    finishedAt: Date.now(),
    handPoints: computeHandPoints(players),
    scores: { [winnerPos]: awardedPoints(players, winnerPos) },
  };
}

/**
 * Resolución de tranca.
 *
 * Con equipos: gana la pareja con menos puntos sumados.
 * Sin equipos: gana el jugador con menos puntos.
 *
 * DESEMPATE (regla configurable — ver CAMBIOS.md): gana el que trancó,
 * es decir el último que pasó. Si el que trancó no está empatado en el
 * mínimo, se toma el primer empatado siguiendo el orden de asientos
 * desde él. Es determinista y no depende del orden del array.
 */
function resolveTranca(state: GameState): GameState {
  const players = state.players;
  const hp = computeHandPoints(players);
  const lastPasser = state.lastPasserPosition ?? state.currentTurn;
  const seats = seatOrder(state);

  const orderedFromPasser = (() => {
    const i = Math.max(0, seats.indexOf(lastPasser));
    return [...seats.slice(i), ...seats.slice(0, i)];
  })();

  let winnerPos: number;

  if (teamsEnabled(players)) {
    const teamPoints: Record<number, number> = { 0: 0, 1: 0 };
    for (const p of players) teamPoints[p.team as 0 | 1] += hp[p.position];

    let winningTeam: 0 | 1;
    if (teamPoints[0] < teamPoints[1]) winningTeam = 0;
    else if (teamPoints[1] < teamPoints[0]) winningTeam = 1;
    else winningTeam = (players.find(p => p.position === lastPasser)?.team ?? 0) as 0 | 1;

    // Representante del equipo ganador: el de menos puntos (determinista por asiento)
    const teamSeats = orderedFromPasser.filter(
      pos => players.find(p => p.position === pos)?.team === winningTeam
    );
    winnerPos = teamSeats.reduce((best, pos) => (hp[pos] < hp[best] ? pos : best), teamSeats[0]);
  } else {
    const min = Math.min(...seats.map(pos => hp[pos]));
    winnerPos = orderedFromPasser.find(pos => hp[pos] === min)!;
  }

  return finishState(state, players, winnerPos, 'closed', { passesInRow: 0 });
}

// ─── Jugar una ficha ─────────────────────────────────────────
export function playTile(
  state: GameState,
  userId: number,
  rawTile: Tile,
  rawSide: Side
): MoveResult {
  if (state.status !== 'playing') return { ok: false, error: 'La partida no está activa' };

  // Validación de entrada. Sin esto, un `side` desconocido saltaba TODAS
  // las comprobaciones de encaje y dejaba jugar cualquier ficha.
  if (!isValidSide(rawSide)) return { ok: false, error: 'Lado inválido' };
  if (!isValidTile(rawTile)) return { ok: false, error: 'Ficha inválida' };

  const tile = normalizeTile(rawTile);
  let side: Side = rawSide;

  const playerIdx = state.players.findIndex(p => p.userId === userId);
  if (playerIdx === -1) return { ok: false, error: 'No estás en la mesa' };

  const player = state.players[playerIdx];
  if (state.currentTurn !== player.position) return { ok: false, error: 'No es tu turno' };

  const tileIdx = player.hand.findIndex(t => tileToString(t) === tileToString(tile));
  if (tileIdx === -1) return { ok: false, error: 'No tenés esa ficha' };

  const isFirstTile = state.board.length === 0;

  let newLeft = state.leftEnd;
  let newRight = state.rightEnd;

  if (isFirstTile) {
    // Salida obligatoria: solo la ficha de salida abre la partida.
    if (state.openingTile && tileToString(state.openingTile) !== tileToString(tile)) {
      return { ok: false, error: `La salida es con el ${tileToString(state.openingTile)}` };
    }
    side = 'right';
    newLeft = tile[0];
    newRight = tile[1];
  } else {
    if (side === 'left') {
      if (state.leftEnd === null) return { ok: false, error: 'Lado izquierdo no disponible' };
      if (tile[0] !== state.leftEnd && tile[1] !== state.leftEnd) {
        return { ok: false, error: 'La ficha no encaja en el lado izquierdo' };
      }
      newLeft = tile[0] === state.leftEnd ? tile[1] : tile[0];
    } else {
      if (state.rightEnd === null) return { ok: false, error: 'Lado derecho no disponible' };
      if (tile[0] !== state.rightEnd && tile[1] !== state.rightEnd) {
        return { ok: false, error: 'La ficha no encaja en el lado derecho' };
      }
      newRight = tile[0] === state.rightEnd ? tile[1] : tile[0];
    }
  }

  const newHand = [...player.hand];
  newHand.splice(tileIdx, 1);

  const newBoard: PlayedTile[] = [...state.board, { tile, userId, side, order: state.moveCount }];
  const newPlayers = state.players.map((p, i) => (i === playerIdx ? { ...p, hand: newHand } : p));

  const base: GameState = {
    ...state,
    players: newPlayers,
    board: newBoard,
    leftEnd: newLeft,
    rightEnd: newRight,
    passesInRow: 0,
    moveCount: state.moveCount + 1,
  };

  // Dominó: se quedó sin fichas
  if (newHand.length === 0) {
    return { ok: true, newState: finishState(base, newPlayers, player.position, 'domino') };
  }

  return {
    ok: true,
    newState: { ...base, currentTurn: nextPosition(state, player.position) },
  };
}

// ─── Pasar turno ─────────────────────────────────────────────
export function passTurn(state: GameState, userId: number): MoveResult {
  if (state.status !== 'playing') return { ok: false, error: 'La partida no está activa' };

  const player = state.players.find(p => p.userId === userId);
  if (!player) return { ok: false, error: 'No estás en la mesa' };
  if (state.currentTurn !== player.position) return { ok: false, error: 'No es tu turno' };

  // Anti-trampa: no podés pasar si tenés con qué jugar.
  if (hasPlayableTile(player.hand, state.leftEnd, state.rightEnd)) {
    return { ok: false, error: 'Tenés fichas que podés jugar, no podés pasar' };
  }

  const newPasses = state.passesInRow + 1;
  const withPass: GameState = {
    ...state,
    passesInRow: newPasses,
    lastPasserPosition: player.position,
  };

  // Todos pasaron seguido → tranca
  if (newPasses >= state.players.length) {
    return { ok: true, newState: resolveTranca(withPass) };
  }

  return {
    ok: true,
    newState: { ...withPass, currentTurn: nextPosition(state, player.position) },
  };
}

// ─── Crear estado inicial ────────────────────────────────────
export function createInitialState(
  roomId: number,
  players: PlayerState[],
  options?: { starterPosition?: number; freeOpening?: boolean }
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new Error('Dominó clásico: entre 2 y 4 jugadores');
  }

  const deck = createDeck();
  const { hands } = dealTiles(deck, players.length);

  const playersWithHands: PlayerState[] = players.map((p, i) => ({ ...p, hand: hands[i] ?? [] }));

  // Mano 1 (o sin opciones): abre el doble más alto y esa ficha es obligatoria.
  // Manos 2+: abre el asiento indicado por la rotación, con ficha LIBRE.
  let starterPos: number;
  let openingTile: Tile | null;

  if (options?.starterPosition !== undefined) {
    starterPos = options.starterPosition;
    // freeOpening → sin ficha de salida obligatoria (el jugador pone la que quiera)
    openingTile = options.freeOpening ? null : findOpeningTile(hands).tile;
  } else {
    const opening = findOpeningTile(hands);
    starterPos = playersWithHands[opening.handIdx].position;
    openingTile = opening.tile;
  }

  return {
    roomId,
    status: 'playing',
    players: playersWithHands,
    currentTurn: starterPos,
    board: [],
    leftEnd: null,
    rightEnd: null,
    passesInRow: 0,
    winnerPosition: null,
    winnerTeam: null,
    winType: null,
    scores: {},
    handPoints: {},
    openingTile,
    lastPasserPosition: null,
    startedAt: Date.now(),
    finishedAt: null,
    moveCount: 0,
  };
}

// ─── Estado "seguro" para el cliente ─────────────────────────
/**
 * Oculta las manos ajenas conservando la cantidad de fichas.
 * Antes se usaba [0,0], que es la blanca doble: el cliente no podía
 * distinguir "oculta" de "blanca doble". Ahora es [-1,-1] (HIDDEN_TILE).
 */
export function getSafeState(state: GameState, viewerUserId: number): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      hand: p.userId === viewerUserId ? p.hand : p.hand.map(() => [...HIDDEN_TILE] as Tile),
    })),
  };
}

/** Rellena campos nuevos en estados viejos persistidos en dc_domino_rooms.game_state. */
export function migrateState(state: GameState): GameState {
  return {
    ...state,
    winnerTeam: state.winnerTeam ?? null,
    handPoints: state.handPoints ?? {},
    openingTile: state.openingTile ?? null,
    lastPasserPosition: state.lastPasserPosition ?? null,
  };
}

// ─── Helpers para el motor de PARTIDO (match) ────────────────

/** Suma de puntos de fichas que le quedaron a cada equipo al terminar la mano. */
export function teamHandPoints(state: GameState): Record<0 | 1, number> {
  const out: Record<0 | 1, number> = { 0: 0, 1: 0 };
  for (const p of state.players) {
    if (p.team === 0 || p.team === 1) out[p.team] += handValue(p.hand);
  }
  return out;
}

/** El equipo (0|1) de una posición dada. */
export function teamOfPosition(state: GameState, position: number): 0 | 1 | null {
  const p = state.players.find(pl => pl.position === position);
  return p ? p.team : null;
}

/**
 * Puntos que la mano terminada le otorga a UNA pareja.
 * - Por dominó: el equipo ganador recibe la suma de fichas de TODOS los rivales.
 * - Por tranca: el equipo con MENOS puntos recibe la suma de fichas del equipo
 *   con MÁS puntos (el de más puntos pierde).
 * Devuelve { winningTeam, points } o null si no aplica (sin equipos).
 */
export function handScoreForMatch(state: GameState): { winningTeam: 0 | 1; points: number } | null {
  const tp = teamHandPoints(state);

  if (state.winType === 'domino' && (state.winnerTeam === 0 || state.winnerTeam === 1)) {
    const rival = state.winnerTeam === 0 ? 1 : 0;
    return { winningTeam: state.winnerTeam, points: tp[rival] };
  }

  if (state.winType === 'closed') {
    // Tranca: pierde el equipo con más puntos de fichas.
    if (tp[0] === tp[1]) {
      // Empate exacto de puntos: gana quien trancó (winnerTeam ya lo resolvió).
      if (state.winnerTeam === 0 || state.winnerTeam === 1) {
        const rival = state.winnerTeam === 0 ? 1 : 0;
        return { winningTeam: state.winnerTeam, points: tp[rival] };
      }
      return null;
    }
    const winningTeam: 0 | 1 = tp[0] < tp[1] ? 0 : 1;
    const losingTeam: 0 | 1 = winningTeam === 0 ? 1 : 0;
    return { winningTeam, points: tp[losingTeam] };
  }

  return null;
}
