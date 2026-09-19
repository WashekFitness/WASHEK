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
    <Card className="p-4 flex items-center gap-4 border-chart-4/30 bg-chart-4/5">
      <div className="w-12 h-12 rounded-2xl bg-chart-4/20 flex items-center justify-center flex-shrink-0">
        <Flame className="w-6 h-6 text-chart-4" />
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading font-bold text-2xl text-chart-4">{streak}</span>
          <span className="font-heading font-bold text-base text-chart-4">day streak</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{msg}</p>
      </div>
    </Card>
  );
}