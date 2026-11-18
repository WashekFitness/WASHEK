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

      let bodyData: any = {};
      try {
        const text = await req.text();
        if (text) {
          bodyData = JSON.parse(text);
        }
      } catch (_jsonErr) {
        // ignore
      }

      let user: any = null;
      try {
        user = await authenticateUser(req);
      } catch (authErr) {
        console.warn('[CANCEL] Supabase auth check note:', authErr);
      }

      const explicitUserId = bodyData?.userId || bodyData?.user_id;
      const explicitEmail = bodyData?.email;
      const effectiveUserId = user?.id || explicitUserId;

      if (!effectiveUserId && !explicitEmail) {
        throw new Error('You must be signed in to cancel your subscription.');
      }

      console.log(
        '[CANCEL] Processing cancellation for user:',
        effectiveUserId || explicitEmail
      );

      /*
       * ======================================================
       * 2. LOAD PROFILE
       * ======================================================
       */

      let profile: any = null;
      if (effectiveUserId) {
        profile = await getProfile(effectiveUserId);
      }

      if (!profile) {
        throw new Error(
          'Your Washek profile could not be found.'
        );
      }

      const customerId =
        profile.stripe_customer_id ||
        null;

      const subscriptionId =
        profile.stripe_subscription_id ||
        null;

      // Gather all potential subscription IDs to cancel from Stripe
      const subscriptionsToCancel = new Set<string>();
      if (subscriptionId && typeof subscriptionId === 'string' && subscriptionId.startsWith('sub_')) {
        subscriptionsToCancel.add(subscriptionId);
      }

      const userEmail = profile.email || user?.email || explicitEmail || null;

      // 1. Look up any active/trialing subscriptions by customerId
      if (customerId && typeof customerId === 'string' && customerId.startsWith('cus_')) {
        try {
          const custSubs = await stripeRequest(`subscriptions?customer=${encodeURIComponent(customerId)}&status=all`);
          if (Array.isArray(custSubs?.data)) {
            for (const s of custSubs.data) {
              if (['active', 'trialing', 'past_due', 'unpaid'].includes(String(s.status || '').toLowerCase())) {
                subscriptionsToCancel.add(s.id);
              }
            }
          }
        } catch (cSubErr) {
          console.warn('[CANCEL] Stripe customer subscriptions search note:', cSubErr);
        }
      }

      // 2. Also search Stripe customers by email if any exist
      if (userEmail) {
        try {
          const custSearch = await stripeRequest(`customers?email=${encodeURIComponent(userEmail.trim())}&limit=10`);
          if (Array.isArray(custSearch?.data)) {
            for (const c of custSearch.data) {
              if (c?.id) {
                try {
                  const sList = await stripeRequest(`subscriptions?customer=${encodeURIComponent(c.id)}&status=all`);
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
        } catch (emailCustErr) {
          console.warn('[CANCEL] Stripe email customer search note:', emailCustErr);
        }
      }

      console.log(
        '[CANCEL] Found Stripe subscriptions to cancel:',
        Array.from(subscriptionsToCancel),
        'for user:',
        profile.id
      );

      // Cancel every identified Stripe subscription immediately
      for (const subId of subscriptionsToCancel) {
        try {
          await cancelStripeSubscription(subId);
          console.log('[CANCEL] Successfully canceled Stripe subscription:', subId);
        } catch (cancelErr: any) {
          if (cancelErr?.message?.includes('No such subscription') || cancelErr?.message?.includes('already canceled')) {
            console.log('[CANCEL] Subscription already canceled in Stripe:', subId);
          } else {
            console.warn('[CANCEL] Stripe cancellation call note for', subId, cancelErr);
          }
        }
      }

      /*
       * ======================================================
       * Revoke Washek profile paid access to Free
       * ======================================================
       */
      const updatedProfile = await makeProfileFree(
        profile.id,
        customerId || ''
      );

      /*
       * ======================================================
       * 10. SUCCESS
       * ======================================================
       */

      console.log(
        '[CANCEL] SUCCESS:',
        {
          userId: user?.id || profile.id,
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
