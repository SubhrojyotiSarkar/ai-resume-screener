// API end-to-end test against a running stack (`docker compose up`).
// Exercises auth, jobs, uploads, ranking, filters, downloads, rescoring, ownership and cleanup.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:4000/api';
const DATA = path.join(import.meta.dirname, '..', 'server', 'prisma', 'seed-data');
const RESUMES = path.join(DATA, 'resumes');
let failures = 0;

function check(label, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${extra ? `  ${extra}` : ''}`);
  if (!condition) failures++;
}

async function call(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${url}`, { method, headers, body: json ? JSON.stringify(json) : form });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const email = `recruiter${Date.now()}@example.com`;

// ---- Auth ----
let r = await call('POST', '/auth/register', { json: { name: 'Demo', email, password: 'short' } });
check('register rejects short password (400)', r.status === 400, JSON.stringify(r.body.error?.details));
r = await call('POST', '/auth/register', { json: { name: 'Demo Recruiter', email, password: 'password123' } });
check('register (201)', r.status === 201 && r.body.token);
r = await call('POST', '/auth/register', { json: { name: 'Again', email, password: 'password123' } });
check('duplicate email (409)', r.status === 409);
r = await call('POST', '/auth/login', { json: { email, password: 'wrong-password' } });
check('login wrong password (401)', r.status === 401);
r = await call('POST', '/auth/login', { json: { email: email.toUpperCase(), password: 'password123' } });
check('login, email case-insensitive (200)', r.status === 200);
const token = r.body.token;
r = await call('GET', '/auth/me', { token });
check('me', r.status === 200 && r.body.user.email === email && !('passwordHash' in r.body.user));
check('no token (401)', (await call('GET', '/jobs')).status === 401);
check('bad token (401)', (await call('GET', '/jobs', { token: 'x.y.z' })).status === 401);

// Second recruiter, for ownership checks.
r = await call('POST', '/auth/register', { json: { name: 'Other', email: `other${Date.now()}@example.com`, password: 'password123' } });
const otherToken = r.body.token;

// ---- Jobs ----
const jd = readFileSync(path.join(DATA, 'job-description.txt'), 'utf8');
r = await call('POST', '/jobs', { token, json: { title: '', description: 'short' } });
check('create job validation (400)', r.status === 400, Object.keys(r.body.error?.details ?? {}).join(','));
r = await call('POST', '/jobs', {
  token,
  json: { title: 'Senior Full-Stack Engineer', description: jd, requiredSkills: ['Python', 'React', 'react', 'TypeScript', 'PostgreSQL', 'Docker', 'AWS', 'FastAPI'] },
});
check('create job (201)', r.status === 201);
check('skills de-duplicated', r.body.job?.requiredSkills.length === 7, JSON.stringify(r.body.job?.requiredSkills));
const jobId = r.body.job.id;
check('other recruiter cannot read job (404)', (await call('GET', `/jobs/${jobId}`, { token: otherToken })).status === 404);
check('invalid id (400)', (await call('GET', '/jobs/not-a-uuid', { token })).status === 400);

// ---- Upload ----
const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const form = new FormData();
for (const name of readdirSync(RESUMES).sort()) {
  form.append('files', new Blob([readFileSync(path.join(RESUMES, name))], { type: name.endsWith('.pdf') ? PDF : DOCX }), name);
}
// Two invalid files: must fail individually without affecting the rest.
form.append('files', new Blob(['not a resume'], { type: 'text/plain' }), 'notes.txt');
form.append('files', new Blob(['this is not really a pdf'], { type: PDF }), 'fake.pdf');
const t0 = Date.now();
r = await call('POST', `/jobs/${jobId}/resumes`, { token, form });
console.log(`      upload took ${Date.now() - t0} ms`);
check('upload (200)', r.status === 200, JSON.stringify(r.body.summary ?? r.body));
check('5 succeeded, 2 failed', r.body.summary?.succeeded === 5 && r.body.summary?.failed === 2);
check('scoring ok', r.body.scoring?.ok === true, r.body.scoring?.error ?? '');
for (const item of r.body.results ?? []) {
  console.log(`      ${item.ok ? 'ok  ' : 'fail'} ${item.fileName.padEnd(15)} ${item.ok ? `${item.candidateName} score=${item.matchScore}` : item.error}`);
}
check('other recruiter cannot upload (404)', (await call('POST', `/jobs/${jobId}/resumes`, { token: otherToken, form: new FormData() })).status === 404);
check('upload with no files (400)', (await call('POST', `/jobs/${jobId}/resumes`, { token, form: new FormData() })).status === 400);

// ---- Candidates ----
r = await call('GET', `/jobs/${jobId}/candidates`, { token });
check('candidates (200)', r.status === 200 && r.body.total === 5);
const candidates = r.body.candidates;
for (const c of candidates) {
  console.log(`      #${c.rank} ${c.resume.candidateName.padEnd(14)} ${String(c.matchScore).padStart(5)}  matched=[${c.matchedSkills}]`);
}
check('sorted by score desc', candidates.every((c, i) => i === 0 || candidates[i - 1].matchScore >= c.matchScore));
check('strong ranked #1', candidates[0].resume.candidateName === 'Priya Sharma' && candidates[0].rank === 1);

const top = candidates[0];
r = await call('PATCH', `/applications/${top.id}`, { token, json: { status: 'SHORTLISTED' } });
check('shortlist (200)', r.status === 200 && r.body.application.status === 'SHORTLISTED');
check('bad status (400)', (await call('PATCH', `/applications/${top.id}`, { token, json: { status: 'HIRED' } })).status === 400);
check('other recruiter cannot patch (404)', (await call('PATCH', `/applications/${top.id}`, { token: otherToken, json: { status: 'REJECTED' } })).status === 404);

r = await call('GET', `/jobs/${jobId}/candidates?status=SHORTLISTED`, { token });
check('filter status', r.body.total === 1 && r.body.candidates[0].rank === 1);
r = await call('GET', `/jobs/${jobId}/candidates?minScore=40&status=`, { token });
check('filter minScore', r.body.candidates.every((c) => c.matchScore >= 40), `total=${r.body.total}`);
r = await call('GET', `/jobs/${jobId}/candidates?sort=name`, { token });
check('sort by name', r.body.candidates[0].resume.candidateName <= r.body.candidates[1].resume.candidateName);
check('bad minScore (400)', (await call('GET', `/jobs/${jobId}/candidates?minScore=500`, { token })).status === 400);

// ---- Download ----
r = await call('GET', `/resumes/${top.resume.id}/download`, { token });
check('download url', r.status === 200 && r.body.url.startsWith('http://localhost:9000/'), r.body.url?.slice(0, 60));
const file = await fetch(r.body.url);
const bytes = Buffer.from(await file.arrayBuffer());
check('presigned url serves the PDF', file.ok && bytes.subarray(0, 4).toString() === '%PDF', `${file.status} ${file.headers.get('content-type')}`);
check('other recruiter cannot download (404)', (await call('GET', `/resumes/${top.resume.id}/download`, { token: otherToken })).status === 404);
const unsigned = await fetch(r.body.url.split('?')[0]);
check('bucket is private (unsigned 403)', unsigned.status === 403, String(unsigned.status));

// ---- Dashboard list ----
r = await call('GET', '/jobs', { token });
check('job list stats', r.body.jobs[0].candidateCount === 5 && r.body.jobs[0].topScore === top.matchScore, JSON.stringify({ count: r.body.jobs[0].candidateCount, top: r.body.jobs[0].topScore }));
check('other recruiter sees no jobs', (await call('GET', '/jobs', { token: otherToken })).body.jobs.length === 0);

// ---- Edit + rescore ----
r = await call('PUT', `/jobs/${jobId}`, { token, json: { title: 'Java Backend Engineer', description: 'Backend engineer building Java and Spring Boot microservices with MySQL, Docker and Jenkins.', requiredSkills: ['Java', 'Spring Boot', 'MySQL'] } });
check('update job (200)', r.status === 200);
r = await call('POST', `/jobs/${jobId}/rescore`, { token });
check('rescore (200)', r.status === 200 && r.body.rescored === 5);
r = await call('GET', `/jobs/${jobId}/candidates`, { token });
check('after rescore, Java resume ranks #1', r.body.candidates[0].resume.candidateName === 'Rahul Verma', r.body.candidates.map((c) => `${c.resume.candidateName}:${c.matchScore}`).join(', '));
check('status kept after rescore', r.body.candidates.find((c) => c.id === top.id).status === 'SHORTLISTED');

// ---- Delete ----
check('other recruiter cannot delete (404)', (await call('DELETE', `/jobs/${jobId}`, { token: otherToken })).status === 404);
r = await call('DELETE', `/jobs/${jobId}`, { token });
check('delete job (204)', r.status === 204);
check('job gone (404)', (await call('GET', `/jobs/${jobId}`, { token })).status === 404);
const gone = await fetch((await call('GET', `/resumes/${top.resume.id}/download`, { token })).body?.url ?? 'http://localhost:9000/x').catch(() => null);
check('resume download gone', !gone || !gone.ok);

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
