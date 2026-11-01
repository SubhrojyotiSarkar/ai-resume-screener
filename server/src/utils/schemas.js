import { z } from 'zod';

// Query strings send "" for cleared filters; treat that as "not provided".
const emptyToUndefined = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);

export const idParams = z.object({ id: z.uuid('Invalid id') });

// ---------- Auth ----------
// Normalize first, then validate: zod checks formats before later .trim() calls run.
const email = z
  .string('Email is required')
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

// bcrypt silently ignores everything after 72 *bytes*, so longer passwords would collide.
const passwordBytes = (value) => Buffer.byteLength(value, 'utf8') <= 72;

export const registerBody = z.object({
  name: z.string('Name is required').trim().min(1, 'Name is required').max(100),
  email,
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .refine(passwordBytes, 'Password is too long'),
});

export const loginBody = z.object({
  email,
  password: z.string('Password is required').min(1, 'Password is required').refine(passwordBytes, 'Password is too long'),
});

// ---------- Jobs ----------
const requiredSkills = z
  .array(z.string().trim().max(50, 'Each skill must be at most 50 characters'))
  .max(50, 'At most 50 required skills')
  .default([])
  // Drop blanks and de-duplicate case-insensitively, keeping the first spelling.
  .transform((skills) => {
    const seen = new Set();
    return skills.filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  });

export const jobBody = z.object({
  title: z.string('Title is required').trim().min(1, 'Title is required').max(200),
  description: z
    .string('Description is required')
    .trim()
    .min(20, 'Description must be at least 20 characters')
    .max(20_000, 'Description must be at most 20,000 characters'),
  requiredSkills,
});

export const candidatesQuery = z.object({
  sort: emptyToUndefined(z.enum(['score', 'date', 'name']).default('score')),
  status: emptyToUndefined(z.enum(['NEW', 'SHORTLISTED', 'REJECTED']).optional()),
  minScore: emptyToUndefined(z.coerce.number().min(0).max(100).optional()),
});

// ---------- Applications ----------
export const applicationStatusBody = z.object({
  status: z.enum(['NEW', 'SHORTLISTED', 'REJECTED']),
});
