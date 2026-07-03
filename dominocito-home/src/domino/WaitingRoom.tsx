interface Player {
  user_id: number
  username: string
  position: number
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
}

interface Props {
  roomInfo: RoomInfo
  isHost: boolean
  canStart: boolean
  myUserId: number
  myUsername: string
  socketConnected: boolean
  onStart: () => void
  onLeave: () => void
}

export default function WaitingRoom({
  roomInfo,
  isHost,
  canStart,
  myUserId,
  myUsername,
  socketConnected,
  onStart,
  onLeave,
}: Props) {
  const slots = Array.from({ length: roomInfo.max_players }, (_, i) => i)
  const playersByPos = new Map(roomInfo.players.map((p) => [p.position, p]))

  return (
    <div className="space-y-4">
      {/* Sala info */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">⏳ Esperando jugadores</h2>
          <span className={`text-xs px-2 py-1 rounded ${socketConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'}`}>
            ● {socketConnected ? 'Conectado' : 'Conectando...'}
          </span>
        </div>

        <p className="text-white/70 text-sm mb-4">
          {roomInfo.players.length === 1
            ? 'Sos el único. Compartí el código con alguien para empezar.'
            : `Hay ${roomInfo.players.length} jugador${roomInfo.players.length === 1 ? '' : 'es'} en la sala.`}
        </p>

        {/* Cuadrícula de jugadores */}
        <div className={`grid gap-3 ${roomInfo.max_players === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          {slots.map((slot) => {
            const player = playersByPos.get(slot)
            const isMe = player?.user_id === myUserId
            const isHostPlayer = player?.user_id === roomInfo.host_user_id
            return (
              <div
                key={slot}
                className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-3 transition ${
                  player
                    ? 'bg-emerald-500/10 border-emerald-500/50'
                    : 'bg-white/5 border-dashed border-white/20'
                }`}
              >
                {player ? (
                  <>
                    <div className="text-3xl mb-1">{player.is_connected ? '🟢' : '⚫'}</div>
                    <div className="font-bold text-sm text-center truncate w-full">
                      {player.username}
                      {isMe && ' (vos)'}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {isHostPlayer && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200">
                          👑 host
                        </span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                        pos {slot + 1}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-4xl text-white/20 mb-1">＋</div>
                    <div className="text-xs text-white/40">libre</div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Acciones */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="text-sm text-white/60">
          {isHost ? (
            <>Sos el host. Cuando todos estén listos, iniciá la partida.</>
          ) : (
            <>Esperando que el host ({roomInfo.host_username || 'host'}) inicie la partida.</>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onLeave}
            className="px-4 py-2 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg font-bold hover:bg-red-500/30"
          >
            Salir
          </button>
          {isHost && (
            <button
              onClick={onStart}
              disabled={!canStart || !socketConnected}
              className="px-6 py-2 bg-emerald-500 text-white font-bold rounded-lg hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
              title={!canStart ? 'Necesitás al menos 2 jugadores' : ''}
            >
              🎲 Iniciar partida
            </button>
          )}
        </div>
      </div>
    </div>
  )
}