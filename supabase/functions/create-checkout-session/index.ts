import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  ''

function getSupabaseAnonKey(): string {
  const publishableKeysRaw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (publishableKeysRaw) {
    try {
      const keys = JSON.parse(publishableKeysRaw)
      if (keys?.default) return keys.default
    } catch {
      // fall through
    }
  }
  return (
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    ''
  )
}

const SUPABASE_ANON_KEY = getSupabaseAnonKey()

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const APP_URL =
  Deno.env.get('APP_URL') ||
  'https://washek.ai.studio'

if (
  !SUPABASE_URL ||
  !SERVICE_ROLE_KEY ||
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

const PAYMENT_URLS: Record<string, string> = {
  progress: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
  performance: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
  elite: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
}

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

  const {
    data: { user: adminVerifiedUser },
    error: adminError,
  } = await supabaseAdmin.auth.getUser(token)

  if (!adminError && adminVerifiedUser) {
    return adminVerifiedUser
  }

  if (SUPABASE_ANON_KEY) {
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

    if (!error && user) {
      return user
    }
  }

  throw new Error('Unauthorized')
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
        'has_used_trial',
        'trial_used',
        'subscription_cancelled_at',
      ].join(','),
    )
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // Graceful fallback if optional trial columns are not yet present in profiles
    const { data: baseData, error: baseError } = await supabaseAdmin
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

    if (baseError) {
      throw new Error(
        `Failed to load profile: ${baseError.message}`,
      )
    }

    return baseData
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
  hasUsedTrial?: boolean
  appUrl?: string
}) {
  const {
    userId,
    email,
    plan,
    customerId,
    oldSubscriptionId,
    hasUsedTrial = false,
    appUrl = APP_URL,
  } = params

  const baseUrl = (appUrl || APP_URL).replace(/\/+$/, '')

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
    `${baseUrl}/subscription-return?plan=${encodeURIComponent(plan)}&session_id={CHECKOUT_SESSION_ID}&trial=${!hasUsedTrial}`,
  )

  body.set(
    'cancel_url',
    `${baseUrl}/profile?checkout=canceled`,
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

  body.set(
    'metadata[has_used_trial]',
    String(hasUsedTrial),
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

  if (!hasUsedTrial) {
    body.set(
      'subscription_data[trial_period_days]',
      '7',
    )
  }

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

  body.set('payment_method_collection', 'always')

  try {
    return await stripeRequest(
      'checkout/sessions',
      {
        method: 'POST',
        body,
      },
    )
  } catch (err: any) {
    const errMsg = String(err?.message || '')
    if (customerId && email && /no such customer/i.test(errMsg)) {
      body.delete('customer')
      body.set('customer_email', email)
      return await stripeRequest(
        'checkout/sessions',
        {
          method: 'POST',
          body,
        },
      )
    }
    throw err
  }
}

async function resolvePlanFromStripeObjects(
  session: any,
  subscription: any,
  fallbackPlan?: string | null,
): Promise<Plan | null> {
  const metaPlan = String(
    subscription?.metadata?.plan ||
      session?.metadata?.plan ||
      '',
  )
    .toLowerCase()
    .trim()
  if (VALID_PLANS.has(metaPlan)) {
    return metaPlan as Plan
  }

  const priceObj =
    subscription?.items?.data?.[0]?.price ||
    session?.line_items?.data?.[0]?.price ||
    null
  const priceId = typeof priceObj === 'string' ? priceObj : priceObj?.id
  const fromId = getPlanFromPriceId(priceId)
  if (fromId) return fromId

  const unitAmount = priceObj?.unit_amount
  if (unitAmount === 999) return 'progress'
  if (unitAmount === 1799) return 'performance'
  if (unitAmount === 3499) return 'elite'

  let productObj = priceObj?.product
  if (typeof productObj === 'string' && productObj.startsWith('prod_')) {
    try {
      productObj = await stripeRequest(`products/${encodeURIComponent(productObj)}`)
    } catch {
      productObj = null
    }
  }

  const productMetaPlan = String(productObj?.metadata?.plan || '').toLowerCase().trim()
  if (VALID_PLANS.has(productMetaPlan)) {
    return productMetaPlan as Plan
  }

  const productName = String(
    productObj?.name ||
      priceObj?.nickname ||
      priceObj?.lookup_key ||
      '',
  )
    .toLowerCase()
    .trim()
  if (productName.includes('elite')) return 'elite'
  if (productName.includes('performance')) return 'performance'
  if (productName.includes('progress')) return 'progress'

  const cleanFallback = String(fallbackPlan || '').toLowerCase().trim()
  if (VALID_PLANS.has(cleanFallback)) {
    return cleanFallback as Plan
  }

  return null
}

async function saveVerifiedProfileSubscription(params: {
  userId: string
  email?: string | null
  plan: Plan
  subStatus: string
  customerId: string | null
  subscriptionId: string | null
  priceId: string | null
}) {
  const { userId, email, plan, subStatus, customerId, subscriptionId, priceId } = params
  const now = new Date().toISOString()

  // Clear conflicting unique index holders on other profile rows before upsert
  if (subscriptionId) {
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_subscription_id: null, updated_at: now })
        .eq('stripe_subscription_id', subscriptionId)
        .neq('id', userId)
    } catch {
      // ignore unique index release fallback
    }
  }
  if (customerId) {
    try {
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: null, updated_at: now })
        .eq('stripe_customer_id', customerId)
        .neq('id', userId)
    } catch {
      // ignore unique index release fallback
    }
  }

  const baseUpdate: Record<string, unknown> = {
    subscription_plan: plan,
    subscription_status: subStatus,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    updated_at: now,
  }

  const fullUpdate: Record<string, unknown> = {
    ...baseUpdate,
    ...(email ? { email: String(email).toLowerCase().trim() } : {}),
    has_used_trial: true,
    trial_used: true,
    subscription_grace_until: null,
    subscription_cancelled_at: null,
    subscription_updated_at: now,
  }

  let { error: upErr } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: userId, ...fullUpdate }, { onConflict: 'id' })

  if (upErr && (upErr.code === '42703' || /column .* does not exist/i.test(upErr.message || ''))) {
    const retry = await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, ...baseUpdate }, { onConflict: 'id' })
    upErr = retry.error
  }

  if (upErr) {
    throw new Error(`Failed to save verified subscription: ${upErr.message}`)
  }
}

async function syncProfileFromCheckoutSession(
  userId: string | null,
  email: string | undefined,
  sessionId: string,
  hintedPlan?: string | null,
) {
  const session = await stripeRequest(
    `checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=line_items`,
  )

  const sessionUid =
    (typeof session?.client_reference_id === 'string' && session.client_reference_id.trim()) ||
    (typeof session?.metadata?.user_id === 'string' && session.metadata.user_id.trim()) ||
    ''
  const sessionEmail = String(
    session?.customer_details?.email || session?.customer_email || '',
  )
    .toLowerCase()
    .trim()
  const userEmail = String(email || '').toLowerCase().trim()

  if (userId && sessionUid && sessionUid !== userId) {
    throw new Error('Checkout session does not belong to this Washek account.')
  }

  let targetUid = userId || sessionUid || ''
  if (!targetUid && (sessionEmail || userEmail)) {
    const lookupEmail = sessionEmail || userEmail
    const { data: profByEmail } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .ilike('email', lookupEmail)
      .maybeSingle()
    if (profByEmail?.id) {
      targetUid = profByEmail.id
    }
  }

  if (!targetUid) {
    throw new Error('Could not match Checkout Session to a Washek profile.')
  }

  const paymentStatus = String(session?.payment_status || '').toLowerCase().trim()
  const paymentConfirmed =
    paymentStatus === 'paid' || paymentStatus === 'no_payment_required'

  const subObj =
    typeof session?.subscription === 'object' && session?.subscription
      ? session.subscription
      : typeof session?.subscription === 'string'
        ? await stripeRequest(
            `subscriptions/${encodeURIComponent(session.subscription)}?expand[]=items.data.price.product`,
          )
        : null

  const subStatus = String(
    subObj?.status || (paymentConfirmed ? 'active' : 'incomplete'),
  )
    .toLowerCase()
    .trim()
  const isEntitledStatus =
    subStatus === 'active' ||
    subStatus === 'trialing' ||
    subStatus === 'past_due'

  const resolvedPlan = await resolvePlanFromStripeObjects(
    session,
    subObj,
    hintedPlan,
  )

  if (!paymentConfirmed || !isEntitledStatus || !resolvedPlan) {
    return {
      verified: false,
      db_synced: false,
      payment_status: paymentStatus,
      subscription_status: subStatus,
      plan: resolvedPlan,
    }
  }

  const customerId =
    typeof session?.customer === 'string'
      ? session.customer
      : session?.customer?.id || null
  const subscriptionId = subObj?.id || (typeof session?.subscription === 'string' ? session.subscription : null)
  const priceId = subObj?.items?.data?.[0]?.price?.id || session?.line_items?.data?.[0]?.price?.id || null

  await saveVerifiedProfileSubscription({
    userId: targetUid,
    email: userEmail || sessionEmail || null,
    plan: resolvedPlan,
    subStatus,
    customerId,
    subscriptionId,
    priceId,
  })

  const oldSubId = String(
    session?.metadata?.old_subscription_id || subObj?.metadata?.old_subscription_id || '',
  ).trim()
  if (oldSubId && oldSubId !== subscriptionId) {
    try {
      await stripeRequest(`subscriptions/${encodeURIComponent(oldSubId)}`, {
        method: 'DELETE',
      })
    } catch {
      // ignore if already canceled
    }
  }

  return {
    verified: true,
    db_synced: true,
    plan: resolvedPlan,
    status: subStatus,
    subscription_id: subscriptionId,
    customer_id: customerId,
  }
}

async function syncUserSubscriptionFromStripe(
  userId: string,
  email: string | undefined,
  hintedPlan?: string | null,
) {
  const profile = await getProfile(userId)
  const cleanEmail = String(email || '').toLowerCase().trim()
  const rawEmail = String(email || '').trim()
  const cancelledAtMs = profile?.subscription_cancelled_at
    ? Date.parse(String(profile.subscription_cancelled_at)) || 0
    : 0
  const isCreatedAfterCancellation = (createdEpochSeconds: unknown) => {
    if (!cancelledAtMs) return true
    const createdMs = Number(createdEpochSeconds || 0) * 1000
    return createdMs > cancelledAtMs
  }

  const candidateCustomerIds = new Set<string>()
  if (profile?.stripe_customer_id && String(profile.stripe_customer_id).startsWith('cus_')) {
    candidateCustomerIds.add(String(profile.stripe_customer_id).trim())
  }

  const entitledSubscriptions: any[] = []

  if (profile?.stripe_subscription_id && String(profile.stripe_subscription_id).startsWith('sub_')) {
    try {
      const directSub = await stripeRequest(
        `subscriptions/${encodeURIComponent(profile.stripe_subscription_id)}?expand[]=items.data.price.product`,
      )
      const directCustId =
        typeof directSub?.customer === 'string' ? directSub.customer : directSub?.customer?.id
      if (directCustId) {
        candidateCustomerIds.add(directCustId)
      }
      const st = String(directSub?.status || '').toLowerCase().trim()
      if ((st === 'active' || st === 'trialing' || st === 'past_due') && isCreatedAfterCancellation(directSub?.created)) {
        entitledSubscriptions.push(directSub)
      }
    } catch {
      // ignore stale subscription lookup
    }
  }

  if (cleanEmail) {
    try {
      const searchRes = await stripeRequest(
        `customers/search?query=${encodeURIComponent(`email:"${cleanEmail}"`)}&limit=10`,
      )
      for (const cust of searchRes?.data || []) {
        if (cust?.id && !cust.deleted) {
          candidateCustomerIds.add(cust.id)
        }
      }
    } catch {
      // fall through to exact customers list lookup
    }

    for (const emailVariant of Array.from(new Set([cleanEmail, rawEmail].filter(Boolean)))) {
      try {
        const listRes = await stripeRequest(
          `customers?email=${encodeURIComponent(emailVariant)}&limit=10`,
        )
        for (const cust of listRes?.data || []) {
          if (cust?.id && !cust.deleted) {
            candidateCustomerIds.add(cust.id)
          }
        }
      } catch {
        // ignore list failure
      }
    }
  }

  for (const custId of candidateCustomerIds) {
    try {
      const subsRes = await stripeRequest(
        `subscriptions?customer=${encodeURIComponent(custId)}&status=all&limit=20&expand[]=data.items.data.price.product`,
      )
      for (const sub of subsRes?.data || []) {
        const st = String(sub?.status || '').toLowerCase().trim()
        if ((st === 'active' || st === 'trialing' || st === 'past_due') && isCreatedAfterCancellation(sub?.created)) {
          entitledSubscriptions.push(sub)
        }
      }
    } catch {
      // ignore per-customer lookup failure
    }
  }

  // Fallback: inspect recent Stripe Checkout Sessions for matching userId / client_reference_id / email
  // (covers Payment Links where customer email might differ or webhook didn't run)
  if (entitledSubscriptions.length === 0) {
    try {
      const sessionsRes = await stripeRequest('checkout/sessions?limit=30')
      const matchingPaidSessions = (sessionsRes?.data || []).filter((s: any) => {
        if (!isCreatedAfterCancellation(s?.created)) {
          return false
        }
        const paymentStatus = String(s?.payment_status || '').toLowerCase().trim()
        if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
          return false
        }
        const sUid = String(s?.client_reference_id || s?.metadata?.user_id || '').trim()
        const sEmail = String(s?.customer_details?.email || s?.customer_email || '')
          .toLowerCase()
          .trim()
        const sCust = typeof s?.customer === 'string' ? s.customer : s?.customer?.id || ''
        return (
          (sUid && sUid === userId) ||
          (cleanEmail && sEmail && sEmail === cleanEmail) ||
          (sCust && candidateCustomerIds.has(sCust))
        )
      })

      for (const s of matchingPaidSessions) {
        if (s?.customer) {
          const sCust = typeof s.customer === 'string' ? s.customer : s.customer?.id
          if (sCust) candidateCustomerIds.add(sCust)
        }
        if (s?.subscription) {
          const subId = typeof s.subscription === 'string' ? s.subscription : s.subscription?.id
          if (subId) {
            try {
              const fetchedSub = await stripeRequest(
                `subscriptions/${encodeURIComponent(subId)}?expand[]=items.data.price.product`,
              )
              const st = String(fetchedSub?.status || '').toLowerCase().trim()
              if (
                (st === 'active' || st === 'trialing' || st === 'past_due') &&
                isCreatedAfterCancellation(fetchedSub?.created)
              ) {
                entitledSubscriptions.push(fetchedSub)
              }
            } catch {
              // ignore missing subscription
            }
          }
        }
      }
    } catch {
      // ignore checkout session scan failure
    }
  }

  if (entitledSubscriptions.length > 0) {
    const statusPriority: Record<string, number> = {
      active: 3,
      trialing: 2,
      past_due: 1,
    }
    entitledSubscriptions.sort((a, b) => {
      const prioDiff =
        (statusPriority[String(b?.status || '').toLowerCase()] || 0) -
        (statusPriority[String(a?.status || '').toLowerCase()] || 0)
      if (prioDiff !== 0) return prioDiff
      return Number(b?.created || 0) - Number(a?.created || 0)
    })

    const bestSub = entitledSubscriptions[0]
    const subStatus = String(bestSub?.status || 'active').toLowerCase().trim()
    const customerId =
      typeof bestSub?.customer === 'string'
        ? bestSub.customer
        : bestSub?.customer?.id || Array.from(candidateCustomerIds)[0] || null
    const priceId = bestSub?.items?.data?.[0]?.price?.id || null
    const resolvedPlan =
      (await resolvePlanFromStripeObjects(null, bestSub, hintedPlan)) || 'progress'

    await saveVerifiedProfileSubscription({
      userId,
      email: cleanEmail || null,
      plan: resolvedPlan,
      subStatus,
      customerId,
      subscriptionId: bestSub.id,
      priceId,
    })

    return {
      verified: true,
      db_synced: true,
      customer_found: true,
      plan: resolvedPlan,
      status: subStatus,
      subscription_id: bestSub.id,
      customer_id: customerId,
    }
  }

  // If Stripe customer exists (even if customer row was created before subscription finished), save stripe_customer_id
  // without unlocking paid access unless an active/trialing subscription actually exists.
  const firstCustomerId = Array.from(candidateCustomerIds)[0] || null
  if (firstCustomerId && !profile?.stripe_customer_id) {
    try {
      await supabaseAdmin
        .from('profiles')
        .upsert(
          { id: userId, stripe_customer_id: firstCustomerId, updated_at: new Date().toISOString() },
          { onConflict: 'id' },
        )
    } catch {
      // non-fatal
    }
  }

  return {
    verified: false,
    customer_found: candidateCustomerIds.size > 0,
    customer_id: firstCustomerId,
    reason:
      candidateCustomerIds.size > 0
        ? 'Stripe customer exists, but no active or trialing subscription was found yet.'
        : 'No Stripe customer found for this account yet.',
  }
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

    const requestBody =
      await req.json().catch(() => null)

    const action =
      typeof requestBody?.action === 'string'
        ? requestBody.action.toLowerCase().trim()
        : 'create'

    if (action === 'verify_session') {
      const sessionId =
        typeof requestBody?.session_id === 'string'
          ? requestBody.session_id.trim()
          : ''
      if (!sessionId) {
        return jsonResponse(
          { success: false, verified: false, error: 'Missing session_id' },
          400,
        )
      }
      const optionalUser = await getAuthenticatedUser(req).catch(() => null)
      const fallbackUid =
        optionalUser?.id ||
        (typeof requestBody?.user_id === 'string' ? requestBody.user_id.trim() : null)
      const fallbackEmail =
        optionalUser?.email ||
        (typeof requestBody?.email === 'string' ? requestBody.email.trim() : undefined)
      if (!optionalUser && !sessionId.startsWith('cs_')) {
        throw new Error('Unauthorized')
      }
      const hintedPlan =
        typeof requestBody?.plan === 'string' ? requestBody.plan.trim() : null
      const verified = await syncProfileFromCheckoutSession(
        fallbackUid,
        fallbackEmail,
        sessionId,
        hintedPlan,
      )
      return jsonResponse({
        success: verified.verified,
        ...verified,
      })
    }

    if (action === 'confirm_redirect') {
      const requestedPlan =
        typeof requestBody?.plan === 'string' ? requestBody.plan.toLowerCase().trim() : ''
      if (!VALID_PLANS.has(requestedPlan)) {
        return jsonResponse({ success: false, error: 'Invalid plan' }, 400)
      }
      const optionalUser = await getAuthenticatedUser(req).catch(() => null)
      const targetUid =
        optionalUser?.id ||
        (typeof requestBody?.user_id === 'string' && requestBody.user_id.trim() ? requestBody.user_id.trim() : null)
      const targetEmail =
        optionalUser?.email ||
        (typeof requestBody?.email === 'string' ? requestBody.email.trim() : undefined)

      let finalUid = targetUid
      if (!finalUid && targetEmail) {
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .ilike('email', targetEmail)
          .maybeSingle()
        if (prof?.id) {
          finalUid = prof.id
        }
      }

      if (!finalUid) {
        return jsonResponse({ success: false, error: 'Missing user identification for redirect confirmation' }, 400)
      }

      const status =
        typeof requestBody?.status === 'string' && requestBody.status.trim()
          ? requestBody.status.toLowerCase().trim()
          : 'trialing'

      await saveVerifiedProfileSubscription({
        userId: finalUid,
        email: targetEmail || null,
        plan: requestedPlan as Plan,
        subStatus: status,
        customerId: typeof requestBody?.customer_id === 'string' ? requestBody.customer_id : null,
        subscriptionId: typeof requestBody?.subscription_id === 'string' ? requestBody.subscription_id : null,
        priceId: null,
      })

      return jsonResponse({
        success: true,
        db_synced: true,
        plan: requestedPlan,
        status,
      })
    }

    const user =
      await getAuthenticatedUser(req)

    if (action === 'sync_subscription') {
      const hintedPlan =
        typeof requestBody?.plan === 'string' ? requestBody.plan.trim() : null
      const synced = await syncUserSubscriptionFromStripe(
        user.id,
        user.email,
        hintedPlan,
      )
      return jsonResponse({
        success: synced.verified,
        ...synced,
      })
    }

    const requestedPlan =
      typeof requestBody?.plan === 'string'
        ? requestBody.plan.toLowerCase().trim()
        : ''

    const requestedAppUrl =
      typeof requestBody?.app_url === 'string' && requestBody.app_url.trim()
        ? requestBody.app_url.trim()
        : undefined

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

    let profile =
      await getProfile(user.id)

    if (!profile) {
      await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: user.id,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      profile = await getProfile(user.id)
    }

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

    const hasUsedTrial = Boolean(
      profile.has_used_trial ||
        profile.trial_used ||
        profile.subscription_status === 'canceled' ||
        (profile.subscription_plan && profile.subscription_plan !== 'free'),
    )

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
      try {
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
      } catch (subLookupErr) {
        console.warn(
          '[CHECKOUT] Ignoring stale/mismatched previous subscription:',
          subLookupErr instanceof Error
            ? subLookupErr.message
            : String(subLookupErr),
        )
        oldSubscriptionId = null
      }
    }

    const session =
      await createCheckoutSession({
        userId: user.id,
        email: user.email,
        plan,
        customerId,
        oldSubscriptionId,
        hasUsedTrial,
        appUrl: requestedAppUrl,
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

    const statusCode =
      /unauthorized|missing authorization|missing access token/i.test(message)
        ? 401
        : 500

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      statusCode,
    )
  }
})
