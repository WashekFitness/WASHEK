import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WeekProgress({ logs }) {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getThisWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const weekStart = getThisWeekStart();
  const today = new Date();

  const completedDays = weekDays.map((_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    return logs.some(l => l.date === dateStr);
  });

  const todayIndex = (today.getDay() + 6) % 7;
  const workoutsThisWeek = completedDays.filter(Boolean).length;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-chart-3/20 flex items-center justify-center">
            <CalendarCheck className="w-4 h-4 text-chart-3" />
          </div>
          <p className="font-heading font-bold">This Week</p>
        </div>
        <Link to="/progress" className="text-xs text-primary font-medium hover:underline">
          View stats →
        </Link>
      </div>

      <div className="flex items-center justify-between gap-1">
        {weekDays.map((day, i) => (
          <div key={day} className="flex flex-col items-center gap-1.5">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold transition-all',
              completedDays[i]
                ? 'bg-primary text-primary-foreground'
                : i === todayIndex
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-muted text-muted-foreground'
            )}>
              {day[0]}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}