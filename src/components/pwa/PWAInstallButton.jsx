import { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share2, X, Smartphone } from 'lucide-react';

export default function PWAInstallButton({ className = '', compact = false }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          className ||
          `flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all shadow-md active:scale-95 ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
          }`
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            className ||
            `flex items-center gap-2 rounded-xl border border-border bg-card/80 hover:bg-muted text-foreground font-medium transition-all active:scale-95 ${
              compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
            }`
          }
        >
          <Smartphone className="w-4 h-4 shrink-0 text-primary" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
                    W
                  </div>
                  <h3 className="text-base font-bold text-white">Install WASHEK</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-zinc-300">
                <p className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-bold text-xs mt-0.5">
                    1
                  </span>
                  <span>
                    Tap the <strong className="text-white">Share</strong> button{' '}
                    <Share2 className="inline-block w-4 h-4 text-blue-400 mx-0.5" /> in Safari's bottom toolbar.
                  </span>
                </p>
                <p className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-bold text-xs mt-0.5">
                    2
                  </span>
                  <span>
                    Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                  </span>
                </p>
                <p className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600/30 text-blue-400 font-bold text-xs mt-0.5">
                    3
                  </span>
                  <span>Open WASHEK from your home screen for full offline access!</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-zinc-800 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
