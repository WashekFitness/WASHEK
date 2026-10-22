/**
 * WASHEK subscription feature gates.
 *
 * Plans:
 * free < progress < performance < elite
 *
 * IMPORTANT:
 * Keep feature access centralized here.
 * UI components should use canAccess()/hasPlan() instead
 * of inventing their own subscription rules.
 */

export const PLAN_HIERARCHY = [
  'free',
  'progress',
  'performance',
  'elite',
];

/**
 * Stripe Payment Link URLs for direct plan upgrades.
 */
export const PLAN_PAYMENT_URLS = {
  progress: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
  performance: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
  elite: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
};


/**
 * Monthly Kael message allowances.
 */
export const AI_MESSAGE_LIMITS = {
  free: 100,
  progress: 300,
  performance: 800,
  elite: 2000,
};


/**
 * Return true when the user's plan is equal to or higher
 * than the required plan.
 */
export function hasPlan(
  userPlan,
  requiredPlan
) {
  let resolvedUserPlan = userPlan;

  // Handle object inputs gracefully (e.g. user object passed directly)
  if (resolvedUserPlan && typeof resolvedUserPlan === 'object') {
    const status = String(resolvedUserPlan.subscription_status || '').toLowerCase().trim();
    if (status === 'canceled' || status === 'cancelled' || status === 'inactive') {
      resolvedUserPlan = 'free';
    } else {
      resolvedUserPlan =
        resolvedUserPlan.subscription_plan ||
        resolvedUserPlan.plan ||
        resolvedUserPlan.tier ||
        'free';
    }
  }

  // Check if globally canceled in localStorage
  try {
    const storedStatus = String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
    if (storedStatus === 'canceled' || storedStatus === 'cancelled') {
      if (typeof userPlan === 'object') {
        const objStatus = String(userPlan?.subscription_status || '').toLowerCase().trim();
        if (objStatus !== 'active' && objStatus !== 'trialing') {
          resolvedUserPlan = 'free';
        }
      } else {
        resolvedUserPlan = 'free';
      }
    }
  } catch {
    // Storage access fallback
  }

  // If missing or free, check localStorage fallback for upgraded status
  if (!resolvedUserPlan || resolvedUserPlan === 'free') {
    try {
      const storedStatus = String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
      if (storedStatus !== 'canceled' && storedStatus !== 'cancelled') {
        const storedPlan = localStorage.getItem('washek_subscription_plan');
        if (storedPlan && storedPlan !== 'free') {
          resolvedUserPlan = storedPlan;
        } else {
          const storedUser = localStorage.getItem('washek_user');
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (
              parsed?.subscription_status !== 'canceled' &&
              parsed?.subscription_status !== 'cancelled' &&
              parsed?.subscription_plan &&
              parsed.subscription_plan !== 'free'
            ) {
              resolvedUserPlan = parsed.subscription_plan;
            }
          }
        }
      }
    } catch {
      // Storage access fallback
    }
  }

  const normalizedUserPlan =
    String(
      resolvedUserPlan || 'free'
    )
      .toLowerCase()
      .trim();

  const normalizedRequiredPlan =
    String(
      requiredPlan || 'free'
    )
      .toLowerCase()
      .trim();

  const userIndex =
    PLAN_HIERARCHY.indexOf(
      normalizedUserPlan
    );

  const requiredIndex =
    PLAN_HIERARCHY.indexOf(
      normalizedRequiredPlan
    );

  if (
    userIndex < 0 ||
    requiredIndex < 0
  ) {
    return false;
  }

  return (
    userIndex >=
    requiredIndex
  );
}


/**
 * Central feature map.
 *
 * FREE
 * ─────────────────────────────────────────────────────────
 * live_workout
 *
 * PROGRESS
 * ────────────────────────────────────────────────────────
 * snap_food
 * scan_barcode
 * progress_photos
 * custom_workout_adjustments
 * advanced_macro_tracking
 *
 * PERFORMANCE
 * ────────────────────────────────────────────────────────
 * ai_body_analysis
 * workout_analytics
 * nutrition_insights
 *
 * ELITE
 * ────────────────────────────────────────────────────────
 * elite_realtime_adjustments
 * live_workout_adjustments
 * form_analysis
 * kael_elite_tips
 * deep_recovery_insights
 * progress_graph
 */
export const FEATURE_PLANS = {

  /*
   * ========================================================
   * PROGRESS
   * ========================================================
   */

  /**
   * AI food-photo scanning.
   */
  snap_food:
    'progress',

  /**
   * Nutrition-label/package scanning.
   */
  scan_barcode:
    'progress',

  /**
   * Save progress photos.
   */
  progress_photos:
    'progress',

  /**
   * Adaptive programming — Kael learns from your workout edits
   * and post-workout check-ins to calibrate progression.
   */
  adaptive_programming:
    'progress',

  /**
   * Manually edit programmed workouts.
   *
   * This is the custom workout editor in WeeklyPlan.
   */
  custom_workout_adjustments:
    'progress',

  /**
   * Macro tracking beyond simple food entry.
   */
  advanced_macro_tracking:
    'progress',


  /*
   * ========================================================
   * PERFORMANCE
   * ========================================================
   */

  /**
   * AI body-fat estimate from progress photos.
   */
  ai_body_analysis:
    'performance',

  /**
   * Detailed workout-performance analytics.
   */
  workout_analytics:
    'performance',

  /**
   * AI-assisted nutrition insights and recommendations.
   */
  nutrition_insights:
    'performance',


  /*
   * ========================================================
   * ELITE
   * ========================================================
   */

  /**
   * Canonical name for Elite real-time workout adjustments.
   */
  elite_realtime_adjustments:
    'elite',

  /**
   * Backward-compatible alias used by LiveWorkout.
   *
   * LiveWorkout currently checks this feature name directly.
   * Keep both names pointing to Elite so the feature remains
   * correctly gated without changing the working tracker.
   */
  live_workout_adjustments:
    'elite',

  /**
   * AI video-based movement/form analysis.
   */
  form_analysis:
    'elite',

  /**
   * Personalized advanced coaching tips.
   */
  kael_elite_tips:
    'elite',

  /**
   * Deeper fatigue, recovery and deload guidance.
   */
  deep_recovery_insights:
    'elite',

  /**
   * Advanced progress graphing/comparison.
   */
  progress_graph:
    'elite',


  /*
   * ========================================================
   * FREE
   * ========================================================
   */

  /**
   * Basic workout tracking is free for everyone.
   *
   * This includes:
   * - starting workouts
   * - tracking sets
   * - tracking reps
   * - using the rest timer
   * - saving workout logs
   * - viewing My Maxes
   *
   * It does NOT unlock Elite's AI workout adjustments.
   */
  live_workout:
    'free',
};


/**
 * Check whether a user can access a named feature.
 */
export function canAccess(
  userPlan,
  feature
) {
  const requiredPlan =
    FEATURE_PLANS[
      feature
    ];

  if (!requiredPlan) {
    return false;
  }

  return hasPlan(
    userPlan,
    requiredPlan
  );
}


/**
 * Get the monthly Kael message allowance.
 */
export function getPlanAiLimit(
  plan
) {
  const normalizedPlan =
    String(
      plan || 'free'
    )
      .toLowerCase()
      .trim();

  return (
    AI_MESSAGE_LIMITS[
      normalizedPlan
    ] ??
    AI_MESSAGE_LIMITS.free
  );
}


/**
 * Return the user's normalized plan name.
 *
 * Useful when UI/API data may contain unexpected casing.
 */
export function normalizePlan(
  plan
) {
  const normalized =
    String(
      plan || 'free'
    )
      .toLowerCase()
      .trim();

  return PLAN_HIERARCHY.includes(
    normalized
  )
    ? normalized
    : 'free';
}


export const PLAN_LABELS = {
  free: 'Free',
  progress: 'Progress',
  performance: 'Performance',
  elite: 'Elite',
};

/**
 * Return a human-readable plan name.
 */
export function getPlanLabel(
  plan
) {
  const normalized =
    normalizePlan(
      plan
    );

  return (
    PLAN_LABELS[
      normalized
    ] ||
    'Free'
  );
}

/**
 * Centrally applies a subscription upgrade across all client state,
 * local storage caches, and fires window notification events so all
 * UI components unlock instantly.
 */
export function applySubscriptionUpgrade(plan, status = 'active', details = {}) {
  const normPlan = normalizePlan(plan);
  if (normPlan === 'free') return;

  try {
    localStorage.setItem('washek_subscription_plan', normPlan);
    localStorage.setItem('washek_subscription_status', status);

    const storedUser = localStorage.getItem('washek_user');
    let userObj = {};
    if (storedUser) {
      try {
        userObj = JSON.parse(storedUser) || {};
      } catch (_parseErr) {
        // ignore parse error
      }
    }

    userObj.subscription_plan = normPlan;
    userObj.subscription_status = status;
    userObj.tier = normPlan;
    userObj.plan = normPlan;
    userObj.subscription_tier = normPlan;

    localStorage.setItem('washek_user', JSON.stringify(userObj));
  } catch (err) {
    console.debug('[subscription] LocalStorage upgrade sync note:', err);
  }

  // Dispatch global events for instant reactive UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('washek_subscription_updated', {
        detail: {
          plan: normPlan,
          status,
          ...details,
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('washek_user_changed', {
        detail: {
          subscription_plan: normPlan,
          subscription_status: status,
        },
      })
    );
  }

  return normPlan;
}

/**
 * Centrally applies a subscription cancellation across all client state,
 * cleans up local storage caches, and fires window notification events so all
 * UI components update to Free plan immediately.
 */
export function applySubscriptionCancellation(details = {}) {
  try {
    localStorage.removeItem('washek_subscription_plan');
    localStorage.setItem('washek_subscription_status', 'canceled');
    localStorage.setItem('washek_subscription_cancelled_at', new Date().toISOString());

    const storedUser = localStorage.getItem('washek_user');
    let userObj = {};
    if (storedUser) {
      try {
        userObj = JSON.parse(storedUser) || {};
      } catch (_parseErr) {
        // ignore parse error
      }
    }

    userObj.subscription_plan = 'free';
    userObj.subscription_status = 'canceled';
    userObj.tier = 'free';
    userObj.plan = 'free';
    userObj.subscription_tier = 'free';
    userObj.stripe_subscription_id = null;
    userObj.stripe_price_id = null;
    userObj.subscription_cancelled_at = new Date().toISOString();

    localStorage.setItem('washek_user', JSON.stringify(userObj));
  } catch (err) {
    console.debug('[subscription] LocalStorage cancellation sync note:', err);
  }

  // Dispatch global events for instant reactive UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('washek_subscription_updated', {
        detail: {
          plan: 'free',
          status: 'canceled',
          ...details,
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('washek_user_changed', {
        detail: {
          subscription_plan: 'free',
          subscription_status: 'canceled',
        },
      })
    );
  }

  return 'free';
}
