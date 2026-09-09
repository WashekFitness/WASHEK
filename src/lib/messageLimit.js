import { supabase } from '@/lib/supabase';

const PLAN_LIMITS = {
  free: 100,
  progress: 300,
  performance: 800,
  elite: 2000,
};

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getPreviousLocalDateKey(date = new Date()) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);

  return getLocalDateKey(previous);
}

export function getCurrentMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

export function getPlanLimit(plan = 'free') {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function computeStats(user, plan = 'free') {
  const limit = getPlanLimit(plan);
  const monthKey = getCurrentMonthKey();

  const count =
    user?.kael_msg_month === monthKey
      ? Number(user?.kael_msg_count || 0)
      : 0;

  return {
    used: count,
    limit,
    remaining: Math.max(0, limit - count),
    monthKey,
  };
}

export async function getServerMessageStats() {
  const { data, error } = await supabase.rpc(
    'get_kael_usage'
  );

  if (error) {
    throw error;
  }

  return data;
}

export async function claimMessage() {
  const { data, error } = await supabase.rpc(
    'claim_kael_message'
  );

  if (error) {
    throw error;
  }

  return data;
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
