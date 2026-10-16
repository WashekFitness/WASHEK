import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Flame, Drumstick, Wheat, Droplets } from 'lucide-react';
import { calcNutritionGoals } from '@/lib/nutritionGoals';
import { getLocalDateKey } from '@/lib/messageLimit';

export default function NutritionSummary({ entries, user }) {
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
    calcNutritionGoals(user);

  const calorieGoal =
    goals.calories || 1;

  const progress = Math.min(
    (totals.calories / calorieGoal) * 100,
    100
  );

  const macros = [
    {
      label: 'Protein',
      value: totals.protein,
      unit: 'g',
      icon: Drumstick,
      color: 'text-primary',
    },
    {
      label: 'Carbs',
      value: totals.carbs,
      unit: 'g',
      icon: Wheat,
      color: 'text-accent',
    },
    {
      label: 'Fat',
      value: totals.fat,
      unit: 'g',
      icon: Droplets,
      color: 'text-chart-4',
    },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-chart-4/15 border border-chart-4/25 flex items-center justify-center">
            <Flame className="w-4 h-4 text-chart-4" />
          </div>

          <div>
            <p className="font-heading font-bold text-sm tracking-tight">
              Daily Fuel
            </p>

            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              Nutrition Target
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

      <div className="mb-4 bg-slate-100/90 dark:bg-background/50 p-3 rounded-xl border border-slate-200/80 dark:border-white/[0.04]">
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
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 shadow-sm shadow-primary/30"
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
                  <span className="text-[11px] font-semibold text-muted-foreground ml-0.5 font-sans">
                    {unit}
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
