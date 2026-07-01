import { Request } from 'express';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface JwtPayload {
  userId: number;
  email: string;
  username: string;
}

export interface DcUser {
  id: number;
  username: string;
  email: string;          // encrypted ciphertext (hex) when ENCRYPTION_KEY set
  email_iv: string | null;
  email_tag: string | null;
  email_hash: string | null;  // SHA-256 for unique index lookups
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface DcWallet {
  id: number;
  user_id: number;
  balance_eur: number;
  updated_at: Date;
}

export interface DcWalletTransaction {
  id: number;
  wallet_id: number;
  tipo: 'deposito' | 'apuesta' | 'premio' | 'retiro';
  amount_eur: number;
  descripcion: string | null;  // encrypted ciphertext when ENCRYPTION_KEY set
  desc_iv: string | null;
  desc_tag: string | null;
  created_at: Date;
}

export interface DcRefreshToken {
  id: number;
  user_id: number;
  token_hash: string;  // SHA-256 of the actual token
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
}

export interface DcSorteo {
  id: number;
  scheduled_at: Date;
  closed_at: Date | null;
  revealed_at: Date | null;
  status: 'open' | 'closed' | 'revealed';
  commit_hash: string;
  seed: number | null;
  winner_domino_id: number | null;
  mult_x50_domino_id: number | null;
  mult_x100_domino_id: number | null;
  banca_inicio: number;
  banca_fin: number | null;
  tope_por_piedra: number;
  // Provably Fair fields
  server_seed_hash: string | null;
  server_seed: string | null;
  client_seed: string | null;
  result_signature: string | null;
  created_at: Date;
}

export interface DcBet {
  id: number;
  sorteo_id: number;
  user_id: number;
  domino_id: number;
  amount_eur: number;
  payout_multiplier: number | null;
  win_amount_eur: number;
  client_seed: string | null;  // Provably Fair: player-supplied seed
  created_at: Date;
}

export interface DcBancaLog {
  id: number;
  sorteo_id: number;
  banca_antes: number;
  banca_despues: number;
  created_at: Date;
}

// Domino IDs 0-27: las 28 fichas del dominó
// 0-0, 0-1, 0-2, 0-3, 0-4, 0-5, 0-6
// 1-1, 1-2, 1-3, 1-4, 1-5, 1-6
// 2-2, 2-3, 2-4, 2-5, 2-6
// 3-3, 3-4, 3-5, 3-6
// 4-4, 4-5, 4-6
// 5-5, 5-6
// 6-6
export const DOMINO_PIECES: { id: number; label: string }[] = [];

let idx = 0;
for (let high = 0; high <= 6; high++) {
  for (let low = 0; low <= high; low++) {
    DOMINO_PIECES.push({ id: idx, label: `${low}-${high}` });
    idx++;
  }
}
