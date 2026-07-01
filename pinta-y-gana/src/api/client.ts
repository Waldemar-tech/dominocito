// API Client — conecta frontend con backend Dominócito
// Usa path relativo /api para que nginx haga proxy_pass a localhost:3200
// En dev local (Vite), Vite proxy también puede manejar /api

const BASE_URL = '/api';

function getToken(): string | null {
  const auth = localStorage.getItem('dominocito_auth');
  if (!auth) return null;
  try {
    return JSON.parse(auth).token || null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Error desconocido');
  return data;
}

// Auth
export const api = {
  auth: {
    register: (username: string, email: string, password: string) =>
      request<{ token: string; user: object }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),
    login: (email: string, password: string) =>
      request<{ token: string; user: object }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ user: object }>('/auth/me'),
  },

  sorteos: {
    current: () => request<any>('/sorteos/current'),
    get: (id: number) => request<any>(`/sorteos/${id}`),
    bet: (sorteo_id: number, domino_id: number, amount_eur: number) =>
      request<any>('/sorteos/bet', {
        method: 'POST',
        body: JSON.stringify({ sorteo_id, domino_id, amount_eur }),
      }),
  },

  wallet: {
    get: () => request<{ balance_eur: number }>('/wallet'),
    add: (amount_eur: number) =>
      request<any>('/wallet/add', {
        method: 'POST',
        body: JSON.stringify({ amount_eur }),
      }),
  },

  admin: {
    crearSorteo: () =>
      request<any>('/admin/sorteos/crear', { method: 'POST' }),
    revelarSorteo: (id: number) =>
      request<any>(`/admin/sorteos/${id}/revelar`, { method: 'POST' }),
  },
};
