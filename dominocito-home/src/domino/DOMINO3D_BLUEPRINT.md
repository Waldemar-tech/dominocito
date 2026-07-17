# Plan de Migración — Dominó 3D estilo Devil33

**Proyecto:** Dominosito (LotoPro) — Dominó normal
**Estrategia:** Opción B — Portar el motor visual 3D de Devil33 al stack React/Three.js, manteniendo backend intacto

---

## Estado

- ✅ Decisión confirmada (Opción B, 2026-07-05)
- ✅ Limpieza del intento 2D anterior (migracion_2d/ eliminado, ruta /domino-demo removida)
- ⏳ Pendiente: instalación de Three.js + R3F, portar motor, integrar sockets

---

## Stack nuevo a agregar

```
three                @latest   Motor 3D
@react-three/fiber   @latest   Bindings React para Three.js
@react-three/drei    @latest   Helpers (Text, OrbitControls, useTexture)
```

**Por qué R3F en lugar de Three.js puro:**
- React 19 ya está en stack
- Componentes reutilizables (cada ficha = componente)
- Lifecycle hooks se conectan al ciclo React
- No contaminamos el DOM con canvas manual

---

## Arquitectura nueva

```
dominocito-home/src/domino/
├── AuthScreen.tsx              ✅ NO TOCAR
├── DominoLobby.tsx             ✅ NO TOCAR
├── DominoRoom.tsx              🔧 Modificado: usa <Domino3DTable /> en vez de <GameBoard />
├── WaitingRoom.tsx             ✅ NO TOCAR
├── GameBoard.tsx               (deprecado, queda como fallback por si algo rompe)
├── engine/                              ← NUEVO namespace
│   ├── tiles.ts                          ← Helpers fichas (del back)
│   └── socketBridge.ts                   ← Adapter: socket.IO → GameState → props Three
├── three/                               ← NUEVO namespace
│   ├── Domino3DTable.tsx                 ← Componente raíz mesa 3D
│   ├── Domino3DTile.tsx                  ← Ficha 3D individual
│   ├── Domino3DHand.tsx                  ← Mano del jugador (3D o HUD)
│   ├── Domino3DHUD.tsx                   ← Marcador, turno, timer (HTML overlay)
│   ├── Camera.tsx                        ← Cámara perspectiva controlada
│   ├── Lighting.tsx                      ← Luces (point + ambient + spot por turno)
│   ├── Mesa.tsx                          ← Plano verde de la mesa
│   ├── layout3D.ts                       ← Lógica de positioning (port de Devil33)
│   └── animations.ts                     ← Spring/fly-in para colocar ficha
└── store/
    └── domino3DStore.ts                  ← Zustand: estado visual (vs el socket state del back)
```

---

## Fases (cada una testeable)

### **Fase 0 — Setup** (lo que estoy haciendo ahora)

- ✅ Documento de plan (este)
- ✅ Limpieza intento 2D
- ⏳ Instalar three + R3F + drei
- ⏳ Crear estructura de carpetas
- ⏳ Verificar que la app sigue compilando

**Entregable:** App sigue corriendo, ves que npm tiene las deps.

### **Fase 1 — Mesa vacía + ficha estática**

- Componente `<Mesa />` con plano verde + textura
- 1 ficha de prueba colocada en el centro (no interactiva)
- Cámara fija perspectiva (45°)
- Lighting básico

**Demo:** Abrís página y ves la mesa con UNA ficha dummy. 30 min - 1 h.

### **Fase 2 — 28 fichas estáticas en grilla**

- Renderizar las 28 fichas del dominó en una grilla 7×4 (sin animación, sin cadena)
- Texturas: usar las PNG que ya tenés (`public/assets/casino/tiles/domino_X-Y.png`)
- O mejor: renderizar las pipas con planos+texturas procedurales

**Demo:** Abrís y ves 28 fichas en grilla bonita. 1-2 h.

### **Fase 3 — Cadena con la lógica de Devil33 ported**

- Portar `computeChainLayout` de Devil33 a TypeScript/R3F
- Cada ficha en su posición correcta (rama izq/der, doble perpendicular)
- Animación spring al colocar ficha nueva
- Highlight de extremos cuando es tu turno

**Demo:** Mocks: secuencia de 5-10 fichas → ves cómo la cadena va "creciendo" como Devil33. 3-4 h.

### **Fase 4 — Conexión con tu backend**

- Adaptar `domino-socket.ts` events al componente 3D
- Tu `domino:state` → props de fichas
- Click en ficha jugable → emite `domino:play`
- Animación al colocar ficha sincronizada con el state que viene del back

**Demo:** Vos + 1 mock juegan. Vos ves la ficha aparecer en 3D cuando el server la valida. 3-4 h.

### **Fase 5 — Mano del jugador (3D + HUD)**

- Las 7 fichas del jugador abajo de la mesa, en 3D ordenadas
- Click → highlight amarillo + botones "Izq / Der"
- Avatar N/S/E/O con su mazo de fichas boca abajo

**Demo:** Jugás tus fichas en una partida real con bots mock. 3-4 h.

### **Fase 6 — Animaciones Devil33-style**

- Cámara con tween al cambiar turno (zoom al jugador activo, estilo Devil33)
- Hover: ficha se levanta / gira
- Doble perpendicular con glow dorado al colocarse
- Sonidos opcionales (place/pass/winner)

**Demo:** Sensación completa de Devil33 con multiplayer real. 4-5 h.

### **Fase 7 — Polishing + mobile**

- Responsive: scale de la mesa según viewport
- Carga inicial rápida (lazy-load Three.js si es posible)
- Fallback a `GameBoard.tsx` 2D si el dispositivo no soporta WebGL
- Errores visualizados correctamente

**Demo:** Abrís en mobile y se ve bien, en desktop se ve completo. 4-5 h.

### **Fase 8 — Adaptación Vzla**

- Idioma español Vzla (HUD, mensajes)
- Animación distinta para "tranca" vs "domino" (ganador)
- Animación de cierre con doble que gana (estilo casino Vzla: "polla!")

**Demo:** Ganás una partida cerrada con doble, ves la animación Vzla. 2-3 h.

---

## Total estimado

| Fase | Lo que ves | Horas |
|------|-----------|-------|
| 0 | Setup | 0.5 |
| 1 | Mesa vacía + 1 ficha | 1 |
| 2 | 28 fichas en grilla | 1.5 |
| 3 | Cadena con mecánica Devil33 | 3.5 |
| 4 | Con backend (1v1 mock) | 3.5 |
| 5 | Mano del jugador | 3.5 |
| 6 | Animaciones Devil33-style | 4.5 |
| 7 | Mobile + polish | 4.5 |
| 8 | Adaptación Vzla | 2.5 |
| **Total** | | **~25 horas** |

**Equivale a ~2-3 semanas en sesiones largas.** Cada fase la probás vos.

---

## Riesgos

| # | Riesgo | Mitigación |
|---|--------|-----------|
| 1 | Three.js bundle size (+400KB) | Lazy load con `React.lazy`, no en home |
| 2 | Mobile GPU no aguanta | Fallback automático a `GameBoard.tsx` 2D viejo |
| 3 | Performance con muchas fichas | InstancedMesh si >50 fichas, batching |
| 4 | R3F + React 19 compatibility | Verificar versiones al instalar |
| 5 | WebGL no disponible (Safari ITP) | Detectar y fallback |
| 6 | Setup Three.js rompe el bundle actual | Rama `feat-domino-3d` aparte, integrar solo cuando esté estable |

---

## Decisiones pendientes

1. **¿Texturas de fichas procedurales (pipas en 3D) o PNGs?** Devil33 usa texturas procedurales. Más bonito pero más trabajo vs usar las PNGs que ya tenés.

2. **¿Iluminación tipo Devil33 (luz por turno) o fija?** Devil33 cambia la luz cuando le toca a alguien — efecto muy bonito, pero más código.

3. **¿Sonidos?** Devil33 no tiene. Podemos agregarlos opcionales (toggle en HUD).

Voy a empezar con la versión simple de cada decisión y mejorar si tenés tiempo.

---

## Próximo paso inmediato

**Fase 0**: instalar Three.js + R3F y verificar que la app compila. Eso es manipulación de `package.json` y un re-run del dev server.

¿Me das OK para arrancar Fase 0 ahora?
