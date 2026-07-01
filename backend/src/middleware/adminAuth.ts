import { Request, Response, NextFunction } from 'express';

/**
 * Admin authentication middleware.
 * Requires X-Admin-Key header matching ADMIN_API_KEY env var.
 * In development, also allows requests from localhost without key
 * if ADMIN_LOCALHOST_ONLY=true.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  const localhostOnly = process.env.ADMIN_LOCALHOST_ONLY === 'true';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // In development with ADMIN_LOCALHOST_ONLY=true, allow localhost without key
  if (nodeEnv === 'development' && localhostOnly) {
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
    if (isLocal) {
      next();
      return;
    }
  }

  // Always require API key in production, or when not localhost in dev
  if (!adminKey) {
    console.error('⚠️  ADMIN_API_KEY not set — admin endpoints are BLOCKED');
    res.status(503).json({ error: 'Admin endpoints not configured' });
    return;
  }

  const providedKey = req.headers['x-admin-key'] as string | undefined;

  if (!providedKey || providedKey !== adminKey) {
    res.status(401).json({ error: 'Admin key inválido o ausente' });
    return;
  }

  next();
}
