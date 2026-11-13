import { supabase } from '@/lib/supabase';

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

function syncTokensToStorage(session) {
  if (!session?.access_token) return;
  try {
    localStorage.setItem('washek_auth_token', session.access_token);
    if (session.refresh_token) {
      localStorage.setItem('washek_refresh_token', session.refresh_token);
    }
  } catch {
    // ignore storage error
  }
}

async function isSessionTokenValid(token) {
  if (isNonJwtToken(token)) return false;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    return Boolean(!error && data?.user?.id);
  } catch {
    return false;
  }
}

export async function resolveValidSupabaseSession(forceRefresh = false) {
  let session = null;

  const storedAccess = (() => {
    try {
      return localStorage.getItem('washek_auth_token') || '';
    } catch {
      return '';
    }
  })();

  const storedRefresh = (() => {
    try {
      return localStorage.getItem('washek_refresh_token') || '';
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

    // Attempt recovery from backup tokens in localStorage if Supabase session is absent
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

  // Refresh when forced, missing, or expiring soon
  if (forceRefresh || !session?.access_token || isNonJwtToken(session.access_token) || nearExpiry) {
    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession(
        refreshToken ? { refresh_token: refreshToken } : undefined
      );
      if (!refreshErr && refreshed?.session?.access_token) {
        session = refreshed.session;
      }
    } catch {
      // ignore refresh failure
    }
  }

  // Fallback: if refresh failed, but we have a non-expired stored JWT, verify and use it
  if ((!session?.access_token || isNonJwtToken(session.access_token)) && !isNonJwtToken(storedAccess)) {
    const storedValid = await isSessionTokenValid(storedAccess);
    if (storedValid) {
      session = {
        access_token: storedAccess,
        refresh_token: storedRefresh || undefined,
      };
    }
  }

  if (!session?.access_token || isNonJwtToken(session.access_token)) {
    throw makeAuthExpiredError();
  }

  let valid = await isSessionTokenValid(session.access_token);
  if (!valid && refreshToken) {
    try {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (!refreshErr && refreshed?.session?.access_token) {
        session = refreshed.session;
        valid = await isSessionTokenValid(session.access_token);
      }
    } catch {
      valid = false;
    }
  }

  if (!valid || !session?.access_token) {
    throw makeAuthExpiredError();
  }

  syncTokensToStorage(session);
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

  // Refresh session and retry once if Edge Function reported any auth failure
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
      throw makeAuthExpiredError();
    }
    throw new Error(detailedMessage);
  }

  if (!data) {
    throw new Error('The Stripe checkout service returned no response.');
  }

  if (data.success === false) {
    if (isAuthErrorText(data.error)) {
      throw makeAuthExpiredError();
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
