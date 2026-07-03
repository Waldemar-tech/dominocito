import { useState, useCallback, useEffect, useRef } from 'react';
import { DOMINOES } from './engine/dominoes';
import { crearSorteo, apostar as apostarSorteo, cerrarYRevelar } from './engine/sorteo';
import type { SorteoState } from './engine/sorteo';
import { crearWallet, apostar as apostarWallet, acreditarPremio } from './engine/wallet';
import type { Wallet } from './engine/wallet';
import DominoTile from './components/DominoTile';
import type { DominoTheme, DominoVariant } from './components/DominoTile';
import Countdown from './components/Countdown';
import AuthScreen from './auth/AuthScreen';
import HomePage from './pages/HomePage';
import {
  getCurrentUser,
  logout,
  syncWalletBalance,
  addTestingFunds,
} from './auth/authStore';
import type { User } from './auth/authStore';

// 🧪 TESTING: cambiar a false en producción para ocultar botones de testing
const TESTING_MODE = true;

type HistorialEntry = {
  id: string;
  msg: string;
  won: boolean;
  ts: Date;
};

// ── Confetti particle component (win burst) ────────────────────
function Particles({ active }: { active: boolean }) {
  const EMOJIS = ['🎉', '🎲', '💰', '⭐', '🏆', '✨', '💎'];
  const particles = Array.from({ length: 12 });

  if (!active) return null;

  return (
    <div className="particles pointer-events-none">
      {particles.map((_, i) => (
        <div
          key={i}
          className="particle"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: `${20 + Math.random() * 40}%`,
            animationDelay: `${i * 0.1}s`,
            animationDuration: `${1 + Math.random() * 0.8}s`,
          }}
        >
          {EMOJIS[i % EMOJIS.length]}
        </div>
      ))}
    </div>
  );
}

// ── Nav flotante píldora (pixel-perfect moodboard) ─────────────
function FloatingNav({
  currentUser,
  onLogin,
  onRegister,
  onLogout,
}: {
  currentUser: User | null;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
}) {
  return (
    <nav
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 nav-pill flex items-center justify-between"
      style={{
        width: 'min(1100px, 92vw)',
        height: '64px',
        padding: '0 18px 0 24px',
      }}
    >
      {/* Logo wordmark */}
      <div className="flex items-center gap-2">
        <img
          src="/assets/Home%20-%20Domin%C3%B3cito-03.svg"
          alt="Dominócito"
          style={{ height: '32px', width: 'auto' }}
        />
      </div>

      {/* Links centrales */}
      <div className="hidden md:flex items-center gap-7">
        {['Lobby', 'Juegos', 'Ranking'].map(label => (
          <a
            key={label}
            href={`#${label.toLowerCase()}`}
            onClick={e => e.preventDefault()}
            className="text-sm font-semibold transition-colors"
            style={{ color: 'var(--white)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--white)')}
          >
            {label}
          </a>
        ))}
      </div>

      {/* CTA Auth */}
      <div className="flex items-center gap-2">
        {currentUser ? (
          <>
            <span
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: 'rgba(212, 162, 74, 0.18)',
                color: 'var(--gold-bright)',
                border: '1px solid rgba(212, 162, 74, 0.35)',
              }}
            >
              👤 {currentUser.username}
            </span>
            <button onClick={onLogout} className="btn-coral" style={{ padding: '8px 18px', fontSize: '13px' }}>
              Salir
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onLogin}
              className="hidden sm:inline-block text-sm font-semibold transition-colors"
              style={{ color: 'var(--white)', background: 'transparent', border: 'none', padding: '6px 10px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--white)')}
            >
              Iniciar Sesión
            </button>
            <button onClick={onRegister} className="btn-coral" style={{ padding: '9px 20px', fontSize: '13px' }}>
              Regístrate
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

// ═════════════════════════════════════════════════════════════════
// ── Sorteo animation helper ─────────────────────────────────────
// Recorre las fichas en orden, desacelerando, hasta detenerse
// EXACTAMENTE en `targetId` (la ficha que el RNG ya decidió).
// NO recalcula nada — solo refleja el resultado del RNG.
//
// Regla dura: la animación SOLO visualiza el camino desde 0-0 hasta
// la ficha del RNG. Nunca da vueltas, nunca se pasa del target.
function animateHighlight(
  targetId: number,
  durationMs: number,
  onTick: (id: number) => void,
  onDone: () => void,
  frameRef: { current: number | null },
) {
  // Cuántas fichas recorre desde 0-0 hasta el target (inclusive).
  // Ej: target=0  -> steps=1 (solo en 0-0)
  //     target=4  -> steps=5 (0,1,2,3,4)
  //     target=27 -> steps=28 (recorrido completo)
  const targetIndex = Math.max(0, Math.min(27, targetId));
  const totalSteps = targetIndex + 1;

  // Duración base por ficha: queremos que fichas tempranas sean
  // rápidas y fichas tardías duren más (≈ proporcional a totalSteps).
  // Modelo: cada step tiene un delay que crece linealmente con su
  // índice dentro del recorrido. El último step (target) es el más
  // lento para que "aterrice" con suspense.
  //
  //   sum_{i=0..totalSteps-1} (delayMin + (delayMax-delayMin) * i/(totalSteps-1))
  //   ≈ totalSteps * (delayMin + delayMax) / 2
  // Para duración total ≈ durationMs:
  //   totalSteps * (delayMin + delayMax) / 2 ≈ durationMs
  //   => (delayMin + delayMax) ≈ 2 * durationMs / totalSteps
  //
  // Si totalSteps=1 (target=0): no animar, ir directo al done.
  // Si totalSteps es muy chico (<3), igual animar con un par de frames.

  let delayMin: number;
  let delayMax: number;

  if (totalSteps <= 1) {
    // Caso edge: target=0. Pintar la ficha y terminar.
    onTick(targetIndex);
    frameRef.current = null;
    onDone();
    return () => {};
  }

  // Duración total ≈ totalSteps * (delayMin + delayMax) / 2
  // => delayMin + delayMax = 2 * durationMs / totalSteps
  // Elegimos delayMin rápido y delayMax un poco más lento (sensación de
  // desaceleración) pero respetando el budget total.
  const budget = (2 * durationMs) / totalSteps; // suma delayMin+delayMax
  // Ratio 1:2.2 (rápido al inicio, más lento al final)
  delayMin = Math.max(35, budget / 3.2);
  delayMax = Math.min(380, budget - delayMin);

  let currentStep = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;

    const idx = currentStep; // 0..totalSteps-1

    // *** STOP CONDITION (la regla del task) ***
    // Paramos EXACTAMENTE cuando llegamos al target.
    // No más recorrido después de esto.
    if (idx >= targetIndex) {
      onTick(targetIndex); // garantizar que la última ficha es target
      frameRef.current = null;
      onDone();
      return;
    }

    onTick(idx);
    currentStep++;

    // Delay progresivo: lineal entre delayMin y delayMax.
    // El último step (idx = targetIndex - 1) lleva el delay más largo
    // para dar suspenso antes de aterrizar en el target.
    const denom = Math.max(1, totalSteps - 1);
    const progress = currentStep / denom;
    const delay = delayMin + (delayMax - delayMin) * progress;
    frameRef.current = window.setTimeout(tick, delay);
  };

  // Primer frame con delayMin
  frameRef.current = window.setTimeout(tick, delayMin);

  return () => { cancelled = true; };
}

// ═════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth state ──
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentUser());
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // ── Wallet ──
  const [wallet, setWallet] = useState<Wallet>(() =>
    crearWallet(currentUser?.wallet.balance ?? 0),
  );

  const [sorteo, setSorteo] = useState<SorteoState>(crearSorteo());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState<number>(1);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [theme, setTheme] = useState<DominoTheme>('ivory');
  const [apuestasCerradas, setApuestasCerradas] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [showWinBanner, setShowWinBanner] = useState(false);
  const winAmountRef = useRef(0);

  // ── Animation state (x100 → x50 → reveal) ──
  // rngResultX100 / rngResultX50: resultado del RNG seteado ANTES de animar.
  // La animación LEE estos valores como stop condition. Nunca recalcula.
  // selectedX100 / selectedX50 se fijan SOLO cuando cada animación termina.
  // El highlight temporal (animHighlightId) es independiente del estado final.
  const [rngResultX100, setRngResultX100] = useState<number | null>(null);
  const [rngResultX50, setRngResultX50] = useState<number | null>(null);
  const [animatingX100, setAnimatingX100] = useState(false);
  const [selectedX100, setSelectedX100] = useState<number | null>(null);
  const [animatingX50, setAnimatingX50] = useState(false);
  const [selectedX50, setSelectedX50] = useState<number | null>(null);
  const [animHighlightId, setAnimHighlightId] = useState<number | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper: ¿hay alguna animación corriendo? (bloquea doble-click)
  const isAnimating = animatingX100 || animatingX50;

  // Persist wallet
  useEffect(() => {
    if (currentUser) {
      syncWalletBalance(currentUser.id, wallet.balance);
    }
  }, [wallet.balance, currentUser]);

  // Cerrar apuestas 30s antes
  useEffect(() => {
    setApuestasCerradas(false);
    const checkCierre = setInterval(() => {
      const diff = Math.floor((sorteo.nextSorteoAt.getTime() - Date.now()) / 1000);
      if (diff <= 30 && diff > 0) setApuestasCerradas(true);
      if (diff <= 0) clearInterval(checkCierre);
    }, 1000);
    return () => clearInterval(checkCierre);
  }, [sorteo.nextSorteoAt]);

  // Cleanup de animación al desmontar
  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        clearTimeout(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (animTimeoutRef.current !== null) {
        clearTimeout(animTimeoutRef.current);
        animTimeoutRef.current = null;
      }
    };
  }, []);

  // Auth callbacks
  const handleAuthenticated = (user: User) => {
    setCurrentUser(user);
    setWallet(crearWallet(user.wallet.balance));
    setSorteo(crearSorteo());
    setSelectedId(null);
    setMessage('');
    setHistorial([]);
    setApuestasCerradas(false);
    setShowAuth(false);
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setWallet(crearWallet(0));
    setSorteo(crearSorteo());
    setSelectedId(null);
    setMessage('');
    setHistorial([]);
    setApuestasCerradas(false);
  };

  const handleAddTestingFunds = async () => {
    if (!currentUser) return;
    const updated = await addTestingFunds(currentUser.id, 100);
    if (updated) {
      setCurrentUser(updated);
      setWallet(w => {
        const next = { ...w, balance: updated.wallet.balance, historial: [...w.historial] };
        next.historial.push({
          id: crypto.randomUUID(),
          tipo: 'deposito',
          amount: 100,
          descripcion: 'Recarga de testing (+€100)',
          timestamp: new Date(),
        });
        return next;
      });
    }
  };

  const showMsg = (msg: string, type: 'success' | 'error') => {
    setMessage(msg);
    setMessageType(type);
    if (type === 'success') {
      setTimeout(() => setMessage(''), 4000);
    }
  };

  // Game callbacks
  const handleSelectDomino = (id: number) => {
    if (sorteo.status !== 'open') return;
    setSelectedId(id === selectedId ? null : id);
    setMessage('');
  };

  const handleApostar = () => {
    if (selectedId === null) return showMsg('Selecciona una piedra primero', 'error');
    if (betAmount < 0.25) return showMsg('Mínimo €0.25', 'error');
    if (betAmount > 25) return showMsg('Máximo €25', 'error');

    const newWallet = { ...wallet, historial: [...wallet.historial] };
    const walletResult = apostarWallet(newWallet, betAmount);
    if (!walletResult.ok) return showMsg(walletResult.error || 'Error', 'error');

    const newSorteo = { ...sorteo, bets: [...sorteo.bets] };
    const sorteoResult = apostarSorteo(newSorteo, { dominoId: selectedId, amount: betAmount });
    if (!sorteoResult.ok) return showMsg(sorteoResult.error || 'Error', 'error');

    setWallet(newWallet);
    setSorteo(newSorteo);
    showMsg(`✅ Apuesta de €${betAmount.toFixed(2)} en ${DOMINOES[selectedId].label}`, 'success');
    setSelectedId(null);
  };

  const handleSorteo = useCallback((e?: React.MouseEvent | void) => {
    void e;
    if (sorteo.status !== 'open') return;
    if (isAnimating) return; // anti-doble-click

    // 1) RNG PRIMERO — calcular resultado, guardar ANTES de animar
    const resultado = cerrarYRevelar(sorteo);
    const { winner, multipliers, winAmount, userWon, payout } = resultado.result!;

    // 2) Acreditar premio inmediatamente si ganó (no depende de animación)
    if (userWon) {
      const newWallet = { ...wallet, historial: [...wallet.historial] };
      acreditarPremio(newWallet, winAmount, `Premio ×${payout} en ${winner.label}`);
      setWallet(newWallet);
      winAmountRef.current = winAmount;
    }

    // 3) Setear estado del sorteo INMEDIATAMENTE
    setSorteo(resultado);

    // 4) **CRÍTICO**: guardar el resultado del RNG en estado ANTES de animar
    //    La animación debe LEER estos valores como stop condition.
    //    Nunca recalcular ni usar posición visual como resultado final.
    const x100Target = multipliers.x100.id;
    const x50Target = multipliers.x50.id;
    setRngResultX100(x100Target);
    setRngResultX50(x50Target);

    // 5) Resetear estados de selección previa (importante en re-sorteos)
    setSelectedX100(null);
    setSelectedX50(null);
    setAnimHighlightId(0);

    // 6) Iniciar secuencia de animación: x100 primero
    setAnimatingX100(true);

    const startX50 = () => {
      // x100 terminado: validar contra RNG y fijar selectedX100
      if (x100Target !== rngResultX100) {
        console.error('RNG mismatch x100:', x100Target, 'vs', rngResultX100);
      }
      setSelectedX100(x100Target);
      setAnimatingX100(false);
      setAnimHighlightId(null);

      // Pausa antes de la siguiente animación
      animTimeoutRef.current = setTimeout(() => {
        setAnimatingX50(true);
        animateHighlight(
          x50Target, // Lee del RNG guardado
          5200, // Más lento
          (id) => setAnimHighlightId(id),
          () => {
            // x50 terminado: validar contra RNG y fijar selectedX50
            if (x50Target !== rngResultX50) {
              console.error('RNG mismatch x50:', x50Target, 'vs', rngResultX50);
            }
            setSelectedX50(x50Target);
            setAnimatingX50(false);
            setAnimHighlightId(null);

            // Mostrar resultado final
            let msg = `Ganó: ${winner.label}`;
            if (userWon) {
              msg += ` · ¡GANASTE €${winAmount.toFixed(2)}! (×${payout})`;
              setShowWinBanner(true);
              setShowParticles(true);
              setTimeout(() => setShowParticles(false), 3000);
              setTimeout(() => setShowWinBanner(false), 6000);
            } else if (sorteo.bets.length > 0) {
              msg += ' · No fue esta vez';
            }
            msg += ` | ×50→${multipliers.x50.label} ×100→${multipliers.x100.label}`;
            setHistorial(h => [{
              id: crypto.randomUUID(),
              msg,
              won: !!userWon,
              ts: new Date(),
            }, ...h.slice(0, 9)]);
            setMessage('');
          },
          animFrameRef,
        );
      }, 500);
    };

    // Empezar con x100 (4.5s, más lento y claro)
    animateHighlight(
      x100Target, // Lee del RNG guardado
      4500,
      (id) => setAnimHighlightId(id),
      startX50,
      animFrameRef,
    );
  }, [sorteo, wallet, isAnimating, rngResultX100, rngResultX50]);

  const handleNuevoSorteo = () => {
    // Cancelar animación pendiente si el user salta a nuevo sorteo
    if (animFrameRef.current !== null) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (animTimeoutRef.current !== null) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    setAnimatingX100(false);
    setSelectedX100(null);
    setAnimatingX50(false);
    setSelectedX50(null);
    setRngResultX100(null);
    setRngResultX50(null);
    setAnimHighlightId(null);

    setSorteo(crearSorteo(sorteo.banco));
    setSelectedId(null);
    setMessage('');
    setApuestasCerradas(false);
    setShowWinBanner(false);
  };

  // ── ROUTING ──────────────────────────────────────────────────────
  // Not logged in → homepage + optional auth modal
  if (!currentUser) {
    return (
      <>
        <HomePage
          onRegister={() => { setAuthMode('register'); setShowAuth(true); }}
        />
        <FloatingNav
          currentUser={null}
          onLogin={() => { setAuthMode('login'); setShowAuth(true); }}
          onRegister={() => { setAuthMode('register'); setShowAuth(true); }}
          onLogout={handleLogout}
        />
        {showAuth && (
          <AuthScreen
            onAuthenticated={handleAuthenticated}
            onClose={() => setShowAuth(false)}
            initialMode={authMode}
          />
        )}
      </>
    );
  }

  // ── GAME ──────────────────────────────────────────────────────────
  const betsByDomino = sorteo.bets.reduce((acc, b) => {
    acc[b.dominoId] = (acc[b.dominoId] || 0) + b.amount;
    return acc;
  }, {} as Record<number, number>);

  const winner = sorteo.result?.winner;
  const mults = sorteo.result?.multipliers;

  const totalBet = sorteo.bets.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--chocolate-dark)' }}>
      {/* Fondo del Home: imagen 3D del diseñador + viñeta cálida */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'url(/assets/ChatGPT%20Image%20Jun%2029,%202026,%2010_59_00%20PM.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.6,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(61,31,15,0.4) 0%, rgba(20,10,5,0.7) 100%)',
        }}
      />

      <div className="relative z-10">
        <Particles active={showParticles} />

      {/* Win banner */}
      {showWinBanner && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div
            className="text-center animate-win-burst"
            style={{
              background: 'linear-gradient(135deg, rgba(58,36,24,0.96), rgba(28,18,10,0.95))',
              border: '2px solid var(--gold)',
              borderRadius: '24px',
              padding: '40px 60px',
              boxShadow: '0 0 60px rgba(212, 162, 74, 0.6)',
            }}
          >
            <div className="text-6xl mb-4">🏆</div>
            <div
              className="text-5xl font-black mb-2 gradient-gold text-glow-gold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              ¡GANASTE!
            </div>
            <div className="text-4xl font-black" style={{ color: 'var(--cream-soft)' }}>
              +€{winAmountRef.current.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER GAME — píldora negra única con logo + menú + balance + username ── */}
      <header className="relative z-30 pt-4 px-6">
        <div className="max-w-6xl mx-auto">
          <div
            className="flex items-center justify-between gap-4 px-5 py-3 rounded-full"
            style={{
              background: 'rgba(20, 10, 5, 0.85)',
              border: '1px solid rgba(255, 233, 214, 0.08)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {/* Logo + menú */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '22px' }}>🎲</span>
                <span
                  className="font-black tracking-wide"
                  style={{ color: 'var(--cream)', fontSize: '15px', letterSpacing: '0.05em' }}
                >
                  DOMINÓCITO
                </span>
              </div>
              <nav className="hidden md:flex items-center gap-5">
                <button
                  className="text-sm font-bold transition-opacity hover:opacity-100"
                  style={{ color: 'var(--cream)', opacity: 0.85, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Lobby
                </button>
                <button
                  className="text-sm font-bold transition-opacity hover:opacity-100"
                  style={{ color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Juegos
                </button>
                <button
                  className="text-sm font-bold transition-opacity hover:opacity-100"
                  style={{ color: 'var(--cream)', opacity: 0.85, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Ranking
                </button>
              </nav>
            </div>

            {/* Balance + username */}
            <div className="flex items-center gap-3">
              {/* Balance con moneda 🪙 + botón + */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-full"
                style={{ background: 'rgba(255, 255, 255, 0.06)' }}
              >
                <span style={{ fontSize: '14px' }}>🪙</span>
                <span
                  className="font-black text-sm"
                  style={{ color: 'var(--white)', fontFamily: 'monospace' }}
                >
                  ₡{(wallet.balance * 1000).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                </span>
                <button
                  onClick={handleAddTestingFunds}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-transform hover:scale-110"
                  style={{
                    background: '#E74C3C',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Agregar fondos (testing)"
                >
                  +
                </button>
              </div>

              {/* Username pill */}
              <button
                className="flex items-center gap-2 px-3 py-2 rounded-full transition-opacity hover:opacity-90"
                style={{
                  background: 'var(--coral)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                }}
                title="Mi cuenta"
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ background: 'rgba(255, 255, 255, 0.25)' }}
                >
                  {currentUser.username[0].toUpperCase()}
                </span>
                <span className="text-sm font-bold hidden sm:inline">{currentUser.username}</span>
                <span style={{ fontSize: '10px' }}>▾</span>
              </button>
            </div>
          </div>

          {/* Theme toggle + logout (debajo del header, discreto) */}
          <div className="flex items-center justify-between gap-2 px-2 mt-2">
            <div
              className="flex items-center gap-1 p-1 rounded-full"
              style={{ background: 'rgba(28, 18, 10, 0.5)' }}
            >
              {(['ivory', 'wood'] as DominoTheme[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className="px-2 py-1 rounded-full text-xs font-bold transition-all"
                  style={{
                    background: theme === t
                      ? (t === 'ivory' ? 'var(--cream)' : 'var(--wood-medium)')
                      : 'transparent',
                    color: theme === t
                      ? (t === 'ivory' ? 'var(--walnut)' : 'var(--cream)')
                      : 'var(--cream)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'ivory' ? '🦷' : '🪵'}
                </button>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs font-bold px-3 py-1 rounded-full"
              style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--cream)', opacity: 0.6, border: 'none', cursor: 'pointer' }}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN ──────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-4">

        {/* 🧪 Testing toolbar */}
        {TESTING_MODE && (
          <div
            className="rounded-2xl px-4 py-2.5 mb-5 flex items-center gap-4 flex-wrap"
            style={{
              background: 'rgba(28, 18, 10, 0.7)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
              }}
            >
              🧪 TESTING
            </span>
            <button
              onClick={handleAddTestingFunds}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245, 158, 11, 0.32)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245, 158, 11, 0.18)')}
            >
              + Agregar €100
            </button>
            <span className="text-xs" style={{ color: 'var(--cream)', opacity: 0.65 }}>
              Wallet guardada: €{currentUser.wallet.balance.toFixed(2)}
            </span>
          </div>
        )}

        {/* ── LAYOUT DE 2 CARDS (35% izquierda + 65% derecha) ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[35%_65%] gap-5 mb-5">

          {/* ────────────── CARD IZQUIERDA ────────────── */}
          <div className="flex flex-col gap-5">
            {/* Card Próximo Sorteo */}
            <div className="relative">
              {/* Etiqueta pill sobresaliendo */}
              <div
                className="absolute -top-3 left-6 z-10 px-4 py-1.5 rounded-full text-xs font-black tracking-wide"
                style={{
                  background: 'var(--coral)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(255, 107, 74, 0.4)',
                }}
              >
                PRÓXIMO SORTEO
              </div>
              <div
                className="rounded-3xl p-6 pt-8 relative"
                style={{
                  background: 'var(--cream-soft)',
                  color: 'var(--walnut)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                }}
              >
                {/* Countdown grande MM:SS */}
                <div className="text-center">
                  {sorteo.status === 'revealed' ? (
                    <div className="space-y-3">
                      {isAnimating ? (
                        <>
                          <div className="text-xs font-black tracking-widest animate-pulse"
                               style={{ color: 'var(--walnut)', opacity: 0.7 }}>
                            🎲 SORTEANDO...
                          </div>
                          <div
                            className="text-6xl font-black animate-pulse"
                            style={{ fontFamily: 'var(--font-display)', color: 'var(--walnut)', opacity: 0.3 }}
                          >
                            {animHighlightId !== null ? DOMINOES[animHighlightId].label : '—'}
                          </div>
                          <div className="text-xs font-bold" style={{ color: 'var(--walnut)', opacity: 0.55 }}>
                            {animatingX100 && '💥 Eligiendo ×100...'}
                            {animatingX50 && '🔥 Eligiendo ×50...'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs font-black tracking-widest" style={{ color: 'var(--walnut)', opacity: 0.7 }}>
                            PIEDRA GANADORA
                          </div>
                          <div
                            className="text-6xl font-black"
                            style={{ fontFamily: 'var(--font-display)' }}
                          >
                            {winner?.label}
                          </div>
                          <div className="flex justify-center gap-2">
                            <div
                              className="px-3 py-1 rounded-full text-xs font-bold"
                              style={{ background: 'rgba(249, 115, 22, 0.18)', color: '#ea580c' }}
                            >
                              ×50 {mults?.x50.label}
                            </div>
                            <div
                              className="px-3 py-1 rounded-full text-xs font-bold"
                              style={{ background: 'rgba(239, 68, 68, 0.18)', color: '#dc2626' }}
                            >
                              ×100 {mults?.x100.label}
                            </div>
                          </div>
                          <button
                            onClick={handleNuevoSorteo}
                            className="mt-2 px-6 py-3 rounded-full font-black text-sm transition-all"
                            style={{
                              background: '#D4A24A',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer',
                              boxShadow: '0 4px 12px rgba(212, 162, 74, 0.4)',
                            }}
                          >
                            Nuevo sorteo →
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <Countdown targetDate={sorteo.nextSorteoAt} onExpire={handleSorteo} />
                  )}
                </div>

                {sorteo.status === 'open' && !apuestasCerradas && totalBet > 0 && (
                  <div className="mt-3 text-center text-xs font-bold" style={{ color: 'var(--walnut)', opacity: 0.7 }}>
                    Apostado: ₡{(totalBet * 1000).toFixed(0)}
                  </div>
                )}
              </div>
            </div>

            {/* Card Controles de apuesta */}
            {sorteo.status === 'open' && !apuestasCerradas && (
              <div className="relative">
                <div
                  className="rounded-3xl p-5"
                  style={{
                    background: 'var(--cream-soft)',
                    color: 'var(--walnut)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  {/* Pills montos rápidos */}
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <button
                      onClick={() => setBetAmount(Math.max(0.25, betAmount - 0.25))}
                      className="w-8 h-8 rounded-full font-black text-lg transition-all hover:scale-110"
                      style={{ background: 'var(--walnut)', color: 'var(--cream-soft)', border: 'none', cursor: 'pointer' }}
                    >
                      −
                    </button>
                    <div className="flex gap-1">
                      {[0.25, 0.5, 1].map(v => (
                        <button
                          key={v}
                          onClick={() => setBetAmount(v)}
                          className="px-2.5 py-1.5 rounded-full text-xs font-black transition-all"
                          style={{
                            background: betAmount === v ? 'var(--coral)' : 'rgba(58, 36, 24, 0.08)',
                            color: betAmount === v ? 'white' : 'var(--walnut)',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          +{v}
                        </button>
                      ))}
                      <button
                        onClick={() => setBetAmount(wallet.balance)}
                        className="px-2.5 py-1.5 rounded-full text-xs font-black transition-all"
                        style={{
                          background: 'rgba(58, 36, 24, 0.08)',
                          color: 'var(--walnut)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        ALL IN
                      </button>
                    </div>
                    <button
                      onClick={() => setBetAmount(Math.min(25, betAmount + 0.25))}
                      className="w-8 h-8 rounded-full font-black text-lg transition-all hover:scale-110"
                      style={{ background: 'var(--walnut)', color: 'var(--cream-soft)', border: 'none', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>

                  {/* Input monto */}
                  <div
                    className="rounded-2xl px-4 py-3 mb-3 flex items-center justify-center"
                    style={{ background: 'rgba(20, 10, 5, 0.85)' }}
                  >
                    <span className="font-black text-2xl" style={{ color: 'var(--cream-soft)', fontFamily: 'monospace' }}>
                      {(betAmount * 1000).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                    </span>
                  </div>

                  {/* Iconos laterales + botón APOSTAR */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <button
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg transition-transform hover:scale-110"
                      style={{ background: '#10b981', color: 'white', border: 'none', cursor: 'pointer' }}
                      title="Estadísticas"
                    >
                      📊
                    </button>
                    <button
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black transition-transform hover:scale-110"
                      style={{ background: '#10b981', color: 'white', border: 'none', cursor: 'pointer' }}
                      title="Duplicar"
                    >
                      ↻2x
                    </button>
                  </div>

                  {/* Botón APOSTAR verde */}
                  <button
                    onClick={handleApostar}
                    disabled={selectedId === null}
                    className="w-full py-4 rounded-2xl font-black text-base transition-all"
                    style={{
                      background: selectedId !== null ? '#22c55e' : 'rgba(58, 36, 24, 0.15)',
                      color: selectedId !== null ? 'white' : 'var(--walnut)',
                      cursor: selectedId !== null ? 'pointer' : 'not-allowed',
                      boxShadow: selectedId !== null ? '0 6px 20px rgba(34, 197, 94, 0.4)' : 'none',
                      border: 'none',
                      fontSize: '16px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {selectedId !== null ? `APOSTAR` : 'SELECCIONA UNA PIEDRA'}
                  </button>

                  {/* Card Jugada Seleccionada */}
                  <div
                    className="mt-3 rounded-2xl px-4 py-3 flex items-center justify-between"
                    style={{ background: 'var(--walnut)' }}
                  >
                    <span className="text-xs font-bold" style={{ color: 'var(--cream-soft)' }}>
                      Jugada seleccionada
                    </span>
                    <span
                      className="font-black text-lg"
                      style={{ color: selectedId !== null ? 'var(--coral)' : 'rgba(245, 230, 211, 0.3)' }}
                    >
                      {selectedId !== null ? DOMINOES[selectedId].label : '— —'}
                    </span>
                  </div>

                  {message && (
                    <div
                      className="mt-3 py-2 px-4 rounded-full text-sm text-center font-bold"
                      style={{
                        background: messageType === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: messageType === 'success' ? '#15803d' : '#991b1b',
                      }}
                    >
                      {message}
                    </div>
                  )}

                  {TESTING_MODE && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleAddTestingFunds}
                        className="flex-1 py-2 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(245, 158, 11, 0.18)', color: '#a16207', border: '1px solid rgba(245, 158, 11, 0.4)', cursor: 'pointer' }}
                      >
                        + ₡100k testing
                      </button>
                      <button
                        onClick={handleSorteo}
                        disabled={isAnimating}
                        className="flex-1 py-2 rounded-full text-xs font-bold transition-opacity"
                        style={{
                          background: isAnimating
                            ? 'rgba(124, 58, 237, 0.08)'
                            : 'rgba(124, 58, 237, 0.2)',
                          color: isAnimating ? 'rgba(124, 58, 237, 0.4)' : '#7c3aed',
                          border: '1px solid rgba(124, 58, 237, 0.4)',
                          cursor: isAnimating ? 'not-allowed' : 'pointer',
                          opacity: isAnimating ? 0.5 : 1,
                        }}
                      >
                        {isAnimating ? '⏳ Sorteando...' : '▶ Sortear ahora'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cierre de apuestas */}
            {sorteo.status === 'open' && apuestasCerradas && (
              <div
                className="rounded-2xl p-4 text-center animate-pulse"
                style={{ background: 'rgba(127, 29, 29, 0.5)', border: '1px solid rgba(239, 68, 68, 0.5)' }}
              >
                <div className="font-black text-sm" style={{ color: '#fca5a5' }}>
                  🔒 Apuestas cerradas — sorteando...
                </div>
              </div>
            )}
          </div>

          {/* ────────────── CARD DERECHA: 28 PIEDRAS ────────────── */}
          <div className="relative">
            {/* Etiqueta pill sobresaliendo */}
            <div
              className="absolute -top-3 left-6 z-10 px-4 py-1.5 rounded-full text-xs font-black tracking-wide"
              style={{
                background: 'var(--coral)',
                color: 'white',
                boxShadow: '0 4px 12px rgba(255, 107, 74, 0.4)',
              }}
            >
              SELECCIONA TU PIEDRA
            </div>
            <div
              className="rounded-3xl p-5 pt-7"
              style={{
                background: 'var(--cream-soft)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
              }}
            >
              {sorteo.status === 'revealed' && selectedX100 !== null && selectedX50 !== null && mults && (
                <div className="flex gap-2 mb-3 justify-end">
                  <div
                    className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(249, 115, 22, 0.2)', color: '#c2410c' }}
                  >
                    🔥 ×50 {DOMINOES[selectedX50].label}
                  </div>
                  <div
                    className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#b91c1c' }}
                  >
                    💥 ×100 {DOMINOES[selectedX100].label}
                  </div>
                </div>
              )}
              <div
                className="grid gap-3 justify-center"
                style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: '12px' }}
              >
                {DOMINOES.map(d => (
                  <DominoTile
                    key={d.id}
                    domino={d}
                    selected={selectedId === d.id}
                    multiplier={
                      // La badge x100/x50 se muestra SOLO cuando su animación terminó
                      // y fijó la selección. NO usar mults (sorteo.result.multipliers)
                      // directamente — eso haría que aparezcan de golpe al final.
                      selectedX100 === d.id ? 100 : selectedX50 === d.id ? 50 : null
                    }
                    isWinner={
                      // Winner se marca solo cuando AMBAS animaciones terminaron
                      winner?.id === d.id && selectedX100 !== null && selectedX50 !== null
                    }
                    betAmount={betsByDomino[d.id]}
                    onClick={() => handleSelectDomino(d.id)}
                    disabled={sorteo.status !== 'open' || apuestasCerradas || isAnimating}
                    theme={theme}
                    variant={'image' as DominoVariant}
                    isAnimHighlight={isAnimating && animHighlightId === d.id}
                    animHighlightKind={
                      animatingX100 ? 'x100' : animatingX50 ? 'x50' : null
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── HISTORIAL ────────────────────────────────────────── */}
        {historial.length > 0 && (
          <div className="card rounded-3xl p-5">
            <h2 className="text-xs font-black uppercase tracking-widest mb-4"
                style={{ color: 'var(--cream)', opacity: 0.65 }}>
              Historial de sorteos
            </h2>
            <div className="space-y-2">
              {historial.map((h, i) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 py-2.5 px-3 rounded-xl text-xs animate-fade-in"
                  style={{
                    background: i === 0 ? 'rgba(28, 18, 10, 0.6)' : 'transparent',
                    border: i === 0 ? '1px solid rgba(255, 233, 214, 0.08)' : '1px solid transparent',
                  }}
                >
                  <span className="text-base flex-shrink-0">{h.won ? '🏆' : '❌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium leading-relaxed"
                         style={{ color: h.won ? 'var(--gold-bright)' : 'var(--cream)', opacity: h.won ? 1 : 0.85 }}>
                      {h.msg}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--cream)', opacity: 0.45 }}>
                      {h.ts.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="h-8" />

        {/* ── FOOTER — SORTEAR AHORA + SALA + iconos enviar/editar ── */}
        <footer className="mt-6 mb-4 px-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {TESTING_MODE && (
                <button
                  onClick={handleSorteo}
                  disabled={isAnimating}
                  className="px-5 py-2.5 rounded-full font-black text-sm transition-all hover:scale-105"
                  style={{
                    background: 'var(--coral)',
                    color: 'white',
                    opacity: isAnimating ? 0.5 : 1,
                    cursor: isAnimating ? 'not-allowed' : 'pointer',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(255, 107, 74, 0.4)',
                  }}
                >
                  ▶ SORTEAR AHORA
                </button>
              )}
              <button
                onClick={handleNuevoSorteo}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-sm transition-all hover:scale-105"
                style={{
                  background: 'var(--coral)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(255, 107, 74, 0.4)',
                }}
              >
                <span style={{ fontSize: '14px' }}>📺</span>
                <span>SALA: NTQ4MD</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-base transition-transform hover:scale-110"
                style={{
                  background: 'var(--coral)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255, 107, 74, 0.4)',
                }}
                title="Enviar mensaje al chat"
              >
                ✈
              </button>
              <button
                className="w-10 h-10 rounded-full flex items-center justify-center text-base transition-transform hover:scale-110"
                style={{
                  background: 'var(--coral)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(255, 107, 74, 0.4)',
                }}
                title="Editar"
              >
                ✎
              </button>
            </div>
          </div>
        </footer>
      </main>
      </div>
    </div>
  );
}