import {
  supabase,
  readNativeSupabaseStorageSession,
  refreshSupabaseSessionLocked,
} from '@/lib/supabase';

const CHECKOUT_FUNCTION = 'create-checkout-session';

export const PLAN_PAYMENT_URLS = {
  progress: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
  performance: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
  elite: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
};

const VALID_PLANS = ['progress', 'performance', 'elite'];

function makeAuthExpiredError(message = 'Your login session has expired. Please sign in again to upgrade.') {
  const err = new Error(message);
  err.code = 'AUTH_SESSION_EXPIRED';
  return err;
}

function makeBillingSyncRequiredError(message = 'Verify your account password to connect Stripe Checkout.') {
  const err = new Error(message);
  err.code = 'BILLING_SYNC_REQUIRED';
  return err;
}

function isNonJwtToken(token) {
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

export function getStoredUserEmail() {
  try {
    const raw = localStorage.getItem('washek_user');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.email ? String(parsed.email).trim().toLowerCase() : '';
  } catch {
    return '';
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
      try {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      } catch {
        // ignore setSession error
      }
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
      try {
        const { data: recovered } = await supabase.auth.setSession({
          access_token: storedAccess,
          refresh_token: storedRefresh,
        });
        session = recovered?.session || null;
      } catch {
        // ignore recovery failure
      }
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
    } else if (serverRecovery.syncNeeded || getStoredUserEmail()) {
      throw makeBillingSyncRequiredError();
    } else {
      throw makeAuthExpiredError();
    }
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
    if (getStoredUserEmail()) {
      throw makeBillingSyncRequiredError();
    }
    throw makeAuthExpiredError();
  }

  if (!session.user) {
    session = { ...session, user: verifiedUser };
  }

  applyRecoveredSessionToStorage(session);
  return session;
}

export function buildPaymentLinkUrl(plan, { userId = '', email = '' } = {}) {
  const base = PLAN_PAYMENT_URLS[plan];
  if (!base) return null;
  try {
    const url = new URL(base);
    if (userId) url.searchParams.set('client_reference_id', String(userId).trim());
    else if (email) url.searchParams.set('client_reference_id', String(email).trim().toLowerCase());
    if (email) url.searchParams.set('prefilled_email', String(email).trim().toLowerCase());
    return url.toString();
  } catch {
    return base;
  }
}

export async function extractInvokeErrorMessage(error) {
  let detailedMessage = error?.message || 'Unable to contact the Stripe checkout service.';
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

function isAuthErrorText(msg) {
  return /(^|\b)(401|unauthorized|jwt|missing authorization|missing access token|invalid claim|invalid token|not authenticated)(\b|$)/i.test(
    String(msg || '')
  );
}

export async function createStripeCheckout(plan) {
  if (!VALID_PLANS.includes(plan)) {
    throw new Error('Invalid subscription plan.');
  }

  let session = await resolveValidSupabaseSession(false);

  if (session.user?.id) {
    try {
      await supabase
        .from('profiles')
        .upsert(
          {
            id: session.user.id,
            email: session.user.email || undefined,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
    } catch {
      // ignore non-critical profile ensure error
    }
  }

  const appUrl =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://washek.ai.studio';

  const invokeWithSession = (activeSession) =>
    supabase.functions.invoke(CHECKOUT_FUNCTION, {
      body: {
        plan,
        app_url: appUrl,
      },
      headers: {
        Authorization: `Bearer ${activeSession.access_token}`,
      },
    });

  let { data, error } = await invokeWithSession(session);
  let detailedMessage = error ? await extractInvokeErrorMessage(error) : '';

  if (
    (error && (isAuthErrorText(error.message) || isAuthErrorText(detailedMessage))) ||
    (data?.success === false && isAuthErrorText(data?.error))
  ) {
    session = await resolveValidSupabaseSession(true);
    ({ data, error } = await invokeWithSession(session));
    detailedMessage = error ? await extractInvokeErrorMessage(error) : '';
  }

  console.log('[Washek Stripe] create-checkout-session response:', data);

  if (error) {
    console.error('[Washek Stripe] Edge Function invocation error:', detailedMessage, error);
    if (isAuthErrorText(detailedMessage)) {
      throw getStoredUserEmail() ? makeBillingSyncRequiredError() : makeAuthExpiredError();
    }
    throw new Error(detailedMessage);
  }

  if (!data) {
    throw new Error('The Stripe checkout service returned no response.');
  }

  if (data.success === false) {
    if (isAuthErrorText(data.error)) {
      throw getStoredUserEmail() ? makeBillingSyncRequiredError() : makeAuthExpiredError();
    }
    throw new Error(data.error || 'Unable to create Stripe Checkout.');
  }

  if (data.success === true && data.url && typeof data.url === 'string') {
    return {
      success: true,
      action: 'checkout',
      url: data.url,
      session_id: data.session_id || null,
      plan: data.plan || plan,
      price_id: data.price_id || null,
    };
  }

  if (
    data.success === true &&
    (data.action === 'changed' ||
      data.action === 'already_current' ||
      data.action === 'already_active')
  ) {
    return {
      success: true,
      action: data.action,
      plan: data.plan || plan,
      subscription_id: data.subscription_id || null,
      price_id: data.price_id || null,
      message: data.message || null,
    };
  }

  if (typeof data.url === 'string' && data.url.trim()) {
    return {
      success: true,
      action: 'checkout',
      url: data.url,
      session_id: data.session_id || null,
      plan: data.plan || plan,
      price_id: data.price_id || null,
    };
  }

  throw new Error(data.error || 'Stripe did not return a usable Checkout URL.');
}
