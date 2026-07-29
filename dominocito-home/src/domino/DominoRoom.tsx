import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import WaitingRoom from './WaitingRoom'
import Domino33 from './three/Domino33'
import Domino2D from './Domino2D'
import LaMesaSeats from './LaMesaSeats'
import RoundEndModal, { RoundEndData } from './RoundEndModal'

interface Player {
  user_id: number
  username: string
  display_name?: string
  avatar?: string | null
  position: number
  team: number | null
  is_connected: boolean
}

interface RoomInfo {
  id: number
  code: string
  host_user_id: number
  host_username?: string
  is_private: boolean
  max_players: number
  status: string
  players: Player[]
  game_mode?: 'individual' | 'teams'
  team_mode?: 'manual' | 'choose' | 'random' | null
  target_score?: number | null
}

interface GameState {
  roomId: number
  status: 'waiting' | 'playing' | 'finished' | 'abandoned'
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

const API_URL = '/api'
const SOCKET_URL = '' // mismo host (vite proxy)

// DEMO MODE: gameState forzado para calibración visual de La Mesa
const DEMO = new URLSearchParams(location.search).get('demo') === '1'
const DEMO_STATE: GameState = {
  roomId: 999,
  status: 'playing',
  currentTurn: 1,
  leftEnd: 6,
  rightEnd: 5,
  passesInRow: 0,
  winnerPosition: null,
  winType: null,
  scores: { 0: 42, 1: 67 },
  moveCount: 10,
  players: [
    { userId: 1, username: 'cin2k', position: 0, team: 1, hand: [[5,6],[2,2],[0,3],[3,4],[1,2]], connected: true },
    { userId: 2, username: 'Raphiña55', position: 1, team: 0, hand: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]], connected: true },
    { userId: 3, username: 'iousu67', position: 2, team: 1, hand: [[0,0],[0,0],[0,0],[0,0],[0,0]], connected: true },
    { userId: 4, username: 'waldo30', position: 3, team: 0, hand: [[0,0],[0,0],[0,0]], connected: true },
  ],
  board: [
    { tile: [6, 6] as [number, number], userId: 3, side: 'right' as const, order: 0 },
    { tile: [6, 5] as [number, number], userId: 2, side: 'right' as const, order: 1 },
    { tile: [5, 4] as [number, number], userId: 1, side: 'right' as const, order: 2 },
    { tile: [4, 3] as [number, number], userId: 4, side: 'right' as const, order: 3 },
    { tile: [3, 2] as [number, number], userId: 3, side: 'right' as const, order: 4 },
    { tile: [2, 1] as [number, number], userId: 2, side: 'right' as const, order: 5 },
    { tile: [1, 0] as [number, number], userId: 1, side: 'right' as const, order: 6 },
    { tile: [0, 0] as [number, number], userId: 4, side: 'right' as const, order: 7 },
    { tile: [0, 5] as [number, number], userId: 3, side: 'right' as const, order: 8 },
    { tile: [5, 5] as [number, number], userId: 2, side: 'right' as const, order: 9 },
  ],
}

const DEMO_ROOM_INFO = {
  id: 999,
  code: 'DEMO',
  host_user_id: 1,
  host_username: 'cin2k',
  is_private: false,
  max_players: 4,
  status: 'playing',
  game_mode: 'teams' as const,
  team_mode: 'choose' as const,
  target_score: 100,
  players: [
    { user_id: 1, username: 'cin2k', avatar: 'avatar-06', position: 0, team: 1, is_connected: true },
    { user_id: 2, username: 'Raphiña55', avatar: 'avatar-05', position: 1, team: 0, is_connected: true },
    { user_id: 3, username: 'iousu67', avatar: 'avatar-10', position: 2, team: 1, is_connected: true },
    { user_id: 4, username: 'waldo30', avatar: 'avatar-01', position: 3, team: 0, is_connected: true },
  ],
}

export default function DominoRoom() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [myUserId, setMyUserId] = useState<number | null>(null)
  const [myUsername, setMyUsername] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [authDone, setAuthDone] = useState(false)
  const [roundEnd, setRoundEnd] = useState<RoundEndData | null>(null)
  const [readyInfo, setReadyInfo] = useState<{ ready: number[]; expected: number[]; timeoutMs: number } | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const toastIdRef = useRef(0)

  const pushToast = useCallback((text: string, ms = 3500) => {
    const id = ++toastIdRef.current
    setToast({ id, text })
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev))
    }, ms)
  }, [])

  // DEMO MODE: inicializar con estado de prueba para calibración
  useEffect(() => {
    if (DEMO) {
      setRoomInfo(DEMO_ROOM_INFO)
      setGameState(DEMO_STATE)
      setMyUserId(1)
      setMyUsername('cin2k')
      setAuthDone(true)
    }
  }, [])

  // Cargar roomInfo
  const loadRoomInfo = useCallback(async (): Promise<RoomInfo | null> => {
    const token = localStorage.getItem('dc_access_token')
    if (!token || !code) return null
    try {
      const res = await fetch(`${API_URL}/domino/rooms/${code}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        if (res.status === 404) {
          localStorage.removeItem('dc_current_room_code')
          setTimeout(() => navigate('/domino'), 1500)
        }
        return null
      }
      const info: RoomInfo = data.room
      setRoomInfo(info)
      setError(null)
      return info
    } catch (err: any) {
      setError('Sin conexión al servidor')
      return null
    }
  }, [code, navigate])

  // ─── Auth + cargar info de la sala ────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('dc_access_token')
    const userId = localStorage.getItem('dc_user_id')
    const username = localStorage.getItem('dc_username')

    if (!token || !userId || !username) {
      navigate('/login')
      return
    }
    setMyUserId(parseInt(userId, 10))
    setMyUsername(username)

    if (code) {
      localStorage.setItem('dc_current_room_code', code.toUpperCase())
    }

    loadRoomInfo()
  }, [code, navigate, loadRoomInfo])

  // ─── Socket ───────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('dc_access_token')
    if (!token || !code || DEMO) return  // DEMO: saltear socket

    const socket = io(SOCKET_URL || window.location.origin, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setSocketConnected(true)
      // CRÍTICO: enviar el token al back vía evento 'auth'
      socket.emit('auth', { token })
    })
    socket.on('disconnect', () => setSocketConnected(false))

    socket.on('auth:ok', () => {
      setAuthDone(true)
      // IMPORTANTE: emitir domino:join DESPUÉS de tener roomInfo
      const tryJoin = () => {
        if (roomInfoRef.current) {
          socket.emit('domino:join', { roomId: roomInfoRef.current.id })
        } else {
          setTimeout(tryJoin, 100)
        }
      }
      tryJoin()
    })

    socket.on('auth:error', (data: any) => {
      setError(`Auth error: ${data.error}`)
      localStorage.removeItem('dc_access_token')
      setTimeout(() => navigate('/login'), 1500)
    })

    socket.on('domino:state', (state: GameState) => {
      setGameState(state)
      setError(null)
      // Refrescar roomInfo para que muestre status='playing'
      loadRoomInfo()
    })

    socket.on('domino:started', () => pushToast('🎲 ¡La partida empezó!'))
    socket.on('domino:player_joined', () => loadRoomInfo())
    socket.on('domino:player_left', () => loadRoomInfo())
    socket.on('domino:lobby', () => loadRoomInfo())

    socket.on('domino:turn_timeout', (data: any) =>
      pushToast(`⏱️ Tiempo agotado para posición ${data.position + 1}`)
    )

    socket.on('domino:finished', (data: any) => {
      const winType = data.winType
      const winnerPos = data.winnerPosition
      pushToast(
        winType === 'closed'
          ? `🔒 Tranca. Ganó posición ${winnerPos + 1} (menos puntos)`
          : `🏆 ¡Ganó posición ${winnerPos + 1}!`,
        6000
      )
      setTimeout(() => localStorage.removeItem('dc_current_room_code'), 5000)
    })

    socket.on('error', (data: any) => {
      pushToast(`⚠️ ${data.error || 'Error'}`, 4000)
    })

    // ── Fin de ronda: reconteo + ready-check ──────────────
    socket.on('domino:hand_finished', (data: any) => {
      setRoundEnd(data)
      setReadyInfo({ ready: [], expected: [], timeoutMs: data?.readyTimeoutMs ?? 10000 })
    })
    socket.on('domino:ready_update', (data: any) => {
      setReadyInfo({
        ready: data?.ready ?? [],
        expected: data?.expected ?? [],
        timeoutMs: data?.timeoutMs ?? 10000,
      })
    })
    socket.on('domino:hand_started', () => {
      setRoundEnd(null)
      setReadyInfo(null)
    })
    socket.on('domino:match_finished', (data: any) => {
      setRoundEnd(null)
      setReadyInfo(null)
      const t = data?.winnerTeam === 0 ? 'Azul' : data?.winnerTeam === 1 ? 'Rojo' : ''
      pushToast(`🏆 ¡Ganó el equipo ${t}! (${data?.score?.[0] ?? 0} - ${data?.score?.[1] ?? 0})`, 8000)
      setTimeout(() => localStorage.removeItem('dc_current_room_code'), 6000)
    })

    return () => {
      socket.disconnect()
    }
  }, [code, navigate, pushToast, loadRoomInfo])

  // Mantener ref actualizada de roomInfo para usar dentro del socket.on('auth:ok')
  const roomInfoRef = useRef<RoomInfo | null>(null)
  useEffect(() => {
    roomInfoRef.current = roomInfo
  }, [roomInfo])

  // ─── Acciones ─────────────────────────────────────────────
  function startGame() {
    if (!socketRef.current || !roomInfo) return
    socketRef.current.emit('domino:start')
  }

  function playTile(tile: [number, number], side: 'left' | 'right') {
    if (!socketRef.current || !roomInfo) return
    socketRef.current.emit('domino:play', { tile, side })
  }

  function passTurn() {
    if (!socketRef.current || !roomInfo) return
    socketRef.current.emit('domino:pass')
  }

  function chooseTeam(team: 0 | 1) {
    if (!socketRef.current || !roomInfo) return
    socketRef.current.emit('domino:choose_team', { team })
  }

  function setTeams(assignments: Array<{ userId: number; team: 0 | 1 }>) {
    if (!socketRef.current || !roomInfo) return
    socketRef.current.emit('domino:set_teams', { teams: assignments })
  }

  async function leaveRoom() {
    if (!confirm('¿Salir de la sala?')) return
    const token = localStorage.getItem('dc_access_token')
    if (!token || !code) return
    try {
      await fetch(`${API_URL}/domino/rooms/${code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
    } catch (e) {}
    socketRef.current?.disconnect()
    localStorage.removeItem('dc_current_room_code')
    navigate('/domino')
  }

  // ─── Render ───────────────────────────────────────────────
  if (error && !roomInfo) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="bg-white/5 border border-red-500/50 rounded-2xl p-6 max-w-md text-center">
          <div className="text-4xl mb-2">⚠️</div>
          <p className="text-red-200 mb-4">{error}</p>
          <button
            onClick={() => navigate('/domino')}
            className="px-4 py-2 bg-yellow-500 text-emerald-950 font-bold rounded-lg"
          >
            Volver al lobby
          </button>
        </div>
      </div>
    )
  }

  if (!roomInfo) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-white/60">Cargando sala...</div>
      </div>
    )
  }

  const myPlayer = roomInfo.players.find(p => p.user_id === myUserId)
  const isHost = roomInfo.host_user_id === myUserId
  const isInRoom = !!myPlayer
  const playerCount = roomInfo.players.length
  const canStart = isHost && playerCount >= 2 && roomInfo.status === 'waiting'

  return (
    <div className="min-h-screen p-4 pt-28">
      <div className="max-w-6xl mx-auto">
        <Link
          to="/domino"
          onClick={() => localStorage.removeItem('dc_current_room_code')}
          className="inline-block mb-3 text-white/60 hover:text-white text-sm"
        >
          ← Volver al lobby
        </Link>

        {/* Header */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 flex justify-between items-center">
          <div>
            <div className="text-xs text-white/50">Código de sala</div>
            <div className="font-mono text-2xl font-bold text-yellow-300 tracking-widest">
              {roomInfo.code}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/50">Estado</div>
            <div className="font-bold">
              {roomInfo.status === 'waiting' && `⏳ Esperando (${playerCount}/${roomInfo.max_players})`}
              {roomInfo.status === 'playing' && `🎲 Jugando`}
              {roomInfo.status === 'finished' && '🏆 Terminada'}
              {roomInfo.status === 'abandoned' && '❌ Abandonada'}
            </div>
          </div>
        </div>

        {/* Socket status */}
        {!socketConnected && (
          <div className="bg-orange-500/20 border border-orange-500/50 rounded-lg px-4 py-2 mb-4 text-sm text-orange-200">
            🔌 Conectando al servidor...
          </div>
        )}

        {/* Si el user NO está en la sala */}
        {!isInRoom && roomInfo.status === 'waiting' && (
          <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-2xl p-6 mb-4 text-center">
            <div className="text-2xl mb-2">👋</div>
            <p className="text-yellow-100 mb-4">No estás en esta sala. ¿Te re-unís?</p>
            <button
              onClick={async () => {
                const token = localStorage.getItem('dc_access_token')
                const res = await fetch(`${API_URL}/domino/rooms/${code}/join`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                })
                if (res.ok) {
                  await loadRoomInfo()
                } else {
                  const d = await res.json().catch(() => ({}))
                  pushToast(d.error || `Error ${res.status}`)
                }
              }}
              className="px-6 py-3 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-400"
            >
              Unirme a la sala
            </button>
          </div>
        )}

        {/* WaitingRoom o GameBoard */}
        {roomInfo.status === 'waiting' && isInRoom && (
          <WaitingRoom
            roomInfo={roomInfo}
            isHost={isHost}
            canStart={canStart}
            myUserId={myUserId!}
            myUsername={myUsername!}
            socketConnected={socketConnected}
            onStart={startGame}
            onLeave={leaveRoom}
            onChooseTeam={chooseTeam}
            onSetTeams={setTeams}
            onChooseAvatar={(avatar) => socketRef.current?.emit('domino:choose_avatar', { avatar })}
          />
        )}

        {(roomInfo.status === 'playing' || roomInfo.status === 'finished') && gameState && (
          <div
            className="rounded-3xl p-4 md:p-6 mb-4 border border-white/10 shadow-2xl"
            style={{
              backgroundColor: '#1a1109',
              backgroundImage: 'url(/assets/hero/domino-pattern.webp)',
              backgroundSize: '300px auto',
              backgroundRepeat: 'repeat',
            }}
          >
            {/* Título La Mesa */}
            <div className="text-center mb-4">
              <h2
                className="text-4xl md:text-5xl font-black drop-shadow-lg"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: '#f3e7cc' }}
              >
                La Mesa
              </h2>
            </div>

            {/* Arena: el canvas (mesa clásica + tablero + mis fichas) + las píldoras encima.
                mesaInset / sideOffset se afinan EN VIVO (localhost) para alinear las
                píldoras con el borde de la mesa clásica. */}
            <div className="relative mx-auto" style={{ maxWidth: 560, aspectRatio: '1 / 1' }}>
              <Domino2D
                gameState={gameState}
                myUserId={myUserId!}
                onPlay={playTile}
                onPass={passTurn}
                mesa="clasica"
                setFichas="marfil"
              />
              <LaMesaSeats
                gameState={gameState}
                roomPlayers={roomInfo.players}
                myUserId={myUserId!}
                mesaInset={4}
                ring={2}
                sideOffset={6.5}
              />
            </div>
          </div>
          /* Domino33 queda de respaldo — cambiar Domino2D por Domino33 para volver al 3D */
        )}

        {/* Modal de fin de ronda: reconteo + ready-check */}
        {roundEnd && (
          <RoundEndModal
            data={roundEnd}
            players={roomInfo.players}
            myUserId={myUserId}
            ready={readyInfo?.ready ?? []}
            expected={readyInfo?.expected ?? []}
            timeoutMs={readyInfo?.timeoutMs ?? 10000}
            setFichas="dibujito"
            onReady={() => socketRef.current?.emit('domino:ready_next')}
          />
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-emerald-950 px-6 py-3 rounded-xl font-bold shadow-2xl z-50 animate-in slide-in-from-top">
            {toast.text}
          </div>
        )}
      </div>
    </div>
  )
}