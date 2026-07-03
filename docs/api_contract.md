# Dominócito — API Contract

> Contrato entre el backend Express y los 2 frontends (home + pinta-y-gana).
> **Última actualización:** Fase 1

---

## 1. Base URL

**Desarrollo local:**
- Backend: `http://localhost:3200`
- Frontends (Vite dev server): `localhost:5173` (home), `localhost:5174` (pinta-y-gana)
- Proxy de Vite: `/api` → `http://localhost:3200`

**Producción:**
- Todo detrás de nginx en `lottopro-web` (10.101.20.3)
- Frontends servidos como static files
- `/api` proxied a backend en `localhost:3200`

---

## 2. Auth

**Estándar único (Fase 1):** keys `dc_*` en `localStorage`.

| Key | Tipo | Descripción |
|---|---|---|
| `dc_access_token` | string | JWT access token (15min) |
| `dc_refresh_token` | string | JWT refresh token (7d) |
| `dc_user_id` | string | ID del usuario |
| `dc_username` | string | Username para UI |

**Header de autorización:**
```
Authorization: Bearer <access_token>
```

**Endpoints:**
- `POST /auth/register` — body: `{ username, email, password }` → `{ access_token, refresh_token, user }`
- `POST /auth/login` — body: `{ email, password }` → `{ access_token, refresh_token, user }`
- `POST /auth/refresh` — body: `{ refresh_token }` → `{ access_token, refresh_token }`
- `POST /auth/logout` — body: `{ refresh_token }` → `{ ok: true }`
- `GET /auth/me` — auth required → `{ user }`

**Quién usa qué:**
- `dominocito-home` (Dominó Clásico): register, login, refresh, logout, me
- `pinta-y-gana`: register, login, me (asume sesión del home via SSO)

---

## 3. Wallet

| Endpoint | Método | Auth | Body | Response |
|---|---|---|---|---|
| `/wallet` | GET | sí | — | `{ balance_eur, ... }` |
| `/wallet/add` | POST | sí | `{ amount_eur }` | `{ balance_eur }` (testing only) |

---

## 4. Pinta y Gana (Sorteos)

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| `/sorteos/current` | GET | no | Sorteo abierto actual |
| `/sorteos/public-key` | GET | no | Llave pública ECDSA |
| `/sorteos/:id` | GET | no | Detalle de sorteo |
| `/sorteos/:id/verify` | GET | no | Verificar firma ECDSA |
| `/sorteos/bet` | POST | sí | Apostar (soporta `client_seed`) |
| `/admin/sorteos/crear` | POST | admin | Crear sorteo |
| `/admin/sorteos/:id/revelar` | POST | admin | Revelar resultado |

**Admin auth:** header `X-Admin-Key` + `X-Service-Token`

---

## 5. Dominó Clásico

### REST

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| `/domino/rooms` | POST | sí | Crear sala (`{ isPrivate, maxPlayers }`) |
| `/domino/rooms/:code` | GET | sí | Info de sala |
| `/domino/rooms/:code/join` | POST | sí | Unirse |
| `/domino/rooms/:code/leave` | POST | sí | Salir |

### WebSocket (Socket.IO)

Namespace: `/socket.io` (default)

**Cliente → Servidor:**
- `auth` — `{ token }` — autenticar socket
- `domino:join` — `{ roomId }`
- `domino:play` — `{ tile, side }`
- `domino:pass` — `{}`
- `domino:start` — `{}` (host)
- `domino:reconnect` — `{ roomId }`

**Servidor → Cliente:**
- `auth:ok` / `auth:error`
- `domino:state` — estado del juego filtrado por jugador
- `domino:started`
- `domino:player_joined`
- `domino:player_left`
- `domino:turn_timeout`
- `domino:finished`

---

## 6. Formato de errores

Todos los errores devuelven `{ error: string }` (en español):
```json
{ "error": "Token inválido" }
```

Validaciones devuelven `{ error, validationErrors: [{ field, message }] }`.

---

## 7. CORS

Configurado en backend via `CORS_ORIGIN` env var. En producción:
- `https://dominocito.com` (home)
- (no necesita el sub-app porque es mismo origen)

En dev: `http://localhost:5173` por default.

---

## 8. Rate Limiting

- `/auth/login`: max 5 intentos / 15min por IP
- `/auth/register`: max 3 / hora por IP
- General: helmet + 100 req / min por IP

---

## 9. Mapa de uso por frontend

### dominocito-home
- ✅ `/auth/*` — register, login, logout
- ✅ `/domino/rooms/*` — crear, listar, unirse
- ✅ `/domino/rooms/:code` — info
- ✅ WebSocket `domino:*`
- ❌ No usa wallet
- ❌ No usa sorteos

### pinta-y-gana
- ✅ `/auth/login`, `/auth/register`, `/auth/me` (vía SSO del home)
- ✅ `/wallet`, `/wallet/add` (testing)
- ✅ `/sorteos/current`, `/sorteos/bet`
- ❌ No usa dominó
- ❌ No usa admin