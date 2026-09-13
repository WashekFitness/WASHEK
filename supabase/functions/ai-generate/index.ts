import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
};

const OPENROUTER_URL =
  'https://openrouter.ai/api/v1/chat/completions';
const MEDIA_BUCKET =
  Deno.env.get('SUPABASE_MEDIA_BUCKET') ||
  'user-media';

/*
 * Do not depend on openrouter/free for program generation.
 * OpenRouter's free router is dynamic, so the exact model/provider
 * selected can change from day to day. We instead give OpenRouter
 * an explicit FREE fallback chain. Provider-level fallback remains
 * enabled below, so each model can still fail over between providers.
 *
 * These are current OpenRouter free models as of September 2026.
 */
const FREE_TEXT_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

/*
 * Visual requests need models that accept image/video input.
 */
const FREE_VISION_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

const ALLOWED_TYPES = new Set([
  'general',
  'structure',
  'microcycle',
  'live_workout',
  'live_workout_adjustment',
  'kael',
  'form_analysis',
  'progress_photo',
  'weekly_update',
  'food_scan',
  'food_barcode',
]);

/*
 * These features contain visual media and therefore require
 * a multimodal model.
 */
const VISUAL_TYPES = new Set([
  'form_analysis',
  'progress_photo',
  'food_scan',
  'food_barcode',
]);

/*
 * These features expect the ENTIRE response to be a single
 * JSON object (parsed server-side in the retry loop below).
 */
const STRICT_JSON_TYPES = new Set([
  'structure',
  'microcycle',
]);

function getResponseFormat(type: string) {
  if (type === 'microcycle') {
    return { type: 'json_object' };
  }
  if (STRICT_JSON_TYPES.has(type)) {
    return { type: 'json_object' };
  }
  return null;
}

const SERVER_FEATURE_PLANS: Record<string, string> = {
  form_analysis: 'elite',
  progress_photo: 'performance',
  food_scan: 'progress',
  food_barcode: 'progress',
};

const PLAN_HIERARCHY = [
  'free',
  'progress',
  'performance',
  'elite',
];

const FULLY_ACTIVE_STATUSES = new Set([
  'active',
  'trialing',
]);

const GRACE_ELIGIBLE_STATUSES = new Set([
  'past_due',
  'unpaid',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

/* ============================================================
 * SUPABASE AUTH
 * ============================================================ */
function getSupabaseAnonKey() {
  const publishableKeysRaw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeysRaw) {
    try {
      const keys = JSON.parse(publishableKeysRaw);
      if (keys?.default) {
        return keys.default;
      }
    } catch {
      // Fall through.
    }
  }
  return Deno.env.get('SUPABASE_ANON_KEY') || '';
}

function getServiceRoleKey() {
  return (
    Deno.env.get('SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    ''
  );
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing authorization header.');
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase function authentication is not configured.'
    );
  }
  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not authenticated.');
  }
  return data.user;
}

/* ============================================================
 * SUBSCRIPTION AUTHORIZATION
 * ============================================================ */
function normalizePlan(value: unknown) {
  const plan = String(value || 'free').trim().toLowerCase();
  return PLAN_HIERARCHY.includes(plan) ? plan : 'free';
}

function hasRequiredPlan(userPlan: string, requiredPlan: string) {
  const userIndex = PLAN_HIERARCHY.indexOf(userPlan);
  const requiredIndex = PLAN_HIERARCHY.indexOf(requiredPlan);
  return (
    userIndex >= 0 &&
    requiredIndex >= 0 &&
    userIndex >= requiredIndex
  );
}

async function getUserPlan(req: Request, user: any) {
  const authHeader = req.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = getSupabaseAnonKey();
  if (!authHeader || !supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase function authentication is not configured.'
    );
  }
  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const { data, error } = await client
    .from('profiles')
    .select(
      'subscription_plan, subscription_status, subscription_grace_until'
    )
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[AI] PROFILE LOOKUP ERROR', {
      userId: user.id,
      message: error.message,
    });
    throw new Error('Unable to verify subscription status.');
  }

  const status = String(data?.subscription_status || '').toLowerCase();
  const graceUntil = data?.subscription_grace_until
    ? new Date(data.subscription_grace_until)
    : null;
  const withinGracePeriod =
    GRACE_ELIGIBLE_STATUSES.has(status) &&
    graceUntil !== null &&
    !Number.isNaN(graceUntil.getTime()) &&
    graceUntil.getTime() > Date.now();

  const isEntitled =
    FULLY_ACTIVE_STATUSES.has(status) || withinGracePeriod;

  const plan = normalizePlan(
    isEntitled ? data?.subscription_plan : 'free'
  );

  return { plan, status };
}

async function enforcePlanAccess(
  req: Request,
  user: any,
  type: string
) {
  const requiredPlan =
    type === 'live_workout_adjustment'
      ? 'elite'
      : SERVER_FEATURE_PLANS[type] || null;

  if (!requiredPlan) {
    return {
      allowed: true,
      plan: null,
      requiredPlan: null,
    };
  }

  const { plan } = await getUserPlan(req, user);
  if (!hasRequiredPlan(plan, requiredPlan)) {
    return {
      allowed: false,
      plan,
      requiredPlan,
    };
  }
  return {
    allowed: true,
    plan,
    requiredPlan,
  };
}

/* ============================================================
 * KAEL MESSAGE QUOTA (SERVER-ENFORCED)
 * ============================================================ */
async function claimKaelMessageServerSide(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = getSupabaseAnonKey();
  if (!authHeader || !supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase function authentication is not configured.'
    );
  }
  const client = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const { data, error } = await client.rpc('claim_kael_message');
  if (error) {
    console.error('[AI] KAEL QUOTA RPC ERROR', {
      message: error.message,
    });
    throw new Error(
      'Unable to verify your Kael message quota. Please try again.'
    );
  }
  return data;
}

/* ============================================================
 * STORAGE / MEDIA
 * ============================================================ */
function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}
function isDataUrl(value: string) {
  return /^data:/i.test(value);
}
function looksLikeVideoUrl(value: string) {
  return /\.(mp4|mpeg|mov|webm|m4v)(\?|$)/i.test(value);
}

async function resolveStoragePath(rawValue: string, userId: string) {
  const value = String(rawValue || '').trim();
  if (!value) {
    throw new Error('Empty media path.');
  }

  if (isHttpUrl(value) || isDataUrl(value)) {
    return value;
  }

  let path = value;
  const objectMarker = '/storage/v1/object/';
  const markerIndex = path.indexOf(objectMarker);
  if (markerIndex >= 0) {
    const afterMarker = path.slice(markerIndex + objectMarker.length);
    const parts = afterMarker.split('/');
    if (parts.length >= 2) {
      parts.shift();
      const bucket = parts.shift();
      if (bucket === MEDIA_BUCKET && parts.length > 0) {
        path = decodeURIComponent(parts.join('/'));
      }
    }
  }

  const expectedPrefix = `${userId}/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new Error(
      'The requested media does not belong to the authenticated user.'
    );
  }

  const serviceRoleKey = getServiceRoleKey();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!serviceRoleKey || !supabaseUrl) {
    throw new Error(
      'SERVICE_ROLE_KEY is not configured for private media access.'
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    console.error('[AI] STORAGE SIGNED URL ERROR', {
      path,
      bucket: MEDIA_BUCKET,
      message: error?.message || 'No signed URL returned.',
    });
    throw new Error(
      `Unable to access uploaded media: ${
        error?.message || 'signed URL could not be created.'
      }`
    );
  }
  return data.signedUrl;
}

async function resolveAllMedia(fileUrls: unknown[], userId: string) {
  if (!Array.isArray(fileUrls)) {
    return [];
  }
  const limited = fileUrls
    .slice(0, 8)
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const resolved: string[] = [];
  for (const value of limited) {
    const resolvedUrl = await resolveStoragePath(value, userId);
    resolved.push(resolvedUrl);
  }
  return resolved;
}

/* ============================================================
 * OPENROUTER MESSAGE BUILDING
 * ============================================================ */
function buildMessageContent(prompt: string, fileUrls: string[]) {
  if (!fileUrls?.length) {
    return prompt;
  }

  const content: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: prompt,
    },
  ];

  for (const rawUrl of fileUrls) {
    const url = String(rawUrl || '').trim();
    if (!url) {
      continue;
    }
    const lower = url.toLowerCase();

    if (lower.startsWith('data:video/')) {
      content.push({
        type: 'video_url',
        video_url: { url },
      });
      continue;
    }
    if (lower.startsWith('data:image/')) {
      content.push({
        type: 'image_url',
        image_url: { url },
      });
      continue;
    }
    if (looksLikeVideoUrl(lower)) {
      content.push({
        type: 'video_url',
        video_url: { url },
      });
      continue;
    }
    content.push({
      type: 'image_url',
      image_url: { url },
    });
  }
  return content;
}

/* ============================================================
 * RESPONSE PARSING
 * ============================================================ */
function extractText(responseJson: any) {
  const message = responseJson?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        return part?.text || part?.content || '';
      })
      .join('')
      .trim();
  }
  return '';
}

function stripMarkdownCodeFence(value: string) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function tryParseJson(value: string) {
  const cleaned = stripMarkdownCodeFence(value);
  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with recovery.
  }

  if (cleaned.startsWith('{{') && cleaned.endsWith('}}')) {
    try {
      return JSON.parse(cleaned.slice(1, -1).trim());
    } catch {
      // Continue with balanced-object recovery.
    }
  }

  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }
    if (char === '}') {
      if (depth > 0) {
        depth -= 1;
      }
      if (depth === 0 && start >= 0) {
        candidates.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }

  candidates.sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  const firstBrace = cleaned.indexOf('{');
  const secondBrace =
    firstBrace >= 0 ? cleaned.indexOf('{', firstBrace + 1) : -1;
  const lastBrace = cleaned.lastIndexOf('}');
  if (secondBrace >= 0 && lastBrace > secondBrace) {
    try {
      return JSON.parse(cleaned.slice(secondBrace, lastBrace + 1));
    } catch {
      // No recoverable JSON.
    }
  }
  return null;
}

/* ============================================================
 * MODEL SELECTION
 * ============================================================ */
function getModelsForRequest(type: string, hasMedia: boolean) {
  if (hasMedia || VISUAL_TYPES.has(type)) {
    return FREE_VISION_MODELS;
  }
  return FREE_TEXT_MODELS;
}

/*
 * ============================================================
 * RETRY BUDGET
 * ============================================================
 */
function getRetryBudget(type: string, hasMedia: boolean) {
  if (type === 'microcycle') {
    return {
      maxAttempts: 2,
      perAttemptMs: 65000,
      abortMs: 60000,
      sleepMs: 2000,
    };
  }
  if (hasMedia) {
    return {
      maxAttempts: 3,
      perAttemptMs: 20000,
      abortMs: 16000,
      sleepMs: 2000,
    };
  }
  return {
    maxAttempts: 4,
    perAttemptMs: 20000,
    abortMs: 16000,
    sleepMs: 2000,
  };
}

/* ============================================================
 * OPENROUTER ERROR HELPERS
 * ============================================================ */
function getErrorMessage(raw: any, fallback: string) {
  const message = raw?.error?.message || raw?.message || raw?.error;
  if (typeof message === 'string') {
    return message;
  }
  return fallback;
}

function shouldRetryStatus(status: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutError = new Error(`${label} timed out.`);
      (timeoutError as any).status = 504;
      reject(timeoutError);
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/* ============================================================
 * OPENROUTER REQUEST
 * ============================================================ */
async function callOpenRouter(
  apiKey: string,
  models: string[],
  type: string,
  prompt: string,
  fileUrls: string[],
  abortMs: number = 16000
) {
  const hasMedia = fileUrls.length > 0;
  const responseFormat = hasMedia ? null : getResponseFormat(type);
  const content = buildMessageContent(prompt, fileUrls);

  const messages: Array<Record<string, unknown>> = [];
  if (responseFormat) {
    messages.push({
      role: 'system',
      content:
        'Respond with a single valid JSON object and nothing else — no prose, no markdown code fences.',
    });
  }
  messages.push({
    role: 'user',
    content,
  });

  const payload: Record<string, unknown> = {
    models,
    messages,
    stream: false,
    temperature: 0.2,
    ...(responseFormat
      ? {
          response_format: responseFormat,
        }
      : {}),
    max_tokens:
      type === 'microcycle'
        ? 8000
        : type === 'structure'
          ? 2500
          : type === 'form_analysis'
            ? 3000
            : type === 'food_scan'
              ? 2500
              : type === 'progress_photo'
                ? 2500
                : 4000,
    provider: {
      allow_fallbacks: true,
    },
  };

  console.log('[AI] Trying OpenRouter FREE model fallback chain', {
    type,
    models,
    mediaCount: fileUrls.length,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), abortMs);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer':
          Deno.env.get('OPENROUTER_SITE_URL') ||
          'https://washekfitness.com',
        'X-OpenRouter-Title':
          Deno.env.get('OPENROUTER_SITE_NAME') || 'WASHEK',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = (error as any)?.name === 'AbortError';
    const timeoutError = new Error(
      aborted
        ? 'OpenRouter request timed out.'
        : error instanceof Error
          ? error.message
          : 'OpenRouter request failed.'
    );
    (timeoutError as any).status = aborted ? 504 : 502;
    throw timeoutError;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[AI] OpenRouter error:', {
      type,
      models,
      status: response.status,
      error: raw,
    });
    const error = new Error(
      getErrorMessage(
        raw,
        `OpenRouter request failed with status ${response.status}.`
      )
    );
    (error as any).status = response.status;
    (error as any).raw = raw;
    throw error;
  }

  const outputText = extractText(raw);
  if (!outputText) {
    const error = new Error('OpenRouter returned no assistant content.');
    (error as any).status = 502;
    throw error;
  }

  console.log('[AI] OpenRouter success', {
    type,
    model: raw?.model || models[0],
    requestedModels: models,
    usage: raw?.usage || null,
  });

  return {
    outputText,
    model: raw?.model || models[0],
    usage: raw?.usage || null,
  };
}

/* ============================================================
 * MAIN FUNCTION
 * ============================================================ */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  try {
    const user = await requireUser(req);
    const body = await req.json();
    const type = String(body?.type || 'general');
    const prompt = String(body?.prompt || '').trim();
    const rawFileUrls = Array.isArray(body?.file_urls)
      ? body.file_urls
      : [];

    if (!ALLOWED_TYPES.has(type)) {
      return json(
        {
          success: false,
          error: `Unsupported AI request type: ${type}`,
        },
        400
      );
    }
    if (!prompt) {
      return json(
        {
          success: false,
          error: 'Missing prompt.',
        },
        400
      );
    }

    /* --------------------------------------------------------
     * PLAN ACCESS
     * ------------------------------------------------------ */
    const access = await enforcePlanAccess(req, user, type);
    if (!access.allowed) {
      console.warn('[AI] PLAN DENIED', {
        userId: user.id,
        type,
        currentPlan: access.plan,
        requiredPlan: access.requiredPlan,
      });
      return json(
        {
          success: false,
          error: `This AI feature requires the ${access.requiredPlan} plan.`,
          error_code: 'FEATURE_REQUIRES_PLAN',
          current_plan: access.plan,
          required_plan: access.requiredPlan,
          type,
        },
        403
      );
    }

    /* --------------------------------------------------------
     * KAEL MESSAGE QUOTA
     * ------------------------------------------------------ */
    let kaelQuota: any = null;
    if (type === 'kael') {
      try {
        kaelQuota = await claimKaelMessageServerSide(req);
      } catch (quotaError) {
        console.error('[AI] KAEL QUOTA ERROR', {
          userId: user.id,
          error:
            quotaError instanceof Error
              ? quotaError.message
              : quotaError,
        });
        return json(
          {
            success: false,
            error:
              quotaError instanceof Error
                ? quotaError.message
                : 'Unable to verify your Kael message quota.',
            error_code: 'KAEL_QUOTA_ERROR',
          },
          500
        );
      }
      if (!kaelQuota?.allowed) {
        console.warn('[AI] KAEL LIMIT REACHED', {
          userId: user.id,
          quota: kaelQuota,
        });
        return json(
          {
            success: false,
            error: 'You have reached your monthly Kael message limit.',
            error_code: 'KAEL_LIMIT_REACHED',
            quota: kaelQuota,
            type,
          },
          429
        );
      }
    }

    /* --------------------------------------------------------
     * OPENROUTER KEY
     * ------------------------------------------------------ */
    const apiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!apiKey) {
      return json(
        {
          success: false,
          error: 'OPENROUTER_API_KEY is not configured in Supabase.',
        },
        500
      );
    }

    /* --------------------------------------------------------
     * RESOLVE PRIVATE MEDIA
     * ------------------------------------------------------ */
    let fileUrls: string[] = [];
    if (rawFileUrls.length) {
      try {
        fileUrls = await resolveAllMedia(rawFileUrls, user.id);
      } catch (mediaError) {
        console.error('[AI] MEDIA RESOLUTION ERROR', {
          userId: user.id,
          type,
          error: mediaError,
        });
        return json(
          {
            success: false,
            error:
              mediaError instanceof Error
                ? mediaError.message
                : 'Unable to access uploaded media.',
            error_code: 'MEDIA_ACCESS_ERROR',
          },
          400
        );
      }
    }

    const hasMedia = fileUrls.length > 0;

    /* --------------------------------------------------------
     * MODEL + RETRIES
     * ------------------------------------------------------ */
    const models = getModelsForRequest(type, hasMedia);
    const failures: Array<Record<string, unknown>> = [];

    const { maxAttempts, perAttemptMs, abortMs, sleepMs } =
      getRetryBudget(type, hasMedia);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await withDeadline(
          callOpenRouter(
            apiKey,
            models,
            type,
            prompt,
            fileUrls,
            abortMs
          ),
          perAttemptMs,
          'OpenRouter request'
        );

        const parsed = tryParseJson(result.outputText);

        if (type === 'microcycle') {
          if (
            !parsed ||
            typeof parsed !== 'object' ||
            !(parsed as any).microcycle ||
            !Array.isArray((parsed as any).microcycle.days) ||
            (parsed as any).microcycle.days.length === 0
          ) {
            console.error(
              '[AI] Expected valid microcycle JSON but received an invalid structured response',
              {
                userId: user.id,
                type,
                outputSnippet: result.outputText.slice(0, 2000),
              }
            );
            const structuredError = new Error(
              'The AI returned an invalid workout structure. Please try again.'
            );
            (structuredError as any).status = 502;
            throw structuredError;
          }
        }

        return json(
          {
            success: true,
            result: parsed ?? result.outputText,
            type,
            model: result.model,
            usage: result.usage,
            quota: kaelQuota,
          },
          200
        );
      } catch (error) {
        const status = Number((error as any)?.status || 0);
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown OpenRouter error.';

        failures.push({
          attempt: attempt + 1,
          models,
          status,
          message,
        });

        console.warn('[AI] Free model attempt failed', {
          type,
          attempt: attempt + 1,
          models,
          status,
          message,
        });

        if (status && !shouldRetryStatus(status)) {
          break;
        }
      }

      if (attempt < maxAttempts - 1) {
        await sleep(sleepMs);
      }
    }

    console.error(
      '[AI] All free OpenRouter model fallback attempts failed',
      {
        type,
        userId: user.id,
        failures,
      }
    );

    return json(
      {
        success: false,
        error:
          'The free AI service is temporarily unavailable. Please try again shortly.',
        error_code: 'FREE_AI_UNAVAILABLE',
        type,
        attempts: failures,
      },
      503
    );
  } catch (error) {
    console.error('[AI] Edge function error:', error);
    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'AI request failed.',
      },
      500
    );
  }
});
