const TONES = {
  matched: 'bg-green-50 text-green-700 ring-green-600/20',
  missing: 'bg-slate-100 text-slate-500 ring-slate-400/20',
  neutral: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
};

export function SkillChip({ skill, tone = 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
      title={tone === 'missing' ? `Missing: ${skill}` : skill}
    >
      {tone === 'missing' && <span className="sr-only">Missing: </span>}
      {skill}
    </span>
  );
}

export function SkillList({ skills, tone, limit }) {
  const shown = limit ? skills.slice(0, limit) : skills;
  const hidden = skills.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((skill) => (
        <SkillChip key={skill} skill={skill} tone={tone} />
      ))}
      {hidden > 0 && <span className="px-1 text-xs text-slate-400">+{hidden} more</span>}
    </div>
  );
}
