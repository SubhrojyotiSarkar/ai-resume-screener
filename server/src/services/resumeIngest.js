import { randomUUID } from 'node:crypto';

import { detectResumeType, nameFromFilename, sanitizeFilename } from '../utils/files.js';
import { prisma } from '../utils/prisma.js';
import { MatcherError, deleteParsedResumes, parseResume } from './matcher.js';
import { deleteFiles, uploadFile } from './storage.js';

/**
 * Store, parse and record one uploaded file for a job.
 * Never throws: returns `{ ok: true, application }` or `{ ok: false, error }`
 * so that one bad file can't fail the whole batch. Anything created before a
 * failure (stored file, Mongo document) is cleaned up.
 */
export async function ingestResume(jobId, file) {
  const fileName = file.originalname;
  const mimeType = detectResumeType(fileName, file.buffer);
  if (!mimeType) return { ok: false, error: 'Only PDF and DOCX files are supported' };

  const fileKey = `resumes/${randomUUID()}-${sanitizeFilename(fileName)}`;
  let stored = false;
  let mongoId = null;

  try {
    await uploadFile(fileKey, file.buffer, mimeType);
    stored = true;

    const parsed = await parseResume(file.buffer, fileName, mimeType);
    mongoId = parsed.mongo_id;

    const application = await prisma.application.create({
      data: {
        job: { connect: { id: jobId } },
        resume: {
          create: {
            // Parsed values come from untrusted documents; keep them to sane lengths.
            candidateName: (parsed.name_guess || nameFromFilename(fileName)).slice(0, 200),
            candidateEmail: parsed.email && parsed.email.length <= 254 ? parsed.email : null,
            fileKey,
            fileName,
            mimeType,
            mongoDocId: mongoId,
          },
        },
      },
      include: { resume: true },
    });
    return { ok: true, application };
  } catch (err) {
    await Promise.allSettled([
      stored ? deleteFiles([fileKey]) : null,
      mongoId ? deleteParsedResumes([mongoId]) : null,
    ]);
    if (err instanceof MatcherError) return { ok: false, error: err.message };
    console.error(`Failed to ingest ${fileName}:`, err);
    return { ok: false, error: 'Could not process this file' };
  }
}
