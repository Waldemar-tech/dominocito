# Pinta y Gana — Dominócito

Juego de dominó doble-seis con sorteos cada 30 minutos. Stack: **React 19 + TypeScript + Vite 8 + Tailwind v4**.

## Rediseño Frontend — Fase 1 (2026-06-30)

Pixel-perfect al moodboard entregado por la diseñadora de Waldemar.

### Cambios visuales principales

- **Paleta warm/coral** reemplazando el esquema emerald/dark anterior
  - Coral CTA `#FF6B4A` · Cream `#F5E6D3` · Chocolate `#3D1F0F` · Walnut `#3A2418` · Gold `#D4A24A / #F4C76B`
- **Tipografías nuevas** vía Google Fonts
  - **Bungee Shade** → display hero "PINTA Y GANA" (con sombra dura negra + rotación −3°)
  - **Rye** → logo wordmark DOMINÓCITO
  - **Inter** → nav, body, botones
- **Nav flotante píldora** (center-top, no edge-to-edge) con `backdrop-blur(20px)` + borde 1px rgba(255,255,255,0.1)
- **Hero full-bleed** con la imagen `ChatGPT Image Jun 29...png` del diseñador como background + viñeta cálida
- **Sparkles SVG dorados** decorativos + aura coral pulsante detrás del título
- **3 dots indicator** carousel con animación
- **CTA "Jugar Ahora"** coral pill con glow
- **Píldoras de cristal** (backdrop-blur) en lugar de cards planas
- **Display "HASTA ×100"** en la sección de multiplicadores con sombra dura estilo sticker

### Assets del diseñador integrados en `public/assets/`

| Archivo | Uso |
|---|---|
| `ChatGPT Image Jun 29, 2026, 10_59_00 PM.png` | Background hero (render 3D mesa) |
| `Home - Dominócito-03.svg` | Logo DOMINÓCITO wordmark (crema) |
| `Pinta_&_Gana - Dominócito copy-02.svg` | Icono casa/cap (coral) |
| `Pinta_&_Gana - Dominócito copy-03.svg` | Icono fichas cuadradas (crema) |
| `Pinta_&_Gana - Dominócito copy-04.svg` | Tachuela/sticker estrella (crema) |
| `Pinta_&_Gana - Dominócito copy-05.svg` | Barras chart (marrón) |
| `Pinta_&_Gana - Dominócito copy-06.svg` | Flecha circular (marrón) |
| `Pinta_&_Gana - Dominócito copy-07.svg` | Flechas dobles swap (marrón) |
| `Fichas_Mesa - Dominócito-01..04.png` | Sets de 28 piedras (cream/wood/marble/marble-dark) — disponibles para fases siguientes |

### Archivos modificados

- `src/index.css` → paleta completa + keyframes (sparkle, aura-pulse)
- `src/App.tsx` → reestructurado con `FloatingNav` píldora + header de juego warm
- `src/pages/HomePage.tsx` → hero pixel-perfect + 5 secciones nuevas
- `src/auth/AuthScreen.tsx` → adaptado a warm + pill inputs + coral CTA
- `src/components/Countdown.tsx` → paleta coral/warm
- `src/components/DominoTile.tsx` → paleta warm (cream/walnut), borde coral en selección
- `index.html` → fuentes Bungee Shade + Rye + Inter, lang="es", theme-color chocolate

### Archivos NO modificados (lógica crítica intacta)

- `src/engine/wallet.ts`, `src/engine/sorteo.ts`, `src/engine/dominoes.ts`
- `src/api/client.ts`, `src/auth/authStore.ts`
- `backend/*`

### Comandos

```bash
npm run dev      # dev server
npm run build    # tsc -b && vite build
npm run preview  # preview build
```

### Pendiente / siguiente fase

- Las piedras de los sets `Fichas_Mesa - Dominócito-0[1-4].png` están disponibles en `public/assets/` pero NO se usan todavía en `DominoTile.tsx`. Integración en Fase 2 (reemplazar el SVG inline por el set de mesa del diseñador).
- `Pinta_&_Gana - Dominócito copy-04.svg` (sticker estrella) aún no integrado — candidato para badge "GANASTE" o sello decorativo.

---

# React + TypeScript + Vite (template original)

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
