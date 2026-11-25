import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { supabaseApi, isUserMarkedOnboarded, markUserOnboarded } from '@/lib/supabaseApi';
import { useAuth } from '@/lib/AuthContext';
import { fetchServerEntitlement } from '@/lib/stripeCheckout';
import {
  applySubscriptionUpgrade,
  getPlanRank,
  hasPlan,
  isActiveSubscriptionStatus,
  isExplicitlyCanceled,
  normalizePlan,
  pickHighestEffectiveUser,
  resolveEffectivePlan,
} from '@/lib/subscription';
import { BRAND_LOGO_SRC, handleBrandLogoError } from '@/lib/brandLogo';

import DailyWorkoutCard from '@/components/dashboard/DailyWorkoutCard';
import NutritionSummary from '@/components/dashboard/NutritionSummary';
import WeekProgress from '@/components/dashboard/WeekProgress';
import StreakCard from '@/components/dashboard/StreakCard';
import WeeklyUpdate from '@/components/dashboard/WeeklyUpdate';

import QuickAccess from '@/components/layout/QuickAccess';

import { useMidnightSync } from '@/hooks/useMidnightSync';
import { normalizeWorkoutProgram } from '@/lib/expandMicrocycles';
import {
  getCachedProgramsList,
  setCachedProgramsList,
  getCachedLogs,
  setCachedLogs,
  getCachedNutrition,
  setCachedNutrition,
} from '@/lib/cacheStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const [user, setUser] = useState(() => {
    if (authUser) return authUser;
    try {
      const raw = localStorage.getItem('washek_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Sync with AuthContext user without downgrading higher verified tier
  useEffect(() => {
    if (authUser) {
      setUser((prev) => pickHighestEffectiveUser(authUser, prev));
    }
  }, [authUser]);

  const effectiveUser = pickHighestEffectiveUser(authUser, user);

  /*
   * Synchronized to the user's specific calendar day and timezone.
   * Automatically resets at exactly 12:00:00 AM midnight.
   */
  const { todayKey: today, timeZone } = useMidnightSync(effectiveUser);

  useEffect(() => {
    const handleSubUpdated = (e) => {
      const rawPlan = normalizePlan(e.detail?.plan || e.detail?.subscription_plan || 'free');
      const rawStatus = String(
        e.detail?.status || e.detail?.subscription_status || (rawPlan === 'free' ? 'canceled' : 'active')
      ).toLowerCase().trim();
      const activeSub = rawPlan !== 'free' && isActiveSubscriptionStatus(rawStatus);
      const nextPlan = activeSub ? rawPlan : 'free';
      if (e.detail?.plan || e.detail?.status || e.detail?.subscription_plan || e.detail?.subscription_status) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                subscription_plan: nextPlan,
                subscription_status: rawStatus,
                plan: nextPlan,
                tier: nextPlan,
                subscription_tier: nextPlan,
              }
            : prev
        );
      }
    };
    window.addEventListener('washek_subscription_updated', handleSubUpdated);
    window.addEventListener('washek_user_changed', handleSubUpdated);
    return () => {
      window.removeEventListener('washek_subscription_updated', handleSubUpdated);
      window.removeEventListener('washek_user_changed', handleSubUpdated);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const mergeLoadedUser = (u) => {
      setUser((prev) => {
        if (!prev) return u;
        const prevEmail = prev?.email ? String(prev.email).toLowerCase().trim() : '';
        const uEmail = u?.email ? String(u.email).toLowerCase().trim() : '';
        if (prevEmail && uEmail && prevEmail !== uEmail) {
          return u;
        }
        const uRank = getPlanRank(resolveEffectivePlan(u));
        const prevRank = getPlanRank(resolveEffectivePlan(prev));
        const uExplicitlyCanceled = isExplicitlyCanceled(u.subscription_status) && uRank === 0;
        if (uRank >= prevRank || (uExplicitlyCanceled && !hasPlan(prev, 'progress'))) {
          return u;
        }
        return {
          ...u,
          subscription_plan: prev.subscription_plan,
          subscription_status: prev.subscription_status,
          plan: prev.subscription_plan,
          tier: prev.subscription_plan,
          subscription_tier: prev.subscription_plan,
          subscription_cancelled_at: null,
        };
      });
    };

    supabaseApi.auth
      .me(true)
      .then(async (u) => {
        if (!mounted || !u) {
          return;
        }

        if (u.onboarded === false) {
          const userCacheKey = u.email || u.id || 'athlete';
          const cachedPrograms = getCachedProgramsList(userCacheKey);
          let hasExistingData =
            isUserMarkedOnboarded(u.id, u.email) ||
            Boolean(u.active_program_id || u.last_program_generated_at) ||
            (Array.isArray(cachedPrograms) && cachedPrograms.length > 0);

          if (!hasExistingData) {
            try {
              const existingPrograms = await supabaseApi.entities.WorkoutProgram.filter(
                {},
                '-created_at',
                1
              );
              if (Array.isArray(existingPrograms) && existingPrograms.length > 0) {
                hasExistingData = true;
              }
            } catch {
              // ignore program verification note
            }
          }

          if (hasExistingData) {
            const healedUser = { ...u, onboarded: true };
            markUserOnboarded(u.id, u.email);
            if (mounted) {
              mergeLoadedUser(healedUser);
            }
            supabaseApi.auth.updateMe({ onboarded: true }).catch(() => {});
            return;
          }

          if (mounted) {
            mergeLoadedUser(u);
            navigate('/onboarding');
          }
          return;
        }

        if (mounted) {
          mergeLoadedUser(u);
        }

        if (!hasPlan(u, 'elite') && (u.id || u.email)) {
          try {
            const ent = await fetchServerEntitlement({
              userId: u.id,
              email: u.email,
              cancelledAtIso: u.subscription_cancelled_at || null,
            });
            if (mounted && ent?.active && ent.plan && ent.plan !== 'free') {
              const curRank = getPlanRank(resolveEffectivePlan(u));
              const entRank = getPlanRank(ent.plan);
              if (entRank > curRank) {
                applySubscriptionUpgrade(ent.plan, ent.status, {
                  persistReceipt: true,
                  timestamp: ent.timestamp,
                  syncServer: false,
                });
                setUser((prev) => ({
                  ...(prev || u),
                  subscription_plan: ent.plan,
                  subscription_status: ent.status,
                  plan: ent.plan,
                  tier: ent.plan,
                  subscription_tier: ent.plan,
                  subscription_cancelled_at: null,
                }));
              }
            }
          } catch {
            // ignore entitlement probe error
          }
        }
      })
      .catch((error) => {
        if (!authUser) {
          console.debug('[Dashboard] Auth sync note:', error?.message || error);
        }
      });

    return () => {
      mounted = false;
    };
  }, [authUser?.id, navigate]);

  const userKey =
    effectiveUser?.email ||
    effectiveUser?.id ||
    'athlete';

  /*
   * Active workout program.
   * Hydrates immediately with initialData from synchronous cacheStore.
   */
  const {
    data: programs = [],
    isLoading: isLoadingPrograms,
  } = useQuery({
    queryKey: [
      'programs',
      userKey,
    ],

    queryFn: async () => {
      const res = await supabaseApi.entities.WorkoutProgram.filter(
        {
          status: 'active',
        },
        '-created_at',
        5
      );
      if (Array.isArray(res) && res.length > 0) {
        setCachedProgramsList(res, userKey);
      }
      return res;
    },

    initialData: () => getCachedProgramsList(userKey),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });

  /*
   * Workout logs.
   * Hydrates immediately with initialData from synchronous cacheStore.
   */
  const {
    data: logs = [],
  } = useQuery({
    queryKey: [
      'logs',
      userKey,
    ],

    queryFn: async () => {
      const emailFilter = effectiveUser?.email;
      const res = await supabaseApi.entities.WorkoutLog.filter(
        emailFilter ? { created_by: emailFilter } : { created_by: userKey },
        '-date',
        30
      );
      if (Array.isArray(res) && res.length > 0) {
        setCachedLogs(res, userKey);
      }
      return res;
    },

    initialData: () => getCachedLogs(userKey),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });

  /*
   * Nutrition:
   *
   * Fetch nutrition entries for the current user and use the same
   * local-date definition as the Nutrition page.
   */
  const {
    data: nutrition = [],
  } = useQuery({
    queryKey: [
      'nutrition',
      today,
      userKey,
    ],

    queryFn: async () => {
      const res = await supabaseApi.entities.NutritionEntry.filter(
        {
          date: today,
          created_by: userKey,
        },
        '-created_date',
        100
      );
      if (Array.isArray(res) && res.length > 0) {
        setCachedNutrition(res, userKey, today);
      }
      return res;
    },

    initialData: () => getCachedNutrition(userKey, today),
    staleTime: 5 * 60 * 1000,
    enabled: true,
  });

  /*
   * Progress photos.
   */
  const {
    data: photos = [],
  } = useQuery({
    queryKey: [
      'progress-photos',
      effectiveUser?.email || userKey,
    ],

    queryFn: () =>
      supabaseApi.entities.ProgressPhoto.filter(
        {
          created_by: effectiveUser?.email || userKey,
        },
        '-date',
        20
      ),

    enabled: !!(effectiveUser?.email || userKey),
  });

  const activeProgram =
    programs[0] ? normalizeWorkoutProgram(programs[0]) : null;

  return (
    <div className="px-5 pb-4">

        {/* Greeting / Brand */}

        <div className="mb-6 pt-1">

          <div className="flex items-center gap-2.5 mb-3">

            <div className="relative p-0.5 rounded-xl bg-gradient-to-br from-primary/30 to-transparent border border-primary/20 shrink-0">
              <img
                src={BRAND_LOGO_SRC}
                onError={handleBrandLogoError}
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

            <span className="
              text-xs
              font-bold
              text-foreground
              tracking-widest
              font-heading
              uppercase
            ">
              WASHEK
            </span>

          </div>


          <h1 className="
            font-heading
            text-2xl
            sm:text-3xl
            font-bold
            tracking-tight
          ">
            Hey,{' '}
            <span className="text-foreground">
              {effectiveUser?.first_name ||
                effectiveUser?.full_name?.split(' ')[0] ||
                'Athlete'}
            </span>
          </h1>


          <p className="
            text-muted-foreground
            text-sm
            mt-1
          ">
            Let's crush your goals today.
          </p>

        </div>


        <div className="space-y-4">

          <StreakCard
            logs={logs}
            user={effectiveUser}
            timeZone={timeZone}
            program={activeProgram}
          />


          <DailyWorkoutCard
            program={activeProgram}
            user={effectiveUser}
            timeZone={timeZone}
            isLoading={isLoadingPrograms && !activeProgram}
          />


          <NutritionSummary
            entries={nutrition}
            user={effectiveUser}
            logs={logs}
            program={activeProgram}
          />


          <WeekProgress
            logs={logs}
            user={effectiveUser}
            timeZone={timeZone}
          />


          <WeeklyUpdate
            logs={logs}
            nutrition={nutrition}
            photos={photos}
            user={effectiveUser}
            program={activeProgram}
            timeZone={timeZone}
          />


          <QuickAccess />

        </div>

      </div>
  );
}
