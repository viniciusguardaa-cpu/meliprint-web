import rateLimit from 'express-rate-limit';

// General API rate limiter - 100 requests per minute
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiter - 10 requests per minute (stricter for login attempts)
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Muitas tentativas de login. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Subscription/checkout rate limiter - 5 requests per minute
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Labels download rate limiter - 30 requests per minute
export const labelsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Limite de downloads atingido. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook rate limiter - more permissive for Mercado Pago callbacks
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
