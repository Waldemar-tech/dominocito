/**
 * Domino33.tsx — Wrapper React para Devil33 controlado por socket
 *
 * Responsabilidades:
 * 1. Montar iframe con `/devildrey33/index.html`
 * 2. Activar modo socket (`Domino.ActivarModoSocket()`)
 * 3. Cuando llega un gameState del socket → llamar `Domino.SyncState(state)`
 * 4. Cuando el usuario clickea una ficha en el iframe → capturar postMessage
 *    → propagar al padre vía callback `onPlay`
 * 5. Botón "Pasar" overlay cuando es mi turno
 */

import { useEffect, useRef, useState } from 'react'

interface PlayerPublic {
  userId: number
  username: string
  position: 0 | 1 | 2 | 3
  hand: Array<[number, number]>
  connected: boolean
}

interface BoardEntry {
  tile: [number, number]
  userId: number
  side: 'left' | 'right'
  order: number
}

interface GameStateSocket {
  roomId: number
  status: 'waiting' | 'playing' | 'finished' | 'abandoned'
  players: PlayerPublic[]
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
  gameState: GameStateSocket
  myUserId: number
  onPlay: (tile: [number, number], side: 'left' | 'right') => void
  onPass: () => void
}

export default function Domino33({ gameState, myUserId, onPlay, onPass }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lastBoardLenRef = useRef(0)
  const hasActivatedRef = useRef(false)

  // ─── Activar modo socket y aplicar gameState inicial ───
  useEffect(() => {
    if (!isReady) return
    const win = iframeRef.current?.contentWindow as any
    if (!win || !win.Domino) return

    if (!hasActivatedRef.current) {
      console.log('[Domino33] ActivarModoSocket...')
      win.Domino.ActivarModoSocket()
      hasActivatedRef.current = true
      // CRITICAL: ActivarModoSocket llama CrearFichas con setTimeout(..., 10ms)
      // Hay que esperar a que las 28 fichas existan antes de SyncState
      const waitForFichas = (attempts: number) => {
        const partida = win.Domino?.Partida
        if (partida && partida.Ficha && partida.Ficha.length === 28) {
          console.log('[Domino33] Fichas listas, SyncState inicial...')
          win.Domino.SyncState(gameState, Number(myUserId))
          lastBoardLenRef.current = gameState.board.length
        } else if (attempts > 0) {
          setTimeout(() => waitForFichas(attempts - 1), 20)
        } else {
          console.warn('[Domino33] Timeout esperando fichas, forzando SyncState')
          win.Domino.SyncState(gameState, Number(myUserId))
          lastBoardLenRef.current = gameState.board.length
        }
      }
      setTimeout(() => waitForFichas(10), 20)
      return
    }

    // SyncState incremental: solo si hay cambios
    if (gameState.board.length !== lastBoardLenRef.current) {
      win.Domino.SyncState(gameState, Number(myUserId))
      lastBoardLenRef.current = gameState.board.length
    } else {
      win.Domino.SyncState(gameState, Number(myUserId))
    }
  }, [isReady, gameState, myUserId])

  // ─── Polling: detectar cuando el iframe está listo ───
  // Devil33 registra un listener `load` que inicializa Escena/Camara.
  // Solo podemos llamar ActivarModoSocket DESPUÉS de ese load.
  useEffect(() => {
    let cancelled = false
    function check() {
      if (cancelled) return
      const iframe = iframeRef.current
      const win = iframe?.contentWindow as any
      if (!win || !win.Domino || !win.THREE) {
        setTimeout(check, 100)
        return
      }
      if (typeof win.Domino.ActivarModoSocket !== 'function') {
        setTimeout(check, 100)
        return
      }
      // Esperar a que el iframe haya disparado su evento 'load' (loadComplete === true)
      // y a que Escena esté inicializada.
      if (iframe && !iframe.dataset.loaded) {
        // Si el iframe YA terminó de cargar antes de que montáramos el listener, marcarlo inmediatamente
        // (contentDocument.readyState === 'complete' indica que el load ya disparó)
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
          console.log('[Domino33] iframe ya cargado, marcando loaded=true')
          iframe.dataset.loaded = 'true'
          setTimeout(() => { if (!cancelled) check() }, 200)
          return
        }
        // Si no, esperar al load event del iframe
        iframe.addEventListener('load', () => {
          console.log('[Domino33] iframe load event disparado')
          if (iframe) iframe.dataset.loaded = 'true'
          // Dar un tick más para que IniciarObjetoCanvas corra
          setTimeout(() => {
            if (!cancelled) check()
          }, 200)
        }, { once: true })
        return
      }
      // Verificar que Escena exista (solo se inicializa después del load event)
      if (!win.Domino.Escena) {
        setTimeout(check, 100)
        return
      }
      setIsReady(true)
    }
    const t = setTimeout(check, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  // ─── Escuchar postMessage del iframe (clicks en fichas) ───
  // onPlay via ref para que el listener no se destruya/re-cree en cada render
  const onPlayRef = useRef(onPlay)
  useEffect(() => { onPlayRef.current = onPlay })

  useEffect(() => {
    function handle(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data?.type === 'devil33:play') {
        // Dejar pasar siempre — el backend valida el turno.
        // Un bloqueo frontend causa race conditions cuando isMyTurn
        // aún no se actualizó en el ciclo de render pero ya es el turno real.
        onPlayRef.current(event.data.tile, event.data.side)
      }
    }
    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, []) // ← sin deps: listener estable toda la vida del componente

  // ─── Determinar si es mi turno (jugador local = posición 0 visual) ───
  const me = gameState.players.find((p) => p.userId === myUserId)
  const myPosition = me?.position ?? 0
  // isMyTurn: comparar currentTurn (posición del server) con la posición real del viewer
  const isMyTurn = gameState.currentTurn === myPosition && gameState.status === 'playing'
  // Verificar si tengo ficha jugable (si no, debo pasar)
  const leftEnd = gameState.leftEnd
  const rightEnd = gameState.rightEnd
  const hasPlayable = (me?.hand ?? []).some(([a, b]) => {
    if (leftEnd == null && rightEnd == null) return true
    return [a, b].some((v) => v === leftEnd || v === rightEnd)
  })
  const canPass = isMyTurn && !hasPlayable && (me?.hand.length ?? 0) > 0

  return (
    <div className="relative w-full" style={{ height: '80vh', background: '#000' }}>
      <iframe
        ref={iframeRef}
        src="/devildrey33/index.html"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#000' }}
        title="Devil33 Dominó 3D"
      />

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/90 text-red-200 p-4 rounded pointer-events-none">
          <div className="max-w-2xl pointer-events-auto">
            <div className="font-bold mb-2 text-xl">⚠️ Error cargando Devil33</div>
            <div className="text-sm font-mono whitespace-pre-wrap">{loadError}</div>
          </div>
        </div>
      )}

      {!isReady && !loadError && (
        <div className="absolute top-2 left-2 bg-black/80 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg z-50">
          ⏳ Cargando Devil33...
        </div>
      )}

      {isReady && (
        <div className="absolute top-2 right-2 bg-green-600/90 text-white text-xs px-3 py-1 rounded-full font-bold shadow-lg z-50 pointer-events-none">
          ✅ Devil33 listo
        </div>
      )}

      {/* Botón Pasar: solo cuando es mi turno y NO tengo fichas jugables */}
      {isMyTurn && canPass && (
        <button
          onClick={onPass}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl shadow-2xl text-lg"
        >
          ⏭️ Pasar turno
        </button>
      )}

      {/* Indicador de mi turno */}
      {isMyTurn && !canPass && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-yellow-400 text-emerald-950 font-bold rounded-xl shadow-2xl text-lg pointer-events-none animate-pulse">
          🎯 Tu turno — elegí una ficha
        </div>
      )}

      {/* Si NO es mi turno, mostrar a quién le toca */}
      {!isMyTurn && gameState.status === 'playing' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-white/10 text-white/80 rounded-lg text-sm pointer-events-none">
          Esperando a {gameState.players.find((p) => p.position === gameState.currentTurn)?.username ?? 'otro jugador'}...
        </div>
      )}

      {/* Game over */}
      {gameState.status === 'finished' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-center max-w-md">
            <div className="text-5xl mb-3">{gameState.winnerPosition === myPosition ? '🏆' : '🤝'}</div>
            <div className="text-2xl font-bold text-white mb-2">
              {gameState.winnerPosition === myPosition
                ? '¡Ganaste!'
                : gameState.winnerPosition != null
                ? `Ganó ${gameState.players.find((p) => p.position === gameState.winnerPosition)?.username ?? ''}`
                : 'Partida terminada'}
            </div>
            {gameState.winType === 'closed' && (
              <div className="text-white/60 text-sm">Por tranca (menos puntos en mano)</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}