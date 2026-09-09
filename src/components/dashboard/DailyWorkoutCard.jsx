import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dumbbell, ChevronRight, Clock } from 'lucide-react';

export default function DailyWorkoutCard({ program }) {
  if (!program) return null;

  const currentWeekData = program.microcycles?.find(m => m.week_number === program.current_week);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayWorkout = currentWeekData?.days?.find(d =>
    d.day_name.toLowerCase().includes(today.toLowerCase())
  ) || currentWeekData?.days?.[0];

  if (!todayWorkout) return null;

  const exerciseCount = todayWorkout.exercises?.length || 0;
  const estimatedTime = exerciseCount * 4;

  return (
    <Card className="p-5 bg-gradient-to-br from-primary/15 via-card to-card border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Today's Workout</p>
            <p className="font-heading font-bold text-lg">{todayWorkout.workout_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
          <Clock className="w-3 h-3" />
          ~{estimatedTime} min
        </div>
      </div>

      <div className="space-y-1.5 mb-4">
        {todayWorkout.exercises?.slice(0, 3).map((ex, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-foreground/80">{ex.name}</span>
            <span className="text-muted-foreground text-xs">{ex.sets}×{ex.reps}</span>
          </div>
        ))}
        {exerciseCount > 3 && (
          <p className="text-xs text-muted-foreground">+{exerciseCount - 3} more exercises</p>
        )}
      </div>

      <Link to="/program">
        <Button className="w-full h-12 font-heading font-semibold">
          Start Workout <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </Link>
    </Card>
  );
}