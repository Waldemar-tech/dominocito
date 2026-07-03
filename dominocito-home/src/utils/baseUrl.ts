/**
 * Utilidad para construir rutas a assets respetando el `base` de Vite.
 *
 * El home SPA se monta en `/` en producción y dev, pero otros sub-apps
 * (como pinta-y-gana) usan `/pinta-y-gana/`. Usar rutas absolutas hardcodeadas
 * (`/assets/...`) rompe el deploy porque nginx busca en otro lugar.
 *
 * Solución: usar `import.meta.env.BASE_URL` que Vite rellena con el `base`
 * del config (`/` en este proyecto, `/pinta-y-gana/` en el sub-app).
 */

/** Devuelve el base path con trailing slash. */
export const baseUrl = (): string => {
  const raw = import.meta.env.BASE_URL || '/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

/** Construye la URL absoluta a un asset, respetando el base de Vite. */
export const assetUrl = (path: string): string => {
  const base = baseUrl()
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${base}${clean}`
}