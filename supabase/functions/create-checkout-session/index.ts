import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
  ''

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? ''

if (
  !SUPABASE_URL ||
  !SERVICE_ROLE_KEY ||
  !SUPABASE_ANON_KEY ||
  !STRIPE_SECRET_KEY ||
  !APP_URL
) {
  throw new Error('Missing required environment variables')
}

/*
 * ============================================================
 * CORS
 * ============================================================
 *
 * This function is called directly from the browser via
 * supabase.functions.invoke(). Because that call sends an
 * Authorization header and a JSON body, the browser first
 * issues a CORS preflight (OPTIONS) request. Without these
 * headers and an OPTIONS handler below, the browser blocks
 * the request before it ever reaches this function, and
 * supabase-js surfaces it as:
 *
 *   "Failed to send a request to the Edge Function"
 *
 * This matches the corsHeaders pattern already used in the
 * other Edge Functions in this project (cancel-subscription,
 * delete-account, send-contact-email, stripe-webhooks,
 * ai-generate).
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
}

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

const PRICE_IDS = {
  progress: 'price_1TTYrbRuQpZftYKRoSyLbQ0c',
  performance: 'price_1TTYs8RuQpZftYKR8ZzpNg7x',
  elite: 'price_1TTYsWRuQpZftYKRKIm8V10E',
} as const

const VALID_PLANS = new Set([
  'progress',
  'performance',
  'elite',
])

const ACTIVE_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
])

type Plan = keyof typeof PRICE_IDS

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    },
  )
}

async function getAuthenticatedUser(
  req: Request,
) {
  const authorization = req.headers.get('Authorization')

  if (!authorization) {
    throw new Error('Missing Authorization header')
  }

  const token = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    throw new Error('Missing access token')
  }

  const supabaseUserClient = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  const {
    data: { user },
    error,
  } = await supabaseUserClient.auth.getUser(token)

  if (error || !user) {
    throw new Error('Unauthorized')
  }

  return user
}

async function stripeRequest(
  path: string,
  options: {
    method?: string
    body?: URLSearchParams
  } = {},
) {
  const response = await fetch(
    `https://api.stripe.com/v1/${path}`,
    {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        ...(options.body
          ? {
              'Content-Type':
                'application/x-www-form-urlencoded',
            }
          : {}),
      },
      body: options.body,
    },
  )

  const text = await response.text()

  let data: any

  try {
    data = JSON.parse(text)
  } catch {
    data = {
      raw: text,
    }
  }

  if (!response.ok) {
    const message =
      data?.error?.message ??
      `Stripe request failed with status ${response.status}`

    throw new Error(message)
  }

  return data
}

async function getProfile(userId: string) {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from('profiles')
    .select(
      [
        'subscription_plan',
        'subscription_status',
        'stripe_subscription_id',
        'stripe_customer_id',
        'stripe_price_id',
      ].join(','),
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(
      `Failed to load profile: ${error.message}`,
    )
  }

  return data
}

async function getStripeSubscription(
  subscriptionId: string,
) {
  return await stripeRequest(
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
  )
}

async function verifySubscriptionOwnership(
  subscription: any,
  userId: string,
  profile: any,
) {
  const metadataUserId =
    subscription?.metadata?.user_id

  if (
    metadataUserId &&
    metadataUserId !== userId
  ) {
    throw new Error(
      'Current Stripe subscription does not belong to this user',
    )
  }

  const profileSubscriptionId =
    profile?.stripe_subscription_id

  if (
    profileSubscriptionId &&
    subscription?.id !== profileSubscriptionId
  ) {
    throw new Error(
      'Current Stripe subscription does not match the user profile',
    )
  }

  const profileCustomerId =
    profile?.stripe_customer_id

  const subscriptionCustomerId =
    typeof subscription?.customer === 'string'
      ? subscription.customer
      : subscription?.customer?.id

  if (
    profileCustomerId &&
    subscriptionCustomerId &&
    profileCustomerId !== subscriptionCustomerId
  ) {
    throw new Error(
      'Current Stripe customer does not match the user profile',
    )
  }
}

function getPlanFromPriceId(
  priceId: string | null | undefined,
): Plan | null {
  if (!priceId) {
    return null
  }

  for (const [plan, id] of Object.entries(PRICE_IDS)) {
    if (id === priceId) {
      return plan as Plan
    }
  }

  return null
}

async function createCheckoutSession(params: {
  userId: string
  email: string | undefined
  plan: Plan
  customerId: string | null
  oldSubscriptionId: string | null
}) {
  const {
    userId,
    email,
    plan,
    customerId,
    oldSubscriptionId,
  } = params

  const body = new URLSearchParams()

  body.set('mode', 'subscription')
  body.set(
    'line_items[0][price]',
    PRICE_IDS[plan],
  )
  body.set(
    'line_items[0][quantity]',
    '1',
  )

  body.set(
    'success_url',
    `${APP_URL}/subscription-return?plan=${encodeURIComponent(plan)}&session_id={CHECKOUT_SESSION_ID}`,
  )

  body.set(
    'cancel_url',
    `${APP_URL}/profile`,
  )

  body.set(
    'client_reference_id',
    userId,
  )

  if (customerId) {
    body.set('customer', customerId)
  } else if (email) {
    body.set('customer_email', email)
  }

  body.set(
    'metadata[user_id]',
    userId,
  )

  body.set(
    'metadata[plan]',
    plan,
  )

  if (oldSubscriptionId) {
    body.set(
      'metadata[old_subscription_id]',
      oldSubscriptionId,
    )
  }

  body.set(
    'subscription_data[metadata][user_id]',
    userId,
  )

  body.set(
    'subscription_data[metadata][plan]',
    plan,
  )

  if (oldSubscriptionId) {
    body.set(
      'subscription_data[metadata][old_subscription_id]',
      oldSubscriptionId,
    )
  }

  /*
   * IMPORTANT:
   *
   * Do NOT use:
   *
   * payment_settings[save_default_payment_method]
   *
   * on the Checkout Session.
   *
   * That is not a valid Checkout Session parameter.
   *
   * Checkout will handle the payment collection itself.
   */

  return await stripeRequest(
    'checkout/sessions',
    {
      method: 'POST',
      body,
    },
  )
}

Deno.serve(async (req) => {
  /*
   * Handle the browser's CORS preflight request first, before
   * any auth/body parsing. This MUST return 2xx with the
   * corsHeaders or the browser will never send the real POST.
   */
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse(
        {
          success: false,
          error: 'Method not allowed',
        },
        405,
      )
    }

    const user =
      await getAuthenticatedUser(req)

    const requestBody =
      await req.json().catch(() => null)

    const requestedPlan =
      typeof requestBody?.plan === 'string'
        ? requestBody.plan.toLowerCase().trim()
        : ''

    if (!VALID_PLANS.has(requestedPlan)) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid subscription plan',
        },
        400,
      )
    }

    const plan =
      requestedPlan as Plan

    const profile =
      await getProfile(user.id)

    if (!profile) {
      return jsonResponse(
        {
          success: false,
          error: 'Profile not found',
        },
        404,
      )
    }

    /*
     * If the user is already on the requested plan,
     * there is nothing to purchase.
     */
    if (
      profile.subscription_plan === plan &&
      ACTIVE_STATUSES.has(
        profile.subscription_status ?? '',
      )
    ) {
      return jsonResponse({
        success: true,
        action: 'already_active',
        plan,
      })
    }

    let customerId =
      profile.stripe_customer_id ?? null

    let oldSubscriptionId: string | null = null

    /*
     * PAID -> PAID behavior:
     *
     * 1. Find the current Stripe subscription.
     * 2. DO NOT cancel it.
     * 3. Create a completely NEW Checkout subscription.
     * 4. Put the old subscription ID in metadata.
     * 5. The webhook cancels the old subscription ONLY
     *    after the new payment/subscription succeeds.
     */
    if (profile.stripe_subscription_id) {
      const currentSubscription =
        await getStripeSubscription(
          profile.stripe_subscription_id,
        )

      await verifySubscriptionOwnership(
        currentSubscription,
        user.id,
        profile,
      )

      const stripeCustomerId =
        typeof currentSubscription.customer ===
        'string'
          ? currentSubscription.customer
          : currentSubscription.customer?.id

      if (stripeCustomerId) {
        customerId = stripeCustomerId
      }

      if (
        ACTIVE_STATUSES.has(
          currentSubscription.status,
        )
      ) {
        oldSubscriptionId =
          currentSubscription.id
      }
    }

    const session =
      await createCheckoutSession({
        userId: user.id,
        email: user.email,
        plan,
        customerId,
        oldSubscriptionId,
      })

    if (!session?.url) {
      throw new Error(
        'Stripe did not return a Checkout URL',
      )
    }

    console.log(
      '[CHECKOUT] Created new Checkout Session',
      {
        user_id: user.id,
        plan,
        session_id: session.id,
        customer_id: customerId,
        old_subscription_id:
          oldSubscriptionId,
      },
    )

    return jsonResponse({
      success: true,
      action: 'checkout',
      url: session.url,
      session_id: session.id,
      replacing_subscription:
        Boolean(oldSubscriptionId),
      old_subscription_id:
        oldSubscriptionId,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    console.error(
      '[CHECKOUT] create-checkout-session failed:',
      message,
    )

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    )
  }
})
