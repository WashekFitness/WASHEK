/**
 * Haptic feedback utility using navigator.vibrate()
 * Provides subtle tactile feedback for button presses, toggles, and goal completions
 * to enhance the high-end native mobile feel.
 */

export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  // Check if vibration API is supported
  if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
    return;
  }

  try {
    switch (type) {
      case 'light':
      case 'button':
        // Subtle crisp tap for standard buttons
        navigator.vibrate(10);
        break;

      case 'medium':
        // Slightly firmer tap
        navigator.vibrate(20);
        break;

      case 'heavy':
        // Firm tap for primary / destructive actions
        navigator.vibrate(35);
        break;

      case 'selection':
      case 'toggle':
        // Quick subtle tick for switches and checkboxes
        navigator.vibrate(12);
        break;

      case 'success':
      case 'goal':
        // Double-pulse celebration for completing a set, workout, or goal
        navigator.vibrate([15, 40, 25]);
        break;

      case 'warning':
        navigator.vibrate([25, 30, 25]);
        break;

      case 'error':
        // Staccato pattern for errors
        navigator.vibrate([40, 30, 40]);
        break;

      default:
        navigator.vibrate(12);
        break;
    }
  } catch {
    // Gracefully ignore any browser permission or security restrictions
  }
}
