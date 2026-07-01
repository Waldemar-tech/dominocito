#!/usr/bin/env ts-node
/**
 * Dominócito — Security Key Generator
 *
 * Generates all required secrets for .env and prints them.
 * Run once and copy values into your .env file.
 *
 * Usage:
 *   npx ts-node scripts/generate-keys.ts
 */

import crypto from 'crypto';

function hex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

const encryptionKey = hex(32);  // 32 bytes = 256 bits for AES-256
const jwtSecret = hex(64);      // 64 bytes = 512 bits
const serviceToken = hex(32);   // 32 bytes
const adminApiKey = hex(32);    // 32 bytes

console.log('\n🔑 Dominócito Security Keys — Generated', new Date().toISOString());
console.log('═'.repeat(60));
console.log('Copy these values into your .env file:\n');

console.log(`# AES-256-GCM encryption for sensitive DB fields`);
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log();
console.log(`# JWT secret (short-lived access tokens, 15 min)`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`JWT_EXPIRES_IN=900`);
console.log(`REFRESH_TOKEN_EXPIRES_DAYS=7`);
console.log();
console.log(`# Service-to-service auth token`);
console.log(`SERVICE_TOKEN=${serviceToken}`);
console.log();
console.log(`# Admin API key`);
console.log(`ADMIN_API_KEY=${adminApiKey}`);
console.log();
console.log('═'.repeat(60));
console.log('⚠️  SECURITY NOTES:');
console.log('  - Never commit these values to version control');
console.log('  - ENCRYPTION_KEY loss = permanent data loss for encrypted fields');
console.log('  - Back up ENCRYPTION_KEY in a secure vault (1Password, AWS Secrets Manager)');
console.log('  - ECDSA keys are auto-generated in keys/ on first server start');
console.log('  - Back up keys/ec-private.pem for signature verification continuity\n');
