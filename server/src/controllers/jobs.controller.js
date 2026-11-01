import { MatcherError, deleteParsedResumes, toAppError } from '../services/matcher.js';
import { rescoreJob } from '../services/scoring.js';
import { deleteFiles } from '../services/storage.js';
import { prisma } from '../utils/prisma.js';

function toJobResponse(job, { candidateCount = 0, topScore = null } = {}) {
  const { id, title, description, requiredSkills, createdAt, updatedAt } = job;
  return { id, title, description, requiredSkills, createdAt, updatedAt, candidateCount, topScore };
}

/** Candidate count and best match score for each job id. */
async function getJobStats(jobIds) {
  const rows = await prisma.application.groupBy({
    by: ['jobId'],
    where: { jobId: { in: jobIds } },
    _count: { _all: true },
    _max: { matchScore: true },
  });
  return new Map(rows.map((r) => [r.jobId, { candidateCount: r._count._all, topScore: r._max.matchScore }]));
}

export async function listJobs(req, res) {
  const jobs = await prisma.job.findMany({
    where: { recruiterId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  const stats = await getJobStats(jobs.map((j) => j.id));
  res.json({ jobs: jobs.map((job) => toJobResponse(job, stats.get(job.id))) });
}

export async function createJob(req, res) {
  const job = await prisma.job.create({
    data: { ...req.valid.body, recruiterId: req.userId },
  });
  res.status(201).json({ job: toJobResponse(job) });
}

export async function getJob(req, res) {
  const stats = await getJobStats([req.job.id]);
  res.json({ job: toJobResponse(req.job, stats.get(req.job.id)) });
}

/** Update a job. Scores are not recalculated here: the client calls /rescore afterwards. */
export async function updateJob(req, res) {
  const job = await prisma.job.update({ where: { id: req.job.id }, data: req.valid.body });
  const stats = await getJobStats([job.id]);
  res.json({ job: toJobResponse(job, stats.get(job.id)) });
}

/** Delete a job together with its candidates' resumes, stored files and parsed documents. */
export async function deleteJob(req, res) {
  const resumes = await prisma.resume.findMany({
    where: { applications: { some: { jobId: req.job.id } } },
    select: { id: true, fileKey: true, mongoDocId: true },
  });

  await prisma.$transaction([
    prisma.job.delete({ where: { id: req.job.id } }), // cascades to applications
    prisma.resume.deleteMany({ where: { id: { in: resumes.map((r) => r.id) } } }),
  ]);

  // The database is the source of truth; failing to clean up external copies is logged, not fatal.
  const cleanup = await Promise.allSettled([
    deleteFiles(resumes.map((r) => r.fileKey)),
    resumes.length ? deleteParsedResumes(resumes.map((r) => r.mongoDocId)) : null,
  ]);
  for (const result of cleanup) {
    if (result.status === 'rejected') console.error(`Cleanup after deleting job ${req.job.id} failed:`, result.reason);
  }

  res.status(204).end();
}

export async function rescore(req, res) {
  try {
    const rescored = await rescoreJob(req.job);
    res.json({ rescored });
  } catch (err) {
    throw err instanceof MatcherError ? toAppError(err) : err;
  }
}
