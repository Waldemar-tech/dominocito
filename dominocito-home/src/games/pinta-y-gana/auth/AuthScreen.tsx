import { useState, useEffect } from 'react';
import { register, login } from './authStore';
import type { User, ValidationError } from './authStore';
import { assetUrl } from '../utils/baseUrl';

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
  onClose?: () => void;
  initialMode?: 'login' | 'register';
}

type Mode = 'login' | 'register';

export default function AuthScreen({ onAuthenticated, onClose, initialMode = 'login' }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Errors
  const [globalError, setGlobalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearErrors = () => {
    setGlobalError('');
    setFieldErrors({});
  };

  const applyValidationErrors = (errors: ValidationError[]) => {
    const map: Record<string, string> = {};
    errors.forEach(e => { map[e.field] = e.message; });
    setFieldErrors(map);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    clearErrors();
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onClose?.(), 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    try {
      if (mode === 'register') {
        const result = await register(username, email, password, confirmPassword);
        if (!result.ok) {
          if (result.validationErrors) applyValidationErrors(result.validationErrors);
          else setGlobalError(result.error || 'Error al registrar');
          return;
        }
        onAuthenticated(result.user!);
      } else {
        const result = await login(email, password);
        if (!result.ok) {
          if (result.validationErrors) applyValidationErrors(result.validationErrors);
          else setGlobalError(result.error || 'Error al iniciar sesión');
          return;
        }
        onAuthenticated(result.user!);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputBase = `w-full px-4 py-3 rounded-full text-sm transition-all outline-none`;
  const inputStyle = (field: string): React.CSSProperties => ({
    background: 'rgba(20, 10, 5, 0.6)',
    border: `1px solid ${fieldErrors[field] ? '#ef4444' : 'rgba(255, 233, 214, 0.15)'}`,
    boxShadow: fieldErrors[field] ? '0 0 0 2px rgba(239,68,68,0.2)' : 'none',
    color: 'var(--cream)',
  });

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!e.currentTarget.classList.contains('error-field')) {
      e.currentTarget.style.border = '1px solid var(--coral)';
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 74, 0.18)';
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>, field: string) => {
    e.currentTarget.style.border = `1px solid ${fieldErrors[field] ? '#ef4444' : 'rgba(255, 233, 214, 0.15)'}`;
    e.currentTarget.style.boxShadow = fieldErrors[field] ? '0 0 0 2px rgba(239,68,68,0.2)' : 'none';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(20, 10, 5, 0.85)',
        backdropFilter: 'blur(12px)',
        transition: 'opacity 0.2s',
        opacity: visible ? 1 : 0,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && onClose) handleClose();
      }}
    >
      <div
        className="w-full max-w-md relative"
        style={{
          transition: 'transform 0.2s, opacity 0.2s',
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Close button */}
        {onClose && (
          <button
            onClick={handleClose}
            className="absolute -top-12 right-0 text-sm font-bold transition-colors px-3 py-1.5 rounded-full"
            style={{
              color: 'var(--cream-soft)',
              background: 'rgba(26, 26, 26, 0.7)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 233, 214, 0.1)',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--cream-soft)')}
          >
            ✕ Cerrar
          </button>
        )}

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center mb-4"
               style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}>
            <img
              src={assetUrl('/assets/pinta-y-gana/Home%20-%20Domin%C3%B3cito-03.svg')}
              alt="Dominócito"
              style={{ height: '40px', width: 'auto' }}
            />
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--cream)', opacity: 0.7 }}>
            {mode === 'login' ? 'Bienvenido de vuelta 👋' : 'Únete a la partida 🎲'}
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-3xl p-7"
          style={{
            background: 'rgba(58, 36, 24, 0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 233, 214, 0.12)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}
        >
          {/* Mode tabs */}
          <div
            className="flex rounded-full p-1 mb-7 gap-1"
            style={{ background: 'rgba(20, 10, 5, 0.6)', border: '1px solid rgba(255, 233, 214, 0.08)' }}
          >
            {(['login', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className="flex-1 py-2.5 rounded-full text-sm font-bold transition-all"
                style={{
                  background: mode === m ? 'var(--coral)' : 'transparent',
                  color: mode === m ? 'var(--white)' : 'var(--cream)',
                  boxShadow: mode === m ? '0 4px 12px var(--coral-shadow)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          {/* Global error */}
          {globalError && (
            <div
              className="rounded-full px-4 py-3 mb-5 text-sm font-medium animate-slide-down"
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fca5a5',
              }}
            >
              ⚠️ {globalError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username — register only */}
            {mode === 'register' && (
              <div className="animate-slide-down">
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider"
                       style={{ color: 'var(--cream)', opacity: 0.7 }}>
                  Nombre de usuario
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Tu apodo en el juego"
                  autoComplete="username"
                  className={inputBase}
                  style={inputStyle('username')}
                  onFocus={handleInputFocus}
                  onBlur={e => handleInputBlur(e, 'username')}
                  disabled={loading}
                />
                {fieldErrors.username && (
                  <p className="text-red-400 text-xs mt-1.5 font-medium pl-3">⚠ {fieldErrors.username}</p>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-wider"
                     style={{ color: 'var(--cream)', opacity: 0.7 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                className={inputBase}
                style={inputStyle('email')}
                onFocus={handleInputFocus}
                onBlur={e => handleInputBlur(e, 'email')}
                disabled={loading}
              />
              {fieldErrors.email && (
                <p className="text-red-400 text-xs mt-1.5 font-medium pl-3">⚠ {fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-wider"
                     style={{ color: 'var(--cream)', opacity: 0.7 }}>
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className={inputBase}
                  style={{ ...inputStyle('password'), paddingRight: '48px' }}
                  onFocus={handleInputFocus}
                  onBlur={e => handleInputBlur(e, 'password')}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-base px-2"
                  style={{ color: 'var(--cream)', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="text-red-400 text-xs mt-1.5 font-medium pl-3">⚠ {fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm password — register only */}
            {mode === 'register' && (
              <div className="animate-slide-down">
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider"
                       style={{ color: 'var(--cream)', opacity: 0.7 }}>
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu contraseña"
                  autoComplete="new-password"
                  className={inputBase}
                  style={inputStyle('confirmPassword')}
                  onFocus={handleInputFocus}
                  onBlur={e => handleInputBlur(e, 'confirmPassword')}
                  disabled={loading}
                />
                {fieldErrors.confirmPassword && (
                  <p className="text-red-400 text-xs mt-1.5 font-medium pl-3">⚠ {fieldErrors.confirmPassword}</p>
                )}
              </div>
            )}

            {/* Forgot password — login only */}
            {mode === 'login' && (
              <div className="text-right pr-3">
                <button
                  type="button"
                  className="text-xs transition-colors"
                  style={{ color: 'var(--cream)', opacity: 0.5, background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--cream)'; e.currentTarget.style.opacity = '0.5'; }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full font-black text-base transition-all relative overflow-hidden"
              style={{
                background: loading
                  ? 'rgba(58, 36, 24, 0.8)'
                  : 'var(--coral)',
                color: loading ? 'var(--cream)' : 'var(--white)',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 20px var(--coral-shadow)',
                marginTop: '12px',
                border: 'none',
                fontSize: '15px',
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 8px 28px var(--coral-glow)';
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = loading ? 'none' : '0 4px 20px var(--coral-shadow)';
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Procesando...
                </span>
              ) : mode === 'login' ? (
                '▶ Entrar a jugar'
              ) : (
                '🎲 Crear cuenta y jugar'
              )}
            </button>
          </form>

          {/* Register disclaimer */}
          {mode === 'register' && (
            <p className="text-center text-xs mt-5" style={{ color: 'var(--cream)', opacity: 0.5 }}>
              Al registrarte aceptas jugar responsablemente.<br />
              El registro es completamente gratuito.
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs mt-5 logo-mark"
           style={{ color: 'var(--cream)', opacity: 0.6 }}>
          Dominócito · Pinta y Gana
        </p>
      </div>
    </div>
  );
}
