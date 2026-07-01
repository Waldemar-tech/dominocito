import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Helper: get IP string from request, then normalize via ipKeyGenerator.
 * This handles IPv4-mapped IPv6 addresses correctly.
 */
function getIpKey(req: Request): string {
  const ip = req.ip || req.socket?.remoteAddress || '0.0.0.0';
  try {
    return ipKeyGenerator(ip);
  } catch {
    return ip; // fallback if ipKeyGenerator fails (e.g., unknown format)
  }
}

/**
 * Rate limiter for POST /auth/login — max 5 attempts per minute per IP
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login. Espera 1 minuto.' },
  keyGenerator: getIpKey,
});

/**
 * Rate limiter for POST /auth/register — max 3 per minute per IP
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de registro. Espera 1 minuto.' },
  keyGenerator: getIpKey,
});

/**
 * Rate limiter for POST /sorteos/bet — max 10 per minute per user.
 * Since requireAuth runs before this, req.user.id is available.
 * Falls back to IP for requests without user context.
 */
export const betLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas apuestas en poco tiempo. Espera 1 minuto.' },
  keyGenerator: (req: Request) => {
    // User-based rate limiting (more precise than IP for authenticated endpoints)
    const authReq = req as any;
    if (authReq.user?.id) {
      return `user_${authReq.user.id}`;
    }
    return getIpKey(req);
  },
  // Disable IP-specific validation since we use user ID as key for authenticated requests
  validate: { xForwardedForHeader: false, ip: false },
});
