-- 003_domino_classic.sql
-- Tablas para el juego de dominó clásico (Modelo C)
-- 4 jugadores, 28 fichas doble-6, reglas venezolanas

-- ─── Salas de dominó ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_domino_rooms (
    id SERIAL PRIMARY KEY,
    code VARCHAR(8) UNIQUE NOT NULL,           -- código corto para unirse (ej: 'KX7F')
    host_user_id INTEGER NOT NULL REFERENCES dc_users(id) ON DELETE CASCADE,
    is_private BOOLEAN DEFAULT TRUE,           -- true = privada (código), false = pública (matchmaking)
    max_players SMALLINT DEFAULT 4 CHECK (max_players BETWEEN 2 AND 4),
    status VARCHAR(20) DEFAULT 'waiting',      -- waiting | playing | finished | abandoned
    game_state JSONB,                          -- estado del juego en curso
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dc_domino_rooms_code ON dc_domino_rooms(code);
CREATE INDEX IF NOT EXISTS idx_dc_domino_rooms_status ON dc_domino_rooms(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_dc_domino_rooms_private ON dc_domino_rooms(is_private, status);

-- ─── Jugadores en cada sala ───────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_domino_players (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES dc_domino_rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES dc_users(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 3),  -- 0=Norte, 1=Este, 2=Sur, 3=Oeste
    team SMALLINT CHECK (team IN (0, 1)),                          -- para 2v2: 0 o 1
    socket_id VARCHAR(100),                                        -- socket.id actual (para reconexión)
    is_connected BOOLEAN DEFAULT TRUE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id, user_id),
    UNIQUE(room_id, position)
);

CREATE INDEX IF NOT EXISTS idx_dc_domino_players_room ON dc_domino_players(room_id);
CREATE INDEX IF NOT EXISTS idx_dc_domino_players_user ON dc_domino_players(user_id);

-- ─── Partidas de dominó finalizadas ───────────────────────────
CREATE TABLE IF NOT EXISTS dc_domino_games (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES dc_domino_rooms(id) ON DELETE CASCADE,
    winner_user_id INTEGER REFERENCES dc_users(id),  -- NULL si se cerró (tranca)
    is_closed BOOLEAN DEFAULT FALSE,                  -- true = nadie pudo jugar (tranca)
    points_awarded INTEGER DEFAULT 0,                -- puntos sumados al ganador (cuenta fichas)
    rounds_played SMALLINT DEFAULT 1,
    duration_seconds INTEGER,
    moves JSONB,                                      -- historial de jugadas
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_domino_games_winner ON dc_domino_games(winner_user_id);
CREATE INDEX IF NOT EXISTS idx_dc_domino_games_room ON dc_domino_games(room_id);

-- ─── Estadísticas por usuario ────────────────────────────────
CREATE TABLE IF NOT EXISTS dc_domino_stats (
    user_id INTEGER PRIMARY KEY REFERENCES dc_users(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    games_closed INTEGER DEFAULT 0,    -- trancas
    total_points INTEGER DEFAULT 0,    -- suma de puntos en victorias
    longest_streak INTEGER DEFAULT 0,  -- racha de victorias
    current_streak INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
