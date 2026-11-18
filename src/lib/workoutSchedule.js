export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const WEEKDAY_SHORT = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

export const DEFAULT_DAYS_BY_COUNT = {
  1: ['Monday'],
  2: ['Tuesday', 'Thursday'],
  3: ['Monday', 'Wednesday', 'Friday'],
  4: ['Monday', 'Tuesday', 'Thursday', 'Friday'],
  5: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  6: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  7: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

const WEEKDAY_PATTERNS = [
  { day: 'Monday', pattern: /\b(?:mon|monday)s?\b/i },
  { day: 'Tuesday', pattern: /\b(?:tue|tues|tuesday)s?\b/i },
  { day: 'Wednesday', pattern: /\b(?:wed|wednesday)s?\b/i },
  { day: 'Thursday', pattern: /\b(?:thu|thur|thurs|thursday)s?\b/i },
  { day: 'Friday', pattern: /\b(?:fri|friday)s?\b/i },
  { day: 'Saturday', pattern: /\b(?:sat|saturday)s?\b/i },
  { day: 'Sunday', pattern: /\b(?:sun|sunday)s?\b/i },
];

export function normalizeWeekdayName(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  for (const { day, pattern } of WEEKDAY_PATTERNS) {
    if (pattern.test(trimmed)) {
      return day;
    }
  }
  return null;
}

export function sortWeekdays(days = []) {
  const unique = new Set();
  for (const raw of days) {
    const normalized = normalizeWeekdayName(String(raw || ''));
    if (normalized) unique.add(normalized);
  }
  return WEEKDAYS.filter((d) => unique.has(d));
}

export function extractWeekdayFromDayName(dayName = '') {
  if (!dayName || typeof dayName !== 'string') return null;
  for (const { day, pattern } of WEEKDAY_PATTERNS) {
    if (pattern.test(dayName)) {
      return day;
    }
  }
  return null;
}

const LEADING_DAY_PREFIX_REGEX =
  /^\s*(?:day\s*\d+|monday|mon|tuesday|tues?|wednesday|wed|thursday|thurs?|friday|fri|saturday|sat|sunday|sun)\b(?:\s*[-–—:|,/]+\s*|\s+|$)/i;

export function stripLeadingDayPrefix(dayName = '') {
  if (!dayName || typeof dayName !== 'string') return '';
  let cleaned = dayName.trim();
  let prev;
  let guard = 0;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(LEADING_DAY_PREFIX_REGEX, '').trim();
    guard += 1;
  } while (cleaned !== prev && cleaned.length > 0 && guard < 10);
  return cleaned;
}

function resolveCleanDayFocus(day) {
  const fromName = stripLeadingDayPrefix(day?.day_name || '');
  if (fromName) {
    return fromName;
  }
  const fromType = stripLeadingDayPrefix(day?.workout_type || '');
  if (fromType && fromType.toLowerCase() !== 'training') {
    return fromType;
  }
  return 'Strength & Conditioning';
}

export function parseWorkoutDaysFromText(text = '') {
  if (!text || typeof text !== 'string') return [];

  const found = new Set();

  // Check explicit weekday ranges like "Monday to Friday" or "Mon-Fri"
  const rangeRegex =
    /\b(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*(?:-|to|through|thru)\s*(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
  let rangeMatch;
  while ((rangeMatch = rangeRegex.exec(text)) !== null) {
    const startDay = normalizeWeekdayName(rangeMatch[1]);
    const endDay = normalizeWeekdayName(rangeMatch[2]);
    if (startDay && endDay) {
      const startIdx = WEEKDAYS.indexOf(startDay);
      const endIdx = WEEKDAYS.indexOf(endDay);
      if (startIdx !== -1 && endIdx !== -1) {
        if (startIdx <= endIdx) {
          for (let i = startIdx; i <= endIdx; i++) found.add(WEEKDAYS[i]);
        } else {
          for (let i = startIdx; i < WEEKDAYS.length; i++) found.add(WEEKDAYS[i]);
          for (let i = 0; i <= endIdx; i++) found.add(WEEKDAYS[i]);
        }
      }
    }
  }

  for (const { day, pattern } of WEEKDAY_PATTERNS) {
    if (pattern.test(text)) {
      found.add(day);
    }
  }

  if (found.size > 0) {
    return WEEKDAYS.filter((d) => found.has(d));
  }

  // Fallback: check frequency mentions such as "3 days a week", "5x/week", "twice a week"
  const countMatch =
    text.match(/\b([1-7])\s*(?:days?|x|times?)\s*(?:a|per|\/)\s*(?:week|wk)\b/i) ||
    text.match(/\b([1-7])\s*days?\s*(?:split|program|plan)\b/i);
  if (countMatch) {
    const count = Math.min(7, Math.max(1, Number(countMatch[1])));
    return [...(DEFAULT_DAYS_BY_COUNT[count] || DEFAULT_DAYS_BY_COUNT[4])];
  }

  if (/\btwice\s+(?:a|per)\s+week\b/i.test(text)) {
    return [...DEFAULT_DAYS_BY_COUNT[2]];
  }
  if (/\bevery\s+day\b|\b7\s*days\b/i.test(text)) {
    return [...DEFAULT_DAYS_BY_COUNT[7]];
  }

  return [];
}

/**
 * Resolves the canonical ordered array of weekday names (e.g. ['Monday', 'Wednesday', 'Friday'])
 * from explicit user selection, onboarding text, existing program data, or standard split defaults.
 */
export function resolveWorkoutDays(options = {}) {
  const explicit =
    options.workoutDays ??
    options.workout_days ??
    options.trainingDays ??
    options.training_days ??
    options.macrocycle?.training_days;

  if (Array.isArray(explicit) && explicit.length > 0) {
    const sorted = sortWeekdays(explicit);
    if (sorted.length > 0) return sorted;
  } else if (typeof explicit === 'string' && explicit.trim()) {
    const parsedExplicit = parseWorkoutDaysFromText(explicit);
    if (parsedExplicit.length > 0) return parsedExplicit;
  }

  const combinedText = [
    options.requirements,
    options.training_requirements,
    options.goalDescription,
    options.primary_goal,
    options.goal,
  ]
    .filter(Boolean)
    .join(' ');

  const parsedFromText = parseWorkoutDaysFromText(combinedText);
  if (parsedFromText.length > 0) {
    return parsedFromText;
  }

  // Check if existing days already have explicit weekday names
  if (Array.isArray(options.existingDays) && options.existingDays.length > 0) {
    const fromExisting = sortWeekdays(
      options.existingDays.map((d) => extractWeekdayFromDayName(d?.day_name || '')).filter(Boolean)
    );
    if (fromExisting.length > 0) return fromExisting;

    const activeCount = options.existingDays.filter((d) => {
      const hasExercises = Array.isArray(d?.exercises) && d.exercises.length > 0;
      const isRest =
        d?.is_rest_day ||
        String(d?.workout_type || '').toLowerCase().includes('rest');
      return hasExercises && !isRest;
    }).length || options.existingDays.length;

    const clamped = Math.min(7, Math.max(1, activeCount));
    return [...(DEFAULT_DAYS_BY_COUNT[clamped] || DEFAULT_DAYS_BY_COUNT[4])];
  }

  const defaultCount = Math.min(7, Math.max(1, Number(options.defaultCount) || 4));
  return [...(DEFAULT_DAYS_BY_COUNT[defaultCount] || DEFAULT_DAYS_BY_COUNT[4])];
}

/**
 * Ensures every active day in a microcycle is labeled with its exact weekday name
 * (e.g. "Monday - Upper Push Hypertrophy") instead of generic "Day 1", "Day 2", etc.
 */
export function applyWorkoutDayNames(microcycle, workoutDaysInput = []) {
  if (!microcycle || !Array.isArray(microcycle.days) || microcycle.days.length === 0) {
    return microcycle;
  }

  const activeDays = microcycle.days.filter((d) => {
    const hasExercises = Array.isArray(d?.exercises) && d.exercises.length > 0;
    const isRest =
      d?.is_rest_day ||
      (String(d?.workout_type || '').toLowerCase().includes('rest') && !hasExercises);
    return !isRest;
  });

  const sourceDays = activeDays.length > 0 ? activeDays : microcycle.days;
  const resolvedDays = resolveWorkoutDays({
    workoutDays: workoutDaysInput,
    existingDays: sourceDays,
    defaultCount: sourceDays.length,
  });

  // Match/align sessions with the exact workout days selected by the user
  let targetDays = [];
  if (resolvedDays.length > 0) {
    for (let i = 0; i < resolvedDays.length; i++) {
      const weekday = resolvedDays[i];
      // Prefer an existing session that already mentions this weekday, otherwise positional
      const byWeekday = sourceDays.find(
        (d) => extractWeekdayFromDayName(d?.day_name || '') === weekday
      );
      const baseDay = byWeekday || sourceDays[i % sourceDays.length];
      const focus = resolveCleanDayFocus(baseDay);

      targetDays.push({
        ...baseDay,
        day_index: i,
        day_name: `${weekday} - ${focus}`,
      });
    }
  } else {
    targetDays = sourceDays.map((day, idx) => {
      const weekday =
        extractWeekdayFromDayName(day?.day_name || '') ||
        DEFAULT_DAYS_BY_COUNT[Math.min(7, sourceDays.length)]?.[idx] ||
        WEEKDAYS[idx % WEEKDAYS.length];
      const focus = resolveCleanDayFocus(day);
      return {
        ...day,
        day_index: idx,
        day_name: `${weekday} - ${focus}`,
      };
    });
  }

  return {
    ...microcycle,
    days: targetDays,
  };
}

const SYMPTOM_WORDS =
  '(?:pain|pains|painful|hurt|hurts|hurting|ache|aches|aching|sore|soreness|injur(?:y|ed|ies)|strain|strained|sprain|sprained|tear|torn|tendonitis|tendinitis|tendinopathy|impingement|bursitis|inflammation|inflamed|pinch|pinched|flare(?:d|\\s*up)?|discomfort|issue|issues|problem|problems|surgery|rehab|recovering|bad|weak|sensitive|bother(?:s|ing)?|aggravat(?:e|es|ing)|avoid|careful|broken|fracture|stiff|tight)';

function hasPartInjury(text = '', partPattern) {
  if (!text) return false;
  const clauses = String(text)
    .toLowerCase()
    .split(/[.,;\n!?]+|\band\b|\bbut\b/)
    .map((c) => c.trim())
    .filter(Boolean);

  const forward = new RegExp(`\\b${partPattern}\\b[^.?!;]{0,45}\\b${SYMPTOM_WORDS}\\b`, 'i');
  const backward = new RegExp(`\\b${SYMPTOM_WORDS}\\b[^.?!;]{0,45}\\b${partPattern}\\b`, 'i');

  return clauses.some((clause) => forward.test(clause) || backward.test(clause));
}

/**
 * Extracts structured training preferences (session duration, equipment constraints,
 * focus muscle priorities, and injury flags) from free-text onboarding responses.
 */
export function parseOnboardingPreferences(options = {}) {
  const equipmentText = String(options.equipment || options.available_equipment || '').toLowerCase();
  const reqText = [
    options.requirements,
    options.training_requirements,
    options.goalDescription,
    options.primary_goal,
    options.goal,
    options.notes,
  ]
    .filter(Boolean)
    .join('. ')
    .toLowerCase();
  const skillsText = String(options.currentSkills || options.current_skills || '').toLowerCase();
  const combinedSafetyText = [reqText, equipmentText, skillsText].filter(Boolean).join('. ');

  // Session duration (minutes)
  let sessionMinutes = null;
  const minMatch =
    reqText.match(/\b(\d{2,3})\s*(?:min|mins|minutes?)\b/) ||
    reqText.match(/\b(1(?:\.5)?|2)\s*(?:hr|hrs|hours?)\b/);
  if (minMatch) {
    const val = Number(minMatch[1]);
    sessionMinutes = /hr|hour/i.test(minMatch[0]) ? Math.round(val * 60) : val;
  }

  // Equipment capabilities
  const hasFullGym = /\bfull\s+gym|commercial\s+gym|gym\s+access|full\s+equipment|everything\b/.test(
    equipmentText
  );
  const bodyweightOnly =
    /\b(?:no\s+equipment|bodyweight\s+only|none|floor\s+only|nothing|calisthenics\s+only)\b/.test(
      equipmentText
    );
  const noBarbell =
    bodyweightOnly ||
    /\b(?:no\s+barbell|dumbbells?\s+only|home\s+gym.*dumbbells?|only\s+dumbbells?)\b/.test(
      equipmentText
    ) ||
    (!hasFullGym &&
      equipmentText.trim().length > 0 &&
      /\bdumbbells?\b/.test(equipmentText) &&
      !/\bbarbell|squat\s+rack|bench\s+press\s+rack\b/.test(equipmentText));
  const noCablesOrMachines =
    bodyweightOnly ||
    /\b(?:no\s+cables?|no\s+machines?|dumbbells?\s+only|home\s+gym)\b/.test(equipmentText) ||
    (!hasFullGym &&
      equipmentText.trim().length > 0 &&
      !/\bcable|machine|lat\s+pulldown|pulldown\b/.test(equipmentText));
  const noPullupBar =
    /\bno\s+pull[\s-]?up\s+bar|without\s+pull[\s-]?up\s+bar\b/.test(equipmentText + ' ' + reqText) ||
    bodyweightOnly;
  const noDipBars =
    /\bno\s+dip\s+bars?\b/.test(equipmentText + ' ' + reqText) || bodyweightOnly;
  const hasRings = /\brings?|gymnastic\s+rings?\b/.test(equipmentText);
  const hasBands = /\bbands?|resistance\s+bands?\b/.test(equipmentText);

  // Comprehensive injury / joint precaution detection
  const shoulderSensitive =
    hasPartInjury(combinedSafetyText, '(?:shoulders?|rotator\\s+cuff|deltoids?|delts?|acromion|ac\\s+joint|labrum)') ||
    /\bslow\s+on\s+pressing\b|\bshoulder\s+impingement\b|\bfrozen\s+shoulder\b|\brotator\s+cuff\b/.test(
      combinedSafetyText
    );

  const lowerBackSensitive =
    hasPartInjury(combinedSafetyText, '(?:lower\\s+back|lumbar|spine|spinal|disc|disks?|sciatica|si\\s+joint)') ||
    (/\bback\s+(?:pain|hurt|hurts|hurting|injur|strain|issue|problem|bad|sore)\b|\bhurt(?:s|ing)?\s+(?:my\s+)?back\b|\bbad\s+(?:lower\s+)?back\b/.test(
      combinedSafetyText
    ) &&
      !/\bupper\s+back\b/.test(combinedSafetyText)) ||
    /\bherniated\b|\bbulging\s+disc\b|\bsciatica\b|\bspinal\s+loading\b/.test(combinedSafetyText);

  const upperBackNeckSensitive =
    hasPartInjury(combinedSafetyText, '(?:neck|cervical|upper\\s+back|traps?|trapezius|rhomboids?)') ||
    /\bpinched\s+nerve\b/.test(combinedSafetyText);

  const kneeSensitive =
    hasPartInjury(combinedSafetyText, '(?:knees?|patella(?:r)?|meniscus|acl|mcl|pcl|lcl)') ||
    /\b(?:jumper|runner)'?s\s+knee\b|\bpatellar\s+tendonitis\b/.test(combinedSafetyText);

  const wristSensitive =
    hasPartInjury(combinedSafetyText, '(?:wrists?|carpal\\s+tunnel|tfcc|forearms?)') ||
    /\bcarpal\s+tunnel\b/.test(combinedSafetyText);

  const elbowSensitive =
    hasPartInjury(combinedSafetyText, '(?:elbows?|epicondylitis)') ||
    /\b(?:tennis|golfer)'?s\s+elbow\b/.test(combinedSafetyText);

  const hipSensitive =
    hasPartInjury(combinedSafetyText, '(?:hips?|hip\\s+flexors?|groin|piriformis|adductors?)') ||
    /\bhip\s+impingement\b/.test(combinedSafetyText);

  const ankleFootSensitive =
    hasPartInjury(combinedSafetyText, '(?:ankles?|achilles|plantar|foot|feet|calves|calf|shin|shins)') ||
    /\bplantar\s+fasciitis\b|\bshin\s+splints?\b|\bachilles\b/.test(combinedSafetyText);

  const chestPecSensitive =
    hasPartInjury(combinedSafetyText, '(?:chest|pecs?|pectorals?|sternum|costochondritis)');

  const bicepTricepSensitive =
    hasPartInjury(combinedSafetyText, '(?:biceps?|triceps?)');

  // Muscle priority detection
  const focusChest = !chestPecSensitive && /\b(?:chest|pecs?|pectorals?)\b/.test(reqText);
  const focusBack = !lowerBackSensitive && /\b(?:back|lats?|width|v-taper)\b/.test(reqText);
  const focusShoulders = !shoulderSensitive && /\b(?:shoulders?|delts?|deltoids?)\b/.test(reqText);
  const focusArms = /\b(?:arms?|biceps?|triceps?|forearms?)\b/.test(reqText);
  const focusLegs =
    !/\bno\s+legs?\b/.test(reqText) &&
    !kneeSensitive &&
    /\b(?:legs?|quads?|glutes?|hamstrings?|calves?)\b/.test(reqText);
  const focusCore = /\b(?:core|abs?|abdominals?|six[\s-]?pack|midsection)\b/.test(reqText);

  return {
    sessionMinutes,
    equipmentConstraints: {
      hasFullGym,
      bodyweightOnly,
      noBarbell,
      noCablesOrMachines,
      noPullupBar,
      noDipBars,
      hasRings,
      hasBands,
    },
    injuries: {
      shoulderSensitive,
      lowerBackSensitive,
      upperBackNeckSensitive,
      kneeSensitive,
      wristSensitive,
      elbowSensitive,
      hipSensitive,
      ankleFootSensitive,
      chestPecSensitive,
      bicepTricepSensitive,
    },
    focusAreas: {
      chest: focusChest,
      back: focusBack,
      shoulders: focusShoulders,
      arms: focusArms,
      legs: focusLegs,
      core: focusCore,
    },
    skillsText,
  };
}
