import './loadEnv.js';
import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';

// Initialize Sentry (must be before other imports that might throw)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // Capture 10% of transactions for performance
  });
  console.log('🔍 Sentry error tracking enabled');
}
import cookieParser from 'cookie-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { initDatabase } from './db.js';
import { assertRequiredEnv } from './env.js';
import authRoutes from './routes/auth.js';
import shipmentsRoutes from './routes/shipments.js';
import labelsRoutes from './routes/labels.js';
import subscriptionRoutes from './routes/subscription.js';
import adminRoutes from './routes/admin.js';
import autoPrintRoutes from './routes/autoPrint.js';
import healthRoutes from './routes/health.js';
import notificationsRoutes from './routes/notifications.js';
import agentRoutes from './routes/agent.js';
import plansRoutes from './routes/plans.js';
import analyticsRoutes from './routes/analytics.js';
import toolsRoutes from './routes/tools.js';
import { startAutoPrintPoller } from './jobs/autoPrintPoller.js';
import { startBillingReconciler } from './jobs/billingReconciler.js';
import { generalLimiter, authLimiter, labelsLimiter, checkoutLimiter, webhookLimiter } from './middleware/rateLimiter.js';
import { correlationId, requestLogger } from './middleware/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Request correlation id + structured logging (must be before routes)
app.use(correlationId);
app.use(requestLogger);

app.set('trust proxy', 1);

// Session store: Redis (faster) > PostgreSQL (persistent) > Memory (dev only)
function getSessionStore() {
  if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL);
    redis.on('error', (err) => console.error('Redis error:', err));
    console.log('📦 Using Redis for sessions');
    return new RedisStore({ client: redis });
  }
  
  if (process.env.DATABASE_URL) {
    const PgStore = connectPgSimple(session);
    console.log('📦 Using PostgreSQL for sessions');
    return new PgStore({ pool, tableName: 'session' });
  }
  
  console.warn('⚠️  No session store configured - using in-memory (not for production)');
  return undefined;
}

app.use(session({
  store: getSessionStore(),
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'labelgo-dev-secret'),
  resave: false,
  saveUninitialized: false,
  rolling: true, // reset maxAge on every request, so active users don't get logged out
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days (session is refreshed on every /api/auth/me call)
  }
}));

// Apply rate limiters per route
app.use('/api/health', healthRoutes);
app.use('/api/plans', generalLimiter, plansRoutes);
app.use('/api/analytics', generalLimiter, analyticsRoutes);
app.use('/api/tools', generalLimiter, toolsRoutes);
app.use('/api/notifications', webhookLimiter, notificationsRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/shipments', generalLimiter, shipmentsRoutes);
app.use('/api/labels', labelsLimiter, labelsRoutes);
app.use('/api/subscription/webhook', webhookLimiter);
app.use('/api/subscription/checkout', checkoutLimiter);
app.use('/api/subscription', generalLimiter, subscriptionRoutes);
app.use('/api/admin', generalLimiter, adminRoutes);
app.use('/api/auto-print', generalLimiter, autoPrintRoutes);
app.use('/api/agent', agentRoutes); // has its own stricter limiter on /pair

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Global error handler - must be after routes
Sentry.setupExpressErrorHandler(app);

async function start() {
  // Fail-closed: refuse to boot in production if required secrets are missing.
  assertRequiredEnv();

  if (process.env.DATABASE_URL) {
    await initDatabase();
  } else {
    console.warn('⚠️  DATABASE_URL not set - using in-memory sessions (not recommended for production)');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    // Start auto-print poller only if database is configured
    if (process.env.DATABASE_URL) {
      startAutoPrintPoller();
      startBillingReconciler();
    }
  });
}

start().catch(console.error);
