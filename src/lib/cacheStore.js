/**
 * Synchronous client-side local storage caching layer for WASHEK.
 * Saves the last fetched workout and streak data so the UI can display
 * cached content immediately while fresh data is being fetched from Firestore.
 */

const STORAGE_KEYS = {
  LATEST_PROGRAM: 'washek_cached_active_program',
  LATEST_PROGRAMS_LIST: 'washek_cached_programs_list',
  LATEST_LOGS: 'washek_cached_workout_logs',
  LATEST_LAST_WORKOUT: 'washek_cached_last_workout',
  LATEST_STREAK: 'washek_cached_streak_data',
  LATEST_NUTRITION: 'washek_cached_nutrition_entries',
  LATEST_STATS: 'washek_cached_analytics_stats',
};

function safeParse(val, fallback = null) {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

/**
 * Retrieve the active workout program synchronously from local cache.
 */
export function getCachedActiveProgram(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_prog_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific);
        if (parsed) return parsed;
      }
    }
    return safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_PROGRAM));
  } catch {
    return null;
  }
}

/**
 * Cache active workout program synchronously.
 */
export function setCachedActiveProgram(program, userKey = null) {
  if (!program) return;
  try {
    const serialized = JSON.stringify(program);
    localStorage.setItem(STORAGE_KEYS.LATEST_PROGRAM, serialized);
    if (userKey) {
      localStorage.setItem(`washek_prog_${userKey}`, serialized);
    }
  } catch (err) {
    console.debug('[cacheStore] Program cache write note:', err);
  }
}

/**
 * Retrieve list of workout programs synchronously from local cache.
 */
export function getCachedProgramsList(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_programs_list_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific, []);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    }
    const generic = safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_PROGRAMS_LIST), []);
    if (Array.isArray(generic) && generic.length) return generic;
    const single = getCachedActiveProgram(userKey);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

/**
 * Save list of workout programs to local cache.
 */
export function setCachedProgramsList(programs, userKey = null) {
  if (!Array.isArray(programs)) return;
  try {
    const serialized = JSON.stringify(programs);
    localStorage.setItem(STORAGE_KEYS.LATEST_PROGRAMS_LIST, serialized);
    if (userKey) {
      localStorage.setItem(`washek_programs_list_${userKey}`, serialized);
    }
    if (programs[0]) {
      setCachedActiveProgram(programs[0], userKey);
    }
  } catch (err) {
    console.debug('[cacheStore] Programs list write note:', err);
  }
}

/**
 * Retrieve workout logs synchronously from local cache.
 */
export function getCachedLogs(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_logs_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific, []);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    }
    return safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_LOGS), []);
  } catch {
    return [];
  }
}

/**
 * Save workout logs to local cache. Automatically keeps the last workout cached as well.
 */
export function setCachedLogs(logs, userKey = null) {
  if (!Array.isArray(logs)) return;
  try {
    const serialized = JSON.stringify(logs);
    localStorage.setItem(STORAGE_KEYS.LATEST_LOGS, serialized);
    if (userKey) {
      localStorage.setItem(`washek_logs_${userKey}`, serialized);
    }
    // Automatically update last fetched workout if available
    if (logs.length > 0 && logs[0]) {
      setCachedLastWorkout(logs[0], userKey);
    }
  } catch (err) {
    console.debug('[cacheStore] Logs write note:', err);
  }
}

/**
 * Retrieve the last fetched workout synchronously from local storage.
 * If no standalone last workout entry is found, falls back to the top entry in cached logs.
 */
export function getCachedLastWorkout(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_last_workout_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific);
        if (parsed) return parsed;
      }
    }
    const generic = safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_LAST_WORKOUT));
    if (generic) return generic;

    // Fallback to top log
    const logs = getCachedLogs(userKey);
    return Array.isArray(logs) && logs.length > 0 ? logs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Save the last fetched workout synchronously into local storage.
 */
export function setCachedLastWorkout(workout, userKey = null) {
  if (!workout) return;
  try {
    const payload = {
      ...workout,
      _cachedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    localStorage.setItem(STORAGE_KEYS.LATEST_LAST_WORKOUT, serialized);
    if (userKey) {
      localStorage.setItem(`washek_last_workout_${userKey}`, serialized);
    }
  } catch (err) {
    console.debug('[cacheStore] Last workout write note:', err);
  }
}

/**
 * Retrieve cached streak data synchronously from local storage.
 */
export function getCachedStreakData(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_streak_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific);
        if (parsed !== null && parsed !== undefined) return parsed;
      }
    }
    return safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_STREAK), null);
  } catch {
    return null;
  }
}

/**
 * Get just the integer streak value from local cache (defaults to 0).
 */
export function getCachedStreak(userKey = null) {
  const data = getCachedStreakData(userKey);
  if (typeof data === 'number') return data;
  if (data && typeof data.streak === 'number') return data.streak;
  return 0;
}

/**
 * Save streak data synchronously to local storage.
 */
export function setCachedStreak(streakValueOrObj, userKey = null) {
  if (streakValueOrObj === null || streakValueOrObj === undefined) return;
  try {
    const dataToSave = typeof streakValueOrObj === 'object'
      ? { ...streakValueOrObj, _cachedAt: new Date().toISOString() }
      : { streak: Number(streakValueOrObj) || 0, _cachedAt: new Date().toISOString() };

    const serialized = JSON.stringify(dataToSave);
    localStorage.setItem(STORAGE_KEYS.LATEST_STREAK, serialized);
    if (userKey) {
      localStorage.setItem(`washek_streak_${userKey}`, serialized);
    }
  } catch (err) {
    console.debug('[cacheStore] Streak write note:', err);
  }
}

/**
 * Retrieve nutrition entries synchronously from local cache.
 */
export function getCachedNutrition(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_nutrition_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific, []);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    }
    return safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_NUTRITION), []);
  } catch {
    return [];
  }
}

/**
 * Save nutrition entries to local cache.
 */
export function setCachedNutrition(entries, userKey = null) {
  if (!Array.isArray(entries)) return;
  try {
    const serialized = JSON.stringify(entries);
    localStorage.setItem(STORAGE_KEYS.LATEST_NUTRITION, serialized);
    if (userKey) {
      localStorage.setItem(`washek_nutrition_${userKey}`, serialized);
    }
  } catch (err) {
    console.debug('[cacheStore] Nutrition write note:', err);
  }
}

/**
 * Retrieve general analytics stats synchronously from local cache.
 */
export function getCachedStats(userKey = null) {
  try {
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_stats_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific);
        if (parsed) return parsed;
      }
    }
    return safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_STATS), null);
  } catch {
    return null;
  }
}

/**
 * Save general analytics stats synchronously to local cache.
 */
export function setCachedStats(stats, userKey = null) {
  if (!stats) return;
  try {
    const serialized = JSON.stringify({ ...stats, _cachedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEYS.LATEST_STATS, serialized);
    if (userKey) {
      localStorage.setItem(`washek_stats_${userKey}`, serialized);
    }
  } catch (err) {
    console.debug('[cacheStore] Stats write note:', err);
  }
}
