import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;

  setSession: (user: AuthUser, tokens: AuthTokens) => void;
  setUser: (user: AuthUser | null) => void;
  updateTokens: (tokens: Partial<AuthTokens>) => void;
  logout: () => void;
}

/**
 * Store de sesión — fuente única de verdad para auth.
 * Se persiste en localStorage con la clave `dc_auth_v1`.
 * Cualquier componente puede suscribirse con selectores para evitar
 * re-renders innecesarios.
 *
 * Mantiene compat con los nombres de claves legacy (`dc_access_token`,
 * `dc_refresh_token`, `dc_user_id`, `dc_username`) durante la migración.
 * Eso permite migrar HomePage / AuthScreen / Lobby / Room de a uno sin
 * romper nada que aún use localStorage directo.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,

      setSession: (user, tokens) =>
        set({
          user,
          tokens,
          isAuthenticated: true,
        }),

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      updateTokens: (tokens) =>
        set((state) => ({
          tokens: state.tokens ? { ...state.tokens, ...tokens } : null,
        })),

      logout: () =>
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'dc_auth_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

/**
 * Helper para migrar de las claves legacy (`dc_access_token`, etc.) al store.
 * Llamar una vez al boot. Es idempotente: si el store ya tiene sesión, no toca nada.
 */
export function migrateLegacyAuth(): void {
  const access = localStorage.getItem('dc_access_token');
  if (!access) return;
  const refresh = localStorage.getItem('dc_refresh_token');
  const username = localStorage.getItem('dc_username');
  const userId = localStorage.getItem('dc_user_id');
  if (!refresh || !username || !userId) return;

  const state = useAuthStore.getState();
  if (state.isAuthenticated) return; // ya migrado

  // El email no se persistía en legacy; usar un placeholder que será
  // sobrescrito por useMe() cuando el provider tRPC entre en acción.
  state.setSession(
    { id: Number(userId), username, email: '' },
    { accessToken: access, refreshToken: refresh }
  );
}
