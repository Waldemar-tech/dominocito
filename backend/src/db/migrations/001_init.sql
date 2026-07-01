-- =============================================================
-- Dominócito (Pinta y Gana) - Initial Schema
-- Prefijo: dc_
-- =============================================================

-- Usuarios
CREATE TABLE IF NOT EXISTS dc_users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50) NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallet por usuario
CREATE TABLE IF NOT EXISTS dc_wallets (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES dc_users(id) ON DELETE CASCADE,
    balance_eur NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transacciones de wallet
CREATE TABLE IF NOT EXISTS dc_wallet_transactions (
    id          SERIAL PRIMARY KEY,
    wallet_id   INTEGER NOT NULL REFERENCES dc_wallets(id) ON DELETE CASCADE,
    tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('deposito', 'apuesta', 'premio', 'retiro')),
    amount_eur  NUMERIC(12, 2) NOT NULL,
    descripcion TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sorteos
CREATE TABLE IF NOT EXISTS dc_sorteos (
    id                  SERIAL PRIMARY KEY,
    scheduled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at           TIMESTAMPTZ,
    revealed_at         TIMESTAMPTZ,
    status              VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'revealed')),
    commit_hash         VARCHAR(64) NOT NULL,           -- SHA-256 hash del seed (commit fase)
    seed                BIGINT,                         -- Seed real (sólo guardado tras revelar)
    winner_domino_id    INTEGER CHECK (winner_domino_id BETWEEN 0 AND 27),
    mult_x50_domino_id  INTEGER CHECK (mult_x50_domino_id BETWEEN 0 AND 27),
    mult_x100_domino_id INTEGER CHECK (mult_x100_domino_id BETWEEN 0 AND 27),
    banca_inicio        NUMERIC(14, 2) NOT NULL,
    banca_fin           NUMERIC(14, 2),
    tope_por_piedra     NUMERIC(12, 2) NOT NULL,        -- (banca_inicio * 20%) / 100 fichas
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Apuestas
CREATE TABLE IF NOT EXISTS dc_bets (
    id                SERIAL PRIMARY KEY,
    sorteo_id         INTEGER NOT NULL REFERENCES dc_sorteos(id) ON DELETE CASCADE,
    user_id           INTEGER NOT NULL REFERENCES dc_users(id) ON DELETE CASCADE,
    domino_id         INTEGER NOT NULL CHECK (domino_id BETWEEN 0 AND 27),
    amount_eur        NUMERIC(12, 2) NOT NULL CHECK (amount_eur > 0),
    payout_multiplier NUMERIC(8, 4),                   -- NULL hasta revelar
    win_amount_eur    NUMERIC(12, 2) DEFAULT 0.00,     -- Premio ganado (0 si no ganó)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sorteo_id, user_id, domino_id)             -- Un user no puede apostar 2x a la misma ficha en mismo sorteo
);

-- Log histórico de banca
CREATE TABLE IF NOT EXISTS dc_banca_log (
    id            SERIAL PRIMARY KEY,
    sorteo_id     INTEGER NOT NULL REFERENCES dc_sorteos(id) ON DELETE CASCADE,
    banca_antes   NUMERIC(14, 2) NOT NULL,
    banca_despues NUMERIC(14, 2) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_dc_bets_sorteo ON dc_bets(sorteo_id);
CREATE INDEX IF NOT EXISTS idx_dc_bets_user ON dc_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_dc_wallet_transactions_wallet ON dc_wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_dc_sorteos_status ON dc_sorteos(status);
CREATE INDEX IF NOT EXISTS idx_dc_wallets_user ON dc_wallets(user_id);

-- Trigger: actualizar updated_at en dc_users
CREATE OR REPLACE FUNCTION dc_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dc_users_updated_at ON dc_users;
CREATE TRIGGER dc_users_updated_at
    BEFORE UPDATE ON dc_users
    FOR EACH ROW EXECUTE FUNCTION dc_set_updated_at();

DROP TRIGGER IF EXISTS dc_wallets_updated_at ON dc_wallets;
CREATE TRIGGER dc_wallets_updated_at
    BEFORE UPDATE ON dc_wallets
    FOR EACH ROW EXECUTE FUNCTION dc_set_updated_at();
