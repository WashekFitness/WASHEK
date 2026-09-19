import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWeekDaysForDate, getUserTimeZone } from '@/lib/dateUtils';

export default function WeekProgress({ logs, user, timeZone }) {
  const effectiveTz = timeZone || getUserTimeZone(user);
  const weekDays = getWeekDaysForDate(new Date(), effectiveTz);

  const completedDays = weekDays.map(dayObj =>
    logs?.some(l => l.date === dayObj.dateStr)
  );

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
        {weekDays.map((dayObj, i) => (
          <div key={dayObj.dateStr} className="flex flex-col items-center gap-1.5">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold transition-all',
              completedDays[i]
                ? 'bg-primary text-primary-foreground'
                : dayObj.isToday
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-muted text-muted-foreground'
            )}>
              {dayObj.dayShort[0]}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}