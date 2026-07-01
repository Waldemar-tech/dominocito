import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JwtPayload } from '../types';

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // JWT_SECRET must be set (enforced at startup in index.ts)
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('CRITICAL: JWT_SECRET not set — rejecting all auth requests');
    res.status(500).json({ error: 'Error de configuración del servidor' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;

    // Extra validation: ensure payload has required fields
    if (!payload.userId || !payload.email || !payload.username) {
      res.status(401).json({ error: 'Token inválido: payload incompleto' });
      return;
    }

    req.user = {
      id: payload.userId,
      username: payload.username,
      email: payload.email,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expirado. Vuelve a iniciar sesión.' });
    } else if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Token inválido' });
    } else {
      res.status(401).json({ error: 'Error de autenticación' });
    }
  }
}
