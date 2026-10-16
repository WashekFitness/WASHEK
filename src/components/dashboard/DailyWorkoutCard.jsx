import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dumbbell, ChevronRight, Clock } from 'lucide-react';
import { getDayOfWeekName, getUserTimeZone } from '@/lib/dateUtils';

export default function DailyWorkoutCard({ program, user, timeZone }) {
  const currentWeekData = program?.microcycles?.find(m => m.week_number === program.current_week);
  const effectiveTz = timeZone || getUserTimeZone(user);
  const today = getDayOfWeekName(new Date(), effectiveTz);
  const todayWorkout = currentWeekData?.days?.find(d =>
    d.day_name.toLowerCase().includes(today.toLowerCase())
  ) || currentWeekData?.days?.[0];

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