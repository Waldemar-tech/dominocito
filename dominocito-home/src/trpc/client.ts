import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../backend/src/trpc/appRouter';

/**
 * Cliente tRPC tipado end-to-end.
 * El tipo `AppRouter` viene del backend → cualquier cambio en el router
 * rompe el build del front automáticamente.
 */
export const trpc = createTRPCReact<AppRouter>();

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('dc_access_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}
