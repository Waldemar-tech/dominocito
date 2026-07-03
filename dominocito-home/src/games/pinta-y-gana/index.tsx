/**
 * Punto de entrada para Pinta y Gana dentro del home SPA.
 *
 * Importa los CSS propios del juego (variables, keyframes, estilos
 * de tiles/particles) y monta el componente principal.
 *
 * Como este módulo se carga vía `React.lazy()` desde el home, el CSS
 * también llega lazy: el bundle home inicial NO incluye los estilos
 * de Pinta y Gana. Solo se descargan cuando el usuario entra al juego.
 */
import './index.css'
import './App.css'
import PintaYGanaApp from './App'

export default function PintaYGanaRoute() {
  return <PintaYGanaApp />
}
