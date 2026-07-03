import { test, expect } from '@playwright/test';

/**
 * Smoke test E2E — Dominócito
 *
 * Verifica el flujo crítico más básico:
 * 1. Home carga y muestra cards
 * 2. Barra de logos está presente y navega a /pinta-y-gana
 * 3. /pinta-y-gana renderiza sin crashear
 * 4. /login renderiza
 *
 * NO asume login — los flujos que requieren auth se prueban en archivos
 * separados (auth.spec.ts) para mantener este test rápido y estable.
 */

// Cards del home tienen heading + descripción. Los links del header
// solo tienen el logo + título de la app. Usamos heading para
// desambiguar y evitar strict-mode violations.
test('home muestra las cards de los 3 juegos', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dominó Clásico' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pinta y Gana' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lotería' })).toBeVisible();
});

test('barra de logos: home no muestra barra, /pinta-y-gana sí', async ({ page }) => {
  // Home: NO debe haber barra fixed top
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Juegos' })).toHaveCount(0);

  // Click en la card de Pinta y Gana (heading) para navegar
  await page.getByRole('link', { name: /Pinta y Gana Sorteo/i }).click();
  await expect(page).toHaveURL(/\/pinta-y-gana$/);

  // Ahora SÍ debe haber barra de logos
  await expect(page.getByRole('navigation', { name: 'Juegos' })).toBeVisible();
  // Los links de la barra solo tienen aria-label (sin texto visible siempre)
  await expect(page.getByRole('link', { name: 'Lotería' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dominó' })).toBeVisible();
});

test('/login renderiza el formulario', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /Iniciar sesión/i })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('navegación entre juegos desde barra de logos', async ({ page }) => {
  await page.goto('/pinta-y-gana');
  const nav = page.getByRole('navigation', { name: 'Juegos' });
  await expect(nav).toBeVisible();

  // Verificar que los links de la barra apuntan a las rutas correctas
  const loteriaHref = await nav.getByRole('link', { name: 'Lotería' }).getAttribute('href');
  const dominoHref = await nav.getByRole('link', { name: 'Dominó' }).getAttribute('href');
  expect(loteriaHref).toBe('/loteria');
  expect(dominoHref).toBe('/domino');

  // Navegar a loteria (PintaYGana tiene motion/overlays que pueden
  // interceptar el click real; verificamos la ruta del link, no el click)
  await page.goto(loteriaHref!);
  await expect(page).toHaveURL(/\/loteria$/);
  await expect(page.getByRole('heading', { name: 'Lotería' })).toBeVisible();

  // La barra debe seguir presente
  await expect(page.getByRole('navigation', { name: 'Juegos' })).toBeVisible();
});
