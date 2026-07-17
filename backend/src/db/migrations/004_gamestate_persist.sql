-- Migration 004: Persist gameState in DB so it survives backend restarts
ALTER TABLE dc_domino_rooms
  ADD COLUMN IF NOT EXISTS game_state JSONB DEFAULT NULL;
