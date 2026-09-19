/**
 * Program Exclusions & Premier Exercise Selection
 *
 * Rules:
 * 1. Legs are mandatory by default across all training types.
 * 2. If the user explicitly typed anywhere to NOT train legs (e.g. "no legs",
 *    "skip legs", "upper body only", "don't train legs", etc.), NEVER include legs.
 * 3. Same strict exclusion applies to any other exercise or movement pattern
 *    the user typed to avoid (e.g. "no deadlifts", "avoid bench press").
 * 4. Only choose the best, biomechanically sound, premier exercises — zero stupid
 *    or dangerous gimmick exercises.
 */

export function hasUserExcludedLegs(text = '') {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  const patterns = [
    /\bno\s+legs?\b/,
    /\bskip\s+legs?\b/,
    /\b(?:don'?t|do\s+not|not)\s+(?:want|need|train|do|include)\s+legs?\b/,
    /\bnot?\s+train(?:ing)?\s+legs?\b/,
    /\bupper\s+body\s+only\b/,
    /\bno\s+lower\s+body\b/,
    /\bexclude\s+legs?\b/,
    /\bavoid\s+legs?\b/,
    /\bwithout\s+legs?\b/,
    /\bno\s+leg\s+days?\b/,
    /\bzero\s+legs?\b/,
    /\bno\s+squats?\s+or\s+legs?\b/,
    /\blegs?\s+(?:injured|broken|disabled)\b/,
    /\b(?:can'?t|cannot)\s+train\s+legs?\b/,
    /\bstop\s+training\s+legs?\b/,
    /\bprefer\s+no\s+legs?\b/,
    /\bonly\s+upper\b/,
    /\bjust\s+upper\b/,
  ];

  return patterns.some((p) => p.test(lower));
}

export function isLegExercise(exerciseName = '') {
  if (!exerciseName || typeof exerciseName !== 'string') return false;
  const lower = exerciseName.toLowerCase();

  const legKeywords = [
    'squat',
    'lunge',
    'split squat',
    'deadlift',
    'rdl',
    'leg press',
    'leg curl',
    'leg extension',
    'calf',
    'calves',
    'hamstring',
    'nordic',
    'hip thrust',
    'glute bridge',
    'step-up',
    'hack squat',
    'sissy squat',
    'adductor',
    'abductor',
    'quad',
    'seated calf',
    'standing calf',
  ];

  return legKeywords.some((kw) => lower.includes(kw));
}

export function detectUserExclusions(text = '') {
  if (!text || typeof text !== 'string') {
    return {
      noLegs: false,
      noDeadlifts: false,
      noBench: false,
      noSquats: false,
      noOverheadPress: false,
      noDips: false,
      noPullups: false,
    };
  }

  const lower = text.toLowerCase();

  return {
    noLegs: hasUserExcludedLegs(text),
    noDeadlifts:
      /\b(?:no|skip|avoid|don'?t\s+do|without)\s+deadlifts?\b/.test(lower) ||
      /\bback\s+pain.*(?:deadlift|no\s+deadlift)/.test(lower),
    noBench:
      /\b(?:no|skip|avoid|don'?t\s+do|without)\s+(?:barbell\s+)?bench(?:\s+press)?\b/.test(lower),
    noSquats:
      /\b(?:no|skip|avoid|don'?t\s+do|without)\s+squats?\b/.test(lower),
    noOverheadPress:
      /\b(?:no|skip|avoid|don'?t\s+do|without)\s+(?:overhead|shoulder|military)\s+press\b/.test(lower) ||
      /\bimpingement.*overhead/.test(lower),
    noDips:
      /\b(?:no|skip|avoid|don'?t\s+do|without)\s+dips?\b/.test(lower),
    noPullups:
      /\b(?:no|skip|avoid|don'?t\s+do|without)\s+pull[\s-]?ups?\b/.test(lower),
  };
}

export function isDangerousOrGimmickExercise(name = '') {
  if (!name || typeof name !== 'string') return false;
  const lower = name.toLowerCase();

  const dangerousKeywords = [
    'behind-the-neck',
    'behind the neck',
    'upright row',
    'bosu',
    'unstable surface',
    'kipping pull-up',
    'kipping dip',
    'circus',
    'smith machine behind',
  ];

  return dangerousKeywords.some((kw) => lower.includes(kw));
}

/**
 * Premier upper-body replacement exercises for when legs or restricted exercises
 * need to be replaced with the highest-yield, safest movements.
 */
export const PREMIER_UPPER_WEIGHTS = [
  {
    name: 'Incline Dumbbell Bench Press',
    sets: 3,
    reps: '8-10',
    rest_seconds: 90,
    notes: 'Set bench to 30 degrees. Control 3s eccentric and press to full pectoral contraction.',
    activation_cue: 'Keep elbows tucked at 45-degree angle.',
  },
  {
    name: 'Chest-Supported Dumbbell Row',
    sets: 3,
    reps: '8-10',
    rest_seconds: 90,
    notes: 'Prone on 30-degree incline. Drive elbows back without lumbar strain.',
    activation_cue: 'Initiate pull through scapular retraction.',
  },
  {
    name: 'Standing Dumbbell Lateral Raises',
    sets: 3,
    reps: '12-15',
    rest_seconds: 60,
    notes: 'Lead with elbows in scapular plane, pause briefly at parallel.',
    activation_cue: 'Depress traps and isolate medial deltoids.',
  },
  {
    name: 'Standing Incline Dumbbell Bicep Curl',
    sets: 3,
    reps: '10-12',
    rest_seconds: 60,
    notes: 'Deep stretch at bottom, supinate wrists at top for peak bicep contraction.',
    activation_cue: 'Keep upper arms strictly perpendicular to floor.',
  },
  {
    name: 'Triceps Cable Rope Pushdowns',
    sets: 3,
    reps: '10-12',
    rest_seconds: 60,
    notes: 'Spread rope handles at lockout for maximal lateral head recruitment.',
    activation_cue: 'Pin elbows firmly against ribcage.',
  },
  {
    name: 'Rope Face Pulls with External Rotation',
    sets: 3,
    reps: '15-20',
    rest_seconds: 60,
    notes: 'Pull to eye level, thumbs pointing back to promote rotator cuff health.',
    activation_cue: 'Activate lower traps and external rotators.',
  },
  {
    name: 'Hanging Leg / Knee Raises',
    sets: 3,
    reps: '12-15',
    rest_seconds: 60,
    notes: 'Roll pelvis upward toward ribs rather than swinging hips.',
    activation_cue: 'Posterior pelvic tilt with hollow abdominal brace.',
  },
];

export const PREMIER_UPPER_CALISTHENICS = [
  {
    name: 'Incline / Standard Push-ups',
    sets: 4,
    reps: '10-12',
    rest_seconds: 75,
    notes: 'Lower with 3s tempo, full protraction and elbow lockout at apex.',
    activation_cue: 'Maintain rigid hollow body plank throughout.',
  },
  {
    name: 'Strict Parallel Bar Dips',
    sets: 3,
    reps: '6-8',
    rest_seconds: 90,
    notes: 'Controlled descent to 90 degrees elbow bend, drive through palms.',
    activation_cue: 'Depress shoulder blades; do not shrug.',
  },
  {
    name: 'Inverted Australian Pull-ups',
    sets: 3,
    reps: '8-10',
    rest_seconds: 75,
    notes: 'Straight body plank, pull lower chest to bar or rings.',
    activation_cue: 'Squeeze shoulder blades together at apex.',
  },
  {
    name: 'Pike Push-ups',
    sets: 3,
    reps: '6-8',
    rest_seconds: 90,
    notes: 'Head travels forward in triangle path, press overhead to active shoulders.',
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
  {
    name: 'Hanging Knee Raises',
    sets: 3,
    reps: '10-12',
    rest_seconds: 60,
    notes: 'Controlled curl of knees to chest without momentum swinging.',
    activation_cue: 'Compress lower abdominals and tilt pelvis.',
  },
];

/**
 * Ensures any microcycle strictly obeys:
 * 1. Leg exclusion if typed by user
 * 2. Leg inclusion if NOT excluded by user
 * 3. Specific exercise exclusions (e.g. no deadlifts)
 * 4. Premier, safe exercise replacements (no dangerous/stupid exercises)
 */
export function sanitizeMicrocycleExclusions(microcycle, options = {}) {
  if (!microcycle || !Array.isArray(microcycle.days)) {
    return microcycle;
  }

  const combinedUserText = [
    options.requirements,
    options.training_requirements,
    options.goalDescription,
    options.primary_goal,
    options.equipment,
    options.available_equipment,
    options.currentSkills,
    options.current_skills,
    options.notes,
  ]
    .filter(Boolean)
    .join(' ');

  const exclusions = detectUserExclusions(combinedUserText);
  const trainingType = options.trainingType || 'calisthenics';
  const isCalisthenics =
    trainingType === 'calisthenics' || trainingType === 'weighted_calisthenics';

  const premierUpperPool = isCalisthenics
    ? PREMIER_UPPER_CALISTHENICS
    : PREMIER_UPPER_WEIGHTS;

  let upperPoolIndex = 0;
  const getNextPremierUpper = () => {
    const item = premierUpperPool[upperPoolIndex % premierUpperPool.length];
    upperPoolIndex++;
    return { ...item };
  };

  const updatedDays = microcycle.days.map((day) => {
    let dayName = day.day_name || '';
    let workoutType = day.workout_type || '';
    let exercises = Array.isArray(day.exercises) ? [...day.exercises] : [];

    // 1. If user explicitly excluded legs:
    if (exclusions.noLegs) {
      // If the day is a dedicated leg day, rename it to upper body / core
      const isLegDay =
        /leg|lower\s+body|posterior\s+chain|squat/i.test(dayName) ||
        /leg|lower\s+body|posterior\s+chain|squat/i.test(workoutType);

      if (isLegDay) {
        dayName = dayName.replace(/lower\s+body|legs?|posterior\s+chain/gi, 'Upper Body & Core');
        workoutType = 'Upper Body Hypertrophy & Core';
      }

      // Replace any leg exercises with premier upper body exercises
      exercises = exercises.map((ex) => {
        if (isLegExercise(ex.name)) {
          return getNextPremierUpper();
        }
        return ex;
      });
    }

    // 2. Filter out specific exercise exclusions & dangerous exercises
    exercises = exercises.map((ex) => {
      let currentName = ex.name || '';

      // Specific exclusions
      if (exclusions.noDeadlifts && /deadlift|rdl/i.test(currentName)) {
        return {
          name: 'Chest-Supported Dumbbell Row',
          sets: ex.sets || 3,
          reps: ex.reps || '8-10',
          rest_seconds: ex.rest_seconds || 90,
          notes: 'Safe posterior chain and mid-back builder with zero lower back shear.',
          activation_cue: 'Retract shoulder blades and pull elbows to hip crease.',
        };
      }

      if (exclusions.noBench && /bench\s+press/i.test(currentName)) {
        return {
          name: isCalisthenics ? 'Weighted Push-ups' : 'Dumbbell Floor Press',
          sets: ex.sets || 3,
          reps: ex.reps || '8-10',
          rest_seconds: ex.rest_seconds || 90,
          notes: 'Shoulder-friendly horizontal press variation.',
          activation_cue: 'Keep elbows tucked at 45 degrees.',
        };
      }

      if (exclusions.noSquats && /squat/i.test(currentName)) {
        return {
          name: isCalisthenics ? 'Walking Lunges' : 'Leg Press',
          sets: ex.sets || 3,
          reps: ex.reps || '10-12',
          rest_seconds: ex.rest_seconds || 90,
          notes: 'Lower body overload with minimized spinal loading.',
          activation_cue: 'Drive smoothly through heels.',
        };
      }

      if (exclusions.noOverheadPress && /(?:overhead|shoulder|military)\s+press/i.test(currentName)) {
        return {
          name: 'Dumbbell Incline Chest / Shoulder Press (45 deg)',
          sets: ex.sets || 3,
          reps: ex.reps || '8-10',
          rest_seconds: ex.rest_seconds || 90,
          notes: 'Shoulder-friendly angle avoiding acromial impingement.',
          activation_cue: 'Pack shoulder blades down.',
        };
      }

      if (exclusions.noDips && /dip/i.test(currentName)) {
        return {
          name: isCalisthenics ? 'Diamond Push-ups' : 'Triceps Cable Rope Pushdowns',
          sets: ex.sets || 3,
          reps: ex.reps || '10-12',
          rest_seconds: ex.rest_seconds || 60,
          notes: 'Isolate triceps without excessive shoulder extension strain.',
          activation_cue: 'Pin elbows to sides.',
        };
      }

      if (exclusions.noPullups && /pull[\s-]?up/i.test(currentName)) {
        return {
          name: isCalisthenics ? 'Inverted Australian Rows' : 'Neutral-Grip Lat Pulldown',
          sets: ex.sets || 3,
          reps: ex.reps || '8-10',
          rest_seconds: ex.rest_seconds || 90,
          notes: 'High-yield vertical/horizontal pull alternative.',
          activation_cue: 'Depress scapulae before bending elbows.',
        };
      }

      // Eliminate dangerous or gimmick exercises
      if (isDangerousOrGimmickExercise(currentName)) {
        if (/behind-the-neck|behind the neck/i.test(currentName)) {
          return {
            name: 'Seated Dumbbell Overhead Press',
            sets: ex.sets || 3,
            reps: ex.reps || '8-10',
            rest_seconds: ex.rest_seconds || 90,
            notes: 'Safe frontal-plane overhead press with natural joint mechanics.',
            activation_cue: 'Keep elbows slightly forward in scapular plane.',
          };
        }
        if (/upright row/i.test(currentName)) {
          return {
            name: 'Standing Dumbbell Lateral Raises',
            sets: ex.sets || 3,
            reps: ex.reps || '12-15',
            rest_seconds: ex.rest_seconds || 60,
            notes: 'Safe lateral deltoid isolation without internal shoulder impingement.',
            activation_cue: 'Lead with elbows in scapular plane.',
          };
        }
      }

      return ex;
    });

    return {
      ...day,
      day_name: dayName,
      workout_type: workoutType,
      exercises,
    };
  });

  // 3. If the user did NOT exclude legs, ensure at least one day has dedicated leg training!
  if (!exclusions.noLegs) {
    const hasAnyLegs = updatedDays.some((day) =>
      day.exercises.some((ex) => isLegExercise(ex.name))
    );

    if (!hasAnyLegs && updatedDays.length >= 3) {
      // Day 3 (index 2) is restored to premier lower body training
      const legDayIndex = Math.min(2, updatedDays.length - 1);
      const targetDay = updatedDays[legDayIndex];

      if (trainingType === 'weights') {
        updatedDays[legDayIndex] = {
          ...targetDay,
          day_name: `Day ${legDayIndex + 1} - Lower Body Strength & Posterior Chain`,
          workout_type: 'Lower Body Strength',
          exercises: [
            {
              name: 'Barbell Back Squat',
              sets: 4,
              reps: '6-8',
              rest_seconds: 120,
              notes: 'Descend to parallel with upright torso, drive through mid-foot.',
              activation_cue: 'Screw feet into floor and spread the knees.',
            },
            {
              name: 'Romanian Deadlift (RDL)',
              sets: 3,
              reps: '8-10',
              rest_seconds: 120,
              notes: 'Hinge hips to rear wall until deep hamstring stretch is felt.',
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
        };
      } else {
        // Calisthenics / Hybrid
        updatedDays[legDayIndex] = {
          ...targetDay,
          day_name: `Day ${legDayIndex + 1} - Lower Body Strength & Mobility`,
          workout_type: 'Lower Body Power',
          exercises: [
            {
              name: 'Bodyweight Deep Squats / Goblet Squats',
              sets: 4,
              reps: '12-15',
              rest_seconds: 75,
              notes: 'Full depth below parallel, knees tracking over toes.',
              activation_cue: 'Push ground apart through mid-foot and heels.',
            },
            {
              name: 'Bulgarian Split Squats',
              sets: 3,
              reps: '8-10',
              rest_seconds: 75,
              notes: 'Elevate rear foot, control descent with upright torso.',
              activation_cue: 'Keep chest lifted and load front glute.',
            },
            {
              name: 'Walking Lunges',
              sets: 3,
              reps: '16 total',
              rest_seconds: 60,
              notes: 'Smooth continuous steps maintaining pelvic alignment.',
              activation_cue: 'Square hips forward throughout.',
            },
            {
              name: 'Single-Leg Calf Raises',
              sets: 3,
              reps: '12-15',
              rest_seconds: 45,
              notes: 'Full stretch at bottom, pause 1s at top.',
              activation_cue: 'Push straight through big toe joint.',
            },
          ],
        };
      }
    }
  }

  return {
    ...microcycle,
    days: updatedDays,
  };
}
