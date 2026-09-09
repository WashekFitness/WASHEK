import { supabase } from '@/lib/supabase';

const CHECKOUT_FUNCTION =
  'create-checkout-session';

const VALID_PLANS = [
  'progress',
  'performance',
  'elite',
];

export async function createStripeCheckout(
  plan
) {
  /*
   * ----------------------------------------------------------
   * Validate the requested plan.
   * ----------------------------------------------------------
   */

  if (
    !VALID_PLANS.includes(
      plan
    )
  ) {
    throw new Error(
      'Invalid subscription plan.'
    );
  }

  /*
   * ----------------------------------------------------------
   * Get the current Supabase session.
   * ----------------------------------------------------------
   */

  const {
    data:
      sessionData,
    error:
      sessionError,
  } =
    await supabase.auth.getSession();

  if (
    sessionError
  ) {
    throw new Error(
      sessionError.message ||
        'Unable to verify your login session.'
    );
  }

  const session =
    sessionData?.session;

  if (
    !session?.access_token
  ) {
    throw new Error(
      'Your login session has expired. Please sign in again.'
    );
  }

  /*
   * ----------------------------------------------------------
   * Call the existing Supabase Edge Function.
   *
   * supabase.functions.invoke() automatically sends the
   * current authenticated session with the request.
   * ----------------------------------------------------------
   */

  const {
    data,
    error,
  } =
    await supabase.functions.invoke(
      CHECKOUT_FUNCTION,
      {
        body: {
          plan,
        },
      }
    );

  console.log(
    '[Washek Stripe] create-checkout-session response:',
    data
  );

  /*
   * ----------------------------------------------------------
   * Supabase transport/invocation error.
   * ----------------------------------------------------------
   */

  if (
    error
  ) {
    console.error(
      '[Washek Stripe] Edge Function invocation error:',
      error
    );

    throw new Error(
      error.message ||
        'Unable to contact the Stripe checkout service.'
    );
  }

  /*
   * ----------------------------------------------------------
   * Make sure the function actually returned JSON.
   * ----------------------------------------------------------
   */

  if (
    !data
  ) {
    throw new Error(
      'The Stripe checkout service returned no response.'
    );
  }

  /*
   * ----------------------------------------------------------
   * Backend explicitly reported an error.
   * ----------------------------------------------------------
   */

  if (
    data.success ===
    false
  ) {
    throw new Error(
      data.error ||
        'Unable to create Stripe Checkout.'
    );
  }

  /*
   * ----------------------------------------------------------
   * NORMAL FREE -> PAID CHECKOUT
   * ----------------------------------------------------------
   *
   * The current backend returns:
   *
   * {
   *   success: true,
   *   action: "checkout",
   *   url: "...",
   *   session_id: "...",
   *   plan: "...",
   *   price_id: "..."
   * }
   *
   * The important field is the Stripe Checkout URL.
   * ----------------------------------------------------------
   */

  if (
    data.success ===
      true &&
    data.url &&
    typeof data.url ===
      'string'
  ) {
    return {
      success:
        true,

      action:
        'checkout',

      url:
        data.url,

      session_id:
        data.session_id ||
        null,

      plan:
        data.plan ||
        plan,

      price_id:
        data.price_id ||
        null,
    };
  }

  /*
   * ----------------------------------------------------------
   * EXISTING PAID SUBSCRIPTION WAS CHANGED
   * ----------------------------------------------------------
   */

  if (
    data.success ===
      true &&
    (
      data.action ===
        'changed' ||
      data.action ===
        'already_current'
    )
  ) {
    return {
      success:
        true,

      action:
        data.action,

      plan:
        data.plan ||
        plan,

      subscription_id:
        data.subscription_id ||
        null,

      price_id:
        data.price_id ||
        null,

      message:
        data.message ||
        null,
    };
  }

  /*
   * ----------------------------------------------------------
   * DEFENSIVE FALLBACK
   * ----------------------------------------------------------
   *
   * If the backend gives us a URL but omits the action field,
   * still treat it as a valid Checkout response.
   * ----------------------------------------------------------
   */

  if (
    typeof data.url ===
      'string' &&
    data.url.trim()
  ) {
    return {
      success:
        true,

      action:
        'checkout',

      url:
        data.url,

      session_id:
        data.session_id ||
        null,

      plan:
        data.plan ||
        plan,

      price_id:
        data.price_id ||
        null,
    };
  }

  /*
   * ----------------------------------------------------------
   * NOTHING USABLE CAME BACK.
   * ----------------------------------------------------------
   */

  throw new Error(
    data.error ||
      'Stripe did not return a usable Checkout URL.'
  );
}
