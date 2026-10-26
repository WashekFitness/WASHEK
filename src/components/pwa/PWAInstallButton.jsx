import { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, Share2, X, Smartphone, MoreVertical } from 'lucide-react';

export default function PWAInstallButton({ className = '', compact = false }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowGuide(true);
      }
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        aria-label="Install WASHEK App"
        className={
          className ||
          `flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-all shadow-md active:scale-95 cursor-pointer ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
          }`
        }
      >
        {isInstallable ? (
          <Download className="w-4 h-4 shrink-0" />
        ) : (
          <Smartphone className="w-4 h-4 shrink-0 text-primary" />
        )}
        <span>Install App</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-6 pt-[max(1.75rem,calc(env(safe-area-inset-top,0px)+1.75rem))] pb-[max(1.75rem,calc(env(safe-area-inset-bottom,0px)+1.75rem))]"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card border border-border/80 p-5 sm:p-6 shadow-2xl text-foreground my-auto shrink-0 relative animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with real WASHEK logo */}
            <div className="flex items-center justify-between pb-3.5 border-b border-border/70">
              <div className="flex items-center gap-2.5">
                <div className="relative p-0.5 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/25 shadow-xs shrink-0">
                  <img
                    src="/washek-fitness-logo.jpg"
                    alt="WASHEK"
                    className="w-7 h-7 rounded-[9px] object-contain shrink-0"
                  />
                </div>
                <div>
                  <h3 className="text-base font-bold font-heading text-foreground tracking-tight leading-tight">
                    Install WASHEK
                  </h3>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Add to your Home Screen
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Instruction Steps */}
            <div className="mt-4 space-y-3.5 text-xs sm:text-sm text-muted-foreground">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-2.5 bg-muted/30 p-2.5 rounded-xl border border-border/40">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs mt-0.5 font-heading">
                      1
                    </span>
                    <span className="text-foreground/90 leading-relaxed">
                      Tap the <strong className="text-foreground font-semibold">Share</strong> button{' '}
                      <Share2 className="inline-block w-3.5 h-3.5 text-primary mx-0.5 align-text-bottom" /> in Safari's bottom toolbar.
                    </span>
                  </div>

                  <div className="flex items-start gap-2.5 bg-muted/30 p-2.5 rounded-xl border border-border/40">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs mt-0.5 font-heading">
                      2
                    </span>
                    <span className="text-foreground/90 leading-relaxed">
                      Scroll down and tap <strong className="text-foreground font-semibold">Add to Home Screen</strong>.
                    </span>
                  </div>

                  <div className="flex items-start gap-2.5 bg-muted/30 p-2.5 rounded-xl border border-border/40">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs mt-0.5 font-heading">
                      3
                    </span>
                    <span className="text-foreground/90 leading-relaxed">
                      Tap <strong className="text-foreground font-semibold">Add</strong> in the top right to install WASHEK as a standalone app!
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5 bg-muted/30 p-2.5 rounded-xl border border-border/40">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs mt-0.5 font-heading">
                      1
                    </span>
                    <span className="text-foreground/90 leading-relaxed">
                      Tap the browser menu <MoreVertical className="inline-block w-3.5 h-3.5 text-primary mx-0.5 align-text-bottom" /> in the top right corner.
                    </span>
                  </div>

                  <div className="flex items-start gap-2.5 bg-muted/30 p-2.5 rounded-xl border border-border/40">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs mt-0.5 font-heading">
                      2
                    </span>
                    <span className="text-foreground/90 leading-relaxed">
                      Select <strong className="text-foreground font-semibold">Install app</strong> or <strong className="text-foreground font-semibold">Add to Home screen</strong>.
                    </span>
                  </div>

                  <div className="flex items-start gap-2.5 bg-muted/30 p-2.5 rounded-xl border border-border/40">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-xs mt-0.5 font-heading">
                      3
                    </span>
                    <span className="text-foreground/90 leading-relaxed">
                      Launch WASHEK directly from your home screen with fast offline access!
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-primary hover:bg-primary/90 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground font-heading shadow-md transition active:scale-95 cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
