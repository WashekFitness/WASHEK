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


/**
 * Return true when the user's plan is equal to or higher
 * than the required plan.
 */
export function hasPlan(
  userPlan,
  requiredPlan
) {
  const normalizedUserPlan =
    String(
      userPlan || 'free'
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

  const labels = {
    free: 'Free',
    progress: 'Progress',
    performance: 'Performance',
    elite: 'Elite',
  };

  return (
    labels[
      normalized
    ] ||
    'Free'
  );
}
