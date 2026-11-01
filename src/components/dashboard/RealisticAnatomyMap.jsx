import { useState } from 'react';
import { MUSCLE_GROUPS } from '@/lib/muscleDistribution';

export default function RealisticAnatomyMap({
  distribution,
  selectedMuscle,
  onSelectMuscle,
  mode = 'plan',
  metricType = 'sets', // 'sets' | 'reps' | 'fatigue'
}) {
  const [viewSide, setViewSide] = useState('front'); // 'front' | 'back'
  const [hoveredMuscle, setHoveredMuscle] = useState(null);

  // Map each muscle ID to its zone, color, sets, reps, and hold time
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

  const getHeatFill = (id, fallback = '#334155') => {
    const data = muscleDataMap[id];
    if (!data) return fallback;
    return `url(#grad-${id}-${mode})`;
  };

  const getOpacity = (id) => {
    const isHovered = hoveredMuscle === id;
    const isSelected = selectedMuscle === id;
    if (selectedMuscle) {
      return isSelected ? 1.0 : 0.45;
    }
    if (hoveredMuscle) {
      return isHovered ? 1.0 : 0.7;
    }
    return 0.88;
  };

  const activeFocus = selectedMuscle || hoveredMuscle;
  const activeFocusData = activeFocus ? muscleDataMap[activeFocus] : null;

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-5 bg-gradient-to-b from-slate-950/70 to-slate-900/60 dark:from-background/90 dark:to-muted/30 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-md relative overflow-hidden">
      {/* Subtle Background Radial Aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Front / Back Perspective Controls */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 dark:bg-muted/80 backdrop-blur-md rounded-xl mb-4 border border-border/60 z-10 text-xs">
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

      {/* Realistic Anatomical Vector Stage */}
      <div className="relative w-64 h-96 sm:w-72 sm:h-[420px] flex items-center justify-center select-none z-10">
        <svg
          viewBox="0 0 240 380"
          className="w-full h-full drop-shadow-xl transition-all duration-300"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Dynamic Linear Gradients for Muscle Thermal Activation */}
            {MUSCLE_GROUPS.map((mg) => {
              const data = muscleDataMap[mg.id];
              const c1 = data?.gradient?.[0] || '#334155';
              const c2 = data?.gradient?.[1] || '#475569';
              return (
                <linearGradient
                  key={mg.id}
                  id={`grad-${mg.id}-${mode}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor={c1} stopOpacity="0.95" />
                  <stop offset="60%" stopColor={c2} stopOpacity="0.88" />
                  <stop offset="100%" stopColor={c1} stopOpacity="0.98" />
                </linearGradient>
              );
            })}

            {/* Realistic Skeletal Muscle Striation Texture */}
            <pattern
              id="muscle-striations"
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="4" stroke="#ffffff" strokeWidth="0.4" opacity="0.18" />
            </pattern>

            {/* Thermal Pulse Filter */}
            <filter id="thermal-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#38bdf8" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Neutral Anatomical Framework (Head, Cranium, Neck Bones) */}
          <g opacity="0.6">
            <ellipse cx="120" cy="24" rx="15" ry="19" fill="#334155" stroke="#475569" strokeWidth="0.8" />
            <path d="M112 40 L128 40 L130 52 L110 52 Z" fill="#334155" />
            {/* Clavicle / Collarbone contour */}
            <path d="M85 55 Q120 58 155 55" stroke="#64748b" strokeWidth="1.2" fill="none" opacity="0.5" />
          </g>

          {viewSide === 'front' ? (
            /* ═════════════════════════════════════════════════════════
               ANTERIOR (FRONT) MUSCULATURE — HIGH-FIDELITY PATHS
               ═════════════════════════════════════════════════════════ */
            <g className="transition-all duration-300">
              {/* UPPER TRAPEZIUS (Descending clavicular fibers) */}
              <path
                d="M106 44 L114 43 L105 54 L92 56 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                onMouseEnter={() => setHoveredMuscle('traps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('traps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.2"
              />
              <path
                d="M134 44 L126 43 L135 54 L148 56 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                onMouseEnter={() => setHoveredMuscle('traps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('traps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.2"
              />

              {/* ANTERIOR DELTOIDS (Front Shoulders) */}
              <path
                d="M84 55 C73 57 65 67 66 82 C72 82 82 76 86 68 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                onMouseEnter={() => setHoveredMuscle('shoulders')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M156 55 C167 57 175 67 174 82 C168 82 158 76 154 68 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                onMouseEnter={() => setHoveredMuscle('shoulders')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />

              {/* CHEST / PECTORALIS MAJOR (Clavicular & Sternal Heads) */}
              {/* Left Pectoral (Viewer's Left) */}
              <path
                d="M87 57 C102 55 118 58 119 72 C119 86 104 94 92 92 C80 90 77 78 82 66 Z"
                fill={getHeatFill('chest')}
                opacity={getOpacity('chest')}
                onMouseEnter={() => setHoveredMuscle('chest')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('chest')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />
              {/* Right Pectoral (Viewer's Right) */}
              <path
                d="M153 57 C138 55 122 58 121 72 C121 86 136 94 148 92 C160 90 163 78 158 66 Z"
                fill={getHeatFill('chest')}
                opacity={getOpacity('chest')}
                onMouseEnter={() => setHoveredMuscle('chest')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('chest')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />

              {/* BICEPS BRACHII & BRACHIALIS */}
              <path
                d="M65 84 C58 95 60 112 66 122 C72 120 77 108 75 92 C74 86 68 83 65 84 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                onMouseEnter={() => setHoveredMuscle('biceps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M175 84 C182 95 180 112 174 122 C168 120 163 108 165 92 C166 86 172 83 175 84 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                onMouseEnter={() => setHoveredMuscle('biceps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />

              {/* FOREARMS (Brachioradialis & Flexors) */}
              <path
                d="M64 125 C56 138 54 156 50 170 C56 170 66 150 70 134 C71 126 67 124 64 125 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                onMouseEnter={() => setHoveredMuscle('biceps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.2"
              />
              <path
                d="M176 125 C184 138 186 156 190 170 C184 170 174 150 170 134 C169 126 173 124 176 125 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                onMouseEnter={() => setHoveredMuscle('biceps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('biceps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.2"
              />

              {/* CORE / RECTUS ABDOMINIS & OBLIQUES (Segmented 6-Pack Architecture) */}
              {/* Upper Abs */}
              <rect
                x="104"
                y="96"
                width="14"
                height="12"
                rx="2"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.3"
              />
              <rect
                x="122"
                y="96"
                width="14"
                height="12"
                rx="2"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.3"
              />

              {/* Mid Abs */}
              <rect
                x="104"
                y="111"
                width="14"
                height="13"
                rx="2"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.3"
              />
              <rect
                x="122"
                y="111"
                width="14"
                height="13"
                rx="2"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.3"
              />

              {/* Lower Abs / Pyramidalis */}
              <path
                d="M104 127 L118 127 L117 146 L108 143 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.3"
              />
              <path
                d="M122 127 L136 127 L132 143 L123 146 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke="#ffffff"
                strokeWidth="0.4"
                strokeOpacity="0.3"
              />

              {/* External Obliques (Lateral Core Waist Flanks) */}
              <path
                d="M88 98 C95 96 99 104 100 120 C101 135 96 145 90 148 C85 136 82 118 88 98 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                onMouseEnter={() => setHoveredMuscle('core')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('core')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M152 98 C145 96 141 104 140 120 C139 135 144 145 150 148 C155 136 158 118 152 98 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                onMouseEnter={() => setHoveredMuscle('core')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('core')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />

              {/* QUADRICEPS (Rectus Femoris, Vastus Lateralis & Vastus Medialis Teardrop) */}
              {/* Left Thigh (Viewer's Left) */}
              <g
                onMouseEnter={() => setHoveredMuscle('quads')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('quads')}
                className="cursor-pointer transition-all"
              >
                {/* Vastus Lateralis (Outer sweep) */}
                <path
                  d="M90 152 C78 174 74 205 82 228 C92 230 96 215 97 190 C96 170 94 158 90 152 Z"
                  fill={getHeatFill('quads')}
                  opacity={getOpacity('quads')}
                  stroke="#ffffff"
                  strokeWidth="0.5"
                  strokeOpacity="0.25"
                />
                {/* Rectus Femoris & Vastus Medialis Teardrop */}
                <path
                  d="M92 153 C99 154 107 165 106 195 C108 214 102 226 95 231 C91 228 92 215 92 195 C91 175 90 160 92 153 Z"
                  fill={getHeatFill('quads')}
                  opacity={getOpacity('quads')}
                  stroke="#ffffff"
                  strokeWidth="0.5"
                  strokeOpacity="0.25"
                />
              </g>

              {/* Right Thigh (Viewer's Right) */}
              <g
                onMouseEnter={() => setHoveredMuscle('quads')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('quads')}
                className="cursor-pointer transition-all"
              >
                {/* Vastus Lateralis (Outer sweep) */}
                <path
                  d="M150 152 C162 174 166 205 158 228 C148 230 144 215 143 190 C144 170 146 158 150 152 Z"
                  fill={getHeatFill('quads')}
                  opacity={getOpacity('quads')}
                  stroke="#ffffff"
                  strokeWidth="0.5"
                  strokeOpacity="0.25"
                />
                {/* Rectus Femoris & Vastus Medialis Teardrop */}
                <path
                  d="M148 153 C141 154 133 165 134 195 C132 214 138 226 145 231 C149 228 148 215 148 195 C149 175 150 160 148 153 Z"
                  fill={getHeatFill('quads')}
                  opacity={getOpacity('quads')}
                  stroke="#ffffff"
                  strokeWidth="0.5"
                  strokeOpacity="0.25"
                />
              </g>

              {/* CALVES (Tibialis Anterior & Extensors) */}
              <path
                d="M82 242 C76 260 78 290 84 316 C90 316 97 296 98 274 C99 258 92 244 82 242 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                onMouseEnter={() => setHoveredMuscle('calves')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M158 242 C164 260 162 290 156 316 C150 316 143 296 142 274 C141 258 148 244 158 242 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                onMouseEnter={() => setHoveredMuscle('calves')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
            </g>
          ) : (
            /* ═════════════════════════════════════════════════════════
               POSTERIOR (BACK) MUSCULATURE — HIGH-FIDELITY PATHS
               ═════════════════════════════════════════════════════════ */
            <g className="transition-all duration-300">
              {/* TRAPEZIUS (Upper, Mid, Lower Diamond Complex) */}
              <path
                d="M110 44 L130 44 L142 62 L120 102 L98 62 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                onMouseEnter={() => setHoveredMuscle('traps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('traps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />

              {/* POSTERIOR DELTOIDS (Rear Shoulders) */}
              <path
                d="M84 56 C74 58 66 70 68 84 C76 82 86 76 90 68 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                onMouseEnter={() => setHoveredMuscle('shoulders')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M156 56 C166 58 174 70 172 84 C164 82 154 76 150 68 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                onMouseEnter={() => setHoveredMuscle('shoulders')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('shoulders')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />

              {/* LATISSIMUS DORSI & RHOMBOIDS (Flaring Winged Back) */}
              {/* Left Lat (Viewer's Left) */}
              <path
                d="M88 72 C98 70 114 74 116 102 C116 122 108 140 100 144 C90 134 82 106 88 72 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                onMouseEnter={() => setHoveredMuscle('back')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('back')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />
              {/* Right Lat (Viewer's Right) */}
              <path
                d="M152 72 C142 70 126 74 124 102 C124 122 132 140 140 144 C150 134 158 106 152 72 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                onMouseEnter={() => setHoveredMuscle('back')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('back')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />

              {/* TRICEPS BRACHII (Long, Lateral, Medial Heads) */}
              <path
                d="M66 84 C60 96 58 114 64 124 C72 120 76 106 74 92 C72 84 68 82 66 84 Z"
                fill={getHeatFill('triceps')}
                opacity={getOpacity('triceps')}
                onMouseEnter={() => setHoveredMuscle('triceps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('triceps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M174 84 C180 96 182 114 176 124 C168 120 164 106 166 92 C168 84 172 82 174 84 Z"
                fill={getHeatFill('triceps')}
                opacity={getOpacity('triceps')}
                onMouseEnter={() => setHoveredMuscle('triceps')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('triceps')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />

              {/* GLUTEUS MAXIMUS & MEDIUS (Glutes / Posterior Hip Extensors) */}
              <path
                d="M94 146 C105 145 119 146 119 164 C119 184 104 188 92 186 C82 182 82 162 94 146 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />
              <path
                d="M146 146 C135 145 121 146 121 164 C121 184 136 188 148 186 C158 182 158 162 146 146 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.6"
                strokeOpacity="0.3"
              />

              {/* HAMSTRINGS (Biceps Femoris & Semitendinosus) */}
              <path
                d="M88 188 C82 208 80 226 86 236 C96 237 104 220 106 202 C106 189 98 187 88 188 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M152 188 C158 208 160 226 154 236 C144 237 136 220 134 202 C134 189 142 187 152 188 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('hamstrings_glutes')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />

              {/* GASTROCNEMIUS & SOLEUS (Calves — Medial & Lateral Heads) */}
              <path
                d="M82 242 C72 260 74 286 82 316 C88 316 96 296 98 274 C100 256 94 243 82 242 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                onMouseEnter={() => setHoveredMuscle('calves')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
              <path
                d="M158 242 C168 260 166 286 158 316 C152 316 144 296 142 274 C140 256 146 243 158 242 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                onMouseEnter={() => setHoveredMuscle('calves')}
                onMouseLeave={() => setHoveredMuscle(null)}
                onClick={() => onSelectMuscle('calves')}
                className="cursor-pointer transition-all"
                stroke="#ffffff"
                strokeWidth="0.5"
                strokeOpacity="0.25"
              />
            </g>
          )}

          {/* Striation Texture Overlay */}
          <rect x="0" y="0" width="240" height="380" fill="url(#muscle-striations)" pointerEvents="none" opacity="0.35" />
        </svg>

        {/* Live Hover / Active Inspection Callout Tag */}
        {activeFocusData && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-max max-w-[90%] bg-slate-900/95 dark:bg-card/95 backdrop-blur-md border border-border px-3 py-1.5 rounded-xl shadow-lg text-center animate-in fade-in zoom-in-95 duration-150">
            <p className="text-xs font-bold text-foreground leading-tight">
              {activeFocusData.name}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
              {activeFocusData.anatomicalLabel}
            </p>
            <div className="flex items-center justify-center gap-1.5 mt-1 text-[11px] font-semibold">
              <span style={{ color: activeFocusData.barColor }}>
                {activeFocusData.sets} sets
              </span>
              <span className="text-muted-foreground" aria-hidden="true">·</span>
              {activeFocusData.holdSecs > 0 ? (
                <span className="text-foreground">{activeFocusData.holdSecs}s hold</span>
              ) : (
                <span className="text-foreground">{activeFocusData.reps} reps</span>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3 text-center">
        Tap or hover over any muscle group to view sets, reps, and fatigue metrics
      </p>
    </div>
  );
}
