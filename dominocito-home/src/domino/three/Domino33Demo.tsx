/**
 * Domino33Demo.tsx — Página standalone para probar Devil33 en modo local.
 *
 * Nota: cuando se monte dentro de DominoRoom, se usa el componente Domino33
 * directamente (que sí activa modo socket y conecta con backend).
 * Esta Demo solo sirve para smoke test visual local.
 */

import Domino33 from './Domino33'

export default function Domino33Demo() {
  // Mock game state mínimo para que Domino33 arranque sin socket
  const mockState = {
    roomId: 0,
    status: 'waiting' as const,
    players: [
      { userId: 1, username: 'Vos', position: 0 as const, hand: [], connected: true },
      { userId: 2, username: 'Norte', position: 2 as const, hand: [], connected: true },
      { userId: 3, username: 'Este', position: 1 as const, hand: [], connected: true },
      { userId: 4, username: 'Oeste', position: 3 as const, hand: [], connected: true },
    ],
    currentTurn: 0,
    board: [],
    leftEnd: null,
    rightEnd: null,
    passesInRow: 0,
    winnerPosition: null,
    winType: null as null,
    scores: {},
    moveCount: 0,
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <div className="max-w-7xl mx-auto p-4">
        <h1 className="text-white text-2xl font-black mb-2">🎲 Devil33 — Modo Socket Activado</h1>
        <p className="text-white/50 text-sm mb-4">
          El motor 3D de Devil33 está listo y desactivó su IA local. Para jugar con multiplayer real,
          entrá a una sala en <a href="/domino" className="text-yellow-300 underline">/domino</a>.
        </p>
        <Domino33
          gameState={mockState}
          myUserId={1}
          onPlay={() => {}}
          onPass={() => {}}
        />
      </div>
    </div>
  )
}