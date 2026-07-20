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

interface Props {
  roomInfo: RoomInfo
  isHost: boolean
  canStart: boolean
  myUserId: number
  myUsername: string
  socketConnected: boolean
  onStart: () => void
  onLeave: () => void
  onChooseTeam: (team: 0 | 1) => void
  onSetTeams: (assignments: Array<{ userId: number; team: 0 | 1 }>) => void
}

// Etiquetas legibles para el front
const GAME_MODE_LABEL: Record<string, string> = {
  individual: '🧍 Individual',
  teams: '👥 Parejas (2 vs 2)',
}

const TEAM_MODE_LABEL: Record<string, string> = {
  manual: '🛠️ El host arma los equipos',
  choose: '🙋 Cada uno elige su equipo',
  random: '🎲 Equipos al azar',
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
  onChooseTeam,
  onSetTeams,
}: Props) {
  const slots = Array.from({ length: roomInfo.max_players }, (_, i) => i)
  const playersByPos = new Map(roomInfo.players.map((p) => [p.position, p]))

  const gameMode = roomInfo.game_mode ?? 'individual'
  const teamMode = roomInfo.team_mode ?? null
  const targetScore = roomInfo.target_score ?? null

  const isTeams = gameMode === 'teams'

  // Para host en modo manual: asignación de equipos por jugador
  const myPlayer = roomInfo.players.find((p) => p.user_id === myUserId)

  // En modo 'choose': cuántos hay en cada equipo
  const teamCounts = (team: 0 | 1): number =>
    roomInfo.players.filter((p) => p.team === team).length

  // Mi equipo actual
  const myTeam = myPlayer?.team ?? null

  function handleManualAssign(target: Player, team: 0 | 1) {
    if (!isHost || teamMode !== 'manual') return
    // Construir asignación: el target toma ese team; el resto mantiene el suyo.
    const next = roomInfo.players.map((p) =>
      p.user_id === target.user_id ? { userId: p.user_id, team } : { userId: p.user_id, team: (p.team ?? 0) as 0 | 1 }
    )
    onSetTeams(next)
  }

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

        {/* Configuración de la partida */}
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
            {GAME_MODE_LABEL[gameMode] ?? gameMode}
          </span>
          {isTeams && teamMode && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30">
              {TEAM_MODE_LABEL[teamMode] ?? teamMode}
            </span>
          )}
          {targetScore ? (
            <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/30">
              🏁 A {targetScore} puntos
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/60 border border-white/10">
              1 mano
            </span>
          )}
          <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/60 border border-white/10">
            {roomInfo.is_private ? '🔒 Privada' : '🌐 Pública'}
          </span>
        </div>

        {/* Cuadrícula de jugadores */}
        <div className={`grid gap-3 ${roomInfo.max_players === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
          {slots.map((slot) => {
            const player = playersByPos.get(slot)
            const isMe = player?.user_id === myUserId
            const isHostPlayer = player?.user_id === roomInfo.host_user_id
            // Color por equipo
            const teamColor =
              player?.team === 0
                ? 'border-blue-500/60 bg-blue-500/10'
                : player?.team === 1
                ? 'border-red-500/60 bg-red-500/10'
                : ''
            return (
              <div
                key={slot}
                className={`aspect-square rounded-2xl border-2 flex flex-col items-center justify-center p-3 transition ${
                  player
                    ? teamColor || 'bg-emerald-500/10 border-emerald-500/50'
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
                    <div className="flex gap-1 mt-1 flex-wrap justify-center">
                      {isHostPlayer && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200">
                          👑 host
                        </span>
                      )}
                      {player.team === 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-100">
                          🔵 Equipo 1
                        </span>
                      )}
                      {player.team === 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/30 text-red-100">
                          🔴 Equipo 2
                        </span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                        pos {slot + 1}
                      </span>
                    </div>

                    {/* Selector de equipo: solo si soy host + modo manual */}
                    {isHost && teamMode === 'manual' && (
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={() => handleManualAssign(player, 0)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            player.team === 0
                              ? 'bg-blue-500 text-white'
                              : 'bg-white/10 hover:bg-blue-500/30'
                          }`}
                          title="Asignar al Equipo 1"
                        >
                          🔵
                        </button>
                        <button
                          onClick={() => handleManualAssign(player, 1)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            player.team === 1
                              ? 'bg-red-500 text-white'
                              : 'bg-white/10 hover:bg-red-500/30'
                          }`}
                          title="Asignar al Equipo 2"
                        >
                          🔴
                        </button>
                      </div>
                    )}
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

        {/* Modo 'choose': cada jugador elige */}
        {isTeams && teamMode === 'choose' && myPlayer && (
          <div className="mt-5 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-sm text-white/70 mb-2">
              Elegí tu equipo ({teamCounts(0)}/2 vs {teamCounts(1)}/2):
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onChooseTeam(0)}
                disabled={myTeam === 0 || teamCounts(0) >= 2}
                className={`flex-1 py-3 rounded-lg font-bold transition ${
                  myTeam === 0
                    ? 'bg-blue-500 text-white'
                    : teamCounts(0) >= 2
                    ? 'bg-white/5 text-white/30 cursor-not-allowed'
                    : 'bg-blue-500/20 text-blue-100 border border-blue-500/40 hover:bg-blue-500/30'
                }`}
              >
                🔵 Equipo 1
              </button>
              <button
                onClick={() => onChooseTeam(1)}
                disabled={myTeam === 1 || teamCounts(1) >= 2}
                className={`flex-1 py-3 rounded-lg font-bold transition ${
                  myTeam === 1
                    ? 'bg-red-500 text-white'
                    : teamCounts(1) >= 2
                    ? 'bg-white/5 text-white/30 cursor-not-allowed'
                    : 'bg-red-500/20 text-red-100 border border-red-500/40 hover:bg-red-500/30'
                }`}
              >
                🔴 Equipo 2
              </button>
            </div>
          </div>
        )}

        {/* Modo 'manual': mensaje para jugadores no-host */}
        {isTeams && teamMode === 'manual' && !isHost && (
          <div className="mt-5 p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
            🛠️ Esperando que el host arme los equipos.
          </div>
        )}

        {/* Modo 'random': info */}
        {isTeams && teamMode === 'random' && (
          <div className="mt-5 p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
            🎲 Los equipos se sortean al iniciar la partida.
          </div>
        )}
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