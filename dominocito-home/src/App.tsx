import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import HomePage from './pages/HomePage'
import DominoLobby from './domino/DominoLobby'
import DominoRoom from './domino/DominoRoom'
import AuthScreen from './domino/AuthScreen'
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

export default function App() {
  return (
    <div className="min-h-screen">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<AuthWithBar />} />
          <Route path="/domino" element={<GameFrame><DominoLobby /></GameFrame>} />
          <Route path="/domino/room/:code" element={<GameFrame><DominoRoom /></GameFrame>} />
          <Route path="/pinta-y-gana" element={<GameFrame><PintaYGana /></GameFrame>} />
          <Route path="/loteria" element={<GameFrame><LoteriaPage /></GameFrame>} />
        </Routes>
      </Suspense>
    </div>
  )
}

/**
 * GameFrame: envuelve una ruta con la barra de logos global.
 * Solo se muestra cuando NO estamos en el home (ahí el HomePage tiene su
 * propio header con las cards grandes).
 */
function GameFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GameLogosBar />
      <div className="pt-16">{children}</div>
    </>
  )
}

function AuthWithBar() {
  return (
    <GameFrame>
      <AuthScreen />
    </GameFrame>
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
