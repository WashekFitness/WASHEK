import { useState, useId } from 'react';
import { X } from 'lucide-react';
import { MUSCLE_GROUPS } from '@/lib/muscleDistribution';

/**
 * Realistic, athletically proportioned human muscle anatomy chart with individually interactive muscle paths.
 * Built to classical 8-head human anatomical canons (harmonious head, neck, V-taper torso, arms, quad sweep, diamond calves).
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

  const getHeatFill = (id) => {
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
    return '0.65';
  };

  const getOpacity = (id) => {
    if (selectedMuscle) {
      return selectedMuscle === id ? 1.0 : 0.42;
    }
    if (hoveredMuscle) {
      return hoveredMuscle === id ? 1.0 : 0.78;
    }
    return 0.94;
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
            Proportional 8-Head Canon
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
              ? '0 0 540 550'
              : viewSide === 'front'
                ? '0 0 270 550'
                : '270 0 270 550'
          }
          className="w-full h-auto max-h-[580px] drop-shadow-2xl transition-all duration-300"
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
              <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeWidth="0.4" opacity="0.16" />
            </pattern>
          </defs>

          {/* ════════════════════════════════════════════════════════════════════════
              ANTERIOR (FRONT) BODY — CANONICAL 8-HEAD ATHLETIC PHYSIQUE (X: 0 - 270)
             ════════════════════════════════════════════════════════════════════════ */}
          <g transform="translate(0, 0)">
            <text
              x="135"
              y="20"
              fill="#64748b"
              fontSize="10"
              fontWeight="bold"
              letterSpacing="2"
              textAnchor="middle"
              className="uppercase"
            >
              Anterior (Front)
            </text>

            {/* Anatomical Head, Cranium & Sculpted Facial Planes */}
            <g className="head-group" opacity="0.95">
              {/* Ears */}
              <path d="M113 58 C108 60 108 72 113 74 C114 74 114 71 114 66 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
              <path d="M157 58 C162 60 162 72 157 74 C156 74 156 71 156 66 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />

              {/* Cranium & Sculpted Athletic Jawline */}
              <path
                d="M135 34 C117 34 111 48 112 63 C112 71 114 78 118 84 L123 93 C126 97 130 98 135 98 C140 98 144 97 147 93 L152 84 C156 78 158 71 158 63 C159 48 153 34 135 34 Z"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="1.1"
              />

              {/* Brow Ridge (Supraorbital Line) */}
              <path d="M121 58 Q135 55 149 58" stroke="#64748b" strokeWidth="0.9" fill="none" opacity="0.8" />

              {/* Eye Orbits Silhouette */}
              <ellipse cx="126" cy="63" rx="4.5" ry="2.5" fill="#0f172a" opacity="0.75" />
              <ellipse cx="144" cy="63" rx="4.5" ry="2.5" fill="#0f172a" opacity="0.75" />

              {/* Zygomatic Arch (Cheekbones) */}
              <path d="M115 67 Q123 69 127 75" stroke="#475569" strokeWidth="0.7" fill="none" opacity="0.6" />
              <path d="M155 67 Q147 69 143 75" stroke="#475569" strokeWidth="0.7" fill="none" opacity="0.6" />

              {/* Nasal Bridge & Cartilage */}
              <line x1="135" y1="58" x2="135" y2="73" stroke="#64748b" strokeWidth="0.9" opacity="0.7" />
              <path d="M131 75 Q135 77 139 75" stroke="#64748b" strokeWidth="0.9" fill="none" opacity="0.8" />

              {/* Mouth & Philtrum */}
              <line x1="135" y1="78" x2="135" y2="80" stroke="#475569" strokeWidth="0.6" opacity="0.6" />
              <path d="M127 84 Q135 86 143 84" stroke="#64748b" strokeWidth="0.9" fill="none" opacity="0.8" />
              <path d="M130 89 Q135 90 140 89" stroke="#475569" strokeWidth="0.7" fill="none" opacity="0.6" />

              {/* Chin Landmark */}
              <path d="M131 94 Q135 96 139 94" stroke="#475569" strokeWidth="0.7" fill="none" opacity="0.7" />

              {/* Athletic Neck Column & Sternocleidomastoid (SCM) Muscles */}
              <path d="M123 88 L122 116 L148 116 L147 88 Z" fill="#1e293b" opacity="0.9" />
              <line x1="122" y1="84" x2="133" y2="116" stroke="#64748b" strokeWidth="0.9" opacity="0.75" />
              <line x1="148" y1="84" x2="137" y2="116" stroke="#64748b" strokeWidth="0.9" opacity="0.75" />
              <path d="M133 98 Q135 101 137 98" stroke="#475569" strokeWidth="0.7" fill="none" opacity="0.7" />
            </g>

            {/* UPPER TRAPS (Anterior Clavicular Slope) */}
            <g
              onMouseEnter={() => setHoveredMuscle('traps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('traps')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              <path
                d="M122 88 C120 98 112 108 90 116 L96 119 C112 113 124 104 126 92 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                stroke={getStroke('traps')}
                strokeWidth={getStrokeWidth('traps')}
              />
              <path
                d="M148 88 C150 98 158 108 180 116 L174 119 C158 113 146 104 144 92 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                stroke={getStroke('traps')}
                strokeWidth={getStrokeWidth('traps')}
              />
            </g>

            {/* SHOULDERS / DELTOIDS (Anterior & Lateral Capping) */}
            <g
              onMouseEnter={() => setHoveredMuscle('shoulders')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('shoulders')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Deltoid */}
              <path
                d="M90 116 C76 118 62 128 60 144 C58 158 66 172 72 175 C76 173 80 165 82 152 C84 138 88 126 90 116 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                stroke={getStroke('shoulders')}
                strokeWidth={getStrokeWidth('shoulders')}
              />
              {/* Right Deltoid */}
              <path
                d="M180 116 C194 118 208 128 210 144 C212 158 204 172 198 175 C194 173 190 165 188 152 C186 138 182 126 180 116 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                stroke={getStroke('shoulders')}
                strokeWidth={getStrokeWidth('shoulders')}
              />
            </g>

            {/* CHEST / PECTORALS (Pectoralis Major - Clavicular & Sternal Heads) */}
            <g
              onMouseEnter={() => setHoveredMuscle('chest')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('chest')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Pec */}
              <path
                d="M133 118 C116 116 102 118 90 120 C86 136 84 150 82 156 C90 170 114 174 133 172 Z"
                fill={getHeatFill('chest')}
                opacity={getOpacity('chest')}
                stroke={getStroke('chest')}
                strokeWidth={getStrokeWidth('chest')}
              />
              {/* Right Pec */}
              <path
                d="M137 118 C154 116 168 118 180 120 C184 136 186 150 188 156 C180 170 156 174 137 172 Z"
                fill={getHeatFill('chest')}
                opacity={getOpacity('chest')}
                stroke={getStroke('chest')}
                strokeWidth={getStrokeWidth('chest')}
              />
              {/* Sternal Cleft & Nipple Landmarks */}
              <line x1="135" y1="116" x2="135" y2="173" stroke="#0f172a" strokeWidth="1.2" opacity="0.6" />
              <circle cx="106" cy="154" r="1.5" fill="#475569" opacity="0.6" />
              <circle cx="164" cy="154" r="1.5" fill="#475569" opacity="0.6" />
            </g>

            {/* BACK / LATS (Winged Lateral V-Taper Visible from Front) */}
            <g
              onMouseEnter={() => setHoveredMuscle('back')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Lat Wing */}
              <path
                d="M82 158 C74 174 72 196 78 215 C88 220 92 210 94 195 C92 178 88 165 82 158 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
              {/* Right Lat Wing */}
              <path
                d="M188 158 C196 174 198 196 192 215 C182 220 178 210 176 195 C178 178 182 165 188 158 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
            </g>

            {/* BICEPS & FOREARMS (Arm Muscle Bellies) */}
            <g
              onMouseEnter={() => setHoveredMuscle('biceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('biceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Bicep */}
              <path
                d="M72 174 C60 176 56 190 56 206 C58 214 62 216 66 216 C70 216 74 206 76 194 C76 186 74 178 72 174 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />
              {/* Right Bicep */}
              <path
                d="M198 174 C210 176 214 190 214 206 C212 214 208 216 204 216 C200 216 196 206 194 194 C194 186 196 178 198 174 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />

              {/* Left Forearm */}
              <path
                d="M66 216 C54 220 50 240 54 268 C56 282 60 288 64 288 C68 288 72 278 74 260 C74 242 70 224 66 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />
              {/* Right Forearm */}
              <path
                d="M204 216 C216 220 220 240 216 268 C214 282 210 288 206 288 C202 288 198 278 196 260 C196 242 200 224 204 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />

              {/* Hands & Fingers Contour */}
              <path d="M64 288 L60 300 C58 314 62 330 64 330 C66 330 70 314 68 300 Z" fill="#1e293b" opacity="0.65" />
              <path d="M206 288 L210 300 C212 314 208 330 206 330 C204 330 200 314 202 300 Z" fill="#1e293b" opacity="0.65" />
            </g>

            {/* CORE / ABS & OBLIQUES (Sculpted 6-Pack & Serratus / V-Lines) */}
            <g
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Upper Pack */}
              <path
                d="M133 175 C122 175 116 178 116 195 C122 197 128 197 133 196 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 175 C148 175 154 178 154 195 C148 197 142 197 137 196 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Mid Pack */}
              <path
                d="M133 199 C122 199 116 202 116 225 C122 227 128 227 133 226 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 199 C148 199 154 202 154 225 C148 227 142 227 137 226 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Lower Pack */}
              <path
                d="M133 229 C122 229 118 234 118 262 C124 266 128 268 133 268 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 229 C148 229 152 234 152 262 C146 266 142 268 137 268 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Left External Oblique & V-Taper */}
              <path
                d="M114 196 C102 196 94 206 94 228 C94 250 102 268 116 284 C120 286 122 278 120 266 C116 244 114 218 114 196 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              {/* Right External Oblique & V-Taper */}
              <path
                d="M156 196 C168 196 176 206 176 228 C176 250 168 268 154 284 C150 286 148 278 150 266 C154 244 156 218 156 196 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Navel & Linea Alba */}
              <line x1="135" y1="174" x2="135" y2="288" stroke="#0f172a" strokeWidth="1.2" opacity="0.6" />
              <ellipse cx="135" cy="232" rx="1.5" ry="2" fill="#0f172a" opacity="0.8" />
            </g>

            {/* QUADRICEPS (Vastus Lateralis Sweep, Rectus Femoris & Medialis Teardrop) */}
            <g
              onMouseEnter={() => setHoveredMuscle('quads')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('quads')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Quad Group */}
              {/* Vastus Lateralis Outer Sweep */}
              <path
                d="M96 288 C78 316 74 362 84 402 C92 404 98 386 100 354 C100 326 98 300 96 288 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Rectus Femoris Center Bell */}
              <path
                d="M100 288 C108 288 116 304 116 348 C116 382 110 404 102 414 C96 408 96 388 98 354 C98 324 98 302 100 288 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Vastus Medialis Teardrop */}
              <path
                d="M115 364 C124 374 125 396 121 414 C116 418 110 416 108 412 C110 398 112 380 115 364 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />

              {/* Right Quad Group */}
              {/* Vastus Lateralis Outer Sweep */}
              <path
                d="M174 288 C192 316 196 362 186 402 C178 404 172 386 170 354 C170 326 172 300 174 288 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Rectus Femoris Center Bell */}
              <path
                d="M170 288 C162 288 154 304 154 348 C154 382 160 404 168 414 C174 408 174 388 172 354 C172 324 172 302 170 288 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Vastus Medialis Teardrop */}
              <path
                d="M155 364 C146 374 145 396 149 414 C154 418 160 416 162 412 C160 398 158 380 155 364 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
            </g>

            {/* Patellar Knees */}
            <circle cx="105" cy="422" r="5" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
            <circle cx="165" cy="422" r="5" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />

            {/* CALVES (Tibialis Anterior & Extensors) */}
            <g
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Calf / Shin */}
              <path
                d="M92 430 C82 454 84 488 94 516 C102 516 108 496 110 470 C110 452 102 434 92 430 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
              {/* Right Calf / Shin */}
              <path
                d="M178 430 C188 454 186 488 176 516 C168 516 162 496 160 470 C160 452 168 434 178 430 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
            </g>

            {/* Feet Accents */}
            <ellipse cx="98" cy="532" rx="8" ry="4.5" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
            <ellipse cx="172" cy="532" rx="8" ry="4.5" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
          </g>

          {/* ════════════════════════════════════════════════════════════════════════
              POSTERIOR (BACK) BODY — V-TAPER MUSCULAR BACK & POSTERIOR CHAIN (X: 270 - 540)
             ════════════════════════════════════════════════════════════════════════ */}
          <g transform="translate(270, 0)">
            <text
              x="135"
              y="20"
              fill="#64748b"
              fontSize="10"
              fontWeight="bold"
              letterSpacing="2"
              textAnchor="middle"
              className="uppercase"
            >
              Posterior (Back)
            </text>

            {/* Anatomical Head Back & Occipital Ridge */}
            <g className="head-group-back" opacity="0.95">
              {/* Back of Ears */}
              <path d="M113 58 C108 60 108 72 113 74 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
              <path d="M157 58 C162 60 162 72 157 74 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />

              {/* Occipital Skull Vault */}
              <path
                d="M135 34 C117 34 111 48 112 63 C112 72 116 80 120 86 L124 94 C128 97 132 98 135 98 C138 98 142 97 146 94 L150 86 C154 80 158 72 158 63 C159 48 153 34 135 34 Z"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="1.1"
              />

              {/* Occipital Crest & Inion */}
              <path d="M124 68 Q135 71 146 68" stroke="#475569" strokeWidth="0.8" fill="none" opacity="0.7" />

              {/* Splenius Capitis & Cervical Spine (C1-C7) */}
              <path d="M124 82 L127 116 L143 116 L146 82 Z" fill="#1e293b" opacity="0.9" />
              <line x1="135" y1="78" x2="135" y2="116" stroke="#475569" strokeWidth="0.8" opacity="0.8" strokeDasharray="2,3" />
            </g>

            {/* TRAPEZIUS (Majestic Diamond Kite Formation) */}
            <g
              onMouseEnter={() => setHoveredMuscle('traps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('traps')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Trap */}
              <path
                d="M134 76 L134 226 L108 172 L86 118 L124 82 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                stroke={getStroke('traps')}
                strokeWidth={getStrokeWidth('traps')}
              />
              {/* Right Trap */}
              <path
                d="M136 76 L136 226 L162 172 L184 118 L146 82 Z"
                fill={getHeatFill('traps')}
                opacity={getOpacity('traps')}
                stroke={getStroke('traps')}
                strokeWidth={getStrokeWidth('traps')}
              />
            </g>

            {/* POSTERIOR DELTOIDS (Rear Shoulder Caps) */}
            <g
              onMouseEnter={() => setHoveredMuscle('shoulders')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('shoulders')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Rear Delt */}
              <path
                d="M86 118 C72 120 62 134 62 148 C62 160 70 172 76 174 C80 172 84 162 86 148 C86 136 86 124 86 118 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                stroke={getStroke('shoulders')}
                strokeWidth={getStrokeWidth('shoulders')}
              />
              {/* Right Rear Delt */}
              <path
                d="M184 118 C198 120 208 134 208 148 C208 160 200 172 194 174 C190 172 186 162 184 148 C184 136 184 124 184 118 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                stroke={getStroke('shoulders')}
                strokeWidth={getStrokeWidth('shoulders')}
              />
            </g>

            {/* LATISSIMUS DORSI & RHOMBOIDS (V-Taper Muscle Sweep & Erector Spinae) */}
            <g
              onMouseEnter={() => setHoveredMuscle('back')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Lat & Rhomboids */}
              <path
                d="M86 148 C74 168 70 196 78 222 C88 238 104 250 133 252 L133 226 L108 172 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
              {/* Right Lat & Rhomboids */}
              <path
                d="M184 148 C196 168 200 196 192 222 C182 238 166 250 137 252 L137 226 L162 172 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />

              {/* Lower Back / Erector Spinae Columns */}
              <path
                d="M133 252 L108 252 C108 274 114 288 133 288 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
              <path
                d="M137 252 L162 252 C162 274 156 288 137 288 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
            </g>

            {/* TRICEPS (Horseshoe Triceps Heads) */}
            <g
              onMouseEnter={() => setHoveredMuscle('triceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('triceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Tricep */}
              <path
                d="M62 148 C54 166 52 192 56 216 C60 216 66 214 70 204 C72 186 70 166 68 152 Z"
                fill={getHeatFill('triceps')}
                opacity={getOpacity('triceps')}
                stroke={getStroke('triceps')}
                strokeWidth={getStrokeWidth('triceps')}
              />
              {/* Right Tricep */}
              <path
                d="M208 148 C216 166 218 192 214 216 C210 216 204 214 200 204 C198 186 200 166 202 152 Z"
                fill={getHeatFill('triceps')}
                opacity={getOpacity('triceps')}
                stroke={getStroke('triceps')}
                strokeWidth={getStrokeWidth('triceps')}
              />
            </g>

            {/* POSTERIOR FOREARMS (Extensors Group) */}
            <g
              onMouseEnter={() => setHoveredMuscle('biceps')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('biceps')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Forearm Extensors */}
              <path
                d="M56 216 C50 234 50 262 56 288 C60 288 66 282 68 266 C70 248 68 226 64 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />
              {/* Right Forearm Extensors */}
              <path
                d="M214 216 C220 234 220 262 214 288 C210 288 204 282 202 266 C200 248 202 226 206 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />

              {/* Hands Back Profile */}
              <path d="M56 288 L52 300 C50 314 54 330 56 330 C58 330 62 314 60 300 Z" fill="#1e293b" opacity="0.65" />
              <path d="M214 288 L218 300 C220 314 216 330 214 330 C212 330 208 314 210 300 Z" fill="#1e293b" opacity="0.65" />
            </g>

            {/* GLUTEUS MAXIMUS & HAMSTRINGS (Posterior Hip & Thigh Chain) */}
            <g
              onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('hamstrings_glutes')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Gluteus Maximus */}
              <path
                d="M133 264 C108 260 92 274 88 296 C86 322 102 338 128 336 C134 336 134 316 133 264 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
              {/* Right Gluteus Maximus */}
              <path
                d="M137 264 C162 260 178 274 182 296 C184 322 168 338 142 336 C136 336 136 316 137 264 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />

              {/* Left Hamstrings (Biceps Femoris & Semitendinosus) */}
              <path
                d="M96 338 C86 364 88 396 98 424 C108 424 116 414 122 392 C126 368 128 344 124 336 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
              {/* Right Hamstrings (Biceps Femoris & Semitendinosus) */}
              <path
                d="M174 338 C184 364 182 396 172 424 C162 424 154 414 148 392 C144 368 142 344 146 336 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
            </g>

            {/* Back of Knee Fossa */}
            <circle cx="104" cy="422" r="3.5" fill="#1e293b" opacity="0.6" />
            <circle cx="166" cy="422" r="3.5" fill="#1e293b" opacity="0.6" />

            {/* CALVES (Diamond Gastrocnemius Heads & Achilles Tendon) */}
            <g
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Calf (Medial & Lateral Heads) */}
              <path
                d="M98 426 C84 446 84 472 98 488 C102 488 108 486 112 478 C116 462 116 442 106 426 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
              {/* Right Calf (Medial & Lateral Heads) */}
              <path
                d="M172 426 C186 446 186 472 172 488 C168 488 162 486 158 478 C154 462 154 442 164 426 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />

              {/* Achilles Tendon Columns */}
              <line x1="104" y1="488" x2="104" y2="524" stroke="#475569" strokeWidth="1.6" opacity="0.65" />
              <line x1="166" y1="488" x2="166" y2="524" stroke="#475569" strokeWidth="1.6" opacity="0.65" />
            </g>

            {/* Calcaneus (Heel) Accents */}
            <ellipse cx="104" cy="530" rx="7" ry="4" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
            <ellipse cx="166" cy="530" rx="7" ry="4" fill="#1e293b" stroke="#475569" strokeWidth="0.8" />
          </g>

          {/* Striation Texture Overlay */}
          <rect
            x="0"
            y="0"
            width="540"
            height="550"
            fill={`url(#${baseId}-striations)`}
            pointerEvents="none"
            opacity="0.25"
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
