# Dominócito — Control de Fases

> Tracking del roadmap de reorganización. Actualizado después de cada fase completada.

---

## Resumen

| Fase | Descripción | Status | % | Fecha inicio | Fecha fin |
|---|---|---|---|---|---|
| **Fase 0** | Mapear y documentar | ✅ Completa | 100% | 2026-07-02 | 2026-07-02 |
| **Fase 1** | Unificar lo crítico | ✅ Completa | 100% | 2026-07-02 | 2026-07-02 |
| **Fase 2** | Arquitectura limpia | ⏳ Pendiente | 0% | — | — |
| **Fase 3** | Pulir | ⏳ Pendiente | 0% | — | — |

**Total:** 4 fases · 2 completas · 2 pendientes

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

## Fase 2 — Arquitectura limpia ⏳

**Objetivo:** Decidir estructura de largo plazo. SPA única vs 2 SPAs. Cliente API tipado.

**Decisiones pendientes:**
- ¿Una SPA multi-juego o mantener 2?
- ¿tRPC o cliente API custom?
- ¿Estado de dominó en memoria o persistente (Redis)?

**Tareas planeadas (dependen de decisiones):**
- [ ] Si SPA única: integrar pinta-y-gana como ruta
- [ ] Cliente API tipado (tRPC, Eden, o REST con tipos compartidos)
- [ ] State management (Zustand, Redux, o Context)
- [ ] Tests E2E del flujo completo
- [ ] Manejo de errores consistente

**Estimación:** 2-3 semanas

**Riesgos:** Medio (cambios amplios)

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