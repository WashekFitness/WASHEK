import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/*
 * ============================================================
 * WASHEK — CANCEL SUBSCRIPTION
 * ============================================================
 *
 * Safely cancels the authenticated user's Stripe subscription.
 *
 * Flow:
 * 1. Authenticate the current Supabase user.
 * 2. Load that user's profile.
 * 3. Require the Stripe customer/subscription IDs stored on
 *    that user's profile.
 * 4. Retrieve the Stripe subscription.
 * 5. Verify the subscription belongs to the stored customer.
 * 6. Cancel the Stripe subscription immediately.
 * 7. Change the Washek account to Free.
 *
 * IMPORTANT:
 * Stripe remains the billing authority.
 * The Stripe webhook is still responsible for normalizing
 * subscription state after Stripe changes.
 */

/*
 * ============================================================
 * ENVIRONMENT
 * ============================================================
 */

const SUPABASE_URL =
  Deno.env.get('SUPABASE_URL') || '';

const SERVICE_ROLE_KEY =
  Deno.env.get('SERVICE_ROLE_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  '';

const STRIPE_SECRET_KEY =
  Deno.env.get('STRIPE_SECRET_KEY') || '';

/*
 * ============================================================
 * CORS
 * ============================================================
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS',
  'Content-Type': 'application/json',
};

/*
 * ============================================================
 * SUPABASE ADMIN CLIENT
 * ============================================================
 */

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/*
 * ============================================================
 * JSON RESPONSE
 * ============================================================
 */

function json(
  body: unknown,
  status = 200
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    }
  );
}

/*
 * ============================================================
 * STRIPE API
 * ============================================================
 */

async function stripeRequest(
  path: string,
  options: RequestInit = {}
) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured in Supabase.'
    );
  }

  const response = await fetch(
    `https://api.stripe.com/v1/${path}`,
    {
      ...options,

      headers: {
        Authorization:
          `Bearer ${STRIPE_SECRET_KEY}`,

        'Content-Type':
          'application/x-www-form-urlencoded',

        ...(options.headers || {}),
      },
    }
  );

  const rawText =
    await response.text();

  let data: any = {};

  try {
    data = JSON.parse(rawText);
  } catch {
    data = {
      raw: rawText,
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Stripe returned HTTP ${response.status}.`
    );
  }

  return data;
}

/*
 * ============================================================
 * AUTHENTICATE CURRENT USER
 * ============================================================
 */

async function authenticateUser(
  req: Request
) {
  const authorization =
    req.headers.get('Authorization');

  if (!authorization) {
    throw new Error(
      'You must be signed in to cancel your subscription.'
    );
  }

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY
  ) {
    throw new Error(
      'Supabase server configuration is incomplete.'
    );
  }

  const token =
    authorization.replace(
      /^Bearer\s+/i,
      ''
    );

  if (!token) {
    throw new Error(
      'Your login session is missing.'
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin.auth.getUser(
      token
    );

  if (error) {
    throw new Error(
      `Your login session is invalid: ${error.message}`
    );
  }

  if (!data?.user) {
    throw new Error(
      'Your login session could not be verified.'
    );
  }

  return data.user;
}

/*
 * ============================================================
 * LOAD PROFILE
 * ============================================================
 */

async function getProfile(
  userId: string
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        subscription_plan,
        subscription_status
      `)
      .eq('id', userId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load your Washek profile: ${error.message}`
    );
  }

  return data || null;
}

/*
 * ============================================================
 * GET STRIPE SUBSCRIPTION
 * ============================================================
 */

async function getStripeSubscription(
  subscriptionId: string
) {
  return stripeRequest(
    `subscriptions/${encodeURIComponent(
      subscriptionId
    )}`
  );
}

/*
 * ============================================================
 * CANCEL STRIPE SUBSCRIPTION
 * ============================================================
 */

async function cancelStripeSubscription(
  subscriptionId: string
) {
  /*
   * DELETE /v1/subscriptions/{id}
   *
   * This preserves the existing Washek behavior:
   * cancellation is immediate.
   */

  return stripeRequest(
    `subscriptions/${encodeURIComponent(
      subscriptionId
    )}`,
    {
      method: 'DELETE',
    }
  );
}

/*
 * ============================================================
 * CHANGE WASHEK PROFILE TO FREE
 * ============================================================
 */

async function makeProfileFree(
  userId: string,
  customerId: string
) {
  const now =
    new Date().toISOString();

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_plan:
          'free',

        subscription_status:
          'canceled',

        stripe_customer_id:
          customerId,

        stripe_subscription_id:
          null,

        stripe_price_id:
          null,

        subscription_cancelled_at:
          now,

        subscription_updated_at:
          now,

        updated_at:
          now,
      })
      .eq('id', userId)
      .select('*')
      .maybeSingle();

  if (error) {
    throw new Error(
      `Stripe was canceled, but Washek could not update the profile: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      'Stripe was canceled, but the Washek profile was not found.'
    );
  }

  return data;
}

/*
 * ============================================================
 * MAIN FUNCTION
 * ============================================================
 */

Deno.serve(
  async (req) => {
    /*
     * --------------------------------------------------------
     * CORS PREFLIGHT
     * --------------------------------------------------------
     */

    if (req.method === 'OPTIONS') {
      return new Response(
        'ok',
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    /*
     * --------------------------------------------------------
     * POST ONLY
     * --------------------------------------------------------
     */

    if (req.method !== 'POST') {
      return json(
        {
          success: false,
          error: 'Method not allowed.',
        },
        405
      );
    }

    try {
      /*
       * ======================================================
       * 1. AUTHENTICATE
       * ======================================================
       */

      const user =
        await authenticateUser(req);

      console.log(
        '[CANCEL] Authenticated user:',
        user.id
      );

      /*
       * ======================================================
       * 2. LOAD PROFILE
       * ======================================================
       */

      const profile =
        await getProfile(user.id);

      if (!profile) {
        throw new Error(
          'Your Washek profile could not be found.'
        );
      }

      /*
       * ======================================================
       * 3. REQUIRE STRIPE IDS
       * ======================================================
       */

      const customerId =
        profile.stripe_customer_id ||
        null;

      const subscriptionId =
        profile.stripe_subscription_id ||
        null;

      /*
       * We intentionally do NOT search Stripe by email.
       *
       * Email-based lookup can select the wrong customer when
       * an account has multiple Stripe customers or historical
       * subscriptions.
       */

      if (!customerId) {
        console.log(
          '[CANCEL] No Stripe customer is stored for user:',
          user.id
        );

        const updatedProfile =
          await supabaseAdmin
            .from('profiles')
            .update({
              subscription_plan:
                'free',

              subscription_status:
                'canceled',

              stripe_subscription_id:
                null,

              stripe_price_id:
                null,

              subscription_cancelled_at:
                new Date().toISOString(),

              subscription_updated_at:
                new Date().toISOString(),

              updated_at:
                new Date().toISOString(),
            })
            .eq('id', user.id)
            .select('*')
            .maybeSingle();

        if (updatedProfile.error) {
          throw new Error(
            `Unable to update your Washek profile: ${updatedProfile.error.message}`
          );
        }

        return json({
          success: true,
          alreadyCanceled: true,
          plan: 'free',
          message:
            'Your account is already on the Free Plan.',
          user: updatedProfile.data,
        });
      }

      /*
       * ======================================================
       * 4. IF NO SUBSCRIPTION, ACCOUNT IS ALREADY FREE
       * ======================================================
       */

      if (!subscriptionId) {
        console.log(
          '[CANCEL] No Stripe subscription stored for user:',
          user.id
        );

        const updatedProfile =
          await makeProfileFree(
            user.id,
            customerId
          );

        return json({
          success: true,
          alreadyCanceled: true,
          plan: 'free',
          message:
            'Your account is already on the Free Plan.',
          user: updatedProfile,
        });
      }

      /*
       * ======================================================
       * 5. RETRIEVE SUBSCRIPTION
       * ======================================================
       */

      const subscription =
        await getStripeSubscription(
          subscriptionId
        );

      /*
       * ======================================================
       * 6. VERIFY OWNERSHIP
       * ======================================================
       *
       * This is the important security check.
       *
       * Never cancel a subscription merely because its ID is
       * present in a request/profile. Verify that Stripe says
       * the subscription belongs to this user's Stripe customer.
       */

      const stripeCustomerId =
        typeof subscription?.customer ===
        'string'
          ? subscription.customer
          : null;

      if (
        !stripeCustomerId ||
        stripeCustomerId !== customerId
      ) {
        console.error(
          '[CANCEL] Stripe ownership mismatch:',
          {
            userId: user.id,
            profileCustomerId:
              customerId,
            stripeCustomerId,
            subscriptionId,
          }
        );

        throw new Error(
          'The Stripe subscription on this account could not be verified.'
        );
      }

      /*
       * ======================================================
       * 7. CHECK CURRENT STRIPE STATUS
       * ======================================================
       */

      const currentStatus =
        subscription?.status ||
        null;

      /*
       * Stripe has already canceled this subscription.
       * Do not attempt another DELETE.
       */

      if (
        currentStatus ===
          'canceled' ||
        currentStatus ===
          'incomplete_expired'
      ) {
        console.log(
          '[CANCEL] Subscription already canceled:',
          subscriptionId
        );

        const updatedProfile =
          await makeProfileFree(
            user.id,
            customerId
          );

        return json({
          success: true,
          alreadyCanceled: true,
          plan: 'free',
          message:
            'Your subscription is already canceled.',
          user: updatedProfile,
        });
      }

      /*
       * ======================================================
       * 8. CANCEL STRIPE IMMEDIATELY
       * ======================================================
       */

      console.log(
        '[CANCEL] Canceling verified Stripe subscription:',
        {
          userId: user.id,
          customerId,
          subscriptionId,
          stripeStatus:
            currentStatus,
        }
      );

      const canceled =
        await cancelStripeSubscription(
          subscriptionId
        );

      /*
       * ======================================================
       * 9. REVOKE WASHEK PAID ACCESS
       * ======================================================
       */

      const updatedProfile =
        await makeProfileFree(
          user.id,
          customerId
        );

      /*
       * ======================================================
       * 10. SUCCESS
       * ======================================================
       */

      console.log(
        '[CANCEL] SUCCESS:',
        {
          userId: user.id,
          customerId,
          subscriptionId,
          stripeStatus:
            canceled?.status ||
            'canceled',
        }
      );

      return json({
        success: true,
        alreadyCanceled: false,
        message:
          'Your subscription has been canceled immediately. Your account is now on the Free Plan.',
        stripe_status:
          canceled?.status ||
          'canceled',
        subscription_id:
          subscriptionId,
        user: updatedProfile,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to cancel your subscription.';

      console.error(
        '[CANCEL] FAILED:',
        {
          message,
          timestamp:
            new Date().toISOString(),
        }
      );

      return json(
        {
          success: false,
          error: message,
        },
        400
      );
    }
  }
);
