# Dominócito — Advanced Security Report
**Implementado:** 2026-06-19  
**Backend:** `~/clawd-dev/dominocito/backend/`  
**Estado:** ✅ 100% Operacional, 0 errores TypeScript

---

## Resumen de Mejoras Implementadas

| # | Feature | Estado | Archivo(s) |
|---|---------|--------|-----------|
| 1 | JWT 15min + Refresh Token con rotación | ✅ | `routes/auth.ts`, `db/migrations/002_security_advanced.sql` |
| 2 | AES-256-GCM cifrado de datos sensibles | ✅ | `crypto/encryption.ts`, `routes/auth.ts`, `routes/wallet.ts`, `routes/sorteos.ts` |
| 3 | ECDSA P-256 firma de sorteos | ✅ | `crypto/signing.ts`, `routes/sorteos.ts`, `routes/admin.ts` |
| 4 | Provably Fair RNG | ✅ | `crypto/provablyFair.ts`, `routes/admin.ts`, `routes/sorteos.ts` |
| 5 | TLS entre servicios (preparación) | ✅ | `middleware/serviceAuth.ts`, `scripts/generate-keys.ts` |

---

## 1. JWT Corto + Refresh Token con Rotación

### ¿Qué hace?
- **Access token:** JWT válido solo 15 minutos (`JWT_EXPIRES_IN=900`)
- **Refresh token:** String aleatorio de 64 bytes (`crypto.randomBytes(64).toString('hex')`), válido 7 días
- **Rotación:** Cada refresh consume el token anterior y emite uno nuevo — si el mismo token se usa dos veces, se detecta un posible robo y **TODOS** los tokens del usuario se revocan
- **Tabla nueva:** `dc_refresh_tokens` (id, user_id, token_hash, expires_at, revoked, created_at)

### ¿Por qué importa?
Si un attacker roba el access token, lo tiene máximo 15 minutos. Con JWT de 7 días (como antes), tenía acceso una semana entera.

La detección de reuso de refresh tokens (token rotation attack detection) invalida ambos tokens al detectar reuso — el attacker y el usuario legítimo deben re-autenticarse.

### Endpoints Nuevos
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/refresh` | Recibe `{ refresh_token }` → devuelve nuevo access_token + refresh_token |
| `POST` | `/auth/logout` | Recibe `{ refresh_token }` + Authorization header → revoca el token |

### Respuesta de Login/Register (nuevo formato)
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "4eaeb6c2...",
  "expires_in": 900,
  "user": { "id": 1, "username": "...", "email": "..." }
}
```

### Variables de entorno
```
JWT_SECRET=<64 bytes hex>
JWT_EXPIRES_IN=900
REFRESH_TOKEN_EXPIRES_DAYS=7
```

---

## 2. AES-256-GCM — Cifrado de Datos Sensibles en DB

### ¿Qué hace?
- Módulo: `src/crypto/encryption.ts`
  - `encrypt(text)` → `{ ciphertext, iv, tag }` (todos hex)
  - `decrypt(ciphertext, iv, tag)` → string original
  - `hashForLookup(value)` → SHA-256 lowercase para índices
- **Campos cifrados:**
  - `dc_users.email` → ciphertext en columna `email`, IV en `email_iv`, tag en `email_tag`
  - `dc_users.email_hash` → SHA-256(email) para búsquedas únicas (UNIQUE index)
  - `dc_wallet_transactions.descripcion` → cifrada con `desc_iv`, `desc_tag`
- **GCM garantiza integridad:** si alguien modifica el ciphertext en la DB, el decrypt lanza error (auth tag mismatch)
- **IV único por operación:** nunca se reutiliza el mismo IV con la misma clave

### ¿Por qué importa?
Si la base de datos se filtra (SQL injection, backup leak, acceso físico), los emails y descripciones de transacciones son ilegibles sin la `ENCRYPTION_KEY`. No hay forma de revertir sin la clave.

### Columnas nuevas en DB (Migration 002)
```sql
-- dc_users
email_hash VARCHAR(64)  -- SHA-256 para lookup
email_iv   VARCHAR(32)  -- AES-GCM IV
email_tag  VARCHAR(32)  -- AES-GCM auth tag

-- dc_wallet_transactions
desc_iv    VARCHAR(32)
desc_tag   VARCHAR(32)
```

### Variables de entorno
```
ENCRYPTION_KEY=<32 bytes hex = 64 chars>  # openssl rand -hex 32
```

> ⚠️ **CRÍTICO:** Si pierdes `ENCRYPTION_KEY`, los datos cifrados son irrecuperables permanentemente.  
> Guarda en 1Password, AWS Secrets Manager, o HashiCorp Vault.

---

## 3. Firma Digital ECDSA de Cada Sorteo

### ¿Qué hace?
- Par de claves P-256 generado automáticamente al iniciar el servidor (en `keys/`)
- Al revelar sorteo: firma `${sorteoId}|${winnerId}|${multX50Id}|${multX100Id}|${serverSeed}|${timestamp}` con ECDSA-SHA256
- Firma guardada en `dc_sorteos.result_signature`
- Clave pública expuesta via `GET /sorteos/public-key`
- Endpoint de verificación: `GET /sorteos/:id/verify`

### ¿Por qué importa?
Cualquier jugador puede verificar matemáticamente que el resultado fue generado por el servidor legítimo (holder de la clave privada) y no fue alterado después. Es evidencia criptográfica irrefutable.

### Endpoints Nuevos
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/sorteos/public-key` | Devuelve clave pública ECDSA P-256 PEM |
| `GET` | `/sorteos/:id/verify` | Resultado + firma + pasos de verificación |

### Archivos de Claves
```
keys/ec-private.pem  (modo 600 — solo el owner puede leer)
keys/ec-public.pem   (modo 644 — público)
```

> ⚠️ Hacer backup de `keys/ec-private.pem`. Sin ella, firmas anteriores no pueden ser verificadas por el servidor (aunque cualquiera con la clave pública puede verificar).

---

## 4. Provably Fair RNG

### ¿Qué hace?
1. **Al crear sorteo:** servidor genera `server_seed` (32 bytes aleatorios hex) y publica solo `server_seed_hash = SHA-256(server_seed)`. El seed permanece secreto.
2. **Al apostar:** jugador puede incluir `client_seed` (string libre, opcional) en su apuesta
3. **Al revelar:** `combined_seed = SHA-256(server_seed + all_client_seeds + sorteo_id)` → usado para derivar winner, ×50, ×100
4. **Después del reveal:** `server_seed` se expone públicamente en `GET /sorteos/:id`

### Verificación Independiente (cualquier jugador)
```python
import hashlib

# 1. Verificar que el seed no fue cambiado:
assert hashlib.sha256(server_seed.encode()).hexdigest() == server_seed_hash

# 2. Reproducir el sorteo:
combined = hashlib.sha256((server_seed + client_seed + str(sorteo_id)).encode()).hexdigest()
buf = bytes.fromhex(combined)
n1 = int.from_bytes(buf[0:8], 'big')
winner = n1 % 28
```

### Columnas nuevas en dc_sorteos
```sql
server_seed_hash VARCHAR(64)   -- público desde la creación
server_seed      VARCHAR(64)   -- null hasta revelar, luego público
client_seed      TEXT          -- concatenación de seeds de jugadores
result_signature TEXT          -- firma ECDSA del resultado
```

### Parámetro nuevo en POST /sorteos/bet
```json
{
  "sorteo_id": 1,
  "domino_id": 5,
  "amount_eur": 2.50,
  "client_seed": "mi-seed-personalizado-opcional"
}
```

---

## 5. TLS Entre Servicios (Preparación)

### ¿Qué hace?
- Middleware `src/middleware/serviceAuth.ts`: valida header `X-Service-Token` en rutas `/admin/*`
- Si `SERVICE_TOKEN` no está configurado, el check se omite (backward compat)
- Comparación en tiempo constante (`crypto.timingSafeEqual`) para prevenir timing attacks
- Script `scripts/generate-keys.ts`: genera todos los secrets necesarios y los imprime para copiar al `.env`

### Uso
```bash
# Llamadas admin internas deben incluir ambos headers:
curl -X POST http://localhost:3200/admin/sorteos/crear \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "X-Service-Token: $SERVICE_TOKEN" \
  -H "Content-Type: application/json"
```

### Generar todas las claves
```bash
cd ~/clawd-dev/dominocito/backend
npx ts-node scripts/generate-keys.ts
```

---

## Variables de Entorno Completas

```bash
# ─── JWT (corto) ────────────────────────────────────────────
JWT_SECRET=<openssl rand -hex 64>
JWT_EXPIRES_IN=900               # 15 minutos en segundos
REFRESH_TOKEN_EXPIRES_DAYS=7     # 7 días

# ─── Cifrado AES-256-GCM ────────────────────────────────────
ENCRYPTION_KEY=<openssl rand -hex 32>  # 64 chars hex

# ─── Service Token ──────────────────────────────────────────
SERVICE_TOKEN=<openssl rand -hex 32>

# (ECDSA keys se generan automáticamente en keys/ al iniciar)
```

---

## Todos los Endpoints

### Auth
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Registro con email cifrado |
| POST | `/auth/login` | — | Login → access + refresh token |
| POST | `/auth/refresh` | **NEW** | Renovar access token (rotación) |
| POST | `/auth/logout` | Bearer | Revocar refresh token |
| GET | `/auth/me` | Bearer | Perfil del usuario |

### Sorteos
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/sorteos/public-key` | — | **NEW** Clave pública ECDSA |
| GET | `/sorteos/current` | — | Sorteo activo |
| GET | `/sorteos/:id` | — | Detalle (server_seed visible después de reveal) |
| GET | `/sorteos/:id/verify` | — | **NEW** Verificar firma ECDSA + provably fair |
| POST | `/sorteos/bet` | Bearer | Apostar (soporta client_seed) |

### Admin
| Método | Ruta | Headers | Descripción |
|--------|------|---------|-------------|
| POST | `/admin/sorteos/crear` | X-Admin-Key + X-Service-Token | Crear sorteo (provably fair) |
| POST | `/admin/sorteos/:id/revelar` | X-Admin-Key + X-Service-Token | Revelar + pagar + firmar |
| GET | `/admin/stats` | X-Admin-Key + X-Service-Token | **NEW** Stats del sistema |

---

## Archivos Nuevos/Modificados

```
src/
├── crypto/                         ← NUEVO directorio
│   ├── encryption.ts               ← AES-256-GCM
│   ├── signing.ts                  ← ECDSA P-256
│   └── provablyFair.ts             ← Combined seed RNG
├── middleware/
│   └── serviceAuth.ts              ← NUEVO: X-Service-Token
├── db/
│   ├── migrate.ts                  ← ACTUALIZADO: multi-file migrations
│   └── migrations/
│       └── 002_security_advanced.sql  ← NUEVO
├── routes/
│   ├── auth.ts                     ← ACTUALIZADO: refresh/logout endpoints
│   ├── sorteos.ts                  ← ACTUALIZADO: verify, public-key, client_seed
│   ├── admin.ts                    ← ACTUALIZADO: provably fair + ECDSA
│   └── wallet.ts                   ← ACTUALIZADO: decrypt descriptions
├── types/index.ts                  ← ACTUALIZADO: nuevos campos
└── index.ts                        ← ACTUALIZADO: initSigningKeys + warnings

scripts/
└── generate-keys.ts                ← NUEVO: generador de secrets

keys/                               ← NUEVO directorio (auto-creado al iniciar)
├── ec-private.pem                  ← ECDSA privada (modo 600)
└── ec-public.pem                   ← ECDSA pública (modo 644)

.env.example                        ← ACTUALIZADO: todas las variables nuevas
```

---

## Pruebas Verificadas

| Test | Resultado |
|------|-----------|
| Build TypeScript sin errores | ✅ |
| Migration 001 + 002 aplicadas | ✅ |
| Servidor arranca sin errores | ✅ |
| POST /auth/register → access_token + refresh_token | ✅ |
| POST /auth/login → expires_in: 900 (15 min) | ✅ |
| POST /auth/refresh → rotación exitosa | ✅ |
| POST /auth/refresh con token revocado → error de seguridad | ✅ |
| POST /auth/logout → token revocado | ✅ |
| GET /sorteos/public-key → ECDSA P-256 PEM | ✅ |
| ECDSA keypair cargado desde disco | ✅ |

---

*Generado automáticamente — Dev subagent — 2026-06-19*
