import {
  useEffect,
  useState,
} from 'react';

import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import {
  supabaseApi,
} from '@/lib/supabaseApi';

import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

import {
  PLAN_HIERARCHY,
} from '@/lib/subscription';

const PLAN_LABELS = {
  free:
    'Free',

  progress:
    'Progress',

  performance:
    'Performance',

  elite:
    'Elite',
};

export default function SubscriptionReturn() {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] =
    useSearchParams();

  const [
    status,
    setStatus,
  ] =
    useState(
      'loading'
    );

  const [
    planName,
    setPlanName,
  ] =
    useState('');

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState('');

  useEffect(() => {
    let cancelled =
      false;

    const requestedPlan =
      String(
        searchParams.get(
          'plan'
        ) ||
          ''
      )
        .trim()
        .toLowerCase();

    const sessionId =
      searchParams.get(
        'session_id'
      );

    /*
     * We require both values because Stripe Checkout supplies
     * both when it returns to this page.
     */
    if (
      !requestedPlan ||
      !PLAN_HIERARCHY.includes(
        requestedPlan
      ) ||
      requestedPlan ===
        'free'
    ) {
      setStatus(
        'error'
      );

      setErrorMessage(
        'The subscription return information is incomplete.'
      );

      return;
    }

    if (
      !sessionId
    ) {
      setStatus(
        'error'
      );

      setErrorMessage(
        'Stripe did not provide a Checkout Session ID.'
      );

      return;
    }

    /*
     * --------------------------------------------------------
     * WAIT FOR WEBHOOK SYNCHRONIZATION
     * --------------------------------------------------------
     *
     * Stripe has already completed Checkout before this page
     * is reached. The webhook updates the Washek profile.
     *
     * Poll for up to 45 seconds rather than only 15 seconds.
     */

    const waitForWebhook =
      async () => {
        const maxAttempts =
          45;

        for (
          let attempt = 0;
          attempt <
            maxAttempts;
          attempt +=
            1
        ) {
          if (
            cancelled
          ) {
            return;
          }

          try {
            const user =
              await supabaseApi.auth.me();

            if (
              cancelled
            ) {
              return;
            }

            const actualPlan =
              (
                user?.subscription_plan ||
                'free'
              )
                .trim()
                .toLowerCase();

            setPlanName(
              PLAN_LABELS[
                actualPlan
              ] ||
                actualPlan
            );

            /*
             * The webhook successfully synchronized the
             * requested plan.
             */
            if (
              actualPlan ===
              requestedPlan
            ) {
              setStatus(
                'success'
              );

              /*
               * Give the user a moment to see confirmation.
               */
              window.setTimeout(
                () => {
                  if (
                    !cancelled
                  ) {
                    navigate(
                      '/profile',
                      {
                        replace:
                          true,
                      }
                    );
                  }
                },
                2200
              );

              return;
            }
          } catch (
            error
          ) {
            console.error(
              '[SubscriptionReturn] Unable to refresh account:',
              error
            );
          }

          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                1000
              )
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        /*
         * The payment may have succeeded, but the webhook has
         * not synchronized the local profile yet.
         *
         * Do NOT claim that the subscription failed.
         */
        setStatus(
          'pending'
        );

        setPlanName(
          PLAN_LABELS[
            requestedPlan
          ] ||
            requestedPlan
        );

        setErrorMessage(
          `Your ${PLAN_LABELS[
            requestedPlan
          ] || requestedPlan} subscription was sent to Washek, but account synchronization is taking longer than expected.`
        );
      };

    waitForWebhook();

    return () => {
      cancelled =
        true;
    };
  }, [
    navigate,
    searchParams,
  ]);

  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */

  if (
    status ===
    'loading'
  ) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">

        <div className="space-y-4">

          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">

            <Loader2 className="w-6 h-6 text-primary animate-spin" />

          </div>

          <h1 className="font-heading font-bold text-2xl">
            Confirming your subscription…
          </h1>

          <p className="text-sm text-muted-foreground max-w-sm">
            Stripe has completed checkout.
            WASHEK is syncing your
            new plan now.
          </p>

          <div className="flex items-center justify-center gap-2 text-primary">

            <Zap className="w-4 h-4" />

            <span className="text-sm font-medium">
              {planName ||
                'WASHEK'}
            </span>

          </div>

        </div>

      </div>
    );
  }

  /*
   * ==========================================================
   * SUCCESS
   * ==========================================================
   */

  if (
    status ===
    'success'
  ) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">

        <div className="space-y-4">

          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto">

            <CheckCircle2 className="w-8 h-8 text-accent" />

          </div>

          <h1 className="font-heading font-bold text-2xl">
            You're on {planName}!
          </h1>

          <p className="text-muted-foreground text-sm max-w-sm">
            Your subscription has been
            confirmed and your paid
            features are unlocked.
          </p>

          <div className="flex items-center justify-center gap-2 text-primary">

            <Zap className="w-4 h-4" />

            <span className="text-sm font-medium">
              WASHEK
            </span>

          </div>

        </div>

      </div>
    );
  }

  /*
   * ==========================================================
   * PENDING
   * ==========================================================
   */

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">

      <div className="space-y-4 max-w-sm">

        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">

          <AlertCircle className="w-8 h-8 text-primary" />

        </div>

        <h1 className="font-heading font-bold text-2xl">
          Payment received
        </h1>

        <p className="text-muted-foreground text-sm">
          {errorMessage ||
            `Your ${planName || 'new'} subscription was submitted successfully, but account synchronization is still processing.`}
        </p>

        <p className="text-xs text-muted-foreground">
          Your account may still need a
          moment to unlock the new plan.
        </p>

        <button
          type="button"
          className="text-sm text-primary underline"
          onClick={() =>
            navigate(
              '/profile',
              {
                replace:
                  true,
              }
            )
          }
        >
          Return to Profile
        </button>

      </div>

    </div>
  );
}
