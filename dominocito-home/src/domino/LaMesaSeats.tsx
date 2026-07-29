/**
 * LaMesaSeats — capa DOM que se dibuja ENCIMA del canvas (Domino2D).
 * 4 píldoras de jugadores alrededor de la mesa:
 *   avatar (reborde de equipo) + contador de fichas (🁢 N) + nombre + puntos del equipo.
 *
 * Datos reales (verificados contra backend):
 *   - hand.length         → contador de fichas (getSafeState conserva la cantidad, oculta valores).
 *   - avatar              → roomInfo.players (Bloque A), cruzado por userId.
 *   - scores[team]        → puntos por EQUIPO (parejas: compañeros muestran lo mismo).
 *   - currentTurn === pos → glow de turno.
 *
 * Posiciones visuales: el viewer (yo) SIEMPRE abajo; los demás 1,2,3 en horario.
 *   vp 0 abajo (yo) · vp 1 derecha · vp 2 arriba · vp 3 izquierda.
 *
 * El contenedor padre debe ser position:relative y cuadrado (la "arena").
 * TODO estilo va inline (no depende de <style> ni CSS externo) para máxima robustez.
 */
import type { CSSProperties } from 'react'

interface PlayerState {
  userId: number
  username: string
  position: number
  team: 0 | 1 | null
  hand: unknown[]
  connected?: boolean
}
interface GameStateLite {
  currentTurn: number
  players: PlayerState[]
  scores?: Record<number, number>
}
interface RoomPlayer {
  user_id: number
  username: string
  avatar?: string | null
  team?: number | null
}
interface Props {
  gameState: GameStateLite
  roomPlayers: RoomPlayer[]
  myUserId: number
  /** Ajustables en vivo (localhost). Defaults = valores aprobados en la maqueta. */
  mesaInset?: number   // % que ocupa el margen de la mesa dentro de la arena (default 14)
  ring?: number        // % de separación de las píldoras rojas al borde (default 2)
  sideOffset?: number  // % de las píldoras azules (lados) al borde (default 6.5)
}

const TEAM_COLOR: Record<number, string> = { 0: '#3730b3', 1: '#b23a2d' } // 0 azul · 1 rojo
const PINATA = '#f5b800'

export default function LaMesaSeats({ gameState, roomPlayers, myUserId, mesaInset = 14, ring = 2, sideOffset = 6.5 }: Props) {
  const me = gameState.players.find(p => p.userId === myUserId)
  if (!me) return null

  const vpOf: Record<number, number> = {}
  vpOf[me.position] = 0
  let v = 1
  for (let off = 1; off < 4; off++) vpOf[(me.position + off) % 4] = v++

  const avatarOf = (userId: number) =>
    roomPlayers.find(rp => rp.user_id === userId)?.avatar || 'avatar-01'

  const scoreOf = (p: PlayerState) => {
    if (!gameState.scores) return 0
    if (p.team === 0 || p.team === 1) return gameState.scores[p.team] ?? 0
    return gameState.scores[p.position] ?? 0
  }

  const seatPos = (vp: number): CSSProperties => {
    if (vp === 0) return { left: '50%', top: `calc(100% - ${mesaInset}% + ${ring}%)`, transform: 'translateX(-50%)' }
    if (vp === 2) return { left: '50%', bottom: `calc(100% - ${mesaInset}% + ${ring}%)`, transform: 'translateX(-50%)' }
    if (vp === 1) return { top: '50%', right: `${sideOffset}%`, transform: 'translate(50%,-50%) rotate(90deg)' }
    return { top: '50%', left: `${sideOffset}%`, transform: 'translate(-50%,-50%) rotate(-90deg)' }
  }

  const seatBase: CSSProperties = { position: 'absolute', display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }
  const namepillStyle = (color: string, turn: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999,
    padding: '3px 15px 3px 3px', fontWeight: 800, fontSize: 12.5, color: '#fff', lineHeight: 1,
    background: color, boxShadow: turn ? `0 0 0 3px ${PINATA}, 0 4px 12px rgba(0,0,0,.45)` : '0 4px 12px rgba(0,0,0,.45)',
    whiteSpace: 'nowrap',
  })
  const avwrap: CSSProperties = { position: 'relative', flex: 'none', display: 'flex' }
  const avImg: CSSProperties = { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', display: 'block', background: '#1a1109' }
  const fichasStyle: CSSProperties = {
    position: 'absolute', bottom: -4, right: -6, background: '#1a1109', color: '#fff',
    border: '2px solid #fff', borderRadius: 999, fontSize: 9, fontWeight: 800, padding: '0 4px', whiteSpace: 'nowrap',
  }
  const ptsStyle = (color: string): CSSProperties => ({
    borderRadius: 999, padding: '5px 12px', fontWeight: 800, fontSize: 12.5, color: '#fff',
    background: color, boxShadow: '0 4px 12px rgba(0,0,0,.45)', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      {gameState.players.map(p => {
        const vp = vpOf[p.position] ?? p.position
        const color = TEAM_COLOR[(p.team ?? 1) as number]
        const isTurn = gameState.currentTurn === p.position
        const isMe = p.userId === myUserId
        const fichas = p.hand.length
        const pts = scoreOf(p)

        const namepill = (
          <div style={namepillStyle(color, isTurn)}>
            <span style={avwrap}>
              <img src={`/assets/avatares/${avatarOf(p.userId)}.png`} alt="" style={avImg} />
              <span style={fichasStyle}>🁢 {fichas}</span>
            </span>
            <span>{p.username}{isMe ? ' (vos)' : ''}</span>
          </div>
        )
        const ptspill = (
          <div style={ptsStyle(color)}><b style={{ fontSize: 15 }}>{String(pts).padStart(2, '0')}</b> Pt.</div>
        )

        return (
          <div key={p.userId} style={{ ...seatBase, ...seatPos(vp) }}>
            {ptspill}{namepill}
          </div>
        )
      })}
    </div>
  )
}
