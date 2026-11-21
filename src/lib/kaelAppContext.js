import { supabaseApi } from '@/lib/supabaseApi';
import {
  getCachedActiveProgram,
  getCachedLogs,
  getCachedNutrition,
  getCachedProgramsList,
  setCachedLogs,
  setCachedNutrition,
  setCachedProgramsList,
} from '@/lib/cacheStore';
import { getDayOfWeekName, getLocalDateKey, getUserTimeZone } from '@/lib/dateUtils';
import { normalizeWorkoutProgram } from '@/lib/expandMicrocycles';
import { calculateWeeklyMuscleDistribution } from '@/lib/muscleDistribution';
import { calcNutritionGoals } from '@/lib/nutritionGoals';
import { calcStreak } from '@/lib/streakUtils';
import { canAccess, FEATURE_PLANS, resolveEffectivePlan } from '@/lib/subscription';
import { extractWeekdayFromDayName, resolveWorkoutDays, WEEKDAYS } from '@/lib/workoutSchedule';

export const KAEL_STATIC_ROUTES = [
  '/',
  '/program',
  '/live-workout',
  '/nutrition',
  '/progress',
  '/photos',
  '/formlab',
  '/muscle-heatmap',
  '/profile',
  '/onboarding',
  '/about',
  '/contact',
  '/kael',
];

export const ROUTE_REQUIRED_FEATURE = {
  '/formlab': 'form_analysis',
};

const ROUTE_DEFAULT_LABELS = {
  '/': 'Open Dashboard',
  '/program': 'View Program',
  '/live-workout': 'Start Live Workout',
  '/nutrition': 'Open Nutrition',
  '/progress': 'View Progress',
  '/photos': 'Open Progress Photos',
  '/formlab': 'Open Form Lab',
  '/muscle-heatmap': 'Open Muscle Heatmap',
  '/profile': 'Open Profile & Plans',
  '/onboarding': 'Open Setup Wizard',
};

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack', 'post-workout']);

export function canAccessKaelRoute(route, userOrPlan) {
  const cleanBase = String(route || '').split('?')[0].trim();
  const reqFeature = ROUTE_REQUIRED_FEATURE[cleanBase];
  if (!reqFeature) {
    return { allowed: true, requiredPlan: 'free', feature: null };
  }
  const allowed = canAccess(userOrPlan || 'free', reqFeature);
  return {
    allowed,
    requiredPlan: FEATURE_PLANS[reqFeature] || 'elite',
    feature: reqFeature,
  };
}

export function validateKaelRoute(rawRoute, userOrPlan = null) {
  if (typeof rawRoute !== 'string') return null;
  const trimmed = rawRoute.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;

  const [pathnamePart, queryPart = ''] = trimmed.split('?');
  const cleanPath = pathnamePart.length > 1 && pathnamePart.endsWith('/')
    ? pathnamePart.slice(0, -1)
    : pathnamePart;

  const isProgramDay = /^\/program\/day\/([0-9]|1[0-9]|20)$/.test(cleanPath);
  if (!isProgramDay && !KAEL_STATIC_ROUTES.includes(cleanPath)) {
    return null;
  }

  if (userOrPlan !== null && userOrPlan !== undefined) {
    const access = canAccessKaelRoute(cleanPath, userOrPlan);
    if (!access.allowed) {
      return null;
    }
  }

  if (!queryPart) return cleanPath;

  // Allow safe numeric ?day= parameter on /live-workout only
  if (cleanPath === '/live-workout') {
    const params = new URLSearchParams(queryPart);
    const dayParam = params.get('day');
    if (dayParam !== null && /^\d{1,2}$/.test(dayParam)) {
      const idx = Number.parseInt(dayParam, 10);
      if (idx >= 0 && idx <= 20) {
        return `/live-workout?day=${idx}`;
      }
    }
  }

  return cleanPath;
}

export function getRouteLabel(route) {
  if (!route) return 'Open Page';
  const base = route.split('?')[0];
  if (/^\/program\/day\/\d+$/.test(base)) {
    return 'View Workout Day';
  }
  return ROUTE_DEFAULT_LABELS[base] || 'Open Page';
}

/**
 * Parses [ACTION:...] directives out of Kael responses and strips both
 * complete tags and trailing partial tags while streaming.
 */
export function parseKaelActions(rawContent = '', userOrPlan = null) {
  const source = String(rawContent || '');
  const actions = [];
  const seenKeys = new Set();

  const ACTION_RE = /\[ACTION:([^\]\n]+)\]/gi;
  let match;
  while ((match = ACTION_RE.exec(source)) !== null) {
    const inner = String(match[1] || '').trim();
    if (!inner) continue;

    const firstColon = inner.indexOf(':');
    const rawPrefix = (firstColon >= 0 ? inner.slice(0, firstColon) : inner.split('|')[0])
      .trim()
      .toLowerCase();
    const isShorthandRoute = firstColon === -1 && rawPrefix.startsWith('/');
    const actionKindRaw = isShorthandRoute ? 'go' : rawPrefix;
    const rest = isShorthandRoute
      ? inner
      : firstColon >= 0
        ? inner.slice(firstColon + 1).trim()
        : inner.slice(actionKindRaw.length).replace(/^\|/, '').trim();

    if (actionKindRaw === 'go' || actionKindRaw === 'navigate') {
      const [rawRoute, rawLabel] = rest.split('|').map((s) => (s || '').trim());
      const validRoute = validateKaelRoute(rawRoute, userOrPlan);
      if (validRoute) {
        const dedupeKey = `nav:${validRoute}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          actions.push({
            id: dedupeKey,
            type: actionKindRaw,
            route: validRoute,
            label: (rawLabel || getRouteLabel(validRoute)).slice(0, 48),
          });
        }
      }
    } else if (actionKindRaw === 'log_food') {
      const parts = rest.split('|').map((s) => (s || '').trim());
      const foodName = (parts[0] || '').slice(0, 120);
      const calories = Math.round(Number(parts[1]));
      const proteinG = Math.round(Number(parts[2] ?? 0));
      const carbsG = Math.round(Number(parts[3] ?? 0));
      const fatG = Math.round(Number(parts[4] ?? 0));
      const mealTypeRaw = String(parts[5] || 'snack').toLowerCase();
      const mealType = VALID_MEAL_TYPES.has(mealTypeRaw) ? mealTypeRaw : 'snack';

      if (
        foodName &&
        Number.isFinite(calories) &&
        calories >= 0 &&
        calories <= 6000 &&
        Number.isFinite(proteinG) &&
        proteinG >= 0 &&
        proteinG <= 500 &&
        Number.isFinite(carbsG) &&
        carbsG >= 0 &&
        carbsG <= 500 &&
        Number.isFinite(fatG) &&
        fatG >= 0 &&
        fatG <= 500
      ) {
        const dedupeKey = `food:${foodName.toLowerCase()}:${calories}:${mealType}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          actions.push({
            id: dedupeKey,
            type: 'log_food',
            food_name: foodName,
            calories,
            protein_g: proteinG,
            carbs_g: carbsG,
            fat_g: fatG,
            meal_type: mealType,
            label: `Log ${foodName} (${calories} kcal)`,
          });
        }
      }
    } else if (actionKindRaw === 'log_rest_day') {
      const [, rawLabel] = inner.split('|').map((s) => (s || '').trim());
      const dedupeKey = 'log_rest_day';
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        actions.push({
          id: dedupeKey,
          type: 'log_rest_day',
          label: (rawLabel || 'Mark Today as Rest Day').slice(0, 48),
        });
      }
    }
  }

  // Remove completed tags and any trailing unfinished "[ACTION:..." during streaming
  const cleanText = source
    .replace(/\[ACTION:[^\]\n]*\]/gi, '')
    .replace(/\[ACTION:[^\]\n]*$/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, actions };
}

async function withTimeout(promise, fallbackValue, timeoutMs = 2400) {
  let timerId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timerId = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
      }),
    ]);
  } catch {
    return fallbackValue;
  } finally {
    if (timerId !== null) window.clearTimeout(timerId);
  }
}

function getCurrentWeekBounds(todayKey) {
  try {
    const [y, m, d] = String(todayKey).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dow = dt.getUTCDay(); // 0=Sun..6=Sat
    const start = new Date(dt);
    start.setUTCDate(dt.getUTCDate() - dow);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const fmt = (date) => date.toISOString().slice(0, 10);
    return { weekStartDate: fmt(start), weekEndDate: fmt(end) };
  } catch {
    return { weekStartDate: null, weekEndDate: null };
  }
}

function resolveDayMatch(days, weekday) {
  if (!Array.isArray(days) || days.length === 0 || !weekday) {
    return { day: null, index: -1 };
  }
  const lower = String(weekday).toLowerCase();
  const idx = days.findIndex((d) => {
    const extracted = extractWeekdayFromDayName(d?.day_name || '');
    return (
      (extracted && extracted.toLowerCase() === lower) ||
      String(d?.day_name || '').toLowerCase().includes(lower)
    );
  });
  return {
    day: idx >= 0 ? days[idx] : null,
    index: idx,
  };
}

function formatExerciseLine(ex, idx) {
  const parts = [
    `${idx + 1}. ${ex?.name || 'Exercise'}`,
    `${ex?.sets || 3} sets × ${ex?.reps || '10'}`,
  ];
  if (ex?.rest_seconds) parts.push(`${ex.rest_seconds}s rest`);
  if (ex?.activation_cue) parts.push(`cue: ${ex.activation_cue}`);
  if (ex?.notes) parts.push(`notes: ${ex.notes}`);
  return `  - ${parts.join(' | ')}`;
}

export async function fetchKaelAppContext({ user, settings, timeZone }) {
  let effectiveUser = user || null;
  if (!effectiveUser && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('washek_user');
      if (raw) effectiveUser = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  const userKey = effectiveUser?.email || effectiveUser?.id || 'athlete';
  const effectiveTz = timeZone || getUserTimeZone(effectiveUser);
  const now = new Date();
  const todayKey = getLocalDateKey(now, effectiveTz);
  const todayWeekday = getDayOfWeekName(now, effectiveTz);
  const plan = resolveEffectivePlan(effectiveUser);

  const canAdaptiveMacros = canAccess(effectiveUser || plan, 'advanced_macro_tracking');
  const canCustomWorkoutAdj = canAccess(effectiveUser || plan, 'custom_workout_adjustments');
  const canAdaptiveProg = canAccess(effectiveUser || plan, 'adaptive_programming');
  const canSnapFood = canAccess(effectiveUser || plan, 'snap_food');
  const canScanBarcode = canAccess(effectiveUser || plan, 'scan_barcode');
  const canPhotoCompare = canAccess(effectiveUser || plan, 'progress_photos');
  const canBodyAnalysis = canAccess(effectiveUser || plan, 'ai_body_analysis');
  const canWorkoutAnalytics = canAccess(effectiveUser || plan, 'workout_analytics');
  const canNutritionInsights = canAccess(effectiveUser || plan, 'nutrition_insights');
  const canLiveAdj = canAccess(effectiveUser || plan, 'live_workout_adjustments');
  const canFormAnalysis = canAccess(effectiveUser || plan, 'form_analysis');

  const cachedPrograms = getCachedProgramsList(userKey);
  const cachedActiveProg = getCachedActiveProgram(userKey);
  const cachedLogs = getCachedLogs(userKey);
  const cachedTodayNutrition = getCachedNutrition(userKey, todayKey);

  const emailFilter = effectiveUser?.email;

  const [
    programsRes,
    logsRes,
    nutritionRes,
    savedMealsRes,
    baselinesRes,
    weightRes,
    photosRes,
    formRes,
  ] = await Promise.all([
    withTimeout(
      supabaseApi.entities.WorkoutProgram.filter({ status: 'active' }, '-created_at', 3).then((res) => {
        if (Array.isArray(res) && res.length > 0) setCachedProgramsList(res, userKey);
        return res;
      }),
      cachedPrograms?.length ? cachedPrograms : cachedActiveProg ? [cachedActiveProg] : []
    ),
    withTimeout(
      supabaseApi.entities.WorkoutLog.filter(
        emailFilter ? { created_by: emailFilter } : { created_by: userKey },
        '-date',
        40
      ).then((res) => {
        if (Array.isArray(res) && res.length > 0) setCachedLogs(res, userKey);
        return res;
      }),
      cachedLogs || []
    ),
    withTimeout(
      supabaseApi.entities.NutritionEntry.filter(
        { date: todayKey, created_by: userKey },
        '-created_date',
        100
      ).then((res) => {
        if (Array.isArray(res)) setCachedNutrition(res, userKey, todayKey);
        return res;
      }),
      cachedTodayNutrition || []
    ),
    withTimeout(supabaseApi.entities.SavedMeal.list('-created_at', 20), []),
    withTimeout(supabaseApi.entities.MovementBaseline.list('-recorded_date', 1), []),
    withTimeout(supabaseApi.entities.WeightHistory.list('-recorded_date', 5), []),
    withTimeout(
      supabaseApi.entities.ProgressPhoto.filter(
        { created_by: emailFilter || userKey },
        '-date',
        10
      ),
      []
    ),
    canFormAnalysis
      ? withTimeout(supabaseApi.entities.FormAnalysis.list('-created_at', 5), [])
      : Promise.resolve([]),
  ]);

  const rawProgram =
    programsRes?.[0] ||
    cachedPrograms?.[0] ||
    cachedActiveProg ||
    null;
  const program = rawProgram ? normalizeWorkoutProgram(rawProgram) : null;
  const logs = Array.isArray(logsRes) ? logsRes : [];
  const todayFood = Array.isArray(nutritionRes) ? nutritionRes : [];
  const savedMeals = Array.isArray(savedMealsRes) ? savedMealsRes : [];
  const baseline = Array.isArray(baselinesRes) ? baselinesRes[0] : null;
  const weights = Array.isArray(weightRes) ? weightRes : [];
  const photos = Array.isArray(photosRes) ? photosRes : [];
  const formAnalyses = Array.isArray(formRes) ? formRes : [];

  const manualRestDays = settings?.manualRestDays || {};
  const isManualRestToday = Boolean(manualRestDays?.[todayKey]);

  const currentWeekNum = Number(program?.current_week) || 1;
  const currentWeekData =
    program?.microcycles?.find((m) => Number(m.week_number) === currentWeekNum) ||
    program?.microcycles?.[0] ||
    null;
  const days = Array.isArray(currentWeekData?.days) ? currentWeekData.days : [];
  const resolvedTrainingDays = resolveWorkoutDays({
    trainingDays:
      program?.training_days ||
      program?.macrocycle?.training_days ||
      effectiveUser?.training_days,
    requirements: effectiveUser?.training_requirements,
    goalDescription: effectiveUser?.primary_goal || program?.goal,
  });

  const { day: matchedTodayDay, index: matchedTodayIdx } = resolveDayMatch(days, todayWeekday);
  const matchedTodayIsExplicitRest = Boolean(
    matchedTodayDay &&
      ((matchedTodayDay.exercises || []).length === 0 ||
        String(matchedTodayDay.workout_type || '').toLowerCase().includes('rest') ||
        String(matchedTodayDay.day_name || '').toLowerCase().includes('rest'))
  );

  const hasScheduledWorkoutToday =
    Boolean(program) &&
    !isManualRestToday &&
    Boolean(matchedTodayDay) &&
    !matchedTodayIsExplicitRest;

  const { weekStartDate, weekEndDate } = getCurrentWeekBounds(todayKey);
  const completedTodayLog = logs.find(
    (l) => String(l?.date || l?.created_date || '').slice(0, 10) === todayKey
  );

  // Determine next upcoming workout if today is rest or program has days
  let nextWorkout = null;
  let nextWorkoutIdx = -1;
  let nextWorkoutWeekday = null;
  if (days.length > 0) {
    const todayDowIdx = WEEKDAYS.findIndex(
      (w) => w.toLowerCase() === String(todayWeekday).toLowerCase()
    );
    if (todayDowIdx !== -1) {
      for (let offset = 1; offset <= 7; offset++) {
        const candWeekday = WEEKDAYS[(todayDowIdx + offset) % 7];
        const { day: candDay, index: candIdx } = resolveDayMatch(days, candWeekday);
        if (candDay && Array.isArray(candDay.exercises) && candDay.exercises.length > 0) {
          nextWorkout = candDay;
          nextWorkoutIdx = candIdx;
          nextWorkoutWeekday = candWeekday;
          break;
        }
      }
    }
    if (!nextWorkout) {
      const firstActiveIdx = days.findIndex((d) => Array.isArray(d?.exercises) && d.exercises.length > 0);
      if (firstActiveIdx >= 0) {
        nextWorkout = days[firstActiveIdx];
        nextWorkoutIdx = firstActiveIdx;
        nextWorkoutWeekday = extractWeekdayFromDayName(nextWorkout.day_name || '');
      }
    }
  }

  // Nutrition summary
  const goalCalc = calcNutritionGoals(effectiveUser, {
    userKey,
    program,
    workoutLogs: logs,
    currentWeek: currentWeekNum,
  });
  const activeNutritionGoal = canAdaptiveMacros ? goalCalc : goalCalc.base;
  const foodTotals = todayFood.reduce(
    (acc, item) => ({
      calories: acc.calories + (Number(item?.calories) || 0),
      protein: acc.protein + (Number(item?.protein_g) || 0),
      carbs: acc.carbs + (Number(item?.carbs_g) || 0),
      fat: acc.fat + (Number(item?.fat_g) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Streak & muscle balance
  const streak = calcStreak(logs, {
    user: effectiveUser,
    program,
    manualRestDays,
    timeZone: effectiveTz,
  });
  const muscleDist = calculateWeeklyMuscleDistribution({
    program,
    logs,
    currentWeekNum,
    weekStartDate,
    weekEndDate,
  });

  // Build compact structured snapshot text
  const lines = [];
  lines.push('=== LIVE APP CONTEXT (AUTHORITATIVE CURRENT STATE) ===');
  lines.push(
    `Date: ${todayWeekday}, ${todayKey} | Timezone: ${effectiveTz} | Unit: ${settings?.unit === 'metric' ? 'metric (kg/cm)' : 'imperial (lbs/in)'}`
  );
  lines.push(
    `Athlete: ${effectiveUser?.first_name || effectiveUser?.full_name || 'Athlete'} | Training Style: ${effectiveUser?.training_type || program?.training_type || 'calisthenics'} | Level: ${effectiveUser?.fitness_level || program?.fitness_level || 'intermediate'} | Primary Goal: ${effectiveUser?.primary_goal || program?.goal || 'General Performance'}`
  );
  lines.push(
    `Subscription Plan: ${plan.toUpperCase()} | Unlocked Features: ${[
      'Dashboard',
      'Program & Weekly Schedule',
      'Live Workout Tracker',
      'Nutrition Tracker',
      'Muscle Heatmap',
      canSnapFood ? 'AI Food Photo Scanner' : null,
      canScanBarcode ? 'Barcode Scanner' : null,
      canPhotoCompare ? 'Progress Photo Side-by-Side Compare' : null,
      canCustomWorkoutAdj ? 'Custom Workout Adjustments' : null,
      canAdaptiveProg ? 'Adaptive Programming & Post-Workout Adjustments' : null,
      canAdaptiveMacros ? 'Adaptive Macros' : null,
      canWorkoutAnalytics ? 'Workout Analytics' : null,
      canNutritionInsights ? 'Weekly Nutrition Insights' : null,
      canBodyAnalysis ? 'AI Body Analysis' : null,
      canLiveAdj ? 'Live In-Workout AI Exercise Adjustments' : null,
      canFormAnalysis ? 'Form Lab Video Analysis' : null,
    ]
      .filter(Boolean)
      .join(', ')}`
  );

  lines.push('');
  lines.push('--- TODAY WORKOUT STATUS ---');
  if (!program) {
    lines.push('No active workout program has been created yet. Athlete can create one at /onboarding.');
  } else if (hasScheduledWorkoutToday) {
    lines.push(
      `TODAY IS A SCHEDULED WORKOUT DAY: ${matchedTodayDay.day_name || todayWeekday} — ${matchedTodayDay.workout_type || 'Training Session'} (Day Index: ${matchedTodayIdx}, Route: /program/day/${matchedTodayIdx}, Quick Start: /live-workout?day=${matchedTodayIdx})`
    );
    lines.push(
      completedTodayLog
        ? `Completion Status: COMPLETED TODAY (${completedTodayLog.duration_minutes || '?'} min${completedTodayLog.post_workout_checkin ? `, check-in: "${completedTodayLog.post_workout_checkin}"` : ''})`
        : 'Completion Status: NOT COMPLETED YET TODAY'
    );
    lines.push("Today's Exercises:");
    (matchedTodayDay.exercises || []).forEach((ex, i) => {
      lines.push(formatExerciseLine(ex, i));
    });
  } else {
    const restReason = isManualRestToday
      ? 'User manually marked today as a Rest Day.'
      : matchedTodayIsExplicitRest
        ? `${matchedTodayDay.day_name || todayWeekday} is a scheduled Rest Day in the program.`
        : `No workout is scheduled for ${todayWeekday} (scheduled training days: ${resolvedTrainingDays.join(', ')}).`;
    lines.push(`TODAY IS A REST DAY. Reason: ${restReason}`);
    if (completedTodayLog) {
      lines.push(
        `Note: Athlete still logged a session today (${completedTodayLog.day_name || 'Session'}, ${completedTodayLog.duration_minutes || '?'} min).`
      );
    }
    if (nextWorkout) {
      lines.push(
        `Next Scheduled Workout: ${nextWorkoutWeekday || nextWorkout.day_name} — ${nextWorkout.workout_type || 'Workout'} (/program/day/${nextWorkoutIdx}, Quick Start: /live-workout?day=${nextWorkoutIdx})`
      );
      lines.push('Next Workout Preview:');
      (nextWorkout.exercises || []).slice(0, 6).forEach((ex, i) => {
        lines.push(formatExerciseLine(ex, i));
      });
    }
  }

  if (program) {
    lines.push('');
    lines.push('--- CURRENT PROGRAM & WEEKLY SCHEDULE ---');
    lines.push(
      `Program: ${program.program_name || '12-Week Program'} | Week ${currentWeekNum} of ${program.duration_weeks || 12} (${currentWeekData?.week_type || 'Training'}) | Goal: ${program.goal || 'Performance'}`
    );
    lines.push(`Scheduled Training Weekdays: ${resolvedTrainingDays.join(', ')}`);
    const loggedDatesThisWeek = new Set(
      logs
        .filter((l) => {
          const d = String(l?.date || l?.created_date || '').slice(0, 10);
          return (!weekStartDate || d >= weekStartDate) && (!weekEndDate || d <= weekEndDate);
        })
        .map((l) => String(l?.date || l?.created_date || '').slice(0, 10))
    );
    days.forEach((d, idx) => {
      const wd = extractWeekdayFromDayName(d?.day_name || '');
      const exNames = (d?.exercises || []).map((e) => `${e.name} (${e.sets}×${e.reps})`).join(', ');
      lines.push(
        `  DayIndex ${idx} (/program/day/${idx}): ${d?.day_name || `Day ${idx + 1}`}${wd ? ` [${wd}]` : ''} — ${d?.workout_type || 'Session'} | ${d?.exercises?.length || 0} exercises${exNames ? `: ${exNames}` : ''}`
      );
    });
    lines.push(`Streak: ${streak} day(s) | Workouts completed this week (${weekStartDate || 'week'}..${weekEndDate || 'now'}): ${loggedDatesThisWeek.size}`);
  }

  if (logs.length > 0) {
    lines.push('');
    lines.push('--- RECENT WORKOUT LOGS (LATEST 6) ---');
    logs.slice(0, 6).forEach((l) => {
      const d = String(l?.date || l?.created_date || '').slice(0, 10);
      const exCount = Array.isArray(l?.exercises_completed) ? l.exercises_completed.length : 0;
      lines.push(
        `  - ${d}: ${l?.day_name || l?.workout_type || 'Workout'} | ${l?.duration_minutes || '?'} min | ${exCount} exercises${l?.post_workout_checkin ? ` | Feel: "${String(l.post_workout_checkin).slice(0, 100)}"` : ''}`
      );
    });
  }

  lines.push('');
  lines.push('--- MUSCLE BALANCE (THIS WEEK) ---');
  const mgSummary = (muscleDist?.muscleGroups || [])
    .map((m) => `${m.name}: ${m.loggedSets}/${m.plannedSets} sets (${m.plannedZone?.label || 'Planned'})`)
    .join(' | ');
  lines.push(
    `Total Sets Logged/Planned: ${muscleDist?.totalLoggedSets || 0}/${muscleDist?.totalPlannedSets || 0} | Push:Pull Ratio (Plan/Logged): ${muscleDist?.pushPullRatio?.plan || '1.0'}/${muscleDist?.pushPullRatio?.logged || '1.0'}`
  );
  if (mgSummary) lines.push(mgSummary);

  lines.push('');
  lines.push('--- NUTRITION TODAY ---');
  lines.push(
    `Daily Target (${canAdaptiveMacros ? 'Adaptive' : 'Baseline'}): ${activeNutritionGoal.calories} kcal | ${activeNutritionGoal.protein}g Protein | ${activeNutritionGoal.carbs}g Carbs | ${activeNutritionGoal.fat}g Fat`
  );
  lines.push(
    `Consumed Today (${todayKey}): ${Math.round(foodTotals.calories)} kcal | ${Math.round(foodTotals.protein)}g Protein | ${Math.round(foodTotals.carbs)}g Carbs | ${Math.round(foodTotals.fat)}g Fat`
  );
  lines.push(
    `Remaining Today: ${Math.max(0, Math.round(activeNutritionGoal.calories - foodTotals.calories))} kcal | ${Math.max(0, Math.round(activeNutritionGoal.protein - foodTotals.protein))}g Protein | ${Math.max(0, Math.round(activeNutritionGoal.carbs - foodTotals.carbs))}g Carbs | ${Math.max(0, Math.round(activeNutritionGoal.fat - foodTotals.fat))}g Fat`
  );
  if (todayFood.length > 0) {
    lines.push('Foods Logged Today:');
    todayFood.slice(0, 15).forEach((f) => {
      lines.push(
        `  - [${f.meal_type || 'meal'}] ${f.food_name || 'Food'}: ${Math.round(Number(f.calories) || 0)} kcal (${Math.round(Number(f.protein_g) || 0)}P / ${Math.round(Number(f.carbs_g) || 0)}C / ${Math.round(Number(f.fat_g) || 0)}F)`
      );
    });
  } else {
    lines.push('Foods Logged Today: None yet.');
  }
  if (savedMeals.length > 0) {
    lines.push(
      `Saved Meal Presets: ${savedMeals
        .slice(0, 10)
        .map((m) => `${m.name} (${Math.round(Number(m.calories) || 0)} kcal)`)
        .join(', ')}`
    );
  }

  lines.push('');
  lines.push('--- BODY, MAXES, PHOTOS & FORM LAB ---');
  if (weights.length > 0) {
    const latestW = weights[0];
    lines.push(
      `Latest Logged Weigh-in: ${latestW.weight_lbs || latestW.weight || '?'} lbs (${String(latestW.recorded_date || latestW.date || '').slice(0, 10)})`
    );
  } else if (effectiveUser?.weight_lbs) {
    lines.push(`Profile Weight: ${effectiveUser.weight_lbs} lbs`);
  }
  if (baseline) {
    const knownMaxKeys = Object.entries(baseline)
      .filter(
        ([k, v]) =>
          v !== null &&
          v !== undefined &&
          v !== '' &&
          !['id', 'user_id', 'created_by', 'recorded_date', 'created_at', 'updated_at', 'custom_entries'].includes(k)
      )
      .map(([k, v]) => `${k}: ${v}`);
    const customMaxes = Array.isArray(baseline.custom_entries)
      ? baseline.custom_entries.map((c) => `${c.name}: ${c.value}`)
      : [];
    const allMaxes = [...knownMaxKeys, ...customMaxes];
    if (allMaxes.length > 0) {
      lines.push(`Movement Maxes (${baseline.recorded_date || 'recorded'}): ${allMaxes.join(', ')}`);
    }
  }
  lines.push(`Progress Photos Count: ${photos.length}${photos[0] ? ` (latest: ${String(photos[0].date || photos[0].created_at || '').slice(0, 10)})` : ''}`);
  if (canBodyAnalysis && photos[0]?.body_fat_estimate) {
    lines.push(`Latest AI Body Analysis: ${photos[0].body_fat_estimate}${photos[0].ai_insights ? ` — ${String(photos[0].ai_insights).slice(0, 140)}` : ''}`);
  } else if (!canBodyAnalysis) {
    lines.push('AI Progress Photo Body Analysis: LOCKED (requires Performance plan or higher) — NEVER analyze or critique progress photos or estimate body fat.');
  }
  if (!canPhotoCompare) {
    lines.push('Side-by-Side Photo Comparison: LOCKED (requires Progress plan or higher).');
  }
  if (canFormAnalysis && formAnalyses.length > 0) {
    lines.push(
      `Recent Form Lab Analyses: ${formAnalyses
        .slice(0, 3)
        .map((fa) => `${fa.exercise_name || 'Exercise'} (score: ${fa.score ?? '?'}, focus: ${fa.priority_focus || 'technique'})`)
        .join(' | ')}`
    );
  } else if (!canFormAnalysis) {
    lines.push('Form Lab Video Analysis (/formlab): LOCKED (requires Elite plan).');
  }

  lines.push('');
  lines.push(`--- STRICT PLAN PERMISSIONS & AUTHORIZATION BOUNDARIES (${plan.toUpperCase()}) ---`);
  if (plan === 'elite') {
    lines.push(
      'USER HAS FULL ELITE ACCESS: Every feature, analysis, and page in the app is UNLOCKED for this user (including /formlab, AI progress photo body-fat & physique analysis, live workout adjustments, detailed workout analytics, weekly nutrition insights, adaptive macros, adaptive programming, and full navigation).'
    );
  } else {
    const lockedItems = [];
    if (!canPhotoCompare) lockedItems.push('Side-by-side Progress Photo comparisons (requires Progress)');
    if (!canSnapFood) lockedItems.push('AI Food Photo / Nutrition Label & Barcode scanning (requires Progress)');
    if (!canCustomWorkoutAdj) lockedItems.push('Custom workout plan overrides & adaptive multi-week programming (requires Progress)');
    if (!canAdaptiveMacros) lockedItems.push('Workout-adaptive calorie/macro recalculation (requires Progress)');
    if (!canBodyAnalysis) lockedItems.push('AI Progress Photo body-fat estimation, physique critique, or visual body analysis (requires Performance)');
    if (!canWorkoutAnalytics) lockedItems.push('Detailed workout performance analytics & trend breakdowns (requires Performance)');
    if (!canNutritionInsights) lockedItems.push('AI weekly nutrition insights & optimization reports (requires Performance)');
    if (!canLiveAdj) lockedItems.push('Live in-workout real-time exercise adjustments (requires Elite)');
    if (!canFormAnalysis) lockedItems.push('Form Lab video technique analysis & opening/navigating to /formlab (requires Elite)');
    if (plan !== 'elite') lockedItems.push('Progress Graph predictive trajectory & Elite deep recovery/insider coaching secrets (requires Elite)');

    lines.push(
      `HARD ENFORCEMENT RULE: Do NOT perform, simulate, or navigate to ANY locked feature for this ${plan.toUpperCase()} user.`
    );
    lines.push(`LOCKED FEATURES FOR ${plan.toUpperCase()}: ${lockedItems.join(' | ')}`);
    lines.push(
      'If the user asks for any locked analysis or asks to go to a locked page (such as analyzing their progress photos on Free/Progress or opening /formlab when not Elite), you MUST politely decline, state which plan unlocks it, and offer [ACTION:navigate:/profile|View Plans] instead of fulfilling the locked request or emitting a restricted route tag.'
    );
  }

  lines.push('');
  lines.push('--- APP NAVIGATION & ACTION CAPABILITIES ---');
  const allowedRoutesList = [
    '/ (Dashboard)',
    '/program (Weekly Program)',
    '/program/day/0..N (Specific Workout Day)',
    '/live-workout or /live-workout?day=N (Start/Track Live Workout)',
    '/nutrition (Food & Macros)',
    '/progress (Progress Tracker)',
    '/photos (Progress Photos & Weight)',
    canFormAnalysis ? '/formlab (Form Lab Video Check)' : null,
    '/muscle-heatmap (Muscle Heatmap)',
    '/profile (Profile, Settings & Subscription Plans)',
    '/onboarding (Program Setup)',
  ].filter(Boolean);
  lines.push(`Valid Authorized App Routes for ${plan.toUpperCase()}: ${allowedRoutesList.join(', ')}`);
  if (!canFormAnalysis) {
    lines.push('RESTRICTED ROUTE (DO NOT NAVIGATE OR LINK): /formlab is LOCKED for non-Elite plans.');
  }
  lines.push(
    'Interactive Action Tags (output at the end of your reply ONLY when helpful or requested):\n' +
      '- To immediately open/navigate to an AUTHORIZED page because the user asked you to take them there or start something:\n' +
      '  [ACTION:go:/route|Button Label]  (e.g. [ACTION:go:/live-workout?day=2|Start Today\'s Workout] or [ACTION:go:/nutrition|Open Nutrition Tracker])\n' +
      '- To offer a clickable shortcut button to an AUTHORIZED page WITHOUT auto-navigating away from chat:\n' +
      '  [ACTION:navigate:/route|Button Label]  (e.g. [ACTION:navigate:/program/day/0|View Workout Details])\n' +
      '- When the user explicitly tells you to log a meal or food they ate right now:\n' +
      '  [ACTION:log_food:Food Name|Calories|ProteinG|CarbsG|FatG|meal_type]  (meal_type one of breakfast,lunch,dinner,snack,post-workout)\n' +
      '- When the user explicitly asks to mark today as a Rest Day:\n' +
      '  [ACTION:log_rest_day|Mark Today as Rest Day]\n' +
      'CRITICAL RULES: Answer exact facts strictly from LIVE APP CONTEXT above (never guess exercises or say today has a workout when it says TODAY IS A REST DAY). Never emit [ACTION:go:...] or [ACTION:navigate:...] for any locked route. Do not emit [ACTION:go:...] unless the user clearly asks to go/open/take them to an authorized page.'
  );

  return {
    summaryText: lines.join('\n'),
    hasScheduledWorkoutToday,
    todayWeekday,
    todayKey,
    isManualRestToday,
    matchedTodayIdx,
    matchedTodayDay,
    nextWorkoutIdx,
    nextWorkout,
  };
}
