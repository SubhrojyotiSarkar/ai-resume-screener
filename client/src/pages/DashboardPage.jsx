import { Link } from 'react-router-dom';

import { getErrorMessage } from '../api/client.js';
import { ButtonLink } from '../components/Button.jsx';
import { EmptyState, ErrorState } from '../components/EmptyState.jsx';
import { ScoreBadge } from '../components/ScoreBadge.jsx';
import { SkillList } from '../components/SkillChip.jsx';
import { useJobs } from '../hooks/useJobs.js';
import { formatDate } from '../utils/format.js';

export function DashboardPage() {
  const { data: jobs, isPending, isError, error, refetch } = useJobs();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Your jobs</h1>
          <p className="text-sm text-slate-500">Each job ranks its candidates by how well they match.</p>
        </div>
        <ButtonLink to="/jobs/new">+ New job</ButtonLink>
      </div>

      {isPending && <JobGridSkeleton />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load your jobs')} onRetry={refetch} />}
      {jobs?.length === 0 && (
        <EmptyState
          icon="💼"
          title="No jobs yet"
          description="Create a job with a description and the skills you need, then upload resumes to rank candidates."
          action={<ButtonLink to="/jobs/new">Create your first job</ButtonLink>}
        />
      )}
      {jobs?.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <JobCard job={job} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobCard({ job }) {
  return (
    <Link
      to={`/jobs/${job.id}`}
      className="card flex h-full flex-col p-5 transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-600"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-slate-900">{job.title}</h2>
        {job.candidateCount > 0 && <ScoreBadge score={job.topScore} />}
      </div>
      <p className="mt-1 text-xs text-slate-500">Created {formatDate(job.createdAt)}</p>
      {job.requiredSkills.length > 0 && (
        <div className="mt-3">
          <SkillList skills={job.requiredSkills} limit={5} />
        </div>
      )}
      <div className="mt-auto flex items-center justify-between pt-4 text-sm text-slate-600">
        <span>
          <strong className="font-semibold text-slate-900">{job.candidateCount}</strong>{' '}
          candidate{job.candidateCount === 1 ? '' : 's'}
        </span>
        {job.candidateCount > 0 && <span className="text-xs text-slate-500">Top score</span>}
      </div>
    </Link>
  );
}

function JobGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading jobs">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-40 animate-pulse p-5">
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
          <div className="mt-4 flex gap-2">
            <div className="h-5 w-14 rounded-full bg-slate-100" />
            <div className="h-5 w-16 rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
