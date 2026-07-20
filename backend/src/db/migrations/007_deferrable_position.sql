-- Migración 007: hacer DEFERRABLE el unique (room_id, position) en dc_domino_players
-- Necesario para el reasiento aleatorio de equipos en domino:start sin violar
-- el constraint por-fila durante la TX.

ALTER TABLE dc_domino_players
  DROP CONSTRAINT IF EXISTS dc_domino_players_room_id_position_key;

ALTER TABLE dc_domino_players
  ADD CONSTRAINT dc_domino_players_room_id_position_key
  UNIQUE (room_id, position)
  DEFERRABLE INITIALLY IMMEDIATE;
