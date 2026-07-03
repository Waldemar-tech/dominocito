# Dominócito — Mapa del Sistema

> **Status:** Fase 0 (auditoría y mapeo, sin tocar código)
> **Última actualización:** 2026-07-02
> **Stack:** Express + Socket.IO + Postgres (back) · React 19 + Vite + Tailwind (front)

---

## 1. Vista general

Dominócito es una plataforma de juegos de dominó digitales con **3 juegos previstos**:

| Juego | Estado | Frontend | Tipo |
|---|---|---|---|
| **Dominó Clásico** | ✅ Funcional | `dominocito-home` | 4 jugadores, real-time |
| **Pinta y Gana** | ✅ Funcional | `pinta-y-gana` (SPA separada) | Sorteo individual, RNG verificable |
| **Lotería** | 🚧 Stub | (no implementado) | Próximamente |

**Infraestructura:**
- **Backend:** un solo proceso Express que sirve 3 APIs (`/auth`, `/sorteos`, `/domino`, `/wallet`, `/admin`)
- **Frontend:** **2 SPAs independientes** que se sirven como apps separadas en nginx
- **DB:** PostgreSQL (vía VPN Lottopro en producción: 10.101.20.2)
- **Deploy:** rsync manual + `auto_deploy.sh` que vigila GitLab

---

## 2. Arquitectura actual (cómo se conectan las piezas)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser del usuario                                        │
└─────────────────────────────────────────────────────────────┘
            │                                  │
            ▼                                  ▼
   https://dominocito.com/        https://dominocito.com/pinta-y-gana/
            │                                  │
            ▼                                  ▼
   ┌──────────────────────┐         ┌──────────────────────┐
   │  dominocito-home     │         │  pinta-y-gana        │
   │  (SPA principal)     │         │  (SPA separada)      │
   │                      │         │                      │
   │  - HomePage (cards)  │         │  - HomePage pública  │
   │  - AuthScreen        │         │  - AuthScreen        │
   │  - DominoLobby       │         │  - App (juego)       │
   │  - WaitingRoom       │         │                      │
   │  - GameBoard         │         │  Auth propia:        │
   │                      │         │  key="dominocito_auth"│
   │  Auth: dc_*          │         │  (con fallback SSO)  │
   └──────────┬───────────┘         └──────────┬───────────┘
              │                                │
              │  HTTP fetch + Socket.IO         │
              ▼                                ▼
   ┌─────────────────────────────────────────────────────┐
   │  nginx (en lottopro-web, 10.101.20.3)               │
   │  - /            → dominocito-home/dist/             │
   │  - /pinta-y-gana/ → pinta-y-gana/dist/               │
   │  - /api/         → proxy a localhost:3200            │
   └─────────────────────────┬───────────────────────────┘
                             │
                             ▼
   ┌─────────────────────────────────────────────────────┐
   │  Backend Express (puerto 3200)                       │
   │  Endpoints:                                          │
   │   POST /auth/register, /auth/login, /auth/refresh   │
   │   GET  /auth/me                                      │
   │   GET  /sorteos/current, /sorteos/:id                │
   │   POST /sorteos/bet                                 │
   │   GET  /wallet, POST /wallet/add                    │
   │   GET  /domino/rooms/:code                          │
   │   POST /domino/rooms, /domino/rooms/:code/join      │
   │   WebSocket: domino:state, domino:play, etc.        │
   │                                                      │
   │  Servicios:                                          │
   │   - JWT (15min access + 7d refresh)                  │
   │   - AES-256-GCM (email + transacciones)              │
   │   - ECDSA P-256 (firmas de sorteos)                  │
   │   - Provably Fair RNG                                │
   │   - Rate limiting (helmet + express-rate-limit)      │
   └─────────────────────────┬───────────────────────────┘
                             │
                             ▼
   ┌─────────────────────────────────────────────────────┐
   │  PostgreSQL (vía VPN Lottopro: 10.101.20.2:5432)    │
   │  DB: dominocito                                       │
   │                                                      │
   │  Tablas (parcial):                                    │
   │   - dc_users (email encriptado)                      │
   │   - dc_refresh_tokens                                │
   │   - dc_wallets                                       │
   │   - dc_sorteos, dc_bets, dc_transacciones            │
   │   - dc_domino_rooms, dc_domino_games                 │
   │   - dc_banca_log                                     │
   │   - dc_cifrado_aes (preservado de migración)         │
   └─────────────────────────────────────────────────────┘
```

---

## 3. Componentes detallados

### 3.1 Backend (`dominocito/backend/`)

**Stack:** Express 4.19 + Socket.IO 4.8 + Postgres (raw `pg`) + JWT + bcryptjs

**Tamaño:** ~3,500 líneas TS en `src/`

**Estructura:**
```
src/
├── index.ts                    # Bootstrap (221 líneas)
├── routes/
│   ├── auth.ts                 # /auth/*  (JWT, refresh tokens, AES)
│   ├── sorteos.ts              # /sorteos/* (Pinta y Gana)
│   ├── wallet.ts               # /wallet/* (testing funds)
│   ├── admin.ts                # /admin/* (sortear, revelar)
│   └── domino.ts               # /domino/* (rooms REST)
├── realtime/
│   └── domino-socket.ts        # WebSocket handlers
├── engine/
│   └── domino-classic.ts       # Reglas del dominó venezolano
├── middleware/
│   ├── auth.ts                 # requireAuth (JWT verify)
│   ├── adminAuth.ts
│   ├── rateLimiter.ts
│   └── serviceAuth.ts
├── crypto/
│   ├── encryption.ts           # AES-256-GCM
│   ├── signing.ts              # ECDSA P-256
│   └── provablyFair.ts         # RNG verificable
├── db/
│   ├── pool.ts                 # PG connection
│   ├── migrate.ts              # CLI migrador
│   └── migrations/             # SQL files
└── utils/crypto.ts
```

**Funcionalidades clave:**
- JWT con access (15min) + refresh tokens (7d, con revocación)
- AES-256-GCM para emails y transacciones
- ECDSA para firmas de sorteos (Provably Fair)
- Socket.IO con state en memoria + persistencia de resultados
- Rate limiting por IP y por usuario
- Helmet con CSP estricta

**Cuestiones pendientes (para fases futuras):**
- Sin tests automatizados
- Estado de dominó en memoria (se pierde en restart)
- Logging básico (morgan) — sin observabilidad real

---

### 3.2 Frontend Home (`dominocito/dominocito-home/`)

**Stack:** React 19 + Vite 7 + React Router 7 + Socket.IO client + Motion (animaciones)

**Tamaño:** ~2,300 líneas TSX

**Estructura:**
```
src/
├── main.tsx                    # Entry point (BrowserRouter)
├── App.tsx                     # Rutas + redirects
├── pages/
│   └── HomePage.tsx            # Landing con cards de juegos
└── domino/
    ├── AuthScreen.tsx          # Login/register
    ├── DominoLobby.tsx         # Listado de salas públicas
    ├── WaitingRoom.tsx         # Sala de espera pre-juego
    ├── DominoRoom.tsx          # Contenedor de juego (con socket)
    └── GameBoard.tsx           # Tablero + animaciones (con Motion)
```

**Auth:** Keys locales `dc_access_token`, `dc_refresh_token`, `dc_username`, `dc_user_id`

**Animaciones (recién agregadas):**
- Motion 12.42 (`layoutId` para viaje ficha → tablero)
- Spring config: `stiffness: 320, damping: 28`
- Dobles con thump (`scale 1 → 1.18 → 1` + halo dorado)
- Selección con spring + glow
- Highlights pulsantes en extremos del board
- Respeto a `prefers-reduced-motion`

**Cuestiones:**
- Sin state management (todo useState + useEffect)
- Sin cliente API tipado (fetch directo)
- Bundle: 446 KB JS / 142 KB gzip

---

### 3.3 Frontend Pinta y Gana (`dominocito/pinta-y-gana/`)

**Stack:** React 19.2 + Vite 8 + Tailwind 4 (sin Router — single screen con lógica de routing interna)

**Tamaño:** ~3,300 líneas TSX

**Estructura:**
```
src/
├── main.tsx                    # Entry + polyfill crypto.randomUUID
├── App.tsx                     # Routing condicional (logged in/out)
├── api/
│   └── client.ts               # Fetch wrapper
├── auth/
│   ├── authStore.ts            # Auth state + SSO fallback (recién)
│   └── AuthScreen.tsx
├── components/
│   ├── DominoTile.tsx          # Ficha visual (usa assetUrl)
│   └── Countdown.tsx           # Timer animado
├── engine/
│   ├── dominoes.ts             # Constantes de las 28 fichas
│   ├── sorteo.ts               # Lógica de sorteos
│   └── wallet.ts               # Wallet client-side
├── pages/
│   └── HomePage.tsx            # Landing pública
└── utils/
    └── baseUrl.ts              # Helper de rutas (recién agregado)
```

**Auth:** Propia con `dominocito_auth`, **con fallback SSO al home** (recién agregado):
- Si `dominocito_auth` no existe, busca `dc_access_token`, `dc_username`, `dc_user_id`
- Si existen, promueve la sesión a la key propia
- Refresca email desde `/api/auth/me` en background

**Cuestiones:**
- Sin Router real (todo lógica condicional en `App.tsx`)
- Algunos assets están en `engine/`, otros en `pages/` — sin organización clara
- Sin cliente HTTP tipado
- Engine de sorteos client-side (depende de backend para persistir)

---

## 4. Problemas identificados en Fase 0

### 4.1 Bugs latentes (encontrados durante el mapeo)

| # | Severidad | Problema | Ubicación | Estado |
|---|---|---|---|---|
| 1 | 🔴 Alta | Auth duplicada (2 sistemas independientes) | home + pinta-y-gana | ✅ Fix parcial (SSO fallback) |
| 2 | 🔴 Alta | Rutas de assets hardcodeadas (`/assets/...`) | pinta-y-gana | ✅ Fix parcial (assetUrl helper) |
| 3 | 🟡 Media | deploy de sub-app inexistente en nginx | nginx .3 | ✅ Fix (rsync + try_files) |
| 4 | 🟡 Media | `PintaYGanaRedirect` usa `window.location.href` (pierde history) | dominocito-home | ⚠️ Pendiente (usar navigate) |
| 5 | 🟡 Media | Pino roto en build de dominocito-home (`PIP_POSITIONS` con tipos rotos) | GameBoard.tsx | ⚠️ Pendiente (no afecta runtime) |
| 6 | 🟢 Baja | 2 SPAs separadas para una sola plataforma | arquitectura | 📋 Fase 1-2 |
| 7 | 🟢 Baja | Assets duplicados (logos, fichas) entre frontends | assets/ | 📋 Fase 1 |
| 8 | 🟢 Baja | Sin tests automatizados | todos | 📋 Fase 3 |

### 4.2 Decisiones arquitectónicas pendientes

1. **¿Una SPA o dos?**
   - **Actual:** 2 SPAs con sus propios builds, deploys, auth, assets
   - **Opción A:** Mantener separadas (más simple, menos refactor)
   - **Opción B:** Unificar en una SPA multi-juego (más limpio a futuro)

2. **¿Auth centralizada?**
   - **Actual:** Cada frontend maneja su sesión local
   - **Propuesto:** Backend emite token, frontend solo lo guarda (ya casi así)

3. **¿Estado de dominó en memoria vs DB?**
   - **Actual:** In-memory Map (se pierde en restart)
   - **Cuestión:** ¿Vale migrar a Redis/persistente?

4. **¿Engine de sorteos client-side?**
   - **Actual:** pinta-y-gana hace la lógica del sorteo, solo persiste resultado
   - **Riesgo:** Confiar en el cliente para RNG

---

## 5. Roadmap propuesto

### Fase 0 — Mapear y documentar ✅ (en curso)
- [x] Leer todo el código
- [x] Documentar arquitectura
- [x] Listar problemas
- [x] Crear tracking de fases

### Fase 1 — Unificar lo crítico (1-2 semanas)
- [ ] Estandarizar keys de auth (solo `dc_*`, eliminar `dominocito_auth`)
- [ ] Centralizar helper de assets (shared package o copy)
- [ ] Documentar API contract entre back/front
- [ ] Eliminar código duplicado

### Fase 2 — Arquitectura limpia (2-3 semanas)
- [ ] Decidir: ¿SPA única multi-juego o mantener 2?
- [ ] Si SPA única: integrar pinta-y-gana como ruta del home
- [ ] Cliente API tipado (tRPC o similar)
- [ ] Tests E2E del flujo completo

### Fase 3 — Pulir (1 semana)
- [ ] CI/CD básico (test + build + deploy)
- [ ] Monitoring de errores
- [ ] Documentación de onboarding
- [ ] Performance audit

---

## 6. Tracking de fases

Ver: [`tasks/dominocito_fases.md`](../tasks/dominocito_fases.md)

---

## 7. Comandos útiles

```bash
# Backend
cd ~/clawd-dev/dominocito/backend && npm run dev
cd ~/clawd-dev/dominocito/backend && npm run build && npm start

# Frontend home
cd ~/clawd-dev/dominocito/dominocito-home && npm run dev
cd ~/clawd-dev/dominocito/dominocito-home && npm run build

# Frontend Pinta y Gana
cd ~/clawd-dev/dominocito/pinta-y-gana && npm run dev
cd ~/clawd-dev/dominocito/pinta-y-gana && npm run build

# Deploy al .3 (rsync)
rsync -avz --delete -e "ssh -i ~/.ssh/gitlab_ci_dominocito" \
  ~/clawd-dev/dominocito/dominocito-home/dist/ \
  lottopro@10.101.20.3:/var/www/dominocito-front/

rsync -avz --delete -e "ssh -i ~/.ssh/gitlab_ci_dominocito" \
  ~/clawd-dev/dominocito/pinta-y-gana/dist/ \
  lottopro@10.101.20.3:/var/www/dominocito-front/pinta-y-gana/

# Siempre después: chmod o+rX
ssh -i ~/.ssh/gitlab_ci_dominocito lottopro@10.101.20.3 \
  "chmod -R o+rX /var/www/dominocito-front/"

# Backend (LaunchAgent en Mac mini)
launchctl list | grep dominocito
launchctl kickstart -k gui/$(id -u)/com.dominocito.backend

# Auto-deploy (vigila GitLab)
./scripts/auto_deploy.sh
```