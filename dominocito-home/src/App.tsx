import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import DominoLobby from './domino/DominoLobby'
import DominoRoom from './domino/DominoRoom'
import AuthScreen from './domino/AuthScreen'
import { useEffect, useState } from 'react'

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<AuthScreen />} />
        <Route path="/domino" element={<DominoLobby />} />
        <Route path="/domino/room/:code" element={<DominoRoom />} />
        <Route path="/pinta-y-gana" element={<PintaYGanaRedirect />} />
        <Route path="/loteria" element={<LoteriaComingSoon />} />
      </Routes>
    </div>
  )
}

// Redirige al home automáticamente si hay un room pendiente
function HomeRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    // Si hay sesión y un room pendiente, preguntar
    const token = localStorage.getItem('dc_access_token')
    const currentRoom = localStorage.getItem('dc_current_room_code')

    if (token && currentRoom) {
      // Validar que la sala todavía existe y somos parte
      fetch(`/api/domino/rooms/${currentRoom}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => {
          if (data.room && data.room.status !== 'finished') {
            // Volver a la mesa automáticamente
            navigate(`/domino/room/${currentRoom}`, { replace: true })
          } else {
            // Mesa terminada o no existe, limpiar
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

function PintaYGanaRedirect() {
  // Por ahora apunta al subdirectorio de pinta-y-gana
  // (cuando unifiques builds, esto será una SPA route)
  useEffect(() => {
    window.location.href = '/pinta-y-gana/'
  }, [])
  return <div className="p-8 text-center">Cargando Pinta y Gana...</div>
}

function LoteriaComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="bg-white/10 backdrop-blur rounded-2xl p-8 max-w-md text-center">
        <div className="text-6xl mb-4">🎰</div>
        <h1 className="text-2xl font-bold mb-2">Lotería</h1>
        <p className="text-white/70 mb-6">Próximamente. Estamos calibrando la economía.</p>
        <Link to="/" className="inline-block px-6 py-2 bg-yellow-500 text-emerald-950 rounded-lg font-bold hover:bg-yellow-400">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}