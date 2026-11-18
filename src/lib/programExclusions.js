import {
  applyWorkoutDayNames,
  extractWeekdayFromDayName,
  parseOnboardingPreferences,
  resolveWorkoutDays,
} from './workoutSchedule.js';

/**
 * Program Exclusions & Premier Exercise Selection
 *
 * Rules:
 * 1. Legs are mandatory by default across all training types.
 * 2. If the user explicitly typed anywhere to NOT train legs (e.g. "no legs",
 *    "skip legs", "upper body only", "don't train legs", etc.), NEVER include legs.
 * 3. Same strict exclusion applies to any other exercise or movement pattern
 *    the user typed to avoid (e.g. "no deadlifts", "avoid bench press").
 * 4. If the athlete did NOT choose "Learn Skills" (learn_skills) in their goals,
 *    never include calisthenics skills in their workouts.
 * 5. Only choose the best, biomechanically sound, premier exercises — zero stupid
 *    or dangerous gimmick exercises.
 */

function parseGoalsList(rawGoals) {
  if (Array.isArray(rawGoals)) {
    return rawGoals
      .map((g) => String(g || '').trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof rawGoals === 'string' && rawGoals.trim()) {
    const trimmed = rawGoals.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((g) => String(g || '').trim().toLowerCase())
            .filter(Boolean);
        }
      } catch {
        // fallback to comma split
      }
    }
    return trimmed
      .split(',')
      .map((g) => g.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

/**
 * Determines whether calisthenics skills should be included in the workout program.
 * Returns true ONLY if the user chose "learn_skills" in their goals (or explicitly
 * requested skill training when no structured fitnessGoals array was recorded).
 */
export function hasLearnSkillsGoal(options = {}) {
  if (typeof options?.wantsSkills === 'boolean') {
    return options.wantsSkills;
  }

  const trainingType = String(
    options?.trainingType || options?.training_type || ''
  )
    .trim()
    .toLowerCase();

  if (trainingType === 'weights') {
    return false;
  }

  const combinedText = [
    options?.requirements,
    options?.training_requirements,
    options?.goalDescription,
    options?.primary_goal,
    options?.goal,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    /\b(?:no|skip|avoid|without|don'?t\s+(?:want|include|do))\s+(?:any\s+)?skills?\b/.test(
      combinedText
    )
  ) {
    return false;
  }

  const goals = parseGoalsList(
    options?.fitnessGoals ?? options?.fitness_goals
  );

  if (goals.length > 0) {
    return goals.some(
      (g) => g === 'learn_skills' || g === 'learn skills'
    );
  }

  // Fallback when fitnessGoals array is empty/absent (e.g. legacy profiles)
  const goalText = String(
    options?.goalDescription || options?.primary_goal || options?.goal || ''
  ).toLowerCase();

  return /\blearn[\s_]+skills?\b/.test(goalText);
}

export function isCalisthenicsSkillExercise(name = '') {
  if (!name || typeof name !== 'string') return false;
  const lower = name.toLowerCase();

  const skillPatterns = [
    /\bhand[\s-]?stand\b/,
    /\bhspu\b/,
    /\bmuscle[\s-]?ups?\b/,
    /\bplanche\b/,
    /\b(?:front|back|elbow)\s+lever\b/,
    /\blever\s+(?:hold|pull|raise|progression|tuck|straddle)\b/,
    /\bskin\s+the\s+cat\b/,
    /\bice\s+cream\s+maker\b/,
    /\bhuman\s+flag\b/,
    /\b(?:vertical|pole)\s+flag\b/,
    /\b[lv][\s-]?sits?\b/,
    /\bmanna\b/,
    /\bfrog\s+stand\b/,
    /\bcrow\s+pose\b/,
    /\bcrane\s+pose\b/,
    /\biron\s+cross\b/,
    /\bmaltese\b/,
    /\bvictorian\b/,
    /\bhefesto\b/,
    /\bdragon\s+press\b/,
    /\b90[\s-]?degree\s+(?:hold|push[\s-]?up)\b/,
  ];

  return skillPatterns.some((pattern) => pattern.test(lower));
}

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

const AVOID_VERB_PREFIX =
  '(?:no|skip|avoid|exclude|omit|remove|never(?:\\s+do)?|hate|without|can\'?t(?:\\s+do)?|cannot(?:\\s+do)?|unable\\s+to(?:\\s+do|\\s+perform)?|not\\s+able\\s+to(?:\\s+do|\\s+perform)?|struggle\\s+(?:with|to\\s+do)|impossible\\s+to(?:\\s+do)?|don\'?t\\s+(?:want|like|include|do)|do\\s+not\\s+(?:want|like|include|do)|hurts?\\s+(?:to(?:\\s+do)?|when\\s+(?:i\\s+)?do)|painful\\s+to(?:\\s+do)?)';

const CUSTOM_STOP_WORDS = new Set([
  'do', 'doing', 'make', 'perform', 'my', 'the', 'a', 'an', 'any', 'these', 'those',
  'moves', 'movements', 'exercise', 'exercises', 'workout', 'workouts', 'things', 'it',
  'them', 'anything', 'because', 'due', 'to', 'with', 'from', 'on', 'at', 'in', 'or', 'and',
]);

function extractCustomExcludedTerms(text = '') {
  if (!text || typeof text !== 'string') return [];
  const clauses = text
    .toLowerCase()
    .split(/[.,;\n!?]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const terms = new Set();
  const triggerRegex = new RegExp(
    `\\b${AVOID_VERB_PREFIX}\\s+(?:doing\\s+|performing\\s+|any\\s+)?([a-z][a-z\\s-]{2,40})`,
    'gi'
  );

  for (const clause of clauses) {
    let match;
    triggerRegex.lastIndex = 0;
    while ((match = triggerRegex.exec(clause)) !== null) {
      let phrase = match[1]
        .replace(/\b(?:because|since|due|when|as|for|that|which|right\s+now|anymore)\b.*$/i, '')
        .trim();
      const words = phrase
        .split(/\s+/)
        .filter((w) => w.length > 2 && !CUSTOM_STOP_WORDS.has(w))
        .slice(0, 4);
      if (words.length > 0) {
        const candidate = words.join(' ').trim();
        if (candidate.length >= 4) {
          terms.add(candidate);
        }
      }
    }
  }

  return Array.from(terms);
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
      noPushups: false,
      noLunges: false,
      noRows: false,
      noCalfRaises: false,
      noPlyoOrJumping: false,
      noRunning: false,
      noHanging: false,
      customExcludedTerms: [],
    };
  }

  const lower = text.toLowerCase();
  const hasAvoid = (targetPattern) =>
    new RegExp(`\\b${AVOID_VERB_PREFIX}\\s+(?:doing\\s+|performing\\s+|any\\s+)?${targetPattern}\\b`, 'i').test(lower);

  return {
    noLegs: hasUserExcludedLegs(text),
    noDeadlifts:
      hasAvoid('(?:conventional\\s+|romanian\\s+)?(?:deadlifts?|rdls?)') ||
      /\bback\s+pain.*(?:deadlift|rdl|no\s+deadlift)/.test(lower),
    noBench:
      hasAvoid('(?:flat\\s+|incline\\s+|barbell\\s+|dumbbell\\s+)?bench(?:\\s+press(?:es)?)?'),
    noSquats:
      hasAvoid('(?:back\\s+|front\\s+|goblet\\s+|pistol\\s+|bulgarian\\s+split\\s+|split\\s+)?squats?'),
    noOverheadPress:
      hasAvoid('(?:overhead|shoulder|military|pike|handstand)\\s+(?:press(?:es|ing)?|push[\\s-]?ups?)') ||
      hasAvoid('ohp') ||
      /\bimpingement.*overhead/.test(lower),
    noDips:
      hasAvoid('(?:parallel\\s+bar\\s+|ring\\s+|bench\\s+|weighted\\s+)?dips?'),
    noPullups:
      hasAvoid('(?:strict\\s+|weighted\\s+|australian\\s+|inverted\\s+)?(?:pull[\\s-]?ups?|chin[\\s-]?ups?)'),
    noPushups:
      hasAvoid('(?:incline\\s+|decline\\s+|diamond\\s+|close[\\s-]?grip\\s+|weighted\\s+|standard\\s+)?push[\\s-]?ups?'),
    noLunges:
      hasAvoid('(?:walking\\s+|reverse\\s+|jumping\\s+|split\\s+)?lunges?') ||
      hasAvoid('(?:bulgarian\\s+)?split\\s+squats?'),
    noRows:
      hasAvoid('(?:barbell\\s+|bent[\\s-]?over\\s+|inverted\\s+|dumbbell\\s+|cable\\s+)?rows?'),
    noCalfRaises:
      hasAvoid('(?:standing\\s+|seated\\s+|single[\\s-]?leg\\s+)?calf\\s+raises?'),
    noPlyoOrJumping:
      hasAvoid('(?:jump(?:ing|s)?|plyo(?:metrics?)?|box\\s+jumps?|burpees?)'),
    noRunning:
      hasAvoid('(?:run(?:ning)?|jog(?:ging)?|sprint(?:ing|s)?|treadmill)'),
    noHanging:
      hasAvoid('(?:hanging\\s+(?:leg|knee)\\s+raises?|dead\\s+hangs?|hanging)'),
    customExcludedTerms: extractCustomExcludedTerms(text),
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

function isExerciseUnsafeForAthlete(name = '', exclusions = {}, prefs = {}) {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  const inj = prefs?.injuries || {};
  const eq = prefs?.equipmentConstraints || {};

  if (isDangerousOrGimmickExercise(lower)) return true;

  // Explicit exercise / category exclusions
  if (exclusions.noLegs && isLegExercise(lower)) return true;
  if (exclusions.noDeadlifts && /deadlift|rdl\b/.test(lower)) return true;
  if (exclusions.noBench && /bench\s+press/.test(lower)) return true;
  if (exclusions.noSquats && /squat/.test(lower)) return true;
  if (exclusions.noOverheadPress && /(?:overhead|shoulder|military)\s+press|pike\s+push|hspu|handstand/.test(lower)) return true;
  if (exclusions.noDips && /\bdips?\b/.test(lower)) return true;
  if (exclusions.noPullups && /pull[\s-]?up|chin[\s-]?up/.test(lower)) return true;
  if (exclusions.noPushups && /push[\s-]?up/.test(lower)) return true;
  if (exclusions.noLunges && /lunge|split\s+squat/.test(lower)) return true;
  if (exclusions.noRows && /\brows?\b|inverted.*pull/.test(lower)) return true;
  if (exclusions.noCalfRaises && /\bcalf\b/.test(lower)) return true;
  if (exclusions.noPlyoOrJumping && /\bjump|plyo|burpee/.test(lower)) return true;
  if (exclusions.noRunning && /\brun|sprint|jog|treadmill/.test(lower)) return true;
  if (exclusions.noHanging && /\bhanging\b|dead\s+hang/.test(lower)) return true;

  if (Array.isArray(exclusions.customExcludedTerms) && exclusions.customExcludedTerms.length > 0) {
    for (const term of exclusions.customExcludedTerms) {
      if (term.length >= 4 && lower.includes(term)) return true;
    }
  }

  // Equipment constraints
  if (eq.bodyweightOnly && /barbell|dumbbell|cable|machine|pulldown|leg\s+press|goblet/.test(lower)) return true;
  if (eq.noBarbell && /\bbarbell\b/.test(lower)) return true;
  if (eq.noCablesOrMachines && /\b(?:cable|machine|lat\s+pulldown|leg\s+press|face\s+pull|pushdown)\b/.test(lower)) return true;
  if (eq.noPullupBar && /\bpull[\s-]?up|chin[\s-]?up|hanging|dead\s+hang\b/.test(lower)) return true;
  if (eq.noDipBars && /\bparallel\s+bar\s+dips?|weighted\s+(?:parallel\s+bar\s+)?dips?\b/.test(lower)) return true;

  // Injury / pain biomechanical safeguards
  if (inj.shoulderSensitive && /\bdips?\b|behind-the-neck|upright\s+row|overhead\s+press|military\s+press|shoulder\s+press|pike\s+push|handstand|hspu|planche|bench\s+press|lateral\s+raise/.test(lower)) {
    return true;
  }
  if (inj.lowerBackSensitive && /deadlift|rdl\b|good\s+morning|bent-over\s+row|barbell\s+row|back\s+squat|superman|arch\s+body/.test(lower)) {
    return true;
  }
  if (inj.upperBackNeckSensitive && /shrug|behind-the-neck|barbell\s+back\s+squat|overhead\s+barbell|military\s+press/.test(lower)) {
    return true;
  }
  if (inj.kneeSensitive && /squat|lunge|leg\s+extension|leg\s+press|jump|plyo|step-up/.test(lower)) {
    return true;
  }
  if (inj.wristSensitive && /floor\s+push|standard\s+push|diamond\s+push|close-grip\s+push|pike\s+push|handstand|planche|front\s+squat|barbell\s+curl/.test(lower)) {
    return true;
  }
  if (inj.elbowSensitive && /\bdips?\b|skullcrusher|triceps?\s+extension|french\s+press|chin[\s-]?up|diamond\s+push|close-grip/.test(lower)) {
    return true;
  }
  if (inj.hipSensitive && /lunge|split\s+squat|hanging\s+(?:leg|knee)|leg\s+raise|deep\s+squat|step-up/.test(lower)) {
    return true;
  }
  if (inj.ankleFootSensitive && /calf|walking\s+lunge|jump|plyo|sprint|run/.test(lower)) {
    return true;
  }
  if (inj.chestPecSensitive && /bench\s+press|push[\s-]?up|\bdips?\b|pec\s+fly|chest\s+fly/.test(lower)) {
    return true;
  }
  if (inj.bicepTricepSensitive && /\bcurl\b|chin[\s-]?up|skullcrusher|triceps?\s+(?:pushdown|extension)|\bdips?\b|diamond\s+push/.test(lower)) {
    return true;
  }

  return false;
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
  {
    name: 'Dead Bug Core Control',
    sets: 3,
    reps: '12-16 total',
    rest_seconds: 60,
    notes: 'Keep lower back pinned flat against the floor while extending opposite arm and leg.',
    activation_cue: 'Exhale gently to lock ribs toward pelvis.',
  },
];

export const PREMIER_UPPER_CALISTHENICS = [
  {
    name: 'Incline Push-ups (Hands Elevated)',
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
  {
    name: 'Dead Bug Core Control',
    sets: 3,
    reps: '12-16 total',
    rest_seconds: 60,
    notes: 'Zero joint load on wrists/shoulders; keep lower back flat into the floor.',
    activation_cue: 'Brace deep core and move smoothly with breath.',
  },
  {
    name: 'Prone Y-T-W Scapular Raises',
    sets: 3,
    reps: '12-15',
    rest_seconds: 60,
    notes: 'Strengthen mid-back, rear delts, and rotator cuff with zero elbow/wrist strain.',
    activation_cue: 'Pull shoulder blades down away from ears.',
  },
];

const SAFE_CORE_FALLBACK = {
  name: 'Dead Bug Core Control',
  sets: 3,
  reps: '12-16 total',
  rest_seconds: 60,
  notes: 'Keep lower back pressed flat against the floor throughout every rep.',
  activation_cue: 'Lock ribcage down and move limbs under strict control.',
};

/**
 * Ensures any microcycle strictly obeys:
 * 1. Leg exclusion if typed by user
 * 2. Leg inclusion if NOT excluded by user
 * 3. Specific exercise exclusions & "can't do" statements
 * 4. Comprehensive injury / pain safeguards
 * 5. Premier, safe exercise replacements (never swapping into another unsafe exercise)
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
    options.goal,
    options.equipment,
    options.available_equipment,
    options.currentSkills,
    options.current_skills,
    options.notes,
  ]
    .filter(Boolean)
    .join(' ');

  const exclusions = detectUserExclusions(combinedUserText);
  const prefs = parseOnboardingPreferences(options);
  const trainingType = options.trainingType || 'calisthenics';
  const wantsSkills = hasLearnSkillsGoal(options);
  const isCalisthenics =
    trainingType === 'calisthenics' || trainingType === 'weighted_calisthenics';

  const premierUpperPool = isCalisthenics
    ? PREMIER_UPPER_CALISTHENICS
    : PREMIER_UPPER_WEIGHTS;

  let upperPoolIndex = 0;
  const pickSafeCandidate = (candidates = [], usedNames = new Set()) => {
    for (const candidate of candidates) {
      if (!candidate?.name) continue;
      if (isExerciseUnsafeForAthlete(candidate.name, exclusions, prefs)) continue;
      const key = candidate.name.toLowerCase();
      if (!usedNames.has(key)) {
        usedNames.add(key);
        return { ...candidate };
      }
    }
    return null;
  };

  const getNextSafePremierUpper = (usedNames = new Set()) => {
    for (let i = 0; i < premierUpperPool.length; i++) {
      const item = premierUpperPool[(upperPoolIndex + i) % premierUpperPool.length];
      if (isExerciseUnsafeForAthlete(item.name, exclusions, prefs)) continue;
      const key = item.name.toLowerCase();
      if (!usedNames.has(key)) {
        upperPoolIndex = (upperPoolIndex + i + 1) % premierUpperPool.length;
        usedNames.add(key);
        return { ...item };
      }
    }
    for (let i = 0; i < premierUpperPool.length; i++) {
      const item = premierUpperPool[(upperPoolIndex + i) % premierUpperPool.length];
      if (!isExerciseUnsafeForAthlete(item.name, exclusions, prefs)) {
        upperPoolIndex = (upperPoolIndex + i + 1) % premierUpperPool.length;
        return { ...item };
      }
    }
    return { ...SAFE_CORE_FALLBACK };
  };

  const buildSafeReplacement = (ex, usedNames) => {
    const lower = String(ex?.name || '').toLowerCase();
    const sets = Number(ex?.sets) || 3;
    const eq = prefs.equipmentConstraints;
    const inj = prefs.injuries;
    const candidates = [];

    // Pattern-aware safe candidates matching original training stimulus
    if (/squat|leg\s+press|lunge|split\s+squat|step-up|calf|jump/.test(lower)) {
      if (!exclusions.noLegs) {
        if (!inj.lowerBackSensitive && !exclusions.noDeadlifts && !eq.bodyweightOnly) {
          candidates.push({
            name: eq.noBarbell ? 'Dumbbell Romanian Deadlift (RDL)' : 'Romanian Deadlift (RDL)',
            sets,
            reps: '8-10',
            rest_seconds: 90,
            notes: 'Joint-friendly hip hinge loading hamstrings and glutes cleanly.',
            activation_cue: 'Push hips straight back while keeping lats packed.',
          });
        }
        candidates.push({
          name: 'Glute Bridges / Hip Thrusts',
          sets,
          reps: '12-15',
          rest_seconds: 75,
          notes: 'Safe posterior chain & glute overload with minimal knee/ankle shear.',
          activation_cue: 'Drive through heels with posterior pelvic tilt.',
        });
        if (!eq.noCablesOrMachines && !eq.bodyweightOnly) {
          candidates.push({
            name: 'Seated Hamstring Curls',
            sets,
            reps: '10-12',
            rest_seconds: 75,
            notes: 'Controlled knee flexion isolating hamstrings with zero axial load.',
            activation_cue: 'Control a slow 3s return on every rep.',
          });
        }
        candidates.push({
          name: 'Single-Leg Glute Bridges',
          sets,
          reps: '10-12 each leg',
          rest_seconds: 60,
          notes: 'Unilateral glute & hamstring work protecting knees and ankles.',
          activation_cue: 'Brace core and keep pelvis level.',
        });
      }
    } else if (/deadlift|rdl\b|good\s+morning|superman|arch\s+body/.test(lower)) {
      candidates.push({
        name: eq.bodyweightOnly ? 'Prone Y-T-W Scapular Raises' : 'Chest-Supported Dumbbell Row',
        sets,
        reps: '10-12',
        rest_seconds: 75,
        notes: 'Zero lower-back shear while strengthening upper back & posture.',
        activation_cue: 'Squeeze shoulder blades together gently.',
      });
      if (!exclusions.noLegs) {
        candidates.push({
          name: 'Glute Bridges / Hip Thrusts',
          sets,
          reps: '12-15',
          rest_seconds: 75,
          notes: 'Targeted glute/hamstring overload with a supported neutral spine.',
          activation_cue: 'Tuck pelvis at top rather than hyperextending lumbar spine.',
        });
      }
    } else if (/bench\s+press|push[\s-]?up|\bdips?\b|overhead|military|shoulder\s+press|pike\s+push|handstand|hspu|fly/.test(lower)) {
      if (!inj.chestPecSensitive && !inj.wristSensitive && !inj.shoulderSensitive) {
        candidates.push({
          name: isCalisthenics ? 'Incline Push-ups (Hands Elevated)' : 'Neutral-Grip Dumbbell Floor Press',
          sets,
          reps: '8-12',
          rest_seconds: 75,
          notes: 'Joint-friendly pressing variation controlling anterior capsule tension.',
          activation_cue: 'Keep elbows tucked at 45 degrees and shoulder blades packed.',
        });
      }
      if (!inj.shoulderSensitive && !inj.elbowSensitive && !eq.noCablesOrMachines && !eq.bodyweightOnly) {
        candidates.push({
          name: 'Rope Face Pulls with External Rotation',
          sets,
          reps: '15-20',
          rest_seconds: 60,
          notes: 'Strengthen rear delts and rotator cuff cleanly.',
          activation_cue: 'Draw thumbs back smoothly with relaxed upper traps.',
        });
      }
      candidates.push({
        name: eq.bodyweightOnly ? 'Prone Y-T-W Scapular Raises' : 'Chest-Supported Dumbbell Row',
        sets,
        reps: '10-12',
        rest_seconds: 75,
        notes: 'Balanced upper-body strength avoiding irritated pushing joints.',
        activation_cue: 'Depress shoulder blades away from ears.',
      });
    } else if (/pull[\s-]?up|chin[\s-]?up|\brow\b|pulldown|curl|skullcrusher|triceps/.test(lower)) {
      if (!inj.lowerBackSensitive && !eq.bodyweightOnly) {
        candidates.push({
          name: 'Chest-Supported Dumbbell Row',
          sets,
          reps: '8-12',
          rest_seconds: 75,
          notes: 'Joint-friendly upper back strength with full scapular control.',
          activation_cue: 'Retract shoulder blades before driving elbows back.',
        });
      }
      candidates.push({
        name: eq.bodyweightOnly ? 'Prone Y-T-W Scapular Raises' : 'Neutral-Grip Lat Pulldown',
        sets,
        reps: '10-12',
        rest_seconds: 75,
        notes: 'Smooth vertical/scapular pull respecting joint comfort.',
        activation_cue: 'Lead with elbows and depress shoulder blades.',
      });
    }

    const picked = pickSafeCandidate(candidates, usedNames);
    if (picked) return picked;

    return getNextSafePremierUpper(usedNames);
  };

  const getNonSkillReplacement = (exercise, usedNames) => {
    const lower = String(exercise?.name || '').toLowerCase();
    const sets = Number(exercise?.sets) || 3;
    const isWeighted = trainingType === 'weighted_calisthenics';
    const isHybrid = trainingType === 'hybrid';

    const candidates = [];

    if (/hand[\s-]?stand|hspu/.test(lower)) {
      if (isHybrid) {
        candidates.push({
          name: 'Dumbbell Overhead Press',
          sets,
          reps: '8-10',
          rest_seconds: 90,
          notes: 'Controlled vertical push overload, 1-2 RIR.',
          activation_cue: 'Brace core and keep ribs pinned down.',
        });
      }
      candidates.push({
        name: 'Elevated Pike Push-ups',
        sets,
        reps: '6-10',
        rest_seconds: 90,
        notes: 'Control 3s descent, head travels forward of hands, leave 1-2 RIR.',
        activation_cue: 'Push shoulders away from ears at top lockout.',
      });
    } else if (/muscle[\s-]?up/.test(lower)) {
      candidates.push({
        name: isWeighted ? 'Weighted Strict Pull-ups' : 'Explosive Strict Pull-ups',
        sets,
        reps: '6-8',
        rest_seconds: 120,
        notes: 'Full dead hang to chest-to-bar pull, controlled negative, 1-2 RIR.',
        activation_cue: 'Depress shoulder blades and drive elbows to hips.',
      });
    } else if (/front\s+lever|back\s+lever|skin\s+the\s+cat|ice\s+cream|lever/.test(lower)) {
      candidates.push({
        name: isHybrid ? 'Chest-Supported Dumbbell Row' : 'Inverted Bodyweight Rows',
        sets,
        reps: '8-12',
        rest_seconds: 90,
        notes: 'Maintain rigid plank posture, pull chest to bar/rings, 1-2 RIR.',
        activation_cue: 'Squeeze shoulder blades together at peak contraction.',
      });
    } else if (/planche|frog\s+stand|crow|crane|90[\s-]?degree|iron\s+cross|maltese/.test(lower)) {
      candidates.push({
        name: isWeighted ? 'Weighted Push-ups' : 'Incline Push-ups (Hands Elevated)',
        sets,
        reps: '8-12',
        rest_seconds: 90,
        notes: 'Controlled 3s lowering, full lockout and protraction at top, 1-2 RIR.',
        activation_cue: 'Screw hands into the floor and squeeze glutes.',
      });
      candidates.push({
        name: isWeighted ? 'Weighted Parallel Bar Dips' : 'Parallel Bar Dips',
        sets,
        reps: '6-10',
        rest_seconds: 90,
        notes: 'Lower under control to 90 degrees, drive through palms, 1-2 RIR.',
        activation_cue: 'Depress shoulder blades and keep core braced.',
      });
    } else if (/[lv][\s-]?sit|manna|human\s+flag|vertical\s+flag|pole\s+flag|dragon\s+press/.test(lower)) {
      candidates.push({
        name: 'Hollow Body Hold',
        sets,
        reps: '30s',
        rest_seconds: 60,
        notes: 'Press lower back flat into the floor with rigid core tension.',
        activation_cue: 'Tuck pelvis and brace abs tightly.',
      });
      candidates.push({
        name: 'Hanging Leg / Knee Raises',
        sets,
        reps: '10-12',
        rest_seconds: 60,
        notes: 'Raise legs without swinging, control the lowering phase.',
        activation_cue: 'Curl pelvis upward toward ribs.',
      });
    }

    const picked = pickSafeCandidate(candidates, usedNames);
    if (picked) return picked;

    return getNextSafePremierUpper(usedNames);
  };

  const updatedDays = microcycle.days.map((day) => {
    let dayName = day.day_name || '';
    let workoutType = day.workout_type || '';
    let exercises = Array.isArray(day.exercises) ? [...day.exercises] : [];

    // 0. If athlete did NOT choose "Learn Skills", strip skill framing and replace any skills
    if (!wantsSkills) {
      if (/skill/i.test(dayName)) {
        dayName = dayName
          .replace(/calisthenics\s+skill\s*\+\s*/gi, 'Bodyweight + ')
          .replace(/skill\s+progression\s*&\s*/gi, '')
          .replace(/skill\s+integration\s*&\s*/gi, 'Upper Hypertrophy & ')
          .replace(/\bskills?\s*&\s*/gi, 'Strength & ')
          .replace(/\bskills?\b/gi, 'Strength');
      }
      if (/skill/i.test(workoutType)) {
        workoutType = workoutType
          .replace(/\bskills?\s*&\s*/gi, 'Strength & ')
          .replace(/\bskills?\b/gi, 'Strength');
      }

      const usedNonSkillNames = new Set(
        exercises
          .filter((ex) => ex?.name && !isCalisthenicsSkillExercise(ex.name))
          .map((ex) => String(ex.name).trim().toLowerCase())
      );

      exercises = exercises.map((ex) => {
        if (isCalisthenicsSkillExercise(ex?.name)) {
          return getNonSkillReplacement(ex, usedNonSkillNames);
        }
        return ex;
      });
    }

    // 1. If user explicitly excluded legs:
    if (exclusions.noLegs) {
      const isLegDay =
        /leg|lower\s+body|posterior\s+chain|squat/i.test(dayName) ||
        /leg|lower\s+body|posterior\s+chain|squat/i.test(workoutType);

      if (isLegDay) {
        dayName = dayName.replace(/lower\s+body|legs?|posterior\s+chain/gi, 'Upper Body & Core');
        workoutType = 'Upper Body Hypertrophy & Core';
      }
    }

    const usedDayNames = new Set(
      exercises
        .filter((ex) => ex?.name && !isExerciseUnsafeForAthlete(ex.name, exclusions, prefs))
        .map((ex) => String(ex.name).trim().toLowerCase())
    );

    // 2. Filter out all explicit exclusions, equipment gaps, and injury/pain risks
    exercises = exercises.map((ex) => {
      const currentName = ex?.name || '';
      if (isExerciseUnsafeForAthlete(currentName, exclusions, prefs)) {
        return buildSafeReplacement(ex, usedDayNames);
      }
      return ex;
    });

    // Cap workout volume cleanly when the user specified a short session budget (e.g. <= 35 mins)
    if (prefs.sessionMinutes && prefs.sessionMinutes <= 35 && exercises.length > 3) {
      exercises = exercises.slice(0, 3);
    } else if (prefs.sessionMinutes && prefs.sessionMinutes <= 45 && exercises.length > 4) {
      exercises = exercises.slice(0, 4);
    }

    return {
      ...day,
      day_name: dayName,
      workout_type: workoutType,
      exercises,
    };
  });

  // 3. If the user did NOT exclude legs, ensure at least one day has dedicated leg training
  //    using ONLY exercises that pass all injury & equipment checks!
  if (!exclusions.noLegs) {
    const hasAnyLegs = updatedDays.some((day) =>
      day.exercises.some((ex) => isLegExercise(ex.name))
    );

    if (!hasAnyLegs && updatedDays.length >= 3) {
      const legDayIndex = Math.min(2, updatedDays.length - 1);
      const targetDay = updatedDays[legDayIndex];
      const scheduledDays = resolveWorkoutDays(options);
      const weekdayPrefix =
        extractWeekdayFromDayName(targetDay?.day_name || '') ||
        scheduledDays[legDayIndex] ||
        'Thursday';

      const legPool =
        trainingType === 'weights' && !prefs.equipmentConstraints.bodyweightOnly
          ? [
              {
                name: prefs.equipmentConstraints.noBarbell ? 'Dumbbell Goblet Squat' : 'Barbell Back Squat',
                sets: 4,
                reps: '6-8',
                rest_seconds: 120,
                notes: 'Descend to parallel with upright torso, drive through mid-foot.',
                activation_cue: 'Screw feet into floor and spread the knees.',
              },
              {
                name: prefs.equipmentConstraints.noBarbell
                  ? 'Dumbbell Romanian Deadlift (RDL)'
                  : 'Romanian Deadlift (RDL)',
                sets: 3,
                reps: '8-10',
                rest_seconds: 120,
                notes: 'Hinge hips to rear wall until deep hamstring stretch is felt.',
                activation_cue: 'Keep load tight against legs and lats engaged.',
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
                name: 'Glute Bridges / Hip Thrusts',
                sets: 3,
                reps: '10-12',
                rest_seconds: 90,
                notes: 'Pause 1s at full hip extension, zero lower back hyperextension.',
                activation_cue: 'Drive through heels and tuck pelvis.',
              },
              {
                name: 'Seated Hamstring Curls',
                sets: 3,
                reps: '10-12',
                rest_seconds: 75,
                notes: 'Full stretch and 3s controlled eccentric.',
                activation_cue: 'Keep hips pinned into pad.',
              },
              {
                name: 'Standing Calf Raises',
                sets: 4,
                reps: '12-15',
                rest_seconds: 60,
                notes: '2-second pause in full stretch, explosive drive to toes.',
                activation_cue: 'Push straight through big toe ball of foot.',
              },
            ]
          : [
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
                name: 'Single-Leg Glute Bridges',
                sets: 3,
                reps: '12-15',
                rest_seconds: 60,
                notes: 'Pause 1s at top lockout for full hamstring & glute engagement.',
                activation_cue: 'Drive through heel with pelvis tucked.',
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
            ];

      const safeLegExercises = legPool
        .filter((ex) => !isExerciseUnsafeForAthlete(ex.name, exclusions, prefs))
        .slice(0, 4);

      if (safeLegExercises.length > 0) {
        updatedDays[legDayIndex] = {
          ...targetDay,
          day_name: `${weekdayPrefix} - Lower Body Strength & Joint Care`,
          workout_type: 'Lower Body Strength',
          exercises: safeLegExercises,
        };
      }
    }
  }

  const sanitizedMicrocycle = {
    ...microcycle,
    days: updatedDays,
  };

  if (options.skipDayRenaming) {
    return sanitizedMicrocycle;
  }

  return applyWorkoutDayNames(
    sanitizedMicrocycle,
    resolveWorkoutDays({ ...options, existingDays: updatedDays })
  );
}
