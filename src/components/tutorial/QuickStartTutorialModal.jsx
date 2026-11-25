import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Dumbbell,
  Zap,
  Camera,
  User,
  Settings,
  Compass,
  Eye,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  ArrowUpRight,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import {
  OPEN_QUICK_START_EVENT,
  consumeQuickStartReady,
  markQuickStartCompleted,
} from '@/lib/quickStartTutorial';

const NON_TUTORIAL_PATHS = [
  '/onboarding',
  '/login',
  '/reset-password',
  '/live-workout',
  '/subscription-return',
  '/subscription/return',
  '/subscription-success',
  '/checkout/success',
  '/checkout/return',
  '/success',
  '/welcome',
  '/terms',
  '/privacy',
];

const TUTORIAL_STEPS = [
  {
    id: 'home',
    shortLabel: 'Home',
    navHighlight: 'home',
    icon: Home,
    title: 'Your Daily Home Hub',
    where: 'Home tab — bottom bar on mobile · left sidebar on desktop',
    summary:
      'Everything you need for today sits right on your Home screen. Check your daily streak, start today’s workout, keep an eye on your macro targets, and review your Weekly Check-In.',
    tips: [
      'Tap "Start Workout" on Today’s Workout card to begin tracking sets and rest timers right away.',
      'Your Daily Streak tracks your scheduled training days automatically without breaking on rest days.',
      'Scroll down on Home to reach Performance Tools anytime.',
    ],
    route: '/',
    routeLabel: 'Go to Home',
  },
  {
    id: 'program',
    shortLabel: 'Program',
    navHighlight: 'program',
    icon: Dumbbell,
    title: '12-Week Program & Live Workouts',
    where: 'Program tab — bottom bar on mobile · left sidebar on desktop',
    summary:
      'Your personalized 12-week plan adapts around the schedule and training style you picked in onboarding. Browse the Overview or open any day in Weekly Plan to see exercises, sets, reps, and weights.',
    tips: [
      'Tap any training day (or "Start Workout") to enter Live Workout mode with built-in rest timers and weight logging.',
      'Need to swap an exercise mid-set? Use the adjust option during a live session or ask Coach Kael.',
      'Completed sessions automatically save to your Progress history.',
    ],
    route: '/program',
    routeLabel: 'Open Program',
  },
  {
    id: 'kael',
    shortLabel: 'Kael',
    navHighlight: 'kael',
    icon: Zap,
    title: 'Coach Kael — 24/7 AI Coaching',
    where: 'Kael tab (lightning icon) — bottom bar on mobile · left sidebar on desktop',
    summary:
      'Coach Kael already knows your active training split, logged workouts, benchmarks, and daily nutrition targets. Ask for exercise form tips, recovery advice, substitutions, or program help anytime.',
    tips: [
      'Message Kael like a real coach whenever you are unsure about weights, progression, or fatigue.',
      'On Progress+, Kael can update your workouts or logs for you when you ask.',
      'Your monthly Kael message count resets automatically on the 1st of each month.',
    ],
    route: '/kael',
    routeLabel: 'Chat with Kael',
  },
  {
    id: 'nutrition',
    shortLabel: 'Nutrition',
    navHighlight: 'nutrition',
    icon: Camera,
    title: 'Daily Calories, Macros & Food Scanning',
    where: 'Nutrition tab (camera icon) — bottom bar on mobile · left sidebar on desktop',
    summary:
      'Track daily calories, protein, carbs, and fats calibrated to your body stats and training goals. Log foods manually, save go-to meals for one-tap logging, or scan meals and barcodes.',
    tips: [
      'Use "+ Add Food" or Saved Meals to build fast daily logs without re-typing.',
      'AI Food Photo Scan and Barcode Scanner (Progress+) estimate macros in seconds.',
      'Your macro totals reset cleanly each midnight in your local timezone.',
    ],
    route: '/nutrition',
    routeLabel: 'Open Nutrition',
  },
  {
    id: 'tools',
    shortLabel: 'Tools',
    navHighlight: 'home',
    icon: Eye,
    title: 'Progress Photos, Form Lab & Muscle Heatmap',
    where: 'Scroll to "Performance Tools" on Home · or open from Me → Progress',
    summary:
      'Track visual physique changes, analyze lifting or calisthenics form on video, and monitor which muscle groups are getting the most weekly volume.',
    tips: [
      'Progress Photos: Save dated physique photos privately and track body-composition trends (AI analysis on Performance+).',
      'Form Lab: Upload or record calisthenics or weightlifting sets for form scoring, rep counting, and drill fixes (Elite).',
      'Muscle Heatmap: See weekly sets and recovery balance across every muscle group.',
    ],
    route: '/muscle-heatmap',
    routeLabel: 'View Muscle Heatmap',
  },
  {
    id: 'profile',
    shortLabel: 'Me & Settings',
    navHighlight: 'profile',
    icon: User,
    title: 'Athlete Profile, Analytics & Settings',
    where: 'Me tab (navigation) · Settings gear icon (top-right header on mobile · Me page top-right on desktop)',
    summary:
      'Manage your body stats, personal records, Progress & Analytics, and membership tier in the Me tab. Open the Settings gear icon anytime to change theme, units, language, or start a new program.',
    tips: [
      'Switch Dark/Light mode or Imperial (lbs) / Metric (kg) inside the Gear icon → App Settings.',
      'Want to change goals or training style later? Tap "Generate New Program" inside App Settings (7-day cooldown).',
      'You can replay this Quick Start Tutorial anytime inside App Settings.',
    ],
    route: '/profile',
    routeLabel: 'Open Me Tab',
  },
];

const NAV_PREVIEW = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'program', label: 'Program', icon: Dumbbell },
  { id: 'kael', label: 'Kael', icon: Zap },
  { id: 'nutrition', label: 'Nutrition', icon: Camera },
  { id: 'profile', label: 'Me', icon: User },
];

export default function QuickStartTutorialModal() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [launchedManually, setLaunchedManually] = useState(false);

  const closeAndPersist = useCallback(() => {
    if (user) {
      markQuickStartCompleted(user);
    }
    setOpen(false);
  }, [user]);

  // Listen for manual launches from App Settings anywhere in the app
  useEffect(() => {
    const handleOpenManual = () => {
      setStepIndex(0);
      setLaunchedManually(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_QUICK_START_EVENT, handleOpenManual);
    return () => {
      window.removeEventListener(OPEN_QUICK_START_EVENT, handleOpenManual);
    };
  }, []);

  // Auto-launch strictly after a brand-new account finishes onboarding and lands in the main app
  useEffect(() => {
    if (!isAuthenticated || !user || open) return;
    const isBlockedPath = NON_TUTORIAL_PATHS.some((p) => location.pathname.startsWith(p));
    if (isBlockedPath) return;
    if (user.onboarded === false) return;

    const timer = window.setTimeout(() => {
      if (consumeQuickStartReady(user)) {
        setStepIndex(0);
        setLaunchedManually(false);
        setOpen(true);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, user, location.pathname, open]);

  // Escape key dismissal
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeAndPersist();
      } else if (e.key === 'ArrowRight') {
        setStepIndex((prev) => Math.min(TUTORIAL_STEPS.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeAndPersist]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const step = TUTORIAL_STEPS[stepIndex] || TUTORIAL_STEPS[0];
  const StepIcon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  const handleJumpToPage = () => {
    closeAndPersist();
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10500] flex items-end sm:items-center justify-center sm:p-6 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-start-title"
    >
      {/* Backdrop click skips/closes */}
      <div
        className="absolute inset-0"
        onClick={closeAndPersist}
        aria-hidden="true"
      />

      <section className="relative z-10 w-full sm:max-w-lg max-h-[92dvh] rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
        {/* Top bar: unboxed metadata + Skip button */}
        <header className="shrink-0 flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-border/80">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Compass className="w-4 h-4 text-primary shrink-0" />
            <span>Quick Start</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={closeAndPersist}
            className="min-h-[44px] px-3 -mr-1 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Skip tutorial</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
          {/* Progress indicator + clickable step selector */}
          <div className="grid grid-cols-6 gap-1.5" role="tablist" aria-label="Tutorial steps">
            {TUTORIAL_STEPS.map((item, idx) => {
              const active = idx === stepIndex;
              const visited = idx < stepIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStepIndex(idx)}
                  className="group flex flex-col items-center gap-1.5 py-1 cursor-pointer focus-visible:outline-none"
                >
                  <div
                    className={cn(
                      'w-full h-1.5 rounded-full transition-colors duration-150',
                      active
                        ? 'bg-primary'
                        : visited
                          ? 'bg-primary/45'
                          : 'bg-muted group-hover:bg-muted-foreground/30'
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px] leading-none truncate max-w-full transition-colors',
                      active
                        ? 'font-semibold text-primary'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    {item.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Step Heading */}
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
              <StepIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="quick-start-title"
                className="font-heading font-bold text-xl text-foreground tracking-tight leading-snug"
              >
                {step.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1.5">
                {step.summary}
              </p>
            </div>
          </div>

          {/* Where to find it + Visual Navigation Map */}
          <div className="rounded-2xl border border-border bg-muted/25 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  Where to find it
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  {step.where}
                </p>
              </div>
            </div>

            {/* Interactive Mini Navigation Map showing the 5 core app tabs + Settings gear */}
            <div className="pt-2 border-t border-border/60">
              <div className="flex items-center justify-between gap-1">
                <div className="grid grid-cols-5 gap-1 flex-1">
                  {NAV_PREVIEW.map((nav) => {
                    const NavIcon = nav.icon;
                    const highlighted = step.navHighlight === nav.id;
                    return (
                      <div
                        key={nav.id}
                        className={cn(
                          'flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-center transition-colors',
                          highlighted
                            ? 'bg-primary/12 border-primary/40 text-primary'
                            : 'bg-background/50 border-transparent text-muted-foreground/75'
                        )}
                      >
                        <NavIcon className="w-4 h-4" strokeWidth={highlighted ? 2.4 : 1.75} />
                        <span className="text-[10px] font-medium mt-1 leading-none">
                          {nav.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {step.id === 'profile' && (
                  <div className="flex flex-col items-center justify-center py-2 px-2.5 rounded-xl border bg-primary/12 border-primary/40 text-primary shrink-0">
                    <Settings className="w-4 h-4" />
                    <span className="text-[10px] font-medium mt-1 leading-none">
                      Settings
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Practical How-To List */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-foreground">
              How it works
            </p>
            <ul className="space-y-2.5">
              {step.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-1" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Direct quick jump button */}
          <div className="pt-1 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleJumpToPage}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline min-h-[40px] cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{step.routeLabel}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            {!launchedManually && (
              <span className="text-xs text-muted-foreground text-right">
                Replay anytime in Settings
              </span>
            )}
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <footer
          className="shrink-0 border-t border-border/80 bg-card px-5 pt-3 flex items-center justify-between gap-3"
          style={{
            paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))',
          }}
        >
          {isFirst ? (
            <Button
              type="button"
              variant="outline"
              onClick={closeAndPersist}
              className="min-h-[44px] h-11 px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Skip
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              className="min-h-[44px] h-11 px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}

          {isLast ? (
            <Button
              type="button"
              onClick={closeAndPersist}
              className="flex-1 min-h-[44px] h-11 px-5 rounded-xl font-heading font-semibold text-sm whitespace-nowrap"
            >
              Start Training
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setStepIndex((prev) => Math.min(TUTORIAL_STEPS.length - 1, prev + 1))}
              className="flex-1 min-h-[44px] h-11 px-5 rounded-xl font-heading font-semibold text-sm whitespace-nowrap"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}
