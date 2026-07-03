import { useState, useEffect } from 'react';
import { DOMINOES } from '../engine/dominoes';
import { assetUrl } from '../utils/baseUrl';

interface HomePageProps {
  onRegister: () => void;
}

// ── Datos estáticos ────────────────────────────────────────────
const RULES = [
  { value: '~79%', label: 'RTP', sub: 'Retorno al jugador' },
  { value: '3.57%', label: 'Probabilidad', sub: '1 en 28 piedras' },
  { value: '×100', label: 'JACKPOT', sub: 'Multiplicador máximo' },
  { value: '€0.25', label: 'MÍNIMO', sub: 'Apuesta desde' },
];

const HERO_SLIDES = [
  { id: 'pinta-y-gana', label: 'Pinta y Gana' },
  { id: 'lobby', label: 'Lobby en vivo' },
  { id: 'ranking', label: 'Ranking semanal' },
];

// ── Hook de contador animado (live stats del home) ─────────────
function useCounter(target: number, duration: number = 1500) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ── Sparkles decorativos (4 estrellas absolutas) ──────────────
function HeroSparkles() {
  const positions: Array<{ top: string; left: string; delay: string; size: number }> = [
    { top: '12%', left: '14%', delay: '0s',   size: 18 },
    { top: '22%', left: '78%', delay: '0.6s', size: 14 },
    { top: '62%', left: '20%', delay: '1.2s', size: 16 },
    { top: '68%', left: '82%', delay: '1.8s', size: 20 },
  ];
  return (
    <>
      {positions.map((p, i) => (
        <svg
          key={i}
          className="sparkle animate-sparkle"
          style={{
            top: p.top,
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: p.delay,
          }}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0 L13.5 9 L24 12 L13.5 15 L12 24 L10.5 15 L0 12 L10.5 9 Z" />
        </svg>
      ))}
    </>
  );
}

// ── Hero — replica del moodboard (full-bleed, título display, CTA coral) ──
function Hero({ onRegister }: { onRegister: () => void }) {
  const [slide, setSlide] = useState(0);

  // Auto-advance carousel
  useEffect(() => {
    const t = setInterval(() => {
      setSlide(s => (s + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ minHeight: '100vh' }}
    >
      {/* ── Background image: hero render 3D del diseñador ── */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${assetUrl('/assets/pinta-y-gana/ChatGPT%20Image%20Jun%2029,%202026,%2010_59_00%20PM.png')})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Viñeta cálida para legibilidad */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(61,31,15,0.35) 0%, rgba(20,10,5,0.75) 100%)',
        }}
      />

      {/* Contenido del hero */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6"
           style={{ minHeight: '100vh', paddingTop: '120px', paddingBottom: '60px' }}>
        <HeroSparkles />

        {/* Aura coral detrás del título */}
        <div
          className="aura-coral animate-aura"
          style={{
            width: '560px',
            height: '560px',
            top: '38%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Badge "EN VIVO" */}
        <div
          className="relative z-20 inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 animate-float-in"
          style={{
            background: 'rgba(255, 107, 74, 0.15)',
            border: '1px solid rgba(255, 107, 74, 0.4)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="w-2 h-2 rounded-full bg-coral-400 inline-block animate-pulse"
                style={{ background: 'var(--coral)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--cream-soft)' }}>
            Sorteos en vivo · Cada 30 minutos
          </span>
        </div>

        {/* Título display: PINTA / Y / GANA */}
        <h1 className="relative z-20 m-0 leading-none">
          <span className="display-hero block">PINTA</span>
          <span className="display-hero block">Y</span>
          <span className="display-hero block">GANA</span>
        </h1>

        {/* CTA hero */}
        <button
          onClick={onRegister}
          className="btn-coral-hero relative z-20 mt-10 inline-flex items-center gap-3"
        >
          <span>Jugar Ahora</span>
          <span
            className="inline-flex items-center justify-center rounded-full"
            style={{
              width: '28px',
              height: '28px',
              background: 'rgba(255, 255, 255, 0.25)',
            }}
          >
            →
          </span>
        </button>

        {/* Pills informativas */}
        <div className="relative z-20 flex items-center justify-center gap-3 flex-wrap mt-10">
          {['28 piedras', 'Sorteo cada 30 min', 'Gana hasta ×100'].map(pill => (
            <span
              key={pill}
              className="px-4 py-2 rounded-full text-sm font-semibold"
              style={{
                background: 'rgba(26, 26, 26, 0.6)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 233, 214, 0.15)',
                color: 'var(--cream)',
              }}
            >
              {pill}
            </span>
          ))}
        </div>

        {/* Dots indicator (carousel) */}
        <div className="relative z-20 flex items-center justify-center gap-2 mt-12">
          {HERO_SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setSlide(i)}
              aria-label={`Ir a ${s.label}`}
              style={{
                width: slide === i ? '28px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: slide === i ? 'var(--white)' : 'rgba(255, 255, 255, 0.4)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Sección "Tablero" (28 fichas interactivas) ───────────────────
function HowItWorks() {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);

  return (
    <section
      className="relative py-20 px-6 overflow-hidden"
      style={{ background: 'var(--chocolate-dark)' }}
    >
      {/* Decoración de fondo */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          width: '900px',
          height: '900px',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(255, 107, 74, 0.06), transparent 70%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p
            className="font-bold text-sm uppercase tracking-widest mb-3"
            style={{ color: 'var(--coral)' }}
          >
            28 piedras · Una será la ganadora
          </p>
          <h2
            className="font-black text-white"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 5vw, 56px)',
              letterSpacing: '-0.01em',
            }}
          >
            Elige tu piedra
          </h2>
          <p
            className="mt-4 max-w-xl mx-auto"
            style={{ color: 'var(--cream)', opacity: 0.7, lineHeight: 1.6 }}
          >
            Cada sorteo se revela una ficha al azar. Si coincide con la tuya, cobras
            ×18. Con los multiplicadores activos: ×50 o ×100.
          </p>
        </div>

        {/* Tablero 7×4 */}
        <div
          className="grid mx-auto"
          style={{
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: '10px',
            maxWidth: '660px',
            rowGap: '14px',
          }}
        >
          {DOMINOES.map((d) => {
            const isHovered = hoverId === d.id;
            const isPicked = pickedId === d.id;
            const showLabel = isHovered || isPicked;
            return (
              <button
                key={d.id}
                onMouseEnter={() => setHoverId(d.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={() => setPickedId(isPicked ? null : d.id)}
                aria-label={`Ficha ${d.label}`}
                className="relative group focus:outline-none"
                style={{
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  transform: showLabel ? 'translateY(-6px) scale(1.05)' : undefined,
                  transition: 'transform 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
                  filter: showLabel ? 'drop-shadow(0 8px 20px rgba(255, 107, 74, 0.35))' : undefined,
                }}
              >
                <img
                  src={assetUrl(`/assets/pinta-y-gana/tiles/tile_${d.id.toString().padStart(2, '0')}_${d.high}-${d.low}.png`)}
                  alt={`${d.label}`}
                  draggable={false}
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}
                />
                {showLabel && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 -bottom-2 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap z-10"
                    style={{
                      background: isPicked ? 'var(--coral)' : 'rgba(20,10,5,0.85)',
                      color: 'var(--cream-soft)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}
                  >
                    {isPicked ? '✓ Tu piedra' : d.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Hint + CTA */}
        <div className="mt-12 text-center">
          {pickedId !== null ? (
            <button
              onClick={() => setPickedId(null)}
              className="btn-coral-hero inline-flex items-center gap-3"
            >
              <span>Apuesta a la {DOMINOES[pickedId].label} → Jugar</span>
            </button>
          ) : (
            <p
              className="text-sm font-bold uppercase tracking-widest animate-pulse"
              style={{ color: 'var(--cream)', opacity: 0.5 }}
            >
              · Pasa el cursor o toca una ficha ·
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Sección Multiplicadores (showcase ×50 y ×100) ──────────────
function Multipliers() {
  return (
    <section className="py-16 px-6" style={{ background: 'var(--chocolate-dark)' }}>
      <div className="max-w-4xl mx-auto">
        <div
          className="rounded-3xl p-10 text-center relative overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, rgba(255, 107, 74, 0.12), rgba(212, 162, 74, 0.12))',
            border: '1px solid rgba(255, 107, 74, 0.25)',
          }}
        >
          <div className="text-sm font-bold mb-3 uppercase tracking-widest"
               style={{ color: 'var(--coral)' }}>
            Multiplicadores especiales
          </div>
          <h2 className="font-black mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(36px, 6vw, 72px)',
                color: 'var(--cream-soft)',
                textShadow: '4px 4px 0 var(--black)',
                lineHeight: 1,
              }}>
            HASTA ×100
          </h2>
          <p className="text-base md:text-lg mb-8" style={{ color: 'var(--cream)', opacity: 0.85 }}>
            Cada sorteo revela dos piedras especiales con multiplicadores.
            <br />
            Si apostaste en una de ellas... ¡jackpot!
          </p>

          <div className="flex items-center justify-center gap-6 flex-wrap">
            <div
              className="flex items-center gap-3 px-6 py-4 rounded-2xl"
              style={{
                background: 'rgba(249, 115, 22, 0.18)',
                border: '1px solid rgba(249, 115, 22, 0.45)',
              }}
            >
              <span className="text-3xl">🔥</span>
              <div className="text-left">
                <div className="text-3xl font-black" style={{ color: '#f97316' }}>×50</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--cream)' }}>
                  Multiplicador
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-3 px-6 py-4 rounded-2xl"
              style={{
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
              }}
            >
              <span className="text-3xl">💥</span>
              <div className="text-left">
                <div className="text-3xl font-black" style={{ color: '#ef4444' }}>×100</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--cream)' }}>
                  Jackpot
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Sección Stats (4 reglas del juego) ─────────────────────────
function Stats() {
  return (
    <section className="py-16 px-6" style={{ background: 'var(--chocolate-dark)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-black text-white"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 40px)' }}>
            Las reglas del juego
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {RULES.map((s, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl text-center card"
              style={{ border: '1px solid rgba(255, 233, 214, 0.08)' }}
            >
              <div
                className="text-3xl font-black mb-2"
                style={{
                  color: i === 2 ? '#f59e0b' : 'var(--coral)',
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div className="text-sm font-bold text-white mb-1">{s.label}</div>
              <div className="text-xs" style={{ color: 'var(--cream)', opacity: 0.65 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Sección "Live stats" (contadores animados) ────────────────
function LiveStats() {
  const games = useCounter(15847);
  const winners = useCounter(4291);
  const paid = useCounter(128940);
  return (
    <section className="py-12 px-6" style={{ background: 'rgba(0,0,0,0.25)' }}>
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-3 gap-4 md:gap-8 text-center">
          <div>
            <div className="font-black text-white"
                 style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(22px, 3vw, 32px)' }}>
              {games.toLocaleString()}
            </div>
            <div className="text-xs uppercase tracking-widest mt-1"
                 style={{ color: 'var(--cream)', opacity: 0.65 }}>
              Partidas jugadas
            </div>
          </div>
          <div style={{ borderLeft: '1px solid rgba(255,233,214,0.1)', borderRight: '1px solid rgba(255,233,214,0.1)' }}>
            <div className="font-black gradient-gold text-glow-gold"
                 style={{ fontSize: 'clamp(22px, 3vw, 32px)' }}>
              {winners.toLocaleString()}
            </div>
            <div className="text-xs uppercase tracking-widest mt-1"
                 style={{ color: 'var(--cream)', opacity: 0.65 }}>
              Ganadores
            </div>
          </div>
          <div>
            <div className="font-black"
                 style={{
                   color: 'var(--coral)',
                   fontSize: 'clamp(22px, 3vw, 32px)',
                   textShadow: '0 0 16px var(--coral-glow)',
                 }}>
              €{paid.toLocaleString()}
            </div>
            <div className="text-xs uppercase tracking-widest mt-1"
                 style={{ color: 'var(--cream)', opacity: 0.65 }}>
              Total pagado
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA final + Footer ─────────────────────────────────────────
function BottomCTA({ onRegister }: { onRegister: () => void }) {
  return (
    <>
      <section className="py-24 px-6 text-center" style={{ background: 'var(--chocolate-dark)' }}>
        <div className="max-w-xl mx-auto">
          <div className="text-5xl mb-6">🎲</div>
          <h2 className="font-black text-white mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(32px, 5vw, 48px)',
                textShadow: '4px 4px 0 var(--black)',
              }}>
            ¿Listo para tu primera piedra?
          </h2>
          <p className="text-base mb-8" style={{ color: 'var(--cream)', opacity: 0.85 }}>
            Registro gratuito. Sin depósito inicial. Recarga cuando quieras.
          </p>
          <button onClick={onRegister} className="btn-coral-hero">
            Crear cuenta gratis →
          </button>
        </div>
      </section>

      <footer
        className="py-8 px-6 text-center"
        style={{
          background: 'rgba(20, 10, 5, 0.7)',
          borderTop: '1px solid rgba(255, 233, 214, 0.06)',
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="logo-mark text-base">DOMINÓCITO</span>
          <span style={{ color: 'var(--cream)', opacity: 0.3 }}>·</span>
          <span className="text-sm" style={{ color: 'var(--cream)', opacity: 0.65 }}>
            IOBPAS La Guaira
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--cream)', opacity: 0.45 }}>
          Juega con responsabilidad. Solo para mayores de 18 años. © 2025 Dominócito.
        </p>
      </footer>
    </>
  );
}

// ── Página principal ───────────────────────────────────────────
export default function HomePage({ onRegister }: HomePageProps) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--chocolate-dark)' }}>
      <Hero onRegister={onRegister} />
      <HowItWorks />
      <Multipliers />
      <Stats />
      <LiveStats />
      <BottomCTA onRegister={onRegister} />
    </div>
  );
}
