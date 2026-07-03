import { Routes, Route, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import HomePage from './pages/HomePage'
import DominoLobby from './domino/DominoLobby'
import DominoRoom from './domino/DominoRoom'
import AuthScreen from './domino/AuthScreen'

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
          <Route path="/login" element={<AuthScreen />} />
          <Route path="/domino" element={<DominoLobby />} />
          <Route path="/domino/room/:code" element={<DominoRoom />} />
          <Route path="/pinta-y-gana" element={<PintaYGana />} />
          <Route path="/loteria" element={<LoteriaPage />} />
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
  }, [navigate])

  return <HomePage />
}