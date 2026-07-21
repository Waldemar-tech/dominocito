// Domino2D.tsx — Render 2D del dominó
// Recibe la misma interfaz que Domino33: gameState, myUserId, onPlay, onPass
// Fichas: /fichas/dibujito/{lo}-{hi}.webp + dorso.webp
// Mesas:  /mesas/mesa-{nombre}.webp

import { useEffect, useRef, useCallback } from 'react'

type Tile = [number, number]
const HIDDEN: Tile = [-1, -1]

interface GameState {
  roomId: number
  status: string
  players: any[]
  currentTurn: number
  board: any[]
  leftEnd: number | null
  rightEnd: number | null
  passesInRow: number
  winnerPosition: number | null
  winType: string | null
  scores: Record<number, number>
  moveCount: number
}

interface HitBox {
  x: number; y: number; w: number; h: number; tile: Tile
}

interface Props {
  gameState: GameState
  myUserId: number
  onPlay: (tile: Tile, side: 'left' | 'right') => void
  onPass: () => void
  mesa?: string
  setFichas?: string
}

function fichaSrc(set: string, a: number, b: number) {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  return `/fichas/${set}/${lo}-${hi}.webp`
}
function dorsoSrc(set: string) { return `/fichas/${set}/dorso.webp` }
function mesaSrc(mesa: string) { return `/mesas/mesa-${mesa}.jpg` }

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export default function Domino2D({
  gameState,
  myUserId,
  onPlay,
  onPass,
  mesa = 'club',
  setFichas = 'dibujito',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const hitBoxes = useRef<HitBox[]>([])
  const hoverIdx = useRef<number>(-1)
  const stateRef = useRef<GameState>(gameState)

  // Mantener ref actualizada para callbacks
  useEffect(() => { stateRef.current = gameState }, [gameState])

  // ── Cache de imágenes ─────────────────────────────────────────────
  const getImg = useCallback((src: string, onLoad?: () => void): HTMLImageElement => {
    let img = imgCache.current.get(src)
    if (!img) {
      img = new Image()
      img.onload = () => { onLoad?.() }
      img.src = src
      imgCache.current.set(src, img)
    }
    return img
  }, [])

  // ── Dibujo principal ──────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const state = stateRef.current
    const W = cv.width, H = cv.height
    ctx.clearRect(0, 0, W, H)
    hitBoxes.current = []

    // Fondo mesa
    const mesaImg = getImg(mesaSrc(mesa), draw)
    if (mesaImg.complete && mesaImg.naturalWidth > 0) {
      ctx.drawImage(mesaImg, 0, 0, W, H)
    } else {
      ctx.fillStyle = '#2A5C45'
      ctx.fillRect(0, 0, W, H)
    }

    if (!state) return

    const me = state.players.find((p: any) => p.userId === myUserId)
    if (!me) return

    // Mapear posiciones server → visual (yo siempre = visual 0 = abajo)
    const posVisual: Record<number, number> = {}
    posVisual[me.position] = 0
    let v = 1
    for (let off = 1; off < 4; off++) {
      posVisual[(me.position + off) % 4] = v++
    }

    // Tablero central
    drawBoard(ctx, W, H, state)

    // Manos de cada jugador
    for (const p of state.players) {
      const vp = posVisual[p.position] ?? p.position
      drawHand(ctx, W, H, p, vp, state)
    }

    // Scores
    if (state.scores) drawScores(ctx, W, H, state)

  }, [gameState, mesa, setFichas, myUserId, getImg])

  // ── Tablero ───────────────────────────────────────────────────────
  function drawBoard(ctx: CanvasRenderingContext2D, W: number, H: number, state: GameState) {
    const brd = [...state.board].sort((a: any, b: any) => a.order - b.order)
    if (brd.length === 0) return

    const LONG = 50, CORTO = 26, GAP = 3

    // Construir secuencia izq→der
    const seq: { tile: Tile; doble: boolean; side: string }[] = []
    for (const e of brd) {
      const doble = e.tile[0] === e.tile[1]
      if (e.side === 'left') seq.unshift({ tile: e.tile, doble, side: e.side })
      else seq.push({ tile: e.tile, doble, side: e.side })
    }

    // Calcular ancho total
    let totW = 0
    for (const s of seq) totW += (s.doble ? CORTO : LONG) + GAP
    totW -= GAP

    // Si no cabe, escalar
    const maxW = W - 40
    const scale = totW > maxW ? maxW / totW : 1
    const L = LONG * scale, C = CORTO * scale, G = GAP * scale

    let x = (W - totW * scale) / 2
    const cy = H / 2

    for (const s of seq) {
      const w = s.doble ? C : L
      const h = s.doble ? L : C
      drawTile(ctx, x, cy - h / 2, w, h, !s.doble, s.tile)
      x += w + G
    }
  }

  // ── Manos ─────────────────────────────────────────────────────────
  function drawHand(
    ctx: CanvasRenderingContext2D, W: number, H: number,
    p: any, vp: number, state: GameState
  ) {
    const esMiTurno = state.currentTurn === p.position
    const esViewer = vp === 0
    const hand: Tile[] = p.hand || []
    const n = hand.length

    if (n === 0) return

    const name = p.username || `J${p.position + 1}`

    if (esViewer) {
      // ABAJO — fichas grandes clickeables
      const FW = 48, FH = 90, GAP = 8
      const tot = n * (FW + GAP) - GAP
      const startX = (W - tot) / 2
      const baseY = H - FH - 30

      hand.forEach((t: Tile, i: number) => {
        const x = startX + i * (FW + GAP)
        const hover = hoverIdx.current === i
        const y = hover ? baseY - 10 : baseY
        drawTile(ctx, x, y, FW, FH, false, t, esMiTurno)
        hitBoxes.current.push({ x: x - 4, y: baseY - 14, w: FW + 8, h: FH + 18, tile: t })
      })
      chip(ctx, name + ' (tú)', W / 2, H - 12, esMiTurno, p.team)

    } else if (vp === 1) {
      // DERECHA — dorsos verticales
      const DW = 18, DH = 36, DG = 4
      const totH = n * (DH + DG) - DG
      const startY = (H - totH) / 2
      const rx = W - DW - 20
      hand.forEach((_: Tile, i: number) => {
        drawTile(ctx, rx, startY + i * (DH + DG), DW, DH, false, HIDDEN)
      })
      chip(ctx, name, W - DW - 36, 24, esMiTurno, p.team)

    } else if (vp === 2) {
      // ARRIBA — dorsos horizontales
      const UW = 36, UH = 18, UG = 4
      const totW = n * (UW + UG) - UG
      const startX = (W - totW) / 2
      hand.forEach((_: Tile, i: number) => {
        drawTile(ctx, startX + i * (UW + UG), 20, UW, UH, true, HIDDEN)
      })
      chip(ctx, name, W / 2, 10, esMiTurno, p.team)

    } else {
      // IZQUIERDA — dorsos verticales
      const DW = 18, DH = 36, DG = 4
      const totH = n * (DH + DG) - DG
      const startY = (H - totH) / 2
      hand.forEach((_: Tile, i: number) => {
        drawTile(ctx, 20, startY + i * (DH + DG), DW, DH, false, HIDDEN)
      })
      chip(ctx, name, DW + 36, 24, esMiTurno, p.team)
    }
  }

  // ── Dibujar una ficha ─────────────────────────────────────────────
  function drawTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    horiz: boolean, val: Tile, highlight = false
  ) {
    const oculta = val[0] === -1
    const src = oculta ? dorsoSrc(setFichas) : fichaSrc(setFichas, val[0], val[1])
    const img = getImg(src, draw)

    if (highlight) {
      ctx.save()
      ctx.shadowColor = '#FF6B4A'
      ctx.shadowBlur = 14
    }

    if (img.complete && img.naturalWidth > 0) {
      if (horiz) {
        // Imagen vertical rotada 90° para fichas horizontales
        ctx.save()
        ctx.translate(x + w / 2, y + h / 2)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(img, -h / 2, -w / 2, h, w)
        ctx.restore()
      } else {
        ctx.drawImage(img, x, y, w, h)
      }
    } else {
      // Placeholder mientras carga
      ctx.fillStyle = oculta ? '#3A2418' : '#F4E6C8'
      roundRect(ctx, x, y, w, h, 5)
      ctx.fill()
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    if (highlight) ctx.restore()
  }

  // ── Scores ────────────────────────────────────────────────────────
  function drawScores(ctx: CanvasRenderingContext2D, W: number, H: number, state: GameState) {
    const s0 = state.scores[0] ?? 0
    const s1 = state.scores[1] ?? 0
    const bx = 16, by = H / 2 - 30, bw = 72, bh = 60
    roundRect(ctx, bx, by, bw, bh, 8)
    ctx.fillStyle = 'rgba(13,8,5,0.78)'
    ctx.fill()
    ctx.font = '500 12px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#4a90d9'
    ctx.fillText('Rojo  ' + s0, bx + 10, by + 18)
    ctx.fillStyle = '#e06a45'
    ctx.fillText('Azul  ' + s1, bx + 10, by + 42)
  }

  // ── Chip de nombre ────────────────────────────────────────────────
  function chip(
    ctx: CanvasRenderingContext2D,
    txt: string, x: number, y: number,
    turno: boolean, team: number | null
  ) {
    ctx.font = '500 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(txt).width + 24
    ctx.save()
    if (turno) { ctx.shadowColor = '#FF6B4A'; ctx.shadowBlur = 12 }
    roundRect(ctx, x - tw / 2, y - 10, tw, 20, 10)
    ctx.fillStyle = turno ? '#FF6B4A' : 'rgba(30,20,12,0.88)'
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#F4E6C8'
    ctx.fillText(txt, x, y)
    // Dot de equipo
    const dotX = x - tw / 2 + 8
    ctx.beginPath()
    ctx.arc(dotX, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = team === 0 ? '#4a90d9' : team === 1 ? '#e06a45' : '#888'
    ctx.fill()
  }

  // ── Redibujar cuando cambia el estado ────────────────────────────
  useEffect(() => { draw() }, [draw])

  // ── Interacción ───────────────────────────────────────────────────
  function getCoordsFromEvent(e: React.MouseEvent | React.TouchEvent): { cx: number; cy: number } | null {
    const cv = canvasRef.current
    if (!cv) return null
    const rect = cv.getBoundingClientRect()
    const scaleX = cv.width / rect.width
    const scaleY = cv.height / rect.height
    let clientX: number, clientY: number
    if ('touches' in e.nativeEvent) {
      const t = (e.nativeEvent as TouchEvent).touches[0] || (e.nativeEvent as TouchEvent).changedTouches[0]
      clientX = t.clientX; clientY = t.clientY
    } else {
      clientX = (e.nativeEvent as MouseEvent).clientX
      clientY = (e.nativeEvent as MouseEvent).clientY
    }
    return { cx: (clientX - rect.left) * scaleX, cy: (clientY - rect.top) * scaleY }
  }

  function handleClick(e: React.MouseEvent | React.TouchEvent) {
    const c = getCoordsFromEvent(e)
    if (!c) return
    const state = stateRef.current
    const me = state.players.find((p: any) => p.userId === myUserId)
    if (!me || state.currentTurn !== me.position) return // no es mi turno

    for (const hb of hitBoxes.current) {
      if (c.cx >= hb.x && c.cx <= hb.x + hb.w && c.cy >= hb.y && c.cy <= hb.y + hb.h) {
        const tile = hb.tile
        const { leftEnd, rightEnd } = state

        let side: 'left' | 'right' | null = null
        if (leftEnd === null && rightEnd === null) {
          side = 'right' // primera ficha
        } else if (leftEnd !== null && (tile[0] === leftEnd || tile[1] === leftEnd)) {
          side = 'left'
        } else if (rightEnd !== null && (tile[0] === rightEnd || tile[1] === rightEnd)) {
          side = 'right'
        }
        // Si encaja en ambos lados, preferir izquierda
        if (leftEnd !== null && rightEnd !== null &&
          (tile[0] === leftEnd || tile[1] === leftEnd) &&
          (tile[0] === rightEnd || tile[1] === rightEnd)) {
          side = 'left'
        }

        if (side) onPlay(tile, side)
        return
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const c = getCoordsFromEvent(e)
    if (!c) return
    let idx = -1
    hitBoxes.current.forEach((hb, i) => {
      if (c.cx >= hb.x && c.cx <= hb.x + hb.w && c.cy >= hb.y && c.cy <= hb.y + hb.h) idx = i
    })
    if (idx !== hoverIdx.current) {
      hoverIdx.current = idx
      draw()
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={640}
        height={640}
        onClick={handleClick}
        onTouchStart={handleClick}
        onMouseMove={handleMouseMove}
        style={{
          width: '100%',
          maxWidth: 560,
          display: 'block',
          borderRadius: 16,
          touchAction: 'manipulation',
          cursor: 'pointer',
        }}
      />
      {/* Botón pasar turno */}
      {(() => {
        const me = gameState.players.find((p: any) => p.userId === myUserId)
        const esMiTurno = me && gameState.currentTurn === me.position
        if (!esMiTurno) return null
        return (
          <button
            onClick={onPass}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-sm font-medium transition"
          >
            Pasar turno
          </button>
        )
      })()}
    </div>
  )
}
