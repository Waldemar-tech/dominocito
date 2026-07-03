import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const API_URL = '/api'

export default function AuthScreen() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const body = mode === 'login'
        ? { email, password }
        : { email, username, password }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error de autenticación')
        return
      }

      // Guardar tokens
      localStorage.setItem('dc_access_token', data.access_token)
      localStorage.setItem('dc_refresh_token', data.refresh_token)
      localStorage.setItem('dc_username', data.user.username)
      localStorage.setItem('dc_user_id', String(data.user.id))

      // Volver al home
      navigate('/')
    } catch (err) {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="bg-white/10 backdrop-blur rounded-2xl p-8 w-full max-w-md">
        <Link to="/" className="inline-block mb-4 text-white/60 hover:text-white text-sm">
          ← Volver
        </Link>

        <h1 className="text-3xl font-bold mb-2">
          {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h1>
        <p className="text-white/60 mb-6 text-sm">
          {mode === 'login' ? 'Ingresá a tu cuenta' : 'Creá tu cuenta gratis'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm text-white/70 mb-1">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none text-white"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-white/70 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none text-white"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 focus:border-yellow-400 focus:outline-none text-white"
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-yellow-500 text-emerald-950 font-bold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition"
          >
            {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-yellow-300 hover:text-yellow-200 underline"
          >
            {mode === 'login' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Ingresá'}
          </button>
        </div>
      </div>
    </div>
  )
}