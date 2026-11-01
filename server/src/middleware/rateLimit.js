import rateLimit from 'express-rate-limit';

const rateLimitMessage = { error: { message: 'Too many requests, please try again later' } };

/** Slow down credential stuffing on login/register: 20 attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts, please try again later' } },
});

/**
 * Uploads are the most expensive endpoint (storage + parsing + embeddings), so cap
 * them per recruiter: 30 batches (up to 600 resumes) per 15 minutes.
 * Must run after requireAuth so `req.userId` is set.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.userId,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitMessage,
});
