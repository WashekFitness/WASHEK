import { Card } from '@/components/ui/card';
import { Flame } from 'lucide-react';
import {
  getLocalDateKey,
  getPreviousLocalDateKey,
  getUserTimeZone,
} from '@/lib/dateUtils';

function daysDifference(dateKeyA, dateKeyB) {
  const [yA, mA, dA] = String(dateKeyA).split('-').map(Number);
  const [yB, mB, dB] = String(dateKeyB).split('-').map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  return Math.round((utcA - utcB) / 86400000);
}

function calcStreak(logs, timeZone) {
  if (!logs || logs.length === 0) return 0;
  const dates = [...new Set(logs.map(l => l.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const today = getLocalDateKey(new Date(), timeZone);
  const yesterday = getPreviousLocalDateKey(new Date(), timeZone);

  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = daysDifference(dates[i - 1], dates[i]);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

const encouragements = [
  "You're just getting warmed up. 🔥",
  "Consistency is your superpower.",
  "Look at you showing up. That's the hard part.",
  "Keep stacking those days. It adds up fast.",
  "Your future self is going to thank you for this.",
  "Not stopping now. Let's get it. 💪",
  "You're building something real here.",
  "That momentum is yours. Don't let it drop.",
];

export default function StreakCard({ logs, user, timeZone }) {
  const effectiveTz = timeZone || getUserTimeZone(user);
  const streak = calcStreak(logs, effectiveTz);
  const msg = encouragements[streak % encouragements.length];

  if (streak === 0) return null;

  return (
    <Card className="p-4 sm:p-5 flex items-center gap-4 border-amber-500/35 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-card shadow-[0_8px_30px_rgba(245,158,11,0.15)] relative overflow-hidden group">
      {/* Ambient background warm pulse */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none -mr-8 -mt-8 group-hover:bg-amber-500/15 transition-all duration-500" />

      <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-500/25 via-orange-500/20 to-amber-500/10 border border-amber-500/35 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform duration-300">
        <Flame className="w-6 h-6 text-amber-500 fill-amber-500/20 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)] animate-pulse" />
      </div>
      <div className="min-w-0 flex-1 relative z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="font-heading font-extrabold text-2xl sm:text-3xl text-amber-600 dark:text-amber-500 tracking-tight leading-none tabular-nums">
              {streak}
            </span>
            <span className="font-heading font-bold text-xs sm:text-sm text-amber-600/90 dark:text-amber-500/90 uppercase tracking-wider">
              {streak === 1 ? 'Day Streak' : 'Days Strong'}
            </span>
          </div>

          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full shrink-0">
            Unbroken
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate sm:whitespace-normal leading-relaxed">
          {msg}
        </p>
      </div>
    </Card>
  );
}