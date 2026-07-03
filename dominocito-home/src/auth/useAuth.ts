import { trpc } from '../trpc/client';

/**
 * Hooks de auth via tRPC. Sustituirán los fetch manuales a /api/auth/*.
 * - `useLogin()`: mutation para login
 * - `useMe()`: query que requiere token; se desactiva si no hay sesión
 */
export function useLogin() {
  return trpc.auth.login.useMutation();
}

export function useMe(enabled = true) {
  return trpc.auth.me.useQuery(undefined, { enabled });
}
