import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────
// Dominócito · Landing
// Reconstruida el 2026-07-17 con:
//  - Navbar flotante píldora (Home / Lobby / Juegos / Ranking)
//  - Hero full-bleed con Fichas_Mesa-04.png (enviado por Neil)
//  - Badge "Mesas activas" + CTA "Jugar ahora"
//  - Sección "Cómo se juega" (6 pasos de reglas venezolanas)
//  - 3 cards de juego (1v1, 2v2, Partido a puntos)
//  - Stats en vivo (4 jugadores, 28 fichas, 100 puntos)
// ─────────────────────────────────────────────────────────────────

const API_URL = '/api'
const HERO_BG = '/assets/pinta-y-gana/Fichas_Mesa - Dominócito-04.png'
const LOGO_BG = '/assets/pinta-y-gana/Home - Dominócito-03.svg'

// ── Datos estáticos ──────────────────────────────────────────────
const RULES = [
  {
    n: 1,
    title: 'Equipos y salida',
    body: '4 jugadores en 2 parejas (Rojo vs Azul). Sale el doble más alto de la mesa. Si nadie tiene doble, sale la ficha de más puntos.',
  },
  {
    n: 2,
    title: 'Cómo se juega',
    body: 'Por tu turno, conectás una ficha que coincida en un extremo. Si tenés varias opciones, elegís el lado. Si no podés jugar, pasás.',
  },
  {
    n: 3,
    title: 'Cómo se gana una mano',
    body: 'Gana quien se queda sin fichas ("dominó"). Si se tranca (todos pasan seguido), gana quien tenga menos puntos en la mano.',
  },
  {
    n: 4,
    title: 'Puntos por pareja',
    body: 'La pareja ganadora suma los puntos que el perdedor llevaba en la mano. Los puntos se acumulan en el partido.',
  },
  {
    n: 5,
    title: 'Partido a puntos',
    body: 'Elegís objetivo al crear la mesa: una mano, 100, 200 o puntaje personalizado. La pareja que llegue primero gana el partido.',
  },
  {
    n: 6,
    title: 'Mesas y rondas',
    body: 'Mesas públicas y privadas de 4. Después de cada mano se revelan las fichas del perdedor y arranca la siguiente en 6 segundos.',
  },
]

const STEPS = [
  { icon: '🁢', title: 'Entrá a una mesa', body: 'Mesas públicas o privadas. Hasta 4 jugadores.' },
  { icon: '🔴', title: 'Elegí tu equipo', body: 'Rojo o Azul. Una vez los 4 eligen, arranca la partida.' },
  { icon: '🂠', title: 'Recibís 7 fichas', body: 'Sale el doble más alto. Turno a la izquierda.' },
  { icon: '🂱', title: 'Jugá tu ficha', body: 'Conectá un extremo que coincida. Si no podés, pasás.' },
  { icon: '🏆', title: 'Ganás la mano', body: 'Quedándote sin fichas o con menos puntos si se tranca.' },
  { icon: '🎯', title: 'Sumás al marcador', body: 'Acumulás puntos hasta llegar al objetivo del partido.' },
]

// ── Hook: contador animado ──────────────────────────────────────
function useCounter(target: number, duration: number = 1500) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      setVal(Math.floor(progress * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    const raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

// ── Hook: query a /domino/rooms/public para mesas activas ────────
function useActiveRooms() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancel = false
    const fetchCount = async () => {
      try {
        const token = localStorage.getItem('dc_access_token')
        const r = await fetch(API_URL + '/domino/rooms/public', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!r.ok) return
        const data = await r.json()
        if (!cancel && data && Array.isArray(data.rooms)) {
          setCount(data.rooms.length)
        }
      } catch {
        /* offline OK */
      }
    }
    fetchCount()
    const t = setInterval(fetchCount, 8000)
    return () => {
      cancel = true
      clearInterval(t)
    }
  }, [])
  return count
}

export default function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ username: string } | null>(null)
  const activeRooms = useActiveRooms()

  useEffect(() => {
    const accessToken = localStorage.getItem('dc_access_token')
    const username = localStorage.getItem('dc_username')
    if (accessToken && username) setUser({ username })
  }, [])

  function handleLogout() {
    localStorage.removeItem('dc_access_token')
    localStorage.removeItem('dc_refresh_token')
    localStorage.removeItem('dc_username')
    localStorage.removeItem('dc_user_id')
    setUser(null)
  }

  function handleLogin() {
    navigate('/login')
  }

  // Animación: scroll del usuario activa reveal-on-scroll
  const stepsRef = useRef<HTMLDivElement | null>(null)
  const [stepsVisible, setStepsVisible] = useState(false)
  useEffect(() => {
    if (!stepsRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setStepsVisible(true),
      { threshold: 0.15 }
    )
    obs.observe(stepsRef.current)
    return () => obs.disconnect()
  }, [])

  const totalPlayers = useCounter(4)
  const totalTiles = useCounter(28)
  const targetScore = useCounter(100)

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-emerald-900 to-black text-white overflow-x-hidden">
      {/* ── Navbar flotante píldora ────────────────────────────────── */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 nav-pill flex items-center justify-between px-5"
           style={{ width: 'min(1100px, 92vw)', height: 64 }}>
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_BG} alt="Dominócito" style={{ height: 32, width: 'auto' }} />
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm font-semibold">
          {['Home', 'Lobby', 'Juegos', 'Ranking'].map(label => (
            <a key={label} href={`#${label.toLowerCase()}`} className="text-white/80 hover:text-yellow-300 transition">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden sm:inline text-sm text-white/70">
                Hola, <span className="font-bold text-yellow-300">{user.username}</span>
              </span>
              <button onClick={handleLogout}
                className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition">
                Salir
              </button>
            </>
          ) : (
            <>
              <button onClick={handleLogin}
                className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition">
                Iniciar sesión
              </button>
              <Link to="/login"
                className="px-3 py-1.5 text-sm bg-yellow-400 text-emerald-950 font-bold rounded-lg hover:bg-yellow-300 transition">
                Regístrate
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero full-bleed ──────────────────────────────────────── */}
      <section className="relative w-full pt-28 pb-16 md:pt-36 md:pb-24 px-6">
        <div className="absolute inset-0 z-0">
          <img src={HERO_BG} alt="Dominó Clásico" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/40 via-emerald-950/60 to-emerald-950" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {activeRooms > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {activeRooms} {activeRooms === 1 ? 'mesa activa' : 'mesas activas'} ahora
            </div>
          )}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-200 bg-clip-text text-transparent">
              Dominó Clásico
            </span>
            <br />
            <span className="text-white/90 text-3xl md:text-4xl">
              venezolano, online
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/70 mb-8 max-w-2xl mx-auto">
            4 jugadores · 28 fichas · dobles, capicúas y trancas.
            Jugá con tu pareja y sumá puntos hasta llegar al partido.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/domino"
              className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-emerald-950 font-bold text-lg rounded-xl hover:scale-105 transition-transform shadow-2xl shadow-yellow-500/30">
              🎲 Jugar ahora
            </Link>
            <a href="#como-se-juega"
              className="w-full sm:w-auto px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-lg rounded-xl border border-white/20 transition">
              Cómo se juega
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats en vivo ────────────────────────────────────────── */}
      <section className="px-6 -mt-8 mb-16 relative z-10">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-3 md:gap-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center backdrop-blur">
            <div className="text-3xl md:text-5xl font-bold text-yellow-300">{totalPlayers}</div>
            <div className="text-xs md:text-sm text-white/60 uppercase mt-1">Jugadores por mesa</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center backdrop-blur">
            <div className="text-3xl md:text-5xl font-bold text-emerald-300">{totalTiles}</div>
            <div className="text-xs md:text-sm text-white/60 uppercase mt-1">Fichas doble-6</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center backdrop-blur">
            <div className="text-3xl md:text-5xl font-bold text-rose-300">{targetScore}</div>
            <div className="text-xs md:text-sm text-white/60 uppercase mt-1">Puntos para ganar</div>
          </div>
        </div>
      </section>

      {/* ── Modos de juego ──────────────────────────────────────── */}
      <section id="juegos" className="px-6 py-12 max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
          Tres modos, una mesa
        </h2>
        <p className="text-center text-white/60 mb-12">
          Elegí cómo jugar. Todos comparten las mismas reglas venezolanas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Mano suelta */}
          <Link to="/domino"
            className="group bg-gradient-to-br from-emerald-900/50 to-emerald-950/50 hover:from-emerald-800/60 hover:to-emerald-900/60 border border-emerald-400/30 hover:border-emerald-400 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-xl">
            <div className="text-5xl mb-3">🁢</div>
            <h3 className="text-2xl font-bold text-emerald-300 mb-2">Mano suelta</h3>
            <p className="text-sm text-white/70 mb-4">
              Una sola mano sin marcador. Rápido, para entrar en calor o probar reglas nuevas.
            </p>
            <div className="text-xs text-white/50 mb-3">
              1 mano · Sin puntaje · 5 min
            </div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-emerald-300 group-hover:translate-x-1 transition-transform">
              Jugar mano suelta →
            </div>
          </Link>

          {/* 2v2 parejas */}
          <Link to="/domino"
            className="group bg-gradient-to-br from-rose-900/40 to-blue-900/40 hover:from-rose-800/50 hover:to-blue-800/50 border border-rose-400/30 hover:border-rose-400 rounded-2xl p-6 transition-all hover:scale-[1.02] shadow-xl">
            <div className="text-5xl mb-3">🔴🔵</div>
            <h3 className="text-2xl font-bold text-rose-300 mb-2">Parejas 2v2</h3>
            <p className="text-sm text-white/70 mb-4">
              Cuatro jugadores en dos parejas (Rojo vs Azul). Una sola mano con puntaje en pantalla.
            </p>
            <div className="text-xs text-white/50 mb-3">
              4 jugadores · 2 parejas · Acumulable
            </div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-rose-300 group-hover:translate-x-1 transition-transform">
              Jugar 2v2 →
            </div>
          </Link>

          {/* Partido a puntos (destacado) */}
          <Link to="/domino"
            className="group relative bg-gradient-to-br from-yellow-500/20 via-yellow-600/10 to-amber-700/20 border-2 border-yellow-400/60 hover:border-yellow-300 rounded-2xl p-6 transition-all hover:scale-[1.03] shadow-2xl shadow-yellow-500/20">
            <div className="absolute -top-3 right-4 px-3 py-1 bg-yellow-400 text-emerald-950 text-xs font-bold rounded-full uppercase tracking-wider">
              Nuevo
            </div>
            <div className="text-5xl mb-3">🎯</div>
            <h3 className="text-2xl font-bold text-yellow-300 mb-2">Partido a puntos</h3>
            <p className="text-sm text-white/70 mb-4">
              Elegí objetivo: 100, 200 o personalizado. Mano tras mano, marcador por pareja con revelación de fichas del perdedor.
            </p>
            <div className="text-xs text-white/50 mb-3">
              4 jugadores · 2 parejas · 100 / 200 / custom
            </div>
            <div className="inline-flex items-center gap-1 text-sm font-bold text-yellow-300 group-hover:translate-x-1 transition-transform">
              Jugar partido a puntos →
            </div>
          </Link>
        </div>
      </section>

      {/* ── Cómo se juega (6 pasos) ────────────────────────────────── */}
      <section id="como-se-juega" ref={stepsRef}
        className={`px-6 py-20 transition-all duration-700 ${stepsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
            Cómo se juega
          </h2>
          <p className="text-center text-white/60 mb-12">
            Las reglas del dominó venezolano, en 6 pasos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STEPS.map(s => (
              <div key={s.n}
                className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition">
                <div className="text-3xl mb-2">{s.icon}</div>
                <div className="text-xs text-yellow-300 uppercase font-bold mb-1">
                  Paso {s.n}
                </div>
                <h4 className="text-lg font-bold text-white mb-1">{s.title}</h4>
                <p className="text-sm text-white/60">{s.body}</p>
              </div>
            ))}
          </div>

          {/* Reglas extendidas (acordeón simple) */}
          <details className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-5">
            <summary className="cursor-pointer text-lg font-bold text-yellow-300">
              + Reglas detalladas (venezolanas)
            </summary>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {RULES.map(r => (
                <div key={r.n} className="border-l-2 border-yellow-400/40 pl-3">
                  <div className="text-xs text-yellow-300 uppercase font-bold mb-1">#{r.n}</div>
                  <h5 className="font-bold mb-1">{r.title}</h5>
                  <p className="text-sm text-white/60">{r.body}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────── */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          ¿Listo para una partida?
        </h2>
        <p className="text-white/60 mb-6">
          Mesas activas ahora. Entrá y elegí equipo.
        </p>
        <Link to="/domino"
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-yellow-400 to-yellow-500 text-emerald-950 font-bold text-lg rounded-xl hover:scale-105 transition-transform shadow-2xl shadow-yellow-500/30">
          🁢 Entrar al lobby
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="px-6 py-6 text-center text-xs text-white/40 border-t border-white/10">
        Dominócito · Beta · Caracas, Venezuela · 2026
      </footer>
    </div>
  )
}
