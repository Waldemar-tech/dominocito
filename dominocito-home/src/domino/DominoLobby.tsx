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

export default function DominoLobby() {
  const navigate = useNavigate()
  const [username, setUsername] = useState<string | null>(null)
  const [publicRooms, setPublicRooms] = useState<Room[]>([])
  const [myRooms, setMyRooms] = useState<Room[]>([])
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

  async function createRoom(isPrivate: boolean) {
    setLoading(true)
    setError(null)
    const token = requireAuth('/domino')
    if (!token) { setLoading(false); return }

    try {
      const res = await fetch(`${API_URL}/domino/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isPrivate, maxPlayers: 4 }),
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
      style={{
        backgroundImage: "url('/assets/domino-lobby-bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Navbar flotante */}
      <header className="relative z-30 pt-4 px-6">
        <div className="max-w-6xl mx-auto">
          <div
            className="flex items-center justify-between gap-4 px-5 py-3 rounded-full"
            style={{
              background: 'rgba(20, 10, 5, 0.85)',
              border: '1px solid rgba(255, 233, 214, 0.08)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {/* Logo + menú */}
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80" style={{ textDecoration: 'none' }}>
                <img src="/assets/logos/domino-clasico.png" alt="Dominó Clásico" style={{ height: '28px', width: 'auto', maxWidth: '120px' }} />
              </Link>
              <nav className="hidden md:flex items-center gap-5">
                <span className="text-sm font-bold transition-opacity hover:opacity-100" style={{ color: 'var(--coral)', opacity: 0.9 }}>Lobby</span>
                <span className="text-sm font-bold transition-opacity hover:opacity-100 cursor-pointer" style={{ color: 'var(--cream)', opacity: 0.85 }} onClick={() => document.getElementById('rooms-public')?.scrollIntoView({ behavior: 'smooth' })}>Mesas</span>
                <span className="text-sm font-bold transition-opacity hover:opacity-100" style={{ color: 'var(--cream)', opacity: 0.85 }}>Ranking</span>
              </nav>
            </div>

            {/* Right CTA */}
            <div className="flex items-center gap-3">
              {username ? (
                <>
                  <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(255, 233, 214, 0.08)', color: 'var(--cream)' }}>
                    🪙 €200
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'var(--coral)', color: '#fff' }}>
                    👤 {username} ▾
                  </span>
                </>
              ) : (
                <>
                  <button onClick={() => requireAuth('/domino')} className="hidden sm:inline px-4 py-2 text-sm transition" style={{ color: 'var(--cream)', opacity: 0.85, background: 'none', border: 'none', cursor: 'pointer' }}>Iniciar sesión</button>
                  <button onClick={() => requireAuth('/domino')} className="px-5 py-2 text-sm font-bold rounded-full transition" style={{ background: 'var(--coral)', color: '#fff', border: 'none', cursor: 'pointer' }}>Regístrate</button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center text-center pt-16 pb-20 px-6">
        <h1
          className="font-black tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(60px, 10vw, 130px)',
            color: 'var(--cream)',
            textShadow: '4px 4px 0 #1a0a05, -2px -2px 0 #1a0a05, 8px 8px 32px rgba(0,0,0,0.7)',
            letterSpacing: '-0.02em',
            lineHeight: 0.95,
          }}
        >
          DOMINÓ<br />CLÁSICO
        </h1>
        <p className="mt-4 text-base" style={{ color: 'var(--cream)', opacity: 0.85 }}>
          4 jugadores · 28 fichas · 100 puntos
        </p>
        <button
          onClick={() => createRoom(false)}
          disabled={loading}
          className="mt-8 px-10 py-4 text-lg font-bold rounded-full transition transform hover:scale-105"
          style={{
            background: 'var(--coral)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(255, 107, 74, 0.5)',
          }}
        >
          {loading ? 'Creando…' : '🎲 Jugar Ahora'}
        </button>
      </section>

      <div className="max-w-4xl mx-auto px-6 pb-12">

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
            <div className="grid gap-2">{myRooms.map(r => renderRoom(r, true))}</div>
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
              onClick={() => createRoom(true)}
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
              onClick={() => createRoom(false)}
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
              {publicRooms.map(room => (
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