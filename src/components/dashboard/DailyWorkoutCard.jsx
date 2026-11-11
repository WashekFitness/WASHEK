import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dumbbell, ChevronRight, Clock, Moon, ShieldCheck, Sparkles } from 'lucide-react';
import { getDayOfWeekName, getUserTimeZone, getLocalDateKey } from '@/lib/dateUtils';
import { isActualRestDay } from '@/lib/streakUtils';
import {
  getCachedActiveProgram,
  getCachedLastWorkout,
  setCachedLastWorkout,
} from '@/lib/cacheStore';

export default function DailyWorkoutCard({ program: propProgram, user, timeZone, isLoading = false }) {
  const userKey = user?.email || user?.id || 'athlete';
  const effectiveProgram = propProgram || getCachedActiveProgram(userKey);
  const program = effectiveProgram;

  const currentWeekData = program?.microcycles?.find(m => m.week_number === program.current_week);
  const effectiveTz = timeZone || getUserTimeZone(user);
  const today = getDayOfWeekName(new Date(), effectiveTz);
  const todayKey = getLocalDateKey(new Date(), effectiveTz);

  const isActualRest = isActualRestDay(todayKey, program, user, effectiveTz);

  const todayWorkout = currentWeekData?.days?.find(d =>
    d.day_name.toLowerCase().includes(today.toLowerCase())
  ) || currentWeekData?.days?.[0] || getCachedLastWorkout(userKey);

  // Cache the last fetched workout so UI can render immediately even while fresh data is fetching
  const workoutId = todayWorkout ? `${todayWorkout.id || todayWorkout.day_name || todayWorkout.workout_type || 'workout'}_${userKey}` : null;
  useEffect(() => {
    if (todayWorkout && workoutId) {
      setCachedLastWorkout(todayWorkout, userKey);
    }
  }, [workoutId, userKey]);

  // If loading and we have no program cached yet, render an elegant skeleton instead of empty text
  if (isLoading && !program) {
    return (
      <Card className="p-5 sm:p-6 bg-card border-border/60 relative overflow-hidden animate-pulse">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-muted/60 shrink-0" />
            <div className="space-y-2">
              <div className="h-3 w-28 bg-muted/60 rounded" />
              <div className="h-6 w-44 bg-muted/80 rounded" />
            </div>
          </div>
          <div className="h-6 w-16 bg-muted/50 rounded-full" />
        </div>
        <div className="space-y-2 mb-5">
          <div className="h-10 w-full bg-muted/40 rounded-xl" />
          <div className="h-10 w-full bg-muted/40 rounded-xl" />
          <div className="h-10 w-full bg-muted/40 rounded-xl" />
        </div>
        <div className="h-12 w-full bg-muted/60 rounded-xl" />
      </Card>
    );
  }

  // If today is a scheduled rest day, show the Rest & Regeneration protocol automatically
  if (program && isActualRest) {
    return (
      <Card className="p-5 sm:p-6 bg-gradient-to-b from-card via-card to-card/95 border border-indigo-500/30 dark:border-indigo-500/40 shadow-[0_0_40px_rgba(99,102,241,0.15)] dark:shadow-[0_0_50px_rgba(99,102,241,0.2)] hover:border-indigo-500/50 transition-all duration-300 rounded-3xl relative overflow-hidden group">
        {/* Athletic top ambient recovery glow */}
        <div className="absolute top-0 right-0 w-72 h-40 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-sm">
              <Moon className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block font-heading">
                Daily Protocol · {today}
              </span>
              <p className="font-heading font-extrabold text-xl sm:text-2xl tracking-tight text-foreground mt-0.5">
                Rest &amp; Regeneration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Streak Protected</span>
          </div>
        </div>

        <div className="space-y-2 mb-5 relative z-10">
          <div className="flex items-center justify-between py-2.5 px-3.5 rounded-2xl bg-muted/40 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] text-sm hover:border-indigo-500/40 hover:bg-muted/60 dark:hover:bg-white/[0.06] transition-all duration-200">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-bold font-heading flex items-center justify-center shrink-0">
                1
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                Neuromuscular &amp; CNS Recovery
              </span>
            </div>
            <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg shrink-0 tabular-nums border border-indigo-500/20">
              Deep Rest
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5 px-3.5 rounded-2xl bg-muted/40 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] text-sm hover:border-indigo-500/40 hover:bg-muted/60 dark:hover:bg-white/[0.06] transition-all duration-200">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-bold font-heading flex items-center justify-center shrink-0">
                2
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                Connective Tissue &amp; Mobility Flow
              </span>
            </div>
            <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg shrink-0 tabular-nums border border-indigo-500/20">
              Light Stretches
            </span>
          </div>

          <div className="flex items-center justify-between py-2.5 px-3.5 rounded-2xl bg-muted/40 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] text-sm hover:border-indigo-500/40 hover:bg-muted/60 dark:hover:bg-white/[0.06] transition-all duration-200">
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-bold font-heading flex items-center justify-center shrink-0">
                3
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                Electrolytes &amp; Protein Synthesis
              </span>
            </div>
            <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg shrink-0 tabular-nums border border-indigo-500/20">
              Optimal Macros
            </span>
          </div>
        </div>

        <Link to="/program" className="block relative z-10">
          <Button variant="outline" className="w-full h-12 border-indigo-500/30 hover:bg-indigo-500/10 text-foreground font-heading font-bold text-sm tracking-wide rounded-2xl group/btn flex items-center justify-center gap-2">
            <span>View Full Program Schedule</span>
            <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
          </Button>
        </Link>
      </Card>
    );
  }

  if (!program || !todayWorkout) {
    return (
      <Card className="p-5 sm:p-6 bg-card border-border/80 shadow-xs relative overflow-hidden group">
        <div className="flex items-start justify-between mb-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Dumbbell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest block font-heading">
                Daily Protocol
              </span>
              <p className="font-heading font-extrabold text-xl sm:text-2xl tracking-tight text-foreground mt-0.5">
                Training Program
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-5 relative z-10 leading-relaxed">
          Your personalized periodized training schedule is ready to be set up. Build your program to unlock daily routines, progressive overload tracking, and Coach Kael adaptations.
        </p>

        <Link to="/onboarding" className="block relative z-10">
          <Button className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-semibold text-sm tracking-wide shadow-xs active:scale-[0.99] transition-all rounded-xl group/btn flex items-center justify-center gap-2">
            <span>Set Up Workout Program</span>
            <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
          </Button>
        </Link>
      </Card>
    );
  }

  const exerciseCount = todayWorkout.exercises?.length || 0;
  const estimatedTime = exerciseCount * 4;

  return (
    <Card className="p-5 sm:p-6 bg-gradient-to-b from-card via-card to-card/95 border border-primary/40 dark:border-primary/50 shadow-[0_0_40px_rgba(37,99,235,0.20)] dark:shadow-[0_0_50px_rgba(37,99,235,0.26)] hover:border-primary/60 transition-all duration-300 rounded-3xl relative overflow-hidden group">
      {/* Athletic top ambient glow */}
      <div className="absolute top-0 right-0 w-72 h-40 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0 shadow-sm">
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-primary uppercase tracking-widest block font-heading">
              Today's Protocol
            </span>
            <p className="font-heading font-extrabold text-xl sm:text-2xl tracking-tight text-foreground mt-0.5">
              {todayWorkout.workout_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted/60 border border-border/60 dark:border-white/10 px-2.5 py-1 rounded-xl shrink-0">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="tabular-nums font-mono">~{estimatedTime}m</span>
        </div>
      </div>

      <div className="space-y-2 mb-5 relative z-10">
        {todayWorkout.exercises?.slice(0, 3).map((ex, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2.5 px-3.5 rounded-2xl bg-muted/40 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] text-sm hover:border-primary/40 hover:bg-muted/60 dark:hover:bg-white/[0.06] transition-all duration-200"
          >
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary text-xs font-bold font-heading flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                {ex.name}
              </span>
            </div>
            <span className="text-xs font-bold text-foreground bg-muted dark:bg-white/10 px-2.5 py-1 rounded-lg shrink-0 tabular-nums font-mono border border-border/40 dark:border-white/5">
              {ex.sets} × {ex.reps}
            </span>
          </div>
        ))}
        {exerciseCount > 3 && (
          <p className="text-xs font-medium text-muted-foreground text-center pt-1">
            +{exerciseCount - 3} more exercises in today's routine
          </p>
        )}
      </div>

      <Link to="/program" className="block relative z-10">
        <Button className="w-full h-12 bg-primary hover:bg-primary/95 text-primary-foreground font-heading font-bold text-sm tracking-wide shadow-[0_0_25px_rgba(37,99,235,0.45)] hover:shadow-[0_0_35px_rgba(37,99,235,0.65)] border border-primary/40 rounded-2xl active:scale-[0.99] transition-all group/btn flex items-center justify-center gap-2">
          <span>Start Workout</span>
          <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
        </Button>
      </Link>
    </Card>
  );
}