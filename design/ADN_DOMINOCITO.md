# Dominócito — ADN / Brand Guidelines

> Documento de marca. Fuente única de verdad para colors, typography, logo, voice.
> Versión 2 (2026-07-17 13:31 EDT) — actualizada con hex exactos del mockup final del home.

## 1. Paleta de colores

### Base
| Token | Hex | RGB | Uso |
|---|---|---|---|
| `guayacan-nocturno` | `#1B120D` | 27, 18, 13 | Fondo más oscuro, navbar píldora |
| `guayoyyo-tostado` | `#3A2418` | 58, 36, 24 | Superficie media |
| `cafe-fondo` | `#2B1E17` | 43, 30, 23 | Fondo de página principal |
| `cafe-gradiente-claro` | `#3D2A1E` | 61, 42, 30 | Gradiente hero (parte superior) |
| `cafe-gradiente-oscuro` | `#1E1410` | 30, 20, 16 | Gradiente hero (parte inferior) |
| `divisor-calido` | `#5A4A40` | 90, 74, 64 | Líneas divisorias stats |

### Texto
| Token | Hex | Uso |
|---|---|---|
| `marfil-ficha` | `#FAE6C8` | Texto blanco sobre fondos oscuros (headings) |
| `blanco-crema` | `#FBF6F0` | Títulos principales hero (blanco con tinte cálido) |
| `blanco-calido` | `#E5DDD5` | Subtítulos, body (off-white cálido) |
| `gris-calido` | `#C9BFB8` | Labels stats, captions |

### Acentos
| Token | Hex | RGB | Uso |
|---|---|---|---|
| `cayena-revancha` | `#FF684A` | 255, 104, 74 | Acento primario coral (CTAs) |
| `cayena-gradiente-1` | `#FF7B54` | 255, 123, 84 | Inicio gradiente CTA coral |
| `cayena-gradiente-2` | `#F0623A` | 240, 98, 58 | Final gradiente CTA coral |

### Acentos por juego (cards)
| Token | Hex | Juego |
|---|---|---|
| `amarillo-pinata` | `#E8A800` / `#F5B800` | Pinta y Gana |
| `naranja-damero` | `#C97B3C` / `#B86B35` | Dominó Clásico |
| `azul-loteria` | `#0F2847` / `#132D4F` | Lotería |

## 2. Tipografía

### Familias (Google Fonts)
- **Recoleta alternative → Fraunces** — serif para hero h1, headings importantes
  - Si tenés Recoleta de pago, usalo (ligaduras italianas). Si no, Fraunces Black 900 le da look similar.
  - Bold **recTO** (NO italic) en hero. Aspecto condensado/robusto.
- **Inter** (Google Fonts, gratis) — sans para body, links navbar, botones, stats, captions.

### Pesos / tamaños

| Rol | Fuente | Peso | Tamaño desktop |
|---|---|---|---|
| Hero h1 | Fraunces | 900 | 80–88 px (`text-7xl` a `text-[5.5rem]`) |
| Card title (imagen, no CSS) | — | — | — |
| h2 | Fraunces | 700 | 36–48 px |
| Body | Inter | 400 | 16–18 px |
| Stats números | Inter | 700 | 28–36 px (`text-3xl` a `text-4xl`) |
| Stats labels | Inter | 500 | 14 px (`text-sm`) |
| Button / link | Inter | 600 | 14–16 px |

**`leading` hero h1:** `1.05` (muy compacto)
**`tracking`:** `-0.02em` (tight en h1)

## 3. Layout del home (mockup v1)

### Estructura general

```
[NAVBAR PÍLDORA — fixed top, 24px del top]
  Logo  |  Pinta y Gana · Dominó Clásico · Lotería  |  Regístrate

[HERO — full-bleed, fondo gradiente + imagen mesa]
  H1: "Tres juegos. Un Wallet. Cero Barreras."
  Subtítulo (2 líneas, 18px max-w-2xl)
  [Jugar Ahora] [Explorar juegos]
  Imagen mano+fichas (esquina sup. derecha, absoluta)

[3 CARDS — grid-cols-3]
  Pinta y Gana (amarillo) | Dominó Clásico (naranja) | Lotería (azul)

[STATS — single row con divide-x]
  Jugadores en Línea | Mesas Activas | Premios Hoy | Otra estadística
  2,545 | 325 | $4,320 | 2,545
```

### Containers
- `max-w-6xl` (~1152px) para navbar
- `max-w-5xl` (~1024px) para stats
- Cards: `aspect-[9/11]` (ligeramente más altas que anchas)
- `gap-6` entre cards

### Espaciado
- Navbar: `fixed top-6` (24px del top del viewport)
- Hero: `pt-32` o `pt-40` para no chocar con navbar
- Stats: `mt-16` o `mt-20` debajo de las cards
- Padding vertical: secciones de `py-16` a `py-24`

## 4. Logo

> **Nota**: Waldemar promete el logo oficial (SVG/PNG). Mientras tanto, se usa la versión actual de `Home - Dominócito-03.svg` que está en `/var/www/dominocito-front/assets/pinta-y-gana/`.

**Variantes a solicitar:**
- Logo horizontal blanco (`<svg>` fondo transparente, logo blanco)
- Logo horizontal crema (#FAE6C8) — para aplicar sobre coral
- Logo horizontal oscuro (#1B120D) — para aplicar sobre crema
- Ícono solo (cuadrado, sin wordmark)
- Cada variante en SVG (vector) Y PNG @2x

## 5. Botones / CTAs

### Coral gradiente
```css
background: linear-gradient(to right, #FF7B54, #F0623A);
color: white;
font-weight: 600;
padding: 0.75rem 1.5rem;
border-radius: 9999px;
box-shadow: 0 10px 15px -3px rgba(255,104,74,0.3);
```

### Borde blanco (Explorar juegos)
```css
border: 1px solid rgba(255,255,255,0.6);
background: transparent;
color: white;
padding: 0.75rem 1.5rem;
border-radius: 9999px;
```
Hover: `bg: rgba(255,255,255,0.08);`

### Píldora navbar
- `bg: rgba(26,20,16,0.95);` + `backdrop-blur-md`
- `border-radius: 9999px` (píldora completa)
- `padding: 0.5rem 1rem`
- `box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);`

## 6. Assets pendientes de recibir de Waldemar

1. Hero background / imagen mano + fichas + swooshes (PNG transparente ideal)
2. Card Pinta y Gana (JPG/WebP, 9:11)
3. Card Dominó Clásico (JPG/WebP, 9:11)
4. Card Lotería (JPG/WebP, 9:11)
5. Logo SVG/PNG oficial en todas las variantes

## 7. Implementación técnica

### Variables CSS (Tailwind v4)
```css
@theme {
  --color-guayacan: #1B120D;
  --color-guayoyyo: #3A2418;
  --color-fondo: #2B1E17;
  --color-fondo-claro: #3D2A1E;
  --color-fondo-oscuro: #1E1410;
  --color-divisor: #5A4A40;

  --color-marfil: #FAE6C8;
  --color-crema: #FBF6F0;
  --color-blanco-calido: #E5DDD5;
  --color-gris-calido: #C9BFB8;

  --color-cayena: #FF684A;
  --color-cayena-1: #FF7B54;
  --color-cayena-2: #F0623A;

  --color-pinata: #F5B800;
  --color-damero: #C97B3C;
  --color-loteria: #0F2847;

  --font-serif: 'Fraunces', 'Recoleta', serif;
  --font-sans: 'Inter', sans-serif;
}
```

### Google Fonts
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## 8. Source assets

- `design/home-mockup/HOME_MOCKUP_V1.jpg` — mockup final del home (recibido 2026-07-17 13:31)
- `design/ADN_v1.webp` — brand guidelines anterior (perro, no útil)
- `design/ADN_DOMINOCITO.md` — este doc

---
Última actualización: 2026-07-17 13:32 EDT
