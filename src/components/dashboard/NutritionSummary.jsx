import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Flame, Drumstick, Wheat, Droplets } from 'lucide-react';
import { calcNutritionGoals } from '@/lib/nutritionGoals';
import { getLocalDateKey } from '@/lib/messageLimit';
import { canAccess } from '@/lib/subscription';

export default function NutritionSummary({ entries, user, logs, program }) {
  const [today, setToday] = useState(
    () => getLocalDateKey()
  );

  useEffect(() => {
    const updateDate = () => {
      setToday(getLocalDateKey());
    };

    updateDate();

    const interval = window.setInterval(
      updateDate,
      30 * 1000
    );

    return () =>
      window.clearInterval(interval);
  }, []);

  const todayEntries = entries.filter(
    (entry) => entry.date === today
  );

  const totals = todayEntries.reduce(
    (acc, entry) => ({
      calories:
        acc.calories +
        (Number(entry.calories) || 0),

      protein:
        acc.protein +
        (Number(entry.protein_g) || 0),

      carbs:
        acc.carbs +
        (Number(entry.carbs_g) || 0),

      fat:
        acc.fat +
        (Number(entry.fat_g) || 0),
    }),
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    }
  );

  const goals =
    calcNutritionGoals(user, {
      userKey: user?.id || user?.uid || user?.email,
      workoutLogs: logs,
      program,
    });

  const hasAdvancedMacros = canAccess(
    user,
    'advanced_macro_tracking'
  );

  const effectiveGoals = hasAdvancedMacros
    ? goals
    : (goals?.base || goals);

  const calorieGoal =
    effectiveGoals.calories || 1;

  const progress = Math.min(
    (totals.calories / calorieGoal) * 100,
    100
  );

  const macros = [
    {
      label: 'Protein',
      value: totals.protein,
      goal: effectiveGoals.protein,
      unit: 'g',
      icon: Drumstick,
      color: 'text-primary',
    },
    {
      label: 'Carbs',
      value: totals.carbs,
      goal: effectiveGoals.carbs,
      unit: 'g',
      icon: Wheat,
      color: 'text-accent',
    },
    {
      label: 'Fat',
      value: totals.fat,
      goal: effectiveGoals.fat,
      unit: 'g',
      icon: Droplets,
      color: 'text-chart-4',
    },
  ];

  return (
    <Card className="p-4 sm:p-5 bg-card/95 border border-border/80 dark:border-white/10 dark:hover:border-primary/40 shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-3xl relative overflow-hidden group">
      {/* Ambient fuel glow */}
      <div className="absolute top-0 right-0 w-48 h-32 bg-emerald-500/[0.08] rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between mb-3.5 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-chart-4/15 border border-chart-4/30 shadow-[0_0_10px_rgba(245,158,11,0.2)] flex items-center justify-center">
            <Flame className="w-4 h-4 text-chart-4" />
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-heading font-bold text-sm tracking-tight text-foreground">
                Daily Fuel
              </p>
              {hasAdvancedMacros && goals?.adaptation?.demandBadge ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary/15 border border-primary/30 text-primary shadow-[0_0_8px_rgba(37,99,235,0.25)] leading-none">
                  {goals.adaptation.demandBadge}
                </span>
              ) : hasAdvancedMacros && goals?.adaptation?.currentWeek ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary/15 border border-primary/30 text-primary shadow-[0_0_8px_rgba(37,99,235,0.25)] leading-none">
                  W{goals.adaptation.currentWeek} Adapted
                </span>
              ) : null}
            </div>

            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              {hasAdvancedMacros && goals?.adaptation?.statusTitle
                ? goals.adaptation.statusTitle
                : hasAdvancedMacros && goals?.adaptation?.phaseName
                  ? `${goals.adaptation.phaseName.split('&')[0].trim()}`
                  : 'Daily Calorie Target'}
            </p>
          </div>
        </div>

        <Link
          to="/nutrition"
          className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5"
        >
          View log →
        </Link>
      </div>

      <div className="mb-4 bg-slate-100/90 dark:bg-background/50 p-3 rounded-2xl border border-slate-200/80 dark:border-white/[0.06] relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">
            Calories Consumed
          </span>

          <span className="text-xs font-bold font-heading">
            {Math.round(totals.calories)} <span className="text-muted-foreground font-normal">/ {Math.round(calorieGoal)} kcal</span>
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-slate-200/80 dark:bg-muted/80 overflow-hidden relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-blue-500 to-accent transition-all duration-500 shadow-[0_0_12px_rgba(37,99,235,0.5)]"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {macros.map(
          ({
            label,
            value,
            goal,
            unit,
            icon: Icon,
            color,
          }) => {
            const isProtein = label === 'Protein';
            const isCarbs = label === 'Carbs';
            const tintBorder = isProtein
              ? 'border-blue-500/25 dark:border-blue-500/20 hover:border-blue-500/40'
              : isCarbs
                ? 'border-emerald-500/25 dark:border-emerald-500/20 hover:border-emerald-500/40'
                : 'border-amber-500/25 dark:border-amber-500/20 hover:border-amber-500/40';

            const tintBg = isProtein
              ? 'bg-blue-500/[0.04] dark:bg-blue-500/[0.06]'
              : isCarbs
                ? 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]'
                : 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06]';

            return (
              <div
                key={label}
                className={`rounded-xl ${tintBg} ${tintBorder} border p-2.5 sm:p-3 text-center flex flex-col items-center justify-center transition-all duration-200 shadow-2xs hover:-translate-y-0.5`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon
                    className={`w-3.5 h-3.5 ${color}`}
                  />

                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
                    {label}
                  </span>
                </div>

                <p className="font-heading font-extrabold text-base sm:text-lg leading-none tabular-nums text-foreground">
                  {Math.round(value)}
                  <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground ml-0.5 font-sans">
                    / {Math.round(goal || 0)}{unit}
                  </span>
                </p>
              </div>
            );
          }
        )}
      </div>
    </Card>
  );
}
