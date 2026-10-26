import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { supabaseApi } from '@/lib/supabaseApi';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCAL_STORAGE_KEY = 'washek_last_program_generated_at';

/**
 * Checks if program generation is currently locked under the 7-day spam prevention rule.
 *
 * @param {string|Date|null} latestProgramCreatedAt - timestamp string or Date of newest program
 * @returns {{ isLocked: boolean, remainingMs: number, remainingDays: number, unlockDate: Date | null }}
 */
export function checkProgramGenerationLock(latestProgramCreatedAt = null) {
  let timestamp = latestProgramCreatedAt;

  if (!timestamp) {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          timestamp = stored;
        }
      }
    } catch (err) {
      console.debug('[ProgramCooldown] Read note:', err);
    }
  }

  if (!timestamp) {
    return {
      isLocked: false,
      remainingMs: 0,
      remainingDays: 0,
      unlockDate: null,
    };
  }

  const generatedTime = new Date(timestamp).getTime();
  if (isNaN(generatedTime)) {
    return {
      isLocked: false,
      remainingMs: 0,
      remainingDays: 0,
      unlockDate: null,
    };
  }

  const now = Date.now();
  const elapsed = now - generatedTime;

  // If 7 days or more have passed (or invalid clock skew), unlock
  if (elapsed >= SEVEN_DAYS_MS || elapsed < 0) {
    return {
      isLocked: false,
      remainingMs: 0,
      remainingDays: 0,
      unlockDate: null,
    };
  }

  const remainingMs = SEVEN_DAYS_MS - elapsed;
  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  const unlockDate = new Date(generatedTime + SEVEN_DAYS_MS);

  return {
    isLocked: true,
    remainingMs,
    remainingDays,
    unlockDate,
  };
}

/**
 * Records that a new program was just generated to stamp the 7-day cooldown immediately.
 */
export function recordProgramGenerated() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, new Date().toISOString());
    }
  } catch (err) {
    console.debug('[ProgramCooldown] Write note:', err);
  }
}

/**
 * React hook to observe 7-day cooldown state for the current user.
 */
export function useProgramCooldown(user = null) {
  const userKey = user?.id || user?.uid || user?.email;

  const { data: latestProgram, isLoading } = useQuery({
    queryKey: ['workout-program-cooldown', userKey],
    queryFn: async () => {
      if (!userKey) return null;

      try {
        const { data, error } = await supabase
          .from('workout_programs')
          .select('id, created_at, status')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.debug('[ProgramCooldown] Supabase query note:', error.message);
        }

        if (data?.created_at) {
          return data;
        }

        // Entity fallback
        const fallback = await supabaseApi.entities.WorkoutProgram.filter(
          {},
          '-created_at',
          1
        );
        return fallback?.[0] || null;
      } catch (err) {
        console.debug('[ProgramCooldown] Fallback note:', err);
        return null;
      }
    },
    enabled: Boolean(userKey),
    staleTime: 60 * 1000,
  });

  const lockInfo = checkProgramGenerationLock(latestProgram?.created_at);

  return {
    ...lockInfo,
    latestProgram,
    isLoading,
  };
}
