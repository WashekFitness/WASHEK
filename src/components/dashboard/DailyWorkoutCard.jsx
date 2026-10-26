import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dumbbell, ChevronRight, Clock, Moon, ShieldCheck, Sparkles } from 'lucide-react';
import { getDayOfWeekName, getUserTimeZone, getLocalDateKey } from '@/lib/dateUtils';
import { isActualRestDay } from '@/lib/streakUtils';
import { useAppSettings } from '@/lib/AppSettingsContext';
import {
  getCachedActiveProgram,
  getCachedLastWorkout,
  setCachedLastWorkout,
} from '@/lib/cacheStore';

export default function DailyWorkoutCard({ program: propProgram, user, timeZone, isLoading = false }) {
  const { settings, isRestDayMarked } = useAppSettings() || {};
  const userKey = user?.email || user?.id || 'athlete';
  const effectiveProgram = propProgram || getCachedActiveProgram(userKey);
  const program = effectiveProgram;

  const currentWeekData = program?.microcycles?.find(m => m.week_number === program.current_week);
  const effectiveTz = timeZone || getUserTimeZone(user);
  const today = getDayOfWeekName(new Date(), effectiveTz);
  const todayKey = getLocalDateKey(new Date(), effectiveTz);

  const isActualRest = isActualRestDay(todayKey, program, user, effectiveTz);
  const isMarkedRest = isRestDayMarked
    ? isRestDayMarked(todayKey)
    : Boolean(settings?.manualRestDays?.[todayKey]);

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

  // If today is an actual rest day AND the athlete has marked it in settings ("show them")
  if (program && isActualRest && isMarkedRest) {
    return (
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-indigo-500/[0.14] via-card to-card border-indigo-500/30 shadow-[0_12px_36px_-6px_rgba(99,102,241,0.16)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.5)] relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-56 h-56 bg-indigo-500/[0.12] rounded-full blur-3xl pointer-events-none -mr-16 -mt-16 group-hover:bg-indigo-500/[0.18] transition-all duration-700" />

        <div className="flex items-start justify-between mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-indigo-500/10 border border-indigo-500/35 flex items-center justify-center shadow-sm shadow-indigo-500/25 shrink-0 group-hover:scale-105 transition-transform duration-300">
              <Moon className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block font-heading">
                  Daily Protocol · {today}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="font-heading font-extrabold text-xl sm:text-2xl tracking-tight text-foreground mt-0.5">
                Rest &amp; Regeneration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full shrink-0 shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Streak Protected</span>
          </div>
        </div>

        <div className="space-y-2 mb-5 relative z-10">
          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-100/90 dark:bg-background/60 border border-slate-200/80 dark:border-white/[0.05] text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 text-[11px] font-bold font-heading flex items-center justify-center shrink-0">
                1
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                Neuromuscular &amp; CNS Recovery
              </span>
            </div>
            <span className="text-xs font-bold text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-md shrink-0">
              Complete Rest
            </span>
          </div>

          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-100/90 dark:bg-background/60 border border-slate-200/80 dark:border-white/[0.05] text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 text-[11px] font-bold font-heading flex items-center justify-center shrink-0">
                2
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                Connective Tissue &amp; Mobility
              </span>
            </div>
            <span className="text-xs font-bold text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-md shrink-0">
              Light Stretches
            </span>
          </div>

          <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-100/90 dark:bg-background/60 border border-slate-200/80 dark:border-white/[0.05] text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 text-[11px] font-bold font-heading flex items-center justify-center shrink-0">
                3
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                Electrolyte &amp; Protein Synthesis
              </span>
            </div>
            <span className="text-xs font-bold text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-md shrink-0">
              Hydrate
            </span>
          </div>
        </div>

        <Link to="/program" className="block relative z-10">
          <Button variant="outline" className="w-full h-12 border-indigo-500/30 hover:bg-indigo-500/10 text-foreground font-heading font-bold text-sm tracking-wide rounded-xl group/btn flex items-center justify-center gap-2">
            <span>View Full Program Schedule</span>
            <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
          </Button>
        </Link>
      </Card>
    );
  }

  if (!program || !todayWorkout) {
    return (
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-primary/[0.14] via-card to-card border-primary/30 shadow-[0_12px_36px_-6px_rgba(37,99,235,0.16)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.5)] relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-56 h-56 bg-primary/[0.12] rounded-full blur-3xl pointer-events-none -mr-16 -mt-16 group-hover:bg-primary/[0.18] transition-all duration-700" />

        <div className="flex items-start justify-between mb-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/35 flex items-center justify-center shadow-sm shadow-primary/25 shrink-0 group-hover:scale-105 transition-transform duration-300">
              <Dumbbell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest block font-heading">
                  Daily Protocol
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              </div>
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
          <Button className="w-full h-12 bg-gradient-to-r from-primary via-blue-600 to-primary hover:opacity-95 text-white font-heading font-bold text-sm tracking-wide shadow-[0_4px_24px_rgba(37,99,235,0.4)] active:scale-[0.99] transition-all rounded-xl group/btn flex items-center justify-center gap-2">
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
    <Card className="p-5 sm:p-6 bg-gradient-to-br from-primary/[0.14] via-card to-card border-primary/30 shadow-[0_12px_36px_-6px_rgba(37,99,235,0.16)] dark:shadow-[0_12px_36px_-6px_rgba(0,0,0,0.5)] relative overflow-hidden group">
      {/* Subtle top corner ambient glow */}
      <div className="absolute top-0 right-0 w-56 h-56 bg-primary/[0.12] rounded-full blur-3xl pointer-events-none -mr-16 -mt-16 group-hover:bg-primary/[0.18] transition-all duration-700" />

      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/35 flex items-center justify-center shadow-sm shadow-primary/25 shrink-0 group-hover:scale-105 transition-transform duration-300">
            <Dumbbell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest block font-heading">
                Today's Protocol
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </div>
            <p className="font-heading font-extrabold text-xl sm:text-2xl tracking-tight text-foreground mt-0.5">
              {todayWorkout.workout_type}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary/95 bg-primary/10 border border-primary/25 px-2.5 py-1 rounded-full shrink-0 shadow-xs">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="tabular-nums">~{estimatedTime}m</span>
        </div>
      </div>

      <div className="space-y-2 mb-5 relative z-10">
        {todayWorkout.exercises?.slice(0, 3).map((ex, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-100/90 dark:bg-background/60 border border-slate-200/80 dark:border-white/[0.05] text-sm hover:border-primary/40 dark:hover:border-primary/40 transition-all duration-200"
          >
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[11px] font-bold font-heading flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="text-foreground font-semibold truncate text-sm">
                {ex.name}
              </span>
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-muted-foreground bg-slate-200/80 dark:bg-muted/90 px-2.5 py-0.5 rounded-md shrink-0 tabular-nums">
              {ex.sets} × {ex.reps}
            </span>
          </div>
        ))}
        {exerciseCount > 3 && (
          <p className="text-xs font-medium text-muted-foreground text-center pt-0.5">
            +{exerciseCount - 3} more exercises in today's routine
          </p>
        )}
      </div>

      <Link to="/program" className="block relative z-10">
        <Button className="w-full h-12 bg-gradient-to-r from-primary via-blue-600 to-primary hover:opacity-95 text-white font-heading font-bold text-sm tracking-wide shadow-[0_4px_24px_rgba(37,99,235,0.4)] active:scale-[0.99] transition-all rounded-xl group/btn flex items-center justify-center gap-2">
          <span>Start Workout</span>
          <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
        </Button>
      </Link>
    </Card>
  );
}