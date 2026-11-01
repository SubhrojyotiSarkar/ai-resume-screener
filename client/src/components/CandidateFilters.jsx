import { useEffect, useState } from 'react';

import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { STATUS_OPTIONS } from './CandidateTable.jsx';

const SORT_OPTIONS = [
  { value: 'score', label: 'Best match' },
  { value: 'date', label: 'Newest first' },
  { value: 'name', label: 'Name (A–Z)' },
];

export function CandidateFilters({ status, minScore, sort, onChange, onReset }) {
  // The slider moves on local state; only the settled value is committed (URL + refetch).
  const [draftMinScore, setDraftMinScore] = useState(minScore);
  const settledMinScore = useDebouncedValue(draftMinScore, 250);

  useEffect(() => setDraftMinScore(minScore), [minScore]); // e.g. "Reset filters"

  useEffect(() => {
    if (settledMinScore !== minScore) onChange({ minScore: settledMinScore });
    // Only react to the slider settling, not to every parent render (onChange changes identity).
  }, [settledMinScore]);

  const active = status || minScore > 0 || sort !== 'score';

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor="filter-status" className="label">Status</label>
        <select
          id="filter-status"
          value={status}
          onChange={(e) => onChange({ status: e.target.value })}
          className="input py-1.5"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="w-48">
        <label htmlFor="filter-min-score" className="label">
          Minimum score: <span className="tabular-nums">{draftMinScore}</span>
        </label>
        <input
          id="filter-min-score"
          type="range"
          min="0"
          max="100"
          step="5"
          value={draftMinScore}
          onChange={(e) => setDraftMinScore(Number(e.target.value))}
          className="w-full accent-indigo-600"
        />
      </div>

      <div>
        <label htmlFor="filter-sort" className="label">Sort by</label>
        <select id="filter-sort" value={sort} onChange={(e) => onChange({ sort: e.target.value })} className="input py-1.5">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {active && (
        <button type="button" onClick={onReset} className="pb-2 text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Reset filters
        </button>
      )}
    </div>
  );
}
