import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import HomePage from './pages/HomePage'
import DominoRoom from './domino/DominoRoom'
import DominoLobby from './domino/DominoLobby'
import AuthScreen from './domino/AuthScreen'
import DominoClasicoHome from './games/domino-clasico'
import GameLogosBar from './components/GameLogosBar'

// Lazy load: cada juego se descarga solo cuando el usuario navega a él.
// Esto mantiene el bundle del home ligero (~150 KB gzip) y carga
// Pinta y Gana / Lotería bajo demanda.
const PintaYGana = lazy(() => import('./games/pinta-y-gana'))
const LoteriaPage = lazy(() => import('./games/loteria/LoteriaPage'))

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-white/60">Cargando...</div>
    </div>
  )
}

/**
 * GlobalFrame: envuelve cada ruta con la barra de logos y un padding-top
 * para que el contenido no quede tapado por el navbar flotante.
 */
function GlobalFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GameLogosBar />
      <div>{children}</div>
    </>
  )
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<AuthScreen />} />
          <Route path="/domino" element={<GlobalFrame><DominoClasicoHome /></GlobalFrame>} />
          <Route path="/domino/lobby" element={<GlobalFrame><DominoLobby /></GlobalFrame>} />
          <Route path="/domino/room/:code" element={<GlobalFrame><DominoRoom /></GlobalFrame>} />
          <Route path="/pinta-y-gana" element={<GlobalFrame><PintaYGana /></GlobalFrame>} />
          <Route path="/loteria" element={<GlobalFrame><LoteriaPage /></GlobalFrame>} />
        </Routes>
      </Suspense>
    </div>
  )
}

/**
 * HomeRedirect: si hay sesión y un room pendiente, vuelve a la mesa
 * automáticamente. Si no, muestra el home con cards de los juegos.
 */
function HomeRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    const token = localStorage.getItem('dc_access_token')
    const currentRoom = localStorage.getItem('dc_current_room_code')

    if (token && currentRoom) {
      fetch(`/api/domino/rooms/${currentRoom}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data.room && data.room.status !== 'finished') {
            navigate(`/domino/room/${currentRoom}`, { replace: true })
          } else {
            localStorage.removeItem('dc_current_room_code')
          }
        })
        .catch(() => {
          localStorage.removeItem('dc_current_room_code')
        })
    }
  }, [navigate, location])

  return <HomePage />
}
