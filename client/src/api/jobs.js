import { api } from './client.js';

// Parsing and scoring a batch of resumes can take a while.
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export async function listJobs() {
  const { data } = await api.get('/jobs');
  return data.jobs;
}

export async function getJob(id) {
  const { data } = await api.get(`/jobs/${id}`);
  return data.job;
}

export async function createJob(job) {
  const { data } = await api.post('/jobs', job);
  return data.job;
}

export async function updateJob(id, job) {
  const { data } = await api.put(`/jobs/${id}`, job);
  return data.job;
}

export async function deleteJob(id) {
  await api.delete(`/jobs/${id}`);
}

export async function rescoreJob(id) {
  const { data } = await api.post(`/jobs/${id}/rescore`, null, { timeout: UPLOAD_TIMEOUT_MS });
  return data; // { rescored }
}

/** Upload files in one request. `onProgress(loadedBytes, totalBytes)` reports upload progress. */
export async function uploadResumes(jobId, files, onProgress) {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  const { data } = await api.post(`/jobs/${jobId}/resumes`, form, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: (event) => onProgress?.(event.loaded, event.total ?? event.loaded),
  });
  return data; // { summary, scoring, results }
}

export async function listCandidates(jobId, { sort, status, minScore }) {
  const { data } = await api.get(`/jobs/${jobId}/candidates`, {
    params: { sort, status: status || undefined, minScore: minScore || undefined },
  });
  return data; // { job, total, candidates }
}

export async function updateApplicationStatus(applicationId, status) {
  const { data } = await api.patch(`/applications/${applicationId}`, { status });
  return data.application;
}

export async function getResumeDownloadUrl(resumeId) {
  const { data } = await api.get(`/resumes/${resumeId}/download`);
  return data.url;
}
