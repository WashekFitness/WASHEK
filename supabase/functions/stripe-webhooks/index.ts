import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
};

const stripeSecretKey =
  Deno.env.get(
    'STRIPE_SECRET_KEY'
  );

const webhookSecret =
  Deno.env.get(
    'STRIPE_WEBHOOK_SECRET'
  );

const supabaseUrl =
  Deno.env.get(
    'SUPABASE_URL'
  );

const serviceRoleKey =
  Deno.env.get(
    'SERVICE_ROLE_KEY'
  ) ||
  /*
   * Supabase automatically provides SUPABASE_SERVICE_ROLE_KEY to
   * every Edge Function with no manual configuration required.
   * SERVICE_ROLE_KEY (no prefix) is a project-specific secret
   * that has to be set by hand and is easy to forget or lose on
   * a fresh project/redeploy. Fall back to the one that always
   * exists so this function cannot silently fail to boot.
   */
  Deno.env.get(
    'SUPABASE_SERVICE_ROLE_KEY'
  );

if (!stripeSecretKey) {
  throw new Error(
    'Missing STRIPE_SECRET_KEY'
  );
}

if (!webhookSecret) {
  throw new Error(
    'Missing STRIPE_WEBHOOK_SECRET'
  );
}

if (!supabaseUrl) {
  throw new Error(
    'Missing SUPABASE_URL'
  );
}

if (!serviceRoleKey) {
  throw new Error(
    'Missing SERVICE_ROLE_KEY (and no SUPABASE_SERVICE_ROLE_KEY fallback was available either)'
  );
}

const stripe =
  new Stripe(
    stripeSecretKey,
    {
      apiVersion:
        '2024-12-18.acacia',
    }
  );

const supabase =
  createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    }
  );

/*
 * ============================================================
 * SUBSCRIPTION STATUS
 * ============================================================
 */

const PAID_STATUSES =
  new Set([
    'active',
    'trialing',
    'past_due',
    'unpaid',
  ]);

/*
 * ============================================================
 * PAYMENT-FAILURE GRACE PERIOD
 * ============================================================
 *
 * When a recurring payment fails, Stripe moves the subscription
 * to past_due (then eventually unpaid if all retries fail).
 *
 * Rules:
 * 1. Paid access remains available for 3 days after the FIRST
 *    failure.
 * 2. That deadline is established once and is never extended by
 *    further failed retries.
 * 3. Stripe itself is told to cancel the subscription at that
 *    same deadline, so the customer is not billed indefinitely
 *    while Washek has already downgraded them internally.
 * 4. A successful payment (status returns to active/trialing)
 *    clears the deadline and cancels the scheduled Stripe
 *    cancellation.
 *
 * The deadline is enforced by:
 * - kael_effective_plan() (Postgres, migration 016) for Kael.
 * - getUserPlan() in ai-generate/index.ts for all other
 *   plan-gated AI features.
 * ============================================================
 */

const GRACE_PERIOD_MS =
  3 *
  24 *
  60 *
  60 *
  1000;

const GRACE_ELIGIBLE_STATUSES =
  new Set([
    'past_due',
    'unpaid',
  ]);

/*
 * Decide the new subscription_grace_until value given the
 * profile's previous status/deadline and the new status just
 * received from Stripe.
 */
function computeGraceUntil(
  previousStatus:
    | string
    | null,
  previousGraceUntil:
    | string
    | null,
  newStatus: string
):
  | string
  | null {
  const normalizedPreviousStatus =
    String(
      previousStatus ||
        ''
    )
      .trim()
      .toLowerCase();

  if (
    GRACE_ELIGIBLE_STATUSES.has(
      newStatus
    )
  ) {
    /*
     * Still inside the SAME failure state as before, and a
     * deadline already exists: keep it exactly as-is. Repeated
     * payment failures must never push the deadline further
     * out.
     */
    if (
      previousGraceUntil &&
      GRACE_ELIGIBLE_STATUSES.has(
        normalizedPreviousStatus
      )
    ) {
      return previousGraceUntil;
    }

    /*
     * First failure: establish the deadline now.
     */
    return new Date(
      Date.now() +
        GRACE_PERIOD_MS
    ).toISOString();
  }

  /*
   * Any other status (active, trialing, canceled, incomplete,
   * incomplete_expired, paused, etc.) means there is no
   * currently active payment-failure grace window.
   */
  return null;
}

/*
 * Best-effort: schedule Stripe to cancel the subscription at
 * the grace deadline. This is a defense-in-depth measure — our
 * own database is what actually gates feature access — but it
 * stops Stripe from continuing to retry/charge the card well
 * past the point where Washek has already downgraded the
 * account internally.
 *
 * Failures here are logged but never thrown: they must not
 * block the profile sync, which is the authoritative part of
 * this operation.
 */
async function scheduleGracePeriodCancellation(
  subscriptionId: string,
  cancelAt: Date
) {
  try {
    await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at:
          Math.floor(
            cancelAt.getTime() /
              1000
          ),
      }
    );

    console.log(
      '[WASHEK GRACE] Scheduled Stripe cancellation at grace deadline:',
      JSON.stringify({
        subscriptionId,
        cancelAt:
          cancelAt.toISOString(),
      })
    );
  } catch (error) {
    console.error(
      '[WASHEK GRACE] Failed to schedule Stripe cancellation:',
      JSON.stringify({
        subscriptionId,
        error:
          error instanceof
          Error
            ? error.message
            : String(error),
      })
    );
  }
}

/*
 * Best-effort: clear a previously scheduled Stripe cancellation
 * after a payment recovers. Same non-throwing contract as
 * scheduleGracePeriodCancellation().
 */
async function clearGracePeriodCancellation(
  subscriptionId: string
) {
  try {
    await stripe.subscriptions.update(
      subscriptionId,
      {
        cancel_at:
          null,
      }
    );

    console.log(
      '[WASHEK GRACE] Cleared scheduled Stripe cancellation after payment recovery:',
      subscriptionId
    );
  } catch (error) {
    console.error(
      '[WASHEK GRACE] Failed to clear scheduled Stripe cancellation:',
      JSON.stringify({
        subscriptionId,
        error:
          error instanceof
          Error
            ? error.message
            : String(error),
      })
    );
  }
}

/*
 * ============================================================
 * PRICE -> PLAN
 * ============================================================
 */

const PLAN_BY_PRICE_ID: Record<
  string,
  string
> = {
  'price_1TTYrbRuQpZftYKRoSyLbQ0c':
    'progress',

  'price_1TTYs8RuQpZftYKR8ZzpNg7x':
    'performance',

  'price_1TTYsWRuQpZftYKRKIm8V10E':
    'elite',
};

/*
 * ============================================================
 * RESPONSE
 * ============================================================
 */

function jsonResponse(
  body: Record<string, unknown>,
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

/*
 * ============================================================
 * METADATA HELPERS
 * ============================================================
 */

function getMetadataUserId(
  metadata:
    | Stripe.Metadata
    | null
    | undefined
) {
  const userId =
    metadata?.user_id;

  if (
    typeof userId ===
      'string' &&
    userId.trim()
  ) {
    return userId.trim();
  }

  return null;
}

function getMetadataPlan(
  metadata:
    | Stripe.Metadata
    | null
    | undefined
) {
  const plan =
    String(
      metadata?.plan ||
        ''
    )
      .trim()
      .toLowerCase();

  if (
    plan ===
      'progress' ||
    plan ===
      'performance' ||
    plan ===
      'elite'
  ) {
    return plan;
  }

  return null;
}

function getPlanFromPriceId(
  priceId:
    | string
    | null
    | undefined
) {
  if (!priceId) {
    return null;
  }

  return (
    PLAN_BY_PRICE_ID[
      priceId
    ] ||
    null
  );
}

function getSubscriptionPlan(
  subscription: Stripe.Subscription
) {
  /*
   * Metadata is authoritative.
   */

  const metadataPlan =
    getMetadataPlan(
      subscription.metadata
    );

  if (
    metadataPlan
  ) {
    return metadataPlan;
  }

  /*
   * Price ID fallback.
   */

  const priceId =
    subscription
      .items
      .data[0]
      ?.price
      ?.id;

  return getPlanFromPriceId(
    priceId
  );
}

/*
 * ============================================================
 * USER ID FROM SUBSCRIPTION
 * ============================================================
 */

function getSubscriptionUserId(
  subscription: Stripe.Subscription
) {
  return getMetadataUserId(
    subscription.metadata
  );
}

/*
 * ============================================================
 * STRIPE SUBSCRIPTION -> PROFILE
 * ============================================================
 */

async function syncSubscriptionToProfile(
  subscription: Stripe.Subscription,
  explicitUserId:
    | string
    | null = null
) {
  const userId =
    explicitUserId ||
    getSubscriptionUserId(
      subscription
    );

  if (!userId) {
    throw new Error(
      `Stripe subscription ${subscription.id} is missing metadata.user_id`
    );
  }

  const plan =
    getSubscriptionPlan(
      subscription
    );

  if (!plan) {
    throw new Error(
      `Unable to determine Washek plan for Stripe subscription ${subscription.id}`
    );
  }

  const status =
    String(
      subscription.status ||
        ''
    )
      .trim()
      .toLowerCase();

  const entitled =
    PAID_STATUSES.has(
      status
    );

  const profilePlan =
    entitled
      ? plan
      : 'free';

  const customerId =
    typeof subscription.customer ===
    'string'
      ? subscription.customer
      : subscription.customer?.id ||
        null;

  const priceId =
    subscription
      .items
      .data[0]
      ?.price
      ?.id ||
    null;

  /*
   * ==========================================================
   * PAYMENT-FAILURE GRACE PERIOD
   * ==========================================================
   *
   * Load the profile's PRIOR status/deadline before overwriting
   * them, so we can tell whether this is a brand-new payment
   * failure (establish a deadline), a repeat failure in the
   * same dunning cycle (keep the existing deadline), or a
   * recovery (clear the deadline).
   */

  const {
    data: priorProfile,
    error: priorProfileError,
  } =
    await supabase
      .from('profiles')
      .select(
        'subscription_status, subscription_grace_until'
      )
      .eq(
        'id',
        userId
      )
      .maybeSingle();

  if (priorProfileError) {
    throw new Error(
      `Failed to load existing profile before sync: ${priorProfileError.message}`
    );
  }

  const previousStatus =
    priorProfile?.subscription_status ||
    null;

  const previousGraceUntil =
    priorProfile?.subscription_grace_until ||
    null;

  const graceUntil =
    computeGraceUntil(
      previousStatus,
      previousGraceUntil,
      status
    );

  console.log(
    '[WASHEK SYNC] Updating profile:',
    JSON.stringify({
      userId,
      subscriptionId:
        subscription.id,
      status,
      plan:
        profilePlan,
      customerId,
      priceId,
      graceUntil,
    })
  );

  const {
    data,
    error,
  } =
    await supabase
      .from('profiles')
      .update({
        subscription_plan:
          profilePlan,

        subscription_status:
          status,

        stripe_subscription_id:
          subscription.id,

        stripe_customer_id:
          customerId,

        stripe_price_id:
          priceId,

        subscription_grace_until:
          graceUntil,

        subscription_updated_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        userId
      )
      .select(
        'id, subscription_plan, subscription_status, stripe_subscription_id, stripe_customer_id, stripe_price_id, subscription_grace_until'
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to update profile ${userId}: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `Washek profile ${userId} was not found`
    );
  }

  console.log(
    '[WASHEK SYNC] Profile successfully updated:',
    JSON.stringify(data)
  );

  /*
   * A grace deadline was just established for the first time
   * this dunning cycle: tell Stripe to cancel the subscription
   * at that same deadline.
   */
  const graceJustEstablished =
    graceUntil !==
      null &&
    graceUntil !==
      previousGraceUntil;

  if (
    graceJustEstablished
  ) {
    await scheduleGracePeriodCancellation(
      subscription.id,
      new Date(
        graceUntil as string
      )
    );
  }

  /*
   * A previously active grace deadline was just cleared
   * (payment recovered): remove the scheduled Stripe
   * cancellation so the subscription keeps running normally.
   */
  const graceJustCleared =
    graceUntil ===
      null &&
    previousGraceUntil !==
      null;

  if (
    graceJustCleared
  ) {
    await clearGracePeriodCancellation(
      subscription.id
    );
  }

  return data;
}

/*
 * ============================================================
 * VERIFY PROFILE IS STILL USING THIS SUBSCRIPTION
 * ============================================================
 *
 * THIS PREVENTS THE OLD SUBSCRIPTION'S DELETE EVENT FROM
 * REPLACING THE NEW SUBSCRIPTION WITH FREE.
 * ============================================================
 */

async function profileUsesSubscription(
  userId: string,
  subscriptionId: string
) {
  const {
    data,
    error,
  } =
    await supabase
      .from('profiles')
      .select(
        'stripe_subscription_id'
      )
      .eq(
        'id',
        userId
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to verify current profile subscription: ${error.message}`
    );
  }

  return (
    data?.stripe_subscription_id ===
    subscriptionId
  );
}

/*
 * ============================================================
 * CANCEL OLD SUBSCRIPTION
 * ============================================================
 *
 * Called ONLY after the replacement Checkout has successfully
 * completed payment.
 * ============================================================
 */

async function cancelOldSubscription(
  oldSubscriptionId: string,
  newSubscriptionId: string
) {
  if (
    !oldSubscriptionId
  ) {
    return;
  }

  if (
    oldSubscriptionId ===
    newSubscriptionId
  ) {
    return;
  }

  try {
    const oldSubscription =
      await stripe.subscriptions.retrieve(
        oldSubscriptionId
      );

    if (
      oldSubscription.status ===
        'canceled' ||
      oldSubscription.status ===
        'incomplete_expired'
    ) {
      console.log(
        '[WASHEK REPLACEMENT] Old subscription already canceled:',
        oldSubscriptionId
      );

      return;
    }

    console.log(
      '[WASHEK REPLACEMENT] Canceling OLD subscription:',
      JSON.stringify({
        oldSubscriptionId,
        newSubscriptionId,
        oldStatus:
          oldSubscription.status,
      })
    );

    await stripe.subscriptions.cancel(
      oldSubscriptionId
    );

    console.log(
      '[WASHEK REPLACEMENT] OLD subscription canceled:',
      oldSubscriptionId
    );
  } catch (error) {
    /*
     * IMPORTANT:
     *
     * Throw the error so Stripe retries this webhook.
     *
     * We never silently leave two subscriptions running.
     */

    throw new Error(
      `The new subscription was paid, but the old subscription ${oldSubscriptionId} could not be canceled: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }
}

/*
 * ============================================================
 * CHECKOUT SESSION
 * ============================================================
 */

async function handleCheckoutCompleted(
  event: Stripe.Event
) {
  const session =
    event.data
      .object as Stripe.Checkout.Session;

  const subscriptionId =
    typeof session.subscription ===
    'string'
      ? session.subscription
      : session.subscription?.id ||
        null;

  if (!subscriptionId) {
    console.log(
      '[WASHEK CHECKOUT] Checkout has no subscription:',
      session.id
    );

    return;
  }

  /*
   * For normal card payments, Checkout is complete only after
   * the payment is successful.
   *
   * Do not cancel the old subscription if Stripe has not
   * confirmed payment.
   */

  const paymentStatus =
    String(
      session.payment_status ||
        ''
    )
      .trim()
      .toLowerCase();

  const paymentConfirmed =
    paymentStatus ===
      'paid' ||
    paymentStatus ===
      'no_payment_required';

  if (
    !paymentConfirmed
  ) {
    console.log(
      '[WASHEK CHECKOUT] Payment is not confirmed yet:',
      JSON.stringify({
        sessionId:
          session.id,

        paymentStatus,
      })
    );

    return;
  }

  /*
   * Retrieve the NEW subscription directly from Stripe.
   */

  const newSubscription =
    await stripe.subscriptions.retrieve(
      subscriptionId
    );

  const sessionUserId =
    getMetadataUserId(
      session.metadata
    );

  const subscriptionUserId =
    getSubscriptionUserId(
      newSubscription
    );

  const userId =
    subscriptionUserId ||
    sessionUserId;

  if (!userId) {
    throw new Error(
      `New subscription ${subscriptionId} is missing metadata.user_id`
    );
  }

  /*
   * Verify that the metadata on the subscription belongs to
   * the authenticated Washek account before changing anything.
   */

  if (
    subscriptionUserId &&
    sessionUserId &&
    subscriptionUserId !==
      sessionUserId
  ) {
    throw new Error(
      `Checkout session ${session.id} user_id does not match subscription ${subscriptionId}`
    );
  }

  /*
   * ==========================================================
   * 1. SYNC NEW SUBSCRIPTION FIRST
   * ==========================================================
   *
   * This makes the new subscription the current profile
   * subscription before the old subscription is canceled.
   */

  await syncSubscriptionToProfile(
    newSubscription,
    userId
  );

  /*
   * ==========================================================
   * 2. FIND OLD SUBSCRIPTION
   * ==========================================================
   */

  const oldSubscriptionId =
    String(
      session
        ?.metadata
        ?.old_subscription_id ||
        newSubscription
          ?.metadata
          ?.old_subscription_id ||
        ''
    ).trim();

  /*
   * ==========================================================
   * 3. CANCEL OLD ONLY AFTER NEW PAYMENT + SYNC
   * ==========================================================
   */

  if (
    oldSubscriptionId
  ) {
    await cancelOldSubscription(
      oldSubscriptionId,
      newSubscription.id
    );
  }

  console.log(
    '[WASHEK REPLACEMENT] Replacement completed:',
    JSON.stringify({
      userId,
      oldSubscriptionId:
        oldSubscriptionId ||
        null,
      newSubscriptionId:
        newSubscription.id,
      plan:
        getSubscriptionPlan(
          newSubscription
        ),
    })
  );
}

/*
 * ============================================================
 * SUBSCRIPTION EVENT
 * ============================================================
 */

async function handleSubscriptionEvent(
  event: Stripe.Event,
  subscriptionId: string
) {
  /*
   * Prevent out-of-order events for the SAME subscription.
   */

  const {
    data,
    error,
  } =
    await supabase.rpc(
      'claim_stripe_subscription_event',
      {
        p_event_id:
          event.id,

        p_event_type:
          event.type,

        p_subscription_id:
          subscriptionId,

        p_event_created:
          event.created,
      }
    );

  if (error) {
    throw new Error(
      `Failed to claim subscription event: ${error.message}`
    );
  }

  if (
    data !==
    true
  ) {
    console.log(
      '[WASHEK WEBHOOK] Ignoring duplicate/stale subscription event:',
      event.id
    );

    return;
  }

  const subscription =
    await stripe.subscriptions.retrieve(
      subscriptionId
    );

  const userId =
    getSubscriptionUserId(
      subscription
    );

  if (!userId) {
    throw new Error(
      `Subscription ${subscriptionId} is missing metadata.user_id`
    );
  }

  /*
   * ==========================================================
   * CRITICAL REPLACEMENT PROTECTION
   * ==========================================================
   *
   * If this event belongs to an OLD subscription that has
   * already been replaced, NEVER let it overwrite the NEW
   * subscription in profiles.
   */

  if (
    event.type ===
      'customer.subscription.deleted' &&
    !(await profileUsesSubscription(
      userId,
      subscriptionId
    ))
  ) {
    console.log(
      '[WASHEK REPLACEMENT] Ignoring deletion of old subscription:',
      JSON.stringify({
        userId,
        deletedSubscriptionId:
          subscriptionId,
      })
    );

    return;
  }

  /*
   * For created/updated events, a new replacement subscription
   * is allowed to become the current subscription.
   */

  await syncSubscriptionToProfile(
    subscription,
    userId
  );
}

/*
 * ============================================================
 * INVOICE EVENT
 * ============================================================
 */

async function handleInvoiceEvent(
  event: Stripe.Event
) {
  const invoice =
    event.data
      .object as Stripe.Invoice;

  const subscriptionId =
    typeof invoice.subscription ===
    'string'
      ? invoice.subscription
      : invoice.subscription?.id ||
        null;

  if (!subscriptionId) {
    console.log(
      '[WASHEK INVOICE] Invoice has no subscription:',
      event.id
    );

    return;
  }

  /*
   * Successful/failed invoice events still synchronize the
   * current Stripe subscription state.
   */

  await handleSubscriptionEvent(
    event,
    subscriptionId
  );
}

/*
 * ============================================================
 * WEBHOOK IDEMPOTENCY
 * ============================================================
 */

async function claimWebhookEvent(
  event: Stripe.Event
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      'claim_stripe_webhook_event',
      {
        p_event_id:
          event.id,

        p_event_type:
          event.type,

        p_event_created:
          event.created,
      }
    );

  if (error) {
    throw new Error(
      `Failed to claim webhook event: ${error.message}`
    );
  }

  return data ===
    true;
}

/*
 * ============================================================
 * WEBHOOK RESULT
 * ============================================================
 */

async function markWebhookEvent(
  eventId: string,
  status:
    | 'succeeded'
    | 'failed',
  errorMessage:
    | string
    | null = null
) {
  const {
    error,
  } =
    await supabase
      .from(
        'stripe_webhook_events'
      )
      .update({
        status,

        processed_at:
          new Date().toISOString(),

        last_error:
          errorMessage,
      })
      .eq(
        'event_id',
        eventId
      );

  if (error) {
    console.error(
      '[WASHEK WEBHOOK] Could not update webhook record:',
      error
    );
  }
}

/*
 * ============================================================
 * MAIN WEBHOOK
 * ============================================================
 */

Deno.serve(
  async (req) => {
    if (
      req.method ===
      'OPTIONS'
    ) {
      return new Response(
        'ok',
        {
          status:
            200,

          headers:
            corsHeaders,
        }
      );
    }

    if (
      req.method !==
      'POST'
    ) {
      return jsonResponse(
        {
          error:
            'Method not allowed',
        },
        405
      );
    }

    const signature =
      req.headers.get(
        'stripe-signature'
      );

    if (!signature) {
      return jsonResponse(
        {
          error:
            'Missing Stripe signature',
        },
        400
      );
    }

    /*
     * Stripe signature verification MUST use the raw body.
     */

    const body =
      await req.text();

    let event:
      Stripe.Event;

    try {
      event =
        await stripe.webhooks.constructEventAsync(
          body,
          signature,
          webhookSecret
        );
    } catch (error) {
      console.error(
        '[WASHEK WEBHOOK] Invalid Stripe signature:',
        error
      );

      return jsonResponse(
        {
          error:
            'Invalid Stripe signature',
        },
        400
      );
    }

    console.log(
      '[WASHEK WEBHOOK] Received:',
      JSON.stringify({
        id:
          event.id,

        type:
          event.type,

        created:
          event.created,
      })
    );

    try {
      /*
       * ======================================================
       * IDEMPOTENCY
       * ======================================================
       */

      const shouldProcess =
        await claimWebhookEvent(
          event
        );

      if (
        !shouldProcess
      ) {
        console.log(
          '[WASHEK WEBHOOK] Duplicate event ignored:',
          event.id
        );

        return jsonResponse({
          received:
            true,

          duplicate:
            true,
        });
      }

      /*
       * ======================================================
       * CHECKOUT
       * ======================================================
       */

      switch (
        event.type
      ) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          await handleCheckoutCompleted(
            event
          );

          break;
        }

        /*
         * ====================================================
         * SUBSCRIPTIONS
         * ====================================================
         */

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        case 'customer.subscription.paused':
        case 'customer.subscription.resumed': {
          const subscriptionId =
            (() => {
              const object =
                event.data
                  .object as any;

              if (
                typeof object.id ===
                'string'
              ) {
                return object.id;
              }

              return null;
            })();

          if (
            !subscriptionId
          ) {
            throw new Error(
              `Could not determine subscription ID for ${event.type}`
            );
          }

          await handleSubscriptionEvent(
            event,
            subscriptionId
          );

          break;
        }

        /*
         * ====================================================
         * INVOICES
         * ====================================================
         */

        case 'invoice.paid':
        case 'invoice.payment_failed':
        case 'invoice.finalization_failed': {
          await handleInvoiceEvent(
            event
          );

          break;
        }

        default: {
          console.log(
            '[WASHEK WEBHOOK] Event not used:',
            event.type
          );
        }
      }

      await markWebhookEvent(
        event.id,
        'succeeded'
      );

      console.log(
        '[WASHEK WEBHOOK] Successfully processed:',
        event.id
      );

      return jsonResponse({
        received:
          true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        '[WASHEK WEBHOOK] Processing failed:',
        JSON.stringify({
          eventId:
            event.id,

          eventType:
            event.type,

          error:
            message,
        })
      );

      /*
       * Mark failed so Stripe's retry can process it again.
       */

      await markWebhookEvent(
        event.id,
        'failed',
        message
      );

      return jsonResponse(
        {
          error:
            'Webhook processing failed',
        },
        500
      );
    }
  }
);
