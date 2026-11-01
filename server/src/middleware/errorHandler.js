import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError, z } from 'zod';

import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

export function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Each file must be 5 MB or smaller',
  LIMIT_FILE_COUNT: `Too many files: upload at most ${config.upload.maxFiles} at a time`,
  LIMIT_UNEXPECTED_FILE: 'Too many files, or files not sent under the "files" field',
  LIMIT_FIELD_COUNT: 'Only files are accepted in this upload',
};

/** Translate known library errors into AppErrors with sensible status codes. */
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return new AppError(400, 'Validation failed', z.flattenError(err).fieldErrors);
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return new AppError(status, MULTER_MESSAGES[err.code] ?? err.message);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError(409, 'A record with these details already exists');
    if (err.code === 'P2025') return new AppError(404, 'Record not found');
  }

  // Malformed JSON body (from express.json).
  if (err.type === 'entity.parse.failed') return new AppError(400, 'Request body is not valid JSON');
  if (err.type === 'entity.too.large') return new AppError(413, 'Request body is too large');

  return err;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(rawErr, req, res, next) {
  const err = normalize(rawErr);
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  if (statusCode >= 500) {
    console.error(rawErr);
  }

  res.status(statusCode).json({
    error: {
      message: statusCode >= 500 && config.isProduction ? 'Internal server error' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}
