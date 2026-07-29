-- Avatar por usuario: lo elige en el lobby y lo acompaña en todas las salas.
-- Guarda un identificador tipo 'avatar-07' (los PNG viven en public/assets/avatares/).
ALTER TABLE dc_users ADD COLUMN IF NOT EXISTS avatar VARCHAR(50);
