// Training type configurations
export const TRAINING_TYPES = [
  {
    value: 'calisthenics',
    label: 'Calisthenics',
    iconName: 'PersonStanding',
    desc: 'Bodyweight training focused on mastering skills like muscle-ups, handstands, planches, and levers. Progressive overload through harder variations, not added weight.',
    hasSkills: true,
    hasLevel: true,
    hasTimeframe: true,
    hasWeightGoals: false,
  },
  {
    value: 'weighted_calisthenics',
    label: 'Weighted Calisthenics',
    iconName: 'Dumbbell',
    desc: 'Bodyweight movements with added weight (dip belt, weighted vest) to build raw strength and push past plateaus. Combines skill work with loaded progressions for faster gains.',
    hasSkills: true,
    hasLevel: true,
    hasTimeframe: true,
    hasWeightGoals: false,
  },
  {
    value: 'weights',
    label: 'Weight Training',
    iconName: 'Trophy',
    desc: 'Traditional gym training with free weights, cables, and machines. Build muscle, strength, and aesthetics through progressive overload with iron. No skill work — pure hypertrophy and strength.',
    hasSkills: false,
    hasLevel: false,
    hasTimeframe: false,
    hasWeightGoals: true,
  },
  {
    value: 'hybrid',
    label: 'Hybrid Training',
    iconName: 'Layers',
    desc: 'The best of both worlds. Calisthenics skill work first when your CNS is fresh, then weight training at the end for maximal muscle growth. Weights are chosen to accelerate your calisthenics goals too.',
    hasSkills: true,
    hasLevel: true,
    hasTimeframe: true,
    hasWeightGoals: true,
  },
];

export const CALISTHENICS_GOALS = [
  { value: 'gain_muscle', label: 'Gain Muscle', iconName: 'Dumbbell' },
  { value: 'lose_weight', label: 'Lose Weight', iconName: 'Scale' },
  { value: 'get_stronger', label: 'Get Stronger', iconName: 'Trophy' },
  { value: 'improve_endurance', label: 'Improve Endurance', iconName: 'Wind' },
  { value: 'learn_skills', label: 'Learn Skills', iconName: 'Target' },
  { value: 'general_health', label: 'General Health', iconName: 'Heart' },
  { value: 'body_recomp', label: 'Body Recomp', iconName: 'PersonStanding' },
];

export const WEIGHT_GOALS = [
  { value: 'muscle_growth', label: 'Muscle Growth', iconName: 'Dumbbell' },
  { value: 'lose_weight', label: 'Lose Weight', iconName: 'Scale' },
  { value: 'gain_strength', label: 'Gain Strength', iconName: 'Trophy' },
  { value: 'body_recomp', label: 'Body Recomp', iconName: 'PersonStanding' },
  { value: 'aesthetics', label: 'Aesthetics', iconName: 'Sparkles' },
  { value: 'improve_endurance', label: 'Improve Endurance', iconName: 'Wind' },
  { value: 'general_health', label: 'General Health', iconName: 'Heart' },
];

// ------------------------------------------------------------
// Helper functions
// ------------------------------------------------------------

function buildAthleteProfile(data = {}) {
  const {
    gender,
    level,
    age,
    weightLbs,
    heightFt,
    heightIn,
    unit,
  } = data;

  const heightStr =
    unit === 'metric'
      ? `${heightFt || '?'}cm`
      : `${heightFt || '?'}'${heightIn || 0}"`;

  const weightStr =
    unit === 'metric'
      ? `${weightLbs || '?'}kg`
      : `${weightLbs || '?'}lbs`;

  return `ATHLETE: ${gender || 'unspecified'}${
    level ? `, ${level} level` : ''
  }, age ${age || '?'}, ${weightStr}, ${heightStr}`;
}

function buildGenderRules(gender) {
  if (gender === 'male') {
    return 'Male: volume-heavy, push/pull balance, scapular stability, strict form. Prioritize CNS recovery with adequate rest days.';
  }

  if (gender === 'female') {
    return 'Female: use individualized volume and intensity rather than assuming one fixed rep range. Prioritize posterior-chain development, core stability, hip mobility, controlled eccentrics, and recovery. Hormonal-cycle considerations should only be used when the athlete provides relevant information and wants it incorporated.';
  }

  return 'Gender-neutral: balanced approach, moderate volume, focus on form and progressive overload.';
}

function buildContext(data = {}) {
  const {
    currentSkills,
    goalDescription,
    timeframe,
    equipment,
    requirements,
    fitnessGoals,
    weightGoals,
  } = data;

  const parts = [buildAthleteProfile(data)];

  if (currentSkills) {
    parts.push(`CURRENT SKILLS: ${currentSkills}`);
  }

  if (fitnessGoals?.length) {
    parts.push(
      `GOALS: ${fitnessGoals.join(', ')}. ${goalDescription || ''}`
    );
  } else if (goalDescription) {
    parts.push(`GOALS: ${goalDescription}`);
  }

  if (weightGoals?.length) {
    parts.push(
      `WEIGHT TRAINING GOALS: ${weightGoals.join(', ')}`
    );
  }

  if (timeframe) {
    parts.push(`TIMEFRAME: ${timeframe}`);
  }

  if (equipment) {
    parts.push(`EQUIPMENT: ${equipment}`);
  }

  if (requirements) {
    parts.push(
      `REQUIREMENTS (time available, injuries, notes): ${requirements}`
    );
  }

  parts.push(
    `GENDER RULES: ${buildGenderRules(data.gender)}`
  );

  return parts.join('\n');
}

// ------------------------------------------------------------
// Shared output/schema instructions
// ------------------------------------------------------------

const OUTPUT_FORMAT = `OUTPUT: Generate ALL 12 microcycles. Each microcycle has week_number (1-12), mesocycle_index (0, 1, or 2), and days array. Each day has day_name, workout_type, and exercises array. Each exercise has name, sets (number), reps (string like "5" or "8-10" or "6s hold"), rest_seconds (number), notes (coaching cue string), and activation_cue (concise activation and form cue string — see Hunter Stein method).`;

const SCHEMA_INSTRUCTION = `Respond as a JSON object with this structure:
{
  "program_name": string,
  "duration_weeks": number,
  "macrocycle": {
    "overview": string,
    "phases": [
      {
        "name": string,
        "weeks": string,
        "focus": string
      }
    ]
  },
  "mesocycles": [
    {
      "name": string,
      "focus": string,
      "weeks": number,
      "intensity": string,
      "week_start": number,
      "week_end": number
    }
  ],
  "microcycles": [
    {
      "week_number": number,
      "mesocycle_index": number,
      "week_type": string,
      "days": [
        {
          "day_name": string,
          "workout_type": string,
          "exercises": [
            {
              "name": string,
              "sets": number,
              "reps": string,
              "rest_seconds": number,
              "notes": string,
              "activation_cue": string
            }
          ]
        }
      ]
    }
  ]
}`;

// ------------------------------------------------------------
// Hunter Stein activation method
// ------------------------------------------------------------

const HUNTER_STEIN_METHOD = `── HUNTER STEIN ACTIVATION METHOD (MANDATORY — INTEGRATE INTO EVERY EXERCISE ALONGSIDE ALL OTHER METHODS) ──
This method layers ON TOP of all other methods (submax, periodization, progressive overload). It is about achieving perfect muscle activation while being maximally explosive and efficient — without ever breaking form. This accelerates progress by ensuring every rep trains the nervous system correctly.

CORE PRINCIPLES:
1. PRE-ACTIVATION: Before each primary movement, engage the target muscle group — mentally and physically "turn on" the right muscles before moving.
2. EXPLOSIVE CONCENTRIC: On the lifting/pushing/pulling phase, move with MAXIMUM intent and speed — even under heavy load. Recruits high-threshold motor units and builds rate of force development.
3. CONTROLLED ECCENTRIC (2-3s negative): Never let gravity do the work. Eccentrics build tendon strength and stimulate muscle growth.
4. FULL-BODY TENSION: Brace core, squeeze glutes, pack shoulders. No energy leaks. Every rep looks identical to rep 1.
5. MIND-MUSCLE CONNECTION: Feel the target muscle on every rep. If you can't feel it, adjust position or reduce load.
6. PERFECT FORM ALWAYS: If form breaks, the set is over. One sloppy rep teaches bad neural patterning — non-negotiable.

ACTIVATION CUE (REQUIRED FOR EVERY EXERCISE): Each exercise must include an "activation_cue" field — a concise, specific, actionable instruction telling the athlete exactly how to engage the correct muscles and execute with perfect form. Examples:
- Pull-ups: "Depress and retract scapulae — think elbows to hips, not chin over bar"
- Push-ups: "Screw hands into the floor, squeeze glutes hard, pull chest toward hands"
- Handstand hold: "Push the floor away aggressively, protract shoulders fully, reach toes to ceiling"
- Muscle-up: "Aggressive hip pop, then pull elbows DOWN fast — not around the bar"
- Front Lever: "Depress scapulae hard, round upper back, pull bar to hips"

These cues must be movement-specific and immediately actionable — not generic platitudes.`;

const HUNTER_STEIN_WEIGHTS_NOTE = `WEIGHT TRAINING ADAPTATION: The Hunter Stein method was designed for calisthenics, but applies perfectly to weight training. For weighted movements:
- Pre-activation: Engage target muscle before the lift (flex lats before pulling, flex chest before pressing)
- Explosive concentric: Maximum bar speed intent on every rep, even if the bar moves slowly due to load
- Controlled eccentric: 2-3s negative on ALL compound lifts — never drop or bounce
- Full-body tension: Brace core, drive feet into floor, create torque (screw feet/hands outward)
- Perfect form: If bar path degrades or form breaks, terminate the set immediately
The activation_cue field is critical for compound lifts — it should tell the athlete exactly how to set up and maintain tension.`;

// ------------------------------------------------------------
// Mandatory leg training
// ------------------------------------------------------------

const LEG_TRAINING_MANDATE = `── LEG TRAINING — MANDATORY FOR ALL TRAINING TYPES ──
Unless the athlete has EXPLICITLY stated in their goals, requirements, or notes that they do NOT want leg training (e.g., "upper body only", "no legs", "skip legs"), you MUST include dedicated leg work throughout the program.

Do not treat legs as optional accessory work. Program lower-body training appropriate to the athlete's training type, goals, equipment, recovery capacity, and schedule.

For calisthenics, use bodyweight unilateral work, squats, split squats, lunges, Nordic progressions, hip thrust/bridge variations, calf work, and other appropriate bodyweight progressions.

For weighted calisthenics, use appropriate loaded lower-body movements in addition to bodyweight work when equipment allows.

For weights, use appropriate compound and isolation lower-body movements such as squats, deadlift variations, Romanian deadlifts, split squats, leg presses, hamstring curls, extensions, calves, and other movements appropriate to the athlete's equipment.

For hybrid training, balance lower-body strength/hypertrophy with calisthenics skill demands.

Never omit leg training simply because the athlete's primary goals emphasize the upper body unless the athlete explicitly requests that.`;

// ------------------------------------------------------------
// Program construction
// ------------------------------------------------------------

function getTrainingTypeRules(trainingType) {
  switch (trainingType) {
    case 'calisthenics':
      return `TRAINING TYPE: CALISTHENICS
- Prioritize bodyweight strength, skill acquisition, relative strength, mobility, and progressive exercise variations.
- Do not prescribe external weights unless the athlete's equipment/goals explicitly support weighted work.
- Skill work should generally be performed early in the session while the athlete is fresh.
- Use progressions/regressions appropriate to the athlete's level.
- Build toward the athlete's stated skills rather than randomly rotating advanced movements.`;

    case 'weighted_calisthenics':
      return `TRAINING TYPE: WEIGHTED CALISTHENICS
- Prioritize weighted pull-ups, weighted dips, loaded bodyweight movements, and skill-specific calisthenics.
- Skill work should generally occur before heavy loaded work when technical quality matters.
- Progress external load gradually while preserving full range of motion and strict technique.
- Include sufficient unweighted skill practice to maintain movement quality.`;

    case 'weights':
      return `TRAINING TYPE: WEIGHT TRAINING
- Prioritize free weights, cables, machines, and other available resistance equipment.
- Program progressive overload for strength and/or hypertrophy according to the athlete's goals.
- Use appropriate exercise selection, volume, intensity, rest periods, and movement patterns.
- Do not randomly insert calisthenics skill work unless the athlete specifically wants it.`;

    case 'hybrid':
      return `TRAINING TYPE: HYBRID
- Combine calisthenics skill/strength work with weight training.
- Place technically demanding calisthenics skill work earlier in sessions when appropriate.
- Use weight training to strengthen muscles and patterns that support the athlete's calisthenics goals.
- Balance fatigue carefully so weight training does not undermine skill quality.`;

    default:
      return `TRAINING TYPE: GENERAL FITNESS
- Use a balanced combination of strength, hypertrophy, conditioning, mobility, and recovery work appropriate to the athlete's goals and available equipment.`;
  }
}

function buildRecoveryRules() {
  return `── RECOVERY & FATIGUE MANAGEMENT ──
- Recovery is part of programming, not an afterthought.
- Do not automatically increase volume every week.
- Use progressive overload only when the athlete can reasonably recover from it.
- Distinguish productive training fatigue from accumulating fatigue.
- If performance is repeatedly declining, technique is deteriorating, soreness is unusually persistent, or the athlete reports poor recovery, reduce training stress before adding more.
- Use planned easier weeks/deloads where appropriate.
- A deload should reduce training stress while preserving movement patterns and technique.
- Do not prescribe a deload solely because a calendar says so if the athlete is progressing well and recovery is good.
- When a deload is used, typically reduce volume substantially and/or reduce intensity/load while maintaining quality technique.
- Never diagnose an injury or medical condition from training data.
- Persistent, severe, worsening, or unusual pain should be referred to an appropriate healthcare professional.`;
}

function buildAdaptationRules(adaptationHistory = []) {
  if (!Array.isArray(adaptationHistory) || adaptationHistory.length === 0) {
    return `ADAPTIVE PROGRAMMING:
No previous workout edits have been recorded yet. Build the initial program from the athlete profile and goals.`;
  }

  const recentHistory = adaptationHistory
    .slice(-40)
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object') {
        return '';
      }

      const parts = [
        item.date ? `date=${item.date}` : '',
        item.action ? `action=${item.action}` : '',
        item.exercise ? `exercise=${item.exercise}` : '',
        item.from ? `from=${item.from}` : '',
        item.to ? `to=${item.to}` : '',
        item.field ? `field=${item.field}` : '',
        item.oldValue !== undefined
          ? `old=${item.oldValue}`
          : '',
        item.newValue !== undefined
          ? `new=${item.newValue}`
          : '',
      ].filter(Boolean);

      return parts.join(', ');
    })
    .filter(Boolean)
    .join('\n');

  return `── ADAPTIVE PROGRAMMING — LEARN FROM THE ATHLETE'S EDITS ──
The athlete has previously modified programmed workouts. Treat repeated edits as useful preference/performance feedback.

PREVIOUS WORKOUT EDIT HISTORY:
${recentHistory}

ADAPTATION RULES:
- If the athlete repeatedly removes an exercise, do not repeatedly reintroduce the same exercise without a clear reason.
- If the athlete repeatedly replaces an exercise with another movement, favor the replacement when it still satisfies the training goal.
- If the athlete consistently increases or decreases sets, reps, or rest, use that pattern as evidence about appropriate training dose.
- Do not blindly copy every single edit. Interpret the pattern and preserve sound programming principles.
- Do not remove a necessary movement pattern simply because of one isolated edit.
- Use the history to make future programs feel progressively more personalized.
- If an edit conflicts with an explicit injury restriction, safety concern, or the athlete's current goals, prioritize the current safety/goal information.`;
}

function buildProgramPrompt(
  trainingType,
  data = {},
  adaptationHistory = []
) {
  const context = buildContext(data);

  return `You are Kael, an expert ${
    trainingType || 'fitness'
  } coach and program designer.

${context}

${getTrainingTypeRules(trainingType)}

${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

${HUNTER_STEIN_WEIGHTS_NOTE}

${buildRecoveryRules()}

${buildAdaptationRules(adaptationHistory)}

── PROGRAM DESIGN RULES ──
1. Build a coherent 12-week macrocycle, not 12 unrelated weeks.
2. Use progressive overload appropriate to the athlete and training type.
3. Progress exercise difficulty, load, reps, sets, density, or quality strategically.
4. Do not increase every variable simultaneously.
5. Include appropriate recovery days.
6. Include deload/reduced-fatigue periods when justified by the program structure and athlete context.
7. Respect available equipment.
8. Respect stated restrictions and requirements.
9. Avoid unnecessary exercise duplication.
10. Maintain balanced movement patterns.
11. Skill-heavy work should receive appropriate recovery and technical practice.
12. Do not use arbitrary advanced exercises simply to make the program look impressive.
13. Every exercise must have a specific activation_cue.
14. Sets must be numeric.
15. Reps must be a string.
16. Rest must be expressed in seconds.
17. Keep exercise notes concise but useful.
18. Make the program realistic for the athlete's stated schedule and experience.

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

// ------------------------------------------------------------
// Public program prompt
// ------------------------------------------------------------

export function buildProgramPromptForAI(
  trainingType,
  data = {},
  adaptationHistory = []
) {
  return buildProgramPrompt(
    trainingType,
    data,
    adaptationHistory
  );
}

// ------------------------------------------------------------
// Mesocycle / microcycle prompts
// ------------------------------------------------------------

export function buildMesocyclePrompt(
  trainingType,
  data = {},
  mesocycleIndex = 0,
  adaptationHistory = []
) {
  const baseRules = buildProgramPrompt(
    trainingType,
    data,
    adaptationHistory
  )
    .replace(OUTPUT_FORMAT, '')
    .replace(SCHEMA_INSTRUCTION, '');

  const weekStart =
    mesocycleIndex * 4 + 1;

  const weekEnd =
    weekStart + 3;

  const mesocycleNames = [
    {
      name: 'Foundation & Accumulation',
      focus:
        'Build movement quality, work capacity, technical consistency, and a strong base for progression.',
      intensity: 'moderate',
    },
    {
      name: 'Intensification & Progression',
      focus:
        'Increase training stimulus through appropriate load, difficulty, volume, or intensity while maintaining recovery.',
      intensity: 'moderate to high',
    },
    {
      name: 'Peak & Specialization',
      focus:
        'Emphasize the athlete’s primary goals and skills while managing fatigue and expressing accumulated adaptations.',
      intensity: 'high with strategic fatigue management',
    },
  ];

  const mesocycle =
    mesocycleNames[
      mesocycleIndex
    ] || mesocycleNames[0];

  return `${baseRules}

MESOCYCLE:
Name: ${mesocycle.name}
Weeks: ${weekStart}-${weekEnd}
Focus: ${mesocycle.focus}
Intensity: ${mesocycle.intensity}

Generate the programming for this four-week mesocycle.

Each week must meaningfully progress from the previous week while respecting recovery.

Week ${weekEnd} may be a reduced-fatigue/deload week when justified by the athlete's training status and the overall 12-week structure.

OUTPUT: Return ONLY a JSON object containing:
{
  "mesocycle": {
    "name": "${mesocycle.name}",
    "focus": "${mesocycle.focus}",
    "weeks": 4,
    "intensity": "${mesocycle.intensity}",
    "week_start": ${weekStart},
    "week_end": ${weekEnd}
  },
  "microcycles": [
    {
      "week_number": number,
      "mesocycle_index": ${mesocycleIndex},
      "week_type": string,
      "days": [
        {
          "day_name": string,
          "workout_type": string,
          "exercises": [
            {
              "name": string,
              "sets": number,
              "reps": string,
              "rest_seconds": number,
              "notes": string,
              "activation_cue": string
            }
          ]
        }
      ]
    }
  ]
}`;
}

export function buildMicrocyclePrompt(
  trainingType,
  data = {},
  mesocycleIndex = 0,
  mesocycle = null,
  adaptationHistory = []
) {
  const baseRules = buildProgramPrompt(
    trainingType,
    data,
    adaptationHistory
  )
    .replace(OUTPUT_FORMAT, '')
    .replace(SCHEMA_INSTRUCTION, '');

  const weekStart =
    mesocycle?.week_start ||
    (mesocycleIndex * 4 + 1);

  const weekEnd =
    mesocycle?.week_end ||
    (mesocycleIndex * 4 + 4);

  return `${baseRules}

OUTPUT: Generate ONLY ${
    weekEnd - weekStart + 1
  } weekly microcycles for MESOCYCLE ${
    mesocycleIndex + 1
  }: "${mesocycle?.name || `Mesocycle ${mesocycleIndex + 1}`}" (focus: ${
    mesocycle?.focus || 'progressive development'
  }, intensity: ${
    mesocycle?.intensity || 'moderate'
  }). These cover weeks ${weekStart} to ${weekEnd}.

Each microcycle has week_number (${weekStart}-${weekEnd}), mesocycle_index (${mesocycleIndex}), week_type, and days array.

Each day has day_name, workout_type, and exercises array.

Each exercise has name, sets (number), reps (string), rest_seconds (number), notes (coaching cue string), and activation_cue (concise activation and form cue string).

Respond as a JSON object with this structure:
{
  "microcycles": [
    {
      "week_number": number,
      "mesocycle_index": number,
      "week_type": string,
      "days": [
        {
          "day_name": string,
          "workout_type": string,
          "exercises": [
            {
              "name": string,
              "sets": number,
              "reps": string,
              "rest_seconds": number,
              "notes": string,
              "activation_cue": string
            }
          ]
        }
      ]
    }
  ]
}`;
}

// ------------------------------------------------------------
// Backwards-compatible weekly prompt
// ------------------------------------------------------------

export function buildWeekPrompt(
  trainingType,
  data = {},
  weekNumber = 1,
  adaptationHistory = []
) {
  const safeWeek = Math.min(
    12,
    Math.max(
      1,
      Number(weekNumber) || 1
    )
  );

  const mesocycleIndex =
    Math.floor(
      (safeWeek - 1) / 4
    );

  const mesocycle = {
    name:
      mesocycleIndex === 0
        ? 'Foundation & Accumulation'
        : mesocycleIndex === 1
          ? 'Intensification & Progression'
          : 'Peak & Specialization',
    focus:
      mesocycleIndex === 0
        ? 'Foundation and adaptation'
        : mesocycleIndex === 1
          ? 'Intensification and progression'
          : 'Peak and specialization',
    intensity:
      safeWeek % 4 === 0
        ? 'deload / reduced fatigue'
        : 'moderate to high',
    week_start: safeWeek,
    week_end: safeWeek,
  };

  const baseRules = buildProgramPrompt(
    trainingType,
    data,
    adaptationHistory
  )
    .replace(OUTPUT_FORMAT, '')
    .replace(SCHEMA_INSTRUCTION, '');

  return `${baseRules}

OUTPUT: Return ONLY a JSON object containing ONE weekly microcycle for week ${safeWeek}.
The microcycle must use mesocycle_index ${mesocycleIndex} and week_type appropriate for the week.

Each day has day_name, workout_type, and exercises array.
Each exercise has name, sets (number), reps (string), rest_seconds (number), notes (coaching cue string), and activation_cue (concise activation and form cue string).

Respond with exactly this structure:
{
  "microcycle": {
    "week_number": ${safeWeek},
    "mesocycle_index": ${mesocycleIndex},
    "week_type": string,
    "days": [
      {
        "day_name": string,
        "workout_type": string,
        "exercises": [
          {
            "name": string,
            "sets": number,
            "reps": string,
            "rest_seconds": number,
            "notes": string,
            "activation_cue": string
          }
        ]
      }
    ]
  }
}

Do not return a microcycles array. Return the singular microcycle object shown above.`;
}

// ------------------------------------------------------------
// Kael system prompt
// ------------------------------------------------------------

export function getKaelSystemPrompt(
  trainingType,
  firstName,
  isElite = false
) {
  const typeContext = {
    calisthenics:
      'elite-level calisthenics coach',
    weighted_calisthenics:
      'elite-level weighted calisthenics coach',
    weights:
      'elite-level weight training and strength coach',
    hybrid:
      'elite-level hybrid training coach (calisthenics + weights)',
  };

  const typeDesc = {
    calisthenics:
      'You specialize in bodyweight skill training — muscle-ups, handstands, planches, levers, and all calisthenics progressions.',
    weighted_calisthenics:
      'You specialize in weighted bodyweight training — adding load to pull-ups, dips, and other movements for maximum strength gains while pursuing skills.',
    weights:
      'You specialize in weight training — hypertrophy, strength, powerlifting, bodybuilding, and aesthetics with free weights, cables, and machines.',
    hybrid:
      'You specialize in combining calisthenics skill work with weight training — structuring sessions to maximize both skill acquisition and muscle/strength growth.',
  };

  const eliteRules = isElite
    ? `

ELITE COACHING LAYER — ACTIVE:
The athlete has Elite access. Provide the additional depth promised by the Elite plan when it is relevant to the question.

SECRET TIPS RULE:
Whenever the user asks HOW to do something — a movement, skill, technique, exercise, or training method — include at least one genuine insider coaching detail when one is relevant.

An elite tip should be:
- Specific
- Actionable
- Biomechanically plausible
- Useful in actual training
- More nuanced than generic internet advice

Examples include:
- Specific tension cues
- Breathing/bracing timing
- Scapular positioning
- Micro-adjustments in body position
- Grip or wrist positioning
- Tempo changes
- Fatigue-management strategies
- Technical sequencing

Label it clearly with:
"🔐 Elite tip:"
or
"⚡ Secret:"

Do not fabricate a claim simply to make the advice sound exclusive.

RECOVERY & DELOAD RULE — ELITE ONLY:
When the athlete asks about recovery, fatigue, soreness, performance drops, overreaching, sleep, rest days, or whether they should deload, provide deeper coaching guidance rather than generic "rest more" advice.

Use the athlete's available recent training context to determine whether:
- Current fatigue is normal
- Training load should stay the same
- Volume should decrease
- Intensity/load should decrease
- Additional recovery days are appropriate
- A deload is justified
- Technique work can remain while fatigue-producing work is reduced

When recommending a deload, make the recommendation concrete. Explain what should change — for example, reducing sets, reducing load/intensity, increasing rest, or limiting training close to failure — and explain how to return to normal training.

Do not automatically prescribe a deload just because the athlete feels somewhat tired.

If the athlete describes persistent, severe, unusual, or worsening pain, neurological symptoms, chest pain, fainting, or another concerning symptom, do not diagnose it. Recommend appropriate medical evaluation.

Label deeper recovery guidance clearly with:
"🛡️ Elite recovery:"
or
"🔋 Recovery call:"

NUTRITION INSIGHT RULE — ELITE:
When nutrition is relevant, you may connect training performance, recovery, protein intake, carbohydrate availability, hydration, and calorie consistency. Do not invent logged intake or medical diagnoses.`
    : '';

  return `You are Kael, an ${
    typeContext[trainingType] ||
    'elite-level fitness coach'
  }${
    firstName
      ? ` — your athlete's name is ${firstName}`
      : ''
  }. You have trained world-class street workout athletes, gymnasts, powerlifters, bodybuilders, and elite military operators.

You can answer questions about ANY form of training — calisthenics, weighted calisthenics, weight training, or hybrid combinations. ${
    typeDesc[trainingType] || ''
  } When the athlete asks about a training type outside your primary specialty, still give expert advice — you are knowledgeable across all modalities.

PERSONALITY: Direct, real, no BS. Like a coach who actually knows their stuff and respects the athlete enough to tell them the truth. Friendly but not fluffy. Get to the point.

RESPONSE STYLE: 2-4 sentences max unless a structured breakdown is truly needed. No long intros. No generic advice.

COACHING RULES:
- Personalize advice to the athlete's stated goals and training type.
- Prefer practical recommendations over theory.
- Do not invent workout history, measurements, or results that the athlete has not provided.
- When discussing progression, explain what the athlete should actually do next.
- Prioritize technique and sustainable progression over ego lifting.
- Do not encourage training through significant pain.
- Never diagnose medical conditions.
${eliteRules}

Only use their name occasionally when it feels natural — not every message.`;
}

// ------------------------------------------------------------
// Progress photo analysis prompt
// ------------------------------------------------------------

export function getProgressPhotoPrompt(
  trainingType,
  firstName,
  prevContext,
  equipment
) {
  const exerciseGuidance = {
    calisthenics:
      'For any muscle groups that appear underdeveloped or lagging, recommend CALISTHENICS exercises (not weights or machines) that target those specific muscles. For example: for weak shoulders → Pike push-ups, Wall handstand holds, Pike push-up negatives; for weak back → Australian rows, Dead hangs, Scapular pull-ups; for weak chest → Push-up variations, Ring push-ups. Never recommend gym equipment, dumbbells, barbells, or machines.',

    weighted_calisthenics:
      'For any muscle groups that appear underdeveloped or lagging, recommend WEIGHTED CALISTHENICS exercises that target those specific muscles. For example: for weak back → Weighted pull-ups, weighted Australian rows; for weak chest → Weighted dips, weighted push-ups; for weak shoulders → Weighted pike push-ups. You can also recommend bodyweight variations, but prioritize loaded progressions.',

    weights:
      `For any muscle groups that appear underdeveloped or lagging, recommend WEIGHT TRAINING exercises using the athlete's available equipment (${
        equipment ||
        'dumbbells, barbells, cables, machines'
      }). For example: for weak shoulders → Overhead press, lateral raises; for weak back → Lat pulldowns, barbell rows; for weak chest → Bench press, cable flyes. Only recommend exercises they can do with their equipment. Never recommend calisthenics or bodyweight exercises.`,

    hybrid:
      `For any muscle groups that appear underdeveloped or lagging, recommend a MIX of calisthenics AND weight training exercises that complement each other. Start with calisthenics options, then add weight training exercises that build the same muscles. Consider their available equipment: ${
        equipment || 'standard gym equipment'
      }. For example: for weak back → Pull-ups + barbell rows; for weak shoulders → Handstand holds + overhead press; for weak chest → Dips + bench press.`,
  };

  const coachTitle = {
    calisthenics: 'calisthenics',
    weighted_calisthenics:
      'weighted calisthenics',
    weights: 'weight training',
    hybrid: 'hybrid training',
  };

  return `You are Kael, ${
    firstName || 'the athlete'
  }'s personal ${
    coachTitle[trainingType] || 'fitness'
  } coach.

Review this physique photo and give ${
    firstName || 'the athlete'
  } direct, genuine, personalized feedback — like a real coach would. Not clinical, not generic.

IMPORTANT BODY-FAT ESTIMATION LIMITATIONS:
- A photograph cannot establish an exact body-fat percentage.
- Give a visual ESTIMATE only.
- Provide a reasonable range rather than pretending the result is laboratory accurate.
- The midpoint is an estimate for graphing only.
- Do not claim medical or diagnostic accuracy.
- If lighting, pose, clothing, image quality, or camera angle makes estimation unreliable, say so.

${prevContext || ''}

Provide:
1. An estimated body fat percentage RANGE, such as "14-17%"
2. A numeric midpoint for graphing, such as 15.5
3. Specific visual insights — address ${
    firstName || 'the athlete'
  } directly. What muscles appear developed? Where is there visible progress? What areas visually lag behind? If there is a previous photo, compare only visible changes and explain that photo conditions can affect the comparison.
4. ${
    exerciseGuidance[trainingType] ||
    exerciseGuidance.calisthenics
  }`;
}
