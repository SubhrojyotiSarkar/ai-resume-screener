import { chunk } from '../utils/concurrency.js';
import { prisma } from '../utils/prisma.js';
import { scoreResumes } from './matcher.js';

// The matcher accepts up to 500 ids per call; smaller batches keep each request quick.
const SCORE_BATCH_SIZE = 100;

/**
 * Score the given applications against their job and save the results.
 * `applications` items need `{ id, resume: { mongoDocId } }`.
 * Throws MatcherError if the matcher fails; scores already saved stay saved.
 */
export async function scoreApplications(job, applications) {
  let scored = 0;
  for (const batch of chunk(applications, SCORE_BATCH_SIZE)) {
    const results = await scoreResumes({
      jobDescription: job.description,
      requiredSkills: job.requiredSkills,
      mongoIds: batch.map((a) => a.resume.mongoDocId),
    });

    // The matcher returns results in request order.
    await prisma.$transaction(
      batch.map((application, i) =>
        prisma.application.update({
          where: { id: application.id },
          data: {
            matchScore: results[i].match_score,
            textScore: results[i].text_score,
            skillScore: results[i].skill_score,
            semanticScore: results[i].semantic_score,
            lexicalScore: results[i].lexical_score,
            matchedSkills: results[i].matched_skills,
            missingSkills: results[i].missing_skills,
          },
        }),
      ),
    );
    scored += batch.length;
  }
  return scored;
}

/** Re-score every application for a job, e.g. after its description or skills change. */
export async function rescoreJob(job) {
  const applications = await prisma.application.findMany({
    where: { jobId: job.id },
    select: { id: true, resume: { select: { mongoDocId: true } } },
  });
  return scoreApplications(job, applications);
}
