import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import WaitingRoom from './WaitingRoom'
import GameBoard from './GameBoard'

interface Player {
  user_id: number
  username: string
  display_name?: string
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

  const socketRef = useRef<Socket | null>(null)
  const toastIdRef = useRef(0)

  const pushToast = useCallback((text: string, ms = 3500) => {
    const id = ++toastIdRef.current
    setToast({ id, text })
    setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev))
    }, ms)
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
    if (!token || !code) return

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
    <div className="min-h-screen p-4">
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
          />
        )}

        {(roomInfo.status === 'playing' || roomInfo.status === 'finished') && gameState && (
          <GameBoard
            gameState={gameState}
            roomInfo={roomInfo}
            myUserId={myUserId!}
            onPlay={playTile}
            onPass={passTurn}
            onLeave={leaveRoom}
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