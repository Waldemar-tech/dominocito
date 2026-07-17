-- 006_domino_match_points.sql
-- Partido a puntos (dominó venezolano): objetivo configurable + estado de partido.

-- Objetivo de puntos de la sala (NULL = mano suelta, como antes).
ALTER TABLE dc_domino_rooms
  ADD COLUMN IF NOT EXISTS target_score INTEGER
    CHECK (target_score IS NULL OR target_score > 0);

-- Estado del partido persistido (sobrevive reconexiones y restart del backend).
ALTER TABLE dc_domino_rooms
  ADD COLUMN IF NOT EXISTS match_state JSONB;

COMMENT ON COLUMN dc_domino_rooms.target_score IS 'Puntos para ganar el partido (100/200/custom). NULL = una sola mano.';
COMMENT ON COLUMN dc_domino_rooms.match_state IS 'MatchState serializado: marcador, mano actual, rotación de salida.';

-- Historial de partidos terminados (solo reporte; NO toca wallet).
CREATE TABLE IF NOT EXISTS dc_domino_matches (
  id               SERIAL PRIMARY KEY,
  room_id          INTEGER NOT NULL REFERENCES dc_domino_rooms(id),
  winner_team      SMALLINT NOT NULL CHECK (winner_team IN (0, 1)),
  score_team0      INTEGER NOT NULL,
  score_team1      INTEGER NOT NULL,
  target_score     INTEGER NOT NULL,
  total_hands      INTEGER NOT NULL,
  winner_user_ids  JSONB NOT NULL,
  finished_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_domino_matches_room ON dc_domino_matches(room_id);
