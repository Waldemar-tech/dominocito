# Dominócito — Control de Fases

> Tracking del roadmap de reorganización. Actualizado después de cada fase completada.

---

## Resumen

| Fase | Descripción | Status | % | Fecha inicio | Fecha fin |
|---|---|---|---|---|---|
| **Fase 0** | Mapear y documentar | ✅ Completa | 100% | 2026-07-02 | 2026-07-02 |
| **Fase 1** | Unificar lo crítico | ⏳ Pendiente | 0% | — | — |
| **Fase 2** | Arquitectura limpia | ⏳ Pendiente | 0% | — | — |
| **Fase 3** | Pulir | ⏳ Pendiente | 0% | — | — |

**Total:** 4 fases · 1 completa · 3 pendientes

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

## Fase 1 — Unificar lo crítico ⏳

**Objetivo:** Estandarizar auth, centralizar assets, eliminar código duplicado. Sin refactor grande.

**Tareas planeadas:**
- [ ] Estandarizar keys de auth (solo `dc_*`, deprecate `dominocito_auth`)
- [ ] Centralizar helper de assets (¿shared package o copy simple?)
- [ ] Documentar API contract (qué endpoint usa cada frontend)
- [ ] Eliminar `PintaYGanaRedirect` (usar `<Route>` directo o sub-app separada limpia)
- [ ] Limpiar tipos rotos en `GameBoard.tsx` (PIP_POSITIONS)
- [ ] Centralizar constantes (colores, fuentes, tokens)

**Estimación:** 1-2 semanas

**Riesgos:** Bajo (cambios acotados)

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