/**
 * Dominó Clásico — Motor de Juego
 *
 * Reglas venezolanas estándar:
 * - 4 jugadores, 28 fichas doble-6
 * - 7 fichas por mano
 * - Inicia el doble más alto (6|6, luego 5|5, etc.) — si no hay dobles, la ficha más alta
 * - Turno va a la izquierda
 * - Se puede pasar cuando no tenés ficha que sirva
 * - Gana quien se queda sin fichas primero
 * - Si se cierra (todos pasan), gana quien tenga menos puntos en la mano
 * - Se juega a 100 puntos (partida)
 *
 * Estado del juego (GameState) es serializable a JSON para enviar por Socket.IO
 */

// ─── Tipos ────────────────────────────────────────────────────
export type Tile = [number, number]; // [a, b], siempre a <= b

export interface PlayerState {
  userId: number;
  username: string;
  position: 0 | 1 | 2 | 3;
  team: 0 | 1 | null;
  hand: Tile[];
  connected: boolean;
}

export interface PlayedTile {
  tile: Tile;
  userId: number;
  side: 'left' | 'right';
  order: number;
}

export interface GameState {
  roomId: number;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  players: PlayerState[];
  currentTurn: number;            // posición del jugador actual
  board: PlayedTile[];            // fichas jugadas en orden
  leftEnd: number | null;        // número en el extremo izquierdo
  rightEnd: number | null;       // número en el extremo derecho
  passesInRow: number;            // pases consecutivos (4 = tranca)
  winnerPosition: number | null; // posición ganadora
  winType: 'domino' | 'closed' | null;
  scores: Record<number, number>; // puntos por posición al cierre
  startedAt: number | null;
  finishedAt: number | null;
  moveCount: number;
}

// ─── Constantes ──────────────────────────────────────────────
const ALL_TILES: Tile[] = (() => {
  const t: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      t.push([a, b]);
    }
  }
  return t;
})();

// ─── Utilidades ──────────────────────────────────────────────
export function tileToString(t: Tile): string {
  return `${t[0]}|${t[1]}`;
}

export function parseTile(s: string): Tile {
  const [a, b] = s.split('|').map(Number);
  return a <= b ? [a, b] : [b, a];
}

export function tileValue(t: Tile): number {
  return t[0] + t[1];
}

export function tileCount(t: Tile): number {
  return t[0] === t[1] ? 2 : 2; // siempre 2 fichas físicas, lo que cuenta son los puntos
}

export function handValue(hand: Tile[]): number {
  return hand.reduce((sum, t) => sum + tileValue(t), 0);
}

// ─── Mazo ────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createDeck(): Tile[] {
  return shuffle(ALL_TILES);
}

export function dealTiles(deck: Tile[]): { hands: Tile[][]; remaining: Tile[] } {
  const hands: Tile[][] = [[], [], [], []];
  for (let i = 0; i < 28; i++) {
    hands[i % 4].push(deck[i]);
  }
  // ordenar manos por valor para que el doble más alto quede al final (saca primero)
  for (const h of hands) {
    h.sort((a, b) => tileValue(a) - tileValue(b));
  }
  return { hands, remaining: deck.slice(28) };
}

// ─── Determinar quién sale ───────────────────────────────────
export function whoStarts(hands: Tile[][]): number {
  // Buscar el doble más alto de todas las manos
  let bestDouble: { pos: number; tile: Tile } | null = null;
  for (let p = 0; p < 4; p++) {
    for (const t of hands[p]) {
      if (t[0] === t[1]) { // es doble
        if (!bestDouble || t[0] > bestDouble.tile[0]) {
          bestDouble = { pos: p, tile: t };
        }
      }
    }
  }
  if (bestDouble) return bestDouble.pos;

  // Si no hay dobles, el que tenga la ficha con más puntos sale
  let best: { pos: number; tile: Tile } | null = null;
  for (let p = 0; p < 4; p++) {
    for (const t of hands[p]) {
      if (!best || tileValue(t) > tileValue(best.tile)) {
        best = { pos: p, tile: t };
      }
    }
  }
  return best ? best.pos : 0;
}

// ─── Verificar si una ficha se puede jugar ────────────────────
export function canPlayTile(tile: Tile, leftEnd: number | null, rightEnd: number | null): 'left' | 'right' | false {
  if (leftEnd === null && rightEnd === null) return 'right'; // primera ficha
  if (leftEnd !== null && tile[0] === leftEnd) return 'left';
  if (leftEnd !== null && tile[1] === leftEnd) return 'left';
  if (rightEnd !== null && tile[0] === rightEnd) return 'right';
  if (rightEnd !== null && tile[1] === rightEnd) return 'right';
  return false;
}

export function hasPlayableTile(hand: Tile[], leftEnd: number | null, rightEnd: number | null): boolean {
  return hand.some(t => canPlayTile(t, leftEnd, rightEnd) !== false);
}

// ─── Jugar una ficha ─────────────────────────────────────────
export function playTile(
  state: GameState,
  userId: number,
  tile: Tile,
  side: 'left' | 'right'
): { ok: true; newState: GameState } | { ok: false; error: string } {
  const playerIdx = state.players.findIndex(p => p.userId === userId);
  if (playerIdx === -1) return { ok: false, error: 'No estás en la mesa' };

  const player = state.players[playerIdx];
  if (state.currentTurn !== player.position) {
    return { ok: false, error: 'No es tu turno' };
  }

  // Verificar que tiene la ficha
  const tileIdx = player.hand.findIndex(t => tileToString(t) === tileToString(tile));
  if (tileIdx === -1) {
    return { ok: false, error: 'No tenés esa ficha' };
  }

  // Verificar que se puede jugar en el lado elegido
  const isFirstTile = state.leftEnd === null && state.rightEnd === null;
  if (isFirstTile) {
    // Primera ficha de la partida: ambos extremos pasan a ser los valores de la ficha.
    // Aceptamos cualquier 'side' (cliente puede mandar 'right' o 'left'); forzamos a 'right' para consistencia.
    side = 'right';
  } else {
    if (side === 'left') {
      if (state.leftEnd === null) return { ok: false, error: 'Lado izquierdo no disponible' };
      if (tile[0] !== state.leftEnd && tile[1] !== state.leftEnd) {
        return { ok: false, error: 'La ficha no encaja en el lado izquierdo' };
      }
    }
    if (side === 'right') {
      if (state.rightEnd === null) return { ok: false, error: 'Lado derecho no disponible' };
      if (tile[0] !== state.rightEnd && tile[1] !== state.rightEnd) {
        return { ok: false, error: 'La ficha no encaja en el lado derecho' };
      }
    }
  }

  // Sacar la ficha de la mano
  const newHand = [...player.hand];
  newHand.splice(tileIdx, 1);

  // Determinar el nuevo extremo
  let newLeft = state.leftEnd;
  let newRight = state.rightEnd;
  if (side === 'left') {
    newLeft = tile[0] === state.leftEnd ? tile[1] : tile[0];
  } else {
    newRight = tile[0] === state.rightEnd ? tile[1] : tile[0];
  }

  // Si es la primera ficha, ambos extremos son iguales
  if (state.leftEnd === null) {
    newLeft = tile[0];
    newRight = tile[1];
  }

  // Construir nuevo estado
  const newBoard = [...state.board, { tile, userId, side, order: state.moveCount }];
  const newPlayers = state.players.map((p, i) =>
    i === playerIdx ? { ...p, hand: newHand } : p
  );

  // Verificar si ganó
  if (newHand.length === 0) {
    const finishedState: GameState = {
      ...state,
      players: newPlayers,
      board: newBoard,
      leftEnd: newLeft,
      rightEnd: newRight,
      winnerPosition: player.position,
      winType: 'domino',
      status: 'finished',
      finishedAt: Date.now(),
      moveCount: state.moveCount + 1,
      passesInRow: 0,
      scores: calculateScores(newPlayers, player.position),
    };
    return { ok: true, newState: finishedState };
  }

  // Siguiente turno (a la izquierda = +1)
  const nextTurn = ((state.currentTurn + 1) % 4) as 0 | 1 | 2 | 3;

  return {
    ok: true,
    newState: {
      ...state,
      players: newPlayers,
      board: newBoard,
      leftEnd: newLeft,
      rightEnd: newRight,
      currentTurn: nextTurn,
      passesInRow: 0,
      moveCount: state.moveCount + 1,
    },
  };
}

// ─── Pasar turno ─────────────────────────────────────────────
export function passTurn(
  state: GameState,
  userId: number
): { ok: true; newState: GameState } | { ok: false; error: string } {
  const playerIdx = state.players.findIndex(p => p.userId === userId);
  if (playerIdx === -1) return { ok: false, error: 'No estás en la mesa' };

  const player = state.players[playerIdx];
  if (state.currentTurn !== player.position) {
    return { ok: false, error: 'No es tu turno' };
  }

  // Verificar que REALMENTE no puede jugar (anti-trampa)
  if (hasPlayableTile(player.hand, state.leftEnd, state.rightEnd)) {
    return { ok: false, error: 'Tenés fichas que podés jugar, no podés pasar' };
  }

  const nextTurn = ((state.currentTurn + 1) % 4) as 0 | 1 | 2 | 3;
  const newPassesInRow = state.passesInRow + 1;

  // Si todos pasaron, tranca
  if (newPassesInRow >= 4) {
    // Gana quien tenga menos puntos en la mano
    let minValue = Infinity;
    let winnerPos = 0;
    for (const p of state.players) {
      const v = handValue(p.hand);
      if (v < minValue) {
        minValue = v;
        winnerPos = p.position;
      }
    }
    return {
      ok: true,
      newState: {
        ...state,
        currentTurn: nextTurn,
        passesInRow: 0,
        status: 'finished',
        winType: 'closed',
        winnerPosition: winnerPos,
        finishedAt: Date.now(),
        scores: calculateScores(state.players, winnerPos),
      },
    };
  }

  return {
    ok: true,
    newState: {
      ...state,
      currentTurn: nextTurn,
      passesInRow: newPassesInRow,
    },
  };
}

// ─── Calcular puntos al final ────────────────────────────────
function calculateScores(players: PlayerState[], winnerPos: number): Record<number, number> {
  const scores: Record<number, number> = {};
  const winner = players.find(p => p.position === winnerPos);
  if (!winner) return scores;
  const totalLoserPoints = players
    .filter(p => p.position !== winnerPos)
    .reduce((sum, p) => sum + handValue(p.hand), 0);
  scores[winnerPos] = totalLoserPoints;
  return scores;
}

// ─── Crear estado inicial ────────────────────────────────────
export function createInitialState(
  roomId: number,
  players: PlayerState[]
): GameState {
  const deck = createDeck();
  const { hands } = dealTiles(deck);
  const starterPos = whoStarts(hands);

  const playersWithHands: PlayerState[] = players.map((p, i) => ({
    ...p,
    hand: hands[i] || [],
  }));

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
    winType: null,
    scores: {},
    startedAt: Date.now(),
    finishedAt: null,
    moveCount: 0,
  };
}

// ─── Para frontend: estado "seguro" (ocultamos manos de otros) ───
export function getSafeState(state: GameState, viewerUserId: number): GameState {
  return {
    ...state,
    players: state.players.map(p => ({
      ...p,
      // Solo mostramos la mano del viewer
      hand: p.userId === viewerUserId ? p.hand : p.hand.map(() => [0, 0] as Tile),
    })),
  };
}
