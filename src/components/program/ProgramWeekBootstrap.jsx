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

        const runKey =
          `${program.id}:${program.current_week}`;

        if (
          lastRunRef.current ===
          runKey
        ) {
          return;
        }

        lastRunRef.current =
          runKey;

        console.log(
          '[ProgramWeekBootstrap] Checking calendar week...'
        );

        const result =
          await ensureCurrentProgramWeek(
            program,
            user
          );

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

        console.error(
          '[ProgramWeekBootstrap] Weekly generation failed:',
          error
        );

        /*
         * Do not permanently suppress a failed generation.
         * The next scheduled/visibility check can retry it.
         */
        lastRunRef.current =
          null;
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
