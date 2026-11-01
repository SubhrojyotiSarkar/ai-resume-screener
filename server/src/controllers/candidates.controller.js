import { config } from '../config.js';
import { MatcherError } from '../services/matcher.js';
import { ingestResume } from '../services/resumeIngest.js';
import { scoreApplications } from '../services/scoring.js';
import { getDownloadUrl, DOWNLOAD_URL_TTL_SECONDS } from '../services/storage.js';
import { AppError } from '../utils/AppError.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { prisma } from '../utils/prisma.js';

const SCORE_ORDER = [{ matchScore: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }];

const SORT_ORDERS = {
  score: SCORE_ORDER,
  date: [{ createdAt: 'desc' }],
  name: [{ resume: { candidateName: 'asc' } }],
};

const RESUME_FIELDS = { id: true, candidateName: true, candidateEmail: true, fileName: true, uploadedAt: true };

function toCandidate(application, rank) {
  const { resume, jobId, resumeId, updatedAt, ...rest } = application;
  return { ...rest, rank, resume };
}

/**
 * POST /api/jobs/:id/resumes
 * Store and parse each file (a few at a time), then score the batch with one matcher call.
 * Always responds 200 with a per-file summary; one bad file doesn't fail the others.
 */
export async function uploadResumes(req, res) {
  const files = req.files ?? [];
  if (files.length === 0) throw new AppError(400, 'Attach at least one PDF or DOCX file under "files"');

  const outcomes = await mapWithConcurrency(files, config.upload.concurrency, (file) =>
    ingestResume(req.job.id, file),
  );
  const created = outcomes.filter((o) => o.ok).map((o) => o.application);

  // Resumes are saved even if scoring fails; they show as unscored until /rescore succeeds.
  let scoring = { ok: true, error: null };
  if (created.length > 0) {
    try {
      await scoreApplications(req.job, created);
    } catch (err) {
      if (!(err instanceof MatcherError)) throw err;
      scoring = { ok: false, error: `Resumes were saved but could not be scored: ${err.message}` };
    }
  }

  const scores = new Map(
    (
      await prisma.application.findMany({
        where: { id: { in: created.map((a) => a.id) } },
        select: { id: true, matchScore: true },
      })
    ).map((a) => [a.id, a.matchScore]),
  );

  const results = files.map((file, i) => {
    const outcome = outcomes[i];
    if (!outcome.ok) return { fileName: file.originalname, ok: false, error: outcome.error };
    const { application } = outcome;
    return {
      fileName: file.originalname,
      ok: true,
      applicationId: application.id,
      resumeId: application.resume.id,
      candidateName: application.resume.candidateName,
      matchScore: scores.get(application.id) ?? null,
    };
  });

  res.json({
    summary: { total: files.length, succeeded: created.length, failed: files.length - created.length },
    scoring,
    results,
  });
}

/** GET /api/jobs/:id/candidates?sort=score|date|name&status=&minScore= */
export async function listCandidates(req, res) {
  const { sort, status, minScore } = req.valid.query;
  const jobId = req.job.id;

  const [candidates, ranked] = await Promise.all([
    prisma.application.findMany({
      where: {
        jobId,
        ...(status && { status }),
        ...(minScore !== undefined && { matchScore: { gte: minScore } }),
      },
      orderBy: SORT_ORDERS[sort],
      include: { resume: { select: RESUME_FIELDS } },
    }),
    // Rank is the position by score across the whole job, independent of filters and sort.
    prisma.application.findMany({ where: { jobId }, orderBy: SCORE_ORDER, select: { id: true, matchScore: true } }),
  ]);

  const rankById = new Map(ranked.filter((a) => a.matchScore !== null).map((a, i) => [a.id, i + 1]));

  res.json({
    job: { id: req.job.id, title: req.job.title },
    total: candidates.length,
    candidates: candidates.map((c) => toCandidate(c, rankById.get(c.id) ?? null)),
  });
}

/** PATCH /api/applications/:id */
export async function updateApplicationStatus(req, res) {
  const { id } = req.valid.params;
  const owned = await prisma.application.findFirst({
    where: { id, job: { recruiterId: req.userId } },
    select: { id: true },
  });
  if (!owned) throw new AppError(404, 'Application not found');

  const application = await prisma.application.update({
    where: { id },
    data: { status: req.valid.body.status },
    include: { resume: { select: RESUME_FIELDS } },
  });
  res.json({ application: toCandidate(application, null) });
}

/** GET /api/resumes/:id/download: a presigned URL valid for one hour. */
export async function getResumeDownloadUrl(req, res) {
  const resume = await prisma.resume.findFirst({
    where: { id: req.valid.params.id, applications: { some: { job: { recruiterId: req.userId } } } },
  });
  if (!resume) throw new AppError(404, 'Resume not found');

  const url = await getDownloadUrl(resume.fileKey, resume.fileName, resume.mimeType);
  res.json({ url, expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}
