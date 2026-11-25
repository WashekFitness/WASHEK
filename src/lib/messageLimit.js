import { supabase } from '@/lib/supabase';
import { queryClientInstance } from '@/lib/query-client';
import {
  getUserTimeZone,
  getLocalDateKey as getLocalDateKeyUtil,
  getPreviousLocalDateKey as getPreviousLocalDateKeyUtil,
  getCurrentMonthKey as getCurrentMonthKeyUtil,
} from './dateUtils';
import {
  isActiveSubscriptionStatus,
  resolveEffectivePlan,
  getRedirectUpgradeReceipt,
} from '@/lib/subscription';

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

function isValidMonthKey(val) {
  return /^\d{4}-\d{2}$/.test(String(val || '').trim());
}

function isSameQuotaAccount(a, b) {
  const idA = a?.id || a?.userId || null;
  const idB = b?.id || b?.userId || null;
  const emailA = a?.email || a?.userEmail ? String(a.email || a.userEmail).toLowerCase().trim() : '';
  const emailB = b?.email || b?.userEmail ? String(b.email || b.userEmail).toLowerCase().trim() : '';
  if (emailA && emailB) return emailA === emailB;
  if (idA && idB) return String(idA) === String(idB);
  return true;
}

/**
 * Synchronize Kael message quota immediately across:
 * - localStorage ('washek_user' + 'washek_kael_quota')
 * - React Query cache (['kael-usage'])
 * - Window custom event ('kael-quota-updated')
 *
 * Strictly enforces same-month monotonicity so Kael's count NEVER drops mid-month
 * and only resets when monthKey rolls over on the 1st of the month in the user's timezone.
 */
export function syncQuotaAcrossApp(stats, { dispatch = true } = {}) {
  if (!stats || typeof stats.used !== 'number') return stats;

  const effectiveTz = stats.timezone || getUserTimeZone();
  const targetMonthKey = isValidMonthKey(stats.monthKey)
    ? String(stats.monthKey).trim()
    : getCurrentMonthKey(new Date(), effectiveTz);

  let userId = stats.userId || null;
  let userEmail = stats.userEmail || stats.email ? String(stats.userEmail || stats.email).toLowerCase().trim() : null;
  let parsedUser = null;
  let existingQuota = null;

  if (typeof localStorage !== 'undefined') {
    try {
      const rawUser = localStorage.getItem('washek_user');
      if (rawUser) {
        parsedUser = JSON.parse(rawUser);
        if (parsedUser && typeof parsedUser === 'object') {
          if (!userId && parsedUser.id) userId = parsedUser.id;
          if (!userEmail && parsedUser.email) userEmail = String(parsedUser.email).toLowerCase().trim();
        }
      }
      const rawQuota = localStorage.getItem(KAEL_QUOTA_CACHE_KEY);
      if (rawQuota) {
        existingQuota = JSON.parse(rawQuota);
      }
    } catch {
      // ignore storage read failures
    }
  }

  const incomingAccount = { id: userId, email: userEmail };
  let monotonicUsed = Math.max(0, Number(stats.used || 0));

  if (
    parsedUser &&
    isSameQuotaAccount(parsedUser, incomingAccount) &&
    parsedUser.kael_msg_month === targetMonthKey &&
    typeof parsedUser.kael_msg_count === 'number'
  ) {
    monotonicUsed = Math.max(monotonicUsed, Number(parsedUser.kael_msg_count));
  }

  if (
    existingQuota &&
    isSameQuotaAccount(existingQuota, incomingAccount) &&
    existingQuota.monthKey === targetMonthKey &&
    typeof existingQuota.used === 'number'
  ) {
    monotonicUsed = Math.max(monotonicUsed, Number(existingQuota.used));
  }

  try {
    const queryEntries = queryClientInstance.getQueriesData({ queryKey: ['kael-usage'] });
    for (const [key, prev] of queryEntries) {
      const keyUserId = Array.isArray(key) ? key[1] : null;
      const prevAccount = { id: prev?.userId || keyUserId, email: prev?.userEmail || null };
      if (
        prev &&
        isSameQuotaAccount(prevAccount, incomingAccount) &&
        prev.monthKey === targetMonthKey &&
        typeof prev.used === 'number'
      ) {
        monotonicUsed = Math.max(monotonicUsed, Number(prev.used));
      }
    }
  } catch {
    // ignore React Query read error
  }

  const resolvedLimit = Number(stats.limit || getPlanLimit(stats.plan || 'free'));
  const normalizedStats = {
    ...stats,
    used: monotonicUsed,
    limit: resolvedLimit,
    remaining: Math.max(0, resolvedLimit - monotonicUsed),
    monthKey: targetMonthKey,
    timezone: effectiveTz,
    userId,
    ...(userEmail ? { userEmail } : {}),
  };
  delete normalizedStats.forceAuthoritative;

  if (typeof localStorage !== 'undefined') {
    try {
      if (parsedUser && typeof parsedUser === 'object' && isSameQuotaAccount(parsedUser, incomingAccount)) {
        parsedUser.kael_msg_count = monotonicUsed;
        parsedUser.kael_msg_month = targetMonthKey;
        if (effectiveTz) parsedUser.timezone = effectiveTz;
        localStorage.setItem('washek_user', JSON.stringify(parsedUser));
      }
      localStorage.setItem(
        KAEL_QUOTA_CACHE_KEY,
        JSON.stringify({
          ...normalizedStats,
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
        prev.monthKey === targetMonthKey &&
        typeof prev.used === 'number' &&
        prev.used > normalizedStats.used
      ) {
        const used = prev.used;
        return {
          ...normalizedStats,
          used,
          remaining: Math.max(0, resolvedLimit - used),
        };
      }
      return normalizedStats;
    });
  } catch {
    // ignore React Query cache update error
  }

  if (dispatch && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kael-quota-updated', { detail: normalizedStats }));
  }

  return normalizedStats;
}

export function getCachedMessageStats(user, plan = null, timeZone = null) {
  const effectiveTz = timeZone || getUserTimeZone(user);
  const monthKey = getCurrentMonthKey(new Date(), effectiveTz);
  const effectivePlan = plan
    ? resolveEffectivePlan(plan, user?.subscription_status)
    : resolveEffectivePlan(user);
  const limit = getPlanLimit(effectivePlan);

  let used =
    user?.kael_msg_month === monthKey
      ? Math.max(0, Number(user?.kael_msg_count || 0))
      : 0;

  if (typeof localStorage !== 'undefined') {
    try {
      const rawQuota = localStorage.getItem(KAEL_QUOTA_CACHE_KEY);
      if (rawQuota) {
        const cached = JSON.parse(rawQuota);
        if (isSameQuotaAccount(user, cached) && cached?.monthKey === monthKey && typeof cached.used === 'number') {
          used = Math.max(used, cached.used);
        }
      }
      const rawUser = localStorage.getItem('washek_user');
      if (rawUser) {
        const parsedUser = JSON.parse(rawUser);
        if (isSameQuotaAccount(user, parsedUser) && parsedUser?.kael_msg_month === monthKey && typeof parsedUser.kael_msg_count === 'number') {
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
    userId: user?.id || null,
    userEmail: user?.email ? String(user.email).toLowerCase().trim() : null,
  };
}

export function computeStats(user, plan = 'free', timeZone = null) {
  const limit = getPlanLimit(plan);
  const effectiveTz = timeZone || getUserTimeZone(user);
  const monthKey = getCurrentMonthKey(new Date(), effectiveTz);

  const count =
    user?.kael_msg_month === monthKey
      ? Math.max(0, Number(user?.kael_msg_count || 0))
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

async function fetchServerApiKaelUsage({ accessToken = null, timeZone = null } = {}) {
  if (typeof fetch === 'undefined') return null;
  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    if (timeZone) {
      headers['x-timezone'] = timeZone;
    }
    try {
      const srvTok = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_srv_session') : '';
      if (srvTok) headers['x-washek-server-session'] = srvTok;
    } catch {
      // ignore
    }
    const tzQuery = timeZone ? `?timezone=${encodeURIComponent(timeZone)}` : '';
    const res = await fetch(`/api/kael/usage${tzQuery}`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (body?.success && body?.usage && typeof body.usage.used === 'number') {
      return body.usage;
    }
  } catch {
    // ignore network failure on usage fallback
  }
  return null;
}

let inFlightStatsPromise = null;

export async function getServerMessageStats(timeZone = null) {
  if (inFlightStatsPromise) {
    return inFlightStatsPromise;
  }

  inFlightStatsPromise = (async () => {
    try {
      let effectiveUserId = null;
      let effectiveEmail = null;
      let accessToken = null;
      let hasSupabaseSession = false;
      let cachedUser = null;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          effectiveUserId = sessionData.session.user.id;
          effectiveEmail = sessionData.session.user.email
            ? String(sessionData.session.user.email).toLowerCase().trim()
            : null;
          accessToken = sessionData.session.access_token || null;
          hasSupabaseSession = true;
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
            if (!effectiveEmail && cachedUser?.email) {
              effectiveEmail = String(cachedUser.email).toLowerCase().trim();
            }
          }
          if (!accessToken) {
            const storedTok = localStorage.getItem('washek_auth_token') || '';
            if (storedTok && !storedTok.startsWith('vault_tok_') && !storedTok.startsWith('washek_sess_')) {
              accessToken = storedTok;
            }
          }
        } catch (_storageErr) {
          // Storage read fallback
        }
      }

      if (!effectiveUserId && !effectiveEmail && !cachedUser) return null;

      const effectiveTz = timeZone || getUserTimeZone(cachedUser);
      const expectedMonthKey = getCurrentMonthKey(new Date(), effectiveTz);
      const cachedPlan = cachedUser ? resolveEffectivePlan(cachedUser) : 'free';
      const localCachedStats = cachedUser
        ? getCachedMessageStats(cachedUser, cachedPlan, effectiveTz || cachedUser.timezone)
        : null;
      const localSameMonthUsed =
        localCachedStats?.monthKey === expectedMonthKey ? Number(localCachedStats.used || 0) : 0;

      // Also check server /api/kael/usage (covers Vault sessions, JWKS sessions, and disk store fallback)
      const apiUsagePromise = fetchServerApiKaelUsage({ accessToken, timeZone: effectiveTz });

      // Non-Supabase local/vault sessions: combine Node /api/kael/usage with local cache
      if (!hasSupabaseSession) {
        const apiUsage = await apiUsagePromise;
        const apiSameMonthUsed =
          apiUsage && apiUsage.monthKey === expectedMonthKey ? Number(apiUsage.used || 0) : 0;
        const combinedUsed = Math.max(apiSameMonthUsed, localSameMonthUsed);
        const resolvedPlan =
          apiUsage?.plan && apiUsage.plan !== 'free'
            ? apiUsage.plan
            : cachedPlan;
        const limit = getPlanLimit(resolvedPlan);
        return syncQuotaAcrossApp({
          used: combinedUsed,
          limit,
          remaining: Math.max(0, limit - combinedUsed),
          monthKey: expectedMonthKey,
          plan: resolvedPlan,
          timezone: effectiveTz,
          userId: effectiveUserId,
          userEmail: effectiveEmail,
        });
      }

      let data = null;
      let error = null;

      try {
        const res = await supabase.rpc('get_kael_usage', {
          p_timezone: effectiveTz,
        });
        data = res.data;
        error = res.error;
        if (error && error.code === 'PGRST202') {
          const fallbackRes = await supabase.rpc('get_kael_usage');
          if (!fallbackRes.error) {
            data = fallbackRes.data;
            error = null;
          }
        }
      } catch (rpcErr) {
        error = rpcErr;
      }

      const apiUsage = await apiUsagePromise;
      const apiSameMonthUsed =
        apiUsage && apiUsage.monthKey === expectedMonthKey ? Number(apiUsage.used || 0) : 0;

      if (!error && data && typeof data.used === 'number') {
        const rpcMonthKey = isValidMonthKey(data.monthKey) ? data.monthKey : expectedMonthKey;
        const rpcPlan = String(data.plan || 'free').toLowerCase().trim();
        const redirectReceipt = rpcPlan === 'free' ? getRedirectUpgradeReceipt(cachedUser) : null;
        const effectiveRpcPlan = redirectReceipt ? redirectReceipt.plan : rpcPlan;
        const effectiveRpcLimit = redirectReceipt
          ? getPlanLimit(effectiveRpcPlan)
          : (data.limit || getPlanLimit(effectiveRpcPlan));

        const combinedUsed = rpcMonthKey === expectedMonthKey
          ? Math.max(Number(data.used || 0), apiSameMonthUsed, localSameMonthUsed)
          : Number(data.used || 0);

        const stats = {
          ...data,
          used: combinedUsed,
          plan: effectiveRpcPlan,
          limit: effectiveRpcLimit,
          remaining: Math.max(0, effectiveRpcLimit - combinedUsed),
          monthKey: rpcMonthKey,
          timezone: effectiveTz,
          userId: effectiveUserId,
          userEmail: effectiveEmail,
        };
        return syncQuotaAcrossApp(stats);
      }

      // Direct profile table lookup by UUID only (profiles has no email column)
      if (effectiveUserId && isValidUUID(effectiveUserId)) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, kael_msg_count, kael_msg_month, timezone')
            .eq('id', effectiveUserId)
            .maybeSingle();

          if (profile) {
            const monthKey = getCurrentMonthKey(new Date(), effectiveTz || profile.timezone);
            const dbStatus = String(profile.subscription_status || '').toLowerCase().trim();
            const isSubActive = isActiveSubscriptionStatus(dbStatus);
            const redirectReceipt = !isSubActive ? getRedirectUpgradeReceipt(profile) : null;
            const effectivePlan = isSubActive
              ? resolveEffectivePlan(profile)
              : redirectReceipt
                ? redirectReceipt.plan
                : 'free';
            const effectiveLimit = getPlanLimit(effectivePlan);

            const dbCount = profile.kael_msg_month === monthKey ? Number(profile.kael_msg_count || 0) : 0;
            const effectiveCount = Math.max(dbCount, apiSameMonthUsed, localSameMonthUsed);

            const stats = {
              used: effectiveCount,
              limit: effectiveLimit,
              remaining: Math.max(0, effectiveLimit - effectiveCount),
              monthKey,
              plan: effectivePlan,
              timezone: effectiveTz || profile.timezone,
              userId: effectiveUserId,
              userEmail: effectiveEmail,
            };

            return syncQuotaAcrossApp(stats);
          }
        } catch (profileFetchErr) {
          console.warn('[messageLimit] profiles table query error:', profileFetchErr);
        }
      }

      if (cachedUser || apiUsage) {
        const finalPlan = apiUsage?.plan && apiUsage.plan !== 'free' ? apiUsage.plan : cachedPlan;
        const limit = getPlanLimit(finalPlan);
        const combinedUsed = Math.max(apiSameMonthUsed, localSameMonthUsed);
        return syncQuotaAcrossApp({
          used: combinedUsed,
          limit,
          remaining: Math.max(0, limit - combinedUsed),
          monthKey: expectedMonthKey,
          plan: finalPlan,
          timezone: effectiveTz,
          userId: effectiveUserId,
          userEmail: effectiveEmail,
        });
      }

      return null;
    } catch (err) {
      console.warn('[messageLimit] Error fetching server message stats:', err);
      return null;
    } finally {
      inFlightStatsPromise = null;
    }
  })();

  return inFlightStatsPromise;
}

export async function claimMessage(timeZone = null) {
  try {
    const effectiveTz = timeZone || getUserTimeZone();
    let data = null;
    let error = null;

    try {
      const res = await supabase.rpc('claim_kael_message', {
        p_timezone: effectiveTz,
      });
      data = res.data;
      error = res.error;
      if (error && error.code === 'PGRST202') {
        const fallbackRes = await supabase.rpc('claim_kael_message');
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
    const plan = resolveEffectivePlan(localUser);
    const limit = getPlanLimit(plan);

    const prevCount = getCachedMessageStats(localUser, plan, effectiveTz).used;
    const newCount = prevCount + 1;

    // Update profiles table in database if user is an authenticated UUID
    if (userId && isValidUUID(userId)) {
      try {
        const updatePayload = {
          kael_msg_count: newCount,
          kael_msg_month: currentMonthKey,
          timezone: effectiveTz,
        };
        await supabase
          .from('profiles')
          .update(updatePayload)
          .eq('id', userId);
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
      userId,
      userEmail: localUser?.email ? String(localUser.email).toLowerCase().trim() : null,
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
