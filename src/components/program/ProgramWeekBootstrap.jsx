import { useEffect, useRef } from 'react';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  supabase,
} from '@/lib/supabase';

import {
  ensureCurrentProgramWeek,
} from '@/lib/programWeekGeneration';


export default function ProgramWeekBootstrap() {
  const runningRef =
    useRef(false);

  const lastRunRef =
    useRef(null);


  useEffect(() => {
    let mounted =
      true;


    async function run() {
      if (
        runningRef.current
      ) {
        return;
      }

      runningRef.current =
        true;

      let currentRunKey = null;

      try {
        const user =
          await supabaseApi.auth.me();

        if (
          !mounted ||
          !user?.id ||
          !user?.onboarded
        ) {
          return;
        }

        /*
         * Find the user's active program directly by user ID.
         */

        const {
          data: programs,
          error,
        } =
          await supabase
            .from('workout_programs')
            .select('*')
            .eq(
              'user_id',
              user.id
            )
            .eq(
              'status',
              'active'
            )
            .order(
              'created_at',
              {
                ascending:
                  false,
              }
            )
            .limit(1);

        if (error) {
          throw error;
        }

        const program =
          programs?.[0];

        if (
          !program
        ) {
          return;
        }

        /*
         * Avoid repeatedly starting the same generation while
         * the current app session is still sitting on the same
         * program.
         */

        currentRunKey =
          `${program.id}:${program.current_week}`;

        if (
          lastRunRef.current ===
          currentRunKey
        ) {
          return;
        }

        lastRunRef.current =
          currentRunKey;

        console.log(
          '[ProgramWeekBootstrap] Checking calendar week...'
        );

        const result =
          await ensureCurrentProgramWeek(
            program,
            user
          );

        if (result?.program) {
          lastRunRef.current = `${result.program.id}:${result.program.current_week}`;
        }

        if (
          result?.generated
        ) {
          console.log(
            '[ProgramWeekBootstrap] New program week generated:',
            result.targetWeek
          );
        }
      } catch (error) {
        /*
         * Weekly generation must never prevent the rest of the
         * app from loading.
         */

        console.warn(
          '[ProgramWeekBootstrap] Weekly generation check skipped or failed:',
          error?.message || error
        );

        /*
         * Throttle retries after an error to avoid continuous failure loops.
         * The next run will be allowed after 5 minutes or on program transition.
         */
        setTimeout(() => {
          if (lastRunRef.current === currentRunKey) {
            lastRunRef.current = null;
          }
        }, 5 * 60 * 1000);
      } finally {
        runningRef.current =
          false;
      }
    }


    run();


    /*
     * Check periodically while the app remains open.
     *
     * This catches the transition into a new calendar week
     * without requiring the athlete to close and reopen the app.
     *
     * The generation helper itself now allows only ONE missing
     * week to be generated per check, preventing several AI
     * generations from firing back-to-back after a long absence.
     */

    const interval =
      window.setInterval(
        () => {
          /*
           * Allow another check after the initial run.
           */

          lastRunRef.current =
            null;

          run();
        },
        60 * 1000
      );


    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          lastRunRef.current =
            null;

          run();
        }
      };


    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );


    return () => {
      mounted =
        false;

      window.clearInterval(
        interval
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };
  }, []);


  /*
   * This component intentionally renders nothing.
   */

  return null;
}
