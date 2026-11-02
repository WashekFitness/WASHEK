import { useState, useId } from 'react';
import {
  Flame,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  Dumbbell,
  Clock,
  Zap,
} from 'lucide-react';
import { MUSCLE_GROUPS } from '@/lib/muscleDistribution';

/**
 * Aesthetic, athletic human muscle anatomy chart with individually interactive muscle paths.
 * Renders lean, muscular, athletic V-taper proportions (broad shoulders, tight waist, quad sweep, diamond calves).
 */
export default function RealisticAnatomyMap({
  distribution = [],
  selectedMuscle = null,
  onSelectMuscle,
  mode = 'logged',
}) {
  const [viewSide, setViewSide] = useState('both'); // 'both' | 'front' | 'back'
  const [hoveredMuscle, setHoveredMuscle] = useState(null);
  const baseId = useId();

  // Create lookup dictionary for muscle data
  const muscleDataMap = {};
  for (const mg of distribution) {
    const isLogged = mode === 'logged';
    const zone = isLogged ? mg.loggedZone : mg.plannedZone;
    const sets = isLogged ? mg.loggedSets : mg.plannedSets;
    const reps = isLogged ? mg.loggedReps : mg.plannedReps;
    const holdSecs = isLogged ? mg.loggedHoldSeconds : mg.plannedHoldSeconds;

    muscleDataMap[mg.id] = {
      ...mg,
      zone,
      sets,
      reps,
      holdSecs,
      barColor: zone.barColor,
      gradient: zone.gradient || [zone.barColor, zone.barColor],
    };
  }

  const getHeatFill = (id, fallback = '#1e293b') => {
    const data = muscleDataMap[id];
    if (!data || data.sets === 0) return '#1e293b';
    return `url(#${baseId}-grad-${id})`;
  };

  const getStroke = (id) => {
    if (selectedMuscle === id) return '#ffffff';
    if (hoveredMuscle === id) return '#38bdf8';
    return 'rgba(255,255,255,0.22)';
  };

  const getStrokeWidth = (id) => {
    if (selectedMuscle === id) return '1.5';
    if (hoveredMuscle === id) return '1.2';
    return '0.6';
  };

  const getOpacity = (id) => {
    if (selectedMuscle) {
      return selectedMuscle === id ? 1.0 : 0.4;
    }
    if (hoveredMuscle) {
      return hoveredMuscle === id ? 1.0 : 0.75;
    }
    return 0.92;
  };

  const activeFocus = selectedMuscle || hoveredMuscle;
  const activeFocusData = activeFocus ? muscleDataMap[activeFocus] : null;

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-950/90 dark:bg-card/90 rounded-2xl border border-slate-800 dark:border-white/[0.08] shadow-2xl relative overflow-hidden select-none">
      {/* Sci-Fi / Medical Chart Subtle Background Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Header & Perspective Toggle Controls */}
      <div className="w-full flex items-center justify-between mb-4 z-10 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest font-heading">
            Athletic Musculoskeletal Chart
          </span>
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
            Interactive
          </span>
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-900/90 dark:bg-muted/70 rounded-xl text-xs border border-border/60">
          <button
            type="button"
            onClick={() => setViewSide('both')}
            className={`hidden sm:inline-block px-3 py-1 font-semibold rounded-lg transition-all ${
              viewSide === 'both'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Full Chart
          </button>
          <button
            type="button"
            onClick={() => setViewSide('front')}
            className={`px-3 py-1 font-semibold rounded-lg transition-all ${
              viewSide === 'front'
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
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
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Posterior (Back)
          </button>
        </div>
      </div>

      {/* Realistic Anatomy Vector Canvas */}
      <div className="relative w-full max-w-2xl flex items-center justify-center z-10 py-2">
        <svg
          viewBox={
            viewSide === 'both'
              ? '0 0 520 460'
              : viewSide === 'front'
                ? '0 0 260 460'
                : '260 0 260 460'
          }
          className="w-full h-auto max-h-[500px] drop-shadow-2xl transition-all duration-300"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Dynamic Thermal Gradients with High-Heat Center and Natural Tissue Falloff */}
            {MUSCLE_GROUPS.map((mg) => {
              const data = muscleDataMap[mg.id];
              const c1 = data?.gradient?.[0] || '#38bdf8';
              const c2 = data?.gradient?.[1] || '#0284c7';
              return (
                <linearGradient
                  key={mg.id}
                  id={`${baseId}-grad-${mg.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={c1} stopOpacity="0.96" />
                  <stop offset="45%" stopColor={c2} stopOpacity="0.9" />
                  <stop offset="100%" stopColor={c1} stopOpacity="0.98" />
                </linearGradient>
              );
            })}

            {/* Skeletal Muscle Striation Texture */}
            <pattern
              id={`${baseId}-striations`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(40)"
            >
              <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeWidth="0.45" opacity="0.16" />
            </pattern>

            {/* Drop Shadow for Definition */}
            <filter id={`${baseId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* ════════════════════════════════════════════════════════════════════════
              ANTERIOR (FRONT) BODY — LEAN ATHLETIC PHYSIQUE (X: 0 - 260)
             ════════════════════════════════════════════════════════════════════════ */}
          <g transform="translate(10, 0)">
            <text
              x="120"
              y="22"
              fill="#64748b"
              fontSize="10"
              fontWeight="bold"
              letterSpacing="2"
              textAnchor="middle"
              className="uppercase"
            >
              Anterior View
            </text>

            {/* Cranium / Head & Jawline (Sculpted Athletic Bone Base) */}
            <g opacity="0.55">
              <ellipse cx="120" cy="48" rx="14" ry="17" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
              {/* Jawline & Neck Column */}
              <path d="M112 62 L120 70 L128 62 L127 75 L113 75 Z" fill="#1e293b" />
              {/* Sternocleidomastoid tendons */}
              <line x1="114" y1="64" x2="119" y2="76" stroke="#475569" strokeWidth="0.6" />
              <line x1="126" y1="64" x2="121" y2="76" stroke="#475569" strokeWidth="0.6" />
            </g>

            {/* UPPER TRAPS (Anterior Clavicular insertion) */}
            <path
              d="M106 66 L113 65 L106 78 L94 80 Z"
              fill={getHeatFill('traps')}
              opacity={getOpacity('traps')}
              stroke={getStroke('traps')}
              strokeWidth={getStrokeWidth('traps')}
              onMouseEnter={() => setHoveredMuscle('traps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('traps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M134 66 L127 65 L134 78 L146 80 Z"
              fill={getHeatFill('traps')}
              opacity={getOpacity('traps')}
              stroke={getStroke('traps')}
              strokeWidth={getStrokeWidth('traps')}
              onMouseEnter={() => setHoveredMuscle('traps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('traps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* ANTERIOR & LATERAL DELTOIDS (Shoulder Capping) */}
            <path
              d="M86 78 C72 80 62 92 63 108 C70 108 81 100 86 92 Z"
              fill={getHeatFill('shoulders')}
              opacity={getOpacity('shoulders')}
              stroke={getStroke('shoulders')}
              strokeWidth={getStrokeWidth('shoulders')}
              onMouseEnter={() => setHoveredMuscle('shoulders')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('shoulders')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M154 78 C168 80 178 92 177 108 C170 108 159 100 154 92 Z"
              fill={getHeatFill('shoulders')}
              opacity={getOpacity('shoulders')}
              stroke={getStroke('shoulders')}
              strokeWidth={getStrokeWidth('shoulders')}
              onMouseEnter={() => setHoveredMuscle('shoulders')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('shoulders')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* PECTORALIS MAJOR (Clavicular & Sternal Heads with deep sternal cleft) */}
            {/* Left Pec */}
            <path
              d="M88 80 C104 78 118 82 119 96 C119 112 103 120 91 118 C78 115 76 102 82 89 Z"
              fill={getHeatFill('chest')}
              opacity={getOpacity('chest')}
              stroke={getStroke('chest')}
              strokeWidth={getStrokeWidth('chest')}
              onMouseEnter={() => setHoveredMuscle('chest')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('chest')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Right Pec */}
            <path
              d="M152 80 C136 78 122 82 121 96 C121 112 137 120 149 118 C162 115 164 102 158 89 Z"
              fill={getHeatFill('chest')}
              opacity={getOpacity('chest')}
              stroke={getStroke('chest')}
              strokeWidth={getStrokeWidth('chest')}
              onMouseEnter={() => setHoveredMuscle('chest')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('chest')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* BICEPS BRACHII & BRACHIALIS (Sculpted Peak Arm Contours) */}
            <path
              d="M62 110 C54 122 56 142 63 154 C70 152 75 138 73 120 C72 112 66 109 62 110 Z"
              fill={getHeatFill('biceps')}
              opacity={getOpacity('biceps')}
              stroke={getStroke('biceps')}
              strokeWidth={getStrokeWidth('biceps')}
              onMouseEnter={() => setHoveredMuscle('biceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('biceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M178 110 C186 122 184 142 177 154 C170 152 165 138 167 120 C168 112 174 109 178 110 Z"
              fill={getHeatFill('biceps')}
              opacity={getOpacity('biceps')}
              stroke={getStroke('biceps')}
              strokeWidth={getStrokeWidth('biceps')}
              onMouseEnter={() => setHoveredMuscle('biceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('biceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* FOREARMS (Brachioradialis & Flexors) */}
            <path
              d="M61 156 C53 172 50 194 46 210 C52 210 63 186 68 166 C69 158 64 155 61 156 Z"
              fill={getHeatFill('biceps')}
              opacity={getOpacity('biceps')}
              stroke={getStroke('biceps')}
              strokeWidth={getStrokeWidth('biceps')}
              onMouseEnter={() => setHoveredMuscle('biceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('biceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M179 156 C187 172 190 194 194 210 C188 210 177 186 172 166 C171 158 176 155 179 156 Z"
              fill={getHeatFill('biceps')}
              opacity={getOpacity('biceps')}
              stroke={getStroke('biceps')}
              strokeWidth={getStrokeWidth('biceps')}
              onMouseEnter={() => setHoveredMuscle('biceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('biceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* RECTUS ABDOMINIS (Aesthetic 6-Pack with Linea Alba & Inscriptions) */}
            {/* Upper Abs */}
            <rect
              x="103"
              y="122"
              width="15"
              height="15"
              rx="2.5"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <rect
              x="122"
              y="122"
              width="15"
              height="15"
              rx="2.5"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* Mid Abs */}
            <rect
              x="103"
              y="140"
              width="15"
              height="16"
              rx="2.5"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <rect
              x="122"
              y="140"
              width="15"
              height="16"
              rx="2.5"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* Lower Abs & Pyramidalis (V-Taper Cut) */}
            <path
              d="M103 159 L118 159 L117 182 L107 178 Z"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M122 159 L137 159 L133 178 L123 182 Z"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* EXTERNAL OBLIQUES & SERRATUS ANTERIOR (Tight Tapered Waist Flanks) */}
            <path
              d="M86 122 C94 120 98 130 99 150 C100 168 94 180 88 184 C82 170 78 146 86 122 Z"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M154 122 C146 120 142 130 141 150 C140 168 146 180 152 184 C158 170 162 146 154 122 Z"
              fill={getHeatFill('core')}
              opacity={getOpacity('core')}
              stroke={getStroke('core')}
              strokeWidth={getStrokeWidth('core')}
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* QUADRICEPS (Vastus Lateralis Outer Sweep & Vastus Medialis Teardrop) */}
            {/* Left Quad */}
            <g
              onMouseEnter={() => setHoveredMuscle('quads')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('quads')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Vastus Lateralis Outer Quad Sweep */}
              <path
                d="M88 188 C74 214 70 252 80 280 C90 282 96 264 97 234 C96 208 93 194 88 188 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Rectus Femoris & Medialis Teardrop */}
              <path
                d="M91 189 C98 190 107 204 106 240 C108 264 102 278 94 284 C90 280 91 264 91 240 C90 216 89 198 91 189 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
            </g>

            {/* Right Quad */}
            <g
              onMouseEnter={() => setHoveredMuscle('quads')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('quads')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Vastus Lateralis Outer Quad Sweep */}
              <path
                d="M152 188 C166 214 170 252 160 280 C150 282 144 264 143 234 C144 208 147 194 152 188 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Rectus Femoris & Medialis Teardrop */}
              <path
                d="M149 189 C142 190 133 204 134 240 C132 264 138 278 146 284 C150 280 149 264 149 240 C150 216 151 198 149 189 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
            </g>

            {/* CALVES (Tibialis Anterior & Extensors) */}
            <path
              d="M78 298 C70 320 73 356 80 388 C88 388 96 364 98 336 C99 318 90 300 78 298 Z"
              fill={getHeatFill('calves')}
              opacity={getOpacity('calves')}
              stroke={getStroke('calves')}
              strokeWidth={getStrokeWidth('calves')}
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M162 298 C170 320 167 356 160 388 C152 388 144 364 142 336 C141 318 150 300 162 298 Z"
              fill={getHeatFill('calves')}
              opacity={getOpacity('calves')}
              stroke={getStroke('calves')}
              strokeWidth={getStrokeWidth('calves')}
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* Patellar Knees & Feet Accents */}
            <circle cx="94" cy="287" r="4.5" fill="#334155" opacity="0.6" />
            <circle cx="146" cy="287" r="4.5" fill="#334155" opacity="0.6" />
            <ellipse cx="80" cy="402" rx="7" ry="4" fill="#334155" opacity="0.5" />
            <ellipse cx="160" cy="402" rx="7" ry="4" fill="#334155" opacity="0.5" />
          </g>

          {/* ════════════════════════════════════════════════════════════════════════
              POSTERIOR (BACK) BODY — V-TAPER MUSCULAR BACK & HAMSTRINGS (X: 260 - 520)
             ════════════════════════════════════════════════════════════════════════ */}
          <g transform="translate(260, 0)">
            <text
              x="120"
              y="22"
              fill="#64748b"
              fontSize="10"
              fontWeight="bold"
              letterSpacing="2"
              textAnchor="middle"
              className="uppercase"
            >
              Posterior View
            </text>

            {/* Cranium Back & Occipital Ridge */}
            <g opacity="0.55">
              <ellipse cx="120" cy="48" rx="14" ry="17" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
              <path d="M112 62 L120 66 L128 62 L126 74 L114 74 Z" fill="#1e293b" />
            </g>

            {/* TRAPEZIUS (Upper, Mid & Lower Rhomboid Diamond Formation) */}
            <path
              d="M108 64 L132 64 L146 86 L120 134 L94 86 Z"
              fill={getHeatFill('traps')}
              opacity={getOpacity('traps')}
              stroke={getStroke('traps')}
              strokeWidth={getStrokeWidth('traps')}
              onMouseEnter={() => setHoveredMuscle('traps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('traps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* POSTERIOR DELTOIDS (Rear Shoulder Caps) */}
            <path
              d="M84 78 C72 80 62 94 65 110 C74 108 86 100 90 90 Z"
              fill={getHeatFill('shoulders')}
              opacity={getOpacity('shoulders')}
              stroke={getStroke('shoulders')}
              strokeWidth={getStrokeWidth('shoulders')}
              onMouseEnter={() => setHoveredMuscle('shoulders')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('shoulders')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M156 78 C168 80 178 94 175 110 C166 108 154 100 150 90 Z"
              fill={getHeatFill('shoulders')}
              opacity={getOpacity('shoulders')}
              stroke={getStroke('shoulders')}
              strokeWidth={getStrokeWidth('shoulders')}
              onMouseEnter={() => setHoveredMuscle('shoulders')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('shoulders')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* LATISSIMUS DORSI (Winged Lateral V-Taper Sweeps) */}
            {/* Left Lat */}
            <path
              d="M88 98 C99 96 116 100 117 134 C117 158 108 180 98 184 C87 172 78 138 88 98 Z"
              fill={getHeatFill('back')}
              opacity={getOpacity('back')}
              stroke={getStroke('back')}
              strokeWidth={getStrokeWidth('back')}
              onMouseEnter={() => setHoveredMuscle('back')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            {/* Right Lat */}
            <path
              d="M152 98 C141 96 124 100 123 134 C123 158 132 180 142 184 C153 172 162 138 152 98 Z"
              fill={getHeatFill('back')}
              opacity={getOpacity('back')}
              stroke={getStroke('back')}
              strokeWidth={getStrokeWidth('back')}
              onMouseEnter={() => setHoveredMuscle('back')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* TRICEPS BRACHII (Horseshoe Long & Lateral Heads) */}
            <path
              d="M64 110 C56 124 54 146 62 158 C72 152 77 136 74 118 C72 110 67 108 64 110 Z"
              fill={getHeatFill('triceps')}
              opacity={getOpacity('triceps')}
              stroke={getStroke('triceps')}
              strokeWidth={getStrokeWidth('triceps')}
              onMouseEnter={() => setHoveredMuscle('triceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('triceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M176 110 C184 124 186 146 178 158 C168 152 163 136 166 118 C168 110 173 108 176 110 Z"
              fill={getHeatFill('triceps')}
              opacity={getOpacity('triceps')}
              stroke={getStroke('triceps')}
              strokeWidth={getStrokeWidth('triceps')}
              onMouseEnter={() => setHoveredMuscle('triceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('triceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* GLUTEUS MAXIMUS & MEDIUS (Powerful Athletic Glutes) */}
            <path
              d="M93 186 C106 185 119 186 119 208 C119 232 103 238 90 234 C78 228 78 206 93 186 Z"
              fill={getHeatFill('hamstrings_glutes')}
              opacity={getOpacity('hamstrings_glutes')}
              stroke={getStroke('hamstrings_glutes')}
              strokeWidth={getStrokeWidth('hamstrings_glutes')}
              onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('hamstrings_glutes')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M147 186 C134 185 121 186 121 208 C121 232 137 238 150 234 C162 228 162 206 147 186 Z"
              fill={getHeatFill('hamstrings_glutes')}
              opacity={getOpacity('hamstrings_glutes')}
              stroke={getStroke('hamstrings_glutes')}
              strokeWidth={getStrokeWidth('hamstrings_glutes')}
              onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('hamstrings_glutes')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* HAMSTRINGS (Biceps Femoris & Semitendinosus / Semimembranosus) */}
            <path
              d="M86 238 C79 262 76 284 84 296 C96 298 105 278 107 254 C107 238 98 236 86 238 Z"
              fill={getHeatFill('hamstrings_glutes')}
              opacity={getOpacity('hamstrings_glutes')}
              stroke={getStroke('hamstrings_glutes')}
              strokeWidth={getStrokeWidth('hamstrings_glutes')}
              onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('hamstrings_glutes')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M154 238 C161 262 164 284 156 296 C144 298 135 278 133 254 C133 238 142 236 154 238 Z"
              fill={getHeatFill('hamstrings_glutes')}
              opacity={getOpacity('hamstrings_glutes')}
              stroke={getStroke('hamstrings_glutes')}
              strokeWidth={getStrokeWidth('hamstrings_glutes')}
              onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('hamstrings_glutes')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* CALVES / GASTROCNEMIUS (Diamond-Shaped Medial & Lateral Heads) */}
            <path
              d="M80 300 C70 322 72 352 80 388 C88 388 98 362 99 336 C101 316 93 301 80 300 Z"
              fill={getHeatFill('calves')}
              opacity={getOpacity('calves')}
              stroke={getStroke('calves')}
              strokeWidth={getStrokeWidth('calves')}
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            />
            <path
              d="M160 300 C170 322 168 352 160 388 C152 388 142 362 141 336 C139 316 147 301 160 300 Z"
              fill={getHeatFill('calves')}
              opacity={getOpacity('calves')}
              stroke={getStroke('calves')}
              strokeWidth={getStrokeWidth('calves')}
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            />

            {/* Achilles Tendons & Heels */}
            <line x1="86" y1="388" x2="86" y2="400" stroke="#475569" strokeWidth="1.2" opacity="0.6" />
            <line x1="154" y1="388" x2="154" y2="400" stroke="#475569" strokeWidth="1.2" opacity="0.6" />
            <ellipse cx="86" cy="403" rx="6" ry="3.5" fill="#334155" opacity="0.5" />
            <ellipse cx="154" cy="403" rx="6" ry="3.5" fill="#334155" opacity="0.5" />
          </g>

          {/* Striation Texture Overlay */}
          <rect
            x="0"
            y="0"
            width="520"
            height="460"
            fill={`url(#${baseId}-striations)`}
            pointerEvents="none"
            opacity="0.32"
          />
        </svg>

        {/* Live Hover Tag / Selected Quick Callout */}
        {activeFocusData && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/95 dark:bg-card/95 backdrop-blur-md border border-border/80 px-3.5 py-1.5 rounded-xl shadow-xl text-center pointer-events-none animate-in fade-in zoom-in-95 duration-150 z-20">
            <div className="flex items-center justify-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: activeFocusData.barColor }}
              />
              <span className="text-xs font-bold text-foreground">
                {activeFocusData.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({activeFocusData.sets} sets)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Summary Popover Drawer when a muscle is clicked */}
      {selectedMuscle && activeFocusData && (
        <div className="w-full mt-4 p-4 rounded-xl bg-slate-900/95 dark:bg-muted/90 backdrop-blur-md border border-primary/40 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 z-20">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: activeFocusData.barColor }}
                />
                <h4 className="font-heading font-bold text-sm text-foreground">
                  {activeFocusData.name}
                </h4>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${activeFocusData.zone.bgClass}`}
                >
                  {activeFocusData.zone.label}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {activeFocusData.anatomicalLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSelectMuscle(null)}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Close summary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 my-3 text-center">
            <div className="p-2 rounded-lg bg-background/50 border border-border/60">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                Total Sets
              </span>
              <span className="font-heading font-bold text-sm sm:text-base text-foreground">
                {activeFocusData.sets}{' '}
                <span className="text-[10px] font-normal text-muted-foreground">
                  / {activeFocusData.targetMax}
                </span>
              </span>
            </div>
            <div className="p-2 rounded-lg bg-background/50 border border-border/60">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                Total Reps
              </span>
              <span className="font-heading font-bold text-sm sm:text-base text-foreground">
                {activeFocusData.reps} reps
              </span>
            </div>
            <div className="p-2 rounded-lg bg-background/50 border border-border/60">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                Hold Duration
              </span>
              <span className="font-heading font-bold text-sm sm:text-base text-foreground">
                {activeFocusData.holdSecs > 0 ? `${activeFocusData.holdSecs}s` : '—'}
              </span>
            </div>
          </div>

          {/* Coach Advice */}
          <div className="text-xs text-muted-foreground bg-background/40 p-2.5 rounded-lg border border-border/50 mb-3">
            <p className="leading-relaxed">
              💡 <span className="font-semibold text-foreground">Kael's Insight:</span>{' '}
              {activeFocusData.zone.advice}
            </p>
          </div>

          {/* Contributing Exercise History */}
          {activeFocusData.contributors[mode]?.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Exercises Fueling This Muscle:
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {activeFocusData.contributors[mode].map((ex, i) => (
                  <span
                    key={i}
                    className="text-[11px] bg-background/70 border border-border/70 px-2.5 py-1 rounded-md text-foreground font-mono"
                  >
                    {ex.name} ({ex.sets} sets · {ex.displayText})
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">
              No exercises logged for this muscle in the selected period.
            </p>
          )}
        </div>
      )}

      {!selectedMuscle && (
        <p className="text-[10px] text-muted-foreground mt-2 text-center z-10">
          Click any muscle group on the athletic body to view its volume & intensity summary
        </p>
      )}
    </div>
  );
}
