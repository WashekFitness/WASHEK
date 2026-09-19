import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getUserTimeZone,
  getLocalDateKey,
  getCurrentMonthKey,
  getMsUntilNextMidnight,
} from '@/lib/dateUtils';

/**
 * useMidnightSync Hook
 *
 * Keeps component state synchronized to the user's local calendar day and month.
 * At exactly 12:00:00 AM midnight in the person's time zone, this hook triggers
 * state updates and invalidates query caches so workouts, macros, and quotas reset
 * immediately without requiring a full page refresh.
 */
export function useMidnightSync(user = null) {
  const queryClient = useQueryClient();
  const timeZone = getUserTimeZone(user);

  const [currentDateKey, setCurrentDateKey] = useState(() =>
    getLocalDateKey(new Date(), timeZone)
  );
  const [currentMonthKey, setCurrentMonthKey] = useState(() =>
    getCurrentMonthKey(new Date(), timeZone)
  );

  const currentDateRef = useRef(currentDateKey);
  const currentMonthRef = useRef(currentMonthKey);
  currentDateRef.current = currentDateKey;
  currentMonthRef.current = currentMonthKey;

  const handleDayReset = useCallback(
    (newDateKey, newMonthKey) => {
      setCurrentDateKey(newDateKey);
      setCurrentMonthKey(newMonthKey);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('calendar-day-reset', {
            detail: {
              dateKey: newDateKey,
              monthKey: newMonthKey,
              timeZone,
            },
          })
        );
      }

      // Invalidate relevant queries so all daily and monthly stats refresh to 0 / today
      queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
      queryClient.invalidateQueries({ queryKey: ['kael-usage'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-update'] });
    },
    [queryClient, timeZone]
  );

  const checkDateRollover = useCallback(() => {
    const now = new Date();
    const newDateKey = getLocalDateKey(now, timeZone);
    const newMonthKey = getCurrentMonthKey(now, timeZone);

    if (newDateKey !== currentDateRef.current) {
      handleDayReset(newDateKey, newMonthKey);
    }
  }, [timeZone, handleDayReset]);

  useEffect(() => {
    // Initial verification in case timezone changed
    checkDateRollover();

    let timerId = null;

    const scheduleMidnight = () => {
      const ms = getMsUntilNextMidnight(timeZone);
      timerId = setTimeout(() => {
        checkDateRollover();
        scheduleMidnight();
      }, ms);
    };

    scheduleMidnight();

    // Secondary 15-second heartbeat to handle laptop sleep / tab backgrounding
    const intervalId = setInterval(checkDateRollover, 15000);

    // Visibility change check
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkDateRollover();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerId) clearTimeout(timerId);
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeZone, checkDateRollover]);

  return {
    todayKey: currentDateKey,
    monthKey: currentMonthKey,
    timeZone,
  };
}
