/**
 * Personalized nutrition goals for WASHEK.
 *
 * Calories are intentionally calculated conservatively.
 *
 * Important:
 * - Uses Mifflin-St Jeor for estimated BMR.
 * - Uses a conservative activity multiplier because the app does not
 *   currently collect a dedicated activity-level input.
 * - Applies ONE goal adjustment only. Fitness goals and weight goals
 *   are combined instead of stacking multiple multipliers.
 * - These are estimates, not medical prescriptions.
 */

import { getCachedActiveProgram, getCachedLogs } from '@/lib/cacheStore';

const KG_PER_LB = 0.453592;
const CM_PER_INCH = 2.54;

/**
 * Safely convert a value to a positive number.
 */
function positiveNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

/**
 * Get the user's weight in pounds.
 */
function getWeightLbs(user) {
  const weightLbs = positiveNumber(user?.weight_lbs);

  if (weightLbs > 0) {
    return weightLbs;
  }

  const weightKg = positiveNumber(user?.weight_kg);

  if (weightKg > 0) {
    return weightKg / KG_PER_LB;
  }

  return 150;
}

/**
 * Get the user's height in centimeters.
 */
function getHeightCm(user) {
  const heightCm = positiveNumber(user?.height_cm);

  if (heightCm > 0) {
    return heightCm;
  }

  const heightInches = positiveNumber(user?.height_inches);

  if (heightInches > 0) {
    return heightInches * CM_PER_INCH;
  }

  return 68 * CM_PER_INCH;
}

/**
 * Determine the user's primary nutrition goal.
 *
 * We intentionally collapse all goal arrays into one priority order so
 * calories cannot accidentally be adjusted twice.
 */
function getPrimaryGoal(user) {
  const fitnessGoals = Array.isArray(user?.fitness_goals)
    ? user.fitness_goals
    : [];

  const weightGoals = Array.isArray(user?.weight_goals)
    ? user.weight_goals
    : [];

  const goals = new Set([
    ...fitnessGoals,
    ...weightGoals,
  ]);

  // Fat loss takes priority if explicitly selected.
  if (
    goals.has('lose_weight') ||
    goals.has('fat_loss') ||
    goals.has('weight_loss')
  ) {
    return 'lose';
  }

  // Muscle gain takes priority next.
  if (
    goals.has('gain_muscle') ||
    goals.has('muscle_growth') ||
    goals.has('build_muscle')
  ) {
    return 'gain';
  }

  // Recomposition should generally sit around maintenance.
  if (
    goals.has('body_recomp') ||
    goals.has('recomp')
  ) {
    return 'recomp';
  }

  if (
    goals.has('get_stronger') ||
    goals.has('gain_strength') ||
    goals.has('strength')
  ) {
    return 'strength';
  }

  if (
    goals.has('improve_endurance') ||
    goals.has('endurance')
  ) {
    return 'endurance';
  }

  // Aesthetics without a specific weight goal is treated as maintenance.
  if (goals.has('aesthetics')) {
    return 'maintenance';
  }

  return 'maintenance';
}

/**
 * Estimate daily calorie needs.
 *
 * This intentionally uses conservative activity assumptions because
 * WASHEK does not currently ask users for a formal activity level.
 */
export function calcNutritionGoals(user, options = {}) {
  const userKey = options?.userKey || user?.id || user?.uid || null;

  // Resolve active program and workout logs from options or synchronous cache
  const program = options?.program || getCachedActiveProgram(userKey);
  const workoutLogs = Array.isArray(options?.workoutLogs)
    ? options.workoutLogs
    : getCachedLogs(userKey);

  const rawWeek = options?.currentWeek != null
    ? options.currentWeek
    : (program?.current_week || 1);
  const currentWeek = Math.max(1, Math.min(12, Number(rawWeek) || 1));

  const weightLbs = getWeightLbs(user);
  const weightKg = weightLbs * KG_PER_LB;

  const heightCm = getHeightCm(user);

  const age = Math.min(
    Math.max(
      positiveNumber(user?.age, 25),
      13
    ),
    100
  );

  const gender = String(user?.gender || 'male').toLowerCase();

  const trainingType = String(
    user?.training_type || 'calisthenics'
  ).toLowerCase();

  /**
   * Mifflin-St Jeor equation for baseline BMR.
   */
  const bmr =
    gender === 'female'
      ? (10 * weightKg) +
        (6.25 * heightCm) -
        (5 * age) -
        161
      : (10 * weightKg) +
        (6.25 * heightCm) -
        (5 * age) +
        5;

  /**
   * Activity estimates.
   */
  let activityMultiplier = 1.35;

  if (trainingType === 'weights') {
    activityMultiplier = 1.40;
  } else if (trainingType === 'hybrid') {
    activityMultiplier = 1.40;
  } else if (trainingType === 'weighted_calisthenics') {
    activityMultiplier = 1.375;
  } else if (trainingType === 'calisthenics') {
    activityMultiplier = 1.35;
  }

  const estimatedMaintenance = bmr * activityMultiplier;

  const primaryGoal = getPrimaryGoal(user);

  let goalMultiplier = 1.0;

  switch (primaryGoal) {
    case 'lose':
      goalMultiplier = 0.85;
      break;

    case 'gain':
      goalMultiplier = 1.05;
      break;

    case 'strength':
      goalMultiplier = 1.03;
      break;

    case 'endurance':
      goalMultiplier = 1.03;
      break;

    case 'recomp':
    case 'maintenance':
    default:
      goalMultiplier = 1.0;
      break;
  }

  let calories = Math.round(
    estimatedMaintenance * goalMultiplier
  );

  const conservativeMinimum = Math.round(
    bmr * 1.20
  );

  calories = Math.max(
    calories,
    conservativeMinimum
  );

  /**
   * Baseline Protein calculation:
   * Keeps a solid baseline intake.
   */
  let proteinPerLb = 0.8;

  if (primaryGoal === 'lose') {
    proteinPerLb = 0.9;
  } else if (primaryGoal === 'gain') {
    proteinPerLb = 0.9;
  } else if (primaryGoal === 'strength') {
    proteinPerLb = 0.9;
  } else if (primaryGoal === 'recomp') {
    proteinPerLb = 0.9;
  }

  const protein = Math.round(
    Math.min(
      Math.max(weightLbs * proteinPerLb, 100),
      220
    )
  );

  const proteinCals = protein * 4;

  const fatPercentage =
    primaryGoal === 'lose'
      ? 0.25
      : 0.27;

  const fat = Math.round(
    (calories * fatPercentage) / 9
  );

  const fatCals = fat * 9;

  const remainingCalories = Math.max(
    calories - proteinCals - fatCals,
    0
  );

  const carbs = Math.round(
    remainingCalories / 4
  );

  // ── 12-WEEK PERIODIZED MACROCYCLE PROGRESSION ──
  // Workouts get harder and more intense later on in the 12 weeks.
  // As the user builds strength and muscle, their energy expenditure,
  // muscle protein synthesis demand, and recovery needs progressively elevate.

  let phaseNumber = 1;
  let phaseName = 'Foundation & Work Capacity';
  let phaseDescription = 'Building baseline movement mechanics, work capacity, and neuromuscular coordination.';
  let phaseCalorieDelta = 0;
  let phaseProteinDelta = 0;
  let phaseCarbDelta = 0;
  let phaseFatDelta = 0;

  if (currentWeek >= 1 && currentWeek <= 4) {
    phaseNumber = 1;
    phaseName = 'Foundation & Work Capacity';
    phaseDescription = 'Establishing movement mechanics, tendon strength, and baseline work capacity.';
    if (currentWeek >= 3) {
      // Gentle ramp in weeks 3-4 as initial conditioning volume builds
      phaseCalorieDelta = 35;
      phaseProteinDelta = 4;
      phaseCarbDelta = 5;
    }
  } else if (currentWeek >= 5 && currentWeek <= 8) {
    phaseNumber = 2;
    phaseName = 'Intensification & Progressive Overload';
    phaseDescription = 'Workouts intensify with heavier loads, harder skill progressions, and denser mechanical tension. Fueling accelerated muscle protein synthesis and glycogen recovery.';
    const weekOffset = currentWeek - 5; // 0, 1, 2, 3
    phaseCalorieDelta = 120 + (weekOffset * 20); // 120, 140, 160, 180 kcal
    phaseProteinDelta = 12 + Math.round(weekOffset * 2); // +12g to +18g protein
    phaseCarbDelta = 14 + (weekOffset * 3); // +14g to +23g carbs
    phaseFatDelta = 3 + Math.round(weekOffset * 0.7); // +3g to +5g fat
  } else if (currentWeek >= 9 && currentWeek <= 11) {
    phaseNumber = 3;
    phaseName = 'Peak Strength & Neuromuscular Demand';
    phaseDescription = 'Maximum mechanical tension, heaviest resistance, and maximal neural drive. Maximizing intramuscular glycogen saturation and preventing catabolism.';
    const weekOffset = currentWeek - 9; // 0, 1, 2
    phaseCalorieDelta = 200 + (weekOffset * 35); // 200, 235, 270 kcal
    phaseProteinDelta = 18 + Math.round(weekOffset * 3); // +18g to +24g protein
    phaseCarbDelta = 24 + (weekOffset * 5); // +24g to +34g carbs
    phaseFatDelta = 4 + (weekOffset * 1); // +4g to +6g fat
  } else if (currentWeek === 12) {
    phaseNumber = 3;
    phaseName = 'Peak Benchmark & Taper';
    phaseDescription = 'Strategic recovery, nervous system deload, and full glycogen replenishment for maximum power output on PR benchmark tests.';
    phaseCalorieDelta = 100;
    phaseProteinDelta = 15;
    phaseCarbDelta = 15;
    phaseFatDelta = 2;
  }

  // ── PERFORMANCE & WORKOUT CONSISTENCY MODIFIER ──
  // Logged performance and workout frequency dynamically adjust daily targets.
  let performanceCalorieDelta = 0;
  let performanceProteinDelta = 0;
  let performanceCarbDelta = 0;
  let performanceFatDelta = 0;
  let recentWorkoutsCount = 0;
  let totalWorkoutsCount = 0;

  if (Array.isArray(workoutLogs) && workoutLogs.length > 0) {
    totalWorkoutsCount = workoutLogs.length;

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const recentLogs = workoutLogs.filter((l) => {
      if (!l) return false;
      const dStr = l.date || l.created_at;
      if (!dStr) return false;
      const t = new Date(dStr).getTime();
      return Number.isFinite(t) && now - t <= sevenDaysMs;
    });

    recentWorkoutsCount = recentLogs.length;

    if (recentWorkoutsCount >= 4) {
      // 4+ workouts in last 7 days: high metabolic throughput & elevated protein turnover
      performanceCalorieDelta += 80;
      performanceProteinDelta += 6;
      performanceCarbDelta += 11;
      performanceFatDelta += 2;
    } else if (recentWorkoutsCount >= 2) {
      // 2-3 workouts in last 7 days: consistent active training cadence
      performanceCalorieDelta += 40;
      performanceProteinDelta += 3;
      performanceCarbDelta += 6;
      performanceFatDelta += 1;
    }

    // Long-term physical adaptation: as workouts accumulate over the 12 weeks,
    // the athlete has built denser muscle mass, increasing basal metabolic expenditure.
    if (totalWorkoutsCount >= 24) {
      performanceCalorieDelta += 45;
      performanceProteinDelta += 4;
      performanceCarbDelta += 6;
    } else if (totalWorkoutsCount >= 12) {
      performanceCalorieDelta += 25;
      performanceProteinDelta += 2;
      performanceCarbDelta += 3;
    }
  }

  const totalCalorieDelta = phaseCalorieDelta + performanceCalorieDelta;
  const totalProteinDelta = phaseProteinDelta + performanceProteinDelta;
  const totalCarbDelta = phaseCarbDelta + performanceCarbDelta;
  const totalFatDelta = phaseFatDelta + performanceFatDelta;

  const finalCalories = Math.round(calories + totalCalorieDelta);
  const finalProtein = Math.round(protein + totalProteinDelta);
  const finalCarbs = Math.round(carbs + totalCarbDelta);
  const finalFat = Math.round(fat + totalFatDelta);

  return {
    calories: finalCalories,
    protein: Math.max(finalProtein, 50),
    carbs: Math.max(finalCarbs, 50),
    fat: Math.max(finalFat, 30),
    base: {
      calories,
      protein: Math.max(protein, 50),
      carbs: Math.max(carbs, 50),
      fat: Math.max(fat, 30),
    },
    adaptation: {
      isAdapted: totalCalorieDelta > 0 || totalProteinDelta > 0,
      currentWeek,
      phaseNumber,
      phaseName,
      phaseDescription,
      phaseCalorieDelta,
      phaseProteinDelta,
      phaseCarbDelta,
      phaseFatDelta,
      performanceCalorieDelta,
      performanceProteinDelta,
      performanceCarbDelta,
      performanceFatDelta,
      totalCalorieDelta,
      totalProteinDelta,
      totalCarbDelta,
      totalFatDelta,
      recentWorkoutsCount,
      totalWorkoutsCount,
      summary: `Week ${currentWeek} · ${phaseName} (+${totalCalorieDelta} kcal, +${totalProteinDelta}g protein)`,
    },
  };
}

/**
 * Calculate personalized daily hydration goal in milliliters.
 *
 * Keeps the existing moderate hydration behavior separate from
 * calorie calculations.
 */
export function calcWaterGoal(user) {
  const weightLbs = getWeightLbs(user);
  const weightKg = weightLbs * KG_PER_LB;

  const age = positiveNumber(user?.age, 25);

  const gender = String(
    user?.gender || 'male'
  ).toLowerCase();

  const goals = Array.isArray(user?.fitness_goals)
    ? user.fitness_goals
    : [];

  const weightGoals = Array.isArray(user?.weight_goals)
    ? user.weight_goals
    : [];

  const country = user?.country || 'US';

  // Base ml per kg.
  let mlPerKg = gender === 'female'
    ? 31
    : 35;

  if (age >= 55) {
    mlPerKg = 30;
  }

  let base = weightKg * mlPerKg;

  const isActive =
    goals.length > 0 ||
    weightGoals.length > 0 ||
    !!user?.training_type;

  if (isActive) {
    base += 500;
  }

  const hotCountries = [
    'IN',
    'ID',
    'TH',
    'VN',
    'PH',
    'BR',
    'MX',
    'SA',
    'AE',
    'EG',
    'NG',
    'BD',
    'PK',
    'MY',
    'SG',
    'CO',
    'PE',
  ];

  if (hotCountries.includes(country)) {
    base += 300;
  }

  if (
    goals.includes('improve_endurance') ||
    weightGoals.includes('improve_endurance')
  ) {
    base += 200;
  }

  if (
    goals.includes('lose_weight') ||
    weightGoals.includes('lose_weight')
  ) {
    base = Math.max(
      base - 100,
      2000
    );
  }

  const goalMl =
    Math.round(
      Math.min(
        Math.max(base, 2000),
        4000
      ) / 50
    ) * 50;

  return goalMl;
}
