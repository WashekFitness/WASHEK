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
          px-4
          py-3
          rounded-xl
          transition-all
          pointer-events-auto
          touch-manipulation
        `,
        isActive
          ? 'text-primary bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      )}
      aria-current={
        isActive
          ? 'page'
          : undefined
      }
    >
      <Icon
        className="w-5 h-5 shrink-0"
        strokeWidth={
          isActive
            ? 2.5
            : 1.5
        }
      />

      <span className="font-medium text-sm hidden md:block">
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
  }, [
    location.pathname,
  ]);


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
          bg-card
          border-r
          border-border
          w-16
          md:w-56
          py-6
          overflow-y-auto
          pointer-events-auto
        "
        style={{
          paddingTop:
            'max(1.5rem, env(safe-area-inset-top))',
        }}
      >

        {/* Branding */}

        <div className="px-4 mb-8 flex items-center gap-2.5">

          <img
            src="/washek-fitness-logo.jpg"
            alt="WASHEK"
            className="
              w-8
              h-8
              rounded-xl
              object-contain
              shrink-0
            "
          />

          <span className="
            font-heading
            font-bold
            text-sm
            hidden
            md:block
          ">
            WASHEK
          </span>

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

      </aside>


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
              ? 'pb-0'
              : 'pb-safe sm:pb-6'
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
              <Outlet />
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
          backdrop-blur-xl
          border-t
          border-border
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
                      `,

                      isActive &&
                        'bg-primary/15'
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
                          : 1.5
                      }
                    />

                  </div>


                  <span className="
                    text-[10px]
                    font-medium
                    whitespace-nowrap
                  ">
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
