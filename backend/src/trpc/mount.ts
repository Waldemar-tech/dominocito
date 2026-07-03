import { Application } from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './appRouter';
import { createContext } from './trpc';

/**
 * Monta tRPC bajo /trpc. Coexiste con las rutas REST existentes.
 * El frontend usa fetch /trpc/{procedure} y obtiene type-safety
 * importando `AppRouter` desde el backend.
 */
export function mountTrpc(app: Application): void {
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req }) => createContext({ req }),
    })
  );
}
