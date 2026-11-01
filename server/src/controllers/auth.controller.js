import bcrypt from 'bcryptjs';

import { signToken } from '../middleware/auth.js';
import { AppError } from '../utils/AppError.js';
import { prisma } from '../utils/prisma.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email doesn't exist, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_ROUNDS);

const publicUser = ({ id, name, email, createdAt }) => ({ id, name, email, createdAt });

export async function register(req, res) {
  const { name, email, password } = req.valid.body;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) },
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new AppError(401, 'Invalid email or password');

  res.json({ token: signToken(user), user: publicUser(user) });
}

export async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  // The token can outlive the account.
  if (!user) throw new AppError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
}
