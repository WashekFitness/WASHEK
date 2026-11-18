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

import {
  sanitizeMicrocycleExclusions,
  hasLearnSkillsGoal,
} from './programExclusions.js';
import {
  applyWorkoutDayNames,
  extractWeekdayFromDayName,
  parseOnboardingPreferences,
  resolveWorkoutDays,
  stripLeadingDayPrefix,
} from './workoutSchedule.js';

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

export function bumpRepString(repStr, repDelta = 1, timeDelta = 5) {
  const str = String(repStr || '').trim();
  if (!str) return repStr;

  const totalSuffixMatch = str.match(/^(.*?)(\s+(?:total|each(?:\s+(?:leg|arm|side))?|per\s+(?:leg|arm|side)))$/i);
  if (totalSuffixMatch) {
    const coreBumped = bumpRepString(totalSuffixMatch[1].trim(), repDelta, timeDelta);
    return `${coreBumped}${totalSuffixMatch[2]}`;
  }

  const parsed = parseRepRange(str);
  if (parsed.min === null) return repStr;

  if (parsed.unit && parsed.unit.toLowerCase().startsWith('s')) {
    const step = timeDelta;
    const newMin = Math.max(10, Math.min(120, parsed.min + step));
    const newMax = Math.max(newMin, Math.min(120, parsed.max + step));
    return formatRepRange(newMin, newMax, 's');
  }

  // Range like "15-20s"
  const timedRangeMatch = str.match(/^(\d+)\s*[-–]\s*(\d+)\s*(s|sec|seconds)$/i);
  if (timedRangeMatch) {
    const tMin = Math.max(10, Math.min(120, parseInt(timedRangeMatch[1], 10) + timeDelta));
    const tMax = Math.max(tMin + 5, Math.min(120, parseInt(timedRangeMatch[2], 10) + timeDelta));
    return `${tMin}-${tMax}s`;
  }

  if (parsed.isRange) {
    const newMin = Math.max(3, Math.min(25, parsed.min + repDelta));
    const newMax = Math.max(newMin + 1, Math.min(30, parsed.max + repDelta));
    return formatRepRange(newMin, newMax);
  }

  return `${Math.max(3, Math.min(30, parsed.min + repDelta))}`;
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
  wantsSkills = true,
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
      predictedProgress = 'Movement baseline: establish clean tempo, 1-2 RIR, and manage fatigue';
      periodizationNote = 'Baseline: 1-2 RIR, manage fatigue, and establish clean cadence.';
      break;

    case 'volume':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = isCompound ? baseReps : bumpRepString(baseReps, 1, 5);
      targetRest = baseRest;
      predictedProgress = isCompound
        ? 'Projected +1 set volume (+25% work capacity, 1-2 RIR)'
        : 'Projected +1 rep progressive overload across accessory sets';
      periodizationNote = 'Volume accumulation: +1 set on primary lifts, +1 rep on accessories (1-2 RIR).';
      break;

    case 'intensity':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = bumpRepString(baseReps, isCompound ? 1 : 2, isCompound ? 5 : 10);
      targetRest = baseRest + 15;
      predictedProgress = isWeights
        ? 'Projected +2.5-5 lbs load or +1-2 reps per set (1-2 RIR)'
        : 'Projected +1-2 reps per set with full range of motion (1-2 RIR)';
      periodizationNote = 'Phase 1 peak: +1-2 reps overload pushing toward 1-2 RIR.';
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
      targetReps = isCalisthenics && !isCompound
        ? bumpRepString(baseReps, 2, 10)
        : progressRepsForPhase(baseReps, 2, overload);
      targetRest = baseRest + 15;
      predictedProgress = isCalisthenics
        ? 'Phase 2: Stricter 3-0-1-0 eccentric tempo or elevated progression leverage (1-2 RIR)'
        : 'Phase 2: Heavier resistance threshold (~+5-8% load) with strict control (1-2 RIR)';
      periodizationNote = 'Phase 2 base: heavier resistance threshold, 1-2 RIR, focused mechanical tension.';
      break;

    case 'phase2_volume':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = isCompound
        ? progressRepsForPhase(baseReps, 2, overload)
        : bumpRepString(progressRepsForPhase(baseReps, 2, overload), 1, 5);
      targetRest = baseRest + 15;
      predictedProgress = 'Projected +15% tonnage under stricter Phase 2 tension';
      periodizationNote = 'Volume overload: 3s eccentric, +1 set compounds / +1 rep accessories (1-2 RIR).';
      break;

    case 'phase2_peak':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = bumpRepString(progressRepsForPhase(baseReps, 2, overload), 1, 5);
      targetRest = baseRest + 30;
      predictedProgress = 'Phase 2 peak intensity: +1 rep at heavier Phase 2 loading (1 RIR)';
      periodizationNote = 'Phase 2 peak: maximum controlled loading pushing upper rep threshold.';
      break;

    case 'phase3_base':
      targetSets = baseSets;
      targetReps = isCalisthenics && !isCompound
        ? bumpRepString(baseReps, 3, 15)
        : progressRepsForPhase(baseReps, 3, overload);
      targetRest = baseRest + 30;
      predictedProgress = isCalisthenics
        ? wantsSkills
          ? 'Phase 3: Explosive concentric power / advanced skill tier (1-2 RIR)'
          : 'Phase 3: Explosive concentric power / advanced bodyweight progression (1-2 RIR)'
        : 'Phase 3: Heavy power recruitment (85%+ 1RM equivalent, 1-2 RIR)';
      periodizationNote = 'Phase 3 power: explosive intent on concentric phase, 1-2 RIR, full rest recovery.';
      break;

    case 'phase3_overload':
      targetSets = isCompound ? baseSets + 1 : baseSets;
      targetReps = isCompound
        ? progressRepsForPhase(baseReps, 3, overload)
        : bumpRepString(progressRepsForPhase(baseReps, 3, overload), 1, 5);
      targetRest = baseRest + 30;
      predictedProgress = 'Projected top-end strength capacity (+1 set compounds / +1 rep accessories)';
      periodizationNote = 'Peak capacity: heavy compound work with full 120-180s recovery between sets.';
      break;

    case 'phase3_climax':
      targetSets = baseSets;
      targetReps = bumpRepString(progressRepsForPhase(baseReps, 3, overload), 1, 5);
      targetRest = baseRest + 45;
      predictedProgress = 'Cycle climax: Near-maximal threshold (+1 rep peak expression) before taper';
      periodizationNote = 'Cycle climax: express accumulated adaptations across all key movements with fatigue managed.';
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
  const wantsSkills = hasLearnSkillsGoal({ trainingType, ...options });

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
          wantsSkills,
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
    const exercises = day.exercises || [];
    const isRest =
      day.is_rest_day ||
      exercises.length === 0 ||
      String(day.workout_type || '').toLowerCase().includes('rest') ||
      String(day.day_name || '').toLowerCase().includes('rest');

    if (isRest) {
      return {
        ...day,
        is_rest_day: true,
        workout_type: day.workout_type || 'Rest & Active Recovery',
        exercises: [],
      };
    }

    let workoutType = day.workout_type || 'Strength & Conditioning';

    if (overload === 'recovery') {
      workoutType = `${workoutType} (Deload & Recovery)`;
    } else if (overload === 'phase3_climax' || overload === 'phase3_overload') {
      workoutType = `${workoutType} (Peak Intensity)`;
    } else if (overload === 'taper_pr') {
      workoutType = `${workoutType} (Benchmark & Taper)`;
    }

    const periodizedExercises = exercises.map((ex, exIndex) =>
      calculateExerciseProgression({
        exercise: ex,
        exIndex,
        weekConfig: config,
        trainingType,
        trajectory,
        wantsSkills,
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
function tailorDaysToScheduleAndGoals(days, options = {}, prefs = {}) {
  const workoutDays = resolveWorkoutDays({ ...options, existingDays: days });
  const targetCount = workoutDays.length;
  const trainingType = options.trainingType || 'calisthenics';
  const wantsSkills = hasLearnSkillsGoal({ trainingType, ...options });
  const goalsText = [
    ...(Array.isArray(options.fitnessGoals) ? options.fitnessGoals : []),
    ...(Array.isArray(options.weightGoals) ? options.weightGoals : []),
    options.goalDescription || '',
  ]
    .join(' ')
    .toLowerCase();

  const isStrengthFocused = /get_stronger|gain_strength|strength|power/.test(goalsText);
  const isFatLossOrEndurance = /lose_weight|improve_endurance|endurance|fat\s*loss|cut|lean/.test(
    goalsText
  );
  const ageNum = Number(options.age);
  const isMasters = Number.isFinite(ageNum) && ageNum >= 45;

  // Adjust rep/rest cadence cleanly to reflect goals, age, and session time
  let tunedDays = days.map((day) => ({
    ...day,
    exercises: (day.exercises || []).map((ex) => {
      let updated = { ...ex };
      if (isFatLossOrEndurance && !String(ex.reps || '').includes('s')) {
        updated.rest_seconds = Math.max(45, Math.round((Number(ex.rest_seconds) || 75) * 0.8));
      } else if (isStrengthFocused && !String(ex.reps || '').includes('s') && (day.exercises || []).indexOf(ex) < 2) {
        updated.rest_seconds = Math.max(Number(ex.rest_seconds) || 90, 120);
      }
      if (isMasters) {
        updated.notes = `${updated.notes || ''} Focus on smooth joint control (2-3 RIR).`.trim();
      }
      return updated;
    }),
  }));

  // Adapt split count (1 to 7 exact days)
  if (targetCount === 1) {
    const pick = (dIdx, exIdx = 0) => tunedDays[dIdx]?.exercises?.[exIdx];
    const combo = [pick(0, 0), pick(1, 0), pick(2, 0), pick(3, 0)].filter(Boolean);
    tunedDays = [
      {
        day_name: `${workoutDays[0]} - Full Body Strength & Conditioning`,
        workout_type: 'Full Body Total Stimulus',
        exercises: combo.length >= 3 ? combo : tunedDays[0]?.exercises || [],
      },
    ];
  } else if (targetCount === 2) {
    const upperCombo = [
      tunedDays[0]?.exercises?.[0],
      tunedDays[1]?.exercises?.[0],
      tunedDays[0]?.exercises?.[1],
      tunedDays[1]?.exercises?.[1],
    ].filter(Boolean);
    const lowerCoreCombo = [
      tunedDays[2]?.exercises?.[0],
      tunedDays[2]?.exercises?.[1],
      tunedDays[3]?.exercises?.[0],
      tunedDays[3]?.exercises?.[tunedDays[3]?.exercises?.length - 1],
    ].filter(Boolean);
    tunedDays = [
      {
        day_name: `${workoutDays[0]} - Upper Body Strength & Control`,
        workout_type: 'Upper Body Compound Focus',
        exercises: upperCombo.length >= 3 ? upperCombo : tunedDays[0]?.exercises || [],
      },
      {
        day_name: `${workoutDays[1]} - Lower Body, Conditioning & Core`,
        workout_type: 'Lower Body & Core',
        exercises: lowerCoreCombo.length >= 3 ? lowerCoreCombo : tunedDays[2]?.exercises || [],
      },
    ];
  } else if (targetCount === 3) {
    // Drop the 4th accessory day so user gets crisp 3-day Push / Pull / Legs (or Full Upper)
    tunedDays = tunedDays.slice(0, 3);
  } else if (targetCount >= 5) {
    const focusAreas = prefs.focusAreas || {};
    const focusLabel = focusAreas.chest
      ? 'Chest & Push Hypertrophy'
      : focusAreas.back
        ? 'Back & Pulling Width'
        : focusAreas.arms
          ? 'Arms & Upper Conditioning'
          : focusAreas.shoulders
            ? 'Shoulders & Overhead Stability'
            : wantsSkills
              ? 'Skill Mastery & Core Control'
              : isFatLossOrEndurance
                ? 'Metabolic Conditioning & Core'
                : 'Weak-Point Hypertrophy & Core';

    const extraDay5 = {
      day_name: `${workoutDays[4]} - ${focusLabel}`,
      workout_type: focusLabel,
      exercises:
        trainingType === 'weights'
          ? [
              {
                name: focusAreas.back ? 'Chest-Supported Dumbbell Row' : 'Incline Dumbbell Press',
                sets: 3,
                reps: '10-12',
                rest_seconds: 90,
                notes: 'Targeted hypertrophy focus with 3s eccentric control, 1-2 RIR.',
                activation_cue: 'Keep target muscle under tension throughout full ROM.',
              },
              {
                name: 'Pull-ups (or Neutral-Grip Lat Pulldown)',
                sets: 3,
                reps: '8-12',
                rest_seconds: 90,
                notes: 'Controlled full extension to chest squeeze.',
                activation_cue: 'Depress shoulder blades first.',
              },
              {
                name: 'Standing Dumbbell Lateral Raises',
                sets: 3,
                reps: '12-15',
                rest_seconds: 60,
                notes: 'Lead with elbows in scapular plane.',
                activation_cue: 'Keep traps relaxed and neck long.',
              },
              {
                name: 'Hanging Knee / Leg Raises',
                sets: 3,
                reps: '12-15',
                rest_seconds: 60,
                notes: 'Curl pelvis smoothly without swinging.',
                activation_cue: 'Brace core tightly on every rep.',
              },
            ]
          : [
              {
                name: focusAreas.back ? 'Inverted Horizontal Rows' : 'Decline / Tempo Push-ups',
                sets: 3,
                reps: '10-15',
                rest_seconds: 75,
                notes: 'Strict bodyweight hypertrophy tempo, 1-2 RIR.',
                activation_cue: 'Maintain rigid hollow-body plank.',
              },
              {
                name: 'Neutral-Grip Pull-ups (or Australian Rows)',
                sets: 3,
                reps: '8-10',
                rest_seconds: 90,
                notes: 'Full dead hang to chest clear.',
                activation_cue: 'Drive elbows straight toward hips.',
              },
              {
                name: 'Pike Push-ups',
                sets: 3,
                reps: '8-10',
                rest_seconds: 75,
                notes: 'Controlled overhead shoulder pressing.',
                activation_cue: 'Push shoulders away from ears at top.',
              },
              {
                name: 'Hollow Body Hold',
                sets: 3,
                reps: '30-40s',
                rest_seconds: 60,
                notes: 'Press lower back flat into the floor.',
                activation_cue: 'Posterior pelvic tilt with ribs tucked.',
              },
            ],
    };

    tunedDays = [...tunedDays, extraDay5];

    if (targetCount >= 6) {
      tunedDays.push({
        day_name: `${workoutDays[5]} - Posterior Chain, Mobility & Core`,
        workout_type: 'Lower Posterior & Core',
        exercises: tunedDays[2]?.exercises?.length
          ? tunedDays[2].exercises.map((e) => ({ ...e }))
          : extraDay5.exercises.map((e) => ({ ...e })),
      });
    }

    if (targetCount >= 7) {
      tunedDays.push({
        day_name: `${workoutDays[6]} - Core Endurance & Joint Conditioning`,
        workout_type: 'Core & Active Conditioning',
        exercises: [
          {
            name: 'Hollow Body Hold',
            sets: 3,
            reps: '30-40s',
            rest_seconds: 60,
            notes: 'Strict core tension with lower back flush on floor.',
            activation_cue: 'Brace abs and squeeze glutes.',
          },
          {
            name: 'Arch Body (Superman) Hold',
            sets: 3,
            reps: '30s',
            rest_seconds: 60,
            notes: 'Strengthen spinal erectors, glutes, and upper back.',
            activation_cue: 'Lift chest and thighs smoothly together.',
          },
          {
            name: 'Tempo Bodyweight Deep Squats',
            sets: 3,
            reps: '12-15',
            rest_seconds: 60,
            notes: 'Promote hip/ankle mobility and blood flow recovery.',
            activation_cue: 'Control 3s descent with upright chest.',
          },
        ],
      });
    }
  }

  return applyWorkoutDayNames({ days: tunedDays }, workoutDays).days;
}

export function buildScientificBaselineWeekOne(options = {}) {
  const trainingType = options.trainingType || 'calisthenics';
  const level = options.level || options.fitnessLevel || 'intermediate';
  const isBeginner = level === 'beginner';
  const isElite = level === 'elite';
  const isAdvanced = level === 'advanced' || isElite;
  const wantsSkills = hasLearnSkillsGoal({ trainingType, ...options });
  const prefs = parseOnboardingPreferences(options);

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
              notes: 'Retract scapulae into bench, 3s eccentric, leave 1-2 RIR to manage CNS fatigue and accelerate strength gains.',
              activation_cue: 'Pack lats and maintain unbroken leg drive.',
            },
            {
              name: 'Incline Dumbbell Press',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Set bench at 30 degrees. Focus on clavicular chest contraction at the apex (1-2 RIR).',
              activation_cue: 'Keep elbows tucked at 45-degree angle.',
            },
            {
              name: 'Standing Overhead Barbell Press',
              sets: 3,
              reps: '6-8',
              rest_seconds: 120,
              notes: 'Squeeze glutes and brace core. Press vertical bar path overhead, 1-2 RIR to protect shoulder stabilizers.',
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
              notes: 'Hinge hips to 45 degrees, pull bar to navel, 1-2 RIR for high stimulus-to-fatigue ratio.',
              activation_cue: 'Initiate pull through scapular retraction.',
            },
            {
              name: 'Neutral-Grip Lat Pulldown',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Drive elbows down to waist, achieve full lat stretch at apex (1-2 RIR).',
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
              notes: 'Descend to parallel with upright torso, 1-2 RIR to protect lower back and maximize quad recruitment.',
              activation_cue: 'Screw feet into floor and spread the knees.',
            },
            {
              name: 'Romanian Deadlift (RDL)',
              sets: 3,
              reps: '8-10',
              rest_seconds: 120,
              notes: 'Hinge hips back, flat spine, 1-2 RIR to manage spinal fatigue while loading hamstrings.',
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
              notes: 'Slight forward lean, lower to 90 degrees elbow flexion, 1-2 RIR to protect shoulders and maximize power.',
              activation_cue: 'Depress scapulae actively and lock core into hollow body.',
            },
            {
              name: 'Weighted Push-ups (Plate on Back)',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Chest touches floor every rep, full protraction at top (1-2 RIR).',
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
              notes: 'Full dead hang to chin clearly cleared over bar. 1-2 RIR to build raw strength without elbow fatigue.',
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
        wantsSkills
          ? {
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
            }
          : {
              day_name: 'Day 4 - Upper Hypertrophy & Core Strength',
              workout_type: 'Hypertrophy & Joint Resilience',
              exercises: [
                {
                  name: 'Ring Dips (Turnout at Lockout)',
                  sets: 4,
                  reps: '6-8',
                  rest_seconds: 90,
                  notes: 'Turn rings out at top for deep chest and triceps activation, 1-2 RIR.',
                  activation_cue: 'Keep rings tucked close against torso.',
                },
                {
                  name: 'Weighted / Decline Deficit Push-ups',
                  sets: 3,
                  reps: '8-12',
                  rest_seconds: 90,
                  notes: 'Control 3s lowering, drive explosively to full lockout, 1-2 RIR.',
                  activation_cue: 'Push ground away to engage serratus anterior.',
                },
                {
                  name: 'Feet-Elevated Inverted Bodyweight Rows',
                  sets: 3,
                  reps: '10-12',
                  rest_seconds: 75,
                  notes: 'Pull lower chest to bar or rings with strict body line.',
                  activation_cue: 'Pinch shoulder blades together at peak squeeze.',
                },
                {
                  name: 'Hollow Body Hold',
                  sets: 3,
                  reps: '30s',
                  rest_seconds: 60,
                  notes: 'Lower back pressed flat into floor with full abdominal tension.',
                  activation_cue: 'Tuck pelvis and lock ribs down.',
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
          day_name: wantsSkills
            ? 'Day 1 - Calisthenics Skill + Upper Push'
            : 'Day 1 - Bodyweight Push + Upper Hypertrophy',
          workout_type: wantsSkills
            ? 'Skill & Upper Push Strength'
            : 'Calisthenics & Weight Push Strength',
          exercises: [
            wantsSkills
              ? {
                  name: 'Wall-Assisted Handstand Balance',
                  sets: 4,
                  reps: '30s',
                  rest_seconds: 90,
                  notes: 'Skill practice first while CNS is fresh. Stop 2-3s before breakdown to manage fatigue.',
                  activation_cue: 'Claw floor with fingertips to control balance.',
                }
              : {
                  name: 'Decline / Deficit Strict Push-ups',
                  sets: 4,
                  reps: '10-12',
                  rest_seconds: 90,
                  notes: 'Controlled 3s lowering for upper chest hypertrophy, 1-2 RIR.',
                  activation_cue: 'Screw hands into the floor and squeeze glutes.',
                },
            {
              name: 'Parallel Bar Dips',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Controlled descent, drive through palms, leave 1-2 RIR to protect shoulder joints.',
              activation_cue: 'Depress shoulders and brace core.',
            },
            {
              name: 'Incline Dumbbell Bench Press',
              sets: 3,
              reps: '8-10',
              rest_seconds: 90,
              notes: 'Hybrid hypertrophy overload for upper pectorals (1-2 RIR).',
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
          day_name: wantsSkills
            ? 'Day 2 - Calisthenics Skill + Upper Pull'
            : 'Day 2 - Bodyweight Pull + Upper Back Hypertrophy',
          workout_type: wantsSkills
            ? 'Skill & Upper Pull Strength'
            : 'Calisthenics & Weight Pull Strength',
          exercises: [
            {
              name: 'Strict Bodyweight / Weighted Pull-ups',
              sets: 4,
              reps: '6-8',
              rest_seconds: 120,
              notes: 'Vertical pull baseline first. Dead hang to chin over bar, 1-2 RIR for clean power.',
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
            notes: 'Lower 3s eccentric, full lockout, leave 1-2 RIR to build clean muscle without burnout.',
            activation_cue: 'Squeeze glutes and tuck pelvis into hollow body posture.',
          },
          {
            name: isBeginner ? 'Bench Dips' : 'Parallel Bar Dips',
            sets: 3,
            reps: isBeginner ? '8-10' : '6-8',
            rest_seconds: 90,
            notes: 'Descend under control to 90 degrees, drive up, 1-2 RIR to manage sternum/shoulder fatigue.',
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
            notes: 'Full dead hang, pull chest to bar, 1-2 RIR to prevent tendon fatigue and accelerate pulling power.',
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
      wantsSkills
        ? {
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
          }
        : {
            day_name: 'Day 4 - Full Body Strength & Core Conditioning',
            workout_type: 'Full Body Hypertrophy & Core',
            exercises: [
              {
                name: isBeginner ? 'Incline Push-ups' : 'Close-Grip / Diamond Push-ups',
                sets: 4,
                reps: isBeginner ? '10-12' : '8-12',
                rest_seconds: 75,
                notes: 'Controlled 3s lowering, full tricep & chest lockout, leave 1-2 RIR.',
                activation_cue: 'Keep elbows tucked close to ribs and brace core.',
              },
              {
                name: isBeginner ? 'Australian Horizontal Pull-ups' : 'Neutral-Grip / Commando Pull-ups',
                sets: 3,
                reps: isBeginner ? '8-10' : '6-8',
                rest_seconds: 90,
                notes: 'Full range of motion with controlled lowering, 1-2 RIR.',
                activation_cue: 'Depress shoulder blades and pull elbows toward hips.',
              },
              {
                name: 'Single-Leg Glute Bridges / Hip Thrusts',
                sets: 3,
                reps: '12-15',
                rest_seconds: 60,
                notes: 'Pause 1s at top lockout with posterior pelvic tilt.',
                activation_cue: 'Drive through heel and squeeze glutes without lumbar arch.',
              },
              {
                name: 'Hanging Knee Raises (or Lying Leg Raises)',
                sets: 3,
                reps: '10-12',
                rest_seconds: 60,
                notes: 'Curl pelvis upward slowly without momentum swing.',
                activation_cue: 'Engage lower abs before lifting legs.',
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

  const adaptedDays = tailorDaysToScheduleAndGoals(baseWeek.days, options, prefs);
  const focusSummaryParts = [];
  if (options.timeframe) focusSummaryParts.push(`Timeline: ${options.timeframe}`);
  if (options.goalDescription) focusSummaryParts.push(options.goalDescription.slice(0, 80));

  const enrichedWeek = {
    ...baseWeek,
    predicted_focus:
      focusSummaryParts.length > 0
        ? `Week 1 Baseline (${level}): ${focusSummaryParts.join(' · ')}`
        : baseWeek.predicted_focus,
    days: adaptedDays,
  };

  return sanitizeMicrocycleExclusions(enrichedWeek, options);
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
  fitnessGoals = null,
  weightGoals = null,
  requirements = '',
  equipment = '',
  currentSkills = '',
  workoutDays = null,
  currentDayIndex = -1,
}) {
  if (!currentProgram?.microcycles || !Array.isArray(currentProgram.microcycles)) {
    return currentProgram;
  }

  const trainingType = currentProgram?.training_type || 'calisthenics';
  const wantsSkills = hasLearnSkillsGoal({
    trainingType,
    fitnessGoals,
    weightGoals,
    goalDescription: currentProgram?.goal,
    requirements,
  });

  const targetWeekday = extractWeekdayFromDayName(dayName || '');
  const targetSuffix = stripLeadingDayPrefix(dayName || '').toLowerCase();

  const updatedMicrocycles = currentProgram.microcycles.map((microcycle) => {
    const weekNum = Number(microcycle.week_number);

    // Past weeks are preserved untouched; in currentWeek, only upcoming same-split days are adapted
    if (weekNum < currentWeek) {
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

    // Recalibrate matching day across upcoming weeks (and any later identical-focus day in currentWeek)
    const updatedDays = (microcycle.days || []).map((day, idx) => {
      if (weekNum === currentWeek) {
        const isLaterSameSplit =
          currentDayIndex >= 0 &&
          idx > currentDayIndex &&
          targetSuffix &&
          stripLeadingDayPrefix(day.day_name).toLowerCase() === targetSuffix;
        if (!isLaterSameSplit) {
          return day;
        }
      } else {
        const dayMatches =
          day.day_name === dayName ||
          (targetWeekday && extractWeekdayFromDayName(day.day_name) === targetWeekday) ||
          (targetSuffix && stripLeadingDayPrefix(day.day_name).toLowerCase() === targetSuffix);

        if (!dayMatches) {
          return day;
        }
      }

      const recalibratedExercises = adjustedExercises.map((adjEx, exIdx) => {
        const progressed = calculateExerciseProgression({
          exercise: adjEx,
          exIndex: exIdx,
          weekConfig,
          trainingType,
          trajectory,
          wantsSkills,
        });

        return {
          ...progressed,
          recalibrated_by_kael: true,
          predicted_progress:
            trajectory === 'accelerated'
              ? `🎯 Kael Accelerated Target: ${progressed.predicted_progress || progressed.reps}`
              : trajectory === 'recovering'
              ? `🛡️ Kael Protective Recalibration: ${progressed.predicted_progress || 'Joint & tendon longevity'}`
              : `🎯 Kael Calibrated Target: ${progressed.predicted_progress || progressed.reps}`,
        };
      });

      const updatedDay = {
        ...day,
        recalibrated_by_kael: true,
        kael_recalibration_note: checkinSummary,
        exercises: recalibratedExercises,
      };

      const sanitized = sanitizeMicrocycleExclusions(
        { days: [updatedDay] },
        {
          trainingType,
          fitnessGoals,
          weightGoals,
          goalDescription: currentProgram?.goal,
          requirements,
          equipment,
          currentSkills,
          workoutDays: workoutDays || currentProgram?.macrocycle?.training_days,
          wantsSkills,
          skipDayRenaming: true,
        }
      );

      return sanitized?.days?.[0] || updatedDay;
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

function parseAchievedNumbers(rawAchieved) {
  if (rawAchieved === null || rawAchieved === undefined) return [];
  const str = String(rawAchieved).trim();
  if (!str) return [];
  const matches = str.match(/\d+/g);
  if (!matches) return [];
  return matches.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
}

/**
 * Evaluates actual completed sets & reps from a live workout session and computes
 * concrete harder/steady/easier exercise targets for the athlete's next session.
 */
export function evaluateLiveWorkoutPerformance({
  plannedExercises = [],
  completedExercises = [],
  elapsedSeconds = 0,
}) {
  const safePlanned = Array.isArray(plannedExercises) ? plannedExercises : [];
  const safeCompleted = Array.isArray(completedExercises) ? completedExercises : [];

  let totalPlannedSets = 0;
  let totalCompletedSets = 0;
  let outperformedCount = 0;
  let underperformedCount = 0;

  const adjustedExercises = safePlanned.map((ex, idx) => {
    const logged =
      safeCompleted[idx] ||
      safeCompleted.find((c) => String(c?.name || '').toLowerCase() === String(ex?.name || '').toLowerCase()) ||
      {};

    const plannedSets = Math.max(1, Number(ex?.sets) || 3);
    const setsCompleted = Math.max(0, Number(logged?.sets_completed ?? plannedSets));
    totalPlannedSets += plannedSets;
    totalCompletedSets += setsCompleted;

    const plannedRepMeta = parseRepRange(ex?.reps || '8-10');
    const achievedNums = parseAchievedNumbers(logged?.reps_achieved);
    const isCustomLoggedReps =
      logged?.reps_achieved !== undefined &&
      String(logged.reps_achieved).trim() !== '' &&
      String(logged.reps_achieved).trim() !== String(ex?.reps || '').trim();

    let exerciseStatus = 'steady';
    const nextEx = { ...ex };

    if (setsCompleted < plannedSets) {
      exerciseStatus = 'easier';
      underperformedCount++;
    } else if (isCustomLoggedReps && achievedNums.length > 0 && plannedRepMeta.min !== null) {
      const avgAchieved =
        achievedNums.reduce((sum, n) => sum + n, 0) / achievedNums.length;
      if (avgAchieved >= plannedRepMeta.max + 1) {
        exerciseStatus = 'harder';
        outperformedCount++;
      } else if (avgAchieved === plannedRepMeta.max && !plannedRepMeta.isRange) {
        exerciseStatus = 'harder';
        outperformedCount++;
      } else if (avgAchieved < plannedRepMeta.min) {
        exerciseStatus = 'easier';
        underperformedCount++;
      }
    }

    if (exerciseStatus === 'harder') {
      const currentMax = plannedRepMeta.max ?? 10;
      if (!plannedRepMeta.unit && currentMax >= 15 && plannedSets < 4) {
        nextEx.sets = plannedSets + 1;
        nextEx.reps = bumpRepString(ex?.reps, 1, 5);
      } else {
        nextEx.reps = bumpRepString(ex?.reps, 2, 10);
        nextEx.sets = plannedSets;
      }
      nextEx.notes = `${ex?.notes ? `${ex.notes} • ` : ''}Live adaptation: Increased target after exceeding reps cleanly.`;
    } else if (exerciseStatus === 'easier') {
      const missedMultipleSets = plannedSets - setsCompleted >= 2 || (plannedSets >= 3 && setsCompleted <= plannedSets - 1);
      if (missedMultipleSets && plannedSets > 2) {
        nextEx.sets = plannedSets - 1;
        nextEx.reps = bumpRepString(ex?.reps, -1, -5);
      } else {
        nextEx.sets = plannedSets;
        nextEx.reps = bumpRepString(ex?.reps, -1, -5);
      }
      nextEx.rest_seconds = Math.min(180, (Number(ex?.rest_seconds) || 75) + 15);
      nextEx.notes = `${ex?.notes ? `${ex.notes} • ` : ''}Live adaptation: Scaled target down slightly to rebuild clean reps with full recovery.`;
    } else {
      // Matched all prescribed sets cleanly -> apply steady progressive overload step
      nextEx.sets = plannedSets;
      nextEx.reps = bumpRepString(ex?.reps, 1, 5);
    }

    return {
      ...nextEx,
      _adaptationStatus: exerciseStatus,
    };
  });

  const completionRatio =
    totalPlannedSets > 0 ? totalCompletedSets / totalPlannedSets : 1;

  let trajectory = 'steady';
  let direction = 'steady';

  if (completionRatio < 0.85 || underperformedCount > outperformedCount) {
    trajectory = 'recovering';
    direction = 'easier';
  } else if (outperformedCount > underperformedCount) {
    trajectory = 'accelerating';
    direction = 'harder';
  }

  const durationMinutes = Math.round((Number(elapsedSeconds) || 0) / 60);
  const changes = adjustedExercises.map((nextEx, idx) => {
    const prev = safePlanned[idx] || {};
    return {
      name: nextEx.name,
      previous: `${prev.sets || nextEx.sets}×${prev.reps || nextEx.reps}`,
      next: `${nextEx.sets}×${nextEx.reps}`,
      status: nextEx._adaptationStatus,
    };
  });

  const cleanAdjustedExercises = adjustedExercises.map(({ _adaptationStatus, ...rest }) => rest);

  let summary = '';
  let coachResponse = '';
  let projectedOutlook = '';

  if (direction === 'harder') {
    summary = `Next session intensified (+reps/volume overload across ${outperformedCount} exceeded movement${outperformedCount === 1 ? '' : 's'}).`;
    coachResponse = 'You outperformed your prescribed numbers today — your next session is dialed up to push progressive overload.';
    projectedOutlook = 'Accelerating strength curve: increased target volume/reps locked into upcoming weeks.';
  } else if (direction === 'easier') {
    summary = `Next session scaled easier (-sets/-reps & +15s rest) after ${totalCompletedSets}/${totalPlannedSets} completed sets (${durationMinutes}m).`;
    coachResponse = 'Smart autoregulation: your next session is dialed back slightly so you hit crisp reps without grinding into fatigue.';
    projectedOutlook = 'Recovery-adjusted curve: rebuilding clean technical momentum before ramping load back up.';
  } else {
    summary = `All ${totalCompletedSets}/${totalPlannedSets} sets locked in cleanly — next session nudged +1 rep progressive overload.`;
    coachResponse = 'Consistent execution today. Your next session bumps targets slightly to guarantee steady week-to-week overload.';
    projectedOutlook = 'Steady progressive overload trajectory maintained across upcoming sessions.';
  }

  return {
    trajectory,
    direction,
    completionRatio,
    totalPlannedSets,
    totalCompletedSets,
    adjustedExercises: cleanAdjustedExercises,
    changes,
    summary,
    coachResponse,
    projectedOutlook,
  };
}

/**
 * Automatically adapts a Progress+ athlete's next session and remaining weeks
 * immediately when they finish a live workout, based on actual sets & reps performed.
 */
export function applyLivePerformanceAdaptation({
  currentProgram,
  currentWeek = 1,
  currentDayIndex = -1,
  dayName = '',
  plannedExercises = [],
  completedExercises = [],
  elapsedSeconds = 0,
  user = null,
}) {
  const evaluation = evaluateLiveWorkoutPerformance({
    plannedExercises,
    completedExercises,
    elapsedSeconds,
  });

  if (!currentProgram?.microcycles || !Array.isArray(currentProgram.microcycles)) {
    return {
      updatedProgram: currentProgram,
      evaluation,
      nextSessionPreview: [],
    };
  }

  const updatedProgram = applyPostWorkoutAdaptation({
    currentProgram,
    currentWeek,
    currentDayIndex,
    dayName,
    adjustedExercises: evaluation.adjustedExercises,
    checkinSummary: evaluation.summary,
    coachResponse: evaluation.coachResponse,
    trajectory: evaluation.trajectory,
    projectedOutlook: evaluation.projectedOutlook,
    fitnessGoals: user?.fitness_goals,
    weightGoals: user?.weight_goals,
    requirements: user?.training_requirements || '',
    equipment: user?.available_equipment || '',
    currentSkills: user?.current_skills || '',
    workoutDays: currentProgram?.macrocycle?.training_days || user?.training_days,
  });

  const targetWeekday = extractWeekdayFromDayName(dayName || '');
  const targetSuffix = stripLeadingDayPrefix(dayName || '').toLowerCase();
  const currentWeekCycle = updatedProgram.microcycles?.find(
    (m) => Number(m.week_number) === Number(currentWeek)
  );
  const laterSameSplitDay =
    currentDayIndex >= 0 && targetSuffix
      ? (currentWeekCycle?.days || []).find(
          (d, idx) =>
            idx > currentDayIndex &&
            stripLeadingDayPrefix(d.day_name).toLowerCase() === targetSuffix
        )
      : null;

  const nextWeekCycle = updatedProgram.microcycles?.find(
    (m) => Number(m.week_number) === Number(currentWeek) + 1
  );
  const nextWeekMatchingDay = nextWeekCycle?.days?.find(
    (d) =>
      d.day_name === dayName ||
      (targetWeekday && extractWeekdayFromDayName(d.day_name) === targetWeekday) ||
      (targetSuffix && stripLeadingDayPrefix(d.day_name).toLowerCase() === targetSuffix)
  );
  const nextDay = laterSameSplitDay || nextWeekMatchingDay;

  const nextSessionPreview = (nextDay?.exercises || evaluation.adjustedExercises).map((ex, idx) => {
    const prev = plannedExercises[idx] || {};
    return {
      name: ex.name,
      before: `${prev.sets || ex.sets}×${prev.reps || ex.reps}`,
      after: `${ex.sets}×${ex.reps}`,
    };
  });

  return {
    updatedProgram,
    evaluation,
    nextSessionDayName: nextDay?.day_name || dayName,
    nextSessionPreview,
  };
}
