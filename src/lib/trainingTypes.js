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
    desc: 'Bodyweight movements with added weight (dip belt, weighted vest) to build raw strength and push past plateaus.',
    hasSkills: true,
    hasLevel: true,
    hasTimeframe: true,
    hasWeightGoals: false,
  },
  {
    value: 'weights',
    label: 'Weight Training',
    iconName: 'Trophy',
    desc: 'Traditional gym training with free weights, cables, and machines. Build muscle, strength, and aesthetics through progressive overload.',
    hasSkills: false,
    hasLevel: false,
    hasTimeframe: false,
    hasWeightGoals: true,
  },
  {
    value: 'hybrid',
    label: 'Hybrid Training',
    iconName: 'Layers',
    desc: 'A combination of calisthenics and weight training, selected according to the athlete’s actual goals and available equipment.',
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

// ─────────────────────────────────────────────
// Athlete/context helpers
// ─────────────────────────────────────────────

function buildAthleteProfile(data) {
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
    return 'Female: use appropriate rep ranges and moderate intensity based on the selected goals, prioritize posterior chain, core stability, hip mobility, controlled eccentrics, and recovery. Do not make assumptions that override the athlete’s stated goals or requirements.';
  }

  return 'Gender-neutral: balanced approach, moderate volume, focus on form and progressive overload.';
}

/*
 * IMPORTANT:
 * This function is deliberately strict.
 *
 * The training type tells the generator WHAT MODALITIES are available.
 * The user's selected goals determine WHAT the program is actually trying
 * to accomplish.
 *
 * In particular:
 * - Training type does NOT automatically mean skill training.
 * - "currentSkills" describes the athlete's ability; it does NOT authorize
 *   programming those skills.
 * - learn_skills is the explicit permission to program calisthenics skills.
 */
function buildGoalRules(data) {
  const fitnessGoals = Array.isArray(data.fitnessGoals)
    ? data.fitnessGoals
    : [];

  const weightGoals = Array.isArray(data.weightGoals)
    ? data.weightGoals
    : [];

  const allGoals = [...fitnessGoals, ...weightGoals];

  const hasSkillGoal = allGoals.includes('learn_skills');

  const goalDescriptions = [];

  if (fitnessGoals.length) {
    goalDescriptions.push(
      `CALISTHENICS GOALS SELECTED BY ATHLETE: ${fitnessGoals.join(', ')}`
    );
  }

  if (weightGoals.length) {
    goalDescriptions.push(
      `WEIGHT TRAINING GOALS SELECTED BY ATHLETE: ${weightGoals.join(', ')}`
    );
  }

  if (data.goalDescription) {
    goalDescriptions.push(
      `ATHLETE'S ADDITIONAL GOAL DESCRIPTION: ${data.goalDescription}`
    );
  }

  if (hasSkillGoal) {
    goalDescriptions.push(`
SKILL TRAINING AUTHORIZED:
The athlete explicitly selected "learn_skills".
Skill training may therefore be included, but ONLY for skills that are relevant
to the athlete's stated goals, current ability, equipment, and requirements.
Do not add unrelated skills simply because the athlete chose calisthenics,
weighted calisthenics, or hybrid training.
`);
  } else {
    goalDescriptions.push(`
SKILL TRAINING NOT AUTHORIZED:
The athlete did NOT select "learn_skills".

DO NOT PROGRAM:
- muscle-up practice
- handstand practice
- planche practice
- front lever practice
- back lever practice
- human flag practice
- L-sit skill practice
- skill-specific holds
- skill-specific progressions
- skill acquisition drills
- any other movement whose primary purpose is learning/mastering a calisthenics skill

The fact that the athlete selected calisthenics, weighted calisthenics, or hybrid
training DOES NOT authorize skill training.

Instead, use normal progressive overload appropriate to the selected goals:
- harder exercise variations
- more repetitions
- additional sets when appropriate
- greater range of motion
- improved leverage
- slower eccentrics
- controlled pauses
- increased training density
- additional external load when equipment permits
- improved technique and execution

Choose the progression method that best serves the athlete's actual goals.
`);
  }

  return `
=== ATHLETE GOALS ARE THE PRIMARY PROGRAMMING AUTHORITY ===

${goalDescriptions.join('\n')}

The program must be built around the athlete's explicitly selected goals.
Do not substitute the generic characteristics of the selected training type
for the athlete's actual goals.

If multiple goals are selected, balance them intelligently according to:
1. The explicitly selected goals.
2. The athlete's stated goal description.
3. Available equipment.
4. Injuries and limitations.
5. Experience/level.
6. Recovery and time constraints.

Never introduce a major training objective that the athlete did not request.
`;
}

function buildEquipmentRules(data) {
  const equipment = data.equipment?.trim();

  return `
=== EQUIPMENT IS A HARD CONSTRAINT ===

AVAILABLE EQUIPMENT:
${equipment || 'No specific equipment was provided.'}

ONLY prescribe exercises that can actually be performed with the equipment
listed above or with normal bodyweight.

NEVER assume access to:
- barbells
- dumbbells
- cables
- machines
- pull-up bars
- dip bars
- rings
- resistance bands
- benches
- squat racks
- specialty equipment

unless that equipment is actually available to the athlete.

If an exercise normally requires equipment the athlete does not have, replace it
with an appropriate alternative that requires only available equipment.

Do not list an unavailable piece of equipment in an exercise name, notes,
activation cue, or progression.
`;
}

function buildInjuryRules(data) {
  return `
=== INJURIES, LIMITATIONS, AND PERSONAL REQUIREMENTS ARE HARD CONSTRAINTS ===

ATHLETE REQUIREMENTS / INJURIES / NOTES:
${data.requirements?.trim() || 'None provided.'}

Every injury, limitation, restriction, pain-related instruction, and specific
requirement written by the athlete must be respected.

Do not prescribe an exercise that directly conflicts with a stated restriction.

When a movement pattern is limited:
- substitute an appropriate movement;
- reduce range of motion when appropriate;
- reduce load when appropriate;
- use a safer progression;
- adjust volume or frequency when necessary.

Never ignore an injury simply because an exercise would otherwise fit the
training type.

Never invent an injury that the athlete did not report.
`;
}

function buildScheduleRules(data) {
  return `
=== ATHLETE SCHEDULE / PRACTICAL CONSTRAINTS ===

TIMEFRAME:
${data.timeframe || 'Not specified.'}

REQUIREMENTS:
${data.requirements || 'Not specified.'}

The program must fit the athlete's stated schedule and practical limitations.
Do not create more training volume, training days, or session demands than the
athlete can reasonably perform according to their supplied information.
`;
}

function buildContext(data) {
  const {
    currentSkills,
    timeframe,
    fitnessGoals,
    weightGoals,
  } = data;

  const parts = [
    buildAthleteProfile(data),
  ];

  if (currentSkills) {
    parts.push(
      `CURRENT ABILITIES / SKILLS: ${currentSkills}`
    );
  }

  parts.push(buildGoalRules(data));

  if (fitnessGoals?.length) {
    parts.push(
      `GOAL VALUES: ${fitnessGoals.join(', ')}`
    );
  }

  if (weightGoals?.length) {
    parts.push(
      `WEIGHT GOAL VALUES: ${weightGoals.join(', ')}`
    );
  }

  if (timeframe) {
    parts.push(`TIMEFRAME: ${timeframe}`);
  }

  if (data.equipment) {
    parts.push(`EQUIPMENT: ${data.equipment}`);
  }

  if (data.requirements) {
    parts.push(
      `REQUIREMENTS: ${data.requirements}`
    );
  }

  parts.push(
    buildGenderRules(data.gender)
  );

  parts.push(
    buildEquipmentRules(data)
  );

  parts.push(
    buildInjuryRules(data)
  );

  parts.push(
    buildScheduleRules(data)
  );

  return parts.join('\n');
}

// ─────────────────────────────────────────────
// Universal programming rules
// ─────────────────────────────────────────────

const UNIVERSAL_PROGRAM_RULES = `
=== NON-NEGOTIABLE PROGRAMMING RULES ===

1. USER SPECIFICATIONS OVERRIDE GENERIC TRAINING-TYPE DEFAULTS

The athlete's actual selections and written specifications are authoritative.

Never allow a generic "calisthenics", "weighted calisthenics", "weights", or
"hybrid" template to override what the athlete actually requested.

The program must match:
- selected training type
- selected goals
- written goal description
- equipment
- injuries
- physical limitations
- requirements
- experience/level
- timeframe
- schedule
- current ability
- any other information explicitly supplied by the athlete.

2. DO NOT ADD UNREQUESTED OBJECTIVES

Do not add skill acquisition, bodybuilding specialization, maximal strength
training, endurance training, weight loss circuits, or any other major objective
unless it is supported by the athlete's selected goals or written requirements.

3. SKILL GATE

Skill training is allowed ONLY when "learn_skills" is explicitly selected.

Training type alone is NEVER sufficient permission for skill training.

If "learn_skills" is absent:
- no skill practice;
- no skill holds;
- no skill progressions;
- no skill acquisition drills.

For calisthenics or weighted calisthenics without learn_skills, progression must
come from ordinary progressive overload.

4. CURRENT SKILLS ARE NOT GOALS

"CURRENT SKILLS" only tells you what the athlete can currently perform.
It does not mean the athlete wants to improve those skills.

Never turn an existing ability into a training objective unless the athlete's
selected goals authorize it.

5. GOAL-SPECIFIC PROGRESSIVE OVERLOAD

When skills are not authorized, progress according to the actual goals.

For strength:
- harder variations
- heavier resistance when available
- lower appropriate rep ranges
- higher quality repetitions
- progressive loading

For muscle growth:
- appropriate hypertrophy rep ranges
- sufficient weekly volume
- additional sets when appropriate
- harder variations
- progressive resistance
- controlled eccentrics
- full range of motion

For endurance:
- higher appropriate repetition volume
- density
- shorter appropriate rests
- longer work intervals
- repeated submaximal efforts

For weight loss:
- preserve/build muscle while increasing appropriate training density
- use circuits only when appropriate
- do not sacrifice strength or injury safety for unnecessary conditioning

For body recomposition:
- combine appropriate resistance training volume with progressive overload
- prioritize muscle retention/growth

For aesthetics:
- prioritize the muscle groups and proportions relevant to the stated goal
- use appropriate hypertrophy/isolation work where equipment permits

For general health:
- balanced full-body training
- manageable volume
- strength, mobility, conditioning, and recovery as appropriate

6. PROGRESSION MUST BE LOGICAL

Every week should have a logical relationship to the previous week.

Progress through one or more appropriate variables:
- resistance
- reps
- sets
- range of motion
- exercise difficulty
- leverage
- tempo
- pauses
- density
- duration

Do not randomly change exercises merely to make weeks look different.

Do not increase multiple stress variables aggressively at the same time.

7. DO NOT OVER-PROGRAM

Exercise selection must serve the goals.

Do not add exercises merely because they are popular or because they belong to
the selected training type.

8. EQUIPMENT COMPLIANCE

Every exercise must be physically possible using the athlete's supplied
equipment.

9. INJURY COMPLIANCE

Every exercise must be compatible with the athlete's stated injuries,
limitations, and requirements.

10. LEGS

Leg training is mandatory unless the athlete themselves explicitly writes that
they do not want leg training.

There is NO "legs" option that needs to be selected.

If the athlete has not explicitly said:
- no legs
- no leg training
- upper body only
- skip legs
- avoid leg training
or an equivalent instruction,

then every week MUST contain meaningful lower-body training.

Leg programming should address the major lower-body musculature as appropriate:
- quadriceps
- hamstrings
- glutes
- calves

Leg training must still respect equipment, injuries, goals, level, and recovery.

Do not omit legs simply because the athlete selected calisthenics,
weighted calisthenics, weights, hybrid, upper-body-oriented goals, or skills.

11. EXPLICIT NO-LEG REQUEST

Only an explicit written request from the athlete can remove leg training.

Do not infer "no legs" from:
- upper-body goals
- calisthenics goals
- lack of a leg goal
- preferred exercises
- training type

12. FINAL COMPLIANCE CHECK

Before producing the JSON, internally verify EVERY week and EVERY exercise:

[ ] Does this serve at least one selected goal?
[ ] Is it compatible with the selected training type?
[ ] Is the required equipment available?
[ ] Does it respect every stated injury/limitation?
[ ] Does it respect the athlete's level?
[ ] Does it respect the athlete's schedule/time constraints?
[ ] Is skill training explicitly authorized?
[ ] If skill training is not authorized, are there ZERO skill exercises?
[ ] Is progression logical?
[ ] Are legs included unless explicitly prohibited?
[ ] Are quads, hamstrings, glutes, and calves addressed appropriately?
[ ] Is the total volume recoverable?
[ ] Does the program actually match the athlete rather than a generic template?

If any answer is NO, fix the program before returning it.
`;

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

// ─────────────────────────────────────────────
// Hunter Stein method
// ─────────────────────────────────────────────

const HUNTER_STEIN_METHOD = `
=== HUNTER STEIN ACTIVATION METHOD ===

Integrate this method into every exercise alongside the athlete's actual goals
and all other programming rules.

1. PRE-ACTIVATION
Before each primary movement, consciously engage the target muscle group.

2. EXPLOSIVE CONCENTRIC
When appropriate and safe, move with maximum intent during the concentric phase.

3. CONTROLLED ECCENTRIC
Use a controlled 2-3 second eccentric on appropriate resistance exercises.
Do not force tempo where it conflicts with the goal, movement, or injury status.

4. FULL-BODY TENSION
Brace appropriately, maintain joint position, and eliminate unnecessary energy
leaks.

5. MIND-MUSCLE CONNECTION
Feel the target musculature and maintain the intended movement pattern.

6. PERFECT FORM
If form deteriorates, the set ends or the load/variation is reduced.

ACTIVATION CUE:
Every exercise must contain a movement-specific activation_cue.

The cue must tell the athlete exactly what to engage and what to do.

Avoid generic cues such as "use good form."
`;

// ─────────────────────────────────────────────
// Leg mandate
// ─────────────────────────────────────────────

const LEG_TRAINING_MANDATE = `
=== LOWER-BODY MANDATE ===

Unless the athlete explicitly writes that they do not want leg training,
leg training is REQUIRED every week.

There is no selectable "leg goal." Legs are included by default.

Every week should contain meaningful lower-body work covering:
- quads
- hamstrings
- glutes
- calves

Use the appropriate exercises for the athlete's training type, equipment,
goals, level, and injuries.

CALISTHENICS examples:
- squats
- split squats
- Bulgarian split squats
- reverse lunges
- walking lunges
- pistol squat progressions
- shrimp squat progressions
- Nordic curl progressions
- sliding leg curls where equipment permits
- glute bridges
- single-leg glute bridges
- calf raises

WEIGHTED CALISTHENICS examples:
- weighted squats
- weighted split squats
- weighted Bulgarian split squats
- weighted lunges
- weighted step-ups
- weighted calf raises
- Nordic curls
- weighted glute bridges

WEIGHT TRAINING examples:
- squats
- front squats
- Romanian deadlifts
- deadlifts where appropriate
- leg press
- leg extensions
- leg curls
- lunges
- Bulgarian split squats
- hip thrusts
- calf raises

HYBRID:
Use the appropriate combination of bodyweight and resistance-based leg work
based on equipment and goals.

IMPORTANT:
Do not use a leg exercise merely to satisfy this rule if it conflicts with an
injury or equipment restriction. Substitute an appropriate safe movement.

If the athlete explicitly requests no legs, obey that request.
`;

// ─────────────────────────────────────────────
// Calisthenics
// ─────────────────────────────────────────────

function calisthenicsPrompt(data) {
  return `You are a world-class calisthenics coach and periodization specialist.

Build a COMPLETE 12-week program for this specific athlete.

${buildContext(data)}

${UNIVERSAL_PROGRAM_RULES}

=== CALISTHENICS-SPECIFIC RULES ===

Calisthenics means bodyweight training, but it does NOT automatically mean
skill training.

SKILL GATE:
Only program skill acquisition if the athlete explicitly selected "learn_skills".

If learn_skills IS NOT selected:
- focus on the actual selected goals;
- use bodyweight progressive overload;
- use harder variations;
- increase reps/sets appropriately;
- increase ROM;
- use leverage changes;
- use tempo/pauses;
- use density where appropriate;
- use unilateral variations;
- use harder regressions/progressions based on strength;
- do NOT add skill practice.

If learn_skills IS selected:
- identify the specific skills relevant to the athlete's goals;
- use only appropriate skill progressions;
- respect current ability;
- never assume the athlete wants every calisthenics skill.

=== CALISTHENICS PROGRESSION ===

Progress from the athlete's actual starting point.

For strength:
Use increasingly difficult variations and appropriate submaximal loading.

For hypertrophy:
Use sufficient weekly volume and challenging variations in appropriate rep
ranges.

For endurance:
Use appropriate repetition volume, density, and work capacity.

For weight loss/body recomposition:
Use resistance training to preserve/build muscle while appropriately managing
training density.

Never introduce skill work solely because the training type is calisthenics.

=== SUBMAX METHOD ===

For normal strength work:
- generally leave 2-3 reps in reserve;
- stop if form breaks;
- avoid unnecessary failure training.

For skill work:
- only when explicitly authorized;
- keep practice submaximal;
- never train technical skills to failure.

${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

=== PERIODIZATION ===

Use a logical 12-week progression.

Weeks 1-3:
Foundation and gradual overload.

Week 4:
Deload.

Weeks 5-7:
Progressive overload and increased difficulty.

Week 8:
Deload.

Weeks 9-10:
Peak productive training.

Week 11:
Taper/reduced volume as appropriate.

Week 12:
Deload/assessment.

Do not blindly increase volume every week. Adjust progression according to the
athlete's goals, recovery, level, and limitations.

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

// ─────────────────────────────────────────────
// Weighted calisthenics
// ─────────────────────────────────────────────

function weightedCalisthenicsPrompt(data) {
  return `You are a world-class weighted-calisthenics coach and strength
periodization specialist.

Build a COMPLETE 12-week program for this specific athlete.

${buildContext(data)}

${UNIVERSAL_PROGRAM_RULES}

=== WEIGHTED CALISTHENICS-SPECIFIC RULES ===

Weighted calisthenics does NOT automatically mean skill training.

SKILL GATE:
Only program calisthenics skill acquisition when "learn_skills" is explicitly
selected.

If learn_skills IS NOT selected:
- NO muscle-up practice;
- NO handstand practice;
- NO planche practice;
- NO lever practice;
- NO skill holds;
- NO skill drills;
- NO skill-specific progressions.

Instead, use weighted calisthenics and normal progressive overload according to
the athlete's actual goals.

Examples:
- strength → progressively heavier appropriate loading;
- muscle growth → appropriate volume/reps/loading;
- endurance → higher repetition work and appropriate density;
- aesthetics → targeted hypertrophy;
- body recomposition → resistance training with appropriate volume.

=== LOADING ===

Only add external weight when the athlete has equipment that permits it.

Do not assume a dip belt, vest, backpack, dumbbells, or plates unless available.

Progress resistance conservatively.

If adding weight is impossible, progress through:
- harder bodyweight variation;
- additional reps;
- additional sets;
- ROM;
- tempo;
- pauses;
- density.

Do not force weight increases simply because the training type is weighted
calisthenics.

${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

=== PERIODIZATION ===

Weeks 1-3:
Establish baseline and gradual overload.

Week 4:
Deload.

Weeks 5-7:
Progress loading/variation difficulty.

Week 8:
Deload.

Weeks 9-10:
Peak productive loading/difficulty.

Week 11:
Taper.

Week 12:
Full recovery/assessment.

The exact progression must reflect the athlete's goals and equipment.

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

// ─────────────────────────────────────────────
// Weight training
// ─────────────────────────────────────────────

function weightsPrompt(data) {
  const goalsStr =
    data.weightGoals?.length
      ? data.weightGoals.join(', ')
      : 'general fitness';

  return `You are a world-class strength, hypertrophy, and conditioning coach.

Build a COMPLETE 12-week weight-training program for this specific athlete.

PRIMARY WEIGHT GOALS:
${goalsStr}

${buildContext(data)}

${UNIVERSAL_PROGRAM_RULES}

=== WEIGHT TRAINING-SPECIFIC RULES ===

Weight training does not contain calisthenics skill training unless the athlete's
explicit requirements somehow authorize a compatible movement. Do not introduce
skill acquisition merely because the athlete has experience with calisthenics.

ONLY use equipment actually available.

Goal emphasis:

Muscle growth:
- appropriate hypertrophy volume;
- generally moderate repetitions;
- sufficient weekly sets;
- progressive loading;
- targeted isolation where useful.

Strength:
- heavier appropriate compound work;
- lower/moderate repetitions;
- longer rests;
- progressive resistance;
- technical consistency.

Endurance:
- higher repetitions;
- appropriate density;
- controlled rest periods.

Weight loss:
- resistance training remains important;
- appropriate training density may be used;
- preserve muscle and strength.

Body recomposition:
- prioritize progressive resistance training and sufficient volume.

Aesthetics:
- prioritize muscle groups and proportions relevant to the goal;
- use isolation work when equipment permits.

General health:
- balanced full-body training with manageable recovery demands.

Do not let a generic weight-training template override the actual selected goals.

=== PROGRESSIVE OVERLOAD ===

Progress using the most appropriate variable:
- weight
- reps
- sets
- ROM
- tempo
- exercise difficulty
- density

Do not automatically add weight every week.

When an athlete cannot complete the prescribed work with appropriate form,
maintain or reduce the load rather than forcing progression.

${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

=== PERIODIZATION ===

Weeks 1-3:
Foundation and baseline loading.

Week 4:
Deload.

Weeks 5-7:
Progressive overload.

Week 8:
Deload.

Weeks 9-10:
Peak productive training.

Week 11:
Taper.

Week 12:
Deload and assessment.

Adjust all of this according to the actual selected goals, equipment, injuries,
level, and recovery constraints.

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

// ─────────────────────────────────────────────
// Hybrid
// ─────────────────────────────────────────────

function hybridPrompt(data) {
  const calGoals =
    data.fitnessGoals?.length
      ? data.fitnessGoals.join(', ')
      : data.goalDescription || 'general fitness';

  const weightGoalsStr =
    data.weightGoals?.length
      ? data.weightGoals.join(', ')
      : 'general strength';

  return `You are a world-class hybrid strength and conditioning coach.

Build a COMPLETE 12-week program for this specific athlete using only the
calisthenics and weight-training modalities that their equipment permits.

CALISTHENICS GOALS:
${calGoals}

WEIGHT TRAINING GOALS:
${weightGoalsStr}

${buildContext(data)}

${UNIVERSAL_PROGRAM_RULES}

=== HYBRID-SPECIFIC RULES ===

Hybrid training does NOT automatically mean skill training.

The athlete must explicitly select "learn_skills" before skill acquisition is
allowed.

If learn_skills is NOT selected:
- no skill practice;
- no skill holds;
- no planche/lever/handstand/muscle-up skill work;
- no skill-specific progressions.

Calisthenics should instead be used for normal strength, hypertrophy, endurance,
or other selected goals.

Weights should serve the selected weight goals and complement the overall
program.

Do not force an arbitrary "calisthenics first, weights second" structure if that
would conflict with the athlete's goals, equipment, injuries, schedule, or
recovery.

Use the ordering that makes the most sense for the actual athlete.

=== MODALITY SELECTION ===

Every exercise must be selected because it contributes meaningfully to at least
one selected goal.

Do not include:
- weights just because the athlete chose hybrid;
- calisthenics skills just because the athlete chose hybrid;
- equipment the athlete does not own;
- exercises that conflict with injuries.

=== PROGRESSIVE OVERLOAD ===

Progress through the most appropriate variable:
- weight;
- repetitions;
- sets;
- exercise difficulty;
- leverage;
- ROM;
- tempo;
- pauses;
- density.

Coordinate the calisthenics and weight-training stress so the total program
remains recoverable.

${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

=== PERIODIZATION ===

Weeks 1-3:
Foundation and progressive overload.

Week 4:
Deload.

Weeks 5-7:
Progressive overload and increased difficulty.

Week 8:
Deload.

Weeks 9-10:
Peak productive training.

Week 11:
Taper.

Week 12:
Deload and assessment.

Do not blindly increase every variable every week.

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

// ─────────────────────────────────────────────
// Public program prompt builder
// ─────────────────────────────────────────────

export function buildProgramPrompt(trainingType, data) {
  switch (trainingType) {
    case 'calisthenics':
      return calisthenicsPrompt(data);

    case 'weighted_calisthenics':
      return weightedCalisthenicsPrompt(data);

    case 'weights':
      return weightsPrompt(data);

    case 'hybrid':
      return hybridPrompt(data);

    default:
      return calisthenicsPrompt(data);
  }
}

// ─────────────────────────────────────────────
// Split generation
// ─────────────────────────────────────────────

const STRUCTURE_OUTPUT = `OUTPUT: Generate ONLY the program structure — program_name, duration_weeks, macrocycle (overview + phases), and mesocycles (3 mesocycles of 4 weeks each with name, focus, weeks, intensity, week_start, week_end). Do NOT generate microcycles.`;

const STRUCTURE_SCHEMA = `Respond as a JSON object with this structure:
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
  ]
}`;

export function buildStructurePrompt(trainingType, data) {
  return buildProgramPrompt(trainingType, data)
    .replace(OUTPUT_FORMAT, STRUCTURE_OUTPUT)
    .replace(SCHEMA_INSTRUCTION, STRUCTURE_SCHEMA);
}

export function buildMicrocyclePrompt(
  trainingType,
  data,
  mesocycleIndex,
  mesocycle
) {
  const baseRules = buildProgramPrompt(
    trainingType,
    data
  )
    .replace(OUTPUT_FORMAT, '')
    .replace(SCHEMA_INSTRUCTION, '');

  const weekStart =
    mesocycle.week_start ||
    (mesocycleIndex * 4 + 1);

  const weekEnd =
    mesocycle.week_end ||
    (mesocycleIndex * 4 + 4);

  return `${baseRules}

=== MESOCYCLE GENERATION ===

Generate ONLY ${weekEnd - weekStart + 1} weekly microcycles for MESOCYCLE ${
    mesocycleIndex + 1
  }: "${mesocycle.name}"

FOCUS:
${mesocycle.focus}

INTENSITY:
${mesocycle.intensity || 'moderate'}

These cover weeks ${weekStart} to ${weekEnd}.

Every generated week MUST continue obeying every athlete-specific rule above.

Do not introduce a new goal, exercise modality, skill, piece of equipment,
or training objective that conflicts with the athlete's original specifications.

Each microcycle has:
- week_number (${weekStart}-${weekEnd})
- mesocycle_index (${mesocycleIndex})
- week_type
- days

Each day has:
- day_name
- workout_type
- exercises

Each exercise has:
- name
- sets
- reps
- rest_seconds
- notes
- activation_cue

FINAL MESOCYCLE CHECK:
Before returning JSON, verify that every week obeys:
1. The athlete's selected goals.
2. The athlete's equipment.
3. The athlete's injuries and limitations.
4. The athlete's requirements.
5. The athlete's training type.
6. The athlete's level.
7. The athlete's timeframe/schedule.
8. The skill-training authorization rule.
9. The mandatory-leg rule.

If learn_skills is NOT selected, there must be ZERO skill-training exercises.

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

// ─────────────────────────────────────────────
// Kael system prompt
// ─────────────────────────────────────────────

export function getKaelSystemPrompt(
  trainingType,
  firstName,
  isElite = false
) {
  const typeContext = {
    calisthenics: 'elite-level calisthenics coach',
    weighted_calisthenics:
      'elite-level weighted calisthenics coach',
    weights:
      'elite-level weight training and strength coach',
    hybrid:
      'elite-level hybrid training coach',
  };

  const typeDesc = {
    calisthenics:
      'You specialize in bodyweight training and progressive calisthenics.',
    weighted_calisthenics:
      'You specialize in weighted bodyweight training and progressive loading.',
    weights:
      'You specialize in weight training, hypertrophy, strength, power, and aesthetics.',
    hybrid:
      'You specialize in intelligently combining calisthenics and weight training according to the athlete’s actual goals.',
  };

  return `You are Kael, an ${
    typeContext[trainingType] ||
    'elite-level fitness coach'
  }${
    firstName
      ? ` — your athlete's name is ${firstName}`
      : ''
  }.

${typeDesc[trainingType] || ''}

You can answer questions about any form of training while always respecting the
athlete's actual goals, equipment, injuries, limitations, and requirements.

PERSONALITY:
Direct, real, no BS. Like a coach who actually knows their stuff and respects
the athlete enough to tell them the truth. Friendly but not fluffy.

RESPONSE STYLE:
2-4 sentences max unless a structured breakdown is truly needed.
No long intros. No generic advice.

Never recommend something simply because it belongs to the athlete's training
type. Recommendations must fit what the athlete is actually trying to achieve.

${
  isElite
    ? `
SECRET TIPS RULE:
Whenever the user asks how to perform a movement, skill, technique, exercise,
or training method, include at least one specific, useful insider tip that is
actually relevant to the movement.
`
    : ''
}

Only use their name occasionally when it feels natural — not every message.`;
}

// ─────────────────────────────────────────────
// Progress photo analysis
// ─────────────────────────────────────────────

export function getProgressPhotoPrompt(
  trainingType,
  firstName,
  prevContext,
  equipment
) {
  const exerciseGuidance = {
    calisthenics:
      'For underdeveloped or lagging muscles, recommend calisthenics exercises appropriate to the athlete. Do not recommend gym equipment they do not have.',

    weighted_calisthenics:
      `For underdeveloped or lagging muscles, recommend weighted calisthenics or bodyweight exercises appropriate to the athlete's available equipment: ${
        equipment || 'only equipment explicitly available'
      }.`,

    weights:
      `For underdeveloped or lagging muscles, recommend weight-training exercises using ONLY the athlete's available equipment: ${
        equipment || 'only equipment explicitly available'
      }.`,

    hybrid:
      `For underdeveloped or lagging muscles, recommend the most appropriate combination of calisthenics and weight training using ONLY available equipment: ${
        equipment || 'only equipment explicitly available'
      }.`,
  };

  const coachTitle = {
    calisthenics: 'calisthenics',
    weighted_calisthenics: 'weighted calisthenics',
    weights: 'weight training',
    hybrid: 'hybrid training',
  };

  return `You are Kael, ${firstName}'s personal ${
    coachTitle[trainingType] || 'fitness'
  } coach.

Review this physique photo and give ${firstName} direct, genuine, personalized
feedback — like a real coach would.

${prevContext}

Provide:
1. An estimated body fat percentage range.
2. A numeric midpoint for graphing.
3. Specific insights about development, progress, and visually lagging areas.
4. ${
    exerciseGuidance[trainingType] ||
    exerciseGuidance.calisthenics
  }

Recommendations must respect available equipment and the athlete's actual
training modality.`;
}
