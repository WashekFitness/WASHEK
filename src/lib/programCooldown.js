import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { supabaseApi, ensureValidUuid } from '@/lib/supabaseApi';
import { getCachedActiveProgram } from '@/lib/cacheStore';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCAL_STORAGE_KEY = 'washek_last_program_generated_at';

/**
 * Checks if program generation is currently locked under the 7-day rule.
 * Inspects all possible sources: explicit parameter, active program cache,
 * user profile fields, and local storage.
 *
 * @param {string|Date|null} latestProgramCreatedAt - timestamp string or Date of newest program
 * @param {object|null} user - optional user object to check profile timestamps
 * @returns {{ isLocked: boolean, remainingMs: number, remainingDays: number, remainingHours: number, unlockDate: Date | null, lastGeneratedAt: string | null }}
 */
export function checkProgramGenerationLock(latestProgramCreatedAt = null, user = null) {
  const candidateTimestamps = [];

  // 1. Explicit parameter
  if (latestProgramCreatedAt) {
    candidateTimestamps.push(latestProgramCreatedAt);
  }

  // 2. User profile object timestamp
  if (user?.last_program_generated_at) {
    candidateTimestamps.push(user.last_program_generated_at);
  }

  // 3. Cached active program timestamp
  try {
    const userKey = user?.id || user?.uid || user?.email;
    const activeProg = getCachedActiveProgram(userKey);
    if (activeProg?.created_at) {
      candidateTimestamps.push(activeProg.created_at);
    }
  } catch (_cacheErr) {
    // Ignore cache read error
  }

  // 4. Stored local profile
  try {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('washek_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.last_program_generated_at) {
          candidateTimestamps.push(parsed.last_program_generated_at);
        }
      }
    }
  } catch (_lsErr) {
    // Ignore local storage error
  }

  // 5. Dedicated cooldown key in localStorage
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        candidateTimestamps.push(stored);
      }
    }
  } catch (err) {
    console.debug('[ProgramCooldown] Read note:', err);
  }

  // Find the most recent timestamp among all valid candidates
  let newestValidTime = 0;
  let newestTimestampStr = null;

  for (const raw of candidateTimestamps) {
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!isNaN(t) && t > newestValidTime) {
      newestValidTime = t;
      newestTimestampStr = raw;
    }
  }

  if (newestValidTime === 0) {
    return {
      isLocked: false,
      remainingMs: 0,
      remainingDays: 0,
      remainingHours: 0,
      unlockDate: null,
      lastGeneratedAt: null,
    };
  }

  const now = Date.now();
  const elapsed = now - newestValidTime;

  // If 7 days or more have passed (or extreme clock skew > 1 day in future), unlock
  if (elapsed >= SEVEN_DAYS_MS || elapsed < -86400000) {
    return {
      isLocked: false,
      remainingMs: 0,
      remainingDays: 0,
      remainingHours: 0,
      unlockDate: null,
      lastGeneratedAt: newestTimestampStr,
    };
  }

  const remainingMs = Math.max(0, SEVEN_DAYS_MS - elapsed);
  const remainingHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  const unlockDate = new Date(newestValidTime + SEVEN_DAYS_MS);

  return {
    isLocked: true,
    remainingMs,
    remainingDays,
    remainingHours,
    unlockDate,
    lastGeneratedAt: newestTimestampStr,
  };
}

/**
 * Records that a new program was just generated to stamp the 7-day cooldown immediately.
 * Persists to localStorage, local profile, and syncs to database profile if userId provided.
 *
 * @param {string|null} userId - user ID to persist timestamp in profiles table
 */
export function recordProgramGenerated(userId = null) {
  const nowIso = new Date().toISOString();

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, nowIso);

      // Sync into washek_user
      const rawUser = localStorage.getItem('washek_user');
      if (rawUser) {
        try {
          const parsed = JSON.parse(rawUser);
          parsed.last_program_generated_at = nowIso;
          localStorage.setItem('washek_user', JSON.stringify(parsed));
        } catch (_uErr) {
          // ignore
        }
      }
    }
  } catch (err) {
    console.debug('[ProgramCooldown] Write note:', err);
  }

  // Update profile in database if possible
  if (userId) {
    const validId = ensureValidUuid(userId);
    supabase
      .from('profiles')
      .update({
        last_program_generated_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', validId)
      .then(() => {})
      .catch((err) => {
        console.debug('[ProgramCooldown] DB profile update note:', err);
      });
  }
}

/**
 * React hook to observe 7-day cooldown state for the current user.
 * Queries DB programs, profile, and local stores for airtight enforcement.
 */
export function useProgramCooldown(user = null) {
  const userKey = user?.id || user?.uid || user?.email;
  const validUserId = userKey ? ensureValidUuid(userKey) : null;

  const { data: dbData, isLoading } = useQuery({
    queryKey: ['workout-program-cooldown', userKey],
    queryFn: async () => {
      if (!userKey) return null;

      try {
        // Query programs belonging to this user
        let query = supabase
          .from('workout_programs')
          .select('id, created_at, status, user_id')
          .order('created_at', { ascending: false })
          .limit(1);

        if (validUserId) {
          query = query.or(`user_id.eq.${validUserId},created_by.eq.${userKey}`);
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
          console.debug('[ProgramCooldown] Supabase query note:', error.message);
        }

        // Also query profile for last_program_generated_at
        let profileTimestamp = null;
        if (validUserId) {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('last_program_generated_at')
              .eq('id', validUserId)
              .maybeSingle();
            profileTimestamp = prof?.last_program_generated_at;
          } catch (_pErr) {
            // ignore
          }
        }

        return {
          programCreatedAt: data?.created_at || null,
          profileGeneratedAt: profileTimestamp || null,
        };
      } catch (err) {
        console.debug('[ProgramCooldown] Fallback note:', err);
        return null;
      }
    },
    enabled: Boolean(userKey),
    staleTime: 30 * 1000,
  });

  const newestDbTimestamp =
    dbData?.profileGeneratedAt || dbData?.programCreatedAt || null;

  const lockInfo = checkProgramGenerationLock(newestDbTimestamp, user);

  return {
    ...lockInfo,
    latestProgram: dbData?.programCreatedAt ? { created_at: dbData.programCreatedAt } : null,
    isLoading,
  };
}
