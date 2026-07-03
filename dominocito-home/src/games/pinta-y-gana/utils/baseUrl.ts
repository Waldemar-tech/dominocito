/**
 * Utilidad para construir rutas a assets respetando el `base` de Vite.
 *
 * El sub-app se monta en `/pinta-y-gana/` en producción, pero durante dev
 * (vite serve) corre en `/`. Si hardcodeamos `/assets/...` los requests se
 * rompen porque nginx busca en el SPA equivocado.
 *
 * Solución: usar `import.meta.env.BASE_URL` que Vite rellena con el `base`
 * del config (`/pinta-y-gana/` en build, `/` en dev).
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