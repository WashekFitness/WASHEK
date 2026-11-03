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
import { parseExerciseVolumeMetrics } from '@/lib/muscleDistribution';

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

  // ── ADAPTIVE NUTRITION: DRIVEN BY THE ATHLETE'S ACTUAL PERFORMANCE ──
  // Adaptive targets are calibrated directly to what the athlete ACTUALLY executed,
  // rather than theoretical expectations of what they were supposed to do if they
  // followed the program schedule perfectly.
  //
  // - If the athlete trained 0 times recently, surplus is paused (0 kcal) to prevent unwanted body fat.
  // - If the athlete trained lightly (1-2 sessions, low sets), targets adapt modestly for gentle recovery.
  // - If the athlete achieved optimal stimulus (3-4 sessions, 16-36 sets), targets ramp up to fuel peak protein synthesis and glycogen resynthesis.
  // - If the athlete trained heavily (5+ sessions or > 36 sets), targets scale higher to prevent catabolism and replenish glycogen.
  // - If recent check-ins report high fatigue/soreness, an extra cellular repair and anti-fatigue cushion is allocated.

  let recentWorkoutsCount = 0;
  let totalWorkoutsCount = 0;
  let recentSetsCount = 0;
  let recentRepsCount = 0;
  let recentHoldSeconds = 0;
  let recentMinutes = 0;
  let hasHighFatigue = false;

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

    for (const log of recentLogs) {
      recentMinutes += Number(log?.duration_minutes) || 0;

      // Check fatigue signals in post_workout_checkin or ai_adjustment_notes
      const checkinText = `${log?.post_workout_checkin || ''} ${log?.ai_adjustment_notes || ''}`.toLowerCase();
      if (
        checkinText.includes('sore') ||
        checkinText.includes('exhaust') ||
        checkinText.includes('fatigue') ||
        checkinText.includes('heavy') ||
        checkinText.includes('tired') ||
        checkinText.includes('hard') ||
        checkinText.includes('rpe 9') ||
        checkinText.includes('rpe 10')
      ) {
        hasHighFatigue = true;
      }

      // Parse actual exercises completed
      const exercises = Array.isArray(log?.exercises_completed) ? log.exercises_completed : [];
      for (const ex of exercises) {
        if (!ex) continue;
        const setsCount = Math.max(
          1,
          Number(ex?.sets_completed) ||
            (Array.isArray(ex?.sets) ? ex.sets.length : Number(ex?.sets) || 1)
        );
        recentSetsCount += setsCount;

        const repsStr = ex?.reps_achieved || ex?.reps || '';
        const volumeMetrics = parseExerciseVolumeMetrics(repsStr, setsCount);
        recentRepsCount += volumeMetrics.totalReps;
        recentHoldSeconds += volumeMetrics.totalHoldSeconds;
      }
    }
  }

  // Calculate dynamic adaptive deltas based on actual completed training load
  let adaptiveCalorieDelta = 0;
  let adaptiveProteinDelta = 0;
  let adaptiveCarbDelta = 0;
  let adaptiveFatDelta = 0;
  let demandTier = 'Basal Recovery';
  let demandBadge = 'Rest Base';
  let statusTitle = 'Basal Recovery (0 Logged Sessions)';
  let phaseDescription =
    'Calibrated to your actual recent output. Adaptive surplus is paused until workouts are logged to protect your body composition.';

  if (recentWorkoutsCount === 0 || recentSetsCount === 0) {
    demandTier = 'Basal Recovery';
    demandBadge = 'Rest Base';
    statusTitle = 'Basal Recovery (0 Logged Sessions)';
    phaseDescription =
      'Calibrated to your actual training logs. Surplus calories are paused until workouts are logged, protecting you from unwanted body fat while keeping baseline protein high for tissue preservation.';
    adaptiveCalorieDelta = 0;
    adaptiveProteinDelta = 0;
    adaptiveCarbDelta = 0;
    adaptiveFatDelta = 0;
  } else if (recentWorkoutsCount <= 2 && recentSetsCount < 16) {
    demandTier = 'Active Maintenance';
    demandBadge = 'Light Output';
    statusTitle = 'Light Active Recovery';
    phaseDescription = `Calibrated to your actual logged volume (${recentSetsCount} completed sets across ${recentWorkoutsCount} session${recentWorkoutsCount === 1 ? '' : 's'}). Providing gentle recovery fueling without caloric surplus creep.`;
    adaptiveCalorieDelta = Math.round(45 + recentSetsCount * 2.0); // ~55-75 kcal
    adaptiveProteinDelta = Math.round(5 + recentSetsCount * 0.2); // ~6-8g protein
    adaptiveCarbDelta = Math.round(7 + recentSetsCount * 0.35); // ~8-12g carbs
    adaptiveFatDelta = 1;
  } else if (recentWorkoutsCount <= 4 && recentSetsCount <= 36) {
    demandTier = 'Optimal Stimulus';
    demandBadge = 'Optimal Output';
    statusTitle = 'Optimal Training Output Fueling';
    phaseDescription = `Calibrated to your actual completed workload (${recentSetsCount} sets, ${recentRepsCount} reps over ${recentMinutes}m). Fueling peak muscle protein synthesis and replenishing glycogen reserves.`;
    adaptiveCalorieDelta = Math.round(110 + Math.min(75, recentSetsCount * 2.1)); // ~145-185 kcal
    adaptiveProteinDelta = Math.round(11 + Math.min(8, recentSetsCount * 0.22)); // ~14-18g protein
    adaptiveCarbDelta = Math.round(15 + Math.min(10, recentSetsCount * 0.3)); // ~19-25g carbs
    adaptiveFatDelta = Math.round(2 + Math.min(2, recentSetsCount * 0.06)); // ~2-3g fat
  } else {
    // 5+ workouts or > 36 sets (Heavy Volume / High Demand)
    demandTier = 'High Demand';
    demandBadge = 'High Output';
    statusTitle = 'High-Volume Performance Fueling';
    phaseDescription = `Calibrated to your heavy actual training output (${recentSetsCount} sets, ${recentMinutes}m of mechanical tension). Accelerating systemic recovery, replenishing depleted glycogen, and mitigating catabolism.`;
    const extraSets = Math.max(0, recentSetsCount - 36);
    adaptiveCalorieDelta = Math.round(200 + Math.min(100, extraSets * 2.5)); // ~210-300 kcal
    adaptiveProteinDelta = Math.round(18 + Math.min(10, extraSets * 0.25)); // ~20-28g protein
    adaptiveCarbDelta = Math.round(26 + Math.min(16, extraSets * 0.4)); // ~28-42g carbs
    adaptiveFatDelta = Math.round(4 + Math.min(2, extraSets * 0.06)); // ~4-6g fat
  }

  // Self-reported fatigue / strain recovery cushion
  let fatigueCalorieDelta = 0;
  let fatigueProteinDelta = 0;
  let fatigueCarbDelta = 0;
  if (hasHighFatigue && recentWorkoutsCount > 0) {
    fatigueCalorieDelta = 35;
    fatigueProteinDelta = 4;
    fatigueCarbDelta = 4;
    phaseDescription += ' Includes anti-fatigue & tissue repair buffer based on your logged check-in feedback.';
  }

  // Lifetime consistency adaptation (denser muscular mass with training longevity)
  let consistencyCalorieDelta = 0;
  let consistencyProteinDelta = 0;
  if (totalWorkoutsCount >= 24) {
    consistencyCalorieDelta = 35;
    consistencyProteinDelta = 4;
  } else if (totalWorkoutsCount >= 12) {
    consistencyCalorieDelta = 20;
    consistencyProteinDelta = 2;
  }

  const totalCalorieDelta = adaptiveCalorieDelta + fatigueCalorieDelta + consistencyCalorieDelta;
  const totalProteinDelta = adaptiveProteinDelta + fatigueProteinDelta + consistencyProteinDelta;
  const totalCarbDelta = adaptiveCarbDelta + fatigueCarbDelta;
  const totalFatDelta = adaptiveFatDelta;

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
      demandTier,
      demandBadge,
      statusTitle,
      phaseName: statusTitle,
      phaseDescription,
      adaptiveCalorieDelta,
      adaptiveProteinDelta,
      adaptiveCarbDelta,
      adaptiveFatDelta,
      fatigueCalorieDelta,
      fatigueProteinDelta,
      consistencyCalorieDelta,
      totalCalorieDelta,
      totalProteinDelta,
      totalCarbDelta,
      totalFatDelta,
      recentWorkoutsCount,
      recentSetsCount,
      recentRepsCount,
      recentHoldSeconds,
      recentMinutes,
      totalWorkoutsCount,
      hasHighFatigue,
      summary: `${demandTier} · ${recentWorkoutsCount} sessions (${recentSetsCount} sets) (+${totalCalorieDelta} kcal, +${totalProteinDelta}g protein)`,
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
