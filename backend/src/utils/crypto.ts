import crypto from 'crypto';

/**
 * Generate a random seed and its SHA-256 commit hash.
 * Used for commit-reveal RNG scheme.
 */
export function generateCommit(): { seed: bigint; hash: string } {
  // Generate 8 random bytes → 64-bit seed
  const seedBytes = crypto.randomBytes(8);
  const seed = seedBytes.readBigUInt64BE(0);
  const hash = crypto.createHash('sha256').update(seed.toString()).digest('hex');
  return { seed, hash };
}

/**
 * Verify that a seed matches a previously committed hash.
 */
export function verifyCommit(seed: bigint, hash: string): boolean {
  const computed = crypto.createHash('sha256').update(seed.toString()).digest('hex');
  return computed === hash;
}

/**
 * Derive winner and multiplier domino IDs from a seed.
 * Uses deterministic formula with BigInt to avoid float issues.
 */
export function deriveDrawResults(seed: bigint): {
  winnerId: number;
  multX50Id: number;
  multX100Id: number;
} {
  const TOTAL = 28n;

  const winnerId = Number(seed % TOTAL);

  let multX50Id = Number((seed * 31n) % TOTAL);
  if (multX50Id === winnerId) {
    multX50Id = (multX50Id + 1) % 28;
  }

  let multX100Id = Number((seed * 37n) % TOTAL);
  if (multX100Id === winnerId) {
    multX100Id = (multX100Id + 1) % 28;
  }
  if (multX100Id === multX50Id) {
    multX100Id = (multX100Id + 1) % 28;
  }
  // Edge case: if still collides with winner after adjusting for x50
  if (multX100Id === winnerId) {
    multX100Id = (multX100Id + 1) % 28;
  }

  return { winnerId, multX50Id, multX100Id };
}
