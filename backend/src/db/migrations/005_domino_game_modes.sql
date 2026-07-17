-- 005_domino_game_modes.sql
-- Fase 1 — Modo de juego y armado de equipos para el dominó clásico.
--
-- Retrocompatible: el default 'individual' reproduce exactamente el
-- comportamiento actual. Las salas ya existentes quedan en 'individual'.

-- ─── Modo de juego y de armado de equipos en la sala ─────────
ALTER TABLE dc_domino_rooms
  ADD COLUMN IF NOT EXISTS game_mode VARCHAR(20) NOT NULL DEFAULT 'individual'
    CHECK (game_mode IN ('individual', 'teams')),
  ADD COLUMN IF NOT EXISTS team_mode VARCHAR(20)
    CHECK (team_mode IN ('manual', 'choose', 'random'));

-- team_mode solo tiene sentido cuando game_mode = 'teams'.
-- Se valida en la capa de aplicación; acá lo dejamos nullable a propósito
-- (individual = team_mode NULL).

COMMENT ON COLUMN dc_domino_rooms.game_mode IS 'individual (1v1v1v1) | teams (2v2)';
COMMENT ON COLUMN dc_domino_rooms.team_mode IS 'Solo si game_mode=teams: manual (host arma) | choose (cada quien elige) | random (sorteo al iniciar)';

-- La columna dc_domino_players.team YA existe desde 003 (SMALLINT CHECK team IN (0,1)).
-- No hace falta agregarla; solo empezamos a poblarla.
