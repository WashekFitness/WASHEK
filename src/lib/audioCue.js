/**
 * Lightweight Web Audio API synthesizer for workout cues and rest timer alerts.
 * Uses zero external audio files and works reliably across modern mobile browsers.
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
}

/**
 * Play a clean beep tone.
 * @param {number} freq Frequency in Hz (e.g. 587, 880)
 * @param {number} duration Duration in seconds
 * @param {'sine'|'triangle'} type Waveform
 */
export function playTone(freq = 880, duration = 0.18, type = 'sine') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Smooth attack and release envelope to prevent clicking
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_e) {
    // Audio context play note
  }
}

/**
 * Cue sounded when a rest interval completes.
 * Two quick crisp ascending tones.
 */
export function playRestCompleteCue() {
  playTone(659.25, 0.12, 'sine'); // E5
  setTimeout(() => {
    playTone(880, 0.22, 'sine'); // A5
  }, 140);
}

/**
 * 3-2-1 Countdown tick sound.
 */
export function playCountdownTick() {
  playTone(523.25, 0.08, 'triangle'); // C5
}
