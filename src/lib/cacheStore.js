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
  LATEST_SAVED_MEALS: 'washek_cached_saved_meals',
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
 * When dateKey is provided, strictly filters entries so previous day's
 * macros never flash or display on a fresh day.
 */
export function getCachedNutrition(userKey = null, dateKey = null) {
  try {
    let list = [];

    // 1. Check exact date-specific cache first
    if (userKey && dateKey) {
      const dateSpecific = localStorage.getItem(`washek_nutrition_${userKey}_${dateKey}`);
      if (dateSpecific) {
        const parsed = safeParse(dateSpecific, []);
        if (Array.isArray(parsed)) return parsed;
      }
    }

    // 2. Check user-specific cache
    if (userKey) {
      const userSpecific = localStorage.getItem(`washek_nutrition_${userKey}`);
      if (userSpecific) {
        const parsed = safeParse(userSpecific, []);
        if (Array.isArray(parsed) && parsed.length) list = parsed;
      }
    }

    // 3. Fallback to generic cache
    if (!list.length) {
      list = safeParse(localStorage.getItem(STORAGE_KEYS.LATEST_NUTRITION), []);
    }

    // 4. Strict date matching: if dateKey is supplied, only return entries for that exact calendar day!
    if (dateKey && Array.isArray(list)) {
      return list.filter((e) => {
        const entryDate =
          e?.date ||
          e?.created_date ||
          (typeof e?.created_at === 'string' ? e.created_at.slice(0, 10) : null);
        return entryDate === dateKey;
      });
    }

    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Save nutrition entries to local cache, keyed by both user and calendar date.
 */
export function setCachedNutrition(entries, userKey = null, dateKey = null) {
  if (!Array.isArray(entries)) return;
  try {
    const serialized = JSON.stringify(entries);
    localStorage.setItem(STORAGE_KEYS.LATEST_NUTRITION, serialized);
    if (userKey) {
      localStorage.setItem(`washek_nutrition_${userKey}`, serialized);
      if (dateKey) {
        localStorage.setItem(`washek_nutrition_${userKey}_${dateKey}`, serialized);
      }
    }
  } catch (err) {
    console.debug('[cacheStore] Nutrition write note:', err);
  }
}

const DELETED_SAVED_MEALS_KEY = 'washek_deleted_saved_meal_ids';

const DEFAULT_STARTER_MEALS = [
  {
    id: 'starter_meal_oatmeal_whey',
    name: 'Oatmeal with Whey & Banana',
    food_name: 'Oatmeal with Whey & Banana',
    meal_type: 'breakfast',
    serving_size: '1 bowl (80g oats, 1 scoop whey, 1 banana)',
    calories: 510,
    protein_g: 42,
    carbs_g: 65,
    fat_g: 9,
    created_at: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'starter_meal_chicken_rice',
    name: 'Chicken Breast with Jasmine Rice & Broccoli',
    food_name: 'Chicken Breast with Jasmine Rice & Broccoli',
    meal_type: 'lunch',
    serving_size: '200g chicken, 1.5 cups rice, 1 cup broccoli',
    calories: 560,
    protein_g: 50,
    carbs_g: 60,
    fat_g: 8,
    created_at: '2026-01-01T12:00:00.000Z',
  },
  {
    id: 'starter_meal_whey_shake',
    name: 'Post-Workout Whey Protein Shake',
    food_name: 'Post-Workout Whey Protein Shake',
    meal_type: 'snack',
    serving_size: '1 shaker (40g whey, 300ml almond milk, 1 banana)',
    calories: 280,
    protein_g: 36,
    carbs_g: 24,
    fat_g: 4,
    created_at: '2026-01-01T16:00:00.000Z',
  },
  {
    id: 'starter_meal_steak_potato',
    name: 'Flank Steak with Sweet Potato & Greens',
    food_name: 'Flank Steak with Sweet Potato & Greens',
    meal_type: 'dinner',
    serving_size: '220g flank steak, 250g baked sweet potato',
    calories: 640,
    protein_g: 54,
    carbs_g: 52,
    fat_g: 20,
    created_at: '2026-01-01T19:00:00.000Z',
  },
];

export function getDeletedSavedMealIds() {
  try {
    const raw = localStorage.getItem(DELETED_SAVED_MEALS_KEY);
    const parsed = safeParse(raw, []);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markSavedMealDeleted(id) {
  if (!id) return;
  try {
    const deleted = getDeletedSavedMealIds();
    deleted.add(String(id));
    localStorage.setItem(DELETED_SAVED_MEALS_KEY, JSON.stringify(Array.from(deleted)));
  } catch (err) {
    console.debug('[cacheStore] markSavedMealDeleted note:', err);
  }
}

/**
 * Retrieve saved meals synchronously from local cache in 0ms.
 * Scans all candidate keys and local storage, guarantees non-deleted meals are always kept.
 */
export function getCachedSavedMeals(userKey = null) {
  try {
    const deletedIds = getDeletedSavedMealIds();
    const seenIds = new Set();
    const allMeals = [];

    const candidateKeys = new Set([
      STORAGE_KEYS.LATEST_SAVED_MEALS,
      'washek_permanent_saved_meals',
      'washek_saved_meals_athlete',
      'washek_saved_meals_guest',
      'washek_saved_meals_washekfitness@gmail.com',
      'washek_entity_saved_meals_all',
      'washek_entity_saved_meals_athlete',
      'washek_entity_saved_meals_guest',
    ]);

    if (userKey) {
      candidateKeys.add(`washek_saved_meals_${userKey}`);
      candidateKeys.add(`washek_entity_saved_meals_${userKey}`);
    }

    // Scan all active localStorage keys matching saved meal prefixes
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('washek_saved_meals_') || k.startsWith('washek_entity_saved_meals_'))) {
            candidateKeys.add(k);
          }
        }
      }
    } catch (_kErr) {
      // Ignore key enumeration error
    }

    for (const key of candidateKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const list = safeParse(raw, []);
        if (!Array.isArray(list)) continue;

        for (const item of list) {
          if (!item || !item.id) continue;
          const idStr = String(item.id);
          if (deletedIds.has(idStr)) continue;
          if (!seenIds.has(idStr)) {
            seenIds.add(idStr);
            allMeals.push(item);
          }
        }
      } catch (_readErr) {
        // Continue to next key
      }
    }

    // If completely empty and the starter meals have not been deliberately deleted, seed starter meals
    if (allMeals.length === 0) {
      const activeStarters = DEFAULT_STARTER_MEALS.filter((m) => !deletedIds.has(String(m.id)));
      if (activeStarters.length > 0) {
        setCachedSavedMeals(activeStarters, userKey, false);
        return activeStarters;
      }
    }

    // Sort by created_at descending
    allMeals.sort((a, b) => {
      const tA = a.created_at || a.date || '';
      const tB = b.created_at || b.date || '';
      return String(tB).localeCompare(String(tA));
    });

    return allMeals;
  } catch {
    return [];
  }
}

/**
 * Save saved meals to local cache with anti-wipe protection.
 * Ensures existing saved meals are permanently preserved unless explicitly replaced on deliberate delete.
 */
export function setCachedSavedMeals(meals, userKey = null, isExplicitReplace = false) {
  if (!Array.isArray(meals)) return;
  try {
    const deletedIds = getDeletedSavedMealIds();
    let finalMeals = meals.filter((m) => m && m.id && !deletedIds.has(String(m.id)));

    // Protection: If incoming list is empty and NOT an explicit replacement, preserve existing non-deleted meals
    if (finalMeals.length === 0 && !isExplicitReplace) {
      const existing = getCachedSavedMeals(userKey);
      if (existing.length > 0) {
        finalMeals = existing;
      }
    } else if (!isExplicitReplace) {
      // Merge with existing non-deleted meals so nothing is dropped
      const existing = getCachedSavedMeals(userKey);
      const map = new Map();
      existing.forEach((m) => {
        if (m?.id && !deletedIds.has(String(m.id))) {
          map.set(String(m.id), m);
        }
      });
      finalMeals.forEach((m) => {
        if (m?.id && !deletedIds.has(String(m.id))) {
          const idStr = String(m.id);
          map.set(idStr, { ...(map.get(idStr) || {}), ...m });
        }
      });
      finalMeals = Array.from(map.values()).sort((a, b) => {
        const tA = a.created_at || a.date || '';
        const tB = b.created_at || b.date || '';
        return String(tB).localeCompare(String(tA));
      });
    }

    const serialized = JSON.stringify(finalMeals);

    // Write to all primary and fallback keys for resilient 0ms retrieval
    localStorage.setItem(STORAGE_KEYS.LATEST_SAVED_MEALS, serialized);
    localStorage.setItem('washek_permanent_saved_meals', serialized);
    localStorage.setItem('washek_saved_meals_athlete', serialized);
    localStorage.setItem('washek_entity_saved_meals_all', serialized);
    localStorage.setItem('washek_entity_saved_meals_athlete', serialized);

    if (userKey) {
      localStorage.setItem(`washek_saved_meals_${userKey}`, serialized);
      localStorage.setItem(`washek_entity_saved_meals_${userKey}`, serialized);
    }
  } catch (err) {
    console.debug('[cacheStore] Saved meals write note:', err);
  }
}

/**
 * Explicitly removes a saved meal from local cache upon deliberate user action.
 */
export function removeCachedSavedMeal(id, userKey = null) {
  if (!id) return;
  try {
    markSavedMealDeleted(id);
    const existing = getCachedSavedMeals(userKey);
    const filtered = existing.filter((m) => String(m.id) !== String(id));
    setCachedSavedMeals(filtered, userKey, true);
  } catch (err) {
    console.debug('[cacheStore] removeCachedSavedMeal note:', err);
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
