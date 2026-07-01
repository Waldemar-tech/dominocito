-- =============================================================
-- Dominócito - Advanced Security Migration
-- 002_security_advanced.sql
-- =============================================================

-- ─── 1. Refresh Tokens Table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES dc_users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(128) NOT NULL UNIQUE,   -- SHA-256 of the token
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_refresh_tokens_user   ON dc_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_dc_refresh_tokens_hash   ON dc_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_dc_refresh_tokens_expiry ON dc_refresh_tokens(expires_at);

-- ─── 2. Email encryption support in dc_users ─────────────────
-- Add email_hash column for lookup (SHA-256 of lowercase email)
-- email column becomes the AES-256-GCM encrypted blob (JSON)
ALTER TABLE dc_users
  ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS email_iv   VARCHAR(32),
  ADD COLUMN IF NOT EXISTS email_tag  VARCHAR(32);

-- email_hash is used for unique lookups after email is encrypted
CREATE INDEX IF NOT EXISTS idx_dc_users_email_hash ON dc_users(email_hash);

-- ─── 3. Wallet transaction encryption support ─────────────────
-- descripcion gets encrypted; store iv+tag alongside
ALTER TABLE dc_wallet_transactions
  ADD COLUMN IF NOT EXISTS desc_iv  VARCHAR(32),
  ADD COLUMN IF NOT EXISTS desc_tag VARCHAR(32);

-- ─── 4. Provably Fair RNG columns for dc_sorteos ─────────────
ALTER TABLE dc_sorteos
  ADD COLUMN IF NOT EXISTS server_seed_hash VARCHAR(64),   -- SHA-256(server_seed), shown before reveal
  ADD COLUMN IF NOT EXISTS server_seed      VARCHAR(64),   -- hex, revealed after sorteo
  ADD COLUMN IF NOT EXISTS client_seed      TEXT,          -- optional player-supplied seed
  ADD COLUMN IF NOT EXISTS result_signature TEXT;          -- ECDSA signature of result

-- ─── 5. Provably Fair: client_seed on dc_bets ──────────────────
ALTER TABLE dc_bets
  ADD COLUMN IF NOT EXISTS client_seed TEXT;

-- ─── 6. ECDSA public key cache (optional metadata) ───────────
-- The signing keypair lives in keys/ directory on disk.
-- No DB storage needed for keys themselves.
