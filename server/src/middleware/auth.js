import jwt from 'jsonwebtoken';

import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

export function signToken(user) {
  return jwt.sign({}, config.jwt.secret, {
    subject: user.id,
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256',
  });
}

/** Require a valid `Authorization: Bearer <jwt>` header; sets `req.userId`. */
export function requireAuth(req, res, next) {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
    req.userId = payload.sub;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}
