import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API_URL = '/api'
const CODE_REGEX = /^[A-Z0-9]{4}$/

interface Room {
  id: number
  code: string
  max_players: number
  created_at: string
  player_count: string | number
  players?: any[]
  is_private?: boolean
  status?: string
  host_user_id?: number
  host_username?: string
  joined?: boolean
  is_connected?: boolean
  is_host?: boolean
}

function statusBadge(status?: string, isPrivate?: boolean) {
  if (isPrivate) {
    return <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">🔒 privada</span>
  }
  if (status === 'playing') {
    return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">▶ jugando</span>
  }
  if (status === 'waiting') {
    return <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">⏳ esperando</span>
  }
  return null
}

interface Toast {
  id: number
  type: 'error' | 'success' | 'info'
  message: string
}

function CreateRoomModal({
  initial,
  onCancel,
  onConfirm,
  loading,
}: {
  initial: {
    isPrivate: boolean
    maxPlayers: 2 | 4
    gameMode: 'individual' | 'teams'
    teamMode: 'manual' | 'choose' | 'random' | null
    targetScore: number | null
  }
  onCancel: () => void
  onConfirm: (cfg: typeof initial) => void
  loading: boolean
}) {
  const [cfg, setCfg] = useState(initial)

  // Al cambiar a individual, limpiar teamMode
  function setGameMode(m: 'individual' | 'teams') {
    setCfg((c) => ({
      ...c,
      gameMode: m,
      teamMode: m === 'teams' ? (c.teamMode ?? 'manual') : null,
      // Si bajamos de teams a individual y targetScore quedó seteado, lo limpiamos
      targetScore: m === 'teams' ? c.targetScore : null,
      // Parejas exige 4
      maxPlayers: m === 'teams' ? 4 : c.maxPlayers,
    }))
  }
  function setMaxPlayers(n: 2 | 4) {
    setCfg((c) => ({ ...c, maxPlayers: n }))
  }
  function setTeamMode(m: 'manual' | 'choose' | 'random') {
    setCfg((c) => ({ ...c, teamMode: m }))
  }
  function setTargetScore(v: string) {
    if (v === '') {
      setCfg((c) => ({ ...c, targetScore: null }))
      return
    }
    const n = parseInt(v, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= 10000) {
      setCfg((c) => ({ ...c, targetScore: n }))
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1207] border border-yellow-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-yellow-300/80">
              {cfg.isPrivate ? '🔒 Sala privada' : '🌐 Sala pública'}
            </div>
            <h3 className="text-xl font-bold text-white">Configurar partida</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-white/60 hover:text-white text-2xl leading-none px-2"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Jugadores */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-white/60 mb-2">
              Cantidad de jugadores
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMaxPlayers(2)}
                className={`py-3 rounded-lg font-bold transition ${
                  cfg.maxPlayers === 2
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                }`}
              >
                2 (1 vs 1)
              </button>
              <button
                onClick={() => setMaxPlayers(4)}
                className={`py-3 rounded-lg font-bold transition ${
                  cfg.maxPlayers === 4
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                }`}
              >
                4
              </button>
            </div>
          </div>

          {/* Modo de juego */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-white/60 mb-2">
              Modo de juego
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGameMode('individual')}
                className={`py-3 rounded-lg font-bold transition ${
                  cfg.gameMode === 'individual'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                }`}
              >
                🧍 Individual
              </button>
              <button
                onClick={() => setGameMode('teams')}
                disabled={cfg.maxPlayers !== 4}
                className={`py-3 rounded-lg font-bold transition ${
                  cfg.gameMode === 'teams'
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                👥 Parejas
              </button>
            </div>
            {cfg.maxPlayers !== 4 && cfg.gameMode === 'teams' && (
              <p className="text-xs text-yellow-300/80 mt-1">
                Parejas requiere 4 jugadores.
              </p>
            )}
          </div>

          {/* Quién arma los equipos (solo parejas) */}
          {cfg.gameMode === 'teams' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-white/60 mb-2">
                ¿Quién arma los equipos?
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setTeamMode('manual')}
                  className={`text-left px-4 py-3 rounded-lg transition ${
                    cfg.teamMode === 'manual'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="font-bold">🛠️ Yo (el host) los armo</div>
                  <div className="text-xs opacity-80">
                    Vos elegís quién va con quién antes de iniciar.
                  </div>
                </button>
                <button
                  onClick={() => setTeamMode('choose')}
                  className={`text-left px-4 py-3 rounded-lg transition ${
                    cfg.teamMode === 'choose'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="font-bold">🙋 Cada uno elige su equipo</div>
                  <div className="text-xs opacity-80">
                    Los jugadores toman Equipo 1 o Equipo 2 al entrar a la mesa.
                  </div>
                </button>
                <button
                  onClick={() => setTeamMode('random')}
                  className={`text-left px-4 py-3 rounded-lg transition ${
                    cfg.teamMode === 'random'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="font-bold">🎲 Al azar</div>
                  <div className="text-xs opacity-80">
                    Se sortean los equipos al iniciar la partida.
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Puntos objetivo (solo parejas) */}
          {cfg.gameMode === 'teams' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-white/60 mb-2">
                Puntos objetivo (opcional)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  placeholder="Una sola mano"
                  value={cfg.targetScore ?? ''}
                  onChange={(e) => setTargetScore(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none text-white"
                />
                <span className="text-white/60 text-sm">puntos</span>
              </div>
              <p className="text-xs text-white/50 mt-1">
                Si lo dejás vacío, se juega una sola mano. Con puntos, gana quien los alcance primero.
              </p>
            </div>
          )}

          {/* Resumen */}
          <div className="bg-white/5 rounded-lg p-3 text-sm text-white/80 border border-white/10">
            <div className="font-bold text-yellow-300 mb-1">Resumen</div>
            <ul className="space-y-0.5">
              <li>• {cfg.maxPlayers} jugadores</li>
              <li>• {cfg.gameMode === 'teams' ? 'Parejas (2 vs 2)' : 'Individual (todos contra todos)'}</li>
              {cfg.gameMode === 'teams' && cfg.teamMode && (
                <li>
                  • Equipos:{' '}
                  {cfg.teamMode === 'manual'
                    ? 'los arma el host'
                    : cfg.teamMode === 'choose'
                    ? 'cada uno elige'
                    : 'al azar al iniciar'}
                </li>
              )}
              <li>
                •{' '}
                {cfg.targetScore && cfg.targetScore > 0
                  ? `Partido a ${cfg.targetScore} puntos`
                  : 'Una sola mano'}
              </li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-white/70 hover:text-white"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(cfg)}
            disabled={loading}
            className="px-6 py-2 bg-yellow-500 text-emerald-950 font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50"
          >
            {loading ? 'Creando…' : '🎲 Crear sala'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DominoLobby() {
  const navigate = useNavigate()
  const [username, setUsername] = useState<string | null>(null)
  const [publicRooms, setPublicRooms] = useState<Room[]>([])
  const [myRooms, setMyRooms] = useState<Room[]>([])
  const [myPage, setMyPage] = useState(1)
  const [publicPage, setPublicPage] = useState(1)
  const PAGE_SIZE = 8
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const toastIdRef = useRef(0)

  const pushToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const getToken = useCallback((): string | null => {
    return localStorage.getItem('dc_access_token')
  }, [])

  // Para acciones que requieren login (crear/unirse a sala): si no hay token,
  // redirigir a /login con returnTo para volver después.
  const requireAuth = useCallback((returnTo: string): string | null => {
    const token = localStorage.getItem('dc_access_token')
    if (!token) {
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
      return null
    }
    return token
  }, [navigate])

  const loadRooms = useCallback(async (silent = true) => {
    const token = getToken()
    if (!silent) setIsRefreshing(true)
    try {
      // Salas públicas — sin auth requerida
      const pubRes = await fetch(`${API_URL}/domino/rooms/public`)
      const pub = pubRes.ok ? await pubRes.json() : { rooms: [] }
      setPublicRooms(pub.rooms || [])

      // Mis salas — solo si hay token
      if (token) {
        const mineRes = await fetch(`${API_URL}/domino/rooms/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (mineRes.ok) {
          const mine = await mineRes.json()
          setMyRooms(mine.rooms || [])
        } else if (mineRes.status === 401) {
          localStorage.removeItem('dc_access_token')
          setMyRooms([])
        }
      } else {
        setMyRooms([])
      }
    } catch (err: any) {
      console.error('Error loading rooms:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [getToken])

  useEffect(() => {
    setUsername(localStorage.getItem('dc_username'))
    loadRooms(true)
    const t = setInterval(() => loadRooms(true), 5000)
    // Refrescar también cuando la ventana recupera el foco
    const onFocus = () => loadRooms(true)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadRooms])

  // Config de sala privada/pública antes de crearla
  type RoomConfig = {
    isPrivate: boolean
    maxPlayers: 2 | 4
    gameMode: 'individual' | 'teams'
    teamMode: 'manual' | 'choose' | 'random' | null
    targetScore: number | null
  }
  const [configModal, setConfigModal] = useState<RoomConfig | null>(null)
  function openCreateModal(isPrivate: boolean) {
    setConfigModal({
      isPrivate,
      maxPlayers: 4,
      gameMode: 'individual',
      teamMode: null,
      targetScore: null,
    })
  }
  function closeConfigModal() {
    setConfigModal(null)
  }
  async function submitCreateRoom(cfg: RoomConfig) {
    setLoading(true)
    setError(null)
    const token = requireAuth('/domino')
    if (!token) { setLoading(false); return }

    try {
      const body: any = {
        isPrivate: cfg.isPrivate,
        maxPlayers: cfg.maxPlayers,
        gameMode: cfg.gameMode,
      }
      if (cfg.gameMode === 'teams') {
        body.teamMode = cfg.teamMode
        if (cfg.targetScore && cfg.targetScore > 0) {
          body.targetScore = cfg.targetScore
        }
      }
      const res = await fetch(`${API_URL}/domino/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({ error: 'Respuesta inválida' }))
      if (!res.ok) {
        const msg = data.error || `Error ${res.status} al crear la sala`
        setError(msg)
        pushToast('error', msg)
        return
      }
      if (!data?.room?.code) {
        const msg = 'Respuesta sin código de sala'
        setError(msg)
        pushToast('error', msg)
        return
      }
      pushToast('success', `Sala ${data.room.code} creada`)
      setConfigModal(null)
      navigate(`/domino/room/${data.room.code}`)
    } catch (err: any) {
      const msg = err.message?.includes('Failed to fetch')
        ? 'Sin conexión al servidor'
        : 'Error de red'
      setError(msg)
      pushToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  async function joinRoom(code: string) {
    const cleanCode = code.trim().toUpperCase()
    if (!CODE_REGEX.test(cleanCode)) {
      const msg = 'Código inválido (4 caracteres A-Z, 0-9)'
      setError(msg)
      pushToast('error', msg)
      return
    }

    setLoading(true)
    setError(null)
    const token = requireAuth('/domino')
    if (!token) { setLoading(false); return }

    try {
      const res = await fetch(`${API_URL}/domino/rooms/${cleanCode}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json().catch(() => ({ error: 'Respuesta inválida' }))
      if (!res.ok) {
        const msg = data.error || `Error ${res.status} al unirse`
        setError(msg)
        pushToast('error', msg)
        return
      }
      pushToast('success', `Unido a ${cleanCode}`)
      navigate(`/domino/room/${cleanCode}`)
    } catch (err: any) {
      const msg = err.message?.includes('Failed to fetch')
        ? 'Sin conexión al servidor'
        : 'Error de red'
      setError(msg)
      pushToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  async function leaveRoom(code: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`¿Salir de la sala ${code}?`)) return
    const token = getToken()
    if (!token) return

    try {
      const res = await fetch(`${API_URL}/domino/rooms/${code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        pushToast('error', data.error || `Error ${res.status}`)
        return
      }
      pushToast(data.left ? 'success' : 'info', data.left ? `Saliste de ${code}` : `No estabas en ${code}`)
      await loadRooms(false)
    } catch (err: any) {
      pushToast('error', 'Error de red al salir')
    }
  }

  const renderRoom = (room: Room, isMine: boolean) => (
    <div
      key={room.id}
      className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400/50 rounded-lg px-4 py-3 flex justify-between items-center transition cursor-pointer"
      onClick={() => navigate(`/domino/room/${room.code}`)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="font-mono font-bold text-yellow-300 text-lg">{room.code}</div>
        {statusBadge(room.status, room.is_private)}
        {isMine && room.is_host && (
          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">👑 host</span>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-xs text-white/50 hidden sm:block">
          {room.host_username ? `host: ${room.host_username}` : ''}
        </div>
        <div className="text-xs text-white/50">
          {room.player_count}/{room.max_players}
          {isMine && room.is_connected === true && <span className="ml-2 text-emerald-400" title="Conectado">●</span>}
          {isMine && room.is_connected === false && <span className="ml-2 text-white/40" title="Desconectado">○</span>}
        </div>
        {isMine && (
          <button
            onClick={(e) => leaveRoom(room.code, e)}
            className="text-xs px-2 py-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded hover:bg-red-500/30"
          >
            Salir
          </button>
        )}
        <div className="text-sm text-yellow-400 font-bold">Entrar →</div>
      </div>
    </div>
  )

  return (
    <div
      className="min-h-screen relative"
    >

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-12">

        {/* Tus mesas */}
        <div className="bg-white/5 border border-yellow-500/30 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-yellow-300">🎯 Tus mesas</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">
                {isRefreshing ? '↻ actualizando…' : 'auto-refresh 5s'}
              </span>
              <button
                onClick={() => loadRooms(false)}
                className="text-xs px-2 py-1 bg-white/10 hover:bg-white/20 rounded transition"
                title="Refrescar ahora"
              >
                ↻
              </button>
            </div>
          </div>

          {myRooms.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">No estás en ninguna mesa activa.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-2">{myRooms.slice((myPage-1)*PAGE_SIZE, myPage*PAGE_SIZE).map(r => renderRoom(r, true))}</div>
              {myRooms.length > PAGE_SIZE && (
                <Pagination current={myPage} total={Math.ceil(myRooms.length/PAGE_SIZE)} onChange={setMyPage} />
              )}
            </>
          )}
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-2">🛡️ Mesa privada</h3>
            <p className="text-sm text-white/60 mb-4">
              Creá una sala con código e invitá amigos.
            </p>
            <button
              onClick={() => openCreateModal(true)}
              disabled={loading}
              className="w-full py-3 bg-yellow-500 text-emerald-950 font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition"
            >
              {loading ? 'Creando…' : 'Crear sala privada'}
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-2">🔑 Unirse con código</h3>
            <p className="text-sm text-white/60 mb-4">
              Tenés un código? Ingresálo para entrar.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ABCD"
                value={joinCode}
                onChange={e => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
                  setJoinCode(v)
                  setError(null)
                }}
                onKeyDown={e => e.key === 'Enter' && joinCode.length === 4 && joinRoom(joinCode)}
                maxLength={4}
                className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none text-white text-center font-mono text-xl uppercase tracking-widest"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => joinRoom(joinCode)}
                disabled={loading || joinCode.length !== 4}
                className="px-6 py-3 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition"
              >
                Entrar
              </button>
            </div>
          </div>
        </div>

        {/* Mesas públicas */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">🌐 Mesas públicas</h3>
            <button
              onClick={() => openCreateModal(false)}
              disabled={loading}
              className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition disabled:opacity-50"
            >
              Crear mesa pública
            </button>
          </div>

          {publicRooms.length === 0 ? (
            <div className="text-center py-12 text-white/50">
              <div className="text-4xl mb-2">🎲</div>
              <p>No hay mesas públicas abiertas. Creá una!</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {publicRooms.slice((publicPage-1)*PAGE_SIZE, publicPage*PAGE_SIZE).map(room => (
                <div
                  key={room.id}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-yellow-400/50 rounded-lg px-4 py-3 flex justify-between items-center transition cursor-pointer"
                  onClick={() => joinRoom(room.code)}
                >
                  <div>
                    <div className="font-mono font-bold text-yellow-300 text-lg">{room.code}</div>
                    <div className="text-xs text-white/50">
                      host: {room.host_username || '?'} · {room.player_count}/{room.max_players}
                    </div>
                  </div>
                  <div className="text-sm text-yellow-400 font-bold">Unirse →</div>
                </div>
              ))}
              {publicRooms.length > PAGE_SIZE && (
                <Pagination current={publicPage} total={Math.ceil(publicRooms.length/PAGE_SIZE)} onChange={setPublicPage} />
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-8 bg-white/5 rounded-2xl p-6 text-sm text-white/70">
          <h4 className="font-bold mb-2 text-white">📋 Reglas</h4>
          <ul className="space-y-1">
            <li>• 4 jugadores, 7 fichas cada uno (28 total, doble-6)</li>
            <li>• Inicia quien tenga el doble más alto</li>
            <li>• Se juega a la izquierda</li>
            <li>• Podés pasar si no tenés ficha que sirva</li>
            <li>• Gana quien se quede sin fichas, o quien tenga menos puntos si se cierra</li>
            <li>• 60 segundos por turno (auto-pasa si no jugás)</li>
          </ul>
        </div>
      </div>

      {/* Modal de configuración de sala */}
      {configModal && (
        <CreateRoomModal
          initial={configModal}
          onCancel={closeConfigModal}
          onConfirm={submitCreateRoom}
          loading={loading}
        />
      )}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm animate-in slide-in-from-right ${
              t.type === 'error'
                ? 'bg-red-500/30 border-red-500/50 text-red-100'
                : t.type === 'success'
                ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-100'
                : 'bg-blue-500/30 border-blue-500/50 text-blue-100'
            }`}
          >
            {t.type === 'error' && '❌ '}
            {t.type === 'success' && '✅ '}
            {t.type === 'info' && 'ℹ️ '}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
function Pagination({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current === 1}
        className="px-3 py-1 text-sm rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        ← Anterior
      </button>
      {Array.from({ length: total }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-sm rounded transition ${
            p === current
              ? 'bg-yellow-400 text-emerald-950 font-bold'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(Math.min(total, current + 1))}
        disabled={current === total}
        className="px-3 py-1 text-sm rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition"
      >
        Siguiente →
      </button>
    </div>
  )
}
