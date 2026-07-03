import { initTRPC, TRPCError } from '@trpc/server';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { JwtPayload, AuthUser } from '../types';

/**
 * tRPC Context — disponible en todos los procedures.
 * El userId se extrae del JWT si está presente (procedures públicos como login
 * funcionan sin auth; procedures con `protectedProcedure` lo requieren).
 */
export interface Context {
  userId: number | null;
  user: AuthUser | null;
  req: Request;
}

export function createContext({ req }: { req: Request }): Context {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, user: null, req };
  }
  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { userId: null, user: null, req };
  }
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    if (!payload.userId || !payload.email || !payload.username) {
      return { userId: null, user: null, req };
    }
    return {
      userId: payload.userId,
      user: { id: payload.userId, email: payload.email, username: payload.username },
      req,
    };
  } catch {
    return { userId: null, user: null, req };
  }
}

const t = initTRPC.context<Context>().create();

/**
 * Middleware: exige JWT válido. Lanza UNAUTHORIZED si no hay.
 */
const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.userId || !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Token requerido' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, user: ctx.user } });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(requireUser);
