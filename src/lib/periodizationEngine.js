/**
 * Periodization & Predicted Progress Engine for WASHEK 12-Week Programs
 *
 * Implements scientific 3-phase macrocycle periodization:
 * - Mesocycle 1 (Weeks 1-4): Foundation, Work Capacity & Biomechanical Proficiency
 * - Mesocycle 2 (Weeks 5-8): Intensification, Progressive Overload & Mechanical Tension
 * - Mesocycle 3 (Weeks 9-12): Peak Strength, Neuromuscular Recruitment & Benchmark Testing
 *
 * Dynamic Adaptation:
 * As the user logs workouts and checks in with Coach Kael, future weeks
 * dynamically recalibrate their predicted progression curves based on actual
 * performance, RPE, fatigue, and athlete feedback.
 */

import { sanitizeMicrocycleExclusions } from './programExclusions.js';

function parseRepRange(repStr) {
  const str = String(repStr || '').trim();
  const match = str.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (match) {
    return {
      min: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
      isRange: true,
      unit: '',
    };
  }

  const singleNumber = str.match(/^(\d+)\s*(s|sec|seconds|reps)?$/i);
  if (singleNumber) {
    return {
      min: parseInt(singleNumber[1], 10),
      max: parseInt(singleNumber[1], 10),
      isRange: false,
      unit: singleNumber[2] || '',
    };
  }

  return { min: null, max: null, isRange: false, raw: str };
}

function formatRepRange(min, max, unit = '') {
  if (min === max) {
    return `${min}${unit ? (unit.startsWith('s') ? 's' : '') : ''}`;
  }
  return `${min}-${max}${unit ? (unit.startsWith('s') ? 's' : '') : ''}`;
}

export function progressRepsForPhase(baseReps, phase, overload = 'baseline') {
  const parsed = parseRepRange(baseReps);
  if (parsed.min === null) return baseReps;

  // Timed holds (e.g. planks, hangs: 30s -> 35s -> 40s)
  if (parsed.unit && parsed.unit.toLowerCase().startsWith('s')) {
    if (phase === 2) {
      return overload === 'phase2_peak' ? `${parsed.min + 10}s` : `${parsed.min + 5}s`;
    }
    if (phase === 3) {
      return overload === 'taper_pr' ? `Max Hold` : `${parsed.min + 15}s`;
    }
    return `${parsed.min}s`;
  }

  // Rep ranges for strength / hypertrophy (e.g. 8-10)
  if (parsed.isRange) {
    if (phase === 2) {
      const newMin = Math.max(4, parsed.min - 2);
      const newMax = Math.max(newMin + 2, parsed.max - 2);
      return formatRepRange(newMin, newMax);
    }
    if (phase === 3) {
      if (overload === 'taper_pr') {
        return 'PR Test / Max Reps';
      }
      const newMin = Math.max(3, parsed.min - 4);
      const newMax = Math.max(newMin + 2, parsed.max - 4);
      return formatRepRange(newMin, newMax);
    }
    return formatRepRange(parsed.min, parsed.max);
  }

  // Single number reps (e.g. 8 reps -> 6-8 in phase 2 -> 3-5 in phase 3)
  if (phase === 2) return `${Math.max(4, parsed.min - 1)}`;
  if (phase === 3) {
    if (overload === 'taper_pr') return 'PR Test / Max';
    return `${Math.max(3, parsed.min - 2)}`;
  }
  return `${parsed.min}`;
}

export const PHASE_METADATA = [
  {
    mesoIndex: 0,
    name: 'Foundation & Capacity',
    focus: 'Build movement mechanics, tendon tolerance, work capacity, and baseline volume.',
  },
  {
    mesoIndex: 1,
    name: 'Intensification & Overload',
    focus: 'Drive progressive overload, higher mechanical tension, and explosive force production.',
  },
  {
    mesoIndex: 2,
    name: 'Peak Mastery & PRs',
    focus: 'Maximal motor unit recruitment, peak performance expression, and benchmark PR testing.',
  },
];

export const WEEK_CONFIGS = [
  {
    weekNumber: 1,
    mesoIndex: 0,
    phase: 1,
    weekType: 'Foundation',
    overload: 'baseline',
    predicted_focus: 'Movement Baseline: Establish movement mechanics, cadence & base capacity.',
    target_rir: '2-3 RIR',
    volume_delta: 'Baseline (100%)',
  },
  {
    weekNumber: 2,
    mesoIndex: 0,
    phase: 1,
    weekType: 'Accumulation',
    overload: 'volume',
    predicted_focus: 'Volume Accumulation: +1 set on primary lifts (~+20% work capacity) with crisp execution.',
    target_rir: '2-3 RIR',
    volume_delta: '+20% volume',
  },
  {
    weekNumber: 3,
    mesoIndex: 0,
    phase: 1,
    weekType: 'Intensification',
    overload: 'intensity',
    predicted_focus: 'Phase 1 Intensification: Target +1-2 reps per set, driving towards 1-2 RIR.',
    target_rir: '1-2 RIR',
    volume_delta: 'High volume density',
  },
  {
    weekNumber: 4,
    mesoIndex: 0,
    phase: 1,
    weekType: 'Deload',
    overload: 'recovery',
    predicted_focus: 'Active Deload: -40% volume reduction to dissipate systemic fatigue and trigger supercompensation.',
    target_rir: '3-4 RIR (Recovery)',
    volume_delta: '-40% volume',
  },
  {
    weekNumber: 5,
    mesoIndex: 1,
    phase: 2,
    weekType: 'Accumulation',
    overload: 'phase2_base',
    predicted_focus: 'Mesocycle 2 Kickoff: Heavier mechanical tension, strict 3s eccentric tempo, or next progression tier.',
    target_rir: '2 RIR',
    volume_delta: 'Heavy tension threshold',
  },
  {
    weekNumber: 6,
    mesoIndex: 1,
    phase: 2,
    weekType: 'Accumulation',
    overload: 'phase2_volume',
    predicted_focus: 'Volume Overload: Expand sets under heavier loading bracket (+15% volume threshold).',
    target_rir: '1-2 RIR',
    volume_delta: '+15% Phase 2 volume',
  },
  {
    weekNumber: 7,
    mesoIndex: 1,
    phase: 2,
    weekType: 'Intensification',
    overload: 'phase2_peak',
    predicted_focus: 'Phase 2 Peak: Maximum controlled loading, pushing upper threshold before recovery.',
    target_rir: '1 RIR',
    volume_delta: 'Peak density',
  },
  {
    weekNumber: 8,
    mesoIndex: 1,
    phase: 2,
    weekType: 'Deload',
    overload: 'recovery',
    predicted_focus: 'Mid-Cycle Deload: Connective tissue restoration and CNS recovery.',
    target_rir: '3-4 RIR',
    volume_delta: '-40% volume',
  },
  {
    weekNumber: 9,
    mesoIndex: 2,
    phase: 3,
    weekType: 'Intensification',
    overload: 'phase3_base',
    predicted_focus: 'Mesocycle 3 Peak Power: Explosive concentric speed, lower rep brackets, maximal motor recruitment.',
    target_rir: '1-2 RIR',
    volume_delta: 'High neural intensity',
  },
  {
    weekNumber: 10,
    mesoIndex: 2,
    phase: 3,
    weekType: 'Peak',
    overload: 'phase3_overload',
    predicted_focus: 'Neural Overload: Heavy compound strength with full 90-120s recovery intervals.',
    target_rir: '0-1 RIR',
    volume_delta: 'Maximal compound load',
  },
  {
    weekNumber: 11,
    mesoIndex: 2,
    phase: 3,
    weekType: 'Peak',
    overload: 'phase3_climax',
    predicted_focus: 'Cycle Climax: Final high-intensity overload session testing near-maximal capacity.',
    target_rir: '0-1 RIR',
    volume_delta: 'Peak capacity',
  },
  {
    weekNumber: 12,
    mesoIndex: 2,
    phase: 3,
    weekType: 'Taper',
    overload: 'taper_pr',
    predicted_focus: 'Taper & PR Testing: Low volume taper and official benchmark personal record (PR) testing.',
    target_rir: 'Max Effort / PR Test',
    volume_delta: 'Low volume (PR test)',
  },
];

/**
 * Calculates progressive overload and predicted progress target for an exercise
 */
function calculateExerciseProgression({
  exercise,
  exIndex,
  weekConfig,
  trainingType = 'calisthenics',
  trajectory = 'steady',
}) {
  const baseSets = Math.max(1, Number(exercise.sets) || 3);
  const baseReps = String(exercise.reps || '10');
  const baseRest = Math.max(30, Number(exercise.rest_seconds) || 60);
  const isCompound = exIndex < 2;

  const { overload, phase, target_rir, volume_delta } = weekConfig;

  let targetSets = baseSets;
  let targetReps = baseReps;
  let targetRest = baseRest;
  let predictedProgress = '';
  let periodizationNote = '';

  const isCalisthenics = trainingType === 'calisthenics' || trainingType === 'weighted_calisthenics';
  const isWeights = trainingType === 'weights';

  switch (overload) {
    case 'baseline':
      targetSets = baseSets;
      targetReps = baseReps;
      targetRest = baseRest;
      predictedProgress = 'Movement baseline: establish clean tempo and technical lockout';
      periodizationNote = 'Establish crisp movement cadence and joint alignment.';
      break;

    case 'volume':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = baseReps;
      targetRest = baseRest;
      predictedProgress = isCompound
        ? 'Projected +1 set volume (+25% work capacity)'
        : 'Projected technical perfection across all sets';
      periodizationNote = 'Volume accumulation: +1 set on primary lifts with crisp execution.';
      break;

    case 'intensity':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = baseReps;
      targetRest = baseRest + 15;
      predictedProgress = isWeights
        ? 'Projected +2.5-5 lbs load increase or +1 rep per set (1-2 RIR)'
        : 'Projected +1-2 reps per set with full range of motion (1-2 RIR)';
      periodizationNote = 'Phase 1 peak: drive intensity while maintaining clean form.';
      break;

    case 'recovery':
      targetSets = Math.max(2, baseSets - 1);
      targetReps = baseReps;
      targetRest = baseRest;
      predictedProgress = 'Deload target: -40% volume to supercompensate for next phase';
      periodizationNote = 'Active deload: reduced volume clears systemic fatigue and primes muscle recovery.';
      break;

    case 'phase2_base':
      targetSets = baseSets;
      targetReps = progressRepsForPhase(baseReps, 2, overload);
      targetRest = baseRest + 15;
      predictedProgress = isCalisthenics
        ? 'Phase 2: Stricter 3-0-1-0 eccentric tempo or elevated progression leverage'
        : 'Phase 2: Heavier resistance threshold (~+5-8% load) with strict control';
      periodizationNote = 'Phase 2 base: heavier resistance threshold and focused mechanical tension.';
      break;

    case 'phase2_volume':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = progressRepsForPhase(baseReps, 2, overload);
      targetRest = baseRest + 15;
      predictedProgress = 'Projected +15% tonnage under stricter Phase 2 tension';
      periodizationNote = 'Volume overload: control a 3-second eccentric tempo on every repetition.';
      break;

    case 'phase2_peak':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = progressRepsForPhase(baseReps, 2, overload);
      targetRest = baseRest + 30;
      predictedProgress = 'Phase 2 peak intensity: 1 rep in reserve, top mechanical tension';
      periodizationNote = 'Phase 2 peak: maximum controlled loading, leaving 1-2 reps in reserve.';
      break;

    case 'phase3_base':
      targetSets = baseSets;
      targetReps = progressRepsForPhase(baseReps, 3, overload);
      targetRest = baseRest + 30;
      predictedProgress = isCalisthenics
        ? 'Phase 3: Explosive concentric power / advanced skill tier'
        : 'Phase 3: Heavy power recruitment (85%+ 1RM equivalent)';
      periodizationNote = 'Phase 3 power: explosive intent on the concentric phase with heavier resistance.';
      break;

    case 'phase3_overload':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = progressRepsForPhase(baseReps, 3, overload);
      targetRest = baseRest + 30;
      predictedProgress = 'Projected top-end strength capacity with full recovery';
      periodizationNote = 'Peak capacity: heavy compound work with full recovery between sets.';
      break;

    case 'phase3_climax':
      targetSets = baseSets;
      targetReps = progressRepsForPhase(baseReps, 3, overload);
      targetRest = baseRest + 45;
      predictedProgress = 'Cycle climax: Near-maximal threshold before taper';
      periodizationNote = 'Cycle climax: express accumulated adaptations across all key movements.';
      break;

    case 'taper_pr':
      targetSets = Math.max(2, baseSets - 1);
      targetReps = progressRepsForPhase(baseReps, 3, overload);
      targetRest = baseRest + 30;
      predictedProgress = 'Benchmark PR testing: Establish all-time personal records!';
      periodizationNote = 'Taper & test: lower volume, test benchmark personal records, and celebrate gains!';
      break;

    default:
      break;
  }

  // If Kael identified an accelerated or recovery trajectory from actual workouts:
  if (trajectory === 'accelerated') {
    predictedProgress = `🎯 Kael Accelerated Target: ${predictedProgress}`;
  } else if (trajectory === 'recovering') {
    predictedProgress = `🛡️ Kael Protective Target: Regulated volume for joint integrity`;
  }

  const combinedNotes = [exercise.notes, periodizationNote]
    .filter(Boolean)
    .join(' • ');

  return {
    ...exercise,
    sets: targetSets,
    reps: targetReps,
    rest_seconds: targetRest,
    notes: combinedNotes,
    predicted_progress: predictedProgress,
    predicted_metrics: {
      target_rir,
      volume_delta,
      progression_type: overload,
      phase,
    },
    activation_cue: exercise.activation_cue || 'Brace core and maintain optimal alignment.',
  };
}

/**
 * Builds a single microcycle for a given week configuration from the baseline Week 1.
 */
export function buildSingleWeekMicrocycle(baseWeek1, config, options = {}) {
  if (!baseWeek1 || !Array.isArray(baseWeek1.days) || baseWeek1.days.length === 0) {
    throw new Error('Valid Week 1 microcycle is required to generate the week progression.');
  }

  const { weekNumber, mesoIndex, weekType, overload, predicted_focus, target_rir, volume_delta } = config;
  const trainingType = options.trainingType || 'calisthenics';
  const trajectory = options.trajectory || 'steady';

  if (weekNumber === 1) {
    const week1Days = baseWeek1.days.map((day) => ({
      ...day,
      exercises: (day.exercises || []).map((ex, exIdx) =>
        calculateExerciseProgression({
          exercise: ex,
          exIndex: exIdx,
          weekConfig: config,
          trainingType,
          trajectory,
        })
      ),
    }));

    return {
      ...baseWeek1,
      week_number: 1,
      mesocycle_index: 0,
      week_type: 'Foundation',
      predicted_focus,
      target_rir,
      volume_delta,
      days: week1Days,
    };
  }

  // Build periodized days for weeks 2 through 12
  const periodizedDays = baseWeek1.days.map((day) => {
    let workoutType = day.workout_type || 'Strength & Conditioning';

    if (overload === 'recovery') {
      workoutType = `${workoutType} (Deload & Recovery)`;
    } else if (overload === 'phase3_climax' || overload === 'phase3_overload') {
      workoutType = `${workoutType} (Peak Intensity)`;
    } else if (overload === 'taper_pr') {
      workoutType = `${workoutType} (Benchmark & Taper)`;
    }

    const periodizedExercises = (day.exercises || []).map((ex, exIndex) =>
      calculateExerciseProgression({
        exercise: ex,
        exIndex,
        weekConfig: config,
        trainingType,
        trajectory,
      })
    );

    return {
      ...day,
      workout_type: workoutType,
      exercises: periodizedExercises,
    };
  });

  return sanitizeMicrocycleExclusions({
    ...baseWeek1,
    week_number: weekNumber,
    mesocycle_index: mesoIndex,
    week_type: weekType,
    predicted_focus,
    target_rir,
    volume_delta,
    days: periodizedDays,
  }, options);
}

/**
 * Builds all 12 microcycles from an initial Week 1 template with realistic predicted progression.
 */
export function build12WeekMicrocycles(baseWeek1, options = {}) {
  if (!baseWeek1 || !Array.isArray(baseWeek1.days) || baseWeek1.days.length === 0) {
    throw new Error('Valid Week 1 microcycle is required to generate the 12-week program.');
  }

  return WEEK_CONFIGS.map((config) =>
    buildSingleWeekMicrocycle(baseWeek1, config, options)
  );
}

/**
 * Generates an evidence-based, scientifically accurate Week 1 baseline template
 * tailored to training type, fitness level, and primary goals.
 * Ensures the program always builds successfully with 100% biomechanical accuracy
 * even if external AI models experience temporary latency or spike outages.
 */
export function buildScientificBaselineWeekOne(options = {}) {
  const trainingType = options.trainingType || 'calisthenics';
  const level = options.level || 'intermediate';
  const isBeginner = level === 'beginner';
  const isAdvanced = level === 'advanced';

  let baseWeek;

  if (trainingType === 'weights') {
    baseWeek = {
      week_number: 1,
      mesocycle_index: 0,
      week_type: 'Foundation',
      predicted_focus: 'Movement Baseline: Establish movement mechanics, cadence & base capacity.',
      target_rir: '2-3 RIR',
      volume_delta: 'Baseline (100%)',
      days: [
        {
          day_name: 'Day 1 - Upper Push Hypertrophy',
          workout_type: 'Upper Body Push',
          exercises: [
            {
              name: 'Barbell Bench Press',
              sets: isBeginner ? 3 : 4,
              reps: isBeginner ? '8-10' : '6-8',
              rest_seconds: 120,
              notes: 'Retract scapulae into bench, lower bar with 3s eccentric to mid-chest, drive up with authority.',
              activation_cue: 'Pack lats and maintain unbroken leg drive.',
            },
            {
              name: 'Incline Dumbbell Press',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Set bench at 30 degrees. Focus on clavicular chest contraction at the apex.',
              activation_cue: 'Keep elbows tucked at 45-degree angle.',
            },
            {
              name: 'Standing Overhead Barbell Press',
              sets: 3,
              reps: '6-8',
              rest_seconds: 120,
              notes: 'Squeeze glutes and brace core. Press directly in vertical bar path overhead.',
              activation_cue: 'Lock ribcage down to prevent lumbar hyperextension.',
            },
            {
              name: 'Dumbbell Lateral Raises',
              sets: 3,
              reps: '12-15',
              rest_seconds: 60,
              notes: 'Lead with elbows, slight forward lean in scapular plane.',
              activation_cue: 'Depress traps and isolate medial deltoids.',
            },
            {
              name: 'Triceps Cable Rope Pushdowns',
              sets: 3,
              reps: '10-12',
              rest_seconds: 60,
              notes: 'Spread rope handles at lockout for maximal lateral head recruitment.',
              activation_cue: 'Pin elbows firmly against ribcage.',
            },
          ],
        },
        {
          day_name: 'Day 2 - Upper Pull & Scapular Stability',
          workout_type: 'Upper Body Pull',
          exercises: [
            {
              name: 'Barbell Bent-Over Row',
              sets: isBeginner ? 3 : 4,
              reps: '8-10',
              rest_seconds: 120,
              notes: 'Hinge at hips to 45 degrees, pull bar to upper navel driving elbows back.',
              activation_cue: 'Initiate pull through scapular retraction.',
            },
            {
              name: 'Neutral-Grip Lat Pulldown',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Drive elbows down to waist, achieve full lat stretch at apex.',
              activation_cue: 'Depress shoulder blades before bending elbows.',
            },
            {
              name: 'Chest-Supported Dumbbell Rear Delt Fly',
              sets: 3,
              reps: '12-15',
              rest_seconds: 60,
              notes: 'Prone on 30-degree incline, sweep dumbbells out wide in arc.',
              activation_cue: 'Squeeze posterior delts without shrugging neck.',
            },
            {
              name: 'Standing Incline Dumbbell Bicep Curl',
              sets: 3,
              reps: '10-12',
              rest_seconds: 60,
              notes: 'Supinate wrists at top for peak bicep contraction.',
              activation_cue: 'Keep upper arms strictly perpendicular to floor.',
            },
            {
              name: 'Rope Face Pulls with External Rotation',
              sets: 3,
              reps: '15-20',
              rest_seconds: 60,
              notes: 'Pull to eye level, rotating hands backward to target rotator cuff.',
              activation_cue: 'Activate lower traps and rhomboids.',
            },
          ],
        },
        {
          day_name: 'Day 3 - Lower Body & Posterior Chain',
          workout_type: 'Lower Body Strength',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: isBeginner ? 3 : 4,
              reps: isBeginner ? '8-10' : '6-8',
              rest_seconds: 150,
              notes: 'Descend to parallel with upright torso, drive through mid-foot.',
              activation_cue: 'Screw feet into floor and spread the knees.',
            },
            {
              name: 'Romanian Deadlift (RDL)',
              sets: 3,
              reps: '8-10',
              rest_seconds: 120,
              notes: 'Hinge back pushing hips to rear wall until deep hamstring stretch is felt.',
              activation_cue: 'Keep bar tight against shins and lats engaged.',
            },
            {
              name: 'Bulgarian Split Squats',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Rear foot elevated on bench, drop back knee straight down with control.',
              activation_cue: 'Load front heel and glute continuously.',
            },
            {
              name: 'Standing Calf Raises',
              sets: 4,
              reps: '12-15',
              rest_seconds: 60,
              notes: '2-second pause in full stretch, explosive drive to toes.',
              activation_cue: 'Push straight through big toe ball of foot.',
            },
          ],
        },
        {
          day_name: 'Day 4 - Full Body Hypertrophy & Core',
          workout_type: 'Full Body Power & Core',
          exercises: [
            {
              name: 'Dumbbell Arnold Press',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Rotate from palms facing chest to palms facing forward at lockout.',
              activation_cue: 'Maintain neutral spine throughout press.',
            },
            {
              name: 'Incline Dumbbell Chest Fly',
              sets: 3,
              reps: '10-12',
              rest_seconds: 75,
              notes: 'Deep pectoral stretch with slight elbow bend, hug tree at apex.',
              activation_cue: 'Focus on chest squeeze, not hand collision.',
            },
            {
              name: 'Seated Cable Row (Close-Grip V-Bar)',
              sets: 3,
              reps: '10-12',
              rest_seconds: 75,
              notes: 'Keep torso upright, pull handle to belly button.',
              activation_cue: 'Banish shoulder elevation; pin lats down.',
            },
            {
              name: 'Hanging Leg / Knee Raises',
              sets: 3,
              reps: '12-15',
              rest_seconds: 60,
              notes: 'Roll pelvis upward toward ribs rather than swinging hips.',
              activation_cue: 'Posterior pelvic tilt with hollow abdominal brace.',
            },
          ],
        },
      ],
    };
  } else if (trainingType === 'weighted_calisthenics') {
    baseWeek = {
      week_number: 1,
      mesocycle_index: 0,
      week_type: 'Foundation',
      predicted_focus: 'Movement Baseline: Establish movement mechanics, cadence & base capacity.',
      target_rir: '2-3 RIR',
      volume_delta: 'Baseline (100%)',
      days: [
        {
          day_name: 'Day 1 - Weighted Push Strength',
          workout_type: 'Weighted Push & Scapular Control',
          exercises: [
            {
              name: 'Weighted Parallel Bar Dips',
              sets: 4,
              reps: isBeginner ? '6-8' : '5-6',
              rest_seconds: 150,
              notes: 'Slight forward lean, lower to 90 degrees elbow flexion, drive up to locked elbows.',
              activation_cue: 'Depress scapulae actively and lock core into hollow body.',
            },
            {
              name: 'Weighted Push-ups (Plate on Back)',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Chest touches floor every rep, full protraction at top.',
              activation_cue: 'Push ground away to engage serratus anterior.',
            },
            {
              name: 'Elevated Pike Push-ups',
              sets: 3,
              reps: '6-8',
              rest_seconds: 90,
              notes: 'Feet on box, head travels forward of hands in tripod path.',
              activation_cue: 'Active shoulder elevation at top lockout.',
            },
            {
              name: 'Hanging Strict Knee/Toes to Bar',
              sets: 3,
              reps: '8-10',
              rest_seconds: 60,
              notes: 'Dead stop hang between reps with zero momentum swing.',
              activation_cue: 'Posterior pelvic tilt; compress lower abs.',
            },
          ],
        },
        {
          day_name: 'Day 2 - Weighted Pull Strength',
          workout_type: 'Weighted Pull & Lat Activation',
          exercises: [
            {
              name: 'Weighted Strict Pull-ups',
              sets: 4,
              reps: isBeginner ? '5-6' : '4-5',
              rest_seconds: 150,
              notes: 'Full dead hang to chin clearly cleared over bar. Zero kipping.',
              activation_cue: 'Drive elbows down into back pockets.',
            },
            {
              name: 'Neutral-Grip Weighted Chin-ups',
              sets: 3,
              reps: '6-8',
              rest_seconds: 120,
              notes: 'Focus on eccentric control for 3 seconds on the descent.',
              activation_cue: 'Full bicep and lat engagement at top apex.',
            },
            {
              name: 'Weighted Inverted Horizontal Rows',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Heels on box or floor, pull rings/bar to lower sternum.',
              activation_cue: 'Pinch shoulder blades hard at peak squeeze.',
            },
            {
              name: 'Active Scapular Pull-up Shrugs',
              sets: 3,
              reps: '10-12',
              rest_seconds: 60,
              notes: 'Keep arms locked straight, elevate and depress solely via scapulae.',
              activation_cue: 'Isolate lower and middle trapezius recruitment.',
            },
          ],
        },
        {
          day_name: 'Day 3 - Lower Body & Core Power',
          workout_type: 'Leg Strength & Posterior Chain',
          exercises: [
            {
              name: 'Barbell / Kettlebell Goblet Squats',
              sets: 4,
              reps: '8-10',
              rest_seconds: 120,
              notes: 'Deep squat with upright torso, knees tracking over toes.',
              activation_cue: 'Brace abdominal wall against weight.',
            },
            {
              name: 'Bulgarian Split Squats',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Controlled descent to parallel, drive through forward heel.',
              activation_cue: 'Stabilize pelvic hips to prevent knee caving.',
            },
            {
              name: 'Nordic Hamstring Curl Negatives',
              sets: 3,
              reps: '5-6',
              rest_seconds: 120,
              notes: 'Slow 4-second controlled forward fall, catch with hands and push back up.',
              activation_cue: 'Fire glutes and hamstrings continuously.',
            },
            {
              name: 'Dragon Flag Negatives / Tucked Hold',
              sets: 3,
              reps: '5-6',
              rest_seconds: 90,
              notes: 'Pivot on upper shoulders, lower rigid straight torso with control.',
              activation_cue: 'Total body tension from glutes to abdominals.',
            },
          ],
        },
        {
          day_name: 'Day 4 - Skill Integration & Secondary Volume',
          workout_type: 'Skill & Joint Resilience',
          exercises: [
            {
              name: 'Chest-to-Wall Handstand Hold',
              sets: 4,
              reps: '30s',
              rest_seconds: 90,
              notes: 'Nose and toes touch wall, push floor away actively.',
              activation_cue: 'Posterior pelvic tilt, elevate shoulders to ears.',
            },
            {
              name: 'Ring Dips (Turnout at Lockout)',
              sets: 3,
              reps: '6-8',
              rest_seconds: 90,
              notes: 'Turn rings out 45 degrees at top for serratus and chest activation.',
              activation_cue: 'Keep rings tucked close against torso.',
            },
            {
              name: 'L-Sit on Parallel Bars or Floor',
              sets: 3,
              reps: '15-20s',
              rest_seconds: 60,
              notes: 'Lock knees, point toes forward, depress shoulders.',
              activation_cue: 'Fire hip flexors and quad lockouts.',
            },
          ],
        },
      ],
    };
  } else if (trainingType === 'hybrid') {
    baseWeek = {
      week_number: 1,
      mesocycle_index: 0,
      week_type: 'Foundation',
      predicted_focus: 'Movement Baseline: Establish movement mechanics, cadence & base capacity.',
      target_rir: '2-3 RIR',
      volume_delta: 'Baseline (100%)',
      days: [
        {
          day_name: 'Day 1 - Calisthenics Skill + Upper Push',
          workout_type: 'Skill & Upper Push Strength',
          exercises: [
            {
              name: 'Wall-Assisted Handstand Balance',
              sets: 4,
              reps: '30s',
              rest_seconds: 90,
              notes: 'Skill practice while CNS is fresh. Focus on fingertip grip and active shoulders.',
              activation_cue: 'Claw floor with fingertips to control balance.',
            },
            {
              name: 'Parallel Bar Dips',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Controlled descent, drive through palms to complete lockout.',
              activation_cue: 'Depress shoulders and brace core.',
            },
            {
              name: 'Incline Dumbbell Bench Press',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Hybrid hypertrophy overload for upper pectorals.',
              activation_cue: 'Squeeze chest at top without losing scapular pinch.',
            },
            {
              name: 'Standing Dumbbell Lateral Raise',
              sets: 3,
              reps: '12-15',
              rest_seconds: 60,
              notes: 'Raise arms in 30-degree scapular plane to eye level.',
              activation_cue: 'Lower traps anchored down, lead with elbows.',
            },
          ],
        },
        {
          day_name: 'Day 2 - Calisthenics Skill + Upper Pull',
          workout_type: 'Skill & Upper Pull Strength',
          exercises: [
            {
              name: 'Strict Bodyweight / Weighted Pull-ups',
              sets: 4,
              reps: '6-8',
              rest_seconds: 120,
              notes: 'Master the vertical pull baseline. Dead hang to chin over bar.',
              activation_cue: 'Scapular pull first, then drive elbows down.',
            },
            {
              name: 'Barbell Bent-Over Row',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Hypertrophy volume for mid-back and lat thickness.',
              activation_cue: 'Maintain flat spine and pull toward hip crease.',
            },
            {
              name: 'Inverted Bodyweight Row on Rings/Bar',
              sets: 3,
              reps: '10-12',
              rest_seconds: 75,
              notes: 'Elevate feet as needed to match 2-3 RIR target.',
              activation_cue: 'Retract scapulae fully at top.',
            },
            {
              name: 'Incline Dumbbell Bicep Curls',
              sets: 3,
              reps: '10-12',
              rest_seconds: 60,
              notes: 'Deep bicep stretch with palms facing ceiling.',
              activation_cue: 'Full stretch at bottom, squeeze apex.',
            },
          ],
        },
        {
          day_name: 'Day 3 - Lower Body Strength & Explosiveness',
          workout_type: 'Leg Power & Posterior Chain',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: 4,
              reps: '6-8',
              rest_seconds: 150,
              notes: 'Core lower body strength foundation.',
              activation_cue: 'Screw feet into floor, knees track outward.',
            },
            {
              name: 'Romanian Deadlift (RDL)',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Posterior chain recruitment and hamstring resilience.',
              activation_cue: 'Hinge hips backwards, flat neutral back.',
            },
            {
              name: 'Jumping Split Squats or Bulgarian Split Squats',
              sets: 3,
              reps: '8-10',
              rest_seconds: 75,
              notes: 'Unilateral leg strength balance.',
              activation_cue: 'Drive through lead heel.',
            },
            {
              name: 'Hanging Knee-to-Chest Raises',
              sets: 3,
              reps: '12-15',
              rest_seconds: 60,
              notes: 'Abdominal compression and hip flexor endurance.',
              activation_cue: 'Tuck pelvis under at top.',
            },
          ],
        },
        {
          day_name: 'Day 4 - Full Body Conditioning & Core',
          workout_type: 'Conditioning & Core Capacity',
          exercises: [
            {
              name: 'Ring / Floor Push-ups',
              sets: 3,
              reps: '12-15',
              rest_seconds: 60,
              notes: 'High work capacity volume with strict form.',
              activation_cue: 'Maintain plank posture without sagging.',
            },
            {
              name: 'Dumbbell Overhead Press',
              sets: 3,
              reps: '8-10',
              rest_seconds: 75,
              notes: 'Vertical push overload.',
              activation_cue: 'Lock ribcage down.',
            },
            {
              name: 'Hollow Body Hold',
              sets: 3,
              reps: '30s',
              rest_seconds: 60,
              notes: 'Foundational gymnastics core tension.',
              activation_cue: 'Press lower back flush against the ground.',
            },
          ],
        },
      ],
    };
  } else {
    // Default: Pure Calisthenics
    baseWeek = {
    week_number: 1,
    mesocycle_index: 0,
    week_type: 'Foundation',
    predicted_focus: 'Movement Baseline: Establish movement mechanics, cadence & base capacity.',
    target_rir: '2-3 RIR',
    volume_delta: 'Baseline (100%)',
    days: [
      {
        day_name: 'Day 1 - Upper Push & Core Focus',
        workout_type: 'Upper Body Push',
        exercises: [
          {
            name: isBeginner ? 'Incline / Floor Push-ups' : isAdvanced ? 'Ring Dips / Archer Push-ups' : 'Standard Push-ups',
            sets: 4,
            reps: isBeginner ? '8-10' : '10-12',
            rest_seconds: 90,
            notes: 'Lower with 3s eccentric tempo, chest touches ground, lock elbows and protract scapulae at top.',
            activation_cue: 'Squeeze glutes and tuck pelvis into hollow body posture.',
          },
          {
            name: isBeginner ? 'Bench Dips' : 'Parallel Bar Dips',
            sets: 3,
            reps: isBeginner ? '8-10' : '6-8',
            rest_seconds: 90,
            notes: 'Descend under control to 90 degrees elbow bend, drive through palms.',
            activation_cue: 'Depress shoulder blades; do not allow shoulders to shrug.',
          },
          {
            name: 'Pike Push-ups (Elevated Feet optional)',
            sets: 3,
            reps: '6-8',
            rest_seconds: 90,
            notes: 'Head travels forward forming a triangle with hands, press straight overhead.',
            activation_cue: 'Elevate scapulae at top lockout.',
          },
          {
            name: 'Hollow Body Hold',
            sets: 3,
            reps: '30s',
            rest_seconds: 60,
            notes: 'Lower back pressed flat against ground, arms and legs extended.',
            activation_cue: 'Posterior pelvic tilt with full abdominal brace.',
          },
        ],
      },
      {
        day_name: 'Day 2 - Lower Body & Core Endurance',
        workout_type: 'Lower Body & Mobility',
        exercises: [
          {
            name: 'Bodyweight Deep Squats',
            sets: 4,
            reps: '15-20',
            rest_seconds: 60,
            notes: 'Descend below parallel with upright torso, knees track with toes.',
            activation_cue: 'Push ground apart through mid-foot and heels.',
          },
          {
            name: 'Bulgarian Split Squats',
            sets: 3,
            reps: '10-12',
            rest_seconds: 75,
            notes: 'Rear foot elevated on bench or couch, lower back knee gently to floor.',
            activation_cue: 'Keep chest lifted and load front glute.',
          },
          {
            name: 'Walking Lunges',
            sets: 3,
            reps: '16-20 total',
            rest_seconds: 60,
            notes: 'Continuous controlled steps maintaining hip stability.',
            activation_cue: 'Square hips forward throughout.',
          },
          {
            name: 'Single-Leg Calf Raises',
            sets: 3,
            reps: '12-15',
            rest_seconds: 45,
            notes: 'Full stretch at bottom, pause 1s at highest point on toes.',
            activation_cue: 'Push straight through big toe joint.',
          },
        ],
      },
      {
        day_name: 'Day 3 - Upper Pull & Scapular Control',
        workout_type: 'Upper Body Pull',
        exercises: [
          {
            name: isBeginner ? 'Inverted Australian Pull-ups' : 'Strict Pull-ups',
            sets: 4,
            reps: isBeginner ? '8-10' : '6-8',
            rest_seconds: 120,
            notes: 'Full dead hang, pull chest to bar with no kipping or momentum.',
            activation_cue: 'Initiate pull by retracting and depressing scapulae.',
          },
          {
            name: 'Neutral-Grip Chin-ups (or Horizontal Rows)',
            sets: 3,
            reps: '6-8',
            rest_seconds: 90,
            notes: 'Drive elbows down and back, 3s controlled lowering phase.',
            activation_cue: 'Keep lats packed and ribcage steady.',
          },
          {
            name: 'Inverted Bodyweight Rows (Under Table or Bar)',
            sets: 3,
            reps: '10-12',
            rest_seconds: 75,
            notes: 'Straight body plank, pull chest up to bar.',
            activation_cue: 'Squeeze shoulder blades together at apex.',
          },
          {
            name: 'Dead Hang Active / Passive Holds',
            sets: 3,
            reps: '30-45s',
            rest_seconds: 60,
            notes: 'Alternate 10s active (shoulders pulled down) and 10s passive hang.',
            activation_cue: 'Grip bar tightly with full palm coverage.',
          },
        ],
      },
      {
        day_name: 'Day 4 - Skill Progression & Full Body Integration',
        workout_type: 'Skill & Core Mastery',
        exercises: [
          {
            name: 'Chest-to-Wall Handstand Hold',
            sets: 4,
            reps: '25-35s',
            rest_seconds: 90,
            notes: 'Focus on straight alignment without arching lower back.',
            activation_cue: 'Push floor away vigorously; elevate scapulae.',
          },
          {
            name: 'L-Sit / Tucked L-Sit Hold (Floor or Parallelettes)',
            sets: 3,
            reps: '15-20s',
            rest_seconds: 60,
            notes: 'Depress shoulders downward to elevate hips off floor, knees tucked or straight.',
            activation_cue: 'Lock triceps and engage lower abdominals.',
          },
          {
            name: 'Arch Body (Superman) Hold',
            sets: 3,
            reps: '30s',
            rest_seconds: 60,
            notes: 'Lie prone, lift chest and thighs simultaneously using posterior chain.',
            activation_cue: 'Squeeze glutes, lower back, and hamstrings.',
          },
        ],
      },
    ],
  };
  }

  return sanitizeMicrocycleExclusions(baseWeek, options);
}

/**
 * Applies post-workout check-in adjustments across the remainder of the 12-week program.
 * Dynamically recalibrates future weeks using athlete performance & Kael feedback.
 */
export function applyPostWorkoutAdaptation({
  currentProgram,
  currentWeek,
  dayName,
  adjustedExercises,
  checkinSummary,
  coachResponse = '',
  trajectory = 'steady',
  projectedOutlook = '',
}) {
  if (!currentProgram?.microcycles || !Array.isArray(currentProgram.microcycles)) {
    return currentProgram;
  }

  const trainingType = currentProgram?.training_type || 'calisthenics';

  const updatedMicrocycles = currentProgram.microcycles.map((microcycle) => {
    const weekNum = Number(microcycle.week_number);

    // Past weeks and current week are preserved
    if (weekNum <= currentWeek) {
      return microcycle;
    }

    const weekConfig =
      WEEK_CONFIGS.find((c) => c.weekNumber === weekNum) || {
        weekNumber: weekNum,
        mesoIndex: Math.floor((weekNum - 1) / 4),
        phase: Math.min(3, Math.floor((weekNum - 1) / 4) + 1),
        weekType: 'Progression',
        overload: 'volume',
        target_rir: '1-2 RIR',
        volume_delta: '+15%',
      };

    // Recalibrate matching day across all future weeks using adjusted exercises as new baseline
    const updatedDays = (microcycle.days || []).map((day) => {
      if (day.day_name !== dayName) {
        return day;
      }

      const recalibratedExercises = adjustedExercises.map((adjEx, exIdx) => {
        const progressed = calculateExerciseProgression({
          exercise: adjEx,
          exIndex: exIdx,
          weekConfig,
          trainingType,
          trajectory,
        });

        return {
          ...progressed,
          // Explicit indicator showing Kael's recalibration
          recalibrated_by_kael: true,
          predicted_progress:
            trajectory === 'accelerated'
              ? `🎯 Kael Accelerated Target: ${progressed.predicted_progress || progressed.reps}`
              : trajectory === 'recovering'
              ? `🛡️ Kael Protective Recalibration: ${progressed.predicted_progress || 'Joint & tendon longevity'}`
              : `🎯 Kael Calibrated Target: ${progressed.predicted_progress || progressed.reps}`,
        };
      });

      return {
        ...day,
        recalibrated_by_kael: true,
        kael_recalibration_note: checkinSummary,
        exercises: recalibratedExercises,
      };
    });

    return {
      ...microcycle,
      days: updatedDays,
    };
  });

  const currentHistory = Array.isArray(currentProgram.adaptation_history)
    ? currentProgram.adaptation_history
    : [];

  const newHistoryEntry = {
    date: new Date().toISOString(),
    week_number: currentWeek,
    day_name: dayName,
    summary: checkinSummary,
    coach_response: coachResponse,
    trajectory,
    projected_outlook: projectedOutlook,
    type: 'post_workout_checkin',
  };

  const lastAdaptedInfo = {
    date: new Date().toISOString(),
    week_number: currentWeek,
    day_name: dayName,
    summary: checkinSummary,
    coach_response: coachResponse,
    trajectory,
    projected_outlook: projectedOutlook,
  };

  return {
    ...currentProgram,
    microcycles: updatedMicrocycles,
    last_adapted_by_kael: lastAdaptedInfo,
    adaptation_history: [newHistoryEntry, ...currentHistory],
  };
}
