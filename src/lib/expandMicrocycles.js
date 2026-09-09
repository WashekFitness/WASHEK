/**
 * Safely normalizes workout-program microcycle data.
 *
 * The AI generator can return arrays, objects, JSON strings, null values,
 * or slightly different field shapes. This file converts all of those
 * possibilities into one predictable structure for the UI.
 */

function safeParse(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

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
  const parsed = safeParse(value, []);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    // Sometimes APIs return { items: [...] }
    if (Array.isArray(parsed.items)) {
      return parsed.items;
    }

    if (Array.isArray(parsed.data)) {
      return parsed.data;
    }

    if (Array.isArray(parsed.microcycles)) {
      return parsed.microcycles;
    }

    // A single object can represent one item.
    return [parsed];
  }

  return [];
}

function asObject(value) {
  const parsed = safeParse(value, {});

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed;
  }

  return {};
}

function safeNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return fallback;
}

function normalizeExercise(exercise, exerciseIndex = 0) {
  const source = asObject(exercise);

  return {
    id:
      source.id ??
      source.exercise_id ??
      `exercise-${exerciseIndex}`,

    name:
      safeString(
        source.name ??
          source.exercise_name ??
          source.title ??
          source.exercise,
        "Exercise"
      ),

    sets: safeNumber(
      source.sets ??
        source.set_count ??
        source.number_of_sets,
      0
    ),

    reps: safeString(
      source.reps ??
        source.rep_range ??
        source.repetitions,
      ""
    ),

    rest_seconds: safeNumber(
      source.rest_seconds ??
        source.rest ??
        source.rest_time,
      0
    ),

    notes: safeString(
      source.notes ??
        source.description ??
        source.instructions,
      ""
    ),

    activation_cue: safeString(
      source.activation_cue ??
        source.activation ??
        source.cue,
      ""
    ),

    tempo: safeString(source.tempo, ""),

    weight: safeString(
      source.weight ??
        source.load,
      ""
    ),

    rpe: safeString(source.rpe, ""),

    rir: safeString(source.rir, "")
  };
}

function normalizeDay(day, dayIndex = 0) {
  const source = asObject(day);

  const exercises = asArray(
    source.exercises ??
      source.workout ??
      source.exercise_list
  ).map((exercise, index) =>
    normalizeExercise(exercise, index)
  );

  return {
    id:
      source.id ??
      `day-${dayIndex}`,

    day_index: dayIndex,

    day_name:
      safeString(
        source.day_name ??
          source.name ??
          source.day ??
          source.title,
        `Day ${dayIndex + 1}`
      ),

    workout_type:
      safeString(
        source.workout_type ??
          source.type ??
          source.focus,
        "Training"
      ),

    description:
      safeString(
        source.description ??
          source.overview ??
          source.notes,
        ""
      ),

    duration_minutes: safeNumber(
      source.duration_minutes ??
        source.duration ??
        source.estimated_duration,
      0
    ),

    exercises
  };
}

function normalizeMicrocycle(microcycle, index = 0) {
  const source = asObject(microcycle);

  const days = asArray(
    source.days ??
      source.workout_days ??
      source.sessions
  ).map((day, dayIndex) =>
    normalizeDay(day, dayIndex)
  );

  return {
    id:
      source.id ??
      `week-${index + 1}`,

    week_number:
      safeNumber(
        source.week_number ??
          source.week ??
          source.weekNumber,
        index + 1
      ),

    mesocycle_index: safeNumber(
      source.mesocycle_index ??
        source.mesocycleIndex,
      0
    ),

    week_type:
      safeString(
        source.week_type ??
          source.type ??
          source.phase,
        "Training"
      ),

    focus:
      safeString(
        source.focus ??
          source.overview ??
          source.description,
        ""
      ),

    days
  };
}

/**
 * Returns a normalized array of microcycles.
 *
 * Supports:
 *   expandMicrocycles(program)
 *   expandMicrocycles(program.microcycles)
 */
export function expandMicrocycles(input) {
  try {
    let raw = input;

    if (
      input &&
      typeof input === "object" &&
      !Array.isArray(input) &&
      (
        "microcycles" in input ||
        "weeks" in input ||
        "workout_weeks" in input
      )
    ) {
      raw =
        input.microcycles ??
        input.weeks ??
        input.workout_weeks;
    }

    return asArray(raw).map((microcycle, index) =>
      normalizeMicrocycle(microcycle, index)
    );
  } catch (error) {
    console.error(
      "expandMicrocycles failed:",
      error
    );

    return [];
  }
}

export function normalizeWorkoutProgram(program) {
  try {
    const source = asObject(program);

    const microcycles = expandMicrocycles(
      source.microcycles
    );

    const mesocycles = asArray(
      source.mesocycles
    );

    const macrocycle = asObject(
      source.macrocycle
    );

    return {
      ...source,

      program_name:
        safeString(
          source.program_name ??
            source.name ??
            source.title,
          "My Workout Program"
        ),

      duration_weeks: safeNumber(
        source.duration_weeks ??
          source.duration ??
          microcycles.length,
        microcycles.length || 1
      ),

      current_week: safeNumber(
        source.current_week,
        1
      ),

      status:
        safeString(
          source.status,
          "active"
        ),

      training_type:
        safeString(
          source.training_type,
          ""
        ),

      fitness_level:
        safeString(
          source.fitness_level,
          ""
        ),

      goal:
        safeString(
          source.goal,
          ""
        ),

      macrocycle,

      mesocycles,

      microcycles
    };
  } catch (error) {
    console.error(
      "normalizeWorkoutProgram failed:",
      error
    );

    return {
      program_name: "My Workout Program",
      duration_weeks: 1,
      current_week: 1,
      status: "active",
      training_type: "",
      fitness_level: "",
      goal: "",
      macrocycle: {},
      mesocycles: [],
      microcycles: []
    };
  }
}

export default expandMicrocycles;
