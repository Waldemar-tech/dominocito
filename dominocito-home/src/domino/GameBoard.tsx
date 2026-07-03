import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion, LayoutGroup } from 'motion/react'
import { assetUrl } from '../utils/baseUrl'

const ASSETS = assetUrl('/assets/casino')
const TABLE_IMG = `${ASSETS}/domino-table-4trays.png`
const AMBIENT_BG = `${ASSETS}/casino-ambient-bg.png`
const TILES_DIR = `${ASSETS}/tiles`
const STACK_IMG = `${ASSETS}/domino-stack.png`
const AVATAR_FRAME = `${ASSETS}/avatar-frame.png`

function tileImage(tile: Tile): string {
  const [a, b] = tile
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  return `${TILES_DIR}/domino_${min}-${max}.png`
}

/** ID estable para una ficha: vive desde que se reparte hasta que sale del board. */
function tileId(tile: Tile, seed: number | string): string {
  return `tile-${tile[0]}-${tile[1]}-${seed}`
}

interface Tile {
  0: number
  1: number
}

interface PlayerState {
  userId: number
  username: string
  position: 0 | 1 | 2 | 3
  team: 0 | 1 | null
  hand: Tile[]
  connected: boolean
}

interface RoomInfo {
  id: number
  code: string
  host_user_id: number
  is_private: boolean
  max_players: number
  status: string
}

interface BoardEntry {
  tile: Tile
  userId: number
  side: 'left' | 'right'
  order: number
}

interface GameState {
  roomId: number
  status: 'waiting' | 'playing' | 'finished' | 'abandoned'
  players: PlayerState[]
  currentTurn: number
  board: BoardEntry[]
  leftEnd: number | null
  rightEnd: number | null
  passesInRow: number
  winnerPosition: number | null
  winType: 'domino' | 'closed' | null
  scores: Record<number, number>
  moveCount: number
}

interface Props {
  gameState: GameState
  roomInfo: RoomInfo
  myUserId: number
  onPlay: (tile: [number, number], side: 'left' | 'right') => void
  onPass: () => void
  onLeave: () => void
}

/* ───────── Springs / easings ───────── */

const SPRING_TILE = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.55 }
const SPRING_SELECT = { type: 'spring' as const, stiffness: 380, damping: 22 }
const EASE_OUT = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }

/* ───────── Helpers de layout (idénticos al original) ───────── */

interface PlacedTile {
  tile: Tile
  rotate: number
  col: number
  row: number
  entry: BoardEntry
}

function computeBoardLayout(board: BoardEntry[]): { placed: PlacedTile[]; cols: number; rows: number } {
  if (board.length === 0) return { placed: [], cols: 1, rows: 1 }

  const stepEvery = 7
  let dir = 0
  let col = 0
  let row = 0
  let minCol = 0, maxCol = 0, minRow = 0, maxRow = 0

  const placed: PlacedTile[] = []

  board.forEach((b, idx) => {
    const isDouble = b.tile[0] === b.tile[1]
    let rotate = 0
    if (isDouble) rotate = 90
    else if (b.side === 'left') rotate = 180

    placed.push({ tile: b.tile, rotate, col, row, entry: b })

    if (idx > 0 && idx % stepEvery === 0) dir = (dir + 1) % 4
    const dx = [1, 0, -1, 0][dir]
    const dy = [0, 1, 0, -1][dir]
    col += dx
    row += dy
    minCol = Math.min(minCol, col)
    maxCol = Math.max(maxCol, col)
    minRow = Math.min(minRow, row)
    maxRow = Math.max(maxRow, row)
  })

  const cols = maxCol - minCol + 1
  const rows = maxRow - minRow + 1
  const normalized = placed.map((p) => ({ ...p, col: p.col - minCol, row: p.row - minRow }))
  return { placed: normalized, cols, rows }
}

function handRotationFor(position: 0 | 1 | 2 | 3): number {
  switch (position) {
    case 0: return 0
    case 1: return 180
    case 2: return 90
    case 3: return 270
  }
}

/* ───────── Componentes visuales ───────── */

function TileReal({ tile, size = 56, rotate = 0 }: { tile: Tile; size?: number; rotate?: number }) {
  const w = size
  const h = size * (1120 / 620)
  return (
    <img
      src={tileImage(tile)}
      alt={`${tile[0]}-${tile[1]}`}
      style={{
        width: w,
        height: h,
        display: 'block',
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))',
        userSelect: 'none',
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        transition: 'transform 0.3s ease',
      }}
      draggable={false}
    />
  )
}

function CasinoAvatar({ username, isActive, size = 72 }: { username: string; isActive: boolean; size?: number }) {
  const initial = (username || '?').charAt(0).toUpperCase()
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0
  const palette = [
    ['#fde68a', '#f59e0b', '#92400e'],
    ['#fdba74', '#ea580c', '#7c2d12'],
    ['#fda4af', '#e11d48', '#881337'],
    ['#93c5fd', '#2563eb', '#1e3a8a'],
    ['#6ee7b7', '#059669', '#064e3b'],
    ['#d8b4fe', '#9333ea', '#581c87'],
  ]
  const [c1, c2, c3] = palette[Math.abs(hash) % palette.length]

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {isActive && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.08, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: -8,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #fde047 0%, transparent 70%)',
            filter: 'blur(10px)',
            zIndex: 0,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${AVATAR_FRAME})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: size * 0.13,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${c1} 0%, ${c2} 60%, ${c3} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: size * 0.45,
          fontWeight: 900,
          textShadow: `0 2px 4px rgba(0,0,0,0.7), 0 0 ${size * 0.1}px rgba(0,0,0,0.4)`,
          zIndex: 2,
          fontFamily: 'Cinzel, Georgia, serif',
        }}
      >
        {initial}
      </div>
      <span
        style={{
          position: 'absolute',
          bottom: size * 0.05,
          right: size * 0.05,
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #6ee7b7 0%, #059669 100%)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5)',
          border: `2px solid #064e3b`,
          zIndex: 3,
        }}
      />
    </div>
  )
}

function OpponentCard({ player, isActive }: { player: PlayerState; isActive: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <CasinoAvatar username={player.username} isActive={isActive} size={72} />
      <div
        style={{
          padding: '5px 14px',
          background: isActive
            ? 'linear-gradient(180deg, #3b82f6 0%, #1e40af 100%)'
            : 'linear-gradient(180deg, #2563eb 0%, #1e3a8a 100%)',
          color: 'white',
          fontSize: 12,
          fontWeight: 700,
          borderRadius: 4,
          boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          minWidth: 110,
          textAlign: 'center',
          fontFamily: 'Cinzel, Georgia, serif',
          letterSpacing: 0.5,
        }}
      >
        {player.username}
      </div>
      <div style={{ position: 'relative', width: 48, height: 56 }}>
        <img
          src={STACK_IMG}
          alt="mazo"
          style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.4))' }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#7c2d12',
            fontWeight: 900,
            fontSize: 18,
            textShadow: '0 1px 0 rgba(255,255,255,0.6)',
            fontFamily: 'Cinzel, Georgia, serif',
          }}
        >
          {player.hand?.length ?? '?'}
        </div>
      </div>
    </div>
  )
}

/** Renderiza una ficha ya colocada en el board con layoutId + thump si es doble. */
function BoardTile({
  entry,
  rotate,
  col,
  row,
  isLastPlayed,
  reducedMotion,
}: {
  entry: BoardEntry
  rotate: number
  col: number
  row: number
  isLastPlayed: boolean
  reducedMotion: boolean | null
}) {
  const id = tileId(entry.tile, entry.order)
  const isDouble = entry.tile[0] === entry.tile[1]

  return (
    <motion.div
      layoutId={id}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.6, rotate: rotate + (Math.random() < 0.5 ? -25 : 25) }}
      animate={{ opacity: 1, scale: 1, rotate }}
      transition={SPRING_TILE}
      style={{
        gridColumn: col + 1,
        gridRow: row + 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: isLastPlayed ? 6 : 4,
      }}
    >
      {isDouble && (
        <motion.div
          aria-hidden
          initial={{ scale: 1 }}
          animate={isLastPlayed ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: -6, borderRadius: 10, pointerEvents: 'none' }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 10,
              boxShadow: isLastPlayed
                ? '0 0 18px 4px rgba(251, 191, 36, 0.7), 0 0 32px 8px rgba(251, 191, 36, 0.35)'
                : '0 0 0 0 transparent',
              transition: 'box-shadow 0.4s ease-out',
            }}
          />
        </motion.div>
      )}
      <TileReal tile={entry.tile} size={44} rotate={rotate} />
    </motion.div>
  )
}

/** Marco pulsante en los dos extremos del board, indica dónde podés jugar. */
function EndHighlight({ label, show }: { label: string; show: boolean }) {
  if (!show) return null
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        ...(label === 'L' ? { left: 8 } : { right: 8 }),
        padding: '4px 10px',
        background: 'linear-gradient(135deg, #fde047 0%, #b45309 100%)',
        color: '#1f2937',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 900,
        boxShadow: '0 0 12px rgba(251,191,36,0.6)',
        fontFamily: 'Cinzel, Georgia, serif',
        letterSpacing: 1,
        pointerEvents: 'none',
        zIndex: 7,
      }}
    >
      {label === 'L' ? `◀ ${label}` : `${label} ▶`}
    </motion.div>
  )
}

/* ───────── Componente principal ───────── */

export default function GameBoard({ gameState, myUserId, onPlay, onPass, onLeave }: Props) {
  const me = gameState.players.find((p) => p.userId === myUserId)
  const isMyTurn = !!(me && gameState.currentTurn === me.position)
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(60)
  const reducedMotion = useReducedMotion()

  // Orden de la última ficha jugada (la que aparece en board con thump/highlight)
  const lastOrder = useMemo(() => {
    if (gameState.board.length === 0) return -1
    return Math.max(...gameState.board.map((b) => b.order))
  }, [gameState.board])

  useEffect(() => {
    setSecondsLeft(60)
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [gameState.currentTurn, gameState.status])

  // Limpiar selección cuando cambia el turno o la fase
  useEffect(() => {
    setSelectedTile(null)
  }, [gameState.currentTurn, gameState.status])

  function canPlayTile(t: Tile, side: 'left' | 'right'): boolean {
    if (!isMyTurn || !me) return false
    if (gameState.board.length === 0) return true
    const [a, b] = [t[0], t[1]]
    const end = side === 'left' ? gameState.leftEnd : gameState.rightEnd
    if (end === null) return false
    return a === end || b === end
  }

  function handleTileClick(t: Tile) {
    if (!isMyTurn) return
    if (selectedTile && selectedTile[0] === t[0] && selectedTile[1] === t[1]) {
      const canL = canPlayTile(t, 'left')
      const canR = canPlayTile(t, 'right')
      if (canL && canR && gameState.board.length > 0) return
      if (canL) onPlay(t, 'left')
      else if (canR) onPlay(t, 'right')
      setSelectedTile(null)
    } else {
      setSelectedTile(t)
    }
  }

  const boardLayout = useMemo(() => computeBoardLayout(gameState.board), [gameState.board])

  const allPlayers = [...gameState.players].sort((a, b) => a.position - b.position)
  const positions = {
    top: allPlayers[1],
    left: allPlayers[2],
    right: allPlayers[3],
    me,
  }
  const currentPlayer = gameState.players.find((p) => p.position === gameState.currentTurn)

  const sortedHand = me?.hand ? [...me.hand].sort((a, b) => b[0] + b[1] - (a[0] + a[1])) : []
  const totalPoints = sortedHand.reduce((s, t) => s + t[0] + t[1], 0)

  // IDs estables por ficha en mano: derivado de su posición en sortedHand + roomId
  // Cuando una ficha aparece en board, su order es único, por eso no chocan.
  const handIdFor = (idx: number) => `hand-${gameState.roomId}-${idx}-${sortedHand[idx][0]}-${sortedHand[idx][1]}`

  const myPos = me?.position ?? 0
  const handRotate = handRotationFor(myPos)
  const isVerticalHand = handRotate === 90 || handRotate === 270

  return (
    <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', paddingBottom: 220 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${AMBIENT_BG})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      <div style={{ position: 'relative', textAlign: 'center', padding: '20px 0 12px' }}>
        <h1
          className="casino-title"
          style={{
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: 6,
            margin: 0,
            background: 'linear-gradient(180deg, #fef9c3 0%, #fbbf24 40%, #92400e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.7)) drop-shadow(0 0 16px rgba(251,191,36,0.4))',
          }}
        >
          JUEGA EN LÍNEA
        </h1>
      </div>

      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', padding: '0 40px' }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/9',
            maxHeight: 580,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 16,
              boxShadow: '0 30px 60px rgba(0,0,0,0.7), 0 12px 24px rgba(0,0,0,0.5)',
            }}
          />
          <img
            src={TABLE_IMG}
            alt="mesa"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: 16,
              zIndex: 1,
            }}
          />

          {positions.top && (
            <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              <OpponentCard player={positions.top} isActive={currentPlayer?.userId === positions.top.userId} />
            </div>
          )}
          {positions.left && (
            <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
              <OpponentCard player={positions.left} isActive={currentPlayer?.userId === positions.left.userId} />
            </div>
          )}
          {positions.right && (
            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
              <OpponentCard player={positions.right} isActive={currentPlayer?.userId === positions.right.userId} />
            </div>
          )}

          {/* Centro: tablero con fichas */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 200px',
              zIndex: 5,
            }}
          >
            <div style={{ width: '100%', position: 'relative' }}>
              {/* Highlights de extremos cuando es mi turno y hay fichas */}
              {isMyTurn && gameState.board.length > 0 && (
                <>
                  <EndHighlight label="L" show={canPlayAny('left', sortedHand, gameState)} />
                  <EndHighlight label="R" show={canPlayAny('right', sortedHand, gameState)} />
                </>
              )}

              {gameState.board.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(254,243,199,0.6)' }}>
                  <div style={{ fontSize: 60, marginBottom: 8, opacity: 0.4 }}>🎲</div>
                  <div className="cinzel" style={{ fontSize: 13, fontWeight: 900, letterSpacing: 3 }}>
                    {isMyTurn ? 'JUGÁ LA PRIMERA FICHA' : `ESPERANDO A ${currentPlayer?.username || '...'}...`}
                  </div>
                </div>
              ) : (
                <LayoutGroup>
                  <motion.div
                    layout
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${boardLayout.cols}, 50px)`,
                      gridTemplateRows: `repeat(${boardLayout.rows}, ${44 * (1120 / 620) + 6}px)`,
                      gap: 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      maxWidth: '100%',
                      padding: '8px',
                      overflow: 'visible',
                    }}
                  >
                    <AnimatePresence initial={false}>
                      {boardLayout.placed.map((p) => (
                        <BoardTile
                          key={`b-${p.entry.order}`}
                          entry={p.entry}
                          rotate={p.rotate}
                          col={p.col}
                          row={p.row}
                          isLastPlayed={p.entry.order === lastOrder}
                          reducedMotion={reducedMotion}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </LayoutGroup>
              )}
            </div>
          </div>

          {/* Indicador de turno y timer */}
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 200,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              className="cinzel"
              style={{
                padding: '6px 14px',
                background: 'linear-gradient(180deg, #3b82f6 0%, #1e40af 100%)',
                color: 'white',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 700,
                boxShadow: '0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                letterSpacing: 1,
              }}
            >
              TURNO: {currentPlayer?.username || '...'}
            </div>
            {isMyTurn && gameState.status === 'playing' && (
              <motion.div
                key={secondsLeft}
                initial={reducedMotion ? false : { scale: 1.3 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="cinzel"
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 18,
                  fontWeight: 900,
                  background:
                    secondsLeft < 10
                      ? 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)'
                      : 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)',
                  color: 'white',
                  boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              >
                ⏱ {secondsLeft}s
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Botones flotantes derecha */}
      <div
        style={{
          position: 'fixed',
          right: 16,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          zIndex: 30,
        }}
      >
        {[
          { icon: '💬', title: 'Chat' },
          { icon: '🔊', title: 'Sonido' },
          { icon: '⚙', title: 'Ajustes' },
          { icon: '✕', title: 'Salir', danger: true, onClick: onLeave },
        ].map((b, i) => (
          <button
            key={i}
            onClick={b.onClick}
            title={b.title}
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: b.danger
                ? 'linear-gradient(180deg, #ef4444 0%, #991b1b 100%)'
                : 'linear-gradient(180deg, #3b82f6 0%, #1e40af 100%)',
              border: '2px solid rgba(255,255,255,0.4)',
              boxShadow:
                '0 4px 8px rgba(0,0,0,0.5), inset 0 2px 2px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.3)',
              color: 'white',
              fontSize: 22,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {b.icon}
          </button>
        ))}
      </div>

      {/* Scores flotante izquierda */}
      {Object.keys(gameState.scores).length > 0 && (
        <div
          className="cinzel"
          style={{
            position: 'fixed',
            left: 16,
            top: 110,
            zIndex: 30,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(20,20,20,0.85) 100%)',
            borderRadius: 8,
            padding: 12,
            minWidth: 150,
            border: '1px solid rgba(251,191,36,0.4)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              color: '#fbbf24',
              fontWeight: 900,
              marginBottom: 8,
              textAlign: 'center',
              fontSize: 13,
              letterSpacing: 2,
              borderBottom: '1px solid rgba(251,191,36,0.3)',
              paddingBottom: 6,
            }}
          >
            PUNTOS
          </div>
          {gameState.players.map((p) => (
            <div
              key={p.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#fef3c7' }}>{p.username}</span>
              <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: 14 }}>
                {gameState.scores[p.position] || 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mano abajo */}
      {me && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 25,
            paddingBottom: 20,
            paddingTop: 32,
            background:
              'linear-gradient(180deg, transparent 0%, rgba(2,6,23,0.9) 30%, rgba(2,6,23,1) 100%)',
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: '0 auto',
              padding: '0 40px',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <CasinoAvatar username={me.username} isActive={isMyTurn && gameState.status === 'playing'} size={96} />
              <div
                className="cinzel"
                style={{
                  padding: '6px 18px',
                  background: 'linear-gradient(180deg, #fde047 0%, #b45309 100%)',
                  color: '#1f2937',
                  fontWeight: 900,
                  fontSize: 14,
                  borderRadius: 4,
                  boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
                  textShadow: '0 1px 0 rgba(255,255,255,0.3)',
                  letterSpacing: 1,
                }}
              >
                {me.username} (TÚ)
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 92,
                  padding: '0 8px',
                  overflowX: me && (me.position === 2 || me.position === 3) ? 'visible' : 'auto',
                  overflowY: me && (me.position === 2 || me.position === 3) ? 'auto' : 'visible',
                  flexWrap: me && (me.position === 0 || me.position === 1) ? 'nowrap' : 'wrap',
                  flexDirection: me && (me.position === 2 || me.position === 3) ? 'column' : 'row',
                  maxHeight: me && (me.position === 2 || me.position === 3) ? 280 : undefined,
                }}
              >
                {sortedHand.length > 0 ? (
                  sortedHand.map((t, idx) => {
                    const sel = selectedTile && selectedTile[0] === t[0] && selectedTile[1] === t[1]
                    const playableL = canPlayTile(t, 'left')
                    const playableR = canPlayTile(t, 'right')
                    const playable = playableL || playableR
                    const dimmed = selectedTile && !sel
                    const id = handIdFor(idx)

                    return (
                      <motion.button
                        key={id}
                        layoutId={id}
                        layout="position"
                        onClick={() => handleTileClick(t)}
                        disabled={!isMyTurn || (!playable && gameState.board.length > 0)}
                        whileHover={isMyTurn && playable && !reducedMotion ? { y: -10 } : undefined}
                        whileTap={isMyTurn && playable && !reducedMotion ? { scale: 0.94 } : undefined}
                        animate={
                          reducedMotion
                            ? { rotate: handRotate }
                            : {
                                rotate: sel ? handRotate : handRotate,
                                y: sel ? -22 : 0,
                                scale: sel ? 1.1 : 1,
                              }
                        }
                        transition={sel ? SPRING_SELECT : SPRING_TILE}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: isMyTurn && (playable || gameState.board.length === 0) ? 'pointer' : 'default',
                          filter: !isMyTurn
                            ? 'brightness(0.6)'
                            : dimmed
                            ? 'brightness(0.35) saturate(0.5) blur(1px)'
                            : playable
                            ? 'brightness(1.15) drop-shadow(0 4px 8px rgba(251,191,36,0.5))'
                            : 'opacity(0.5)',
                          position: 'relative',
                          zIndex: sel ? 10 : 1,
                          marginBottom: isVerticalHand ? 4 : 0,
                          marginRight: !isVerticalHand ? 4 : 0,
                        }}
                      >
                        {sel && !reducedMotion && (
                          <motion.div
                            aria-hidden
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                              position: 'absolute',
                              inset: -6,
                              borderRadius: 8,
                              boxShadow: '0 0 16px 4px rgba(251,191,36,0.55)',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                        <TileReal tile={t} size={isVerticalHand ? 44 : 72} />
                      </motion.button>
                    )
                  })
                ) : (
                  <div style={{ color: 'rgba(254,243,199,0.4)', alignSelf: 'center', fontSize: 14 }}>
                    Sin fichas en mano
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
                <div className="cinzel" style={{ fontSize: 12, color: 'rgba(254,243,199,0.7)', fontWeight: 700 }}>
                  {sortedHand.length} FICHAS · {totalPoints} PTS
                  {gameState.status === 'playing' && !isMyTurn && (
                    <span style={{ marginLeft: 12, color: '#fbbf24' }}>⏳ ESPERANDO A {currentPlayer?.username}...</span>
                  )}
                  {isMyTurn && gameState.status === 'playing' && (
                    <span style={{ marginLeft: 12, color: '#34d399', textShadow: '0 0 8px rgba(52,211,153,0.5)' }}>
                      ¡ES TU TURNO!
                    </span>
                  )}
                </div>
                {isMyTurn && gameState.status === 'playing' && (
                  <button
                    onClick={onPass}
                    disabled={gameState.board.length === 0}
                    className="cinzel"
                    style={{
                      padding: '10px 22px',
                      background: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)',
                      color: '#1f2937',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 900,
                      border: '1px solid rgba(255,255,255,0.4)',
                      boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
                      cursor: gameState.board.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: gameState.board.length === 0 ? 0.4 : 1,
                      textShadow: '0 1px 0 rgba(255,255,255,0.3)',
                      letterSpacing: 1,
                    }}
                  >
                    PASAR →
                  </button>
                )}
              </div>

              <AnimatePresence>
                {selectedTile && isMyTurn && gameState.board.length > 0 && (
                  <motion.div
                    initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    transition={EASE_OUT}
                    style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '0 8px' }}
                  >
                    {canPlayTile(selectedTile, 'left') && (
                      <button
                        onClick={() => {
                          onPlay(selectedTile, 'left')
                          setSelectedTile(null)
                        }}
                        className="cinzel"
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(135deg, #fde047 0%, #ca8a04 100%)',
                          color: '#1f2937',
                          fontSize: 13,
                          fontWeight: 900,
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.4)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                          letterSpacing: 1,
                        }}
                      >
                        ◀ IZQ ({gameState.leftEnd})
                      </button>
                    )}
                    {canPlayTile(selectedTile, 'right') && (
                      <button
                        onClick={() => {
                          onPlay(selectedTile, 'right')
                          setSelectedTile(null)
                        }}
                        className="cinzel"
                        style={{
                          padding: '8px 16px',
                          background: 'linear-gradient(135deg, #fde047 0%, #ca8a04 100%)',
                          color: '#1f2937',
                          fontSize: 13,
                          fontWeight: 900,
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.4)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                          letterSpacing: 1,
                        }}
                      >
                        DER ({gameState.rightEnd}) ▶
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedTile(null)}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.2)',
                      }}
                    >
                      Cancelar
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

/** Helper: ¿hay alguna ficha en la mano que pueda jugarse en este extremo? */
function canPlayAny(side: 'left' | 'right', hand: Tile[], gs: GameState): boolean {
  if (hand.length === 0) return false
  const end = side === 'left' ? gs.leftEnd : gs.rightEnd
  if (end === null) return false
  return hand.some((t) => t[0] === end || t[1] === end)
}