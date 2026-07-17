import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────
// Dominócito · Landing principal
// Reconstruida el 2026-07-17 contra `design/home-mockup/HOME_MOCKUP_V1.jpg`
// Stack: Tailwind v4 + variables CSS del ADN (`design/ADN_DOMINOCITO.md`)
// Tipografía: Fraunces (serif) + Inter (sans) — de Google Fonts
// ─────────────────────────────────────────────────────────────────

const API_URL = '/api'
const LOGO_URL = '/assets/logo-dominocito.webp'

// URLs de assets — los reales los va a sustituir Waldemar cuando lleguen.
// Mientras tanto son placeholders coloreados (gradientes por asset).
const HERO_BG_IMG    = '/assets/hero/HERO_HAND.jpg' // mano + fichas de Waldemar (2026-07-17)
const HERO_RIGHT_IMG = '/assets/hero/HERO_HAND.jpg' // mismo asset — superpuesto en esquina superior derecha
const CARD_PINTA  = '/assets/cards/card-pinta-y-gana.jpg'
const CARD_DOMINO = '/assets/cards/card-domino-clasico.jpg'
const CARD_LOTERIA = '/assets/cards/card-loteria.jpg'

// ── Hook: contador animado ──────────────────────────────────────
function useCounter(target: number, duration = 1500) {
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

// ── Hook: query a /domino/rooms/public (mesas activas en vivo) ───
function useActiveRooms(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancel = false
    const tick = async () => {
      try {
        const token = localStorage.getItem('dc_access_token')
        const r = await fetch(API_URL + '/domino/rooms/public', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!r.ok) return
        const data = await r.json()
        if (!cancel && data && Array.isArray(data.rooms)) setCount(data.rooms.length)
      } catch {}
    }
    tick()
    const t = setInterval(tick, 8000)
    return () => { cancel = true; clearInterval(t) }
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

  function handleLogin() { navigate('/login') }

  // ── Reveal-on-scroll para sección stats ───────────────────────
  const statsRef = useRef<HTMLDivElement | null>(null)
  const [statsVisible, setStatsVisible] = useState(false)
  useEffect(() => {
    if (!statsRef.current) return
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setStatsVisible(true),
      { threshold: 0.2 }
    )
    obs.observe(statsRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Stats (placeholder, se puede mover a tRPC) ───────────────
  const sJugadores  = useCounter(statsVisible ? 2545 : 0)
  const sMesas      = useCounter(statsVisible ? activeRooms || 32 : 0)
  const sPremios    = useCounter(statsVisible ? 4320 : 0)
  const sUsuarios   = useCounter(statsVisible ? 18456 : 0)

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{
        background:
          'linear-gradient(180deg, var(--color-fondo-claro) 0%, var(--color-fondo) 40%, var(--color-fondo-oscuro) 100%)',
      }}
    >
      {/* ── Navbar píldora flotante ─────────────────────────────── */}
      <nav
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between px-3 py-2"
        style={{
          width: 'min(1152px, 92vw)',
          height: 64,
          background: 'rgba(26, 20, 16, 0.92)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderRadius: 9999,
          boxShadow: '0 25px 60px -12px rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,230,200,0.06)',
        }}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 pl-3 pr-2">
          <img src={LOGO_URL} alt="Dominócito" style={{ height: 44, width: 'auto', maxWidth: 200 }} />
        </Link>

        {/* Center links — logos de juegos */}
        <div className="hidden md:flex items-center gap-10 flex-1 justify-center">
          {[
            { label: 'Pinta y Gana',    logo: '/assets/logos/pinta-y-gana.png',   to: '/pinta-y-gana' },
            { label: 'Dominó Clásico',  logo: '/assets/logos/domino-clasico.png',  to: '/domino' },
            { label: 'Lotería',         logo: '/assets/logos/loteria.png',         to: '/loteria' },
          ].map(({ label, logo, to }) => (
            <Link key={label} to={to}
               className="opacity-80 hover:opacity-100 transition">
              <img src={logo} alt={label} style={{ height: 36, width: 'auto', maxWidth: 130 }} />
            </Link>
          ))}
        </div>

        {/* Right CTA */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden sm:inline text-sm text-[#E5DDD5] pr-1">
                Hola, <span className="font-bold text-[#FAE6C8]">{user.username}</span>
              </span>
              <button onClick={handleLogout}
                className="px-4 py-2 text-sm bg-white/8 hover:bg-white/15 rounded-full transition border border-white/10">
                Salir
              </button>
            </>
          ) : (
            <>
              <button onClick={handleLogin}
                className="hidden sm:inline px-4 py-2 text-sm text-[#E5DDD5] hover:text-[#FAE6C8] transition">
                Iniciar sesión
              </button>
              <button onClick={handleLogin}
                className="px-5 py-2 text-sm font-semibold text-white rounded-full"
                style={{
                  background: 'linear-gradient(to right, #FF7B54, #F0623A)',
                  boxShadow: '0 8px 18px -6px rgba(255,104,74,0.5)',
                }}>
                Regístrate
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative w-full pt-36 md:pt-44 pb-16 px-6 overflow-hidden">
        {/* Background: la imagen de la mesa de Waldemar cubriendo todo el hero, oscurecida */}
        <div className="absolute inset-0 z-0">
          <img
            src={HERO_BG_IMG}
            alt="Mesa de dominó"
            className="w-full h-full object-cover"
            style={{
              objectPosition: 'right center',
              opacity: 0.55,
            }}
          />
          {/* Gradiente de oscurecimiento: izquierda oscura, derecha un poco más clara para que se vea la mesa */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to right, rgba(27,18,13,0.95) 0%, rgba(27,18,13,0.75) 40%, rgba(27,18,13,0.30) 70%, rgba(27,18,13,0.20) 100%)',
            }}
          />
          {/* Gradiente vertical para que se integre con el fondo de la página */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(61,42,30,0.40) 0%, rgba(43,30,23,0.0) 30%, rgba(43,30,23,1.0) 90%)',
            }}
          />
        </div>
        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <h1
              className="font-serif font-black mb-6"
              style={{
                fontFamily: 'Fraunces, "Recoleta", serif',
                fontSize: 'clamp(48px, 6.5vw, 88px)',
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
                color: '#FBF6F0',
              }}
            >
              Tres juegos.
              <br />
              Un Wallet.
              <br />
              <span style={{ color: '#FF7B54' }}>Cero Barreras.</span>
            </h1>
            <p
              className="mb-8 max-w-xl"
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: '#E5DDD5',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Dominó venezolano, pinta y gana, lotería.
              <br />
              Empezá gratis en mesas abiertas 24/7 con gente real.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/domino"
                className="px-7 py-3 font-semibold text-white rounded-full inline-flex items-center justify-center"
                style={{
                  background: 'linear-gradient(to right, #FF7B54, #F0623A)',
                  boxShadow: '0 14px 28px -10px rgba(255,104,74,0.55)',
                  fontFamily: 'Inter, sans-serif',
                }}>
                Jugar Ahora
              </Link>
              <a href="#juegos"
                className="px-7 py-3 font-medium text-white rounded-full text-center"
                style={{
                  border: '1px solid rgba(255,255,255,0.55)',
                  fontFamily: 'Inter, sans-serif',
                }}>
                Explorar juegos
              </a>
            </div>
          </div>

        </div>
      </section>

      {/* ── 3 Cards ──────────────────────────────────────────────── */}
      <section id="juegos" className="px-6 py-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pinta y Gana — artwork con lettering quemado (Waldemar 2026-07-17) */}
          <Link to="/pinta-y-gana" className="group relative rounded-3xl overflow-hidden aspect-[9/11]"
            style={{ background: 'radial-gradient(circle at 30% 20%, #FFD24A, #E8A800 60%, #8C5800 100%)' }}>
            <img src={CARD_PINTA} alt="Pinta y Gana"
                 className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                 onError={(e) => ((e.currentTarget.style.display = 'none'))} />
          </Link>

          {/* Dominó Clásico — artwork (pendiente: Waldemar) */}
          <Link to="/domino" className="group relative rounded-3xl overflow-hidden aspect-[9/11]"
            style={{ background: 'radial-gradient(circle at 30% 20%, #E89A55, #C97B3C 60%, #5C3416 100%)' }}>
            <img src={CARD_DOMINO} alt="Dominó Clásico"
                 className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                 onError={(e) => ((e.currentTarget.style.display = 'none'))} />
          </Link>

          {/* Lotería — artwork (pendiente: Waldemar) */}
          <Link to="/loteria" className="group relative rounded-3xl overflow-hidden aspect-[9/11]"
            style={{ background: 'radial-gradient(circle at 30% 20%, #2E6BA8, #0F2847 60%, #061427 100%)' }}>
            <img src={CARD_LOTERIA} alt="Lotería"
                 className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                 onError={(e) => ((e.currentTarget.style.display = 'none'))} />
          </Link>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <section ref={statsRef} className="px-6 py-16">
        <div className="max-w-5xl mx-auto flex flex-wrap justify-center items-center divide-x"
             style={{ borderColor: 'transparent' }}>
          {[
            { v: sJugadores, l: 'Jugadores en Línea', c: '#FF7B54' },
            { v: sMesas,     l: 'Mesas Activas',     c: '#F5B800' },
            { v: sPremios,   l: 'Premios Hoy (Bs.)',  c: '#FF7B54' },
            { v: sUsuarios,  l: 'Usuarios Totales',  c: '#F5B800' },
          ].map((s, i) => (
            <div key={i} className="px-10 py-5 text-center"
                 style={{ borderLeft: i > 0 ? '1px solid #5A4A40' : 'none' }}>
              <div className="font-bold mb-1"
                   style={{ fontFamily: 'Inter, sans-serif', fontSize: 'clamp(28px, 3.5vw, 36px)', color: s.c }}>
                {s.v.toLocaleString('es-VE')}
              </div>
              <div className="uppercase tracking-wider text-xs"
                   style={{ color: '#C9BFB8', fontFamily: 'Inter, sans-serif', letterSpacing: '0.1em' }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="px-6 py-8 text-center text-xs"
              style={{ color: '#C9BFB8', fontFamily: 'Inter, sans-serif', borderTop: '1px solid #3A2418' }}>
        Dominócito · Beta · Caracas, Venezuela · 2026
      </footer>
    </div>
  )
}
