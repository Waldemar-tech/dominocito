import { useEffect, useState } from 'react'

// ── Tipos del payload de domino:hand_finished ────────────────────────────────
type Tile = [number, number]
export interface RevealedHand {
  position: number
  username: string
  team: number | null
  hand: Tile[]
  pips: number
}
export interface RoundEndData {
  winningTeam: number | null
  losingTeam: number | null
  pointsAwarded: number
  winType?: string
  score: Record<number, number>
  targetScore?: number | null
  revealedHands: RevealedHand[]
  teamTotals: Record<number, number>
  matchStatus: string
}
interface PlayerLite {
  user_id: number
  username: string
  display_name?: string
  position: number
  team: number | null
}
interface Props {
  data: RoundEndData
  players: PlayerLite[]
  myUserId: number | null
  ready: number[]
  expected: number[]
  timeoutMs: number
  setFichas: string
  onReady: () => void
}

const TEAMS: Record<number, { nombre: string; color: string }> = {
  0: { nombre: 'Azul', color: '#4a90d9' },
  1: { nombre: 'Rojo', color: '#e06a45' },
}
const fichaSrc = (set: string, a: number, b: number) =>
  `/fichas/${set}/${Math.min(a, b)}-${Math.max(a, b)}.webp`
// avatar placeholder determinista por posición (hasta que el back guarde el elegido)
const avatarSrc = (position: number) =>
  `/assets/avatares/avatar-${String((position % 12) + 1).padStart(2, '0')}.png`

export default function RoundEndModal({
  data, players, myUserId, ready, expected, timeoutMs, setFichas, onReady,
}: Props) {
  const [secs, setSecs] = useState(Math.round(timeoutMs / 1000))
  const iAmReady = myUserId != null && ready.includes(myUserId)

  useEffect(() => {
    setSecs(Math.round(timeoutMs / 1000))
    const t = setInterval(() => setSecs(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [timeoutMs])

  // Agrupar jugadores por equipo; ganador arriba (resaltado).
  const winner = data.winningTeam
  const teamsOrder: number[] =
    winner === 0 || winner === 1 ? [winner, winner === 0 ? 1 : 0] : [0, 1]
  const byTeam = (team: number) => players.filter(p => p.team === team)
  const pipsOf = (position: number) =>
    data.revealedHands.find(r => r.position === position)?.pips ?? 0
  const handOf = (position: number) =>
    data.revealedHands.find(r => r.position === position)?.hand ?? []

  const subtitle =
    winner != null
      ? `Ganó el equipo ${TEAMS[winner].nombre} · +${data.pointsAwarded} puntos`
      : `${data.pointsAwarded} puntos`

  return (
    <div style={S.backdrop}>
      <div style={S.modal}>
        <h2 style={S.h2}>¡Ganaron la Ronda!</h2>
        <div style={S.sub}>{subtitle}</div>

        {/* cabecera de columnas */}
        <div style={{ ...S.card, paddingBottom: 0 }}>
          <div style={S.head}>
            <span>Jugador</span>
            <span style={{ textAlign: 'center' }}>Mano</span>
            <span>Total</span>
          </div>
        </div>

        {/* un card por equipo */}
        {teamsOrder.map(team => {
          const isWinner = team === winner
          return (
            <div
              key={team}
              style={{
                ...S.card,
                boxShadow: isWinner ? `0 0 0 2px ${TEAMS[team].color}` : 'none',
              }}
            >
              <div style={S.teamRow}>
                <div>
                  {byTeam(team).map((p, i) => (
                    <div
                      key={p.user_id}
                      style={{ ...S.prow, borderTop: i ? '1px solid #4a3826' : 'none' }}
                    >
                      <span style={S.who}>
                        <img src={avatarSrc(p.position)} style={S.av} alt="" />
                        <span>{p.display_name || p.username}</span>
                      </span>
                      <span style={S.mano}>{pipsOf(p.position)}</span>
                      <span style={S.tiles}>
                        {handOf(p.position).map((t, k) => (
                          <img
                            key={k}
                            src={fichaSrc(setFichas, t[0], t[1])}
                            style={S.tile}
                            alt=""
                          />
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={S.total}>
                  <div style={S.totalN}>
                    {String(data.teamTotals?.[team] ?? 0).padStart(2, '0')}
                  </div>
                  <div style={S.totalU}>Puntos</div>
                </div>
              </div>
            </div>
          )
        })}

        {/* ready-check: checks por jugador */}
        <div style={S.ready}>
          {players.map(p => {
            const isReady = ready.includes(p.user_id)
            const isMe = p.user_id === myUserId
            return (
              <span
                key={p.user_id}
                style={{
                  ...S.rchip,
                  ...(isReady ? S.rchipOk : isMe ? S.rchipWait : {}),
                }}
              >
                {(p.display_name || p.username).split(' ')[0]} {isReady ? '✓' : isMe ? '…' : ''}
              </span>
            )
          })}
        </div>

        <button
          style={{ ...S.next, opacity: iAmReady ? 0.7 : 1, cursor: iAmReady ? 'default' : 'pointer' }}
          disabled={iAmReady}
          onClick={onReady}
        >
          {iAmReady
            ? `Listo ✓ — esperando (${secs}s)`
            : 'Próxima Ronda'}
        </button>
      </div>
    </div>
  )
}

// estilos inline (portable, sin depender de Tailwind)
const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(15,9,5,.75)',
    backdropFilter: 'blur(7px)', display: 'grid', placeItems: 'center',
    zIndex: 200, padding: 20,
  },
  modal: {
    background: '#f3e7cc', color: '#2c1d12', borderRadius: 22, padding: 26,
    width: '100%', maxWidth: 440, boxShadow: '0 30px 80px rgba(0,0,0,.6)',
    textAlign: 'center', fontFamily: "'Nunito Sans', system-ui, sans-serif",
  },
  h2: { fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: 30, margin: 0 },
  sub: { color: '#6a5540', fontSize: 14, margin: '4px 0 18px' },
  card: { background: '#2f2013', borderRadius: 14, padding: '6px 14px', textAlign: 'left', marginBottom: 14 },
  head: {
    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
    color: '#c9b596', fontSize: 11, padding: '8px 4px 6px',
  },
  teamRow: { display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 14 },
  prow: {
    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
    alignItems: 'center', color: '#f3e7cc', padding: '8px 0',
  },
  who: { display: 'flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14 },
  av: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f3e7cc' },
  mano: { fontSize: 20, fontWeight: 800, textAlign: 'right' },
  tiles: { display: 'flex', gap: 2 },
  tile: { height: 28 },
  total: { textAlign: 'center', paddingLeft: 14, borderLeft: '1px solid #4a3826' },
  totalN: { fontFamily: "'Playfair Display', Georgia, serif", fontSize: 34, fontWeight: 800, lineHeight: 1, color: '#f3e7cc' },
  totalU: { fontSize: 12, color: '#c9b596', fontWeight: 700 },
  ready: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', margin: '2px 0 14px', fontSize: 12 },
  rchip: { background: '#efe2c4', color: '#6a5540', borderRadius: 999, padding: '5px 10px', fontWeight: 700 },
  rchipOk: { background: '#5bbd6a', color: '#fff' },
  rchipWait: { background: '#f0d9a8', color: '#8a6a2a' },
  next: {
    background: '#ef6a52', color: '#fff', border: 'none', borderRadius: 999,
    padding: 14, width: '100%', fontWeight: 800, fontSize: 15, marginTop: 6,
  },
}
