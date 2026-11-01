import { RotateCcw, AlertTriangle, CheckCircle2, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isStaticHoldExercise } from '@/lib/formAnalysis';

const severityStyles = {
  minor: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-500',
  moderate: 'border-orange-500/30 bg-orange-500/5 text-orange-500',
  major: 'border-red-500/30 bg-red-500/5 text-red-500',
  critical: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function ScoreRing({ score }) {
  const isPerfect = score === 100;
  const color = isPerfect
    ? 'text-emerald-500 dark:text-emerald-400'
    : score >= 80
    ? 'text-accent'
    : score >= 60
    ? 'text-chart-4'
    : score >= 40
    ? 'text-orange-500'
    : 'text-destructive';
  const stroke = isPerfect
    ? '#10b981'
    : score >= 80
    ? '#22c55e'
    : score >= 60
    ? '#f59e0b'
    : score >= 40
    ? '#f97316'
    : '#ef4444';
  const dash = (score / 100) * 251.2;

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} 251.2`}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-heading font-bold text-2xl', color)}>{score}</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
          {isPerfect ? 'PERFECT' : 'Score'}
        </span>
      </div>
    </div>
  );
}

function IssueCard({ issue }) {
  const [expanded, setExpanded] = useState(true);
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

  const isHold =
    result.exercise_category === 'hold' ||
    result.rep_count === 'N/A' ||
    (result.hold_time_seconds != null && result.hold_time_seconds !== 'N/A' && (result.rep_count == null || result.rep_count === 'N/A')) ||
    isStaticHoldExercise(exercise, result.exercise_category);

  return (
    <div className="space-y-4">
      {/* Score + summary */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center gap-4 mb-3">
          <ScoreRing score={result.score} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-heading font-bold text-base">{exercise}</h3>
              {result.score >= 95 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {result.score === 100 ? '100% · Flawless' : `${result.score}% · Textbook`}
                </span>
              ) : result.score >= 80 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30">
                  {result.score}% · Solid Execution
                </span>
              ) : result.score >= 50 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
                  {result.score}% · Moderate Flaws
                </span>
              ) : result.score >= 25 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
                  {result.score}% · Poor Form
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/15 text-destructive border border-destructive/30">
                  {result.score}% · Dangerous / High Risk
                </span>
              )}
            </div>
            {isHold ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Reps: <span className="font-semibold text-muted-foreground">N/A</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Hold time:{' '}
                  <span className="font-bold text-foreground">
                    {typeof result.hold_time_seconds === 'number'
                      ? `${result.hold_time_seconds.toFixed(1)}s`
                      : result.hold_time_seconds && result.hold_time_seconds !== 'N/A'
                      ? String(result.hold_time_seconds).endsWith('s')
                        ? result.hold_time_seconds
                        : `${result.hold_time_seconds}s`
                      : '0.0s'}
                  </span>
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Reps:{' '}
                  <span className="font-bold text-foreground">
                    {result.rep_count != null && result.rep_count !== 'N/A' ? result.rep_count : 1}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Hold time: <span className="font-semibold text-muted-foreground">N/A</span>
                </p>
              </>
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
            <h4 className="font-heading font-bold text-sm">
              {result.score === 100 ? 'Coaching Focus' : 'Top Priorities'}
            </h4>
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

      {(!result.issues || result.issues.length === 0) && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {result.score === 100 ? '100% Perfect Form · Zero Complaints' : 'Clean Form Verified'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.score === 100
                ? 'Zero technique flaws or breakdowns detected. Your posture, alignment, joint tracking, and control were textbook.'
                : 'No major form issues detected. Movement mechanics and joint safety are solid.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}