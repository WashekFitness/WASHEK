import { useState } from 'react';

export default function ExpandableText({ text, limit = 80, className = '' }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return <span className={className}>—</span>;

  const isLong = text.length > limit;
  const display = expanded ? text : (isLong ? text.slice(0, limit).trim() + '…' : text);

  return (
    <div className={className}>
      <p className="leading-relaxed whitespace-pre-wrap">{display}</p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-primary text-xs font-semibold mt-0.5 hover:underline"
        >
          {expanded ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}