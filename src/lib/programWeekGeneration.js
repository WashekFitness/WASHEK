import { supabase } from '@/lib/supabase';
import { supabaseApi } from '@/lib/supabaseApi';
import { buildWeekPrompt } from '@/lib/trainingTypes';

/*
 * ============================================================
 * WEEK SCHEMA
 * ============================================================
 *
 * This intentionally matches the schema already used by
 * Onboarding for Week 1.
 *
 * DO NOT change the AI backend for this.
 * This uses the existing supabaseApi.ai.invoke() path.
 */

const weekSchema = {
  type: 'object',
  additionalProperties: false,

  properties: {
    microcycle: {
      type: 'object',
      additionalProperties: false,

      properties: {
        week_number: {
          type: 'number',
        },

        mesocycle_index: {
          type: 'number',
        },

        week_type: {
          type: 'string',
        },

        days: {
          type: 'array',

          items: {
            type: 'object',
            additionalProperties: false,

            properties: {
              day_name: {
                type: 'string',
              },

              workout_type: {
                type: 'string',
              },

              exercises: {
                type: 'array',

                items: {
                  type: 'object',
                  additionalProperties: false,

                  properties: {
                    name: {
                      type: 'string',
                    },

                    sets: {
                      type: 'number',
                    },

                    reps: {
                      type: 'string',
                    },

                    rest_seconds: {
                      type: 'number',
                    },

                    notes: {
                      type: 'string',
                    },

                    activation_cue: {
                      type: 'string',
                    },
                  },

                  required: [
                    'name',
                    'sets',
                    'reps',
                    'rest_seconds',
                    'notes',
                    'activation_cue',
                  ],
                },
              },
            },

            required: [
              'day_name',
              'workout_type',
              'exercises',
            ],
          },
        },
      },

      required: [
        'week_number',
        'mesocycle_index',
        'week_type',
        'days',
      ],
    },
  },

  required: [
    'microcycle',
  ],
};


/*
 * ============================================================
 * SAFE HELPERS
 * ============================================================
 */

function parseMaybeJson(value, fallback) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value !== 'string'
  ) {
    return value;
  }

  const trimmed =
    value.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}


function asArray(value) {
  const parsed =
    parseMaybeJson(value, []);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  return [];
}


function asObject(value) {
  const parsed =
    parseMaybeJson(value, {});

  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed)
  ) {
    return parsed;
  }

  return {};
}


function rpcObject(data) {
  if (
    Array.isArray(data)
  ) {
    return data[0] || {};
  }

  // claim_program_week_generation returns a bare boolean on some
  // Supabase/Postgres versions. Normalize it for the caller.
  if (typeof data === 'boolean') {
    return {
      allowed: data,
      reason: data ? null : 'generation_in_progress',
    };
  }

  return data || {};
}


/*
 * ============================================================
 * PROFILE → AI PROMPT DATA
 * ============================================================
 */

function buildPromptData(
  profile,
  originalRequirements,
  previousMicrocycle,
  recentLogs
) {
  const fitnessGoals =
    asArray(
      profile?.fitness_goals
    );

  const weightGoals =
    asArray(
      profile?.weight_goals
    );

  const heightInches =
    Number(
      profile?.height_inches
    );

  let heightFt = '';
  let heightIn = '';

  if (
    Number.isFinite(
      heightInches
    ) &&
    heightInches > 0
  ) {
    heightFt =
      Math.floor(
        heightInches / 12
      );

    heightIn =
      heightInches % 12;
  }

  /*
   * Give the next week's AI useful information about what
   * actually happened in the previous week.
   *
   * Keep this bounded so we don't unnecessarily inflate the
   * OpenRouter request.
   */

  const previousWeekSummary =
    previousMicrocycle
      ? JSON.stringify(
          previousMicrocycle
        ).slice(
          0,
          12000
        )
      : '';

  const workoutLogSummary =
    Array.isArray(
      recentLogs
    ) && recentLogs.length
      ? JSON.stringify(
          recentLogs
        ).slice(
          0,
          12000
        )
      : '';

  let requirements =
    originalRequirements || '';

  if (
    previousWeekSummary
  ) {
    requirements += `

PREVIOUS PROGRAMMED WEEK:
The athlete's immediately previous programmed week was:
${previousWeekSummary}

Use this to create appropriate progression. Do not simply duplicate the previous week.`;
  }

  if (
    workoutLogSummary
  ) {
    requirements += `

RECENT WORKOUT PERFORMANCE:
These are the available workout logs from the previous week:
${workoutLogSummary}

Use these logs as performance feedback when deciding progression, recovery, volume, exercise selection, and difficulty.`;
  }

  return {
    gender:
      profile?.gender,

    level:
      profile?.fitness_level,

    age:
      profile?.age,

    weightLbs:
      profile?.weight_lbs,

    heightFt,

    heightIn,

    unit:
      profile?.unit || 'imperial',

    currentSkills:
      profile?.current_skills || '',

    goalDescription:
      profile?.primary_goal || '',

    timeframe:
      profile?.goal_timeframe || '',

    equipment:
      profile?.available_equipment || '',

    requirements,

    fitnessGoals,

    weightGoals,
  };
}


/*
 * ============================================================
 * MESOCYCLE INFORMATION
 * ============================================================
 */

function getMesocycleIndex(
  weekNumber
) {
  return Math.floor(
    (weekNumber - 1) / 4
  );
}


/*
 * ============================================================
 * FETCH FRESH PROGRAM
 * ============================================================
 */

async function fetchProgram(
  programId
) {
  const {
    data,
    error,
  } =
    await supabase
      .from('workout_programs')
      .select('*')
      .eq('id', programId)
      .single();

  if (error) {
    throw error;
  }

  return data;
}


/*
 * ============================================================
 * GET SERVER-AUTHORITATIVE CURRENT CALENDAR WEEK
 * ============================================================
 */

export async function getCalendarWeek(
  programId
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      'get_current_program_week',
      {
        p_program_id:
          programId,
      }
    );

  if (error) {
    throw error;
  }

  /*
   * The SQL function returns an integer, but accepting an
   * object here makes this tolerant of a future RPC shape.
   */

  if (
    typeof data === 'number'
  ) {
    return data;
  }

  if (
    typeof data === 'string'
  ) {
    const number =
      Number(data);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  const result =
    rpcObject(data);

  const candidates = [
    result.current_week,
    result.week_number,
    result.get_current_program_week,
  ];

  for (
    const candidate of candidates
  ) {
    const number =
      Number(candidate);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  throw new Error(
    'Could not determine the current program calendar week.'
  );
}


/*
 * ============================================================
 * CLAIM A WEEK
 * ============================================================
 */

async function claimWeek(
  programId,
  weekNumber
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      'claim_program_week_generation',
      {
        p_program_id:
          programId,

        p_week_number:
          weekNumber,
      }
    );

  if (error) {
    throw error;
  }

  return rpcObject(data);
}


/*
 * ============================================================
 * COMPLETE A WEEK
 * ============================================================
 */

async function completeWeek(
  programId,
  weekNumber,
  microcycle
) {
  const {
    data,
    error,
  } =
    await supabase.rpc(
      'complete_program_week_generation',
      {
        p_program_id:
          programId,

        p_week_number:
          weekNumber,

        p_microcycle:
          microcycle,
      }
    );

  if (error) {
    throw error;
  }

  return rpcObject(data);
}


/*
 * ============================================================
 * MARK GENERATION FAILED
 * ============================================================
 */

async function failWeek(
  programId,
  weekNumber
) {
  const {
    error,
  } =
    await supabase.rpc(
      'fail_program_week_generation',
      {
        p_program_id:
          programId,

        p_week_number:
          weekNumber,
      }
    );

  if (error) {
    console.error(
      '[ProgramWeekGeneration] Failed to mark generation as failed:',
      error
    );
  }
}


/*
 * ============================================================
 * GENERATE ONE WEEK
 * ============================================================
 */

async function generateOneWeek(
  program,
  user,
  weekNumber
) {
  const programId =
    program.id;

  console.log(
    `[ProgramWeekGeneration] Starting Week ${weekNumber}`
  );

  /*
   * Claim first.
   *
   * This prevents two browser tabs/devices from generating the
   * same week simultaneously.
   */

  const claim =
    await claimWeek(
      programId,
      weekNumber
    );

  if (
    claim?.allowed === false
  ) {
    console.log(
      `[ProgramWeekGeneration] Week ${weekNumber} was not claimed:`,
      claim
    );

    return {
      generated: false,
      reason:
        claim?.reason ||
        'generation_in_progress',
    };
  }

  /*
   * Refresh program after the claim.
   *
   * Another process may have completed a week between our
   * previous read and this point.
   */

  let freshProgram =
    await fetchProgram(
      programId
    );

  const existingMicrocycles =
    asArray(
      freshProgram.microcycles
    );

  const existingWeek =
    existingMicrocycles.find(
      week =>
        Number(
          week?.week_number
        ) ===
        Number(
          weekNumber
        )
    );

  if (
    existingWeek
  ) {
    /*
     * The week may have been created by another browser tab or
     * device after our generation claim succeeded.
     *
     * Mark the generation record as completed instead of leaving
     * it stuck in `generating`.
     */

    try {
      await completeWeek(
        programId,
        weekNumber,
        existingWeek
      );
    } catch (error) {
      console.error(
        `[ProgramWeekGeneration] Week ${weekNumber} already exists, but the generation record could not be marked completed:`,
        error
      );
    }

    return {
      generated: false,
      reason:
        'already_exists',
      program:
        freshProgram,
    };
  }

  /*
   * Load the latest profile.
   */

  const {
    data: profile,
    error: profileError,
  } =
    await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

  if (profileError) {
    await failWeek(
      programId,
      weekNumber
    );

    throw profileError;
  }

  /*
   * Find the immediately previous microcycle.
   */

  const previousMicrocycle =
    existingMicrocycles.find(
      week =>
        Number(
          week?.week_number
        ) ===
        Number(
          weekNumber - 1
        )
    ) || null;

  /*
   * Load actual workout performance from the previous week.
   *
   * If logs cannot be loaded, generation can still continue from
   * the program/profile. We don't want a missing optional log
   * query to prevent a new training week from being created.
   */

  let recentLogs = [];

  if (
    weekNumber > 1
  ) {
    const {
      data: logs,
      error: logsError,
    } =
      await supabase
        .from('workout_logs')
        .select('*')
        .eq(
          'program_id',
          programId
        )
        .eq(
          'week_number',
          weekNumber - 1
        )
        .order(
          'date',
          {
            ascending:
              false,
          }
        )
        .limit(30);

    if (logsError) {
      console.warn(
        '[ProgramWeekGeneration] Could not load previous workout logs. Continuing without them:',
        logsError
      );
    } else {
      recentLogs =
        logs || [];
    }
  }

  /*
   * Adaptation history is already part of the existing program
   * architecture.
   */

  const adaptationHistory =
    asArray(
      freshProgram.adaptation_history
    );

  const trainingType =
    freshProgram.training_type ||
    profile.training_type ||
    'calisthenics';

  const promptData =
    buildPromptData(
      profile,
      profile.training_requirements || '',
      previousMicrocycle,
      recentLogs
    );

  /*
   * Generate exactly ONE week.
   *
   * This uses the existing working AI path.
   */

  let parsed;

  try {
    parsed =
      await supabaseApi.ai.invoke({
        type: 'microcycle',

        prompt:
          buildWeekPrompt(
            trainingType,
            promptData,
            weekNumber,
            adaptationHistory
          ),

        schema:
          weekSchema,
      });
  } catch (error) {
    await failWeek(
      programId,
      weekNumber
    );

    throw error;
  }

  const microcycle =
    parsed?.microcycle;

  if (
    !microcycle ||
    !Array.isArray(
      microcycle.days
    ) ||
    microcycle.days.length === 0
  ) {
    await failWeek(
      programId,
      weekNumber
    );

    throw new Error(
      `AI returned no workouts for Week ${weekNumber}.`
    );
  }

  /*
   * Never trust the model to choose the correct week number.
   */

  const safeMicrocycle = {
    ...microcycle,

    week_number:
      weekNumber,

    mesocycle_index:
      getMesocycleIndex(
        weekNumber
      ),

    week_type:
      microcycle.week_type ||
      'Progression',
  };

  try {
    await completeWeek(
      programId,
      weekNumber,
      safeMicrocycle
    );
  } catch (error) {
    await failWeek(
      programId,
      weekNumber
    );

    throw error;
  }

  freshProgram =
    await fetchProgram(
      programId
    );

  console.log(
    `[ProgramWeekGeneration] Week ${weekNumber} generated successfully.`
  );

  return {
    generated: true,

    reason:
      'generated',

    program:
      freshProgram,
  };
}


/*
 * ============================================================
 * MAIN BOOTSTRAP
 * ============================================================
 *
 * This is the function the app calls whenever the user enters
 * the authenticated application.
 *
 * It advances the program by at most one week per check.
 */

export async function ensureCurrentProgramWeek(
  initialProgram,
  user
) {
  if (
    !initialProgram?.id ||
    !user?.id
  ) {
    return {
      program:
        initialProgram,

      targetWeek:
        initialProgram?.current_week ||
        1,

      generated:
        false,
    };
  }

  /*
   * Never touch a non-active program.
   */

  if (
    initialProgram.status &&
    initialProgram.status !== 'active'
  ) {
    return {
      program:
        initialProgram,

      targetWeek:
        initialProgram.current_week ||
        1,

      generated:
        false,
    };
  }

  let program =
    await fetchProgram(
      initialProgram.id
    );

  /*
   * Ask the database what calendar week the athlete is actually
   * in. This is independent of how many workouts they completed.
   */

  const targetWeek =
    await getCalendarWeek(
      program.id
    );

  const durationWeeks =
    Math.min(
      Number(
        program.duration_weeks
      ) || 12,
      12
    );

  const cappedTargetWeek =
    Math.min(
      Math.max(
        1,
        Number(targetWeek) || 1
      ),
      durationWeeks
    );

  let currentWeek =
    Math.max(
      1,
      Number(
        program.current_week
      ) || 1
    );

  let generatedAny =
    false;

  /*
   * Generate at most ONE missing week per bootstrap check.
   *
   * If an athlete has been away for several weeks, do not fire
   * multiple AI generations back-to-back in one app load. Each
   * generated week still depends on the immediately previous
   * week, so we intentionally advance one week at a time.
   */

  if (
    currentWeek <
    cappedTargetWeek
  ) {
    const nextWeek =
      currentWeek + 1;

    const result =
      await generateOneWeek(
        program,
        user,
        nextWeek
      );

    /*
     * If another tab/device is currently generating the week,
     * stop here. That other process owns the generation.
     */

    if (
      result.reason ===
      'generation_in_progress'
    ) {
      program =
        await fetchProgram(
          program.id
        );
    } else {
      /*
       * Refresh regardless of whether the week already existed.
       */

      program =
        result.program ||
        await fetchProgram(
          program.id
        );

      const microcycles =
        asArray(
          program.microcycles
        );

      const weekNowExists =
        microcycles.some(
          week =>
            Number(
              week?.week_number
            ) ===
            Number(
              nextWeek
            )
        );

      if (
        weekNowExists
      ) {
        currentWeek =
          Math.max(
            currentWeek,
            nextWeek
          );

        generatedAny =
          Boolean(
            result.generated
          );
      }
    }
  }

  /*
   * Always return the freshest program.
   */

  program =
    await fetchProgram(
      program.id
    );

  return {
    program,

    targetWeek:
      cappedTargetWeek,

    generated:
      generatedAny,
  };
}
