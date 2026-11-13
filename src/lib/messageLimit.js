import { supabase } from '@/lib/supabase';
import { queryClientInstance } from '@/lib/query-client';
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

const KAEL_QUOTA_CACHE_KEY = 'washek_kael_quota';

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
  const normalized = String(plan || 'free').toLowerCase().trim();
  return PLAN_LIMITS[normalized] ?? PLAN_LIMITS.free;
}

function isValidUUID(val) {
  if (typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());
}

/**
 * Synchronize Kael message quota immediately across:
 * - localStorage ('washek_user' + 'washek_kael_quota')
 * - React Query cache (['kael-usage'])
 * - Window custom event ('kael-quota-updated')
 */
export function syncQuotaAcrossApp(stats, { dispatch = true } = {}) {
  if (!stats || typeof stats.used !== 'number') return stats;

  let userId = stats.userId || null;
  if (typeof localStorage !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('washek_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed && typeof parsed === 'object') {
          if (!userId && parsed.id) userId = parsed.id;
          parsed.kael_msg_count = Number(stats.used);
          if (stats.monthKey) parsed.kael_msg_month = stats.monthKey;
          if (stats.timezone) parsed.timezone = stats.timezone;
          localStorage.setItem('washek_user', JSON.stringify(parsed));
        }
      }
      localStorage.setItem(
        KAEL_QUOTA_CACHE_KEY,
        JSON.stringify({
          ...stats,
          userId,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore storage write failures
    }
  }

  try {
    queryClientInstance.setQueriesData({ queryKey: ['kael-usage'] }, (prev) => {
      if (
        prev &&
        prev.monthKey === stats.monthKey &&
        typeof prev.used === 'number' &&
        prev.used > stats.used &&
        !stats.forceAuthoritative
      ) {
        return {
          ...stats,
          used: prev.used,
          remaining: Math.max(0, Number(stats.limit || getPlanLimit(stats.plan)) - prev.used),
        };
      }
      return stats;
    });
  } catch {
    // ignore React Query cache update error
  }

  if (dispatch && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kael-quota-updated', { detail: stats }));
  }

  return stats;
}

export function getCachedMessageStats(user, plan = 'free', timeZone = null) {
  const effectiveTz = timeZone || getUserTimeZone(user);
  const monthKey = getCurrentMonthKey(new Date(), effectiveTz);
  const effectivePlan = String(plan || user?.subscription_plan || 'free').toLowerCase().trim();
  const limit = getPlanLimit(effectivePlan);

  let used =
    user?.kael_msg_month === monthKey
      ? Number(user?.kael_msg_count || 0)
      : 0;

  if (typeof localStorage !== 'undefined') {
    try {
      const rawQuota = localStorage.getItem(KAEL_QUOTA_CACHE_KEY);
      if (rawQuota) {
        const cached = JSON.parse(rawQuota);
        const sameUser = !user?.id || !cached?.userId || cached.userId === user.id;
        if (sameUser && cached?.monthKey === monthKey && typeof cached.used === 'number') {
          used = Math.max(used, cached.used);
        }
      }
      const rawUser = localStorage.getItem('washek_user');
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser);
        const sameUser = !user?.id || !parsedUser?.id || parsedUser.id === user.id;
        if (sameUser && parsedUser?.kael_msg_month === monthKey && typeof parsedUser.kael_msg_count === 'number') {
          used = Math.max(used, Number(parsedUser.kael_msg_count));
        }
      }
    } catch {
      // ignore storage read error
    }
  }

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    monthKey,
    plan: effectivePlan || 'free',
    timezone: effectiveTz,
  };
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
        forceAuthoritative: true,
      };
      return syncQuotaAcrossApp(stats);
    }

    // Direct profile table fallback if RPC is ever unreachable or unauthenticated
    if (effectiveUserId || cachedUser?.email) {
      try {
        let profile = null;
        if (effectiveUserId && isValidUUID(effectiveUserId)) {
          const { data: pData } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
            .eq('id', effectiveUserId)
            .maybeSingle();
          profile = pData;
        }
        if (!profile && cachedUser?.email) {
          const { data: pData } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
            .ilike('email', String(cachedUser.email).trim())
            .maybeSingle();
          profile = pData;
        }

        if (profile) {
          const monthKey = getCurrentMonthKey(new Date(), effectiveTz || profile.timezone);
          const dbStatus = String(profile.subscription_status || '').toLowerCase().trim();
          const isSubActive = ['active', 'trialing', 'past_due'].includes(dbStatus);
          const effectivePlan = isSubActive ? (profile.subscription_plan || 'free') : 'free';
          const effectiveLimit = getPlanLimit(effectivePlan);

          let effectiveCount = Number(profile.kael_msg_month === monthKey ? profile.kael_msg_count || 0 : 0);
          if (cachedUser?.kael_msg_month === monthKey && Number(cachedUser?.kael_msg_count || 0) > effectiveCount) {
            effectiveCount = Number(cachedUser.kael_msg_count);
          }

          const stats = {
            used: effectiveCount,
            limit: effectiveLimit,
            remaining: Math.max(0, effectiveLimit - effectiveCount),
            monthKey,
            plan: effectivePlan,
            timezone: effectiveTz || profile.timezone,
          };

          return syncQuotaAcrossApp(stats);
        }
      } catch (profileFetchErr) {
        console.warn('[messageLimit] profiles table query error:', profileFetchErr);
      }
    }

    if (cachedUser) {
      const cachedStatus = String(cachedUser.subscription_status || '').toLowerCase().trim();
      const cachedPlan =
        cachedStatus === 'canceled' || cachedStatus === 'cancelled' || cachedStatus === 'inactive'
          ? 'free'
          : (cachedUser.subscription_plan || 'free');
      const stats = getCachedMessageStats(cachedUser, cachedPlan, effectiveTz || cachedUser.timezone);
      return syncQuotaAcrossApp(stats);
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
        forceAuthoritative: true,
      };
      return syncQuotaAcrossApp(stats);
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
    const localStatus = String(localUser?.subscription_status || '').toLowerCase().trim();
    const plan =
      localStatus === 'canceled' || localStatus === 'cancelled' || localStatus === 'inactive'
        ? 'free'
        : (localUser?.subscription_plan || 'free');
    const limit = getPlanLimit(plan);

    const prevCount =
      localUser?.kael_msg_month === currentMonthKey
        ? Number(localUser?.kael_msg_count || 0)
        : 0;
    const newCount = prevCount + 1;

    // Update profiles table in database if user is known
    const userEmail = localUser?.email || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('washek_user') || '{}')?.email : null);
    if (userId || userEmail) {
      try {
        const updatePayload = {
          kael_msg_count: newCount,
          kael_msg_month: currentMonthKey,
          timezone: effectiveTz,
        };
        let updated = false;
        if (userId && isValidUUID(userId)) {
          const { error: dbErr } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);
          if (!dbErr) updated = true;
        }
        if (!updated && userEmail) {
          await supabase
            .from('profiles')
            .update(updatePayload)
            .ilike('email', String(userEmail).trim());
        }
      } catch (dbErr) {
        console.warn('[messageLimit] Fallback profile update note:', dbErr);
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

    return syncQuotaAcrossApp(stats);
  } catch (err) {
    console.error('[messageLimit] claimMessage fallback error:', err);
    throw err;
  }
}

export async function incrementMessageCount(_plan = 'free') {
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
