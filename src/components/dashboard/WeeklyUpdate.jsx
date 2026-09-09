import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabaseApi } from '@/lib/supabaseApi';
import { supabase } from '@/lib/supabase';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Dumbbell,
  CalendarDays,
  Activity,
  Clock3,
  Utensils,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useAppSettings } from '@/lib/AppSettingsContext';
import { canAccess } from '@/lib/subscription';


// ============================================================
// DATE HELPERS
// ============================================================

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();

  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);

  return d;
}


function getPreviousWeekRange() {
  const currentMonday = getMonday();

  const previousMonday = new Date(currentMonday);
  previousMonday.setDate(
    previousMonday.getDate() - 7
  );

  const previousSunday = new Date(currentMonday);
  previousSunday.setDate(
    previousSunday.getDate() - 1
  );

  return {
    start: formatDateLocal(previousMonday),
    end: formatDateLocal(previousSunday),
  };
}


function isMonday() {
  return new Date().getDay() === 1;
}


// ============================================================
// SAFE HELPERS
// ============================================================

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


function string(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  return String(value).trim();
}


function unique(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ];
}


// ============================================================
// AI RESPONSE NORMALIZER
//
// Your Supabase API unwraps data.result already, but this also
// protects the component if OpenRouter returns a JSON string
// or another wrapper.
// ============================================================

function normalizeAIResponse(raw) {
  let result = raw;

  if (
    result &&
    typeof result === 'object' &&
    result.result !== undefined
  ) {
    result = result.result;
  }

  if (
    result &&
    typeof result === 'object' &&
    result.data !== undefined
  ) {
    result = result.data;
  }

  if (typeof result === 'string') {
    let cleaned = result.trim();

    cleaned = cleaned
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      result = JSON.parse(cleaned);
    } catch {
      result = {
        summary: cleaned,
      };
    }
  }

  if (
    !result ||
    typeof result !== 'object'
  ) {
    result = {};
  }

  return {
    summary:
      string(result.summary) ||
      string(result.week_summary) ||
      string(result.overview),

    win:
      string(result.win) ||
      string(result.what_you_crushed) ||
      string(result.strengths),

    improve:
      string(result.improve) ||
      string(result.keep_an_eye_on) ||
      string(result.concerns) ||
      string(result.watch_out_for),

    next_recommendation:
      string(result.next_recommendation) ||
      string(result.next_week) ||
      string(result.next_week_plan) ||
      string(result.recommendation),

    motivation:
      string(result.motivation) ||
      string(result.motivational_line),

    adjusted_microcycle:
      result.adjusted_microcycle ||
      null,

    nutrition_insight:
      string(result.nutrition_insight) ||
      string(result.nutrition_summary) ||
      string(result.nutrition_observation),

    nutrition_suggestions:
      Array.isArray(result.nutrition_suggestions)
        ? result.nutrition_suggestions
            .map((item) => string(item))
            .filter(Boolean)
        : [],
  };
}


// ============================================================
// COMPONENT
// ============================================================

export default function WeeklyUpdate({
  logs = [],
  nutrition = [],
  photos = [],
  user,
  program,
}) {
  const { settings } = useAppSettings();

  const [open, setOpen] = useState(false);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generated, setGenerated] = useState(false);

  // ----------------------------------------------------------
  // SERVER-SIDE WEEKLY UPDATE STATE
  //
  // Weekly Update is free for every plan.
  // The server only enforces one successful claim per
  // Monday-Sunday cycle.
  // ----------------------------------------------------------

  const [weeklyUpdateAvailable, setWeeklyUpdateAvailable] =
    useState(true);

  const [checkingWeeklyUpdate, setCheckingWeeklyUpdate] =
    useState(true);

  const monday = isMonday();

  const hasNutritionInsights = canAccess(
    user?.subscription_plan,
    'nutrition_insights'
  );

  const previousWeek = useMemo(
    () => getPreviousWeekRange(),
    []
  );

  const weekStart =
    previousWeek.start;

  const weekEnd =
    previousWeek.end;


  // ============================================================
  // CHECK SERVER-SIDE WEEKLY UPDATE STATUS
  //
  // This replaces localStorage as the source of truth for
  // whether the current Monday cycle has already been used.
  // ============================================================

  useEffect(() => {
    let cancelled = false;

    async function loadWeeklyUpdateStatus() {
      if (!user?.id || !monday) {
        if (!cancelled) {
          setWeeklyUpdateAvailable(true);
          setCheckingWeeklyUpdate(false);
        }

        return;
      }

      setCheckingWeeklyUpdate(true);

      try {
        const { data, error: statusError } =
          await supabase.rpc(
            'get_weekly_update_status'
          );

        if (statusError) {
          throw statusError;
        }

        if (cancelled) {
          return;
        }

        const alreadyClaimed =
          Boolean(
            data?.already_claimed
          );

        setWeeklyUpdateAvailable(
          !alreadyClaimed
        );
      } catch (statusError) {
        console.error(
          '[KAEL WEEKLY UPDATE] Failed to check server status:',
          statusError
        );

        /*
         * Do not lock the feature if the status check itself
         * fails. The actual claim RPC below remains the
         * authoritative server-side protection.
         */
        if (!cancelled) {
          setWeeklyUpdateAvailable(true);
        }
      } finally {
        if (!cancelled) {
          setCheckingWeeklyUpdate(false);
        }
      }
    }

    loadWeeklyUpdateStatus();

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    monday,
  ]);


  // ============================================================
  // ONLY REVIEW PREVIOUS MONDAY-SUNDAY
  // ============================================================

  const previousWeekLogs = useMemo(() => {
    if (!Array.isArray(logs)) {
      return [];
    }

    return logs
      .filter((log) => {
        const date = string(log?.date).slice(0, 10);

        return (
          date >= weekStart &&
          date <= weekEnd
        );
      })
      .sort((a, b) =>
        string(a?.date).localeCompare(
          string(b?.date)
        )
      );
  }, [
    logs,
    weekStart,
    weekEnd,
  ]);


  const previousWeekNutrition = useMemo(() => {
    if (!Array.isArray(nutrition)) {
      return [];
    }

    return nutrition
      .filter((entry) => {
        const date = string(entry?.date).slice(0, 10);

        return (
          date >= weekStart &&
          date <= weekEnd
        );
      })
      .sort((a, b) =>
        string(a?.date).localeCompare(
          string(b?.date)
        )
      );
  }, [
    nutrition,
    weekStart,
    weekEnd,
  ]);


  // ============================================================
  // WEEKLY STATS
  //
  // These are calculated locally.
  // No AI tokens are used for these numbers.
  // ============================================================

  const stats = useMemo(() => {
    const workoutCount =
      previousWeekLogs.length;


    const trainingDays =
      unique(
        previousWeekLogs.map(
          (log) =>
            string(log?.date).slice(0, 10)
        )
      ).length;


    let totalExercises = 0;
    let totalSets = 0;
    let totalReps = 0;
    let totalDuration = 0;


    const exerciseNames = [];


    previousWeekLogs.forEach((log) => {
      totalDuration += number(
        log?.duration_minutes
      );


      const exercises =
        Array.isArray(
          log?.exercises_completed
        )
          ? log.exercises_completed
          : [];


      totalExercises +=
        exercises.length;


      exercises.forEach((exercise) => {
        totalSets += number(
          exercise?.sets_completed
        );


        /*
         * reps_achieved can sometimes be a number,
         * "8-10", "10", etc.
         *
         * We only count it when it is actually numeric.
         * The raw value is still sent to Kael.
         */
        const reps =
          Number(
            exercise?.reps_achieved
          );


        if (
          Number.isFinite(reps)
        ) {
          totalReps += reps;
        }


        if (
          exercise?.name
        ) {
          exerciseNames.push(
            exercise.name
          );
        }
      });
    });


    const checkinCount =
      previousWeekLogs.filter(
        (log) =>
          string(
            log?.post_workout_checkin
          )
      ).length;


    const nutritionDays =
      unique(
        previousWeekNutrition.map(
          (entry) =>
            string(entry?.date).slice(0, 10)
        )
      ).length;


    const totalCalories =
      previousWeekNutrition.reduce(
        (sum, entry) =>
          sum +
          number(entry?.calories),
        0
      );


    const averageCalories =
      nutritionDays > 0
        ? Math.round(
            totalCalories /
              nutritionDays
          )
        : 0;


    return {
      workoutCount,
      trainingDays,
      totalExercises,
      totalSets,
      totalReps,
      totalDuration,
      checkinCount,
      nutritionDays,
      totalCalories,
      averageCalories,
      exerciseNames:
        unique(exerciseNames),
    };
  }, [
    previousWeekLogs,
    previousWeekNutrition,
  ]);


  // ============================================================
  // CACHE
  //
  // LocalStorage is still used only as a display cache.
  // It is NO LONGER the usage limit.
  // ============================================================

  const cacheKey =
    `kael_weekly_report_${weekStart}_${weekEnd}_${user?.id || 'user'}`;


  useEffect(() => {
    const cached =
      localStorage.getItem(
        cacheKey
      );


    if (!cached) {
      setInsight(null);
      setGenerated(false);
      return;
    }


    try {
      const parsed =
        JSON.parse(cached);


      const normalized =
        normalizeAIResponse(
          parsed
        );


      setInsight(normalized);
      setGenerated(true);
    } catch (err) {
      console.warn(
        '[Kael Weekly Update] Invalid cached report:',
        err
      );

      localStorage.removeItem(
        cacheKey
      );
    }
  }, [cacheKey]);


  // ============================================================
  // SERIALIZE ALL WORKOUT INFORMATION
  //
  // We intentionally send the raw workout information rather
  // than just totals. This is what allows Kael to notice things
  // like:
  //
  // "You struggled with dips on Wednesday but pull-ups felt
  // strong on Friday."
  // ============================================================

  const workoutReport = useMemo(() => {
    return previousWeekLogs.map(
      (log, index) => {
        const exercises =
          Array.isArray(
            log?.exercises_completed
          )
            ? log.exercises_completed
            : [];


        return {
          workout_number:
            index + 1,

          date:
            string(log?.date),

          day_name:
            string(log?.day_name) ||
            'Training day',

          week_number:
            log?.week_number ?? null,

          duration_minutes:
            number(
              log?.duration_minutes
            ),

          exercises_completed:
            exercises.map(
              (exercise) => ({
                name:
                  string(
                    exercise?.name
                  ),

                sets_completed:
                  exercise?.sets_completed ??
                  0,

                reps_achieved:
                  exercise?.reps_achieved ??
                  '',

                notes:
                  string(
                    exercise?.notes
                  ),
              })
            ),

          post_workout_checkin:
            string(
              log?.post_workout_checkin
            ),

          ai_adjustment_notes:
            string(
              log?.ai_adjustment_notes
            ),
        };
      }
    );
  }, [
    previousWeekLogs,
  ]);


  // ============================================================
  // NUTRITION REPORT
  // ============================================================

  const nutritionReport = useMemo(() => {
    return previousWeekNutrition.map(
      (entry) => ({
        date:
          string(entry?.date),

        calories:
          entry?.calories ??
          null,

        protein:
          entry?.protein ??
          entry?.protein_grams ??
          null,

        carbs:
          entry?.carbs ??
          entry?.carbohydrates ??
          null,

        fat:
          entry?.fat ??
          entry?.fat_grams ??
          null,

        water:
          entry?.water ??
          entry?.water_oz ??
          null,

        notes:
          string(
            entry?.notes
          ),
      })
    );
  }, [
    previousWeekNutrition,
  ]);


  // ============================================================
  // PERFORMANCE NUTRITION INSIGHT DATA
  // ============================================================

  const nutritionMetrics = useMemo(() => {
    const trackedDays = unique(
      previousWeekNutrition.map((entry) =>
        string(entry?.date).slice(0, 10)
      )
    ).length;

    const totals = previousWeekNutrition.reduce(
      (acc, entry) => {
        acc.calories += number(entry?.calories);
        acc.protein += number(entry?.protein ?? entry?.protein_grams);
        acc.carbs += number(entry?.carbs ?? entry?.carbohydrates);
        acc.fat += number(entry?.fat ?? entry?.fat_grams);
        acc.water += number(entry?.water ?? entry?.water_oz);
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 }
    );

    return {
      trackedDays,
      averageCalories: trackedDays ? Math.round(totals.calories / trackedDays) : 0,
      averageProtein: trackedDays ? Math.round(totals.protein / trackedDays) : 0,
      averageCarbs: trackedDays ? Math.round(totals.carbs / trackedDays) : 0,
      averageFat: trackedDays ? Math.round(totals.fat / trackedDays) : 0,
      averageWater: trackedDays ? Math.round(totals.water / trackedDays) : 0,
    };
  }, [previousWeekNutrition]);


  // ============================================================
  // PAIN / DISCOMFORT QUICK DETECTION
  //
  // This isn't replacing Kael.
  // It makes sure the prompt explicitly tells him which logs
  // contain possible pain/injury language.
  // ============================================================

  const concerningCheckins =
    useMemo(() => {
      return previousWeekLogs
        .filter((log) =>
          /pain|hurt|hurting|injury|injured|strain|strained|ache|aching|sharp|joint|shoulder|elbow|wrist|knee|hip|back|neck|ankle|tight|tightness|discomfort|sore|soreness/i.test(
            string(
              log?.post_workout_checkin
            )
          )
        )
        .map((log) => ({
          date:
            string(log?.date),

          day_name:
            string(log?.day_name),

          checkin:
            string(
              log?.post_workout_checkin
            ),

          exercises:
            Array.isArray(
              log?.exercises_completed
            )
              ? log.exercises_completed.map(
                  (exercise) =>
                    string(
                      exercise?.name
                    )
                )
              : [],
        }));
    }, [
      previousWeekLogs,
    ]);


  // ============================================================
  // GENERATE
  // ============================================================

  const generate = async () => {
    if (!monday) {
      return;
    }


    if (generated) {
      return;
    }


    if (loading) {
      return;
    }


    if (!weeklyUpdateAvailable) {
      setError(
        'You have already used your Weekly Update for this Monday cycle. Your next Weekly Update will be available next Monday.'
      );

      return;
    }


    if (!stats.workoutCount) {
      return;
    }


    setLoading(true);
    setError(null);


    try {
      const language =
        settings?.language ||
        user?.language ||
        'English';


      const unit =
        settings?.unit ||
        user?.unit ||
        'imperial';


      const currentWeek =
        number(
          program?.current_week
        ) || 1;


      const nextWeekNumber =
        currentWeek + 1;


      const nextMicrocycle =
        Array.isArray(
          program?.microcycles
        )
          ? program.microcycles.find(
              (microcycle) =>
                number(
                  microcycle?.week_number
                ) ===
                nextWeekNumber
            )
          : null;


      const currentMicrocycle =
        Array.isArray(
          program?.microcycles
        )
          ? program.microcycles.find(
              (microcycle) =>
                number(
                  microcycle?.week_number
                ) ===
                currentWeek
            )
          : null;


      const previousMicrocycle =
        Array.isArray(
          program?.microcycles
        )
          ? program.microcycles.find(
              (microcycle) =>
                number(
                  microcycle?.week_number
                ) ===
                currentWeek - 1
            )
          : null;


      const trainingType =
        user?.training_type ||
        program?.training_type ||
        'calisthenics';


      const typeLabel =
        {
          calisthenics:
            'calisthenics',

          weighted_calisthenics:
            'weighted calisthenics',

          weights:
            'weight training',

          hybrid:
            'hybrid training combining calisthenics and weights',
        }[trainingType] ||
        trainingType;


      const goals =
        Array.isArray(
          user?.fitness_goals
        ) &&
        user.fitness_goals.length
          ? user.fitness_goals.join(', ')
          : (
              Array.isArray(
                user?.weight_goals
              ) &&
              user.weight_goals.length
            )
              ? user.weight_goals.join(', ')
              : (
                  user?.primary_goal ||
                  program?.goal ||
                  'general fitness'
                );


      // --------------------------------------------------------
      // FULL CHECK-IN TEXT
      // --------------------------------------------------------

      const allCheckins =
        previousWeekLogs
          .filter((log) =>
            string(
              log?.post_workout_checkin
            )
          )
          .map(
            (log) =>
              `[${string(
                log?.date
              )} — ${string(
                log?.day_name
              )}]\n${string(
                log?.post_workout_checkin
              )}`
          )
          .join('\n\n---\n\n') ||
        'No post-workout check-ins were submitted.';


      // --------------------------------------------------------
      // PROMPT
      // --------------------------------------------------------

      const prompt = `
You are Kael, the athlete's personal ${typeLabel} coach.

You are NOT writing a generic motivational message.

You are performing a real weekly coaching review using the
athlete's actual completed workouts and their own words.

Respond entirely in ${language}.

============================================================
ATHLETE
============================================================

NAME:
${user?.first_name || user?.full_name?.split(' ')[0] || 'Athlete'}

FITNESS LEVEL:
${user?.fitness_level || 'intermediate'}

TRAINING TYPE:
${typeLabel}

GOALS:
${goals}

GOAL TIMEFRAME:
${user?.goal_timeframe || 'Not specified'}

CURRENT SKILLS:
${user?.current_skills || 'Not specified'}

EQUIPMENT:
${user?.available_equipment || 'Not specified'}

TRAINING REQUIREMENTS / LIMITATIONS:
${user?.training_requirements || 'None specified'}

MEASUREMENT SYSTEM:
${unit === 'metric'
  ? 'Metric'
  : 'Imperial'}

============================================================
WEEK BEING REVIEWED
============================================================

PREVIOUS WEEK:
${weekStart} through ${weekEnd}

WORKOUTS COMPLETED:
${stats.workoutCount}

TRAINING DAYS:
${stats.trainingDays}

TOTAL EXERCISES LOGGED:
${stats.totalExercises}

TOTAL SETS COMPLETED:
${stats.totalSets}

NUMERIC REPS COMPLETED:
${stats.totalReps}

TOTAL TRAINING MINUTES:
${stats.totalDuration}

POST-WORKOUT CHECK-INS:
${stats.checkinCount}

EXERCISES PERFORMED:
${stats.exerciseNames.join(', ') || 'None'}

============================================================
COMPLETE WORKOUT DATA
============================================================

The following is the athlete's actual logged workout data.

DO NOT summarize this into generic advice.

Look at each workout individually.

Compare:
- what was planned
- what was actually completed
- sets
- reps
- exercise selection
- workout duration
- check-in feedback
- performance trends across the week

WORKOUT DATA:

${JSON.stringify(
  workoutReport,
  null,
  2
)}

============================================================
EVERY POST-WORKOUT CHECK-IN
============================================================

These are the athlete's actual words.

Pay close attention to:
- pain
- discomfort
- fatigue
- recovery
- exercises that felt unusually hard
- exercises that felt unusually easy
- exercises where they had more capacity
- exercises where they struggled
- energy
- motivation
- technique concerns
- comments about specific body parts
- comments about specific exercises
- anything that changed during the week

DO NOT ignore these comments.

POST-WORKOUT CHECK-INS:

${allCheckins}

============================================================
POSSIBLE CONCERNING CHECK-INS
============================================================

The following check-ins contain words that may indicate
pain, discomfort, soreness, tightness, or injury.

These are NOT automatically injuries.

Read the athlete's actual words and determine whether
there is a meaningful concern.

${JSON.stringify(
  concerningCheckins,
  null,
  2
)}

============================================================
NUTRITION
============================================================

NUTRITION DAYS:
${stats.nutritionDays}

TOTAL CALORIES LOGGED:
${stats.totalCalories || 'Not available'}

AVERAGE CALORIES ON TRACKED DAYS:
${stats.averageCalories || 'Not available'}

DETAILED NUTRITION DATA:

${JSON.stringify(
  nutritionReport,
  null,
  2
)}

PERFORMANCE NUTRITION METRICS:
Tracked days: ${nutritionMetrics.trackedDays}
Average calories: ${nutritionMetrics.averageCalories || 'Not available'}
Average protein: ${nutritionMetrics.averageProtein || 'Not available'} g/day
Average carbs: ${nutritionMetrics.averageCarbs || 'Not available'} g/day
Average fat: ${nutritionMetrics.averageFat || 'Not available'} g/day
Average water: ${nutritionMetrics.averageWater || 'Not available'} oz/day

NUTRITION INSIGHT RULES:

For Performance/Elite users, analyze the logged nutrition specifically.
Connect the observed intake to the athlete's stated goal and training demands.
Identify meaningful patterns in calories, protein, carbs, fat, hydration, meal consistency,
or nutrition adherence when the data supports them. Give practical suggestions.
Do NOT invent calorie or macro targets that are not present in the athlete profile.
Do NOT diagnose deficiencies or medical conditions. If there is not enough data, say so.
For Free/Progress users, return an empty nutrition_insight and an empty nutrition_suggestions array.

============================================================
CURRENT PROGRAM
============================================================

PROGRAM NAME:
${program?.program_name || 'Custom program'}

CURRENT PROGRAM WEEK:
${currentWeek}

CURRENT WEEK PROGRAM:

${JSON.stringify(
  currentMicrocycle ||
  'Not available',
  null,
  2
)}

============================================================
PREVIOUS PROGRAM
============================================================

${JSON.stringify(
  previousMicrocycle ||
  'Not available',
  null,
  2
)}

============================================================
NEXT WEEK PROGRAM
============================================================

${JSON.stringify(
  nextMicrocycle ||
  'Not available',
  null,
  2
)}

============================================================
COACHING INSTRUCTIONS
============================================================

This is the most important part.

Your report MUST be highly specific to this athlete.

Do NOT write generic statements such as:

"Keep progressing."

"Stay consistent."

"Focus on recovery."

"Push yourself next week."

"Continue working toward your goals."

Those statements are only acceptable if they are attached
to specific evidence from this athlete's actual week.

Instead, reference exact things that happened.

For example:

GOOD:
"You completed all four sets of pull-ups on Monday and
reported that you still had 2-3 reps available. By Friday,
your weighted pull-ups were also completed at the prescribed
volume. That suggests your pulling strength is responding
well, so I want to progress that movement slightly next week."

BAD:
"Your pulling strength is improving. Keep progressing."

If the athlete mentions pain, connect it to the workout
and exercise where it happened.

For example:

"The left shoulder discomfort you mentioned after dips
on Wednesday is the biggest thing I want to address.
Because you specifically connected it to dips, I don't want
to simply increase pressing volume next week. We'll reduce
the intensity of that movement and use a shoulder-friendlier
variation while keeping your other pressing work intact."

Do NOT diagnose injuries.

Do NOT invent pain.

Do NOT invent performance.

Do NOT assume an exercise caused pain unless the athlete's
actual feedback supports that connection.

If something is uncertain, say that it is uncertain.

============================================================
WHAT TO ANALYZE
============================================================

1. PERFORMANCE

Identify the strongest actual performance of the week.

Mention the specific exercise, workout, sets, reps,
or feedback that supports your conclusion.

2. WEAKNESS / PROBLEM

Identify the most important actual issue.

This could be:
- missed sets
- reduced reps
- fatigue
- poor recovery
- pain/discomfort
- an exercise consistently feeling difficult
- lack of adherence
- excessive volume
- unusually easy work
- nutrition inconsistency

Only mention an issue if the data supports it.

3. TREND

Look across the entire week.

Determine whether the athlete appears to be:
- improving
- maintaining
- struggling
- recovering poorly
- adapting well

Use actual evidence.

4. NEXT WEEK

Give a specific recommendation.

If an exercise needs to change, name it.

If intensity should change, say how.

If volume should change, say how.

If rest should change, say how.

If an exercise performed very well, identify the exact
progression you recommend.

Do not make massive changes without evidence.

5. GOAL CONNECTION

Explain how this week's performance relates to the
athlete's actual stated goal.

For example:
If the goal is a muscle-up, explain how the logged pulling,
dip, transition, or skill work supports that goal.

If the goal is hypertrophy, discuss actual volume and
performance.

If the goal is strength, discuss actual performance and
progression.

============================================================
REPORT STYLE
============================================================

Sound like a real coach who has been following this athlete.

Be direct.

Be specific.

Be observant.

Be encouraging when deserved.

Be honest when something needs attention.

Do not sound like an AI assistant.

Do not repeat the entire workout log.

Instead, select the most meaningful details and explain
what they mean.

The report should feel like:

"I actually watched your week."

not:

"Here are some generic fitness tips."

============================================================
REQUIRED JSON
============================================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "summary": "A detailed but concise overview of what actually happened during the week. Reference specific workouts, exercises, performance, and/or check-ins.",

  "win": "The strongest specific thing the athlete did this week, with evidence from their actual logs.",

  "improve": "The most important specific issue or trend to address, with evidence from actual logs. If there is pain/discomfort, identify the exact exercise and day when the athlete connected it to that issue.",

  "next_recommendation": "A specific coaching recommendation for next week. Name exact exercises, progressions, regressions, volume, intensity, rest, or substitutions where appropriate.",

  "motivation": "One short, genuine motivational sentence that relates to this athlete's actual week.",

  "nutrition_insight": "For Performance/Elite users only: a specific observation about the athlete's logged nutrition, tied to their goal. Return an empty string for Free/Progress users.",

  "nutrition_suggestions": [
    "For Performance/Elite users only: a practical suggestion supported by the logged nutrition data."
  ],

  "adjusted_microcycle": null
}

If the next week's program should be changed based on the
athlete's actual performance or feedback, return the complete
adjusted next-week microcycle in adjusted_microcycle.

Otherwise return null.

Do not change next week's program merely for the sake of
changing it.

If pain or discomfort was reported and the athlete connected
it to a specific exercise, take that seriously and make an
appropriate conservative programming adjustment.

Never diagnose a medical condition.
`;


      // --------------------------------------------------------
      // CALL KAEL
      // --------------------------------------------------------

      const rawResult =
        await supabaseApi.ai.invoke({
          type: 'weekly_update',

          prompt,

          response_json_schema: {
            type: 'object',

            additionalProperties: false,

            properties: {
              summary: {
                type: 'string',
              },

              win: {
                type: 'string',
              },

              improve: {
                type: 'string',
              },

              next_recommendation: {
                type: 'string',
              },

              motivation: {
                type: 'string',
              },

              nutrition_insight: {
                type: 'string',
              },

              nutrition_suggestions: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },

              adjusted_microcycle: {
                type: [
                  'object',
                  'null',
                ],
              },
            },

            required: [
              'summary',
              'win',
              'improve',
              'next_recommendation',
              'motivation',
              'nutrition_insight',
              'nutrition_suggestions',
              'adjusted_microcycle',
            ],
          },
        });


      console.log(
        '[KAEL WEEKLY UPDATE] Raw result:',
        rawResult
      );


      const result =
        normalizeAIResponse(
          rawResult
        );


      console.log(
        '[KAEL WEEKLY UPDATE] Normalized result:',
        result
      );


      // --------------------------------------------------------
      // DO NOT ACCEPT A USELESS GENERIC RESPONSE
      //
      // If the model somehow returns nothing useful, show an
      // error instead of pretending the report was generated.
      // --------------------------------------------------------

      const meaningfulFields = [
        result.summary,
        result.win,
        result.improve,
        result.next_recommendation,
      ].filter(
        (value) =>
          string(value).length > 20
      );


      if (
        meaningfulFields.length < 2
      ) {
        throw new Error(
          'Kael returned an incomplete weekly report. Please try again.'
        );
      }


      // --------------------------------------------------------
      // CLAIM THE SERVER-SIDE WEEKLY UPDATE SLOT
        //
        // IMPORTANT:
        // This happens AFTER Kael successfully produced a valid
        // report. Therefore a failed AI request does not consume
        // the user's weekly update.
        //
        // The RPC is the authoritative protection against two
        // simultaneous successful claims.
        // --------------------------------------------------------

      const {
        data: claimResult,
        error: claimError,
      } = await supabase.rpc(
        'claim_weekly_update'
      );


      if (claimError) {
        throw claimError;
      }


      if (
        !claimResult?.allowed
      ) {
        setWeeklyUpdateAvailable(false);

        throw new Error(
          'You have already used your Weekly Update for this Monday cycle. Your next Weekly Update will be available next Monday.'
        );
      }


      // --------------------------------------------------------
      // SERVER CLAIM SUCCEEDED
      // --------------------------------------------------------

      setWeeklyUpdateAvailable(false);


      // --------------------------------------------------------
      // APPLY NEXT WEEK ADJUSTMENT
      // --------------------------------------------------------

      if (
        result.adjusted_microcycle &&
        nextMicrocycle &&
        program?.id &&
        Array.isArray(
          program?.microcycles
        )
      ) {
        const updatedMicrocycles =
          program.microcycles.map(
            (microcycle) => {
              if (
                number(
                  microcycle?.week_number
                ) !==
                nextWeekNumber
              ) {
                return microcycle;
              }


              return {
                ...result.adjusted_microcycle,

                week_number:
                  nextWeekNumber,

                mesocycle_index:
                  result
                    .adjusted_microcycle
                    ?.mesocycle_index ??
                  microcycle?.mesocycle_index,
              };
            }
          );


        await supabaseApi.entities.WorkoutProgram.update(
          program.id,
          {
            microcycles:
              updatedMicrocycles,
          }
        );
      }


      // --------------------------------------------------------
      // CACHE ONLY THE REPORT
      // --------------------------------------------------------

      const displayResult = {
        summary:
          result.summary,

        win:
          result.win,

        improve:
          result.improve,

        next_recommendation:
          result.next_recommendation,

        motivation:
          result.motivation,

        nutrition_insight:
          hasNutritionInsights
            ? result.nutrition_insight
            : '',

        nutrition_suggestions:
          hasNutritionInsights
            ? result.nutrition_suggestions
            : [],
      };


      localStorage.setItem(
        cacheKey,
        JSON.stringify(
          displayResult
        )
      );


      setInsight(
        displayResult
      );

      setGenerated(true);
    } catch (generationError) {
      console.error(
        '[KAEL WEEKLY UPDATE] FAILED:',
        generationError
      );


      setError(
        generationError?.message ||
        'Kael could not generate your weekly report.'
      );
    } finally {
      setLoading(false);
    }
  };


  // ============================================================
  // SUMMARY TEXT WHEN NOT MONDAY
  // ============================================================

  const dayMessage = monday
    ? `Review ${weekStart} – ${weekEnd}`
    : 'Your weekly review unlocks every Monday';


  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Card className="p-4 border-primary/20 bg-primary/5">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <button
        onClick={() =>
          setOpen(
            (value) => !value
          )
        }
        className="w-full flex items-center justify-between"
      >

        <div className="flex items-center gap-2">

          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">

            <Sparkles className="w-4 h-4 text-primary" />

          </div>


          <div className="text-left">

            <p className="font-heading font-bold text-sm">
              Weekly Check-in from Kael
            </p>

            <p className="text-xs text-muted-foreground">
              {generated
                ? 'Your weekly coaching report is ready'
                : dayMessage}
            </p>

          </div>

        </div>


        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}

      </button>


      {/* ======================================================
          CONTENT
          ====================================================== */}

      {open && (

        <div className="mt-4 space-y-4">


          {/* ==================================================
              MONDAY LOCK
              ================================================== */}

          {!monday && (

            <div className="p-4 rounded-xl bg-muted/50 border border-border">

              <div className="flex items-start gap-3">

                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">

                  <Lock className="w-4 h-4 text-muted-foreground" />

                </div>


                <div>

                  <p className="text-sm font-semibold">
                    Kael's weekly review unlocks Monday
                  </p>

                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">

                    Every Monday, Kael reviews the previous
                    Monday through Sunday — including every
                    workout, every set and rep logged, and
                    every post-workout check-in.

                  </p>

                </div>

              </div>

            </div>

          )}


          {/* ==================================================
              WEEK SNAPSHOT
              ================================================== */}

          {monday && (

            <div className="space-y-3">

              <div>

                <p className="font-heading font-bold text-sm">
                  Your Week
                </p>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {weekStart} → {weekEnd}
                </p>

              </div>


              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">


                {/* Workouts */}

                <div className="p-3 rounded-xl bg-background/70 border border-border">

                  <div className="flex items-center gap-2">

                    <Dumbbell className="w-4 h-4 text-primary" />

                    <div>

                      <p className="text-lg font-heading font-bold leading-none">
                        {stats.workoutCount}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        Workouts
                      </p>

                    </div>

                  </div>

                </div>


                {/* Training days */}

                <div className="p-3 rounded-xl bg-background/70 border border-border">

                  <div className="flex items-center gap-2">

                    <CalendarDays className="w-4 h-4 text-accent" />

                    <div>

                      <p className="text-lg font-heading font-bold leading-none">
                        {stats.trainingDays}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        Training days
                      </p>

                    </div>

                  </div>

                </div>


                {/* Sets */}

                <div className="p-3 rounded-xl bg-background/70 border border-border">

                  <div className="flex items-center gap-2">

                    <Activity className="w-4 h-4 text-primary" />

                    <div>

                      <p className="text-lg font-heading font-bold leading-none">
                        {stats.totalSets}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        Sets
                      </p>

                    </div>

                  </div>

                </div>


                {/* Time */}

                <div className="p-3 rounded-xl bg-background/70 border border-border">

                  <div className="flex items-center gap-2">

                    <Clock3 className="w-4 h-4 text-accent" />

                    <div>

                      <p className="text-lg font-heading font-bold leading-none">
                        {stats.totalDuration}
                      </p>

                      <p className="text-[10px] text-muted-foreground mt-1">
                        Minutes
                      </p>

                    </div>

                  </div>

                </div>

              </div>


              {/* Nutrition */}

              {stats.nutritionDays > 0 && (

                <div className="flex items-center gap-2 p-3 rounded-xl bg-background/60 border border-border">

                  <Utensils className="w-4 h-4 text-primary shrink-0" />

                  <div>

                    <p className="text-xs font-semibold">
                      Nutrition tracked {stats.nutritionDays} day{stats.nutritionDays !== 1 ? 's' : ''}
                    </p>

                    {stats.averageCalories > 0 && (

                      <p className="text-[10px] text-muted-foreground">
                        Average: {stats.averageCalories.toLocaleString()} calories/day
                      </p>

                    )}

                  </div>

                </div>

              )}

            </div>

          )}


          {/* ==================================================
              NO DATA
              ================================================== */}

          {monday &&
            !loading &&
            !insight &&
            !error &&
            stats.workoutCount === 0 && (

              <div className="p-4 rounded-xl bg-muted/50 border border-border text-center">

                <Dumbbell className="w-6 h-6 mx-auto mb-2 text-muted-foreground opacity-50" />

                <p className="text-sm font-semibold">
                  No workouts to review yet
                </p>

                <p className="text-xs text-muted-foreground mt-1">
                  Complete workouts during the week and
                  Kael will review them the following Monday.
                </p>

              </div>

            )}


          {/* ==================================================
              SERVER LIMIT REACHED
              ================================================== */}

          {monday &&
            !generated &&
            !loading &&
            !error &&
            !checkingWeeklyUpdate &&
            !weeklyUpdateAvailable && (

              <div className="p-4 rounded-xl bg-muted/50 border border-border">

                <div className="flex items-start gap-3">

                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">

                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />

                  </div>

                  <div>

                    <p className="text-sm font-semibold">
                      Weekly Update already used
                    </p>

                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      You've already received your Weekly
                      Update for this Monday cycle. Your next
                      Weekly Update will be available next
                      Monday.
                    </p>

                  </div>

                </div>

              </div>

            )}


          {/* ==================================================
              GENERATE BUTTON
              ================================================== */}

          {monday &&
            !generated &&
            !loading &&
            !error &&
            !checkingWeeklyUpdate &&
            weeklyUpdateAvailable &&
            stats.workoutCount > 0 && (
              <Button
                className="w-full h-11 font-heading font-semibold"
                onClick={generate}
              >

                <Sparkles className="w-4 h-4 mr-2" />

                Get This Week's Update

              </Button>

            )}


          {/* ==================================================
              LOADING
              ================================================== */}

          {loading && (

            <div className="p-4 rounded-xl bg-background/60 border border-border">

              <div className="flex items-center gap-3">

                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />

                <div>

                  <p className="text-sm font-semibold">
                    Kael is reviewing your week...
                  </p>

                  <p className="text-xs text-muted-foreground mt-1">
                    Looking through your workouts,
                    check-ins, performance, and recovery.
                  </p>

                </div>

              </div>

            </div>

          )}


          {/* ==================================================
              ERROR
              ================================================== */}

          {error && (

            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">

              <div className="flex items-start gap-2">

                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />

                <div className="flex-1">

                  <p className="text-sm font-semibold text-destructive">
                    Kael couldn't complete the report
                  </p>

                  <p className="text-xs text-muted-foreground mt-1">
                    {error}
                  </p>

                </div>

              </div>


              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setError(null);
                  generate();
                }}
              >
                Try Again
              </Button>

            </div>

          )}


          {/* ==================================================
              KAEL REPORT
              ================================================== */}

          {insight && (

            <div className="space-y-3">


              {/* Lock */}

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 rounded-lg px-2 py-1.5 w-fit">

                <CheckCircle2 className="w-3 h-3 text-accent" />

                Weekly report generated · next review Monday

              </div>


              {/* =================================================
                  SUMMARY
                  ================================================= */}

              {insight.summary && (

                <div className="p-4 rounded-xl bg-background/80 border border-primary/20">

                  <div className="flex items-center gap-2 mb-2">

                    <Sparkles className="w-4 h-4 text-primary" />

                    <p className="text-xs font-bold text-primary uppercase tracking-wider">
                      Your Week
                    </p>

                  </div>


                  <p className="text-sm leading-relaxed">
                    {insight.summary}
                  </p>

                </div>

              )}


              {/* =================================================
                  WIN
                  ================================================= */}

              <div className="p-4 rounded-xl bg-accent/10 border border-accent/20">

                <p className="text-xs font-bold text-accent uppercase tracking-wider mb-1.5">
                  What you crushed 🔥
                </p>

                <p className="text-sm leading-relaxed">
                  {insight.win ||
                    'You put meaningful work in this week.'}
                </p>

              </div>


              {/* =================================================
                  IMPROVE
                  ================================================= */}

              <div className="p-4 rounded-xl bg-muted/50 border border-border">

                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  What Kael noticed
                </p>

                <p className="text-sm leading-relaxed">
                  {insight.improve ||
                    'There was not enough evidence of a specific issue to flag this week.'}
                </p>

              </div>


              {/* =================================================
                  NEXT WEEK
                  ================================================= */}

              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">

                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1.5">
                  Next week
                </p>

                <p className="text-sm leading-relaxed">
                  {insight.next_recommendation ||
                    'Kael did not identify a specific programming change from this week’s data.'}
                </p>

              </div>


              {/* =================================================
                  PERFORMANCE NUTRITION INSIGHTS
                  ================================================= */}

              {hasNutritionInsights &&
                (insight.nutrition_insight ||
                  insight.nutrition_suggestions?.length > 0) && (

                <div className="p-4 rounded-xl bg-background/80 border border-primary/20">

                  <div className="flex items-center gap-2 mb-2">
                    <Utensils className="w-4 h-4 text-primary" />
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">
                      Nutrition Insights
                    </p>
                  </div>

                  {insight.nutrition_insight && (
                    <p className="text-sm leading-relaxed">
                      {insight.nutrition_insight}
                    </p>
                  )}

                  {insight.nutrition_suggestions?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {insight.nutrition_suggestions.map((suggestion, index) => (
                        <div
                          key={`${index}-${suggestion}`}
                          className="flex items-start gap-2 text-sm leading-relaxed"
                        >
                          <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                          <span>{suggestion}</span>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}


              {/* =================================================
                  MOTIVATION
                  ================================================= */}

              {insight.motivation && (

                <div className="border-l-2 border-primary/40 pl-3 py-1">

                  <p className="text-sm italic text-muted-foreground leading-relaxed">
                    {insight.motivation}
                  </p>

                </div>

              )}

            </div>

          )}

        </div>

      )}

    </Card>
  );
}
