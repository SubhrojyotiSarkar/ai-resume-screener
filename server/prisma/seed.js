/**
 * Seed a demo recruiter, a demo job and five sample resumes (parsed and scored).
 *
 *   npm run db:seed                                  (local, reads ../.env)
 *   docker compose exec server npm run db:seed       (inside Docker)
 *
 * Needs the database, storage and matcher to be running. Safe to run repeatedly:
 * the recruiter is upserted and the job is only created once.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import bcrypt from 'bcryptjs';

import { ingestResume } from '../src/services/resumeIngest.js';
import { scoreApplications } from '../src/services/scoring.js';
import { prisma } from '../src/utils/prisma.js';

const DATA_DIR = path.join(import.meta.dirname, 'seed-data');
const JOB_TITLE = 'Senior Full-Stack Engineer (Demo)';
const REQUIRED_SKILLS = ['Python', 'FastAPI', 'React', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS'];

async function main() {
  const email = (process.env.SEED_DEMO_EMAIL ?? 'demo@example.com').toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Set SEED_DEMO_PASSWORD (at least 8 characters) to seed the demo recruiter.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const recruiter = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { name: 'Demo Recruiter', email, passwordHash },
  });
  console.log(`Demo recruiter ready: ${email}`);

  const existing = await prisma.job.findFirst({ where: { recruiterId: recruiter.id, title: JOB_TITLE } });
  if (existing) {
    console.log(`Demo job already exists (${existing.id}); nothing else to do.`);
    return;
  }

  const job = await prisma.job.create({
    data: {
      recruiterId: recruiter.id,
      title: JOB_TITLE,
      description: (await readFile(path.join(DATA_DIR, 'job-description.txt'), 'utf8')).trim(),
      requiredSkills: REQUIRED_SKILLS,
    },
  });
  console.log(`Created demo job: ${job.title}`);

  const resumeDir = path.join(DATA_DIR, 'resumes');
  const created = [];
  for (const fileName of (await readdir(resumeDir)).sort()) {
    const buffer = await readFile(path.join(resumeDir, fileName));
    const outcome = await ingestResume(job.id, { originalname: fileName, buffer });
    if (outcome.ok) created.push(outcome.application);
    console.log(`  ${outcome.ok ? 'parsed' : 'FAILED'}  ${fileName}${outcome.ok ? '' : `: ${outcome.error}`}`);
  }

  await scoreApplications(job, created);
  const ranked = await prisma.application.findMany({
    where: { jobId: job.id },
    orderBy: { matchScore: 'desc' },
    include: { resume: { select: { candidateName: true } } },
  });
  console.log('Ranked candidates:');
  ranked.forEach((a, i) => console.log(`  #${i + 1}  ${a.matchScore?.toFixed(1).padStart(5)}  ${a.resume.candidateName}`));
}

main()
  .catch((err) => {
    console.error(`Seeding failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
