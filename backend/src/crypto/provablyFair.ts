/**
 * Provably Fair RNG system for Dominócito sorteos.
 *
 * How it works:
 * 1. BEFORE reveal: server generates server_seed (secret) and publishes only
 *    server_seed_hash = SHA-256(server_seed). Players can verify nothing was rigged.
 * 2. Player optionally submits client_seed with their bet.
 * 3. AFTER close: combined_seed = SHA-256(server_seed + client_seed + sorteo_id)
 *    This combined_seed is used to derive winners.
 * 4. server_seed is published after reveal so players can independently verify.
 *
 * Verification flow (anyone can do this):
 *   1. sha256(server_seed) === server_seed_hash ? ✓ server didn't change seed
 *   2. combined = sha256(server_seed + client_seed + sorteo_id)
 *   3. winner = combined % 28, x50 = (combined * 31) % 28, etc.
 */

import crypto from 'crypto';

export interface ProvablyFairCommit {
  serverSeed: string;    // 32-byte hex — kept SECRET until reveal
  serverSeedHash: string; // SHA-256(serverSeed) — published immediately
}

/**
 * Generate a new server seed commit for a sorteo.
 * Returns both the secret seed and its public hash.
 */
export function generateServerSeed(): ProvablyFairCommit {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  return { serverSeed, serverSeedHash };
}

/**
 * Combine server seed, client seed, and sorteo ID into a final seed.
 * Used at reveal time.
 */
export function combinedSeedHex(
  serverSeed: string,
  clientSeed: string,
  sorteoId: number
): string {
  const combined = `${serverSeed}${clientSeed}${sorteoId}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Derive winner domino IDs from a hex seed string.
 * Deterministic: same seed always gives same result.
 *
 * Replaces the old BigInt-based deriveDrawResults() for provably fair mode.
 */
export function deriveDrawResultsFromHex(hexSeed: string): {
  winnerId: number;
  multX50Id: number;
  multX100Id: number;
} {
  // Use first 8 bytes as primary number, subsequent bytes for x50/x100
  const buf = Buffer.from(hexSeed, 'hex');

  const n1 = buf.readBigUInt64BE(0);
  const n2 = buf.readBigUInt64BE(8);
  const n3 = buf.readBigUInt64BE(16);

  const TOTAL = 28n;

  let winnerId = Number(n1 % TOTAL);
  let multX50Id = Number(n2 % TOTAL);
  let multX100Id = Number(n3 % TOTAL);

  // Ensure all three are distinct
  if (multX50Id === winnerId) multX50Id = (multX50Id + 1) % 28;
  if (multX100Id === winnerId) multX100Id = (multX100Id + 1) % 28;
  if (multX100Id === multX50Id) multX100Id = (multX100Id + 1) % 28;
  if (multX100Id === winnerId) multX100Id = (multX100Id + 2) % 28;

  return { winnerId, multX50Id, multX100Id };
}

/**
 * Verify that a server_seed matches the committed hash.
 */
export function verifyServerSeed(serverSeed: string, serverSeedHash: string): boolean {
  const computed = crypto.createHash('sha256').update(serverSeed).digest('hex');
  return computed === serverSeedHash;
}
