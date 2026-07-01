/**
 * AES-256-GCM encryption/decryption for sensitive data at rest.
 *
 * Usage:
 *   const enc = encrypt("user@example.com");
 *   const plain = decrypt(enc.ciphertext, enc.iv, enc.tag);
 *
 * Key: 32 bytes read from ENCRYPTION_KEY env var (hex encoded).
 *   Generate: openssl rand -hex 32
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV — optimal for GCM
const TAG_BYTES = 16;  // 128-bit auth tag

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars). Generate with: openssl rand -hex 32');
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedPayload {
  ciphertext: string; // hex
  iv: string;         // hex (12 bytes)
  tag: string;        // hex (16 bytes)
}

/**
 * Encrypt plaintext string using AES-256-GCM.
 * Returns ciphertext, iv, and auth tag — all hex-encoded.
 */
export function encrypt(text: string): EncryptedPayload {
  if (typeof text !== 'string') {
    throw new TypeError('encrypt: input must be a string');
  }

  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 * Throws if the auth tag doesn't match (tamper detection).
 */
export function decrypt(ciphertext: string, iv: string, tag: string): string {
  const key = getKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex'),
    { authTagLength: TAG_BYTES }
  );

  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Compute SHA-256 hash of a string (for indexed lookups of encrypted fields).
 * Always lowercases input for consistency.
 */
export function hashForLookup(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase()).digest('hex');
}

/**
 * Check if encryption is configured (ENCRYPTION_KEY is set).
 */
export function isEncryptionConfigured(): boolean {
  const hex = process.env.ENCRYPTION_KEY;
  return Boolean(hex && hex.length === 64);
}
