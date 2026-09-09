import { useEffect, useState } from 'react';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';

import CycleOverview from '@/components/program/CycleOverview';

import WeeklyPlan from '@/components/program/WeeklyPlan';

import PullToRefresh from '@/components/layout/PullToRefresh';

import {
  Dumbbell,
  Play,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import {
  Button,
} from '@/components/ui/button';

import {
  Link,
} from 'react-router-dom';

import {
  toast,
} from 'sonner';

import {
  normalizeWorkoutProgram,
} from '@/lib/expandMicrocycles';

export default function Program() {
  const queryClient =
    useQueryClient();

  const [
    user,
    setUser,
  ] =
    useState(null);

  /*
   * ==========================================================
   * LOAD CURRENT USER
   * ==========================================================
   */

  useEffect(() => {
    let mounted = true;

    supabaseApi.auth
      .me()
      .then(
        currentUser => {
          if (
            mounted
          ) {
            setUser(
              currentUser
            );
          }
        }
      )
      .catch(
        error => {
          console.error(
            '[Program] Failed to load user:',
            error
          );
        }
      );

    return () => {
      mounted =
        false;
    };
  }, []);

  /*
   * ==========================================================
   * LOAD ACTIVE PROGRAM
   * ==========================================================
   */

  const {
    data: programs = [],
    isLoading,
    isError,
    error,
  } =
    useQuery({
      queryKey: [
        'programs',
        user?.id,
      ],

      queryFn:
        () =>
          supabaseApi.entities.WorkoutProgram.filter(
            {
              status:
                'active',
            },
            '-created_at',
            10
          ),

      enabled:
        !!user?.id,

      staleTime:
        0,

      refetchOnMount:
        'always',

      refetchOnWindowFocus:
        true,
    });

  /*
   * ==========================================================
   * SELECT ACTIVE PROGRAM
   * ==========================================================
   */

  const rawProgram =
    programs?.[0] ||
    null;

  const program =
    rawProgram
      ? normalizeWorkoutProgram(
          rawProgram
        )
      : null;

  /*
   * ==========================================================
   * LOG WORKOUT
   * ==========================================================
   */

  const logMutation =
    useMutation({
      mutationFn:
        data =>
          supabaseApi.entities.WorkoutLog.create(
            data
          ),

      onSuccess:
        () => {
          queryClient.invalidateQueries(
            {
              queryKey: [
                'logs',
              ],
            }
          );

          toast.success(
            'Workout logged! Great job 💪'
          );
        },

      onError:
        error => {
          console.error(
            '[Program] Workout log failed:',
            error
          );

          toast.error(
            error?.message ||
              'Could not save the workout.'
          );
        },
    });

  /*
   * ==========================================================
   * INITIAL LOADING
   * ==========================================================
   */

  if (
    !user ||
    isLoading
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  /*
   * ==========================================================
   * LOAD ERROR
   * ==========================================================
   */

  if (
    isError
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">

        <AlertCircle className="w-14 h-14 text-destructive mb-4" />

        <h2 className="font-heading text-xl font-bold mb-2">
          Program couldn't be loaded
        </h2>

        <p className="text-sm text-muted-foreground max-w-sm mb-5">
          {error?.message ||
            'There was a problem loading your workout program.'}
        </p>

        <Button
          type="button"
          onClick={() =>
            queryClient.invalidateQueries(
              {
                queryKey: [
                  'programs',
                  user.id,
                ],
              }
            )
          }
        >
          Try Again
        </Button>

      </div>
    );
  }

  /*
   * ==========================================================
   * NO PROGRAM
   * ==========================================================
   */

  if (
    !program
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">

        <Dumbbell className="w-16 h-16 text-muted-foreground mb-4" />

        <h2 className="font-heading text-xl font-bold mb-2">
          No Program Yet
        </h2>

        <p className="text-muted-foreground max-w-sm">
          Complete the onboarding to generate your personalized program.
        </p>

      </div>
    );
  }

  /*
   * ==========================================================
   * PROGRAM
   * ==========================================================
   */

  return (
    <PullToRefresh
      queryKeys={[
        [
          'programs',
          user.id,
        ],
        [
          'logs',
          user.id,
        ],
      ]}
    >

      <div className="px-5 pb-4">

        {/* -------------------------------------------------- */}
        {/* HEADER */}
        {/* -------------------------------------------------- */}

        <div
          className="
            relative
            z-0
            mb-5
            flex
            items-start
            justify-between
            gap-3
          "
        >

          {/* Program information */}

          <div className="min-w-0 flex-1">

            <h1 className="font-heading text-2xl font-bold break-words">
              {program.program_name ||
                'My Workout Program'}
            </h1>

            <p className="text-sm text-muted-foreground mt-1">

              {program.duration_weeks ||
                12}{' '}

              weeks

              {program.fitness_level
                ? ` · ${program.fitness_level} level`
                : ''}

            </p>

            {program.goal && (
              <p className="text-xs text-muted-foreground mt-1">
                Goal: {program.goal}
              </p>
            )}

          </div>

          {/*
           * ==================================================
           * LIVE WORKOUT BUTTON
           * ==================================================
           *
           * The entire right-side wrapper is now its own
           * isolated stacking context.
           *
           * The touch target is larger than the visible button,
           * so the whole visible control is guaranteed to be
           * inside the clickable area.
           */}

          <div
            className="
              relative
              z-[9999]
              isolate
              shrink-0
              pointer-events-auto
              touch-manipulation
            "
            style={{
              position: 'relative',
              zIndex: 999999,
              pointerEvents: 'auto',
              touchAction: 'manipulation',
            }}
          >

            <Link
              to="/live-workout"
              aria-label="Open Live Workout"
              className="
                relative
                z-[9999]
                flex
                min-h-[44px]
                min-w-[64px]
                items-center
                justify-center
                rounded-xl
                p-1
                pointer-events-auto
                touch-manipulation
                cursor-pointer
                select-none
              "
              style={{
                position: 'relative',
                zIndex: 999999,
                pointerEvents: 'auto',
                touchAction: 'manipulation',
                WebkitTapHighlightColor:
                  'transparent',
              }}
            >

              <span
                className="
                  inline-flex
                  h-8
                  items-center
                  justify-center
                  gap-1.5
                  rounded-xl
                  bg-primary
                  px-3
                  text-xs
                  font-heading
                  font-semibold
                  text-primary-foreground
                  shadow
                  pointer-events-none
                "
              >

                <Play
                  className="
                    w-3.5
                    h-3.5
                    shrink-0
                  "
                />

                <span>
                  Live
                </span>

              </span>

            </Link>

          </div>

        </div>

        {/* -------------------------------------------------- */}
        {/* TABS */}
        {/* -------------------------------------------------- */}

        <Tabs
          defaultValue="weekly"
          className="w-full"
        >

          <TabsList className="w-full mb-4 bg-muted/50">

            <TabsTrigger
              value="weekly"
              className="flex-1 font-heading"
            >
              Weekly Plan
            </TabsTrigger>

            <TabsTrigger
              value="overview"
              className="flex-1 font-heading"
            >
              Cycles
            </TabsTrigger>

          </TabsList>

          <TabsContent value="weekly">

            <WeeklyPlan
              program={
                program
              }

              onLogWorkout={data =>
                logMutation.mutate(
                  {
                    ...data,

                    program_id:
                      program.id,
                  }
                )
              }
            />

          </TabsContent>

          <TabsContent value="overview">

            <CycleOverview
              program={
                program
              }
            />

          </TabsContent>

        </Tabs>

      </div>

    </PullToRefresh>
  );
}
