import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getErrorMessage } from '../api/client.js';
import { Button, ButtonLink } from '../components/Button.jsx';
import { CandidateFilters } from '../components/CandidateFilters.jsx';
import { CandidateTable } from '../components/CandidateTable.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { EmptyState, ErrorState } from '../components/EmptyState.jsx';
import { SkillList } from '../components/SkillChip.jsx';
import { PageLoader, Spinner } from '../components/Spinner.jsx';
import { UploadDropzone } from '../components/UploadDropzone.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useCandidates } from '../hooks/useCandidates.js';
import { useDeleteJob, useJob, useRescoreJob } from '../hooks/useJobs.js';
import { formatDate } from '../utils/format.js';

const DEFAULT_FILTERS = { status: '', minScore: 0, sort: 'score' };

/** Filters live in the URL so they survive reloads and can be shared. */
function useFilterParams() {
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get('status') ?? DEFAULT_FILTERS.status,
    minScore: Number(params.get('minScore')) || DEFAULT_FILTERS.minScore,
    sort: params.get('sort') ?? DEFAULT_FILTERS.sort,
  };

  function setFilters(changes) {
    const next = { ...filters, ...changes };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value !== DEFAULT_FILTERS[key]) search.set(key, String(value));
    }
    setParams(search, { replace: true });
  }

  return [filters, setFilters, () => setParams({}, { replace: true })];
}

export function JobDetailPage() {
  const { id } = useParams();
  const { data: job, isPending, isError, error, refetch } = useJob(id);

  useEffect(() => {
    if (job) document.title = `${job.title} · Resume Screener`;
  }, [job]);

  if (isPending) return <PageLoader />;
  if (isError) {
    return error.response?.status === 404 ? (
      <EmptyState
        icon="🔍"
        title="Job not found"
        description="It may have been deleted, or it belongs to another account."
        action={<ButtonLink to="/">Back to jobs</ButtonLink>}
      />
    ) : (
      <ErrorState message={getErrorMessage(error, 'Could not load this job')} onRetry={refetch} />
    );
  }

  return (
    <div className="space-y-6">
      <JobHeader job={job} />
      <UploadDropzone jobId={job.id} />
      <CandidatesSection job={job} />
    </div>
  );
}

function JobHeader({ job }) {
  const navigate = useNavigate();
  const toast = useToast();
  const deleteJob = useDeleteJob();
  const [confirming, setConfirming] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function handleDelete() {
    deleteJob.mutate(job.id, {
      onSuccess: () => {
        toast.success(`Deleted "${job.title}"`);
        navigate('/', { replace: true });
      },
      onError: (error) => {
        setConfirming(false);
        toast.error(getErrorMessage(error, 'Could not delete the job'));
      },
    });
  }

  return (
    <section>
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">← All jobs</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">{job.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Created {formatDate(job.createdAt)} · {job.candidateCount} candidate{job.candidateCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink to={`/jobs/${job.id}/edit`} variant="secondary">Edit</ButtonLink>
          <Button variant="secondary" onClick={() => setConfirming(true)} className="text-red-600 hover:text-red-700">
            Delete
          </Button>
        </div>
      </div>

      {job.requiredSkills.length > 0 && (
        <div className="mt-3">
          <SkillList skills={job.requiredSkills} />
        </div>
      )}

      <div className="mt-4">
        <p className={`text-sm whitespace-pre-line text-slate-600 ${expanded ? '' : 'line-clamp-3'}`}>{job.description}</p>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          {expanded ? 'Show less' : 'Show full description'}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete this job?"
        message={`"${job.title}" and all ${job.candidateCount} of its candidates and resume files will be permanently deleted.`}
        confirmLabel="Delete job"
        loading={deleteJob.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

function CandidatesSection({ job }) {
  const toast = useToast();
  const [filters, setFilters, resetFilters] = useFilterParams();
  const { data, isPending, isError, error, refetch, isFetching } = useCandidates(job.id, filters);
  const rescore = useRescoreJob(job.id);

  const hasUnscored = data?.candidates.some((c) => c.matchScore === null);
  const filtering = filters.status !== '' || filters.minScore > 0;

  function handleRescore() {
    rescore.mutate(undefined, {
      onSuccess: ({ rescored }) => toast.success(`Re-scored ${rescored} candidate${rescored === 1 ? '' : 's'}`),
      onError: (err) => toast.error(getErrorMessage(err, 'Re-scoring failed')),
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          Ranked candidates
          {isFetching && !isPending && <Spinner className="h-4 w-4 text-slate-400" />}
        </h2>
        {job.candidateCount > 0 && (
          <Button variant={hasUnscored ? 'primary' : 'secondary'} size="sm" onClick={handleRescore} loading={rescore.isPending}>
            {hasUnscored ? 'Score unscored candidates' : 'Re-score all'}
          </Button>
        )}
      </div>

      {job.candidateCount > 0 && (
        <CandidateFilters {...filters} onChange={setFilters} onReset={resetFilters} />
      )}

      {isPending && <PageLoader label="Loading candidates…" />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load candidates')} onRetry={refetch} />}
      {data && data.total === 0 && !filtering && (
        <EmptyState
          icon="📥"
          title="No candidates yet"
          description="Upload PDF or DOCX resumes above and they'll be ranked here by match score."
        />
      )}
      {data && data.total === 0 && filtering && (
        <EmptyState
          icon="🔎"
          title="No candidates match these filters"
          action={<Button variant="secondary" onClick={resetFilters}>Reset filters</Button>}
        />
      )}
      {data?.total > 0 && <CandidateTable jobId={job.id} candidates={data.candidates} />}
    </section>
  );
}
