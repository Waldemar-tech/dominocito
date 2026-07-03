import { router } from './trpc';
import { authRouter } from './routers/auth';
import { dominoRouter } from './routers/domino';
import { walletRouter } from './routers/wallet';
import { sorteosRouter } from './routers/sorteos';

export const appRouter = router({
  auth: authRouter,
  domino: dominoRouter,
  wallet: walletRouter,
  sorteos: sorteosRouter,
});

export type AppRouter = typeof appRouter;
