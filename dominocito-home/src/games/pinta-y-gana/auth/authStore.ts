// ============================================================
// authStore.ts — Authentication store (unificado con dc_* keys)
// ============================================================
// Usa las mismas keys que el home (`dominocito-home`) para que:
// - Un login en el home sea visible en el sub-app automáticamente (SSO)
// - Un logout en cualquiera de los dos borre la sesión en ambos
// - No haya duplicación de state
//
// Keys estándar (escritas por el home, leídas acá):
//   - dc_access_token   → JWT access token (15min)
//   - dc_refresh_token  → JWT refresh token (7d)
//   - dc_user_id        → ID del usuario
//   - dc_username       → username para mostrar en UI
// ============================================================

const BACKEND_URL = '/api';

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

export interface UserWallet {
  balance: number;
  currency: 'EUR';
}

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  wallet: UserWallet;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface AuthResult {
  ok: boolean;
  user?: User;
  error?: string;
  validationErrors?: ValidationError[];
}

// ----------------------------------------------------------
// Session (unificada con keys dc_*)
// ----------------------------------------------------------

/** Lee la sesión desde las keys estándar dc_*. */
export function loadSession(): {
  token: string;
  refreshToken: string | null;
  user: Pick<User, 'id' | 'username' | 'email'>;
} | null {
  const token = localStorage.getItem('dc_access_token');
  const userId = localStorage.getItem('dc_user_id');
  const username = localStorage.getItem('dc_username');
  if (!token || !userId || !username) return null;

  return {
    token,
    refreshToken: localStorage.getItem('dc_refresh_token'),
    user: {
      id: userId,
      username,
      email: '', // se completa vía /auth/me si hace falta
    },
  };
}

function saveSession(session: { token: string; refreshToken?: string; user: { id: string; username: string } }): void {
  localStorage.setItem('dc_access_token', session.token);
  localStorage.setItem('dc_user_id', session.user.id);
  localStorage.setItem('dc_username', session.user.username);
  if (session.refreshToken) {
    localStorage.setItem('dc_refresh_token', session.refreshToken);
  }
}

function clearSession(): void {
  localStorage.removeItem('dc_access_token');
  localStorage.removeItem('dc_refresh_token');
  localStorage.removeItem('dc_user_id');
  localStorage.removeItem('dc_username');
}

export function getToken(): string | null {
  return loadSession()?.token || null;
}

// ----------------------------------------------------------
// Backend check (used by health monitoring if needed)
// ----------------------------------------------------------

export async function isBackendAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------
// Validation
// ----------------------------------------------------------

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ----------------------------------------------------------
// Auth functions
// ----------------------------------------------------------

export async function register(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
): Promise<AuthResult> {
  const errors: ValidationError[] = [];
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (trimmedUsername.length < 3) errors.push({ field: 'username', message: 'El usuario debe tener al menos 3 caracteres' });
  if (!validateEmail(trimmedEmail)) errors.push({ field: 'email', message: 'Email inválido' });
  if (password.length < 8) errors.push({ field: 'password', message: 'La contraseña debe tener al menos 8 caracteres' });
  if (password !== confirmPassword) errors.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden' });
  if (errors.length > 0) return { ok: false, validationErrors: errors };

  try {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmedUsername, email: trimmedEmail, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Error al registrar' };

    saveSession({
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: { id: String(data.user.id), username: data.user.username },
    });

    const user: User = {
      id: String(data.user.id),
      username: data.user.username,
      email: data.user.email,
      createdAt: data.user.created_at,
      wallet: { balance: 0, currency: 'EUR' },
    };
    return { ok: true, user };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!validateEmail(trimmedEmail)) return { ok: false, error: 'Email inválido' };
  if (!password) return { ok: false, error: 'Introduce la contraseña' };

  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, password }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Credenciales incorrectas' };

    saveSession({
      token: data.access_token,
      refreshToken: data.refresh_token,
      user: { id: String(data.user.id), username: data.user.username },
    });

    // Obtener balance del wallet
    let balance = 0;
    try {
      const wRes = await fetch(`${BACKEND_URL}/wallet`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (wRes.ok) {
        const wData = await wRes.json();
        balance = parseFloat(wData.balance_eur) || 0;
      }
    } catch { /* ignore */ }

    const user: User = {
      id: String(data.user.id),
      username: data.user.username,
      email: data.user.email,
      createdAt: data.user.created_at,
      wallet: { balance, currency: 'EUR' },
    };
    return { ok: true, user };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

export function logout(): void {
  clearSession();
}

export function getCurrentUser(): User | null {
  const session = loadSession();
  if (!session) return null;

  // Refrescar email y datos completos desde backend en background.
  refreshFromBackend(session.token).catch(() => {});

  return {
    id: session.user.id,
    username: session.user.username,
    email: session.user.email,
    createdAt: '',
    wallet: { balance: 0, currency: 'EUR' },
  };
}

async function refreshFromBackend(token: string): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const session = loadSession();
    if (!session) return;
    session.user.email = data.user?.email ?? '';
    // No tocamos el resto de la sesión, solo email para evitar
    // inconsistencias con keys dc_*
  } catch {
    /* ignore */
  }
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

export function syncWalletBalance(userId: string, balance: number): void {
  // No-op: el balance ahora viene del backend en cada refresh.
  // Mantenido por compatibilidad con código existente.
  void userId;
  void balance;
}

export async function addTestingFunds(userId: string, amount: number): Promise<User | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/wallet/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount_eur: amount }),
    });
    if (res.ok) {
      const data = await res.json();
      const session = loadSession();
      if (session) {
        return {
          id: session.user.id,
          username: session.user.username,
          email: session.user.email,
          createdAt: '',
          wallet: { balance: parseFloat(data.balance_eur) || 0, currency: 'EUR' },
        };
      }
    }
  } catch { /* ignore */ }
  void userId;
  return null;
}