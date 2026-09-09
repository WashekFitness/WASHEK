import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { supabaseApi } from '@/lib/supabaseApi';

import DailyWorkoutCard from '@/components/dashboard/DailyWorkoutCard';
import NutritionSummary from '@/components/dashboard/NutritionSummary';
import WeekProgress from '@/components/dashboard/WeekProgress';
import StreakCard from '@/components/dashboard/StreakCard';
import WeeklyUpdate from '@/components/dashboard/WeeklyUpdate';

import PullToRefresh from '@/components/layout/PullToRefresh';
import QuickAccess from '@/components/layout/QuickAccess';

import { getLocalDateKey } from '@/lib/messageLimit';

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  /*
   * Always use the browser's LOCAL calendar date.
   *
   * This keeps Dashboard nutrition synchronized with the Nutrition
   * page and prevents the totals from changing/resetting at the
   * wrong time because of UTC conversion.
   */
  const today = useMemo(
    () => getLocalDateKey(),
    []
  );

  useEffect(() => {
    let mounted = true;

    supabaseApi.auth
      .me()
      .then((u) => {
        if (!mounted) {
          return;
        }

        setUser(u);

        if (!u?.onboarded) {
          navigate('/onboarding');
        }
      })
      .catch((error) => {
        console.error(
          '[Dashboard] Failed to load user:',
          error
        );
      });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  /*
   * Active workout program.
   */
  const {
    data: programs = [],
  } = useQuery({
    queryKey: [
      'programs',
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.WorkoutProgram.filter(
        {
          status: 'active',
          created_by: user.email,
        },
        '-created_date',
        1
      ),

    enabled: !!user?.email,
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
  const {
    data: nutrition = [],
  } = useQuery({
    queryKey: [
      'nutrition',
      today,
      user?.email,
    ],

    queryFn: () =>
      supabaseApi.entities.NutritionEntry.filter(
        {
          date: today,
          created_by: user.email,
        },
        '-created_date',
        100
      ),

    enabled: !!user?.email,
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
    programs[0] || null;

  return (
    <PullToRefresh
      queryKeys={[
        [
          'programs',
          user?.email,
        ],

        [
          'logs',
          user?.email,
        ],

        [
          'nutrition',
          today,
          user?.email,
        ],

        [
          'progress-photos',
          user?.email,
        ],
      ]}
    >
      <div className="px-5 pb-4">

        {/* Greeting / Brand */}

        <div className="mb-6">

          <div className="flex items-center gap-2 mb-2">

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
              text-xs
              font-bold
              text-primary
              uppercase
              tracking-widest
              font-heading
            ">
              WASHEK
            </span>

          </div>


          <h1 className="
            font-heading
            text-2xl
            font-bold
          ">
            Hey,{' '}
            {user?.first_name ||
              user?.full_name?.split(' ')[0] ||
              'Athlete'}{' '}
            👋
          </h1>


          <p className="
            text-muted-foreground
            text-sm
            mt-0.5
          ">
            Let's crush it today.
          </p>

        </div>


        <div className="space-y-4">

          <StreakCard
            logs={logs}
          />


          <DailyWorkoutCard
            program={activeProgram}
          />


          <NutritionSummary
            entries={nutrition}
            user={user}
          />


          <WeekProgress
            logs={logs}
          />


          <WeeklyUpdate
            logs={logs}
            nutrition={nutrition}
            photos={photos}
            user={user}
            program={activeProgram}
          />


          <QuickAccess />

        </div>

      </div>
    </PullToRefresh>
  );
}
