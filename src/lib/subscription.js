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
 * Monthly Kael message allowances.
 */
export const AI_MESSAGE_LIMITS = {
  free: 100,
  progress: 300,
  performance: 800,
  elite: 2000,
};


export const ACTIVE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
];

export function isActiveSubscriptionStatus(status) {
  const normalized = String(status || '').toLowerCase().trim();
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(normalized);
}

/**
 * Resolve the effective subscription plan authoritatively.
 * Requires both a paid plan AND an active subscription_status ('active', 'trialing', 'past_due').
 * Missing, 'inactive', 'canceled', 'cancelled', 'paused', 'unpaid', or 'expired' statuses ALWAYS resolve to 'free'.
 */
export function resolveEffectivePlan(userOrPlan, explicitStatus) {
  if (userOrPlan && typeof userOrPlan === 'object') {
    const status =
      explicitStatus !== undefined
        ? explicitStatus
        : userOrPlan.subscription_status;

    if (!isActiveSubscriptionStatus(status)) {
      return 'free';
    }

    const rawPlan =
      userOrPlan.subscription_plan ||
      userOrPlan.plan ||
      userOrPlan.tier ||
      userOrPlan.subscription_tier ||
      'free';

    return normalizePlan(rawPlan);
  }

  if (typeof userOrPlan === 'string' && userOrPlan.trim() !== '') {
    const normPlan = normalizePlan(userOrPlan);
    if (normPlan === 'free') {
      return 'free';
    }

    if (explicitStatus !== undefined) {
      return isActiveSubscriptionStatus(explicitStatus) ? normPlan : 'free';
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const storedStatus = String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
        if (storedStatus && !isActiveSubscriptionStatus(storedStatus)) {
          return 'free';
        }
        const storedUser = localStorage.getItem('washek_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed && typeof parsed === 'object') {
            const parsedStatus = parsed.subscription_status || storedStatus;
            if (!isActiveSubscriptionStatus(parsedStatus)) {
              return 'free';
            }
            const parsedPlan = normalizePlan(
              parsed.subscription_plan ||
              parsed.plan ||
              parsed.tier ||
              parsed.subscription_tier ||
              'free'
            );
            if (parsedPlan === 'free') {
              return 'free';
            }
          }
        } else if (!isActiveSubscriptionStatus(storedStatus)) {
          return 'free';
        }
      }
    } catch {
      return 'free';
    }

    return normPlan;
  }

  // Fallback when caller passed null/undefined: only trust localStorage if status is strictly active
  try {
    if (typeof localStorage !== 'undefined') {
      const storedStatus = String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
      const storedUser = localStorage.getItem('washek_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed && typeof parsed === 'object') {
          const userStatus = parsed.subscription_status || storedStatus;
          if (!isActiveSubscriptionStatus(userStatus)) {
            return 'free';
          }
          const p =
            parsed.subscription_plan ||
            parsed.plan ||
            parsed.tier ||
            parsed.subscription_tier ||
            'free';
          return normalizePlan(p);
        }
      }
      if (isActiveSubscriptionStatus(storedStatus)) {
        const storedPlan = localStorage.getItem('washek_subscription_plan');
        return normalizePlan(storedPlan);
      }
    }
  } catch {
    // Storage access fallback
  }

  return 'free';
}

/**
 * Normalize subscription fields on any cached/loaded user object so inactive/canceled/unpaid
 * accounts can never retain stale paid tier fields.
 */
export function enforceUserSubscriptionState(userObj) {
  if (!userObj || typeof userObj !== 'object') return userObj;
  const rawStatus = String(userObj.subscription_status || '').toLowerCase().trim();
  const effectiveStatus = rawStatus || 'inactive';
  const effectivePlan = isActiveSubscriptionStatus(effectiveStatus)
    ? normalizePlan(
        userObj.subscription_plan ||
        userObj.plan ||
        userObj.tier ||
        userObj.subscription_tier ||
        'free'
      )
    : 'free';

  return {
    ...userObj,
    plan: effectivePlan,
    tier: effectivePlan,
    subscription_plan: effectivePlan,
    subscription_tier: effectivePlan,
    subscription_status: effectivePlan === 'free' && isActiveSubscriptionStatus(effectiveStatus)
      ? 'inactive'
      : effectiveStatus,
  };
}


/**
 * Return true when the user's plan is equal to or higher
 * than the required plan.
 */
export function hasPlan(
  userPlan,
  requiredPlan
) {
  const normalizedUserPlan = resolveEffectivePlan(userPlan);
  const normalizedRequiredPlan = normalizePlan(requiredPlan);

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
   * Compare progress photos side by side.
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
   * Workout-adaptive calorie & macro fueling (beyond basic daily macro logging & targets).
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
const RECENT_UPGRADE_KEY = 'washek_recent_upgrade';

export function getRecentUpgradeGrace() {
  clearRecentUpgradeGrace();
  return null;
}

export function clearRecentUpgradeGrace() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(RECENT_UPGRADE_KEY);
  } catch {
    // ignore
  }
}

export function applySubscriptionUpgrade(plan, status = 'active', details = {}) {
  const normPlan = normalizePlan(plan);
  const normStatus = String(status || 'active').toLowerCase().trim();
  const isActive = ['active', 'trialing', 'past_due'].includes(normStatus);
  if (normPlan === 'free' || !isActive) return 'free';

  try {
    localStorage.setItem('washek_subscription_plan', normPlan);
    localStorage.setItem('washek_subscription_status', normStatus);
    localStorage.removeItem('washek_subscription_cancelled_at');
    localStorage.removeItem(RECENT_UPGRADE_KEY);

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
    userObj.subscription_status = normStatus;
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
          status: normStatus,
          ...details,
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('washek_user_changed', {
        detail: {
          subscription_plan: normPlan,
          subscription_status: normStatus,
        },
      })
    );
  }

  return normPlan;
}

/**
 * Centrally applies a subscription cancellation across all client state,
 * cleans up local storage/session/cookie caches, and fires window notification events so all
 * UI components update to Free plan immediately.
 */
export function applySubscriptionCancellation(details = {}) {
  const cancelledAt = new Date().toISOString();
  try {
    localStorage.removeItem('washek_subscription_plan');
    localStorage.removeItem(RECENT_UPGRADE_KEY);
    localStorage.removeItem('washek_pending_checkout_plan');
    localStorage.removeItem('washek_subscription_success_event');
    localStorage.setItem('washek_subscription_status', 'canceled');
    localStorage.setItem('washek_subscription_cancelled_at', cancelledAt);
    localStorage.setItem('washek_has_used_trial', 'true');

    try {
      sessionStorage.removeItem('washek_pending_checkout_plan');
    } catch {
      // ignore sessionStorage error
    }

    if (typeof document !== 'undefined') {
      document.cookie = 'washek_pending_checkout_plan=; path=/; max-age=0;';
    }

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
    userObj.paddle_subscription_id = null;
    userObj.paddle_price_id = null;
    userObj.has_used_trial = true;
    userObj.trial_used = true;
    userObj.subscription_cancelled_at = cancelledAt;

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
