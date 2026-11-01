/** HTTP client for the internal FastAPI matcher service. */
import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

const PARSE_TIMEOUT_MS = 60_000;
const SCORE_TIMEOUT_MS = 120_000;

/** Error from the matcher; `statusCode` is the matcher's status, or 502/504 if unreachable. */
export class MatcherError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'MatcherError';
    this.statusCode = statusCode;
  }
}

async function request(path, { timeoutMs, ...options }) {
  let response;
  try {
    response = await fetch(`${config.matcher.url}${path}`, {
      ...options,
      headers: { 'X-Internal-Key': config.matcher.internalKey, ...options.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new MatcherError(504, 'Matcher service timed out');
    throw new MatcherError(502, 'Matcher service is unreachable');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // FastAPI puts messages in `detail` (a string, or a list for validation errors).
    const detail = typeof body?.detail === 'string' ? body.detail : `Matcher responded with ${response.status}`;
    throw new MatcherError(response.status, detail);
  }
  return body;
}

/** Parse one resume. Returns { mongo_id, skills, email, name_guess }. */
export function parseResume(buffer, fileName, mimeType) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), fileName);
  return request('/parse', { method: 'POST', body: form, timeoutMs: PARSE_TIMEOUT_MS });
}

/** Score parsed resumes against a job. Returns one result per id, in the same order. */
export function scoreResumes({ jobDescription, requiredSkills, mongoIds }) {
  return request('/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_description: jobDescription, required_skills: requiredSkills, resume_ids: mongoIds }),
    timeoutMs: SCORE_TIMEOUT_MS,
  });
}

/** Delete parsed resume documents. */
export function deleteParsedResumes(mongoIds) {
  return request('/resumes/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resume_ids: mongoIds }),
    timeoutMs: PARSE_TIMEOUT_MS,
  });
}

/** Convert a MatcherError into an API error for routes where the matcher failing fails the request. */
export function toAppError(err) {
  if (!(err instanceof MatcherError)) return err;
  return new AppError(err.statusCode >= 500 ? 502 : 422, `Matcher: ${err.message}`);
}
