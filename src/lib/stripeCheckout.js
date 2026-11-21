import {
  supabase,
  readNativeSupabaseStorageSession,
  refreshSupabaseSessionLocked,
  syncClientSessionSafely,
} from '@/lib/supabase';
import {
  STRIPE_DEFAULT_PRICES,
  STRIPE_PAYMENT_LINKS,
  getTierByKey,
  getTierKey,
} from '@/lib/stripeTiers';
import { setRedirectUpgradeReceipt, normalizePlan, isActiveSubscriptionStatus } from '@/lib/subscription';

function makeAuthExpiredError(message = 'Your login session has expired. Please sign in again to upgrade.') {
  const err = new Error(message);
  err.code = 'AUTH_SESSION_EXPIRED';
  return err;
}

export function isNonJwtToken(token) {
  return !token || token.startsWith('vault_tok_') || token.startsWith('washek_sess_') || token.split('.').length !== 3;
}

function parseJwtExpMs(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return 0;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const payload = JSON.parse(json);
    return Number(payload?.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

export function getStoredUserObject() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem('washek_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredUserEmail() {
  const parsed = getStoredUserObject();
  return parsed?.email ? String(parsed.email).trim().toLowerCase() : '';
}

export function buildDirectStripeCheckoutUrl(planKey, { userId = '', email = '' } = {}) {
  const cleanPlanKey = getTierKey(planKey);
  const base = STRIPE_PAYMENT_LINKS[cleanPlanKey];
  if (!base) return '';
  try {
    const url = new URL(base);
    if (userId) {
      url.searchParams.set('client_reference_id', String(userId).trim());
    }
    if (email) {
      url.searchParams.set('prefilled_email', String(email).trim().toLowerCase());
    }
    return url.toString();
  } catch {
    return base;
  }
}

export function applyRecoveredSessionToStorage(session, profileData = null, serverSessionToken = '') {
  if (!session?.access_token) return;
  try {
    localStorage.setItem('washek_auth_token', session.access_token);
    if (session.refresh_token) {
      localStorage.setItem('washek_refresh_token', session.refresh_token);
    }
    if (serverSessionToken) {
      localStorage.setItem('washek_srv_session', serverSessionToken);
    }
    const rawUser = localStorage.getItem('washek_user');
    const prevUser = rawUser ? JSON.parse(rawUser) : {};
    if (session.user?.id || profileData?.id) {
      const mergedUser = {
        ...prevUser,
        ...(profileData || {}),
        id: session.user?.id || profileData?.id || prevUser?.id,
        email: session.user?.email || profileData?.email || prevUser?.email || '',
        onboarded: prevUser?.onboarded ?? profileData?.onboarded ?? true,
      };
      localStorage.setItem('washek_user', JSON.stringify(mergedUser));
    }
    window.dispatchEvent(
      new CustomEvent('washek_session_recovered', {
        detail: { session, profile: profileData },
      })
    );
  } catch {
    // ignore storage write errors
  }
}

async function getSessionTokenUser(token) {
  if (isNonJwtToken(token)) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    return !error && data?.user?.id ? data.user : null;
  } catch {
    return null;
  }
}

async function tryServerSessionRecovery(storedAccess = '', storedRefresh = '') {
  const email = getStoredUserEmail();
  const srvToken = (() => {
    try {
      return localStorage.getItem('washek_srv_session') || '';
    } catch {
      return '';
    }
  })();

  if (!email && !storedAccess && !storedRefresh && !srvToken) {
    return { session: null, syncNeeded: false };
  }

  try {
    const res = await fetch('/api/auth/refresh-supabase-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(storedAccess ? { Authorization: `Bearer ${storedAccess}` } : {}),
        ...(srvToken ? { 'x-washek-server-session': srvToken } : {}),
      },
      body: JSON.stringify({
        email: email || undefined,
        refreshToken: storedRefresh || undefined,
      }),
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data?.session?.access_token) {
      await syncClientSessionSafely(data.session);
      applyRecoveredSessionToStorage(data.session, data.profile || null, data.serverSessionToken || '');
      return { session: data.session, syncNeeded: false };
    }

    if (res.status === 409 || data?.code === 'VAULT_SUPABASE_SYNC_NEEDED') {
      return { session: null, syncNeeded: true };
    }
  } catch {
    // ignore network failure
  }

  return { session: null, syncNeeded: Boolean(email) };
}

export async function resolveValidSupabaseSession(forceRefresh = false) {
  let session = null;
  const nativeSession = readNativeSupabaseStorageSession();

  const storedAccess = (() => {
    try {
      const direct = localStorage.getItem('washek_auth_token') || '';
      if (!isNonJwtToken(direct)) return direct;
      if (nativeSession?.access_token && !isNonJwtToken(nativeSession.access_token)) {
        return nativeSession.access_token;
      }
      return direct;
    } catch {
      return '';
    }
  })();

  const storedRefresh = (() => {
    try {
      const direct = localStorage.getItem('washek_refresh_token') || '';
      if (direct) return direct;
      if (nativeSession?.refresh_token) return nativeSession.refresh_token;
      return '';
    } catch {
      return '';
    }
  })();

  if (!forceRefresh) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData?.session || null;
    } catch {
      session = null;
    }

    if (!session?.access_token && !isNonJwtToken(storedAccess) && storedRefresh) {
      session = await syncClientSessionSafely({
        access_token: storedAccess,
        refresh_token: storedRefresh,
      });
    }
  }

  const refreshToken = session?.refresh_token || storedRefresh || '';
  const expiresAtMs =
    (Number(session?.expires_at || 0) * 1000) ||
    parseJwtExpMs(session?.access_token || storedAccess);
  const nearExpiry = !expiresAtMs || expiresAtMs < Date.now() + 60_000;

  if (forceRefresh || !session?.access_token || isNonJwtToken(session.access_token) || nearExpiry) {
    const refreshed = await refreshSupabaseSessionLocked(refreshToken);
    if (refreshed?.access_token) {
      session = refreshed;
    }
  }

  if ((!session?.access_token || isNonJwtToken(session.access_token)) && !isNonJwtToken(storedAccess)) {
    const tokenUser = await getSessionTokenUser(storedAccess);
    if (tokenUser) {
      session = {
        access_token: storedAccess,
        refresh_token: storedRefresh || undefined,
        user: tokenUser,
      };
    }
  }

  if (!session?.access_token || isNonJwtToken(session.access_token)) {
    const serverRecovery = await tryServerSessionRecovery(storedAccess, storedRefresh);
    if (serverRecovery.session?.access_token) {
      session = serverRecovery.session;
    } else {
      throw makeAuthExpiredError();
    }
  }

  if (
    !forceRefresh &&
    session?.access_token &&
    !isNonJwtToken(session.access_token) &&
    !nearExpiry &&
    session?.user?.id
  ) {
    try {
      localStorage.setItem('washek_auth_token', session.access_token);
      if (session.refresh_token) {
        localStorage.setItem('washek_refresh_token', session.refresh_token);
      }
    } catch {
      // ignore storage write errors
    }
    return session;
  }

  let verifiedUser = await getSessionTokenUser(session.access_token);
  if (!verifiedUser && refreshToken) {
    const refreshed = await refreshSupabaseSessionLocked(refreshToken);
    if (refreshed?.access_token) {
      session = refreshed;
      verifiedUser = await getSessionTokenUser(session.access_token);
    }
  }

  if (!verifiedUser) {
    const serverRecovery = await tryServerSessionRecovery(session.access_token, refreshToken);
    if (serverRecovery.session?.access_token) {
      session = serverRecovery.session;
      verifiedUser = await getSessionTokenUser(session.access_token);
    }
  }

  if (!verifiedUser || !session?.access_token) {
    throw makeAuthExpiredError();
  }

  if (!session.user) {
    session = { ...session, user: verifiedUser };
  }

  applyRecoveredSessionToStorage(session);
  return session;
}

export async function extractInvokeErrorMessage(error) {
  let detailedMessage = error?.message || 'Unable to contact the billing service.';
  try {
    if (error?.context && typeof error.context.json === 'function') {
      const errBody = await error.context.json();
      if (errBody?.error) {
        detailedMessage = errBody.error;
      } else if (errBody?.message) {
        detailedMessage = errBody.message;
      }
    } else if (error?.context && typeof error.context.text === 'function') {
      const rawText = await error.context.text();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed?.error || parsed?.message) {
            detailedMessage = parsed.error || parsed.message;
          }
        } catch {
          detailedMessage = rawText;
        }
      }
    }
  } catch {
    // ignore context parse failure
  }
  return detailedMessage;
}

export async function fetchStripeTierPrices() {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), 5000) : null;
    const res = await fetch('/api/stripe/prices', {
      method: 'GET',
      credentials: 'include',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (timeoutId) window.clearTimeout(timeoutId);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data?.pricesByTier) {
      return {
        pricesByTier: {
          ...STRIPE_DEFAULT_PRICES,
          ...data.pricesByTier,
        },
        currencyCode: data.currencyCode || 'USD',
      };
    }
  } catch {
    // Fall back gracefully to canonical Stripe catalog USD prices
  }

  return {
    pricesByTier: { ...STRIPE_DEFAULT_PRICES },
    currencyCode: 'USD',
  };
}

function looksLikeAuthFailure(msg) {
  return /(^|\b)(401|unauthorized|jwt|missing authorization|invalid claim|invalid token|not authenticated|signed in)(\b|$)/i.test(
    String(msg || '')
  );
}

function navigateToStripeUrl(checkoutUrl) {
  try {
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      try {
        window.top.location.href = checkoutUrl;
        return;
      } catch {
        // Cross-origin iframe: try _top anchor before same-window assign
        try {
          const a = document.createElement('a');
          a.href = checkoutUrl;
          a.target = '_top';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        } catch {
          // fall through
        }
      }
    }
  } catch {
    // fall through
  }

  window.location.assign(checkoutUrl);
}

/**
 * Starts Stripe Checkout in the same browser tab for any signed-in user.
 * Never prompts for re-verification or extra sign-in when the athlete is already logged in.
 */
export async function startStripeCheckout({
  planKey,
  email = '',
  userId = '',
}) {
  const cleanPlanKey = getTierKey(planKey);
  const tier = getTierByKey(cleanPlanKey);
  if (!tier) {
    throw new Error('Invalid subscription tier.');
  }

  const storedUser = getStoredUserObject();
  const resolvedEmail = String(email || storedUser?.email || '').trim().toLowerCase();
  const resolvedUserId = String(userId || storedUser?.id || storedUser?.uid || '').trim();
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Silently try to obtain/refresh a live Supabase JWT without failing if the user uses a local/vault/expired session
  let session = null;
  try {
    session = await resolveValidSupabaseSession(false);
  } catch {
    session = null;
  }

  const effectiveEmail = resolvedEmail || String(session?.user?.email || '').trim().toLowerCase();
  const effectiveUserId = resolvedUserId || String(session?.user?.id || '').trim();
  const hasSignedInIdentity = Boolean(effectiveEmail || effectiveUserId || session?.access_token);

  if (!hasSignedInIdentity) {
    throw makeAuthExpiredError();
  }

  let data = null;
  let error = null;
  let detailedMessage = '';

  const invokeCheckoutEdge = (activeSession) =>
    supabase.functions.invoke('create-checkout-session', {
      body: {
        plan: cleanPlanKey,
        ...(appUrl ? { app_url: appUrl } : {}),
      },
      headers: {
        Authorization: `Bearer ${activeSession.access_token}`,
      },
    });

  // 1. Primary path: Supabase Edge Function when a valid non-vault JWT exists
  if (session?.access_token && !isNonJwtToken(session.access_token)) {
    ({ data, error } = await invokeCheckoutEdge(session));
    detailedMessage = error ? await extractInvokeErrorMessage(error) : '';

    if (
      (error && (looksLikeAuthFailure(error.message) || looksLikeAuthFailure(detailedMessage))) ||
      (data?.success === false && looksLikeAuthFailure(data?.error))
    ) {
      let refreshedSession = null;
      try {
        refreshedSession = await resolveValidSupabaseSession(true);
      } catch {
        refreshedSession = null;
      }

      if (refreshedSession?.access_token && !isNonJwtToken(refreshedSession.access_token)) {
        session = refreshedSession;
        ({ data, error } = await invokeCheckoutEdge(session));
        detailedMessage = error ? await extractInvokeErrorMessage(error) : '';
      }
    }
  }

  // 2. Fallback to Express backend route (accepts JWT, server session cookie/header, OR signed-in user identity)
  if (!data?.url && data?.action !== 'already_active') {
    try {
      const srvTok = (() => {
        try {
          return localStorage.getItem('washek_srv_session') || '';
        } catch {
          return '';
        }
      })();
      const storedAccess = (() => {
        try {
          return localStorage.getItem('washek_auth_token') || '';
        } catch {
          return '';
        }
      })();
      const refreshTok = session?.refresh_token || (() => {
        try {
          return localStorage.getItem('washek_refresh_token') || '';
        } catch {
          return '';
        }
      })();
      const bearerToken = session?.access_token || storedAccess;

      const proxyRes = await fetch('/api/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
        },
        body: JSON.stringify({
          plan: cleanPlanKey,
          app_url: appUrl || undefined,
          email: effectiveEmail || undefined,
          userId: effectiveUserId || undefined,
          refreshToken: refreshTok || undefined,
        }),
      });
      const proxyData = await proxyRes.json().catch(() => null);
      if (proxyRes.ok && proxyData?.success && (proxyData?.url || proxyData?.action === 'already_active')) {
        data = proxyData;
        error = null;
        detailedMessage = '';
      } else if (proxyData?.error && !detailedMessage) {
        detailedMessage = proxyData.error;
      }
    } catch {
      // keep fallback chain open
    }
  }

  if (data?.action === 'already_active') {
    return {
      action: 'already_active',
      plan: cleanPlanKey,
    };
  }

  // 3. Guaranteed direct Stripe Checkout Payment Link fallback for signed-in users
  if (!data?.url) {
    const directUrl = buildDirectStripeCheckoutUrl(cleanPlanKey, {
      userId: effectiveUserId,
      email: effectiveEmail,
    });
    if (directUrl) {
      data = {
        success: true,
        action: 'checkout',
        url: directUrl,
        session_id: null,
      };
      error = null;
      detailedMessage = '';
    }
  }

  if (error || data?.success === false) {
    throw new Error(
      detailedMessage ||
        data?.error ||
        error?.message ||
        'Unable to start Stripe Checkout.'
    );
  }

  if (!data?.url) {
    throw new Error('Stripe did not return a checkout URL.');
  }

  const srvTok = (() => {
    try {
      return localStorage.getItem('washek_srv_session') || '';
    } catch {
      return '';
    }
  })();

  try {
    const startedAt = String(Date.now());
    sessionStorage.setItem('washek_pending_checkout_plan', cleanPlanKey);
    sessionStorage.setItem('washek_pending_checkout_started_at', startedAt);
    localStorage.setItem('washek_pending_checkout_plan', cleanPlanKey);
    localStorage.setItem('washek_pending_checkout_started_at', startedAt);
    if (data.session_id) {
      sessionStorage.setItem('washek_pending_checkout_session_id', data.session_id);
      localStorage.setItem('washek_pending_checkout_session_id', data.session_id);
    } else {
      sessionStorage.removeItem('washek_pending_checkout_session_id');
      localStorage.removeItem('washek_pending_checkout_session_id');
    }
    document.cookie = `washek_pending_checkout_plan=${cleanPlanKey}; path=/; max-age=86400; SameSite=Lax`;
  } catch {
    // ignore storage errors
  }

  // Persist pending checkout server-side so cross-partition iframe -> top-level redirects never lose the plan or user identity
  try {
    const hasUsedTrialLocal = Boolean(
      storedUser?.has_used_trial ||
        storedUser?.trial_used ||
        localStorage.getItem('washek_has_used_trial') === 'true'
    );
    const pendingRefreshTok =
      session?.refresh_token ||
      (() => {
        try {
          return localStorage.getItem('washek_refresh_token') || '';
        } catch {
          return '';
        }
      })();
    await Promise.race([
      fetch('/api/checkout/pending', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
        },
        body: JSON.stringify({
          plan: cleanPlanKey,
          userId: effectiveUserId || undefined,
          email: effectiveEmail || undefined,
          sessionId: data.session_id || null,
          trial: !hasUsedTrialLocal,
          serverSessionToken: srvTok || undefined,
          refreshToken: pendingRefreshTok || undefined,
        }),
      }),
      new Promise((resolve) => window.setTimeout(resolve, 900)),
    ]);
  } catch {
    // non-fatal
  }

  navigateToStripeUrl(data.url);

  return {
    action: 'checkout',
    plan: cleanPlanKey,
    url: data.url,
    sessionId: data.session_id || null,
  };
}

/**
 * Reconciles the signed-in user's Stripe Customer & active/trialing Subscription directly with Supabase.
 * Safe against abandoned checkouts: only unlocks when Stripe confirms an active/trialing subscription
 * or a completed paid/no_payment_required Checkout Session on that customer.
 */
export async function syncStripeSubscription({ planKey = '' } = {}) {
  const hintedPlan = planKey ? getTierKey(planKey) : '';
  let session = null;
  try {
    session = await resolveValidSupabaseSession(false);
  } catch {
    session = null;
  }

  const storedUser = getStoredUserObject();
  const effectiveEmail = String(session?.user?.email || storedUser?.email || '').trim().toLowerCase();
  const effectiveUserId = String(session?.user?.id || storedUser?.id || storedUser?.uid || '').trim();

  if (session?.access_token && !isNonJwtToken(session.access_token)) {
    const invokeSync = (activeSession) =>
      supabase.functions.invoke('create-checkout-session', {
        body: {
          action: 'sync_subscription',
          ...(hintedPlan ? { plan: hintedPlan } : {}),
        },
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });

    try {
      let { data, error } = await invokeSync(session);
      const detailedMessage = error ? await extractInvokeErrorMessage(error) : '';

      if (
        (error && (looksLikeAuthFailure(error.message) || looksLikeAuthFailure(detailedMessage))) ||
        (data?.success === false && looksLikeAuthFailure(data?.error))
      ) {
        const refreshed = await resolveValidSupabaseSession(true).catch(() => null);
        if (refreshed?.access_token && !isNonJwtToken(refreshed.access_token)) {
          session = refreshed;
          ({ data, error } = await invokeSync(session));
        }
      }

      if (!error && data?.verified) {
        return {
          verified: true,
          dbSynced: Boolean(data?.db_synced ?? true),
          plan: data.plan,
          status: data.status || 'active',
          customerFound: Boolean(data.customer_found ?? true),
          customerId: data.customer_id || null,
          subscriptionId: data.subscription_id || null,
        };
      }

      if (!error && data && data.verified === false) {
        return {
          verified: false,
          customerFound: Boolean(data.customer_found),
          reason: data.reason || '',
        };
      }
    } catch {
      // fall through to Express fallback
    }
  }

  try {
    const bearerToken = session?.access_token || localStorage.getItem('washek_auth_token') || '';
    const srvTok = localStorage.getItem('washek_srv_session') || '';
    const res = await fetch('/api/stripe/verify-session', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
      },
      body: JSON.stringify({
        plan: hintedPlan || undefined,
        userId: effectiveUserId || undefined,
        email: effectiveEmail || undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.verified) {
      return {
        verified: true,
        dbSynced: Boolean(data?.dbSynced),
        plan: data.plan,
        status: data.status || 'active',
        customerFound: true,
      };
    }
  } catch {
    // ignore fallback error
  }

  return {
    verified: false,
    dbSynced: false,
    customerFound: false,
    reason: 'Could not confirm an active Stripe subscription or trial yet.',
  };
}

let inFlightEntitlementPromise = null;
let lastEntitlementResult = null;
let lastEntitlementFetchedAt = 0;
const ENTITLEMENT_TTL_MS = 3000;

export function invalidateServerEntitlementCache() {
  lastEntitlementResult = null;
  lastEntitlementFetchedAt = 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('washek_subscription_updated', invalidateServerEntitlementCache);
}

export async function clearPendingCheckoutOnServer(userId = '', email = '') {
  try {
    const storedUser = getStoredUserObject();
    const uid = String(userId || storedUser?.id || storedUser?.uid || '').trim();
    const cleanEmail = String(email || storedUser?.email || '').trim().toLowerCase();
    await fetch('/api/checkout/pending/clear', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid || undefined,
        email: cleanEmail || undefined,
      }),
    });
  } catch {
    // non-fatal cleanup error
  }
}

/**
 * Queries Express server for a confirmed redirect subscription entitlement so
 * Chrome-partitioned iframes stay seamlessly synced with top-level /subscription-return completions.
 */
export async function fetchServerEntitlement({ userId = '', email = '', cancelledAtIso = null } = {}) {
  const storedUser = getStoredUserObject();
  const uid = String(userId || storedUser?.id || storedUser?.uid || '').trim();
  const cleanEmail = String(email || storedUser?.email || '').trim().toLowerCase();
  if (!uid && !cleanEmail) {
    return { active: false, plan: 'free', status: 'inactive' };
  }

  const checkNotSupersededByCancel = (entTimestamp) => {
    const ts = Number(entTimestamp || 0);
    let localCancelMs = 0;
    try {
      const localIso = localStorage.getItem('washek_subscription_cancelled_at');
      if (localIso) localCancelMs = Date.parse(localIso) || 0;
    } catch {
      // ignore
    }
    const dbCancelMs = cancelledAtIso ? Date.parse(String(cancelledAtIso)) || 0 : 0;
    if ((localCancelMs && ts && localCancelMs > ts) || (dbCancelMs && ts && dbCancelMs > ts)) {
      return false;
    }
    return true;
  };

  if (lastEntitlementResult && Date.now() - lastEntitlementFetchedAt < ENTITLEMENT_TTL_MS) {
    if (lastEntitlementResult.active && !checkNotSupersededByCancel(lastEntitlementResult.timestamp)) {
      return { active: false, plan: 'free', status: 'canceled' };
    }
    return lastEntitlementResult;
  }

  if (inFlightEntitlementPromise) {
    return inFlightEntitlementPromise;
  }

  inFlightEntitlementPromise = (async () => {
    try {
      const srvTok = (() => {
        try {
          return localStorage.getItem('washek_srv_session') || '';
        } catch {
          return '';
        }
      })();
      const params = new URLSearchParams();
      if (uid) params.set('userId', uid);
      if (cleanEmail) params.set('email', cleanEmail);
      if (cancelledAtIso) params.set('cancelledAt', String(cancelledAtIso));

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timerId = controller ? window.setTimeout(() => controller.abort(), 1600) : null;
      const res = await fetch(`/api/stripe/entitlement?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
        },
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (timerId) window.clearTimeout(timerId);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.active) {
        const plan = normalizePlan(data.plan);
        const status = String(data.status || 'trialing').toLowerCase().trim();
        const ts = Number(data.timestamp || Date.now());
        if (plan !== 'free' && isActiveSubscriptionStatus(status) && checkNotSupersededByCancel(ts)) {
          setRedirectUpgradeReceipt(plan, status, {
            verifiedBy: data.verifiedBy || 'stripe_redirect',
            timestamp: ts,
          });
          const result = {
            active: true,
            plan,
            status,
            timestamp: ts,
            verifiedBy: data.verifiedBy || 'stripe_redirect',
          };
          lastEntitlementResult = result;
          lastEntitlementFetchedAt = Date.now();
          return result;
        }
      }
      const fallback = { active: false, plan: 'free', status: 'inactive' };
      lastEntitlementResult = fallback;
      lastEntitlementFetchedAt = Date.now();
      return fallback;
    } catch {
      return { active: false, plan: 'free', status: 'inactive' };
    } finally {
      inFlightEntitlementPromise = null;
    }
  })();

  return inFlightEntitlementPromise;
}

