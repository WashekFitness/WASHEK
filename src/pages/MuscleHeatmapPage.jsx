import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  Flame,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  Dumbbell,
  Target,
  ChevronDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RealisticAnatomyMap from '@/components/dashboard/RealisticAnatomyMap';
import {
  calculateWeeklyMuscleDistribution,
  MUSCLE_GROUPS,
} from '@/lib/muscleDistribution';
import { supabaseApi } from '@/lib/supabaseApi';
import { normalizeWorkoutProgram } from '@/lib/expandMicrocycles';
import {
  getCachedLogs,
  getCachedProgramsList,
} from '@/lib/cacheStore';

export default function MuscleHeatmapPage() {
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => supabaseApi.auth.me(),
  });

  const storedUser = (() => {
    try {
      const raw = localStorage.getItem('washek_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const effectiveUser = user || storedUser;
  const userKey = effectiveUser?.email || effectiveUser?.id || 'athlete';

  const { data: programs = [] } = useQuery({
    queryKey: ['programs', userKey],
    queryFn: async () => {
      return await supabaseApi.entities.WorkoutProgram.filter(
        { status: 'active' },
        '-created_at',
        5
      );
    },
    initialData: () => getCachedProgramsList(userKey),
    staleTime: 5 * 60 * 1000,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['logs', userKey],
    queryFn: async () => {
      const emailFilter = effectiveUser?.email;
      return await supabaseApi.entities.WorkoutLog.filter(
        emailFilter ? { created_by: emailFilter } : { created_by: userKey },
        '-date',
        100
      );
    },
    initialData: () => getCachedLogs(userKey),
    staleTime: 5 * 60 * 1000,
  });

  const activeProgram = programs[0] ? normalizeWorkoutProgram(programs[0]) : null;
  const currentWeekNum = activeProgram?.current_week || 1;

  // View state
  const [mode, setMode] = useState('logged'); // 'logged' (actual sets/reps) | 'plan' (program target)
  const [regionFilter, setRegionFilter] = useState('all'); // 'all' | 'upper' | 'lower' | 'core'
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [showLegend, setShowLegend] = useState(false);

  // Compute distribution based on real sets, reps, and hold times
  const distributionData = useMemo(() => {
    return calculateWeeklyMuscleDistribution({
      program: activeProgram,
      logs,
      currentWeekNum,
    });
  }, [activeProgram, logs, currentWeekNum]);

  const {
    muscleGroups,
    totalPlannedSets,
    totalLoggedSets,
    totalPlannedReps,
    totalLoggedReps,
    totalPlannedHold,
    totalLoggedHold,
    pushPullRatio,
    insights,
    activeLogsCount,
  } = distributionData;

  const currentTotalSets = mode === 'logged' ? totalLoggedSets : totalPlannedSets;
  const currentTotalReps = mode === 'logged' ? totalLoggedReps : totalPlannedReps;
  const currentTotalHold = mode === 'logged' ? totalLoggedHold : totalPlannedHold;

  const filteredGroups = useMemo(() => {
    if (regionFilter === 'all') return muscleGroups;
    return muscleGroups.filter((mg) => mg.region === regionFilter);
  }, [muscleGroups, regionFilter]);

  const selectedGroupDetails = useMemo(() => {
    if (!selectedMuscle) return null;
    return muscleGroups.find((mg) => mg.id === selectedMuscle);
  }, [muscleGroups, selectedMuscle]);

  return (
    <div className="px-4 sm:px-6 pb-12 pt-2 max-w-6xl mx-auto">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="w-9 h-9 rounded-xl hover:bg-muted active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 pointer-events-none" />
        </Button>

        <div>
          <h1 className="font-heading font-bold text-xl sm:text-2xl tracking-tight text-foreground">
            Muscle Heatmap
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Weekly muscle group training distribution & fatigue optimization
          </p>
        </div>
      </div>

      {/* Mode & Perspective Segmented Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-card p-3 rounded-2xl border border-border/80 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-muted/70 rounded-xl text-xs w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setMode('logged')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 font-semibold rounded-lg transition-all ${
              mode === 'logged'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Actual Workouts ({activeLogsCount} logged)
          </button>
          <button
            type="button"
            onClick={() => setMode('plan')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 font-semibold rounded-lg transition-all ${
              mode === 'plan'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Program Plan (Week {currentWeekNum})
          </button>
        </div>

        {/* Global Summary Stats */}
        <div className="flex items-center gap-4 text-xs px-2">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">
              Volume
            </span>
            <span className="font-heading font-bold text-foreground text-sm">
              {currentTotalSets} sets
            </span>
          </div>
          <div className="h-6 w-px bg-border/80" />
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">
              Reps Done
            </span>
            <span className="font-heading font-bold text-foreground text-sm">
              {currentTotalReps} reps
            </span>
          </div>
          <div className="h-6 w-px bg-border/80" />
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">
              Hold Time
            </span>
            <span className="font-heading font-bold text-foreground text-sm">
              {currentTotalHold}s
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout: Realistic Anatomy (Left) + Breakdown Cards (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Anatomical Heatmap Vector Model */}
        <div className="lg:col-span-5 flex flex-col">
          <RealisticAnatomyMap
            distribution={muscleGroups}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={(id) => setSelectedMuscle(selectedMuscle === id ? null : id)}
            mode={mode}
          />

          {/* Symmetrical Structural Balance Box */}
          <div className="mt-4 p-4 rounded-2xl bg-card border border-border/80 shadow-xs">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-foreground">Push : Pull Structural Balance</span>
              <span className="font-heading font-bold text-foreground">
                {mode === 'logged' ? pushPullRatio.logged : pushPullRatio.plan} : 1.0
              </span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    (parseFloat(mode === 'logged' ? pushPullRatio.logged : pushPullRatio.plan) /
                      2) *
                      100
                  )}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Target balance is 0.90 – 1.25. Keeps anterior and posterior shoulder stabilizers aligned to prevent impingement.
            </p>
          </div>
        </div>

        {/* Muscle Group List & Set/Rep Breakdown */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          {/* Anatomical Region Segmented Filter */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-muted/60 rounded-xl mb-4 text-xs overflow-x-auto">
            {[
              { id: 'all', label: 'All Muscle Groups' },
              { id: 'upper', label: 'Upper Body' },
              { id: 'lower', label: 'Lower Body' },
              { id: 'core', label: 'Core & Abs' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRegionFilter(tab.id)}
                className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap transition-all ${
                  regionFilter === tab.id
                    ? 'bg-white dark:bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Muscle Cards List */}
          <div className="space-y-3">
            {filteredGroups.map((mg) => {
              const sets = mode === 'logged' ? mg.loggedSets : mg.plannedSets;
              const reps = mode === 'logged' ? mg.loggedReps : mg.plannedReps;
              const holdSecs = mode === 'logged' ? mg.loggedHoldSeconds : mg.plannedHoldSeconds;
              const zone = mode === 'logged' ? mg.loggedZone : mg.plannedZone;
              const isSelected = selectedMuscle === mg.id;

              const percentage = Math.min(100, Math.round((sets / mg.mrv) * 100));

              return (
                <div
                  key={mg.id}
                  onClick={() => setSelectedMuscle(isSelected ? null : mg.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs'
                      : 'border-border/70 hover:border-border hover:bg-muted/30 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: zone.barColor }}
                      />
                      <div>
                        <span className="font-heading font-bold text-foreground text-sm">
                          {mg.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground block -mt-0.5">
                          {mg.anatomicalLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 text-right">
                      <div>
                        <span className="font-heading font-bold text-foreground text-sm block">
                          {sets}{' '}
                          <span className="text-[10px] font-normal text-muted-foreground">
                            sets
                          </span>
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          {holdSecs > 0 ? `${holdSecs}s hold` : `${reps} reps`}
                        </span>
                      </div>

                      {/* Scientific Status Badge */}
                      <span
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded-md border ${zone.bgClass}`}
                      >
                        {zone.label}
                      </span>
                    </div>
                  </div>

                  {/* Volume Benchmark Heat Bar */}
                  <div className="relative w-full h-2.5 bg-slate-200 dark:bg-muted/80 rounded-full overflow-hidden mt-2">
                    {/* Optimal Adaptive Volume Zone (10-18 sets) Shaded Marker */}
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-500/20 border-x border-emerald-500/40"
                      style={{
                        left: `${(mg.targetMin / mg.mrv) * 100}%`,
                        width: `${((mg.targetMax - mg.targetMin) / mg.mrv) * 100}%`,
                      }}
                      title="Optimal Stimulus Zone (10-18 sets)"
                    />

                    {/* Dynamic Set Fill */}
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(percentage, sets > 0 ? 5 : 0)}%`,
                        backgroundColor: zone.barColor,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5 font-mono">
                    <span>Min Effective: {mg.targetMin} sets</span>
                    <span className="text-emerald-500 font-semibold">Sweet Spot: {mg.targetMin}–{mg.targetMax}</span>
                    <span>MRV: {mg.mrv} sets</span>
                  </div>

                  {/* Expanded Contributor Details (Actual exercises and reps achieved) */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-border/80 text-xs animate-in fade-in duration-200">
                      <p className="text-[11px] font-medium text-foreground mb-1">
                        {zone.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        💡 <span className="font-semibold text-foreground">Coach Kael's Take:</span>{' '}
                        {zone.advice}
                      </p>

                      {/* Contributing Exercise History */}
                      {mg.contributors[mode]?.length > 0 ? (
                        <div className="mt-2.5 space-y-1.5">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Actual Exercise Breakdown:
                          </p>
                          <div className="grid grid-cols-1 gap-1.5 mt-1">
                            {mg.contributors[mode].map((ex, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between bg-muted/60 px-3 py-1.5 rounded-lg text-xs"
                              >
                                <span className="font-semibold text-foreground">
                                  {ex.name}
                                </span>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {ex.sets} sets · {ex.displayText}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-2 italic">
                          No logged movements recorded for this muscle group in the selected period.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Diagnostics & Overtraining Alerts Panel */}
      {insights.length > 0 && (
        <Card className="p-4 sm:p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-accent" />
            <p className="font-heading font-bold text-sm text-foreground">
              Volume & Fatigue Diagnostics
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                  insight.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                    : insight.type === 'info'
                      ? 'bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                }`}
              >
                {insight.type === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                ) : insight.type === 'info' ? (
                  <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{insight.title}</p>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Scientific Volume Landmark Reference Guide */}
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-primary" />
            <span className="font-heading font-bold text-foreground">
              Volume Landmark Reference Guide (Sets/Week)
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${showLegend ? 'rotate-180' : ''}`}
          />
        </button>

        {showLegend && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <span className="font-bold text-sky-500 block text-sm">&lt; 6 sets</span>
              <span className="font-semibold text-foreground mt-0.5 block">Undertrained</span>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                Below Minimum Effective Dose. Insufficient stimulus to drive ongoing hypertrophy.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="font-bold text-blue-500 block text-sm">6–9 sets</span>
              <span className="font-semibold text-foreground mt-0.5 block">Maintenance</span>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                Preserves muscle mass and tendon integrity with almost zero systemic fatigue.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="font-bold text-emerald-500 block text-sm">10–18 sets</span>
              <span className="font-semibold text-foreground mt-0.5 block">Optimal Stimulus (MAV)</span>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                Maximum Adaptive Volume. Sweet spot for maximum rate of muscle & strength gains.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="font-bold text-amber-500 block text-sm">19–24 sets</span>
              <span className="font-semibold text-foreground mt-0.5 block">High Fatigue</span>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                Overreaching zone. High mechanical tension accompanied by heavy fatigue debt.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="font-bold text-rose-500 block text-sm">&gt; 24 sets</span>
              <span className="font-semibold text-foreground mt-0.5 block">Overtraining (&gt; MRV)</span>
              <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                Exceeds recovery capacity. Diminishing gains, joint soreness, and injury risk.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
