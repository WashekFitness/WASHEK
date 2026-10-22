import { useEffect, useRef } from 'react';
import {
  Outlet,
  Link,
  useLocation,
} from 'react-router-dom';

import {
  Home,
  Dumbbell,
  Camera,
  User,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  motion,
  AnimatePresence,
} from 'framer-motion';

import Footer from '@/components/layout/Footer';
import PullToRefresh from '@/components/layout/PullToRefresh';
import MobileHeader from '@/components/layout/MobileHeader';
import PWAInstallButton from '@/components/pwa/PWAInstallButton';


const navItems = [
  {
    path: '/',
    icon: Home,
    label: 'Home',
  },
  {
    path: '/program',
    icon: Dumbbell,
    label: 'Program',
  },
  {
    path: '/kael',
    icon: Zap,
    label: 'Kael',
  },
  {
    path: '/nutrition',
    icon: Camera,
    label: 'Nutrition',
  },
  {
    path: '/profile',
    icon: User,
    label: 'Me',
  },
];


function NavItem({
  path,
  icon: Icon,
  label,
  isActive,
}) {
  return (
    <Link
      to={path}
      className={cn(
        `
          relative
          z-10
          flex
          items-center
          gap-3
          px-3.5
          py-2.5
          rounded-xl
          transition-all
          duration-150
          pointer-events-auto
          touch-manipulation
        `,
        isActive
          ? 'text-primary bg-primary/10 dark:bg-primary/15 border border-primary/30 shadow-[0_0_18px_rgba(37,99,235,0.14)] font-semibold'
          : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-100/80 dark:hover:bg-white/[0.05] border border-transparent'
      )}
      aria-current={
        isActive
          ? 'page'
          : undefined
      }
    >
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-primary to-blue-400 rounded-r-full shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
      )}
      <Icon
        className="w-5 h-5 shrink-0"
        strokeWidth={
          isActive
            ? 2.5
            : 1.75
        }
      />

      <span className="text-sm font-heading hidden md:block">
        {label}
      </span>
    </Link>
  );
}


export default function AppLayout() {
  const location =
    useLocation();

  const scrollRef =
    useRef(null);

  const isKael =
    location.pathname ===
    '/kael';


  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    });
  }, [location.pathname]);


  if (
    location.pathname ===
    '/onboarding'
  ) {
    return <Outlet />;
  }


  return (
    <div
      className="
        relative
        z-0
        w-full
        h-screen
        bg-background
        font-body
        flex
        overflow-hidden
      "
    >

      {/* =====================================================
          DESKTOP SIDEBAR
          ===================================================== */}

      <aside
        className="
          hidden
          sm:flex
          flex-col
          fixed
          top-0
          left-0
          h-full
          z-40
          bg-card/90
          dark:bg-card/75
          backdrop-blur-2xl
          border-r
          border-slate-200/80
          dark:border-white/[0.08]
          w-16
          md:w-56
          py-6
          overflow-y-auto
          pointer-events-auto
          shadow-[4px_0_24px_rgba(15,23,42,0.02)]
          dark:shadow-[4px_0_30px_rgba(0,0,0,0.4)]
        "
        style={{
          paddingTop:
            'max(1.5rem, env(safe-area-inset-top))',
        }}
      >

        {/* Branding */}

        <div className="px-4 mb-8 flex items-center gap-3">

          <div className="relative p-0.5 rounded-xl bg-gradient-to-br from-primary/30 to-transparent border border-primary/20 shrink-0 shadow-sm shadow-primary/10">
            <img
              src="/washek-fitness-logo.jpg"
              alt="WASHEK"
              className="
                w-7
                h-7
                rounded-[10px]
                object-contain
                shrink-0
              "
            />
          </div>

          <div className="hidden md:flex items-center">
            <span className="
              font-heading
              font-bold
              text-base
              tracking-wider
              text-foreground
              leading-none
            ">
              WASHEK
            </span>
          </div>

        </div>


        {/* Desktop navigation */}

        <nav
          className="
            flex
            flex-1
            flex-col
            gap-1
            px-2
            pointer-events-auto
          "
          aria-label="Main navigation"
        >

          {navItems.map(
            (item) => (
              <NavItem
                key={
                  item.path
                }
                {...item}
                isActive={
                  location.pathname ===
                  item.path
                }
              />
            )
          )}

        </nav>

        <div className="px-2 pt-4 mt-auto border-t border-border/50 hidden md:block">
          <PWAInstallButton className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 px-3 py-2 text-xs font-semibold transition-all active:scale-95" />
        </div>

      </aside>


      {/* =====================================================
          MOBILE HEADER (Clock & Notch Safe Shield)
          ===================================================== */}

      {!isKael && <MobileHeader scrollRef={scrollRef} />}


      {/* =====================================================
          SCROLLING CONTENT AREA
          ===================================================== */}

      <div
        ref={
          scrollRef
        }
        className="
          relative
          z-0
          flex-1
          sm:ml-16
          md:ml-56
          min-w-0
          h-screen
          overflow-y-auto
          overflow-x-hidden
          overscroll-y-contain
          pointer-events-auto
        "
      >

        <main
          className={cn(
            `
              relative
              z-0
              w-full
              max-w-3xl
              lg:max-w-5xl
              xl:max-w-6xl
              mx-auto
              px-4
              sm:px-6
              pointer-events-auto
            `,

            isKael
              ? 'pt-0 pb-0'
              : 'pt-[calc(env(safe-area-inset-top,0px)+4.25rem)] pb-safe sm:pt-6 sm:pb-6'
          )}
        >

          <AnimatePresence
            mode="wait"
            initial={false}
          >

            <motion.div
              key={
                location.pathname
              }

              initial={{
                opacity: 0,
              }}

              animate={{
                opacity: 1,
              }}

              exit={{
                opacity: 0,
              }}

              transition={{
                duration: 0.15,
              }}

              className="
                relative
                z-0
                pointer-events-auto
              "
            >
              <PullToRefresh>
                <Outlet />
              </PullToRefresh>
            </motion.div>

          </AnimatePresence>


          {!isKael && (
            <div className="relative z-0 pointer-events-auto">
              <Footer />
            </div>
          )}

        </main>

      </div>


      {/* =====================================================
          MOBILE BOTTOM NAV
          ===================================================== */}

      <nav
        className="
          sm:hidden
          fixed
          bottom-0
          left-0
          right-0
          z-50
          bg-card/95
          backdrop-blur-2xl
          border-t
          border-border/90
          dark:border-white/[0.08]
          shadow-[0_-4px_24px_rgba(15,23,42,0.08)]
          dark:shadow-[0_-8px_32px_rgba(0,0,0,0.55)]
          pointer-events-auto
        "
        style={{
          paddingBottom:
            'env(safe-area-inset-bottom)',
        }}
        aria-label="Mobile navigation"
      >

        <div
          className="
            flex
            items-center
            justify-around
            px-1
            py-2
            pointer-events-auto
          "
        >

          {navItems.map(
            ({
              path,
              icon: Icon,
              label,
              shortLabel,
            }) => {

              const isActive =
                location.pathname ===
                path;

              return (
                <Link
                  key={
                    path
                  }

                  to={
                    path
                  }

                  aria-label={
                    label
                  }

                  aria-current={
                    isActive
                      ? 'page'
                      : undefined
                  }

                  onClick={() => {
                    if (
                      isActive
                    ) {
                      scrollRef.current?.scrollTo(
                        {
                          top: 0,
                          behavior:
                            'smooth',
                        }
                      );
                    }
                  }}

                  className={cn(
                    `
                      relative
                      z-10
                      flex
                      flex-col
                      items-center
                      gap-0.5
                      px-2
                      rounded-xl
                      transition-all
                      pointer-events-auto
                      touch-manipulation
                    `,

                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}

                  style={{
                    minHeight:
                      44,
                    minWidth:
                      52,
                  }}
                >

                  <div
                    className={cn(
                      `
                        p-1.5
                        rounded-xl
                        transition-all
                        duration-200
                      `,
                      isActive
                        ? 'bg-gradient-to-br from-primary/25 to-primary/10 text-primary border border-primary/30 shadow-[0_0_14px_rgba(37,99,235,0.35)] scale-105'
                        : 'text-slate-500 dark:text-muted-foreground'
                    )}
                  >

                    <Icon
                      className="
                        w-5
                        h-5
                      "
                      strokeWidth={
                        isActive
                          ? 2.5
                          : 1.75
                      }
                    />

                  </div>


                  <span className={cn(
                    "text-[10px] whitespace-nowrap transition-colors",
                    isActive ? "font-heading font-bold text-primary tracking-tight" : "font-heading font-medium text-slate-500 dark:text-muted-foreground"
                  )}>
                    {
                      shortLabel ||
                      label
                    }
                  </span>

                </Link>
              );
            }
          )}

        </div>

      </nav>

    </div>
  );
}
