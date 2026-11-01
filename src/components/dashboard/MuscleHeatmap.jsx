import { useState, useMemo } from 'react';
import {
  Activity,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  calculateWeeklyMuscleDistribution,
  MUSCLE_GROUPS,
} from '@/lib/muscleDistribution';

/**
 * Human Body SVG Silhouette with Dynamic Muscle Heat Zones
 */
function BodyHeatmapMap({ distribution, selectedMuscle, onSelectMuscle, mode }) {
  const [viewSide, setViewSide] = useState('front'); // 'front' | 'back'

  const muscleColorMap = useMemo(() => {
    const map = {};
    for (const mg of distribution) {
      const zone = mode === 'logged' ? mg.loggedZone : mg.plannedZone;
      map[mg.id] = zone.barColor;
    }
    return map;
  }, [distribution, mode]);

  const getHeatFill = (id, fallback = '#334155') => {
    return muscleColorMap[id] || fallback;
  };

  const getHeatOpacity = (id) => {
    const isSelected = selectedMuscle === id;
    if (selectedMuscle && !isSelected) return 0.4;
    return isSelected ? 0.95 : 0.75;
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-950/40 dark:bg-background/40 rounded-2xl border border-slate-200/80 dark:border-white/[0.06]">
      {/* Front / Back Toggle Buttons */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-muted/70 rounded-xl mb-3 text-xs">
        <button
          type="button"
          onClick={() => setViewSide('front')}
          className={`px-3 py-1 font-semibold rounded-lg transition-all ${
            viewSide === 'front'
              ? 'bg-white dark:bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Anterior (Front)
        </button>
        <button
          type="button"
          onClick={() => setViewSide('back')}
          className={`px-3 py-1 font-semibold rounded-lg transition-all ${
            viewSide === 'back'
              ? 'bg-white dark:bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Posterior (Back)
        </button>
      </div>

      {/* Anatomical Heatmap SVG */}
      <div className="relative w-48 h-64 sm:w-56 sm:h-72 flex items-center justify-center select-none">
        <svg
          viewBox="0 0 200 280"
          className="w-full h-full drop-shadow-md transition-all duration-300"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Base Head & Neck */}
          <ellipse cx="100" cy="24" rx="14" ry="18" fill="#475569" opacity="0.6" />
          <path d="M93 42 L107 42 L109 52 L91 52 Z" fill="#475569" opacity="0.6" />

          {viewSide === 'front' ? (
            /* ── ANTERIOR / FRONT VIEW ── */
            <g className="transition-all duration-300">
              {/* Shoulders / Anterior Delts */}
              <path
                d="M68 55 C60 58 54 70 56 82 C62 82 72 74 74 65 Z"
                fill={getHeatFill('shoulders')}
                opacity={getHeatOpacity('shoulders')}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M132 55 C140 58 146 70 144 82 C138 82 128 74 126 65 Z"
                fill={getHeatFill('shoulders')}
                opacity={getHeatOpacity('shoulders')}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Chest / Pectorals */}
              <path
                d="M74 58 C85 57 97 60 99 76 C94 88 78 88 72 82 C68 74 70 64 74 58 Z"
                fill={getHeatFill('chest')}
                opacity={getHeatOpacity('chest')}
                onClick={() => onSelectMuscle('chest')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M126 58 C115 57 103 60 101 76 C106 88 122 88 128 82 C132 74 130 64 126 58 Z"
                fill={getHeatFill('chest')}
                opacity={getHeatOpacity('chest')}
                onClick={() => onSelectMuscle('chest')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Biceps */}
              <path
                d="M54 84 C50 94 52 108 56 116 C60 114 64 104 62 88 Z"
                fill={getHeatFill('biceps')}
                opacity={getHeatOpacity('biceps')}
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M146 84 C150 94 148 108 144 116 C140 114 136 104 138 88 Z"
                fill={getHeatFill('biceps')}
                opacity={getHeatOpacity('biceps')}
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Forearms */}
              <path d="M52 118 C46 130 44 145 42 154 C46 154 54 136 56 122 Z" fill="#64748b" opacity="0.4" />
              <path d="M148 118 C154 130 156 145 158 154 C154 154 146 136 144 122 Z" fill="#64748b" opacity="0.4" />

              {/* Core / Abdominals */}
              <path
                d="M84 92 C94 90 106 90 116 92 C118 114 114 136 108 144 C104 148 96 148 92 144 C86 136 82 114 84 92 Z"
                fill={getHeatFill('core')}
                opacity={getHeatOpacity('core')}
                onClick={() => onSelectMuscle('core')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Quadriceps (Upper Legs) */}
              <path
                d="M80 148 C72 165 70 190 75 208 C84 210 93 192 95 168 C94 155 88 150 80 148 Z"
                fill={getHeatFill('quads')}
                opacity={getHeatOpacity('quads')}
                onClick={() => onSelectMuscle('quads')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M120 148 C128 165 130 190 125 208 C116 210 107 192 105 168 C106 155 112 150 120 148 Z"
                fill={getHeatFill('quads')}
                opacity={getHeatOpacity('quads')}
                onClick={() => onSelectMuscle('quads')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Calves (Anterior Lower Legs) */}
              <path
                d="M74 216 C70 230 72 255 76 268 C80 268 86 248 88 230 C88 220 82 216 74 216 Z"
                fill={getHeatFill('calves')}
                opacity={getHeatOpacity('calves')}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M126 216 C130 230 128 255 124 268 C120 268 114 248 112 230 C112 220 118 216 126 216 Z"
                fill={getHeatFill('calves')}
                opacity={getHeatOpacity('calves')}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
            </g>
          ) : (
            /* ── POSTERIOR / BACK VIEW ── */
            <g className="transition-all duration-300">
              {/* Rear Delts & Traps */}
              <path
                d="M82 48 C92 46 108 46 118 48 C126 56 138 65 142 74 C132 76 126 70 120 66 C108 64 92 64 80 66 C74 70 68 76 58 74 C62 65 74 56 82 48 Z"
                fill={getHeatFill('shoulders')}
                opacity={getHeatOpacity('shoulders')}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Back & Lats */}
              <path
                d="M72 68 C84 66 116 66 128 68 C124 94 116 118 108 132 C104 135 96 135 92 132 C84 118 76 94 72 68 Z"
                fill={getHeatFill('back')}
                opacity={getHeatOpacity('back')}
                onClick={() => onSelectMuscle('back')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Triceps */}
              <path
                d="M55 80 C52 92 50 108 55 116 C60 114 64 104 63 86 Z"
                fill={getHeatFill('triceps')}
                opacity={getHeatOpacity('triceps')}
                onClick={() => onSelectMuscle('triceps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M145 80 C148 92 150 108 145 116 C140 114 136 104 137 86 Z"
                fill={getHeatFill('triceps')}
                opacity={getHeatOpacity('triceps')}
                onClick={() => onSelectMuscle('triceps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Hamstrings & Glutes (Posterior Thighs) */}
              <path
                d="M80 142 C72 165 70 192 76 210 C85 212 94 195 96 168 C96 150 90 144 80 142 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getHeatOpacity('hamstrings_glutes')}
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M120 142 C128 165 130 192 124 210 C115 212 106 195 104 168 C104 150 110 144 120 142 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getHeatOpacity('hamstrings_glutes')}
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />

              {/* Calves (Gastrocnemius / Soleus) */}
              <path
                d="M74 216 C68 230 70 255 76 268 C82 268 88 248 88 230 C88 220 82 216 74 216 Z"
                fill={getHeatFill('calves')}
                opacity={getHeatOpacity('calves')}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
              <path
                d="M126 216 C132 230 130 255 124 268 C118 268 112 248 112 230 C112 220 118 216 126 216 Z"
                fill={getHeatFill('calves')}
                opacity={getHeatOpacity('calves')}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer hover:brightness-125 transition-all"
              />
            </g>
          )}
        </svg>

        {/* Selected Muscle Indicator on Anatomy */}
        {selectedMuscle && (
          <div className="absolute bottom-1 bg-background/90 backdrop-blur-md border border-border px-2.5 py-1 rounded-lg text-[10px] font-semibold text-foreground shadow-xs">
            Viewing: {MUSCLE_GROUPS.find((m) => m.id === selectedMuscle)?.name}
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 text-center">
        Tap any body region to inspect weekly sets and fatigue zone
      </p>
    </div>
  );
}

/**
 * Main Visual Weekly Muscle Heatmap Component
 */
export default function MuscleHeatmap({
  program = null,
  logs = [],
  currentWeekNum = 1,
  className = '',
}) {
  const [mode, setMode] = useState('plan'); // 'plan' (program schedule) | 'logged' (actual activity)
  const [regionFilter, setRegionFilter] = useState('all'); // 'all' | 'upper' | 'lower' | 'core'
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [showLegend, setShowLegend] = useState(false);

  // Compute weekly distribution
  const distributionData = useMemo(() => {
    return calculateWeeklyMuscleDistribution({
      program,
      logs,
      currentWeekNum,
    });
  }, [program, logs, currentWeekNum]);

  const { muscleGroups, totalPlannedSets, totalLoggedSets, pushPullRatio, insights } =
    distributionData;

  const currentTotalSets = mode === 'logged' ? totalLoggedSets : totalPlannedSets;

  const filteredGroups = useMemo(() => {
    if (regionFilter === 'all') return muscleGroups;
    return muscleGroups.filter((mg) => mg.region === regionFilter);
  }, [muscleGroups, regionFilter]);

  const selectedGroupDetails = useMemo(() => {
    if (!selectedMuscle) return null;
    return muscleGroups.find((mg) => mg.id === selectedMuscle);
  }, [muscleGroups, selectedMuscle]);

  return (
    <Card className={`p-4 sm:p-5 overflow-hidden ${className}`}>
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-heading font-bold text-sm tracking-tight text-foreground">
                Weekly Muscle Heatmap
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{currentTotalSets} working sets</span>
                <span aria-hidden="true">·</span>
                <span>Week {currentWeekNum}</span>
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle: Logged vs Program Plan */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-muted/70 rounded-xl self-start sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => setMode('plan')}
            className={`px-3 py-1 font-semibold rounded-lg transition-all ${
              mode === 'plan'
                ? 'bg-white dark:bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Program Schedule
          </button>
          <button
            type="button"
            onClick={() => setMode('logged')}
            className={`px-3 py-1 font-semibold rounded-lg transition-all ${
              mode === 'logged'
                ? 'bg-white dark:bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Logged Workouts ({distributionData.activeLogsCount})
          </button>
        </div>
      </div>

      {/* Main Heatmap Visual Split: Anatomy Map (Left) + Distribution Bars (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        {/* Anatomical Heatmap */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <BodyHeatmapMap
            distribution={muscleGroups}
            selectedMuscle={selectedMuscle}
            onSelectMuscle={(id) => setSelectedMuscle(selectedMuscle === id ? null : id)}
            mode={mode}
          />

          {/* Quick Push/Pull Diagnostic Badge */}
          <div className="w-full mt-3 p-3 bg-muted/40 rounded-xl border border-border/60 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Push : Pull Balance</span>
            <span className="font-heading font-bold text-foreground">
              {mode === 'logged' ? pushPullRatio.logged : pushPullRatio.plan} : 1.0
            </span>
          </div>
        </div>

        {/* Muscle Distribution Breakdown List */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          {/* Anatomical Region Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-muted/50 rounded-xl mb-3 text-xs overflow-x-auto">
            {[
              { id: 'all', label: 'All Groups' },
              { id: 'upper', label: 'Upper Body' },
              { id: 'lower', label: 'Lower Body' },
              { id: 'core', label: 'Core' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRegionFilter(tab.id)}
                className={`px-2.5 py-1 font-medium rounded-lg whitespace-nowrap transition-all ${
                  regionFilter === tab.id
                    ? 'bg-white dark:bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Muscle Heat Bars */}
          <div className="space-y-2.5">
            {filteredGroups.map((mg) => {
              const sets = mode === 'logged' ? mg.loggedSets : mg.plannedSets;
              const zone = mode === 'logged' ? mg.loggedZone : mg.plannedZone;
              const isSelected = selectedMuscle === mg.id;

              // Percentage for the bar relative to MRV (e.g. 24 sets)
              const percentage = Math.min(100, Math.round((sets / mg.mrv) * 100));

              return (
                <div
                  key={mg.id}
                  onClick={() => setSelectedMuscle(isSelected ? null : mg.id)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/60 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: zone.barColor }}
                      />
                      <span className="font-semibold text-foreground">{mg.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-foreground">
                        {sets}{' '}
                        <span className="text-[10px] font-normal text-muted-foreground">
                          sets
                        </span>
                      </span>

                      {/* Clean Status Badge */}
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${zone.bgClass}`}
                      >
                        {zone.label}
                      </span>
                    </div>
                  </div>

                  {/* Heatmap Range Bar */}
                  <div className="relative w-full h-2 bg-slate-200 dark:bg-muted rounded-full overflow-hidden">
                    {/* Optimal Target Zone indicator (shaded 10-18 range) */}
                    <div
                      className="absolute top-0 bottom-0 bg-emerald-500/15 border-x border-emerald-500/30"
                      style={{
                        left: `${(mg.targetMin / mg.mrv) * 100}%`,
                        width: `${((mg.targetMax - mg.targetMin) / mg.mrv) * 100}%`,
                      }}
                      title="Optimal Hypertrophy Stimulus Zone (10-18 sets)"
                    />

                    {/* Dynamic Set Fill */}
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(percentage, sets > 0 ? 6 : 0)}%`,
                        backgroundColor: zone.barColor,
                      }}
                    />
                  </div>

                  {/* Target guide text */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Target: {mg.targetMin}–{mg.targetMax} sets/wk</span>
                    <span>MRV: {mg.mrv} sets</span>
                  </div>

                  {/* Expanded Contributor Details */}
                  {isSelected && (
                    <div className="mt-2.5 pt-2.5 border-t border-border/60 text-xs">
                      <p className="text-[11px] font-medium text-foreground mb-1">
                        {zone.description}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        💡 <span className="font-medium text-foreground">Kael's Cue:</span>{' '}
                        {zone.advice}
                      </p>

                      {/* Contributing exercises */}
                      {mg.contributors[mode]?.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Contributing Exercises:
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {mg.contributors[mode].map((ex, i) => (
                              <span
                                key={i}
                                className="text-[10px] bg-muted px-2 py-0.5 rounded text-foreground font-mono"
                              >
                                {ex.name} ({ex.sets} sets)
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                          No exercises mapped to this group for this period yet.
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

      {/* Diagnostic Insights Panel */}
      {insights.length > 0 && (
        <div className="space-y-2 mb-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Volume & Fatigue Diagnostics
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
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
                  <p className="text-[11px] opacity-90 mt-0.5">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scientific Volume Landmarks Legend Toggle */}
      <div className="pt-3 border-t border-border/60">
        <button
          type="button"
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            <span>Scientific Volume Landmark Reference Guide</span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${showLegend ? 'rotate-180' : ''}`}
          />
        </button>

        {showLegend && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
              <span className="font-bold text-sky-500 block">&lt; 6 sets</span>
              <span className="font-semibold text-foreground">Undertrained</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Sub-optimal stimulus; gains are stalled.
              </p>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="font-bold text-blue-500 block">6–9 sets</span>
              <span className="font-semibold text-foreground">Maintenance</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Maintains size; low fatigue.
              </p>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="font-bold text-emerald-500 block">10–18 sets</span>
              <span className="font-semibold text-foreground">Optimal Sweet Spot</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Maximal progress with safe recovery.
              </p>
            </div>
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="font-bold text-amber-500 block">19–24 sets</span>
              <span className="font-semibold text-foreground">High Stimulus</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Near recovery limit; high fatigue.
              </p>
            </div>
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 col-span-2 sm:col-span-1">
              <span className="font-bold text-rose-500 block">&gt; 24 sets</span>
              <span className="font-semibold text-foreground">Overtraining</span>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Diminishing returns; overuse risk.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
