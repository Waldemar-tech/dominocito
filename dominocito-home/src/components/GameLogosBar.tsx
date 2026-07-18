import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

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
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const u = localStorage.getItem('dc_username');
    setUsername(u);
    const onStorage = () => setUsername(localStorage.getItem('dc_username'));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pathname]);

  const isActive = (g: GameLink) =>
    g.active === 'exact' ? pathname === g.to : pathname.startsWith(g.to);

  const openAuth = (mode: 'login' | 'register') => {
    window.dispatchEvent(new CustomEvent('dc:open-auth', { detail: { mode } }));
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
      <div className="flex items-center gap-2">
        {username ? (
          <>
            <span className="hidden sm:inline text-sm text-[#E5DDD5] pr-1">
              Hola, <span className="font-bold text-[#FAE6C8]">{username}</span>
            </span>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm bg-white/8 hover:bg-white/15 rounded-full transition border border-white/10"
            >
              Salir
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => openAuth('login')}
              className="hidden sm:inline px-4 py-2 text-sm text-[#E5DDD5] hover:text-[#FAE6C8] transition"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => openAuth('register')}
              className="px-5 py-2 text-sm font-semibold text-white rounded-full"
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