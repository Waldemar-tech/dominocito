/**
 * Punto de entrada para Pinta y Gana dentro del home SPA.
 *
 * Wrapper que monta el componente principal del juego dentro de un
 * LayoutRoute del home, manejando routing interno (auth/public).
 */
import PintaYGanaApp from './App'

export default function PintaYGanaRoute() {
  return <PintaYGanaApp />
}