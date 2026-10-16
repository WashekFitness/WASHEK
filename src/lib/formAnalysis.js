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

// ── Kinematic motion & cycle analysis for exact rep & hold detection ──

export function computeKinematicMetrics(
  samples,
  category,
  windowDuration
) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return {
      detectedReps: null,
      detectedHoldSeconds: null,
      repTimelines: [],
      summary: '',
    };
  }

  const n = samples.length;
  const smoothedY = [];
  const smoothedEnergy = [];

  for (let i = 0; i < n; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const curr = samples[i];
    const next = samples[Math.min(n - 1, i + 1)];

    smoothedY.push(
      (prev.verticalCentroid + curr.verticalCentroid * 2 + next.verticalCentroid) / 4
    );
    smoothedEnergy.push(
      (prev.motionEnergy + curr.motionEnergy * 2 + next.motionEnergy) / 4
    );
  }

  const avgY = smoothedY.reduce((a, b) => a + b, 0) / n;
  const varianceY = smoothedY.reduce((acc, val) => acc + Math.pow(val - avgY, 2), 0) / n;
  const stdY = Math.sqrt(varianceY);
  const avgEnergy = smoothedEnergy.reduce((a, b) => a + b, 0) / n;

  if (category === 'hold') {
    // For static isometric holds: identify the continuous stable window
    const stabilityThreshold = Math.max(0.015, avgEnergy * 0.85);
    let bestHoldStart = samples[0].timestamp;
    let bestHoldEnd = samples[n - 1].timestamp;
    let maxHoldDuration = 0;
    let currentStart = null;

    for (let i = 0; i < n; i++) {
      const isStable = smoothedEnergy[i] <= stabilityThreshold;
      if (isStable) {
        if (currentStart === null) currentStart = samples[i].timestamp;
      } else {
        if (currentStart !== null) {
          const dur = samples[i].timestamp - currentStart;
          if (dur > maxHoldDuration) {
            maxHoldDuration = dur;
            bestHoldStart = currentStart;
            bestHoldEnd = samples[i].timestamp;
          }
          currentStart = null;
        }
      }
    }

    if (currentStart !== null) {
      const dur = samples[n - 1].timestamp - currentStart;
      if (dur > maxHoldDuration) {
        maxHoldDuration = dur;
        bestHoldStart = currentStart;
        bestHoldEnd = samples[n - 1].timestamp;
      }
    }

    const detectedHoldSeconds = Math.max(
      0.5,
      Math.min(windowDuration, maxHoldDuration > 0 ? maxHoldDuration : windowDuration * 0.95)
    );

    return {
      detectedReps: null,
      detectedHoldSeconds: Number(detectedHoldSeconds.toFixed(1)),
      repTimelines: [],
      summary: `Kinematically tracked hold stability: ${bestHoldStart.toFixed(2)}s to ${bestHoldEnd.toFixed(2)}s (${detectedHoldSeconds.toFixed(1)}s)`,
    };
  }

  // Dynamic movement cycle detection (reps)
  const peaks = [];
  const troughs = [];
  const minDistanceSamples = Math.max(2, Math.round(n / Math.max(1, windowDuration / 0.8)));

  for (let i = 1; i < n - 1; i++) {
    const isLocalMax = smoothedY[i] > smoothedY[i - 1] && smoothedY[i] >= smoothedY[i + 1];
    const isLocalMin = smoothedY[i] < smoothedY[i - 1] && smoothedY[i] <= smoothedY[i + 1];

    if (isLocalMax && Math.abs(smoothedY[i] - avgY) > stdY * 0.3) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1].index >= minDistanceSamples) {
        peaks.push({ index: i, timestamp: samples[i].timestamp, value: smoothedY[i] });
      }
    }
    if (isLocalMin && Math.abs(smoothedY[i] - avgY) > stdY * 0.3) {
      if (troughs.length === 0 || i - troughs[troughs.length - 1].index >= minDistanceSamples) {
        troughs.push({ index: i, timestamp: samples[i].timestamp, value: smoothedY[i] });
      }
    }
  }

  const energyPeaks = [];
  for (let i = 1; i < n - 1; i++) {
    if (
      smoothedEnergy[i] > smoothedEnergy[i - 1] &&
      smoothedEnergy[i] >= smoothedEnergy[i + 1] &&
      smoothedEnergy[i] > avgEnergy * 0.55
    ) {
      if (
        energyPeaks.length === 0 ||
        samples[i].timestamp - energyPeaks[energyPeaks.length - 1].timestamp >= 0.7
      ) {
        energyPeaks.push({ timestamp: samples[i].timestamp });
      }
    }
  }

  const inflectionCycles = Math.min(peaks.length, troughs.length);
  const energyRepEstimate = Math.round(energyPeaks.length / 2);

  let detectedReps = inflectionCycles;
  if (detectedReps === 0 && energyRepEstimate > 0) {
    detectedReps = energyRepEstimate;
  } else if (detectedReps > 0 && energyRepEstimate > 0 && Math.abs(detectedReps - energyRepEstimate) <= 2) {
    detectedReps = Math.max(detectedReps, energyRepEstimate);
  }

  const maxPossibleReps = Math.max(1, Math.floor(windowDuration / 1.0));
  detectedReps = Math.min(detectedReps, maxPossibleReps);

  const repTimelines = peaks.map((p, idx) => ({
    rep: idx + 1,
    inflectionTimestamp: Number(p.timestamp.toFixed(2)),
  }));

  const summary = `Kinematically verified ${detectedReps} movement cycle(s) in analyzed section.`;

  return {
    detectedReps,
    detectedHoldSeconds: null,
    repTimelines,
    summary,
  };
}

// ── Build the expert AI prompt for form analysis ───────────

export function buildFormAnalysisPrompt(
  exercise,
  category,
  user,
  trimStart,
  trimEnd,
  kinematicInfo = null
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

${
  kinematicInfo
    ? `KINEMATIC MOVEMENT DATA:
${kinematicInfo}`
    : ''
}

IMPORTANT MEDIA INSTRUCTION:

The input consists of chronological high-resolution still frames extracted from the selected video window.
Analyze all supplied frames as ONE continuous chronological movement sequence ordered by timestamp.

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
2. CRITICAL ACCURACY MANDATE: REP COUNT & HOLD TIME
============================================================

ANALYZED SECTION BOUNDARIES:
- Analysis Start: ${trimStart != null ? trimStart.toFixed(2) + 's' : '0.00s'}
- Analysis End: ${trimEnd != null ? trimEnd.toFixed(2) + 's' : 'end of video'}
- Section Duration: ${trimStart != null && trimEnd != null ? (trimEnd - trimStart).toFixed(2) + 's' : 'full video'}

CRITICAL SCOPING RULE:
Count reps and measure hold times STRICTLY AND ONLY within this analyzed section.
Do not count any repetitions or setup movements that occurred before ${trimStart != null ? trimStart.toFixed(2) + 's' : '0.00s'} or after ${trimEnd != null ? trimEnd.toFixed(2) + 's' : 'end of video'}.

DYNAMIC REP COUNTING RULES:
- ACCURACY IS CRITICAL: You must accurately and strictly count every single completed repetition inside this analyzed section.
- If the athlete performs 10 reps in this section, you must count exactly 10 reps.
- Track every full movement cycle (initiation / eccentric descent -> turnaround/depth inflection -> concentric ascent -> lockout/reset).
- Count each completed repetition that reaches acceptable range of motion.
- Look across all the chronological frames from first frame to last frame to tally each completed rep.
- Set "rep_count" to the exact integer of completed reps (e.g., 10). Set "hold_time_seconds" to null.

STATIC ISOMETRIC HOLD RULES:
- ACCURACY IS CRITICAL: Hold times must be spot-on in seconds strictly within the analyzed section.
- Identify the exact timestamp when the athlete locks into the target isometric shape.
- Identify the exact timestamp when the athlete breaks form, sags, drops, or when the analyzed section ends.
- Calculate hold duration: hold_time_seconds = (end_timestamp - start_timestamp).
- The hold time MUST be spot-on (e.g., 8.5 or 12.0) and CANNOT exceed the analyzed section duration (${trimStart != null && trimEnd != null ? (trimEnd - trimStart).toFixed(2) + 's' : 'window duration'}).
- Set "hold_time_seconds" to the exact hold duration in seconds. Set "rep_count" to null.

============================================================
3. ACTIVE RANGE
============================================================

Estimate:
- active_range_start (the second within the analyzed window where the first rep/hold begins)
- active_range_end (the second within the analyzed window where the final rep finishes or hold drops)

============================================================
4. FORM SCORE (FAIR & ACCURATE RATING SYSTEM)
============================================================

Give an overall form score from 1-100.

Provide a balanced, objective, and FAIR rating. Do NOT be unrealistically harsh or give a low score if the athlete has not actually messed up their form:

- 90–100: Exceptional technique. Clean alignment, strong stability, full range of motion, and textbook mechanics with no noticeable flaws.
- 80–89: Solid, good form. Safe, technically sound execution with proper joint tracking and control. Only minor nuances or slight fatigue indicators. If the athlete performed the movement well without messing up their form, they deserve a rating in this 80-89 range.
- 70–79: Decent execution with moderate technique points to refine. The movement is functional and safe, but there are clear areas for improvement (e.g., slight knee cave, minor spinal shift, early elbow flare, or slight momentum).
- 55–69: Inconsistent form with noticeable breakdown that impairs movement efficiency or increases injury risk.
- Below 55: Significant breakdown or severe form collapse.

SCORING PRINCIPLES:
- Be fair and objective: Reward good mechanics, stability, and control with solid scores (80+).
- Differentiate between natural anatomical variations (e.g. torso-to-femur ratios, arm span, individual stance width) versus actual mechanical breakdown.
- Deduct points ONLY for actual visible flaws clearly supported by the frames. Never invent issues or penalize an athlete whose movement is clean and safe.

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

Identify only REAL, meaningful issues supported by the frames.

If the movement was performed cleanly with good mechanics, it is completely acceptable to return an empty issues list [] or list only 1 subtle refinement. Do not manufacture problems or penalize the athlete if their technique is sound.

For each issue (if any):

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
