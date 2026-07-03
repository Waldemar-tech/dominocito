# E2E Tests — Dominócito home

Tests end-to-end con Playwright.

## Setup

```bash
# Instalar browsers (solo la primera vez)
npx playwright install chromium

# Backend debe estar corriendo en :3200 (tRPC + REST)
launchctl kickstart -k gui/$(id -u)/com.dominocito.backend

# Correr tests
npm run e2e
```

## Cobertura actual

| Archivo | Flujo |
|---------|-------|
| `smoke.spec.ts` | Home, barra de logos, navegación entre juegos, /login renderiza |
| (pendiente) `auth.spec.ts` | Register + login + me vía tRPC |
| (pendiente) `domino.spec.ts` | Lobby: ver salas públicas |

## Notas

- `webServer` del config levanta `npm run dev` (Vite :5173). Si ya corre, lo reusa.
- Tests serializados (`workers: 1`) porque comparten DB Lottopro.
- Backend debe estar en pie — Vite hace proxy de `/trpc` y `/api` a `:3200`.
