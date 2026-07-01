import { commitReveal, drawWinner, drawMultipliers, type Domino } from './dominoes';

export type BetStatus = 'open' | 'closed' | 'revealed';

export interface Bet {
  dominoId: number;
  amount: number; // en EUR
}

export interface SorteoResult {
  winner: Domino;
  multipliers: { x50: Domino; x100: Domino };
  payout: number;        // multiplicador aplicado (18, 50, 100)
  winAmount: number;     // EUR ganados
  userWon: boolean;
}

export interface SorteoState {
  status: BetStatus;
  hash: string;          // commit público antes de revelar
  seed?: number;         // reveal después de cerrar
  result?: SorteoResult;
  nextSorteoAt: Date;
  bets: Bet[];
  banco: number;         // banca disponible en EUR
  topeByDomino: number;  // máx apostado por piedra (20% banca)
}

const BANCA_INICIAL = 25_000; // EUR
const PAGO_BASE = 18;
const MULT_X50 = 50;
const MULT_X100 = 100;
const TOPE_PORCENTAJE = 0.20;

export function calcularTope(banco: number): number {
  // Tope: máx apostado por piedra = 20% banca
  // El pago máximo (×100) no puede superar el 20% de la banca
  return (banco * TOPE_PORCENTAJE) / MULT_X100;
}

export function crearSorteo(banco: number = BANCA_INICIAL): SorteoState {
  const { seed: _seed, hash } = commitReveal();
  const now = new Date();
  const next = new Date(now);
  // Próximo sorteo: siguiente :00 o :30
  const mins = next.getMinutes();
  if (mins < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }

  return {
    status: 'open',
    hash,
    nextSorteoAt: next,
    bets: [],
    banco,
    topeByDomino: calcularTope(banco),
  };
}

export function apostar(state: SorteoState, bet: Bet): { ok: boolean; error?: string } {
  if (state.status !== 'open') return { ok: false, error: 'Apuestas cerradas' };
  if (bet.amount < 0.25) return { ok: false, error: 'Mínimo €0.25' };
  if (bet.amount > 25) return { ok: false, error: 'Máximo €25 por piedra' };

  // Verificar tope dinámico
  const totalEnPiedra = state.bets
    .filter(b => b.dominoId === bet.dominoId)
    .reduce((sum, b) => sum + b.amount, 0);

  if (totalEnPiedra + bet.amount > state.topeByDomino) {
    return { ok: false, error: `Tope alcanzado para esta piedra (máx €${state.topeByDomino.toFixed(2)})` };
  }

  state.bets.push(bet);
  return { ok: true };
}

export function cerrarYRevelar(state: SorteoState): SorteoState {
  const { seed, hash } = commitReveal();
  const winner = drawWinner(seed);
  const multipliers = drawMultipliers(seed);

  // Calcular resultado para las apuestas del usuario
  const userBets = state.bets;
  let winAmount = 0;
  let payout = 0;
  let userWon = false;

  for (const bet of userBets) {
    if (bet.dominoId === winner.id) {
      userWon = true;
      if (bet.dominoId === multipliers.x100.id) {
        payout = MULT_X100;
      } else if (bet.dominoId === multipliers.x50.id) {
        payout = MULT_X50;
      } else {
        payout = PAGO_BASE;
      }
      winAmount += bet.amount * payout;
    }
  }

  return {
    ...state,
    status: 'revealed',
    hash,
    seed,
    result: {
      winner,
      multipliers,
      payout,
      winAmount,
      userWon,
    },
  };
}
