// ── Calisthenics exercise list for FormLab ──────────────────
// category: 'hold' = static isometric skill, 'dynamic' = rep-based movement

export const FORM_EXERCISES = [
  // Push
  { name: 'Push-up', category: 'dynamic' },
  { name: 'Pseudo Planche Push-up', category: 'dynamic' },
  { name: 'Archer Push-up', category: 'dynamic' },
  { name: 'Diamond Push-up', category: 'dynamic' },
  { name: 'Decline Push-up', category: 'dynamic' },
  { name: 'Ring Push-up', category: 'dynamic' },
  { name: 'Dip', category: 'dynamic' },
  { name: 'Ring Dip', category: 'dynamic' },
  { name: 'Pike Push-up', category: 'dynamic' },
  { name: 'Handstand Push-up', category: 'dynamic' },

  // Pull
  { name: 'Pull-up', category: 'dynamic' },
  { name: 'Chin-up', category: 'dynamic' },
  { name: 'Australian Row', category: 'dynamic' },
  { name: 'Scapular Pull-up', category: 'dynamic' },
  { name: 'Archer Pull-up', category: 'dynamic' },
  { name: 'Typewriter Pull-up', category: 'dynamic' },
  { name: 'Muscle-up', category: 'dynamic' },
  { name: 'Bar Muscle-up', category: 'dynamic' },
  { name: 'Ring Muscle-up', category: 'dynamic' },

  // Legs
  { name: 'Bodyweight Squat', category: 'dynamic' },
  { name: 'Pistol Squat', category: 'dynamic' },
  { name: 'Shrimp Squat', category: 'dynamic' },
  { name: 'Cossack Squat', category: 'dynamic' },
  { name: 'Jump Squat', category: 'dynamic' },
  { name: 'Nordic Curl', category: 'dynamic' },

  // Core
  { name: 'Hanging Leg Raise', category: 'dynamic' },
  { name: 'Toes to Bar', category: 'dynamic' },
  { name: 'Hanging Windshield Wiper', category: 'dynamic' },
  { name: 'Dragon Flag', category: 'dynamic' },
  { name: 'Hollow Body Hold', category: 'hold' },
  { name: 'L-Sit', category: 'hold' },
  { name: 'V-Sit', category: 'hold' },
  { name: 'Tuck Planche', category: 'hold' },
  { name: 'Adv Tuck Planche', category: 'hold' },
  { name: 'Straddle Planche', category: 'hold' },
  { name: 'Full Planche', category: 'hold' },
  { name: 'Front Lever', category: 'hold' },
  { name: 'Back Lever', category: 'hold' },
  { name: 'Tuck Front Lever', category: 'hold' },
  { name: 'Adv Tuck Front Lever', category: 'hold' },
  { name: 'Straddle Front Lever', category: 'hold' },

  // Handstand & static holds
  { name: 'Handstand', category: 'hold' },
  { name: 'Wall Handstand Hold', category: 'hold' },
  { name: 'Handstand Press (Pike to HS)', category: 'dynamic' },
  { name: 'One-Arm Handstand', category: 'hold' },
  { name: 'Human Flag', category: 'hold' },
  { name: 'Elbow Lever', category: 'hold' },
  { name: 'Dead Hang', category: 'hold' },

  // Other
  { name: 'Other / Custom', category: 'dynamic' },
];

// ── Check if a training type includes calisthenics ──────────

export function hasCalisthenics(
  trainingType
) {
  if (
    !trainingType
  ) {
    return true;
  }

  return (
    trainingType ===
      'calisthenics' ||
    trainingType ===
      'weighted_calisthenics' ||
    trainingType ===
      'hybrid'
  );
}

// ── Build the expert AI prompt for form analysis ───────────

export function buildFormAnalysisPrompt(
  exercise,
  category,
  user,
  trimStart,
  trimEnd
) {
  const firstName =
    user?.first_name ||
    user?.full_name
      ?.split(' ')[0] ||
    'Athlete';

  const level =
    user?.fitness_level ||
    'intermediate';

  const trainingType =
    user?.training_type ||
    'calisthenics';

  const injuries =
    user?.injuries ||
    '';

  const typeLabel =
    {
      calisthenics:
        'calisthenics',

      weighted_calisthenics:
        'weighted calisthenics',

      weights:
        'weight training',

      hybrid:
        'hybrid (calisthenics + weights)',
    }[
      trainingType
    ] ||
    'calisthenics';

  const trimInfo =
    trimStart !=
      null &&
    trimEnd !=
      null
      ? `The selected analysis window is ${trimStart.toFixed(
          1
        )}s to ${trimEnd.toFixed(
          1
        )}s. The AI receives chronological still frames sampled from this exact window.`
      : `The AI receives chronological still frames representing the movement sequence.`;

  return `
You are an elite calisthenics form-analysis expert and coach.

ATHLETE:
Name: ${firstName}
Level: ${level}
Training type: ${typeLabel}

EXERCISE:
${exercise}

MOVEMENT TYPE:
${
  category ===
  'hold'
    ? 'Static isometric hold'
    : 'Dynamic rep-based movement'
}

${trimInfo}

${
  injuries
    ? `KNOWN INJURIES / LIMITATIONS:
${injuries}`
    : ''
}

IMPORTANT MEDIA INSTRUCTION:

The input is NOT continuous video.

The input consists of chronological still frames extracted from a video.

Treat the supplied frames as ONE movement sequence ordered by timestamp.

Do not assume things happened between two frames unless the visible sequence reasonably supports that conclusion.

Do not claim continuous-video precision.

ANALYSIS PRIORITY:

Accuracy is more important than sounding confident.

Only report observations supported by the supplied frames.

If something cannot be determined reliably from the available frames, say so.

============================================================
1. CAMERA ANGLE
============================================================

Determine whether the camera angle is adequate for analyzing this exercise.

Consider:
- whether the athlete is visible
- whether the full relevant body is visible
- whether the angle allows the important joints and body line to be evaluated
- whether the camera is too far away
- whether the movement is obstructed

If the angle is inadequate, explain exactly why.

============================================================
2. REP COUNT / HOLD QUALITY
============================================================

DYNAMIC MOVEMENT:

Count only complete repetitions that are actually supported by the chronological frames.

Do not count incomplete movements as full reps.

Do not invent repetitions between widely separated frames.

STATIC HOLD:

Use the timestamps of the supplied frames to estimate when the athlete enters the position and when the position is visibly lost.

The hold-time estimate must reflect the limitations of sampled frames.

============================================================
3. ACTIVE RANGE
============================================================

Estimate:
- active_range_start
- active_range_end

using the supplied chronological frame timestamps.

Do not pretend these are exact continuous-video timestamps.

============================================================
4. FORM SCORE
============================================================

Give an overall form score from 1-100.

100 = textbook-perfect technique.

Be strict.

Most ordinary athletes should not receive 80+.

Do not inflate the score merely because the movement looks acceptable.

============================================================
5. JOINT POSITION
============================================================

Analyze what can actually be seen about:

- shoulders
- elbows
- wrists
- hips
- knees
- ankles
- spine

============================================================
6. BODY ALIGNMENT
============================================================

Look for:

- excessive arching
- excessive piking
- sagging
- twisting
- loss of body tension
- poor pelvic position
- asymmetry

============================================================
7. SCAPULAR MECHANICS
============================================================

Evaluate:

- protraction
- retraction
- elevation
- depression
- scapular control

Judge these according to the specific movement.

============================================================
8. RANGE OF MOTION
============================================================

Determine whether the visible movement appears to use appropriate range of motion.

Distinguish:

- full
- mostly full
- partial
- unclear

============================================================
9. TEMPO / CONTROL
============================================================

Assess control and momentum only where the sampled frames support the conclusion.

Do not claim precise tempo if the frames are insufficient.

============================================================
10. EXERCISE-SPECIFIC DETAILS
============================================================

HANDSTAND:
- banana / arched shape
- shoulder elevation
- shoulder line
- head position
- finger balance
- body line

PLANCHE:
- elbow lockout
- scapular position
- forward lean
- pelvis
- leg line
- sagging

FRONT / BACK LEVER:
- arm position
- body line
- shoulder position
- hip position
- piking / arching

MUSCLE-UP:
- transition
- unnecessary kip
- ring/bar control
- finishing position

PULL-UP:
- bottom range
- top range
- shoulder position
- swing
- control

DIP:
- depth
- shoulder position
- elbow tracking
- control

PUSH-UP:
- body line
- depth
- elbow tracking
- lockout
- scapular control

============================================================
11. ISSUES FOUND
============================================================

Identify every meaningful issue supported by the frames.

For each issue:

- area
- problem
- severity
- fix
- corrective_exercises

Severity must be:

minor
moderate
major
critical

Corrective exercises should be specific to the identified problem.

============================================================
12. PRIORITY FOCUS
============================================================

List the top 2-3 corrections in priority order.

Focus on the corrections that would produce the largest improvement in safe, technically sound performance.

============================================================
13. OVERALL ASSESSMENT
============================================================

Give a direct 3-5 sentence coaching summary.

Explain:

- what looks good
- what needs improvement
- the most important correction
- any important safety issue

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "camera_angle_ok": true,
  "camera_angle_note": "string",
  "score": 1,
  "rep_count": null,
  "hold_time_seconds": null,
  "active_range_start": null,
  "active_range_end": null,
  "overall_assessment": "string",
  "issues": [
    {
      "area": "string",
      "problem": "string",
      "severity": "minor",
      "fix": "string",
      "corrective_exercises": ["string"]
    }
  ],
  "priority_focus": ["string"]
}

Return nothing except the JSON object.
`;
}
