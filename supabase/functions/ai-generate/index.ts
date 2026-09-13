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
 * IMPORTANT:
 *
 * We intentionally use OpenRouter's FREE router for visual requests.
 *
 * openrouter/free automatically selects from currently available
 * free models and filters for capabilities required by the request,
 * including image understanding.
 *
 * This is safer than hard-coding a small list of individual free
 * providers that may all be rate-limited at the same time.
 *
 * We NEVER fall back to a paid model.
 */
const FREE_VISION_MODEL =
  'openrouter/free';

/*
 * Text-only requests remain on OpenRouter's free router too.
 */
const DEFAULT_TEXT_MODEL =
  'openrouter/free';

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
 * For these — and only these — we ask OpenRouter for its
 * "json_object" response format. That tells the free router to
 * pick a backend that actually supports constrained JSON
 * generation, instead of hoping a randomly-selected free model
 * happens to format plain-text-requested JSON correctly.
 *
 * This is deliberately NOT applied to visual/multimodal types:
 * requiring both image support AND structured-output support
 * at once narrows the pool of compatible free backends, which
 * is the opposite of what we want for those requests. It's also
 * not applied to conversational types (kael, general), which
 * are meant to return plain text, not JSON.
 */
const STRICT_JSON_TYPES = new Set([
  'structure',
  'microcycle',
]);

/*
 * Server-side subscription requirements.
 *
 * Live Workout itself remains FREE.
 * Elite is only required for the adjustment flow.
 * Weekly Update remains FREE.
 */
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

/*
 * Statuses where the subscription is fully paid and current.
 * These are always entitled to the stored plan, no time limit.
 */
const FULLY_ACTIVE_STATUSES = new Set([
  'active',
  'trialing',
]);

/*
 * Statuses where the most recent payment failed.
 *
 * These remain entitled to the stored plan ONLY until the
 * profile's subscription_grace_until deadline passes. That
 * deadline is set once, by the Stripe webhook, the first time
 * a subscription enters one of these statuses (see
 * stripe-webhooks/index.ts -> syncSubscriptionToProfile).
 */
const GRACE_ELIGIBLE_STATUSES = new Set([
  'past_due',
  'unpaid',
]);

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/json',
      },
    }
  );
}

/* ============================================================
 * SUPABASE AUTH
 * ============================================================ */

function getSupabaseAnonKey() {
  const publishableKeysRaw =
    Deno.env.get(
      'SUPABASE_PUBLISHABLE_KEYS'
    );

  if (publishableKeysRaw) {
    try {
      const keys =
        JSON.parse(
          publishableKeysRaw
        );

      if (keys?.default) {
        return keys.default;
      }
    } catch {
      // Fall through.
    }
  }

  return (
    Deno.env.get(
      'SUPABASE_ANON_KEY'
    ) || ''
  );
}

function getServiceRoleKey() {
  /*
   * SERVICE_ROLE_KEY is a manually-configured project secret.
   * Fall back to SUPABASE_SERVICE_ROLE_KEY, which Supabase
   * always provides automatically to every Edge Function, so
   * this never silently breaks if the manual secret is missing
   * or gets lost on a redeploy.
   */
  return (
    Deno.env.get(
      'SERVICE_ROLE_KEY'
    ) ||
    Deno.env.get(
      'SUPABASE_SERVICE_ROLE_KEY'
    ) ||
    ''
  );
}

async function requireUser(
  req: Request
) {
  const authHeader =
    req.headers.get(
      'Authorization'
    );

  if (!authHeader) {
    throw new Error(
      'Missing authorization header.'
    );
  }

  const supabaseUrl =
    Deno.env.get(
      'SUPABASE_URL'
    );

  const supabaseKey =
    getSupabaseAnonKey();

  if (
    !supabaseUrl ||
    !supabaseKey
  ) {
    throw new Error(
      'Supabase function authentication is not configured.'
    );
  }

  const client =
    createClient(
      supabaseUrl,
      supabaseKey,
      {
        global: {
          headers: {
            Authorization:
              authHeader,
          },
        },
      }
    );

  const {
    data,
    error,
  } =
    await client.auth.getUser();

  if (
    error ||
    !data.user
  ) {
    throw new Error(
      'Not authenticated.'
    );
  }

  return data.user;
}

/* ============================================================
 * SUBSCRIPTION AUTHORIZATION
 * ============================================================ */

function normalizePlan(
  value: unknown
) {
  const plan =
    String(
      value || 'free'
    )
      .trim()
      .toLowerCase();

  return PLAN_HIERARCHY.includes(
    plan
  )
    ? plan
    : 'free';
}

function hasRequiredPlan(
  userPlan: string,
  requiredPlan: string
) {
  const userIndex =
    PLAN_HIERARCHY.indexOf(
      userPlan
    );

  const requiredIndex =
    PLAN_HIERARCHY.indexOf(
      requiredPlan
    );

  return (
    userIndex >= 0 &&
    requiredIndex >= 0 &&
    userIndex >= requiredIndex
  );
}

async function getUserPlan(
  req: Request,
  user: any
) {
  const authHeader =
    req.headers.get(
      'Authorization'
    );

  const supabaseUrl =
    Deno.env.get(
      'SUPABASE_URL'
    );

  const supabaseKey =
    getSupabaseAnonKey();

  if (
    !authHeader ||
    !supabaseUrl ||
    !supabaseKey
  ) {
    throw new Error(
      'Supabase function authentication is not configured.'
    );
  }

  const client =
    createClient(
      supabaseUrl,
      supabaseKey,
      {
        global: {
          headers: {
            Authorization:
              authHeader,
          },
        },
      }
    );

  const {
    data,
    error,
  } =
    await client
      .from('profiles')
      .select(
        'subscription_plan, subscription_status, subscription_grace_until'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle();

  if (error) {
    console.error(
      '[AI] PROFILE LOOKUP ERROR',
      {
        userId:
          user.id,
        message:
          error.message,
      }
    );

    throw new Error(
      'Unable to verify subscription status.'
    );
  }

  const status =
    String(
      data?.subscription_status ||
        ''
    ).toLowerCase();

  /*
   * A subscription that is fully paid (active/trialing) is
   * always entitled to its stored plan.
   *
   * A subscription with a recently failed payment
   * (past_due/unpaid) is ONLY entitled to its stored plan
   * until the grace deadline set by the Stripe webhook
   * passes. Once that deadline is in the past, treat the
   * user as Free — matching the same rule enforced by the
   * kael_effective_plan() database function.
   */
  const graceUntil =
    data?.subscription_grace_until
      ? new Date(
          data.subscription_grace_until
        )
      : null;

  const withinGracePeriod =
    GRACE_ELIGIBLE_STATUSES.has(
      status
    ) &&
    graceUntil !== null &&
    !Number.isNaN(
      graceUntil.getTime()
    ) &&
    graceUntil.getTime() >
      Date.now();

  const isEntitled =
    FULLY_ACTIVE_STATUSES.has(
      status
    ) ||
    withinGracePeriod;

  const plan =
    normalizePlan(
      isEntitled
        ? data?.subscription_plan
        : 'free'
    );

  return {
    plan,
    status,
  };
}

async function enforcePlanAccess(
  req: Request,
  user: any,
  type: string
) {
  /*
   * Live Workout basic AI is FREE.
   *
   * Only the dedicated adjustment flow
   * requires Elite.
   */
  const requiredPlan =
    type ===
    'live_workout_adjustment'
      ? 'elite'
      : SERVER_FEATURE_PLANS[type] ||
        null;

  if (!requiredPlan) {
    return {
      allowed: true,
      plan: null,
      requiredPlan: null,
    };
  }

  const {
    plan,
  } =
    await getUserPlan(
      req,
      user
    );

  if (
    !hasRequiredPlan(
      plan,
      requiredPlan
    )
  ) {
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
 * ============================================================
 *
 * IMPORTANT:
 *
 * The Kael monthly message limit MUST be claimed here, inside
 * this Edge Function, and not merely trusted from the browser.
 *
 * The `claim_kael_message()` Postgres function is SECURITY
 * DEFINER and atomically reserves one message slot for
 * whichever user's JWT is attached to the request. Because we
 * call it here — server-side, after the caller is already
 * authenticated — a user cannot get free/unlimited Kael
 * messages by calling this function directly and skipping
 * whatever the frontend normally does first.
 */

async function claimKaelMessageServerSide(
  req: Request
) {
  const authHeader =
    req.headers.get(
      'Authorization'
    );

  const supabaseUrl =
    Deno.env.get(
      'SUPABASE_URL'
    );

  const supabaseKey =
    getSupabaseAnonKey();

  if (
    !authHeader ||
    !supabaseUrl ||
    !supabaseKey
  ) {
    throw new Error(
      'Supabase function authentication is not configured.'
    );
  }

  const client =
    createClient(
      supabaseUrl,
      supabaseKey,
      {
        global: {
          headers: {
            Authorization:
              authHeader,
          },
        },
      }
    );

  const {
    data,
    error,
  } =
    await client.rpc(
      'claim_kael_message'
    );

  if (error) {
    console.error(
      '[AI] KAEL QUOTA RPC ERROR',
      {
        message:
          error.message,
      }
    );

    throw new Error(
      'Unable to verify your Kael message quota. Please try again.'
    );
  }

  return data;
}

/* ============================================================
 * STORAGE / MEDIA
 * ============================================================ */

function isHttpUrl(
  value: string
) {
  return /^https?:\/\//i.test(
    value
  );
}

function isDataUrl(
  value: string
) {
  return /^data:/i.test(
    value
  );
}

function looksLikeVideoUrl(
  value: string
) {
  return /\.(mp4|mpeg|mov|webm|m4v)(\?|$)/i.test(
    value
  );
}

async function resolveStoragePath(
  rawValue: string,
  userId: string
) {
  const value =
    String(
      rawValue || ''
    ).trim();

  if (!value) {
    throw new Error(
      'Empty media path.'
    );
  }

  /*
   * Already usable URLs/data URLs
   * do not need conversion.
   */
  if (
    isHttpUrl(value) ||
    isDataUrl(value)
  ) {
    return value;
  }

  let path = value;

  /*
   * Normalize a possible Supabase
   * Storage URL.
   */
  const objectMarker =
    '/storage/v1/object/';

  const markerIndex =
    path.indexOf(
      objectMarker
    );

  if (markerIndex >= 0) {
    const afterMarker =
      path.slice(
        markerIndex +
          objectMarker.length
      );

    const parts =
      afterMarker.split('/');

    if (
      parts.length >= 2
    ) {
      parts.shift();

      const bucket =
        parts.shift();

      if (
        bucket ===
          MEDIA_BUCKET &&
        parts.length > 0
      ) {
        path =
          decodeURIComponent(
            parts.join('/')
          );
      }
    }
  }

  /*
   * Security:
   *
   * Uploaded media must belong to
   * the authenticated user.
   */
  const expectedPrefix =
    `${userId}/`;

  if (
    !path.startsWith(
      expectedPrefix
    )
  ) {
    throw new Error(
      'The requested media does not belong to the authenticated user.'
    );
  }

  const serviceRoleKey =
    getServiceRoleKey();

  const supabaseUrl =
    Deno.env.get(
      'SUPABASE_URL'
    );

  if (
    !serviceRoleKey ||
    !supabaseUrl
  ) {
    throw new Error(
      'SERVICE_ROLE_KEY is not configured for private media access.'
    );
  }

  const admin =
    createClient(
      supabaseUrl,
      serviceRoleKey
    );

  const {
    data,
    error,
  } =
    await admin.storage
      .from(
        MEDIA_BUCKET
      )
      .createSignedUrl(
        path,
        3600
      );

  if (
    error ||
    !data?.signedUrl
  ) {
    console.error(
      '[AI] STORAGE SIGNED URL ERROR',
      {
        path,
        bucket:
          MEDIA_BUCKET,
        message:
          error?.message ||
          'No signed URL returned.',
      }
    );

    throw new Error(
      `Unable to access uploaded media: ${
        error?.message ||
        'signed URL could not be created.'
      }`
    );
  }

  return data.signedUrl;
}

async function resolveAllMedia(
  fileUrls: unknown[],
  userId: string
) {
  if (
    !Array.isArray(
      fileUrls
    )
  ) {
    return [];
  }

  /*
   * Hard safety limit.
   */
  const limited =
    fileUrls
      .slice(0, 8)
      .map(
        (value) =>
          String(
            value || ''
          ).trim()
      )
      .filter(Boolean);

  const resolved: string[] =
    [];

  for (
    const value of limited
  ) {
    const resolvedUrl =
      await resolveStoragePath(
        value,
        userId
      );

    resolved.push(
      resolvedUrl
    );
  }

  return resolved;
}

/* ============================================================
 * OPENROUTER MESSAGE BUILDING
 * ============================================================ */

function buildMessageContent(
  prompt: string,
  fileUrls: string[]
) {
  if (
    !fileUrls?.length
  ) {
    return prompt;
  }

  const content:
    Array<
      Record<string, unknown>
    > = [
    {
      type: 'text',
      text: prompt,
    },
  ];

  for (
    const rawUrl of fileUrls
  ) {
    const url =
      String(
        rawUrl || ''
      ).trim();

    if (!url) {
      continue;
    }

    const lower =
      url.toLowerCase();

    /*
     * Data URLs.
     */
    if (
      lower.startsWith(
        'data:video/'
      )
    ) {
      content.push({
        type: 'video_url',
        video_url: {
          url,
        },
      });

      continue;
    }

    if (
      lower.startsWith(
        'data:image/'
      )
    ) {
      content.push({
        type: 'image_url',
        image_url: {
          url,
        },
      });

      continue;
    }

    /*
     * Hosted video.
     */
    if (
      looksLikeVideoUrl(
        lower
      )
    ) {
      content.push({
        type: 'video_url',
        video_url: {
          url,
        },
      });

      continue;
    }

    /*
     * Supabase signed image URLs do not
     * reliably preserve file extensions,
     * so unknown hosted media is treated
     * as an image.
     */
    content.push({
      type: 'image_url',
      image_url: {
        url,
      },
    });
  }

  return content;
}

/* ============================================================
 * RESPONSE PARSING
 * ============================================================ */

function extractText(
  responseJson: any
) {
  const message =
    responseJson
      ?.choices?.[0]
      ?.message;

  const content =
    message?.content;

  if (
    typeof content ===
    'string'
  ) {
    return content.trim();
  }

  if (
    Array.isArray(content)
  ) {
    return content
      .map(
        (part) => {
          if (
            typeof part ===
            'string'
          ) {
            return part;
          }

          return (
            part?.text ||
            part?.content ||
            ''
          );
        }
      )
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

/*
 * Parse JSON returned by an LLM as defensively as possible.
 *
 * The free OpenRouter router can occasionally return a response such as:
 *
 * {
 * {
 *   "microcycle": { ... }
 * }
 * }
 *
 * The second opening brace is the actual JSON object. This parser first
 * tries normal JSON, then removes one accidental outer brace, then searches
 * for balanced JSON objects. This keeps structured generation from failing
 * just because a free model added one stray character around the payload.
 */
function tryParseJson(value: string) {
  const cleaned = stripMarkdownCodeFence(value);

  if (!cleaned) {
    return null;
  }

  // 1. Normal JSON.
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with recovery.
  }

  // 2. Exact recovery for an extra outer opening/closing brace.
  if (
    cleaned.startsWith('{{') &&
    cleaned.endsWith('}}')
  ) {
    try {
      return JSON.parse(cleaned.slice(1, -1).trim());
    } catch {
      // Continue with balanced-object recovery.
    }
  }

  // 3. Extract balanced JSON objects from prose or malformed wrappers.
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

  // 4. Exact fallback for the observed "{{ ... }}" pattern even if the
  // balanced scan could not identify the desired candidate.
  const firstBrace = cleaned.indexOf('{');
  const secondBrace =
    firstBrace >= 0
      ? cleaned.indexOf('{', firstBrace + 1)
      : -1;
  const lastBrace = cleaned.lastIndexOf('}');

  if (
    secondBrace >= 0 &&
    lastBrace > secondBrace
  ) {
    try {
      return JSON.parse(
        cleaned.slice(secondBrace, lastBrace + 1)
      );
    } catch {
      // No recoverable JSON.
    }
  }

  return null;
}

/* ============================================================
 * MODEL SELECTION
 * ============================================================ */

function getModelsForRequest(
  type: string,
  hasMedia: boolean
) {
  /*
   * Both visual and text requests use
   * OpenRouter's free router.
   *
   * For visual requests, OpenRouter filters
   * the free pool to models that support the
   * supplied image/video input.
   */
  if (
    hasMedia ||
    VISUAL_TYPES.has(type)
  ) {
    return [
      FREE_VISION_MODEL,
    ];
  }

  return [
    DEFAULT_TEXT_MODEL,
  ];
}

/*
 * ============================================================
 * RETRY BUDGET
 * ============================================================
 *
 * Not every request needs the same retry shape. A short chat
 * reply or a compact analysis benefits from more, quicker
 * attempts — the free router just needs another chance to pick
 * a working backend. A full week of structured workout JSON
 * (microcycle) is a much bigger generation: it genuinely needs
 * more wall-clock time to finish, and cutting it off too early
 * both times out AND produces truncated, invalid JSON. So it
 * gets fewer attempts, each with much more room to breathe.
 *
 * Every combination here is chosen to keep the worst case
 * (maxAttempts * perAttemptMs + (maxAttempts - 1) * sleepMs)
 * safely under Supabase's own platform time limit.
 */
function getRetryBudget(
  type: string,
  hasMedia: boolean
) {
  if (type === 'microcycle') {
    return {
      maxAttempts: 2,
      perAttemptMs: 60000,
      abortMs: 55000,
      sleepMs: 2000,
    };
    // Worst case: 2 * 60000 + 1 * 2000 = 122s.
  }

  if (hasMedia) {
    return {
      maxAttempts: 3,
      perAttemptMs: 20000,
      abortMs: 16000,
      sleepMs: 2000,
    };
    // Worst case: 3 * 20000 + 2 * 2000 = 64s.
  }

  return {
    maxAttempts: 4,
    perAttemptMs: 20000,
    abortMs: 16000,
    sleepMs: 2000,
  };
  // Worst case: 4 * 20000 + 3 * 2000 = 86s.
}

/* ============================================================
 * OPENROUTER ERROR HELPERS
 * ============================================================ */

function getErrorMessage(
  raw: any,
  fallback: string
) {
  const message =
    raw?.error?.message ||
    raw?.message ||
    raw?.error;

  if (
    typeof message ===
    'string'
  ) {
    return message;
  }

  return fallback;
}

function shouldRetryStatus(
  status: number
) {
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

/*
 * Wait briefly before retrying the free router.
 *
 * This is intentionally short because we don't
 * want a user request hanging for a long time.
 */
function sleep(
  milliseconds: number
) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

/*
 * ============================================================
 * HARD DEADLINE
 * ============================================================
 *
 * AbortController.abort() is supposed to cut an in-flight
 * fetch off at a fixed time, but it is only a request to the
 * underlying connection to stop — if a remote provider hangs
 * in a way that doesn't tear down cleanly, the awaited promise
 * can still sit unresolved well past the abort timer. When
 * that happens here, Supabase's own platform-level idle
 * timeout (around 150s) is what finally kills the function,
 * which shows up to the user as a long silent hang instead of
 * a fast, clean error.
 *
 * withDeadline() is a second, unconditional layer: it always
 * settles at `ms`, regardless of what the wrapped promise is
 * doing. If the underlying call is still stuck, we simply stop
 * waiting on it here and return control to our own retry loop
 * — the abandoned request is discarded once this function
 * finishes and returns a response.
 */
function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>(
    (resolve, reject) => {
      const timer =
        setTimeout(
          () => {
            const timeoutError =
              new Error(
                `${label} timed out.`
              );

            (
              timeoutError as any
            ).status = 504;

            reject(
              timeoutError
            );
          },
          ms
        );

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    }
  );
}

/* ============================================================
 * OPENROUTER REQUEST
 * ============================================================ */

async function callOpenRouter(
  apiKey: string,
  model: string,
  type: string,
  prompt: string,
  fileUrls: string[],
  abortMs: number = 16000
) {
  const hasMedia =
    fileUrls.length > 0;

  const wantsStrictJson =
    !hasMedia &&
    STRICT_JSON_TYPES.has(
      type
    );

  const content =
    buildMessageContent(
      prompt,
      fileUrls
    );

  const messages:
    Array<
      Record<string, unknown>
    > = [];

  if (wantsStrictJson) {
    /*
     * Guarantee the "json_object" response format's
     * requirement (the word "json" must appear
     * somewhere in the conversation) is always met
     * here, in the backend, rather than depending on
     * the exact wording of whatever prompt the caller
     * happens to send.
     */
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

  const payload:
    Record<string, unknown> = {
    model,

    messages,

    stream: false,

    temperature: 0.2,

    ...(wantsStrictJson
      ? {
          response_format: {
            type: 'json_object',
          },
        }
      : {}),

    max_tokens:
      type === 'microcycle'
        ? 8000
        : type === 'structure'
          ? 2500
          : type ===
              'form_analysis'
            ? 3000
            : type ===
                'food_scan'
              ? 2500
              : type ===
                  'progress_photo'
                ? 2500
                : 4000,

    /*
     * Tell OpenRouter it is allowed to use
     * alternative providers.
     *
     * We still remain on the FREE model.
     */
    provider: {
      allow_fallbacks: true,
    },
  };

  /*
   * Do not send response_format for visual
   * requests because free multimodal providers
   * have inconsistent structured-output support.
   *
   * JSON is requested in the prompt and parsed
   * after the response.
   */
  if (!hasMedia) {
    // Text-only requests intentionally remain
    // provider-compatible without forcing a schema.
  }

  console.log(
    '[AI] Trying OpenRouter free router',
    {
      type,
      model,
      mediaCount:
        fileUrls.length,
    }
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      abortMs
    );

  let response:
    Response;

  try {
    response =
      await fetch(
        OPENROUTER_URL,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            'Content-Type':
              'application/json',

            'HTTP-Referer':
              Deno.env.get(
                'OPENROUTER_SITE_URL'
              ) ||
              'https://washekfitness.com',

            'X-OpenRouter-Title':
              Deno.env.get(
                'OPENROUTER_SITE_NAME'
              ) ||
              'WASHEK',
          },

          body:
            JSON.stringify(
              payload
            ),

          signal:
            controller.signal,
        }
      );
  } catch (
    error
  ) {
    const aborted =
      (error as any)
        ?.name ===
      'AbortError';

    const timeoutError =
      new Error(
        aborted
          ? 'OpenRouter request timed out.'
          : error instanceof Error
            ? error.message
            : 'OpenRouter request failed.'
      );

    (
      timeoutError as any
    ).status =
      aborted
        ? 504
        : 502;

    throw timeoutError;
  } finally {
    clearTimeout(
      timeout
    );
  }

  const raw =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    console.error(
      '[AI] OpenRouter error:',
      {
        type,
        model,
        status:
          response.status,
        error: raw,
      }
    );

    const error =
      new Error(
        getErrorMessage(
          raw,
          `OpenRouter request failed with status ${response.status}.`
        )
      );

    (
      error as any
    ).status =
      response.status;

    (
      error as any
    ).raw =
      raw;

    throw error;
  }

  const outputText =
    extractText(
      raw
    );

  if (!outputText) {
    const error =
      new Error(
        'OpenRouter returned no assistant content.'
      );

    (
      error as any
    ).status =
      502;

    throw error;
  }

  console.log(
    '[AI] OpenRouter success',
    {
      type,
      model:
        raw?.model ||
        model,
      usage:
        raw?.usage ||
        null,
    }
  );

  return {
    outputText,

    model:
      raw?.model ||
      model,

    usage:
      raw?.usage ||
      null,
  };
}

/* ============================================================
 * MAIN FUNCTION
 * ============================================================ */

Deno.serve(
  async (req) => {
    if (
      req.method ===
      'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          headers:
            corsHeaders,
        }
      );
    }

    try {
      const user =
        await requireUser(
          req
        );

      const body =
        await req.json();

      const type =
        String(
          body?.type ||
            'general'
        );

      const prompt =
        String(
          body?.prompt ||
            ''
        ).trim();

      const rawFileUrls =
        Array.isArray(
          body?.file_urls
        )
          ? body.file_urls
          : [];

      if (
        !ALLOWED_TYPES.has(
          type
        )
      ) {
        return json(
          {
            success:
              false,

            error:
              `Unsupported AI request type: ${type}`,
          },
          400
        );
      }

      if (!prompt) {
        return json(
          {
            success:
              false,

            error:
              'Missing prompt.',
          },
          400
        );
      }

      /* --------------------------------------------------------
       * PLAN ACCESS
       * ------------------------------------------------------ */

      const access =
        await enforcePlanAccess(
          req,
          user,
          type
        );

      if (
        !access.allowed
      ) {
        console.warn(
          '[AI] PLAN DENIED',
          {
            userId:
              user.id,

            type,

            currentPlan:
              access.plan,

            requiredPlan:
              access.requiredPlan,
          }
        );

        return json(
          {
            success:
              false,

            error:
              `This AI feature requires the ${access.requiredPlan} plan.`,

            error_code:
              'FEATURE_REQUIRES_PLAN',

            current_plan:
              access.plan,

            required_plan:
              access.requiredPlan,

            type,
          },
          403
        );
      }

      /* --------------------------------------------------------
       * KAEL MESSAGE QUOTA
       *
       * This is the actual enforcement point. It cannot be
       * bypassed by skipping a client-side RPC call, because
       * it runs here regardless of what the caller sent.
       * ------------------------------------------------------ */

      let kaelQuota: any = null;

      if (type === 'kael') {
        try {
          kaelQuota =
            await claimKaelMessageServerSide(
              req
            );
        } catch (
          quotaError
        ) {
          console.error(
            '[AI] KAEL QUOTA ERROR',
            {
              userId:
                user.id,
              error:
                quotaError instanceof
                Error
                  ? quotaError.message
                  : quotaError,
            }
          );

          return json(
            {
              success:
                false,

              error:
                quotaError instanceof
                Error
                  ? quotaError.message
                  : 'Unable to verify your Kael message quota.',

              error_code:
                'KAEL_QUOTA_ERROR',
            },
            500
          );
        }

        if (
          !kaelQuota?.allowed
        ) {
          console.warn(
            '[AI] KAEL LIMIT REACHED',
            {
              userId:
                user.id,
              quota:
                kaelQuota,
            }
          );

          return json(
            {
              success:
                false,

              error:
                'You have reached your monthly Kael message limit.',

              error_code:
                'KAEL_LIMIT_REACHED',

              quota:
                kaelQuota,

              type,
            },
            429
          );
        }
      }

      /* --------------------------------------------------------
       * OPENROUTER KEY
       * ------------------------------------------------------ */

      const apiKey =
        Deno.env.get(
          'OPENROUTER_API_KEY'
        );

      if (!apiKey) {
        return json(
          {
            success:
              false,

            error:
              'OPENROUTER_API_KEY is not configured in Supabase.',
          },
          500
        );
      }

      /* --------------------------------------------------------
       * RESOLVE PRIVATE MEDIA
       * ------------------------------------------------------ */

      let fileUrls:
        string[] = [];

      if (
        rawFileUrls.length
      ) {
        try {
          fileUrls =
            await resolveAllMedia(
              rawFileUrls,
              user.id
            );
        } catch (
          mediaError
        ) {
          console.error(
            '[AI] MEDIA RESOLUTION ERROR',
            {
              userId:
                user.id,

              type,

              error:
                mediaError,
            }
          );

          return json(
            {
              success:
                false,

              error:
                mediaError instanceof
                Error
                  ? mediaError.message
                  : 'Unable to access uploaded media.',

              error_code:
                'MEDIA_ACCESS_ERROR',
            },
            400
          );
        }
      }

      const hasMedia =
        fileUrls.length >
        0;

      /* --------------------------------------------------------
       * MODEL
       * ------------------------------------------------------ */

      const models =
        getModelsForRequest(
          type,
          hasMedia
        );

      const failures:
        Array<
          Record<string, unknown>
        > = [];

      /*
       * Because openrouter/free is itself
       * a router, retrying it gives OpenRouter
       * another opportunity to select an
       * available free endpoint.
       *
       * The shape of that retry (how many attempts,
       * how long each one gets) depends on what kind
       * of request this is — see getRetryBudget().
       */
      const {
        maxAttempts,
        perAttemptMs,
        abortMs,
        sleepMs,
      } =
        getRetryBudget(
          type,
          hasMedia
        );

      for (
        let attempt = 0;
        attempt <
        maxAttempts;
        attempt++
      ) {
        for (
          const model of models
        ) {
          try {
            const result =
              await withDeadline(
                callOpenRouter(
                  apiKey,
                  model,
                  type,
                  prompt,
                  fileUrls,
                  abortMs
                ),
                perAttemptMs,
                'OpenRouter request'
              );

            /*
             * Visual features expect JSON.
             * Parse it ourselves because we
             * deliberately don't force
             * response_format on free
             * multimodal providers.
             */
            // All structured requests are parsed server-side. In particular,
            // microcycle generation must never return malformed/raw model text
            // to onboarding as if it were a valid workout object.
            const parsed =
              tryParseJson(
                result.outputText
              );

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
                success:
                  true,

                result:
                  parsed ??
                  result.outputText,

                type,

                model:
                  result.model,

                usage:
                  result.usage,

                quota:
                  kaelQuota,
              },
              200
            );
          } catch (
            error
          ) {
            const status =
              Number(
                (error as any)
                  ?.status ||
                  0
              );

            const message =
              error instanceof
              Error
                ? error.message
                : 'Unknown OpenRouter error.';

            failures.push(
              {
                attempt:
                  attempt + 1,

                model,

                status,

                message,
              }
            );

            console.warn(
              '[AI] Free model attempt failed',
              {
                type,
                attempt:
                  attempt + 1,
                model,
                status,
                message,
              }
            );

            /*
             * Permanent request errors should
             * not be retried repeatedly.
             */
            if (
              status &&
              !shouldRetryStatus(
                status
              )
            ) {
              break;
            }
          }
        }

        /*
         * Longer pause before giving the free
         * router another opportunity — enough for
         * its internal state to plausibly shift to
         * a different backend, not just an instant
         * retry against the same overloaded one.
         */
        if (
          attempt <
          maxAttempts - 1
        ) {
          await sleep(
            sleepMs
          );
        }
      }

      console.error(
        '[AI] All free OpenRouter attempts failed',
        {
          type,

          userId:
            user.id,

          failures,
        }
      );

      return json(
        {
          success:
            false,

          error:
            'The free AI vision service is temporarily unavailable. Please try again shortly.',

          error_code:
            'FREE_AI_UNAVAILABLE',

          type,

          attempts:
            failures,
        },
        503
      );
    } catch (
      error
    ) {
      console.error(
        '[AI] Edge function error:',
        error
      );

      return json(
        {
          success:
            false,

          error:
            error instanceof
            Error
              ? error.message
              : 'AI request failed.',
        },
        500
      );
    }
  }
);
