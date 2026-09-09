import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseApi } from '@/lib/supabaseApi';
import { canAccess } from '@/lib/subscription';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ChevronLeft,
  CheckCircle2,
  Circle,
  Timer,
  Dumbbell,
  SkipForward,
  Plus,
  Minus,
  Sparkles,
  Zap,
  RotateCcw,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSettings } from '@/lib/AppSettingsContext';
import { toast } from 'sonner';

// ─── Timer ─────────────────────────────────────────────
function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(ref.current);
    }

    return () => clearInterval(ref.current);
  }, [running]);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return { seconds, running, setRunning, fmt };
}

function RestTimer({ seconds: restSecs, onDone }) {
  const [left, setLeft] = useState(restSecs);
  const onDoneRef = useRef(onDone);

  onDoneRef.current = onDone;

  useEffect(() => {
    if (restSecs <= 0) {
      onDoneRef.current();
      return;
    }

    const start = Date.now();
    const initial = restSecs;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = initial - elapsed;

      if (remaining <= 0) {
        clearInterval(interval);
        setLeft(0);
        onDoneRef.current();
      } else {
        setLeft(remaining);
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
        Rest
      </p>

      <p className="font-heading text-6xl font-bold text-primary">
        {left}s
      </p>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onDoneRef.current()}
      >
        Skip Rest
      </Button>
    </div>
  );
}

// ─── Movement Baseline ─────────────────────────────────
const CALISTHENICS_MOVEMENTS = [
  { key: 'push_ups', label: 'Push Ups', unit: 'reps' },
  { key: 'pull_ups', label: 'Pull Ups', unit: 'reps' },
  { key: 'dips', label: 'Dips', unit: 'reps' },
  { key: 'squats', label: 'Squats', unit: 'reps' },
  { key: 'pistol_squats', label: 'Pistol Squats', unit: 'reps' },
  { key: 'muscle_ups', label: 'Muscle Ups', unit: 'reps' },
  { key: 'dragon_flags', label: 'Dragon Flags', unit: 'reps' },
  { key: 'toes_to_bar', label: 'Toes to Bar', unit: 'reps' },
  { key: 'ring_dips', label: 'Ring Dips', unit: 'reps' },
  { key: 'ring_push_ups', label: 'Ring Push Ups', unit: 'reps' },
  {
    key: 'handstand_hold_seconds',
    label: 'Handstand Hold',
    unit: 'seconds',
  },
  {
    key: 'l_sit_hold_seconds',
    label: 'L-Sit Hold',
    unit: 'seconds',
  },
  {
    key: 'front_lever_hold_seconds',
    label: 'Front Lever Hold',
    unit: 'seconds',
  },
  {
    key: 'back_lever_hold_seconds',
    label: 'Back Lever Hold',
    unit: 'seconds',
  },
  {
    key: 'planche_hold_seconds',
    label: 'Planche Hold',
    unit: 'seconds',
  },
  {
    key: 'human_flag_hold_seconds',
    label: 'Human Flag Hold',
    unit: 'seconds',
  },
];

const WEIGHT_MOVEMENTS = [
  { key: 'bench_press_1rm', label: 'Bench Press' },
  { key: 'back_squat_1rm', label: 'Back Squat' },
  { key: 'deadlift_1rm', label: 'Deadlift' },
  { key: 'overhead_press_1rm', label: 'Overhead Press' },
  { key: 'barbell_row_1rm', label: 'Barbell Row' },
  { key: 'front_squat_1rm', label: 'Front Squat' },
  { key: 'romanian_deadlift_1rm', label: 'Romanian Deadlift' },
  { key: 'push_press_1rm', label: 'Push Press' },
  { key: 'power_clean_1rm', label: 'Power Clean' },
  { key: 'hip_thrust_1rm', label: 'Hip Thrust' },
];

const WEIGHTED_CALI_MOVEMENTS = [
  { key: 'weighted_pull_up_lbs', label: 'Weighted Pull-Up' },
  { key: 'weighted_dip_lbs', label: 'Weighted Dip' },
  { key: 'weighted_push_up_lbs', label: 'Weighted Push-Up' },
  { key: 'weighted_squat_lbs', label: 'Weighted Squat' },
];

const ALL_BASELINE_MOVEMENTS = [
  ...CALISTHENICS_MOVEMENTS,
  ...WEIGHT_MOVEMENTS,
  ...WEIGHTED_CALI_MOVEMENTS,
];

function baselineHasCalisthenics(tt) {
  if (!tt) return true;

  return (
    tt === 'calisthenics' ||
    tt === 'weighted_calisthenics' ||
    tt === 'hybrid'
  );
}

function baselineHasWeights(tt) {
  return tt === 'weights' || tt === 'hybrid';
}

function baselineHasWeightedCali(tt) {
  return tt === 'weighted_calisthenics' || tt === 'hybrid';
}

function MovementInput({ label, unit, value, onChange }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3">
      <p className="text-xs text-muted-foreground mb-1">
        {label}
      </p>

      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="0"
          className="h-9 text-sm"
        />

        {unit && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function MovementBaseline({ trainingType }) {
  const queryClient = useQueryClient();
  const { settings } = useAppSettings();

  const today = new Date().toISOString().split('T')[0];

  const [values, setValues] = useState({});
  const [customEntries, setCustomEntries] = useState([]);
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomVal, setNewCustomVal] = useState('');
  const [saving, setSaving] = useState(false);

  const showCalisthenics = baselineHasCalisthenics(trainingType);
  const showWeights = baselineHasWeights(trainingType);
  const showWeightedCali = baselineHasWeightedCali(trainingType);

  const weightUnit =
    settings?.unit === 'metric' ? 'kg' : 'lbs';

  const { data: baselines = [] } = useQuery({
    queryKey: ['baselines'],
    queryFn: () =>
      supabaseApi.entities.MovementBaseline.list(
        '-recorded_date',
        1
      ),
  });

  useEffect(() => {
    if (baselines[0]) {
      const b = baselines[0];
      const v = {};

      ALL_BASELINE_MOVEMENTS.forEach(m => {
        if (b[m.key] != null) {
          v[m.key] = b[m.key];
        }
      });

      setValues(v);

      if (b.custom_entries) {
        setCustomEntries(b.custom_entries);
      }
    }
  }, [baselines]);

  const saveBaseline = async () => {
    setSaving(true);

    const data = {
      recorded_date: today,
      custom_entries: customEntries,
    };

    ALL_BASELINE_MOVEMENTS.forEach(m => {
      if (values[m.key]) {
        data[m.key] = parseFloat(values[m.key]);
      }
    });

    if (baselines[0]?.recorded_date === today) {
      await supabaseApi.entities.MovementBaseline.update(
        baselines[0].id,
        data
      );
    } else {
      await supabaseApi.entities.MovementBaseline.create(data);
    }

    queryClient.invalidateQueries({
      queryKey: ['baselines'],
    });

    toast.success(
      'Baseline saved! Kael will use this to adjust your workouts.'
    );

    setSaving(false);
  };

  const addCustom = () => {
    if (!newCustomName.trim()) return;

    setCustomEntries(prev => [
      ...prev,
      {
        name: newCustomName.trim(),
        value: newCustomVal.trim(),
      },
    ]);

    setNewCustomName('');
    setNewCustomVal('');
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="bg-muted/40 rounded-2xl p-4 border border-border">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Log your current maxes here. This{' '}
          <strong>doesn't affect your live workout</strong> — it's
          just so Kael knows where you're at and can program
          smarter.
        </p>
      </div>

      {showCalisthenics && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Calisthenics Maxes
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {CALISTHENICS_MOVEMENTS.map(
              ({ key, label, unit }) => (
                <MovementInput
                  key={key}
                  label={label}
                  unit={unit}
                  value={values[key]}
                  onChange={v =>
                    setValues(prev => ({
                      ...prev,
                      [key]: v,
                    }))
                  }
                />
              )
            )}
          </div>
        </div>
      )}

      {showWeights && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Weight PRs (1RM)
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {WEIGHT_MOVEMENTS.map(({ key, label }) => (
              <MovementInput
                key={key}
                label={label}
                unit={weightUnit}
                value={values[key]}
                onChange={v =>
                  setValues(prev => ({
                    ...prev,
                    [key]: v,
                  }))
                }
              />
            ))}
          </div>
        </div>
      )}

      {showWeightedCali && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Weighted Calisthenics PRs (Max Added Weight)
          </h3>

          <div className="grid grid-cols-2 gap-3">
            {WEIGHTED_CALI_MOVEMENTS.map(
              ({ key, label }) => (
                <MovementInput
                  key={key}
                  label={label}
                  unit={weightUnit}
                  value={values[key]}
                  onChange={v =>
                    setValues(prev => ({
                      ...prev,
                      [key]: v,
                    }))
                  }
                />
              )
            )}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold">
          Custom Movement
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="e.g. Typewriter Pull Up"
            value={newCustomName}
            onChange={e =>
              setNewCustomName(e.target.value)
            }
            className="h-9 text-sm flex-1"
          />

          <Input
            placeholder="e.g. 3 reps"
            value={newCustomVal}
            onChange={e =>
              setNewCustomVal(e.target.value)
            }
            className="h-9 text-sm w-28"
          />

          <Button
            size="sm"
            variant="outline"
            onClick={addCustom}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {customEntries.map((c, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-sm"
          >
            <span>{c.name}</span>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {c.value}
              </span>

              <button
                onClick={() =>
                  setCustomEntries(prev =>
                    prev.filter((_, j) => j !== i)
                  )
                }
                className="text-destructive hover:text-destructive/80"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Button
        className="w-full h-12 font-heading font-semibold"
        onClick={saveBaseline}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save My Baseline'}
      </Button>
    </div>
  );
}

// ─── Elite Live Adjustment ──────────────────────────────
function LiveAdjustmentPanel({
  exercise,
  exerciseIndex,
  setIndex,
  totalSets,
  repsAchieved,
  completedSets,
  trainingType,
  seconds,
  onApply,
  disabled,
}) {
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastAdjustment, setLastAdjustment] =
    useState('');

  const completedCount = Array.from({
    length: totalSets,
  }).filter(
    (_, si) =>
      completedSets[`${exerciseIndex}-${si}`]
  ).length;

  const requestAdjustment = async () => {
    if (!exercise || loading || disabled) return;

    setLoading(true);
    setLastAdjustment('');

    try {
      const typeLabel = {
        calisthenics: 'calisthenics',
        weighted_calisthenics: 'weighted calisthenics',
        weights: 'weight training',
        hybrid: 'hybrid training',
      }[trainingType] || 'fitness';

      const prompt = `You are Kael, an elite ${typeLabel} coach providing REAL-TIME coaching during an active workout.

The athlete is currently performing:
${JSON.stringify(exercise, null, 2)}

CURRENT POSITION:
- Exercise number: ${exerciseIndex + 1}
- Current set: ${setIndex + 1} of ${totalSets}
- Sets already completed for this exercise: ${completedCount}
- Actual reps recorded so far: ${repsAchieved || 'not entered'}
- Workout time elapsed: ${Math.floor(seconds / 60)} minutes
- Athlete feedback: "${feedback.trim() || 'No written feedback. Assess the current programmed exercise and provide the most appropriate next-step adjustment.'}"

Your job is to make an immediate, practical adjustment to THIS exercise for the sets the athlete has not completed yet.

RULES:
1. Do not change completed sets.
2. Preserve the movement's purpose unless the athlete's feedback indicates that a substitution is necessary.
3. If the exercise feels too easy and performance is strong, increase the challenge appropriately through reps, sets, load, tempo, or a harder variation.
4. If the exercise feels too hard, fatigue is accumulating, technique is breaking down, or the athlete reports pain/tightness, reduce the training demand or substitute a safer appropriate variation.
5. Do not encourage training through significant pain.
6. Do not diagnose injuries or medical conditions.
7. Keep the adjustment realistic for the athlete's training type.
8. If the athlete reports concerning symptoms, prioritize stopping the movement and seeking appropriate medical evaluation.
9. Do not make dramatic changes without a reason.
10. The adjusted sets must be at least the number of sets already completed so the tracker remains consistent.
11. Give a concise explanation of exactly what changed and why.
12. Preserve the activation cue whenever possible, but improve it if the current cue is not useful.

Return ONLY JSON:
{
  "adjusted_exercise": {
    "name": "string",
    "sets": number,
    "reps": "string",
    "rest_seconds": number,
    "notes": "string",
    "activation_cue": "string"
  },
  "adjustment_summary": "short explanation",
  "safety_note": "short safety note or empty string"
}`;

      const result = await supabaseApi.ai.invoke({
        type: 'live_workout_adjustment',
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            adjusted_exercise: {
              type: 'object',
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
            adjustment_summary: {
              type: 'string',
            },
            safety_note: {
              type: 'string',
            },
          },
          required: [
            'adjusted_exercise',
            'adjustment_summary',
            'safety_note',
          ],
        },
      });

      if (!result?.adjusted_exercise) {
        throw new Error(
          'Kael did not return a valid adjustment.'
        );
      }

      const adjusted = {
        ...exercise,
        ...result.adjusted_exercise,
        sets: Math.max(
          completedCount,
          Number(result.adjusted_exercise.sets) ||
            totalSets
        ),
        rest_seconds:
          Number(result.adjusted_exercise.rest_seconds) ||
          exercise.rest_seconds ||
          60,
      };

      onApply(adjusted);

      const summary =
        result.adjustment_summary ||
        'Kael adjusted the exercise based on your current performance.';

      setLastAdjustment(
        result.safety_note
          ? `${summary} ${result.safety_note}`
          : summary
      );

      setFeedback('');

      toast.success('Kael adjusted your workout in real time.');
    } catch (error) {
      console.error(
        'Live workout adjustment failed:',
        error
      );

      toast.error(
        error?.message ||
          'Kael could not adjust this exercise right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 border border-chart-4/30 bg-chart-4/5 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-chart-4" />

        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-chart-4">
            Elite Live Adjustment
          </p>

          <p className="text-[11px] text-muted-foreground mt-0.5">
            Tell Kael what you're feeling and he'll adjust the
            remaining work now.
          </p>
        </div>

        <Badge
          variant="outline"
          className="text-[9px] border-chart-4/30 text-chart-4"
        >
          ELITE
        </Badge>
      </div>

      <Textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder='e.g. "This feels too easy" or "My shoulder is getting tight" or "I barely hit the target reps."'
        className="min-h-[72px] text-xs resize-none bg-background/60"
        disabled={loading || disabled}
      />

      <Button
        type="button"
        className="w-full h-10 font-heading font-semibold"
        onClick={requestAdjustment}
        disabled={loading || disabled}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            Kael is adjusting...
          </span>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" />
            Adjust This Exercise
          </>
        )}
      </Button>

      {lastAdjustment && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-background/70 border border-chart-4/20">
          <MessageSquare className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-chart-4 mb-1">
              Kael's Adjustment
            </p>

            <p className="text-xs leading-relaxed">
              {lastAdjustment}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Post Workout Checkin ──────────────────────────────
function PostWorkoutCheckin({
  log,
  onSave,
  canAdjust,
  program,
  onProgramUpdated,
}) {
  const [checkin, setCheckin] = useState('');
  const [aiNote, setAiNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!checkin.trim()) return;

    setLoading(true);

    try {
      const exerciseSummary = (
        log?.exercises_completed || []
      )
        .map(
          e =>
            `${e.name}: ${e.sets_completed} sets, ${e.reps_achieved} reps`
        )
        .join('\n');

      if (canAdjust && program) {
        const currentWeek = program.current_week || 1;

        const nextMicrocycle =
          program.microcycles?.find(
            m => m.week_number === currentWeek + 1
          ) || null;

        const trainingType =
          program?.training_type || 'calisthenics';

        const typeLabel = {
          calisthenics: 'calisthenics',
          weighted_calisthenics:
            'weighted calisthenics',
          weights: 'weight training',
          hybrid: 'hybrid training',
        }[trainingType];

        const elitePrompt = `You are Kael, an elite ${typeLabel} coach. An athlete just finished a workout and gave you feedback.

POST-WORKOUT FEEDBACK:
"${checkin}"

EXERCISES COMPLETED TODAY:
${exerciseSummary}

CURRENT WEEK:
${currentWeek}

NEXT WEEK'S PROGRAM TO ADJUST:
${
  nextMicrocycle
    ? JSON.stringify(
        nextMicrocycle.days?.find(
          d => d.day_name === log?.day_name
        ) ||
          nextMicrocycle.days?.[0],
        null,
        2
      )
    : 'No next week programmed yet.'
}

Based on the athlete's feedback AND their actual reps/sets completed today:

1. Give a 1-2 sentence direct human response.
2. If performance was strong, recommend specific progressions for next week.
3. If performance was poor, fatigue was high, or pain was reported, reduce training stress appropriately.
4. Return the adjusted exercises array for next week's same day.
5. Preserve activation cues and useful coaching notes.
6. Do not diagnose injuries or medical conditions.

Respond in JSON:
{
  "coach_response": "...",
  "adjustments_summary": "...",
  "adjusted_exercises": [
    {
      "name": "...",
      "sets": 0,
      "reps": "...",
      "rest_seconds": 0,
      "notes": "...",
      "activation_cue": "..."
    }
  ]
}`;

        const result = await supabaseApi.ai.invoke({
          type: 'live_workout_adjustment',
          prompt: elitePrompt,
          response_json_schema: {
            type: 'object',
            properties: {
              coach_response: {
                type: 'string',
              },
              adjustments_summary: {
                type: 'string',
              },
              adjusted_exercises: {
                type: 'array',
                items: {
                  type: 'object',
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
                },
              },
            },
          },
        });

        const note = `${result.coach_response}\n\n📋 Next workout adjusted: ${result.adjustments_summary}`;

        setAiNote(note);

        await onSave(checkin, note);

        if (
          nextMicrocycle &&
          result.adjusted_exercises?.length > 0
        ) {
          const updatedMicrocycles =
            program.microcycles.map(mc => {
              if (
                mc.week_number !==
                currentWeek + 1
              ) {
                return mc;
              }

              const updatedDays = mc.days.map(d => {
                if (
                  d.day_name ===
                  log?.day_name
                ) {
                  return {
                    ...d,
                    exercises:
                      result.adjusted_exercises,
                  };
                }

                return d;
              });

              return {
                ...mc,
                days: updatedDays,
              };
            });

          await supabaseApi.entities.WorkoutProgram.update(
            program.id,
            {
              microcycles: updatedMicrocycles,
            }
          );

          if (onProgramUpdated) {
            onProgramUpdated();
          }
        }
      } else {
        const trainingType =
          program?.training_type || 'calisthenics';

        const typeLabel = {
          calisthenics: 'calisthenics',
          weighted_calisthenics:
            'weighted calisthenics',
          weights: 'weight training',
          hybrid: 'hybrid training',
        }[trainingType];

        const prompt = `You are Kael, a real-talk ${typeLabel} coach. Based on this post-workout check-in, give a SHORT (2-3 sentence) human response and a concrete note on how to adjust the next workout. Sound like a person, not a bot.

Check-in: "${checkin}"

Workout: ${log?.day_name || 'unknown'}

${exerciseSummary}

Respond with:
1. One empathetic/direct sentence.
2. One specific adjustment for next time.`;

        const result = await supabaseApi.ai.invoke({
          type: 'live_workout',
          prompt,
        });

        setAiNote(result);

        await onSave(checkin, result);
      }

      setLoading(false);
      setDone(true);
    } catch (error) {
      console.error(
        'Post-workout check-in failed:',
        error
      );

      toast.error(
        error?.message ||
          'Could not get Kael’s response.'
      );

      setLoading(false);
    }
  };

  if (done) {
    return (
      <Card className="p-4 border-accent/30 bg-accent/5">
        <p className="text-xs font-bold text-accent uppercase tracking-wider mb-2">
          Kael heard you
        </p>

        <p className="text-sm whitespace-pre-line">
          {aiNote}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />

        <p className="font-heading font-bold text-sm">
          Post-Workout Check-in
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        How did it go? Any pain, anything that felt too easy
        or too hard, energy levels — just tell Kael in your
        own words.
      </p>

      <Textarea
        value={checkin}
        onChange={e => setCheckin(e.target.value)}
        placeholder='e.g. "Shoulder felt a bit tight on the dips. Pull-ups felt strong today, could probably do more reps. Pretty gassed by the end."'
        className="min-h-[100px] text-sm resize-none"
      />

      <Button
        className="w-full h-11 font-heading font-semibold"
        onClick={submit}
        disabled={!checkin.trim() || loading}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            Getting Kael's take...
          </span>
        ) : (
          'Send to Kael'
        )}
      </Button>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────
export default function LiveWorkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    seconds,
    running,
    setRunning,
    fmt,
  } = useTimer();

  const [user, setUser] = useState(null);

  const [dayIndex, setDayIndex] = useState(0);
  const [exIndex, setExIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);

  const [resting, setResting] = useState(false);

  const [completedSets, setCompletedSets] =
    useState({});

  const [repsAchieved, setRepsAchieved] =
    useState({});

  const [started, setStarted] = useState(false);
  const [workoutDone, setWorkoutDone] =
    useState(false);

  const [savedLog, setSavedLog] = useState(null);

  // Local live workout copy.
  // This is what Elite real-time adjustments modify.
  const [liveExercises, setLiveExercises] =
    useState([]);

  const [adjustedExerciseIndexes, setAdjustedExerciseIndexes] =
    useState({});

  useEffect(() => {
    supabaseApi.auth.me().then(setUser);
  }, []);

  // iOS back gesture: when workout is done, back navigates
  // to program page.
  useEffect(() => {
    if (!workoutDone) return;

    window.history.pushState(
      { workoutDone },
      ''
    );

    const handler = () =>
      navigate('/program');

    window.addEventListener(
      'popstate',
      handler
    );

    return () =>
      window.removeEventListener(
        'popstate',
        handler
      );
  }, [workoutDone, navigate]);

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: () =>
      supabaseApi.entities.WorkoutProgram.filter(
        { status: 'active' },
        '-created_date',
        1
      ),
  });

  const logMutation = useMutation({
    mutationFn: data =>
      supabaseApi.entities.WorkoutLog.create(data),

    onMutate: async data => {
      await queryClient.cancelQueries({
        queryKey: ['logs'],
      });

      const prev =
        queryClient.getQueryData(['logs']);

      const optimistic = {
        id: `_opt_${Date.now()}`,
        ...data,
      };

      queryClient.setQueryData(
        ['logs'],
        old => [...(old || []), optimistic]
      );

      return { prev };
    },

    onError: (_err, _data, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(
          ['logs'],
          ctx.prev
        );
      }
    },

    onSuccess: log => {
      queryClient.invalidateQueries({
        queryKey: ['logs'],
      });

      setSavedLog(log);
    },
  });

  const updateLogMutation = useMutation({
    mutationFn: ({ id, data }) =>
      supabaseApi.entities.WorkoutLog.update(
        id,
        data
      ),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({
        queryKey: ['logs'],
      });

      const prev =
        queryClient.getQueryData(['logs']);

      queryClient.setQueryData(
        ['logs'],
        old =>
          (old || []).map(l =>
            l.id === id
              ? { ...l, ...data }
              : l
          )
      );

      return { prev };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(
          ['logs'],
          ctx.prev
        );
      }
    },

    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['logs'],
      }),
  });

  const program = programs[0];

  const currentWeekNum =
    program?.current_week || 1;

  const microcycle =
    program?.microcycles?.find(
      m => m.week_number === currentWeekNum
    ) ||
    program?.microcycles?.[0];

  const days = microcycle?.days || [];

  const day = days[dayIndex];

  /*
   * Whenever the selected workout day changes,
   * create a fresh local copy of its exercises.
   *
   * This means Elite can modify the current workout
   * without corrupting the saved program just by
   * pressing the adjustment button.
   */
  useEffect(() => {
    if (!day?.exercises) {
      setLiveExercises([]);
      return;
    }

    setLiveExercises(
      day.exercises.map(ex => ({
        ...ex,
      }))
    );

    setExIndex(0);
    setSetIndex(0);
    setResting(false);
    setAdjustedExerciseIndexes({});
  }, [
    currentWeekNum,
    dayIndex,
    program?.id,
  ]);

  const exercises =
    liveExercises.length > 0
      ? liveExercises
      : day?.exercises || [];

  const exercise = exercises[exIndex];

  const totalSets =
    Math.max(
      1,
      Number(exercise?.sets) || 1
    );

  const restSecs =
    Number(exercise?.rest_seconds) || 60;

  const canAdjust = canAccess(
    user?.subscription_plan,
    'live_workout_adjustments'
  );

  const applyLiveAdjustment = adjusted => {
    setLiveExercises(prev =>
      prev.map((ex, index) =>
        index === exIndex
          ? {
              ...adjusted,
            }
          : ex
      )
    );

    setAdjustedExerciseIndexes(prev => ({
      ...prev,
      [exIndex]: true,
    }));

    /*
     * If Kael changed the number of sets, make sure
     * the current set index is still valid.
     */
    const newSetCount = Math.max(
      1,
      Number(adjusted.sets) || totalSets
    );

    if (setIndex >= newSetCount) {
      setSetIndex(
        Math.max(0, newSetCount - 1)
      );
    }

    setResting(false);
  };

  const markSet = () => {
    if (!exercise) return;

    const key = `${exIndex}-${setIndex}`;

    setCompletedSets(prev => ({
      ...prev,
      [key]: true,
    }));

    if (setIndex + 1 < totalSets) {
      setResting(true);
    } else if (
      exIndex + 1 <
      exercises.length
    ) {
      setExIndex(i => i + 1);
      setSetIndex(0);
      setResting(false);

      toast.success(
        'Next exercise! 🔥'
      );
    } else {
      finishWorkout();
    }
  };

  const afterRest = () => {
    setResting(false);
    setSetIndex(s => s + 1);
  };

  const finishWorkout = () => {
    setRunning(false);
    setWorkoutDone(true);

    const exercisesCompleted =
      exercises.map((ex, ei) => ({
        name: ex.name,

        sets_completed: Array.from({
          length: ex.sets || 1,
        }).filter(
          (_, si) =>
            completedSets[
              `${ei}-${si}`
            ]
        ).length,

        reps_achieved:
          repsAchieved[ei] ||
          ex.reps,

        notes: '',
      }));

    logMutation.mutate({
      program_id: program?.id,
      date: new Date()
        .toISOString()
        .split('T')[0],
      week_number: currentWeekNum,
      day_name: day?.day_name,
      exercises_completed:
        exercisesCompleted,
      duration_minutes: Math.round(
        seconds / 60
      ),
    });

    toast.success(
      'Workout done! Amazing work. 💪'
    );
  };

  if (!program || days.length === 0) {
    return (
      <div className="px-5 pt-12 pb-24 text-center">
        <Dumbbell className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />

        <p className="text-muted-foreground text-sm">
          No active program. Complete onboarding first.
        </p>

        <Button
          className="mt-4"
          onClick={() =>
            navigate('/onboarding')
          }
        >
          Get Started
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="px-5 safe-top pb-3 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            navigate('/program')
          }
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        <div className="flex-1">
          <h1 className="font-heading font-bold text-xl">
            Live Workout
          </h1>

          <p className="text-xs text-muted-foreground">
            Week {currentWeekNum} ·{' '}
            {program.program_name}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-full">
          <Timer className="w-3.5 h-3.5 text-primary" />

          <span className="font-heading font-bold text-sm tabular-nums">
            {fmt(seconds)}
          </span>
        </div>
      </div>

      <Tabs
        defaultValue="workout"
        className="flex-1 flex flex-col"
      >
        <TabsList className="mx-5 mt-3 bg-muted/50 flex-shrink-0">
          <TabsTrigger
            value="workout"
            className="flex-1 font-heading"
          >
            Workout
          </TabsTrigger>

          <TabsTrigger
            value="baseline"
            className="flex-1 font-heading"
          >
            My Maxes
          </TabsTrigger>
        </TabsList>

        {/* ── WORKOUT TAB ── */}
        <TabsContent
          value="workout"
          className="flex-1 px-5 py-4 space-y-4 overflow-y-auto safe-bottom"
        >
          {/* Day selector */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  if (!started) {
                    setDayIndex(i);
                    setExIndex(0);
                    setSetIndex(0);
                    setResting(false);
                  }
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all flex-shrink-0',
                  i === dayIndex
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground'
                )}
              >
                {d.day_name}
              </button>
            ))}
          </div>

          {/* Workout done */}
          {workoutDone && (
            <div className="space-y-4">
              <Card className="p-4 text-center border-accent/30 bg-accent/5">
                <p className="font-heading font-bold text-lg">
                  Workout Complete! 🎉
                </p>

                <p className="text-sm text-muted-foreground mt-1">
                  {fmt(seconds)} ·{' '}
                  {exercises.length} exercises
                </p>
              </Card>

              {savedLog && (
                <PostWorkoutCheckin
                  log={savedLog}
                  canAdjust={canAdjust}
                  program={program}
                  onProgramUpdated={() =>
                    queryClient.invalidateQueries({
                      queryKey: ['programs'],
                    })
                  }
                  onSave={async (
                    checkin,
                    aiNote
                  ) => {
                    await updateLogMutation.mutateAsync(
                      {
                        id: savedLog.id,
                        data: {
                          post_workout_checkin:
                            checkin,
                          ai_adjustment_notes:
                            aiNote,
                        },
                      }
                    );
                  }}
                />
              )}
            </div>
          )}

          {/* Start card */}
          {!started && !workoutDone && (
            <Card className="p-6 text-center">
              <Dumbbell className="w-10 h-10 mx-auto mb-3 text-primary" />

              <h2 className="font-heading font-bold text-lg mb-1">
                {day?.day_name}
              </h2>

              <p className="text-sm text-muted-foreground mb-1">
                {day?.workout_type}
              </p>

              <p className="text-xs text-muted-foreground mb-2">
                {exercises.length} exercises
              </p>

              {exercises
                .slice(0, 3)
                .map((ex, i) => (
                  <p
                    key={i}
                    className="text-xs text-muted-foreground"
                  >
                    {ex.name} — {ex.sets}×
                    {ex.reps}
                  </p>
                ))}

              {exercises.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{exercises.length - 3} more
                </p>
              )}

              {canAdjust && (
                <div className="flex items-center justify-center gap-1.5 mt-4 text-[10px] text-chart-4">
                  <Zap className="w-3 h-3" />
                  <span>
                    Elite real-time adjustments enabled
                  </span>
                </div>
              )}

              <Button
                className="w-full h-12 font-heading font-semibold mt-3"
                onClick={() => {
                  setStarted(true);
                  setRunning(true);
                }}
              >
                Start Workout
              </Button>
            </Card>
          )}

          {/* Active workout */}
          {started &&
            !workoutDone &&
            exercise &&
            !resting && (
              <Card className="p-5 border-2 border-primary/30">
                <div className="flex items-center justify-between mb-1">
                  <Badge className="bg-primary/15 text-primary border-0 text-xs">
                    Exercise {exIndex + 1} of{' '}
                    {exercises.length}
                  </Badge>

                  <Badge className="bg-muted text-muted-foreground border-0 text-xs">
                    Set {setIndex + 1} of{' '}
                    {totalSets}
                  </Badge>
                </div>

                <div className="flex items-start justify-between gap-3 mt-2">
                  <h2 className="font-heading font-bold text-xl">
                    {exercise.name}
                  </h2>

                  {adjustedExerciseIndexes[
                    exIndex
                  ] && (
                    <Badge
                      variant="outline"
                      className="text-[9px] border-chart-4/30 text-chart-4 shrink-0"
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Adjusted
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-1">
                  Target: {exercise.reps}{' '}
                  reps · {restSecs}s rest
                </p>

                {exercise.notes && (
                  <p className="text-xs text-muted-foreground italic mb-3">
                    "{exercise.notes}"
                  </p>
                )}

                {exercise.activation_cue && (
                  <div className="flex items-start gap-2 mb-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />

                    <div>
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">
                        Activation Cue
                      </p>

                      <p className="text-xs text-foreground leading-relaxed">
                        {exercise.activation_cue}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actual reps input */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    Actual reps:
                  </span>

                  <Input
                    type="number"
                    min="0"
                    placeholder={exercise.reps}
                    className="h-9 text-sm w-24"
                    value={
                      repsAchieved[exIndex] ||
                      ''
                    }
                    onChange={e =>
                      setRepsAchieved(
                        prev => ({
                          ...prev,
                          [exIndex]:
                            e.target.value,
                        })
                      )
                    }
                  />
                </div>

                {/* Set indicators */}
                <div className="flex gap-2 mb-5">
                  {Array.from({
                    length: totalSets,
                  }).map((_, si) => {
                    const key = `${exIndex}-${si}`;

                    const done =
                      !!completedSets[key];

                    const current =
                      si === setIndex;

                    return (
                      <div
                        key={si}
                        className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center border-2 text-xs font-bold transition-all',
                          done
                            ? 'bg-accent border-accent text-accent-foreground'
                            : current
                              ? 'border-primary text-primary'
                              : 'border-border text-muted-foreground'
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          si + 1
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  className="w-full h-12 font-heading font-semibold text-base"
                  onClick={markSet}
                >
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  Complete Set {setIndex + 1}
                </Button>

                {/* REAL-TIME ELITE ADJUSTMENT */}
                {canAdjust && (
                  <LiveAdjustmentPanel
                    exercise={exercise}
                    exerciseIndex={exIndex}
                    setIndex={setIndex}
                    totalSets={totalSets}
                    repsAchieved={
                      repsAchieved[exIndex]
                    }
                    completedSets={
                      completedSets
                    }
                    trainingType={
                      program?.training_type ||
                      'calisthenics'
                    }
                    seconds={seconds}
                    onApply={
                      applyLiveAdjustment
                    }
                    disabled={
                      resting ||
                      workoutDone
                    }
                  />
                )}

                {/* Free users see the tracker but not the adjustment controls */}
                {!canAdjust && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/30">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Live workout tracking is free.
                      Elite unlocks real-time Kael
                      adjustments while you train.
                    </p>
                  </div>
                )}
              </Card>
            )}

          {started &&
            !workoutDone &&
            resting && (
              <Card className="p-5">
                <RestTimer
                  seconds={restSecs}
                  onDone={afterRest}
                />
              </Card>
            )}

          {/* Exercise list */}
          {started && !workoutDone && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                All Exercises
              </p>

              {exercises.map((ex, i) => {
                const allDone =
                  Array.from({
                    length: ex.sets || 1,
                  }).every(
                    (_, si) =>
                      completedSets[
                        `${i}-${si}`
                      ]
                  );

                const wasAdjusted =
                  !!adjustedExerciseIndexes[
                    i
                  ];

                return (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border transition-all',
                      i === exIndex
                        ? 'border-primary bg-primary/5'
                        : allDone
                          ? 'border-accent/30 bg-accent/5'
                          : 'border-border bg-card'
                    )}
                  >
                    {allDone ? (
                      <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                    ) : i === exIndex ? (
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 animate-pulse ml-1" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">
                          {ex.name}
                        </p>

                        {wasAdjusted && (
                          <Zap className="w-3 h-3 text-chart-4 shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {ex.sets}×{ex.reps}
                      </p>

                      {ex.activation_cue && (
                        <p className="text-[10px] text-primary/70 truncate mt-0.5">
                          {ex.activation_cue}
                        </p>
                      )}
                    </div>

                    {i === exIndex &&
                      !allDone && (
                        <SkipForward
                          className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => {
                            setExIndex(
                              i + 1 <
                                exercises.length
                                ? i + 1
                                : i
                            );

                            setSetIndex(0);
                            setResting(false);
                          }}
                        />
                      )}
                  </div>
                );
              })}

              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={finishWorkout}
              >
                Finish Workout Early
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── BASELINE TAB ── */}
        <TabsContent
          value="baseline"
          className="flex-1 px-5 py-4 overflow-y-auto safe-bottom"
        >
          <h2 className="font-heading font-bold text-lg mb-1">
            My Current Maxes
          </h2>

          <MovementBaseline
            trainingType={
              program?.training_type
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
