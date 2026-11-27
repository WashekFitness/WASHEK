// ── Calisthenics & Weightlifting exercise list for FormLab ──
// category: 'hold' = static isometric skill, 'dynamic' = rep-based movement

export const FORM_EXERCISES = [
  // Calisthenics — Push
  { name: 'Push-up', category: 'dynamic' },
  { name: 'Pseudo Planche Push-up', category: 'dynamic' },
  { name: 'Archer Push-up', category: 'dynamic' },
  { name: 'Diamond Push-up', category: 'dynamic' },
  { name: 'Decline Push-up', category: 'dynamic' },
  { name: 'Ring Push-up', category: 'dynamic' },
  { name: 'Dip', category: 'dynamic' },
  { name: 'Weighted Dip', category: 'dynamic' },
  { name: 'Ring Dip', category: 'dynamic' },
  { name: 'Pike Push-up', category: 'dynamic' },
  { name: 'Handstand Push-up', category: 'dynamic' },

  // Calisthenics — Pull
  { name: 'Pull-up', category: 'dynamic' },
  { name: 'Weighted Pull-up', category: 'dynamic' },
  { name: 'Chin-up', category: 'dynamic' },
  { name: 'Weighted Chin-up', category: 'dynamic' },
  { name: 'Australian Row', category: 'dynamic' },
  { name: 'Scapular Pull-up', category: 'dynamic' },
  { name: 'Archer Pull-up', category: 'dynamic' },
  { name: 'Typewriter Pull-up', category: 'dynamic' },
  { name: 'Muscle-up', category: 'dynamic' },
  { name: 'Bar Muscle-up', category: 'dynamic' },
  { name: 'Ring Muscle-up', category: 'dynamic' },

  // Weightlifting — Squats & Lower Body
  { name: 'Barbell Back Squat', category: 'dynamic' },
  { name: 'Barbell Front Squat', category: 'dynamic' },
  { name: 'Goblet Squat', category: 'dynamic' },
  { name: 'Hack Squat', category: 'dynamic' },
  { name: 'Bulgarian Split Squat', category: 'dynamic' },
  { name: 'Dumbbell Lunge', category: 'dynamic' },
  { name: 'Walking Lunge', category: 'dynamic' },
  { name: 'Leg Press', category: 'dynamic' },
  { name: 'Calf Raise', category: 'dynamic' },

  // Weightlifting — Hinges & Deadlifts
  { name: 'Deadlift', category: 'dynamic' },
  { name: 'Conventional Deadlift', category: 'dynamic' },
  { name: 'Sumo Deadlift', category: 'dynamic' },
  { name: 'Romanian Deadlift (RDL)', category: 'dynamic' },
  { name: 'Trap Bar Deadlift', category: 'dynamic' },
  { name: 'Barbell Hip Thrust', category: 'dynamic' },
  { name: 'Good Morning', category: 'dynamic' },
  { name: 'Kettlebell Swing', category: 'dynamic' },

  // Weightlifting — Horizontal & Vertical Press
  { name: 'Bench Press', category: 'dynamic' },
  { name: 'Incline Bench Press', category: 'dynamic' },
  { name: 'Dumbbell Bench Press', category: 'dynamic' },
  { name: 'Incline Dumbbell Press', category: 'dynamic' },
  { name: 'Overhead Press', category: 'dynamic' },
  { name: 'Dumbbell Shoulder Press', category: 'dynamic' },
  { name: 'Arnold Press', category: 'dynamic' },

  // Weightlifting — Rows, Pulldowns & Accessories
  { name: 'Barbell Row', category: 'dynamic' },
  { name: 'Pendlay Row', category: 'dynamic' },
  { name: 'Dumbbell Row', category: 'dynamic' },
  { name: 'Seated Cable Row', category: 'dynamic' },
  { name: 'T-Bar Row', category: 'dynamic' },
  { name: 'Lat Pulldown', category: 'dynamic' },
  { name: 'Face Pull', category: 'dynamic' },
  { name: 'Barbell Bicep Curl', category: 'dynamic' },
  { name: 'Dumbbell Curl', category: 'dynamic' },
  { name: 'Hammer Curl', category: 'dynamic' },
  { name: 'Preacher Curl', category: 'dynamic' },
  { name: 'Tricep Pushdown', category: 'dynamic' },
  { name: 'Overhead Tricep Extension', category: 'dynamic' },
  { name: 'Skull Crusher', category: 'dynamic' },
  { name: 'Lateral Raise', category: 'dynamic' },
  { name: 'Dumbbell Fly', category: 'dynamic' },
  { name: 'Barbell Shrug', category: 'dynamic' },

  // Olympic & Explosive Lifts
  { name: 'Power Clean', category: 'dynamic' },
  { name: 'Hang Clean', category: 'dynamic' },
  { name: 'Clean & Jerk', category: 'dynamic' },
  { name: 'Snatch', category: 'dynamic' },
  { name: 'Hang Snatch', category: 'dynamic' },
  { name: 'Thruster', category: 'dynamic' },

  // Bodyweight Legs
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
  { name: 'Plank', category: 'hold' },
  { name: 'Weighted Plank', category: 'hold' },
  { name: 'Wall Sit', category: 'hold' },
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
  { name: "Farmer's Hold", category: 'hold' },

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

  // Specific dynamic movements that contain static words (e.g. "hang clean", "push-up", "raise")
  const dynamicDisqualifiers = [
    'push-up',
    'pushup',
    'push up',
    'press',
    'dip',
    'pull-up',
    'pullup',
    'pull up',
    'chin-up',
    'chinup',
    'chin up',
    'muscle-up',
    'muscleup',
    'muscle up',
    'pulldown',
    'pushdown',
    'raise',
    'curl',
    'squat',
    'row',
    'deadlift',
    'rdl',
    'clean',
    'snatch',
    'jerk',
    'lunge',
    'thrust',
    'extension',
    'fly',
    'shrug',
    'swing',
    'kickback',
    'crusher',
    'thruster',
    'pull',
  ];
  if (dynamicDisqualifiers.some((d) => normalized.includes(d))) {
    return false;
  }

  // Common static isometric hold identifiers
  const staticPatterns = [
    'hold',
    'hang',
    'plank',
    'wall sit',
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
You are an elite calisthenics and weightlifting (barbell, dumbbell, kettlebell, cable, and machine) form-analysis expert and coach.

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
- whether the full relevant body (and barbell, dumbbells, or weights when used) is visible
- whether the angle allows the important joints, bar path, and body line to be evaluated
- whether the camera is too far away
- whether the movement is obstructed by plates, racks, or equipment

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
- DO NOT DISQUALIFY REPS FOR FORM FLAWS: If a repetition has cut depth, partial range of motion, soft lockout, slight momentum, or technique breakdown near fatigue, IT STILL FULLY COUNTS AS A REP! A repetition is counted whenever the user initiates and reverses the movement (e.g. descends and presses/squats back up, pulls and lowers, or hinges and locks out). Form flaws reduce the form score; they NEVER subtract from the rep count!
- COUNT FIRST AND LAST REPS: Count the initial rep (even if fast or setting up) and count the final rep (even if reaching muscular failure).
- Set "rep_count" to the exact total integer count of all repetitions performed.
- Set "hold_time_seconds": null.

STATIC ISOMETRIC HOLD RULES (REAL HOLD DURATION):
- NEVER COUNT REPS FOR STATIC HOLDS: For any static isometric hold (Planche, Front/Back Lever, L-Sit, V-Sit, Handstand, Dead Hang, Human Flag, Plank, Wall Sit, Isometric Hold, etc.), do NOT count repetitions under any circumstances. Set "rep_count": null.
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
4. FORM SCORE (FAIR, ACCURATE 1%-100% RATING)
============================================================

Give a fair, balanced overall form score from 1 to 100.

SCORING FAIRNESS & ACCURACY STANDARD:
- Apply the EXACT same fair 1%–100% scoring standard equally to both calisthenics and weightlifting exercises.
- Start by recognizing what the athlete executed well. Safe, controlled sets with solid range of motion and stable posture naturally belong in the 82%–100% range.
- Do NOT nitpick tiny stylistic preferences or camera-perspective quirks just to deduct points, and NEVER mark non-dangerous technique flaws as "critical" or "major". When still frames are slightly ambiguous due to angle, give the athlete the benefit of the doubt.
- Score from 1% to 100% based on honest, reasonable gym/coaching standards:
  * 95–100%: Textbook or near-perfect execution with full effective range of motion, controlled tempo, and strong alignment. Award 100% ("issues": []) whenever execution is genuinely clean and safe — 100% is attainable!
  * 80–94%: Good, solid execution that is safe and effective with 1–2 small polish cues (e.g., slightly faster eccentric, tiny bar drift, small symmetry tweak). Good but imperfect form belongs in the 80s–90s.
  * 65–79%: Noticeably off in one or more areas (e.g., slightly above-parallel squat depth, mild-to-moderate elbow flare, noticeable torso lean/bar drift, mild hip sag or momentum) WITHOUT real injury hazard. Keep non-dangerous off-form reasonable — never drag safe off-form into the 40s or below.
  * 40–64%: Clearly poor or sloppy execution (cutting half the range of motion, worming push-ups, bouncing barbell off chest, hitching deadlifts, heavy kipping/swinging, major asymmetry, collapsing core bracing).
  * 1–39%: Dangerous execution carrying real, immediate injury risk ONLY (e.g., severe collapsing/buckling lumbar spine under heavy load, severe knee valgus collapse under heavy load, uncontrolled dropping).
- Severity deduction guide (only for clear, unmistakable flaws):
  * "minor": small polish cue (-3 pts)
  * "moderate": noticeable non-dangerous flaw (-8 pts)
  * "major": clear large mechanical breakdown such as half-reps or heavy swinging/bouncing (-15 pts)
  * "critical": ONLY extreme acute injury risk (-40 pts)

============================================================
5. JOINT POSITION
============================================================

Analyze what can actually be seen about:

- shoulders
- elbows
- wrists
- hips
- knees
- ankles / heels
- spine (cervical, thoracic, lumbar)
- bar / weight path & grip symmetry (when external load is used)

============================================================
6. BODY ALIGNMENT
============================================================

Look for:

- excessive lumbar arching ("banana back") or spinal rounding ("cat-back" / butt wink)
- excessive piking
- sagging
- twisting or uneven weight shift
- loss of bracing / core body tension
- poor pelvic position
- knee valgus (caving inward) or heel lift
- asymmetry

============================================================
7. SCAPULAR MECHANICS
============================================================

Evaluate:

- protraction
- retraction
- elevation
- depression
- scapular control & ribcage stability

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

Assess control, bar/body speed, pause/touch-and-go habits, and momentum only where the sampled frames support the conclusion.

Do not claim precise tempo if the frames are insufficient.

============================================================
10. EXERCISE-SPECIFIC DETAILS
============================================================

Judge strictly against the specific mechanics of whichever calisthenics or weightlifting movement is being analyzed:

--- CALISTHENICS ---
HANDSTAND:
- banana / arched shape, shoulder elevation, shoulder line, head position, finger balance, body line

PLANCHE:
- elbow lockout, scapular protraction, forward lean, pelvis tilt, leg line, sagging

FRONT / BACK LEVER:
- arm lockout, body line, scapular depression/retraction, hip height, piking / arching

MUSCLE-UP:
- transition path, unnecessary kip, ring/bar control, straight-bar/ring dip lockout

PULL-UP / CHIN-UP:
- dead-hang bottom range, chin/chest over bar top range, shoulder depression, kipping/swing, eccentric control

DIP:
- depth (shoulders below elbows), forward torso lean stability, elbow tracking, lockout control

PUSH-UP:
- hollow/plank body line, chest-to-floor depth, elbow tuck (30°–50° vs flared >60°), full lockout, scapular control

--- WEIGHTLIFTING ---
SQUAT (BACK, FRONT, GOBLET, BULGARIAN SPLIT, HACK):
- squat depth (hip crease at or below top of knee / parallel)
- knee tracking in line with toes vs inward knee valgus collapse
- lumbar spine neutrality vs "butt wink" or chest collapse/good-morning hips shooting up early
- midfoot balance vs heels lifting or toes rolling up
- vertical bar path over midfoot & upper-back/rack tightness

DEADLIFT / HINGE (CONVENTIONAL, SUMO, RDL, TRAP BAR):
- neutral lumbar and thoracic spine under tension (zero lumbar rounding / "cat-back")
- bar staying tight against shins and thighs over midfoot (no forward bar drift)
- proper hip-hinge initiation & pulling slack out vs yanking or squatting the barbell
- synchronized hip and chest rise (hips not shooting up first)
- clean, vertical hip/knee lockout without exaggerated lumbar hyperextension at the top
- controlled eccentric vs bouncing plates off the floor

BENCH PRESS & HORIZONTAL PRESS (BARBELL, DUMBBELL, INCLINE):
- scapular retraction & depression on the bench with stable leg drive and glutes planted
- 45°–60° elbow tuck (avoid flaring elbows >75° at the shoulders)
- forearms vertical under wrists/bar at the bottom
- controlled J-curve bar path from chest/sternum up over shoulders without chest bouncing
- symmetrical press and clean elbow lockout without shoulder protraction collapse

OVERHEAD PRESS / SHOULDER PRESS (BARBELL, DUMBBELL, ARNOLD):
- vertical bar path clearing the chin/nose cleanly to stacked wrist-elbow-shoulder-hip lockout
- stacked wrists (not bent back excessively) and locked ribcage/glute brace (avoid excessive lower-back "banana" hyperextension)
- strict lower-body control (no unintended knee-dip push-press cheating on strict reps)

ROWS, PULLDOWNS & ISOLATION (BARBELL/DB/CABLE ROW, LAT PULLDOWN, CURLS, RAISES, TRICEPS):
- stable torso angle and braced spine without excessive hip heave, torso jerking, or momentum swinging
- scapular glide and elbow-driven pull without shrugging shoulders into ears
- upper-arm stability on curls/tricep extensions (elbows not swinging far forward/outward to cheat weight)
- controlled eccentric and full lengthened/shortened range of motion

OLYMPIC & EXPLOSIVE LIFTS (POWER CLEAN, HANG CLEAN, SNATCH, CLEAN & JERK, KETTLEBELL SWING):
- first and second pull torso angle, bar/bell staying close to body, and crisp triple extension timing
- aggressive pull-under / fast front-rack elbows or overhead catch stability without excessive starfishing or press-out
- on kettlebell swings: crisp hip hinge snap (not a squat) with ribcage locked at top (no lumbar lean-back)

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

Severity must be chosen conservatively:

minor — small technical polish cue (safe form, good rep overall)
moderate — noticeable off-form habit without acute safety risk
major — clearly broken mechanics (e.g. half ROM, heavy kipping/swinging, bouncing bar off chest)
critical — ONLY unmistakable, extreme acute injury hazard under load

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
