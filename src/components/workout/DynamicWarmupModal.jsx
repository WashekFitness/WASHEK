import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ShieldAlert,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Sparkles,
  Flame,
  ArrowRight,
  Activity,
  Dumbbell,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { playRestCompleteCue } from '@/lib/audioCue';
import { supabaseApi } from '@/lib/supabaseApi';

/**
 * Exercise-specific dynamic movement library.
 * Each entry is tagged with exercise keywords, anatomical target, cues, and injury prevention rationale.
 */
const SPECIFIC_WARMUP_LIBRARY = [
  // ── Overhead & Incline Pressing (Overhead Press, Military Press, Pike Pushups, Handstand)
  {
    id: 'overhead_t_spine',
    triggers: ['overhead', 'military', 'shoulder press', 'pike', 'handstand', 'incline', 'push press', 'arnold'],
    name: 'Thoracic Spine Extensions & Scapular Wall Slides',
    durationSeconds: 45,
    reps: '10 smooth slides',
    target: 'Thoracic Spine Extension & Scapular Upward Rotation',
    injuryPrevention: 'Unlocks mid-back extension so overhead pressing does not cause anterior shoulder pinching or lumbar hyperextension.',
    cues: 'Keep ribcage pinned down and back flat against wall. Slide arms into a high Y-shape without arching lower back.',
  },
  {
    id: 'overhead_pass_through',
    triggers: ['overhead', 'military', 'shoulder press', 'pike', 'handstand', 'incline', 'lateral raise'],
    name: 'Shoulder Pass-Throughs & Dislocates',
    durationSeconds: 45,
    reps: '10–12 smooth sweeps',
    target: 'Glenohumeral Joint Capsule & Subacromial Space',
    injuryPrevention: 'Lubricates the shoulder capsule with synovial fluid and prevents subacromial impingement during pressing.',
    cues: 'Use a towel or resistance band. Keep elbows straight and core tight as you sweep overhead and behind.',
  },

  // ── Horizontal Chest Pressing (Bench Press, Push-ups, Chest Press)
  {
    id: 'chest_scap_pushup',
    triggers: ['bench', 'chest press', 'push-up', 'pushup', 'push up', 'floor press', 'dumbbell press', 'pec'],
    name: 'Scapular Push-Ups (Protraction & Retraction)',
    durationSeconds: 40,
    reps: '12 controlled reps',
    target: 'Serratus Anterior & Scapular Retractors',
    injuryPrevention: 'Wakes up the serratus anterior to lock the shoulder blades tight to the ribcage, protecting the rotator cuff under heavy chest pressing.',
    cues: 'Locked elbows in plank. Squeeze shoulder blades together, then push the floor away into maximum protraction.',
  },
  {
    id: 'chest_band_pull_apart',
    triggers: ['bench', 'chest press', 'push-up', 'pushup', 'push up', 'floor press', 'dumbbell press', 'pec'],
    name: 'Band Pull-Aparts with External Rotation',
    durationSeconds: 40,
    reps: '15 reps',
    target: 'Infraspinatus, Teres Minor & Rhomboids',
    injuryPrevention: 'Pre-activates posterior shoulder stabilizers to maintain optimal glenohumeral centering under barbell and dumbbell loads.',
    cues: 'Slight bend in elbows. Pull band to mid-chest while actively rotating thumbs back, feeling the rear shoulders squeeze.',
  },

  // ── Dips & Deep Shoulder Extension
  {
    id: 'dip_shrug_and_extension',
    triggers: ['dip', 'ring dip', 'chest dip', 'tricep dip'],
    name: 'Straight-Arm Dip Shrugs & Anterior Delt Opener',
    durationSeconds: 40,
    reps: '10 shrugs + 15s stretch',
    target: 'Pectoralis Minor, Lower Trapezius & Anterior Capsule',
    injuryPrevention: 'Prepares the vulnerable anterior shoulder capsule for the deep bottom stretch of dips, preventing sternum and clavicle strain.',
    cues: 'Support yourself with locked arms. Shrug shoulders down away from ears with maximum depression. Pause 2s at top.',
  },

  // ── Vertical Pulling (Pull-Ups, Chin-Ups, Lat Pulldown, Muscle-Ups)
  {
    id: 'pull_active_hangs',
    triggers: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'chin up', 'lat pulldown', 'pulldown', 'muscle-up', 'muscle up'],
    name: 'Active Scapular Hangs & Lat Depressions',
    durationSeconds: 40,
    reps: '8 reps with 2s peak hold',
    target: 'Latissimus Dorsi, Lower Traps & Scapular Depressors',
    injuryPrevention: 'Fires the lats and lower traps before pulling, preventing distal bicep tendon strain and shoulder impingement.',
    cues: 'Hang from bar with straight arms. Pull shoulder blades down away from ears without bending elbows. Hold 2s, then lower.',
  },
  {
    id: 'pull_lat_sweep',
    triggers: ['pull-up', 'pullup', 'pull up', 'chin-up', 'chinup', 'chin up', 'lat pulldown', 'pulldown', 'muscle-up'],
    name: 'Child’s Pose Lat Sweep to Dynamic Side Reach',
    durationSeconds: 45,
    reps: '20s each side',
    target: 'Latissimus Dorsi & Thoracolumbar Fascia',
    injuryPrevention: 'Restores full overhead lat elasticity so you can achieve full dead-hang extension without ribcage shearing.',
    cues: 'Sit on heels. Walk hands diagonally across to one side until you feel a deep stretch along the lateral ribcage and lat.',
  },

  // ── Horizontal Pulling (Barbell Rows, Dumbbell Rows, Inverted Rows, Cable Rows)
  {
    id: 'row_prone_ytw',
    triggers: ['row', 'inverted row', 'cable row', 'barbell row', 'dumbbell row', 't-bar', 'face pull'],
    name: 'Prone Floor Y-T-W Activation',
    durationSeconds: 45,
    reps: '6 reps per letter shape',
    target: 'Middle & Lower Trapezius, Rhomboids & Rear Delts',
    injuryPrevention: 'Pre-activates upper back muscles to prevent thoracic rounding and neck shrugging during heavy rows.',
    cues: 'Lie face down. Thumbs point up. Raise arms in Y, then T, then W positions, squeezing shoulder blades together without neck tension.',
  },
  {
    id: 'row_thread_needle',
    triggers: ['row', 'inverted row', 'cable row', 'barbell row', 'dumbbell row', 't-bar', 'face pull'],
    name: 'Thread the Needle Thoracic Rotations',
    durationSeconds: 45,
    reps: '6 reps per side',
    target: 'Thoracic Mobility & Mid-Back Rotators',
    injuryPrevention: 'Increases mid-back rotational mobility to eliminate unilateral pulling torque on the spine.',
    cues: 'On all fours, reach one arm under your chest across the floor, then rotate that arm upward toward the ceiling, eyes following your hand.',
  },

  // ── Squats & Knee-Dominant Lower Body (Back Squat, Front Squat, Goblet Squat, Split Squats, Leg Press)
  {
    id: 'squat_deep_pry',
    triggers: ['squat', 'front squat', 'goblet squat', 'hack squat', 'leg press', 'pistol', 'sissy squat'],
    name: 'Deep Squat Pry with Thoracic Arm Reach',
    durationSeconds: 45,
    reps: '8 deep breaths',
    target: 'Hip Adductors, Deep Rotators & Ankle Capsule',
    injuryPrevention: 'Eliminates bottom-position "butt wink" (pelvic tilt) and knee cave (valgus) during loaded squats.',
    cues: 'Sink into your deepest bodyweight squat. Press elbows against inside of knees, pry hips open, and reach one arm overhead.',
  },
  {
    id: 'squat_ankle_rocks',
    triggers: ['squat', 'front squat', 'goblet squat', 'hack squat', 'leg press', 'pistol', 'lunge', 'split squat'],
    name: 'Ankle Dorsiflexion Wall Rocks',
    durationSeconds: 40,
    reps: '10 rocks per ankle',
    target: 'Talocrural Joint & Achilles Tendon',
    injuryPrevention: 'Improves forward knee travel over toes, keeping your torso upright and sparing the patellar tendon and lumbar spine.',
    cues: 'Toes 3–4 inches from wall. Drive knee directly forward over pinky toe without lifting heel from floor.',
  },
  {
    id: 'squat_hip_opener',
    triggers: ['squat', 'front squat', 'goblet squat', 'lunge', 'split squat', 'bulgarian'],
    name: 'Dynamic World’s Greatest Stretch',
    durationSeconds: 50,
    reps: '5 per side',
    target: 'Hip Flexors, Hamstrings & T-Spine',
    injuryPrevention: 'Mobilizes the complete lower-body kinetic chain from hip socket to thoracic spine.',
    cues: 'Step into a deep lunge. Place both hands inside front foot. Drop inside elbow toward floor, then sweep that arm toward ceiling.',
  },

  // ── Hip Hinge & Posterior Chain (Deadlift, RDL, Good Mornings, Hip Thrust)
  {
    id: 'hinge_single_leg_rdl',
    triggers: ['deadlift', 'rdl', 'romanian', 'stiff-leg', 'hinge', 'good morning', 'kettlebell swing', 'hyperextension'],
    name: 'Single-Leg Bodyweight Hinge with Glute Reach',
    durationSeconds: 45,
    reps: '6 per leg',
    target: 'Hamstrings, Gluteus Medius & Pelvic Stabilizers',
    injuryPrevention: 'Wakes up hip-hinge mechanics and posterior chain firing pattern before loading the lumbar spine with heavy deadlifts.',
    cues: 'Stand on one leg. Push hips straight back as torso lowers parallel to floor. Keep back flat and hips square.',
  },
  {
    id: 'hinge_glute_bridge',
    triggers: ['deadlift', 'rdl', 'romanian', 'hip thrust', 'glute bridge', 'hamstring', 'curl'],
    name: 'Single-Leg Glute Bridge with 2s Peak Hold',
    durationSeconds: 40,
    reps: '8 per leg',
    target: 'Gluteus Maximus & Pelvic Extension',
    injuryPrevention: 'Ensures glutes fire at lockout rather than hyperextending and overloading the lumbar vertebrae.',
    cues: 'Drive through the working heel. Squeeze glute at top until hip is completely open. Hold 2s, lower under control.',
  },

  // ── Calisthenic Skills, Planche, Handstands, Levers & Wrist Prep
  {
    id: 'calisthenics_wrist_matrix',
    triggers: ['planche', 'handstand', 'lever', 'ring', 'l-sit', 'manna', 'push-up', 'pushup', 'dip', 'wrist'],
    name: 'Calisthenics Multi-Angle Wrist Matrix',
    durationSeconds: 50,
    reps: '10 pulses per position',
    target: 'Carpal Tunnel, Forearm Flexors, Extensors & TFCC',
    injuryPrevention: 'Essential joint conditioning to prevent wrist sprains and TFCC tears during bodyweight loading.',
    cues: 'On all fours: palms down fingers forward, fingers backward, back of hands down, and closed fists. Keep elbows locked.',
  },
  {
    id: 'calisthenics_hollow_body',
    triggers: ['planche', 'handstand', 'front lever', 'back lever', 'l-sit', 'hollow', 'toes to bar', 'leg raise'],
    name: 'Hollow Body to Arch Dynamic Spinal Waves',
    durationSeconds: 45,
    reps: '8 fluid waves',
    target: 'Anterior & Posterior Core Kinetic Chain',
    injuryPrevention: 'Engages the abdominal wall and glutes together, locking in the protective pelvic tilt required for high-skill gymnastics.',
    cues: 'Press lower back into floor in hollow body, then roll smoothly into arch (Superman), keeping glutes clamped tight.',
  },

  // ── Unilateral Legs, Lunges & Agility
  {
    id: 'lunge_cossack',
    triggers: ['lunge', 'split squat', 'bulgarian', 'step up', 'cossack', 'jump', 'adductor'],
    name: 'Cossack Squats (Dynamic Lateral Mobility)',
    durationSeconds: 45,
    reps: '6 per side',
    target: 'Adductors, Groin & Ankle Mobility',
    injuryPrevention: 'Prepares the adductors and lateral hip stabilizers for deep unilateral loading, preventing groin pulls.',
    cues: 'Wide stance. Shift weight to one side, squatting low while opposite leg stays locked with toes pointed to ceiling.',
  },
  {
    id: 'lunge_hip_flexor',
    triggers: ['lunge', 'split squat', 'bulgarian', 'step up', 'sprint'],
    name: 'Half-Kneeling Dynamic Psoas & Hip Flexor Pulses',
    durationSeconds: 40,
    reps: '8 pulses per side',
    target: 'Iliopsoas, Rectus Femoris & Anterior Hip',
    injuryPrevention: 'Releases tight hip flexors that pull the pelvis into anterior pelvic tilt during deep lunges.',
    cues: 'Tuck pelvis under (squeeze glute of rear leg). Gently pulse forward without losing the posterior pelvic tuck.',
  },
];

/**
 * Intelligent workout-specific generator that creates a dynamic warmup tailored
 * to the exact exercises present in today's workout session.
 */
function buildWorkoutSpecificWarmup(dayName = '', workoutType = '', exercises = []) {
  const exList = Array.isArray(exercises) ? exercises : [];
  const exerciseNames = exList.map((e) => (typeof e === 'string' ? e : e?.name || '')).filter(Boolean);
  const combinedContext = `${dayName} ${workoutType} ${exerciseNames.join(' ')}`.toLowerCase();

  const selectedMovements = [];
  const usedIds = new Set();

  // 1. Scan for movements whose triggers match the day's specific exercises
  for (const movement of SPECIFIC_WARMUP_LIBRARY) {
    const matchedExercises = exerciseNames.filter((exName) => {
      const lower = exName.toLowerCase();
      return movement.triggers.some((trig) => lower.includes(trig));
    });

    if (matchedExercises.length > 0) {
      selectedMovements.push({
        ...movement,
        preparesExercises: matchedExercises,
        matchCount: matchedExercises.length,
      });
      usedIds.add(movement.id);
    }
  }

  // 2. If day name or workout type matches triggers, include those with relevant context
  if (selectedMovements.length < 4) {
    for (const movement of SPECIFIC_WARMUP_LIBRARY) {
      if (usedIds.has(movement.id)) continue;
      const matchesDay = movement.triggers.some((trig) => combinedContext.includes(trig));
      if (matchesDay) {
        selectedMovements.push({
          ...movement,
          preparesExercises: exerciseNames.slice(0, 2),
          matchCount: 1,
        });
        usedIds.add(movement.id);
      }
    }
  }

  // 3. Fallback: if still under 4 movements, add universal dynamic foundations
  if (selectedMovements.length < 4) {
    const defaults = [
      SPECIFIC_WARMUP_LIBRARY[0], // Thoracic extensions
      SPECIFIC_WARMUP_LIBRARY[2], // Scapular pushups
      SPECIFIC_WARMUP_LIBRARY[9], // Deep squat pry
      SPECIFIC_WARMUP_LIBRARY[14], // Calisthenics wrist matrix
    ];
    for (const def of defaults) {
      if (!usedIds.has(def.id) && selectedMovements.length < 5) {
        selectedMovements.push({
          ...def,
          preparesExercises: exerciseNames.length ? exerciseNames.slice(0, 2) : ['Session Primer'],
          matchCount: 1,
        });
        usedIds.add(def.id);
      }
    }
  }

  // Sort by highest match relevance and limit to 4-5 focused movements (ideal 3–5 min warmup)
  selectedMovements.sort((a, b) => (b.matchCount || 0) - (a.matchCount || 0));
  return selectedMovements.slice(0, 5);
}

export default function DynamicWarmupModal({
  isOpen,
  onClose,
  dayName = 'Workout',
  workoutType = 'Strength',
  exercises = [],
  onStartWorkout,
}) {
  // Build dynamic warmup specifically tailored to today's exact exercises
  const workoutSpecificRoutine = useMemo(() => {
    return buildWorkoutSpecificWarmup(dayName, workoutType, exercises);
  }, [dayName, workoutType, exercises]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(45);
  const [isRunning, setIsRunning] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiCustomRoutine, setAiCustomRoutine] = useState(null);

  const activeRoutine = useMemo(() => {
    if (aiCustomRoutine && Array.isArray(aiCustomRoutine) && aiCustomRoutine.length > 0) {
      return aiCustomRoutine;
    }
    return workoutSpecificRoutine;
  }, [aiCustomRoutine, workoutSpecificRoutine]);

  const currentMovement = activeRoutine[currentIndex] || activeRoutine[0];
  const timerRef = useRef(null);

  // Reset when dialog opens or workout day changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsRunning(false);
    setAiCustomRoutine(null);
  }, [dayName, isOpen]);

  // Sync timer with current movement duration
  useEffect(() => {
    if (currentMovement) {
      setSecondsRemaining(currentMovement.durationSeconds || 45);
      setIsRunning(false);
    }
  }, [currentIndex, currentMovement]);

  // Accurate countdown timer
  useEffect(() => {
    if (isRunning && secondsRemaining > 0) {
      timerRef.current = window.setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            triggerHaptic('medium');
            playRestCompleteCue();
            if (currentIndex < activeRoutine.length - 1) {
              setCurrentIndex((idx) => idx + 1);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isRunning, secondsRemaining, currentIndex, activeRoutine.length]);

  const handleToggleTimer = () => {
    triggerHaptic('light');
    setIsRunning((prev) => !prev);
  };

  const handleNext = () => {
    triggerHaptic('light');
    if (currentIndex < activeRoutine.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    triggerHaptic('light');
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleFinishWarmupAndStart = () => {
    triggerHaptic('success');
    if (typeof onStartWorkout === 'function') {
      onStartWorkout();
    }
    onClose();
  };

  // Optional AI generation explicitly analyzing the exact exercises in today's day
  const handleGenerateAiWarmup = async () => {
    setIsGeneratingAi(true);
    try {
      const exerciseNames = exercises.map((e) => (typeof e === 'string' ? e : e.name)).filter(Boolean).join(', ') || 'General workout';
      const prompt = `You are WASHEK's head biomechanist and physical performance specialist.
Create a 4-movement dynamic warmup routine specifically engineered for TODAY'S WORKOUT:
Workout Day: "${dayName}"
Target Focus: "${workoutType}"
Exercises to prepare for: ${exerciseNames}

For each movement, clearly specify which of today's exercises it directly prepares to prevent injury.

Return ONLY a valid JSON array of objects with this schema:
[
  {
    "name": "Dynamic Exercise Name",
    "durationSeconds": 45,
    "reps": "10-12 reps",
    "target": "Target Joint or Tissue",
    "preparesExercises": ["Name of exercise 1", "Name of exercise 2"],
    "injuryPrevention": "Scientific explanation of why this prevents injury for today's session",
    "cues": "2 clear cues for optimal execution"
  }
]`;

      const response = await supabaseApi.ai.invoke({
        prompt,
        type: 'general',
      });

      let parsed = null;
      if (typeof response === 'string') {
        const clean = response.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        parsed = JSON.parse(clean);
      } else if (response?.result) {
        parsed = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
      } else if (Array.isArray(response)) {
        parsed = response;
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        setAiCustomRoutine(parsed);
        setCurrentIndex(0);
        triggerHaptic('success');
      }
    } catch (err) {
      console.warn('[DynamicWarmup] AI generation note:', err);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const totalMovements = activeRoutine.length;
  const overallProgress = Math.round(((currentIndex + 1) / totalMovements) * 100);
  const currentDuration = currentMovement?.durationSeconds || 45;
  const timerProgress = Math.round(((currentDuration - secondsRemaining) / currentDuration) * 100);

  const exerciseSummary = useMemo(() => {
    return exercises.map((e) => (typeof e === 'string' ? e : e?.name)).filter(Boolean);
  }, [exercises]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="w-full h-[100dvh] max-h-[100dvh] rounded-none sm:rounded-2xl sm:w-[94vw] sm:max-w-3xl lg:max-w-4xl sm:h-auto sm:max-h-[90vh] p-0 flex flex-col overflow-hidden border-border bg-card shadow-2xl [&>button:last-child]:hidden"
      >
        {/* Pinned Sticky Header */}
        <div className="shrink-0 bg-background/95 backdrop-blur-md p-4 sm:p-5 border-b border-border/80 safe-top">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary border border-primary/30 shrink-0">
                <Flame className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-lg font-heading font-bold tracking-tight truncate">
                  Dynamic Warmup
                </DialogTitle>
                <p className="text-xs text-muted-foreground truncate">
                  Tailored for {dayName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateAiWarmup}
                disabled={isGeneratingAi}
                className="h-8 px-2.5 text-[11px] gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                title="Tailor specifically to today's exercises with AI"
              >
                <Sparkles className={cn('w-3.5 h-3.5', isGeneratingAi && 'animate-spin text-primary')} />
                <span className="hidden xs:inline">{isGeneratingAi ? 'Tailoring…' : 'AI Tailor'}</span>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close warmup dialog"
                className="w-8 h-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Exercise-specific tags primed by today's warmup */}
          {exerciseSummary.length > 0 && (
            <div className="pt-2.5 mt-2 border-t border-border/40">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider shrink-0 mr-1">
                  Targeting:
                </span>
                {exerciseSummary.map((ex, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-muted/60 text-foreground border border-border/70 shrink-0 font-medium"
                  >
                    <Dumbbell className="w-3 h-3 text-primary opacity-70" />
                    <span>{ex}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable, Responsive Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 overscroll-contain w-full">
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Movement {currentIndex + 1} of {totalMovements}
              </span>
              <span className="font-semibold text-primary">{overallProgress}% Prepared</span>
            </div>
            <Progress value={overallProgress} className="h-1.5 bg-muted" />
          </div>

          {/* Current Movement Card */}
          <div className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-3 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30 bg-primary/10">
                    <Activity className="w-3 h-3 mr-1" />
                    {currentMovement?.target}
                  </Badge>

                  {currentMovement?.preparesExercises?.length > 0 && (
                    <Badge variant="outline" className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                      <Target className="w-3 h-3 mr-1" />
                      Prepares: {currentMovement.preparesExercises.slice(0, 2).join(', ')}
                    </Badge>
                  )}
                </div>

                <h3 className="font-heading font-bold text-base sm:text-lg text-foreground leading-snug">
                  {currentMovement?.name}
                </h3>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-semibold text-muted-foreground block">
                  {currentMovement?.reps}
                </span>
                <span className="text-[10px] text-muted-foreground">or 45s timer</span>
              </div>
            </div>

            {/* Injury Prevention Callout */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-600 dark:text-amber-400 block mb-0.5 text-xs">
                  Injury Prevention Rationale
                </span>
                <p className="text-muted-foreground text-[11px] sm:text-xs leading-relaxed">
                  {currentMovement?.injuryPrevention}
                </p>
              </div>
            </div>

            {/* Execution Cues */}
            <div className="p-3 rounded-lg bg-card border border-border/60 text-xs space-y-1">
              <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider block">
                Execution Cues
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {currentMovement?.cues}
              </p>
            </div>
          </div>

          {/* Interactive Countdown Timer & Controls */}
          <div className="p-3.5 sm:p-4 rounded-xl border border-border bg-card flex flex-col items-center justify-center gap-2.5">
            <div className="flex items-center justify-center gap-3 sm:gap-4 w-full">
              {/* Previous */}
              <Button
                variant="ghost"
                size="icon"
                disabled={currentIndex === 0}
                onClick={handlePrev}
                className="w-9 h-9 rounded-full"
                title="Previous movement"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>

              {/* Main Play/Pause Button */}
              <Button
                size="lg"
                onClick={handleToggleTimer}
                className={cn(
                  'h-12 sm:h-13 px-5 sm:px-6 rounded-2xl font-heading font-bold text-sm sm:text-base flex items-center gap-2.5 transition-all shadow-md',
                  isRunning
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                )}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause · {secondsRemaining}s</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>{secondsRemaining === currentDuration ? 'Start Timer' : 'Resume'} · {secondsRemaining}s</span>
                  </>
                )}
              </Button>

              {/* Next / Skip */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                disabled={currentIndex === totalMovements - 1}
                className="w-9 h-9 rounded-full"
                title="Next movement"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Mini timer progress bar */}
            <div className="w-full max-w-xs">
              <Progress value={timerProgress} className="h-1 bg-muted" />
            </div>
          </div>
        </div>

        {/* Pinned Modal Footer Actions */}
        <div className="shrink-0 p-3 sm:p-4 bg-muted/40 border-t border-border flex items-center justify-between gap-3 safe-bottom">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFinishWarmupAndStart}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip to Workout
          </Button>

          <Button
            onClick={handleFinishWarmupAndStart}
            className="font-heading font-semibold text-xs sm:text-sm h-10 px-4 sm:px-5 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <span>Joints Primed · Start</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
