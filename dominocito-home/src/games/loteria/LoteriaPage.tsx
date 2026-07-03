import { Link } from 'react-router-dom'

export default function LoteriaPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="bg-white/10 backdrop-blur rounded-2xl p-8 max-w-md text-center">
        <div className="text-6xl mb-4">🎰</div>
        <h1 className="text-2xl font-bold mb-2">Lotería</h1>
        <p className="text-white/70 mb-6">Próximamente. Estamos calibrando la economía.</p>
        <Link to="/" className="inline-block px-6 py-2 bg-yellow-500 text-emerald-950 rounded-lg font-bold hover:bg-yellow-400">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}