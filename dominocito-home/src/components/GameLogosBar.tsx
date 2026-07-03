import { Link, useLocation } from 'react-router-dom';

interface GameLink {
  to: string;
  label: string;
  logo: string;
  active: 'exact' | 'prefix';
}

const GAMES: GameLink[] = [
  { to: '/domino',           label: 'Dominó',     logo: '/assets/logos/domino.svg',     active: 'prefix' },
  { to: '/pinta-y-gana',     label: 'Pinta y Gana', logo: '/assets/logos/pinta-y-gana.svg', active: 'exact' },
  { to: '/loteria',          label: 'Lotería',    logo: '/assets/logos/loteria.svg',    active: 'exact' },
];

interface Props {
  /** Si true, oculta el logo "home" central (útil en páginas internas) */
  hideHome?: boolean;
}

export default function GameLogosBar({ hideHome = false }: Props) {
  const { pathname } = useLocation();

  const isActive = (g: GameLink) =>
    g.active === 'exact' ? pathname === g.to : pathname.startsWith(g.to);

  return (
    <nav
      aria-label="Juegos"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg"
    >
      {!hideHome && (
        <Link
          to="/"
          aria-label="Inicio"
          className={`flex items-center justify-center w-10 h-10 rounded-xl transition ${
            pathname === '/' ? 'bg-white/15 ring-1 ring-white/30' : 'hover:bg-white/10'
          }`}
        >
          <span className="text-2xl">🁢</span>
        </Link>
      )}

      {GAMES.map((g) => {
        const active = isActive(g);
        return (
          <Link
            key={g.to}
            to={g.to}
            title={g.label}
            aria-label={g.label}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition ${
              active
                ? 'bg-white/15 ring-1 ring-white/30'
                : 'hover:bg-white/10 opacity-80 hover:opacity-100'
            }`}
          >
            <img
              src={g.logo}
              alt={g.label}
              className="w-8 h-8 rounded-md"
              loading="lazy"
            />
            <span className="hidden sm:inline text-sm font-semibold text-white/90">
              {g.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
