import { supabase } from '@/lib/supabase';
import {
  getUserTimeZone,
  getLocalDateKey as getLocalDateKeyUtil,
  getPreviousLocalDateKey as getPreviousLocalDateKeyUtil,
  getCurrentMonthKey as getCurrentMonthKeyUtil,
} from './dateUtils';

export const PLAN_LIMITS = {
  free: 100,
  progress: 300,
  performance: 800,
  elite: 2000,
};

export function getLocalDateKey(date = new Date(), timeZone = null) {
  return getLocalDateKeyUtil(date, timeZone);
}

export function getPreviousLocalDateKey(date = new Date(), timeZone = null) {
  return getPreviousLocalDateKeyUtil(date, timeZone);
}

export function getCurrentMonthKey(date = new Date(), timeZone = null) {
  return getCurrentMonthKeyUtil(date, timeZone);
}

export function getPlanLimit(plan = 'free') {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function computeStats(user, plan = 'free', timeZone = null) {
  const limit = getPlanLimit(plan);
  const effectiveTz = timeZone || getUserTimeZone(user);
  const monthKey = getCurrentMonthKey(new Date(), effectiveTz);

  const count =
    user?.kael_msg_month === monthKey
      ? Number(user?.kael_msg_count || 0)
      : 0;

  return {
    used: count,
    limit,
    remaining: Math.max(0, limit - count),
    monthKey,
    plan: plan || 'free',
    timezone: effectiveTz,
  };
}

export async function getServerMessageStats(timeZone = null) {
  try {
    let effectiveUserId = null;
    let cachedUser = null;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        effectiveUserId = sessionData.session.user.id;
      }
    } catch (_sessionErr) {
      // Session fetch not available
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('washek_user');
        if (raw) {
          cachedUser = JSON.parse(raw);
          if (!effectiveUserId && cachedUser?.id) {
            effectiveUserId = cachedUser.id;
          }
        }
      } catch (_storageErr) {
        // Storage read fallback
      }
    }

    if (!effectiveUserId && !cachedUser) return null;

    const effectiveTz = timeZone || getUserTimeZone(cachedUser);
    let data = null;
    let error = null;

    try {
      const res = await supabase.rpc('get_kael_usage');
      data = res.data;
      error = res.error;
      if (error && error.code === 'PGRST202') {
        const fallbackRes = await supabase.rpc('get_kael_usage', {
          p_timezone: effectiveTz,
        });
        if (!fallbackRes.error) {
          data = fallbackRes.data;
          error = null;
        }
      }
    } catch (rpcErr) {
      error = rpcErr;
    }

    if (!error && data && typeof data.used === 'number') {
      const stats = {
        ...data,
        remaining:
          typeof data.remaining === 'number'
            ? data.remaining
            : Math.max(0, (data.limit || 100) - data.used),
        timezone: effectiveTz,
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kael-quota-updated', { detail: stats })
        );
      }
      return stats;
    }

    // Direct profile table fallback if RPC is ever unreachable or unauthenticated
    if (effectiveUserId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
          .eq('id', effectiveUserId)
          .maybeSingle();

        if (profile) {
          // If cachedUser has a higher count for current month, use the higher count
          const monthKey = getCurrentMonthKey(new Date(), effectiveTz || profile.timezone);
          let effectiveCount = Number(profile.kael_msg_month === monthKey ? profile.kael_msg_count || 0 : 0);
          if (cachedUser?.kael_msg_month === monthKey && Number(cachedUser?.kael_msg_count || 0) > effectiveCount) {
            effectiveCount = Number(cachedUser.kael_msg_count);
          }

          const stats = {
            used: effectiveCount,
            limit: getPlanLimit(profile.subscription_plan || cachedUser?.subscription_plan || 'free'),
            remaining: Math.max(0, getPlanLimit(profile.subscription_plan || cachedUser?.subscription_plan || 'free') - effectiveCount),
            monthKey,
            plan: profile.subscription_plan || cachedUser?.subscription_plan || 'free',
            timezone: effectiveTz || profile.timezone,
          };

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('kael-quota-updated', { detail: stats })
            );
          }
          return stats;
        }
      } catch (profileFetchErr) {
        console.warn('[messageLimit] profiles table query error:', profileFetchErr);
      }
    }

    if (cachedUser) {
      const stats = computeStats(
        cachedUser,
        cachedUser.subscription_plan || 'free',
        effectiveTz || cachedUser.timezone
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kael-quota-updated', { detail: stats })
        );
      }
      return stats;
    }

    return null;
  } catch (err) {
    console.warn('[messageLimit] Error fetching server message stats:', err);
    return null;
  }
}

export async function claimMessage(timeZone = null) {
  try {
    const effectiveTz = timeZone || getUserTimeZone();
    let data = null;
    let error = null;

    try {
      const res = await supabase.rpc('claim_kael_message');
      data = res.data;
      error = res.error;
      if (error && error.code === 'PGRST202') {
        const fallbackRes = await supabase.rpc('claim_kael_message', {
          p_timezone: effectiveTz,
        });
        if (!fallbackRes.error) {
          data = fallbackRes.data;
          error = null;
        }
      }
    } catch (rpcErr) {
      error = rpcErr;
    }

    if (!error && data && typeof data.used === 'number') {
      const stats = {
        ...data,
        remaining:
          typeof data.remaining === 'number'
            ? data.remaining
            : Math.max(0, (data.limit || 100) - (data.used || 0)),
        timezone: effectiveTz,
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('kael-quota-updated', { detail: stats })
        );
      }
      return stats;
    }

    // Resilient fallback when RPC is unavailable or permission denied
    let userId = null;
    let localUser = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      userId = sessionData?.session?.user?.id || null;
    } catch (_sessionErr) {
      // Session not available
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('washek_user');
        if (raw) {
          localUser = JSON.parse(raw);
          if (!userId && localUser?.id) {
            userId = localUser.id;
          }
        }
      } catch (_storageErr) {
        // Storage read fallback
      }
    }

    const currentMonthKey = getCurrentMonthKey(new Date(), effectiveTz);
    const plan = localUser?.subscription_plan || 'free';
    const limit = getPlanLimit(plan);

    const prevCount =
      localUser?.kael_msg_month === currentMonthKey
        ? Number(localUser?.kael_msg_count || 0)
        : 0;
    const newCount = prevCount + 1;

    // Update profiles table in database if user is known
    if (userId) {
      try {
        await supabase
          .from('profiles')
          .update({
            kael_msg_count: newCount,
            kael_msg_month: currentMonthKey,
            timezone: effectiveTz,
          })
          .eq('id', userId);
      } catch (dbErr) {
        console.warn('[messageLimit] Fallback profile update note:', dbErr);
      }
    }

    // Update local storage
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('washek_user');
        const userObj = raw ? JSON.parse(raw) : (localUser || {});
        userObj.kael_msg_count = newCount;
        userObj.kael_msg_month = currentMonthKey;
        localStorage.setItem('washek_user', JSON.stringify(userObj));
      } catch (_saveErr) {
        // LocalStorage write ignored
      }
    }

    const stats = {
      allowed: true,
      used: newCount,
      limit,
      remaining: Math.max(0, limit - newCount),
      monthKey: currentMonthKey,
      plan,
      timezone: effectiveTz,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kael-quota-updated', { detail: stats })
      );
    }
    return stats;
  } catch (err) {
    console.error('[messageLimit] claimMessage fallback error:', err);
    throw err;
  }
}

export async function incrementMessageCount(plan = 'free') {
  /*
   * Kept for backwards compatibility with any older page imports.
   *
   * IMPORTANT:
   * The authoritative Kael usage counter is now server-side.
   * New Kael code should use claimMessage() instead.
   *
   * This function intentionally does NOT update the user's
   * profile usage fields anymore.
   */

  const serverStats = await getServerMessageStats();

  if (!serverStats) {
    throw new Error(
      'Unable to load the server-side Kael usage limit.'
    );
  }

  return serverStats;
}

export function canSendMessage(stats) {
  return !!stats && stats.remaining > 0;
}
