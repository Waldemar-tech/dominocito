import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState, type ReactNode } from 'react';
import { trpc, getAuthHeaders } from './client';

/**
 * Provider tRPC + React Query.
 * - `httpBatchLink` agrupa calls en una sola request HTTP.
 * - `getAuthHeaders` se evalúa en cada request → soporta login/logout sin recargar.
 */
export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/trpc',
          headers: getAuthHeaders,
        }),
      ],
    })
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
