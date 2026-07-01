// ============================================================
// authStore.ts — Authentication store
// Híbrido: usa backend (vía /api proxy) con fallback a localStorage
// ============================================================

const STORAGE_KEY = 'dominocito_auth';
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
// Session storage (token + user cache)
// ----------------------------------------------------------

interface Session {
  token: string;
  user: User;
}

function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getToken(): string | null {
  return loadSession()?.token || null;
}

// ----------------------------------------------------------
// Backend check
// ----------------------------------------------------------

let _backendAvailable: boolean | null = null;

async function isBackendAvailable(): Promise<boolean> {
  if (_backendAvailable !== null) return _backendAvailable;
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
    _backendAvailable = res.ok;
  } catch {
    _backendAvailable = false;
  }
  return _backendAvailable;
}

// ----------------------------------------------------------
// Validation
// ----------------------------------------------------------

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ----------------------------------------------------------
// localStorage fallback store
// ----------------------------------------------------------

interface StoredUser extends User {
  passwordHash: string;
}

interface LocalStorage {
  users: StoredUser[];
  currentUserId: string | null;
}

function loadLocal(): LocalStorage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + '_local');
    if (!raw) return { users: [], currentUserId: null };
    return JSON.parse(raw) as LocalStorage;
  } catch {
    return { users: [], currentUserId: null };
  }
}

function saveLocal(data: LocalStorage): void {
  localStorage.setItem(STORAGE_KEY + '_local', JSON.stringify(data));
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
  // Validaciones locales primero
  const errors: ValidationError[] = [];
  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim().toLowerCase();

  if (trimmedUsername.length < 3)
    errors.push({ field: 'username', message: 'El usuario debe tener al menos 3 caracteres' });
  if (!validateEmail(trimmedEmail))
    errors.push({ field: 'email', message: 'Email inválido' });
  if (password.length < 8)
    errors.push({ field: 'password', message: 'La contraseña debe tener al menos 8 caracteres' });
  if (password !== confirmPassword)
    errors.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden' });
  if (errors.length > 0) return { ok: false, validationErrors: errors };

  // Intentar backend
  if (await isBackendAvailable()) {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Error al registrar' };

      const user: User = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        createdAt: data.user.created_at,
        wallet: { balance: 0, currency: 'EUR' },
      };
      saveSession({ token: data.token, user });
      return { ok: true, user };
    } catch {
      // caer a localStorage
    }
  }

  // Fallback localStorage
  const storage = loadLocal();
  if (storage.users.some(u => u.email === trimmedEmail))
    return { ok: false, error: 'Ya existe una cuenta con ese email' };
  if (storage.users.some(u => u.username.toLowerCase() === trimmedUsername.toLowerCase()))
    return { ok: false, error: 'Ese nombre de usuario ya está en uso' };

  const passwordHash = await hashPassword(password);
  const newUser: StoredUser = {
    id: crypto.randomUUID(),
    username: trimmedUsername,
    email: trimmedEmail,
    createdAt: new Date().toISOString(),
    wallet: { balance: 0, currency: 'EUR' },
    passwordHash,
  };
  storage.users.push(newUser);
  storage.currentUserId = newUser.id;
  saveLocal(storage);

  const { passwordHash: _ph, ...safeUser } = newUser;
  void _ph;
  saveSession({ token: 'local_' + newUser.id, user: safeUser });
  return { ok: true, user: safeUser };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const errors: ValidationError[] = [];
  const trimmedEmail = email.trim().toLowerCase();

  if (!validateEmail(trimmedEmail))
    errors.push({ field: 'email', message: 'Email inválido' });
  if (!password)
    errors.push({ field: 'password', message: 'Introduce tu contraseña' });
  if (errors.length > 0) return { ok: false, validationErrors: errors };

  // Intentar backend
  if (await isBackendAvailable()) {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Credenciales incorrectas' };

      const user: User = {
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        createdAt: data.user.created_at,
        wallet: { balance: 0, currency: 'EUR' },
      };
      // Obtener balance del wallet
      try {
        const wRes = await fetch(`${BACKEND_URL}/wallet`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (wRes.ok) {
          const wData = await wRes.json();
          user.wallet.balance = parseFloat(wData.balance_eur) || 0;
        }
      } catch { /* ignorar */ }

      saveSession({ token: data.token, user });
      return { ok: true, user };
    } catch {
      // caer a localStorage
    }
  }

  // Fallback localStorage
  const storage = loadLocal();
  const stored = storage.users.find(u => u.email === trimmedEmail);
  if (!stored) return { ok: false, error: 'No existe cuenta con ese email' };
  const hash = await hashPassword(password);
  if (hash !== stored.passwordHash) return { ok: false, error: 'Contraseña incorrecta' };

  storage.currentUserId = stored.id;
  saveLocal(storage);
  const { passwordHash: _ph, ...safeUser } = stored;
  void _ph;
  saveSession({ token: 'local_' + stored.id, user: safeUser });
  return { ok: true, user: safeUser };
}

export function logout(): void {
  clearSession();
  _backendAvailable = null; // reset cache
}

export function getCurrentUser(): User | null {
  return loadSession()?.user || null;
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

export function syncWalletBalance(userId: string, balance: number): void {
  const session = loadSession();
  if (!session || session.user.id !== userId) return;
  session.user.wallet.balance = balance;
  saveSession(session);
}

export async function addTestingFunds(userId: string, amount: number): Promise<User | null> {
  const token = getToken();

  // Intentar backend
  if (token && !token.startsWith('local_') && await isBackendAvailable()) {
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
          session.user.wallet.balance = parseFloat(data.balance_eur) || 0;
          saveSession(session);
          return session.user;
        }
      }
    } catch { /* caer a local */ }
  }

  // Fallback localStorage
  const session = loadSession();
  if (!session || session.user.id !== userId) return null;
  session.user.wallet.balance = parseFloat((session.user.wallet.balance + amount).toFixed(2));
  saveSession(session);
  return session.user;
}
