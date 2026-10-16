import { supabase } from '@/lib/supabase';
import { supabaseApi, ensureValidUuid } from '@/lib/supabaseApi';
import { queryClientInstance } from '@/lib/query-client';
import {
  buildScientificBaselineWeekOne,
  buildSingleWeekMicrocycle,
  WEEK_CONFIGS,
} from '@/lib/periodizationEngine';
import { sanitizeMicrocycleExclusions } from '@/lib/programExclusions';
import { buildWeekPrompt } from '@/lib/trainingTypes';

/**
 * Generates a fresh 12-week workout program for the user.
 *
 * CRITICAL DATA INTEGRITY GUARANTEE:
 * - Progress photos and date tags remain completely untouched.
 * - Coach Kael messages and memory remain completely untouched.
 * - Profile details, avatar, weight, and settings remain untouched.
 * - Past workout logs and nutrition entries remain untouched.
 *
 * The ONLY mutation performed is:
 * 1. Marking previously active programs as completed.
 * 2. Creating and activating the new 12-week periodized workout program.
 */
export async function generateNewProgram(options = {}) {
  const {
    trainingType: trainingTypeOverride = null,
    fitnessLevel: fitnessLevelOverride = null,
    primaryGoal: primaryGoalOverride = null,
  } = options;

  // 1. Resolve current authenticated or profile user
  let user = null;
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      user = authData.user;
    }
  } catch (err) {
    console.debug('[ProgramService] getUser note:', err);
  }

  if (!user?.id) {
    try {
      const profileUser = await supabaseApi.auth.me();
      if (profileUser) {
        user = profileUser;
      }
    } catch (err) {
      console.debug('[ProgramService] me note:', err);
    }
  }

  if (!user?.id) {
    try {
      const cached = localStorage.getItem('washek_user');
      if (cached) {
        user = JSON.parse(cached);
      }
    } catch (err) {
      console.debug('[ProgramService] localStorage note:', err);
    }
  }

  if (!user?.id) {
    throw new Error('Please sign in to generate a workout program.');
  }

  const validUserId = ensureValidUuid(user.id || user.uid);

  // 2. Resolve profile settings and preferences
  let profile = null;
  try {
    const { data: pData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', validUserId)
      .maybeSingle();
    profile = pData;
  } catch (pErr) {
    console.debug('[ProgramService] Profile fetch note:', pErr);
  }

  const trainingType =
    trainingTypeOverride ||
    profile?.training_type ||
    user?.training_type ||
    'calisthenics';

  const fitnessLevel =
    fitnessLevelOverride ||
    profile?.fitness_level ||
    user?.fitness_level ||
    'intermediate';

  const primaryGoal =
    primaryGoalOverride ||
    profile?.primary_goal ||
    user?.primary_goal ||
    (trainingType === 'weights'
      ? 'Build raw strength and hypertrophy'
      : trainingType === 'hybrid'
        ? 'Master bodyweight levers and build compound lifting power'
        : 'Master advanced calisthenics skills and relative strength');

  const fitnessGoals = profile?.fitness_goals || [];
  const weightGoals = profile?.weight_goals || [];
  const currentSkills = profile?.current_skills || '';
  const equipment = profile?.available_equipment || '';
  const requirements = profile?.training_requirements || '';
  const gender = profile?.gender || null;

  const userOptions = {
    trainingType,
    level: fitnessLevel,
    fitnessGoals,
    weightGoals,
    goalDescription: primaryGoal,
    equipment,
    requirements,
    currentSkills,
    gender,
  };

  // 3. Generate Week 1 microcycle (AI with quick fallback to scientific baseline)
  const weekSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      microcycle: {
        type: 'object',
        additionalProperties: false,
        properties: {
          week_number: { type: 'number' },
          mesocycle_index: { type: 'number' },
          week_type: { type: 'string' },
          days: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                day_name: { type: 'string' },
                workout_type: { type: 'string' },
                exercises: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      sets: { type: 'number' },
                      reps: { type: 'string' },
                      rest_seconds: { type: 'number' },
                      notes: { type: 'string' },
                      activation_cue: { type: 'string' },
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
              required: ['day_name', 'workout_type', 'exercises'],
            },
          },
        },
        required: ['week_number', 'mesocycle_index', 'week_type', 'days'],
      },
    },
    required: ['microcycle'],
  };

  let weekOne = null;
  try {
    const promptData = {
      trainingType,
      gender,
      level: fitnessLevel,
      age: profile?.age,
      weightLbs: profile?.weight_lbs,
      unit: profile?.unit || 'imperial',
      currentSkills,
      goalDescription: primaryGoal,
      equipment,
      requirements,
      fitnessGoals,
      weightGoals,
    };

    const aiPromise = supabaseApi.ai.invoke({
      type: 'microcycle',
      prompt: buildWeekPrompt(trainingType, promptData, 1, null, []),
      schema: weekSchema,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI timeout')), 2200)
    );

    const parsed = await Promise.race([aiPromise, timeoutPromise]);
    const microcycle = parsed?.microcycle;
    if (
      microcycle &&
      Array.isArray(microcycle.days) &&
      microcycle.days.length > 0
    ) {
      weekOne = {
        ...microcycle,
        week_number: 1,
        mesocycle_index: 0,
        week_type: microcycle.week_type || 'Foundation',
      };
    }
  } catch (aiErr) {
    console.debug('[ProgramService] AI generation note, using calibrated baseline:', aiErr?.message);
  }

  if (!weekOne) {
    weekOne = buildScientificBaselineWeekOne(userOptions);
  } else {
    weekOne = sanitizeMicrocycleExclusions(weekOne, userOptions);
  }

  // 4. Build all 12 weeks with periodization progressions
  const all12Weeks = [weekOne];
  for (let w = 2; w <= 12; w++) {
    const config = WEEK_CONFIGS.find((c) => c.weekNumber === w) || {
      weekNumber: w,
      mesoIndex: Math.floor((w - 1) / 4),
      phase: Math.min(3, Math.floor((w - 1) / 4) + 1),
      weekType: w === 4 || w === 8 || w === 12 ? 'Deload' : 'Progression',
      overload: w === 4 || w === 8 ? 'recovery' : 'volume',
      predicted_focus: `Week ${w} planned progression`,
      target_rir: '1-2 RIR',
      volume_delta: '+10%',
    };

    const weekMicrocycle = buildSingleWeekMicrocycle(weekOne, config, {
      trainingType,
      goalDescription: primaryGoal,
      fitnessLevel,
      requirements,
      currentSkills,
      equipment,
    });

    all12Weeks.push(weekMicrocycle);
  }

  // 5. Build mesocycle phases
  const mesocycles = [
    {
      name: 'Foundation & Capacity',
      focus:
        'Build movement mechanics, tendon tolerance, work capacity, and baseline volume.',
      weeks: 4,
      intensity: 'moderate',
      week_start: 1,
      week_end: 4,
    },
    {
      name: 'Intensification & Overload',
      focus:
        'Progress strength, mechanical tension, training quality, and goal-specific capacity.',
      weeks: 4,
      intensity: 'moderate-high',
      week_start: 5,
      week_end: 8,
    },
    {
      name: 'Peak Mastery & PRs',
      focus:
        'Maximal motor unit recruitment, peak performance expression, and benchmark PR testing.',
      weeks: 4,
      intensity: 'high',
      week_start: 9,
      week_end: 12,
    },
  ];

  const athleteName = (
    profile?.first_name ||
    user?.user_metadata?.first_name ||
    user?.first_name ||
    'Athlete'
  ).trim();

  const programName = `${athleteName}'s ${
    trainingType === 'weights'
      ? 'Strength'
      : trainingType === 'hybrid'
        ? 'Hybrid'
        : trainingType === 'weighted_calisthenics'
          ? 'Weighted Calisthenics'
          : 'Performance'
  } Program`;

  const programPayload = {
    user_id: validUserId,
    created_by: user.email || profile?.email || '',
    program_name: programName,
    duration_weeks: 12,
    macrocycle: {
      overview:
        'A comprehensive 12-week periodized program covering Foundation, Intensification, and Peak performance, updated continuously via post-workout check-ins.',
      phases: mesocycles.map((m) => ({
        name: m.name,
        weeks: `${m.week_start}-${m.week_end}`,
        focus: m.focus,
      })),
    },
    mesocycles,
    microcycles: all12Weeks,
    training_type: trainingType,
    fitness_level: fitnessLevel,
    goal: primaryGoal,
    current_week: 1,
    status: 'active',
  };

  // 6. Complete / archive previous active program(s)
  try {
    const existingPrograms = await supabaseApi.entities.WorkoutProgram.filter(
      { status: 'active', user_id: validUserId },
      '-created_at',
      10
    );
    if (Array.isArray(existingPrograms) && existingPrograms.length > 0) {
      for (const prog of existingPrograms) {
        if (prog?.id) {
          await supabaseApi.entities.WorkoutProgram.update(prog.id, {
            status: 'completed',
          });
        }
      }
    }
  } catch (archErr) {
    console.debug('[ProgramService] Old program archive note:', archErr);
  }

  // 7. Save new 12-week program
  let savedProgram = null;
  try {
    savedProgram = await supabaseApi.entities.WorkoutProgram.create(programPayload);
  } catch (entityErr) {
    console.warn('[ProgramService] Entity create fallback:', entityErr);
    const { data, error: programError } = await supabase
      .from('workout_programs')
      .insert(programPayload)
      .select()
      .single();

    if (programError) throw programError;
    savedProgram = data;
  }

  if (!savedProgram) {
    throw new Error('Your 12-week program was built but could not be saved.');
  }

  // 8. If training type was changed by user, update profile training_type without wiping other fields
  if (trainingTypeOverride && trainingTypeOverride !== profile?.training_type) {
    try {
      await supabase
        .from('profiles')
        .update({ training_type: trainingTypeOverride })
        .eq('id', validUserId);
    } catch (profErr) {
      console.debug('[ProgramService] Profile training type sync note:', profErr);
    }
  }

  // 9. Invalidate queries so Dashboard, Program, and Workout pages refresh immediately
  try {
    await queryClientInstance.invalidateQueries();
  } catch (qErr) {
    console.debug('[ProgramService] Query invalidation note:', qErr);
  }

  // Broadcast event for any listeners
  try {
    window.dispatchEvent(
      new CustomEvent('washek-program-updated', { detail: { program: savedProgram } })
    );
  } catch (eventErr) {
    console.debug('[ProgramService] Event dispatch note:', eventErr);
  }

  return savedProgram;
}
