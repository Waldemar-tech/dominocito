# Análisis Técnico — Migración Visual 2D Dominócito

**Proyecto:** Dominócito (pinta-y-gana)
**Backend:** `~/clawd-dev/dominocito/backend/` (puerto **3200**, NO 5180 — MEMORY.md estaba desactualizado)
**Frontend actual:** `~/clawd-dev/dominocito/pinta-y-gana/` (React + Vite + TypeScript)
**Referencia visual:** `~/clawd-dev/domino-evals/domino-3d-threejs/Domino/` (Devil33, Three.js)

**Decisión:** Render **2D puro** (sin WebGL/Three.js), replicando las mecánicas visuales de Devil33 (cadena que se ramifica, dobles perpendiculares, orientación automática).

---

## 1. Mapa del estado actual

### 1.1 Backend (NO SE TOCA)

```
backend/src/
├── engine/
│   └── domino-classic.ts         ← Reglas Vzla completas (motor puro, serializable)
├── realtime/
│   └── domino-socket.ts          ← Socket.IO handlers (emite eventos al front)
├── routes/
│   ├── auth.ts                   ← JWT, register, login, me
│   ├── wallet.ts                 ← Balance EUR, recargas
│   ├── sorteos.ts                ← Sorteo tipo Pinta y Gana (no es lo que migramos)
│   ├── domino.ts                 ← Salas: createRoom, join, leave, public, mine
│   └── admin.ts
├── db/
│   ├── pool.ts                   ← Conexión Lottopro (10.101.20.2/dominocito)
│   └── migrations/003_domino_classic.sql  ← Esquema de mesas, players, games, stats
├── middleware/auth.ts            ← requireAuth (JWT)
└── index.ts                      ← Entry: trpc + Socket.IO en 3200
```

**Lo que YA está resuelto y NO se reescribe:**

| Capa | Estado |
|------|--------|
| Auth (JWT + ECDSA) | ✅ Producción |
| Salas (crear/unirse/salir/públicas/mías) | ✅ Producción |
| Motor de juego Vzla (4 jugadores, dobles, tranca, puntos) | ✅ Producción |
| WebSocket (`domino:*`) con emisión filtrada por usuario | ✅ Producción |
| Persistencia resultados + stats | ✅ Producción |
| Reglas: doble más alto sale, pasa si no tiene, tranca = 4 pases, gana menos pts | ✅ Producción |

### 1.2 Frontend actual (ESTO ES LO QUE MIGRAMOS)

```
pinta-y-gana/src/
├── engine/dominoes.ts            ← 28 fichas (NO se toca, lo reusa el back)
├── components/
│   ├── DominoTile.tsx            ← Ficha individual: 225 líneas, SVG + PNG
│   └── Countdown.tsx
├── pages/HomePage.tsx            ← Landing con hero, tablero 7×4, stats → **561 líneas**
├── App.tsx                       ← Router + auth state
├── api/client.ts                 ← Fetch wrapper (NO usar en Domino, usar socket directo)
├── auth/                         ← Login/register UI
└── utils/baseUrl.ts              ← Helper para assets
```

**El problema:** `HomePage.tsx` es el landing de Pinta-y-Gana (sortear fichas), **NO es la mesa de dominó**. El componente de juego de la mesa (con la cadena, los 4 jugadores, el socket) **NO EXISTE AÚN** o está en otra parte. Voy a verificar.

### 1.3 Devil33 (referencia visual)

```
domino-evals/domino-3d-threejs/Domino/JS/
├── Domino.js               ← Main (326 líneas)
├── Domino_Ficha.js         ← Clase Ficha: posición 3D, dirección, colocar (464 líneas)
├── Domino_Partida.js       ← Lógica de partida + render (536 líneas)
├── Domino_UI.js            ← UI HTML overlay (317 líneas)
├── Domino_Opciones.js      ← Config local (idioma, jugadores, dificultad)
└── Domino_Texturas.js      ← SVG atlas con las 28 fichas (123 líneas)
```

**Lo bueno de Devil33 que queremos portar a 2D:**

| # | Mecánica visual | Cómo se traduce a 2D puro |
|---|-----------------|----------------------------|
| 1 | **Cadena bidireccional** desde extremos libres | Array `board[]` con punteros `headLeft`, `headRight`. El render calcula coordenadas hacia afuera. |
| 2 | **Direccionalidad por espacio**: si no cabe horizontal → vertical | Algoritmo: si `nextX+ancho > mesaW`, la ficha pasa a otra fila con offset Y. |
| 3 | **Dobles perpendiculares** | Si la ficha es doble → `rotate(90deg)` automático. |
| 4 | **Tunable branch**: cuando L1 != R1 → doble Y/T | Renderiza ambas ramas desde el centro hasta los extremos. |
| 5 | **Cadena que dobla en L al chocar borde** | Cambio de fila + col vertical en el último punto. |
| 6 | **Animación "snap-to-grid"** al colocar | CSS `transition: transform 400ms cubic-bezier`. |
| 7 | **Hover highlight en mitad válida** | Cuando la ficha es jugable, anima el lado que coincide. |
| 8 | **Mano en abanico (curvada)** | `transform: rotate(deg)` por índice en mano. |

**Veredicto Devil33:** la lógica de juego es básica (clásico español, 2v2 local). **Reusable: 0% del código JS. Reusable: 80% del CONCEPTO visual** → lo portamos a TypeScript/CSS sin tocar Three.js.

---

## 2. Componentes reutilizables vs a reescribir

### ✅ REUTILIZAR (no tocar)

| Componente | Por qué |
|------------|---------|
| `engine/domino-classic.ts` | Motor puro, ya tiene todo |
| Todo `realtime/domino-socket.ts` | Ya emite `domino:state` con shape completo |
| `routes/domino.ts` (REST) | Salas funcionan, no hay que tocar |
| `routes/auth.ts`, `wallet.ts` | Idem |
| `tiles PNG` que ya tenés (`tile_00_0-0.png` …) | Sprites listos, los reutilizamos |
| `theme/color variables` de `index.css` | paleta coral/chocolate ya está |

### 🔄 ADAPTAR (tomar y convertir)

| Devil33 JS | → Migrar a TS |
|------------|---------------|
| `Domino_Ficha.Colocar(otraFicha)` 3D | → `dominoChain.placeTile(tile, side)` puro |
| `Domino_Partida.posicionarCadena()` | → `chainLayout.ts` con reglas 2D |
| `Domino_Ficha.AniColocar` (anim Three.js) | → CSS `transition` + `@keyframes` |
| `Domino_UI.js` (HTML overlay) | → `GameHUD.tsx` React |
| `SVG/Domino.svg` (atlas 28 fichas) | → tus PNG `tile_XX_X-X.png` |
| `localStorage` prefs | → preferences del usuario en DB |

### ❌ REESCRIBIR desde cero

| Pieza | Razón |
|-------|-------|
| **Render del tablero** | No existe en tu proyecto (HomePage es landing, no mesa). Se construye desde 0 con la mecánica de Devil33. |
| **Componente `Mesa`/`Cadena`** | Nuevo. Renderiza las fichas jugadas con algoritmo de layout. |
| **Mano del jugador** (`PlayerHand.tsx`) | Nuevo. Visualmente la "mano de cartas" estilo Devil33. |
| **Avatares N/S/E/O** | Nuevo. Posicionar los 4 jugadores alrededor de la mesa. |
| **Socket client para dominó** (`useDominoSocket.ts`) | Existe `api/client.ts` pero solo hace fetch REST, no Socket.IO. Hook nuevo. |
| **Lobby / createRoom UI** | Nuevo (o se saca de lo que hay). |
| **Game over screen** | Nuevo (animación Vzla: doble cierre con monedas, etc.). |
| **Página de partida** (`GamePage.tsx`) | Nuevo. Es la página host del render. |

---

## 3. Diffs Dominó venezolano vs Devil33 (clásico español)

Auditado de `engine/domino-classic.ts` vs `Domino_Partida.js`:

| Regla | Devil33 (español) | Dominosito (Vzla) | Impacto visual |
|-------|-------------------|-------------------|----------------|
| **Equipos** | 2v2 (4 jugadores en equipos) | Individual, 4 jugadores, ranking por puntos | Cambia el HUD: muestra puntos por jugador, no por equipo |
| **Quién sale** | Doble más alto (6|6, 5|5, etc.) | Igual: doble más alto, si no, ficha más alta | Ninguno en render |
| **# fichas por mano** | 7 | 7 | Ninguno |
| **Direccionalidad del turno** | A la izquierda | A la izquierda | Ninguno |
| **Dobles** | Se cuentan como 2 fichas en puntaje, **se juegan horizontal** (cadena en línea recta, dobles en vertical son estética) | Doble más alto inicia. Después se juega como cualquier ficha pero **doble puede colocarse perpendicular** (estética) | Ninguno funcional, igual que Devil33 |
| **Tranca** | "Cerrado" → gana menos puntos en mano | Igual: 4 pases consecutivos → cerrado → gana el de menos puntos | Nuevo: pantalla "Tranca!" con animación |
| **Partida a...** | 100/200/300/400/500/600 pts | 100 pts | HUD muestra puntos acumulados |
| **Robar del "pozo"** | NO hay pozo en Devil33 | NO hay pozo | Coincide |
| **Victoria** | Sale y gana | Sale y gana (DOMINO) o menos pts en tranca (CERRADO) | Animación diferente: DOMINO es flash dorado, CERRADO es fade con score |

**Conclusión:** las reglas Vzla **ya están en el backend**. En el frontend solo necesitamos **renderizar** las dos formas de victoria con animaciones distintas. NO hay que adaptar reglas — solo adaptar la UI al contexto Vzla (idioma, marcadores individuales en vez de "Equipo 1/2").

**Idiomas actuales del front:** El proyecto usa español ("Elige tu piedra", "Sorteos en vivo"). Mantener español neutro, agregar **es-VE** si querés términos locales ("Polla" para la partida cerrada, "Muerte" para el doble que cierra, etc.). Preguntarte después si querés terminología local.

---

## 4. Protocolo de eventos del backend (contrato del front)

Del `domino-socket.ts`, esto es lo que el front debe consumir tal cual (NO HAY QUE CAMBIAR NADA):

| Evento (servidor → cliente) | Payload | Cuándo se dispara |
|----------------------------|---------|-------------------|
| `auth:ok` | `{ userId, username }` | Después de mandar `auth` con JWT válido |
| `auth:error` | `{ error }` | Token inválido |
| `domino:state` | `GameState` (mano ya filtrada por usuario) | Cada cambio de turno / ficha jugada / reconnect |
| `domino:started` | `{ state }` | Host ejecutó `domino:start` |
| `domino:finished` | `{ winnerPosition, winType, scores }` | Alguien ganó (DOMINO o CERRADO) |
| `domino:player_joined` | `{ userId }` | Otro jugador entró a la sala |
| `domino:player_left` | `{ userId }` | Otro jugador se fue |
| `domino:turn_timeout` | `{ userId, position }` | Auto-pass por timeout (60s) |
| `error` | `{ event, error }` | Cualquier error |

| Evento (cliente → servidor) | Payload | Cuándo |
|----------------------------|---------|--------|
| `auth` | `{ token }` | Al conectar socket |
| `domino:join` | `{ roomId }` | Al entrar a la sala |
| `domino:start` | (sin payload) | Host, cuando mesa llena |
| `domino:play` | `{ tile: [a, b], side: 'left' \| 'right' }` | Click en ficha jugable |
| `domino:pass` | (sin payload) | Click "Pasar" si no tiene ficha |

**El `GameState` filtrado que llega al front ya tiene:**
- `players[].hand` → solo del viewer, otros jugadores tienen `[[0,0], [0,0], ...]`
- `board[]` → todas las fichas jugadas, orden, lado
- `leftEnd`, `rightEnd` → números libres
- `currentTurn` → posición (0-3)
- `passesInRow` → para mostrar "X pasa"
- `winType`, `winnerPosition`, `scores`

**Eso es TODO lo que el render necesita.** No hay que inventar nada.

---

## 5. Arquitectura frontend propuesta

```
pinta-y-gana/src/
├── domino/                          ← NUEVO namespace, separado de Pinta-y-Gana
│   ├── pages/
│   │   ├── GamePage.tsx             ← Mesa: contiene Mesa + 4 Players + HUD
│   │   └── LobbyPage.tsx            ← Crear sala / listar / join
│   ├── components/
│   │   ├── DominoTable.tsx          ← Render de la cadena de fichas (mesa)
│   │   ├── DominoTile2D.tsx         ← Ficha individual con orientación
│   │   ├── PlayerHand.tsx           ← Las 7 fichas del jugador (abanico)
│   │   ├── PlayerSeat.tsx           ← Avatar N/S/E/O + nombre + contadores
│   │   ├── TurnIndicator.tsx        ← "Es tu turno" / "Esperando..."
│   │   ├── ScoreBoard.tsx           ← Puntos por jugador
│   │   ├── GameHUD.tsx              ← Score + turno + pasa counter
│   │   └── ChainLayout/
│   │       ├── layout.ts            ← Algoritmo 2D (cadena, doubles perpendicular, branch)
│   │       └── coords.ts            ← Conversión (idx, side) → (x, y, rotation)
│   ├── hooks/
│   │   ├── useDominoSocket.ts       ← Conecta socket, maneja reconnect, estado
│   │   └── useGameState.ts          ← Estado React derivado del socket
│   ├── engine/
│   │   └── tiles.ts                 ← Helpers (canPlayTile en cliente — espejo de back)
│   └── styles/
│       └── domino.css               ← Animaciones, mesa verde, fichas
```

### Stack técnico

| Capa | Tech | Por qué |
|------|------|---------|
| React | 18+ (ya tenés) | Mantenemos |
| Vite | ya tenés | OK |
| Estado | **`useState` + `useReducer` por socket** | No hace falta Redux/Zustand para una mesa. Socket es la fuente de verdad. |
| Socket.IO client | `socket.io-client` (~20KB) | Protocolo estándar, reconnect automático |
| Estilos | CSS modules o Tailwind (ya usás Tailwind) | Mantenemos consistencia |
| Animaciones | CSS transitions + `@keyframes` | Suficiente para lo que necesitamos |
| Assets | tus PNG tiles existentes | Sin renders nuevos |

### Modelo React

```typescript
// useDominoSocket.ts (simplificado)
function useDominoSocket(roomId: number) {
  const [state, setState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<DominoEvent[]>([]);

  useEffect(() => {
    const sock = io('http://localhost:3200', { path: '/socket.io' });
    
    sock.on('connect', () => {
      sock.emit('auth', { token: getToken() });
    });
    sock.on('auth:ok', () => {
      sock.emit('domino:join', { roomId });
    });
    sock.on('domino:state', (s: GameState) => setState(s));
    sock.on('domino:started', ({ state }) => setState(state));
    sock.on('domino:finished', (data) => setEvents(e => [...e, {type:'finished', data}]));
    sock.on('domino:turn_timeout', ({ userId, position }) => 
      setEvents(e => [...e, {type:'timeout', userId, position}])
    );
    
    return () => sock.disconnect();
  }, [roomId]);

  return { state, events, play: (tile, side) => sock.emit('domino:play', {tile, side}), pass: () => sock.emit('domino:pass') };
}
```

---

## 6. Algoritmo de layout 2D (la pieza central)

El corazón de la migración visual. Convierte el `board[]` lineal del backend en coordenadas (x, y, rotation) en píxeles.

### Pseudocódigo

```typescript
// chainLayout.ts
interface PositionedTile {
  index: number;          // posición en board[]
  x: number; y: number;
  rotation: 0 | 90 | 180 | 270;
  side: 'left' | 'right' | 'center';
  isDouble: boolean;
}

// Reglas:
// 1. La cadena central arranca en el centro de la mesa
// 2. Se extiende hacia izquierda Y derecha simultáneamente
// 3. Si el ancho excede mesaW, dobla vertical (cambio de fila, offset Y)
// 4. Cada ficha es 60×36px (relación 2:1, como Devil33)
// 5. Dobles se rotan 90° automáticamente
// 6. La primera ficha (orden 0) es special: se renderiza "vertical" como pivote central
function layoutChain(board: PlayedTile[], mesaW: number): PositionedTile[] {
  const TILE_W = 60, TILE_H = 36;
  const result: PositionedTile[] = [];
  
  let leftX = mesaW / 2;
  let rightX = mesaW / 2;
  let row = 0;  // fila vertical cuando se dobla
  let y = 0;
  
  // Reverse left chain (board tiene las más recientes a la derecha)
  // Ordenar: orden 0 (primera) es centro; las siguientes alternan L/R según side
  
  // ... (algoritmo iterativo con stack de filas)
}
```

**Complejidad:** O(n) en fichas, O(filas) en espacio. Para una partida normal (30-50 fichas), trivial.

**Cuando dobla la cadena:** exactamente igual que Devil33 — cuando `x + TILE_W > mesaW`, la siguiente ficha arranca en una fila nueva, mitad de columna vertical.

---

## 7. Roadmap por fases (con entregables verificables)

| Fase | Título | Lo que ves funcionando | Tiempo estimado | Archivos nuevos |
|------|--------|------------------------|-----------------|-----------------|
| **1** | **GamePage + render estático** | Una página nueva `/domino/:roomCode` que muestra 4 jugadores mock + mesa vacía con fondo verde. | 2-3h | `pages/GamePage.tsx`, `components/PlayerSeat.tsx` |
| **2** | **Cadena 2D con datos mock** | Un array de 8-10 fichas hardcodeadas se renderiza en la mesa con la mecánica de Devil33 (doble perpendicular, dobla al borde). | 4-6h | `components/DominoTable.tsx`, `chainLayout/layout.ts` |
| **3** | **Ficha con orientación + hover** | Click en una ficha jugable muestra highlight. Animación de "snap" cuando se coloca. | 3-4h | `components/DominoTile2D.tsx`, animaciones CSS |
| **4** | **Mano del jugador (abanico)** | Las 7 fichas abajo, en arco estilo Devil33. Click selecciona. | 2-3h | `components/PlayerHand.tsx` |
| **5** | **Socket client + estado en vivo** | Conecto socket, hace `domino:start` con 2 mocks, el estado llega y se renderiza. | 4-5h | `hooks/useDominoSocket.ts`, `hooks/useGameState.ts` |
| **6** | **Lobby: crear/unirse a sala** | Página nueva `/domino` con botón "Crear sala" → genera código → redirige a mesa. | 3-4h | `pages/LobbyPage.tsx` |
| **7** | **Partida real end-to-end** | Vos + 1 mock juegan una partida completa desde crear sala → fichas repartidas → jugar → victoria. | 3-4h | integración |
| **8** | **Animaciones Vzla** | DOMINO (winner flash) vs CERRADO (tranca fade con score). Pasa counter. | 2-3h | `components/GameOverScreen.tsx` |
| **9** | **Mobile / responsive** | Mesa escala a mobile, mano se apila vertical. | 3-4h | CSS media queries |
| **10** | **Polish + sonidos** | Sonido al colocar ficha, sonido al pasar, mensaje "..." mientras espera. | 2-3h | `sounds/` |

**Total:** ~30-40 horas de trabajo. **Pero cada fase es testeable de forma independiente**. La fase 1 + 2 ya se ven lindas (mesa con cadena mock). Vos vas probando después de cada fase.

---

## 8. Riesgos técnicos

| # | Riesgo | Mitigación |
|---|--------|-----------|
| 1 | **Layout de cadena se "tropieza"** (fichas montadas) | Testear con secuencias reales: L 6-5 L 5-3 L 3-2 R 2-2 (doble perpendicular). Algoritmo con casos edge. |
| 2 | **Sync entre sockets y UI** | Socket es única fuente de verdad. NO usar estado optimista — esperar ack. |
| 3 | **Reconexión mid-game** | Backend ya tiene `domino:state` que re-manda estado en reconnect. Solo verificar que el front lo cachea. |
| 4 | **4 jugadores avatares muy juntos en mobile** | Diseño mobile-first con avatares compactos (solo nombre + emoji opcional). |
| 5 | **CSS animations en Safari mobile** | `transform: translate3d()` en lugar de `top/left` para forzar GPU. |
| 6 | **Mano del jugador muy ancha en desktop** | Wrap a 2 filas si hay > 5 fichas, scale down automático. |
| 7 | **Conflicto entre DEV local (5173) y PROD (puerto 3200)** | Config CORS ya está (`5173`). Mantener. |
| 8 | **Pinta-y-Gana y Dominó en la misma app** | Mantener `pages/` separados, rutas separadas (`/pinta` y `/domino`). |
| 9 | **Sin tests del back que cambien** | No tocar el back. Cero riesgo de regresión. |

**Riesgo mayor:** #1 (layout). Es lo único que requiere iteración. **Cada PR tiene demo visual**, vos probás y dices "esta ficha se monta" → ajustamos. Si en 2-3 intentos no queda bien, replanteamos el algoritmo con un árbol distinto (no cadena lineal).

---

## 9. Estimación de complejidad por fase (rough)

| Fase | Complejidad | Razón |
|------|-------------|-------|
| 1 (GamePage shell) | 🟢 Baja | HTML estático + flexbox |
| 2 (cadena 2D) | 🟡 Media | Algoritmo nuevo, hay que iterar |
| 3 (ficha interactiva) | 🟢 Baja | Props + CSS hover |
| 4 (mano abanico) | 🟢 Baja | CSS transform |
| 5 (socket client) | 🟡 Media | Hook nuevo, manejo de reconnect |
| 6 (lobby) | 🟢 Baja | CRUD básico ya está en el back |
| 7 (E2E real) | 🟠 Media-Alta | Integración de todo, bugs típicos |
| 8 (animaciones Vzla) | 🟢 Baja | CSS keyframes |
| 9 (mobile) | 🟡 Media | Muchos breakpoints |
| 10 (polish/sonido) | 🟢 Baja | Assets + eventos |

**Si tuviera que poner un número:** sprint 1 (fases 1-4) = 1 sesión larga. Sprint 2 (5-7) = 1 sesión larga. Sprint 3 (8-10) = 1 sesión corta. **3 sesiones para terminarlas todas** si voy solo, **2 si usamos 2 subagentes en paralelo** (uno en render, otro en socket client).

---

## 10. Pregunta abierta para vos

Antes de arrancar la Fase 1, una decisión de producto:

**¿Idioma del juego?** El proyecto está en español neutro. Devil33 soporta 3 idiomas (catalán, castellano, inglés).

**Opciones:**
- **A)** Mantener español neutro ("Tu turno", "Pasar", "Ganador"). Simple.
- **B)** Español venezolano con jerga ("Polla" para partida cerrada, "Muerte" cuando cierra con doble, "¡Se trancó!"). Más auténtico, pero requiere jerga local validada.
- **C)** Ambos, con toggle en el HUD. Más trabajo, mejor UX.

**Mi recomendación: B (Vzla con jerga)** porque toda la app es Vzla. ¿Te parece?

---

## 11. Resumen ejecutivo

✅ **El backend está 100% listo.** No hay que tocar nada.
❌ **El frontend actual NO tiene mesa de dominó renderizada** — solo landing de Pinta-y-Gana. Hay que construir todo el render desde cero.
🎯 **Devil33 se traduce bien a 2D** — la mecánica de cadena que te gustó es replicable con CSS + algoritmo de layout.
📦 **8 archivos nuevos + 1 file CSS nuevo.** Cero cambios en backend.
⏱️ **3 sprints de trabajo** (~10 fases). Demo verificable después de CADA fase.
🎮 **Puedes probar después de Fase 2** (cadena mock renderizada). Después de Fase 7 tenés end-to-end funcional.

---

*Próximo paso:* tu OK para arrancar **Fase 1** (GamePage shell) en este mismo turno. Después de Fase 2 te paso demo y vos decidís si seguimos o ajustamos.
