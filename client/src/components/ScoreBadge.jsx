/** Colour band for a 0-100 match score: green >= 70, amber 40-69, red < 40. */
export function scoreTone(score) {
  if (score === null || score === undefined) return 'none';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

const TONES = {
  high: 'bg-green-100 text-green-800 ring-green-600/20',
  medium: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  low: 'bg-red-100 text-red-800 ring-red-600/20',
  none: 'bg-slate-100 text-slate-500 ring-slate-500/20',
};

export function ScoreBadge({ score, size = 'md' }) {
  const tone = scoreTone(score);
  const sizing = size === 'lg' ? 'min-w-16 px-3 py-1 text-base' : 'min-w-12 px-2 py-0.5 text-sm';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-semibold tabular-nums ring-1 ring-inset ${TONES[tone]} ${sizing}`}
    >
      {tone === 'none' ? 'Not scored' : score.toFixed(1)}
    </span>
  );
}
