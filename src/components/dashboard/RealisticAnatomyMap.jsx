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
                d="M92 116 C76 118 60 128 58 144 C56 158 64 172 70 175 C74 173 78 165 80 152 C82 138 88 126 92 116 Z"
                fill={getHeatFill('shoulders')}
                opacity={getOpacity('shoulders')}
                stroke={getStroke('shoulders')}
                strokeWidth={getStrokeWidth('shoulders')}
              />
              {/* Right Deltoid */}
              <path
                d="M178 116 C194 118 210 128 212 144 C214 158 206 172 200 175 C196 173 192 165 190 152 C188 138 182 126 178 116 Z"
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
                d="M133 118 C116 116 102 118 90 120 C84 136 82 150 82 156 C90 170 114 174 133 172 Z"
                fill={getHeatFill('chest')}
                opacity={getOpacity('chest')}
                stroke={getStroke('chest')}
                strokeWidth={getStrokeWidth('chest')}
              />
              {/* Right Pec */}
              <path
                d="M137 118 C154 116 168 118 180 120 C186 136 188 150 188 156 C180 170 156 174 137 172 Z"
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
              {/* Left Lat Wing (Sleek V-Taper, no bulging) */}
              <path
                d="M86 162 C80 176 80 196 86 215 C94 218 98 210 100 195 C98 180 94 168 86 162 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
              {/* Right Lat Wing */}
              <path
                d="M184 162 C190 176 190 196 184 215 C176 218 172 210 170 195 C172 180 176 168 184 162 Z"
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
                d="M70 174 C58 176 54 190 54 206 C56 214 60 216 64 216 C68 216 72 206 74 194 C74 186 72 178 70 174 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />
              {/* Right Bicep */}
              <path
                d="M200 174 C212 176 216 190 216 206 C214 214 210 216 206 216 C202 216 198 206 196 194 C196 186 198 178 200 174 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />

              {/* Left Forearm */}
              <path
                d="M64 216 C52 220 48 240 52 268 C54 282 58 288 62 288 C66 288 70 278 72 260 C72 242 68 224 64 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />
              {/* Right Forearm */}
              <path
                d="M206 216 C218 220 222 240 218 268 C216 282 212 288 208 288 C204 288 200 278 198 260 C198 242 202 224 206 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />

              {/* Hands & Fingers Contour */}
              <path d="M62 288 L58 300 C56 314 60 330 62 330 C64 330 68 314 66 300 Z" fill="#1e293b" opacity="0.65" />
              <path d="M208 288 L212 300 C214 314 210 330 208 330 C206 330 202 314 204 300 Z" fill="#1e293b" opacity="0.65" />
            </g>

            {/* CORE / ABS & OBLIQUES (Sculpted Proportional 8-Pack & Chiseled V-Taper Obliques) */}
            <g
              onMouseEnter={() => setHoveredMuscle('core')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('core')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Upper Pack (X: 109 - 161) */}
              <path
                d="M133 175 C118 175 109 179 109 195 C118 197 127 197 133 195 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 175 C152 175 161 179 161 195 C152 197 143 197 137 195 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Mid-Upper Pack */}
              <path
                d="M133 198 C118 198 109 202 109 220 C118 222 127 222 133 221 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 198 C152 198 161 202 161 220 C152 222 143 222 137 221 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Mid-Lower Pack */}
              <path
                d="M133 224 C118 224 110 228 110 248 C119 250 127 251 133 250 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 224 C152 224 160 228 160 248 C151 250 143 251 137 250 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Lower Abdominal Shelf */}
              <path
                d="M133 252 C119 252 112 258 112 274 C120 278 127 279 133 279 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              <path
                d="M137 252 C151 252 158 258 158 274 C150 278 143 279 137 279 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Left External Oblique (Serrated & Tapered Waist) */}
              <path
                d="M108 192 C98 192 94 204 94 224 C94 246 102 266 112 278 C114 279 116 272 115 262 C112 242 110 216 108 192 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />
              {/* Right External Oblique */}
              <path
                d="M162 192 C172 192 176 204 176 224 C176 246 168 266 158 278 C156 279 154 272 155 262 C158 242 160 216 162 192 Z"
                fill={getHeatFill('core')}
                opacity={getOpacity('core')}
                stroke={getStroke('core')}
                strokeWidth={getStrokeWidth('core')}
              />

              {/* Navel & Linea Alba */}
              <line x1="135" y1="174" x2="135" y2="282" stroke="#0f172a" strokeWidth="1.2" opacity="0.6" />
              <ellipse cx="135" cy="236" rx="1.5" ry="2" fill="#0f172a" opacity="0.8" />
            </g>

            {/* QUADRICEPS (Proportional Wide Sweep: Vastus Lateralis, Rectus Femoris, Vastus Medialis) */}
            <g
              onMouseEnter={() => setHoveredMuscle('quads')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('quads')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Quad Group */}
              {/* Vastus Lateralis Outer Sweep (Hip flare matching chest/shoulder X-frame) */}
              <path
                d="M108 278 C98 275 91 281 85 296 C74 324 74 360 82 394 C85 405 90 411 96 411 C100 404 101 382 101 354 C101 322 104 294 108 278 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Rectus Femoris Center Belly */}
              <path
                d="M109 278 C117 278 124 288 125 318 C125 352 121 388 114 414 C106 414 101 404 102 368 C102 332 104 298 109 278 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Upper Adductor / Sartorius Hip Bridge */}
              <path
                d="M122 280 C128 282 133 288 133 302 C133 318 130 342 126 364 C124 342 124 310 122 280 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Vastus Medialis Teardrop */}
              <path
                d="M125 328 C131 344 133 376 128 408 C124 415 117 415 115 411 C118 392 122 360 125 328 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />

              {/* Right Quad Group */}
              {/* Vastus Lateralis Outer Sweep */}
              <path
                d="M162 278 C172 275 179 281 185 296 C196 324 196 360 188 394 C185 405 180 411 174 411 C170 404 169 382 169 354 C169 322 166 294 162 278 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Rectus Femoris Center Belly */}
              <path
                d="M161 278 C153 278 146 288 145 318 C145 352 149 388 156 414 C164 414 169 404 168 368 C168 332 166 298 161 278 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Upper Adductor / Sartorius Hip Bridge */}
              <path
                d="M148 280 C142 282 137 288 137 302 C137 318 140 342 144 364 C146 342 146 310 148 280 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
              {/* Vastus Medialis Teardrop */}
              <path
                d="M145 328 C139 344 137 376 142 408 C146 415 153 415 155 411 C152 392 148 360 145 328 Z"
                fill={getHeatFill('quads')}
                opacity={getOpacity('quads')}
                stroke={getStroke('quads')}
                strokeWidth={getStrokeWidth('quads')}
              />
            </g>

            {/* Patellar Knees */}
            <circle cx="107" cy="420" r="5.5" fill="#1e293b" stroke="#475569" strokeWidth="0.9" />
            <circle cx="163" cy="420" r="5.5" fill="#1e293b" stroke="#475569" strokeWidth="0.9" />

            {/* CALVES (Proportional Gastrocnemius Sweep, Tibialis Anterior & Ankles) */}
            <g
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Calf / Shin */}
              <path
                d="M97 426 C85 446 84 474 96 518 C100 521 108 521 112 518 C119 490 123 462 121 440 C120 431 115 426 107 425 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
              {/* Right Calf / Shin */}
              <path
                d="M173 426 C185 446 186 474 174 518 C170 521 162 521 158 518 C151 490 147 462 149 440 C150 431 155 426 163 425 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
            </g>

            {/* Feet Accents */}
            <ellipse cx="105" cy="532" rx="11" ry="4.5" fill="#1e293b" stroke="#475569" strokeWidth="0.9" />
            <ellipse cx="165" cy="532" rx="11" ry="4.5" fill="#1e293b" stroke="#475569" strokeWidth="0.9" />
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

            {/* LATISSIMUS DORSI & RHOMBOIDS (Sleek V-Taper Sweep & Sculpted Erector Spinae) */}
            <g
              onMouseEnter={() => setHoveredMuscle('back')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('back')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Lat & Rhomboids (Sleek inward V-taper) */}
              <path
                d="M92 148 C86 172 86 198 94 222 C104 234 118 244 133 246 L133 226 L108 172 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
              {/* Right Lat & Rhomboids */}
              <path
                d="M178 148 C184 172 184 198 176 222 C166 234 152 244 137 246 L137 226 L162 172 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />

              {/* Lower Back / Erector Spinae Columns (Christmas Tree - Tight & Defined) */}
              <path
                d="M133 246 L120 246 C119 262 124 278 133 280 Z"
                fill={getHeatFill('back')}
                opacity={getOpacity('back')}
                stroke={getStroke('back')}
                strokeWidth={getStrokeWidth('back')}
              />
              <path
                d="M137 246 L150 246 C151 262 146 278 137 280 Z"
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
                d="M60 148 C52 166 50 192 54 216 C58 216 64 214 68 204 C70 186 68 166 66 152 Z"
                fill={getHeatFill('triceps')}
                opacity={getOpacity('triceps')}
                stroke={getStroke('triceps')}
                strokeWidth={getStrokeWidth('triceps')}
              />
              {/* Right Tricep */}
              <path
                d="M210 148 C218 166 220 192 216 216 C212 216 206 214 202 204 C200 186 202 166 204 152 Z"
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
                d="M54 216 C48 234 48 262 54 288 C58 288 64 282 66 266 C68 248 66 226 62 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />
              {/* Right Forearm Extensors */}
              <path
                d="M216 216 C222 234 222 262 216 288 C212 288 206 282 204 266 C202 248 204 226 208 216 Z"
                fill={getHeatFill('biceps')}
                opacity={getOpacity('biceps')}
                stroke={getStroke('biceps')}
                strokeWidth={getStrokeWidth('biceps')}
              />

              {/* Hands Back Profile */}
              <path d="M54 288 L50 300 C48 314 52 330 54 330 C56 330 60 314 58 300 Z" fill="#1e293b" opacity="0.65" />
              <path d="M216 288 L220 300 C222 314 218 330 216 330 C214 330 210 314 212 300 Z" fill="#1e293b" opacity="0.65" />
            </g>

            {/* GLUTEUS MAXIMUS & HAMSTRINGS (Proportional Glute Shelf & Full Posterior Thighs) */}
            <g
              onMouseEnter={() => setHoveredMuscle('hamstrings_glutes')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('hamstrings_glutes')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Gluteus Maximus */}
              <path
                d="M133 278 C118 274 102 273 94 282 C84 294 82 316 90 332 C102 340 120 340 132 336 C134 334 134 308 133 278 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
              {/* Right Gluteus Maximus */}
              <path
                d="M137 278 C152 274 168 273 176 282 C186 294 188 316 180 332 C168 340 150 340 138 336 C136 334 136 308 137 278 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />

              {/* Left Hamstrings (Lateral Biceps Femoris + Medial Semitendinosus) */}
              <path
                d="M90 332 C77 350 75 382 86 414 C94 417 104 414 106 396 C108 370 105 344 100 336 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
              <path
                d="M102 337 C106 364 106 394 104 415 C115 416 124 410 127 386 C131 360 132 340 131 336 C120 340 109 340 102 337 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />

              {/* Right Hamstrings (Lateral Biceps Femoris + Medial Semitendinosus) */}
              <path
                d="M180 332 C193 350 195 382 184 414 C176 417 166 414 164 396 C162 370 165 344 170 336 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
              <path
                d="M168 337 C164 364 164 394 166 415 C155 416 146 410 143 386 C139 360 138 340 139 336 C150 340 161 340 168 337 Z"
                fill={getHeatFill('hamstrings_glutes')}
                opacity={getOpacity('hamstrings_glutes')}
                stroke={getStroke('hamstrings_glutes')}
                strokeWidth={getStrokeWidth('hamstrings_glutes')}
              />
            </g>

            {/* Back of Knee Fossa */}
            <circle cx="105" cy="420" r="4.5" fill="#1e293b" opacity="0.6" />
            <circle cx="165" cy="420" r="4.5" fill="#1e293b" opacity="0.6" />

            {/* CALVES (Proportional Diamond Gastrocnemius Heads & Achilles Tendon) */}
            <g
              onMouseEnter={() => setHoveredMuscle('calves')}
              onMouseLeave={() => setHoveredMuscle(null)}
              onClick={() => onSelectMuscle('calves')}
              className="cursor-pointer transition-all hover:brightness-125"
            >
              {/* Left Calf (Lateral & Medial Heads) */}
              <path
                d="M96 426 C84 446 84 474 96 496 C101 496 104 490 105 476 C105 456 104 438 102 426 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
              <path
                d="M105 426 C105 446 105 474 106 494 C112 496 119 488 122 472 C124 452 120 434 112 426 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />

              {/* Right Calf (Lateral & Medial Heads) */}
              <path
                d="M174 426 C186 446 186 474 174 496 C169 496 166 490 165 476 C165 456 166 438 168 426 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />
              <path
                d="M165 426 C165 446 165 474 164 494 C158 496 151 488 148 472 C146 452 150 434 158 426 Z"
                fill={getHeatFill('calves')}
                opacity={getOpacity('calves')}
                stroke={getStroke('calves')}
                strokeWidth={getStrokeWidth('calves')}
              />

              {/* Lower Soleus & Achilles Tendon Columns */}
              <path d="M97 495 L100 524 L110 524 L113 495 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.7" opacity="0.7" />
              <path d="M173 495 L170 524 L160 524 L157 495 Z" fill="#1e293b" stroke="#475569" strokeWidth="0.7" opacity="0.7" />
              <line x1="105" y1="490" x2="105" y2="525" stroke="#475569" strokeWidth="1.8" opacity="0.75" />
              <line x1="165" y1="490" x2="165" y2="525" stroke="#475569" strokeWidth="1.8" opacity="0.75" />
            </g>

            {/* Calcaneus (Heel) Accents */}
            <ellipse cx="105" cy="532" rx="10" ry="5" fill="#1e293b" stroke="#475569" strokeWidth="0.9" />
            <ellipse cx="165" cy="532" rx="10" ry="5" fill="#1e293b" stroke="#475569" strokeWidth="0.9" />
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
