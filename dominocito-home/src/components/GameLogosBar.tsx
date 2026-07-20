import { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface GameLink {
  to: string;
  label: string;
  logo: string;
  active: 'exact' | 'prefix';
}

const GAMES: GameLink[] = [
  { to: '/pinta-y-gana',     label: 'Pinta y Gana',    logo: '/assets/logos/pinta-y-gana.png',   active: 'exact' },
  { to: '/domino',           label: 'Dominó Clásico',  logo: '/assets/logos/domino-clasico.png', active: 'prefix' },
  { to: '/loteria',          label: 'Lotería',         logo: '/assets/logos/loteria.png',        active: 'exact' },
];

export default function GameLogosBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const u = localStorage.getItem('dc_username');
    setUsername(u);
    const token = localStorage.getItem('dc_access_token');
    if (token && u) {
      fetch('/api/wallet/balance', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.balance_eur != null) setBalance(d.balance_eur); })
        .catch(() => {});
    } else {
      setBalance(null);
    }
    const onStorage = () => setUsername(localStorage.getItem('dc_username'));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname]);

  // Cerrar el menú al hacer click fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const isActive = (g: GameLink) =>
    g.active === 'exact' ? pathname === g.to : pathname.startsWith(g.to);

  const openAuth = (mode: 'login' | 'register') => {
    const returnTo = encodeURIComponent(pathname + window.location.search);
    navigate(`/login?mode=${mode}&returnTo=${returnTo}`);
  };

  const logout = () => {
    localStorage.removeItem('dc_access_token');
    localStorage.removeItem('dc_refresh_token');
    localStorage.removeItem('dc_username');
    localStorage.removeItem('dc_user_id');
    setUsername(null);
    window.dispatchEvent(new CustomEvent('dc:logout'));
  };

  return (
    <nav
      aria-label="Juegos"
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
      {/* Logo (izquierda) */}
      <Link to="/" className="flex items-center gap-2 pl-3 pr-2">
        <img
          src="/assets/logo-dominocito.webp"
          alt="Dominócito"
          style={{ height: 44, width: 'auto', maxWidth: 200 }}
        />
      </Link>

      {/* Center links — logos de juegos */}
      <div className="hidden md:flex items-center gap-10 flex-1 justify-center">
        {GAMES.map((g) => {
          const active = isActive(g);
          return (
            <Link
              key={g.to}
              to={g.to}
              className={`opacity-${active ? '100' : '80'} hover:opacity-100 transition`}
              aria-label={g.label}
              aria-current={active ? 'page' : undefined}
            >
              <img
                src={g.logo}
                alt={g.label}
                style={{
                  height: 36,
                  width: 'auto',
                  maxWidth: 130,
                  filter: active ? 'drop-shadow(0 0 8px rgba(255,107,74,0.5))' : 'none',
                }}
              />
            </Link>
          );
        })}
      </div>

      {/* Right CTA */}
      <div className="flex items-center gap-2 pr-3">
        {username ? (
          <>
            {balance != null && (
              <span
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(255,230,200,0.08)', color: '#FAE6C8' }}
              >
                🪙 €{balance}
              </span>
            )}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="px-4 py-2 text-sm font-semibold text-white rounded-full flex items-center gap-1"
                style={{
                  background: 'linear-gradient(to right, #FF7B54, #F0623A)',
                  boxShadow: '0 8px 18px -6px rgba(255,104,74,0.5)',
                }}
              >
                👤 {username}
                <span style={{ fontSize: 10, opacity: 0.85 }}>{menuOpen ? '▴' : '▾'}</span>
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-44 rounded-2xl overflow-hidden shadow-2xl"
                  style={{
                    background: 'rgba(26, 20, 16, 0.97)',
                    border: '1px solid rgba(255,230,200,0.08)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Link
                    to="/wallet"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-[#E5DDD5] hover:bg-white/5"
                  >
                    💰 Wallet
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2.5 text-sm text-[#E5DDD5] hover:bg-white/5"
                  >
                    👤 Mi perfil
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full text-left px-4 py-2.5 text-sm text-[#E5DDD5] hover:bg-white/5 border-t border-white/5"
                  >
                    ↪ Salir
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => openAuth('login')}
              className="hidden sm:inline px-4 py-2 text-sm text-[#E5DDD5] hover:text-[#FAE6C8] transition cursor-pointer"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => openAuth('register')}
              className="px-5 py-2 text-sm font-semibold text-white rounded-full cursor-pointer"
              style={{
                background: 'linear-gradient(to right, #FF7B54, #F0623A)',
                boxShadow: '0 8px 18px -6px rgba(255,104,74,0.5)',
              }}
            >
              Regístrate
            </button>
          </>
        )}
      </div>
    </nav>
  );
}