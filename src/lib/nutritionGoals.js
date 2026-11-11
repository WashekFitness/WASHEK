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
function resolveUserProfile(user) {
  let localData = {};
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('washek_user');
      if (stored) localData = JSON.parse(stored);
    }
  } catch (_e) {
    // Ignore storage parse errors
  }
  return { ...localData, ...(user || {}) };
}

/**
 * Get the user's weight in pounds.
 */
function getWeightLbs(user) {
  const merged = resolveUserProfile(user);
  const weightLbs = positiveNumber(merged?.weight_lbs);

  if (weightLbs > 0) {
    return weightLbs;
  }

  const weightKg = positiveNumber(merged?.weight_kg);

  if (weightKg > 0) {
    return weightKg / KG_PER_LB;
  }

  return 165;
}

/**
 * Get the user's height in centimeters.
 */
function getHeightCm(user) {
  const merged = resolveUserProfile(user);
  const heightCm = positiveNumber(merged?.height_cm);

  if (heightCm > 0) {
    return heightCm;
  }

  const heightInches = positiveNumber(merged?.height_inches);

  if (heightInches > 0) {
    return heightInches * CM_PER_INCH;
  }

  return 70 * CM_PER_INCH;
}

/**
 * Determine the user's primary nutrition goal.
 * Inspects all possible goal sources including arrays, strings, and custom goal text.
 */
function getPrimaryGoal(user) {
  const merged = resolveUserProfile(user);

  const rawGoals = [];
  if (Array.isArray(merged.fitness_goals)) rawGoals.push(...merged.fitness_goals);
  else if (typeof merged.fitness_goals === 'string') rawGoals.push(...merged.fitness_goals.split(','));

  if (Array.isArray(merged.weight_goals)) rawGoals.push(...merged.weight_goals);
  else if (typeof merged.weight_goals === 'string') rawGoals.push(...merged.weight_goals.split(','));

  if (merged.primary_goal) rawGoals.push(merged.primary_goal);
  if (merged.goal_description) rawGoals.push(merged.goal_description);
  if (merged.goal) rawGoals.push(merged.goal);
  if (merged.training_requirements) rawGoals.push(merged.training_requirements);

  const combinedStr = rawGoals.map((g) => String(g || '').toLowerCase()).join(' ');

  // 1. Fat Loss / Cutting
  if (
    combinedStr.includes('lose') ||
    combinedStr.includes('fat_loss') ||
    combinedStr.includes('weight_loss') ||
    combinedStr.includes('fat loss') ||
    combinedStr.includes('cut') ||
    combinedStr.includes('cutting') ||
    combinedStr.includes('shred') ||
    combinedStr.includes('lean out') ||
    combinedStr.includes('drop weight')
  ) {
    return 'lose';
  }

  // 2. Muscle Gain / Hypertrophy / Bulking
  if (
    combinedStr.includes('gain_muscle') ||
    combinedStr.includes('muscle_growth') ||
    combinedStr.includes('build_muscle') ||
    combinedStr.includes('gain muscle') ||
    combinedStr.includes('hypertrophy') ||
    combinedStr.includes('bulk') ||
    combinedStr.includes('bulking') ||
    combinedStr.includes('mass') ||
    combinedStr.includes('size')
  ) {
    return 'gain';
  }

  // 3. Body Recomposition
  if (
    combinedStr.includes('body_recomp') ||
    combinedStr.includes('recomp') ||
    combinedStr.includes('tone') ||
    combinedStr.includes('recomposition')
  ) {
    return 'recomp';
  }

  // 4. Strength & Power / Calisthenics Mastery
  if (
    combinedStr.includes('strength') ||
    combinedStr.includes('stronger') ||
    combinedStr.includes('power') ||
    combinedStr.includes('skill')
  ) {
    return 'strength';
  }

  // 5. Endurance & Conditioning / Hybrid
  if (
    combinedStr.includes('endurance') ||
    combinedStr.includes('stamina') ||
    combinedStr.includes('hybrid') ||
    combinedStr.includes('cardio') ||
    combinedStr.includes('running')
  ) {
    return 'endurance';
  }

  return 'maintenance';
}

/**
 * Estimate daily calorie and macronutrient needs based on the athlete's
 * real biometrics, training discipline, fitness level, and goals.
 */
export function calcNutritionGoals(user, options = {}) {
  const mergedUser = resolveUserProfile(user);
  const userKey = options?.userKey || mergedUser?.id || mergedUser?.uid || null;

  // Resolve active program and workout logs from options or synchronous cache
  const program = options?.program || getCachedActiveProgram(userKey);
  const workoutLogs = Array.isArray(options?.workoutLogs)
    ? options.workoutLogs
    : getCachedLogs(userKey);

  const rawWeek = options?.currentWeek != null
    ? options.currentWeek
    : (program?.current_week || 1);
  const currentWeek = Math.max(1, Math.min(12, Number(rawWeek) || 1));

  const weightLbs = getWeightLbs(mergedUser);
  const weightKg = weightLbs * KG_PER_LB;

  const heightCm = getHeightCm(mergedUser);

  const age = Math.min(
    Math.max(
      positiveNumber(mergedUser?.age, 25),
      14
    ),
    100
  );

  const gender = String(mergedUser?.gender || 'male').toLowerCase();

  const trainingType = String(
    mergedUser?.training_type || program?.training_type || 'calisthenics'
  ).toLowerCase();

  const fitnessLevel = String(
    mergedUser?.fitness_level || program?.fitness_level || 'intermediate'
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
   * Activity multiplier based on training discipline and fitness level.
   */
  let activityMultiplier = 1.48;

  if (trainingType === 'weights') {
    activityMultiplier = 1.55;
  } else if (trainingType === 'hybrid') {
    activityMultiplier = 1.65;
  } else if (trainingType === 'weighted_calisthenics') {
    activityMultiplier = 1.52;
  } else if (trainingType === 'calisthenics') {
    activityMultiplier = 1.48;
  }

  // Adjust for training volume capacity based on fitness level
  if (fitnessLevel === 'advanced') {
    activityMultiplier *= 1.05;
  } else if (fitnessLevel === 'elite') {
    activityMultiplier *= 1.10;
  } else if (fitnessLevel === 'beginner') {
    activityMultiplier *= 0.95;
  }

  const estimatedMaintenance = bmr * activityMultiplier;

  const primaryGoal = getPrimaryGoal(mergedUser);

  let goalMultiplier = 1.0;
  let proteinPerLb = 1.0;
  let fatPercentage = 0.26;

  switch (primaryGoal) {
    case 'lose':
      // 18% deficit - optimal fat loss rate while sparing athletic performance & muscle
      goalMultiplier = 0.82;
      // High protein (1.15g/lb) is scientifically proven to preserve lean mass in a deficit
      proteinPerLb = 1.15;
      fatPercentage = 0.25;
      break;

    case 'gain':
      // 12% surplus - optimal lean mass accrual with minimal fat gain
      goalMultiplier = 1.12;
      // 1.05g/lb fuels muscle protein synthesis and recovery
      proteinPerLb = 1.05;
      fatPercentage = 0.26;
      break;

    case 'recomp':
      // Mild 4% deficit with high protein enables body recomposition
      goalMultiplier = 0.96;
      proteinPerLb = 1.15;
      fatPercentage = 0.25;
      break;

    case 'strength':
      // Maintenance fueling for optimal neurological & muscular power output
      goalMultiplier = 1.00;
      proteinPerLb = 1.05;
      fatPercentage = 0.27;
      break;

    case 'endurance':
      // +5% surplus covers elevated aerobic glycogen depletion
      goalMultiplier = 1.05;
      proteinPerLb = 1.00;
      fatPercentage = 0.22; // lower fat, higher carbs
      break;

    case 'maintenance':
    default:
      goalMultiplier = 1.00;
      proteinPerLb = 1.00;
      fatPercentage = 0.26;
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
   * Personalized Protein calculation based on athlete weight and specific goal.
   */
  const protein = Math.round(
    Math.min(
      Math.max(weightLbs * proteinPerLb, 110),
      350
    )
  );

  const proteinCals = protein * 4;

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
