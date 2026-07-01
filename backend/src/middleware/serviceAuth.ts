/**
 * Service-to-service authentication middleware.
 *
 * Validates the X-Service-Token header for internal API calls.
 * Used on /admin/* routes in addition to the existing X-Admin-Key check.
 *
 * Token: configured via SERVICE_TOKEN env var (32 bytes hex).
 * Generate: openssl rand -hex 32
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requireServiceToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const serviceToken = process.env.SERVICE_TOKEN;

  // If SERVICE_TOKEN is not configured, skip this check (backward compat)
  if (!serviceToken) {
    next();
    return;
  }

  const provided = req.headers['x-service-token'];

  if (!provided || typeof provided !== 'string') {
    res.status(401).json({ error: 'X-Service-Token header requerido para acceso interno' });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(serviceToken, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');

    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      res.status(403).json({ error: 'Service token inválido' });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Service token inválido' });
    return;
  }

  next();
}
