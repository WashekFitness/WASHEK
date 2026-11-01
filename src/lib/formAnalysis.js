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

// ── Check if an exercise is a static isometric hold ──────────

export function isStaticHoldExercise(exerciseName = '', category = '') {
  if (category === 'hold') return true;
  if (!exerciseName || typeof exerciseName !== 'string') return false;
  const normalized = exerciseName.trim().toLowerCase();

  const found = FORM_EXERCISES.find((e) => e.name.toLowerCase() === normalized);
  if (found) return found.category === 'hold';

  // Specific dynamic movements that contain static words (e.g. "push-up", "raise")
  const dynamicDisqualifiers = [
    'push-up',
    'pushup',
    'push up',
    'press',
    'dip',
    'pull-up',
    'pullup',
    'pull up',
    'raise',
    'curl',
    'squat',
    'row',
  ];
  if (dynamicDisqualifiers.some((d) => normalized.includes(d))) {
    return false;
  }

  // Common static isometric hold identifiers
  const staticPatterns = [
    'hold',
    'hang',
    'l-sit',
    'lsit',
    'v-sit',
    'vsit',
    'manna',
    'flag',
    'lever',
    'planche',
    'handstand',
  ];

  return staticPatterns.some((p) => normalized.includes(p));
}

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

// ── Frame-skipping algorithm: prioritize key movement phases ──────────

export function prioritizeKeyframeIndices(
  samples,
  category = 'dynamic',
  windowDuration = 10,
  targetCount = 14
) {
  if (!Array.isArray(samples) || samples.length <= targetCount) {
    return (samples || []).map((s, idx) => ({
      sampleIndex: idx,
      keyframeNumber: idx + 1,
      timestamp: s.timestamp,
      phase: s.phase || (idx === 0 ? 'Movement Setup / Initiation' : idx === samples.length - 1 ? 'Final Rep Completion' : 'Movement Phase'),
      priority: 100,
    }));
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

  const keyframeMap = new Map(); // index -> { priority, phase }

  // 1. Always prioritize movement boundaries
  keyframeMap.set(0, { priority: 95, phase: 'Movement Setup / Initiation' });
  keyframeMap.set(n - 1, { priority: 95, phase: 'Final Rep Lockout / Completion' });

  if (category === 'hold') {
    // Static isometric holds:
    const stabilityThreshold = Math.max(0.015, avgEnergy * 0.85);
    let holdIndices = [];
    for (let i = 0; i < n; i++) {
      if (smoothedEnergy[i] <= stabilityThreshold) {
        holdIndices.push(i);
      }
    }
    if (holdIndices.length < 3) {
      holdIndices = samples.map((_, i) => i);
    }

    const entryIdx = holdIndices[0];
    keyframeMap.set(entryIdx, { priority: 100, phase: 'Hold Entry & Stabilization' });

    const exitIdx = holdIndices[holdIndices.length - 1];
    keyframeMap.set(exitIdx, { priority: 100, phase: 'Hold Exit / Dismount' });

    // Pick evenly spaced hold anchors across the stable window
    const internalSlots = Math.max(4, targetCount - 4);
    for (let s = 1; s <= internalSlots; s++) {
      const ratio = s / (internalSlots + 1);
      const chosenIdx = holdIndices[Math.floor(ratio * (holdIndices.length - 1))];
      if (chosenIdx !== undefined && !keyframeMap.has(chosenIdx)) {
        keyframeMap.set(chosenIdx, {
          priority: 85,
          phase: `Hold Stability Anchor (${samples[chosenIdx].timestamp.toFixed(1)}s)`,
        });
      }
    }
  } else {
    // Dynamic movements:
    let repCount = 0;

    for (let i = 1; i < n - 1; i++) {
      const isLocalMax = smoothedY[i] > smoothedY[i - 1] && smoothedY[i] >= smoothedY[i + 1];
      const isLocalMin = smoothedY[i] < smoothedY[i - 1] && smoothedY[i] <= smoothedY[i + 1];

      // Turnaround inflection points (depth bottom or peak contraction)
      if (isLocalMax && (Math.abs(smoothedY[i] - avgY) > stdY * 0.25 || smoothedEnergy[i] > avgEnergy * 0.4)) {
        repCount++;
        keyframeMap.set(i, {
          priority: 100, // Never skip inflection points!
          phase: `Inflection Point / Turnaround (Rep ${repCount})`,
        });
      }

      // Lockout / extension inflection points
      if (isLocalMin && (Math.abs(smoothedY[i] - avgY) > stdY * 0.25 || smoothedEnergy[i] > avgEnergy * 0.4)) {
        keyframeMap.set(i, {
          priority: 100, // Never skip inflection points!
          phase: `Concentric Lockout / Extension (Rep ${Math.max(1, repCount)})`,
        });
      }
    }

    // Velocity reversals for subtle or partial range reps
    for (let i = 2; i < n - 2; i++) {
      if (keyframeMap.has(i)) continue;
      const vPrev = smoothedY[i] - smoothedY[i - 1];
      const vNext = smoothedY[i + 1] - smoothedY[i];
      if (vPrev * vNext < 0 && Math.abs(vPrev - vNext) > stdY * 0.15) {
        repCount++;
        keyframeMap.set(i, {
          priority: 90,
          phase: `Phase Reversal / Turnaround (Rep ${Math.max(1, repCount)})`,
        });
      }
    }

    // Mid-phase transition frames to capture body alignment and range of motion path
    const selectedSorted = Array.from(keyframeMap.keys()).sort((a, b) => a - b);
    for (let g = 0; g < selectedSorted.length - 1; g++) {
      const idxA = selectedSorted[g];
      const idxB = selectedSorted[g + 1];
      if (idxB - idxA >= 3) {
        const mid = Math.round((idxA + idxB) / 2);
        if (!keyframeMap.has(mid)) {
          keyframeMap.set(mid, {
            priority: 70,
            phase: 'Movement Transition / Path of Motion',
          });
        }
      }
    }
  }

  // If fewer than targetCount, fill with highest motion energy candidate frames
  if (keyframeMap.size < targetCount) {
    const candidates = [];
    for (let i = 0; i < n; i++) {
      if (!keyframeMap.has(i)) {
        const score = smoothedEnergy[i] + (Math.abs(smoothedY[i] - avgY) / (stdY || 1)) * 0.1;
        candidates.push({ index: i, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const cand of candidates) {
      if (keyframeMap.size >= targetCount) break;
      keyframeMap.set(cand.index, {
        priority: 50,
        phase: 'Movement Transition',
      });
    }
  }

  // If more than targetCount + 2, prune lowest-priority frames first (never prune priority >= 90)
  if (keyframeMap.size > targetCount + 2) {
    const entries = Array.from(keyframeMap.entries()).sort((a, b) => a[1].priority - b[1].priority);
    for (const [idx, data] of entries) {
      if (keyframeMap.size <= targetCount) break;
      if (data.priority >= 90) continue; // Never skip inflection points or anchors!
      keyframeMap.delete(idx);
    }
  }

  const finalIndices = Array.from(keyframeMap.keys()).sort((a, b) => a - b);
  return finalIndices.map((sampleIdx, keyframeNum) => ({
    sampleIndex: sampleIdx,
    keyframeNumber: keyframeNum + 1,
    timestamp: samples[sampleIdx].timestamp,
    phase: keyframeMap.get(sampleIdx).phase,
    priority: keyframeMap.get(sampleIdx).priority,
  }));
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

DYNAMIC REP COUNTING RULES (NEVER TAKE AWAY OR DROP REPS):
- THE REP COUNTER MUST BE 100% REAL & EXACT: Do not guess, do not add phantom reps, and NEVER take away valid reps.
- COUNT EVERY ATTEMPTED REPETITION: Count all repetitions the athlete performs in the analyzed window from the very first rep to the very last rep.
- DO NOT DISQUALIFY REPS FOR FORM FLAWS: If a repetition has cut depth, partial range of motion, soft lockout, slight momentum, or technique breakdown near fatigue, IT STILL FULLY COUNTS AS A REP! A repetition is counted whenever the user initiates and reverses the movement (e.g. descends and presses back up, or pulls and lowers). Form flaws reduce the form score; they NEVER subtract from the rep count!
- COUNT FIRST AND LAST REPS: Count the initial rep (even if fast or setting up) and count the final rep (even if reaching muscular failure).
- Set "rep_count" to the exact total integer count of all repetitions performed.
- Set "hold_time_seconds": null.

STATIC ISOMETRIC HOLD RULES (REAL HOLD DURATION):
- NEVER COUNT REPS FOR STATIC HOLDS: For any static isometric hold (Planche, Front/Back Lever, L-Sit, V-Sit, Handstand, Dead Hang, Human Flag, etc.), do NOT count repetitions under any circumstances. Set "rep_count": null.
- Measure the full continuous hold duration in seconds strictly within the analyzed section from the moment the athlete stabilizes in the hold until they completely drop, dismount, or touch down.
- Minor wobbles, balance micro-adjustments, or slight form sagging DO NOT terminate the hold timer — the timer continues until the athlete actually drops or exits the hold. Form imperfections affect the form score, NOT the hold time duration.
- Set "hold_time_seconds": number (e.g. 8.5 or 12.0). Set "rep_count" strictly to null.

============================================================
3. ACTIVE RANGE
============================================================

Estimate:
- active_range_start (the second within the analyzed window where the first rep/hold begins)
- active_range_end (the second within the analyzed window where the final rep finishes or hold drops)

============================================================
4. FORM SCORE (REAL SCORE FROM 1%-100% — ABSOLUTELY NO SUGARCOATING)
============================================================

Give an overall form score from 1 to 100.

SCORING ACCURACY & TRUTH MANDATE (TELL LITERALLY EVERYTHING WRONG — NEVER SUGARCOAT):
- The rating must be REAL, accurate, and completely honest. Stop sugarcoating. If form is bad or dangerous, TELL LITERALLY EVERYTHING WRONG WITH THE FORM. Bad or dangerous form is dangerous and must NEVER be scored high or sugarcoated to spare feelings.
- Score anywhere from 1% to 100% based on honest reality:
  * 1–20%: Dangerous or hazardous execution with high injury risk (e.g., collapsing lumbar spine under load, severe shoulder impingement shearing, uncontrolled dropping/falling).
  * 20–44%: Poor, broken, or terrible form (severe lumbar hyperextension/sagging, worming push-ups, heavy kipping/swinging, cutting half the range of motion, severe asymmetry, collapsed core tension).
  * 45–69%: Sub-par or flawed execution with noticeable breakdown (cutting 20–30% ROM, flared elbows >60°, uncontrolled eccentric cadence, soft lockout).
  * 70–84%: Acceptable or moderate execution with clear technical flaws to fix.
  * 85–94%: High-level execution with 1 minor technical refinement.
  * 95–100%: Rare, flawless, gymnastics-grade textbook execution with full range of motion, locked body tension, and zero complaints.
- Deductions:
  * Minor tip: -5 to -8 pts
  * Moderate flaw: -15 to -20 pts
  * Major breakdown: -30 to -45 pts
  * Critical safety hazard: -50 to -80 pts
- If there are critical or dangerous flaws, the score MUST drop into the 1% to 25% range!
- Multiple major flaws MUST drop the score into the 20s–40s range.
- Deduct points for all actual visible flaws supported by the frames. Be direct, clear, and unvarnished.

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

CRITICAL ZERO COMPLAINTS RULE:
If the movement was performed cleanly with textbook mechanics and you have no complaints or flaws to report, you MUST return an empty issues list: "issues": [].
Do NOT manufacture fake problems or invent minor nitpicks if the athlete executed clean, safe form.

For each issue (if any real breakdown exists):

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

If issues were found, list the top 1-3 actionable corrections in priority order.
If the form was clean and textbook with no complaints (score is 100%), set:
"priority_focus": ["Maintain this textbook form and joint alignment as you increase volume."]

============================================================
13. OVERALL ASSESSMENT
============================================================

Give a direct 3-5 sentence coaching summary that accurately matches the score and issues.
- If the score is 100% (zero complaints): celebrate their flawless execution and praise their alignment, joint tracking, and control.
- If issues exist: explain what looked good, what specific flaw needs refinement, and the single most important correction.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "camera_angle_ok": true,
  "camera_angle_note": "string",
  "score": 88,
  "rep_count": null,
  "rep_breakdown": [
    {
      "rep": 1,
      "start_time_s": 0.0,
      "inflection_time_s": 1.2,
      "completion_time_s": 2.1
    }
  ],
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
