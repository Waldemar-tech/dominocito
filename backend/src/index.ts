import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { testConnection } from './db/pool';
import { initSigningKeys } from './crypto/signing';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Routes
import authRoutes from './routes/auth';
import sorteoRoutes from './routes/sorteos';
import adminRoutes from './routes/admin';
import walletRoutes from './routes/wallet';
import dominoRoutes from './routes/domino';

// tRPC (migración incremental — Fase 2.2)
import { mountTrpc } from './trpc/mount';

// Realtime
import { setupDominoSocket } from './realtime/domino-socket';

dotenv.config();

// ─── Safety checks at startup ────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_API_KEY) {
  console.error('❌ FATAL: ADMIN_API_KEY must be set in production. Refusing to start.');
  process.exit(1);
}

// Warn about missing security vars (non-fatal in dev)
if (!process.env.ENCRYPTION_KEY) {
  console.warn('⚠️  ENCRYPTION_KEY not set — sensitive fields will be stored as plaintext (dev mode).');
  console.warn('   Generate with: openssl rand -hex 32');
}

if (!process.env.SERVICE_TOKEN) {
  console.warn('⚠️  SERVICE_TOKEN not set — service-to-service auth disabled.');
}

const app = express();
const PORT = parseInt(process.env.PORT || '3200');
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Security Headers (Helmet) ────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
}));

// ─── CORS ─────────────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  console.warn('⚠️  CORS_ORIGIN not set — defaulting to http://localhost:5173');
}

app.use(cors({
  origin: corsOrigin || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'X-Service-Token'],
}));

// ─── Request Logging (Morgan) ─────────────────────────────────
const morganFormat = NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  skip: (req) => req.url === '/health',
}));

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Trust Proxy ─────────────────────────────────────────────
if (NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'dominocito-backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    env: NODE_ENV,
    security: {
      jwt_short_lived: true,
      refresh_tokens: true,
      email_encryption: Boolean(process.env.ENCRYPTION_KEY),
      ecdsa_signing: true,
      provably_fair: true,
    },
  });
});

// ─── API Info ─────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: '🎲 Dominócito - Pinta y Gana API',
    version: '2.0.0',
    security_features: [
      'JWT 15min + Refresh Token rotation (7d)',
      'AES-256-GCM email + transaction encryption',
      'ECDSA P-256 sorteo result signing',
      'Provably Fair RNG (server_seed + client_seed)',
      'Service-to-service token auth',
    ],
    endpoints: {
      auth: [
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/refresh    ← NEW: renew access token',
        'POST /auth/logout     ← NEW: revoke refresh token',
        'GET  /auth/me',
      ],
      sorteos: [
        'GET  /sorteos/current',
        'GET  /sorteos/public-key    ← NEW: ECDSA public key',
        'GET  /sorteos/:id',
        'GET  /sorteos/:id/verify   ← NEW: verify ECDSA signature',
        'POST /sorteos/bet           ← supports client_seed param',
      ],
      wallet: [
        'GET  /wallet',
        'POST /wallet/add (testing only)',
      ],
      admin: [
        'POST /admin/sorteos/crear   (X-Admin-Key + X-Service-Token)',
        'POST /admin/sorteos/:id/revelar (X-Admin-Key + X-Service-Token)',
        'GET  /admin/stats           (X-Admin-Key + X-Service-Token)',
      ],
    },
  });
});

// ─── tRPC (incremental, coexiste con REST) ──────────────────
mountTrpc(app);

// ─── Routes ───────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/sorteos', sorteoRoutes);
app.use('/admin', adminRoutes);
app.use('/wallet', walletRoutes);
app.use('/domino', dominoRoutes);

// ─── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ─── Error handler ────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isDev = NODE_ENV === 'development';
  console.error('Unhandled error:', err.message, isDev ? err.stack : '');
  res.status(500).json({
    error: 'Error interno del servidor',
    ...(isDev && { detail: err.message }),
  });
});

// ─── Start ────────────────────────────────────────────────────
async function main() {
  try {
    await testConnection();

    // Initialize ECDSA signing keys
    initSigningKeys();

    // Create HTTP server (needed for Socket.IO)
    const httpServer = createServer(app);

    // Setup Socket.IO
    const io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigin || 'http://localhost:5173',
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Setup domino realtime handlers
    setupDominoSocket(io);

    httpServer.listen(PORT, () => {
      console.log(`🎲 Dominócito Backend v2.0 running on http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO ready on ws://localhost:${PORT}`);
      console.log(`📡 CORS allowed for: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
      console.log(`🗄️  DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
      console.log(`🔒 JWT: 15min access + 7d refresh tokens`);
      console.log(`🔒 Encryption: ${process.env.ENCRYPTION_KEY ? 'AES-256-GCM enabled' : 'DISABLED (set ENCRYPTION_KEY)'}`);
      console.log(`🔒 ECDSA: P-256 signing enabled`);
      console.log(`🎲 Provably Fair RNG: enabled`);
      console.log(`🁢 Dominó Clásico (Modelo C): Socket.IO rooms enabled`);
      if (NODE_ENV !== 'production') {
        console.log(`⚠️  Running in ${NODE_ENV} mode — some production guards relaxed`);
      }
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

main();
