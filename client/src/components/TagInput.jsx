import { useState } from 'react';

/**
 * Text input that turns entries into removable tags. Enter or comma adds a tag,
 * Backspace on an empty input removes the last one. Pasting "a, b, c" adds three.
 */
export function TagInput({ id, value, onChange, placeholder, maxTags = 50, maxLength = 50 }) {
  const [draft, setDraft] = useState('');

  function addTags(text) {
    const existing = new Set(value.map((t) => t.toLowerCase()));
    const additions = [];
    for (const raw of text.split(',')) {
      const tag = raw.trim().slice(0, maxLength);
      if (tag && !existing.has(tag.toLowerCase())) {
        existing.add(tag.toLowerCase());
        additions.push(tag);
      }
    }
    if (additions.length) onChange([...value, ...additions].slice(0, maxTags));
    setDraft('');
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTags(draft);
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function handlePaste(event) {
    const text = event.clipboardData.getData('text');
    if (text.includes(',')) {
      event.preventDefault();
      addTags(text);
    }
  }

  return (
    <div className="input flex min-h-10 flex-wrap items-center gap-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded-full px-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => draft.trim() && addTags(draft)}
        placeholder={value.length ? '' : placeholder}
        disabled={value.length >= maxTags}
        className="min-w-32 flex-1 border-0 bg-transparent p-0.5 text-sm focus:ring-0 focus:outline-none"
      />
    </div>
  );
}
