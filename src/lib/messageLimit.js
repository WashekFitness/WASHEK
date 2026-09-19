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
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return null;

    const effectiveTz = timeZone || getUserTimeZone(user);
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

    // Direct profile table fallback if RPC is ever unreachable
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      const stats = computeStats(
        profile,
        profile.subscription_plan || 'free',
        effectiveTz || profile.timezone
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

    if (error) {
      throw error;
    }

    if (data) {
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

    return data;
  } catch (err) {
    console.error('[messageLimit] claimMessage error:', err);
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
