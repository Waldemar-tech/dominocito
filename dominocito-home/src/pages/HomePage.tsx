import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

const API_URL = '/api'

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ username: string } | null>(null)

  useEffect(() => {
    // Verificar si hay sesión
    const accessToken = localStorage.getItem('dc_access_token')
    const username = localStorage.getItem('dc_username')
    if (accessToken && username) {
      setUser({ username })
    }
  }, [])

  function handleLogout() {
    localStorage.removeItem('dc_access_token')
    localStorage.removeItem('dc_refresh_token')
    localStorage.removeItem('dc_username')
    localStorage.removeItem('dc_user_id')
    setUser(null)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center border-b border-white/10">
        <Link to="/" className="flex items-center gap-2">
          <div className="text-3xl">🁢</div>
          <div>
            <div className="font-bold text-xl text-yellow-400">DOMINÓCITO</div>
            <div className="text-xs text-white/50">El dominó clásico digital</div>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-white/70">Hola, <span className="font-bold text-yellow-300">{user.username}</span></span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 bg-yellow-500 text-emerald-950 font-bold rounded-lg hover:bg-yellow-400 transition"
            >
              Iniciar sesión
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center mb-12 max-w-2xl">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent">
            Tres juegos. Un wallet. Cero barreras.
          </h1>
          <p className="text-lg text-white/70">
            El dominó clásico como lo jugás en la calle, más juegos rápidos con premios.
            Empezá gratis.
          </p>
        </div>

        {/* Games grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl">
          {/* Dominó Clásico */}
          <Link
            to="/domino"
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400/50 rounded-2xl p-6 transition-all hover:scale-[1.02]"
          >
            <div className="text-5xl mb-3">🁢</div>
            <h2 className="text-2xl font-bold mb-2 text-yellow-300">Dominó Clásico</h2>
            <p className="text-sm text-white/60 mb-4">
              4 jugadores, 28 fichas, reglas venezolanas. Mesas públicas y privadas.
            </p>
            <div className="text-xs text-white/40 mb-3">
              4 jugadores · Doble-6 · 100 puntos
            </div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-yellow-400 group-hover:translate-x-1 transition-transform">
              Jugar ahora →
            </div>
          </Link>

          {/* Pinta y Gana */}
          <Link
            to="/pinta-y-gana"
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/50 rounded-2xl p-6 transition-all hover:scale-[1.02]"
          >
            <div className="text-5xl mb-3">🎲</div>
            <h2 className="text-2xl font-bold mb-2 text-emerald-300">Pinta y Gana</h2>
            <p className="text-sm text-white/60 mb-4">
              Sorteo rápido: adiviná el número de la ficha y ganá al instante.
            </p>
            <div className="text-xs text-white/40 mb-3">
              Sorteo rápido · Premio al instante
            </div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-emerald-400 group-hover:translate-x-1 transition-transform">
              Jugar ahora →
            </div>
          </Link>

          {/* Lotería */}
          <Link
            to="/loteria"
            className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/50 rounded-2xl p-6 transition-all hover:scale-[1.02] opacity-60"
          >
            <div className="text-5xl mb-3">🎰</div>
            <h2 className="text-2xl font-bold mb-2 text-purple-300">Lotería</h2>
            <p className="text-sm text-white/60 mb-4">
              Manos de 7 fichas con jackpot. Próximamente.
            </p>
            <div className="text-xs text-white/40 mb-3">
              Próximamente
            </div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-purple-400 group-hover:translate-x-1 transition-transform">
              Ver más →
            </div>
          </Link>
        </div>

        {/* Wallet banner */}
        <div className="mt-12 bg-gradient-to-r from-yellow-500/20 to-emerald-500/20 border border-yellow-400/30 rounded-2xl px-6 py-4 max-w-2xl text-center">
          <div className="text-sm text-white/70 mb-1">Tu wallet (próximamente)</div>
          <div className="flex justify-center gap-6 text-lg font-bold">
            <span>💎 <span className="text-yellow-300">0</span> diamantes</span>
            <span>🪙 <span className="text-emerald-300">0</span> monedas</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs text-white/40 border-t border-white/10">
        Dominócito · Beta · 2026
      </footer>
    </div>
  )
}