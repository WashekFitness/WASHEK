import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { CalendarCheck, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getWeekDaysForDate, getUserTimeZone } from '@/lib/dateUtils';

export default function WeekProgress({ logs, user, timeZone }) {
  const effectiveTz = timeZone || getUserTimeZone(user);
  const weekDays = getWeekDaysForDate(new Date(), effectiveTz);

  const completedDays = weekDays.map(dayObj =>
    logs?.some(l => l.date === dayObj.dateStr)
  );

  const completedCount = completedDays.filter(Boolean).length;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-chart-3/15 border border-chart-3/25 flex items-center justify-center shadow-2xs">
            <CalendarCheck className="w-4 h-4 text-chart-3" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-heading font-bold text-sm tracking-tight text-foreground">Weekly Rhythm</p>
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full tabular-nums">
                {Math.round((completedCount / 7) * 100)}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              {completedCount} of 7 days logged
            </p>
          </div>
        </div>
        <Link to="/progress" className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5 group">
          <span>View stats</span>
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      </div>

      {/* Precision Consistency Progress Track */}
      <div className="w-full h-1 bg-slate-200/80 dark:bg-muted/80 rounded-full overflow-hidden mb-3.5 shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-chart-3 via-primary to-accent transition-all duration-700 rounded-full"
          style={{ width: `${Math.round((completedCount / 7) * 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekDays.map((dayObj, i) => {
          const isDone = completedDays[i];
          const isToday = dayObj.isToday;

          return (
            <div key={dayObj.dateStr} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-9 h-10 sm:w-11 sm:h-12 rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all duration-200 border',
                  isDone
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30'
                    : isToday
                      ? 'bg-primary/15 text-primary border-primary/50 ring-2 ring-primary/20'
                      : 'bg-slate-100/90 dark:bg-background/60 text-slate-700 dark:text-muted-foreground border-slate-200/80 dark:border-white/[0.04] hover:border-slate-300 dark:hover:border-white/[0.1]'
                )}
              >
                <span className="text-[10px] font-bold uppercase opacity-80 leading-none">
                  {dayObj.dayShort[0]}
                </span>
                <span className="text-xs font-bold leading-tight mt-0.5">
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : (
                    String(dayObj.dateStr).slice(-2)
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}