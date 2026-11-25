import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseApi } from '@/lib/supabaseApi';
import { useAuth } from '@/lib/AuthContext';
import {
  applySubscriptionUpgrade,
  canAccess,
  getPlanRank,
  isActiveSubscriptionStatus,
  isExplicitlyCanceled,
  normalizePlan,
  resolveEffectivePlan,
} from '@/lib/subscription';
import { fetchServerEntitlement } from '@/lib/stripeCheckout';
import {
  applyPostWorkoutAdaptation,
  applyLivePerformanceAdaptation,
} from '@/lib/periodizationEngine';
import { hasLearnSkillsGoal, sanitizeMicrocycleExclusions } from '@/lib/programExclusions';
import { normalizeWorkoutProgram } from '@/lib/expandMicrocycles';
import { resolveWorkoutDays, extractWeekdayFromDayName } from '@/lib/workoutSchedule';
import {
  getCachedActiveProgram,
  getCachedProgramsList,
  setCachedActiveProgram,
  setCachedProgramsList,
} from '@/lib/cacheStore';
import DynamicWarmupModal from '@/components/workout/DynamicWarmupModal';
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
  Flame,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppSettings } from '@/lib/AppSettingsContext';
import { toast } from 'sonner';
import { getLocalDateKey } from '@/lib/dateUtils';
import { triggerHaptic } from '@/lib/haptics';
import { playRestCompleteCue } from '@/lib/audioCue';

// ─── Timer (Wall-clock powered to count accurately in background) ───
function useTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const startTimeRef = useRef(null);
  const accumulatedMsRef = useRef(0);
  const intervalRef = useRef(null);

  // Synchronize elapsed seconds with true wall-clock time
  const syncElapsed = () => {
    let totalMs = accumulatedMsRef.current;
    if (startTimeRef.current !== null) {
      totalMs += (Date.now() - startTimeRef.current);
    }
    const totalSecs = Math.max(0, Math.floor(totalMs / 1000));
    setSeconds(totalSecs);
    return totalSecs;
  };

  useEffect(() => {
    if (running) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      syncElapsed();

      // Frequent interval while app is in foreground
      intervalRef.current = setInterval(syncElapsed, 500);

      // Instantly sync when returning from another app or unlocking phone
      const handleActive = () => {
        syncElapsed();
      };

      document.addEventListener('visibilitychange', handleActive);
      window.addEventListener('focus', handleActive);
      window.addEventListener('pageshow', handleActive);

      return () => {
        clearInterval(intervalRef.current);
        document.removeEventListener('visibilitychange', handleActive);
        window.removeEventListener('focus', handleActive);
        window.removeEventListener('pageshow', handleActive);
      };
    } else {
      if (startTimeRef.current !== null) {
        accumulatedMsRef.current += (Date.now() - startTimeRef.current);
        startTimeRef.current = null;
      }
      clearInterval(intervalRef.current);
      syncElapsed();
    }
  }, [running]);

  const reset = () => {
    startTimeRef.current = null;
    accumulatedMsRef.current = 0;
    setSeconds(0);
  };

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return { seconds, running, setRunning, reset, fmt };
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
        try {
          playRestCompleteCue();
          triggerHaptic('success');
        } catch (_cueErr) {
          // Audio cue note
        }
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

  const today = getLocalDateKey();

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

// Recursively unwraps nested result/data/array wrappers & markdown JSON strings
function unwrapAiPayload(raw) {
  let curr = raw;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof curr === 'string') {
      const cleaned = curr
        .replace(/^\uFEFF/, '')
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      try {
        curr = JSON.parse(cleaned);
        continue;
      } catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          try {
            curr = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
            continue;
          } catch {
            // keep looking
          }
        }
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        if (firstBracket >= 0 && lastBracket > firstBracket) {
          try {
            curr = JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
            continue;
          } catch {
            // keep looking
          }
        }
        return cleaned;
      }
    }
    if (Array.isArray(curr)) {
      curr = curr[0];
      continue;
    }
    if (curr && typeof curr === 'object') {
      if (curr.result !== undefined && typeof curr.result === 'object' && curr.result !== null) {
        curr = curr.result;
        continue;
      }
      if (typeof curr.result === 'string') {
        curr = curr.result;
        continue;
      }
      if (curr.data && typeof curr.data === 'object') {
        curr = curr.data;
        continue;
      }
    }
    break;
  }
  return curr;
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
  user,
  programGoal,
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

      const wantsSkills = hasLearnSkillsGoal({
        trainingType,
        fitnessGoals: user?.fitness_goals,
        weightGoals: user?.weight_goals,
        goalDescription: programGoal || user?.primary_goal,
        requirements: user?.training_requirements,
      });

      const skillPolicyRule =
        trainingType !== 'weights' && !wantsSkills
          ? '\n13. SKILLS POLICY: This athlete did NOT select "Learn Skills" as a goal. Do NOT introduce or substitute any calisthenics skills (handstands, muscle-ups, planches, front/back levers, human flags, L-sits, etc.).'
          : '';

      const athleteGoals = [
        ...(Array.isArray(user?.fitness_goals) ? user.fitness_goals : []),
        ...(Array.isArray(user?.weight_goals) ? user.weight_goals : []),
        programGoal || user?.primary_goal,
      ]
        .filter(Boolean)
        .join(', ');

      const prompt = `You are Kael, an elite ${typeLabel} coach providing REAL-TIME coaching during an active workout.

ATHLETE ONBOARDING PROFILE (STRICT CONSTRAINTS):
- Level: ${user?.fitness_level || 'intermediate'}
- Age / Gender: ${user?.age || 'not specified'}, ${user?.gender || 'not specified'}
- Goals: ${athleteGoals || 'General fitness & strength'}
- Current skills / maxes: ${user?.current_skills || 'Not specified'}
- Available equipment (STRICT — never suggest equipment they lack): ${user?.available_equipment || 'Standard equipment'}
- Requirements, injuries & limitations (STRICT): ${user?.training_requirements || 'None specified'}

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
5. Do not encourage training through significant pain, and respect all stated injuries/limitations and available equipment.
6. Do not diagnose injuries or medical conditions.
7. Keep the adjustment realistic for the athlete's training type and fitness level.
8. If the athlete reports concerning symptoms, prioritize stopping the movement and seeking appropriate medical evaluation.
9. Do not make dramatic changes without a reason.
10. The adjusted sets must be at least the number of sets already completed so the tracker remains consistent.
11. Give a concise explanation of exactly what changed and why.
12. Preserve the activation cue whenever possible, but improve it if the current cue is not useful.${skillPolicyRule}

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

      const adjustmentPayload = {
        type: 'live_workout_adjustment',
        prompt,
        plan: resolveEffectivePlan(user) || 'free',
        email: user?.email || undefined,
        user_id: user?.id || undefined,
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
      };

      let result = await supabaseApi.ai.invoke(adjustmentPayload);

      if (result?.__ai_error && result.code === 'SUBSCRIPTION_REQUIRED') {
        try {
          const ent = await fetchServerEntitlement({
            userId: user?.id,
            email: user?.email,
            cancelledAtIso: user?.subscription_cancelled_at || null,
          });
          if (ent?.active && canAccess(ent.plan, 'live_workout_adjustments')) {
            applySubscriptionUpgrade(ent.plan, ent.status, {
              persistReceipt: true,
              timestamp: ent.timestamp,
              syncServer: false,
            });
            result = await supabaseApi.ai.invoke({
              ...adjustmentPayload,
              plan: ent.plan,
            });
          }
        } catch {
          // ignore entitlement recheck failure and surface error below
        }
      }

      if (result?.__ai_error) {
        if (result.code === 'SUBSCRIPTION_REQUIRED' && canAccess(user, 'live_workout_adjustments')) {
          throw new Error(
            'Your server subscription record has not synced yet. Open Profile → Subscription and tap Refresh / Sync Purchase, or sign out and back in.'
          );
        }
        throw new Error(result.message || 'Kael could not adjust this exercise right now.');
      }

      const payload = unwrapAiPayload(result);
      const normalizedPayload =
        payload && typeof payload === 'object' ? payload : null;

      let adjustedExercise =
        normalizedPayload?.adjusted_exercise ||
        normalizedPayload?.adjustedExercise ||
        normalizedPayload?.exercise ||
        result?.adjusted_exercise ||
        (normalizedPayload?.name ? { ...exercise, ...normalizedPayload } : null);

      if (typeof adjustedExercise === 'string') {
        const parsedInner = unwrapAiPayload(adjustedExercise);
        if (parsedInner && typeof parsedInner === 'object') {
          adjustedExercise = parsedInner;
        }
      }

      if (!adjustedExercise || typeof adjustedExercise !== 'object') {
        throw new Error(
          'Kael did not return a valid adjustment.'
        );
      }

      const rawAdjusted = {
        ...exercise,
        ...adjustedExercise,
        sets: Math.max(
          completedCount,
          Number(adjustedExercise.sets) ||
            totalSets
        ),
        rest_seconds:
          Number(adjustedExercise.rest_seconds) ||
          exercise.rest_seconds ||
          60,
      };

      const sanitizedWrapper = sanitizeMicrocycleExclusions(
        { days: [{ day_name: 'Live Adjustment', workout_type: 'Strength', exercises: [rawAdjusted] }] },
        {
          trainingType,
          level: user?.fitness_level || 'intermediate',
          fitnessGoals: user?.fitness_goals,
          weightGoals: user?.weight_goals,
          goalDescription: programGoal || user?.primary_goal,
          requirements: user?.training_requirements,
          equipment: user?.available_equipment || '',
          currentSkills: user?.current_skills || '',
          wantsSkills,
          skipDayRenaming: true,
        }
      );

      const adjusted = sanitizedWrapper?.days?.[0]?.exercises?.[0] || rawAdjusted;

      onApply(adjusted);

      const summary =
        normalizedPayload?.adjustment_summary ||
        payload?.adjustment_summary ||
        result?.adjustment_summary ||
        'Kael adjusted the exercise based on your current performance.';

      const safety = normalizedPayload?.safety_note || payload?.safety_note || result?.safety_note || '';

      setLastAdjustment(
        safety
          ? `${summary} ${safety}`
          : summary
      );

      setFeedback('');
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
  canAdapt,
  program,
  user,
  dayIndex = -1,
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

      const trainingType =
        program?.training_type || 'calisthenics';
      const wantsSkills = hasLearnSkillsGoal({
        trainingType,
        fitnessGoals: user?.fitness_goals,
        weightGoals: user?.weight_goals,
        goalDescription: program?.goal || user?.primary_goal,
        requirements: user?.training_requirements,
      });

      const skillPolicyNote =
        trainingType !== 'weights' && !wantsSkills
          ? '\n9. SKILLS POLICY: This athlete did NOT select "Learn Skills" as a goal. Do NOT include or suggest any calisthenics skills (handstands, muscle-ups, planches, levers, human flags, L-sits, etc.) in adjusted_exercises or recommendations.'
          : '';

      let handled = false;
      if (program && canAdapt) {
        const currentWeek = program.current_week || 1;

        const nextMicrocycle =
          program.microcycles?.find(
            m => m.week_number === currentWeek + 1
          ) ||
          program.microcycles?.find(
            m => m.week_number === currentWeek
          ) ||
          null;

        const typeLabel = {
          calisthenics: 'calisthenics',
          weighted_calisthenics:
            'weighted calisthenics',
          weights: 'weight training',
          hybrid: 'hybrid training',
        }[trainingType];

        const resolvedWorkoutDays = resolveWorkoutDays({
          trainingDays: program?.macrocycle?.training_days || user?.training_days,
          existingDays: nextMicrocycle?.days,
          requirements: user?.training_requirements || '',
          goalDescription: program?.goal || user?.primary_goal || '',
        });

        const athleteGoalsSummary = [
          ...(Array.isArray(user?.fitness_goals) ? user.fitness_goals : []),
          ...(Array.isArray(user?.weight_goals) ? user.weight_goals : []),
          program?.goal || user?.primary_goal,
        ]
          .filter(Boolean)
          .join(', ');

        const elitePrompt = `You are Kael, an elite ${typeLabel} coach. An athlete just finished a workout and gave you feedback to adapt their 12-week program and recalibrate their predicted progression.

ATHLETE ONBOARDING PROFILE (STRICT CONSTRAINTS):
- Fitness level: ${user?.fitness_level || program?.fitness_level || 'intermediate'}
- Age / Gender: ${user?.age || 'not specified'}, ${user?.gender || 'not specified'}
- Goals & Timeframe: ${athleteGoalsSummary || 'General fitness'} (Timeframe: ${user?.goal_timeframe || 'not specified'})
- Workout days: ${resolvedWorkoutDays.join(', ')}
- Current skills / maxes: ${user?.current_skills || 'Not specified'}
- Available equipment (STRICT): ${user?.available_equipment || 'Standard equipment'}
- Training requirements, injuries & notes (STRICT): ${user?.training_requirements || 'None specified'}

POST-WORKOUT FEEDBACK:
"${checkin}"

EXERCISES COMPLETED TODAY:
${exerciseSummary}

CURRENT WEEK:
Week ${currentWeek} of 12

UPCOMING PROGRAMMED WORKOUT FOR THIS DAY:
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
    : 'No upcoming workout found.'
}

Based on the athlete's feedback AND their actual reps/sets completed today:

1. Give a 1-2 sentence direct, personal human coaching response.
2. Determine their progress trajectory: "accelerating" (if they crushed targets or felt it was too easy), "steady" (progressing well on track), or "recovering" (if they reported discomfort, fatigue, or missed reps).
3. If performance was strong/easy, recommend specific progressive overload targets for future weeks aligned with their goals, level, and timeframe.
4. If fatigue was high, discomfort/pain was reported, or form broke down, reduce stress or substitute safer exercise variations using only their available equipment and respecting stated injuries/requirements.
5. Provide a 1-sentence projected outlook of what their progress will look like over the upcoming weeks.
6. Return the calibrated exercises array for this training day to apply across remaining weeks.
7. Preserve activation cues and clear coaching notes.
8. Do not diagnose injuries or medical conditions.${skillPolicyNote}

Respond in JSON:
{
  "coach_response": "...",
  "adjustments_summary": "...",
  "progress_trajectory": "accelerating | steady | recovering",
  "projected_outlook": "...",
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
          plan: resolveEffectivePlan(user) || 'progress',
          response_json_schema: {
            type: 'object',
            properties: {
              coach_response: {
                type: 'string',
              },
              adjustments_summary: {
                type: 'string',
              },
              progress_trajectory: {
                type: 'string',
                enum: ['accelerating', 'steady', 'recovering'],
              },
              projected_outlook: {
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
              'coach_response',
              'adjustments_summary',
              'progress_trajectory',
              'projected_outlook',
              'adjusted_exercises',
            ],
          },
        });

        const isPlanRejection = Boolean(
          result?.__ai_error &&
            (result.code === 'SUBSCRIPTION_REQUIRED' ||
              result.code === 'FEATURE_REQUIRES_PLAN' ||
              /plan/i.test(String(result.message || '')))
        );

        if (!result?.__ai_error) {
          const unwrapped = unwrapAiPayload(result);
          const payload =
            unwrapped && typeof unwrapped === 'object'
              ? unwrapped
              : { coach_response: typeof unwrapped === 'string' ? unwrapped : '' };

          const coachResponse =
            payload?.coach_response ||
            result?.coach_response ||
            (typeof unwrapped === 'string' ? unwrapped : '') ||
            'Great session! Recovery and consistency will lock in your progress.';
          const adjustmentsSummary = payload?.adjustments_summary || result?.adjustments_summary || '';
          const projectedOutlook = payload?.projected_outlook || result?.projected_outlook || '';

          const note = `${coachResponse}${
            adjustmentsSummary
              ? `\n\n📋 12-Week Program Recalibrated: ${adjustmentsSummary}`
              : ''
          }${
            projectedOutlook ? `\n🎯 Projected Outlook: ${projectedOutlook}` : ''
          }`;

          setAiNote(note);

          try {
            await onSave(checkin, note);
          } catch (saveErr) {
            console.warn('[PostWorkoutCheckin] Log note sync warning:', saveErr?.message || saveErr);
          }

          const adjustedExercises =
            payload?.adjusted_exercises || result?.adjusted_exercises;

          if (
            Array.isArray(adjustedExercises) &&
            adjustedExercises.length > 0
          ) {
            try {
              const adaptedProgram = applyPostWorkoutAdaptation({
                currentProgram: program,
                currentWeek,
                currentDayIndex: dayIndex,
                dayName: log?.day_name,
                adjustedExercises,
                checkinSummary: adjustmentsSummary,
                coachResponse,
                trajectory: payload?.progress_trajectory || 'steady',
                projectedOutlook,
                fitnessGoals: user?.fitness_goals,
                weightGoals: user?.weight_goals,
                requirements: user?.training_requirements || '',
                equipment: user?.available_equipment || '',
                currentSkills: user?.current_skills || '',
                workoutDays: resolvedWorkoutDays,
              });

              if (onProgramUpdated) {
                await onProgramUpdated(adaptedProgram);
              } else {
                await supabaseApi.entities.WorkoutProgram.update(
                  program.id,
                  {
                    microcycles: adaptedProgram.microcycles,
                    adaptation_history: adaptedProgram.adaptation_history,
                    last_adapted_by_kael: adaptedProgram.last_adapted_by_kael,
                  }
                );
              }
            } catch (adaptErr) {
              console.warn('[PostWorkoutCheckin] Program adaptation sync warning:', adaptErr?.message || adaptErr);
            }
          }
          handled = true;
        } else if (!isPlanRejection) {
          throw new Error(result.message || 'Could not get Kael’s response.');
        }
      }

      if (!handled) {
        const typeLabel = {
          calisthenics: 'calisthenics',
          weighted_calisthenics:
            'weighted calisthenics',
          weights: 'weight training',
          hybrid: 'hybrid training',
        }[trainingType];

        const prompt = `You are Kael, a real-talk ${typeLabel} coach. Based on this post-workout check-in, give a SHORT (2-3 sentence) human response and a concrete note on how to adjust the next workout. Sound like a person, not a bot. Explain things in simple, everyday words that any beginner can easily understand without confusing jargon. If an analogy helps, use it, but never talk down to the athlete or sound childish.${
          trainingType !== 'weights' && !wantsSkills
            ? '\nIMPORTANT: This athlete did NOT select "Learn Skills" as a goal — do NOT recommend any calisthenics skills (handstands, muscle-ups, planches, levers, L-sits, flags).'
            : ''
        }

Athlete Level: ${user?.fitness_level || 'intermediate'}
Equipment: ${user?.available_equipment || 'Not specified'}
Requirements/Limitations: ${user?.training_requirements || 'None specified'}
Goals: ${program?.goal || user?.primary_goal || 'General fitness'}

Check-in: "${checkin}"

Workout: ${log?.day_name || 'unknown'}

${exerciseSummary}

Respond with:
1. One empathetic/direct sentence.
2. One specific adjustment for next time.`;

        const result = await supabaseApi.ai.invoke({
          type: 'live_workout',
          prompt,
          plan: resolveEffectivePlan(user) || 'free',
        });

        if (result?.__ai_error) {
          throw new Error(result.message || 'Could not get Kael’s response.');
        }

        const noteText =
          typeof result === 'string'
            ? result
            : result?.content ||
              (typeof result?.result === 'string' ? result.result : result?.result?.coach_response) ||
              result?.coach_response ||
              'Great work showing up and finishing your session!';

        setAiNote(noteText);

        try {
          await onSave(checkin, noteText);
        } catch (saveErr) {
          console.warn('[PostWorkoutCheckin] Free check-in note sync warning:', saveErr?.message || saveErr);
        }
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
    reset: resetTimer,
    fmt,
  } = useTimer();

  const { user: authUser } = useAuth() || {};
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('washek_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const effectiveUser = (() => {
    if (authUser && user) {
      return getPlanRank(resolveEffectivePlan(authUser)) >= getPlanRank(resolveEffectivePlan(user))
        ? { ...user, ...authUser }
        : { ...authUser, ...user };
    }
    return authUser || user;
  })();
  const userKey = effectiveUser?.id || effectiveUser?.email || 'guest';

  const [showWarmupModal, setShowWarmupModal] = useState(false);
  const [warmupCompleted, setWarmupCompleted] = useState(false);

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
  const [autoAdaptationResult, setAutoAdaptationResult] = useState(null);
  const scrollContainerRef = useRef(null);

  // Local live workout copy.
  // This is what Elite real-time adjustments modify.
  const [liveExercises, setLiveExercises] =
    useState([]);

  const [adjustedExerciseIndexes, setAdjustedExerciseIndexes] =
    useState({});

  useEffect(() => {
    if (authUser) {
      setUser((prev) => {
        if (!prev) return authUser;
        const authRank = getPlanRank(resolveEffectivePlan(authUser));
        const prevRank = getPlanRank(resolveEffectivePlan(prev));
        return authRank >= prevRank ? { ...prev, ...authUser } : prev;
      });
    }
  }, [authUser]);

  useEffect(() => {
    let active = true;
    supabaseApi.auth.me(true).then(async (u) => {
      if (!active) return;
      if (u) {
        setUser((prev) => {
          if (!prev) return u;
          const prevEmail = prev?.email ? String(prev.email).toLowerCase().trim() : '';
          const uEmail = u?.email ? String(u.email).toLowerCase().trim() : '';
          if (prevEmail && uEmail && prevEmail !== uEmail) {
            return u;
          }
          const uRank = getPlanRank(resolveEffectivePlan(u));
          const prevRank = getPlanRank(resolveEffectivePlan(prev));
          const uExplicitlyCanceled =
            isExplicitlyCanceled(u.subscription_status) && uRank === 0;
          if (uRank >= prevRank) {
            return u;
          }
          if (uExplicitlyCanceled && !canAccess(prev, 'live_workout_adjustments')) {
            return u;
          }
          return {
            ...u,
            subscription_plan: prev.subscription_plan,
            subscription_status: prev.subscription_status,
            plan: prev.subscription_plan,
            tier: prev.subscription_plan,
            subscription_tier: prev.subscription_plan,
            subscription_cancelled_at: null,
          };
        });
      }
      const targetUser = u || effectiveUser;
      if (targetUser && !canAccess(targetUser, 'live_workout_adjustments') && (targetUser.id || targetUser.email)) {
        try {
          const ent = await fetchServerEntitlement({
            userId: targetUser.id,
            email: targetUser.email,
            cancelledAtIso: targetUser.subscription_cancelled_at || null,
          });
          if (active && ent?.active && ent.plan && ent.plan !== 'free') {
            const curRank = getPlanRank(resolveEffectivePlan(targetUser));
            const entRank = getPlanRank(ent.plan);
            if (entRank > curRank) {
              applySubscriptionUpgrade(ent.plan, ent.status, {
                persistReceipt: true,
                timestamp: ent.timestamp,
                syncServer: false,
              });
              setUser((prev) => ({
                ...(prev || targetUser),
                subscription_plan: ent.plan,
                subscription_status: ent.status,
                plan: ent.plan,
                tier: ent.plan,
                subscription_tier: ent.plan,
                subscription_cancelled_at: null,
              }));
            }
          }
        } catch {
          // ignore server entitlement fallback error
        }
      }
    }).catch(() => {});

    const handleSubUpdated = (e) => {
      const rawPlan = normalizePlan(e.detail?.plan || 'free');
      const rawStatus = String(
        e.detail?.status || (rawPlan === 'free' ? 'canceled' : 'active')
      ).toLowerCase().trim();
      const activeSub = rawPlan !== 'free' && isActiveSubscriptionStatus(rawStatus);
      const nextPlan = activeSub ? rawPlan : 'free';
      if (e.detail?.plan || e.detail?.status) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                subscription_plan: nextPlan,
                subscription_status: rawStatus,
                plan: nextPlan,
                tier: nextPlan,
                subscription_tier: nextPlan,
              }
            : {
                subscription_plan: nextPlan,
                subscription_status: rawStatus,
                plan: nextPlan,
                tier: nextPlan,
                subscription_tier: nextPlan,
              }
        );
      }
    };
    window.addEventListener('washek_subscription_updated', handleSubUpdated);
    return () => {
      active = false;
      window.removeEventListener('washek_subscription_updated', handleSubUpdated);
    };
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
    queryKey: ['programs', userKey],
    queryFn: async () => {
      // 1. Try active programs
      let res = await supabaseApi.entities.WorkoutProgram.filter(
        { status: 'active' },
        '-created_at',
        5
      );
      // 2. Resilient fallback if status is missing or different
      if (!Array.isArray(res) || res.length === 0) {
        res = await supabaseApi.entities.WorkoutProgram.filter(
          {},
          '-created_at',
          5
        );
      }
      if (Array.isArray(res) && res.length > 0) {
        setCachedProgramsList(res, userKey);
        return res;
      }
      const cached = getCachedProgramsList(userKey);
      return cached.length ? cached : [];
    },
    initialData: () => getCachedProgramsList(userKey),
    staleTime: 5 * 60 * 1000,
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

      setSavedLog((prev) => ({ ...(prev || {}), ...(log || {}) }));
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

  const activeProgram =
    programs.find((p) => p.status === 'active') ||
    programs[0] ||
    getCachedActiveProgram(userKey) ||
    null;

  const program = activeProgram ? normalizeWorkoutProgram(activeProgram) : null;

  const currentWeekNum =
    program?.current_week || 1;

  const microcycle =
    program?.microcycles?.find(
      m => m.week_number === currentWeekNum
    ) ||
    program?.microcycles?.[0];

  const days = microcycle?.days || [];
  const defaultDayAppliedRef = useRef(false);

  useEffect(() => {
    if (defaultDayAppliedRef.current || started || days.length === 0) return;
    defaultDayAppliedRef.current = true;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const dayParam = searchParams.get('day');
      if (dayParam !== null && dayParam !== '') {
        const parsedDay = Number.parseInt(dayParam, 10);
        if (Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay < days.length) {
          setDayIndex(parsedDay);
          return;
        }
      }
      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const idx = days.findIndex(
        (d) =>
          extractWeekdayFromDayName(d?.day_name || '') === todayName ||
          String(d?.day_name || '').toLowerCase().includes(todayName.toLowerCase())
      );
      if (idx !== -1) {
        setDayIndex(idx);
      }
    } catch {
      // ignore locale/url issues
    }
  }, [days, started]);

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
    setAutoAdaptationResult(null);
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
    effectiveUser,
    'live_workout_adjustments'
  );

  const canAdapt = canAccess(
    effectiveUser,
    'adaptive_programming'
  );

  const applyLiveAdjustment = adjusted => {
    if (!canAdjust) {
      toast.error('Real-time live adjustments are an Elite feature.');
      return;
    }

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
    triggerHaptic('success');

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
    } else {
      finishWorkout();
    }
  };

  const afterRest = () => {
    setResting(false);
    setSetIndex(s => s + 1);
  };

  const persistProgramAdaptation = async (updatedProgram) => {
    if (!updatedProgram?.id) return;
    setCachedActiveProgram(updatedProgram, userKey);
    const existingList = getCachedProgramsList(userKey);
    const nextList = existingList.some((p) => p.id === updatedProgram.id)
      ? existingList.map((p) => (p.id === updatedProgram.id ? updatedProgram : p))
      : [updatedProgram, ...existingList];
    setCachedProgramsList(nextList, userKey);
    queryClient.setQueryData(['programs', userKey], (old) =>
      Array.isArray(old)
        ? old.map((p) => (p.id === updatedProgram.id ? updatedProgram : p))
        : nextList
    );

    try {
      await supabaseApi.entities.WorkoutProgram.update(updatedProgram.id, {
        microcycles: updatedProgram.microcycles,
        adaptation_history: updatedProgram.adaptation_history,
        last_adapted_by_kael: updatedProgram.last_adapted_by_kael,
      });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
    } catch (err) {
      console.error('Failed to sync live adaptive program update:', err);
    }
  };

  const finishWorkout = async () => {
    triggerHaptic('heavy');
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

    const stableLogId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `work_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const logPayload = {
      id: stableLogId,
      program_id: program?.id,
      date: getLocalDateKey(),
      week_number: currentWeekNum,
      day_name: day?.day_name,
      exercises_completed:
        exercisesCompleted,
      duration_minutes: Math.round(
        seconds / 60
      ),
    };

    // Show PostWorkoutCheckin immediately without waiting on remote database round-trips
    setSavedLog(logPayload);
    logMutation.mutate(logPayload);

    if (canAdapt && program) {
      const adaptation = applyLivePerformanceAdaptation({
        currentProgram: program,
        currentWeek: currentWeekNum,
        currentDayIndex: dayIndex,
        dayName: day?.day_name || '',
        plannedExercises: exercises,
        completedExercises: exercisesCompleted,
        elapsedSeconds: seconds,
        user: effectiveUser,
      });
      setAutoAdaptationResult(adaptation);
      await persistProgramAdaptation(adaptation.updatedProgram);
    }
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

  const handleScrollToTop = (e) => {
    e?.stopPropagation?.();
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      <Tabs
        defaultValue="workout"
        onValueChange={() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
          }
        }}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        {/* Pinned Non-Scrolling Header Section - Stays permanently anchored at top while content scrolls below */}
        <header
          onClick={handleScrollToTop}
          className="shrink-0 z-40 bg-background/95 dark:bg-card/95 backdrop-blur-2xl border-b border-border/80 shadow-[0_2px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)] select-none pointer-events-auto cursor-pointer transition-colors"
          title="Tap to scroll to top"
        >
          {/* Main Header Bar */}
          <div className="px-4 sm:px-5 safe-top pb-2.5 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                navigate('/program');
              }}
              aria-label="Back to program"
              className="w-9 h-9 rounded-xl hover:bg-muted active:scale-95 transition-all shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 pointer-events-none" />
            </Button>

            <div className="flex-1 min-w-0">
              <h1 className="font-heading font-bold text-lg sm:text-xl truncate leading-tight">
                Live Workout
              </h1>

              <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                Week {currentWeekNum} ·{' '}
                {program.program_name}
              </p>
            </div>

            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-full shadow-2xs shrink-0"
            >
              <Timer className="w-3.5 h-3.5 text-primary" />

              <span className="font-heading font-bold text-sm tabular-nums">
                {fmt(seconds)}
              </span>
            </div>
          </div>

          {/* Workout / My Maxes Tabs Bar */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="px-4 sm:px-5 pb-2.5 pt-0.5"
          >
            <TabsList className="w-full bg-muted/60 dark:bg-muted/40">
              <TabsTrigger
                value="workout"
                className="flex-1 font-heading text-xs sm:text-sm font-semibold"
              >
                Workout
              </TabsTrigger>

              <TabsTrigger
                value="baseline"
                className="flex-1 font-heading text-xs sm:text-sm font-semibold"
              >
                My Maxes
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        {/* Independent Scrollable Viewport Below Pinned Header */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain"
        >
        {/* ── WORKOUT TAB ── */}
        <TabsContent
          value="workout"
          className="px-4 sm:px-5 py-4 space-y-4 safe-bottom m-0"
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

              {canAdapt && autoAdaptationResult && (
                <Card className="p-4 border-primary/30 bg-primary/5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                      <p className="font-heading font-bold text-sm">
                        Adaptive Programming Applied
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-semibold bg-primary/15 text-primary border-primary/25"
                    >
                      {autoAdaptationResult.evaluation.direction === 'harder'
                        ? 'Next Session Harder'
                        : autoAdaptationResult.evaluation.direction === 'easier'
                          ? 'Next Session Easier'
                          : 'Progressive Overload'}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {autoAdaptationResult.evaluation.coachResponse}
                  </p>

                  {autoAdaptationResult.nextSessionPreview?.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        Updated Target · {autoAdaptationResult.nextSessionDayName}
                      </p>
                      {autoAdaptationResult.nextSessionPreview.slice(0, 4).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-background/60 border border-border/60"
                        >
                          <span className="font-medium truncate pr-2">{item.name}</span>
                          <span className="font-mono font-semibold text-primary shrink-0">
                            {item.before} → {item.after}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {!canAdapt && (
                <Card className="p-4 border-border/80 bg-muted/30 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-xs">
                        Adaptive Programming (Progress+)
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Automatically makes your next session easier or harder based on your live sets & reps.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs"
                    onClick={() => navigate('/profile')}
                  >
                    Upgrade
                  </Button>
                </Card>
              )}

              {savedLog && (
                <PostWorkoutCheckin
                  log={savedLog}
                  canAdjust={canAdjust}
                  canAdapt={canAdapt}
                  program={program}
                  user={effectiveUser}
                  dayIndex={dayIndex}
                  onProgramUpdated={async (adaptedProgram) => {
                    if (adaptedProgram) {
                      await persistProgramAdaptation(adaptedProgram);
                    } else {
                      queryClient.invalidateQueries({
                        queryKey: ['programs'],
                      });
                    }
                  }}
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

              <div className="space-y-2.5 mt-4">
                {warmupCompleted ? (
                  <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span>Dynamic Warmup Completed · Joints Primed</span>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowWarmupModal(true)}
                    className="w-full h-11 border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary font-heading font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-xs"
                  >
                    <Flame className="w-4 h-4 text-primary animate-pulse" />
                    <span>Dynamic Warmup (3–5 min) · Injury Prevention</span>
                  </Button>
                )}

                <Button
                  className="w-full h-12 font-heading font-semibold"
                  onClick={() => {
                    resetTimer();
                    setStarted(true);
                    setRunning(true);
                  }}
                >
                  Start Workout
                </Button>
              </div>
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
                    user={effectiveUser}
                    programGoal={program?.goal}
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
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(37,99,235,0.8)] ml-1" />
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
          className="px-4 sm:px-5 py-4 safe-bottom m-0"
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
        </div>
      </Tabs>

      {/* Dynamic Warmup Routine Generator (Optional injury prevention step) */}
      <DynamicWarmupModal
        isOpen={showWarmupModal}
        onClose={() => setShowWarmupModal(false)}
        dayName={day?.day_name || 'Workout'}
        workoutType={day?.workout_type || program?.training_type || 'Strength'}
        exercises={exercises}
        onStartWorkout={() => {
          setWarmupCompleted(true);
          resetTimer();
          setStarted(true);
          setRunning(true);
        }}
      />
    </div>
  );
}
