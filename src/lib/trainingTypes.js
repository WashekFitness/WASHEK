// Training type configurations
export const TRAINING_TYPES = [
  {
    value: 'calisthenics',
    label: 'Calisthenics',
    iconName: 'PersonStanding',
    desc: 'Bodyweight training using progressive overload through harder variations, increased reps/sets, improved range of motion, tempo, density, and other bodyweight methods. Skill work is included only when Learn Skills is selected.',
    hasSkills: true,
    hasLevel: true,
    hasTimeframe: true,
    hasWeightGoals: false,
  },
  {
    value: 'weighted_calisthenics',
    label: 'Weighted Calisthenics',
    iconName: 'Dumbbell',
    desc: 'Bodyweight movements with added weight (dip belt, weighted vest) to build strength and muscle through loaded progressive overload. Skill work is included only when Learn Skills is selected.',
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
    desc: 'A combination of calisthenics and weight training. The balance, exercise selection, and progression method are determined by the athlete’s selected goals, equipment, limitations, and schedule. Skill work is included only when Learn Skills is selected.',
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

// ── Helper functions ──

function buildAthleteProfile(data) {
  const { gender, level, age, weightLbs, heightFt, heightIn, unit } = data;
  const heightStr = unit === 'metric'
    ? `${heightFt || '?'}cm`
    : `${heightFt || '?'}'${heightIn || 0}"`;
  const weightStr = unit === 'metric'
    ? `${weightLbs || '?'}kg`
    : `${weightLbs || '?'}lbs`;
  return `ATHLETE: ${gender || 'unspecified'}${level ? `, ${level} level` : ''}, age ${age || '?'}, ${weightStr}, ${heightStr}`;
}

function buildGenderRules(gender) {
  if (gender === 'male') {
    return 'Male: volume-heavy, push/pull balance, scapular stability, strict form. Prioritize CNS recovery with adequate rest days.';
  }
  if (gender === 'female') {
    return 'Female: higher reps (8-15), more frequency at moderate intensity, prioritize posterior chain, core stability, hip mobility. Controlled eccentrics to protect lax connective tissue. Hormonal cycle awareness: slightly higher volume in follicular phase.';
  }
  return 'Gender-neutral: balanced approach, moderate volume, focus on form and progressive overload.';
}

function buildContext(data) {
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
    parts.push(`GOALS: ${fitnessGoals.join(', ')}. ${goalDescription || ''}`);
  } else if (goalDescription) {
    parts.push(`GOALS: ${goalDescription}`);
  }

  if (weightGoals?.length) {
    parts.push(`WEIGHT TRAINING GOALS: ${weightGoals.join(', ')}`);
  }

  const selectedGoals = Array.isArray(fitnessGoals)
    ? fitnessGoals
    : [];

  const skillsSelected = selectedGoals.includes('learn_skills');

  parts.push(
    `SKILL PERMISSION: ${
      skillsSelected
        ? 'LEARN_SKILLS IS SELECTED — skill acquisition may be programmed when appropriate to the athlete, training type, equipment, and limitations.'
        : 'LEARN_SKILLS IS NOT SELECTED — DO NOT PROGRAM DEDICATED CALISTHENICS SKILL ACQUISITION. Do not add muscle-ups, handstands, planches, levers, L-sits, or other skill-practice blocks merely because the training type is calisthenics, weighted calisthenics, or hybrid. Progress the selected goals through strength, hypertrophy, endurance, body-composition, health, or other appropriate methods instead.'
    }`
  );

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

// ── Program-specific goal enforcement ──

function buildGoalRules(data = {}) {
  const fitnessGoals = Array.isArray(data.fitnessGoals)
    ? data.fitnessGoals
    : [];

  const weightGoals = Array.isArray(data.weightGoals)
    ? data.weightGoals
    : [];

  const goalDescription = data.goalDescription || '';
  const skillsSelected = fitnessGoals.includes('learn_skills');

  return `── ATHLETE-SPECIFIC GOAL RULES — HARD CONSTRAINTS ──
1. Build the program from the athlete's ACTUAL selected goals and written goal description. Do not substitute the coach's preferred goals for the athlete's goals.
2. SELECTED CALISTHENICS GOALS: ${fitnessGoals.length ? fitnessGoals.join(', ') : 'none explicitly selected'}
3. SELECTED WEIGHT TRAINING GOALS: ${weightGoals.length ? weightGoals.join(', ') : 'none explicitly selected'}
4. WRITTEN GOAL DESCRIPTION: ${goalDescription || 'none provided'}
5. LEARN_SKILLS STATUS: ${skillsSelected ? 'SELECTED' : 'NOT SELECTED'}
6. ${
    skillsSelected
      ? 'Skill acquisition may be included when it supports the athlete’s selected goals and is safe with their equipment, experience, schedule, and limitations.'
      : 'Skill acquisition is NOT an objective. Do not create dedicated skill practice for muscle-ups, handstands, planches, levers, L-sits, or similar skills. If a harder calisthenics variation is useful for strength/hypertrophy/endurance, use it strictly as a means of progressive overload rather than as skill practice.'
  }
7. Every exercise, progression, volume decision, and training emphasis must serve at least one selected goal or a necessary supporting requirement (such as injury-safe preparation, recovery, balance, or mandatory leg training).
8. If goals conflict, prioritize the explicitly selected goals and reconcile them through appropriate volume, intensity, exercise selection, and recovery rather than silently dropping a goal.
9. Do not add equipment, exercises, or loading methods the athlete cannot perform with the listed equipment.
10. Do not prescribe movements that conflict with injuries, pain, limitations, or explicit requirements. Use safe alternatives that train the intended pattern or muscle when needed.
11. Respect the athlete's actual training availability and session/time constraints. Never create more training volume than the schedule can reasonably support.
12. Before finalizing, audit every week against goals, equipment, injuries/limitations, schedule, written requirements, skill permission, push/pull balance, and the mandatory leg rule. Correct any violation before returning JSON.`;
}

// ── Program prompt builders ──

const OUTPUT_FORMAT = `OUTPUT: Generate ALL 12 microcycles. Each microcycle has week_number (1-12), mesocycle_index (0, 1, or 2), and days array. Each day has day_name, workout_type, and exercises array. Each exercise has name, sets (number), reps (string like "5" or "8-10" or "6s hold"), rest_seconds (number), notes (coaching cue string), and activation_cue (concise activation and form cue string — see Hunter Stein method).`;

const SCHEMA_INSTRUCTION = `Respond as a JSON object with this structure:
{
  "program_name": string,
  "duration_weeks": number,
  "macrocycle": { "overview": string, "phases": [{ "name": string, "weeks": string, "focus": string }] },
  "mesocycles": [{ "name": string, "focus": string, "weeks": number, "intensity": string, "week_start": number, "week_end": number }],
  "microcycles": [{ "week_number": number, "mesocycle_index": number, "week_type": string, "days": [{ "day_name": string, "workout_type": string, "exercises": [{ "name": string, "sets": number, "reps": string, "rest_seconds": number, "notes": string, "activation_cue": string }] }] }]
}`;

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

const LEG_TRAINING_MANDATE = `── LEG TRAINING — MANDATORY FOR ALL TRAINING TYPES ──
Unless the athlete has EXPLICITLY stated in their own goals, requirements, or notes that they do NOT want leg training (e.g., "upper body only", "no legs", "skip legs"), you MUST include dedicated leg work in EVERY WEEK of the program. Legs are NOT optional and there is NO UI selection that makes them optional. A missing leg preference is NOT permission to omit legs.

TARGET ALL MAJOR LEG MUSCLES: quads, hamstrings, glutes, AND calves. Every week must include exercises that hit each of these.

Include at least 1-2 dedicated leg days OR integrate substantial leg work into existing training days (minimum 3-4 leg exercises per week total).

EXERCISE SELECTION BY TRAINING TYPE:
- CALISTHENICS: Pistol squats, shrimp squats, jump squats, sissy squats, Nordic curls, glute bridges, single-leg glute bridges, reverse lunges, Bulgarian split squats (bodyweight), calf raises (single-leg, double-leg), box jumps, broad jumps, wall sits, dragon flag negatives for posterior chain
- WEIGHTED CALISTHENICS: Weighted squats, weighted pistol squats, weighted lunges, weighted Bulgarian split squats, weighted calf raises, Nordic curls (weighted), weighted glute bridges, jump squats with weight
- WEIGHT TRAINING: Back squats, front squats, Romanian deadlifts, deadlifts, walking lunges, leg press, leg extensions, leg curls, calf raises (standing + seated), hip thrusts, Bulgarian split squats (dumbbell or barbell), good mornings, reverse hyperextensions
- HYBRID: Mix of calisthenics and weight leg exercises — e.g., pistol squats for coordination + barbell squats for raw strength, Nordic curls for hamstring health + Romanian deadlifts for posterior chain power

Only an explicit written instruction from the athlete such as "no legs", "upper body only", "skip leg training", or equivalent authorizes omitting leg work. Otherwise, legs are MANDATORY in every week, including deload weeks (with appropriately reduced volume/intensity).`;

function calisthenicsPrompt(data) {
  return `You are a world-class calisthenics periodization scientist and coach. Build a COMPLETE 12-week program for this athlete with ALL 12 weekly microcycles fully detailed. This program uses Anton's Submax training method — the fastest evidence-based progression system for calisthenics skills.

${buildContext(data)}

${buildGoalRules(data)}

=== PERIODIZATION SCIENCE (MANDATORY — FOLLOW EXACTLY) ===

ADAPTATION HIERARCHY: Tendon adaptation is SLOWEST (weeks 4-12+), then CNS adaptation (days-weeks), then muscle hypertrophy. Volume must increase gradually so tendons can keep up. Never jump more than 10-15% total volume per week. Injury prevention is paramount — when in doubt, do less. Respect any injuries or limitations listed in REQUIREMENTS.

── ANTON'S SUBMAX METHOD (THE CORE OF THIS PROGRAM) ──
Submax training means NEVER training to failure or even near-failure on skill and strength movements. Every set ends 2-3 reps BEFORE failure (3+ RIR on strength sets, 40-60% of max for skill holds). This allows:
1. Higher training frequency without CNS burnout
2. Perfect technique on every rep
3. Faster tendon adaptation
4. Faster skill acquisition when skills are actually selected
5. Reduced overuse injuries from accumulated fatigue damage

SUBMAX RULES TO ENFORCE IN EVERY SESSION:
- Strength sets: stop when reps start to slow or form breaks — never grind. Note this in exercise "notes" field.
- Skill holds (handstand, planche, lever, L-sit): ONLY include these when LEARN_SKILLS is selected. When selected, hold for 40-60% of max hold time per set, many sets.
- Never train a selected skill to failure.
- Encourage higher-frequency skill practice ONLY when LEARN_SKILLS is selected and recovery permits.
- Include a note like "Stop 2-3 reps early — submax" in the notes field for every strength exercise.

WEEKLY STRUCTURE (4-6 training days — split push/pull for faster progress):
  - DAY A — INTENSITY PUSH: Push-dominant movements at 80-90% submax. Low reps (3-5), hard variations, long rests (3-4 min). Explosive concentric, 2-3s eccentric. Skill work first only when LEARN_SKILLS is selected. ALWAYS stop 2-3 reps short.
  - DAY B — INTENSITY PULL: Pull-dominant movements at 80-90% submax. Same parameters as Day A but pulling patterns. Balances push/pull.
  (If athlete prefers fewer training days, combine A+B into one full INTENSITY day with both push and pull.)
  - DAY C — VOLUME PUSH: Push-dominant movements at 65-75% submax. Moderate reps (6-10), more sets, shorter rests (90-120s). Hypertrophy + tendon load. Still submax — never failure.
  - DAY D — VOLUME PULL: Pull-dominant movements at 65-75% submax. Same as Day C but pulling patterns.
  (If athlete prefers fewer training days, combine C+D into one full VOLUME day.)
  - DAY E — DELOAD & SKILL: If LEARN_SKILLS is selected, light skill practice may be included. Otherwise use mobility, recovery, prehab, and goal-directed light training. 40-55% effort.
  - Rest days between training days as needed. Never 2 consecutive high-intensity days. Push/pull balance mandatory across the week.

MESOCYCLE STRUCTURE (3 mesocycles of 4 weeks each):
MESO 1 (Weeks 1-4): FOUNDATION + TENDON CONDITIONING
  - Wk1: Submax volume LOW (50-60% of capacity). Build the habit of stopping early. Tendon priming.
  - Wk2: Submax volume +10%. Introduce cleaner progressions. Keep technique perfect.
  - Wk3: Submax volume +10% from wk2. Introduce next progression level appropriate to the selected goals.
  - Wk4: DELOAD — drop to 40% volume, submax intensity maintained. Full tendon/CNS supercompensation.

MESO 2 (Weeks 5-8): INTENSIFICATION + PROGRESSION
  - Wk5: Reset volume slightly above meso1 peak with harder progressions appropriate to the selected goals. Submax on new level.
  - Wk6: Volume +10%. Increase hold times/reps only where they serve the selected goals.
  - Wk7: Volume +10% from wk6. Push submax ceiling — harder variations but same RIR rules.
  - Wk8: DELOAD — cut volume 40%, maintain submax intensity.

MESO 3 (Weeks 9-12): PEAK + SPECIALIZATION
  - Wk9: Near-peak submax volume. Hardest safe progressions appropriate to the selected goals.
  - Wk10: Peak volume week.
  - Wk11: Taper — reduce volume 20%, keep intensity.
  - Wk12: FULL DELOAD — 50% volume, 30% intensity drop. Final supercompensation and assessment.

EXERCISE SELECTION RULES:
- 4-5 training days per week, 5-6 exercises per training day, 2-3 on skill/recovery days
- Push/pull balance mandatory (equal push and pull volume every week)
- Dedicated skill work is permitted ONLY when LEARN_SKILLS is selected
- If LEARN_SKILLS is NOT selected, progressive overload must use harder appropriate variations, additional reps/sets when justified, improved range of motion, control, tempo, density, or other methods that directly serve the selected goals
- Scapular/rotator cuff prehab every week
- Never repeat same movement pattern twice in one session
- Progressions must follow a clear regression → appropriate target progression ladder
- Tendon prehab: slow eccentrics (3-5s down), isometric holds integrated 2x/week where appropriate
- In exercise notes: specify the relevant progression/submax cue
- Injury history from REQUIREMENTS must be respected
- Equipment limitations must be respected exactly
- ${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

function weightedCalisthenicsPrompt(data) {
  return `You are a world-class calisthenics periodization scientist and coach specializing in WEIGHTED calisthenics. Build a COMPLETE 12-week program for this athlete with ALL 12 weekly microcycles fully detailed. This program uses Anton's Submax training method combined with weighted progressions for maximum strength and muscle development, with skill acquisition ONLY when selected by the athlete.

${buildContext(data)}

${buildGoalRules(data)}

=== PERIODIZATION SCIENCE (MANDATORY — FOLLOW EXACTLY) ===

ADAPTATION HIERARCHY: Tendon adaptation is SLOWEST (weeks 4-12+), then CNS adaptation (days-weeks), then muscle hypertrophy. Weighted progressions stress tendons MORE than bodyweight — volume must increase gradually. Never jump more than 10% total volume or 5lbs added weight per week. Injury prevention is paramount. Respect any injuries or limitations listed in REQUIREMENTS.

── SUBMAX METHOD + WEIGHTED PROGRESSIONS ──
Submax training means NEVER training to failure. Every set ends 2-3 reps BEFORE failure (3+ RIR).

CRITICAL SKILL RULE:
- If LEARN_SKILLS is selected, unweighted skill work may be programmed when appropriate and should remain submax.
- If LEARN_SKILLS is NOT selected, DO NOT PROGRAM DEDICATED SKILL WORK. Do not insert handstands, muscle-ups, planches, levers, L-sits, or similar skill blocks simply because this is weighted calisthenics.
- When skills are not selected, use weighted and bodyweight movements as progressive overload for the athlete's actual goals.

WEIGHTED PROGRESSION RULES:
1. Weighted strength work uses added resistance only when the athlete has the required equipment.
2. Progressive overload via added weight should be gradual and earned.
3. Never grind a weighted rep — if form breaks, the set is over.
4. Harder bodyweight variations, increased reps/sets, improved ROM, tempo, density, or load may be used according to the selected goals.

SUBMAX RULES:
- Skill holds: ONLY when LEARN_SKILLS is selected; 40-60% of max hold time, unweighted, many sets.
- Weighted strength sets: 2-3 RIR, stop when form slows.
- Weighted hypertrophy sets: 1-2 RIR, controlled tempo.
- Never train a selected skill to failure.
- Include weight suggestion and progression/submax cue in notes.

WEEKLY STRUCTURE (4-6 training days):
  - DAY A — INTENSITY PUSH: If skills are selected, unweighted push skill work first. Then weighted push movements at 3-5 reps, 3-4 sets, 3 min rest.
  - DAY B — INTENSITY PULL: If skills are selected, unweighted pull skill work first. Then weighted pull movements at 3-5 reps, 3-4 sets, 3 min rest.
  - DAY C — VOLUME PUSH: Goal-directed push work and weighted hypertrophy at 6-10 reps, 3-4 sets, 90-120s rest.
  - DAY D — VOLUME PULL: Goal-directed pull work and weighted hypertrophy at 6-10 reps, 3-4 sets, 90-120s rest.
  - DAY E — RECOVERY/DELOAD: If skills are selected, light skill practice may be included. Otherwise mobility, prehab, recovery, and light goal-directed work.
  - Combine days only when necessary to respect the athlete's actual schedule.
  - Never 2 consecutive high-intensity days. Push/pull balance mandatory.

MESOCYCLE STRUCTURE (3 mesocycles of 4 weeks each):
MESO 1 (Weeks 1-4): FOUNDATION + LOADED TENDON CONDITIONING
  - Wk1: Establish safe baseline weights. Submax volume LOW.
  - Wk2: Gradual progression. Volume +10% where recovery allows.
  - Wk3: Gradual progression. Increase load, reps, or variation only when earned.
  - Wk4: DELOAD — reduce weight/volume appropriately.

MESO 2 (Weeks 5-8): STRENGTH BUILD + PROGRESSION
  - Wk5: Reset to an appropriate baseline based on previous performance.
  - Wk6: Gradual progression.
  - Wk7: Peak appropriate intensity while maintaining submax rules.
  - Wk8: DELOAD.

MESO 3 (Weeks 9-12): PEAK + SPECIALIZATION
  - Wk9: Near-peak safe progression.
  - Wk10: Peak appropriate training.
  - Wk11: Taper — reduce volume 20%, keep quality.
  - Wk12: FULL DELOAD and assessment.

EXERCISE SELECTION RULES:
- 4-5 exercises per training day unless the athlete's schedule requires otherwise
- Dedicated skill work ONLY if LEARN_SKILLS is selected
- Weighted variations only when the athlete has the equipment
- Progressive overload must directly serve selected goals
- Push/pull balance mandatory
- Scapular/rotator cuff prehab every week
- Tendon prehab where appropriate
- In notes, specify weight/progression and submax cue
- Injury history from REQUIREMENTS must be respected
- Equipment limitations must be respected exactly
- ${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

function weightsPrompt(data) {
  const goalsStr = data.weightGoals?.join(', ') || 'general fitness';

  return `You are a world-class strength and conditioning coach specializing in weight training, hypertrophy, and strength periodization. Build a COMPLETE 12-week program for this athlete with ALL 12 weekly microcycles fully detailed. The program is optimized for: ${goalsStr}.

${buildContext(data)}

${buildGoalRules(data)}

=== PERIODIZATION SCIENCE (MANDATORY — FOLLOW EXACTLY) ===

ADAPTATION HIERARCHY: Muscle tissue adapts fastest (days-weeks), then CNS (weeks), then tendons/connective tissue (weeks-months). Progressive overload must be gradual — never increase weight more than 5-10% per week. Injury prevention is paramount — when in doubt, do less. Respect any injuries or limitations listed in REQUIREMENTS.

PROGRESSIVE OVERLOAD PRINCIPLES:
- Increase weight by 2.5-5 lbs when you can complete all sets and reps with good form
- If you can't hit the rep range, stay at the same weight until you can
- Deload every 4th week (reduce weight 40%, maintain reps/sets)
- RPE (Rate of Perceived Exertion): Most working sets at RPE 7-8 (2-3 reps in reserve). Top sets can reach RPE 9 but NEVER RPE 10 (failure)
- Submax approach: never train to failure on compound lifts. Leave 2-3 reps in reserve.

WEEKLY STRUCTURE (4-6 training days — intensity/volume/deload split):
  - DAY A — INTENSITY PUSH: Heavy push compounds at 3-5 reps, 4-5 sets, 3-5 min rest. RPE 8-9, 2-3 RIR.
  - DAY B — INTENSITY PULL: Heavy pull compounds at 3-5 reps, 4-5 sets, 3-5 min rest. RPE 8-9, 2-3 RIR.
  - DAY C — VOLUME PUSH: Push hypertrophy (8-12 reps, 3-4 sets, 60-90s rest). RPE 7-8.
  - DAY D — VOLUME PULL: Pull hypertrophy (8-12 reps, 3-4 sets, 60-90s rest). RPE 7-8.
  - DAY E — DELOAD & MOBILITY: 40% intensity. Light technique work, mobility, prehab, and recovery.
  - Adjust rep ranges and exercise selection based on the athlete's actual selected goal(s): muscle growth → higher reps/volume, gain strength → lower reps/heavier, lose weight → appropriate circuit density, aesthetics → targeted isolation, endurance → appropriate higher-rep conditioning, etc.
  - Do not introduce a goal that the athlete did not select.
  - ${LEG_TRAINING_MANDATE}

MESOCYCLE STRUCTURE (3 mesocycles of 4 weeks each):
MESO 1 (Weeks 1-4): FOUNDATION + HYPERTROPHY BASE
  - Wk1: Moderate volume, establish baseline weights. RPE 6-7.
  - Wk2: Increase weight gradually. RPE 7.
  - Wk3: Increase weight gradually. RPE 7-8.
  - Wk4: DELOAD — reduce weight 40%, maintain appropriate technique.

MESO 2 (Weeks 5-8): STRENGTH + INTENSIFICATION
  - Wk5: Reset to an appropriate baseline and progress.
  - Wk6: Increase weight or reps where earned.
  - Wk7: Peak intensity appropriate to goals. RPE 8-9.
  - Wk8: DELOAD — reduce weight 40%.

MESO 3 (Weeks 9-12): PEAK + SPECIALIZATION
  - Wk9: Near-peak safe weights/variations.
  - Wk10: Peak week appropriate to goals.
  - Wk11: Taper — reduce volume 20%, maintain quality.
  - Wk12: FULL DELOAD — 50% weight, 30% volume.

EXERCISE SELECTION RULES:
- ONLY use exercises the athlete can do with their listed EQUIPMENT
- Compound lifts as primary movements when appropriate to the selected goals
- 4-6 exercises per training day
- Push/pull balance mandatory
- Progressive overload noted in exercise "notes" field
- Injury history from REQUIREMENTS must be respected — avoid aggravating movements
- Tendon prehab where appropriate
- Isolation work generally 10-15 reps, 2-3 sets, 45-60s rest
- Warm-up sets and mobility work noted where relevant
- RPE target noted in exercise notes
- ${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

${HUNTER_STEIN_WEIGHTS_NOTE}

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

function hybridPrompt(data) {
  const calGoals = data.fitnessGoals?.join(', ') || data.goalDescription || 'general fitness';
  const weightGoalsStr = data.weightGoals?.join(', ') || 'general strength';

  return `You are a world-class strength and conditioning coach specializing in HYBRID training — combining calisthenics and weight training according to the athlete's actual goals.

Build a COMPLETE 12-week program with ALL 12 weekly microcycles fully detailed.

CRITICAL PRINCIPLE:
Use calisthenics and weight training according to the athlete's selected goals. DEDICATED CALISTHENICS SKILL WORK IS PERMITTED ONLY IF LEARN_SKILLS IS SELECTED. When Learn Skills is not selected, do not insert skill blocks simply because this is hybrid training. Use calisthenics movements and weights strictly to achieve the selected strength, muscle, endurance, body-composition, health, or other goals.

CALISTHENICS GOALS: ${calGoals}
WEIGHT TRAINING GOALS: ${weightGoalsStr}

${buildContext(data)}

${buildGoalRules(data)}

=== HYBRID PERIODIZATION SCIENCE (MANDATORY) ===

ADAPTATION HIERARCHY: Tendon adaptation is SLOWEST, then CNS, then muscle. Both calisthenics and weight training stress the CNS — manage total session volume carefully. Never exceed 60-75 minutes per session unless the athlete's requirements explicitly allow more. Injury prevention is paramount. Respect any injuries or limitations listed in REQUIREMENTS.

SESSION STRUCTURE (MANDATORY for every training day):
1. WARM-UP (5 min): Joint mobility, light dynamic movement
2. GOAL-DIRECTED CALISTHENICS WORK: If LEARN_SKILLS is selected, skill practice may come first and remain submax. If LEARN_SKILLS is not selected, use goal-directed calisthenics strength/hypertrophy/endurance work — never dedicated skill practice.
3. STRENGTH/POWER (15-20 min): Appropriate compound movement using bodyweight, weighted calisthenics, or weights based on the athlete's goals and equipment. 3-5 reps, 3-4 sets when strength is the goal. Submax — 2-3 RIR.
4. HYPERTROPHY/GOAL-SPECIFIC WORK (15-20 min): Appropriate volume based on the selected goals. Use weight training only when the athlete has the required equipment.
5. COOL-DOWN (5 min): Stretching, mobility for recovery.

CALISTHENICS SKILL RULE:
- LEARN_SKILLS SELECTED: Skill work may be programmed when appropriate.
- LEARN_SKILLS NOT SELECTED: No dedicated muscle-up, handstand, planche, lever, L-sit, or similar skill-practice blocks.
- Without Learn Skills, harder calisthenics variations are allowed ONLY as progressive overload for the athlete's selected goals.

WEIGHT EXERCISE SELECTION:
- Choose exercises based on the athlete's actual goals and available equipment.
- Do not select exercises merely because they are commonly associated with a calisthenics skill.
- Do not prescribe unavailable equipment.
- Do not prescribe movements that conflict with injuries or limitations.

SUBMAX METHOD:
- Skill holds: ONLY when LEARN_SKILLS is selected; 40-60% of max hold time.
- Never train a selected skill to failure.
- Stop 2-3 reps early on strength sets.
- Use high-frequency skill practice only when skills are selected and recovery permits.

PROGRESSIVE OVERLOAD:
- Increase weight when all reps are achieved with good form.
- Use harder variations, additional reps/sets, improved ROM, tempo, density, or load according to the training type and selected goals.
- Never progress in a way that violates equipment, injury, schedule, or recovery constraints.

WEEKLY STRUCTURE (4-6 training days — intensity/volume/deload split):
  - DAY A — INTENSITY PUSH: Goal-directed calisthenics work → appropriate weighted/bodyweight or weight-training strength work.
  - DAY B — INTENSITY PULL: Goal-directed calisthenics work → appropriate weighted/bodyweight or weight-training strength work.
  (Combine A+B into one full intensity day if fewer training days are required.)
  - DAY C — VOLUME PUSH: Goal-directed hypertrophy/endurance work.
  - DAY D — VOLUME PULL: Goal-directed hypertrophy/endurance work.
  (Combine C+D into one full volume day if fewer training days are required.)
  - DAY E — RECOVERY/DELOAD: Recovery, mobility, prehab, and light goal-directed work. Skill work only if LEARN_SKILLS is selected.
  - Legs and core must be included according to ${LEG_TRAINING_MANDATE}.

MESOCYCLE STRUCTURE (3 mesocycles of 4 weeks each):
MESO 1 (Weeks 1-4): FOUNDATION + DUAL ADAPTATION
  - Wk1: Establish safe baselines.
  - Wk2: Gradual progression.
  - Wk3: Gradual progression.
  - Wk4: DELOAD — reduce appropriate volume/intensity.

MESO 2 (Weeks 5-8): INTENSIFICATION + PROGRESSION
  - Wk5: Reset to an appropriate baseline and progress.
  - Wk6: Gradual progression.
  - Wk7: Peak appropriate intensity while maintaining recovery.
  - Wk8: DELOAD.

MESO 3 (Weeks 9-12): PEAK + SPECIALIZATION
  - Wk9: Near-peak safe progression.
  - Wk10: Peak week appropriate to goals.
  - Wk11: Taper — reduce volume 20%, maintain quality.
  - Wk12: FULL DELOAD and assessment.

RECOVERY RULES:
- Never 2 consecutive heavy training days
- Deload every 4th week
- Monitor CNS fatigue
- Tendon care and appropriate recovery
- Scapular/rotator cuff prehab every week
- Push/pull balance mandatory
- Respect the athlete's schedule and time availability

${LEG_TRAINING_MANDATE}

${HUNTER_STEIN_METHOD}

${OUTPUT_FORMAT}

${SCHEMA_INSTRUCTION}`;
}

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

// ── Split generation: structure + per-mesocycle microcycles ──
// The full 12-week program is too large for a single LLM call (times out).
// We split into 4 calls: 1 structure + 3 mesocycle microcycle batches.

const STRUCTURE_OUTPUT = `OUTPUT: Generate ONLY the program structure — program_name, duration_weeks, macrocycle (overview + phases), and mesocycles (3 mesocycles of 4 weeks each with name, focus, weeks, intensity, week_start, week_end). Do NOT generate microcycles.`;

const STRUCTURE_SCHEMA = `Respond as a JSON object with this structure:
{
  "program_name": string,
  "duration_weeks": number,
  "macrocycle": { "overview": string, "phases": [{ "name": string, "weeks": string, "focus": string }] },
  "mesocycles": [{ "name": string, "focus": string, "weeks": number, "intensity": string, "week_start": number, "week_end": number }]
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
  const baseRules = buildProgramPrompt(trainingType, data)
    .replace(OUTPUT_FORMAT, '')
    .replace(SCHEMA_INSTRUCTION, '');

  const weekStart =
    mesocycle.week_start ||
    (mesocycleIndex * 4 + 1);

  const weekEnd =
    mesocycle.week_end ||
    (mesocycleIndex * 4 + 4);

  return `${baseRules}

OUTPUT: Generate ONLY ${weekEnd - weekStart + 1} weekly microcycles for MESOCYCLE ${mesocycleIndex + 1}: "${mesocycle.name}" (focus: ${mesocycle.focus}, intensity: ${mesocycle.intensity || 'moderate'}). These cover weeks ${weekStart} to ${weekEnd}. Each microcycle has week_number (${weekStart}-${weekEnd}), mesocycle_index (${mesocycleIndex}), week_type, and days array. Each day has day_name, workout_type, and exercises array. Each exercise has name, sets (number), reps (string), rest_seconds (number), notes (coaching cue string), and activation_cue (concise activation and form cue string).

FINAL MICRO-CYCLE AUDIT — BEFORE RETURNING JSON:
- Verify every generated week follows the athlete's selected goals.
- Verify LEARN_SKILLS permission.
- Verify equipment exactly.
- Verify injuries/limitations exactly.
- Verify schedule/time constraints.
- Verify legs are included unless explicitly refused in writing.
- Verify push/pull balance and recovery.
- Remove and replace any exercise that violates these requirements.

Respond as a JSON object with this structure:
{
  "microcycles": [{ "week_number": number, "mesocycle_index": number, "week_type": string, "days": [{ "day_name": string, "workout_type": string, "exercises": [{ "name": string, "sets": number, "reps": string, "rest_seconds": number, "notes": string, "activation_cue": string }] }] }]
}`;
}

// ── Kael system prompt ──

export function getKaelSystemPrompt(
  trainingType,
  firstName,
  isElite = false
) {
  const typeContext = {
    calisthenics: 'elite-level calisthenics coach',
    weighted_calisthenics: 'elite-level weighted calisthenics coach',
    weights: 'elite-level weight training and strength coach',
    hybrid: 'elite-level hybrid training coach (calisthenics + weights)',
  };

  const typeDesc = {
    calisthenics: 'You specialize in bodyweight training, progressive overload, and calisthenics progressions. Skill acquisition is only an objective when the athlete selects it.',
    weighted_calisthenics: 'You specialize in weighted bodyweight training and loaded progressive overload. Skill acquisition is only an objective when the athlete selects it.',
    weights: 'You specialize in weight training — hypertrophy, strength, powerlifting, bodybuilding, and aesthetics with free weights, cables, and machines.',
    hybrid: 'You specialize in combining calisthenics and weight training according to the athlete’s actual goals, equipment, limitations, and schedule. Skill acquisition is only an objective when the athlete selects it.',
  };

  return `You are Kael, an ${typeContext[trainingType] || 'elite-level fitness coach'}${firstName ? ` — your athlete's name is ${firstName}` : ''}. You have trained world-class street workout athletes, gymnasts, powerlifters, bodybuilders, and elite military operators.

You can answer questions about ANY form of training — calisthenics, weighted calisthenics, weight training, or hybrid combinations. ${(typeDesc[trainingType] || '')} When the athlete asks about a training type outside your primary specialty, still give expert advice — you are knowledgeable across all modalities.

PERSONALITY: Direct, real, no BS. Like a coach who actually knows their stuff and respects the athlete enough to tell them the truth. Friendly but not fluffy. Get to the point.

RESPONSE STYLE: 2-4 sentences max unless a structured breakdown is truly needed. No long intros. No generic advice.${isElite ? `

SECRET TIPS RULE — CRITICAL: Whenever the user asks HOW to do something (a movement, skill, technique, exercise, or training method), you MUST include at least one "secret" or "insider" tip — something elite athletes actually use in practice that most coaches and internet guides never mention. These should be real, specific, and counterintuitive. Examples:
- Specific tension cues that elite athletes use
- Breathing tricks, bracing patterns, or micro-timing cues
- Progressions that elite athletes use but almost nobody teaches online
- Recovery or CNS management tricks specific to the training type
- Hidden biomechanical details that change everything
- Training frequency and density secrets
- Psychological or visualization techniques that top athletes use

Label these clearly with something like "🔐 Elite tip:" or "⚡ Secret:" so they feel special.` : ''}

Only use their name occasionally when it feels natural — not every message.`;
}

// ── Progress photo analysis prompt ──

export function getProgressPhotoPrompt(
  trainingType,
  firstName,
  prevContext,
  equipment
) {
  const exerciseGuidance = {
    calisthenics: 'For any muscle groups that appear underdeveloped or lagging, recommend CALISTHENICS exercises (not weights or machines) that target those specific muscles. For example: for weak shoulders → Pike push-ups, Wall handstand holds, Pike push-up negatives; for weak back → Australian rows, Dead hangs, Scapular pull-ups; for weak chest → Push-up variations, Ring push-ups. Never recommend gym equipment, dumbbells, barbells, or machines.',
    weighted_calisthenics: 'For any muscle groups that appear underdeveloped or lagging, recommend WEIGHTED CALISTHENICS exercises that target those specific muscles. For example: for weak back → Weighted pull-ups, weighted Australian rows; for weak chest → Weighted dips, weighted push-ups; for weak shoulders → Weighted pike push-ups. You can also recommend bodyweight variations, but prioritize loaded progressions.',
    weights: `For any muscle groups that appear underdeveloped or lagging, recommend WEIGHT TRAINING exercises using the athlete's available equipment (${equipment || 'dumbbells, barbells, cables, machines'}). For example: for weak shoulders → Overhead press, lateral raises; for weak back → Lat pulldowns, barbell rows; for weak chest → Bench press, cable flyes. Only recommend exercises they can do with their equipment. Never recommend calisthenics or bodyweight exercises.`,
    hybrid: `For any muscle groups that appear underdeveloped or lagging, recommend a MIX of calisthenics AND weight training exercises that complement each other. Consider their available equipment: ${equipment || 'standard gym equipment'}.`,
  };

  const coachTitle = {
    calisthenics: 'calisthenics',
    weighted_calisthenics: 'weighted calisthenics',
    weights: 'weight training',
    hybrid: 'hybrid training',
  };

  return `You are Kael, ${firstName}'s personal ${coachTitle[trainingType] || 'fitness'} coach. Review this physique photo and give ${firstName} direct, genuine, personalized feedback — like a real coach would. Not clinical, not generic.

${prevContext}

Provide:
1. An estimated body fat percentage range (specific, like "14-17%")
2. A numeric midpoint for graphing (just the number, like 15.5)
3. Specific insights — address ${firstName} directly. What muscles are developing? Where is there visible progress? What areas visually lag behind? If there's a previous photo, compare and call out exactly what changed. Be real and conversational.
4. ${exerciseGuidance[trainingType] || exerciseGuidance.calisthenics}`;
}
