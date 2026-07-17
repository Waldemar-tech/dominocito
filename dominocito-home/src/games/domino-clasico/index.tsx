import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl } from '../../utils/baseUrl'
import heroBg from '../../assets/domino-clasico-hero.jpg'
import titleImg from '../../assets/title-domino-clasico.png'
import mesaPreview from '../../assets/domino-mesa-preview.jpg'
import misFichas from '../../assets/domino-mis-fichas.jpg'

// ── Brand tokens ──
const C = {
  nocturno:  '#1B120D',
  tostado:   '#3A2418',
  cayena:    '#FF6B4A',
  marfil:    '#F4E6C8',
}
const F = {
  heading: "'Playfair Display', Georgia, serif",
  body:    "'Inter', system-ui, sans-serif",
}

export default function DominoClasicoHome() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ username: string } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('dc_access_token')
    const username = localStorage.getItem('dc_username')
    if (token && username) setUser({ username })
  }, [])

  function handleLogout() {
    localStorage.removeItem('dc_access_token')
    localStorage.removeItem('dc_refresh_token')
    localStorage.removeItem('dc_username')
    localStorage.removeItem('dc_user_id')
    setUser(null)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.nocturno, color: C.marfil, fontFamily: F.body }}>

      {/* ── NAVBAR (mismo formato que Pinta y Gana) ── */}
      <nav
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between"
        style={{
          width: 'min(1100px, 92vw)',
          height: '64px',
          padding: '0 18px 0 24px',
          background: 'rgba(27,18,13,0.85)',
          backdropFilter: 'blur(14px)',
          borderRadius: '999px',
          border: `1px solid rgba(244,230,200,0.10)`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
      >
        {/* Logo + Home */}
        <div className="flex items-center gap-3">
          <img
            src={assetUrl('/assets/pinta-y-gana/Home%20-%20Domin%C3%B3cito-03.svg')}
            alt="Dominócito"
            style={{ height: '44px', width: 'auto' }}
          />
        </div>

        {/* Links centrales */}
        <div className="hidden md:flex items-center gap-7">
          <a
            href="https://dominocito.com"
            className="text-sm font-semibold transition-colors"
            style={{ color: C.marfil }}
            onMouseEnter={e => (e.currentTarget.style.color = C.cayena)}
            onMouseLeave={e => (e.currentTarget.style.color = C.marfil)}
          >
            Home
          </a>
          {['Lobby', 'Juegos', 'Ranking'].map(label => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              onClick={e => e.preventDefault()}
              className="text-sm font-semibold transition-colors"
              style={{ color: C.marfil }}
              onMouseEnter={e => (e.currentTarget.style.color = C.cayena)}
              onMouseLeave={e => (e.currentTarget.style.color = C.marfil)}
            >
              {label}
            </a>
          ))}
        </div>

        {/* CTA Auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <button onClick={handleLogout} className="btn-coral" style={{ padding: '9px 20px', fontSize: '13px' }}>
              Salir
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="btn-coral"
                style={{ padding: '9px 20px', fontSize: '13px' }}
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => navigate('/login')}
                className="btn-coral"
                style={{ padding: '9px 20px', fontSize: '13px' }}
              >
                Regístrate
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO (full bleed con imagen de fondo) ── */}
      <section className="relative w-full overflow-hidden" style={{ minHeight: '100vh' }}>
        {/* Background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${heroBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        {/* Viñeta cálida para legibilidad */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(27,18,13,0.3) 0%, rgba(27,18,13,0.75) 100%)',
          }}
        />

        {/* Contenido */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6"
             style={{ minHeight: '100vh', paddingTop: '120px', paddingBottom: '60px' }}>

          {/* Badge "EN VIVO" */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{
              background: 'rgba(255, 107, 74, 0.15)',
              border: `1px solid rgba(255, 107, 74, 0.4)`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="w-2 h-2 rounded-full inline-block animate-pulse" style={{ background: C.cayena }} />
            <span className="text-sm font-bold" style={{ color: C.marfil, fontFamily: F.body }}>
              Mesas activas · 4 jugadores
            </span>
          </div>

          {/* Título display: imagen del brand */}
          <h1 className="m-0">
            <img
              src={titleImg}
              alt="Dominó Clásico"
              style={{
                width: 'clamp(280px, 55vw, 700px)',
                height: 'auto',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </h1>

          {/* Subcopy */}
          <p className="mt-6 max-w-xl text-base md:text-lg" style={{ color: 'rgba(244,230,200,0.85)' }}>
            4 jugadores. 28 fichas. Reglas venezolanas.<br />
            Mesas públicas y privadas con chat en vivo.
          </p>

          {/* CTA hero */}
          <button
            onClick={() => navigate('/domino')}
            className="btn-coral-hero mt-10 inline-flex items-center gap-3"
            style={{
              background: C.cayena,
              color: '#fff',
              fontFamily: F.body,
              fontWeight: 700,
              fontSize: '18px',
              padding: '16px 36px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 6px 28px rgba(255,107,74,0.5)',
            }}
          >
            <span>Jugar Ahora</span>
            <span className="inline-flex items-center justify-center rounded-full" style={{ width: '28px', height: '28px', background: 'rgba(255,255,255,0.25)' }}>
              →
            </span>
          </button>

          {/* Pills informativas */}
          <div className="flex items-center justify-center gap-3 flex-wrap mt-10">
            {['4 jugadores', 'Doble-6', '100 puntos', 'Capicú & Tranca'].map(pill => (
              <span
                key={pill}
                className="px-4 py-2 rounded-full text-sm font-semibold"
                style={{
                  background: 'rgba(27,18,13,0.6)',
                  backdropFilter: 'blur(10px)',
                  border: `1px solid rgba(244,230,200,0.15)`,
                  color: C.marfil,
                }}
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PREVIEW MESA ── */}
      <section className="py-16 px-6" style={{ background: C.nocturno }}>
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-bold text-sm uppercase tracking-widest mb-3" style={{ color: C.cayena, fontFamily: F.body }}>
            La mesa
          </p>
          <h2 className="font-black mb-10" style={{ fontFamily: F.heading, fontSize: 'clamp(28px, 4vw, 42px)', color: C.marfil }}>
            4 jugadores. Una mesa. Quien domine, gana.
          </h2>
          <img
            src={mesaPreview}
            alt="Mesa de Dominó Clásico"
            style={{
              width: '100%',
              maxWidth: '680px',
              height: 'auto',
              display: 'block',
              margin: '0 auto',
              mixBlendMode: 'lighten',
            }}
          />
        </div>
      </section>

      {/* ── MIS FICHAS PREVIEW ── */}
      <section className="pb-10 px-6" style={{ background: C.nocturno, marginTop: '-40px' }}>
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold mb-6" style={{ color: 'rgba(244,230,200,0.5)', fontFamily: F.body }}>Tu mano durante la partida</p>
          <img
            src={misFichas}
            alt="Mis Fichas"
            style={{
              width: '100%',
              maxWidth: '720px',
              height: 'auto',
              display: 'block',
              margin: '0 auto',
              borderRadius: '16px',
              mixBlendMode: 'lighten',
            }}
          />
        </div>
      </section>

      {/* ── CÓMO SE JUEGA ── */}
      <section id="como-jugar" className="py-20 px-6" style={{ background: C.nocturno }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="font-bold text-sm uppercase tracking-widest mb-3" style={{ color: C.cayena, fontFamily: F.body }}>
              Reglas venezolanas
            </p>
            <h2
              className="font-black"
              style={{
                fontFamily: F.heading,
                fontSize: 'clamp(36px, 5vw, 56px)',
                color: C.marfil,
                letterSpacing: '-0.01em',
              }}
            >
              Cómo se juega
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '1', title: 'Reparte 7 fichas', desc: 'A cada jugador le tocan 7 fichas al azar de las 28 del doble-6.' },
              { num: '2', title: 'Empieza el doble más alto', desc: 'Quien tenga el doble más alto (6:6) abre la mesa. Si nadie tiene, la ficha más alta.' },
              { num: '3', title: 'Conecta por los extremos', desc: 'Cada ficha debe coincidir en número con uno de los extremos del tablero.' },
              { num: '4', title: 'Si no podés, pasás', desc: 'Si no tenés ficha jugable, pasás. Si todos pasan, se tranca y gana quien sume menos puntos.' },
              { num: '5', title: 'Domino o Capicú', desc: 'Gana quien coloque su última ficha (domino) o cierre la tranca con menos puntos (capicú).' },
              { num: '6', title: 'A 100 puntos', desc: 'La partida sigue rondas hasta que alguien sume 100 puntos. Se lleva la banca.' },
            ].map(step => (
              <div
                key={step.num}
                className="rounded-2xl p-6"
                style={{
                  background: 'rgba(58,36,24,0.4)',
                  border: `1px solid rgba(244,230,200,0.08)`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="font-black text-3xl mb-3"
                  style={{ color: C.cayena, fontFamily: F.heading }}
                >
                  {step.num}
                </div>
                <h3 className="font-bold text-lg mb-2" style={{ color: C.marfil, fontFamily: F.body }}>
                  {step.title}
                </h3>
                <p className="text-sm" style={{ color: 'rgba(244,230,200,0.7)' }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-16 px-6" style={{ background: C.nocturno }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-black" style={{ fontFamily: F.heading, fontSize: 'clamp(28px, 4vw, 40px)', color: C.marfil }}>
              Lo que tenés en la mesa
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: '4', label: 'Jugadores', sub: 'por mesa' },
              { value: '28', label: 'Fichas', sub: 'doble-6' },
              { value: '100', label: 'Puntos', sub: 'alguien gana' },
              { value: '∞', label: 'Rondas', sub: 'hasta el match' },
            ].map((s, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl text-center"
                style={{
                  background: 'rgba(58,36,24,0.4)',
                  border: `1px solid rgba(244,230,200,0.08)`,
                }}
              >
                <div
                  className="font-black mb-2"
                  style={{
                    fontFamily: F.heading,
                    fontSize: '2.5rem',
                    color: C.cayena,
                    lineHeight: 1,
                  }}
                >
                  {s.value}
                </div>
                <div className="text-sm font-bold mb-1" style={{ color: C.marfil }}>{s.label}</div>
                <div className="text-xs" style={{ color: 'rgba(244,230,200,0.6)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-24 px-6 text-center" style={{ background: C.nocturno }}>
        <div className="max-w-xl mx-auto">
          <div className="text-5xl mb-6">🎲</div>
          <h2
            className="font-black mb-4"
            style={{
              fontFamily: F.heading,
              fontSize: 'clamp(32px, 5vw, 48px)',
              color: C.marfil,
            }}
          >
            ¿Listo para sentarte?
          </h2>
          <p className="text-base mb-8" style={{ color: 'rgba(244,230,200,0.85)' }}>
            Mesas públicas 24/7 o creá tu sala privada con código.
          </p>
          <button
            onClick={() => navigate('/domino')}
            style={{
              background: C.cayena,
              color: '#fff',
              fontFamily: F.body,
              fontWeight: 700,
              fontSize: '18px',
              padding: '16px 36px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 6px 28px rgba(255,107,74,0.5)',
            }}
          >
            Entrar al lobby →
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="py-8 px-6 text-center"
        style={{
          background: 'rgba(20, 10, 5, 0.7)',
          borderTop: `1px solid rgba(244,230,200,0.06)`,
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="font-bold text-base" style={{ color: C.marfil }}>DOMINÓCITO</span>
          <span style={{ color: 'rgba(244,230,200,0.3)' }}>·</span>
          <span className="text-sm" style={{ color: 'rgba(244,230,200,0.65)' }}>
            Beta · 2026
          </span>
        </div>
        <p className="text-xs" style={{ color: 'rgba(244,230,200,0.45)' }}>
          Juega con responsabilidad. Solo para mayores de 18 años.
        </p>
      </footer>
    </div>
  )
}