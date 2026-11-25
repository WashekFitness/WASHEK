import {
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  readNativeSupabaseStorageSession,
  syncClientSessionSafely,
  refreshSupabaseSessionLocked,
} from '@/lib/supabase';
import { getUserTimeZone, getCurrentMonthKey } from '@/lib/dateUtils';
import { syncQuotaAcrossApp, getCachedMessageStats } from '@/lib/messageLimit';
import { isLogo } from '@/lib/avatarUtils';
import {
  enforceUserSubscriptionState,
  isActiveSubscriptionStatus,
  isExplicitlyCanceled,
  normalizePlan,
  getPlanRank,
  getRedirectUpgradeReceipt,
  clearRedirectUpgradeReceipt,
  syncSubscriptionStorageKeys,
} from '@/lib/subscription';
import { fetchServerEntitlement } from '@/lib/stripeCheckout';
import {
  getCachedProgramsList,
  setCachedLogs,
  setCachedLastWorkout,
  setCachedNutrition,
  setCachedSavedMeals,
  getCachedSavedMeals,
  removeCachedSavedMeal,
  getDeletedSavedMealIds,
} from '@/lib/cacheStore';
import {
  storePhotoData,
  getPhotoData,
  storePhotoRecord,
  getAllPhotoRecords,
  deletePhotoData,
  pruneLegacyLocalStoragePhotos,
} from '@/lib/photoDb';

const MEDIA_BUCKET =
  import.meta.env.VITE_SUPABASE_MEDIA_BUCKET ||
  'user-media';

const AI_FUNCTION =
  import.meta.env.VITE_SUPABASE_AI_FUNCTION ||
  'ai-generate';

const EMAIL_FUNCTION =
  import.meta.env.VITE_SUPABASE_EMAIL_FUNCTION ||
  'send-contact-email';


function errorFrom(
  error,
  fallback = 'Supabase request failed.'
) {
  if (!error) {
    return new Error(fallback);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(
    error.message ||
    error.details ||
    error.hint ||
    fallback
  );
}


export function ensureValidUuid(str) {
  if (!str || typeof str !== 'string') return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) return str;

  // Convert non-UUID (e.g. Firebase alphanumeric UID) deterministically to standard UUID format
  let hash = 0;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    hash2 = ((hash2 << 7) - hash2 + str.charCodeAt(i)) | 0;
  }
  const hex1 = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const combined = (hex1 + hex2 + hex1 + hex2).slice(0, 32);
  return `${combined.slice(0, 8)}-${combined.slice(8, 12)}-4${combined.slice(13, 16)}-a${combined.slice(17, 20)}-${combined.slice(20, 32)}`;
}

const ONBOARDED_ACCOUNTS_KEY = 'washek_onboarded_accounts';

export function markUserOnboarded(userId, email) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ONBOARDED_ACCOUNTS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (userId) map[`id:${String(userId).trim()}`] = true;
    if (email) map[`email:${String(email).trim().toLowerCase()}`] = true;
    localStorage.setItem(ONBOARDED_ACCOUNTS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage write error
  }
}

export function isUserMarkedOnboarded(userId, email) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(ONBOARDED_ACCOUNTS_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw);
    if (userId && map[`id:${String(userId).trim()}`]) return true;
    if (email && map[`email:${String(email).trim().toLowerCase()}`]) return true;
  } catch {
    // ignore parse error
  }
  return false;
}

/*
 * ------------------------------------------------------------
 * AUTH
 * ------------------------------------------------------------
 */

function isVaultTokenString(tok) {
  return Boolean(tok && (tok.startsWith('vault_tok_') || tok.startsWith('washek_sess_')));
}

function buildCachedUserObject(parsed) {
  const validId = ensureValidUuid(parsed.id || parsed.uid || parsed.email);
  return {
    id: validId,
    uid: parsed.uid || parsed.id || validId,
    raw_id: parsed.id || parsed.uid || validId,
    email: parsed.email || '',
    _isLocalVault: true,
    user_metadata: {
      first_name: parsed.first_name || '',
      last_name: parsed.last_name || '',
      full_name: parsed.full_name || parsed.email || 'Athlete',
      email: parsed.email || '',
      role: parsed.role || 'athlete',
    },
  };
}

async function requireUser() {
  // 1. Inspect stored token and cached user first so Vault sessions or newly signed-in accounts
  //    are never hijacked by a stale native Supabase session from another account.
  let parsedStored = null;
  let storedTok = '';
  let storedEmail = '';
  try {
    storedTok = localStorage.getItem('washek_auth_token') || '';
    const stored = localStorage.getItem('washek_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.id || parsed?.uid || parsed?.email) {
        parsedStored = parsed;
        storedEmail = parsed?.email ? String(parsed.email).toLowerCase().trim() : '';
      }
    }
  } catch (err) {
    console.debug('[supabaseApi] localStorage check note:', err);
  }

  if (
    parsedStored &&
    (isVaultTokenString(storedTok) || String(parsedStored.id || '').startsWith('usr_'))
  ) {
    return buildCachedUserObject(parsedStored);
  }

  // 2. Check active Supabase local session (only if it matches storedEmail when storedEmail is present)
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sUser = sessionData?.session?.user || null;
    if (sUser) {
      const sEmail = sUser.email ? String(sUser.email).toLowerCase().trim() : '';
      if (!storedEmail || !sEmail || sEmail === storedEmail) {
        return sUser;
      }
    }
  } catch (err) {
    console.warn('[supabaseApi] getSession check warning:', err);
  }

  if (parsedStored && !storedTok) {
    return buildCachedUserObject(parsedStored);
  }

  // 3. Query Supabase server only when a genuine JWT session may exist
  if (storedTok && storedTok.split('.').length === 3) {
    try {
      const {
        data,
        error
      } = await supabase.auth.getUser();

      if (!error && data?.user) {
        const uEmail = data.user.email ? String(data.user.email).toLowerCase().trim() : '';
        if (!storedEmail || !uEmail || uEmail === storedEmail) {
          return data.user;
        }
      }
    } catch (err) {
      console.warn('[supabaseApi] getUser network error:', err);
    }
  }

  // 4. Fallback to cached user in localStorage (washek_user)
  if (parsedStored) {
    return buildCachedUserObject(parsedStored);
  }

  throw new Error(
    'Your login session is missing. Please sign in again.'
  );
}


/*
 * ------------------------------------------------------------
 * PROFILE
 * ------------------------------------------------------------
 */

async function getProfile(userId) {
  try {
    const {
      data,
      error
    } =
      await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (!error && data) {
      return data;
    }
  } catch (err) {
    console.warn('[supabaseApi] getProfile network or query warning:', err);
  }

  return null;
}


function normalizeUser(authUser, profile = {}) {
  const safeProfile = profile || {};
  const firstName =
    safeProfile.first_name ||
    authUser.user_metadata?.first_name ||
    '';

  const lastName =
    safeProfile.last_name ||
    authUser.user_metadata?.last_name ||
    '';

  const fullName =
    safeProfile.full_name ||
    [firstName, lastName]
      .filter(Boolean)
      .join(' ') ||
    authUser.user_metadata?.full_name ||
    authUser.email ||
    'Athlete';

  const detectedTz = getUserTimeZone();
  const effectiveTz = safeProfile.timezone || detectedTz;

  // Auto-sync detected timezone to profile in background if missing (only for genuine Supabase sessions)
  if (
    !authUser?._isLocalVault &&
    !String(authUser?.id || '').startsWith('usr_') &&
    (!safeProfile.timezone || safeProfile.timezone === 'UTC') &&
    authUser?.id &&
    detectedTz &&
    detectedTz !== 'UTC'
  ) {
    supabase
      .from('profiles')
      .update({ timezone: detectedTz })
      .eq('id', authUser.id)
      .then(() => {})
      .catch(() => {});
  }

  const cleansedAvatar = safeProfile.avatar_url && !isLogo(safeProfile.avatar_url) ? safeProfile.avatar_url : null;

  return enforceUserSubscriptionState({
    ...safeProfile,
    id: authUser.id,
    email: authUser.email,
    role: safeProfile.role || authUser.user_metadata?.role || 'user',
    subscription_plan: safeProfile.subscription_plan || safeProfile.plan || 'free',
    subscription_status: safeProfile.subscription_status || 'inactive',
    avatar_url: cleansedAvatar,
    photo_url: cleansedAvatar,
    timezone: effectiveTz,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
  });
}


/*
 * ------------------------------------------------------------
 * CURRENT USER
 * ------------------------------------------------------------
 */

let inFlightMePromise = null;
let lastMeResult = null;
let lastMeFetchedAt = 0;
const ME_FRESH_TTL_MS = 3000;

export function invalidateCurrentUserCache() {
  lastMeFetchedAt = 0;
  lastMeResult = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('washek_subscription_updated', invalidateCurrentUserCache);
  window.addEventListener('washek_session_recovered', invalidateCurrentUserCache);
}

async function currentUser(forceFresh = false) {
  try {
    localStorage.removeItem('washek_recent_upgrade');
  } catch {
    // ignore
  }

  const rawStoredStatus = (() => {
    try {
      return String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
    } catch {
      return '';
    }
  })();

  // If stored in localStorage and not forceFresh, return cached washek_user quickly
  if (!forceFresh) {
    try {
      const stored = localStorage.getItem('washek_user');
      if (stored) {
        const parsed = enforceUserSubscriptionState(JSON.parse(stored));
        if (parsed?.email) {
          if (isLogo(parsed.avatar_url) || isLogo(parsed.photo_url)) {
            parsed.avatar_url = null;
            parsed.photo_url = null;
          }
          if (
            parsed.onboarded === false &&
            (isUserMarkedOnboarded(parsed.id, parsed.email) ||
              Boolean(parsed.active_program_id || parsed.last_program_generated_at))
          ) {
            parsed.onboarded = true;
          }
          const redirectReceipt = getRedirectUpgradeReceipt(parsed);
          const parsedStatus = String(parsed.subscription_status || rawStoredStatus || '').toLowerCase().trim();
          const parsedPlan = normalizePlan(
            parsed.subscription_plan || parsed.plan || parsed.tier || parsed.subscription_tier || 'free'
          );
          const isParsedActive =
            isActiveSubscriptionStatus(parsedStatus) &&
            parsedPlan !== 'free';

          const parsedRank = isParsedActive ? getPlanRank(parsedPlan) : 0;
          const redirectRank = redirectReceipt ? getPlanRank(redirectReceipt.plan) : 0;

          if (redirectReceipt && (!isParsedActive || redirectRank > parsedRank)) {
            parsed.subscription_plan = redirectReceipt.plan;
            parsed.subscription_status = redirectReceipt.status;
            parsed.tier = redirectReceipt.plan;
            parsed.plan = redirectReceipt.plan;
            parsed.subscription_tier = redirectReceipt.plan;
            syncSubscriptionStorageKeys(parsed);
            return parsed;
          } else if (!isParsedActive) {
            parsed.subscription_plan = 'free';
            parsed.subscription_status =
              rawStoredStatus === 'canceled' || rawStoredStatus === 'cancelled'
                ? 'canceled'
                : (parsedStatus || rawStoredStatus || 'inactive');
            parsed.tier = 'free';
            parsed.plan = 'free';
            parsed.subscription_tier = 'free';
            // If cached user appears free and NOT explicitly canceled, allow a periodic fresh check (>15s stale)
            // instead of returning stale 'free' indefinitely across page navigations.
            const canceledLocally = isExplicitlyCanceled(parsed.subscription_status) || isExplicitlyCanceled(rawStoredStatus);
            const staleCheckWindow = !lastMeFetchedAt || Date.now() - lastMeFetchedAt > 15000;
            if (!canceledLocally && staleCheckWindow) {
              // Fall through to remote/entitlement check below
            } else {
              return parsed;
            }
          } else {
            syncSubscriptionStorageKeys(parsed);
            return parsed;
          }
        }
      }
    } catch (err) {
      console.debug('[supabaseApi] localStorage parse note:', err);
    }
  }

  // Return recently fetched authoritative user within short TTL window unless forceFresh requested
  if (!forceFresh && lastMeResult && Date.now() - lastMeFetchedAt < ME_FRESH_TTL_MS) {
    return lastMeResult;
  }

  // Deduplicate concurrent remote currentUser fetches across mounting components
  if (inFlightMePromise) {
    return inFlightMePromise;
  }

  inFlightMePromise = (async () => {
    // Query live Supabase auth user and profile (skip remote RTTs on local vault sessions)
    try {
      const user = await requireUser();
      const isLocalVault =
        Boolean(user?._isLocalVault) || String(user?.uid || user?.id || '').startsWith('usr_');

      let storedProfile = null;
      try {
        const rawStored = localStorage.getItem('washek_user');
        if (rawStored) storedProfile = JSON.parse(rawStored);
      } catch {
        storedProfile = null;
      }

      let hasRemoteProfile = false;
      let profile = null;
      if (isLocalVault) {
        profile = storedProfile ? { ...storedProfile } : null;
      } else {
        profile = await getProfile(user.id);
        hasRemoteProfile = Boolean(profile);
      }

      if (!profile) {
        const storedMatchesUser =
          storedProfile &&
          ((storedProfile.id && storedProfile.id === user.id) ||
            (storedProfile.email &&
              user.email &&
              String(storedProfile.email).toLowerCase().trim() === String(user.email).toLowerCase().trim()));

        const isStoredCancelled = rawStoredStatus === 'canceled' || rawStoredStatus === 'cancelled';
        const profileInsert = {
          id: user.id,
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          full_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.first_name ||
            user.email ||
            'Athlete',
          role: user.user_metadata?.role || 'athlete',
          training_type: user.user_metadata?.training_type || 'calisthenics',
          fitness_level: user.user_metadata?.fitness_level || 'intermediate',
          subscription_plan: storedMatchesUser && storedProfile?.subscription_plan ? storedProfile.subscription_plan : 'free',
          subscription_status:
            storedMatchesUser && storedProfile?.subscription_status
              ? storedProfile.subscription_status
              : isStoredCancelled
                ? rawStoredStatus
                : 'inactive',
        };

        profile = {
          ...(storedMatchesUser ? storedProfile : {}),
          ...profileInsert,
          email: user.email,
        };

        if (!isLocalVault && !storedMatchesUser) {
          supabase
            .from('profiles')
            .upsert(
              {
                ...profileInsert,
                subscription_plan: 'free',
                subscription_status: 'inactive',
              },
              { onConflict: 'id', ignoreDuplicates: true }
            )
            .then(() => {}, () => {});
        }
      }

    const normalized = normalizeUser(user, profile);
    if (user?.raw_id) {
      normalized.id = user.raw_id;
    }
    const dbStatus = String(profile.subscription_status || '').toLowerCase().trim();
    const dbPlan = normalizePlan(profile.subscription_plan || 'free');
    const dbActive =
      (hasRemoteProfile || isLocalVault) &&
      isActiveSubscriptionStatus(dbStatus) &&
      dbPlan !== 'free';

    const PLAN_RANK = { free: 0, progress: 1, performance: 2, elite: 3 };
    let redirectReceipt = getRedirectUpgradeReceipt(profile);
    if (!redirectReceipt || (PLAN_RANK[normalizePlan(redirectReceipt.plan)] || 0) < PLAN_RANK.elite) {
      try {
        const serverEnt = await fetchServerEntitlement({
          userId: user.id,
          email: user.email,
          cancelledAtIso: profile?.subscription_cancelled_at || null,
        });
        if (serverEnt?.active) {
          const srvPlan = normalizePlan(serverEnt.plan);
          const curRank = redirectReceipt ? (PLAN_RANK[normalizePlan(redirectReceipt.plan)] || 0) : 0;
          if ((PLAN_RANK[srvPlan] || 0) >= curRank) {
            redirectReceipt = {
              plan: srvPlan,
              status: serverEnt.status,
              timestamp: serverEnt.timestamp,
              verifiedBy: serverEnt.verifiedBy,
            };
          }
        }
      } catch {
        // ignore server entitlement lookup error
      }
    }

    const redirectHigherOrMissingDb = Boolean(
      redirectReceipt &&
        redirectReceipt.plan !== 'free' &&
        (!dbActive || (PLAN_RANK[normalizePlan(redirectReceipt.plan)] || 0) >= (PLAN_RANK[dbPlan] || 0))
    );

    if (redirectHigherOrMissingDb && (!dbActive || normalizePlan(redirectReceipt.plan) !== dbPlan)) {
      normalized.subscription_plan = redirectReceipt.plan;
      normalized.subscription_status = redirectReceipt.status;
      normalized.tier = redirectReceipt.plan;
      normalized.plan = redirectReceipt.plan;
      normalized.subscription_tier = redirectReceipt.plan;
      normalized.subscription_cancelled_at = null;
      try {
        localStorage.setItem('washek_subscription_plan', redirectReceipt.plan);
        localStorage.setItem('washek_subscription_status', redirectReceipt.status);
        localStorage.removeItem('washek_subscription_cancelled_at');
      } catch {
        // ignore
      }
    } else if (dbActive) {
      if (redirectReceipt && dbPlan === normalizePlan(redirectReceipt.plan)) {
        clearRedirectUpgradeReceipt();
      }
      normalized.subscription_plan = dbPlan;
      normalized.subscription_status = dbStatus;
      normalized.tier = dbPlan;
      normalized.plan = dbPlan;
      normalized.subscription_tier = dbPlan;
      normalized.subscription_cancelled_at = null;
      try {
        localStorage.setItem('washek_subscription_plan', dbPlan);
        localStorage.setItem('washek_subscription_status', dbStatus);
        localStorage.removeItem('washek_subscription_cancelled_at');
      } catch {
        // ignore
      }
    } else {
      if (redirectReceipt) {
        normalized.subscription_plan = redirectReceipt.plan;
        normalized.subscription_status = redirectReceipt.status;
        normalized.tier = redirectReceipt.plan;
        normalized.plan = redirectReceipt.plan;
        normalized.subscription_tier = redirectReceipt.plan;
        normalized.subscription_cancelled_at = null;
        try {
          localStorage.setItem('washek_subscription_plan', redirectReceipt.plan);
          localStorage.setItem('washek_subscription_status', redirectReceipt.status);
          localStorage.removeItem('washek_subscription_cancelled_at');
        } catch {
          // ignore
        }
      } else if (!isLocalVault && !hasRemoteProfile) {
        // Remote profile fetch failed transiently: preserve valid cached active subscription instead of flashing Free
        const cachedPlan = normalizePlan(
          storedProfile?.subscription_plan || localStorage.getItem('washek_subscription_plan') || 'free'
        );
        const cachedStatus = String(
          storedProfile?.subscription_status || rawStoredStatus || ''
        )
          .toLowerCase()
          .trim();
        if (cachedPlan !== 'free' && isActiveSubscriptionStatus(cachedStatus)) {
          normalized.subscription_plan = cachedPlan;
          normalized.subscription_status = cachedStatus;
          normalized.tier = cachedPlan;
          normalized.plan = cachedPlan;
          normalized.subscription_tier = cachedPlan;
        } else {
          normalized.subscription_plan = 'free';
          normalized.subscription_status = cachedStatus || 'inactive';
          normalized.tier = 'free';
          normalized.plan = 'free';
          normalized.subscription_tier = 'free';
        }
      } else {
        // Authoritative DB shows free / canceled / inactive
        normalized.subscription_plan = 'free';
        normalized.subscription_status = dbStatus || 'inactive';
        normalized.tier = 'free';
        normalized.plan = 'free';
        normalized.subscription_tier = 'free';
        try {
          localStorage.removeItem('washek_subscription_plan');
          localStorage.removeItem('washek_recent_upgrade');
          localStorage.setItem('washek_subscription_status', dbStatus || 'inactive');
        } catch {
          // ignore
        }
      }
    }

    // Prevent returning athletes from being misclassified as onboarded=false
    if (normalized.onboarded === true) {
      markUserOnboarded(user.id, user.email);
    } else {
      let hasExistingHistory =
        isUserMarkedOnboarded(user.id, user.email) ||
        Boolean(normalized.active_program_id || normalized.last_program_generated_at) ||
        getLocalEntityRecords('workout_programs', user.id).length > 0 ||
        getCachedProgramsList(user.email || user.id).length > 0;

      if (!hasExistingHistory && user.id && !isLocalVault) {
        try {
          const [{ data: progRows }, { data: logRows }] = await Promise.all([
            supabase.from('workout_programs').select('id').eq('user_id', user.id).limit(1),
            supabase.from('workout_logs').select('id').eq('user_id', user.id).limit(1),
          ]);
          if ((Array.isArray(progRows) && progRows.length > 0) || (Array.isArray(logRows) && logRows.length > 0)) {
            hasExistingHistory = true;
          }
        } catch {
          // ignore returning user lookup note
        }
      }

      if (hasExistingHistory) {
        normalized.onboarded = true;
        markUserOnboarded(user.id, user.email);
        if (!isLocalVault) {
          supabase
            .from('profiles')
            .update({ onboarded: true, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .then(() => {})
            .catch(() => {});
        }
      }
    }

    // Guarantee same-month Kael message count never regresses to 0 on profile refresh
    const effectiveQuotaTz = getUserTimeZone(normalized);
    const currentMonthKey = getCurrentMonthKey(new Date(), effectiveQuotaTz);
    const normalizedSameMonthCount =
      normalized.kael_msg_month === currentMonthKey
        ? Math.max(0, Number(normalized.kael_msg_count || 0))
        : 0;
    const cachedQuota = getCachedMessageStats(
      normalized,
      normalized.subscription_plan,
      effectiveQuotaTz
    );
    const localSameMonthCount =
      cachedQuota?.monthKey === currentMonthKey
        ? Math.max(0, Number(cachedQuota.used || 0))
        : 0;
    normalized.kael_msg_count = Math.max(normalizedSameMonthCount, localSameMonthCount);
    normalized.kael_msg_month = currentMonthKey;

    try {
      localStorage.setItem('washek_user', JSON.stringify(normalized));
      syncSubscriptionStorageKeys(normalized);
      const prevPlan = storedProfile ? normalizePlan(storedProfile.subscription_plan) : 'free';
      const nextPlan = normalizePlan(normalized.subscription_plan);
      if (
        typeof window !== 'undefined' &&
        nextPlan !== 'free' &&
        isActiveSubscriptionStatus(normalized.subscription_status) &&
        (prevPlan !== nextPlan || !isActiveSubscriptionStatus(storedProfile?.subscription_status))
      ) {
        window.dispatchEvent(
          new CustomEvent('washek_subscription_updated', {
            detail: {
              plan: nextPlan,
              status: normalized.subscription_status || 'active',
            },
          })
        );
      }
    } catch (_err) {
      // ignore
    }
    lastMeResult = normalized;
    lastMeFetchedAt = Date.now();
    return normalized;
    } catch {
      return null;
    } finally {
      inFlightMePromise = null;
    }
  })();

  return inFlightMePromise;
}


/*
 * ------------------------------------------------------------
 * FILTERING
 * ------------------------------------------------------------
 */

const ORDER_ALIASES = {
  created_date: 'created_at',
  updated_date: 'updated_at',
};


function applyFilters(query, filters = {}, userId) {
  let q = query;

  for (const [key, value] of Object.entries(filters || {})) {
    if (key === 'created_by') continue;
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      q = q.in(key, value);
    } else {
      q = q.eq(key, value);
    }
  }

  if (userId) {
    const validUuid = ensureValidUuid(userId);
    if (validUuid) {
      q = q.eq('user_id', validUuid);
    }
  }

  return q;
}


/*
 * ------------------------------------------------------------
 * ENTITY LOCAL STORAGE & PERSISTENCE HELPERS
 * ------------------------------------------------------------
 */

function getEntityStorageKey(table, userId) {
  return `washek_entity_${table}_${userId || 'guest'}`;
}

function getLocalEntityRecords(table, userId) {
  if (typeof localStorage === 'undefined') return [];
  const results = [];
  const seen = new Set();
  const keys = [
    getEntityStorageKey(table, userId),
    getEntityStorageKey(table, 'guest'),
    getEntityStorageKey(table, 'athlete'),
    `washek_entity_${table}_all`,
  ];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id && !seen.has(item.id)) {
              seen.add(item.id);
              results.push(item);
            }
          }
        }
      }
    } catch (_err) {
      // Ignore parse errors
    }
  }
  return results;
}

function compactRecordForLocalStorage(table, record) {
  if (!record || typeof record !== 'object') return record;
  const copy = { ...record };

  if (table === 'progress_photos' || copy.photo_url || copy.resolved_photo_url) {
    if (
      typeof copy.resolved_photo_url === 'string' &&
      (copy.resolved_photo_url.startsWith('data:') || copy.resolved_photo_url.startsWith('blob:')) &&
      copy.resolved_photo_url.length > 4096
    ) {
      delete copy.resolved_photo_url;
    }
    if (
      typeof copy.photo_url === 'string' &&
      (copy.photo_url.startsWith('data:') || copy.photo_url.startsWith('blob:')) &&
      copy.photo_url.length > 4096 &&
      copy.id
    ) {
      copy.photo_url = `idb://${copy.id}`;
    }
  }

  return copy;
}

function writeCompactLocalArray(key, list, table) {
  const compacted = list.slice(0, 1000).map((item) => compactRecordForLocalStorage(table, item));
  try {
    localStorage.setItem(key, JSON.stringify(compacted));
  } catch (err) {
    if (err?.name === 'QuotaExceededError' || String(err?.message || '').toLowerCase().includes('quota')) {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('washek_photo_')) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem(key, JSON.stringify(compacted));
      } catch {
        // Ignore quota errors after cleanup
      }
    }
  }
}

function saveLocalEntityRecord(table, userId, record) {
  if (typeof localStorage === 'undefined' || !record?.id) return;
  const compact = compactRecordForLocalStorage(table, record);

  const keys = new Set([
    getEntityStorageKey(table, userId),
    getEntityStorageKey(table, 'guest'),
    getEntityStorageKey(table, 'athlete'),
    `washek_entity_${table}_all`,
  ]);

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const existing = JSON.parse(raw);
        if (Array.isArray(existing)) {
          const idx = existing.findIndex((item) => item?.id === compact.id);
          if (idx >= 0) {
            existing[idx] = compactRecordForLocalStorage(table, { ...existing[idx], ...compact });
            writeCompactLocalArray(key, existing, table);
          }
        }
      }
    } catch (_err) {
      // Ignore parse/quota errors
    }
  }

  // Also ensure primaryKey has the record unshifted if not already in it
  const primaryKey = getEntityStorageKey(table, userId);
  try {
    const existing = JSON.parse(localStorage.getItem(primaryKey) || '[]');
    const safeList = Array.isArray(existing) ? existing : [];
    const idx = safeList.findIndex((item) => item?.id === compact.id);
    if (idx >= 0) {
      safeList[idx] = compactRecordForLocalStorage(table, { ...safeList[idx], ...compact });
    } else {
      safeList.unshift(compact);
    }
    writeCompactLocalArray(primaryKey, safeList, table);
  } catch (_err) {
    // Ignore quota errors
  }
}

function removeLocalEntityRecord(table, userId, recordId) {
  if (typeof localStorage === 'undefined' || !recordId) return;
  const keys = [
    getEntityStorageKey(table, userId),
    getEntityStorageKey(table, 'guest'),
    getEntityStorageKey(table, 'athlete'),
    `washek_entity_${table}_all`,
  ];
  for (const key of keys) {
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = existing.filter((item) => item?.id !== recordId);
      writeCompactLocalArray(key, filtered, table);
    } catch (_err) {
      // Ignore
    }
  }
}

async function getEffectiveFbUser() {
  return null;
}

async function syncToFirestore(_table, _record, _action = 'set') {
  return;
}

async function fetchFromFirestore(_table) {
  return [];
}

/*
 * ------------------------------------------------------------
 * GENERIC ENTITIES & SUPABASE SCHEMA SANITIZATION
 * ------------------------------------------------------------
 */

const KNOWN_TABLE_COLUMNS = {
  progress_photos: new Set([
    'id',
    'user_id',
    'created_by',
    'photo_url',
    'date',
    'weight_lbs',
    'body_fat_estimate',
    'body_fat_numeric',
    'ai_insights',
    'created_at',
    'updated_at',
  ]),
  workout_programs: new Set([
    'id',
    'user_id',
    'created_by',
    'program_name',
    'duration_weeks',
    'macrocycle',
    'mesocycles',
    'microcycles',
    'training_type',
    'fitness_level',
    'goal',
    'current_week',
    'status',
    'created_at',
    'updated_at',
  ]),
  workout_logs: new Set([
    'id',
    'user_id',
    'created_by',
    'program_id',
    'date',
    'week_number',
    'day_name',
    'exercises_completed',
    'duration_minutes',
    'post_workout_checkin',
    'ai_adjustment_notes',
    'created_at',
  ]),
  nutrition_entries: new Set([
    'id',
    'user_id',
    'created_by',
    'date',
    'meal_type',
    'food_name',
    'serving_size',
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'created_at',
  ]),
  saved_meals: new Set([
    'id',
    'user_id',
    'created_by',
    'name',
    'meal_type',
    'calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'serving_size',
    'items',
    'notes',
    'created_at',
    'updated_at',
  ]),
  movement_baselines: new Set([
    'id',
    'user_id',
    'created_by',
    'recorded_date',
    'custom_entries',
    'created_at',
    'updated_at',
  ]),
  form_analyses: new Set([
    'id',
    'user_id',
    'created_by',
    'video_url',
    'exercise_name',
    'exercise_category',
    'score',
    'rep_count',
    'hold_time_seconds',
    'analysis',
    'issues',
    'priority_focus',
    'date',
    'created_at',
  ]),
  kael_messages: new Set([
    'id',
    'user_id',
    'created_by',
    'role',
    'content',
    'is_edit',
    'created_at',
  ]),
};

function sanitizeForSupabase(table, payload) {
  const allowed = KNOWN_TABLE_COLUMNS[table];
  if (!allowed) {
    const copy = { ...payload };
    delete copy.resolved_photo_url;
    return copy;
  }
  const clean = {};
  for (const [key, val] of Object.entries(payload)) {
    if (allowed.has(key) && val !== undefined) {
      clean[key] = val;
    }
  }
  return clean;
}

function extractUnknownColumnName(err) {
  const msg = String(err?.message || err?.details || '');
  const match =
    msg.match(/Could not find the ['"]([^'"]+)['"] column/i) ||
    msg.match(/column ['"]?([a-zA-Z0-9_]+)['"]? of relation/i);
  return match?.[1] || null;
}

async function ensureSupabaseSessionReady() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id) {
      return sessionData.session;
    }

    const storedTok =
      typeof localStorage !== 'undefined' ? localStorage.getItem('washek_auth_token') || '' : '';
    if (storedTok && !isVaultTokenString(storedTok) && storedTok.split('.').length === 3) {
      const nativeSession = readNativeSupabaseStorageSession();
      const refreshTok =
        nativeSession?.refresh_token ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem('washek_refresh_token') || '' : '');
      const synced = await syncClientSessionSafely({
        access_token: storedTok,
        refresh_token: refreshTok,
      });
      if (synced?.user?.id) return synced;
      const refreshed = await refreshSupabaseSessionLocked(refreshTok);
      if (refreshed?.user?.id) return refreshed;
    }
  } catch {
    // Non-blocking session hydration
  }
  return null;
}

function entity(table) {
  return {
    async list(sort = '-created_at', limit = 100) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user.id);
      } catch (_authErr) {
        // Guest or unauthenticated session
      }

      if (table === 'progress_photos') {
        await pruneLegacyLocalStoragePhotos();
      }

      const localRecords = getLocalEntityRecords(table, validUserId);
      if (table === 'progress_photos') {
        const idbRecords = await getAllPhotoRecords();
        const existingMap = new Map(localRecords.map((r) => [r.id, r]));
        idbRecords.forEach((rec) => {
          if (rec?.id) {
            const prev = existingMap.get(rec.id) || {};
            existingMap.set(rec.id, { ...prev, ...rec });
          }
        });
        localRecords.length = 0;
        localRecords.push(...existingMap.values());
      }

      let remoteRecords = [];

      if (!user?._isLocalVault) {
        try {
          const activeSession = await ensureSupabaseSessionReady();
          const queryUserId = activeSession?.user?.id || validUserId;
          const rawColumn = sort.replace(/^-/, '');
          const column = ORDER_ALIASES[rawColumn] || rawColumn;
          const ascending = !sort.startsWith('-');

          let q = supabase.from(table).select('*');
          if (queryUserId) {
            q = q.eq('user_id', queryUserId);
          }
          q = q.order(column, { ascending });
          if (Number.isFinite(limit)) q = q.limit(limit);

          const { data, error } = await q;
          if (!error && Array.isArray(data)) {
            remoteRecords = data;
            remoteRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
          }
        } catch (_dbErr) {
          // Fallback to local and Firestore
        }
      }

      let firestoreRecords = [];
      if (remoteRecords.length === 0) {
        firestoreRecords = await fetchFromFirestore(table);
        firestoreRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
      }

      const map = new Map();
      remoteRecords.forEach((item) => {
        if (item?.id) map.set(item.id, item);
      });
      firestoreRecords.forEach((item) => {
        if (item?.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
      });
      localRecords.forEach((item) => {
        if (item?.id) {
          const prev = map.get(item.id) || {};
          map.set(item.id, {
            ...prev,
            ...item,
            photo_url:
              prev.photo_url && !String(prev.photo_url).startsWith('idb://')
                ? prev.photo_url
                : item.photo_url,
            weight_lbs: item.weight_lbs !== undefined && item.weight_lbs !== null ? item.weight_lbs : prev.weight_lbs,
            label: item.label !== undefined ? item.label : prev.label,
            custom_label: item.custom_label !== undefined ? item.custom_label : prev.custom_label,
            tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : prev.tags,
          });
        }
      });

      const merged = Array.from(map.values());
      const rawColumn = sort.replace(/^-/, '');
      const column = ORDER_ALIASES[rawColumn] || rawColumn;
      const ascending = !sort.startsWith('-');
      merged.sort((a, b) => {
        const vA = a[column] || a.created_at || a.created_date || a.date || '';
        const vB = b[column] || b.created_at || b.created_date || b.date || '';
        if (vA < vB) return ascending ? -1 : 1;
        if (vA > vB) return ascending ? 1 : -1;
        return 0;
      });

      return merged.slice(0, limit);
    },

    async filter(filters = {}, sort = '-created_at', limit = 100) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user.id);
      } catch (_authErr) {
        // Guest or unauthenticated session
      }

      if (table === 'progress_photos') {
        await pruneLegacyLocalStoragePhotos();
      }

      const allLocal = getLocalEntityRecords(table, validUserId);
      if (table === 'progress_photos') {
        const idbRecords = await getAllPhotoRecords();
        const existingMap = new Map(allLocal.map((r) => [r.id, r]));
        idbRecords.forEach((rec) => {
          if (rec?.id) {
            const prev = existingMap.get(rec.id) || {};
            existingMap.set(rec.id, { ...prev, ...rec });
          }
        });
        allLocal.length = 0;
        allLocal.push(...existingMap.values());
      }

      const localFiltered = allLocal.filter((item) => {
        for (const [key, value] of Object.entries(filters || {})) {
          if (value === undefined || value === null) continue;
          if (key === 'created_by') {
            if (item.created_by && item.created_by !== value && item.user_id !== validUserId) {
              return false;
            }
            continue;
          }
          if (key === 'date') {
            const itemDate = item.date || item.created_date || (typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : null);
            if (itemDate !== value) return false;
            continue;
          }
          if (Array.isArray(value)) {
            if (!value.includes(item[key])) return false;
          } else if (item[key] !== value) {
            return false;
          }
        }
        return true;
      });

      let remoteRecords = [];
      if (!user?._isLocalVault) {
        try {
          const activeSession = await ensureSupabaseSessionReady();
          const queryUserId = activeSession?.user?.id || validUserId;
          const rawColumn = sort.replace(/^-/, '');
          const column = ORDER_ALIASES[rawColumn] || rawColumn;
          const ascending = !sort.startsWith('-');

          let q = applyFilters(supabase.from(table).select('*'), filters, queryUserId).order(column, { ascending });
          if (Number.isFinite(limit)) q = q.limit(limit);

          const { data, error } = await q;
          if (!error && Array.isArray(data)) {
            remoteRecords = data;
            remoteRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
          }
        } catch (_dbErr) {
          // Supabase error fallback
        }
      }

      let firestoreRecords = [];
      if (remoteRecords.length === 0) {
        firestoreRecords = await fetchFromFirestore(table);
        if (filters && Object.keys(filters).length > 0) {
          firestoreRecords = firestoreRecords.filter((item) => {
            for (const [key, value] of Object.entries(filters)) {
              if (value === undefined || value === null) continue;
              if (key === 'created_by') continue;
              if (key === 'date') {
                const itemDate = item.date || item.created_date || (typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : null);
                if (itemDate !== value) return false;
                continue;
              }
              if (Array.isArray(value)) {
                if (!value.includes(item[key])) return false;
              } else if (item[key] !== value) {
                return false;
              }
            }
            return true;
          });
        }
        firestoreRecords.forEach((item) => saveLocalEntityRecord(table, validUserId, item));
      }

      const map = new Map();
      remoteRecords.forEach((item) => {
        if (item?.id) map.set(item.id, item);
      });
      firestoreRecords.forEach((item) => {
        if (item?.id) {
          const existing = map.get(item.id);
          if (!existing || (item.updated_at && (!existing.updated_at || item.updated_at >= existing.updated_at))) {
            map.set(item.id, { ...(existing || {}), ...item });
          }
        }
      });
      localFiltered.forEach((item) => {
        if (item?.id) {
          const existing = map.get(item.id);
          if (!existing || !item.updated_at || !existing.updated_at || item.updated_at >= existing.updated_at) {
            map.set(item.id, {
              ...(existing || {}),
              ...item,
              photo_url:
                existing?.photo_url && !String(existing.photo_url).startsWith('idb://')
                  ? existing.photo_url
                  : item.photo_url,
              weight_lbs: item.weight_lbs !== undefined && item.weight_lbs !== null ? item.weight_lbs : (existing?.weight_lbs ?? item.weight_lbs),
              label: item.label !== undefined ? item.label : (existing?.label ?? item.label),
              custom_label: item.custom_label !== undefined ? item.custom_label : (existing?.custom_label ?? item.custom_label),
              tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : (existing?.tags ?? item.tags),
            });
          }
        }
      });

      const merged = Array.from(map.values());
      const rawColumn = sort.replace(/^-/, '');
      const column = ORDER_ALIASES[rawColumn] || rawColumn;
      const ascending = !sort.startsWith('-');
      merged.sort((a, b) => {
        const vA = a[column] || a.created_at || a.created_date || a.date || '';
        const vB = b[column] || b.created_at || b.created_date || b.date || '';
        if (vA < vB) return ascending ? -1 : 1;
        if (vA > vB) return ascending ? 1 : -1;
        return 0;
      });

      return merged.slice(0, limit);
    },

    async create(payload = {}) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user?.id);
      } catch (_authErr) {
        // Fallback
      }

      const generatedId =
        payload.id ||
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${table.slice(0, 4)}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      const row = {
        ...payload,
        id: generatedId,
        user_id: validUserId || payload.user_id || '00000000-0000-4000-a000-000000000000',
        created_at: payload.created_at || nowIso,
        created_date: payload.created_date || payload.date || todayDate,
        date: payload.date || todayDate,
      };

      if (payload.created_by && typeof payload.created_by === 'string' && payload.created_by.trim()) {
        row.created_by = payload.created_by.trim();
      } else if (user?.email) {
        row.created_by = user.email;
      } else if (user?.id) {
        row.created_by = user.id;
      } else {
        row.created_by = 'athlete';
      }

      if (table === 'nutrition_entries') {
        row.calories = Number(payload.calories) || 0;
        row.protein_g = Number(payload.protein_g) || 0;
        row.carbs_g = Number(payload.carbs_g) || 0;
        row.fat_g = Number(payload.fat_g) || 0;
        row.meal_type = payload.meal_type || 'snack';
        row.food_name = payload.food_name || 'Food item';
      }

      if (table === 'saved_meals') {
        row.name = payload.name || payload.food_name || 'My Saved Meal';
        row.calories = Number(payload.calories) || 0;
        row.protein_g = Number(payload.protein_g) || 0;
        row.carbs_g = Number(payload.carbs_g) || 0;
        row.fat_g = Number(payload.fat_g) || 0;
        row.meal_type = payload.meal_type || 'snack';
        row.serving_size = payload.serving_size || '1 serving';
        row.items = Array.isArray(payload.items) ? payload.items : [];
      }

      // 1. Persist image bytes and metadata in IndexedDB for progress_photos
      if (table === 'progress_photos') {
        if (typeof row.photo_url === 'string' && row.photo_url.startsWith('data:')) {
          await storePhotoData(row.id, row.photo_url);
        } else if (typeof row.resolved_photo_url === 'string' && row.resolved_photo_url.startsWith('data:')) {
          await storePhotoData(row.id, row.resolved_photo_url);
        }
        await storePhotoRecord(row);
      }

      // 2. Immediately persist compact record in local storage cache
      saveLocalEntityRecord(table, validUserId, row);

      // 3. Persist to Firestore (await to ensure consistency)
      await syncToFirestore(table, row, 'set');

      // 4. Attempt Supabase insert with schema-safe columns and automatic unknown-column retry
      if (!user?._isLocalVault) {
        try {
          const activeSession = await ensureSupabaseSessionReady();
          const authUid = activeSession?.user?.id || validUserId;
          let candidatePayload = sanitizeForSupabase(table, {
            ...row,
            ...(authUid ? { user_id: authUid } : {}),
          });

          for (let attempt = 0; attempt < 6; attempt++) {
            const { data, error } = await supabase
              .from(table)
              .insert(candidatePayload)
              .select()
              .single();
            if (!error && data) {
              const merged = { ...row, ...data };
              if (table === 'progress_photos') {
                await storePhotoRecord(merged);
              }
              saveLocalEntityRecord(table, validUserId, merged);
              return merged;
            }
            if (error) {
              const unknownCol = extractUnknownColumnName(error);
              if (unknownCol && unknownCol in candidatePayload) {
                delete candidatePayload[unknownCol];
                continue;
              }
              console.warn(`[supabaseApi] Supabase insert note on ${table}:`, error.message);
              break;
            }
          }
        } catch (err) {
          console.warn(`[supabaseApi] Supabase insert network note on ${table}:`, err?.message || err);
        }
      }

      return row;
    },

    async update(id, payload = {}) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user?.id);
      } catch (_authErr) {
        // Fallback
      }

      // Merge with existing record first so we keep all original fields (photo_url, created_at, created_by, etc.)
      const localRecords = getLocalEntityRecords(table, validUserId);
      let existing = localRecords.find((item) => item?.id === id);
      if (!existing && table === 'progress_photos') {
        const idbRecords = await getAllPhotoRecords();
        existing = idbRecords.find((item) => item?.id === id);
      }

      // Strip undefined values so they don't overwrite existing fields
      const cleanPayload = {};
      for (const [key, val] of Object.entries(payload || {})) {
        if (val !== undefined) {
          cleanPayload[key] = val;
        }
      }

      const row = {
        ...(existing || {}),
        ...cleanPayload,
        id,
        updated_at: new Date().toISOString(),
      };
      if (validUserId && !row.user_id) {
        row.user_id = validUserId;
      }
      if (!row.created_by) {
        row.created_by = user?.email || user?.id || 'athlete';
      }

      if (table === 'nutrition_entries') {
        if (cleanPayload.meal_type !== undefined && cleanPayload.meal_type) {
          row.meal_type = String(cleanPayload.meal_type).toLowerCase().trim();
        }
        if (cleanPayload.food_name !== undefined && cleanPayload.food_name) {
          row.food_name = cleanPayload.food_name;
        }
        if (cleanPayload.calories !== undefined) row.calories = Number(cleanPayload.calories) || 0;
        if (cleanPayload.protein_g !== undefined) row.protein_g = Number(cleanPayload.protein_g) || 0;
        if (cleanPayload.carbs_g !== undefined) row.carbs_g = Number(cleanPayload.carbs_g) || 0;
        if (cleanPayload.fat_g !== undefined) row.fat_g = Number(cleanPayload.fat_g) || 0;
      }

      if (table === 'saved_meals') {
        if (cleanPayload.name !== undefined && cleanPayload.name) row.name = cleanPayload.name;
        if (cleanPayload.meal_type !== undefined && cleanPayload.meal_type) row.meal_type = String(cleanPayload.meal_type).toLowerCase().trim();
        if (cleanPayload.serving_size !== undefined) row.serving_size = cleanPayload.serving_size;
        if (cleanPayload.calories !== undefined) row.calories = Number(cleanPayload.calories) || 0;
        if (cleanPayload.protein_g !== undefined) row.protein_g = Number(cleanPayload.protein_g) || 0;
        if (cleanPayload.carbs_g !== undefined) row.carbs_g = Number(cleanPayload.carbs_g) || 0;
        if (cleanPayload.fat_g !== undefined) row.fat_g = Number(cleanPayload.fat_g) || 0;
        if (Array.isArray(cleanPayload.items)) row.items = cleanPayload.items;
      }

      if (table === 'progress_photos') {
        await storePhotoRecord(row);
      }

      // 1. Immediately update in local storage across all keys
      saveLocalEntityRecord(table, validUserId, row);

      // 2. Update in Firestore with merge (awaited so immediate invalidations read the fresh state)
      await syncToFirestore(table, row, 'set');

      // 3. Attempt Supabase update with schema-safe columns
      if (!user?._isLocalVault) {
        try {
          await ensureSupabaseSessionReady();
          let cleanForDb = sanitizeForSupabase(table, row);
          delete cleanForDb.id;
          delete cleanForDb.user_id;

          for (let attempt = 0; attempt < 6; attempt++) {
            const { data, error } = await supabase
              .from(table)
              .update(cleanForDb)
              .eq('id', id)
              .select()
              .maybeSingle();
            if (!error && data) {
              const merged = { ...row, ...data };
              if (table === 'progress_photos') {
                await storePhotoRecord(merged);
              }
              saveLocalEntityRecord(table, validUserId, merged);
              return merged;
            }
            if (error) {
              const unknownCol = extractUnknownColumnName(error);
              if (unknownCol && unknownCol in cleanForDb) {
                delete cleanForDb[unknownCol];
                continue;
              }
              console.warn(`[supabaseApi] Supabase update note on ${table}:`, error.message);
              break;
            }
            break;
          }
        } catch (err) {
          console.warn(`[supabaseApi] Supabase update note on ${table}:`, err?.message || err);
        }
      }

      return row;
    },

    async delete(id) {
      let validUserId = null;
      let user = null;
      try {
        user = await requireUser();
        validUserId = ensureValidUuid(user?.id);
      } catch (_authErr) {
        // Fallback
      }

      // 1. Remove from local storage & IndexedDB
      removeLocalEntityRecord(table, validUserId, id);
      if (table === 'progress_photos') {
        await deletePhotoData(id);
      }

      // 2. Remove from Firestore
      await syncToFirestore(table, { id }, 'delete');

      // 3. Attempt Supabase delete
      if (!user?._isLocalVault) {
        try {
          const activeSession = await ensureSupabaseSessionReady();
          const queryUserId = activeSession?.user?.id || validUserId;
          let q = supabase.from(table).delete().eq('id', id);
          if (queryUserId) {
            q = q.eq('user_id', queryUserId);
          }
          await q;
        } catch (err) {
          console.warn(`[supabaseApi] Supabase delete note on ${table}:`, err?.message || err);
        }
      }

      return true;
    },
  };
}


/*
 * ------------------------------------------------------------
 * STORAGE helpers
 * ------------------------------------------------------------
 */

function getStoragePath(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('idb://')) return null;

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    // Already a storage path
    return raw.replace(/^\/+/, '');
  }

  try {
    const url = new URL(raw);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const afterMarker = url.pathname.slice(markerIndex + marker.length);
    const parts = afterMarker.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const accessType = parts.shift(); // 'public' | 'sign' | 'authenticated'
    if (accessType !== 'public' && accessType !== 'sign' && accessType !== 'authenticated') return null;
    const bucket = parts.shift();
    // Allow any storage bucket (user-media, media, etc.)
    const cleanPath = decodeURIComponent(parts.join('/'));
    return cleanPath || null;
  } catch {
    return null;
  }
}

async function validateOwnStoragePath(value) {
  const path = getStoragePath(value);
  if (!path) throw new Error('A valid media storage path is required.');

  try {
    const user = await requireUser();
    return { path, user };
  } catch (_userErr) {
    // Allow guest or session resolution
    return { path, user: null };
  }
}

async function createSignedUrl(value, expiresIn = 3600) {
  const { path } = await validateOwnStoragePath(value);
  if (!path) throw new Error('A valid media storage path is required.');

  const bucketsToTry = Array.from(
    new Set([MEDIA_BUCKET, 'user-media', 'washek-media', 'media'].filter(Boolean))
  );
  let lastErr = null;

  for (const bucket of bucketsToTry) {
    try {
      // Clean path if it accidentally includes bucket prefix
      let clean = path;
      if (clean.startsWith(`${bucket}/`)) {
        clean = clean.slice(bucket.length + 1);
      }
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(clean, expiresIn);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
      if (error) lastErr = error;
    } catch (err) {
      lastErr = err;
    }
  }

  // Fallback: public URL across primary buckets
  for (const bucket of bucketsToTry) {
    try {
      let clean = path;
      if (clean.startsWith(`${bucket}/`)) {
        clean = clean.slice(bucket.length + 1);
      }
      const pub = supabase.storage.from(bucket).getPublicUrl(clean);
      if (pub?.data?.publicUrl) {
        return pub.data.publicUrl;
      }
    } catch {
      // try next
    }
  }

  if (lastErr) throw errorFrom(lastErr, 'Unable to create a secure media URL.');
  return `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/${MEDIA_BUCKET}/${path.replace(/^\/+/, '')}`;
}

async function createSignedUrls(values = [], expiresIn = 3600) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const paths = values.map(getStoragePath).filter(Boolean);
  if (paths.length === 0) return [];

  const results = [];
  for (const p of paths) {
    try {
      const url = await createSignedUrl(p, expiresIn);
      results.push(url);
    } catch {
      results.push(null);
    }
  }
  return results;
}

async function resolveMediaUrl(value, expiresIn = 3600) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('idb://')) {
    const idbId = raw.slice('idb://'.length).trim();
    return idbId ? await getPhotoData(idbId) : null;
  }

  const path = getStoragePath(raw);
  if (!path) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    return null;
  }

  try {
    await ensureSupabaseSessionReady();
    return await createSignedUrl(path, expiresIn);
  } catch (err) {
    console.debug('[Storage] Signed URL fallback for path:', path, err?.message || err);
    // If raw was a full URL and signing failed, return raw
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const clean = path.replace(/^\/+/, '');
    return `https://edvvwnaxmjuvwnxineph.supabase.co/storage/v1/object/public/${MEDIA_BUCKET}/${clean}`;
  }
}

async function uploadFile(input, folder = 'uploads') {
  const file = input?.file || input;
  const actualFolder = input?.folder || folder;
  if (!file) throw new Error('No file was provided.');

  const user = await requireUser();
  if (user?._isLocalVault) {
    throw new Error('Remote storage upload skipped for local session.');
  }

  const activeSession = await ensureSupabaseSessionReady();
  const ownerId = activeSession?.user?.id || user.id;
  const safeName = String(file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${ownerId}/${actualFolder}/${crypto.randomUUID()}-${safeName}`;

  const bucketsToTry = Array.from(
    new Set([MEDIA_BUCKET, 'user-media', 'washek-media', 'media'].filter(Boolean))
  );

  let uploadErr = null;
  let uploadedBucket = null;

  for (const bucket of bucketsToTry) {
    try {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (!error) {
        uploadedBucket = bucket;
        uploadErr = null;
        break;
      }
      uploadErr = error;
      const msg = String(error.message || '').toLowerCase();
      // Only retry next bucket if this bucket does not exist
      if (!msg.includes('bucket') && !msg.includes('not found') && error.statusCode !== '404' && error.status !== 404) {
        break;
      }
    } catch (err) {
      uploadErr = err;
    }
  }

  if (uploadErr || !uploadedBucket) {
    throw errorFrom(uploadErr, 'File upload failed.');
  }

  let fileUrl = null;
  try {
    const { data, error: signErr } = await supabase.storage.from(uploadedBucket).createSignedUrl(path, 3600);
    if (!signErr && data?.signedUrl) {
      fileUrl = data.signedUrl;
    } else {
      fileUrl = await createSignedUrl(path, 3600);
    }
  } catch {
    // ignore signing failures
  }

  return { file_url: fileUrl, path, bucket: uploadedBucket };
}

async function deleteFile(value) {
  const path = getStoragePath(value);
  if (!path) return false;

  const bucketsToTry = Array.from(
    new Set([MEDIA_BUCKET, 'user-media', 'washek-media', 'media'].filter(Boolean))
  );

  for (const bucket of bucketsToTry) {
    try {
      let clean = path;
      if (clean.startsWith(`${bucket}/`)) {
        clean = clean.slice(bucket.length + 1);
      }
      const { error } = await supabase.storage.from(bucket).remove([clean]);
      if (!error) return true;
    } catch {
      // try next bucket
    }
  }
  return false;
}

/*
 * ------------------------------------------------------------
 * AI
 *
 * invokeAI returns structured result on success OR object { __ai_error: true, ... } on failure.
 * This avoids throwing on transient Edge/502/504 errors so callers can reliably fallback.
 * ------------------------------------------------------------
 */

async function streamAI({
  prompt,
  file_urls = [],
  model = null,
  response_json_schema = null,
  schema = null,
  type = 'general',
  plan = 'free',
  onChunk = null,
} = {}) {
  try {
    await requireUser();
  } catch (_authErr) {
    // Non-blocking
  }

  const normalizedFileUrls = Array.isArray(file_urls)
    ? file_urls.map((value) => {
        const path = getStoragePath(value);
        return path || value;
      })
    : [];

  let currentUserId = lastMeResult?.id || null;
  let currentUserEmail = lastMeResult?.email || null;
  const streamTz = getUserTimeZone(lastMeResult);
  let currentUsed = getCachedMessageStats(lastMeResult, lastMeResult?.subscription_plan || plan, streamTz).used;
  let storedToken = null;
  try {
    const rawUser = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_user') : null;
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      currentUserId = parsedUser?.id || currentUserId;
      currentUserEmail = parsedUser?.email || currentUserEmail;
      currentUsed = Math.max(
        currentUsed,
        getCachedMessageStats(parsedUser, parsedUser?.subscription_plan || plan, streamTz).used
      );
    }
    storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_auth_token') || null : null;
    if (!currentUserEmail && storedToken && isVaultTokenString(storedToken)) {
      const parts = storedToken.split('_');
      const b64Part =
        parts.length >= 4 && /^\d+$/.test(parts[2])
          ? parts.slice(3).join('_')
          : parts.slice(2).join('_');
      if (b64Part) {
        const decoded = atob(b64Part).toLowerCase().trim();
        if (decoded.includes('@')) currentUserEmail = decoded;
      }
    }
  } catch (_userErr) {
    // Ignore
  }

  let authToken = null;
  let sessionUser = null;
  const isStoredVaultToken = Boolean(storedToken && isVaultTokenString(storedToken));
  if (!isStoredVaultToken) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sUser = sessionData?.session?.user || null;
      const sEmail = sUser?.email ? String(sUser.email).toLowerCase().trim() : '';
      const targetEmail = currentUserEmail ? String(currentUserEmail).toLowerCase().trim() : '';
      if (!targetEmail || !sEmail || sEmail === targetEmail) {
        authToken = sessionData?.session?.access_token || null;
        sessionUser = sUser;
        if (!authToken) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          const rUser = refreshed?.session?.user || null;
          const rEmail = rUser?.email ? String(rUser.email).toLowerCase().trim() : '';
          if (!targetEmail || !rEmail || rEmail === targetEmail) {
            authToken = refreshed?.session?.access_token || null;
            sessionUser = rUser || sessionUser;
          }
        }
      }
    } catch (_tokenErr) {
      // Ignore
    }
  }

  if (!authToken && storedToken) {
    authToken = storedToken;
  }

  currentUserId = currentUserId || sessionUser?.id || null;
  currentUserEmail = currentUserEmail || sessionUser?.email || null;

  const userTz = getUserTimeZone();
  const headers = {
    'Content-Type': 'application/json',
    'x-timezone': userTz,
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  try {
    const srvTok = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_srv_session') : '';
    if (srvTok) headers['x-washek-server-session'] = srvTok;
  } catch {
    // ignore
  }

  let resolvedPlan = plan && plan !== 'free' ? plan : 'free';
  try {
    if (typeof localStorage !== 'undefined') {
      const storedPlan = localStorage.getItem('washek_subscription_plan');
      const storedStatus = localStorage.getItem('washek_subscription_status');
      if (storedPlan && storedPlan !== 'free' && (!storedStatus || ['active', 'trialing', 'past_due'].includes(storedStatus.toLowerCase()))) {
        resolvedPlan = storedPlan.toLowerCase();
      } else if (resolvedPlan === 'free') {
        const rawUser = localStorage.getItem('washek_user');
        if (rawUser) {
          const pu = JSON.parse(rawUser);
          const puPlan = normalizePlan(pu?.subscription_plan || pu?.plan);
          if (puPlan !== 'free' && isActiveSubscriptionStatus(pu?.subscription_status)) {
            resolvedPlan = puPlan;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const requestBody = JSON.stringify({
    type,
    prompt,
    file_urls: normalizedFileUrls,
    model: model || 'gemini-3.1-flash-lite',
    schema: schema || response_json_schema || null,
    response_json_schema: response_json_schema || schema || null,
    plan: resolvedPlan,
    timezone: userTz,
    user_id: currentUserId,
    email: currentUserEmail,
    current_used: currentUsed,
  });

  try {
    let res = await fetch('/api/ai-stream', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: requestBody,
    });

    if (res.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      res = await fetch('/api/ai-stream', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: requestBody,
      });
    }

    if (res.status === 403) {
      const errData = await res.json().catch(() => ({}));
      return {
        __ai_error: true,
        message: errData?.error || 'An upgraded plan is required to access this feature.',
        code: errData?.error_code || 'SUBSCRIPTION_REQUIRED',
        details: errData,
      };
    }

    if (res.status === 429) {
      const errData = await res.json().catch(() => ({}));
      if (errData?.quota && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kael-quota-updated', { detail: errData.quota }));
      }
      return {
        __ai_error: true,
        message: errData?.error || 'You have reached your monthly message limit for Coach Kael.',
        code: 'KAEL_LIMIT_REACHED',
        details: errData,
      };
    }

    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let quota = null;
      let buffer = '';
      let fatalStreamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            let parsedChunk = null;
            try {
              parsedChunk = JSON.parse(trimmed.slice(5).trim());
            } catch (_parseErr) {
              continue;
            }
            if (parsedChunk?.error) {
              fatalStreamError = parsedChunk;
              break;
            }
            if (parsedChunk?.chunk) {
              fullText = parsedChunk.full || (fullText + parsedChunk.chunk);
              if (typeof onChunk === 'function') {
                onChunk(parsedChunk.chunk, fullText);
              }
            }
            if (parsedChunk?.quota) {
              quota = parsedChunk.quota;
              syncQuotaAcrossApp(quota);
            }
          }
        }
        if (fatalStreamError) break;
      }

      if (fatalStreamError) {
        if (
          fatalStreamError.error_code === 'SUBSCRIPTION_REQUIRED' ||
          fatalStreamError.error_code === 'FEATURE_REQUIRES_PLAN' ||
          fatalStreamError.error_code === 'KAEL_LIMIT_REACHED'
        ) {
          return {
            __ai_error: true,
            message: fatalStreamError.error,
            code: fatalStreamError.error_code,
            details: fatalStreamError,
          };
        }
        throw new Error(fatalStreamError.error);
      }

      if (fullText.trim()) {
        return {
          content: fullText.trim(),
          quota,
          result: fullText.trim(),
        };
      }
    }
  } catch (streamErr) {
    console.warn('[streamAI] Stream error, falling back to unary invokeAI:', streamErr);
  }

  const fallback = await invokeAI({
    prompt,
    file_urls,
    model: model || 'gemini-3.1-flash-lite',
    response_json_schema,
    schema,
    type,
    plan: resolvedPlan,
  });

  if (fallback && fallback.__ai_error) {
    return fallback;
  }

  const text =
    typeof fallback === 'string'
      ? fallback
      : (fallback?.result || fallback?.content || fallback?.text || '');

  if (typeof onChunk === 'function' && text) {
    onChunk(text, text);
  }

  return {
    content: text,
    result: text,
    quota: fallback?.quota,
  };
}

async function invokeAI({
  prompt,
  file_urls = [],
  model = null,
  response_json_schema = null,
  schema = null,
  type = 'general',
  plan = 'free',
  email = null,
  user_id = null,
  onChunk = null,
} = {}) {
  if (typeof onChunk === 'function') {
    return streamAI({
      prompt,
      file_urls,
      model,
      response_json_schema,
      schema,
      type,
      plan,
      onChunk,
    });
  }

  try {
    await requireUser();
  } catch (_authErr) {
    // Non-blocking in development / preview modes
  }

  const normalizedFileUrls = Array.isArray(file_urls)
    ? file_urls.map((value) => {
        const path = getStoragePath(value);
        return path || value;
      })
    : [];

  let currentUserId = user_id || lastMeResult?.id || null;
  let currentUserEmail = email || lastMeResult?.email || null;
  const invokeTz = getUserTimeZone(lastMeResult);
  let currentUsed = getCachedMessageStats(lastMeResult, lastMeResult?.subscription_plan || plan, invokeTz).used;
  let storedToken = null;
  try {
    const rawUser = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_user') : null;
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      currentUserId = currentUserId || parsedUser?.id || null;
      currentUserEmail = currentUserEmail || parsedUser?.email || null;
      currentUsed = Math.max(
        currentUsed,
        getCachedMessageStats(parsedUser, parsedUser?.subscription_plan || plan, invokeTz).used
      );
    }
    storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_auth_token') || null : null;
    if (!currentUserEmail && storedToken && isVaultTokenString(storedToken)) {
      const parts = storedToken.split('_');
      const b64Part =
        parts.length >= 4 && /^\d+$/.test(parts[2])
          ? parts.slice(3).join('_')
          : parts.slice(2).join('_');
      if (b64Part) {
        const decoded = atob(b64Part).toLowerCase().trim();
        if (decoded.includes('@')) currentUserEmail = decoded;
      }
    }
  } catch (_userErr) {
    // LocalStorage read fallback
  }

  // Get active session token for backend authorization & quota claiming
  let authToken = null;
  let sessionUser = null;
  const isStoredVaultToken = Boolean(storedToken && isVaultTokenString(storedToken));
  if (!isStoredVaultToken) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sUser = sessionData?.session?.user || null;
      const sEmail = sUser?.email ? String(sUser.email).toLowerCase().trim() : '';
      const targetEmail = currentUserEmail ? String(currentUserEmail).toLowerCase().trim() : '';
      if (!targetEmail || !sEmail || sEmail === targetEmail) {
        authToken = sessionData?.session?.access_token || null;
        sessionUser = sUser;
        if (!authToken) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          const rUser = refreshed?.session?.user || null;
          const rEmail = rUser?.email ? String(rUser.email).toLowerCase().trim() : '';
          if (!targetEmail || !rEmail || rEmail === targetEmail) {
            authToken = refreshed?.session?.access_token || null;
            sessionUser = rUser || sessionUser;
          }
        }
      }
    } catch (tokenErr) {
      console.warn('[invokeAI] Failed to get session token:', tokenErr);
    }
  }

  if (!authToken && storedToken) {
    authToken = storedToken;
  }

  // Primary: Google Gemini Server Backend
  try {
    currentUserId = currentUserId || sessionUser?.id || null;
    currentUserEmail = currentUserEmail || sessionUser?.email || null;

    const userTz = getUserTimeZone();
    const headers = {
      'Content-Type': 'application/json',
      'x-timezone': userTz,
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    try {
      const srvTok = typeof localStorage !== 'undefined' ? localStorage.getItem('washek_srv_session') : '';
      if (srvTok) headers['x-washek-server-session'] = srvTok;
    } catch {
      // ignore
    }

    let resolvedPlan = plan && plan !== 'free' ? plan : 'free';
    try {
      if (typeof localStorage !== 'undefined') {
        const storedPlan = localStorage.getItem('washek_subscription_plan');
        const storedStatus = localStorage.getItem('washek_subscription_status');
        if (storedPlan && storedPlan !== 'free' && (!storedStatus || ['active', 'trialing', 'past_due'].includes(storedStatus.toLowerCase()))) {
          resolvedPlan = storedPlan.toLowerCase();
        } else if (resolvedPlan === 'free') {
          const rawUser = localStorage.getItem('washek_user');
          if (rawUser) {
            const pu = JSON.parse(rawUser);
            const puPlan = normalizePlan(pu?.subscription_plan || pu?.plan);
            if (puPlan !== 'free' && isActiveSubscriptionStatus(pu?.subscription_status)) {
              resolvedPlan = puPlan;
            }
          }
        }
      }
    } catch {
      // ignore
    }

    let res = await fetch('/api/ai-generate', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        type,
        prompt,
        file_urls: normalizedFileUrls,
        model: model || 'gemini-3.1-flash-lite',
        schema: schema || response_json_schema || null,
        response_json_schema: response_json_schema || schema || null,
        plan: resolvedPlan,
        timezone: userTz,
        user_id: currentUserId,
        email: currentUserEmail,
        current_used: currentUsed,
      }),
    });

    // If a stale or invalid token returned 401, retry once without Authorization header
    if (res.status === 401 && headers['Authorization']) {
      delete headers['Authorization'];
      res = await fetch('/api/ai-generate', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          type,
          prompt,
          file_urls: normalizedFileUrls,
          model: model || 'gemini-3.1-flash-lite',
          schema: schema || response_json_schema || null,
          response_json_schema: response_json_schema || schema || null,
          plan: resolvedPlan,
          timezone: userTz,
          user_id: currentUserId,
          email: currentUserEmail,
          current_used: currentUsed,
        }),
      });
    }

    // Authoritative backend tier & quota enforcement
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (res.status === 403 || errData?.error_code === 'SUBSCRIPTION_REQUIRED') {
        return {
          __ai_error: true,
          message: errData?.error || 'An upgraded plan is required to access this feature.',
          code: 'SUBSCRIPTION_REQUIRED',
          details: errData,
        };
      }
      if (
        res.status === 429 ||
        errData?.error_code === 'KAEL_LIMIT_REACHED'
      ) {
        if (errData?.quota && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('kael-quota-updated', { detail: errData.quota })
          );
        }
        return {
          __ai_error: true,
          message: errData?.error || 'You have reached your monthly message limit for Coach Kael.',
          code: 'KAEL_LIMIT_REACHED',
          details: errData,
        };
      }
      return {
        __ai_error: true,
        message: errData?.error || 'AI generation failed.',
        code: errData?.error_code || 'AI_ERROR',
        details: errData,
      };
    }

    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        if (data.quota) {
          syncQuotaAcrossApp(data.quota);
          return {
            content:
              typeof data.result === 'string'
                ? data.result
                : data.result?.content || data.result?.response || data.result?.text || data.result,
            quota: data.quota,
            result: data.result,
            ...(typeof data.result === 'object' && data.result !== null ? data.result : {}),
          };
        }
        return data.result ?? data;
      }
      if (data?.error) {
        return {
          __ai_error: true,
          message: data.error,
          code: data.error_code || 'GEMINI_ERROR',
          details: data,
        };
      }
    }
  } catch (geminiError) {
    console.warn('[invokeAI] Local Google Gemini endpoint error, falling back to Supabase function:', geminiError);
  }

  const maxAttempts = 2;
  const baseBackoffMs = 800;

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(AI_FUNCTION, {
        body: {
          type,
          prompt,
          file_urls: normalizedFileUrls,
          model,
          schema: schema || response_json_schema || null,
          plan: plan || 'free',
        },
      });

      if (error) {
        lastError = error;
        let parsedContext = null;
        try {
          if (error?.context && typeof error.context.json === 'function') {
            parsedContext = await error.context.clone().json().catch(() => null);
          }
        } catch {
          parsedContext = null;
        }

        const errMessage = parsedContext?.error || error?.message || 'AI generation failed.';
        const errCode = parsedContext?.error_code || error?.code || null;

        const isTransient =
          String(errMessage).toLowerCase().includes('edge_function') ||
          String(errMessage).toLowerCase().includes('timeout') ||
          String(errMessage).includes('504') ||
          String(errMessage).includes('502');

        if (isTransient && attempt < maxAttempts) {
          await new Promise((res) => setTimeout(res, baseBackoffMs * Math.pow(2, attempt - 1)));
          continue;
        }

        return {
          __ai_error: true,
          message: errMessage,
          code: errCode,
          details: parsedContext || error,
        };
      }

      if (data?.success === false) {
        return {
          __ai_error: true,
          message: data.error || 'AI generation failed.',
          code: data.error_code || null,
          status: data.status || null,
          details: data,
        };
      }

      const result = data?.result ?? data;
      if (result == null) {
        return {
          __ai_error: true,
          message: 'AI generation returned no result.',
          details: data,
        };
      }

      return result;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '').toLowerCase();
      const isTransient = msg.includes('openrouter') || msg.includes('edge_function') || msg.includes('timeout') || msg.includes('502') || msg.includes('504');

      if (isTransient && attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, baseBackoffMs * Math.pow(2, attempt - 1)));
        continue;
      }

      return {
        __ai_error: true,
        message: err?.message || 'AI generation failed unexpectedly.',
        details: err,
      };
    }
  }

  return {
    __ai_error: true,
    message: lastError?.message || 'AI generation failed after retries.',
    details: lastError,
  };
}

/*
 * ------------------------------------------------------------
 * EMAIL
 * ------------------------------------------------------------
 */

async function sendEmail({ name, email, message } = {}) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';

  if (!cleanName) throw new Error('Your name is required.');
  if (!cleanEmail) throw new Error('Your email address is required.');
  if (!cleanMessage) throw new Error('Your message is required.');

  // Validate or identify authenticated user
  let user = null;
  try {
    user = await requireUser();
  } catch (authErr) {
    console.warn('[supabaseApi.email.send] Session lookup note:', authErr?.message || authErr);
  }

  // Persist to contact_messages in Supabase if authenticated
  if (user?.id) {
    try {
      await supabase.from('contact_messages').insert({
        user_id: user.id,
        name: cleanName,
        email: cleanEmail,
        message: cleanMessage,
      });
    } catch (dbErr) {
      console.warn('[supabaseApi.email.send] contact_messages table insert note:', dbErr?.message || dbErr);
    }
  }

  const subject = `WASHEK Contact Message from ${cleanName}`;
  const bodyText = `Name: ${cleanName}\nEmail: ${cleanEmail}\n\nMessage:\n${cleanMessage}`;

  const payload = {
    name: cleanName,
    email: cleanEmail,
    message: cleanMessage,
    subject,
    body: bodyText,
    to: 'washekfitness@gmail.com',
    reply_to: cleanEmail,
  };

  let responseData = null;
  let lastError = null;

  const isConfirmedDelivery = (resObj) =>
    Boolean(resObj && resObj.success === true && (resObj.id || resObj.delivered === true));

  // 1. Invoke Supabase Edge Function via client SDK
  try {
    const { data, error } = await supabase.functions.invoke(EMAIL_FUNCTION, {
      body: payload,
    });

    if (error) {
      throw error;
    }

    if (data?.success === false) {
      throw new Error(data.error || 'Contact email could not be sent.');
    }

    if (isConfirmedDelivery(data)) {
      responseData = data;
    } else {
      throw new Error('Contact email provider did not confirm delivery.');
    }
  } catch (edgeErr) {
    lastError = edgeErr;
    console.warn('[supabaseApi.email.send] Edge SDK invoke failed, trying server & anon edge relay:', edgeErr?.message || edgeErr);

    // 2. Try backend /api/send-contact-email (handles direct Resend + clean Supabase relay)
    try {
      const serverRes = await fetch('/api/send-contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const serverData = await serverRes.json().catch(() => ({}));
      if (serverRes.ok && isConfirmedDelivery(serverData)) {
        responseData = serverData;
        lastError = null;
      } else {
        lastError = new Error(serverData?.error || lastError?.message || 'Unable to send contact email.');
      }
    } catch (fallbackErr) {
      lastError = fallbackErr;
      console.warn('[supabaseApi.email.send] Server fallback error:', fallbackErr?.message || fallbackErr);
    }

    // 3. Direct anon-key call to Supabase Edge Function if server route was unreachable
    if (!responseData && supabaseUrl && supabaseAnonKey) {
      try {
        const directRes = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${EMAIL_FUNCTION}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify(payload),
        });
        const directData = await directRes.json().catch(() => ({}));
        if (directRes.ok && isConfirmedDelivery(directData)) {
          responseData = directData;
          lastError = null;
        } else if (directData?.error) {
          lastError = new Error(directData.error);
        }
      } catch (directErr) {
        lastError = directErr;
      }
    }
  }

  if (!responseData) {
    throw errorFrom(lastError, 'Unable to send message right now. Please email washekfitness@gmail.com directly.');
  }

  return responseData;
}

/*
 * ------------------------------------------------------------
 * EXPORTED API
 * ------------------------------------------------------------
 */

export const supabaseApi = {
  auth: {
    me: currentUser,
    updateMe: async (patch) => {
      const user = await requireUser();
      const safePatch = { ...patch };
      delete safePatch.id;
      delete safePatch.user_id;
      delete safePatch.subscription_plan;
      delete safePatch.subscription_status;
      delete safePatch.stripe_customer_id;
      delete safePatch.stripe_subscription_id;
      delete safePatch.stripe_price_id;
      delete safePatch.subscription_cancelled_at;
      delete safePatch.subscription_updated_at;

      const { data, error } = await supabase.from('profiles').update(safePatch).eq('id', user.id).select().single();
      if (error) throw errorFrom(error, 'Unable to update your profile.');
      if (!data) throw new Error('Your profile could not be found.');
      const updatedUser = normalizeUser(user, data);
      if (updatedUser.onboarded) {
        markUserOnboarded(user.id, user.email);
      }
      lastMeResult = updatedUser;
      lastMeFetchedAt = Date.now();
      try {
        localStorage.setItem('washek_user', JSON.stringify(updatedUser));
      } catch {
        // ignore storage error
      }
      return updatedUser;
    },
    logout: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw errorFrom(error, 'Unable to sign out.');
    },
    redirectToLogin: () => {
      window.location.assign('/login');
    },
  },

  entities: {
    WorkoutProgram: entity('workout_programs'),
    WorkoutLog: entity('workout_logs'),
    NutritionEntry: entity('nutrition_entries'),
    SavedMeal: {
      ...entity('saved_meals'),

      async list(sort = '-created_at', limit = 200) {
        // 1. Get cached meals immediately (0ms)
        const local = getCachedSavedMeals();
        let remote = [];

        // 2. Fetch from Firestore if available
        try {
          const fsRecords = await fetchFromFirestore('saved_meals');
          if (Array.isArray(fsRecords) && fsRecords.length > 0) {
            remote = fsRecords;
          }
        } catch (fsErr) {
          console.debug('[SavedMeal.list] Firestore fetch note:', fsErr);
        }

        // 3. Fetch from Supabase if available
        try {
          const { data, error } = await supabase.from('saved_meals').select('*').limit(limit);
          if (!error && Array.isArray(data) && data.length > 0) {
            remote = [...remote, ...data];
          }
        } catch (_sbErr) {
          // Ignore
        }

        const deletedIds = getDeletedSavedMealIds();
        const map = new Map();

        // Add local first
        local.forEach((m) => {
          if (m?.id && !deletedIds.has(String(m.id))) {
            map.set(String(m.id), m);
          }
        });

        // Add remote records
        remote.forEach((m) => {
          if (m?.id && !deletedIds.has(String(m.id))) {
            const idStr = String(m.id);
            const existing = map.get(idStr);
            map.set(idStr, { ...(existing || {}), ...m });
          }
        });

        const merged = Array.from(map.values()).sort((a, b) => {
          const tA = a.created_at || a.date || '';
          const tB = b.created_at || b.date || '';
          return String(tB).localeCompare(String(tA));
        });

        if (merged.length > 0) {
          setCachedSavedMeals(merged);
        }

        return merged.slice(0, limit);
      },

      async filter(_filters = {}, sort = '-created_at', limit = 200) {
        // Saved meals belong to the user's permanent meal library on their account.
        // Never filter out meals based on arbitrary created_by variations ('athlete' vs email vs uid).
        return this.list(sort, limit);
      },

      async create(payload = {}) {
        const generatedId = payload.id || `meal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const nowIso = new Date().toISOString();

        const row = {
          ...payload,
          id: generatedId,
          name: payload.name || payload.food_name || 'My Saved Meal',
          food_name: payload.name || payload.food_name || 'My Saved Meal',
          meal_type: payload.meal_type || 'snack',
          serving_size: payload.serving_size || '1 serving',
          calories: Number(payload.calories) || 0,
          protein_g: Number(payload.protein_g) || 0,
          carbs_g: Number(payload.carbs_g) || 0,
          fat_g: Number(payload.fat_g) || 0,
          items: Array.isArray(payload.items) ? payload.items : [],
          created_at: payload.created_at || nowIso,
          updated_at: nowIso,
        };

        // 1. Immediately cache locally so user sees it in 0ms
        const currentMeals = getCachedSavedMeals();
        const updatedMeals = [row, ...currentMeals.filter((m) => String(m.id) !== String(row.id))];
        setCachedSavedMeals(updatedMeals);

        // 2. Sync to Firestore in background
        syncToFirestore('saved_meals', row, 'set').catch((e) => console.debug('[SavedMeal.create] FS sync note:', e));

        // 3. Sync to Supabase in background
        try {
          const clean = sanitizeForSupabase('saved_meals', row);
          await supabase.from('saved_meals').insert(clean);
        } catch (_err) {
          // Ignore
        }

        return row;
      },

      async update(id, patch = {}) {
        if (!id) throw new Error('Meal ID required for update');
        const nowIso = new Date().toISOString();

        const currentMeals = getCachedSavedMeals();
        const existing = currentMeals.find((m) => String(m.id) === String(id)) || {};

        const updatedRow = {
          ...existing,
          ...patch,
          id,
          name: patch.name || patch.food_name || existing.name || 'Saved Meal',
          food_name: patch.name || patch.food_name || existing.food_name || existing.name || 'Saved Meal',
          calories: patch.calories !== undefined ? Number(patch.calories) : existing.calories,
          protein_g: patch.protein_g !== undefined ? Number(patch.protein_g) : existing.protein_g,
          carbs_g: patch.carbs_g !== undefined ? Number(patch.carbs_g) : existing.carbs_g,
          fat_g: patch.fat_g !== undefined ? Number(patch.fat_g) : existing.fat_g,
          updated_at: nowIso,
        };

        // 1. Update local cache immediately
        const nextMeals = currentMeals.map((m) => (String(m.id) === String(id) ? updatedRow : m));
        if (!nextMeals.some((m) => String(m.id) === String(id))) {
          nextMeals.unshift(updatedRow);
        }
        setCachedSavedMeals(nextMeals);

        // 2. Sync to Firestore
        syncToFirestore('saved_meals', updatedRow, 'set').catch((e) => console.debug('[SavedMeal.update] FS sync note:', e));

        // 3. Sync to Supabase
        try {
          const clean = sanitizeForSupabase('saved_meals', updatedRow);
          await supabase.from('saved_meals').update(clean).eq('id', id);
        } catch (_err) {
          // Ignore
        }

        return updatedRow;
      },

      async delete(id) {
        if (!id) return true;

        // 1. Mark deliberately deleted and remove from local storage
        removeCachedSavedMeal(id);

        // 2. Delete from Firestore
        syncToFirestore('saved_meals', { id }, 'delete').catch((e) => console.debug('[SavedMeal.delete] FS sync note:', e));

        // 3. Delete from Supabase
        try {
          await supabase.from('saved_meals').delete().eq('id', id);
        } catch (_err) {
          // Ignore
        }

        return true;
      },
    },
    ProgressPhoto: entity('progress_photos'),
    MovementBaseline: entity('movement_baselines'),
    FormAnalysis: entity('form_analyses'),
    WeightHistory: entity('weight_history'),
    KaelMessage: {
      ...entity('kael_messages'),

      async create(payload = {}) {
        let validUserId = null;
        try {
          const user = await requireUser();
          validUserId = ensureValidUuid(user.id);
        } catch (_userErr) {
          // Guest or non-logged-in session
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const hashSeedToUuid = (seed) => {
          const str = String(seed || '');
          const hashes = [0x811c9dc5, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d];
          for (let h = 0; h < 4; h++) {
            let hash = hashes[h];
            for (let i = 0; i < str.length; i++) {
              hash ^= str.charCodeAt(i) + h * 31;
              hash = Math.imul(hash, 0x01000193);
            }
            hashes[h] = hash >>> 0;
          }
          const hex = hashes.map((n) => n.toString(16).padStart(8, '0')).join('');
          const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
          return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
        };
        const generatedId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              });

        const safeId =
          typeof payload.id === 'string' && uuidRegex.test(payload.id.trim())
            ? payload.id.trim().toLowerCase()
            : payload.id
              ? hashSeedToUuid(payload.id)
              : generatedId;

        const row = {
          ...payload,
          id: safeId,
          user_id: validUserId,
          created_at: payload.created_at || new Date().toISOString(),
        };

        // Cache message locally across user-specific and universal keys so history is never lost
        const targetKeys = new Set([
          `washek_kael_messages_${validUserId || 'guest'}`,
          'washek_kael_messages_all',
          'washek_kael_messages_guest',
        ]);
        if (validUserId) {
          targetKeys.add(`washek_kael_messages_${validUserId}`);
        }

        targetKeys.forEach((storageKey) => {
          try {
            const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const idx = existing.findIndex((m) => m?.id === row.id);
            if (idx >= 0) {
              existing[idx] = { ...existing[idx], ...row };
            } else {
              existing.push(row);
            }
            localStorage.setItem(storageKey, JSON.stringify(existing.slice(-1000)));
          } catch (_storageErr) {
            // Ignore localStorage cache errors
          }
        });

        // Sync to Firestore in background
        syncToFirestore('kael_messages', row, 'set').catch(() => {});

        // Attempt Supabase upsert if a valid Supabase auth session exists
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const authUid = ensureValidUuid(sessionData?.session?.user?.id) || validUserId;
          if (sessionData?.session?.user && authUid) {
            const dbRow = sanitizeForSupabase('kael_messages', {
              ...row,
              user_id: authUid,
            });
            const { data, error } = await supabase
              .from('kael_messages')
              .upsert(dbRow, { onConflict: 'id' })
              .select()
              .maybeSingle();

            if (!error && data) {
              return { ...data, _synced: true };
            }
          }
        } catch (_dbErr) {
          // If RLS policy or network blocks insert, locally cached row is returned
        }

        return { ...row, _synced: false };
      },

      async filter(filters = {}, sort = 'created_at', limit = 1000) {
        let dbMessages = [];
        let validUserId = null;

        try {
          const user = await requireUser();
          validUserId = ensureValidUuid(user.id);
          const { data: sessionData } = await supabase.auth.getSession();
          const authUid = ensureValidUuid(sessionData?.session?.user?.id) || validUserId;
          if (sessionData?.session?.user && authUid) {
            const rawColumn = sort.replace(/^-/, '');
            const column = ORDER_ALIASES[rawColumn] || rawColumn;
            const ascending = !sort.startsWith('-');

            let q = applyFilters(supabase.from('kael_messages').select('*'), filters, authUid).order(column, { ascending });
            if (Number.isFinite(limit)) q = q.limit(limit);

            const { data, error } = await q;
            if (!error && Array.isArray(data)) {
              dbMessages = data.map((m) => ({ ...m, _synced: true }));
            }
          }
        } catch (_err) {
          // Ignore remote query errors and fallback to local cache
        }

        // Fetch from Firestore
        let firestoreMessages = [];
        try {
          firestoreMessages = await fetchFromFirestore('kael_messages');
        } catch (_fsErr) {
          // Ignore Firestore fetch errors
        }

        // Read all local messages across all relevant localStorage keys
        const localMessages = [];
        const seenLocalIds = new Set();
        try {
          const keysToScan = new Set([
            `washek_kael_messages_${validUserId || 'guest'}`,
            'washek_kael_messages_all',
            'washek_kael_messages_guest',
            'washek_kael_messages_athlete',
          ]);

          if (typeof localStorage !== 'undefined') {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('washek_kael_messages_')) {
                keysToScan.add(k);
              }
            }
          }

          keysToScan.forEach((storageKey) => {
            try {
              const raw = localStorage.getItem(storageKey);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  parsed.forEach((m) => {
                    if (m?.id && !seenLocalIds.has(m.id)) {
                      seenLocalIds.add(m.id);
                      localMessages.push(m);
                    }
                  });
                }
              }
            } catch (_e) {
              // Ignore parse errors
            }
          });
        } catch (_storageErr) {
          // Ignore localStorage read errors
        }

        const map = new Map();
        localMessages.forEach((m) => {
          if (m?.id) map.set(m.id, { ...m, _synced: Boolean(m._synced) });
        });
        firestoreMessages.forEach((m) => {
          if (m?.id) map.set(m.id, { ...(map.get(m.id) || {}), ...m });
        });
        dbMessages.forEach((m) => {
          if (m?.id) map.set(m.id, { ...(map.get(m.id) || {}), ...m, _synced: true });
        });

        let merged = Array.from(map.values());

        // Apply filters if any
        if (filters && Object.keys(filters).length > 0) {
          merged = merged.filter((item) => {
            for (const [key, value] of Object.entries(filters)) {
              if (value === undefined || value === null) continue;
              if (item[key] !== value) return false;
            }
            return true;
          });
        }

        merged.sort((a, b) => {
          const tA = new Date(a.created_at || a.created_date || 0).getTime();
          const tB = new Date(b.created_at || b.created_date || 0).getTime();
          return tA - tB;
        });

        return merged.slice(0, limit);
      },

      async deleteChat(chatId) {
        if (!chatId || typeof chatId !== 'string') return true;
        let validUserId = null;
        try {
          const user = await requireUser();
          validUserId = ensureValidUuid(user.id);
        } catch (_userErr) {
          // Guest session
        }

        // Clean all localStorage keys containing messages
        try {
          const keysToClean = new Set([
            `washek_kael_messages_${validUserId || 'guest'}`,
            'washek_kael_messages_all',
            'washek_kael_messages_guest',
            'washek_kael_messages_athlete',
          ]);
          if (typeof localStorage !== 'undefined') {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith('washek_kael_messages_')) {
                keysToClean.add(k);
              }
            }
          }

          keysToClean.forEach((storageKey) => {
            try {
              const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
              const filtered = existing.filter((m) => {
                const mChat = m.created_by || 'chat_initial';
                return chatId === 'chat_initial' ? (mChat !== 'chat_initial' && mChat !== null) : mChat !== chatId;
              });
              localStorage.setItem(storageKey, JSON.stringify(filtered));
            } catch (_err) {
              // Ignore
            }
          });
        } catch (_err) {
          // Ignore localStorage delete errors
        }

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const authUid = ensureValidUuid(sessionData?.session?.user?.id) || validUserId;
          if (sessionData?.session?.user && authUid) {
            if (chatId === 'chat_initial') {
              await supabase
                .from('kael_messages')
                .delete()
                .eq('user_id', authUid)
                .or('created_by.eq.chat_initial,created_by.is.null');
            } else {
              await supabase
                .from('kael_messages')
                .delete()
                .eq('user_id', authUid)
                .eq('created_by', chatId);
            }
          }
        } catch (_dbErr) {
          // Ignore remote delete errors
        }

        return true;
      },

      async deleteDuplicateIds(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) return true;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const authUid = ensureValidUuid(sessionData?.session?.user?.id);
          if (sessionData?.session?.user && authUid) {
            await supabase
              .from('kael_messages')
              .delete()
              .eq('user_id', authUid)
              .in('id', ids.slice(0, 100));
          }
        } catch (_dbErr) {
          // Ignore duplicate prune error
        }
        return true;
      },
    },
  },

  storage: {
    uploadFile,
    deleteFile,
    createSignedUrl,
    createSignedUrls,
    resolveMediaUrl,
    getStoragePath,
  },

  ai: {
    invoke: invokeAI,
    stream: streamAI,
  },

  email: {
    send: sendEmail,
  },
};

export {
  requireUser,
  currentUser,
};
