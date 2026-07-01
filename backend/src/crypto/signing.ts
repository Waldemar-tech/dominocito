/**
 * ECDSA P-256 signing for sorteo results (provably fair verification).
 *
 * On server startup:
 *   - Checks if keys/ec-private.pem and keys/ec-public.pem exist
 *   - If not, generates a new P-256 keypair and saves to disk
 *
 * Sign a sorteo result:
 *   signResult(sorteoId, winnerId, x50Id, x100Id, seed, timestamp)
 *   → hex-encoded DER signature
 *
 * Verify (can be done by anyone with the public key):
 *   verifyResult(message, signature, publicKeyPem) → boolean
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEYS_DIR = path.join(process.cwd(), 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'ec-private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'ec-public.pem');

let _privateKey: crypto.KeyObject | null = null;
let _publicKey: crypto.KeyObject | null = null;
let _publicKeyPem: string | null = null;

/**
 * Initialize keypair — call once at server startup.
 * Generates keys if they don't exist, loads from disk otherwise.
 */
export function initSigningKeys(): void {
  // Ensure keys directory exists (mode 700 — private)
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { mode: 0o700, recursive: true });
    console.log('🔑 Created keys/ directory');
  }

  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    // Load existing keys
    const privatePem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    const publicPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

    _privateKey = crypto.createPrivateKey(privatePem);
    _publicKey = crypto.createPublicKey(publicPem);
    _publicKeyPem = publicPem;

    console.log('🔑 ECDSA keypair loaded from disk');
  } else {
    // Generate new P-256 keypair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'sec1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    // Save with restricted permissions
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });

    _privateKey = crypto.createPrivateKey(privateKey);
    _publicKey = crypto.createPublicKey(publicKey);
    _publicKeyPem = publicKey;

    console.log('🔑 Generated new ECDSA P-256 keypair and saved to keys/');
    console.log('⚠️  Back up keys/ec-private.pem securely! Loss means old signatures cannot be verified.');
  }
}

/**
 * Build the canonical message string for signing a sorteo result.
 * Format: sorteoId|winnerId|multX50Id|multX100Id|seed|timestamp
 */
export function buildResultMessage(
  sorteoId: number,
  winnerId: number,
  multX50Id: number,
  multX100Id: number,
  seed: string,
  timestamp: string
): string {
  return `${sorteoId}|${winnerId}|${multX50Id}|${multX100Id}|${seed}|${timestamp}`;
}

/**
 * Sign a sorteo result message with the server's ECDSA private key.
 * Returns hex-encoded DER signature.
 */
export function signResult(message: string): string {
  if (!_privateKey) {
    throw new Error('Signing keys not initialized — call initSigningKeys() first');
  }

  const sign = crypto.createSign('SHA256');
  sign.update(message, 'utf8');
  sign.end();

  return sign.sign(_privateKey, 'hex');
}

/**
 * Verify a sorteo result signature.
 * Can be used by anyone with the public key PEM.
 */
export function verifyResultSignature(
  message: string,
  signatureHex: string,
  publicKeyPem: string
): boolean {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const verify = crypto.createVerify('SHA256');
    verify.update(message, 'utf8');
    verify.end();
    return verify.verify(publicKey, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Get the server's public key PEM for exposure via API.
 */
export function getPublicKeyPem(): string {
  if (!_publicKeyPem) {
    throw new Error('Signing keys not initialized — call initSigningKeys() first');
  }
  return _publicKeyPem;
}
