import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  ChevronLeft,
  ChevronRight,
  Zap,
  Layers,
  TrendingDown,
  Target,
  Eye,
  Clock,
  Dumbbell,
  Timer,
  CheckCircle2,
  Edit3,
  Plus,
  Trash2,
  Save,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { hasPlan } from '@/lib/subscription';
import { supabaseApi } from '@/lib/supabaseApi';

const weekTypeConfig = {
  foundation: {
    label: 'Foundation',
    color: 'bg-accent/15 text-accent border-accent/20',
    icon: Target,
  },
  accumulation: {
    label: 'Accumulation',
    color: 'bg-primary/15 text-primary border-primary/20',
    icon: Layers,
  },
  intensification: {
    label: 'Intensification',
    color: 'bg-chart-4/15 text-chart-4 border-chart-4/20',
    icon: Zap,
  },
  peak: {
    label: 'Peak',
    color: 'bg-chart-3/15 text-chart-3 border-chart-3/20',
    icon: Zap,
  },
  taper: {
    label: 'Taper',
    color: 'bg-chart-3/15 text-chart-3 border-chart-3/20',
    icon: TrendingDown,
  },
  deload: {
    label: 'Deload',
    color: 'bg-muted text-muted-foreground border-border',
    icon: TrendingDown,
  },
};

function getWeekTypeConfig(weekType) {
  if (!weekType) {
    return null;
  }

  const key = String(weekType).toLowerCase().trim();

  return (
    weekTypeConfig[key] || {
      label: weekType,
      color: 'bg-muted text-muted-foreground border-border',
      icon: Target,
    }
  );
}

function WorkoutTypeTag({ workoutType }) {
  if (!workoutType) {
    return null;
  }

  const lower = String(workoutType).toLowerCase();

  let color = 'bg-muted/60 text-muted-foreground';

  if (
    lower.includes('intensity') ||
    lower.includes('neural') ||
    lower.includes('strength') ||
    lower.includes('power')
  ) {
    color = 'bg-chart-4/10 text-chart-4';
  } else if (
    lower.includes('volume') ||
    lower.includes('hypertrophy') ||
    lower.includes('muscle')
  ) {
    color = 'bg-primary/10 text-primary';
  } else if (
    lower.includes('skill') ||
    lower.includes('recovery') ||
    lower.includes('active') ||
    lower.includes('deload') ||
    lower.includes('mobility')
  ) {
    color = 'bg-accent/10 text-accent';
  }

  return (
    <span
      className={cn(
        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
        color
      )}
    >
      {workoutType}
    </span>
  );
}

function getExercises(day) {
  return Array.isArray(day?.exercises) ? day.exercises : [];
}

function formatRest(seconds) {
  const value = Number(seconds);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (value < 60) {
    return `${value}s`;
  }

  if (value % 60 === 0) {
    return `${value / 60} min`;
  }

  return `${Math.floor(value / 60)}m ${value % 60}s`;
}

function getEstimatedMinutes(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return 0;
  }

  const totalSets = exercises.reduce(
    (sum, exercise) =>
      sum + (Number(exercise?.sets) || 1),
    0
  );

  return Math.max(
    10,
    Math.round(totalSets * 2.5)
  );
}

function normalizeExerciseForComparison(exercise) {
  return {
    name: String(exercise?.name || '').trim(),
    sets: Number(exercise?.sets) || 1,
    reps: String(exercise?.reps ?? '').trim(),
    rest_seconds: Number(exercise?.rest_seconds) || 0,
    notes: String(exercise?.notes ?? '').trim(),
    activation_cue: String(
      exercise?.activation_cue ?? ''
    ).trim(),
  };
}

function getExerciseHistoryKey(exercise) {
  return String(
    exercise?.name || ''
  )
    .trim()
    .toLowerCase();
}

function buildAdaptationEvents({
  originalExercises,
  editedExercises,
  weekNumber,
  dayName,
}) {
  const events = [];
  const now = new Date().toISOString();

  const originalByName = new Map();

  originalExercises.forEach(
    (exercise) => {
      const key =
        getExerciseHistoryKey(
          exercise
        );

      if (!key) {
        return;
      }

      /*
       * If the same exercise appears more than once,
       * keep the first occurrence for comparison. This avoids
       * generating duplicate history records for normal programs.
       */
      if (!originalByName.has(key)) {
        originalByName.set(key, exercise);
      }
    }
  );

  const editedByName = new Map();

  editedExercises.forEach(
    (exercise) => {
      const key =
        getExerciseHistoryKey(
          exercise
        );

      if (!key) {
        return;
      }

      if (!editedByName.has(key)) {
        editedByName.set(key, exercise);
      }
    }
  );

  /*
   * Existing exercises:
   *
   * - If the exercise disappeared, record a removal.
   * - If it stayed, compare all editable fields and record
   *   only the fields that actually changed.
   */
  originalExercises.forEach(
    (originalExercise) => {
      const originalName =
        String(
          originalExercise?.name || ''
        ).trim();

      const key =
        getExerciseHistoryKey(
          originalExercise
        );

      if (!key) {
        return;
      }

      const editedExercise =
        editedByName.get(key);

      if (!editedExercise) {
        events.push({
          date: now,
          action: 'remove_exercise',
          exercise: originalName,
          week:
            Number(weekNumber) || 1,
          day:
            dayName ||
            'Unknown day',
          from: originalName,
          to: null,
        });

        return;
      }

      const originalNormalized =
        normalizeExerciseForComparison(
          originalExercise
        );

      const editedNormalized =
        normalizeExerciseForComparison(
          editedExercise
        );

      const comparableFields = [
        'sets',
        'reps',
        'rest_seconds',
        'notes',
        'activation_cue',
      ];

      comparableFields.forEach(
        (field) => {
          if (
            originalNormalized[field] !==
            editedNormalized[field]
          ) {
            events.push({
              date: now,
              action: 'edit_exercise',
              exercise:
                originalName,
              field,
              oldValue:
                originalNormalized[field],
              newValue:
                editedNormalized[field],
              week:
                Number(weekNumber) || 1,
              day:
                dayName ||
                'Unknown day',
            });
          }
        }
      );
    }
  );

  /*
   * New exercises:
   *
   * Anything that wasn't in the original workout is recorded as
   * an addition. This is especially useful when an athlete
   * repeatedly chooses the same replacement movement.
   */
  editedExercises.forEach(
    (editedExercise) => {
      const editedName =
        String(
          editedExercise?.name || ''
        ).trim();

      const key =
        getExerciseHistoryKey(
          editedExercise
        );

      if (
        !key ||
        originalByName.has(key)
      ) {
        return;
      }

      events.push({
        date: now,
        action: 'add_exercise',
        exercise:
          editedName,
        week:
          Number(weekNumber) || 1,
        day:
          dayName ||
          'Unknown day',
        from: null,
        to: editedName,
      });
    }
  );

  return events;
}

export default function WeeklyPlan({
  program,
  onLogWorkout,
}) {
  const navigate = useNavigate();

  const [
    selectedWeek,
    setSelectedWeek,
  ] = useState(
    program?.current_week || 1
  );

  const [
    userPlan,
    setUserPlan,
  ] = useState('free');

  const [
    editingDayIndex,
    setEditingDayIndex,
  ] = useState(null);

  const [
    editingExercises,
    setEditingExercises,
  ] = useState([]);

  const [
    savingEdit,
    setSavingEdit,
  ] = useState(false);

  const allWeeks = useMemo(
    () =>
      Array.isArray(
        program?.microcycles
      )
        ? program.microcycles
        : [],
    [program]
  );

  const totalWeeks =
    program?.duration_weeks ||
    allWeeks.length ||
    12;

  const currentWeek =
    program?.current_week ||
    1;

  const currentMicrocycle =
    allWeeks.find(
      (microcycle) =>
        Number(
          microcycle?.week_number
        ) ===
        Number(selectedWeek)
    ) || null;

  const isFutureWeek =
    Number(selectedWeek) >
    Number(currentWeek);

  const mesocycleName =
    program?.mesocycles?.[
      currentMicrocycle?.mesocycle_index
    ]?.name || null;

  const weekTypeCfg =
    getWeekTypeConfig(
      currentMicrocycle?.week_type
    );

  const WeekTypeIcon =
    weekTypeCfg?.icon ||
    Target;

  /*
   * Progress is the minimum paid plan that includes the
   * custom workout editor. Performance and Elite inherit it.
   */
  const canEditWorkouts =
    hasPlan(
      userPlan,
      'progress'
    );

  useEffect(() => {
    let mounted = true;

    supabaseApi.auth
      .me()
      .then((user) => {
        if (!mounted) {
          return;
        }

        setUserPlan(
          user?.subscription_plan ||
            'free'
        );
      })
      .catch((error) => {
        console.error(
          '[WeeklyPlan] Failed to load subscription plan:',
          error
        );
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (
      allWeeks.some(
        (microcycle) =>
          Number(
            microcycle?.week_number
          ) ===
          Number(selectedWeek)
      )
    ) {
      return;
    }

    if (allWeeks.length > 0) {
      setSelectedWeek(
        Number(
          allWeeks[0]?.week_number
        ) || 1
      );
    }
  }, [
    allWeeks,
    selectedWeek,
  ]);

  const openWorkoutEditor = (
    dayIndex,
    day
  ) => {
    if (!canEditWorkouts) {
      return;
    }

    const exercises =
      getExercises(day);

    setEditingDayIndex(
      dayIndex
    );

    setEditingExercises(
      exercises.map(
        (exercise) => ({
          ...exercise,

          name:
            exercise?.name ||
            '',

          sets:
            Number(
              exercise?.sets
            ) || 1,

          reps:
            exercise?.reps ??
            '',

          rest_seconds:
            Number(
              exercise?.rest_seconds
            ) || 60,

          notes:
            exercise?.notes ||
            '',

          activation_cue:
            exercise?.activation_cue ||
            '',
        })
      )
    );
  };

  const closeWorkoutEditor = () => {
    if (savingEdit) {
      return;
    }

    setEditingDayIndex(
      null
    );

    setEditingExercises(
      []
    );
  };

  const updateEditingExercise = (
    index,
    field,
    value
  ) => {
    setEditingExercises(
      (previous) =>
        previous.map(
          (
            exercise,
            exerciseIndex
          ) => {
            if (
              exerciseIndex !==
              index
            ) {
              return exercise;
            }

            if (
              field === 'name' ||
              field === 'reps' ||
              field === 'notes' ||
              field === 'activation_cue'
            ) {
              return {
                ...exercise,
                [field]:
                  value,
              };
            }

            /*
             * Keep the raw input while the user is editing.
             * Converting an empty input to 0 makes the value
             * impossible to properly erase.
             */
            if (
              value === ''
            ) {
              return {
                ...exercise,
                [field]:
                  '',
              };
            }

            const numeric =
              Number(value);

            return {
              ...exercise,

              [field]:
                Number.isFinite(
                  numeric
                )
                  ? Math.max(
                      0,
                      numeric
                    )
                  : '',
            };
          }
        )
    );
  };

  const addEditingExercise = () => {
    setEditingExercises(
      (previous) => [
        ...previous,

        {
          name: '',
          sets: 3,
          reps: '8-12',
          rest_seconds: 60,
          notes: '',
          activation_cue: '',
        },
      ]
    );
  };

  const removeEditingExercise = (
    index
  ) => {
    if (
      editingExercises.length <=
      1
    ) {
      return;
    }

    setEditingExercises(
      (previous) =>
        previous.filter(
          (
            _,
            exerciseIndex
          ) =>
            exerciseIndex !==
            index
        )
    );
  };

  const saveWorkoutEdits = async () => {
    if (
      !canEditWorkouts ||
      editingDayIndex ===
        null ||
      savingEdit
    ) {
      return;
    }

    if (
      !program?.id ||
      !currentMicrocycle
    ) {
      window.alert(
        'This workout cannot be edited right now.'
      );

      return;
    }

    const cleanExercises =
      editingExercises
        .filter(
          (exercise) =>
            String(
              exercise?.name ||
                ''
            ).trim()
        )
        .map(
          (exercise) => ({
            ...exercise,

            name:
              String(
                exercise.name
              ).trim(),

            sets:
              Math.max(
                1,
                Number(
                  exercise.sets
                ) || 1
              ),

            reps:
              String(
                exercise.reps ??
                  ''
              ).trim(),

            rest_seconds:
              Math.max(
                0,
                Number(
                  exercise.rest_seconds
                ) || 0
              ),

            notes:
              String(
                exercise.notes ??
                  ''
              ).trim(),

            activation_cue:
              String(
                exercise.activation_cue ??
                  ''
              ).trim(),
          })
        );

    if (
      cleanExercises.length ===
      0
    ) {
      window.alert(
        'Add at least one named exercise before saving.'
      );

      return;
    }

    setSavingEdit(
      true
    );

    try {
      const originalDay =
        currentMicrocycle?.days?.[
          editingDayIndex
        ] || null;

      const originalExercises =
        getExercises(
          originalDay
        );

      /*
       * ==========================================================
       * ADAPTIVE PROGRAMMING HISTORY
       * ==========================================================
       *
       * The old editor replaced the workout but did not preserve
       * what the athlete changed.
       *
       * Every meaningful change is now recorded in
       * workout_programs.adaptation_history:
       *
       * - exercise removed
       * - exercise added
       * - sets changed
       * - reps changed
       * - rest changed
       * - notes changed
       * - activation cue changed
       *
       * This gives Kael actual behavioral data to use when building
       * future programs.
       */

      const adaptationEvents =
        buildAdaptationEvents({
          originalExercises,
          editedExercises:
            cleanExercises,
          weekNumber:
            selectedWeek,
          dayName:
            originalDay?.day_name ||
            `Day ${editingDayIndex + 1}`,
        });

      const existingHistory =
        Array.isArray(
          program?.adaptation_history
        )
          ? program.adaptation_history
          : [];

      /*
       * Keep the history bounded. Kael only needs the recent
       * pattern of changes, and this prevents the JSON field from
       * growing forever.
       */
      const adaptationHistory = [
        ...existingHistory,
        ...adaptationEvents,
      ].slice(-100);

      const updatedMicrocycles =
        allWeeks.map(
          (microcycle) => {
            if (
              Number(
                microcycle?.week_number
              ) !==
              Number(
                selectedWeek
              )
            ) {
              return microcycle;
            }

            const days =
              Array.isArray(
                microcycle?.days
              )
                ? microcycle.days
                : [];

            const updatedDays =
              days.map(
                (
                  day,
                  dayIndex
                ) => {
                  if (
                    dayIndex !==
                    editingDayIndex
                  ) {
                    return day;
                  }

                  return {
                    ...day,

                    exercises:
                      cleanExercises,
                  };
                }
              );

            return {
              ...microcycle,

              days:
                updatedDays,
            };
          }
        );

      await supabaseApi.entities.WorkoutProgram.update(
        program.id,
        {
          microcycles:
            updatedMicrocycles,

          /*
           * This is the key addition that makes the editor
           * actually contribute to adaptive programming.
           */
          adaptation_history:
            adaptationHistory,
        }
      );

      setEditingDayIndex(
        null
      );

      setEditingExercises(
        []
      );

      /*
       * Reload so Program and Live Workout both read
       * the newly saved program and the new adaptation history.
       */
      window.location.reload();
    } catch (error) {
      console.error(
        '[WeeklyPlan] Failed to save workout edits:',
        error
      );

      window.alert(
        error?.message ||
          'Unable to save your workout changes.'
      );

      setSavingEdit(
        false
      );
    }
  };

  return (
    <div className="space-y-4">

      {/* ======================================================
          WEEK SELECTOR
          ====================================================== */}

      <div className="flex items-center justify-between">

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={
            selectedWeek <= 1
          }
          onClick={() =>
            setSelectedWeek(
              (week) =>
                week - 1
            )
          }
          aria-label="Previous week"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <div className="text-center flex-1">

          <div className="flex items-center justify-center gap-2">

            <p className="font-heading font-bold text-lg">
              Week {selectedWeek}
            </p>

            {selectedWeek ===
              currentWeek && (
              <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold border border-primary/20">
                Current
              </span>
            )}

            {isFutureWeek && (
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Eye className="w-2.5 h-2.5" />
                Preview
              </span>
            )}

          </div>

          <div className="flex items-center justify-center gap-2 mt-0.5">

            {mesocycleName && (
              <p className="text-xs text-muted-foreground">
                {mesocycleName}
              </p>
            )}

            {weekTypeCfg && (
              <span
                className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                  weekTypeCfg.color
                )}
              >
                {weekTypeCfg.label}
              </span>
            )}

          </div>

        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={
            selectedWeek >=
            totalWeeks
          }
          onClick={() =>
            setSelectedWeek(
              (week) =>
                week + 1
            )
          }
          aria-label="Next week"
        >
          <ChevronRight className="w-5 h-5" />
        </Button>

      </div>


      {/* ======================================================
          PROGRESS BAR ACROSS WEEKS
          ====================================================== */}

      <div className="flex gap-0.5 items-end h-4">

        {Array.from(
          {
            length:
              Number(
                totalWeeks
              ) || 12,
          },
          (_, index) => {

            const weekNumber =
              index + 1;

            const micro =
              allWeeks.find(
                (item) =>
                  Number(
                    item?.week_number
                  ) ===
                  weekNumber
              );

            const weekType =
              String(
                micro?.week_type ||
                  ''
              ).toLowerCase();

            const isDeload =
              weekType.includes(
                'deload'
              ) ||
              weekType.includes(
                'taper'
              );

            const isPast =
              weekNumber <
              currentWeek;

            const isCurrent =
              weekNumber ===
              currentWeek;

            const isSelected =
              weekNumber ===
              selectedWeek;

            return (
              <button
                key={
                  weekNumber
                }
                type="button"
                onClick={() =>
                  setSelectedWeek(
                    weekNumber
                  )
                }
                className={cn(
                  'flex-1 rounded-sm transition-all hover:opacity-80',
                  isDeload
                    ? 'h-2'
                    : 'h-4',
                  isSelected
                    ? 'bg-primary'
                    : isPast
                      ? 'bg-primary/40'
                      : isCurrent
                        ? 'bg-primary/70'
                        : 'bg-muted/60'
                )}
                title={
                  micro?.week_type
                    ? `Week ${weekNumber} — ${micro.week_type}`
                    : `Week ${weekNumber}`
                }
                aria-label={`Week ${weekNumber}`}
              />
            );
          }
        )}

      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground -mt-2 px-0.5">
        <span>Wk 1</span>

        <span>
          Wk {
            Math.ceil(
              Number(
                totalWeeks
              ) / 2
            )
          }
        </span>

        <span>
          Wk {totalWeeks}
        </span>
      </div>


      {/* ======================================================
          NO DATA
          ====================================================== */}

      {!currentMicrocycle && (
        <Card className="p-6 text-center border-dashed">

          <Eye className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />

          <p className="font-heading font-bold text-sm">
            Week {selectedWeek} Not Yet Generated
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            This week's plan will be personalized based on your
            program and workout history.
          </p>

        </Card>
      )}


      {/* ======================================================
          FUTURE WEEK
          ====================================================== */}

      {currentMicrocycle &&
        isFutureWeek && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border/60">

            <Eye className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />

            <p className="text-xs text-muted-foreground leading-relaxed">

              <span className="font-semibold text-foreground/70">
                Estimated plan.
              </span>{' '}

              These workouts are your projected baseline.
              Live workout tracking remains available.

            </p>

          </div>
        )}


      {/* ======================================================
          DAYS
          ====================================================== */}

      {currentMicrocycle && (
        <div className="space-y-3">

          {(currentMicrocycle.days || []).map(
            (
              day,
              dayIndex
            ) => {

              const exercises =
                getExercises(
                  day
                );

              const isRestDay =
                exercises.length ===
                0;

              const estimatedMinutes =
                getEstimatedMinutes(
                  exercises
                );

              return (
                <Card
                  key={
                    `${selectedWeek}-${dayIndex}`
                  }
                  className={cn(
                    'overflow-hidden transition-all',
                    isRestDay
                      ? 'opacity-60 border-dashed'
                      : 'border-border hover:border-primary/40'
                  )}
                >

                  {/* ==================================================
                      DAY HEADER
                      ================================================== */}

                  <div className="p-4">

                    <div className="flex items-start justify-between gap-3">

                      <div className="flex-1 min-w-0">

                        <p className="font-heading font-bold">
                          {day?.day_name ||
                            `Day ${dayIndex + 1}`}
                        </p>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">

                          {day?.workout_type && (
                            <WorkoutTypeTag
                              workoutType={
                                day.workout_type
                              }
                            />
                          )}

                          {!isRestDay && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">

                              <Dumbbell className="w-3 h-3" />

                              {exercises.length}{' '}

                              {exercises.length ===
                              1
                                ? 'exercise'
                                : 'exercises'}

                            </span>
                          )}

                        </div>

                      </div>

                      <div className="text-right flex-shrink-0">

                        {isRestDay ? (

                          <p className="text-xs text-muted-foreground font-medium">
                            Rest
                          </p>

                        ) : (

                          <p className="text-xs text-muted-foreground flex items-center gap-1">

                            <Clock className="w-3 h-3" />

                            ~{estimatedMinutes} min

                          </p>

                        )}

                      </div>

                    </div>


                    {/* ==================================================
                        PROGRESS+ EDITING
                        ================================================== */}

                    {!isRestDay &&
                      canEditWorkouts && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full mt-3 gap-2"
                          onClick={() =>
                            openWorkoutEditor(
                              dayIndex,
                              day
                            )
                          }
                        >

                          <Edit3 className="w-3.5 h-3.5" />

                          Edit Workout

                        </Button>
                      )}

                  </div>


                  {/* ==================================================
                      EXERCISE LIST
                      ================================================== */}

                  {!isRestDay && (
                    <div className="border-t border-border/60 px-4 py-3 bg-muted/20">

                      <div className="space-y-2">

                        {exercises.map(
                          (
                            exercise,
                            exerciseIndex
                          ) => {

                            const rest =
                              formatRest(
                                exercise?.rest_seconds
                              );

                            return (
                              <div
                                key={
                                  `${exerciseIndex}-${exercise?.name || 'exercise'}`
                                }
                                className="flex items-start gap-3"
                              >

                                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">

                                  <span className="text-[10px] font-bold text-primary">
                                    {exerciseIndex + 1}
                                  </span>

                                </div>

                                <div className="flex-1 min-w-0">

                                  <p className="text-sm font-medium leading-tight">
                                    {exercise?.name ||
                                      `Exercise ${exerciseIndex + 1}`}
                                  </p>

                                  <div className="flex items-center gap-3 mt-1 flex-wrap">

                                    {exercise?.sets !==
                                      undefined && (
                                      <span className="text-[11px] text-muted-foreground">
                                        {exercise.sets}{' '}
                                        sets
                                      </span>
                                    )}

                                    {exercise?.reps && (
                                      <span className="text-[11px] text-muted-foreground">
                                        ×{' '}
                                        {exercise.reps}
                                      </span>
                                    )}

                                    {rest && (
                                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">

                                        <Timer className="w-3 h-3" />

                                        {rest}

                                      </span>
                                    )}

                                  </div>

                                </div>

                                <CheckCircle2 className="w-4 h-4 text-muted-foreground/30 flex-shrink-0 mt-1" />

                              </div>
                            );
                          }
                        )}

                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full mt-3 text-primary hover:text-primary"
                        onClick={() =>
                          navigate(
                            `/program/day/${dayIndex}`,
                            {
                              state: {
                                week:
                                  selectedWeek,
                              },
                            }
                          )
                        }
                      >

                        View Full Workout

                        <ChevronRight className="w-4 h-4 ml-1" />

                      </Button>

                    </div>
                  )}

                </Card>
              );
            }
          )}

        </div>
      )}


      {/* ======================================================
          WORKOUT EDITOR
          ====================================================== */}

      {editingDayIndex !==
        null && (

        <div
          className="
            fixed
            inset-0
            z-[1000]
            bg-black/60
            backdrop-blur-sm
            flex
            items-end
            sm:items-center
            justify-center
            p-0
            sm:p-4
          "
          role="dialog"
          aria-modal="true"
          aria-label="Edit Workout"
        >

          <section
            className="
              relative
              flex
              flex-col
              w-full
              max-w-2xl
              max-h-[calc(100dvh-0.5rem)]
              sm:max-h-[90vh]
              overflow-hidden
              rounded-t-3xl
              sm:rounded-2xl
              border
              border-border
              bg-card
              shadow-2xl
            "
          >

            {/* ==================================================
                EDITOR HEADER
                ================================================== */}

            <header
              className="
                shrink-0
                flex
                items-center
                justify-between
                gap-3
                px-5
                py-4
                border-b
                border-border
              "
            >

              <div className="min-w-0">

                <h2 className="font-heading font-bold text-lg">
                  Edit Workout
                </h2>

                <p className="text-xs text-muted-foreground mt-1">
                  Customize your workout. Kael will learn from
                  your changes and use repeated preferences in
                  future programming.
                </p>

              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={
                  savingEdit
                }
                onClick={
                  closeWorkoutEditor
                }
                aria-label="Close editor"
              >

                <X className="w-5 h-5" />

              </Button>

            </header>


            {/* ==================================================
                EDITOR BODY
                ================================================== */}

            <div
              className="
                flex-1
                min-h-0
                overflow-y-auto
                overscroll-contain
                px-5
                py-4
                space-y-4
              "
            >

              {editingExercises.map(
                (
                  exercise,
                  index
                ) => (

                  <Card
                    key={
                      index
                    }
                    className="p-4 space-y-3"
                  >

                    <div className="flex items-center justify-between">

                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Exercise {index + 1}
                      </p>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={
                          savingEdit ||
                          editingExercises.length <=
                            1
                        }
                        onClick={() =>
                          removeEditingExercise(
                            index
                          )
                        }
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remove exercise ${index + 1}`}
                      >

                        <Trash2 className="w-4 h-4" />

                      </Button>

                    </div>


                    {/* Exercise name */}

                    <div>

                      <label className="block text-[11px] text-muted-foreground mb-1">
                        Exercise Name
                      </label>

                      <Input
                        value={
                          exercise.name
                        }
                        disabled={
                          savingEdit
                        }
                        onChange={(
                          event
                        ) =>
                          updateEditingExercise(
                            index,
                            'name',
                            event.target.value
                          )
                        }
                      />

                    </div>


                    {/* Sets / Reps / Rest */}

                    <div className="grid grid-cols-3 gap-2">

                      <div>

                        <label className="block text-[11px] text-muted-foreground mb-1">
                          Sets
                        </label>

                        <Input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={
                            exercise.sets
                          }
                          disabled={
                            savingEdit
                          }
                          onChange={(
                            event
                          ) =>
                            updateEditingExercise(
                              index,
                              'sets',
                              event.target.value
                            )
                          }
                        />

                      </div>

                      <div>

                        <label className="block text-[11px] text-muted-foreground mb-1">
                          Reps / Time
                        </label>

                        <Input
                          value={
                            exercise.reps
                          }
                          disabled={
                            savingEdit
                          }
                          onChange={(
                            event
                          ) =>
                            updateEditingExercise(
                              index,
                              'reps',
                              event.target.value
                            )
                          }
                        />

                      </div>

                      <div>

                        <label className="block text-[11px] text-muted-foreground mb-1">
                          Rest (sec)
                        </label>

                        <Input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={
                            exercise.rest_seconds
                          }
                          disabled={
                            savingEdit
                          }
                          onChange={(
                            event
                          ) =>
                            updateEditingExercise(
                              index,
                              'rest_seconds',
                              event.target.value
                            )
                          }
                        />

                      </div>

                    </div>


                    {/* Notes */}

                    <div>

                      <label className="block text-[11px] text-muted-foreground mb-1">
                        Notes
                      </label>

                      <Input
                        value={
                          exercise.notes
                        }
                        disabled={
                          savingEdit
                        }
                        onChange={(
                          event
                        ) =>
                          updateEditingExercise(
                            index,
                            'notes',
                            event.target.value
                          )
                        }
                        placeholder="Optional"
                      />

                    </div>


                    {/* Activation cue */}

                    <div>

                      <label className="block text-[11px] text-muted-foreground mb-1">
                        Activation Cue
                      </label>

                      <Input
                        value={
                          exercise.activation_cue
                        }
                        disabled={
                          savingEdit
                        }
                        onChange={(
                          event
                        ) =>
                          updateEditingExercise(
                            index,
                            'activation_cue',
                            event.target.value
                          )
                        }
                        placeholder="Optional"
                      />

                    </div>

                  </Card>

                )
              )}


              {/* Add exercise */}

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 gap-2"
                disabled={
                  savingEdit
                }
                onClick={
                  addEditingExercise
                }
              >

                <Plus className="w-4 h-4" />

                Add Exercise

              </Button>

              <div className="h-2" />

            </div>


            {/* ==================================================
                EDITOR FOOTER
                ================================================== */}

            <footer
              className="
                shrink-0
                border-t
                border-border
                bg-card
                px-5
                pt-3
              "
              style={{
                paddingBottom:
                  'max(0.875rem, env(safe-area-inset-bottom))',
              }}
            >

              <Button
                type="button"
                className="w-full h-12 font-heading font-semibold gap-2"
                disabled={
                  savingEdit
                }
                onClick={
                  saveWorkoutEdits
                }
              >

                {savingEdit ? (
                  <>

                    <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />

                    Saving Workout…

                  </>
                ) : (
                  <>

                    <Save className="w-4 h-4" />

                    Save Workout

                  </>
                )}

              </Button>

            </footer>

          </section>

        </div>
      )}

    </div>
  );
}
