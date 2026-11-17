import { initializePaddle } from '@paddle/paddle-js';
import {
  supabase,
  readNativeSupabaseStorageSession,
  refreshSupabaseSessionLocked,
  syncClientSessionSafely,
} from '@/lib/supabase';
import {
  PADDLE_TIERS,
  getTierByKey,
  getTierKey,
  isValidPaddlePriceId,
} from '@/lib/paddleTiers';

let paddleInstancePromise = null;
let cachedPaddleInstance = null;
let cachedServerContext = null;
let activeEventHandler = null;

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

/**
 * Strictly reads Paddle environment & client-side token from Vite env vars (or server runtime context).
 * Never silently defaults to sandbox or production.
 */
export function getPaddleRuntimeConfig(serverContext = null) {
  const rawEnv = String(
    import.meta.env.VITE_PADDLE_ENV || serverContext?.environment || ''
  )
    .trim()
    .toLowerCase();
  if (rawEnv !== 'production' && rawEnv !== 'sandbox') {
    const err = new Error(
      'Missing or invalid VITE_PADDLE_ENV environment variable. Set VITE_PADDLE_ENV=production (or sandbox) explicitly.'
    );
    err.code = 'PADDLE_ENV_MISSING';
    throw err;
  }

  const token = String(
    import.meta.env.VITE_PADDLE_CLIENT_TOKEN || serverContext?.clientToken || ''
  ).trim();
  if (!token) {
    const err = new Error(
      'Missing VITE_PADDLE_CLIENT_TOKEN environment variable. Create a live client-side token (prefixed live_) in Paddle Developer Tools > Authentication.'
    );
    err.code = 'PADDLE_TOKEN_MISSING';
    throw err;
  }

  if (rawEnv === 'production' && !token.startsWith('live_')) {
    const err = new Error(
      'VITE_PADDLE_ENV is set to "production", so VITE_PADDLE_CLIENT_TOKEN must start with "live_".'
    );
    err.code = 'PADDLE_TOKEN_ENV_MISMATCH';
    throw err;
  }

  if (rawEnv === 'sandbox' && !token.startsWith('test_')) {
    const err = new Error(
      'VITE_PADDLE_ENV is set to "sandbox", so VITE_PADDLE_CLIENT_TOKEN must start with "test_".'
    );
    err.code = 'PADDLE_TOKEN_ENV_MISMATCH';
    throw err;
  }

  return {
    environment: rawEnv,
    token,
  };
}

export async function fetchPaddleServerContext(force = false) {
  if (cachedServerContext && !force) {
    return cachedServerContext;
  }
  try {
    const res = await fetch('/api/paddle/context', {
      method: 'GET',
      credentials: 'include',
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      cachedServerContext = data;
      return data;
    }
  } catch {
    // fallback if network failed
  }
  return {
    countryCode: null,
    regionTag: 'OTHERS',
    resolvedPriceIds: {},
    environment: null,
    clientToken: null,
  };
}

export async function getPaddleClient(onEvent, serverContext = null) {
  if (typeof onEvent === 'function') {
    activeEventHandler = onEvent;
  }

  const resolvedCtx = serverContext || (await fetchPaddleServerContext());
  const { environment, token } = getPaddleRuntimeConfig(resolvedCtx);

  if (cachedPaddleInstance) {
    return cachedPaddleInstance;
  }

  if (!paddleInstancePromise) {
    paddleInstancePromise = initializePaddle({
      environment,
      token,
      eventCallback: (event) => {
        if (typeof activeEventHandler === 'function') {
          activeEventHandler(event);
        }
      },
    })
      .then((instance) => {
        if (!instance) {
          paddleInstancePromise = null;
          throw new Error('Paddle.js failed to initialize in this browser.');
        }
        cachedPaddleInstance = instance;
        return instance;
      })
      .catch((err) => {
        paddleInstancePromise = null;
        throw err;
      });
  }

  return paddleInstancePromise;
}

export function resolveTierPriceIds(serverContext = null, interval = 'month') {
  const resolvedMap = {};
  const missingTiers = [];

  for (const tier of PADDLE_TIERS) {
    const key = getTierKey(tier.name);
    const localCandidate = String(tier.priceId?.[interval] || '').trim();
    const serverCandidate = String(serverContext?.resolvedPriceIds?.[key]?.[interval] || '').trim();
    const chosen = isValidPaddlePriceId(localCandidate)
      ? localCandidate
      : isValidPaddlePriceId(serverCandidate)
        ? serverCandidate
        : '';

    if (chosen) {
      resolvedMap[key] = chosen;
    } else {
      missingTiers.push({
        name: tier.name,
        key,
        productId: tier.productId,
      });
    }
  }

  return { resolvedMap, missingTiers };
}

/**
 * Fetches country-localized pricing directly from Paddle.PricePreview().
 * Displays only Paddle's formattedTotals strings (zero frontend price math/rounding).
 * If server header countryCode is absent, omits `address` so Paddle auto-detects from visitor IP.
 */
export async function fetchLocalizedPaddlePrices({ interval = 'month' } = {}) {
  const serverCtx = await fetchPaddleServerContext();
  getPaddleRuntimeConfig(serverCtx);

  const paddle = await getPaddleClient(undefined, serverCtx);

  const { resolvedMap, missingTiers } = resolveTierPriceIds(serverCtx, interval);

  if (missingTiers.length > 0) {
    const summary = missingTiers
      .map((t) => `${t.name} (${t.productId})`)
      .join(', ');
    const err = new Error(
      `Paddle Price IDs (pri_...) are required for PricePreview & Checkout. Found Product IDs (pro_...) without active Price IDs for: ${summary}. Set VITE_PADDLE_PRICE_*_MONTH (or server PADDLE_API_KEY to resolve them automatically).`
    );
    err.code = 'PADDLE_PRICE_ID_REQUIRED';
    err.missingTiers = missingTiers;
    throw err;
  }

  const items = Object.values(resolvedMap).map((priceId) => ({
    priceId,
    quantity: 1,
  }));

  const rawCountry = serverCtx?.countryCode;
  const validCountry =
    typeof rawCountry === 'string' &&
    /^[A-Z]{2}$/.test(rawCountry.trim().toUpperCase()) &&
    rawCountry.trim().toUpperCase() !== 'XX' &&
    rawCountry.trim().toUpperCase() !== 'ZZ' &&
    rawCountry.trim().toUpperCase() !== 'T1'
      ? rawCountry.trim().toUpperCase()
      : null;

  const previewParams = {
    items,
    ...(validCountry ? { address: { countryCode: validCountry } } : {}),
  };

  const previewResult = await paddle.PricePreview(previewParams);
  const lineItems = previewResult?.data?.details?.lineItems || [];
  const currencyCode = previewResult?.data?.currencyCode || '';
  const detectedCountryCode = previewResult?.data?.address?.countryCode || validCountry || null;

  const pricesByTier = {};
  for (const tier of PADDLE_TIERS) {
    const key = getTierKey(tier.name);
    const priceId = resolvedMap[key];
    const match =
      lineItems.find((li) => li?.price?.id === priceId) ||
      lineItems.find((li) => li?.product?.id === tier.productId);

    if (match?.formattedTotals?.total) {
      pricesByTier[key] = {
        priceId: match.price?.id || priceId,
        productId: match.product?.id || tier.productId,
        formattedTotal: match.formattedTotals.total,
        currencyCode,
        countryCode: detectedCountryCode,
      };
    }
  }

  return {
    pricesByTier,
    currencyCode,
    countryCode: detectedCountryCode,
  };
}

export function formatPaddleCheckoutError(event) {
  const errCode = String(
    event?.code || event?.error?.code || event?.data?.code || event?.data?.error?.code || ''
  ).trim();
  const detail = String(
    event?.detail ||
      event?.error?.detail ||
      event?.error?.message ||
      event?.data?.detail ||
      event?.data?.error?.detail ||
      event?.data?.message ||
      ''
  ).trim();

  let rawDump = '';
  try {
    rawDump = JSON.stringify(event || {});
  } catch {
    rawDump = '';
  }

  if (
    errCode === 'transaction_checkout_not_enabled' ||
    rawDump.includes('transaction_checkout_not_enabled')
  ) {
    return {
      code: 'transaction_checkout_not_enabled',
      message:
        'Live Paddle checkout is not enabled for this domain yet. In Paddle Dashboard > Checkout > Checkout settings, set your Default payment link and make sure your domain and account verification are approved.',
    };
  }

  return {
    code: errCode || 'PADDLE_CHECKOUT_ERROR',
    message: detail || 'Unable to load Paddle Checkout for this tier right now.',
  };
}

/**
 * Opens Paddle Checkout as a one-page overlay (`displayMode: 'overlay'`, `variant: 'one-page'`)
 * for the exact price shown and redirects to `/welcome` on success.
 */
export async function openPaddleCheckout({
  planKey,
  priceId,
  email = '',
  userId = '',
  onCompleted,
  onError,
  onClosed,
}) {
  const cleanPlanKey = getTierKey(planKey);
  const tier = getTierByKey(cleanPlanKey);
  if (!tier) {
    throw new Error('Invalid subscription tier.');
  }

  const serverCtx = await fetchPaddleServerContext();

  const paddle = await getPaddleClient((event) => {
    if (event?.name === 'checkout.completed') {
      const txId = event?.data?.transaction_id || event?.data?.id || '';
      try {
        sessionStorage.setItem('washek_pending_checkout_plan', cleanPlanKey);
        localStorage.setItem('washek_pending_checkout_plan', cleanPlanKey);
        if (txId) {
          sessionStorage.setItem('washek_pending_checkout_tx', txId);
          localStorage.setItem('washek_pending_checkout_tx', txId);
        }
      } catch {
        // ignore storage errors
      }
      if (typeof onCompleted === 'function') {
        onCompleted(event.data, cleanPlanKey);
      }
    } else if (event?.name === 'checkout.error') {
      const formatted = formatPaddleCheckoutError(event);
      try {
        cachedPaddleInstance?.Checkout?.close?.();
      } catch {
        // ignore close error
      }
      if (typeof onError === 'function') {
        onError(formatted, cleanPlanKey);
      }
    } else if (event?.name === 'checkout.closed') {
      if (typeof onClosed === 'function') {
        onClosed(cleanPlanKey);
      }
    }
  }, serverCtx);

  let resolvedPriceId = isValidPaddlePriceId(priceId) ? String(priceId).trim() : '';
  if (!resolvedPriceId) {
    const { resolvedMap } = resolveTierPriceIds(serverCtx, 'month');
    resolvedPriceId = resolvedMap[cleanPlanKey] || '';
  }

  if (!isValidPaddlePriceId(resolvedPriceId)) {
    const err = new Error(
      `Cannot open Paddle Checkout for ${tier.name} (${tier.productId}) without a Price ID (pri_...).`
    );
    err.code = 'PADDLE_PRICE_ID_REQUIRED';
    throw err;
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanUid =
    userId && !String(userId).startsWith('usr_') ? String(userId).trim() : '';

  const customData = {
    plan: cleanPlanKey,
    product_id: tier.productId,
    ...(cleanUid ? { user_id: cleanUid } : {}),
    ...(cleanEmail ? { email: cleanEmail } : {}),
  };

  const successParams = new URLSearchParams({
    plan: cleanPlanKey,
  });

  paddle.Checkout.open({
    items: [{ priceId: resolvedPriceId, quantity: 1 }],
    ...(cleanEmail ? { customer: { email: cleanEmail } } : {}),
    customData,
    settings: {
      displayMode: 'overlay',
      variant: 'one-page',
      successUrl: `${window.location.origin}/welcome?${successParams.toString()}`,
    },
  });
}
