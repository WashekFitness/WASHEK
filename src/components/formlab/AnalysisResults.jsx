import { RotateCcw, AlertTriangle, CheckCircle2, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const severityStyles = {
  minor: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-500',
  moderate: 'border-orange-500/30 bg-orange-500/5 text-orange-500',
  major: 'border-red-500/30 bg-red-500/5 text-red-500',
  critical: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function ScoreRing({ score }) {
  const color = score >= 80 ? 'text-accent' : score >= 60 ? 'text-chart-4' : score >= 40 ? 'text-orange-500' : 'text-destructive';
  const stroke = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  const dash = (score / 100) * 251.2;

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${dash} 251.2`} className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-heading font-bold text-2xl', color)}>{score}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Score</span>
      </div>
    </div>
  );
}

function IssueCard({ issue }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn('rounded-xl border p-3', severityStyles[issue.severity] || severityStyles.moderate)}>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-2 text-left">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{issue.area}</p>
          <p className="text-xs opacity-90 mt-0.5">{issue.problem}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 shrink-0 mt-0.5" />}
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-current/20 space-y-1.5">
          <p className="text-xs"><span className="font-bold">Fix:</span> {issue.fix}</p>
          {issue.corrective_exercises?.length > 0 && (
            <div>
              <p className="text-xs font-bold mb-1">Corrective Exercises:</p>
              <ul className="space-y-0.5">
                {issue.corrective_exercises.map((ex, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />{ex}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalysisResults({ result, exercise }) {
  if (!result) return null;

  return (
    <div className="space-y-4">
      {/* Score + summary */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center gap-4 mb-3">
          <ScoreRing score={result.score} />
          <div className="flex-1 min-w-0">
            <h3 className="font-heading font-bold text-base">{exercise}</h3>
            {(result.rep_count != null && result.rep_count > 0) && (
              <p className="text-sm text-muted-foreground">Reps detected: <span className="font-bold text-foreground">{result.rep_count}</span></p>
            )}
            {(result.hold_time_seconds != null && result.hold_time_seconds > 0) && (
              <p className="text-sm text-muted-foreground">Hold time: <span className="font-bold text-foreground">{result.hold_time_seconds.toFixed(1)}s</span></p>
            )}
            {result.active_range_start != null && result.active_range_end != null && (
              <p className="text-xs text-muted-foreground">Active: {result.active_range_start.toFixed(1)}s – {result.active_range_end.toFixed(1)}s</p>
            )}
          </div>
        </div>
        <p className="text-sm leading-relaxed">{result.overall_assessment}</p>
      </div>

      {/* Priority focus */}
      {result.priority_focus?.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <h4 className="font-heading font-bold text-sm">Top Priorities</h4>
          </div>
          <ol className="space-y-1.5">
            {result.priority_focus.map((p, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold shrink-0">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Issues */}
      {result.issues?.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-heading font-bold text-sm">Form Issues ({result.issues.length})</h4>
          {result.issues.map((issue, i) => (
            <IssueCard key={i} issue={issue} />
          ))}
        </div>
      )}

      {result.issues?.length === 0 && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-accent" />
          <p className="text-sm font-medium text-accent">No major form issues detected. Solid work.</p>
        </div>
      )}
    </div>
  );
}