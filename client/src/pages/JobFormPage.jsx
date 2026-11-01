import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { getErrorMessage, getFieldErrors } from '../api/client.js';
import { rescoreJob } from '../api/jobs.js';
import { Button } from '../components/Button.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import { TagInput } from '../components/TagInput.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { invalidateJobScores, useCreateJob, useJob, useUpdateJob } from '../hooks/useJobs.js';

const MIN_DESCRIPTION = 20;
const MAX_DESCRIPTION = 20_000;

function validate({ title, description }) {
  const errors = {};
  if (!title.trim()) errors.title = 'Title is required';
  if (description.trim().length < MIN_DESCRIPTION) {
    errors.description = `Description must be at least ${MIN_DESCRIPTION} characters`;
  }
  return errors;
}

/** Create a job (/jobs/new) or edit one (/jobs/:id/edit). */
export function JobFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { data: job, isPending, isError, error, refetch } = useJob(id);

  if (isEdit && isPending) return <PageLoader />;
  if (isEdit && isError) return <ErrorState message={getErrorMessage(error, 'Could not load this job')} onRetry={refetch} />;

  return <JobForm key={job?.id ?? 'new'} job={isEdit ? job : null} />;
}

function JobForm({ job }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob(job?.id);
  const [values, setValues] = useState({
    title: job?.title ?? '',
    description: job?.description ?? '',
    requiredSkills: job?.requiredSkills ?? [],
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = `${job ? 'Edit job' : 'New job'} · Resume Screener`;
  }, [job]);

  async function handleSubmit(event) {
    event.preventDefault();
    const clientErrors = validate(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    setSubmitting(true);
    try {
      if (!job) {
        const created = await createJob.mutateAsync(values);
        toast.success('Job created. Now upload some resumes.');
        navigate(`/jobs/${created.id}`);
        return;
      }

      await updateJob.mutateAsync(values);
      // The description and skills drive the scores, so re-rank existing candidates.
      if (job.candidateCount > 0) {
        try {
          const { rescored } = await rescoreJob(job.id);
          invalidateJobScores(queryClient, job.id);
          toast.success(`Job updated and ${rescored} candidate${rescored === 1 ? '' : 's'} re-scored`);
        } catch (err) {
          toast.error(`Job saved, but re-scoring failed: ${getErrorMessage(err)}`);
        }
      } else {
        toast.success('Job updated');
      }
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      const fields = getFieldErrors(err);
      setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
      if (!Object.keys(fields).length) toast.error(getErrorMessage(err, 'Could not save the job'));
      setSubmitting(false);
    }
  }

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));
  const backTo = job ? `/jobs/${job.id}` : '/';

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={backTo} className="text-sm text-slate-500 hover:text-slate-700">← Back</Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold text-slate-900">{job ? 'Edit job' : 'Create a job'}</h1>

      <form onSubmit={handleSubmit} className="card space-y-5 p-6" noValidate>
        <div>
          <label htmlFor="title" className="label">Job title</label>
          <input
            id="title"
            value={values.title}
            onChange={set('title')}
            maxLength={200}
            placeholder="e.g. Senior Full-Stack Engineer"
            className={`input ${errors.title ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title}</p>}
        </div>

        <div>
          <label htmlFor="description" className="label">Job description</label>
          <textarea
            id="description"
            rows={12}
            value={values.description}
            onChange={set('description')}
            maxLength={MAX_DESCRIPTION}
            placeholder="Paste the full job description: responsibilities, requirements, nice-to-haves…"
            className={`input resize-y ${errors.description ? 'input-error' : ''}`}
            aria-invalid={Boolean(errors.description)}
          />
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-red-600">{errors.description}</span>
            <span className="text-slate-400 tabular-nums">
              {values.description.length.toLocaleString()} / {MAX_DESCRIPTION.toLocaleString()}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="skills" className="label">Required skills</label>
          <TagInput
            id="skills"
            value={values.requiredSkills}
            onChange={(requiredSkills) => setValues((v) => ({ ...v, requiredSkills }))}
            placeholder="Type a skill and press Enter, e.g. Python, React, AWS"
          />
          <p className="mt-1 text-xs text-slate-500">
            Used for the skill part of the score (40%). Leave empty to use skills detected in the description.
          </p>
          {errors.requiredSkills && <p className="mt-1 text-xs text-red-600">{errors.requiredSkills}</p>}
        </div>

        {job?.candidateCount > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Saving will re-score all {job.candidateCount} existing candidate{job.candidateCount === 1 ? '' : 's'}.
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <Button variant="secondary" onClick={() => navigate(backTo)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {job ? 'Save changes' : 'Create job'}
          </Button>
        </div>
      </form>
    </div>
  );
}
