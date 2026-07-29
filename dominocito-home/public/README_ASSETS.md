# Dominócito — Paquete de assets (integrar en dominocito-home/)

## Estructura (descomprimir en la raíz de dominocito-home)
public/fichas/
  dibujito/      28 fichas (0-0.webp … 6-6.webp)
  madera/        28
  marfil/        28
  marmol-negro/  28
  piedra/        28
public/mesas/
  mesa-abuela.jpg, mesa-clasica.jpg, mesa-club.jpg, mesa-oficina.jpg, mesa-playa.jpg
  (versiones nuevas de ALTA calidad — reemplazan las viejas)
public/assets/hero/
  domino-pattern.webp   (patrón de fondo tileable, 3KB, sin costura)
public/assets/avatares/
  avatar-01.png … avatar-12.png   (set fijo, el usuario elige)
public/assets/sala/
  icon-03.png … icon-29.png   (iconos de sala: rondas, editar, equipos, parejas, etc.)
  ⚠ Falta etiquetar cuál número = cuál función (Waldo confirma).

## Notas
- Fichas verificadas: mapeo 01→28 = doble-seis, orientación lo-hi (menor arriba).
- Domino2D usa el prop setFichas para elegir set: /fichas/<set>/<lo>-<hi>.webp
- Las mesas nuevas son PNG->JPG alta calidad; al ser más nítidas, puede que el
  rect FIELTRO del fieltro necesite recalibrarse por mesa (rápido).
- dorso.webp AÚN no existe en ningún set (los rivales usan placeholder). Pendiente generar.
