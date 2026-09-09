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
export function calcNutritionGoals(user) {
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
   * Mifflin-St Jeor equation.
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
   * Conservative activity estimates.
   *
   * We deliberately do NOT use 1.55–1.60 as the default.
   * Those values can overestimate maintenance calories when a user
   * exercises but otherwise has a relatively normal daily activity level.
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

  /**
   * Goal adjustments are intentionally modest.
   *
   * Fat loss:
   *   ~15% deficit
   *
   * Muscle gain:
   *   ~5% surplus
   *
   * Strength/endurance:
   *   ~3% surplus
   *
   * Recomp/maintenance:
   *   maintenance
   *
   * Crucially, only ONE of these adjustments is ever applied.
   */
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

  /**
   * Prevent the calculation from producing an unusually low target.
   *
   * This is still only an estimate and is intentionally conservative.
   */
  const conservativeMinimum = Math.round(
    bmr * 1.20
  );

  calories = Math.max(
    calories,
    conservativeMinimum
  );

  /**
   * Protein:
   *
   * Uses body weight rather than inflating calories directly.
   * The target is intentionally kept in a reasonable training range.
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

  /**
   * Cap protein so very heavy users don't cause the macro calculation
   * to consume an unreasonable amount of the calorie target.
   */
  const protein = Math.round(
    Math.min(
      Math.max(weightLbs * proteinPerLb, 100),
      220
    )
  );

  const proteinCals = protein * 4;

  /**
   * Fat:
   * Keep fat around 25% of calories.
   */
  const fatPercentage =
    primaryGoal === 'lose'
      ? 0.25
      : 0.27;

  const fat = Math.round(
    (calories * fatPercentage) / 9
  );

  const fatCals = fat * 9;

  /**
   * Carbohydrates receive the remaining calories.
   */
  const remainingCalories = Math.max(
    calories - proteinCals - fatCals,
    0
  );

  const carbs = Math.round(
    remainingCalories / 4
  );

  return {
    calories,
    protein: Math.max(protein, 50),
    carbs: Math.max(carbs, 50),
    fat: Math.max(fat, 30),
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
