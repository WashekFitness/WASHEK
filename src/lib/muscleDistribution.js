/**
 * Muscle group classification, volume aggregation, rep/hold-time calculation,
 * and scientific fatigue benchmarking.
 *
 * Volume Landmarks (Israetel, Schoenfeld et al.):
 * - Undertrained: < 6 sets/week (sub-effective stimulus)
 * - Maintenance: 6-9 sets/week (tissue preservation)
 * - Optimal Stimulus (MAV): 10-18 sets/week (peak hypertrophy & strength)
 * - High Fatigue / Overreaching: 19-24 sets/week (near upper recovery ceiling)
 * - Overtraining Risk (> MRV): > 24 sets/week (exhaustion, tendonitis & joint risk)
 */

export const MUSCLE_GROUPS = [
  { id: 'chest', name: 'Chest', region: 'upper', targetMin: 10, targetMax: 18, mrv: 24, anatomicalLabel: 'Pectoralis Major & Minor' },
  { id: 'back', name: 'Back & Lats', region: 'upper', targetMin: 10, targetMax: 18, mrv: 24, anatomicalLabel: 'Latissimus Dorsi & Rhomboids' },
  { id: 'shoulders', name: 'Shoulders', region: 'upper', targetMin: 10, targetMax: 18, mrv: 24, anatomicalLabel: 'Anterior, Lateral & Rear Deltoids' },
  { id: 'traps', name: 'Trapezius', region: 'upper', targetMin: 6, targetMax: 14, mrv: 20, anatomicalLabel: 'Upper & Mid Trapezius' },
  { id: 'triceps', name: 'Triceps', region: 'upper', targetMin: 8, targetMax: 16, mrv: 22, anatomicalLabel: 'Triceps Brachii (3 Heads)' },
  { id: 'biceps', name: 'Biceps & Forearms', region: 'upper', targetMin: 8, targetMax: 16, mrv: 22, anatomicalLabel: 'Biceps Brachii & Brachioradialis' },
  { id: 'core', name: 'Core & Abs', region: 'core', targetMin: 8, targetMax: 16, mrv: 22, anatomicalLabel: 'Rectus Abdominis & Obliques' },
  { id: 'quads', name: 'Quadriceps', region: 'lower', targetMin: 10, targetMax: 18, mrv: 24, anatomicalLabel: 'Rectus Femoris & Vastus Medialis' },
  { id: 'hamstrings_glutes', name: 'Hamstrings & Glutes', region: 'lower', targetMin: 10, targetMax: 18, mrv: 24, anatomicalLabel: 'Gluteus Maximus & Hamstrings' },
  { id: 'calves', name: 'Calves', region: 'lower', targetMin: 6, targetMax: 14, mrv: 20, anatomicalLabel: 'Gastrocnemius & Soleus' },
];

/**
 * Parses exact reps or isometric hold seconds from strings like:
 * "12", "10, 10, 8", "8-10", "30s", "45s hold", "Max Hold"
 */
export function parseExerciseVolumeMetrics(repsString = '', setsCount = 1) {
  const str = String(repsString || '').trim().toLowerCase();
  const safeSets = Math.max(1, Number(setsCount) || 1);

  // Isometric hold time (e.g., "30s", "45s hold", "20 sec")
  const isHold = str.includes('s') || str.includes('sec') || str.includes('hold');
  const holdMatch = str.match(/(\d+)\s*(s|sec|second|seconds| hold)?/i);

  if (isHold && holdMatch && parseInt(holdMatch[1], 10) > 0) {
    const secsPerSet = parseInt(holdMatch[1], 10);
    return {
      isIsometric: true,
      holdSecondsPerSet: secsPerSet,
      totalHoldSeconds: secsPerSet * safeSets,
      repsPerSet: 0,
      totalReps: 0,
      displayText: `${secsPerSet}s / set (${secsPerSet * safeSets}s total)`,
    };
  }

  // Comma-separated reps across sets (e.g., "12, 10, 10, 8")
  if (str.includes(',')) {
    const parts = str
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => !isNaN(n));
    if (parts.length > 0) {
      const sumReps = parts.reduce((a, b) => a + b, 0);
      const avgReps = Math.round((sumReps / parts.length) * 10) / 10;
      return {
        isIsometric: false,
        holdSecondsPerSet: 0,
        totalHoldSeconds: 0,
        repsPerSet: avgReps,
        totalReps: sumReps,
        displayText: `${sumReps} reps total (${parts.join('/')})`,
      };
    }
  }

  // Rep range (e.g. "8-10")
  const rangeMatch = str.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    const avg = (min + max) / 2;
    return {
      isIsometric: false,
      holdSecondsPerSet: 0,
      totalHoldSeconds: 0,
      repsPerSet: avg,
      totalReps: Math.round(avg * safeSets),
      displayText: `${min}–${max} reps (${Math.round(avg * safeSets)} total)`,
    };
  }

  // Single number of reps (e.g. "8" or "10 reps")
  const singleMatch = str.match(/(\d+)/);
  if (singleMatch) {
    const reps = parseInt(singleMatch[1], 10);
    return {
      isIsometric: false,
      holdSecondsPerSet: 0,
      totalHoldSeconds: 0,
      repsPerSet: reps,
      totalReps: reps * safeSets,
      displayText: `${reps} reps / set (${reps * safeSets} total)`,
    };
  }

  // Fallback default
  return {
    isIsometric: false,
    holdSecondsPerSet: 0,
    totalHoldSeconds: 0,
    repsPerSet: 10,
    totalReps: 10 * safeSets,
    displayText: `${safeSets} sets`,
  };
}

/**
 * Exercise regex matching rules for primary and secondary muscle distribution
 */
const EXERCISE_PATTERNS = [
  // CHEST
  {
    regex: /(bench press|push-up|pushup|push up|dip|chest fly|pec deck|floor press|dumbbell press|chest press)/i,
    primary: 'chest',
    split: { chest: 1.0, triceps: 0.5, shoulders: 0.3 },
  },
  // BACK & LATS
  {
    regex: /(pull-up|pullup|pull up|lat pull|pulldown|bent-over row|cable row|inverted row|australian pull|t-bar row|seated row|front lever|dead hang|scapular pull)/i,
    primary: 'back',
    split: { back: 1.0, biceps: 0.5, shoulders: 0.3, traps: 0.4 },
  },
  // SHOULDERS / DELTOIDS
  {
    regex: /(overhead press|military press|shoulder press|handstand|pike push-up|pike pushup|lateral raise|face pull|rear delt|arnold press|planche)/i,
    primary: 'shoulders',
    split: { shoulders: 1.0, triceps: 0.4, traps: 0.4, core: 0.2 },
  },
  // TRAPS & SCAPULA
  {
    regex: /(shrug|scapular shrug|face pull|rack pull|farmer walk)/i,
    primary: 'traps',
    split: { traps: 1.0, shoulders: 0.4, back: 0.3 },
  },
  // TRICEPS ISOLATION
  {
    regex: /(tricep|pushdown|skull crusher|overhead extension|kickback|diamond push)/i,
    primary: 'triceps',
    split: { triceps: 1.0 },
  },
  // BICEPS ISOLATION & FOREARMS
  {
    regex: /(curl|chin-up|chinup|chin up|bicep|wrist curl|hammer curl)/i,
    primary: 'biceps',
    split: { biceps: 1.0, back: 0.4 },
  },
  // CORE / ABS
  {
    regex: /(hollow body|l-sit|v-sit|leg raise|knee raise|plank|toes to bar|dragon flag|crunch|ab wheel|woodchopper|deadbug)/i,
    primary: 'core',
    split: { core: 1.0 },
  },
  // QUADRICEPS
  {
    regex: /(squat|split squat|lunge|leg press|pistol squat|sissy squat|step up|hack squat|quad)/i,
    primary: 'quads',
    split: { quads: 1.0, hamstrings_glutes: 0.5, calves: 0.2 },
  },
  // HAMSTRINGS & GLUTES
  {
    regex: /(deadlift|rdl|romanian deadlift|nordic|hip thrust|glute bridge|hamstring curl|good morning|back extension)/i,
    primary: 'hamstrings_glutes',
    split: { hamstrings_glutes: 1.0, core: 0.3, back: 0.2 },
  },
  // CALVES
  {
    regex: /(calf|calves|jump rope|jumping drill)/i,
    primary: 'calves',
    split: { calves: 1.0 },
  },
];

/**
 * Classifies an exercise name into its muscle distribution
 */
export function classifyExercise(exerciseName = '') {
  const name = String(exerciseName || '').trim().toLowerCase();
  if (!name) return null;

  for (const pattern of EXERCISE_PATTERNS) {
    if (pattern.regex.test(name)) {
      return pattern;
    }
  }

  // Heuristic fallbacks
  if (name.includes('press') || name.includes('push')) {
    return { primary: 'chest', split: { chest: 0.8, shoulders: 0.5, triceps: 0.4 } };
  }
  if (name.includes('pull') || name.includes('row')) {
    return { primary: 'back', split: { back: 0.8, biceps: 0.5, traps: 0.3 } };
  }
  if (name.includes('leg') || name.includes('squat')) {
    return { primary: 'quads', split: { quads: 0.8, hamstrings_glutes: 0.5 } };
  }

  return { primary: 'core', split: { core: 0.5 } };
}

/**
 * Categorizes set volume and workload into scientific training zones
 */
export function getVolumeZone(sets, config) {
  const count = Number(sets) || 0;
  const targetMin = config?.targetMin || 10;
  const targetMax = config?.targetMax || 18;
  const mrv = config?.mrv || 24;

  if (count === 0) {
    return {
      status: 'untrained',
      label: 'Untrained',
      badge: 'Zero Sets',
      color: 'slate',
      bgClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      barColor: '#475569',
      heatScore: 0,
      gradient: ['#334155', '#475569'],
      description: 'Zero working sets recorded this week. Muscle protein synthesis is at resting baseline.',
      advice: 'Introduce 6–10 working sets to initiate neuromuscular adaptation.',
    };
  }

  if (count < 6) {
    return {
      status: 'undertrained',
      label: 'Undertrained',
      badge: 'Sub-Optimal',
      color: 'sky',
      bgClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      barColor: '#0ea5e9',
      heatScore: 1,
      gradient: ['#0284c7', '#38bdf8'],
      description: 'Below the Minimum Effective Dose (< 6 sets/wk). Growth is slow or stalled.',
      advice: `Needs +${Math.round((6 - count) * 10) / 10} more sets to trigger progressive hypertrophy.`,
    };
  }

  if (count < targetMin) {
    return {
      status: 'maintenance',
      label: 'Maintenance',
      badge: 'Base Volume',
      color: 'blue',
      bgClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      barColor: '#3b82f6',
      heatScore: 2,
      gradient: ['#2563eb', '#60a5fa'],
      description: 'Maintains muscle mass and preserves neural efficiency with minimal systemic fatigue.',
      advice: `Add +${Math.round((targetMin - count) * 10) / 10} sets to enter the maximum adaptive hypertrophy zone.`,
    };
  }

  if (count <= targetMax) {
    return {
      status: 'optimal',
      label: 'Optimal Stimulus',
      badge: 'MAV Sweet Spot',
      color: 'emerald',
      bgClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      barColor: '#10b981',
      heatScore: 3,
      gradient: ['#059669', '#34d399'],
      description: `Maximum Adaptive Volume (${targetMin}–${targetMax} sets/wk). Peak progress with manageable recovery.`,
      advice: 'Perfect volume bracket. Keep 1–2 RIR discipline and sustain current cadence.',
    };
  }

  if (count <= mrv) {
    return {
      status: 'high_fatigue',
      label: 'High Stimulus',
      badge: 'High Fatigue',
      color: 'amber',
      bgClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      barColor: '#f59e0b',
      heatScore: 4,
      gradient: ['#d97706', '#fbbf24'],
      description: `High fatigue zone (${targetMax + 1}–${mrv} sets/wk). Nearing maximum recovery threshold.`,
      advice: 'High systemic fatigue. Ensure adequate sleep, hydration, and nutritional surplus.',
    };
  }

  return {
    status: 'overtrained',
    label: 'Overtraining Risk',
    badge: 'MRV Exceeded',
    color: 'rose',
    bgClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    barColor: '#f43f5e',
    heatScore: 5,
    gradient: ['#e11d48', '#fb7185'],
    description: `Exceeds Maximum Recoverable Volume (> ${mrv} sets/wk). Severe risk of tendonitis, joint degradation, and CNS burnout.`,
    advice: `Volume is excessive (+${Math.round((count - mrv) * 10) / 10} sets over MRV). Deload or reduce sets immediately.`,
  };
}

/**
 * Calculates weekly muscle distribution accurately from:
 * 1. Logged workout logs (actual completed sets, reps achieved, and hold times)
 * 2. Active program schedule (planned sets, reps, and hold times)
 */
export function calculateWeeklyMuscleDistribution({
  program = null,
  logs = [],
  currentWeekNum = 1,
  weekStartDate = null,
  weekEndDate = null,
}) {
  // Accumulator structures
  const planAccumulator = {};
  const logAccumulator = {};
  const exerciseContributors = {
    plan: {},
    logged: {},
  };

  for (const mg of MUSCLE_GROUPS) {
    planAccumulator[mg.id] = { sets: 0, reps: 0, holdSeconds: 0 };
    logAccumulator[mg.id] = { sets: 0, reps: 0, holdSeconds: 0 };
    exerciseContributors.plan[mg.id] = [];
    exerciseContributors.logged[mg.id] = [];
  }

  // 1. Accumulate Planned Volume & Reps from Active Program
  if (program) {
    const microcycles = program.microcycles || [];
    const currentMicrocycle =
      microcycles.find((m) => Number(m.week_number) === Number(currentWeekNum)) ||
      microcycles[0] ||
      null;

    const days = currentMicrocycle?.days || program.days || [];

    for (const day of days) {
      const exercises = day?.exercises || [];
      for (const ex of exercises) {
        const sets = Math.max(1, Number(ex.sets) || 3);
        const metrics = parseExerciseVolumeMetrics(ex.reps, sets);
        const classification = classifyExercise(ex.name);

        if (classification?.split) {
          for (const [mId, weight] of Object.entries(classification.split)) {
            if (planAccumulator[mId]) {
              const effectiveSets = Math.round(sets * weight * 10) / 10;
              const effectiveReps = Math.round(metrics.totalReps * weight);
              const effectiveHold = Math.round(metrics.totalHoldSeconds * weight);

              planAccumulator[mId].sets += effectiveSets;
              planAccumulator[mId].reps += effectiveReps;
              planAccumulator[mId].holdSeconds += effectiveHold;

              exerciseContributors.plan[mId].push({
                name: ex.name,
                sets,
                effectiveSets,
                reps: ex.reps,
                totalReps: metrics.totalReps,
                totalHoldSeconds: metrics.totalHoldSeconds,
                isIsometric: metrics.isIsometric,
                displayText: metrics.displayText,
                day: day.day_name || 'Workout',
              });
            }
          }
        }
      }
    }
  }

  // 2. Accumulate Actual Completed Sets, Reps & Hold Times from Workout Logs
  const filteredLogs = Array.isArray(logs)
    ? logs.filter((log) => {
        if (!log?.date) return false;
        if (weekStartDate && log.date < weekStartDate) return false;
        if (weekEndDate && log.date > weekEndDate) return false;
        return true;
      })
    : [];

  for (const log of filteredLogs) {
    const exercises = Array.isArray(log.exercises_completed) && log.exercises_completed.length > 0
      ? log.exercises_completed
      : log.workout_data?.exercises || [];

    if (exercises.length > 0) {
      for (const ex of exercises) {
        // Use actual completed sets
        const setsCompleted = Math.max(
          0,
          Number(ex.sets_completed !== undefined ? ex.sets_completed : ex.sets) || 0
        );

        if (setsCompleted === 0) continue;

        const repsStr = ex.reps_achieved || ex.actual_reps || ex.reps || '10';
        const metrics = parseExerciseVolumeMetrics(repsStr, setsCompleted);
        const classification = classifyExercise(ex.name);

        if (classification?.split) {
          for (const [mId, weight] of Object.entries(classification.split)) {
            if (logAccumulator[mId]) {
              const effectiveSets = Math.round(setsCompleted * weight * 10) / 10;
              const effectiveReps = Math.round(metrics.totalReps * weight);
              const effectiveHold = Math.round(metrics.totalHoldSeconds * weight);

              logAccumulator[mId].sets += effectiveSets;
              logAccumulator[mId].reps += effectiveReps;
              logAccumulator[mId].holdSeconds += effectiveHold;

              exerciseContributors.logged[mId].push({
                name: ex.name,
                sets: setsCompleted,
                effectiveSets,
                repsAchieved: repsStr,
                totalReps: metrics.totalReps,
                totalHoldSeconds: metrics.totalHoldSeconds,
                isIsometric: metrics.isIsometric,
                displayText: metrics.displayText,
                date: log.date,
              });
            }
          }
        }
      }
    } else {
      // Heuristic fallback for logs without individual exercise arrays
      const label = `${log.day_name || ''} ${log.workout_type || ''}`.toLowerCase();
      const defaultSets = 12;

      if (label.includes('push')) {
        logAccumulator.chest.sets += 5;
        logAccumulator.chest.reps += 50;
        logAccumulator.shoulders.sets += 4;
        logAccumulator.shoulders.reps += 40;
        logAccumulator.triceps.sets += 3;
        logAccumulator.triceps.reps += 35;
      } else if (label.includes('pull')) {
        logAccumulator.back.sets += 6;
        logAccumulator.back.reps += 48;
        logAccumulator.biceps.sets += 4;
        logAccumulator.biceps.reps += 40;
        logAccumulator.traps.sets += 3;
        logAccumulator.traps.reps += 30;
      } else if (label.includes('leg') || label.includes('lower')) {
        logAccumulator.quads.sets += 6;
        logAccumulator.quads.reps += 60;
        logAccumulator.hamstrings_glutes.sets += 5;
        logAccumulator.hamstrings_glutes.reps += 45;
        logAccumulator.calves.sets += 3;
        logAccumulator.calves.reps += 45;
      } else {
        logAccumulator.chest.sets += 3;
        logAccumulator.chest.reps += 30;
        logAccumulator.back.sets += 3;
        logAccumulator.back.reps += 24;
        logAccumulator.quads.sets += 3;
        logAccumulator.quads.reps += 30;
        logAccumulator.core.sets += 3;
        logAccumulator.core.holdSeconds += 90;
      }
    }
  }

  // 3. Format complete distribution results
  const results = MUSCLE_GROUPS.map((mg) => {
    const planned = planAccumulator[mg.id];
    const logged = logAccumulator[mg.id];

    const plannedSets = Math.round(planned.sets * 10) / 10;
    const loggedSets = Math.round(logged.sets * 10) / 10;

    const plannedZone = getVolumeZone(plannedSets, mg);
    const loggedZone = getVolumeZone(loggedSets, mg);

    return {
      ...mg,
      plannedSets,
      loggedSets,
      plannedReps: planned.reps,
      loggedReps: logged.reps,
      plannedHoldSeconds: planned.holdSeconds,
      loggedHoldSeconds: logged.holdSeconds,
      plannedZone,
      loggedZone,
      contributors: {
        plan: exerciseContributors.plan[mg.id],
        logged: exerciseContributors.logged[mg.id],
      },
    };
  });

  // 4. Structural Push/Pull and Upper/Lower Metrics
  const totalPlannedSets = results.reduce((acc, r) => acc + r.plannedSets, 0);
  const totalLoggedSets = results.reduce((acc, r) => acc + r.loggedSets, 0);

  const totalPlannedReps = results.reduce((acc, r) => acc + r.plannedReps, 0);
  const totalLoggedReps = results.reduce((acc, r) => acc + r.loggedReps, 0);

  const totalPlannedHold = results.reduce((acc, r) => acc + r.plannedHoldSeconds, 0);
  const totalLoggedHold = results.reduce((acc, r) => acc + r.loggedHoldSeconds, 0);

  // Push vs Pull Balance
  const pushSetsPlan = (planAccumulator.chest.sets || 0) + (planAccumulator.shoulders.sets || 0) * 0.7 + (planAccumulator.triceps.sets || 0);
  const pullSetsPlan = (planAccumulator.back.sets || 0) + (planAccumulator.biceps.sets || 0) + (planAccumulator.traps.sets || 0);
  const pushPullRatioPlan = pullSetsPlan > 0 ? (pushSetsPlan / pullSetsPlan).toFixed(2) : '1.0';

  const pushSetsLog = (logAccumulator.chest.sets || 0) + (logAccumulator.shoulders.sets || 0) * 0.7 + (logAccumulator.triceps.sets || 0);
  const pullSetsLog = (logAccumulator.back.sets || 0) + (logAccumulator.biceps.sets || 0) + (logAccumulator.traps.sets || 0);
  const pushPullRatioLog = pullSetsLog > 0 ? (pushSetsLog / pullSetsLog).toFixed(2) : '1.0';

  // Upper vs Lower Balance
  const upperSetsPlan =
    (planAccumulator.chest.sets || 0) +
    (planAccumulator.back.sets || 0) +
    (planAccumulator.shoulders.sets || 0) +
    (planAccumulator.triceps.sets || 0) +
    (planAccumulator.biceps.sets || 0) +
    (planAccumulator.traps.sets || 0);

  const lowerSetsPlan =
    (planAccumulator.quads.sets || 0) +
    (planAccumulator.hamstrings_glutes.sets || 0) +
    (planAccumulator.calves.sets || 0);

  // Insights
  const insights = [];
  const overtrained = results.filter((r) => r.plannedSets > r.mrv);
  const undertrained = results.filter((r) => r.plannedSets < 6);
  const optimal = results.filter((r) => r.plannedZone.status === 'optimal');

  if (overtrained.length > 0) {
    insights.push({
      type: 'warning',
      title: 'High Fatigue / Overuse Alert',
      message: `${overtrained.map((m) => m.name).join(', ')} exceed${overtrained.length === 1 ? 's' : ''} Maximum Recoverable Volume (>24 sets). Scale back volume to protect joints.`,
    });
  }

  if (undertrained.length > 0) {
    insights.push({
      type: 'info',
      title: 'Undertrained Areas Detected',
      message: `${undertrained.map((m) => m.name).join(', ')} receive${undertrained.length === 1 ? 's' : ''} less than 6 working sets/week (below minimum effective dose).`,
    });
  }

  if (optimal.length >= 4) {
    insights.push({
      type: 'success',
      title: 'Optimal Hypertrophy Density',
      message: `${optimal.length} muscle groups are calibrated inside the optimal adaptive volume zone (10–18 sets/week).`,
    });
  }

  const pushRatioNum = parseFloat(pushPullRatioPlan);
  if (pushRatioNum > 1.35) {
    insights.push({
      type: 'warning',
      title: 'Push-Dominant Volume Bias',
      message: `Push volume is ${pushRatioNum}x higher than pull volume. Increase horizontal rows and face pulls to protect the rotator cuffs.`,
    });
  } else if (pushRatioNum < 0.75) {
    insights.push({
      type: 'info',
      title: 'Pull-Dominant Volume Bias',
      message: `Pull volume significantly outweighs push volume. Excellent for scapular health and spine integrity.`,
    });
  } else {
    insights.push({
      type: 'success',
      title: 'Symmetrical Agonist / Antagonist Balance',
      message: `Push and pull weekly sets are balanced (${pushPullRatioPlan} ratio), preventing postural distortion.`,
    });
  }

  return {
    muscleGroups: results,
    totalPlannedSets: Math.round(totalPlannedSets),
    totalLoggedSets: Math.round(totalLoggedSets),
    totalPlannedReps,
    totalLoggedReps,
    totalPlannedHold,
    totalLoggedHold,
    pushPullRatio: {
      plan: pushPullRatioPlan,
      logged: pushPullRatioLog,
    },
    upperLowerRatio: {
      plan: lowerSetsPlan > 0 ? (upperSetsPlan / lowerSetsPlan).toFixed(1) : '1.0',
    },
    insights,
    activeLogsCount: filteredLogs.length,
  };
}
