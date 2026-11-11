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
      <div className="relative w-52 h-76 sm:w-60 sm:h-84 flex items-center justify-center select-none">
        <svg
          viewBox="0 0 200 300"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full drop-shadow-md transition-all duration-300"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Base Head & Neck (Sculpted Athletic Cranium & Jaw) */}
          <ellipse cx="100" cy="18" rx="8.5" ry="11.5" fill="#334155" opacity="0.8" />
          <path d="M93 21 L95 28 Q100 32 105 28 L107 21 Z" fill="#334155" opacity="0.85" />
          <path d="M96 28 L95 38 L105 38 L104 28 Z" fill="#1e293b" opacity="0.9" />

          {viewSide === 'front' ? (
            /* ── ANTERIOR / FRONT VIEW (Ultra-Aesthetic Men's Physique Golden Ratio) ── */
            <g className="transition-all duration-300">
              {/* Upper Trapezius (Clavicular Slope) */}
              <g
                onClick={() => onSelectMuscle('traps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                <path
                  d="M95 30 C91 35 83 39 71 43 L75 45 C85 41 93 37 96 32 Z"
                  fill={getHeatFill('traps')}
                  opacity={getHeatOpacity('traps')}
                />
                <path
                  d="M105 30 C109 35 117 39 129 43 L125 45 C115 41 107 37 104 32 Z"
                  fill={getHeatFill('traps')}
                  opacity={getHeatOpacity('traps')}
                />
              </g>

              {/* Shoulders / Lateral & Anterior Deltoid Capping (Broad 3D Caps) */}
              <g
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Deltoid */}
                <path
                  d="M71 42 C56 44 49 53 49 64 C49 74 57 80 62 80 C65 77 67 71 68 63 C68 55 69 47 71 42 Z"
                  fill={getHeatFill('shoulders')}
                  opacity={getHeatOpacity('shoulders')}
                />
                {/* Right Deltoid */}
                <path
                  d="M129 42 C144 44 151 53 151 64 C151 74 143 80 138 80 C135 77 133 71 132 63 C132 55 131 47 129 42 Z"
                  fill={getHeatFill('shoulders')}
                  opacity={getHeatOpacity('shoulders')}
                />
              </g>

              {/* Chest / Sculpted Upper Pectoral Shelf */}
              <g
                onClick={() => onSelectMuscle('chest')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Pec */}
                <path
                  d="M99 43 C88 42 77 43 70 46 C66 56 66 66 67 72 C74 78 88 80 99 79 Z"
                  fill={getHeatFill('chest')}
                  opacity={getHeatOpacity('chest')}
                />
                {/* Right Pec */}
                <path
                  d="M101 43 C112 42 123 43 130 46 C134 56 134 66 133 72 C126 78 112 80 101 79 Z"
                  fill={getHeatFill('chest')}
                  opacity={getHeatOpacity('chest')}
                />
                <line x1="100" y1="41" x2="100" y2="80" stroke="#0f172a" strokeWidth="0.8" opacity="0.6" />
              </g>

              {/* Lats (Sleek V-Taper visible from front) */}
              <g
                onClick={() => onSelectMuscle('back')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Lat Wing */}
                <path
                  d="M68 74 C65 82 66 92 70 104 C74 106 77 101 78 93 C77 86 73 78 68 74 Z"
                  fill={getHeatFill('back')}
                  opacity={getHeatOpacity('back')}
                />
                {/* Right Lat Wing */}
                <path
                  d="M132 74 C135 82 134 92 130 104 C126 106 123 101 122 93 C123 86 127 78 132 74 Z"
                  fill={getHeatFill('back')}
                  opacity={getHeatOpacity('back')}
                />
              </g>

              {/* Biceps & Forearms (Athletic & Sculpted) */}
              <g
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Bicep */}
                <path
                  d="M62 80 C54 81 50 89 50 99 C52 105 56 107 59 107 C62 107 65 101 66 93 C66 88 65 82 62 80 Z"
                  fill={getHeatFill('biceps')}
                  opacity={getHeatOpacity('biceps')}
                />
                {/* Right Bicep */}
                <path
                  d="M138 80 C146 81 150 89 150 99 C148 105 144 107 141 107 C138 107 135 101 134 93 C134 88 135 82 138 80 Z"
                  fill={getHeatFill('biceps')}
                  opacity={getHeatOpacity('biceps')}
                />
                {/* Left Forearm */}
                <path
                  d="M59 107 C51 110 48 123 52 138 C54 146 57 149 59 149 C62 149 64 143 65 132 C65 121 62 112 59 107 Z"
                  fill={getHeatFill('biceps')}
                  opacity={getHeatOpacity('biceps')}
                />
                {/* Right Forearm */}
                <path
                  d="M141 107 C149 110 152 123 148 138 C146 146 143 149 141 149 C138 149 136 143 135 132 C135 121 138 112 141 107 Z"
                  fill={getHeatFill('biceps')}
                  opacity={getHeatOpacity('biceps')}
                />
                {/* Hands */}
                <path d="M59 149 L57 156 C56 163 58 168 59 168 C60 168 62 163 61 156 Z" fill="#334155" opacity="0.6" />
                <path d="M141 149 L143 156 C144 163 142 168 141 168 C140 168 138 163 139 156 Z" fill="#334155" opacity="0.6" />
              </g>

              {/* Core / Aesthetic Chiseled 8-Pack & Sculpted Waist */}
              <g
                onClick={() => onSelectMuscle('core')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Abdominals (Proportional 4-Tier Aesthetic Column X: 81-98) */}
                <path
                  d="M98 80 C89 80 81 82 81 90 C87 91 93 91 98 90 Z M98 92 C89 92 81 94 81 102 C87 103 93 103 98 102 Z M98 104 C89 104 82 106 82 114 C87 115 93 115 98 114 Z M98 116 C89 116 83 119 83 129 C88 131 93 131 98 130 Z"
                  fill={getHeatFill('core')}
                  opacity={getHeatOpacity('core')}
                />
                {/* Right Abdominals (Proportional 4-Tier Aesthetic Column X: 102-119) */}
                <path
                  d="M102 80 C111 80 119 82 119 90 C113 91 107 91 102 90 Z M102 92 C111 92 119 94 119 102 C113 103 107 103 102 102 Z M102 104 C111 104 118 106 118 114 C113 115 107 115 102 114 Z M102 116 C111 116 117 119 117 129 C112 131 107 131 102 130 Z"
                  fill={getHeatFill('core')}
                  opacity={getHeatOpacity('core')}
                />
                {/* Serratus Anterior & Obliques Hugging Core Wall */}
                <path
                  d="M80 88 C74 88 72 95 72 106 C72 118 76 128 82 135 C83 136 84 132 83 126 C81 116 80 102 80 88 Z"
                  fill={getHeatFill('core')}
                  opacity={getHeatOpacity('core')}
                />
                <path
                  d="M120 88 C126 88 128 95 128 106 C128 118 124 128 118 135 C117 136 116 132 117 126 C119 116 120 102 120 88 Z"
                  fill={getHeatFill('core')}
                  opacity={getHeatOpacity('core')}
                />
                {/* Linea Alba Center Split Line */}
                <line x1="100" y1="80" x2="100" y2="132" stroke="#0f172a" strokeWidth="0.8" opacity="0.6" />
                {/* Navel */}
                <ellipse cx="100" cy="111" rx="1.2" ry="1.4" fill="#0f172a" opacity="0.85" />
              </g>

              {/* Quadriceps (Aesthetic Outer Quad Flare Sweep & Medialis Teardrop) */}
              <g
                onClick={() => onSelectMuscle('quads')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Quad Group */}
                {/* Vastus Lateralis Outer Sweep */}
                <path
                  d="M85 135 C70 152 68 180 74 204 C78 206 81 195 82 176 C82 158 84 142 85 135 Z"
                  fill={getHeatFill('quads')}
                  opacity={getHeatOpacity('quads')}
                />
                {/* Rectus Femoris Center Column */}
                <path
                  d="M86 135 C90 135 94 144 94 172 C94 192 90 205 85 211 C82 207 81 195 82 174 C83 156 84 144 86 135 Z"
                  fill={getHeatFill('quads')}
                  opacity={getHeatOpacity('quads')}
                />
                {/* Vastus Medialis Teardrop */}
                <path
                  d="M93 180 C97 186 98 200 95 210 C92 212 88 211 87 208 C88 200 91 190 93 180 Z"
                  fill={getHeatFill('quads')}
                  opacity={getHeatOpacity('quads')}
                />

                {/* Right Quad Group */}
                {/* Vastus Lateralis Outer Sweep */}
                <path
                  d="M115 135 C130 152 132 180 126 204 C122 206 119 195 118 176 C118 158 116 142 115 135 Z"
                  fill={getHeatFill('quads')}
                  opacity={getHeatOpacity('quads')}
                />
                {/* Rectus Femoris Center Column */}
                <path
                  d="M114 135 C110 135 106 144 106 172 C106 192 110 205 115 211 C118 207 119 195 118 174 C117 156 116 144 114 135 Z"
                  fill={getHeatFill('quads')}
                  opacity={getHeatOpacity('quads')}
                />
                {/* Vastus Medialis Teardrop */}
                <path
                  d="M107 180 C103 186 102 200 105 210 C108 212 112 211 113 208 C112 200 109 190 107 180 Z"
                  fill={getHeatFill('quads')}
                  opacity={getHeatOpacity('quads')}
                />

                {/* Patellar Knees (Compact Anatomical Joints) */}
                <circle cx="84" cy="215" r="3" fill="#334155" opacity="0.8" />
                <circle cx="116" cy="215" r="3" fill="#334155" opacity="0.8" />
              </g>

              {/* Calves (Diamond Gastrocnemius & Slender Achilles) */}
              <g
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Calf */}
                <path
                  d="M77 220 C71 234 72 254 78 274 C82 274 85 260 86 244 C86 233 82 223 77 220 Z"
                  fill={getHeatFill('calves')}
                  opacity={getHeatOpacity('calves')}
                />
                {/* Right Calf */}
                <path
                  d="M123 220 C129 234 128 254 122 274 C118 274 115 260 114 244 C114 233 118 223 123 220 Z"
                  fill={getHeatFill('calves')}
                  opacity={getHeatOpacity('calves')}
                />
                {/* Feet */}
                <ellipse cx="80" cy="285" rx="5" ry="2.8" fill="#334155" opacity="0.7" />
                <ellipse cx="120" cy="285" rx="5" ry="2.8" fill="#334155" opacity="0.7" />
              </g>
            </g>
          ) : (
            /* ── POSTERIOR / BACK VIEW (Sculpted V-Taper & Posterior Chain) ── */
            <g className="transition-all duration-300">
              {/* Trapezius (Diamond Kite Back Formation) */}
              <g
                onClick={() => onSelectMuscle('traps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                <path
                  d="M99 30 L99 110 L87 82 L72 52 L95 32 Z"
                  fill={getHeatFill('traps')}
                  opacity={getHeatOpacity('traps')}
                />
                <path
                  d="M101 30 L101 110 L113 82 L128 52 L105 32 Z"
                  fill={getHeatFill('traps')}
                  opacity={getHeatOpacity('traps')}
                />
              </g>

              {/* Rear Deltoids (Rear Shoulder Caps) */}
              <g
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                <path
                  d="M72 52 C61 54 52 62 52 72 C52 79 58 84 63 86 C66 84 68 78 70 70 C70 64 71 56 72 52 Z"
                  fill={getHeatFill('shoulders')}
                  opacity={getHeatOpacity('shoulders')}
                />
                <path
                  d="M128 52 C139 54 148 62 148 72 C148 79 142 84 137 86 C134 84 132 78 130 70 C130 64 129 56 128 52 Z"
                  fill={getHeatFill('shoulders')}
                  opacity={getHeatOpacity('shoulders')}
                />
              </g>

              {/* Back / Latissimus Dorsi & Erector Spinae (Sleek V-Taper) */}
              <g
                onClick={() => onSelectMuscle('back')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Lat Wing */}
                <path
                  d="M72 68 C68 78 68 94 72 108 C78 116 84 122 99 124 L99 108 L86 80 Z"
                  fill={getHeatFill('back')}
                  opacity={getHeatOpacity('back')}
                />
                {/* Right Lat Wing */}
                <path
                  d="M128 68 C132 78 132 94 128 108 C122 116 116 122 101 124 L101 108 L114 80 Z"
                  fill={getHeatFill('back')}
                  opacity={getHeatOpacity('back')}
                />
                {/* Erector Spinae (Christmas Tree Lower Back - Tight & Sculpted) */}
                <path
                  d="M99 124 L91 124 C90 132 93 138 99 138 Z"
                  fill={getHeatFill('back')}
                  opacity={getHeatOpacity('back')}
                />
                <path
                  d="M101 124 L109 124 C110 132 107 138 101 138 Z"
                  fill={getHeatFill('back')}
                  opacity={getHeatOpacity('back')}
                />
              </g>

              {/* Triceps (Horseshoe Lateral & Long Heads) */}
              <g
                onClick={() => onSelectMuscle('triceps')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                <path
                  d="M52 72 C46 83 45 98 48 111 C51 111 54 109 57 103 C58 92 57 81 56 74 Z"
                  fill={getHeatFill('triceps')}
                  opacity={getHeatOpacity('triceps')}
                />
                <path
                  d="M148 72 C154 83 155 98 152 111 C149 111 146 109 143 103 C142 92 143 81 144 74 Z"
                  fill={getHeatFill('triceps')}
                  opacity={getHeatOpacity('triceps')}
                />
                {/* Forearms back view */}
                <path d="M48 111 C43 121 44 137 47 148 C50 148 53 142 54 131 Z" fill="#334155" opacity="0.6" />
                <path d="M152 111 C157 121 156 137 153 148 C150 148 147 142 146 131 Z" fill="#334155" opacity="0.6" />
              </g>

              {/* Hamstrings & Glutes (Athletic Glute Shelf & Posterior Thighs) */}
              <g
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Gluteus Maximus */}
                <path
                  d="M99 138 C89 138 85 144 85 156 C85 166 93 172 99 171 Z"
                  fill={getHeatFill('hamstrings_glutes')}
                  opacity={getHeatOpacity('hamstrings_glutes')}
                />
                {/* Right Gluteus Maximus */}
                <path
                  d="M101 138 C111 138 115 144 115 156 C115 166 107 172 101 171 Z"
                  fill={getHeatFill('hamstrings_glutes')}
                  opacity={getHeatOpacity('hamstrings_glutes')}
                />
                {/* Left Hamstring (Biceps Femoris & Semitendinosus) */}
                <path
                  d="M86 171 C78 183 77 199 80 215 C85 216 89 205 90 190 C90 180 88 172 86 171 Z"
                  fill={getHeatFill('hamstrings_glutes')}
                  opacity={getHeatOpacity('hamstrings_glutes')}
                />
                {/* Right Hamstring */}
                <path
                  d="M114 171 C122 183 123 199 120 215 C115 216 111 205 110 190 C110 180 112 172 114 171 Z"
                  fill={getHeatFill('hamstrings_glutes')}
                  opacity={getHeatOpacity('hamstrings_glutes')}
                />
              </g>

              {/* Posterior Calves (Diamond Split Gastrocnemius & Achilles) */}
              <g
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer hover:brightness-125 transition-all"
              >
                {/* Left Calf */}
                <path
                  d="M75 220 C69 233 70 255 77 270 C83 270 87 255 87 241 C87 230 82 222 75 220 Z"
                  fill={getHeatFill('calves')}
                  opacity={getHeatOpacity('calves')}
                />
                {/* Right Calf */}
                <path
                  d="M125 220 C131 233 130 255 123 270 C117 270 113 255 113 241 C113 230 118 222 125 220 Z"
                  fill={getHeatFill('calves')}
                  opacity={getHeatOpacity('calves')}
                />
                {/* Heels */}
                <ellipse cx="80" cy="285" rx="4.5" ry="2.5" fill="#334155" opacity="0.7" />
                <ellipse cx="120" cy="285" rx="4.5" ry="2.5" fill="#334155" opacity="0.7" />
              </g>
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
