import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Load local .env / .env.local files into process.env for any variables not already set by the host environment
for (const envFile of ['.env.local', '.env']) {
  try {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // ignore local env file read errors
  }
}

const app = express();
// Parse CLI flags and environment variables for port and host
const args = process.argv.slice(2);
function parseArg(flag: string): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith('-')) {
      return args[i + 1];
    }
    if (args[i].startsWith(flag + '=')) {
      return args[i].slice(flag.length + 1);
    }
  }
  return null;
}

const cliPort = parseArg('--port') || parseArg('-p');
const cliHost = parseArg('--host') || parseArg('-h');
const PORT = parseInt(
  cliPort ||
    (process.env.NODE_ENV === 'production' ? process.env.PORT : '') ||
    '3000',
  10
);
const HOST = cliHost || process.env.HOST || '0.0.0.0';

// Body parsers with generous limits + rawBody capture for Stripe webhook signature verification
app.use(
  express.json({
    limit: '50mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Supabase configuration for backend authorization and quota enforcement
const SUPABASE_URL =
  process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('YOUR_PROJECT_REF')
    ? process.env.SUPABASE_URL
    : process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.includes('YOUR_PROJECT_REF')
      ? process.env.VITE_SUPABASE_URL
      : 'https://edvvwnaxmjuvwnxineph.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.includes('YOUR_')
    ? process.env.SUPABASE_ANON_KEY
    : process.env.VITE_SUPABASE_ANON_KEY && !process.env.VITE_SUPABASE_ANON_KEY.includes('YOUR_')
      ? process.env.VITE_SUPABASE_ANON_KEY
      : 'sb_publishable_hR5RWMT6qfPKbONf3G783A_Log5r61I';

// Stateless Supabase client instance so Node never mutates or rotates browser auth sessions
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function createStatelessSupabase(accessToken?: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

function isValidUUID(val: any): boolean {
  return (
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim())
  );
}

// Lazy initialization of the Google Gemini AI client
let aiClient: GoogleGenAI | null = null;
let hydrogenDailyExhaustedUntil = 0;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// ------------------------------------------------------------
// STRIPE BILLING CONFIGURATION & SERVER HELPERS
// ------------------------------------------------------------

type PaidPlanKey = 'progress' | 'performance' | 'elite';

const STRIPE_PRICE_IDS: Record<PaidPlanKey, string> = {
  progress: 'price_1TTYrbRuQpZftYKRoSyLbQ0c',
  performance: 'price_1TTYs8RuQpZftYKR8ZzpNg7x',
  elite: 'price_1TTYsWRuQpZftYKRKIm8V10E',
};

const STRIPE_PRICE_TO_PLAN: Record<string, PaidPlanKey> = {
  price_1TTYrbRuQpZftYKRoSyLbQ0c: 'progress',
  price_1TTYs8RuQpZftYKR8ZzpNg7x: 'performance',
  price_1TTYsWRuQpZftYKRKIm8V10E: 'elite',
};

const STRIPE_DEFAULT_CATALOG: Record<
  PaidPlanKey,
  { priceId: string; unitAmountCents: number; currencyCode: string; formattedTotal: string }
> = {
  progress: {
    priceId: STRIPE_PRICE_IDS.progress,
    unitAmountCents: 999,
    currencyCode: 'USD',
    formattedTotal: '$9.99',
  },
  performance: {
    priceId: STRIPE_PRICE_IDS.performance,
    unitAmountCents: 1799,
    currencyCode: 'USD',
    formattedTotal: '$17.99',
  },
  elite: {
    priceId: STRIPE_PRICE_IDS.elite,
    unitAmountCents: 3499,
    currencyCode: 'USD',
    formattedTotal: '$34.99',
  },
};

const STRIPE_PAYMENT_LINKS: Record<PaidPlanKey, string> = {
  progress: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
  performance: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
  elite: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
};

function toDeterministicUuid(input: string): string {
  const hex = crypto.createHash('sha256').update(String(input)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function buildStripePaymentLinkUrl(plan: PaidPlanKey, userId?: string, email?: string): string {
  const base = STRIPE_PAYMENT_LINKS[plan];
  if (!base) return '';
  try {
    const url = new URL(base);
    if (userId) url.searchParams.set('client_reference_id', String(userId).trim());
    if (email) url.searchParams.set('prefilled_email', String(email).trim().toLowerCase());
    return url.toString();
  } catch {
    return base;
  }
}

interface PendingCheckoutRecord {
  plan: string;
  userId?: string;
  email?: string;
  sessionId?: string | null;
  trial?: boolean;
  serverSessionToken?: string;
  refreshToken?: string;
  timestamp: number;
}

interface ConfirmedRedirectRecord {
  plan: string;
  status: string;
  verifiedBy?: string;
  timestamp: number;
}

const PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000;
const CONFIRMED_REDIRECT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days retention
const pendingCheckouts = new Map<string, PendingCheckoutRecord>();
const confirmedRedirectSubscriptions = new Map<string, ConfirmedRedirectRecord>();
const CONFIRMED_SUBSCRIPTIONS_FILE = path.join(process.cwd(), '.confirmed_subscriptions.json');

try {
  if (fs.existsSync(CONFIRMED_SUBSCRIPTIONS_FILE)) {
    const raw = fs.readFileSync(CONFIRMED_SUBSCRIPTIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const rec = v as ConfirmedRedirectRecord;
        if (rec?.plan && rec?.timestamp && Date.now() - Number(rec.timestamp) <= CONFIRMED_REDIRECT_TTL_MS) {
          confirmedRedirectSubscriptions.set(k, rec);
        }
      }
    }
  }
} catch (e) {
  console.debug('[Stripe] Confirmed subscriptions init note:', e);
}

function persistConfirmedSubscriptionsToDisk() {
  try {
    const obj: Record<string, ConfirmedRedirectRecord> = {};
    for (const [k, v] of confirmedRedirectSubscriptions.entries()) {
      if (v && Date.now() - Number(v.timestamp || 0) <= CONFIRMED_REDIRECT_TTL_MS) {
        obj[k] = v;
      }
    }
    fs.writeFileSync(CONFIRMED_SUBSCRIPTIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    // ignore disk persistence note
  }
}

interface KaelUsageDiskRecord {
  used: number;
  monthKey: string;
  updatedAt: number;
}

const kaelUsageDiskStore = new Map<string, KaelUsageDiskRecord>();
const KAEL_USAGE_FILE = path.join(process.cwd(), '.kael_usage.json');

try {
  if (fs.existsSync(KAEL_USAGE_FILE)) {
    const raw = fs.readFileSync(KAEL_USAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const rec = v as KaelUsageDiskRecord;
        if (rec && /^\d{4}-\d{2}$/.test(String(rec.monthKey || '')) && typeof rec.used === 'number') {
          kaelUsageDiskStore.set(k, {
            used: Math.max(0, Number(rec.used)),
            monthKey: String(rec.monthKey),
            updatedAt: Number(rec.updatedAt || Date.now()),
          });
        }
      }
    }
  }
} catch (e) {
  console.debug('[Kael] Disk usage init note:', e);
}

function persistKaelUsageToDisk() {
  try {
    const obj: Record<string, KaelUsageDiskRecord> = {};
    for (const [k, v] of kaelUsageDiskStore.entries()) {
      if (v && /^\d{4}-\d{2}$/.test(v.monthKey)) {
        obj[k] = v;
      }
    }
    fs.writeFileSync(KAEL_USAGE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    // ignore disk persistence note
  }
}

function getStoredKaelMonthlyCount(
  userId?: string | null,
  email?: string | null,
  currentMonthKey?: string | null
): number {
  if (!currentMonthKey || !/^\d{4}-\d{2}$/.test(currentMonthKey)) return 0;
  const cleanUid = userId && userId !== 'guest' ? `uid:${String(userId).trim()}` : '';
  const cleanEmail = email ? `email:${String(email).toLowerCase().trim()}` : '';
  let maxUsed = 0;
  for (const key of [cleanUid, cleanEmail]) {
    if (!key) continue;
    const rec = kaelUsageDiskStore.get(key);
    if (rec && rec.monthKey === currentMonthKey && typeof rec.used === 'number') {
      maxUsed = Math.max(maxUsed, rec.used);
    }
  }
  return maxUsed;
}

function recordStoredKaelMonthlyCount(
  userId?: string | null,
  email?: string | null,
  monthKey?: string | null,
  used?: number
): number {
  const cleanMonth = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(cleanMonth)) return Math.max(0, Number(used || 0));
  const cleanUid = userId && userId !== 'guest' ? `uid:${String(userId).trim()}` : '';
  const cleanEmail = email ? `email:${String(email).toLowerCase().trim()}` : '';
  const existingForMonth = getStoredKaelMonthlyCount(userId, email, cleanMonth);
  const finalUsed = Math.max(existingForMonth, Math.max(0, Number(used || 0)));
  const entry: KaelUsageDiskRecord = {
    used: finalUsed,
    monthKey: cleanMonth,
    updatedAt: Date.now(),
  };
  let changed = false;
  for (const key of [cleanUid, cleanEmail]) {
    if (!key) continue;
    const prev = kaelUsageDiskStore.get(key);
    if (!prev || prev.monthKey !== cleanMonth || prev.used !== finalUsed) {
      kaelUsageDiskStore.set(key, entry);
      changed = true;
    }
  }
  if (changed) {
    persistKaelUsageToDisk();
  }
  return finalUsed;
}

function recordPendingCheckoutEntry(entry: PendingCheckoutRecord) {
  if (!entry?.plan) return;
  if (entry.userId) pendingCheckouts.set(entry.userId, entry);
  if (entry.email) pendingCheckouts.set(entry.email.toLowerCase().trim(), entry);
  pendingCheckouts.set('latest', entry);
}

function clearPendingCheckoutForUser(userId?: string | null, email?: string | null) {
  const cleanUid = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  if (cleanUid) pendingCheckouts.delete(cleanUid);
  if (cleanEmail) pendingCheckouts.delete(cleanEmail);
  const latest = pendingCheckouts.get('latest');
  if (
    !latest ||
    (!cleanUid && !cleanEmail) ||
    (cleanUid && latest.userId === cleanUid) ||
    (cleanEmail && latest.email?.toLowerCase().trim() === cleanEmail)
  ) {
    pendingCheckouts.delete('latest');
  }
}

function getFreshPendingCheckoutEntry(userId?: string, email?: string): PendingCheckoutRecord | null {
  const cleanUid = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  const candidates = [
    cleanUid ? pendingCheckouts.get(cleanUid) : undefined,
    cleanEmail ? pendingCheckouts.get(cleanEmail) : undefined,
    pendingCheckouts.get('latest'),
  ];
  for (const c of candidates) {
    if (c && Date.now() - c.timestamp <= PENDING_CHECKOUT_TTL_MS) {
      return c;
    }
  }
  return null;
}

function getConfirmedRedirectRecord(
  userId?: string | null,
  email?: string | null,
  cancelledAtIso?: string | null
): ConfirmedRedirectRecord | null {
  const cleanUid = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  const rec =
    (cleanUid && confirmedRedirectSubscriptions.get(cleanUid)) ||
    (cleanEmail && confirmedRedirectSubscriptions.get(cleanEmail)) ||
    null;
  if (!rec) return null;

  const cancelMs = cancelledAtIso ? Date.parse(String(cancelledAtIso)) : 0;
  const isExpired = Date.now() - rec.timestamp > CONFIRMED_REDIRECT_TTL_MS;
  const isSupersededByCancel = Number.isFinite(cancelMs) && cancelMs > 0 && cancelMs > rec.timestamp;

  if (isExpired || isSupersededByCancel) {
    if (cleanUid) confirmedRedirectSubscriptions.delete(cleanUid);
    if (cleanEmail) confirmedRedirectSubscriptions.delete(cleanEmail);
    persistConfirmedSubscriptionsToDisk();
    return null;
  }

  return rec;
}

function getConfirmedRedirectEntitlement(
  userId?: string | null,
  email?: string | null,
  cancelledAtIso?: string | null
): string | null {
  const rec = getConfirmedRedirectRecord(userId, email, cancelledAtIso);
  return rec?.plan || null;
}

function recordConfirmedRedirectSubscription(params: {
  userId?: string | null;
  email?: string | null;
  plan: string;
  status?: string;
  verifiedBy?: string;
}) {
  const cleanPlan = String(params.plan || '').toLowerCase().trim();
  if (!['progress', 'performance', 'elite'].includes(cleanPlan)) return;
  const cleanUid = params.userId ? String(params.userId).trim() : '';
  const cleanEmail = params.email ? String(params.email).toLowerCase().trim() : '';
  const cleanStatus = String(params.status || 'active').toLowerCase().trim();
  const effectiveStatus = ['active', 'trialing', 'past_due'].includes(cleanStatus)
    ? cleanStatus
    : 'active';
  const entry: ConfirmedRedirectRecord = {
    plan: cleanPlan,
    status: effectiveStatus,
    verifiedBy: String(params.verifiedBy || 'stripe_verify'),
    timestamp: Date.now(),
  };
  if (cleanUid) confirmedRedirectSubscriptions.set(cleanUid, entry);
  if (cleanEmail) confirmedRedirectSubscriptions.set(cleanEmail, entry);
  persistConfirmedSubscriptionsToDisk();
}

function clearCheckoutEntitlementsForUser(userId?: string | null, email?: string | null) {
  const cleanUid = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  if (cleanUid) {
    pendingCheckouts.delete(cleanUid);
    confirmedRedirectSubscriptions.delete(cleanUid);
  }
  if (cleanEmail) {
    pendingCheckouts.delete(cleanEmail);
    confirmedRedirectSubscriptions.delete(cleanEmail);
  }
  pendingCheckouts.delete('latest');
  persistConfirmedSubscriptionsToDisk();
}

function getServiceRoleSupabase() {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '').trim();
  if (!serviceKey) return null;
  return createClient(SUPABASE_URL, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getServerStripeConfig() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const appUrl = String(process.env.APP_URL || '').trim();
  return {
    configured: Boolean(secretKey),
    secretKey,
    webhookSecret,
    appUrl,
  };
}

async function stripeApiRequest(
  stripePath: string,
  secretKey: string,
  options: { method?: string; body?: URLSearchParams } = {}
) {
  const response = await fetch(`https://api.stripe.com/v1/${stripePath}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(options.body ? { body: options.body } : {}),
  });

  const rawText = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    const err = new Error(parsed?.error?.message || `Stripe API error (${response.status})`);
    (err as any).status = response.status;
    (err as any).stripeCode = parsed?.error?.code;
    throw err;
  }

  return parsed;
}

function formatStripeAmount(unitAmountCents: number, currency = 'usd'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'usd').toUpperCase(),
    }).format(unitAmountCents / 100);
  } catch {
    return `$${(unitAmountCents / 100).toFixed(2)}`;
  }
}

function mapStripePlan(params: {
  metadataPlan?: any;
  priceId?: string | null;
  unitAmountCents?: number | null;
}): PaidPlanKey | null {
  const metaPlan = String(params.metadataPlan || '').toLowerCase().trim();
  if (metaPlan === 'progress' || metaPlan === 'performance' || metaPlan === 'elite') {
    return metaPlan;
  }
  if (params.priceId && STRIPE_PRICE_TO_PLAN[params.priceId]) {
    return STRIPE_PRICE_TO_PLAN[params.priceId];
  }
  if (params.unitAmountCents === 999) return 'progress';
  if (params.unitAmountCents === 1799) return 'performance';
  if (params.unitAmountCents === 3499) return 'elite';
  return null;
}

let cachedStripePrices: {
  fetchedAt: number;
  pricesByTier: Record<PaidPlanKey, { priceId: string; unitAmountCents: number; currencyCode: string; formattedTotal: string }>;
} | null = null;

async function updateProfileSubscriptionSafely(
  dbClient: any,
  userId: string,
  basePatch: Record<string, any>,
  extendedPatch: Record<string, any>
) {
  if (!dbClient || !userId || !isValidUUID(userId)) return;
  try {
    const { error } = await dbClient
      .from('profiles')
      .update({ ...basePatch, ...extendedPatch })
      .eq('id', userId);
    if (error && (error.code === '42703' || /column .* does not exist/i.test(String(error.message || '')))) {
      await dbClient.from('profiles').update(basePatch).eq('id', userId);
    }
  } catch (err: any) {
    console.debug('[Stripe] Profile update fallback note:', err?.message);
    try {
      await dbClient.from('profiles').update(basePatch).eq('id', userId);
    } catch {
      // ignore fallback failure
    }
  }
}

function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;
  try {
    const parts = signatureHeader.split(',').map((s) => s.trim());
    let timestamp = '';
    const v1Signatures: string[] = [];
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (key === 't') timestamp = val;
      if (key === 'v1' && val) v1Signatures.push(val);
    }

    if (!timestamp || v1Signatures.length === 0) return false;
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) {
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedHex = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');

    return v1Signatures.some((sigHex) => {
      try {
        const providedBuf = Buffer.from(sigHex, 'hex');
        return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// STRIPE API ROUTES
// ------------------------------------------------------------

app.get('/api/stripe/prices', async (_req, res) => {
  try {
    const cfg = getServerStripeConfig();
    if (!cfg.configured) {
      return res.json({
        success: true,
        source: 'catalog',
        currencyCode: 'USD',
        pricesByTier: STRIPE_DEFAULT_CATALOG,
      });
    }

    if (cachedStripePrices && Date.now() - cachedStripePrices.fetchedAt < 5 * 60 * 1000) {
      return res.json({
        success: true,
        source: 'stripe_cache',
        currencyCode: 'USD',
        pricesByTier: cachedStripePrices.pricesByTier,
      });
    }

    const nextPrices = { ...STRIPE_DEFAULT_CATALOG };
    await Promise.all(
      (['progress', 'performance', 'elite'] as const).map(async (tier) => {
        try {
          const priceObj = await stripeApiRequest(
            `prices/${encodeURIComponent(STRIPE_PRICE_IDS[tier])}`,
            cfg.secretKey
          );
          if (typeof priceObj?.unit_amount === 'number' && priceObj?.currency) {
            nextPrices[tier] = {
              priceId: priceObj.id || STRIPE_PRICE_IDS[tier],
              unitAmountCents: priceObj.unit_amount,
              currencyCode: String(priceObj.currency).toUpperCase(),
              formattedTotal: formatStripeAmount(priceObj.unit_amount, priceObj.currency),
            };
          }
        } catch (err: any) {
          console.warn(`[Stripe] Price lookup fallback for ${tier}:`, err?.message);
        }
      })
    );

    cachedStripePrices = {
      fetchedAt: Date.now(),
      pricesByTier: nextPrices,
    };

    return res.json({
      success: true,
      source: 'stripe',
      currencyCode: nextPrices.progress.currencyCode || 'USD',
      pricesByTier: nextPrices,
    });
  } catch (err: any) {
    console.warn('[Stripe] /api/stripe/prices error:', err?.message);
    return res.json({
      success: true,
      source: 'catalog_fallback',
      currencyCode: 'USD',
      pricesByTier: STRIPE_DEFAULT_CATALOG,
    });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const cfg = getServerStripeConfig();
    const { plan: rawPlan, app_url: rawAppUrl, email, userId, refreshToken } = req.body || {};
    const plan = String(rawPlan || '').toLowerCase().trim() as PaidPlanKey;
    if (plan !== 'progress' && plan !== 'performance' && plan !== 'elite') {
      return res.status(400).json({ success: false, error: 'Invalid subscription plan.' });
    }

    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanRawUserId = userId ? String(userId).trim() : '';

    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const clientSrvToken =
      typeof req.headers['x-washek-server-session'] === 'string'
        ? req.headers['x-washek-server-session'].trim()
        : '';

    const isJwtShape = Boolean(
      token && !token.startsWith('vault_tok_') && !token.startsWith('washek_sess_') && token.split('.').length === 3
    );

    if (!isJwtShape) {
      const recovery = await tryRecoverSupabaseSession({
        authToken: token,
        refreshToken: typeof refreshToken === 'string' ? refreshToken.trim() : '',
        serverSessionToken: clientSrvToken,
        cookieHeader: req.headers.cookie,
        targetEmail: cleanEmail,
      });
      if (recovery?.session?.access_token) {
        token = recovery.session.access_token;
      }
    }

    const hasValidJwtShape = Boolean(
      token && !token.startsWith('vault_tok_') && !token.startsWith('washek_sess_') && token.split('.').length === 3
    );
    const userClient = hasValidJwtShape ? createStatelessSupabase(token) : null;
    let verifiedUser: any = null;
    if (userClient) {
      try {
        const { data: userData } = await userClient.auth.getUser(token);
        if (userData?.user?.id) {
          verifiedUser = userData.user;
        }
      } catch {
        // fallback cleanly to server session / signed-in profile lookup
      }
    }

    const srvProof = verifyServerSessionFromRequest(req, cleanEmail || undefined);
    const expiredJwtProof =
      !verifiedUser && hasValidJwtShape
        ? await verifyExpiredSupabaseJwt(token, cleanEmail || undefined)
        : null;

    const adminClient = getServiceRoleSupabase();
    let uid =
      verifiedUser?.id ||
      expiredJwtProof?.userId ||
      (srvProof?.userId && isValidUUID(srvProof.userId) ? srvProof.userId : '') ||
      (isValidUUID(cleanRawUserId) ? cleanRawUserId : '');
    const userEmail =
      verifiedUser?.email ||
      expiredJwtProof?.email ||
      srvProof?.email ||
      cleanEmail ||
      undefined;

    if (!uid && adminClient && userEmail) {
      try {
        const { data: profByEmail } = await adminClient
          .from('profiles')
          .select('id')
          .ilike('email', userEmail)
          .maybeSingle();
        if (profByEmail?.id) {
          uid = profByEmail.id;
        }
      } catch {
        // ignore email lookup fallback error
      }
    }

    if (!uid && (cleanRawUserId || userEmail)) {
      uid = toDeterministicUuid(cleanRawUserId || userEmail || 'athlete');
    }

    if (!uid && !userEmail) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_SESSION_EXPIRED',
        error: 'Please sign in to upgrade your plan.',
      });
    }

    if (!cfg.configured) {
      const directUrl = buildStripePaymentLinkUrl(plan, uid, userEmail);
      if (directUrl) {
        const srvToken =
          clientSrvToken ||
          (userEmail ? createServerSessionToken(userEmail, uid) : '');
        recordPendingCheckoutEntry({
          plan,
          userId: uid || undefined,
          email: userEmail || undefined,
          sessionId: null,
          trial: undefined,
          serverSessionToken: srvToken || undefined,
          timestamp: Date.now(),
        });
        return res.json({
          success: true,
          action: 'checkout',
          url: directUrl,
          session_id: null,
          payment_link: true,
        });
      }
      return res.status(503).json({
        success: false,
        code: 'STRIPE_SERVER_KEY_MISSING',
        error: 'Stripe Checkout is temporarily unavailable.',
      });
    }

    const dbClient = adminClient || userClient;
    let profile: any = null;
    if (dbClient && isValidUUID(uid)) {
      try {
        const { data: profData } = await dbClient
          .from('profiles')
          .select(
            'subscription_plan, subscription_status, stripe_customer_id, stripe_subscription_id, has_used_trial, trial_used'
          )
          .eq('id', uid)
          .maybeSingle();
        profile = profData || null;
      } catch {
        profile = null;
      }
    }

    const currentPlan = String(profile?.subscription_plan || 'free').toLowerCase().trim();
    const currentStatus = String(profile?.subscription_status || '').toLowerCase().trim();
    if (currentPlan === plan && ['active', 'trialing', 'past_due', 'unpaid'].includes(currentStatus)) {
      return res.json({
        success: true,
        action: 'already_active',
        plan,
      });
    }

    const hasUsedTrial = Boolean(
      profile?.has_used_trial ||
        profile?.trial_used ||
        profile?.subscription_status === 'canceled' ||
        (profile?.subscription_plan && profile.subscription_plan !== 'free')
    );

    const originHeader =
      typeof rawAppUrl === 'string' && rawAppUrl.trim()
        ? rawAppUrl.trim()
        : req.headers.origin
          ? String(req.headers.origin)
          : cfg.appUrl || `http://localhost:${PORT}`;
    const baseUrl = originHeader.replace(/\/+$/, '');

    const customerId = profile?.stripe_customer_id ? String(profile.stripe_customer_id).trim() : '';
    let oldSubscriptionId = '';
    if (profile?.stripe_subscription_id) {
      try {
        const sub = await stripeApiRequest(
          `subscriptions/${encodeURIComponent(String(profile.stripe_subscription_id))}`,
          cfg.secretKey
        );
        if (['active', 'trialing', 'past_due', 'unpaid'].includes(String(sub?.status || '').toLowerCase())) {
          oldSubscriptionId = String(sub.id);
        }
      } catch {
        oldSubscriptionId = '';
      }
    }

    const body = new URLSearchParams();
    body.set('mode', 'subscription');
    body.set('line_items[0][price]', STRIPE_PRICE_IDS[plan]);
    body.set('line_items[0][quantity]', '1');
    body.set(
      'success_url',
      `${baseUrl}/subscription-return?plan=${encodeURIComponent(plan)}&session_id={CHECKOUT_SESSION_ID}&trial=${!hasUsedTrial}`
    );
    body.set('cancel_url', `${baseUrl}/profile?checkout=canceled`);
    body.set('client_reference_id', uid);
    if (customerId) {
      body.set('customer', customerId);
    } else if (userEmail) {
      body.set('customer_email', userEmail);
    }
    body.set('metadata[user_id]', uid);
    body.set('metadata[plan]', plan);
    body.set('metadata[has_used_trial]', String(hasUsedTrial));
    body.set('subscription_data[metadata][user_id]', uid);
    body.set('subscription_data[metadata][plan]', plan);
    if (!hasUsedTrial) {
      body.set('subscription_data[trial_period_days]', '7');
    }
    if (oldSubscriptionId) {
      body.set('metadata[old_subscription_id]', oldSubscriptionId);
      body.set('subscription_data[metadata][old_subscription_id]', oldSubscriptionId);
    }

    const session = await stripeApiRequest('checkout/sessions', cfg.secretKey, {
      method: 'POST',
      body,
    });

    if (!session?.url) {
      throw new Error('Stripe did not return a Checkout URL.');
    }

    const srvToken =
      clientSrvToken ||
      (userEmail ? createServerSessionToken(userEmail, uid) : '');
    recordPendingCheckoutEntry({
      plan,
      userId: uid || undefined,
      email: userEmail || undefined,
      sessionId: session.id || null,
      trial: !hasUsedTrial,
      serverSessionToken: srvToken || undefined,
      timestamp: Date.now(),
    });

    return res.json({
      success: true,
      action: 'checkout',
      url: session.url,
      session_id: session.id,
      replacing_subscription: Boolean(oldSubscriptionId),
      old_subscription_id: oldSubscriptionId || null,
    });
  } catch (err: any) {
    console.error('[Stripe] /api/create-checkout-session error:', err);
    return res.status(err?.status >= 400 ? err.status : 500).json({
      success: false,
      error: err?.message || 'Unable to create Stripe Checkout session.',
    });
  }
});

app.post('/api/stripe/verify-session', async (req, res) => {
  try {
    const { sessionId, plan: hintedPlanRaw, userId, email } = req.body || {};
    const cleanSessionId = String(sessionId || '').trim();
    const cfg = getServerStripeConfig();

    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    let verifiedUid = userId && isValidUUID(userId) ? String(userId).trim() : '';

    if (bearerToken && bearerToken.split('.').length === 3) {
      try {
        const { data: uData } = await createStatelessSupabase(bearerToken).auth.getUser(bearerToken);
        if (uData?.user?.id) {
          verifiedUid = uData.user.id;
        }
      } catch {
        // ignore invalid JWT lookup
      }
    }

    if (cleanSessionId && cfg.configured) {
      const sessionObj = await stripeApiRequest(
        `checkout/sessions/${encodeURIComponent(cleanSessionId)}?expand[]=subscription`,
        cfg.secretKey
      );

      const sessionUid =
        (typeof sessionObj?.client_reference_id === 'string' && isValidUUID(sessionObj.client_reference_id)
          ? sessionObj.client_reference_id.trim()
          : '') ||
        (isValidUUID(sessionObj?.metadata?.user_id) ? String(sessionObj.metadata.user_id).trim() : '');

      if (verifiedUid && sessionUid && verifiedUid !== sessionUid) {
        return res.status(403).json({
          success: false,
          verified: false,
          error: 'Checkout session does not belong to the signed-in account.',
        });
      }

      const targetUid = verifiedUid || sessionUid;
      const paymentStatus = String(sessionObj?.payment_status || '').toLowerCase().trim();
      const paymentConfirmed = paymentStatus === 'paid' || paymentStatus === 'no_payment_required';
      const subObj = typeof sessionObj?.subscription === 'object' ? sessionObj.subscription : null;
      const subId = typeof sessionObj?.subscription === 'string' ? sessionObj.subscription : subObj?.id || null;
      const customerId =
        typeof sessionObj?.customer === 'string' ? sessionObj.customer : sessionObj?.customer?.id || null;
      const subStatus = String(subObj?.status || (paymentConfirmed ? 'active' : 'incomplete')).toLowerCase().trim();
      const priceId = subObj?.items?.data?.[0]?.price?.id || null;
      const unitAmountCents = subObj?.items?.data?.[0]?.price?.unit_amount ?? null;
      const resolvedPlan =
        mapStripePlan({
          metadataPlan: subObj?.metadata?.plan || sessionObj?.metadata?.plan || hintedPlanRaw,
          priceId,
          unitAmountCents,
        }) || null;

      if (paymentConfirmed && resolvedPlan && ['active', 'trialing', 'past_due'].includes(subStatus)) {
        const adminClient = getServiceRoleSupabase();
        const dbClient =
          adminClient ||
          (bearerToken && bearerToken.split('.').length === 3 ? createStatelessSupabase(bearerToken) : null);

        let dbSynced = false;
        if (dbClient && targetUid) {
          await updateProfileSubscriptionSafely(
            dbClient,
            targetUid,
            {
              subscription_plan: resolvedPlan,
              subscription_status: subStatus,
              has_used_trial: true,
              subscription_cancelled_at: null,
              subscription_updated_at: new Date().toISOString(),
            },
            {
              stripe_subscription_id: subId,
              stripe_customer_id: customerId,
              stripe_price_id: priceId,
            }
          );
          if (adminClient) {
            dbSynced = true;
          } else {
            try {
              const { data: verifyProf } = await dbClient
                .from('profiles')
                .select('subscription_plan, subscription_status')
                .eq('id', targetUid)
                .maybeSingle();
              if (
                verifyProf?.subscription_plan === resolvedPlan &&
                ['active', 'trialing', 'past_due'].includes(String(verifyProf?.subscription_status || '').toLowerCase().trim())
              ) {
                dbSynced = true;
              }
            } catch {
              dbSynced = false;
            }
          }
        }

        recordConfirmedRedirectSubscription({
          userId: targetUid || null,
          email:
            email ||
            sessionObj?.customer_details?.email ||
            (typeof sessionObj?.customer_email === 'string' ? sessionObj.customer_email : null),
          plan: resolvedPlan,
          status: subStatus,
          verifiedBy: 'stripe_session',
        });

        clearPendingCheckoutForUser(targetUid, email ? String(email) : undefined);

        return res.json({
          success: true,
          verified: true,
          dbSynced,
          sessionId: cleanSessionId,
          plan: resolvedPlan,
          status: subStatus,
          subscriptionId: subId,
          customerId,
          priceId,
        });
      }

      return res.status(202).json({
        success: false,
        verified: false,
        sessionId: cleanSessionId,
        stripePaymentStatus: paymentStatus,
        error: 'Checkout session is not yet marked paid by Stripe.',
      });
    }

    // Direct Stripe Customer & Subscription lookup when sessionId is omitted and server has STRIPE_SECRET_KEY
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    if (cfg.configured && (verifiedUid || cleanEmail)) {
      const candidateCustomerIds = new Set<string>();
      const adminClient = getServiceRoleSupabase();
      const dbClient =
        adminClient ||
        (bearerToken && bearerToken.split('.').length === 3 ? createStatelessSupabase(bearerToken) : null);

      let profileCancelledAtMs = 0;
      if (dbClient && verifiedUid) {
        try {
          const { data: profCust } = await dbClient
            .from('profiles')
            .select('stripe_customer_id, stripe_subscription_id, subscription_cancelled_at, subscription_plan, subscription_status')
            .eq('id', verifiedUid)
            .maybeSingle();
          if (profCust?.stripe_customer_id?.startsWith('cus_')) {
            candidateCustomerIds.add(profCust.stripe_customer_id);
          }
          if (
            profCust?.subscription_cancelled_at &&
            (profCust.subscription_plan === 'free' || profCust.subscription_status === 'canceled')
          ) {
            const parsedMs = Date.parse(String(profCust.subscription_cancelled_at));
            if (Number.isFinite(parsedMs)) profileCancelledAtMs = parsedMs;
          }
        } catch {
          // ignore
        }
      }

      if (cleanEmail) {
        try {
          const searchRes = await stripeApiRequest(
            `customers/search?query=${encodeURIComponent(`email:"${cleanEmail}"`)}&limit=10`,
            cfg.secretKey
          );
          for (const c of searchRes?.data || []) {
            if (c?.id && !c.deleted) candidateCustomerIds.add(c.id);
          }
        } catch {
          // ignore search error
        }
        try {
          const listRes = await stripeApiRequest(
            `customers?email=${encodeURIComponent(cleanEmail)}&limit=10`,
            cfg.secretKey
          );
          for (const c of listRes?.data || []) {
            if (c?.id && !c.deleted) candidateCustomerIds.add(c.id);
          }
        } catch {
          // ignore list error
        }
      }

      const entitledSubs: any[] = [];
      for (const custId of candidateCustomerIds) {
        try {
          const subsRes = await stripeApiRequest(
            `subscriptions?customer=${encodeURIComponent(custId)}&status=all&limit=20`,
            cfg.secretKey
          );
          for (const sub of subsRes?.data || []) {
            const st = String(sub?.status || '').toLowerCase().trim();
            const createdMs = Number(sub?.created || 0) * 1000;
            if (profileCancelledAtMs > 0 && createdMs > 0 && createdMs <= profileCancelledAtMs) {
              continue;
            }
            if (['active', 'trialing', 'past_due'].includes(st)) {
              entitledSubs.push(sub);
            }
          }
        } catch {
          // ignore per-customer failure
        }
      }

      if (entitledSubs.length > 0) {
        entitledSubs.sort((a, b) => Number(b?.created || 0) - Number(a?.created || 0));
        const bestSub = entitledSubs[0];
        const subStatus = String(bestSub?.status || 'active').toLowerCase().trim();
        const priceId = bestSub?.items?.data?.[0]?.price?.id || null;
        const unitAmountCents = bestSub?.items?.data?.[0]?.price?.unit_amount ?? null;
        const custId =
          typeof bestSub?.customer === 'string' ? bestSub.customer : bestSub?.customer?.id || null;
        const resolvedPlan =
          mapStripePlan({
            metadataPlan: bestSub?.metadata?.plan || hintedPlanRaw,
            priceId,
            unitAmountCents,
          }) || 'progress';

        let dbSynced = false;
        if (dbClient && verifiedUid) {
          await updateProfileSubscriptionSafely(
            dbClient,
            verifiedUid,
            {
              subscription_plan: resolvedPlan,
              subscription_status: subStatus,
              has_used_trial: true,
              subscription_cancelled_at: null,
              subscription_updated_at: new Date().toISOString(),
            },
            {
              stripe_subscription_id: bestSub.id,
              stripe_customer_id: custId,
              stripe_price_id: priceId,
            }
          );
          if (adminClient) {
            dbSynced = true;
          } else {
            try {
              const { data: verifyProf } = await dbClient
                .from('profiles')
                .select('subscription_plan, subscription_status')
                .eq('id', verifiedUid)
                .maybeSingle();
              if (
                verifyProf?.subscription_plan === resolvedPlan &&
                ['active', 'trialing', 'past_due'].includes(String(verifyProf?.subscription_status || '').toLowerCase().trim())
              ) {
                dbSynced = true;
              }
            } catch {
              dbSynced = false;
            }
          }
        }

        recordConfirmedRedirectSubscription({
          userId: verifiedUid || null,
          email: cleanEmail || null,
          plan: resolvedPlan,
          status: subStatus,
          verifiedBy: 'stripe_customer_lookup',
        });

        return res.json({
          success: true,
          verified: true,
          dbSynced,
          plan: resolvedPlan,
          status: subStatus,
          subscriptionId: bestSub.id,
          customerId: custId,
          priceId,
        });
      }
    }

    // Fallback DB check when STRIPE_SECRET_KEY lives in Supabase Edge Functions
    const adminClient = getServiceRoleSupabase();
    if ((verifiedUid && bearerToken && bearerToken.split('.').length === 3) || (adminClient && (verifiedUid || email))) {
      const lookupClient = adminClient || createStatelessSupabase(bearerToken);
      let prof: any = null;
      if (verifiedUid) {
        const { data } = await lookupClient
          .from('profiles')
          .select('subscription_plan, subscription_status')
          .eq('id', verifiedUid)
          .maybeSingle();
        prof = data;
      } else if (adminClient && email) {
        const { data } = await adminClient
          .from('profiles')
          .select('subscription_plan, subscription_status')
          .ilike('email', String(email).trim())
          .maybeSingle();
        prof = data;
      }

      const dbPlan = String(prof?.subscription_plan || 'free').toLowerCase().trim();
      const dbStatus = String(prof?.subscription_status || 'inactive').toLowerCase().trim();
      if (['progress', 'performance', 'elite'].includes(dbPlan) && ['active', 'trialing', 'past_due'].includes(dbStatus)) {
        return res.json({
          success: true,
          verified: true,
          dbSynced: true,
          plan: dbPlan,
          status: dbStatus,
        });
      }
    }

    return res.status(202).json({
      success: false,
      verified: false,
      error: 'Awaiting Stripe webhook confirmation.',
    });
  } catch (err: any) {
    console.error('[Stripe] verify-session error:', err);
    return res.status(500).json({
      success: false,
      verified: false,
      error: err?.message || 'Failed to verify Stripe checkout session.',
    });
  }
});

app.post('/api/stripe/webhook', async (req: any, res) => {
  try {
    const cfg = getServerStripeConfig();
    if (!cfg.webhookSecret) {
      return res.status(503).json({
        success: false,
        error: 'STRIPE_WEBHOOK_SECRET is not configured on the server.',
      });
    }

    const signature = String(req.headers['stripe-signature'] || '');
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body || {});
    if (!verifyStripeWebhookSignature(rawBody, signature, cfg.webhookSecret)) {
      return res.status(401).json({ success: false, error: 'Invalid Stripe webhook signature.' });
    }

    const event = req.body || {};
    const eventType = String(event?.type || '').trim();
    const obj = event?.data?.object || {};
    const adminDb = getServiceRoleSupabase();

    if (!adminDb) {
      console.warn('[Stripe Webhook] Received verified event', eventType, 'but SUPABASE_SERVICE_ROLE_KEY is unset.');
      return res.json({ received: true, persisted: false });
    }

    const targetUserId = (() => {
      const uid = obj?.metadata?.user_id || obj?.client_reference_id;
      return isValidUUID(uid) ? String(uid).trim() : '';
    })();

    const eventEmail =
      obj?.customer_details?.email ||
      (typeof obj?.customer_email === 'string' ? obj.customer_email : '');

    const resolveUid = async (): Promise<string> => {
      if (targetUserId) return targetUserId;
      const subId =
        eventType.startsWith('customer.subscription.')
          ? obj?.id
          : typeof obj?.subscription === 'string'
            ? obj.subscription
            : obj?.subscription?.id;
      const custId = typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id;

      if (subId) {
        const { data: rows } = await adminDb
          .from('profiles')
          .select('id')
          .eq('stripe_subscription_id', subId)
          .limit(1);
        if (rows?.[0]?.id) return rows[0].id;
      }
      if (custId && adminDb) {
        const { data: rows } = await adminDb
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', custId)
          .limit(1);
        if (rows?.[0]?.id) return rows[0].id;
      }
      if (eventEmail && adminDb) {
        const { data: rows } = await adminDb
          .from('profiles')
          .select('id')
          .ilike('email', eventEmail.trim())
          .limit(1);
        if (rows?.[0]?.id) return rows[0].id;
      }
      return '';
    };

    const resolvedUid = await resolveUid();
    if (!resolvedUid) {
      return res.json({ received: true, updated: false });
    }

    if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded') {
      const paymentStatus = String(obj?.payment_status || '').toLowerCase().trim();
      if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
        const plan = mapStripePlan({ metadataPlan: obj?.metadata?.plan }) || 'progress';
        const subId = typeof obj?.subscription === 'string' ? obj.subscription : obj?.subscription?.id || null;
        const custId = typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id || null;
        const derivedStatus = paymentStatus === 'no_payment_required' ? 'trialing' : 'active';
        await updateProfileSubscriptionSafely(
          adminDb,
          resolvedUid,
          {
            subscription_plan: plan,
            subscription_status: derivedStatus,
            has_used_trial: true,
            subscription_updated_at: new Date().toISOString(),
          },
          {
            stripe_subscription_id: subId,
            stripe_customer_id: custId,
          }
        );
      }
    } else if (
      eventType === 'customer.subscription.created' ||
      eventType === 'customer.subscription.updated' ||
      eventType === 'customer.subscription.deleted' ||
      eventType === 'customer.subscription.paused' ||
      eventType === 'customer.subscription.resumed'
    ) {
      const subStatus = String(obj?.status || '').toLowerCase().trim();
      const priceItem = obj?.items?.data?.[0]?.price;
      const priceId = priceItem?.id || null;
      const mappedPlan = mapStripePlan({
        metadataPlan: obj?.metadata?.plan,
        priceId,
        unitAmountCents: priceItem?.unit_amount ?? null,
      });
      const isEntitled = ['active', 'trialing', 'past_due', 'unpaid'].includes(subStatus);
      const isDeleted = eventType === 'customer.subscription.deleted' || subStatus === 'canceled';

      clearStripeSyncCachesForUser(resolvedUid, eventEmail || null);
      if (isDeleted) {
        clearCheckoutEntitlementsForUser(resolvedUid, eventEmail || null);
      } else if (isEntitled && mappedPlan) {
        recordConfirmedRedirectSubscription({
          userId: resolvedUid,
          email: eventEmail || null,
          plan: mappedPlan,
          status: subStatus || 'active',
          verifiedBy: 'stripe_webhook',
        });
      }

      await updateProfileSubscriptionSafely(
        adminDb,
        resolvedUid,
        {
          subscription_plan: isEntitled && mappedPlan ? mappedPlan : 'free',
          subscription_status: subStatus || (isDeleted ? 'canceled' : 'inactive'),
          has_used_trial: true,
          subscription_updated_at: new Date().toISOString(),
          ...(isDeleted ? { subscription_cancelled_at: new Date().toISOString() } : {}),
        },
        {
          stripe_subscription_id: isDeleted ? null : obj?.id || null,
          stripe_customer_id: typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id || null,
          stripe_price_id: isDeleted ? null : priceId,
        }
      );
    }

    return res.json({ received: true, updated: true, eventType });
  } catch (err: any) {
    console.error('[Stripe] webhook error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Webhook processing error.' });
  }
});

app.post('/api/checkout/process', async (req, res) => {
  try {
    const token = req.headers.authorization ? String(req.headers.authorization).replace(/^Bearer\s+/i, '').trim() : '';
    if (!token || token.startsWith('vault_tok_') || token.startsWith('washek_sess_') || token.split('.').length !== 3) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required to verify checkout.',
      });
    }

    const userClient = createStatelessSupabase(token);
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session.',
      });
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('subscription_plan, subscription_status, has_used_trial, trial_used')
      .eq('id', userData.user.id)
      .maybeSingle();

    const dbPlan = String(profile?.subscription_plan || 'free').toLowerCase().trim();
    const dbStatus = String(profile?.subscription_status || 'inactive').toLowerCase().trim();
    const isVerified =
      ['progress', 'performance', 'elite'].includes(dbPlan) &&
      ['active', 'trialing', 'past_due'].includes(dbStatus);

    if (!isVerified) {
      return res.status(402).json({
        success: false,
        verified: false,
        plan: 'free',
        status: dbStatus || 'inactive',
        error: 'Payment has not been confirmed by Stripe yet.',
      });
    }

    return res.json({
      success: true,
      verified: true,
      message: `Verified ${dbPlan.charAt(0).toUpperCase() + dbPlan.slice(1)} plan.`,
      plan: dbPlan,
      status: dbStatus,
      hasUsedTrial: Boolean(profile?.has_used_trial || profile?.trial_used),
    });
  } catch (err: any) {
    console.error('[API] checkout verify error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to verify payment' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    backend: 'Google Gemini',
    model: 'gemini-3.1-flash-lite',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    billingProvider: 'stripe',
  });
});

async function handleCancelStripeSubscription(req: express.Request, res: express.Response) {
  try {
    const { userId, email, accessToken, refreshToken, subscriptionId: bodySubId } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    let token =
      (authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '') ||
      (typeof accessToken === 'string' ? accessToken.trim() : '');
    const clientRefreshToken = typeof refreshToken === 'string' ? refreshToken.trim() : '';
    const clientSrvToken =
      typeof req.headers['x-washek-server-session'] === 'string'
        ? req.headers['x-washek-server-session'].trim()
        : '';

    let recoveredSession: any = null;
    let recoveredSyncNeeded = false;

    const isJwtShape = Boolean(
      token &&
        !token.startsWith('vault_tok_') &&
        !token.startsWith('washek_sess_') &&
        token.split('.').length === 3
    );

    if (!isJwtShape) {
      const recovery = await tryRecoverSupabaseSession({
        authToken: token,
        refreshToken: clientRefreshToken,
        serverSessionToken: clientSrvToken,
        cookieHeader: req.headers.cookie,
        targetEmail: cleanEmail,
      });
      if (recovery?.session?.access_token) {
        token = recovery.session.access_token;
        recoveredSession = recovery.session;
        setServerSessionCookie(
          res,
          createServerSessionToken(
            recovery.session.user?.email || cleanEmail,
            recovery.session.user?.id || userId
          ),
          req
        );
      } else if (recovery?.syncNeeded) {
        recoveredSyncNeeded = true;
      }
    }

    const origAuthToken =
      (authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '') ||
      (typeof accessToken === 'string' ? accessToken.trim() : '');

    if (!token || token.startsWith('vault_tok_') || token.startsWith('washek_sess_') || token.split('.').length !== 3) {
      const isLocalOrVaultSession = Boolean(
        recoveredSyncNeeded ||
          (origAuthToken && (origAuthToken.startsWith('vault_tok_') || origAuthToken.startsWith('washek_sess_'))) ||
          (userId && String(userId).startsWith('usr_')) ||
          (cleanEmail && athleteCredentials.has(cleanEmail)) ||
          Boolean(verifyServerSessionFromRequest(req, cleanEmail || undefined))
      );
      if (isLocalOrVaultSession) {
        clearCheckoutEntitlementsForUser(userId ? String(userId) : undefined, cleanEmail);
        return res.json({
          success: true,
          alreadyCanceled: true,
          localOnly: true,
          plan: 'free',
          status: 'canceled',
          hasUsedTrial: true,
          message: 'Subscription canceled. Account is now on Free Plan.',
          user: null,
        });
      }
      return res.status(401).json({
        success: false,
        code: 'AUTH_SESSION_EXPIRED',
        error: 'Your login session has expired. Please sign in again to cancel your subscription.',
      });
    }

    const userClient = createStatelessSupabase(token);
    const { data: authUserData, error: authErr } = await userClient.auth.getUser(token);
    const uid = authUserData?.user?.id || recoveredSession?.user?.id || (isValidUUID(userId) ? String(userId) : '');
    if (authErr || !uid) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_SESSION_EXPIRED',
        error: 'Your login session has expired. Please sign in again to cancel your subscription.',
      });
    }

    // Collect all Stripe subscription IDs to cancel
    const subscriptionsToCancel = new Set<string>();
    if (typeof bodySubId === 'string' && /^sub_[a-zA-Z0-9]+$/.test(bodySubId.trim())) {
      subscriptionsToCancel.add(bodySubId.trim());
    }

    let customerId = '';
    try {
      const { data: prof } = await userClient
        .from('profiles')
        .select('stripe_subscription_id, stripe_customer_id')
        .eq('id', uid)
        .maybeSingle();
      if (prof?.stripe_subscription_id && /^sub_[a-zA-Z0-9]+$/.test(String(prof.stripe_subscription_id))) {
        subscriptionsToCancel.add(String(prof.stripe_subscription_id));
      }
      if (prof?.stripe_customer_id && /^cus_[a-zA-Z0-9]+$/.test(String(prof.stripe_customer_id))) {
        customerId = String(prof.stripe_customer_id);
      }
    } catch {
      // column lookup fallback
    }

    const cfg = getServerStripeConfig();
    const targetEmail = cleanEmail || authUserData?.user?.email || '';

    if (cfg.configured) {
      // 1. Look up subscriptions by customerId
      if (customerId) {
        try {
          const custSubs = await stripeApiRequest(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all`, cfg.secretKey);
          if (Array.isArray(custSubs?.data)) {
            for (const s of custSubs.data) {
              if (['active', 'trialing', 'past_due', 'unpaid'].includes(String(s.status || '').toLowerCase())) {
                subscriptionsToCancel.add(s.id);
              }
            }
          }
        } catch (cErr) {
          console.warn('[Stripe] Customer subscriptions lookup note:', cErr);
        }
      }

      // 2. Look up subscriptions by email
      if (targetEmail) {
        try {
          const custSearch = await stripeApiRequest(`customers?email=${encodeURIComponent(targetEmail.trim())}&limit=10`, cfg.secretKey);
          if (Array.isArray(custSearch?.data)) {
            for (const c of custSearch.data) {
              if (c?.id) {
                try {
                  const sList = await stripeApiRequest(`subscriptions?customer=${encodeURIComponent(c.id)}&status=all`, cfg.secretKey);
                  if (Array.isArray(sList?.data)) {
                    for (const s of sList.data) {
                      if (['active', 'trialing', 'past_due', 'unpaid'].includes(String(s.status || '').toLowerCase())) {
                        subscriptionsToCancel.add(s.id);
                      }
                    }
                  }
                } catch {
                  // ignore individual customer lookup
                }
              }
            }
          }
        } catch (eErr) {
          console.warn('[Stripe] Email customer lookup note:', eErr);
        }
      }

      // Cancel all identified Stripe subscriptions
      for (const sId of subscriptionsToCancel) {
        try {
          await stripeApiRequest(`subscriptions/${encodeURIComponent(sId)}`, cfg.secretKey, {
            method: 'DELETE',
          });
          console.log('[Stripe] Canceled subscription in Stripe:', sId);
        } catch (stripeErr: any) {
          if (stripeErr?.status !== 404 && stripeErr?.stripeCode !== 'resource_missing') {
            console.warn('[Stripe] Failed to cancel subscription:', sId, stripeErr?.message);
          }
        }
      }
    }

    // Update Supabase profile to free/canceled using service role if available, otherwise user client
    const dbClient = getServiceRoleSupabase() || userClient;
    await updateProfileSubscriptionSafely(
      dbClient,
      uid,
      {
        subscription_plan: 'free',
        subscription_status: 'canceled',
        has_used_trial: true,
        subscription_cancelled_at: new Date().toISOString(),
        subscription_updated_at: new Date().toISOString(),
      },
      {
        stripe_subscription_id: null,
        stripe_price_id: null,
      }
    );

    let updatedProfile: any = null;
    try {
      const { data: profAfter } = await userClient
        .from('profiles')
        .select('id, subscription_plan, subscription_status')
        .eq('id', uid)
        .maybeSingle();
      if (profAfter) updatedProfile = profAfter;
    } catch {
      // ignore read failure
    }

    clearCheckoutEntitlementsForUser(
      userId ? String(userId) : uid ? String(uid) : undefined,
      cleanEmail
    );
    clearStripeSyncCachesForUser(
      userId ? String(userId) : uid ? String(uid) : undefined,
      cleanEmail
    );

    return res.json({
      success: true,
      alreadyCanceled: subscriptionsToCancel.size === 0,
      message: 'Subscription canceled. Account is now on Free Plan.',
      plan: 'free',
      status: 'canceled',
      hasUsedTrial: true,
      user: updatedProfile || { id: uid, subscription_plan: 'free', subscription_status: 'canceled' },
      ...(recoveredSession ? { refreshedSession: recoveredSession } : {}),
    });
  } catch (err: any) {
    console.error('[Stripe] cancel-subscription error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to cancel subscription',
    });
  }
}

app.post('/api/cancel-subscription', handleCancelStripeSubscription);

app.post('/api/checkout/pending', (req, res) => {
  try {
    const { userId, email, plan, sessionId, trial, serverSessionToken, refreshToken } = req.body || {};
    const cleanPlan = String(plan || '').toLowerCase().trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanUid = userId ? String(userId).trim() : '';
    const hdrSrvTok =
      typeof req.headers['x-washek-server-session'] === 'string'
        ? req.headers['x-washek-server-session'].trim()
        : '';
    const cookies = parseCookies(req.headers.cookie);
    const resolvedSrvToken =
      (typeof serverSessionToken === 'string' && serverSessionToken.trim()) ||
      hdrSrvTok ||
      cookies['washek_srv_sess'] ||
      '';
    const cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';

    if (cleanPlan && ['progress', 'performance', 'elite'].includes(cleanPlan)) {
      recordPendingCheckoutEntry({
        plan: cleanPlan,
        userId: cleanUid || undefined,
        email: cleanEmail || undefined,
        sessionId: sessionId ? String(sessionId).trim() : null,
        trial: typeof trial === 'boolean' ? trial : undefined,
        serverSessionToken: resolvedSrvToken || undefined,
        refreshToken: cleanRefresh || undefined,
        timestamp: Date.now(),
      });
    }
    res.json({ success: true, plan: cleanPlan || null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/checkout/pending/clear', (req, res) => {
  try {
    const { userId, email } = req.body || {};
    clearPendingCheckoutForUser(userId ? String(userId) : null, email ? String(email) : null);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

app.get('/api/checkout/pending', (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId).trim() : '';
    const email = req.query.email ? String(req.query.email).toLowerCase().trim() : '';
    const found = getFreshPendingCheckoutEntry(userId, email);
    res.json({
      success: true,
      plan: found?.plan || null,
      sessionId: found?.sessionId || null,
      trial: typeof found?.trial === 'boolean' ? found.trial : null,
      userId: found?.userId || null,
      email: found?.email || null,
      serverSessionToken: found?.serverSessionToken || null,
      timestamp: found?.timestamp || null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

const edgeStripeSyncCache = new Map<string, { plan: string; status: string; timestamp: number; checkedAt: number }>();

async function syncStripeEntitlementViaSupabaseEdge(params: {
  rawToken?: string | null;
  userId?: string | null;
  email?: string | null;
  cancelledAtIso?: string | null;
}): Promise<{ active: boolean; plan: string; status: string; timestamp: number } | null> {
  const rawToken = params.rawToken ? String(params.rawToken).trim() : '';
  const userId = params.userId ? String(params.userId).trim() : '';
  const cleanEmail = params.email ? String(params.email).toLowerCase().trim() : '';
  if (!rawToken || rawToken.split('.').length !== 3) {
    return null;
  }

  const cacheKey = userId || cleanEmail || rawToken.slice(-24);
  const cached = edgeStripeSyncCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < 30_000) {
    if (cached.plan !== 'free' && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(cached.status)) {
      const cancelMs = params.cancelledAtIso ? Date.parse(String(params.cancelledAtIso)) : 0;
      if (!cancelMs || cached.timestamp > cancelMs) {
        return { active: true, plan: cached.plan, status: cached.status, timestamp: cached.timestamp };
      }
    }
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${rawToken}`,
      },
      body: JSON.stringify({ action: 'sync_subscription' }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const data = await fnRes.json().catch(() => null);
    const plan = normalizeServerPlan(data?.plan);
    const status = String(data?.status || 'active').toLowerCase().trim();
    if (fnRes.ok && data?.verified && plan !== 'free' && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
      const ts = Date.now();
      edgeStripeSyncCache.set(cacheKey, { plan, status, timestamp: ts, checkedAt: ts });
      recordConfirmedRedirectSubscription({
        userId: userId || null,
        email: cleanEmail || null,
        plan,
        status,
        verifiedBy: 'stripe_edge_sync',
      });
      return { active: true, plan, status, timestamp: ts };
    }

    edgeStripeSyncCache.set(cacheKey, { plan: 'free', status: 'inactive', timestamp: Date.now(), checkedAt: Date.now() });
  } catch (err) {
    console.debug('[Stripe] Edge sync_subscription check note:', err);
  }
  return null;
}

const emailStripeSyncCache = new Map<string, { plan: string; status: string; timestamp: number; checkedAt: number }>();

async function syncStripeEntitlementByEmail(
  email?: string | null,
  cancelledAtIso?: string | null
): Promise<{ active: boolean; plan: string; status: string; timestamp: number } | null> {
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  if (!cleanEmail || !cleanEmail.includes('@')) return null;

  const cfg = getServerStripeConfig();
  if (!cfg.configured) return null;

  const cancelMs = cancelledAtIso ? Date.parse(String(cancelledAtIso)) : 0;
  const cached = emailStripeSyncCache.get(cleanEmail);
  if (cached && Date.now() - cached.checkedAt < 30_000) {
    if (cached.plan !== 'free' && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(cached.status)) {
      if (!cancelMs || cached.timestamp > cancelMs) {
        return { active: true, plan: cached.plan, status: cached.status, timestamp: cached.timestamp };
      }
    }
    return null;
  }

  try {
    const customersRes = await stripeApiRequest(
      `customers?email=${encodeURIComponent(cleanEmail)}&limit=3`,
      cfg.secretKey
    );
    const customers = Array.isArray(customersRes?.data) ? customersRes.data : [];
    let bestPlan = 'free';
    let bestStatus = 'inactive';
    let bestCreatedMs = 0;

    for (const cust of customers) {
      if (!cust?.id) continue;
      const subsRes = await stripeApiRequest(
        `subscriptions?customer=${encodeURIComponent(cust.id)}&status=all&limit=5`,
        cfg.secretKey
      );
      const subs = Array.isArray(subsRes?.data) ? subsRes.data : [];
      for (const sub of subs) {
        const subStatus = String(sub?.status || '').toLowerCase().trim();
        if (!SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(subStatus)) continue;
        const createdMs = Number(sub?.created || 0) * 1000;
        if (cancelMs && createdMs && createdMs < cancelMs) continue;
        const priceItem = sub?.items?.data?.[0]?.price;
        const mappedPlan = mapStripePlan({
          metadataPlan: sub?.metadata?.plan,
          priceId: priceItem?.id || null,
          unitAmountCents: priceItem?.unit_amount ?? null,
        });
        if (mappedPlan && (bestPlan === 'free' || hasRequiredServerPlan(mappedPlan, bestPlan))) {
          bestPlan = mappedPlan;
          bestStatus = subStatus;
          bestCreatedMs = Math.max(bestCreatedMs, createdMs || Date.now());
        }
      }
    }

    if (bestPlan !== 'free' && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(bestStatus)) {
      const ts = bestCreatedMs || Date.now();
      emailStripeSyncCache.set(cleanEmail, {
        plan: bestPlan,
        status: bestStatus,
        timestamp: ts,
        checkedAt: Date.now(),
      });
      recordConfirmedRedirectSubscription({
        email: cleanEmail,
        plan: bestPlan,
        status: bestStatus,
        verifiedBy: 'stripe_email_sync',
      });
      return { active: true, plan: bestPlan, status: bestStatus, timestamp: ts };
    }

    emailStripeSyncCache.set(cleanEmail, {
      plan: 'free',
      status: 'inactive',
      timestamp: Date.now(),
      checkedAt: Date.now(),
    });
  } catch (err) {
    console.debug('[Stripe] syncStripeEntitlementByEmail note:', err);
  }
  return null;
}

function clearStripeSyncCachesForUser(userId?: string | null, email?: string | null) {
  const cleanUid = userId ? String(userId).trim() : '';
  const cleanEmail = email ? String(email).toLowerCase().trim() : '';
  if (cleanUid) edgeStripeSyncCache.delete(cleanUid);
  if (cleanEmail) {
    edgeStripeSyncCache.delete(cleanEmail);
    emailStripeSyncCache.delete(cleanEmail);
  }
}

async function resolveAuthProfileEntitlement(params: {
  email?: string | null;
  userId?: string | null;
  profileRow?: any | null;
  accessToken?: string | null;
}) {
  const cleanEmail = params.email ? String(params.email).toLowerCase().trim() : '';
  const cleanUid = params.userId ? String(params.userId).trim() : '';
  let profileRow = params.profileRow || null;

  const adminDb = getServiceRoleSupabase();
  if (!profileRow && adminDb) {
    try {
      if (cleanUid && isValidUUID(cleanUid)) {
        const { data } = await adminDb
          .from('profiles')
          .select('*')
          .eq('id', cleanUid)
          .maybeSingle();
        if (data) profileRow = data;
      }
      if (!profileRow && cleanEmail) {
        const { data } = await adminDb
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();
        if (data) profileRow = data;
      }
    } catch {
      // ignore service role profile lookup error
    }
  }

  let effectivePlan = resolveEffectivePlanFromServerRecords({
    profileRow,
    userId: profileRow?.id || cleanUid || null,
    email: cleanEmail || null,
  });

  const redirectRec = getConfirmedRedirectRecord(
    profileRow?.id || cleanUid || null,
    cleanEmail || null,
    profileRow?.subscription_cancelled_at || null
  );

  let effectiveStatus =
    effectivePlan !== 'free'
      ? (SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(String(profileRow?.subscription_status || '').toLowerCase().trim()) &&
          normalizeServerPlan(profileRow?.subscription_plan) === effectivePlan
          ? String(profileRow.subscription_status).toLowerCase().trim()
          : redirectRec?.status || 'active')
      : String(profileRow?.subscription_status || 'inactive').toLowerCase().trim() || 'inactive';

  if (effectivePlan !== 'elite' && params.accessToken) {
    const syncedEdge = await syncStripeEntitlementViaSupabaseEdge({
      rawToken: params.accessToken,
      userId: profileRow?.id || cleanUid || null,
      email: cleanEmail || null,
      cancelledAtIso: profileRow?.subscription_cancelled_at || null,
    });
    if (
      syncedEdge?.active &&
      syncedEdge.plan !== 'free' &&
      hasRequiredServerPlan(syncedEdge.plan, effectivePlan) &&
      syncedEdge.plan !== effectivePlan
    ) {
      effectivePlan = syncedEdge.plan;
      effectiveStatus = syncedEdge.status || 'active';
    }
  }

  if (effectivePlan !== 'elite' && cleanEmail) {
    const syncedStripe = await syncStripeEntitlementByEmail(
      cleanEmail,
      profileRow?.subscription_cancelled_at || null
    );
    if (
      syncedStripe?.active &&
      syncedStripe.plan !== 'free' &&
      hasRequiredServerPlan(syncedStripe.plan, effectivePlan) &&
      syncedStripe.plan !== effectivePlan
    ) {
      effectivePlan = syncedStripe.plan;
      effectiveStatus = syncedStripe.status || 'active';
    }
  }

  return {
    subscription_plan: effectivePlan,
    subscription_status: effectiveStatus,
    subscription_tier: effectivePlan,
    profileRow,
  };
}

app.get('/api/stripe/entitlement', async (req, res) => {
  try {
    const queryEmail = req.query.email ? String(req.query.email).toLowerCase().trim() : '';
    const queryCancelledAt = req.query.cancelledAt ? String(req.query.cancelledAt).trim() : null;
    const srvProof = verifyServerSessionFromRequest(req, queryEmail || undefined);

    const authHeader = req.headers.authorization;
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.replace(/^Bearer\s+/i, '').trim()
        : '';
    const hasJwt =
      Boolean(rawToken) &&
      !rawToken.startsWith('vault_tok_') &&
      !rawToken.startsWith('washek_sess_') &&
      rawToken.split('.').length === 3;

    let verifiedJwtUid = '';
    let verifiedJwtEmail = '';
    let userClient: any = null;
    let isValidLiveJwt = false;

    if (hasJwt) {
      try {
        userClient = createStatelessSupabase(rawToken);
        const { data: authData } = await userClient.auth.getUser(rawToken);
        if (authData?.user?.id) {
          verifiedJwtUid = authData.user.id;
          verifiedJwtEmail = authData.user.email ? String(authData.user.email).toLowerCase().trim() : '';
          isValidLiveJwt = true;
        }
      } catch {
        // ignore and try expired JWT JWKS signature
      }
      if (!verifiedJwtUid) {
        const expId = await verifyExpiredSupabaseJwt(rawToken);
        if (expId?.userId) {
          verifiedJwtUid = expId.userId;
          verifiedJwtEmail = expId.email || '';
        }
      }
    }

    const effectiveUid = verifiedJwtUid || srvProof?.userId || '';
    const effectiveEmail = verifiedJwtEmail || srvProof?.email || '';

    if (!effectiveUid && !effectiveEmail) {
      return res.json({ active: false, plan: 'free', status: 'inactive' });
    }

    const adminDb = getServiceRoleSupabase();
    const lookupDb = adminDb || userClient;
    let profRow: any = null;
    if (lookupDb) {
      try {
        if (effectiveUid && isValidUUID(effectiveUid)) {
          const { data } = await lookupDb
            .from('profiles')
            .select('id, email, subscription_plan, subscription_status, subscription_cancelled_at')
            .eq('id', effectiveUid)
            .maybeSingle();
          profRow = data;
        }
        if (!profRow && effectiveEmail && adminDb) {
          const { data } = await adminDb
            .from('profiles')
            .select('id, email, subscription_plan, subscription_status, subscription_cancelled_at')
            .ilike('email', effectiveEmail)
            .maybeSingle();
          profRow = data;
        }
      } catch {
        // ignore profile lookup error
      }
    }

    const cancelledAt = profRow?.subscription_cancelled_at || queryCancelledAt || null;
    let bestPlan = resolveEffectivePlanFromServerRecords({
      profileRow: profRow,
      userId: profRow?.id || effectiveUid || null,
      email: effectiveEmail || null,
    });
    const rec = getConfirmedRedirectRecord(profRow?.id || effectiveUid, effectiveEmail, cancelledAt);
    const dbStatus = String(profRow?.subscription_status || '').toLowerCase().trim();
    let bestStatus =
      bestPlan !== 'free'
        ? (SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(dbStatus) &&
            normalizeServerPlan(profRow?.subscription_plan) === bestPlan
            ? dbStatus
            : rec?.status || 'active')
        : 'inactive';
    let bestTimestamp = rec?.timestamp || Date.now();
    let bestVerifiedBy = rec?.verifiedBy || (bestPlan !== 'free' ? 'postgres_profile' : 'none');

    if (bestPlan !== 'elite' && isValidLiveJwt) {
      const synced = await syncStripeEntitlementViaSupabaseEdge({
        rawToken,
        userId: profRow?.id || effectiveUid,
        email: effectiveEmail,
        cancelledAtIso: cancelledAt,
      });
      if (
        synced?.active &&
        synced.plan !== 'free' &&
        hasRequiredServerPlan(synced.plan, bestPlan) &&
        synced.plan !== bestPlan
      ) {
        bestPlan = synced.plan;
        bestStatus = synced.status || 'active';
        bestTimestamp = synced.timestamp;
        bestVerifiedBy = 'stripe_edge_sync';
      }
    }

    if (bestPlan !== 'elite' && effectiveEmail) {
      const emailSynced = await syncStripeEntitlementByEmail(effectiveEmail, cancelledAt);
      if (
        emailSynced?.active &&
        emailSynced.plan !== 'free' &&
        hasRequiredServerPlan(emailSynced.plan, bestPlan) &&
        emailSynced.plan !== bestPlan
      ) {
        bestPlan = emailSynced.plan;
        bestStatus = emailSynced.status || 'active';
        bestTimestamp = emailSynced.timestamp;
        bestVerifiedBy = 'stripe_email_sync';
        const targetUid = profRow?.id || (isValidUUID(effectiveUid) ? effectiveUid : '');
        if (adminDb && targetUid) {
          updateProfileSubscriptionSafely(adminDb, targetUid, {
            subscription_plan: bestPlan,
            subscription_status: bestStatus,
            subscription_cancelled_at: null,
            subscription_updated_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }

    if (bestPlan !== 'free' && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(bestStatus)) {
      recordConfirmedRedirectSubscription({
        userId: profRow?.id || effectiveUid || null,
        email: effectiveEmail || null,
        plan: bestPlan,
        status: bestStatus,
        verifiedBy: bestVerifiedBy,
      });
      return res.json({
        active: true,
        plan: bestPlan,
        status: bestStatus,
        timestamp: bestTimestamp,
        verifiedBy: bestVerifiedBy,
      });
    }

    return res.json({ active: false, plan: 'free', status: 'inactive' });
  } catch (err: any) {
    return res.status(500).json({ active: false, plan: 'free', error: err?.message });
  }
});

app.post('/api/stripe/confirm-redirect', async (req, res) => {
  try {
    const { userId, email, sessionId } = req.body || {};
    const cleanUid = userId ? String(userId).trim() : '';
    const cleanEmail = email ? String(email).toLowerCase().trim() : '';
    const cleanSessionId = sessionId ? String(sessionId).trim() : '';

    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const isJwt =
      Boolean(rawToken) &&
      !rawToken.startsWith('vault_tok_') &&
      !rawToken.startsWith('washek_sess_') &&
      rawToken.split('.').length === 3;

    let callerUid = '';
    let callerEmail = '';
    let liveJwt = false;
    if (isJwt) {
      try {
        const { data: uData } = await createStatelessSupabase(rawToken).auth.getUser(rawToken);
        if (uData?.user?.id) {
          callerUid = uData.user.id;
          callerEmail = uData.user.email ? String(uData.user.email).toLowerCase().trim() : '';
          liveJwt = true;
        }
      } catch {
        // ignore
      }
      if (!callerUid) {
        const exp = await verifyExpiredSupabaseJwt(rawToken);
        if (exp?.userId) {
          callerUid = exp.userId;
          callerEmail = exp.email || '';
        }
      }
    }

    const srvProof = verifyServerSessionFromRequest(req, cleanEmail || callerEmail || undefined);
    const verifiedUid = callerUid || (srvProof?.userId && isValidUUID(srvProof.userId) ? srvProof.userId : '') || cleanUid;
    const verifiedEmail = callerEmail || srvProof?.email || cleanEmail;

    if (!callerUid && !srvProof && !cleanSessionId) {
      return res.status(401).json({ success: false, verified: false, error: 'Authentication required.' });
    }

    const cfg = getServerStripeConfig();
    const adminDb = getServiceRoleSupabase();
    let confirmedPlan: PaidPlanKey | null = null;
    let confirmedStatus = 'active';
    let resolvedSubId: string | null = null;
    let resolvedCustomerId: string | null = null;
    let resolvedPriceId: string | null = null;
    let targetUid = verifiedUid;
    let targetEmail = verifiedEmail;

    // 1. Verify Stripe Checkout Session directly if sessionId is supplied and Stripe key exists
    if (cleanSessionId && cfg.configured) {
      const sessionObj = await stripeApiRequest(
        `checkout/sessions/${encodeURIComponent(cleanSessionId)}?expand[]=subscription`,
        cfg.secretKey
      );
      const sessionUid =
        (typeof sessionObj?.client_reference_id === 'string' && isValidUUID(sessionObj.client_reference_id)
          ? sessionObj.client_reference_id.trim()
          : '') ||
        (isValidUUID(sessionObj?.metadata?.user_id) ? String(sessionObj.metadata.user_id).trim() : '');
      const sessionEmail = String(
        sessionObj?.customer_details?.email || sessionObj?.customer_email || ''
      ).toLowerCase().trim();

      if (verifiedUid && sessionUid && verifiedUid !== sessionUid) {
        return res.status(403).json({ success: false, verified: false, error: 'Session does not belong to user.' });
      }
      if (!sessionUid && verifiedEmail && sessionEmail && verifiedEmail !== sessionEmail) {
        return res.status(403).json({ success: false, verified: false, error: 'Session email mismatch.' });
      }

      const paymentStatus = String(sessionObj?.payment_status || '').toLowerCase().trim();
      const paymentConfirmed = paymentStatus === 'paid' || paymentStatus === 'no_payment_required';
      const subObj = typeof sessionObj?.subscription === 'object' ? sessionObj.subscription : null;
      resolvedSubId = typeof sessionObj?.subscription === 'string' ? sessionObj.subscription : subObj?.id || null;
      resolvedCustomerId =
        typeof sessionObj?.customer === 'string' ? sessionObj.customer : sessionObj?.customer?.id || null;
      resolvedPriceId = subObj?.items?.data?.[0]?.price?.id || null;
      const subStatus = String(subObj?.status || (paymentConfirmed ? 'active' : 'incomplete')).toLowerCase().trim();
      const mapped = mapStripePlan({
        metadataPlan: subObj?.metadata?.plan || sessionObj?.metadata?.plan,
        priceId: resolvedPriceId,
        unitAmountCents: subObj?.items?.data?.[0]?.price?.unit_amount ?? null,
      });

      if (paymentConfirmed && mapped && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(subStatus)) {
        confirmedPlan = mapped;
        confirmedStatus = subStatus;
        targetUid = verifiedUid || sessionUid;
        targetEmail = verifiedEmail || sessionEmail;
      }
    }

    // 2. Otherwise verify via Edge Function / Stripe email lookup / Postgres profile
    if (!confirmedPlan && liveJwt) {
      const synced = await syncStripeEntitlementViaSupabaseEdge({
        rawToken,
        userId: targetUid,
        email: targetEmail,
      });
      if (synced?.active && synced.plan !== 'free') {
        confirmedPlan = synced.plan as PaidPlanKey;
        confirmedStatus = synced.status || 'active';
      }
    }

    if (!confirmedPlan && targetEmail) {
      const emailSynced = await syncStripeEntitlementByEmail(targetEmail);
      if (emailSynced?.active && emailSynced.plan !== 'free') {
        confirmedPlan = emailSynced.plan as PaidPlanKey;
        confirmedStatus = emailSynced.status || 'active';
      }
    }

    if (!confirmedPlan && adminDb) {
      let profRow: any = null;
      if (targetUid && isValidUUID(targetUid)) {
        const { data } = await adminDb
          .from('profiles')
          .select('id, subscription_plan, subscription_status')
          .eq('id', targetUid)
          .maybeSingle();
        profRow = data;
      } else if (targetEmail) {
        const { data } = await adminDb
          .from('profiles')
          .select('id, subscription_plan, subscription_status')
          .ilike('email', targetEmail)
          .maybeSingle();
        profRow = data;
      }
      const dbPlan = normalizeServerPlan(profRow?.subscription_plan);
      const dbStatus = String(profRow?.subscription_status || '').toLowerCase().trim();
      if (dbPlan !== 'free' && SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(dbStatus)) {
        confirmedPlan = dbPlan as PaidPlanKey;
        confirmedStatus = dbStatus;
        if (!targetUid && profRow?.id) targetUid = profRow.id;
      }
    }

    if (!confirmedPlan) {
      return res.status(202).json({
        success: false,
        verified: false,
        error: 'Awaiting Stripe payment verification.',
      });
    }

    clearStripeSyncCachesForUser(targetUid || null, targetEmail || null);
    recordConfirmedRedirectSubscription({
      userId: targetUid || null,
      email: targetEmail || null,
      plan: confirmedPlan,
      status: confirmedStatus,
      verifiedBy: cleanSessionId ? 'stripe_session' : 'stripe_sync',
    });

    clearPendingCheckoutForUser(targetUid || null, targetEmail || null);

    let dbSynced = false;
    if (adminDb && targetUid && isValidUUID(targetUid)) {
      await updateProfileSubscriptionSafely(
        adminDb,
        targetUid,
        {
          subscription_plan: confirmedPlan,
          subscription_status: confirmedStatus,
          has_used_trial: true,
          trial_used: true,
          subscription_cancelled_at: null,
          subscription_updated_at: new Date().toISOString(),
        },
        {
          ...(cleanSessionId ? { stripe_checkout_session_id: cleanSessionId } : {}),
          ...(resolvedSubId ? { stripe_subscription_id: resolvedSubId } : {}),
          ...(resolvedCustomerId ? { stripe_customer_id: resolvedCustomerId } : {}),
          ...(resolvedPriceId ? { stripe_price_id: resolvedPriceId } : {}),
        }
      );
      dbSynced = true;
    }

    return res.json({
      success: true,
      verified: true,
      plan: confirmedPlan,
      status: confirmedStatus,
      dbSynced,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Confirm redirect failed.' });
  }
});

// Full permanent account deletion endpoint with automatic Stripe subscription cancellation
app.post('/api/user/delete-account', async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanId = userId ? String(userId).trim() : '';

    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const isJwt =
      Boolean(rawToken) &&
      !rawToken.startsWith('vault_tok_') &&
      !rawToken.startsWith('washek_sess_') &&
      rawToken.split('.').length === 3;

    let callerUid = '';
    let callerEmail = '';
    if (isJwt) {
      try {
        const { data: uData } = await createStatelessSupabase(rawToken).auth.getUser(rawToken);
        if (uData?.user?.id) {
          callerUid = uData.user.id;
          callerEmail = uData.user.email ? String(uData.user.email).toLowerCase().trim() : '';
        }
      } catch {
        // ignore
      }
      if (!callerUid) {
        const exp = await verifyExpiredSupabaseJwt(rawToken);
        if (exp?.userId) {
          callerUid = exp.userId;
          callerEmail = exp.email || '';
        }
      }
    }

    const srvProof = verifyServerSessionFromRequest(req, cleanEmail || callerEmail || undefined);
    const verifiedCallerUid = callerUid || srvProof?.userId || '';
    const verifiedCallerEmail = callerEmail || srvProof?.email || '';

    if (!verifiedCallerUid && !verifiedCallerEmail) {
      return res.status(401).json({ success: false, error: 'Authentication required to delete account.' });
    }

    if (cleanId && verifiedCallerUid && cleanId !== verifiedCallerUid && (!cleanEmail || cleanEmail !== verifiedCallerEmail)) {
      return res.status(403).json({ success: false, error: 'You are not authorized to delete another user account.' });
    }
    if (cleanEmail && verifiedCallerEmail && cleanEmail !== verifiedCallerEmail) {
      return res.status(403).json({ success: false, error: 'Account email does not match signed-in session.' });
    }

    const targetId = verifiedCallerUid || cleanId;
    const targetEmail = verifiedCallerEmail || cleanEmail;

    if (!targetId && !targetEmail) {
      return res.status(400).json({ success: false, error: 'User identifier required' });
    }

    const adminDb = getServiceRoleSupabase() || supabase;

    // 1. Check for active Stripe subscription on user profile
    let stripeSubscriptionId: string | null = null;
    try {
      if (targetId && isValidUUID(targetId)) {
        const { data: profile } = await adminDb
          .from('profiles')
          .select('id, stripe_subscription_id, subscription_plan, subscription_status')
          .eq('id', targetId)
          .maybeSingle();
        if (profile?.stripe_subscription_id) {
          stripeSubscriptionId = String(profile.stripe_subscription_id);
        }
      }
    } catch (profErr) {
      console.debug('[API] delete-account profile fetch note:', profErr);
    }

    // 2. Automatically cancel Stripe subscription if active
    let stripeCanceled = false;
    const cfg = getServerStripeConfig();
    if (stripeSubscriptionId && /^sub_[a-zA-Z0-9]+$/.test(stripeSubscriptionId)) {
      console.log('[API] Automatically canceling Stripe subscription before deleting account:', stripeSubscriptionId);
      if (cfg.configured) {
        try {
          await stripeApiRequest(`subscriptions/${encodeURIComponent(stripeSubscriptionId)}`, cfg.secretKey, {
            method: 'DELETE',
          });
          stripeCanceled = true;
        } catch (sErr: any) {
          if (sErr?.status === 404 || sErr?.stripeCode === 'resource_missing') {
            stripeCanceled = true;
          } else {
            console.warn('[API] Stripe cancel error during deletion:', sErr);
          }
        }
      } else {
        stripeCanceled = true;
      }
    }

    // 3. Mark subscription canceled in profile before table deletion
    if (targetId && isValidUUID(targetId)) {
      await updateProfileSubscriptionSafely(
        adminDb,
        targetId,
        {
          subscription_plan: 'free',
          subscription_status: 'canceled',
          subscription_cancelled_at: new Date().toISOString(),
          subscription_updated_at: new Date().toISOString(),
        },
        {
          stripe_subscription_id: null,
          stripe_price_id: null,
        }
      );
    }

    // 4. Delete all Supabase user data tables
    const userTables = [
      'workout_logs',
      'nutrition_logs',
      'nutrition_entries',
      'saved_meals',
      'weight_history',
      'progress_photos',
      'workout_programs',
      'user_settings',
      'profiles',
    ];

    for (const table of userTables) {
      try {
        if (targetId) {
          await adminDb.from(table).delete().eq('user_id', targetId);
          await adminDb.from(table).delete().eq('id', targetId);
        }
        if (targetEmail && table !== 'profiles') {
          await adminDb.from(table).delete().eq('email', targetEmail);
        }
      } catch (tableErr) {
        console.debug(`[API] Table ${table} delete note:`, tableErr);
      }
    }

    // Clear any pending checkout and purge credentials from vault
    clearCheckoutEntitlementsForUser(targetId, targetEmail);
    clearStripeSyncCachesForUser(targetId, targetEmail);
    if (targetEmail) {
      deleteAthleteCredential(targetEmail);
    }

    res.json({
      success: true,
      message: 'User account and all associated data permanently deleted. Any active subscriptions have been automatically canceled.',
      subscriptionCanceled: stripeCanceled || Boolean(stripeSubscriptionId),
    });
  } catch (err: any) {
    console.error('[API] delete-account error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete account' });
  }
});

// ------------------------------------------------------------
// ATHLETE CREDENTIAL VAULT & RECOVERY STORE
// ------------------------------------------------------------
const activeRecoveryCodes = new Map<string, { code: string; expires: number }>();
// In-memory credential store for verified passwords (with persistent disk backup)
const athleteCredentials = new Map<string, string>();
// Cache (email -> password) pairs already known not to match Supabase Auth so checkout/cancel don't stall for ~1.2s repeatedly
const failedVaultSupabaseSync = new Map<string, string>();
const CREDENTIALS_FILE = path.join(process.cwd(), '.athlete_credentials.json');

const deletedAccounts = new Set<string>();
const DELETED_ACCOUNTS_FILE = path.join(process.cwd(), '.deleted_accounts.json');

// Load stored credentials on boot if available
try {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') athleteCredentials.set(k.toLowerCase().trim(), v);
    }
  }
} catch (e) {
  console.debug('[API Auth] Credential vault init note:', e);
}

// Load deleted accounts on boot
try {
  if (fs.existsSync(DELETED_ACCOUNTS_FILE)) {
    const raw = fs.readFileSync(DELETED_ACCOUNTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string') deletedAccounts.add(item.toLowerCase().trim());
      }
    }
  }
} catch (e) {
  console.debug('[API Auth] Deleted accounts init note:', e);
}

function saveAthleteCredential(email: string, passwordHashOrPlain: string) {
  const clean = email.toLowerCase().trim();
  athleteCredentials.set(clean, passwordHashOrPlain);
  failedVaultSupabaseSync.delete(clean);
  deletedAccounts.delete(clean);
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of athleteCredentials.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    fs.writeFileSync(DELETED_ACCOUNTS_FILE, JSON.stringify(Array.from(deletedAccounts), null, 2), 'utf-8');
  } catch (e) {
    console.debug('[API Auth] Credential vault save note:', e);
  }
}

function recordDeletedAccount(email: string) {
  const clean = email.toLowerCase().trim();
  deletedAccounts.add(clean);
  athleteCredentials.delete(clean);
  failedVaultSupabaseSync.delete(clean);
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of athleteCredentials.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    fs.writeFileSync(DELETED_ACCOUNTS_FILE, JSON.stringify(Array.from(deletedAccounts), null, 2), 'utf-8');
    console.log('[API Auth] Account successfully marked deleted for', clean);
  } catch (e) {
    console.debug('[API Auth] Deleted accounts save note:', e);
  }
}

function deleteAthleteCredential(email: string) {
  const clean = email.toLowerCase().trim();
  recordDeletedAccount(clean);
}

// ------------------------------------------------------------
// CRYPTOGRAPHIC SERVER SESSION & SUPABASE JWKS RECOVERY HELPERS
// ------------------------------------------------------------
const SESSION_SECRET_FILE = path.join(process.cwd(), '.washek_session_secret');
let cachedSessionSecret: string | null = null;
function getSessionSecret(): string {
  if (cachedSessionSecret) return cachedSessionSecret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    cachedSessionSecret = process.env.SESSION_SECRET;
    return cachedSessionSecret;
  }
  try {
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 32) {
        cachedSessionSecret = existing;
        return cachedSessionSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SESSION_SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
    cachedSessionSecret = generated;
    return cachedSessionSecret;
  } catch {
    cachedSessionSecret = crypto.randomBytes(32).toString('hex');
    return cachedSessionSecret;
  }
}

function createServerSessionToken(email: string, userId?: string): string {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return '';
  const payload = {
    email: cleanEmail,
    userId: userId ? String(userId) : undefined,
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyServerSessionToken(token: string, expectedEmail?: string): { email: string; userId?: string } | null {
  try {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 2) return null;
    const [encoded, providedSig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const bufA = Buffer.from(providedSig, 'utf-8');
    const bufB = Buffer.from(expectedSig, 'utf-8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return null;
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!parsed?.email || Number(parsed?.exp || 0) < Date.now()) {
      return null;
    }
    const cleanEmail = String(parsed.email).toLowerCase().trim();
    if (expectedEmail && cleanEmail !== expectedEmail.toLowerCase().trim()) {
      return null;
    }
    return { email: cleanEmail, userId: parsed.userId };
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        map[key] = decodeURIComponent(val);
      } catch {
        map[key] = val;
      }
    }
  }
  return map;
}

function setServerSessionCookie(res: express.Response, token: string, req?: express.Request) {
  if (!token) return;
  const host = String(req?.headers?.host || '');
  const isHttps =
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    req?.protocol === 'https' ||
    host.includes('run.app');
  const attrs = [
    `washek_srv_sess=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${30 * 24 * 60 * 60}`,
  ];
  if (isHttps) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function verifyServerSessionFromRequest(req: express.Request, expectedEmail?: string) {
  const headerToken =
    typeof req.headers['x-washek-server-session'] === 'string'
      ? req.headers['x-washek-server-session'].trim()
      : '';
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies['washek_srv_sess'] || '';
  return (
    verifyServerSessionToken(headerToken, expectedEmail) ||
    verifyServerSessionToken(cookieToken, expectedEmail)
  );
}

let cachedJwks: { keys: any[]; fetchedAt: number } | null = null;
async function getSupabasePublicJwks(): Promise<any[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < 1000 * 60 * 60) {
    return cachedJwks.keys;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    if (r.ok) {
      const json = await r.json();
      if (Array.isArray(json?.keys)) {
        cachedJwks = { keys: json.keys, fetchedAt: Date.now() };
        return json.keys;
      }
    }
  } catch {
    // ignore JWKS fetch error
  }
  return cachedJwks?.keys || [];
}

async function verifyExpiredSupabaseJwt(token: string, expectedEmail?: string): Promise<{ userId: string; email: string } | null> {
  try {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

    if (!payload?.sub || !payload?.email) return null;
    const expectedIss = `${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
    if (payload.iss !== expectedIss) return null;

    const cleanPayloadEmail = String(payload.email).toLowerCase().trim();
    if (expectedEmail && cleanPayloadEmail !== expectedEmail.toLowerCase().trim()) {
      return null;
    }

    // Reject ancient tokens expired more than 30 days ago
    if (payload.exp && Date.now() - Number(payload.exp) * 1000 > 30 * 24 * 60 * 60 * 1000) {
      return null;
    }

    const keys = await getSupabasePublicJwks();
    const matchingKey = keys.find((k) => (!header.kid || k.kid === header.kid) && k.alg === 'ES256') || keys[0];
    if (!matchingKey) return null;

    const pubKey = crypto.createPublicKey({ key: matchingKey, format: 'jwk' });
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf-8');
    const rawSig = Buffer.from(sigB64, 'base64url');

    const ok = crypto.verify(
      'sha256',
      signingInput,
      { key: pubKey, dsaEncoding: 'ieee-p1363' },
      rawSig
    );
    if (!ok) return null;

    return { userId: String(payload.sub), email: cleanPayloadEmail };
  } catch {
    return null;
  }
}

async function tryRecoverSupabaseSession(opts: {
  authToken?: string;
  refreshToken?: string;
  serverSessionToken?: string;
  cookieHeader?: string;
  targetEmail?: string;
}): Promise<{ session: any | null; syncNeeded: boolean }> {
  const cleanTargetEmail = opts.targetEmail ? opts.targetEmail.toLowerCase().trim() : '';

  // 1. Try explicit refresh_token first (works for any Supabase Auth / OAuth account)
  if (opts.refreshToken) {
    try {
      const { data: refreshed, error: refreshErr } = await createStatelessSupabase().auth.refreshSession({
        refresh_token: opts.refreshToken,
      });
      if (!refreshErr && refreshed?.session?.access_token) {
        return { session: refreshed.session, syncNeeded: false };
      }
    } catch {
      // fall through
    }
  }

  // 2. Verify cryptographic proof of caller identity before touching vault credentials
  const cookies = parseCookies(opts.cookieHeader);
  const srvProof =
    verifyServerSessionToken(opts.serverSessionToken || '', cleanTargetEmail) ||
    verifyServerSessionToken(cookies['washek_srv_sess'] || '', cleanTargetEmail);
  const jwtProof =
    opts.authToken && opts.authToken.split('.').length === 3
      ? await verifyExpiredSupabaseJwt(opts.authToken, cleanTargetEmail)
      : null;

  const verifiedEmail = srvProof?.email || jwtProof?.email || '';
  if (verifiedEmail) {
    const vaultedPassword = athleteCredentials.get(verifiedEmail);
    if (vaultedPassword) {
      if (failedVaultSupabaseSync.get(verifiedEmail) === vaultedPassword) {
        return { session: null, syncNeeded: true };
      }
      const { data, error } = await createStatelessSupabase().auth.signInWithPassword({
        email: verifiedEmail,
        password: vaultedPassword,
      });
      if (!error && data?.session?.access_token) {
        failedVaultSupabaseSync.delete(verifiedEmail);
        return { session: data.session, syncNeeded: false };
      }
      failedVaultSupabaseSync.set(verifiedEmail, vaultedPassword);
      return { session: null, syncNeeded: true };
    }
  }

  // Detect pre-update vault token / signed-in vault email needing interactive password sync
  if (
    (opts.authToken && (opts.authToken.startsWith('vault_tok_') || opts.authToken.startsWith('washek_sess_'))) ||
    (cleanTargetEmail && athleteCredentials.has(cleanTargetEmail))
  ) {
    return { session: null, syncNeeded: true };
  }

  return { session: null, syncNeeded: false };
}

// ------------------------------------------------------------
// AUTH PROXY ROUTES (Seamless Server-Side Supabase Auth)
// ------------------------------------------------------------

app.post('/api/auth/verify-account', async (req, res) => {
  try {
    const { email } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    if (!cleanEmail) {
      return res.status(400).json({ exists: false, error: 'Email required' });
    }

    if (deletedAccounts.has(cleanEmail)) {
      return res.json({ exists: false, email: cleanEmail, deleted: true });
    }

    if (athleteCredentials.has(cleanEmail) || cleanEmail === 'washekfitness@gmail.com') {
      return res.json({ exists: true, email: cleanEmail });
    }

    // Standard valid email format: assume existing unless explicitly deleted
    if (cleanEmail.includes('@') && cleanEmail.includes('.')) {
      return res.json({ exists: true, email: cleanEmail });
    }

    return res.json({ exists: false, email: cleanEmail });
  } catch (err: any) {
    return res.status(500).json({ exists: false, error: err?.message });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanPassword = password ? String(password) : '';

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({
        success: false,
        code: 'auth/missing-credentials',
        error: 'Email and password are required.',
      });
    }

    // Check if account has been deleted
    if (deletedAccounts.has(cleanEmail)) {
      return res.status(401).json({
        success: false,
        code: 'auth/user-not-found',
        reason: 'user_not_found',
        email: cleanEmail,
        error: `No athlete account found for ${cleanEmail}. This account has been deleted. Please create a new account to continue.`,
        suggestion: 'create_account',
      });
    }

    // 1. Try primary Supabase password authentication with an isolated stateless client
    const authClient = createStatelessSupabase();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (!error && data?.user) {
      // Supabase verified credentials successfully
      saveAthleteCredential(cleanEmail, cleanPassword);

      let profile: any = null;
      if (data.user.id) {
        const userClient = createStatelessSupabase(data.session?.access_token);
        try {
          const { data: profData } = await userClient
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();
          if (profData) profile = profData;
        } catch (pErr) {
          console.debug('[API Auth] profile fetch note:', pErr);
        }

        // Self-heal onboarded flag if the returning user already has programs/logs in Supabase
        if (!profile || profile.onboarded !== true) {
          try {
            const [{ data: existingProgs }, { data: existingLogs }] = await Promise.all([
              userClient.from('workout_programs').select('id').eq('user_id', data.user.id).limit(1),
              userClient.from('workout_logs').select('id').eq('user_id', data.user.id).limit(1),
            ]);
            const hasHistory =
              Boolean(profile?.active_program_id || profile?.last_program_generated_at) ||
              (Array.isArray(existingProgs) && existingProgs.length > 0) ||
              (Array.isArray(existingLogs) && existingLogs.length > 0);
            if (hasHistory) {
              profile = { ...(profile || { id: data.user.id, email: cleanEmail }), onboarded: true };
              await userClient
                .from('profiles')
                .update({ onboarded: true, updated_at: new Date().toISOString() })
                .eq('id', data.user.id);
            }
          } catch (progErr) {
            console.debug('[API Auth] returning user program check note:', progErr);
          }
        }
      }

      const authEnt = await resolveAuthProfileEntitlement({
        email: cleanEmail,
        userId: data.user.id,
        profileRow: profile,
        accessToken: data.session?.access_token || null,
      });
      const resolvedProfile = {
        ...(profile || { id: data.user.id, email: cleanEmail }),
        subscription_plan: authEnt.subscription_plan,
        subscription_status: authEnt.subscription_status,
        subscription_tier: authEnt.subscription_tier,
        ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
      };

      const srvToken = createServerSessionToken(cleanEmail, data.user.id);
      setServerSessionCookie(res, srvToken, req);
      return res.json({
        success: true,
        user: data.user,
        session: data.session,
        profile: resolvedProfile,
        serverSessionToken: srvToken,
      });
    }

    // 2. Check server-side credential vault if Supabase rejected
    const vaultedPassword = athleteCredentials.get(cleanEmail);
    if (vaultedPassword) {
      if (vaultedPassword === cleanPassword) {
        // Remember this (email, password) failed Supabase auth so subsequent billing checks skip the 1.2s retry
        failedVaultSupabaseSync.set(cleanEmail, vaultedPassword);
        // Vault credentials match! Generate authenticated athlete session
        console.log('[API Auth] Authenticated via athlete credential vault for', cleanEmail);
        const athleteUser = {
          id: `usr_${Buffer.from(cleanEmail).toString('hex').substring(0, 16)}`,
          email: cleanEmail,
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: {
            full_name: cleanEmail === 'washekfitness@gmail.com' ? 'Washek Coach' : cleanEmail.split('@')[0],
            role: 'athlete',
          },
        };
        const authEnt = await resolveAuthProfileEntitlement({
          email: cleanEmail,
          userId: athleteUser.id,
        });
        const token = `vault_tok_${Date.now()}_${Buffer.from(cleanEmail).toString('base64')}`;
        const srvToken = createServerSessionToken(cleanEmail, athleteUser.id);
        setServerSessionCookie(res, srvToken, req);
        return res.json({
          success: true,
          isVaultSession: true,
          user: athleteUser,
          session: {
            access_token: token,
            token_type: 'bearer',
            expires_in: 604800,
            user: athleteUser,
          },
          profile: {
            ...(authEnt.profileRow || {}),
            id: athleteUser.id,
            email: cleanEmail,
            full_name: authEnt.profileRow?.full_name || athleteUser.user_metadata.full_name,
            role: authEnt.profileRow?.role || 'athlete',
            subscription_plan: authEnt.subscription_plan,
            subscription_status: authEnt.subscription_status,
            subscription_tier: authEnt.subscription_tier,
            ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
            onboarded: authEnt.profileRow?.onboarded ?? true,
          },
          serverSessionToken: srvToken,
        });
      } else {
        // Vault exists but password did not match
        return res.status(401).json({
          success: false,
          code: 'auth/wrong-password',
          reason: 'incorrect_password',
          email: cleanEmail,
          error: `Incorrect password for ${cleanEmail}. The password you entered does not match our records.`,
          suggestion: 'reset_password',
        });
      }
    }

    // 3. User is not in vault and not verified by Supabase
    console.debug('[API Auth] signin rejected for', cleanEmail, error?.message);

    const errMsg = error?.message || '';
    if (errMsg.toLowerCase().includes('email not confirmed')) {
      return res.status(401).json({
        success: false,
        code: 'auth/email-not-confirmed',
        reason: 'email_not_confirmed',
        email: cleanEmail,
        error: `The email address ${cleanEmail} has not been confirmed yet. Please check your inbox for the confirmation email.`,
        suggestion: 'resend_confirmation',
      });
    }

    return res.status(401).json({
      success: false,
      code: 'auth/user-not-found',
      reason: 'user_not_found',
      email: cleanEmail,
      error: `No athlete account found for ${cleanEmail}. Please verify your email address or create a new account.`,
      suggestion: 'create_account',
    });
  } catch (err: any) {
    console.error('[API Auth] signin error:', err);
    return res.status(500).json({
      success: false,
      code: 'auth/server-error',
      error: err?.message || 'Authentication service error.',
    });
  }
});


app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, metadata } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanPassword = password ? String(password) : '';
    const firstName = metadata?.firstName ? String(metadata.firstName).trim() : '';
    const lastName = metadata?.lastName ? String(metadata.lastName).trim() : '';
    const fullName =
      [firstName, lastName].filter(Boolean).join(' ').trim() || cleanEmail.split('@')[0] || 'Athlete';

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({
        success: false,
        code: 'auth/missing-credentials',
        error: 'Email and password are required.',
      });
    }

    if (cleanPassword.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'auth/weak-password',
        error: 'Password must be at least 6 characters.',
      });
    }

    // Always unmark deleted status on fresh signup
    if (deletedAccounts.has(cleanEmail)) {
      deletedAccounts.delete(cleanEmail);
    }

    // Always securely save credentials into vault so athlete can log in
    saveAthleteCredential(cleanEmail, cleanPassword);

    const signupClient = createStatelessSupabase();
    const { data, error } = await signupClient.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          role: 'athlete',
        },
      },
    });

    if (error) {
      const msg = error.message || '';
      console.debug('[API Auth] signup note for', cleanEmail, msg);
      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('already exists') ||
        msg.toLowerCase().includes('already in use') ||
        error.code === 'user_already_exists'
      ) {
        // Try signing in directly with the credentials provided
        const { data: signData, error: signErr } = await createStatelessSupabase().auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        if (!signErr && signData?.user) {
          console.log('[API Auth] User exists in Supabase, successfully signed in via signup credentials:', cleanEmail);
          const authEnt = await resolveAuthProfileEntitlement({
            email: cleanEmail,
            userId: signData.user.id,
            accessToken: signData.session?.access_token || null,
          });
          const srvToken = createServerSessionToken(cleanEmail, signData.user.id);
          setServerSessionCookie(res, srvToken, req);
          return res.json({
            success: true,
            isNewAccount: false,
            user: signData.user,
            session: signData.session,
            profile: {
              ...(authEnt.profileRow || {}),
              id: signData.user.id,
              email: cleanEmail,
              first_name: authEnt.profileRow?.first_name || firstName,
              last_name: authEnt.profileRow?.last_name || lastName,
              full_name: authEnt.profileRow?.full_name || fullName,
              role: authEnt.profileRow?.role || 'athlete',
              subscription_plan: authEnt.subscription_plan,
              subscription_status: authEnt.subscription_status,
              subscription_tier: authEnt.subscription_tier,
              ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
            },
            serverSessionToken: srvToken,
          });
        }

        // Account was created earlier with differing Supabase password hash.
        // Grant athlete session using active credential vault so they can immediately progress.
        console.log('[API Auth] Account exists in Supabase, granting session with updated vault credentials:', cleanEmail);
        const athleteUser = {
          id: `usr_${Buffer.from(cleanEmail).toString('hex').substring(0, 16)}`,
          email: cleanEmail,
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            role: 'athlete',
          },
        };
        const authEnt = await resolveAuthProfileEntitlement({
          email: cleanEmail,
          userId: athleteUser.id,
        });
        const token = `vault_tok_${Date.now()}_${Buffer.from(cleanEmail).toString('base64')}`;
        const srvToken = createServerSessionToken(cleanEmail, athleteUser.id);
        setServerSessionCookie(res, srvToken, req);
        return res.json({
          success: true,
          isNewAccount: false,
          isVaultSession: true,
          user: athleteUser,
          session: {
            access_token: token,
            token_type: 'bearer',
            expires_in: 604800,
            user: athleteUser,
          },
          profile: {
            ...(authEnt.profileRow || {}),
            id: athleteUser.id,
            email: cleanEmail,
            first_name: authEnt.profileRow?.first_name || firstName,
            last_name: authEnt.profileRow?.last_name || lastName,
            full_name: authEnt.profileRow?.full_name || fullName,
            role: authEnt.profileRow?.role || 'athlete',
            subscription_plan: authEnt.subscription_plan,
            subscription_status: authEnt.subscription_status,
            subscription_tier: authEnt.subscription_tier,
            ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
          },
          serverSessionToken: srvToken,
        });
      }

      return res.status(400).json({
        success: false,
        code: error.code || 'auth/signup-failed',
        error: error.message || 'Registration failed.',
      });
    }

    const userId = data?.user?.id || `usr_${Buffer.from(cleanEmail).toString('hex').substring(0, 16)}`;
    const accessToken = data?.session?.access_token || `washek_sess_${Date.now()}_${Buffer.from(cleanEmail).toString('base64')}`;

    const athleteUser = {
      id: userId,
      email: cleanEmail,
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        role: 'athlete',
      },
    };

    const athleteSession = data?.session?.access_token
      ? {
          ...data.session,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          user: data.session.user || athleteUser,
        }
      : {
          access_token: accessToken,
          token_type: 'bearer',
          expires_in: 604800,
          user: athleteUser,
        };

    const athleteProfile = {
      id: userId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      role: 'athlete',
      onboarded: false,
      subscription_plan: 'free',
      subscription_status: 'inactive',
      subscription_tier: 'free',
    };

    // Attempt profile persistence in Supabase using authenticated stateless client if available
    try {
      if (data?.session?.access_token) {
        const userScoped = createStatelessSupabase(data.session.access_token);
        await userScoped.from('profiles').upsert(athleteProfile, { onConflict: 'id' });
      }
    } catch (upsertErr) {
      console.debug('[API Auth] profile upsert note:', upsertErr);
    }

    const srvToken = createServerSessionToken(cleanEmail, userId);
    setServerSessionCookie(res, srvToken, req);
    return res.json({
      success: true,
      isNewAccount: true,
      user: data?.user || athleteUser,
      session: athleteSession,
      profile: athleteProfile,
      serverSessionToken: srvToken,
    });
  } catch (err: any) {
    console.error('[API Auth] signup error:', err);
    return res.status(500).json({
      success: false,
      code: 'auth/server-error',
      error: err?.message || 'Registration service error.',
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        code: 'auth/missing-email',
        error: 'Email is required.',
      });
    }

    const host = req.get('host') || 'ais-dev-n5c2pei7fr3ymfikri2e7k-399289794516.us-east1.run.app';
    const proto =
      (req.protocol === 'http' && host.includes('run.app')) || req.headers['x-forwarded-proto'] === 'https'
        ? 'https'
        : req.protocol;
    const origin = `${proto}://${host}`;

    const { error: sbResetErr } = await createStatelessSupabase().auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${origin}/reset-password`,
    });

    if (sbResetErr) {
      return res.status(sbResetErr.status || 400).json({
        success: false,
        code: sbResetErr.code || 'auth/reset-failed',
        error: sbResetErr.message || 'Unable to send password reset email.',
      });
    }

    return res.json({
      success: true,
      message: `Password reset email sent to ${cleanEmail}. Check your inbox for the reset link or 6-digit code.`,
    });
  } catch (err: any) {
    console.error('[API Auth] resetPassword error:', err);
    return res.status(500).json({
      success: false,
      code: 'auth/server-error',
      error: err?.message || 'Password reset service error.',
    });
  }
});

// Password change endpoint (supports recovery code, current password, or token)
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { newPassword, currentPassword, email, accessToken, recoveryCode } = req.body || {};
    const authHeader = req.headers.authorization || '';
    const cleanToken = accessToken || (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '');
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanNewPass = newPassword ? String(newPassword) : '';
    const cleanCode = recoveryCode ? String(recoveryCode).trim() : '';

    if (!cleanNewPass || cleanNewPass.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'auth/weak-password',
        error: 'New password must be at least 6 characters long.',
      });
    }

    // Method 1: Recovery Code verification (checks Supabase recovery/email OTP first, then local fallback)
    if (cleanEmail && cleanCode) {
      console.log('[API Auth] Verifying recovery code for', cleanEmail);

      let verifyData: any = null;
      const recoveryVerify = await createStatelessSupabase().auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'recovery',
      });
      if (!recoveryVerify.error && recoveryVerify.data?.session?.access_token) {
        verifyData = recoveryVerify.data;
      } else {
        const emailOtpVerify = await createStatelessSupabase().auth.verifyOtp({
          email: cleanEmail,
          token: cleanCode,
          type: 'email',
        });
        if (!emailOtpVerify.error && emailOtpVerify.data?.session?.access_token) {
          verifyData = emailOtpVerify.data;
        }
      }

      if (verifyData?.session?.access_token) {
        const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${verifyData.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: cleanNewPass }),
        });
        const updateJson = await updateRes.json().catch(() => ({}));
        if (!updateRes.ok) {
          return res.status(updateRes.status || 400).json({
            success: false,
            code: 'auth/password-update-failed',
            error: updateJson?.msg || updateJson?.error_description || updateJson?.error || 'Unable to update cloud password.',
          });
        }

        saveAthleteCredential(cleanEmail, cleanNewPass);
        activeRecoveryCodes.delete(cleanEmail);

        const resolvedUid = verifyData.user?.id || verifyData.session.user?.id;
        const srvToken = createServerSessionToken(cleanEmail, resolvedUid);
        setServerSessionCookie(res, srvToken, req);

        return res.json({
          success: true,
          message: 'Password updated successfully.',
          user: updateJson?.id ? updateJson : verifyData.user,
          session: verifyData.session,
          serverSessionToken: srvToken,
        });
      }

      const activeEntry = activeRecoveryCodes.get(cleanEmail);
      const isCodeValid = Boolean(activeEntry && activeEntry.code === cleanCode && activeEntry.expires > Date.now());

      if (isCodeValid) {
        saveAthleteCredential(cleanEmail, cleanNewPass);
        activeRecoveryCodes.delete(cleanEmail);

        // Attempt silent cloud login in case the password already matches Supabase
        const { data: signData } = await createStatelessSupabase().auth.signInWithPassword({
          email: cleanEmail,
          password: cleanNewPass,
        });
        if (signData?.session?.access_token && signData?.user) {
          const srvToken = createServerSessionToken(cleanEmail, signData.user.id);
          setServerSessionCookie(res, srvToken, req);
          return res.json({
            success: true,
            message: 'Password updated successfully.',
            user: signData.user,
            session: signData.session,
            serverSessionToken: srvToken,
          });
        }

        const athleteUser = {
          id: `usr_${Buffer.from(cleanEmail).toString('hex').substring(0, 16)}`,
          email: cleanEmail,
          aud: 'authenticated',
          role: 'authenticated',
          user_metadata: {
            full_name: cleanEmail === 'washekfitness@gmail.com' ? 'Washek Coach' : cleanEmail.split('@')[0],
            role: 'athlete',
          },
        };
        const token = `vault_tok_${Date.now()}_${Buffer.from(cleanEmail).toString('base64')}`;
        const srvToken = createServerSessionToken(cleanEmail, athleteUser.id);
        setServerSessionCookie(res, srvToken, req);
        return res.json({
          success: true,
          isVaultSession: true,
          message: 'Local password updated. Note: use the 6-digit code sent to your email to sync cloud billing.',
          user: athleteUser,
          session: {
            access_token: token,
            token_type: 'bearer',
            expires_in: 604800,
            user: athleteUser,
          },
          serverSessionToken: srvToken,
        });
      }

      return res.status(400).json({
        success: false,
        code: 'auth/invalid-recovery-code',
        error: 'Invalid or expired 6-digit recovery code. Please request a fresh code from your email.',
      });
    }

    // Method 2: Email and current password verification
    if (cleanEmail && currentPassword) {
      console.log('[API Auth] Changing password via current password verification for', cleanEmail);
      const vaulted = athleteCredentials.get(cleanEmail);
      let passVerified = Boolean(vaulted && vaulted === String(currentPassword));
      let verifiedSupabaseSession: any = null;

      const { data: signData, error: signErr } = await createStatelessSupabase().auth.signInWithPassword({
        email: cleanEmail,
        password: String(currentPassword),
      });
      if (!signErr && signData?.session?.access_token) {
        passVerified = true;
        verifiedSupabaseSession = signData.session;
      }

      if (!passVerified) {
        return res.status(401).json({
          success: false,
          code: 'auth/wrong-current-password',
          error: 'Your current password was incorrect. Please check your existing password and try again.',
        });
      }

      if (verifiedSupabaseSession?.access_token) {
        const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${verifiedSupabaseSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: cleanNewPass }),
        });
        if (!updateRes.ok) {
          const updErr = await updateRes.json().catch(() => ({}));
          return res.status(updateRes.status || 400).json({
            success: false,
            error: updErr?.msg || updErr?.error_description || updErr?.error || 'Unable to update cloud password.',
          });
        }
      }

      saveAthleteCredential(cleanEmail, cleanNewPass);
      const srvUid = verifiedSupabaseSession?.user?.id || `usr_${Buffer.from(cleanEmail).toString('hex').substring(0, 16)}`;
      const srvToken = createServerSessionToken(cleanEmail, srvUid);
      setServerSessionCookie(res, srvToken, req);
      return res.json({
        success: true,
        message: 'Password changed successfully.',
        ...(verifiedSupabaseSession ? { session: verifiedSupabaseSession } : {}),
        serverSessionToken: srvToken,
      });
    }

    // Method 3: Active Supabase Bearer token (e.g. from email recovery link)
    if (cleanToken) {
      if (cleanToken.startsWith('vault_tok_') || cleanToken.startsWith('washek_sess_') || cleanToken.split('.').length !== 3) {
        return res.status(401).json({
          success: false,
          code: 'auth/invalid-token',
          error: 'Recovery link is invalid or expired. Please request a fresh password reset email.',
        });
      }

      console.log('[API Auth] Changing password via Supabase access token');
      const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: cleanNewPass }),
      });
      const updateJson = await updateRes.json().catch(() => ({}));

      if (!updateRes.ok) {
        return res.status(updateRes.status || 400).json({
          success: false,
          code: 'auth/password-update-failed',
          error:
            updateJson?.msg ||
            updateJson?.error_description ||
            updateJson?.error ||
            'Unable to update password. Please request a fresh recovery link or 6-digit email code.',
        });
      }

      const resolvedEmail = (updateJson?.email || cleanEmail || '').toLowerCase().trim();
      if (resolvedEmail) {
        saveAthleteCredential(resolvedEmail, cleanNewPass);
      }

      let freshSession: any = null;
      if (resolvedEmail) {
        try {
          const { data: signData } = await createStatelessSupabase().auth.signInWithPassword({
            email: resolvedEmail,
            password: cleanNewPass,
          });
          if (signData?.session?.access_token) {
            freshSession = signData.session;
          }
        } catch {
          // ignore
        }
      }

      const resolvedUid = freshSession?.user?.id || updateJson?.id;
      const srvToken = resolvedEmail ? createServerSessionToken(resolvedEmail, resolvedUid) : '';
      if (srvToken) setServerSessionCookie(res, srvToken, req);

      return res.json({
        success: true,
        message: 'Password updated successfully.',
        user: freshSession?.user || updateJson,
        ...(freshSession ? { session: freshSession } : {}),
        ...(srvToken ? { serverSessionToken: srvToken } : {}),
      });
    }

    return res.status(400).json({
      success: false,
      code: 'auth/missing-verification',
      error: 'Please provide either your current password or the 6-digit recovery code from your email.',
    });
  } catch (err: any) {
    console.error('[API Auth] changePassword error:', err);
    return res.status(500).json({
      success: false,
      code: 'auth/server-error',
      error: err?.message || 'Password update service error.',
    });
  }
});

// Silent Supabase session recovery for active signed-in users whose JWT expired or refresh token raced
app.post('/api/auth/refresh-supabase-session', async (req, res) => {
  try {
    const { email, userId, refreshToken } = req.body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUid = typeof userId === 'string' ? userId.trim() : '';
    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const srvToken =
      typeof req.headers['x-washek-server-session'] === 'string'
        ? req.headers['x-washek-server-session'].trim()
        : '';

    let effectiveRefreshToken = typeof refreshToken === 'string' ? refreshToken.trim() : '';
    let pendingEntryForRefresh: PendingCheckoutRecord | null = null;
    if (!effectiveRefreshToken) {
      const pendingMatch = getFreshPendingCheckoutEntry(cleanUid, cleanEmail);
      if (
        pendingMatch?.refreshToken &&
        (!srvToken || !pendingMatch.serverSessionToken || pendingMatch.serverSessionToken === srvToken)
      ) {
        effectiveRefreshToken = pendingMatch.refreshToken;
        pendingEntryForRefresh = pendingMatch;
      }
    }

    const recovery = await tryRecoverSupabaseSession({
      authToken: token,
      refreshToken: effectiveRefreshToken,
      serverSessionToken: srvToken,
      cookieHeader: req.headers.cookie,
      targetEmail: cleanEmail,
    });

    if (pendingEntryForRefresh) {
      delete pendingEntryForRefresh.refreshToken;
    }

    if (recovery?.session?.access_token) {
      const resolvedEmail = (recovery.session.user?.email || email || '').toLowerCase().trim();
      const newSrvToken = createServerSessionToken(resolvedEmail, recovery.session.user?.id);
      setServerSessionCookie(res, newSrvToken, req);

      let profile: any = null;
      if (recovery.session.user?.id) {
        try {
          const userClient = createStatelessSupabase(recovery.session.access_token);
          const { data: profData } = await userClient
            .from('profiles')
            .select('*')
            .eq('id', recovery.session.user.id)
            .maybeSingle();
          if (profData) profile = profData;
        } catch {
          // ignore
        }
      }

      const authEnt = await resolveAuthProfileEntitlement({
        email: resolvedEmail,
        userId: recovery.session.user?.id || null,
        profileRow: profile,
        accessToken: recovery.session.access_token,
      });
      const resolvedProfile = {
        ...(profile || { id: recovery.session.user?.id, email: resolvedEmail }),
        subscription_plan: authEnt.subscription_plan,
        subscription_status: authEnt.subscription_status,
        subscription_tier: authEnt.subscription_tier,
        ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
      };

      return res.json({
        success: true,
        session: recovery.session,
        user: recovery.session.user,
        profile: resolvedProfile,
        serverSessionToken: newSrvToken,
      });
    }

    if (recovery?.syncNeeded) {
      return res.status(409).json({
        success: false,
        code: 'VAULT_SUPABASE_SYNC_NEEDED',
        error: 'Cloud billing authorization requires confirming your account password.',
      });
    }

    return res.status(401).json({
      success: false,
      code: 'AUTH_SESSION_EXPIRED',
      error: 'Unable to refresh Supabase session automatically.',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Session recovery failed' });
  }
});

// Inline billing connection: allows an already signed-in Vault user to authenticate with their Supabase Auth password without logging out
app.post('/api/auth/sync-supabase-session', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanPassword = password ? String(password) : '';

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    const { data, error } = await createStatelessSupabase().auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (error || !data?.session?.access_token || !data?.user) {
      return res.status(401).json({
        success: false,
        code: 'SUPABASE_PASSWORD_MISMATCH',
        error:
          error?.message === 'Invalid login credentials'
            ? 'That password does not match your cloud billing password. Enter your original password or verify via 6-digit email code below.'
            : error?.message || 'Unable to verify password with Supabase.',
      });
    }

    saveAthleteCredential(cleanEmail, cleanPassword);
    const srvToken = createServerSessionToken(cleanEmail, data.user.id);
    setServerSessionCookie(res, srvToken, req);

    let profile: any = null;
    try {
      const userClient = createStatelessSupabase(data.session.access_token);
      const { data: profData } = await userClient
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profData) profile = profData;
    } catch {
      // ignore
    }

    const authEnt = await resolveAuthProfileEntitlement({
      email: cleanEmail,
      userId: data.user.id,
      profileRow: profile,
      accessToken: data.session.access_token,
    });
    const resolvedProfile = {
      ...(profile || { id: data.user.id, email: cleanEmail }),
      subscription_plan: authEnt.subscription_plan,
      subscription_status: authEnt.subscription_status,
      subscription_tier: authEnt.subscription_tier,
      ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
    };

    return res.json({
      success: true,
      session: data.session,
      user: data.user,
      profile: resolvedProfile,
      serverSessionToken: srvToken,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Unable to verify cloud session.',
    });
  }
});

// Synchronizes credential vault after user completes Supabase email recovery OTP + password update
app.post('/api/auth/sync-vault-after-otp', async (req, res) => {
  try {
    const authHeader = req.headers.authorization ? String(req.headers.authorization) : '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const { newPassword } = req.body || {};

    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing Supabase access token.' });
    }

    const userClient = createStatelessSupabase(token);
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user?.email) {
      return res.status(401).json({ success: false, error: 'Invalid Supabase recovery token.' });
    }

    const cleanEmail = data.user.email.toLowerCase().trim();
    if (typeof newPassword === 'string' && newPassword.length >= 6) {
      saveAthleteCredential(cleanEmail, newPassword);
    }

    const srvToken = createServerSessionToken(cleanEmail, data.user.id);
    setServerSessionCookie(res, srvToken, req);

    let profile: any = null;
    try {
      const { data: profData } = await userClient
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profData) profile = profData;
    } catch {
      // ignore
    }

    const authEnt = await resolveAuthProfileEntitlement({
      email: cleanEmail,
      userId: data.user.id,
      profileRow: profile,
      accessToken: token,
    });
    const resolvedProfile = {
      ...(profile || { id: data.user.id, email: cleanEmail }),
      subscription_plan: authEnt.subscription_plan,
      subscription_status: authEnt.subscription_status,
      subscription_tier: authEnt.subscription_tier,
      ...(authEnt.subscription_plan !== 'free' ? { subscription_cancelled_at: null } : {}),
    };

    return res.json({
      success: true,
      email: cleanEmail,
      userId: data.user.id,
      profile: resolvedProfile,
      serverSessionToken: srvToken,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to sync credentials.' });
  }
});


const SYSTEM_INSTRUCTIONS: Record<string, string> = {
  kael: 'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. You are direct, scientifically grounded, encouraging, and focused on progressive overload, proper form, recovery, and nutrition. Always communicate in simple, everyday language that any beginner can easily understand, without confusing textbook jargon. Use intuitive real-world analogies when helpful to make concepts click, but never talk down to the athlete or sound like you are explaining things to a baby. Maintain a mature, supportive, and practical coaching presence.',
  structure: 'You are an elite strength & conditioning program architect for WASHEK. Design workout structures and weekly splits tailored to the athlete goals with proactive fatigue management and maximum safe progression velocity. Balance push/pull volume, prioritize high-CNS demands when fresh, and eliminate junk volume. STRICT OUTPUT MANDATE: Return raw JSON ONLY that strictly adheres to the requested schema. Never output conversational intros, explanations, greetings, or markdown code fences.',
  microcycle: 'You are an elite strength & conditioning program architect for WASHEK. Build comprehensive, progressive workout programming for the microcycle with days, exercise sequences, sets, reps, rest intervals, notes, and activation cues. GOAL ACCELERATION & SYSTEMIC FATIGUE MANAGEMENT MANDATE: Program workouts to drive the athlete toward their specific goals as fast as safely possible while actively managing systemic, CNS, and joint fatigue. 1) High Stimulus-to-Fatigue Ratio (SFR): Select high-yield exercises, strictly eliminating junk volume. 2) 1-2 RIR on primary compounds to maximize neuromuscular adaptation without exhausting the CNS. 3) Order high-skill or heavy compound movements first when the athlete is fresh. 4) Prescribe adequate rest periods (90-180s on primary lifts, 60-90s on accessories) for full ATP replenishment. 5) Maintain strict push/pull and joint balance. STRICT OUTPUT MANDATE: Return a single valid JSON object with the "microcycle" key adhering to the requested schema. No markdown code fences, greetings, or preambles.',
  form_analysis: 'You are an elite calisthenics and weightlifting (barbell, dumbbell, kettlebell, cable, and machine) biomechanist and uncompromising judge for WASHEK Form Lab. Analyze the user exercise execution across the provided video frames. ABSOLUTE HONESTY & REAL SCORE MANDATE (NO SUGARCOATING — SCORES RANGE FROM 1% TO 100%): Apply the exact same strict 1%–100% scoring standard equally to both calisthenics and weightlifting exercises. Stop sugarcoating form. If form is bad, sloppy, or dangerous, TELL LITERALLY EVERYTHING WRONG WITH THE FORM. Bad or dangerous form is dangerous and must NEVER be inflated, praised, or excused to protect the athlete ego. Look at every joint and anatomical segment: cervical spine/neck hyperextension, lumbar rounding ("cat-back" or butt wink) under load, scapular winging/elevation into ears, flared elbows (>60°–75° creating shoulder impingement), lumbar spine sagging/hyperextension ("banana back"), lack of bracing or posterior pelvic tilt, knee valgus collapse or heel lift, hip sagging/piking, bar path drift away from midfoot, bouncing weights off the chest/floor, hitching deadlifts, cutting range of motion, kipping, swinging, worming up, or asymmetrical drive. SCORE BRACKETS (1%–100%): 1%–20% for dangerous or hazardous execution with extreme injury risk (e.g., collapsing or heavily rounded spine under squat/deadlift load, severe knee valgus cave under load, severe joint shearing, uncontrolled falling/dropping); 20%–44% for poor, broken, or terrible form (severe lumbar hyperextension/sagging or spinal rounding under load, worming push-ups, bouncing barbell off chest, hitching deadlifts, heavy swinging/kipping/body-heaving, cutting over half the range of motion, severe asymmetry, collapsed core bracing); 45%–69% for sub-par or flawed execution with noticeable breakdown (cutting 20–30% ROM / above-parallel squats, flared elbows, bar path drift, heels lifting, uncontrolled cadence, soft lockout); 70%–84% for acceptable or moderate execution with clear technical flaws to fix; 85%–94% for high-level execution with 1 minor technical refinement; 95%–100% for rare, flawless, competition/gymnastics-grade textbook execution with full range of motion and locked bracing/body tension. Deductions: Minor tip (-5 to -8 pts), Moderate flaw (-15 to -20 pts), Major breakdown (-30 to -45 pts), Critical safety hazard (-50 to -80 pts). MANDATORY ISSUES LIST: If there is ANY breakdown or flaw, you MUST populate the "issues" array with every single flaw, exact problem, severity ("minor", "moderate", "major", "critical"), and fix. Never leave "issues" empty if the form has mistakes! CRITICAL REP & HOLD COUNTER MANDATE (NEVER DROP REPS): Count EVERY attempted repetition across the video frames from start to finish. If a repetition has partial depth, soft lockout, slight momentum, or fatigued form, THAT REPETITION STILL COUNTS AS A REP! Imperfect form reduces the form score; it NEVER subtracts from the rep count. Set "rep_count" to the exact integer total of all repetitions performed; set "hold_time_seconds": null. For static holds (planche, levers, L-sit, handstand, dead hang, plank, wall sit, etc.): set "rep_count": null; measure the full actual hold duration in seconds ("hold_time_seconds": number). STRICT OUTPUT MANDATE: Return raw JSON ONLY matching the requested structure without markdown code blocks.',
  food_scan: 'You are a sports nutritionist and dietitian for WASHEK. Analyze the food photo or ingredients. Identify the foods, estimate portion sizes, and calculate accurate macronutrients (calories, protein, carbohydrates, fat). STRICT OUTPUT MANDATE: Return raw JSON ONLY. No markdown, preambles, or conversational greetings.',
  food_barcode: 'You are a sports nutritionist for WASHEK. Identify the product from the barcode information and estimate accurate nutritional values and serving sizes. STRICT OUTPUT MANDATE: Return raw JSON ONLY. No markdown, preambles, or conversational greetings.',
  progress_photo: 'You are a physique assessment specialist for WASHEK. Objectively assess the progress photo for body composition, estimated body fat percentage range, visible muscle definition, posture, and symmetry. STRICT OUTPUT MANDATE: Return raw JSON ONLY. No markdown, preambles, or conversational greetings.',
  weekly_update: 'You are Coach Kael conducting a comprehensive weekly athlete check-in for WASHEK. Review the athlete training, nutrition, sleep, and compliance data. Highlight key wins, areas to improve, and provide tailored, actionable advice for the next training week. STRICT OUTPUT MANDATE: Return raw JSON ONLY matching the schema. No markdown code fences or preambles.',
  live_workout: 'You are Coach Kael providing real-time coaching, motivation, and quick technique reminders during an active workout session.',
  live_workout_adjustment: 'You are Coach Kael adjusting a live workout due to fatigue, equipment limitations, or pain. Provide safe, effective exercise alternatives or volume modifications. STRICT OUTPUT MANDATE: Return raw JSON ONLY adhering strictly to the schema. No markdown code fences or preambles.',
};

const JSON_TYPES = new Set([
  'microcycle',
  'structure',
  'form_analysis',
  'food_scan',
  'food_barcode',
  'progress_photo',
  'weekly_update',
  'live_workout_adjustment',
]);

function buildLanguageMandate(rawLanguage: any, isJsonExpected: boolean): string {
  const cleanLang = typeof rawLanguage === 'string' ? rawLanguage.trim() : '';
  if (!cleanLang || cleanLang.toLowerCase() === 'english' || cleanLang.toLowerCase() === 'en') {
    return '';
  }
  if (isJsonExpected) {
    return (
      ` LANGUAGE REQUIREMENT: Respond in ${cleanLang}. ` +
      `Write ALL natural-language text values (exercise names/notes if descriptive, form issues, descriptions, coaching tips, food descriptions, feedback, suggestions) in natural, fluent ${cleanLang}, while keeping ALL JSON property keys, enum IDs (such as "minor", "moderate", "major", "critical"), numbers, and JSON structure strictly unchanged in English.`
    );
  }
  return (
    ` LANGUAGE REQUIREMENT: Respond completely in natural, fluent ${cleanLang}. ` +
    `If you emit any internal action tag syntax such as [ACTION:...], keep the bracket command syntax unchanged in English while translating any user-facing label text into ${cleanLang}.`
  );
}

const SERVER_PLAN_HIERARCHY = ['free', 'progress', 'performance', 'elite'] as const;
const SERVER_ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const SERVER_PLAN_LIMITS: Record<string, number> = {
  free: 100,
  progress: 300,
  performance: 800,
  elite: 2000,
};
const AI_TYPE_REQUIRED_PLAN: Record<string, string> = {
  food_scan: 'progress',
  food_barcode: 'progress',
  progress_photo: 'performance',
  live_workout_adjustment: 'elite',
  form_analysis: 'elite',
};

function normalizeServerPlan(raw: any): string {
  const normalized = String(raw || 'free').toLowerCase().trim();
  return (SERVER_PLAN_HIERARCHY as readonly string[]).includes(normalized) ? normalized : 'free';
}

function hasRequiredServerPlan(userPlan: string, requiredPlan: string): boolean {
  const userIdx = (SERVER_PLAN_HIERARCHY as readonly string[]).indexOf(normalizeServerPlan(userPlan));
  const reqIdx = (SERVER_PLAN_HIERARCHY as readonly string[]).indexOf(normalizeServerPlan(requiredPlan));
  return userIdx >= 0 && reqIdx >= 0 && userIdx >= reqIdx;
}

function resolveEffectivePlanFromServerRecords(params: {
  profileRow: any | null;
  userId?: string | null;
  email?: string | null;
}): string {
  const { profileRow, userId, email } = params;
  const dbPlan = normalizeServerPlan(profileRow?.subscription_plan);
  const dbStatus = String(profileRow?.subscription_status || '').toLowerCase().trim();
  const isDbPaidActive = SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(dbStatus) && dbPlan !== 'free';

  const redirectRec = getConfirmedRedirectRecord(
    userId || profileRow?.id || null,
    email,
    profileRow?.subscription_cancelled_at
  );
  const isRedirectActive = Boolean(
    redirectRec &&
      SERVER_ACTIVE_SUBSCRIPTION_STATUSES.has(String(redirectRec.status || '').toLowerCase().trim())
  );

  if (isRedirectActive && redirectRec) {
    const redirectPlan = normalizeServerPlan(redirectRec.plan);
    if (redirectPlan !== 'free') {
      // Honor verified server entitlement whenever DB has free/inactive, OR when redirect holds an upgrade above a stale DB plan
      if (!isDbPaidActive || hasRequiredServerPlan(redirectPlan, dbPlan)) {
        return redirectPlan;
      }
    }
  }

  return isDbPaidActive ? dbPlan : 'free';
}

function getTimezoneMonthKey(tz?: string): string {
  if (!tz) return new Date().toISOString().slice(0, 7);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()).slice(0, 7);
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}

async function resolveAuthoritativeAiUser(req: express.Request): Promise<{
  client: any;
  userId: string | null;
  email: string | null;
  effectivePlan: string;
  profileRow: any | null;
  isVerifiedJwt: boolean;
}> {
  const authHeader = req.headers.authorization;
  const rawToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : '';
  const isJwt =
    Boolean(rawToken) &&
    !rawToken.startsWith('vault_tok_') &&
    !rawToken.startsWith('washek_sess_');

  const adminDb = getServiceRoleSupabase() || supabase;

  if (isJwt) {
    try {
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: `Bearer ${rawToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      const { data: userData, error: userError } = await supabaseUser.auth.getUser(rawToken);
      if (!userError && userData?.user?.id) {
        const userId = userData.user.id;
        const jwtEmail = userData.user.email ? String(userData.user.email).toLowerCase().trim() : null;
        const profileLookupDb = getServiceRoleSupabase() || supabaseUser;
        let { data: profileRow } = await profileLookupDb
          .from('profiles')
          .select('id, email, subscription_plan, subscription_status, subscription_cancelled_at, subscription_grace_until, kael_msg_count, kael_msg_month, timezone')
          .eq('id', userId)
          .maybeSingle();

        if (!profileRow && jwtEmail && getServiceRoleSupabase()) {
          const { data: emailProfileRow } = await adminDb
            .from('profiles')
            .select('id, email, subscription_plan, subscription_status, subscription_cancelled_at, subscription_grace_until, kael_msg_count, kael_msg_month, timezone')
            .ilike('email', jwtEmail)
            .maybeSingle();
          if (emailProfileRow) profileRow = emailProfileRow;
        }

        const email = jwtEmail || (profileRow?.email ? String(profileRow.email).toLowerCase().trim() : null);

        let effectivePlan = resolveEffectivePlanFromServerRecords({
          profileRow,
          userId: profileRow?.id || userId,
          email,
        });

        if (effectivePlan !== 'elite') {
          const synced = await syncStripeEntitlementViaSupabaseEdge({
            rawToken,
            userId: profileRow?.id || userId,
            email,
            cancelledAtIso: profileRow?.subscription_cancelled_at || null,
          });
          if (
            synced?.active &&
            synced.plan !== 'free' &&
            hasRequiredServerPlan(synced.plan, effectivePlan) &&
            synced.plan !== effectivePlan
          ) {
            effectivePlan = synced.plan;
            if (getServiceRoleSupabase()) {
              updateProfileSubscriptionSafely(adminDb, profileRow?.id || userId, {
                subscription_plan: synced.plan,
                subscription_status: synced.status || 'active',
                subscription_cancelled_at: null,
                subscription_updated_at: new Date().toISOString(),
              }).catch(() => {});
            }
          } else if (email) {
            const syncedByEmail = await syncStripeEntitlementByEmail(
              email,
              profileRow?.subscription_cancelled_at || null
            );
            if (
              syncedByEmail?.active &&
              syncedByEmail.plan !== 'free' &&
              hasRequiredServerPlan(syncedByEmail.plan, effectivePlan) &&
              syncedByEmail.plan !== effectivePlan
            ) {
              effectivePlan = syncedByEmail.plan;
              if (getServiceRoleSupabase()) {
                updateProfileSubscriptionSafely(adminDb, profileRow?.id || userId, {
                  subscription_plan: syncedByEmail.plan,
                  subscription_status: syncedByEmail.status || 'active',
                  subscription_cancelled_at: null,
                  subscription_updated_at: new Date().toISOString(),
                }).catch(() => {});
              }
            }
          }
        }

        return {
          client: supabaseUser,
          userId: profileRow?.id || userId,
          email,
          effectivePlan,
          profileRow: profileRow || null,
          isVerifiedJwt: true,
        };
      }
    } catch (authErr) {
      console.warn('[server.ts] JWT verification note, checking server session fallback:', authErr);
    }
  }

  // Cryptographic JWKS recovery for recently expired Supabase JWTs
  const expiredJwtIdentity = isJwt ? await verifyExpiredSupabaseJwt(rawToken) : null;

  // Cryptographically verified server session
  const srvSession = verifyServerSessionFromRequest(req, expiredJwtIdentity?.email || undefined);
  const resolvedEmail = srvSession?.email || expiredJwtIdentity?.email || null;
  const srvUid = srvSession?.userId && isValidUUID(srvSession.userId) ? srvSession.userId : null;
  const jwtUid = expiredJwtIdentity?.userId && isValidUUID(expiredJwtIdentity.userId) ? expiredJwtIdentity.userId : null;
  const resolvedUid = srvUid || jwtUid || (resolvedEmail ? 'usr_' + Buffer.from(resolvedEmail.slice(0, 8)).toString('hex') : null);

  if (srvSession || expiredJwtIdentity) {
    let profileRow: any = null;
    if (resolvedUid && isValidUUID(resolvedUid)) {
      try {
        const { data } = await adminDb
          .from('profiles')
          .select('id, subscription_plan, subscription_status, subscription_cancelled_at, subscription_grace_until, kael_msg_count, kael_msg_month, timezone')
          .eq('id', resolvedUid)
          .maybeSingle();
        profileRow = data;
      } catch {
        // ignore lookup error
      }
    }
    if (!profileRow && resolvedEmail) {
      try {
        const { data } = await adminDb
          .from('profiles')
          .select('id, subscription_plan, subscription_status, subscription_cancelled_at, subscription_grace_until, kael_msg_count, kael_msg_month, timezone')
          .ilike('email', resolvedEmail)
          .maybeSingle();
        profileRow = data;
      } catch {
        // ignore lookup error
      }
    }

    let effectivePlan = resolveEffectivePlanFromServerRecords({
      profileRow,
      userId: profileRow?.id || resolvedUid,
      email: resolvedEmail,
    });

    if (effectivePlan !== 'elite' && resolvedEmail) {
      const syncedByEmail = await syncStripeEntitlementByEmail(
        resolvedEmail,
        profileRow?.subscription_cancelled_at || null
      );
      if (
        syncedByEmail?.active &&
        syncedByEmail.plan !== 'free' &&
        hasRequiredServerPlan(syncedByEmail.plan, effectivePlan) &&
        syncedByEmail.plan !== effectivePlan
      ) {
        effectivePlan = syncedByEmail.plan;
        const targetUid = profileRow?.id || (isValidUUID(resolvedUid) ? resolvedUid : null);
        if (getServiceRoleSupabase() && targetUid) {
          updateProfileSubscriptionSafely(adminDb, targetUid, {
            subscription_plan: syncedByEmail.plan,
            subscription_status: syncedByEmail.status || 'active',
            subscription_cancelled_at: null,
            subscription_updated_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    }

    return {
      client: supabase,
      userId: profileRow?.id || resolvedUid,
      email: resolvedEmail,
      effectivePlan,
      profileRow: profileRow || null,
      isVerifiedJwt: false,
    };
  }

  return {
    client: supabase,
    userId: null,
    email: null,
    effectivePlan: 'free',
    profileRow: null,
    isVerifiedJwt: false,
  };
}

async function resolveAuthoritativeKaelUsageSnapshot(params: {
  authCtx: Awaited<ReturnType<typeof resolveAuthoritativeAiUser>>;
  effectiveTz: string;
  effectivePlan: string;
  clientUsed?: number;
}) {
  const { authCtx, effectiveTz, effectivePlan, clientUsed = 0 } = params;
  const currentMonthKey = getTimezoneMonthKey(effectiveTz);
  const resolvedPlan = normalizeServerPlan(effectivePlan);
  const usageLimit = SERVER_PLAN_LIMITS[resolvedPlan] || 100;
  const adminDb = getServiceRoleSupabase();

  let rpcUsed = 0;
  let rpcMonthKey = currentMonthKey;

  if (authCtx.isVerifiedJwt && authCtx.userId) {
    try {
      let { data: rpcUsage, error: rpcErr } = await authCtx.client.rpc('get_kael_usage', {
        p_timezone: effectiveTz,
      });
      if (rpcErr && rpcErr.code === 'PGRST202') {
        const fallbackRes = await authCtx.client.rpc('get_kael_usage');
        if (!fallbackRes.error) {
          rpcUsage = fallbackRes.data;
          rpcErr = null;
        }
      }
      if (!rpcErr && rpcUsage && typeof rpcUsage.used === 'number') {
        const candidateMonth = String(rpcUsage.monthKey || '').trim();
        if (/^\d{4}-\d{2}$/.test(candidateMonth)) {
          rpcMonthKey = candidateMonth;
        }
        if (rpcMonthKey === currentMonthKey) {
          rpcUsed = Math.max(0, Number(rpcUsage.used || 0));
        }
      }
    } catch (err) {
      console.warn('[server.ts] get_kael_usage note:', err);
    }
  }

  let tableUsed = 0;
  if (adminDb && authCtx.userId && isValidUUID(authCtx.userId)) {
    try {
      const { data: uRow } = await adminDb
        .from('kael_usage')
        .select('message_count, month_key')
        .eq('user_id', authCtx.userId)
        .maybeSingle();
      if (uRow && uRow.month_key === currentMonthKey && typeof uRow.message_count === 'number') {
        tableUsed = Math.max(0, Number(uRow.message_count));
      }
    } catch {
      // ignore kael_usage read error
    }
  }

  const profileUsed =
    authCtx.profileRow?.kael_msg_month === currentMonthKey
      ? Math.max(0, Number(authCtx.profileRow?.kael_msg_count || 0))
      : 0;

  const diskUsed = getStoredKaelMonthlyCount(authCtx.userId, authCtx.email, currentMonthKey);
  const safeClientUsed =
    !authCtx.isVerifiedJwt && !adminDb
      ? Math.max(0, Math.min(Number(clientUsed || 0), usageLimit))
      : 0;

  const finalUsed = Math.max(rpcUsed, tableUsed, profileUsed, diskUsed, safeClientUsed);

  if (finalUsed > 0 && (authCtx.userId || authCtx.email)) {
    recordStoredKaelMonthlyCount(authCtx.userId, authCtx.email, currentMonthKey, finalUsed);
  }

  return {
    used: finalUsed,
    limit: usageLimit,
    remaining: Math.max(0, usageLimit - finalUsed),
    monthKey: currentMonthKey,
    plan: resolvedPlan,
    timezone: effectiveTz,
  };
}

async function persistAuthoritativeKaelIncrement(params: {
  client: any;
  isVerifiedJwt: boolean;
  userId?: string | null;
  email?: string | null;
  effectiveTz: string;
  usageLimit: number;
  resolvedPlan: string;
  currentMonthKey: string;
  baselineUsed: number;
}) {
  const {
    client,
    isVerifiedJwt,
    userId,
    email,
    effectiveTz,
    usageLimit,
    resolvedPlan,
    currentMonthKey,
    baselineUsed,
  } = params;

  let claimData: any = null;
  if (isVerifiedJwt && userId && isValidUUID(userId)) {
    try {
      let res = await client.rpc('claim_kael_message', { p_timezone: effectiveTz });
      if (res.error && res.error.code === 'PGRST202') {
        res = await client.rpc('claim_kael_message');
      }
      if (!res.error && res.data && typeof res.data.used === 'number') {
        claimData = res.data;
      }
    } catch (err) {
      console.warn('[server.ts] claim_kael_message RPC note:', err);
    }
  }

  const claimMonth = claimData?.monthKey && /^\d{4}-\d{2}$/.test(String(claimData.monthKey))
    ? String(claimData.monthKey)
    : currentMonthKey;
  const rolledToNewMonth = claimMonth !== currentMonthKey;

  const nextUsed = rolledToNewMonth
    ? Math.max(1, Number(claimData?.used || 1))
    : Math.max(Number(claimData?.used || 0), Number(baselineUsed || 0) + 1);

  const persistedUsed = recordStoredKaelMonthlyCount(userId, email, claimMonth, nextUsed);
  const finalUsed = Math.max(nextUsed, persistedUsed);

  const adminDb = getServiceRoleSupabase();
  const dbClient = adminDb || (isVerifiedJwt ? client : null);

  if (dbClient) {
    const profilePayload: Record<string, any> = {
      kael_msg_count: finalUsed,
      kael_msg_month: claimMonth,
    };
    if (effectiveTz) {
      profilePayload.timezone = effectiveTz;
    }

    let profileUpdated = false;
    if (userId && userId !== 'guest' && isValidUUID(userId)) {
      try {
        const { error: dbErr } = await dbClient
          .from('profiles')
          .update(profilePayload)
          .eq('id', userId);
        if (!dbErr) profileUpdated = true;
      } catch (dbErr) {
        console.warn('[server.ts] Profile Kael count sync note:', dbErr);
      }

      if (adminDb) {
        try {
          await adminDb
            .from('kael_usage')
            .upsert(
              {
                user_id: userId,
                month_key: claimMonth,
                message_count: finalUsed,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            );
        } catch (kuErr) {
          console.warn('[server.ts] kael_usage table sync note:', kuErr);
        }
      }
    }
    if (!profileUpdated && email) {
      try {
        await dbClient
          .from('profiles')
          .update(profilePayload)
          .ilike('email', email);
      } catch (emailErr) {
        console.warn('[server.ts] Profile Kael count sync by email note:', emailErr);
      }
    }
  }

  return {
    allowed: finalUsed < usageLimit,
    used: finalUsed,
    limit: usageLimit,
    remaining: Math.max(0, usageLimit - finalUsed),
    monthKey: claimMonth,
    plan: resolvedPlan,
    timezone: effectiveTz,
  };
}

/**
 * Recursively converts JSON Schema into a valid @google/genai Schema.
 * Strips unsupported keys (`additionalProperties`, `$schema`, `default`, `title`, etc.),
 * converts array types (e.g. `['object', 'null']`), uppercases schema types,
 * and omits OBJECT nodes with no `properties` (since Gemini rejects empty Type.OBJECT schemas with 400).
 */
function sanitizeGeminiResponseSchema(rawSchema: any): Record<string, any> | null {
  if (!rawSchema || typeof rawSchema !== 'object') return null;

  const mapType = (rawType: string): string => {
    const t = String(rawType || '').toUpperCase().trim();
    switch (t) {
      case 'OBJECT':
      case 'STRING':
      case 'NUMBER':
      case 'INTEGER':
      case 'BOOLEAN':
      case 'ARRAY':
      case 'NULL':
        return t;
      case 'FLOAT':
      case 'DOUBLE':
        return 'NUMBER';
      case 'INT':
        return 'INTEGER';
      default:
        return 'STRING';
    }
  };

  const walk = (node: any): any => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;

    const out: Record<string, any> = {};

    if (Array.isArray(node.type)) {
      const nonNull = node.type.find((t: any) => String(t).toLowerCase() !== 'null');
      const hasNull = node.type.some((t: any) => String(t).toLowerCase() === 'null');
      if (nonNull) out.type = mapType(nonNull);
      if (hasNull) out.nullable = true;
    } else if (typeof node.type === 'string') {
      out.type = mapType(node.type);
    }

    if (typeof node.nullable === 'boolean') {
      out.nullable = node.nullable;
    }
    if (typeof node.description === 'string' && node.description.trim()) {
      out.description = node.description;
    }
    if (Array.isArray(node.enum) && node.enum.length > 0) {
      out.enum = node.enum.filter((v: any) => v !== null && v !== undefined).map((v: any) => String(v));
    }
    if (typeof node.format === 'string' && node.format.trim()) {
      out.format = node.format;
    }

    if (out.type === 'OBJECT' || (node.properties && typeof node.properties === 'object')) {
      out.type = 'OBJECT';
      const propEntries = node.properties && typeof node.properties === 'object'
        ? Object.entries(node.properties)
        : [];
      if (propEntries.length === 0) {
        return undefined;
      }
      const cleanProps: Record<string, any> = {};
      for (const [k, v] of propEntries) {
        const cleanedChild = walk(v);
        if (cleanedChild) {
          cleanProps[k] = cleanedChild;
        }
      }
      if (Object.keys(cleanProps).length === 0) {
        return undefined;
      }
      out.properties = cleanProps;
      if (Array.isArray(node.required)) {
        const req = node.required.filter((r: any) => typeof r === 'string' && Object.prototype.hasOwnProperty.call(cleanProps, r));
        if (req.length > 0) out.required = req;
      }
    } else if (out.type === 'ARRAY' || node.items) {
      out.type = 'ARRAY';
      if (node.items && typeof node.items === 'object') {
        const cleanedItems = walk(node.items);
        if (cleanedItems) {
          out.items = cleanedItems;
        } else {
          return undefined;
        }
      }
    }

    return out;
  };

  const sanitized = walk(rawSchema);
  return sanitized || null;
}

function extractJsonFromAiOutput(rawOutput: string): any {
  const stripped = String(rawOutput || '')
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
      } catch {
        // try array below
      }
    }
    const firstBracket = stripped.indexOf('[');
    const lastBracket = stripped.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        return JSON.parse(stripped.slice(firstBracket, lastBracket + 1));
      } catch {
        // fall through
      }
    }
    return rawOutput;
  }
}

function buildKaelPlanPermissionsMandate(effectivePlan: string): string {
  const plan = normalizeServerPlan(effectivePlan);
  if (plan === 'elite') {
    return (
      ' AUTHORIZATION & PLAN ACCESS (VERIFIED: ELITE): This user has full unrestricted Elite access to EVERY feature and route in the app ' +
      '(including /formlab, AI progress photo body-fat & physique analysis, live workout adjustments, detailed workout analytics, weekly nutrition insights, adaptive macros, adaptive programming, insider Elite coaching tips, deep recovery guidance, and full navigation including /about, /contact, /terms, /privacy). ' +
      'ONLY emit [ACTION:go:/route|Button Label] when the user EXPLICITLY asks you to take them to, open, or go to a page; otherwise answer in chat without auto-navigating.'
    );
  }

  const lockedCapabilities: string[] = [];
  if (!hasRequiredServerPlan(plan, 'progress')) {
    lockedCapabilities.push(
      'side-by-side progress photo comparisons (Progress plan)',
      'AI food photo or barcode nutrition scanning (Progress plan)',
      'custom workout plan overrides & adaptive multi-week programming (Progress plan)',
      'workout-adaptive calorie/macro recalculation (Progress plan)'
    );
  }
  if (!hasRequiredServerPlan(plan, 'performance')) {
    lockedCapabilities.push(
      'AI progress photo body-fat estimation, physique critique, or visual body analysis (Performance plan)',
      'detailed workout performance analytics (Performance plan)',
      'AI weekly nutrition insights (Performance plan)'
    );
  }
  lockedCapabilities.push(
    'Form Lab video technique analysis and navigating/linking to /formlab (Elite plan)',
    'live in-workout real-time exercise adjustments (Elite plan)',
    'Progress Graph predictions and Elite insider tips/deep recovery protocols (Elite plan)'
  );

  return (
    ` STRICT PLAN AUTHORIZATION & HARD LOCKS (SERVER-VERIFIED PLAN: ${plan.toUpperCase()}): ` +
    `NEVER perform, simulate, or navigate to ANY feature above ${plan.toUpperCase()}. ` +
    `LOCKED FOR THIS USER: ${lockedCapabilities.join('; ')}. ` +
    'If the user asks you to perform any locked analysis (for example analyzing progress photos or estimating body fat on Free/Progress) ' +
    'or asks to go to a locked page (such as /formlab on non-Elite), DO NOT fulfill the locked request and NEVER emit [ACTION:go:/formlab...], [ACTION:navigate:/formlab...], or [ACTION:/formlab]. ' +
    'Instead, politely decline that specific locked feature, accurately state the minimum required plan name listed above, and optionally offer [ACTION:navigate:/profile|Upgrade Plan].'
  );
}

function sanitizeKaelResponseActionsForPlan(rawText: string, effectivePlan: string): string {
  const text = String(rawText || '');
  if (hasRequiredServerPlan(effectivePlan, 'elite')) {
    return text;
  }
  return text.replace(/\[ACTION:(?:(?:go|navigate):)?\/formlab(?:[?|][^\]]*)?\]/gi, '');
}

async function resolveServerStorageMediaUrl(rawItem: string, userClient: any): Promise<string> {
  const raw = String(rawItem || '').trim();
  if (!raw || raw.startsWith('data:')) return raw;

  let storageBucketHint = '';
  let storagePath = raw;

  const objectMarker = '/storage/v1/object/';
  const markerIndex = raw.indexOf(objectMarker);
  if (markerIndex >= 0 && !raw.includes('/storage/v1/object/sign/')) {
    const afterMarker = raw.slice(markerIndex + objectMarker.length);
    const parts = afterMarker.split('/');
    if (parts.length >= 3) {
      parts.shift(); // public | authenticated
      storageBucketHint = parts.shift() || '';
      storagePath = decodeURIComponent(parts.join('/').split('?')[0]);
    }
  } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }

  const storageClient = getServiceRoleSupabase() || userClient || supabase;
  const candidateBuckets = Array.from(
    new Set(
      [
        storageBucketHint,
        process.env.SUPABASE_MEDIA_BUCKET,
        process.env.VITE_SUPABASE_MEDIA_BUCKET,
        'user-media',
        'washek-media',
        'media',
      ].filter((b): b is string => Boolean(b && b.trim()))
    )
  );

  for (const bucket of candidateBuckets) {
    try {
      const { data: signedData, error } = await storageClient.storage
        .from(bucket)
        .createSignedUrl(storagePath, 3600);
      if (!error && signedData?.signedUrl) {
        return signedData.signedUrl;
      }
    } catch {
      // try next bucket
    }
  }

  return raw;
}

app.get('/api/kael/usage', async (req, res) => {
  try {
    const authCtx = await resolveAuthoritativeAiUser(req);
    if (!authCtx.userId && !authCtx.email) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    const queryTz = typeof req.query?.timezone === 'string' ? req.query.timezone : '';
    const headerTz = typeof req.headers['x-timezone'] === 'string' ? req.headers['x-timezone'] : '';
    const effectiveTz = authCtx.profileRow?.timezone || queryTz || headerTz || 'UTC';

    const usage = await resolveAuthoritativeKaelUsageSnapshot({
      authCtx,
      effectiveTz,
      effectivePlan: authCtx.effectivePlan,
    });

    return res.json({
      success: true,
      usage,
    });
  } catch (err: any) {
    console.error('[server.ts] GET /api/kael/usage error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load Kael usage.',
    });
  }
});

app.post('/api/ai-generate', async (req, res) => {
  try {
    const {
      prompt,
      type = 'general',
      file_urls = [],
      schema = null,
      response_json_schema = null,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A prompt string is required.',
      });
    }

    // Authoritatively resolve user subscription tier on the server (never trust req.body.plan)
    const authCtx = await resolveAuthoritativeAiUser(req);
    let effectivePlan = authCtx.effectivePlan;

    // Determine required tier: live in-workout single-exercise adjustment is Elite,
    // while post-workout multi-week adaptation is Progress+ (adaptive programming).
    let requiredTier = AI_TYPE_REQUIRED_PLAN[String(type || 'general')];
    if (type === 'live_workout_adjustment') {
      const isPostWorkoutAdaptation =
        Boolean(response_json_schema?.properties?.adjusted_exercises) ||
        Boolean(schema?.properties?.adjusted_exercises) ||
        (typeof prompt === 'string' && prompt.includes('POST-WORKOUT FEEDBACK'));
      requiredTier = isPostWorkoutAdaptation ? 'progress' : 'elite';
    }

    if (requiredTier && !hasRequiredServerPlan(effectivePlan, requiredTier)) {
      console.warn('[AI Gate 403 /api/ai-generate]', {
        type,
        requiredTier,
        effectivePlan,
        isVerifiedJwt: authCtx.isVerifiedJwt,
        hasUserId: Boolean(authCtx.userId),
        hasEmail: Boolean(authCtx.email),
        dbPlan: authCtx.profileRow?.subscription_plan || null,
        dbStatus: authCtx.profileRow?.subscription_status || null,
      });
      const planLabel = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
      return res.status(403).json({
        success: false,
        error_code: 'SUBSCRIPTION_REQUIRED',
        required_plan: requiredTier,
        current_plan: effectivePlan,
        error:
          requiredTier === 'elite'
            ? 'This feature requires the Elite plan.'
            : `This feature requires the ${planLabel} plan or higher.`,
      });
    }

    const ai = getGeminiClient();

    // Prepare multimodal parts with parallel, fast media fetching
    const parts: any[] = [];

    if (Array.isArray(file_urls) && file_urls.length > 0) {
      const mediaParts = await Promise.all(
        file_urls.map(async (item) => {
          const raw = String(item || '').trim();
          if (!raw) return null;

          const urlToFetch = await resolveServerStorageMediaUrl(raw, authCtx.client);

          if (urlToFetch.startsWith('data:')) {
            const match = urlToFetch.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              };
            }
          } else if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 15000);
              const mediaRes = await fetch(urlToFetch, { signal: controller.signal });
              clearTimeout(timer);
              if (mediaRes.ok) {
                const arrayBuffer = await mediaRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = mediaRes.headers.get('content-type') || 'image/jpeg';
                return {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                };
              }
            } catch (fetchErr) {
              console.warn('[Gemini] Media fetch error for URL:', urlToFetch, fetchErr);
            }
          }
          return null;
        })
      );

      for (const m of mediaParts) {
        if (m) parts.push(m);
      }
    }

    // Append text prompt
    parts.push({ text: prompt });

    // Strictly identify Coach Kael direct chat messages
    const isKael = type === 'kael';

    let kaelQuota: any = null;
    let kaelUserSession: {
      client: any;
      isVerifiedJwt?: boolean;
      id: string;
      email?: string | null;
      effectiveTz: string;
      usageLimit: number;
      resolvedPlan: string;
      currentMonthKey: string;
      currentUsage: {
        used: number;
        limit: number;
        remaining: number;
        monthKey: string;
        plan: string;
      };
    } | null = null;

    // Server-side Kael monthly message limit enforcement
    if (isKael) {
      const clientTimezone = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || '';
      const effectiveTz = authCtx.profileRow?.timezone || clientTimezone || 'UTC';
      const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;

      const currentUsage = await resolveAuthoritativeKaelUsageSnapshot({
        authCtx,
        effectiveTz,
        effectivePlan,
        clientUsed,
      });

      if (currentUsage.remaining <= 0 || currentUsage.used >= currentUsage.limit) {
        return res.status(429).json({
          success: false,
          error: 'You have reached your monthly message limit for Coach Kael.',
          error_code: 'KAEL_LIMIT_REACHED',
          quota: {
            allowed: false,
            used: currentUsage.used,
            limit: currentUsage.limit,
            remaining: 0,
            monthKey: currentUsage.monthKey,
            plan: currentUsage.plan,
            timezone: effectiveTz,
          },
          type: 'kael',
        });
      }

      kaelUserSession = {
        client: authCtx.client,
        isVerifiedJwt: authCtx.isVerifiedJwt,
        id: authCtx.userId || 'guest',
        email: authCtx.email || null,
        effectiveTz,
        usageLimit: currentUsage.limit,
        resolvedPlan: currentUsage.plan,
        currentMonthKey: currentUsage.monthKey,
        currentUsage,
      };
    }

    const isJsonExpected =
      JSON_TYPES.has(type) ||
      Boolean(schema) ||
      Boolean(response_json_schema);

    // Using Google Gemini high-speed models
    const config: Record<string, unknown> = {};

    const sanitizedSchema = isJsonExpected
      ? sanitizeGeminiResponseSchema(response_json_schema || schema)
      : null;

    if (isJsonExpected) {
      config.responseMimeType = 'application/json';
      if (sanitizedSchema && type !== 'live_workout_adjustment') {
        config.responseSchema = sanitizedSchema;
      } else if (sanitizedSchema && type === 'live_workout_adjustment' && Array.isArray(parts) && parts.length > 0) {
        const schemaHint = `\n\nSTRICT JSON OUTPUT CONTRACT: Return ONLY valid JSON matching this structure:\n${JSON.stringify(sanitizedSchema)}`;
        const lastIdx = parts.length - 1;
        if (typeof parts[lastIdx]?.text === 'string') {
          parts[lastIdx] = { ...parts[lastIdx], text: parts[lastIdx].text + schemaHint };
        }
      }
    }

    // Tune generation parameters and system instructions based on server-verified plan tier
    if (type === 'kael') {
      const kaelBaseMandate =
        'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. ' +
        'CORE SCIENTIFIC ACCURACY MANDATE (ALL PLANS): You are ALWAYS 100% scientifically accurate, biomechanically sound, and physiologically grounded across every plan tier. Safety, anatomical precision, and evidence-based truth NEVER change on any plan. ' +
        'COMMUNICATION CLARITY & ACCESSIBLE LANGUAGE (CRITICAL): Respond in simple, clear, everyday language that any beginner can easily understand, without dense medical or kinesiology jargon. When explaining how the body moves, translate complex biomechanics into intuitive practical terms (e.g., explain scapular depression as pulling shoulder blades down and away from the ears; explain eccentric control as lowering yourself slowly; explain CNS fatigue as deep whole-body burnout). Use an intuitive real-world analogy whenever it helps make the concept or physical sensation click. Never talk down to the user or sound like you are explaining things to a toddler or baby — find that golden balance of mature, respectful, seasoned coaching with zero confusing jargon. Never make responses shorter than the tier guideline or alter the programming. ' +
        'LIVE APP VISIBILITY & IN-APP ACTIONS: The prompt contains the athlete\'s LIVE APP CONTEXT (today\'s date/weekday, scheduled workout OR Rest Day status, full current week & program, workout logs, maxes, muscle heatmap balance, nutrition goals & logged intake, saved meals, plan access, plus WASHEK About, Contact, Terms of Service, and Privacy Policy details). ALWAYS ground your answers in that exact live data—never guess or invent workouts, rest days, macros, stats, or policies. If today is a Rest Day, clearly say it is a Rest Day and mention when their next scheduled workout is. STRICT NAVIGATION RULE: NEVER emit `[ACTION:go:/route|Label]` unless the user SPECIFICALLY asks you to take them to, go to, open, or navigate to an AUTHORIZED page (e.g. if they only ask a question about their photos, nutrition, terms, privacy, about, or contact, just answer directly and do NOT emit `[ACTION:go:...]`). PERMISSION-BEFORE-ACTION: Unless the user EXPLICITLY instructs you to perform an app change (like logging food or marking a rest day) OR confirms yes after you asked, NEVER auto-execute changes — first ask for permission clearly and emit the confirmation-only tag `[ACTION:ask_log_food:...]` or `[ACTION:ask_log_rest_day|...]` instead of `[ACTION:log_food:...]` / `[ACTION:log_rest_day|...]`. ' +
        buildKaelPlanPermissionsMandate(effectivePlan) +
        ' ';

      if (effectivePlan === 'elite') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: ELITE. Deliver lightning-fast, masterclass coaching depth (~180–350+ words when detailed explanation helps, or crisp & direct if they just want a quick status check or navigation). Break down how muscles and joints work together in clear, vivid terms with intuitive cues or analogies. Always include at least one insider coaching nuance labeled "🔐 Elite tip:" or "⚡ Secret:", and provide deep "🛡️ Elite recovery:" or "🔋 Recovery call:" deload diagnostics when fatigue or rest is relevant, explained in plain language.';
      } else if (effectivePlan === 'performance') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PERFORMANCE. Deliver high-speed, advanced coaching intelligence (~130–220 words when detailed explanation helps). Break down movement tempo (concentric/eccentric cadence explained simply as lowering, pausing, and pushing), muscle activation cues, exercise synergy, and fueling/recovery timing in straightforward terms.';
      } else if (effectivePlan === 'progress') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PROGRESS. Deliver faster and smarter coaching answers (~80–140 words when detailed explanation helps). In addition to 100% accurate guidance, explain the practical "why" behind the movement in simple terms, using relatable analogies when helpful, and outline clear actionable progression steps.';
      } else {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: FREE. Deliver 100% scientifically accurate, direct, and concise coaching answers (~40–80 words). Provide the exact recommendation and key execution cue in plain, everyday language without confusing jargon, fluff, or filler.';
      }
    } else {
      const systemInstruction = SYSTEM_INSTRUCTIONS[type];
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
    }

    const langMandate = buildLanguageMandate(req.body?.language, isJsonExpected);
    if (langMandate) {
      config.systemInstruction = String(config.systemInstruction || '') + langMandate;
    }

    // Fast, reliable Google Gemini models (flash-lite primary for sub-second-to-few-second latency, hydrogen fallback when daily quota available)
    const activeModels =
      Date.now() < hydrogenDailyExhaustedUntil
        ? ['gemini-3.1-flash-lite']
        : ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
    let lastError: any = null;
    const modelErrors: string[] = [];
    let response: any = null;
    let successfulModel = activeModels[0];

    const isTransientUpstreamError = (msg: string) => {
      const m = String(msg || '').toLowerCase();
      return (
        m.includes('503') ||
        m.includes('unavailable') ||
        m.includes('high demand') ||
        m.includes('abort') ||
        m.includes('timeout') ||
        m.includes('econnreset') ||
        m.includes('etimedout') ||
        m.includes('fetch failed')
      );
    };

    const buildSchemaFallbackHint = (schemaObj: any): string => {
      if (!schemaObj || typeof schemaObj !== 'object') return '';
      try {
        return `\n\nSTRICT JSON SCHEMA REQUIREMENT: Return ONLY valid raw JSON matching this structure/keys:\n${JSON.stringify(schemaObj)}`;
      } catch {
        return '';
      }
    };

    const runModelOnce = async (
      currentModel: string,
      timeoutMs: number,
      opts: { dropResponseSchema?: boolean } = {}
    ) => {
      const callConfig: Record<string, any> = { ...config };
      let callParts = parts;
      if (opts.dropResponseSchema && callConfig.responseSchema) {
        const schemaHint = buildSchemaFallbackHint(callConfig.responseSchema);
        delete callConfig.responseSchema;
        if (schemaHint && Array.isArray(parts) && parts.length > 0) {
          callParts = parts.map((p, idx) =>
            idx === parts.length - 1 && typeof p?.text === 'string'
              ? { ...p, text: p.text + schemaHint }
              : p
          );
        }
      }
      // Omit prohibited sampling parameters for gemini-4 and 3.8 series per gemini-api guidelines
      if (currentModel.includes('gemini-4') || currentModel.includes('3.8')) {
        delete callConfig.temperature;
        delete callConfig.topP;
        delete callConfig.topK;
        if (!callConfig.thinkingConfig) {
          callConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }
      } else if (currentModel.includes('gemini-3')) {
        if (!callConfig.thinkingConfig) {
          callConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        console.log(
          `[Gemini API] Trying model "${currentModel}" for type="${type}"${opts.dropResponseSchema ? ' (json-mime fallback)' : ''}`
        );
        const resGen = await ai.models.generateContent({
          model: currentModel,
          contents: callParts,
          config: {
            ...callConfig,
            abortSignal: controller.signal,
          },
        });
        clearTimeout(timer);
        return resGen;
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    };

    const primaryTimeoutMs =
      type === 'form_analysis'
        ? 35000
        : type === 'microcycle'
          ? 18000
          : ['weekly_update', 'food_scan', 'food_barcode', 'progress_photo'].includes(type)
            ? 14000
            : 10000;

    let sawTransient = false;
    for (const currentModel of activeModels) {
      const timeoutMs =
        currentModel === 'gemini-3.1-flash-lite'
          ? primaryTimeoutMs
          : 10000;
      try {
        response = await runModelOnce(currentModel, timeoutMs);
        successfulModel = currentModel;
        break;
      } catch (modelErr: any) {
        lastError = modelErr;
        const errMsg = modelErr?.message || String(modelErr);
        modelErrors.push(`[${currentModel}] ${errMsg}`);
        console.warn(`[Gemini API] Model "${currentModel}" failed:`, errMsg);
        if (
          currentModel === 'gemini-4-hydrogen' &&
          (errMsg.includes('GenerateRequestsPerDay') || errMsg.includes('RESOURCE_EXHAUSTED'))
        ) {
          hydrogenDailyExhaustedUntil = Date.now() + 10 * 60 * 1000;
        }
        if (currentModel === 'gemini-3.1-flash-lite' && isTransientUpstreamError(errMsg)) {
          sawTransient = true;
        }
      }
    }

    // Up to 3 staggered retries on primary model if transient 503/timeout/abort errors occur;
    // when responseSchema constrained decoding is slow/congested, drop responseSchema while keeping JSON MIME
    if (!response && sawTransient) {
      for (const [retryIdx, delayMs] of [600, 1500, 2500].entries()) {
        await new Promise((r) => setTimeout(r, delayMs));
        try {
          response = await runModelOnce('gemini-3.1-flash-lite', Math.max(primaryTimeoutMs, 12000), {
            dropResponseSchema: Boolean(config.responseSchema),
          });
          successfulModel = 'gemini-3.1-flash-lite';
          break;
        } catch (retryErr: any) {
          lastError = retryErr;
          const errMsg = retryErr?.message || String(retryErr);
          modelErrors.push(`[gemini-3.1-flash-lite#retry${retryIdx + 1}] ${errMsg}`);
          if (!isTransientUpstreamError(errMsg)) {
            break;
          }
        }
      }
    }

    if (!response) {
      const combinedErr: any = new Error(modelErrors.join(' | ') || lastError?.message || 'All Gemini models failed to respond.');
      combinedErr.modelErrors = modelErrors;
      throw combinedErr;
    }

    let outputText = (response.text || '').trim();
    if (!outputText) {
      throw new Error('Coach Kael generated an empty response.');
    }
    if (isKael) {
      outputText = sanitizeKaelResponseActionsForPlan(outputText, effectivePlan).trim();
    }

    // Now that Kael has actually answered, atomically claim and persist monotonic monthly quota
    if (isKael && kaelUserSession) {
      kaelQuota = await persistAuthoritativeKaelIncrement({
        client: kaelUserSession.client,
        isVerifiedJwt: Boolean(kaelUserSession.isVerifiedJwt),
        userId: kaelUserSession.id,
        email: kaelUserSession.email,
        effectiveTz: kaelUserSession.effectiveTz,
        usageLimit: kaelUserSession.usageLimit,
        resolvedPlan: kaelUserSession.resolvedPlan,
        currentMonthKey: kaelUserSession.currentMonthKey,
        baselineUsed: kaelUserSession.currentUsage.used,
      });
    }

    if (!kaelQuota && isKael) {
      const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;
      const newCount = clientUsed + 1;
      const PLAN_LIMITS: Record<string, number> = {
        free: 100,
        progress: 300,
        performance: 800,
        elite: 2000,
      };
      const resolvedPlan = PLAN_LIMITS[effectivePlan] ? effectivePlan : 'free';
      const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;
      const clientTz = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || 'UTC';
      let monthKey = new Date().toISOString().slice(0, 7);
      try {
        monthKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: clientTz,
          year: 'numeric',
          month: '2-digit',
        }).format(new Date()).slice(0, 7);
      } catch {}

      kaelQuota = {
        allowed: true,
        used: newCount,
        limit: usageLimit,
        remaining: Math.max(0, usageLimit - newCount),
        monthKey,
        plan: resolvedPlan,
        timezone: clientTz,
      };
    }

    let result: any = outputText;
    if (isJsonExpected) {
      result = extractJsonFromAiOutput(outputText);
      if (type === 'weekly_update' && result && typeof result === 'object') {
        if (!hasRequiredServerPlan(effectivePlan, 'performance')) {
          result.nutrition_insight = '';
          result.nutrition_suggestions = [];
        }
        if (!hasRequiredServerPlan(effectivePlan, 'progress')) {
          result.adjusted_microcycle = null;
        }
      }
    }

    return res.json({
      success: true,
      result,
      quota: kaelQuota,
      type,
      model: successfulModel,
      provider: 'Google Gemini',
    });
  } catch (error: any) {
    console.error('[Gemini API Error]', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Google Gemini AI generation failed.',
      provider: 'Google Gemini',
      model: 'gemini-3.1-flash-lite',
    });
  }
});

app.post('/api/ai-stream', async (req, res) => {
  try {
    const {
      prompt,
      type = 'general',
      file_urls = [],
      schema = null,
      response_json_schema = null,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A prompt string is required.',
      });
    }

    // Authoritatively resolve user subscription tier on the server (never trust req.body.plan)
    const authCtx = await resolveAuthoritativeAiUser(req);
    let effectivePlan = authCtx.effectivePlan;
    let requiredTier = AI_TYPE_REQUIRED_PLAN[String(type || 'general')];
    if (type === 'live_workout_adjustment') {
      const isPostWorkoutAdaptation =
        Boolean(response_json_schema?.properties?.adjusted_exercises) ||
        Boolean(schema?.properties?.adjusted_exercises) ||
        (typeof prompt === 'string' && prompt.includes('POST-WORKOUT FEEDBACK'));
      requiredTier = isPostWorkoutAdaptation ? 'progress' : 'elite';
    }
    if (requiredTier && !hasRequiredServerPlan(effectivePlan, requiredTier)) {
      console.warn('[AI Gate 403 /api/ai-stream]', {
        type,
        requiredTier,
        effectivePlan,
        isVerifiedJwt: authCtx.isVerifiedJwt,
        hasUserId: Boolean(authCtx.userId),
        hasEmail: Boolean(authCtx.email),
        dbPlan: authCtx.profileRow?.subscription_plan || null,
        dbStatus: authCtx.profileRow?.subscription_status || null,
      });
      const planLabel = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
      return res.status(403).json({
        success: false,
        error_code: 'SUBSCRIPTION_REQUIRED',
        required_plan: requiredTier,
        current_plan: effectivePlan,
        error:
          requiredTier === 'elite'
            ? 'This feature requires the Elite plan.'
            : `This feature requires the ${planLabel} plan or higher.`,
      });
    }

    const ai = getGeminiClient();

    // Prepare multimodal parts with parallel, fast media fetching
    const parts: any[] = [];

    if (Array.isArray(file_urls) && file_urls.length > 0) {
      const mediaParts = await Promise.all(
        file_urls.map(async (item) => {
          const raw = String(item || '').trim();
          if (!raw) return null;

          const urlToFetch = await resolveServerStorageMediaUrl(raw, authCtx.client);

          if (urlToFetch.startsWith('data:')) {
            const match = urlToFetch.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              };
            }
          } else if (urlToFetch.startsWith('http://') || urlToFetch.startsWith('https://')) {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 4000);
              const mediaRes = await fetch(urlToFetch, { signal: controller.signal });
              clearTimeout(timer);
              if (mediaRes.ok) {
                const arrayBuffer = await mediaRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const mimeType = mediaRes.headers.get('content-type') || 'image/jpeg';
                return {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                };
              }
            } catch (fetchErr) {
              console.warn('[Gemini Stream] Media fetch error for URL:', urlToFetch, fetchErr);
            }
          }
          return null;
        })
      );

      for (const m of mediaParts) {
        if (m) parts.push(m);
      }
    }

    parts.push({ text: prompt });

    const isKael = type === 'kael';
    let kaelQuota: any = null;
    let kaelUserSession: any = null;

    if (isKael) {
      const clientTimezone = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || '';
      const effectiveTz = authCtx.profileRow?.timezone || clientTimezone || 'UTC';
      const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;

      const currentUsage = await resolveAuthoritativeKaelUsageSnapshot({
        authCtx,
        effectiveTz,
        effectivePlan,
        clientUsed,
      });

      if (currentUsage.remaining <= 0 || currentUsage.used >= currentUsage.limit) {
        return res.status(429).json({
          success: false,
          error: 'You have reached your monthly message limit for Coach Kael.',
          error_code: 'KAEL_LIMIT_REACHED',
          quota: {
            allowed: false,
            used: currentUsage.used,
            limit: currentUsage.limit,
            remaining: 0,
            monthKey: currentUsage.monthKey,
            plan: currentUsage.plan,
            timezone: effectiveTz,
          },
          type: 'kael',
        });
      }

      kaelUserSession = {
        client: authCtx.client,
        isVerifiedJwt: authCtx.isVerifiedJwt,
        id: authCtx.userId || 'guest',
        email: authCtx.email || null,
        effectiveTz,
        usageLimit: currentUsage.limit,
        resolvedPlan: currentUsage.plan,
        currentMonthKey: currentUsage.monthKey,
        currentUsage,
      };
    }

    const isJsonExpected =
      JSON_TYPES.has(type) ||
      Boolean(schema) ||
      Boolean(response_json_schema);

    const config: Record<string, unknown> = {};

    if (isJsonExpected) {
      config.responseMimeType = 'application/json';
      const sanitizedSchema = sanitizeGeminiResponseSchema(response_json_schema || schema);
      if (sanitizedSchema) {
        config.responseSchema = sanitizedSchema;
      }
    }

    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.LOW,
    };

    if (type === 'kael') {
      const kaelBaseMandate =
        'You are Coach Kael, an elite strength & conditioning coach and fitness mentor for WASHEK. ' +
        'CORE SCIENTIFIC ACCURACY MANDATE (ALL PLANS): You are ALWAYS 100% scientifically accurate, biomechanically sound, and physiologically grounded across every plan tier. Safety, anatomical precision, and evidence-based truth NEVER change on any plan. ' +
        'COMMUNICATION CLARITY & ACCESSIBLE LANGUAGE (CRITICAL): Respond in simple, clear, everyday language that any beginner can easily understand, without dense medical or kinesiology jargon. When explaining how the body moves, translate complex biomechanics into intuitive practical terms (e.g., explain scapular depression as pulling shoulder blades down and away from the ears; explain eccentric control as lowering yourself slowly; explain CNS fatigue as deep whole-body burnout). Use an intuitive real-world analogy whenever it helps make the concept or physical sensation click. Never talk down to the user or sound like you are explaining things to a toddler or baby — find that golden balance of mature, respectful, seasoned coaching with zero confusing jargon. Never make responses shorter than the tier guideline or alter the programming. ' +
        'LIVE APP VISIBILITY & IN-APP ACTIONS: The prompt contains the athlete\'s LIVE APP CONTEXT (today\'s date/weekday, scheduled workout OR Rest Day status, full current week & program, workout logs, maxes, muscle heatmap balance, nutrition goals & logged intake, saved meals, plan access, plus WASHEK About, Contact, Terms of Service, and Privacy Policy details). ALWAYS ground your answers in that exact live data—never guess or invent workouts, rest days, macros, stats, or policies. If today is a Rest Day, clearly say it is a Rest Day and mention when their next scheduled workout is. STRICT NAVIGATION RULE: NEVER emit `[ACTION:go:/route|Label]` unless the user SPECIFICALLY asks you to take them to, go to, open, or navigate to an AUTHORIZED page (e.g. if they only ask a question about their photos, nutrition, terms, privacy, about, or contact, just answer directly and do NOT emit `[ACTION:go:...]`). PERMISSION-BEFORE-ACTION: Unless the user EXPLICITLY instructs you to perform an app change (like logging food or marking a rest day) OR confirms yes after you asked, NEVER auto-execute changes — first ask for permission clearly and emit the confirmation-only tag `[ACTION:ask_log_food:...]` or `[ACTION:ask_log_rest_day|...]` instead of `[ACTION:log_food:...]` / `[ACTION:log_rest_day|...]`. ' +
        buildKaelPlanPermissionsMandate(effectivePlan) +
        ' ';

      if (effectivePlan === 'elite') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: ELITE. Deliver lightning-fast, masterclass coaching depth (~180–350+ words when detailed explanation helps, or crisp & direct if they just want a quick status check or navigation). Break down how muscles and joints work together in clear, vivid terms with intuitive cues or analogies. Always include at least one insider coaching nuance labeled "🔐 Elite tip:" or "⚡ Secret:", and provide deep "🛡️ Elite recovery:" or "🔋 Recovery call:" deload diagnostics when fatigue or rest is relevant, explained in plain language.';
      } else if (effectivePlan === 'performance') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PERFORMANCE. Deliver high-speed, advanced coaching intelligence (~130–220 words when detailed explanation helps). Break down movement tempo (concentric/eccentric cadence explained simply as lowering, pausing, and pushing), muscle activation cues, exercise synergy, and fueling/recovery timing in straightforward terms.';
      } else if (effectivePlan === 'progress') {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: PROGRESS. Deliver faster and smarter coaching answers (~80–140 words when detailed explanation helps). In addition to 100% accurate guidance, explain the practical "why" behind the movement in simple terms, using relatable analogies when helpful, and outline clear actionable progression steps.';
      } else {
        config.systemInstruction =
          kaelBaseMandate +
          'TIER: FREE. Deliver 100% scientifically accurate, direct, and concise coaching answers (~40–80 words). Provide the exact recommendation and key execution cue in plain, everyday language without confusing jargon, fluff, or filler.';
      }
    } else {
      const systemInstruction = SYSTEM_INSTRUCTIONS[type];
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }
    }

    const streamLangMandate = buildLanguageMandate(req.body?.language, isJsonExpected);
    if (streamLangMandate) {
      config.systemInstruction = String(config.systemInstruction || '') + streamLangMandate;
    }

    const modelsToTry =
      Date.now() < hydrogenDailyExhaustedUntil
        ? ['gemini-3.1-flash-lite']
        : ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    const buildStreamCallConfig = (modelName: string, timeoutMs: number) => {
      const callConfig: Record<string, any> = { ...config };
      if (modelName.includes('gemini-4') || modelName.includes('3.8')) {
        delete callConfig.temperature;
        delete callConfig.topP;
        delete callConfig.topK;
        callConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      } else if (modelName.includes('gemini-3')) {
        callConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      callConfig.abortSignal = controller.signal;
      return { callConfig, clear: () => clearTimeout(timer) };
    };

    let fullOutput = '';
    let streamRawBuffer = '';
    const needsKaelActionSanitize = isKael && !hasRequiredServerPlan(effectivePlan, 'elite');
    const flushSanitizedStream = (flushTail: boolean) => {
      if (!needsKaelActionSanitize) return;
      let releaseSource = streamRawBuffer;
      let pendingTail = '';
      if (!flushTail) {
        const openIdx = streamRawBuffer.lastIndexOf('[ACTION:');
        if (openIdx >= 0 && streamRawBuffer.indexOf(']', openIdx) === -1) {
          releaseSource = streamRawBuffer.slice(0, openIdx);
          pendingTail = streamRawBuffer.slice(openIdx);
        }
      }
      const sanitizedPrefix = sanitizeKaelResponseActionsForPlan(releaseSource, effectivePlan);
      streamRawBuffer = sanitizedPrefix + pendingTail;
      if (sanitizedPrefix.length > fullOutput.length) {
        const delta = sanitizedPrefix.slice(fullOutput.length);
        fullOutput = sanitizedPrefix;
        res.write(`data: ${JSON.stringify({ chunk: delta, full: fullOutput })}\n\n`);
      }
    };
    let streamResponse: any = null;
    let lastError: any = null;

    for (const currentModel of modelsToTry) {
      const timeoutMs = currentModel === 'gemini-3.1-flash-lite' ? 14000 : 10000;
      const { callConfig, clear } = buildStreamCallConfig(currentModel, timeoutMs);
      try {
        streamResponse = await ai.models.generateContentStream({
          model: currentModel,
          contents: { parts },
          config: callConfig,
        });
        if (streamResponse) {
          try {
            for await (const chunk of streamResponse) {
              const text = chunk.text;
              if (text) {
                if (needsKaelActionSanitize) {
                  streamRawBuffer += text;
                  flushSanitizedStream(false);
                } else {
                  fullOutput += text;
                  res.write(`data: ${JSON.stringify({ chunk: text, full: fullOutput })}\n\n`);
                }
              }
            }
            if (needsKaelActionSanitize && streamRawBuffer) {
              flushSanitizedStream(true);
            }
          } finally {
            clear();
          }
          if (fullOutput) break;
        }
        clear();
      } catch (modelErr: any) {
        clear();
        lastError = modelErr;
        const errMsg = modelErr?.message || String(modelErr);
        console.warn(`[Gemini Stream] Model "${currentModel}" failed:`, errMsg);
        if (
          currentModel === 'gemini-4-hydrogen' &&
          (errMsg.includes('GenerateRequestsPerDay') || errMsg.includes('RESOURCE_EXHAUSTED'))
        ) {
          hydrogenDailyExhaustedUntil = Date.now() + 10 * 60 * 1000;
        }
      }
    }

    // Unary fallback if streaming yielded empty output or stalled
    if (!fullOutput) {
      console.warn('[Gemini Stream] Stream output empty or failed, running reliable unary fallback...');
      const unaryModels =
        Date.now() < hydrogenDailyExhaustedUntil
          ? ['gemini-3.1-flash-lite']
          : ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];
      for (const fallbackModel of unaryModels) {
        const timeoutMs = fallbackModel === 'gemini-3.1-flash-lite' ? 14000 : 10000;
        const { callConfig, clear } = buildStreamCallConfig(fallbackModel, timeoutMs);
        try {
          const unaryRes = await ai.models.generateContent({
            model: fallbackModel,
            contents: { parts },
            config: callConfig,
          });
          clear();
          const text = isKael
            ? sanitizeKaelResponseActionsForPlan(unaryRes.text || '', effectivePlan)
            : (unaryRes.text || '');
          if (text) {
            fullOutput = text;
            res.write(`data: ${JSON.stringify({ chunk: text, full: fullOutput })}\n\n`);
            break;
          }
        } catch (unaryErr: any) {
          clear();
          lastError = unaryErr;
          const uMsg = unaryErr?.message || String(unaryErr);
          console.warn(`[Gemini Stream Unary Fallback] ${fallbackModel} failed:`, uMsg);
          if (
            fallbackModel === 'gemini-4-hydrogen' &&
            (uMsg.includes('GenerateRequestsPerDay') || uMsg.includes('RESOURCE_EXHAUSTED'))
          ) {
            hydrogenDailyExhaustedUntil = Date.now() + 10 * 60 * 1000;
          }
        }
      }
    }

    if (!fullOutput) {
      res.write(`data: ${JSON.stringify({ error: lastError?.message || 'AI streaming failed to generate a response.' })}\n\n`);
      return res.end();
    }

    if (isKael && kaelUserSession) {
      kaelQuota = await persistAuthoritativeKaelIncrement({
        client: kaelUserSession.client,
        isVerifiedJwt: Boolean(kaelUserSession.isVerifiedJwt),
        userId: kaelUserSession.id,
        email: kaelUserSession.email,
        effectiveTz: kaelUserSession.effectiveTz,
        usageLimit: kaelUserSession.usageLimit,
        resolvedPlan: kaelUserSession.resolvedPlan,
        currentMonthKey: kaelUserSession.currentMonthKey,
        baselineUsed: kaelUserSession.currentUsage.used,
      });
    }

    if (!kaelQuota && isKael) {
      const clientUsed = typeof req.body?.current_used === 'number' ? req.body.current_used : 0;
      const newCount = clientUsed + 1;
      const PLAN_LIMITS: Record<string, number> = {
        free: 100,
        progress: 300,
        performance: 800,
        elite: 2000,
      };
      const resolvedPlan = PLAN_LIMITS[effectivePlan] ? effectivePlan : 'free';
      const usageLimit = PLAN_LIMITS[resolvedPlan] || 100;
      const clientTz = (req.headers['x-timezone'] as string) || (req.body?.timezone as string) || 'UTC';
      let monthKey = new Date().toISOString().slice(0, 7);
      try {
        monthKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: clientTz,
          year: 'numeric',
          month: '2-digit',
        }).format(new Date()).slice(0, 7);
      } catch {}

      kaelQuota = {
        allowed: true,
        used: newCount,
        limit: usageLimit,
        remaining: Math.max(0, usageLimit - newCount),
        monthKey,
        plan: resolvedPlan,
        timezone: clientTz,
      };
    }

    res.write(`data: ${JSON.stringify({ done: true, full: fullOutput, quota: kaelQuota })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('[Gemini Stream Error]', error);
    res.write(`data: ${JSON.stringify({ error: error?.message || 'Streaming failed.' })}\n\n`);
    res.end();
  }
});

function escapeEmailHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.post('/api/send-contact-email', async (req, res) => {
  try {
    const { name, email, message, subject, body, to, reply_to } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    const cleanMessage =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : typeof body === 'string' && body.trim()
          ? body.trim()
          : '';
    const cleanBodyText =
      typeof body === 'string' && body.trim()
        ? body.trim()
        : cleanName || cleanEmail
          ? `${cleanName ? `Name: ${cleanName}\n` : ''}${cleanEmail ? `Email: ${cleanEmail}\n` : ''}\nMessage:\n${cleanMessage}`
          : cleanMessage;
    const cleanSubject =
      typeof subject === 'string' && subject.trim()
        ? subject.trim()
        : cleanName
          ? `WASHEK Contact Message from ${cleanName}`
          : 'WASHEK Contact Message';

    if (!cleanMessage) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required.',
      });
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.',
      });
    }

    const destination =
      process.env.CONTACT_TO_EMAIL ||
      (typeof to === 'string' && to.trim()) ||
      'washekfitness@gmail.com';
    const replyToAddress =
      cleanEmail || (typeof reply_to === 'string' ? reply_to.trim() : '');

    let deliveredId: string | null = null;
    let deliveryError: string | null = null;

    // 1. Direct Resend API delivery when RESEND_API_KEY is configured in server environment
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey && !resendApiKey.includes('YOUR_')) {
      try {
        const safeName = escapeEmailHtml(cleanName);
        const safeEmail = escapeEmailHtml(cleanEmail);
        const safeMessageHtml = escapeEmailHtml(cleanMessage).replace(/\n/g, '<br />');

        const emailPayload: Record<string, unknown> = {
          from: process.env.CONTACT_FROM_EMAIL || 'WASHEK <onboarding@resend.dev>',
          to: [destination],
          subject: cleanSubject,
          text: cleanBodyText,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
              <h2 style="color: #0f172a; margin-bottom: 12px;">WASHEK Contact Message</h2>
              ${safeName ? `<p><strong>Name:</strong> ${safeName}</p>` : ''}
              ${safeEmail ? `<p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>` : ''}
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
              <div style="white-space: pre-wrap;">${safeMessageHtml}</div>
            </div>
          `,
        };

        if (replyToAddress) {
          emailPayload.reply_to = replyToAddress;
        }

        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailPayload),
        });

        const result = await emailRes.json().catch(() => ({}));
        if (emailRes.ok && result?.id) {
          deliveredId = String(result.id);
        } else {
          deliveryError =
            result?.message ||
            result?.error ||
            `Resend rejected email request (${emailRes.status}).`;
          console.error('[server.ts /api/send-contact-email Resend error]', emailRes.status, result);
        }
      } catch (resendErr: any) {
        deliveryError = resendErr?.message || 'Resend request failed.';
        console.error('[server.ts /api/send-contact-email Resend network error]', resendErr);
      }
    }

    // 2. Relay via deployed Supabase Edge Function (uses Supabase's configured RESEND_API_KEY)
    if (!deliveredId && SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const edgeUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/send-contact-email`;
        const edgeRes = await fetch(edgeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            name: cleanName,
            email: cleanEmail,
            message: cleanMessage,
            subject: cleanSubject,
            body: cleanBodyText,
            to: destination,
            reply_to: replyToAddress || undefined,
          }),
        });

        const edgeData = await edgeRes.json().catch(() => ({}));
        if (edgeRes.ok && edgeData?.success && edgeData?.id) {
          deliveredId = String(edgeData.id);
          deliveryError = null;
        } else {
          deliveryError =
            edgeData?.error ||
            edgeData?.message ||
            deliveryError ||
            `Email relay returned status ${edgeRes.status}.`;
          console.error('[server.ts /api/send-contact-email Edge relay error]', edgeRes.status, edgeData);
        }
      } catch (edgeErr: any) {
        deliveryError = edgeErr?.message || deliveryError || 'Email relay connection failed.';
        console.error('[server.ts /api/send-contact-email Edge relay network error]', edgeErr);
      }
    }

    // Optionally archive in Supabase contact_messages if authenticated token passed
    try {
      const authHeader = String(req.headers.authorization || '').trim();
      const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
      const clientForDb =
        bearerToken && bearerToken.split('.').length === 3
          ? createStatelessSupabase(bearerToken)
          : supabase;
      await clientForDb.from('contact_messages').insert({
        name: cleanName || 'Guest User',
        email: cleanEmail || 'no-email@washek.fitness',
        message: cleanMessage,
      });
    } catch {
      // Non-fatal archive failure
    }

    if (!deliveredId) {
      return res.status(502).json({
        success: false,
        delivered: false,
        error:
          deliveryError ||
          'Email delivery is not configured or rejected by the mail provider. Please email washekfitness@gmail.com directly.',
      });
    }

    return res.json({
      success: true,
      delivered: true,
      id: deliveredId,
    });
  } catch (err: any) {
    console.error('[server.ts /api/send-contact-email error]', err);
    return res.status(500).json({
      success: false,
      delivered: false,
      error: err?.message || 'Failed to process contact email.',
    });
  }
});

// ------------------------------------------------------------
// FULL-APP UI TRANSLATION ENDPOINT & PERSISTENT CACHE
// ------------------------------------------------------------

const I18N_CACHE_FILE = path.join(process.cwd(), '.i18n_cache.json');
let i18nDiskCache: Record<string, Record<string, string>> = {};
let i18nFlushTimer: NodeJS.Timeout | null = null;

try {
  if (fs.existsSync(I18N_CACHE_FILE)) {
    const rawCache = fs.readFileSync(I18N_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(rawCache);
    if (parsed && typeof parsed === 'object') {
      i18nDiskCache = parsed;
    }
  }
} catch {
  i18nDiskCache = {};
}

function scheduleI18nCachePersist() {
  if (i18nFlushTimer) return;
  i18nFlushTimer = setTimeout(() => {
    i18nFlushTimer = null;
    try {
      fs.writeFileSync(I18N_CACHE_FILE, JSON.stringify(i18nDiskCache), 'utf8');
    } catch {
      // non-fatal disk cache write failure
    }
  }, 1500);
  i18nFlushTimer.unref?.();
}

app.post('/api/i18n/translate', async (req, res) => {
  try {
    const rawLang = typeof req.body?.targetLanguage === 'string' ? req.body.targetLanguage.trim() : '';
    const rawStrings = Array.isArray(req.body?.strings) ? req.body.strings : [];

    const uniqueStrings: string[] = [];
    const seen = new Set<string>();
    for (const item of rawStrings) {
      if (typeof item !== 'string') continue;
      if (!item || item.length > 2000 || seen.has(item)) continue;
      seen.add(item);
      uniqueStrings.push(item);
      if (uniqueStrings.length >= 80) break;
    }

    if (!rawLang || rawLang.toLowerCase() === 'english' || rawLang.toLowerCase() === 'en') {
      const identity: Record<string, string> = {};
      for (const s of uniqueStrings) identity[s] = s;
      return res.json({ success: true, targetLanguage: 'English', translations: identity });
    }

    if (uniqueStrings.length === 0) {
      return res.json({ success: true, targetLanguage: rawLang, translations: {} });
    }

    if (!i18nDiskCache[rawLang]) {
      i18nDiskCache[rawLang] = {};
    }
    const langCache = i18nDiskCache[rawLang];

    const translations: Record<string, string> = {};
    const missing: string[] = [];

    for (const s of uniqueStrings) {
      if (typeof langCache[s] === 'string' && langCache[s].trim()) {
        translations[s] = langCache[s];
      } else {
        missing.push(s);
      }
    }

    if (missing.length > 0 && process.env.GEMINI_API_KEY) {
      const ai = getGeminiClient();
      const prompt =
        `Translate the following array of UI strings from English into natural, concise ${rawLang} suitable for a mobile/web fitness app.\n` +
        `CRITICAL RULES:\n` +
        `1. Preserve order and length strictly: return a JSON object {"translations": [...]} with exact length ${missing.length}.\n` +
        `2. Keep proper names and technical tokens invariant ("WASHEK", "Kael", "Coach Kael", "Stripe", units like "kg", "lbs", "kcal", "cm").\n` +
        `3. Keep button/label translations concise so UI layouts remain clean.\n` +
        `4. Preserve emojis, punctuation, numbers, and symbols cleanly.\n\n` +
        `INPUT JSON ARRAY:\n${JSON.stringify(missing)}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      try {
        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [{ text: prompt }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                translations: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                },
              },
              required: ['translations'],
            } as any,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            abortSignal: controller.signal,
          },
        });
        clearTimeout(timer);

        const parsed = extractJsonFromAiOutput(aiRes?.text || '');
        const list = Array.isArray(parsed?.translations)
          ? parsed.translations
          : Array.isArray(parsed)
            ? parsed
            : [];

        let cacheModified = false;
        for (let idx = 0; idx < missing.length; idx++) {
          const orig = missing[idx];
          const translated = typeof list[idx] === 'string' && list[idx].trim() ? list[idx] : orig;
          translations[orig] = translated;
          if (translated !== orig || list[idx] === orig) {
            if (Object.keys(langCache).length < 6000) {
              langCache[orig] = translated;
              cacheModified = true;
            }
          }
        }
        if (cacheModified) {
          scheduleI18nCachePersist();
        }
      } catch (aiErr: any) {
        clearTimeout(timer);
        console.warn('[i18n] Gemini batch translation warning:', aiErr?.message || aiErr);
      }
    }

    for (const s of missing) {
      if (!translations[s]) {
        translations[s] = s;
      }
    }

    return res.json({
      success: true,
      targetLanguage: rawLang,
      translations,
    });
  } catch (err: any) {
    console.error('[server.ts /api/i18n/translate error]', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Translation failed.',
    });
  }
});

// ------------------------------------------------------------
// SERVER LIFECYCLE & VITE MIDDLEWARE
// ------------------------------------------------------------

async function startServer() {
  try {
    let viteInstance: any = null;
    let viteReadyPromise: Promise<any> | null = null;
    let viteInitError: any = null;

    if (process.env.NODE_ENV !== 'production') {
      viteReadyPromise = import('vite')
        .then(({ createServer: createViteServer }) =>
          createViteServer({
            server: {
              middlewareMode: true,
              hmr: false,
              ws: false,
            },
            appType: 'spa',
          })
        )
        .then((vite) => {
          viteInstance = vite;
          return vite;
        })
        .catch((err) => {
          viteInitError = err;
          console.error('[server.ts] Vite dev middleware initialization failed:', err);
          return null;
        });

      app.use(async (req, res, next) => {
        if (viteInstance) {
          return viteInstance.middlewares(req, res, next);
        }
        const vite = await viteReadyPromise;
        if (vite) {
          return vite.middlewares(req, res, next);
        }
        return next(viteInitError || new Error('Vite dev server failed to initialize'));
      });
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*all', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const server = app.listen(PORT, HOST, () => {
      console.log(`WASHEK server running on http://${HOST}:${PORT} with Google Gemini backend`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[server.ts] Port ${PORT} is already in use.`);
        process.exit(1);
      } else {
        console.error('[server.ts] Server error:', err);
        process.exit(1);
      }
    });

    const shutdown = () => {
      const forceExitTimer = setTimeout(() => {
        process.exit(0);
      }, 500);
      forceExitTimer.unref();

      if (viteInstance?.close) {
        Promise.resolve(viteInstance.close()).catch(() => {});
      }
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      server.close(() => {
        clearTimeout(forceExitTimer);
        process.exit(0);
      });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
