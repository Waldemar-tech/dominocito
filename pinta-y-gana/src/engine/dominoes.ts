// Las 28 piedras del dominó doble-seis
export interface Domino {
  id: number;
  high: number;
  low: number;
  label: string;
}

export const DOMINOES: Domino[] = (() => {
  const pieces: Domino[] = [];
  let id = 0;
  // Orden para coincidir con sprite sheet generado (high=high, low>=high).
  // Visualmente: ficha (0,1) tiene 0 arriba y 1 abajo; ficha (1,0) tendría 1 arriba y 0 abajo
  // (que es la misma ficha rotada 180°). Mantenemos low >= high para alinear con el sprite.
  for (let high = 0; high <= 6; high++) {
    for (let low = high; low <= 6; low++) {
      pieces.push({ id: id++, high, low, label: `${high}-${low}` });
    }
  }
  return pieces; // 28 piedras
})();

// Commit-reveal RNG: primero commit (hash), luego reveal
export function commitReveal(): { seed: number; hash: string } {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const hash = btoa(seed.toString()).slice(0, 12);
  return { seed, hash };
}

export function drawWinner(seed: number): Domino {
  const idx = seed % 28;
  return DOMINOES[idx];
}

export function drawMultipliers(seed: number): { x50: Domino; x100: Domino } {
  // 2 piedras distintas para multiplicadores
  const idx50 = (seed * 7) % 28;
  let idx100 = (seed * 13) % 28;
  if (idx100 === idx50) idx100 = (idx100 + 1) % 28;
  return { x50: DOMINOES[idx50], x100: DOMINOES[idx100] };
}
