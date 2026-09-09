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
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-chart-4" />

          <div>
            <p className="font-heading font-bold">
              Nutrition
            </p>

            <p className="text-[10px] text-muted-foreground">
              Today
            </p>
          </div>
        </div>

        <Link
          to="/nutrition"
          className="text-xs text-primary font-medium"
        >
          View
        </Link>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">
            Calories
          </span>

          <span className="text-xs font-semibold">
            {Math.round(totals.calories)} /{' '}
            {Math.round(calorieGoal)} kcal
          </span>
        </div>

        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {macros.map(
          ({
            label,
            value,
            unit,
            icon: Icon,
            color,
          }) => (
            <div
              key={label}
              className="rounded-xl bg-muted/40 p-2"
            >
              <div className="flex items-center gap-1 mb-1">
                <Icon
                  className={`w-3.5 h-3.5 ${color}`}
                />

                <span className="text-[10px] text-muted-foreground">
                  {label}
                </span>
              </div>

              <p className="font-heading font-bold text-sm">
                {Math.round(value)}
                <span className="text-[10px] text-muted-foreground ml-0.5">
                  {unit}
                </span>
              </p>
            </div>
          )
        )}
      </div>
    </Card>
  );
}
