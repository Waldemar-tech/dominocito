# 🎲 Dominócito (Pinta y Gana) — Backend API

Node.js + Express + TypeScript + PostgreSQL backend para el juego de apuestas con fichas de dominó.

## Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express 4
- **Base de datos:** PostgreSQL 10.1.30.50 / DESARROLLO_DEVELOPERS_UTF8
- **Auth:** JWT (7 días)
- **Puerto:** 3200
- **CORS:** http://localhost:5173 (React frontend)

## Arrancar

```bash
cd ~/clawd-dev/dominocito/backend

# Desarrollo (auto-reload)
npm run dev

# Producción
npm run build && npm start

# Migrar DB (solo primera vez)
npm run migrate
```

## Endpoints

### Auth
```
POST /auth/register   { username, email, password } → { token, user }
POST /auth/login      { email, password }           → { token, user }
GET  /auth/me         [JWT]                         → user + balance
```

### Sorteos
```
GET  /sorteos/current     → sorteo abierto + tope_por_piedra + apuestas
GET  /sorteos/:id         → detalle de un sorteo
POST /sorteos/bet  [JWT]  { sorteo_id, domino_id, amount_eur } → apuesta
```

### Wallet
```
GET  /wallet  [JWT]       → balance + últimas 20 transacciones
POST /wallet/add  [JWT]   { amount_eur } → agregar saldo (testing)
```

### Admin (sin auth)
```
POST /admin/sorteos/crear          → crea sorteo + commit hash
POST /admin/sorteos/:id/revelar    { seed } → revelar + pagar premios
```

## Lógica de Banca Dinámica

- `tope_por_piedra = (banca_inicio × 20%) ÷ 28 fichas`
- Primer sorteo: `banca_inicio = €25,000` (configurable en .env)
- Al revelar: `banca_fin = banca_inicio + total_apostado - total_premios`
- Siguiente sorteo: `banca_inicio = banca_fin anterior`

## RNG Commit-Reveal

1. **Crear:** `seed` aleatorio de 64 bits → `commit_hash = SHA256(seed)` guardado en DB
2. **Apostar:** players apuestan contra el hash público
3. **Revelar:** admin envía el `seed` → se verifica contra el hash → se determinan ganadores:
   - `winnerId = seed % 28` → **×10**
   - `multX50Id = (seed × 31) % 28` → **×50**
   - `multX100Id = (seed × 37) % 28` → **×100**

## Variables de Entorno

Ver `.env.example` para todas las variables.

## Base de Datos

Tablas (prefijo `dc_`):
- `dc_users` — usuarios
- `dc_wallets` — wallet por usuario
- `dc_wallet_transactions` — historial de transacciones
- `dc_sorteos` — sorteos
- `dc_bets` — apuestas
- `dc_banca_log` — historial de banca

Migración en: `src/db/migrations/001_init.sql`
