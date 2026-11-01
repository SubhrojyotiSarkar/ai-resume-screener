import { useState } from 'react';

import { getErrorMessage } from '../api/client.js';
import { getResumeDownloadUrl } from '../api/jobs.js';
import { useToast } from '../context/ToastContext.jsx';
import { useUpdateApplicationStatus } from '../hooks/useCandidates.js';
import { Button } from './Button.jsx';
import { ScoreBadge } from './ScoreBadge.jsx';
import { SkillList } from './SkillChip.jsx';

export const STATUS_OPTIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'REJECTED', label: 'Rejected' },
];

const STATUS_STYLES = {
  NEW: 'border-slate-300 bg-white text-slate-700',
  SHORTLISTED: 'border-green-300 bg-green-50 text-green-800',
  REJECTED: 'border-red-200 bg-red-50 text-red-700',
};

export function CandidateTable({ jobId, candidates }) {
  return (
    // `relative` keeps absolutely-positioned sr-only labels inside the scroll box on narrow screens.
    <div className="card relative overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th scope="col" className="w-14 px-4 py-3">Rank</th>
            <th scope="col" className="px-4 py-3">Candidate</th>
            <th scope="col" className="px-4 py-3">Score</th>
            <th scope="col" className="min-w-64 px-4 py-3">Skills</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {candidates.map((candidate) => (
            <CandidateRow key={candidate.id} jobId={jobId} candidate={candidate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateRow({ jobId, candidate }) {
  const toast = useToast();
  const updateStatus = useUpdateApplicationStatus(jobId);
  const [opening, setOpening] = useState(false);
  const { rank, resume, matchScore, textScore, skillScore, matchedSkills, missingSkills, status } = candidate;

  function changeStatus(event) {
    const next = event.target.value;
    updateStatus.mutate(
      { applicationId: candidate.id, status: next },
      {
        onSuccess: () => toast.success(`${resume.candidateName} marked as ${next.toLowerCase()}`),
        onError: (error) => toast.error(getErrorMessage(error, 'Could not update status')),
      },
    );
  }

  async function viewResume() {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed URL.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const url = await getResumeDownloadUrl(resume.id);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (error) {
      tab?.close();
      toast.error(getErrorMessage(error, 'Could not open the resume'));
    } finally {
      setOpening(false);
    }
  }

  return (
    <tr className="align-top hover:bg-slate-50/60">
      <td className="px-4 py-3 font-semibold text-slate-500 tabular-nums">{rank ? `#${rank}` : '–'}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{resume.candidateName}</div>
        {resume.candidateEmail && <div className="text-xs text-slate-500">{resume.candidateEmail}</div>}
        <div className="mt-0.5 max-w-48 truncate text-xs text-slate-400" title={resume.fileName}>
          {resume.fileName}
        </div>
      </td>
      <td className="px-4 py-3">
        <ScoreBadge score={matchScore} />
        {matchScore !== null && (
          <div className="mt-1 text-xs whitespace-nowrap text-slate-400" title="Text similarity and skill coverage">
            Text {Math.round(textScore)} · Skills {Math.round(skillScore)}
          </div>
        )}
      </td>
      <td className="space-y-1.5 px-4 py-3">
        {matchedSkills.length > 0 && <SkillList skills={matchedSkills} tone="matched" />}
        {missingSkills.length > 0 && <SkillList skills={missingSkills} tone="missing" />}
        {matchedSkills.length === 0 && missingSkills.length === 0 && (
          <span className="text-xs text-slate-400">{matchScore === null ? 'Waiting for scoring' : 'No skills to compare'}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <label className="sr-only" htmlFor={`status-${candidate.id}`}>
          Status for {resume.candidateName}
        </label>
        <select
          id={`status-${candidate.id}`}
          value={status}
          onChange={changeStatus}
          className={`rounded-md border px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:outline-none ${STATUS_STYLES[status]}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="secondary" size="sm" onClick={viewResume} loading={opening}>
          View resume
        </Button>
      </td>
    </tr>
  );
}
