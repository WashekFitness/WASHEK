import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  Trophy,
  Flame,
  Clock,
  TrendingUp,
  Lock,
  CalendarDays,
  Activity,
  Target,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import PageHeader from '@/components/layout/PageHeader';
import { supabaseApi } from '@/lib/supabaseApi';
import { canAccess } from '@/lib/subscription';

function pad(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateKey, amount) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toLocalDateKey(date);
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function formatDate(dateKey) {
  const date = dateFromKey(dateKey);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatShortDay(dateKey) {
  return dateFromKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'short',
  });
}

function uniqueDateCount(logs) {
  return new Set(
    logs
      .map((log) => log?.date)
      .filter(Boolean)
  ).size;
}

export default function Progress() {
  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => supabaseApi.auth.me(),
  });

  const email = user?.email;
  const plan = user?.subscription_plan || 'free';
  const hasWorkoutAnalytics = canAccess(
    plan,
    'workout_analytics'
  );

  const { data: logs = [] } = useQuery({
    queryKey: ['progress-workout-logs', email],
    queryFn: () =>
      supabaseApi.entities.WorkoutLog.filter(
        { created_by: email },
        '-date',
        500
      ),
    enabled: !!email,
  });

  const { data: nutrition = [] } = useQuery({
    queryKey: ['progress-nutrition', email],
    queryFn: () =>
      supabaseApi.entities.NutritionEntry.filter(
        { created_by: email },
        '-date',
        500
      ),
    enabled: !!email,
  });

  const todayKey = toLocalDateKey();

  const stats = useMemo(() => {
    const totalWorkouts = logs.length;

    const totalMinutes = logs.reduce(
      (sum, log) =>
        sum + Number(log?.duration_minutes || 0),
      0
    );

    const workoutDays = new Set(
      logs
        .map((log) => log?.date)
        .filter(Boolean)
    );

    let streak = 0;
    let checkDate = todayKey;

    // A streak can start yesterday if the user has not worked out yet today.
    if (!workoutDays.has(checkDate)) {
      checkDate = addDays(checkDate, -1);
    }

    while (workoutDays.has(checkDate)) {
      streak += 1;
      checkDate = addDays(checkDate, -1);
    }

    return {
      totalWorkouts,
      totalMinutes,
      streak,
      workoutDays: workoutDays.size,
    };
  }, [logs, todayKey]);

  const weeklyData = useMemo(() => {
    const currentWeekStart = startOfWeek();

    return Array.from({ length: 8 }, (_, index) => {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(
        currentWeekStart.getDate() -
          (7 - index) * 7
      );

      const startKey = toLocalDateKey(weekStart);
      const endKey = addDays(startKey, 7);

      const workouts = logs.filter(
        (log) =>
          log?.date >= startKey &&
          log?.date < endKey
      ).length;

      return {
        week:
          index === 7
            ? 'This week'
            : `W${index + 1}`,
        workouts,
        label: `${formatDate(
          startKey
        )}–${formatDate(
          addDays(endKey, -1)
        )}`,
      };
    });
  }, [logs]);

  const calorieData = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const dateKey = addDays(
        todayKey,
        index - 6
      );

      const calories = nutrition
        .filter(
          (entry) =>
            entry?.date === dateKey
        )
        .reduce(
          (sum, entry) =>
            sum + Number(entry?.calories || 0),
          0
        );

      return {
        day: formatShortDay(dateKey),
        calories: Math.round(calories),
      };
    });
  }, [nutrition, todayKey]);

  const analytics = useMemo(() => {
    const eightWeekLogs = logs.filter((log) => {
      const oldest = addDays(todayKey, -55);
      return (
        log?.date >= oldest &&
        log?.date <= todayKey
      );
    });

    const totalWorkouts = eightWeekLogs.length;
    const totalMinutes = eightWeekLogs.reduce(
      (sum, log) =>
        sum + Number(log?.duration_minutes || 0),
      0
    );

    const workoutDates = new Set(
      eightWeekLogs
        .map((log) => log?.date)
        .filter(Boolean)
    );

    const activeWeeks = weeklyData.filter(
      (week) => week.workouts > 0
    ).length;

    const averageWorkoutsPerWeek =
      totalWorkouts / 8;

    const averageSessionMinutes =
      totalWorkouts > 0
        ? totalMinutes / totalWorkouts
        : 0;

    const consistency =
      activeWeeks > 0
        ? (activeWeeks / 8) * 100
        : 0;

    const bestWeek = weeklyData.reduce(
      (best, week) =>
        week.workouts > best.workouts
          ? week
          : best,
      { workouts: 0, week: '—' }
    );

    const recentFourWeeks = weeklyData.slice(-4);
    const previousFourWeeks =
      weeklyData.slice(0, 4);

    const recentAverage =
      recentFourWeeks.reduce(
        (sum, week) =>
          sum + week.workouts,
        0
      ) / 4;

    const previousAverage =
      previousFourWeeks.reduce(
        (sum, week) =>
          sum + week.workouts,
        0
      ) / 4;

    let trend = 0;
    if (previousAverage > 0) {
      trend =
        ((recentAverage -
          previousAverage) /
          previousAverage) *
        100;
    } else if (recentAverage > 0) {
      trend = 100;
    }

    const totalLoggedDays =
      uniqueDateCount(eightWeekLogs);

    return {
      totalWorkouts,
      totalMinutes,
      averageWorkoutsPerWeek,
      averageSessionMinutes,
      consistency,
      bestWeek,
      trend,
      totalLoggedDays,
      workoutDates,
    };
  }, [logs, todayKey, weeklyData]);

  const recentWorkouts = useMemo(
    () =>
      [...logs]
        .filter((log) => log?.date)
        .sort((a, b) =>
          String(b.date).localeCompare(
            String(a.date)
          )
        )
        .slice(0, 5),
    [logs]
  );

  const statCards = [
    {
      label: 'Total Workouts',
      value: stats.totalWorkouts,
      icon: Trophy,
      color: 'text-primary',
    },
    {
      label: 'Current Streak',
      value: `${stats.streak} days`,
      icon: Flame,
      color: 'text-accent',
    },
    {
      label: 'Total Time',
      value: `${Math.round(
        stats.totalMinutes
      )} min`,
      icon: Clock,
      color: 'text-chart-4',
    },
  ];

  return (
    <div className="px-5 pb-8">
      <PageHeader
        title="Progress"
        subtitle="Your journey at a glance"
      />

      <div className="mb-5" />

      <div className="grid grid-cols-3 gap-3 mb-6">
        {statCards.map(
          ({
            label,
            value,
            icon: Icon,
            color,
          }) => (
            <Card
              key={label}
              className="p-3 text-center"
            >
              <Icon
                className={`w-5 h-5 ${color} mx-auto mb-1`}
              />
              <p className="font-heading font-bold text-lg">
                {value}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {label}
              </p>
            </Card>
          )
        )}
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <p className="font-heading font-bold text-sm">
            Weekly Workouts
          </p>
        </div>

        <ResponsiveContainer
          width="100%"
          height={170}
        >
          <BarChart data={weeklyData}>
            <XAxis
              dataKey="week"
              tick={{
                fontSize: 10,
                fill: 'hsl(var(--muted-foreground))',
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              formatter={(value) => [
                `${value} workout${
                  value === 1 ? '' : 's'
                }`,
                'Completed',
              ]}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.label ||
                ''
              }
              contentStyle={{
                background:
                  'hsl(var(--card))',
                border:
                  '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="workouts"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-4 h-4 text-accent" />
          <p className="font-heading font-bold text-sm">
            Daily Calories (7 days)
          </p>
        </div>

        <ResponsiveContainer
          width="100%"
          height={170}
        >
          <BarChart data={calorieData}>
            <XAxis
              dataKey="day"
              tick={{
                fontSize: 11,
                fill: 'hsl(var(--muted-foreground))',
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              formatter={(value) => [
                `${value} kcal`,
                'Calories',
              ]}
              contentStyle={{
                background:
                  'hsl(var(--card))',
                border:
                  '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="calories"
              fill="hsl(var(--accent))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <div>
            <p className="font-heading font-bold text-sm">
              Workout Analytics
            </p>
            <p className="text-[10px] text-muted-foreground">
              Performance dashboard
            </p>
          </div>
        </div>

        {hasWorkoutAnalytics ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-primary" />
                  <p className="text-[10px] text-muted-foreground">
                    Avg. workouts / week
                  </p>
                </div>
                <p className="font-heading font-bold text-xl">
                  {analytics.averageWorkoutsPerWeek.toFixed(
                    1
                  )}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-chart-4" />
                  <p className="text-[10px] text-muted-foreground">
                    Avg. session time
                  </p>
                </div>
                <p className="font-heading font-bold text-xl">
                  {Math.round(
                    analytics.averageSessionMinutes
                  )}{' '}
                  min
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <p className="text-[10px] text-muted-foreground">
                    8-week total
                  </p>
                </div>
                <p className="font-heading font-bold text-xl">
                  {analytics.totalWorkouts}
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-accent" />
                  <p className="text-[10px] text-muted-foreground">
                    Best week
                  </p>
                </div>
                <p className="font-heading font-bold text-xl">
                  {analytics.bestWeek.workouts}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    workouts
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="rounded-lg border p-3">
                <p className="text-[10px] text-muted-foreground mb-1">
                  Training consistency
                </p>
                <p className="font-heading font-bold text-xl">
                  {Math.round(
                    analytics.consistency
                  )}
                  %
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Active weeks in the last 8
                </p>
              </div>

              <div className="rounded-lg border p-3">
                <p className="text-[10px] text-muted-foreground mb-1">
                  4-week trend
                </p>
                <p className="font-heading font-bold text-xl">
                  {analytics.trend > 0
                    ? '+'
                    : ''}
                  {Math.round(
                    analytics.trend
                  )}
                  %
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  vs. previous 4 weeks
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 mt-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold">
                  Training snapshot
                </p>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                {analytics.totalWorkouts === 0
                  ? 'Start logging workouts to build your performance history.'
                  : analytics.trend > 5
                    ? 'Your recent training frequency is trending upward. Keep building consistently.'
                    : analytics.trend < -5
                      ? 'Your recent training frequency has dipped. Focus on getting back to your normal routine.'
                      : 'Your recent training frequency is staying relatively consistent.'}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-xs font-heading font-bold mb-3">
                Recent workouts
              </p>

              {recentWorkouts.length > 0 ? (
                <div className="space-y-2">
                  {recentWorkouts.map(
                    (workout, index) => (
                      <div
                        key={
                          workout.id ||
                          `${workout.date}-${index}`
                        }
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {workout.name ||
                              workout.workout_name ||
                              workout.title ||
                              'Workout'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDate(
                              workout.date
                            )}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold">
                            {Number(
                              workout.duration_minutes ||
                                0
                            ) > 0
                              ? `${Math.round(
                                  Number(
                                    workout.duration_minutes
                                  )
                                )} min`
                              : 'Logged'}
                          </p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Your recent workout history will appear here.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <Lock className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="font-heading font-bold text-sm">
              Performance Analytics
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upgrade to Performance to unlock your
              deeper workout analytics dashboard,
              including training frequency, session
              duration, consistency, trends, and
              performance history.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
