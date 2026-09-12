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

const VISUAL_TYPES = new Set([
  'form_analysis',
  'progress_photo',
  'food_scan',
  'food_barcode',
]);

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
 * KAEL MESSAGE QUOTA
 * ============================================================ */

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
      'Unable to verify your Kael message quota.'
    );
  }

  if (
    !data ||
    typeof data !==
      'object'
  ) {
    throw new Error(
      'Unable to verify your Kael message quota.'
    );
  }

  return data;
}

/* ============================================================
 * MEDIA
 * ============================================================ */

function isPrivateStoragePath(
  value: string
) {
  return (
    value.startsWith(
      'storage://'
    ) ||
    value.startsWith(
      'private://'
    )
  );
}

function cleanStoragePath(
  value: string
) {
  return value
    .replace(
      /^storage:\/\//,
      ''
    )
    .replace(
      /^private:\/\//,
      ''
    )
    .replace(
      /^\/+/,
      ''
    );
}

async function resolveMediaUrl(
  client: any,
  userId: string,
  value: string
) {
  const raw =
    String(
      value || ''
    ).trim();

  if (!raw) {
    return null;
  }

  if (
    /^https?:\/\//i.test(
      raw
    )
  ) {
    return raw;
  }

  const path =
    cleanStoragePath(
      raw
    );

  if (
    !path ||
    !path.startsWith(
      `${userId}/`
    )
  ) {
    throw new Error(
      'Invalid private media path.'
    );
  }

  const {
    data,
    error
  } =
    await client.storage
      .from(
        MEDIA_BUCKET
      )
      .createSignedUrl(
        path,
        60 * 15
      );

  if (
    error ||
    !data?.signedUrl
  ) {
    throw new Error(
      'Unable to create a temporary media URL.'
    );
  }

  return data.signedUrl;
}

async function resolveAllMedia(
  values: string[],
  userId: string
) {
  const supabaseUrl =
    Deno.env.get(
      'SUPABASE_URL'
    );

  const serviceRoleKey =
    getServiceRoleKey();

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    throw new Error(
      'Supabase service configuration is missing.'
    );
  }

  const client =
    createClient(
      supabaseUrl,
      serviceRoleKey
    );

  const resolved: string[] =
    [];

  for (
    const value of values
  ) {
    const url =
      await resolveMediaUrl(
        client,
        userId,
        value
      );

    if (url) {
      resolved.push(
        url
      );
    }
  }

  return resolved;
}

/* ============================================================
 * OPENROUTER HELPERS
 * ============================================================ */

function getModelsForRequest(
  type: string,
  hasMedia: boolean
) {
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

function buildMessageContent(
  prompt: string,
  fileUrls: string[]
) {
  if (
    !fileUrls.length
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
    const url of fileUrls
  ) {
    content.push({
      type: 'image_url',
      image_url: {
        url,
      },
    });
  }

  return content;
}

function getErrorMessage(
  raw: any,
  fallback: string
) {
  const candidates = [
    raw?.error?.message,
    raw?.message,
    raw?.error,
  ];

  for (
    const candidate of candidates
  ) {
    if (
      typeof candidate ===
      'string'
    ) {
      const trimmed =
        candidate.trim();

      if (trimmed) {
        return trimmed;
      }
    }
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
    status >= 500
  );
}

/*
 * OpenRouter normally returns:
 *
 * choices[0].message.content
 *
 * Depending on the provider selected by
 * openrouter/free, however, compatible response
 * shapes can vary.
 *
 * IMPORTANT:
 *
 * We intentionally DO NOT use reasoning as the
 * assistant answer. Reasoning is not the workout.
 */
function extractText(
  raw: any
) {
  const message =
    raw?.choices?.[0]
      ?.message;

  const content =
    message?.content;

  if (
    typeof content ===
    'string'
  ) {
    const trimmed =
      content.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  /*
   * Some providers return content as an
   * array of blocks.
   */
  if (
    Array.isArray(content)
  ) {
    const text =
      content
        .map(
          (item: any) => {
            if (
              typeof item ===
              'string'
            ) {
              return item;
            }

            if (
              typeof item?.text ===
              'string'
            ) {
              return item.text;
            }

            if (
              typeof item?.content ===
              'string'
            ) {
              return item.content;
            }

            return '';
          }
        )
        .join('')
        .trim();

    if (text) {
      return text;
    }
  }

  /*
   * A few OpenAI-compatible endpoints can
   * expose the completion under choices[].text.
   */
  const choiceText =
    raw?.choices?.[0]?.text;

  if (
    typeof choiceText ===
    'string' &&
    choiceText.trim()
  ) {
    return choiceText.trim();
  }

  /*
   * Some compatible gateways expose an output
   * array. We only accept actual text content.
   */
  if (
    Array.isArray(
      raw?.output
    )
  ) {
    const outputText =
      raw.output
        .flatMap(
          (item: any) => {
            if (
              typeof item ===
              'string'
            ) {
              return [item];
            }

            if (
              typeof item?.text ===
              'string'
            ) {
              return [item.text];
            }

            if (
              Array.isArray(
                item?.content
              )
            ) {
              return item.content
                .map(
                  (part: any) =>
                    typeof part ===
                    'string'
                      ? part
                      : part?.text ||
                        ''
                );
            }

            return [];
          }
        )
        .join('')
        .trim();

    if (outputText) {
      return outputText;
    }
  }

  return '';
}

function summarizeEmptyResponse(
  raw: any
) {
  const choice =
    raw?.choices?.[0];

  const message =
    choice?.message;

  return {
    id:
      raw?.id ||
      null,

    model:
      raw?.model ||
      null,

    choices:
      Array.isArray(
        raw?.choices
      )
        ? raw.choices.length
        : 0,

    finishReason:
      choice?.finish_reason ||
      null,

    hasMessage:
      Boolean(message),

    messageKeys:
      message &&
      typeof message ===
        'object'
        ? Object.keys(
            message
          )
        : [],

    hasContent:
      typeof message?.content ===
      'string'
        ? Boolean(
            message.content.trim()
          )
        : Array.isArray(
            message?.content
          )
          ? message.content
              .length > 0
          : false,

    hasReasoning:
      Boolean(
        message?.reasoning
      ),

    reasoningDetails:
      Array.isArray(
        message?.reasoning_details
      )
        ? message
            .reasoning_details
            .length
        : 0,

    usage:
      raw?.usage ||
      null,

    error:
      raw?.error ||
      null,
  };
}

function stripMarkdownCodeFence(
  value: string
) {
  return String(value || '')
    .replace(
      /^\uFEFF/,
      ''
    )
    .replace(
      /^```(?:json)?\s*/i,
      ''
    )
    .replace(
      /\s*```$/i,
      ''
    )
    .trim();
}

/*
 * Parse JSON returned by an LLM as defensively
 * as possible.
 */
function tryParseJson(
  value: string
) {
  const cleaned =
    stripMarkdownCodeFence(
      value
    );

  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    // Continue.
  }

  if (
    cleaned.startsWith(
      '{{'
    ) &&
    cleaned.endsWith(
      '}}'
    )
  ) {
    try {
      return JSON.parse(
        cleaned
          .slice(
            1,
            -1
          )
          .trim()
      );
    } catch {
      // Continue.
    }
  }

  const candidates: string[] =
    [];

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (
    let i = 0;
    i <
    cleaned.length;
    i += 1
  ) {
    const char =
      cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (
        char === '\\'
      ) {
        escaped = true;
        continue;
      }

      if (
        char === '"'
      ) {
        inString = false;
      }

      continue;
    }

    if (
      char === '"'
    ) {
      inString = true;
      continue;
    }

    if (
      char === '{'
    ) {
      if (
        depth === 0
      ) {
        start = i;
      }

      depth += 1;
      continue;
    }

    if (
      char === '}'
    ) {
      if (
        depth > 0
      ) {
        depth -= 1;
      }

      if (
        depth === 0 &&
        start >= 0
      ) {
        candidates.push(
          cleaned.slice(
            start,
            i + 1
          )
        );

        start = -1;
      }
    }
  }

  candidates.sort(
    (a, b) =>
      b.length -
      a.length
  );

  for (
    const candidate of candidates
  ) {
    try {
      return JSON.parse(
        candidate
      );
    } catch {
      // Continue.
    }
  }

  for (
    let startIndex = 0;
    startIndex <
    cleaned.length;
    startIndex += 1
  ) {
    if (
      cleaned[startIndex] !==
      '{'
    ) {
      continue;
    }

    let localDepth = 0;
    let localInString =
      false;
    let localEscaped =
      false;

    for (
      let i =
        startIndex;
      i <
      cleaned.length;
      i += 1
    ) {
      const char =
        cleaned[i];

      if (
        localInString
      ) {
        if (
          localEscaped
        ) {
          localEscaped =
            false;
          continue;
        }

        if (
          char === '\\'
        ) {
          localEscaped =
            true;
          continue;
        }

        if (
          char === '"'
        ) {
          localInString =
            false;
        }

        continue;
      }

      if (
        char === '"'
      ) {
        localInString =
          true;
        continue;
      }

      if (
        char === '{'
      ) {
        localDepth += 1;
      } else if (
        char === '}'
      ) {
        localDepth -= 1;

        if (
          localDepth ===
          0
        ) {
          try {
            return JSON.parse(
              cleaned.slice(
                startIndex,
                i + 1
              )
            );
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

/* ============================================================
 * RETRY
 * ============================================================ */

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

/* ============================================================
 * OPENROUTER REQUEST
 * ============================================================ */

async function callOpenRouter(
  apiKey: string,
  model: string,
  type: string,
  prompt: string,
  fileUrls: string[]
) {
  const hasMedia =
    fileUrls.length > 0;

  const content =
    buildMessageContent(
      prompt,
      fileUrls
    );

  const payload:
    Record<string, unknown> =
    {
      model,

      messages: [
        {
          role: 'user',
          content,
        },
      ],

      stream: false,

      temperature: 0.2,

      max_tokens:
        type === 'microcycle'
          ? 6500
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
       * Important:
       *
       * Prevent thinking/reasoning from consuming the
       * output budget when the dynamically selected free
       * model supports the OpenRouter reasoning parameter.
       *
       * Models that do not expose reasoning simply ignore
       * the setting through OpenRouter's normalized API.
       */
      reasoning: {
        effort: 'none',
      },

      provider: {
        allow_fallbacks: true,
      },
    };

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

  /*
   * Free-router endpoints can occasionally
   * take longer than 45 seconds.
   */
  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      60000
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
          : error instanceof
              Error
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
    /*
     * This is the exact condition that was producing:
     *
     * "OpenRouter returned no assistant content."
     *
     * Do not treat reasoning as workout content.
     * Instead, expose the response shape in logs so
     * the retry system can try another free endpoint
     * and future failures are diagnosable.
     */
    console.warn(
      '[AI] OpenRouter returned no usable assistant content',
      {
        type,
        model,
        response:
          summarizeEmptyResponse(
            raw
          ),
      }
    );

    const error =
      new Error(
        'OpenRouter returned no usable assistant content.'
      );

    (
      error as any
    ).status =
      502;

    (
      error as any
    ).raw =
      raw;

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
       * ------------------------------------------------------ */

      let kaelQuota: any =
        null;

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
       * The free router is itself a router.
       *
       * We deliberately retry it several times because a
       * temporary provider failure, timeout, or empty
       * response should not immediately fail generation.
       */
      const MAX_ATTEMPTS =
        hasMedia
          ? 4
          : type === 'microcycle'
            ? 4
            : 3;

      for (
        let attempt = 0;
        attempt <
        MAX_ATTEMPTS;
        attempt++
      ) {
        for (
          const model of models
        ) {
          try {
            let resultPrompt =
              prompt;

            /*
             * Microcycle generation is reinforced here at
             * the server boundary.
             *
             * This does NOT change the client's workout
             * generation function. It only tells the model
             * exactly what the server will accept.
             */
            if (
              type ===
              'microcycle'
            ) {
              resultPrompt = `${prompt}

SERVER OUTPUT CONTRACT — MANDATORY:
Return ONLY valid JSON. Do not use Markdown fences. Do not add commentary before or after the JSON.

The top-level object MUST contain exactly one key named "microcycle".

"microcycle" MUST be an object containing a non-empty "days" array.

Each day MUST contain:
- "day_name"
- "workout_type"
- "exercises"

Each day MUST contain a non-empty "exercises" array.

Each exercise MUST contain:
- "name"
- "sets"
- "reps"
- "rest_seconds"
- "notes"
- "activation_cue"

Do not return a top-level array.
Do not return "microcycles".
Do not return the microcycle object directly without the "microcycle" wrapper.
Do not return prose.
Do not return Markdown.
Do not return an empty response.`;
            }

            const result =
              await callOpenRouter(
                apiKey,
                model,
                type,
                resultPrompt,
                fileUrls
              );

            let parsed =
              tryParseJson(
                result.outputText
              );

            if (
              type ===
              'microcycle'
            ) {
              if (
                parsed &&
                typeof parsed ===
                  'object'
              ) {
                const candidate =
                  parsed as any;

                if (
                  !candidate.microcycle &&
                  Array.isArray(
                    candidate.days
                  )
                ) {
                  parsed = {
                    microcycle:
                      candidate,
                  };
                } else if (
                  !candidate.microcycle &&
                  Array.isArray(
                    candidate.microcycles
                  ) &&
                  candidate
                    .microcycles
                    .length > 0 &&
                  candidate
                    .microcycles[0] &&
                  Array.isArray(
                    candidate
                      .microcycles[0]
                      .days
                  )
                ) {
                  parsed = {
                    microcycle:
                      candidate
                        .microcycles[0],
                  };
                }
              }

              const microcycle =
                parsed &&
                typeof parsed ===
                  'object'
                  ? (parsed as any)
                      .microcycle
                  : null;

              const validDays =
                Array.isArray(
                  microcycle?.days
                ) &&
                microcycle.days
                  .length > 0;

              const validExercises =
                validDays &&
                microcycle.days.every(
                  (day: any) =>
                    day &&
                    typeof day ===
                      'object' &&
                    Array.isArray(
                      day.exercises
                    ) &&
                    day.exercises
                      .length > 0
                );

              if (
                !microcycle ||
                !validDays ||
                !validExercises
              ) {
                console.error(
                  '[AI] Expected valid microcycle JSON but received an invalid structured response',
                  {
                    userId:
                      user.id,

                    type,

                    outputSnippet:
                      result.outputText.slice(
                        0,
                        3000
                      ),
                  }
                );

                const structuredError =
                  new Error(
                    'The AI returned an invalid workout structure. Please try again.'
                  );

                (
                  structuredError as any
                ).status =
                  502;

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

        if (
          attempt <
          MAX_ATTEMPTS - 1
        ) {
          /*
           * Slightly increasing delay between attempts
           * prevents hammering the same free router.
           */
          await sleep(
            1000 +
              attempt *
                500
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
            'The free AI service is temporarily unavailable. Please try again shortly.',

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
