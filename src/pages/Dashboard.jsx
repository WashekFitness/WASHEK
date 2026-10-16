import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { supabaseApi } from '@/lib/supabaseApi';
import { useAuth } from '@/lib/AuthContext';

import DailyWorkoutCard from '@/components/dashboard/DailyWorkoutCard';
import NutritionSummary from '@/components/dashboard/NutritionSummary';
import WeekProgress from '@/components/dashboard/WeekProgress';
import StreakCard from '@/components/dashboard/StreakCard';
import WeeklyUpdate from '@/components/dashboard/WeeklyUpdate';

import QuickAccess from '@/components/layout/QuickAccess';

import { useMidnightSync } from '@/hooks/useMidnightSync';
import { normalizeWorkoutProgram } from '@/lib/expandMicrocycles';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const [user, setUser] = useState(() => authUser);

  // Sync with AuthContext user
  useEffect(() => {
    if (authUser) {
      setUser(authUser);
    }
  }, [authUser]);

  /*
   * Synchronized to the user's specific calendar day and timezone.
   * Automatically resets at exactly 12:00:00 AM midnight.
   */
  const { todayKey: today, timeZone } = useMidnightSync(user || authUser);

  useEffect(() => {
    let mounted = true;

    supabaseApi.auth
      .me()
      .then((u) => {
        if (!mounted || !u) {
          return;
        }

        setUser(u);

        if (u.onboarded === false) {
          navigate('/onboarding');
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
  }, [authUser, navigate]);

  /*
   * Active workout program.
   */
  const {
    data: programs = [],
  } = useQuery({
    queryKey: [
      'programs',
      user?.id || user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.WorkoutProgram.filter(
        {
          status: 'active',
        },
        '-created_at',
        5
      ),

    enabled: !!(user?.id || user?.email),
  });

  /*
   * Workout logs.
   */
  const {
    data: logs = [],
  } = useQuery({
    queryKey: [
      'logs',
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.WorkoutLog.filter(
        {
          created_by: user.email,
        },
        '-date',
        30
      ),

    enabled: !!user?.email,
  });

  /*
   * Nutrition:
   *
   * Fetch nutrition entries for the current user and use the same
   * local-date definition as the Nutrition page.
   *
   * We intentionally request today's entries directly instead of
   * fetching a broad list and then relying on UTC date conversion.
   */
  const userKey =
    user?.email ||
    authUser?.email ||
    user?.id ||
    authUser?.id ||
    'athlete';

  const {
    data: nutrition = [],
  } = useQuery({
    queryKey: [
      'nutrition',
      today,
      userKey,
    ],

    queryFn: () =>
      supabaseApi.entities.NutritionEntry.filter(
        {
          date: today,
          created_by: userKey,
        },
        '-created_date',
        100
      ),

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
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.ProgressPhoto.filter(
        {
          created_by: user.email,
        },
        '-date',
        20
      ),

    enabled: !!user?.email,
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
              {user?.first_name ||
                user?.full_name?.split(' ')[0] ||
                'Athlete'}
            </span>{' '}
            👋
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
            user={user}
            timeZone={timeZone}
          />


          <DailyWorkoutCard
            program={activeProgram}
            user={user}
            timeZone={timeZone}
          />


          <NutritionSummary
            entries={nutrition}
            user={user}
          />


          <WeekProgress
            logs={logs}
            user={user}
            timeZone={timeZone}
          />


          <WeeklyUpdate
            logs={logs}
            nutrition={nutrition}
            photos={photos}
            user={user}
            program={activeProgram}
            timeZone={timeZone}
          />


          <QuickAccess />

        </div>

      </div>
  );
}
