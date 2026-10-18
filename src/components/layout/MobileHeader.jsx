import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import AppSettingsModal from '@/components/AppSettingsModal';

const ROOT_PATHS = ['/', '/program', '/nutrition', '/profile', '/kael'];

const PAGE_NAMES = {
  '/': 'Home',
  '/program': 'Program',
  '/nutrition': 'Nutrition',
  '/profile': 'Profile',
  '/progress': 'Progress',
  '/photos': 'Progress Photos',
  '/formlab': 'Form Lab',
  '/about': 'About',
  '/contact': 'Support',
  '/terms': 'Terms',
  '/privacy': 'Privacy',
};

export default function MobileHeader({ scrollRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const pathname = location.pathname;
  const isRoot = ROOT_PATHS.includes(pathname);

  // Derive human-readable section label
  let pageTitle = PAGE_NAMES[pathname];
  if (!pageTitle) {
    if (pathname.startsWith('/program/day/')) {
      pageTitle = 'Workout';
    } else {
      pageTitle = 'WASHEK';
    }
  }

  const handleScrollToTop = (e) => {
    e?.stopPropagation?.();
    scrollRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const plan = user?.subscription_plan;
  const isUpgraded = plan && plan !== 'free';

  return (
    <header
      onClick={handleScrollToTop}
      className="fixed top-0 left-0 right-0 z-40 sm:hidden bg-background/85 dark:bg-card/85 backdrop-blur-2xl border-b border-border/70 dark:border-white/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35)] select-none pointer-events-auto transition-colors cursor-pointer"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
      title="Tap to scroll to top"
    >
      <div className="h-14 px-3.5 flex items-center justify-between gap-2.5">
        {/* Left Side: Back button or Logo + Title */}
        <div className="flex items-center gap-2 min-w-0">
          {!isRoot ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(-1);
              }}
              aria-label="Go back"
              className="flex items-center justify-center w-9 h-9 -ml-1 rounded-xl bg-muted/60 dark:bg-card/40 border border-border/70 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 pointer-events-none" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleScrollToTop}
            aria-label="Scroll to top of page"
            className="flex items-center gap-2.5 text-left active:opacity-85 transition-opacity min-w-0 group cursor-pointer"
          >
            <div className="relative p-0.5 rounded-xl bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/25 shadow-xs shadow-primary/15 shrink-0 group-hover:scale-105 transition-transform">
              <img
                src="/washek-fitness-logo.jpg"
                alt="WASHEK"
                className="w-7 h-7 rounded-[10px] object-contain shrink-0 pointer-events-none"
              />
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-black text-sm tracking-wider text-foreground uppercase leading-none">
                  WASHEK
                </span>
                {isUpgraded && (
                  <span className="text-[9px] font-heading font-extrabold px-1.5 py-0.2 rounded-md bg-primary/15 text-primary border border-primary/25 uppercase tracking-wider leading-tight">
                    {plan}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground tracking-wide truncate leading-none mt-1">
                {pageTitle}
              </span>
            </div>
          </button>
        </div>

        {/* Right Side: Quick Settings */}
        <div className="flex items-center gap-1.5 shrink-0">
          <AppSettingsModal
            triggerClassName="w-9 h-9 min-w-9 min-h-9 rounded-xl bg-muted/60 dark:bg-card/40 border-border/70 hover:bg-muted text-muted-foreground hover:text-foreground shadow-none"
            iconClassName="w-4 h-4"
          />
        </div>
      </div>
    </header>
  );
}
