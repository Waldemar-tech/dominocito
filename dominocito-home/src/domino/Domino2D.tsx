// Domino2D.tsx — Render 2D del dominó (reemplaza a Devil33)
// Arreglo 1: orientación correcta de fichas en mesa (flip según la punta que conecta)
// Arreglo 2: elegir extremo tocando la mitad de tu ficha (estilo Devil33)
// Interfaz: onPlay(tile, side) / onPass() — igual que Domino33

import { useEffect, useRef, useState, useCallback } from 'react';

type Tile = [number, number];
const HIDDEN_A = -1;

interface PlayedTile { tile: Tile; userId: number; side: 'left' | 'right'; order: number; }
interface PlayerState {
  userId: number; username: string; position: number;
  team: 0 | 1 | null; hand: Tile[]; connected: boolean;
}
interface GameState {
  status: string; currentTurn: number;
  leftEnd: number | null; rightEnd: number | null;
  players: PlayerState[]; board: PlayedTile[];
  scores?: Record<number, number>;
}

const MESAS: Record<string, string> = {
  club:    '/mesas/mesa-club.jpg',
  clasica: '/mesas/mesa-clasica.jpg',
  playa:   '/mesas/mesa-playa.jpg',
  abuela:  '/mesas/mesa-abuela.jpg',
  oficina: '/mesas/mesa-oficina.jpg',
};

const TEAMS: Record<number, { nombre: string; color: string }> = {
  0: { nombre: 'Azul', color: '#4a90d9' },
  1: { nombre: 'Rojo', color: '#e06a45' },
};

type Rect = { x: number; y: number; w: number; h: number };

const FIELTRO_DEFAULT: Rect = { x: 0.21, y: 0.21, w: 0.58, h: 0.58 };
const FIELTRO: Record<string, Rect> = {
  // club: { x: .., y: .., w: .., h: .. },
};

type SeqItem = { tile: Tile; doble: boolean; leftVal: number; rightVal: number; salida?: boolean };
type Placed  = { cx: number; cy: number; horiz: boolean; flip: boolean; tile: Tile };

const ROW_GAP = 12, TILE_GAP = 4;

function unitForFelt(b: Rect): number {
  const byW = ((b.w / 7) - TILE_GAP) / 2;
  const byH = ((b.h / 4) - ROW_GAP) / 2;
  return Math.max(13, Math.min(24, Math.floor(Math.min(byW, byH))));
}

function layoutSerpentine(seq: SeqItem[], b: Rect) {
  const U = unitForFelt(b), LONG = 2 * U, SHORT = U, rowPitch = LONG + ROW_GAP;
  const minX = b.x, maxX = b.x + b.w, cxc = b.x + b.w / 2, cyc = b.y + b.h / 2;

  let p = seq.findIndex(s => s.salida);
  if (p < 0) p = seq.findIndex(s => s.doble && s.tile[0] === 6);
  if (p < 0) p = Math.floor(seq.length / 2);

  const pv = seq[p];
  const pivot: Placed = pv.doble
    ? { cx: cxc, cy: cyc, horiz: false, flip: false, tile: pv.tile }
    : { cx: cxc, cy: cyc, horiz: true, flip: pv.leftVal < pv.rightVal, tile: pv.tile };
  const pHalf = (pv.doble ? SHORT : LONG) / 2;

  const arm = (items: SeqItem[], inKey: 'left' | 'right',
    startEdge: number, startDir: number, vSign: number): Placed[] => {
    const out: Placed[] = [];
    let dir = startDir, y = cyc, edge = startEdge;
    for (const it of items) {
      const inc  = inKey === 'left' ? it.leftVal  : it.rightVal;
      const outg = inKey === 'left' ? it.rightVal : it.leftVal;
      const foot = it.doble ? SHORT : LONG;
      const proj = edge + dir * (foot + TILE_GAP);
      const overflow = dir > 0 ? proj > maxX : proj < minX;
      if (overflow) {
        const ccx = dir > 0
          ? Math.min(edge + SHORT / 2, maxX - SHORT / 2)
          : Math.max(edge - SHORT / 2, minX + SHORT / 2);
        const flip = it.doble ? false : (vSign > 0 ? inc > outg : outg > inc);
        out.push({ cx: ccx, cy: y + vSign * rowPitch / 2, horiz: false, flip, tile: it.tile });
        y += vSign * rowPitch; dir = -dir; edge = ccx + dir * (SHORT / 2 + TILE_GAP);
        continue;
      }
      if (it.doble) {
        const cx = edge + dir * (SHORT / 2);
        out.push({ cx, cy: y, horiz: false, flip: false, tile: it.tile });
        edge = cx + dir * (SHORT / 2 + TILE_GAP);
      } else {
        const cx = edge + dir * (LONG / 2);
        const sl = dir > 0 ? inc : outg, sr = dir > 0 ? outg : inc;
        out.push({ cx, cy: y, horiz: true, flip: sl < sr, tile: it.tile });
        edge = cx + dir * (LONG / 2 + TILE_GAP);
      }
    }
    return out;
  };

  const right = arm(seq.slice(p + 1), 'left',  cxc + pHalf + TILE_GAP, +1, +1);
  const left  = arm(seq.slice(0, p).reverse(), 'right', cxc - pHalf - TILE_GAP, -1, -1);
  const tiles = [...left.reverse(), pivot, ...right];

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    const hw = (t.horiz ? LONG : SHORT) / 2, hh = (t.horiz ? SHORT : LONG) / 2;
    x0 = Math.min(x0, t.cx - hw); x1 = Math.max(x1, t.cx + hw);
    y0 = Math.min(y0, t.cy - hh); y1 = Math.max(y1, t.cy + hh);
  }
  let scale = 1;
  if (x1 - x0 > b.w || y1 - y0 > b.h)
    scale = Math.min(b.w / (x1 - x0), b.h / (y1 - y0));
  return { tiles, unit: U, scale, cx0: (x0 + x1) / 2, cy0: (y0 + y1) / 2 };
}

function fichaSrc(set: string, a: number, b: number) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return `/fichas/${set}/${lo}-${hi}.webp`;
}
function dorsoSrc(set: string) { return `/fichas/${set}/dorso.webp`; }

interface HitBox { x: number; y: number; w: number; h: number; tile: Tile; ty: number; th: number; }

interface Props {
  gameState: GameState;
  myUserId: number;
  onPlay: (tile: Tile, side: 'left' | 'right') => void;
  onPass: () => void;
  mesa?: string;
  setFichas?: string;
}

export default function Domino2D({
  gameState, myUserId, onPlay, onPass,
  mesa = 'club', setFichas = 'dibujito',
}: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [choice, setChoice] = useState<{ tile: Tile } | null>(null);
  const imgCache   = useRef<Map<string, HTMLImageElement>>(new Map());
  const hitBoxes   = useRef<HitBox[]>([]);
  const hoverIdx   = useRef<number>(-1);
  const hoverHalf  = useRef<'top' | 'bottom' | null>(null);
  const stateRef   = useRef<GameState>(gameState);
  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  const getImg = useCallback((src: string, onLoad?: () => void): HTMLImageElement => {
    let img = imgCache.current.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => { onLoad?.(); };
      img.src = src;
      imgCache.current.set(src, img);
    }
    return img;
  }, []);

  const ladosValidos = useCallback((tile: Tile): ('left' | 'right')[] => {
    const state = stateRef.current;
    if (!state) return [];
    const { leftEnd, rightEnd } = state;
    if (leftEnd === null && rightEnd === null) return ['right'];
    const s: ('left' | 'right')[] = [];
    if (leftEnd  !== null && (tile[0] === leftEnd  || tile[1] === leftEnd))  s.push('left');
    if (rightEnd !== null && (tile[0] === rightEnd || tile[1] === rightEnd)) s.push('right');
    return s;
  }, []);

  function buildOrientedSeq(board: PlayedTile[]) {
    const brd = [...board].sort((a, b) => a.order - b.order);
    const seq: SeqItem[] = [];
    let lEnd: number | null = null, rEnd: number | null = null;
    brd.forEach((e, i) => {
      const [t0, t1] = e.tile;
      const doble = t0 === t1;
      if (i === 0) {
        seq.push({ tile: e.tile, doble, leftVal: t0, rightVal: t1, salida: true });
        lEnd = t0; rEnd = t1; return;
      }
      if (e.side === 'right') {
        const match = t0 === rEnd, inner = match ? t0 : t1, outer = match ? t1 : t0;
        seq.push({ tile: e.tile, doble, leftVal: inner, rightVal: outer }); rEnd = outer;
      } else {
        const match = t0 === lEnd, inner = match ? t0 : t1, outer = match ? t1 : t0;
        seq.unshift({ tile: e.tile, doble, leftVal: outer, rightVal: inner }); lEnd = outer;
      }
    });
    return seq;
  }

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    const state = stateRef.current;
    if (!cv || !state) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    hitBoxes.current = [];

    const mesaImg = getImg(MESAS[mesa] || MESAS.club, draw);
    if (mesaImg.complete && mesaImg.naturalWidth) ctx.drawImage(mesaImg, 0, 0, W, H);
    else { ctx.fillStyle = '#2A5C45'; ctx.fillRect(0, 0, W, H); }

    const me = state.players.find(p => p.userId === myUserId);
    if (!me) return;

    const posVisual: Record<number, number> = {};
    posVisual[me.position] = 0;
    let v = 1;
    for (let off = 1; off < 4; off++) posVisual[(me.position + off) % 4] = v++;

    drawBoard(ctx, W, H, state);
    for (const p of state.players) drawHand(ctx, W, H, p, posVisual[p.position] ?? p.position, state);
    drawScores(ctx, W, H, state);
  }, [gameState, mesa, setFichas, myUserId, getImg]);

  function drawTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, long: number, corto: number,
    horiz: boolean, val: Tile,
    hl = false, flip = false, hlHalf: 'top' | 'bottom' | null = null
  ) {
    const oculta = val[0] === HIDDEN_A;
    const src = oculta ? dorsoSrc(setFichas) : fichaSrc(setFichas, val[0], val[1]);
    const img = getImg(src, draw);
    const w = horiz ? long : corto, h = horiz ? corto : long;
    if (hl) { ctx.save(); ctx.shadowColor = '#FF6B4A'; ctx.shadowBlur = 12; }
    if (img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      if (horiz) ctx.rotate(Math.PI / 2);
      if (flip) ctx.scale(1, -1);
      if (horiz) ctx.drawImage(img, -h / 2, -w / 2, h, w);
      else       ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = oculta ? '#3A2418' : '#F4E6C8';
      roundRect(ctx, x, y, w, h, 6); ctx.fill();
    }
    if (hlHalf && !horiz) {
      const yy = hlHalf === 'top' ? y : y + h / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(255,107,74,0.38)';
      roundRect(ctx, x, yy, w, h / 2, 6); ctx.fill();
      ctx.restore();
    }
    if (hl) ctx.restore();
  }

  function drawBoard(ctx: CanvasRenderingContext2D, W: number, H: number, state: GameState) {
    const seq = buildOrientedSeq(state.board);
    if (seq.length === 0) return;

    const fr = FIELTRO[mesa] ?? FIELTRO_DEFAULT;
    const bounds: Rect = { x: fr.x * W, y: fr.y * H, w: fr.w * W, h: fr.h * H };
    // (debug fieltro) — descomentar SOLO para recalibrar el rect del fieltro:
    // ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
    // ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h); ctx.restore();

    const { tiles, unit, scale, cx0, cy0 } = layoutSerpentine(seq, bounds);
    const L = 2 * unit, C = unit;

    ctx.save();
    if (scale < 1) {
      ctx.translate(cx0, cy0); ctx.scale(scale, scale); ctx.translate(-cx0, -cy0);
    }
    for (const t of tiles) {
      if (t.horiz) drawTile(ctx, t.cx - L / 2, t.cy - C / 2, L, C, true,  t.tile, false, t.flip);
      else         drawTile(ctx, t.cx - C / 2, t.cy - L / 2, L, C, false, t.tile, false, t.flip);
    }
    ctx.restore();
  }

  function drawHand(
    ctx: CanvasRenderingContext2D, W: number, H: number,
    p: PlayerState, vp: number, state: GameState
  ) {
    const esViewer = vp === 0;
    const n = p.hand.length;
    const esMiTurno = state.currentTurn === p.position;

    if (esViewer) {
      const fw = 50, fh = 96, gap = 10;
      const tot = n * (fw + gap) - gap;
      const hx = (W - tot) / 2, hy = H - fh - 24;
      p.hand.forEach((t, i) => {
        const x = hx + i * (fw + gap);
        const hover = hoverIdx.current === i;
        const jugable = esMiTurno && ladosValidos(t).length > 0;
        const media = hover ? hoverHalf.current : null;
        drawTile(ctx, x, hover ? hy - 8 : hy, fh, fw, false, t, jugable, false, media);
        hitBoxes.current.push({ x: x - 4, y: hy - 12, w: fw + 8, h: fh + 16, tile: t, ty: hy, th: fh });
      });
      chip(ctx, p.username + ' (tú)', W / 2, H - 8, esMiTurno, p.team);
    } else if (vp === 1) {
      const dw = 20, dh = 40, dg = 5;
      const ty = (H - (n * (dh + dg) - dg)) / 2, rx = W - dw - 44;
      p.hand.forEach((_, i) => drawTile(ctx, rx, ty + i * (dh + dg), dh, dw, false, [HIDDEN_A, HIDDEN_A]));
      chip(ctx, p.username, W - 62, 78, esMiTurno, p.team);
    } else if (vp === 2) {
      const uw = 40, uh = 20, ug = 5;
      const tot = n * (uw + ug) - ug, ux = (W - tot) / 2;
      p.hand.forEach((_, i) => drawTile(ctx, ux + i * (uw + ug), 44, uw, uh, true, [HIDDEN_A, HIDDEN_A]));
      chip(ctx, p.username, W / 2, 28, esMiTurno, p.team);
    } else {
      const dw = 20, dh = 40, dg = 5;
      const ty = (H - (n * (dh + dg) - dg)) / 2, lx = 44;
      p.hand.forEach((_, i) => drawTile(ctx, lx, ty + i * (dh + dg), dh, dw, false, [HIDDEN_A, HIDDEN_A]));
      chip(ctx, p.username, 62, 78, esMiTurno, p.team);
    }
  }

  function drawScores(ctx: CanvasRenderingContext2D, W: number, H: number, state: GameState) {
    if (!state.scores) return;
    const s0 = state.scores[0] ?? 0, s1 = state.scores[1] ?? 0;
    ctx.font = '500 13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    roundRect(ctx, 24, H / 2 - 28, 70, 56, 8);
    ctx.fillStyle = 'rgba(13,8,5,0.72)'; ctx.fill();
    ctx.fillStyle = TEAMS[0].color; ctx.fillText(TEAMS[0].nombre + ' ' + s0, 34, H / 2 - 11);
    ctx.fillStyle = TEAMS[1].color; ctx.fillText(TEAMS[1].nombre + ' ' + s1, 34, H / 2 + 12);
  }

  function chip(
    ctx: CanvasRenderingContext2D, txt: string, x: number, y: number,
    turno: boolean, eq: number | null
  ) {
    ctx.font = '500 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 26;
    ctx.save(); if (turno) { ctx.shadowColor = '#FF6B4A'; ctx.shadowBlur = 12; }
    roundRect(ctx, x - w / 2, y - 11, w, 22, 11);
    ctx.fillStyle = turno ? '#FF6B4A' : 'rgba(42,24,16,0.9)'; ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#F4E6C8'; ctx.fillText(txt, x, y);
    ctx.beginPath(); ctx.arc(x - w / 2 + 9, y, 3.5, 0, 7);
    ctx.fillStyle = eq === 0 ? TEAMS[0].color : TEAMS[1].color; ctx.fill();
  }

  useEffect(() => { draw(); }, [draw]);

  function coordsFromEvent(e: MouseEvent | TouchEvent): { cx: number; cy: number } | null {
    const cv = canvasRef.current; if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      clientX = t.clientX; clientY = t.clientY;
    } else { clientX = e.clientX; clientY = e.clientY; }
    return { cx: (clientX - rect.left) * scaleX, cy: (clientY - rect.top) * scaleY };
  }

  function emitir(tile: Tile, side: 'left' | 'right') {
    onPlay(tile, side);
    setChoice(null);
    hoverIdx.current = -1; hoverHalf.current = null;
  }

  function halfOf(hb: HitBox, cy: number): 'top' | 'bottom' {
    return cy < hb.ty + hb.th / 2 ? 'top' : 'bottom';
  }

  function jugarFicha(tile: Tile, tappedNumber: number) {
    const state = stateRef.current;
    if (!state) return;
    const me = state.players.find(p => p.userId === myUserId);
    if (!me || state.currentTurn !== me.position) return;

    const lados = ladosValidos(tile);
    if (lados.length === 0) return;
    if (lados.length === 1) return emitir(tile, lados[0]);

    const { leftEnd, rightEnd } = state;
    if (leftEnd !== rightEnd) {
      let side: 'left' | 'right' | null =
        leftEnd  === tappedNumber ? 'left'  :
        rightEnd === tappedNumber ? 'right' : null;
      if (!side) {
        const otro = tile[0] === tappedNumber ? tile[1] : tile[0];
        side = leftEnd === otro ? 'left' : rightEnd === otro ? 'right' : null;
      }
      if (side) return emitir(tile, side);
      return;
    }
    setChoice({ tile });
  }

  function onPointer(clientEv: React.MouseEvent | React.TouchEvent) {
    const c = coordsFromEvent(clientEv.nativeEvent as any);
    if (!c) return;
    for (const hb of hitBoxes.current) {
      if (c.cx >= hb.x && c.cx <= hb.x + hb.w && c.cy >= hb.y && c.cy <= hb.y + hb.h) {
        const half = halfOf(hb, c.cy);
        const tappedNumber = half === 'top' ? hb.tile[0] : hb.tile[1];
        jugarFicha(hb.tile, tappedNumber);
        return;
      }
    }
  }

  function onMove(e: React.MouseEvent) {
    const c = coordsFromEvent(e.nativeEvent);
    if (!c) return;
    let idx = -1; let half: 'top' | 'bottom' | null = null;
    hitBoxes.current.forEach((hb, i) => {
      if (c.cx >= hb.x && c.cx <= hb.x + hb.w && c.cy >= hb.y && c.cy <= hb.y + hb.h) {
        idx = i; half = halfOf(hb, c.cy);
      }
    });
    if (idx >= 0) {
      const tile = hitBoxes.current[idx].tile;
      const state = stateRef.current;
      const dobleExtremo = ladosValidos(tile).length === 2 && state?.leftEnd !== state?.rightEnd;
      if (!dobleExtremo) half = null;
    }
    if (idx !== hoverIdx.current || half !== hoverHalf.current) {
      hoverIdx.current = idx; hoverHalf.current = half; draw();
    }
  }

  const state = gameState;
  const me = state?.players.find(p => p.userId === myUserId);
  const esMiTurno = me && state?.currentTurn === me.position;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 600, margin: '0 auto' }}>
      <canvas ref={canvasRef} width={640} height={640}
        onClick={onPointer} onTouchStart={onPointer} onMouseMove={onMove}
        style={{ width: '100%', display: 'block', borderRadius: 16,
          touchAction: 'manipulation', cursor: 'pointer' }} />

      {esMiTurno && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <button onClick={onPass}
            style={{ padding: '8px 20px', borderRadius: 10, fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
              color: '#fff', cursor: 'pointer' }}>
            Pasar turno
          </button>
        </div>
      )}

      {choice && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 16, background: 'rgba(0,0,0,.45)', borderRadius: 16 }}>
          <button onClick={() => emitir(choice.tile, 'left')}
            style={{ padding: '12px 20px', borderRadius: 10, fontWeight: 600,
              border: 'none', cursor: 'pointer' }}>
            ◀ Izquierda
          </button>
          <button onClick={() => emitir(choice.tile, 'right')}
            style={{ padding: '12px 20px', borderRadius: 10, fontWeight: 600,
              border: 'none', cursor: 'pointer' }}>
            Derecha ▶
          </button>
        </div>
      )}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
