import {
  getLocalDateKey,
  getPreviousLocalDateKey,
  getDayOfWeekName,
  getDayOfWeekShort,
  getUserTimeZone,
} from '@/lib/dateUtils';

/**
 * Determines whether a given date key ('YYYY-MM-DD') or Date is a scheduled workout day
 * or a scheduled rest day according to the user's active program / schedule.
 *
 * @param {string|Date} dateOrKey - 'YYYY-MM-DD' string or Date object
 * @param {object|null} program - normalized workout program with microcycles
 * @param {object|null} user - user profile object
 * @param {string|null} timeZone - IANA timezone string
 * @returns {boolean} true if it is a scheduled workout day; false if it is a rest day
 */
export function isScheduledWorkoutDay(dateOrKey, program = null, user = null, timeZone = null) {
  const effectiveTz = timeZone || getUserTimeZone(user);
  let dateObj;
  if (dateOrKey instanceof Date) {
    dateObj = dateOrKey;
  } else if (typeof dateOrKey === 'string' && dateOrKey.includes('-')) {
    const [y, m, d] = dateOrKey.split('-').map(Number);
    // Construct in noon UTC to avoid DST edge-case shifting
    dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  } else {
    dateObj = new Date();
  }

  const weekdayName = getDayOfWeekName(dateObj, effectiveTz).toLowerCase();
  const weekdayShort = getDayOfWeekShort(dateObj, effectiveTz).toLowerCase();

  // If program provides custom training_days array (e.g. ['Monday', 'Wednesday', 'Friday'])
  if (Array.isArray(program?.training_days) && program.training_days.length > 0) {
    return program.training_days.some(
      (td) =>
        String(td).toLowerCase().includes(weekdayName) ||
        String(td).toLowerCase().includes(weekdayShort)
    );
  }

  // Check program microcycles
  if (Array.isArray(program?.microcycles) && program.microcycles.length > 0) {
    const currentWeekNum = Number(program.current_week) || 1;
    const currentWeekData =
      program.microcycles.find((m) => m.week_number === currentWeekNum) ||
      program.microcycles[0];

    const days = Array.isArray(currentWeekData?.days) ? currentWeekData.days : [];

    if (days.length > 0) {
      // 1. Check if days explicitly mention weekday names (e.g. "Monday - Upper Push")
      const matchingDay = days.find((d) => {
        const name = (d.day_name || '').toLowerCase();
        const type = (d.workout_type || '').toLowerCase();
        return name.includes(weekdayName) || name.includes(weekdayShort) || type.includes(weekdayName);
      });

      if (matchingDay) {
        const isRest =
          (!matchingDay.exercises || matchingDay.exercises.length === 0) ||
          (matchingDay.workout_type || '').toLowerCase().includes('rest') ||
          (matchingDay.day_name || '').toLowerCase().includes('rest');
        return !isRest;
      }

      // Check if ANY other day mentions a weekday name
      const anyDayHasWeekday = days.some((d) => {
        const name = (d.day_name || '').toLowerCase();
        return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].some(
          (w) => name.includes(w)
        );
      });

      if (anyDayHasWeekday) {
        // Since other days have explicit weekdays and this weekday isn't present, today is a Rest Day
        return false;
      }

      // 2. Generic day labels ("Day 1", "Day 2", etc.):
      // Map based on number of active training days across standard periodization splits
      const activeTrainingDays = days.filter((d) => {
        const hasExercises = Array.isArray(d.exercises) && d.exercises.length > 0;
        const isNotRest = !(d.workout_type || '').toLowerCase().includes('rest');
        return hasExercises && isNotRest;
      });

      const numActive = activeTrainingDays.length || days.length;

      // 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
      const dayOfWeek = dateObj.getUTCDay();

      switch (numActive) {
        case 1:
          return dayOfWeek === 1; // Mon
        case 2:
          return dayOfWeek === 2 || dayOfWeek === 4; // Tue, Thu
        case 3:
          return dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5; // Mon, Wed, Fri
        case 4:
          // Standard WASHEK split: Mon, Tue, Thu, Fri (Wed, Sat, Sun are Rest Days)
          return dayOfWeek === 1 || dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 5;
        case 5:
          // Mon - Fri
          return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 6:
          // Mon - Sat
          return dayOfWeek >= 1 && dayOfWeek <= 6;
        default:
          return true; // 7-day program
      }
    }
  }

  // Default fallback if no program is set: standard 4-day split
  // Monday(1), Tuesday(2), Thursday(4), Friday(5) are workout days.
  // Wednesday(3), Saturday(6), Sunday(0) are rest days.
  const dow = dateObj.getUTCDay();
  return dow === 1 || dow === 2 || dow === 4 || dow === 5;
}

/**
 * Returns true if the date is an actual scheduled rest day.
 */
export function isActualRestDay(dateOrKey, program = null, user = null, timeZone = null) {
  return !isScheduledWorkoutDay(dateOrKey, program, user, timeZone);
}

/**
 * Calculates the user's workout streak with rest-day awareness.
 *
 * Rules:
 * 1. Only increments when a workout for the scheduled day is completed.
 * 2. If a day is an authorized rest day (or marked rest day), the streak stays where it is (does NOT break, does NOT increment).
 * 3. When a scheduled workout day arrives:
 *    - If completed: streak continues and increments.
 *    - If currently in progress (today): streak holds steady waiting for completion.
 *    - If missed (in the past): streak resets.
 *
 * @param {Array} logs - array of workout logs with .date
 * @param {object|string} optionsOrTz - config object { user, timeZone, program, manualRestDays } or timezone string
 * @param {object} [maybeUser] - optional user object for backwards compatibility
 * @param {object} [maybeProgram] - optional program object for backwards compatibility
 * @returns {number} current streak count
 */
export function calcStreak(logs, optionsOrTz = null, maybeUser = null, maybeProgram = null) {
  if (!Array.isArray(logs) || logs.length === 0) return 0;

  let timeZone = null;
  let user = null;
  let program = null;
  let manualRestDays = null;

  if (typeof optionsOrTz === 'string') {
    timeZone = optionsOrTz;
    user = maybeUser;
    program = maybeProgram;
  } else if (optionsOrTz && typeof optionsOrTz === 'object') {
    timeZone = optionsOrTz.timeZone || null;
    user = optionsOrTz.user || maybeUser;
    program = optionsOrTz.program || maybeProgram;
    manualRestDays = optionsOrTz.manualRestDays || null;
  }

  // Fallback to localStorage for manualRestDays if not explicitly passed
  if (!manualRestDays && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('washek_app_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        manualRestDays = parsed?.manualRestDays || null;
      }
    } catch (_) {
      // Ignore storage read error
    }
  }

  const effectiveTz = timeZone || getUserTimeZone(user);
  const todayKey = getLocalDateKey(new Date(), effectiveTz);

  // Set of all unique dates with completed workout logs
  const workoutDates = new Set(
    logs
      .map((l) => l?.date || l?.created_date)
      .filter(Boolean)
      .map((d) => String(d).slice(0, 10))
  );

  let streak = 0;
  let checkDate = todayKey;

  // 1. Check today's status
  if (workoutDates.has(todayKey)) {
    // Workout completed today!
    streak += 1;
    checkDate = getPreviousLocalDateKey(checkDate, effectiveTz);
  } else {
    // Today has no completed workout yet.
    // Today is still ongoing, so whether it's a workout day or rest day,
    // today does NOT break the streak, but also does NOT increment it.
    checkDate = getPreviousLocalDateKey(checkDate, effectiveTz);
  }

  // 2. Iterate backwards day by day into history (safe bound of 365 days)
  for (let step = 0; step < 365; step++) {
    if (workoutDates.has(checkDate)) {
      // Workout was completed on this day! Increment streak.
      streak += 1;
      checkDate = getPreviousLocalDateKey(checkDate, effectiveTz);
    } else {
      // No workout logged on checkDate.
      const isWorkoutDay = isScheduledWorkoutDay(checkDate, program, user, effectiveTz);
      const isManualRest = Boolean(manualRestDays?.[checkDate]);

      // This only works for actual rest days:
      // An authorized rest day is either an actual scheduled rest day, or confirmed manual rest day on a rest day
      const isRest = !isWorkoutDay || (isManualRest && !isWorkoutDay);

      if (isRest) {
        // Authorized REST DAY!
        // The streak stays where it is: does NOT break, does NOT increment.
        checkDate = getPreviousLocalDateKey(checkDate, effectiveTz);
      } else {
        // A scheduled workout day was MISSED in the past!
        // The streak is broken at this point.
        break;
      }
    }
  }

  return streak;
}
