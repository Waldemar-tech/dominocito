import type { Domino } from '../engine/dominoes';

export type DominoTheme = 'ivory' | 'wood';
export type DominoVariant = 'svg' | 'image';

// Mapeo id -> nombre de archivo PNG (orden id = orden de las 28 fichas generadas)
export function dominoToImagePath(d: Domino): string {
  return `/assets/tiles/tile_${d.id.toString().padStart(2, '0')}_${d.high}-${d.low}.png`;
}

// Pip positions as percentages (para variant=svg)
const DOT_POSITIONS: Record<number, [number, number][]> = {
  0: [],
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 22], [70, 22], [30, 50], [70, 50], [30, 78], [70, 78]],
};

function PipHalf({ value, theme }: { value: number; theme: DominoTheme }) {
  const isIvory = theme === 'ivory';
  const pipFill = isIvory ? '#2B1810' : '#F4E6C8';
  const pipShadow = isIvory ? 'rgba(43, 24, 16, 0.4)' : 'rgba(0, 0, 0, 0.5)';
  const bgFill = isIvory ? '#F5E6D3' : '#8B4513';

  return (
    <svg viewBox="0 0 100 100" style={{ display: 'block', width: '100%', height: '100%' }} preserveAspectRatio="none">
      <rect x="0" y="0" width="100" height="100" fill={bgFill} />
      {DOT_POSITIONS[value]?.map(([cx, cy], i) => (
        <g key={i}>
          <ellipse cx={cx} cy={cy + 2} rx="11" ry="10" fill={pipShadow} />
          <ellipse cx={cx} cy={cy} rx="10.5" ry="9.5" fill={pipFill} />
        </g>
      ))}
    </svg>
  );
}

interface Props {
  domino: Domino;
  selected: boolean;
  multiplier?: 50 | 100 | null;
  isWinner?: boolean;
  betAmount?: number;
  onClick: () => void;
  disabled?: boolean;
  theme: DominoTheme;
  variant?: DominoVariant;
  /** Highlight visual cuando la animación sortear pasa por esta ficha */
  isAnimHighlight?: boolean;
  /** Tipo de highlight de animación (x50 = naranja, x100 = rojo, winner = dorado) */
  animHighlightKind?: 'x50' | 'x100' | 'winner' | null;
}

export default function DominoTile({
  domino,
  selected,
  multiplier,
  isWinner,
  betAmount,
  onClick,
  disabled,
  theme,
  variant = 'image',
  isAnimHighlight = false,
  animHighlightKind = null,
}: Props) {
  const isIvory = theme === 'ivory';
  const isImage = variant === 'image';

  let outerGlow: string | undefined = undefined;
  let additionalClass = '';
  // Si la ficha es ganadora o tiene multiplicador, NO atenuar aunque esté disabled.
  // (Cuando status === 'revealed' todas las fichas se marcan disabled para evitar re-click,
  //  pero ganadora/×50/×100 deben verse brillantes.)
  const keepVisible = !!isWinner || !!multiplier || isAnimHighlight;

  if (isWinner) {
    outerGlow = '0 0 0 3px #F4C76B, 0 0 36px 8px rgba(244, 199, 107, 0.85), 0 0 0 6px rgba(244, 199, 107, 0.25)';
    additionalClass = 'animate-bounce';
  } else if (multiplier === 100) {
    outerGlow = '0 0 0 3px #ef4444, 0 0 28px 6px rgba(239, 68, 68, 0.75), 0 0 0 6px rgba(239, 68, 68, 0.2)';
    additionalClass = 'animate-fire';
  } else if (multiplier === 50) {
    outerGlow = '0 0 0 3px #f97316, 0 0 24px 5px rgba(249, 115, 22, 0.7), 0 0 0 6px rgba(249, 115, 22, 0.18)';
    additionalClass = 'animate-fire';
  } else if (isAnimHighlight && animHighlightKind === 'x100') {
    outerGlow = '0 0 0 3px #ef4444, 0 0 28px 6px rgba(239, 68, 68, 0.85), 0 0 0 6px rgba(239, 68, 68, 0.25)';
    additionalClass = 'animate-anim-highlight-x100';
  } else if (isAnimHighlight && animHighlightKind === 'x50') {
    outerGlow = '0 0 0 3px #f97316, 0 0 24px 5px rgba(249, 115, 22, 0.85), 0 0 0 6px rgba(249, 115, 22, 0.22)';
    additionalClass = 'animate-anim-highlight-x50';
  } else if (isAnimHighlight && animHighlightKind === 'winner') {
    outerGlow = '0 0 0 3px #F4C76B, 0 0 32px 8px rgba(244, 199, 107, 0.9), 0 0 0 6px rgba(244, 199, 107, 0.3)';
    additionalClass = 'animate-anim-highlight-winner';
  } else if (selected) {
    outerGlow = '0 0 0 3px #FF6B4A, 0 0 20px 4px rgba(255, 107, 74, 0.6)';
    additionalClass = 'animate-domino-select';
  }

  // Background piece — solo para variant svg (image usa el png directamente)
  const bgPiece = isIvory
    ? 'linear-gradient(160deg, #FAF1DE, #E8DBC0)'
    : 'linear-gradient(160deg, #7A4520, #4A2610)';

  const tileSize = 56;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={domino.label}
      className={`relative flex flex-col items-center justify-center transition-all duration-200 ${additionalClass} ${keepVisible ? '' : 'disabled:opacity-30'} disabled:cursor-not-allowed`}
      style={{
        background: isImage ? 'transparent' : bgPiece,
        border: 'none',
        borderRadius: '8px',
        padding: '4px',
        boxShadow: outerGlow
          ? outerGlow
          : isImage
          ? '2px 3px 8px rgba(0,0,0,0.45)'
          : isIvory
          ? '2px 3px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255, 250, 240, 0.6)'
          : '2px 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255, 233, 214, 0.1)',
        width: `${tileSize}px`,
        minWidth: `${tileSize}px`,
        height: `${tileSize * 1.7}px`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: isAnimHighlight
          ? 'scale(1.18) translateY(-6px)'
          : selected
          ? 'scale(1.08) translateY(-3px)'
          : undefined,
        overflow: 'visible',
      }}
      onMouseEnter={e => {
        if (!disabled && !selected && !isAnimHighlight) {
          e.currentTarget.style.transform = 'scale(1.06) translateY(-3px)';
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !selected && !isAnimHighlight) {
          e.currentTarget.style.transform = '';
        }
      }}
    >
      {/* Badge multiplicador */}
      {multiplier && (
        <span
          className="absolute -top-2 -right-2 text-[10px] font-black px-1.5 py-0.5 rounded-full z-20 leading-none"
          style={{
            background: multiplier === 100 ? '#dc2626' : '#f97316',
            color: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        >
          ×{multiplier}
        </span>
      )}

      {/* Estrella ganador */}
      {isWinner && (
        <span
          className="absolute -top-2 -left-2 text-sm z-20 leading-none font-black"
          style={{ color: '#F4C76B', textShadow: '0 0 10px rgba(244, 199, 107, 0.9)' }}
        >
          ★
        </span>
      )}

      {isImage ? (
        // Variant: image (PNG) — usa la ficha renderizada
        <img
          src={dominoToImagePath(domino)}
          alt={domino.label}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      ) : (
        // Variant: svg (fallback)
        <>
          <div style={{ width: '100%', flex: 1, minHeight: 0 }}>
            <PipHalf value={domino.high} theme={theme} />
          </div>
          <div
            style={{
              width: '92%',
              height: '3px',
              background: 'rgba(58, 36, 24, 0.6)',
              borderRadius: '1px',
              margin: '2px 0',
              flexShrink: 0,
            }}
          />
          <div className="rotate-180" style={{ width: '100%', flex: 1, minHeight: 0 }}>
            <PipHalf value={domino.low} theme={theme} />
          </div>
        </>
      )}

      {/* Badge monto apostado */}
      {betAmount && betAmount > 0 && (
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap z-20"
          style={{
            background: '#FF6B4A',
            color: 'white',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          }}
        >
          ₡{(betAmount * 1000).toFixed(0)}
        </div>
      )}
    </button>
  );
}