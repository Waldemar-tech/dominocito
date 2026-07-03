# Dominócito — Control de Fases

> Tracking del roadmap de reorganización. Actualizado después de cada fase completada.

---

## Resumen

| Fase | Descripción | Status | % | Fecha inicio | Fecha fin |
|---|---|---|---|---|---|
| **Fase 0** | Mapear y documentar | ✅ Completa | 100% | 2026-07-02 | 2026-07-02 |
| **Fase 1** | Unificar lo crítico | ✅ Completa | 100% | 2026-07-02 | 2026-07-02 |
| **Fase 2** | Arquitectura limpia | 🚧 En curso | 20% | 2026-07-03 | — |
| **Fase 3** | Pulir | ⏳ Pendiente | 0% | — | — |

**Total:** 4 fases · 2 completas · 1 en curso · 1 pendiente

---

## Fase 0 — Mapear y documentar ✅

**Objetivo:** Entender todo el sistema sin tocar código. Crear mapa, identificar problemas, proponer roadmap.

**Tareas:**
- [x] Leer código del backend (Express + Socket.IO + motor de dominó)
- [x] Leer código del frontend home (React + animaciones Motion)
- [x] Leer código del frontend Pinta y Gana (SPA separada)
- [x] Mapear endpoints del backend
- [x] Mapear comunicación WebSocket
- [x] Identificar bugs latentes (auth duplicada, rutas hardcodeadas)
- [x] Crear `docs/dominocito_sistema_completo.md`
- [x] Crear este tracking

**Entregables:**
- `docs/dominocito_sistema_completo.md` (mapa completo)
- Este archivo (`tasks/dominocito_fases.md`)
- 8 problemas identificados con severidad y ubicación

**Decisiones tomadas:**
- Mantener 2 SPAs por ahora (refactor grande lo vemos en Fase 2)
- SSO entre home y sub-app via fallback en `loadSession()` (fix rápido)
- Helper `assetUrl()` para rutas relativas en sub-app

**Bloqueos:** Ninguno

**Tiempo:** ~1.5 horas

---

## Fase 1 — Unificar lo crítico ✅

**Objetivo:** Estandarizar auth, centralizar assets, eliminar código duplicado. Sin refactor grande.

**Tareas:**
- [x] Estandarizar keys de auth (solo `dc_*`, eliminar `dominocito_auth`)
- [x] Centralizar helper de assets (copiar `assetUrl` al home)
- [x] Reemplazar rutas hardcodeadas en `GameBoard.tsx` con `assetUrl`
- [x] Limpiar tipos rotos en `GameBoard.tsx` (PIP_POSITIONS ya estaba limpio)
- [x] Documentar API contract (`docs/api_contract.md`)
- [x] Build + deploy de ambos frontends

**Cambios aplicados:**
- `pinta-y-gana/src/auth/authStore.ts` reescrito: usa keys `dc_*` como estándar único. Eliminado fallback SSO complejo (ahora es directo porque comparten keys).
- `dominocito-home/src/utils/baseUrl.ts` creado (copy del de pinta-y-gana).
- `dominocito-home/src/domino/GameBoard.tsx` ahora usa `assetUrl()` para rutas de assets.
- `docs/api_contract.md` creado con todos los endpoints y su uso por frontend.

**Build sizes:**
- Home: 446 KB JS / 142 KB gzip
- Pinta y Gana: 247 KB JS / 74 KB gzip

**Deploy:**
- Ambos frontends desplegados en `/var/www/dominocito-front/`
- Smoke tests OK: home 200, pinta-y-gana 200, /api/auth/login responde

**Tiempo:** ~30 minutos

**Riesgos:** Bajo (cambios acotados, backup en git previo)

---

## Fase 2 — Arquitectura limpia 🚧

**Objetivo:** Decidir y aplicar estructura de largo plazo. SPA única multi-juego con tRPC, Zustand, tests E2E.

**Decisión tomada:** SPA única multi-juego con código splitting por ruta.

### Parte 2.1 — Mover Pinta y Gana al home ✅

**Tareas:**
- [x] Crear estructura `dominocito-home/src/games/pinta-y-gana/`
- [x] Mover archivos (componentes, engine, auth, pages, utils)
- [x] Mover assets a `dominocito-home/public/assets/pinta-y-gana/`
- [x] Implementar lazy loading con `React.lazy()` para code splitting
- [x] Crear `games/loteria/LoteriaPage.tsx` con lazy loading también
- [x] Limpiar `App.tsx` del home: rutas + fallback
- [x] Eliminar sub-app vieja del server (`/var/www/dominocito-front/pinta-y-gana/`)
- [x] Build + deploy + smoke tests

**Resultados:**
- Bundle principal: 447 KB JS → **142 KB gzip** (home + dominó, igual que antes)
- Chunk Pinta y Gana: 55 KB → **14 KB gzip** (lazy, se descarga al navegar)
- Chunk Lotería: 0.67 KB → 0.42 KB gzip
- `/pinta-y-gana` y `/loteria` ahora son SPA routes del home
- Cero sub-app separada en el server

**Tiempo:** ~45 minutos

### Parte 2.2 — Migrar a tRPC ⏳

Cliente API tipado end-to-end (backend Express + frontend React).

### Parte 2.3 — Zustand stores ⏳

`useAuthStore`, `useWalletStore` con state management limpio.

### Parte 2.4 — Barra superior de logos ⏳

Visión: barra global con logos de los 3 juegos + navegación.

### Parte 2.5 — Tests E2E + cleanup ⏳

Playwright para flujos críticos, eliminar código muerto.

---

## Fase 3 — Pulir ⏳

**Objetivo:** CI/CD, monitoring, onboarding.

**Tareas planeadas:**
- [ ] CI/CD básico (test + build + deploy)
- [ ] Monitoring de errores (Sentry o similar)
- [ ] Documentación de onboarding
- [ ] Performance audit
- [ ] Accesibilidad (a11y)

**Estimación:** 1 semana

**Riesgos:** Bajo

---

## Cómo actualizar este archivo

Después de cada fase completada:

1. Cambiar el status de la fase (✅ Completa, 🚧 En curso, ⏳ Pendiente)
2. Marcar tareas completadas con [x]
3. Agregar fecha de inicio y fin
4. Documentar decisiones tomadas
5. Listar bloqueos si los hubo
6. Actualizar el resumen

**No empezar una fase nueva sin completar la anterior (o documentar por qué se saltea).**