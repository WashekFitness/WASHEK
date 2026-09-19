/**
 * WASHEK FITNESS - Timezone & Calendar Day Synchronization Utility
 *
 * Ensures all daily and monthly features:
 * - Workouts & scheduled daily workout card
 * - Week progress indicators & completed workout logs
 * - Streaks
 * - Macro tracking & daily nutrition goals
 * - Coach Kael monthly message limits
 * are strictly synchronized to the person's local calendar day and month,
 * resetting at exactly 12:00:00 AM midnight in their specific time zone.
 */

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the effective timezone for the user.
 * Priority: user.timezone > localStorage override > browser resolved timezone > 'UTC'
 */
export function getUserTimeZone(user = null) {
  if (user?.timezone && isValidTimeZone(user.timezone)) {
    return user.timezone;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('washek_user_timezone');
      if (stored && isValidTimeZone(stored)) {
        return stored;
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && isValidTimeZone(detected)) {
      return detected;
    }
  } catch {
    // Fallback
  }

  return 'UTC';
}

/**
 * Returns 'YYYY-MM-DD' formatted strictly in the specified timezone.
 * Resets to next day at exactly 12:00:00 AM in that timezone.
 */
export function getLocalDateKey(date = new Date(), timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const d = date instanceof Date ? date : new Date(date);

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Returns 'YYYY-MM' formatted strictly in the specified timezone.
 * Resets to next month at exactly 12:00:00 AM on the 1st in that timezone.
 */
export function getCurrentMonthKey(date = new Date(), timeZone = null) {
  return getLocalDateKey(date, timeZone).slice(0, 7);
}

/**
 * Returns 'YYYY-MM-DD' for yesterday in the specified timezone.
 */
export function getPreviousLocalDateKey(date = new Date(), timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setTime(d.getTime() - 86400000);
  return getLocalDateKey(d, tz);
}

/**
 * Returns 'YYYY-MM-DD' for tomorrow in the specified timezone.
 */
export function getNextLocalDateKey(date = new Date(), timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setTime(d.getTime() + 86400000);
  return getLocalDateKey(d, tz);
}

/**
 * Returns full weekday name ('Monday', 'Tuesday', etc.) in the specified timezone.
 */
export function getDayOfWeekName(date = new Date(), timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const d = date instanceof Date ? date : new Date(date);
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: tz,
    }).format(d);
  } catch {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[d.getDay()];
  }
}

/**
 * Returns short weekday name ('Mon', 'Tue', etc.) in the specified timezone.
 */
export function getDayOfWeekShort(date = new Date(), timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const d = date instanceof Date ? date : new Date(date);
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: tz,
    }).format(d);
  } catch {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }
}

/**
 * Checks whether the current day in the specified timezone is Monday.
 */
export function isMondayInTimeZone(date = new Date(), timeZone = null) {
  return getDayOfWeekShort(date, timeZone) === 'Mon';
}

/**
 * Returns the 7 days (Monday through Sunday) for the week containing the given date in the specified timezone.
 */
export function getWeekDaysForDate(date = new Date(), timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const todayKey = getLocalDateKey(new Date(), tz);
  const targetDateKey = getLocalDateKey(date, tz);

  // Parse YYYY-MM-DD components
  const [y, m, d] = targetDateKey.split('-').map(Number);
  // Construct a reference date at noon to avoid DST shift edge cases
  const ref = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  // Find weekday short in timezone
  const weekdayShort = getDayOfWeekShort(ref, tz);
  const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayIndex = weekdayOrder.indexOf(weekdayShort);
  const offsetToMonday = dayIndex >= 0 ? dayIndex : 0;

  const result = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(ref.getTime() + (i - offsetToMonday) * 86400000);
    const dateKey = getLocalDateKey(dayDate, tz);
    result.push({
      dateStr: dateKey,
      dayShort: weekdayOrder[i],
      isToday: dateKey === todayKey,
    });
  }

  return result;
}

/**
 * Calculates milliseconds remaining until exactly 12:00:00.000 AM midnight in the specified timezone.
 */
export function getMsUntilNextMidnight(timeZone = null) {
  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : getUserTimeZone();
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find(p => p.type === 'hour')?.value || 0) % 24;
    const min = Number(parts.find(p => p.type === 'minute')?.value || 0);
    const sec = Number(parts.find(p => p.type === 'second')?.value || 0);

    const msIntoDay = (hour * 3600 + min * 60 + sec) * 1000 + now.getMilliseconds();
    const msRemaining = (24 * 3600 * 1000) - msIntoDay;

    // Return with slight buffer (100ms) to ensure we cross midnight into 00:00:00
    return Math.max(100, Math.min(msRemaining + 100, 86400000));
  } catch {
    // Fallback: 60 seconds
    return 60000;
  }
}

/**
 * Common list of timezones with user-friendly labels.
 */
export const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Phoenix', label: 'Mountain Time - Arizona (No DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'Europe/London', label: 'London, Dublin, Edinburgh (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time (Paris, Berlin, Rome)' },
  { value: 'Europe/Athens', label: 'Eastern European Time (Athens, Cairo)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai)' },
  { value: 'Asia/Kolkata', label: 'India Standard Time' },
  { value: 'Asia/Singapore', label: 'Singapore, Hong Kong, Beijing' },
  { value: 'Asia/Tokyo', label: 'Tokyo, Seoul' },
  { value: 'Australia/Sydney', label: 'Sydney, Melbourne' },
  { value: 'Pacific/Auckland', label: 'Auckland, Wellington' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];
