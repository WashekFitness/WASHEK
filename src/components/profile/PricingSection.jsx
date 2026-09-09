import { useEffect, useState } from 'react';

import {
  Check,
  Zap,
  Crown,
  Flame,
  Loader2,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { supabase } from '@/lib/supabase';

const plans = [
  {
    name: 'Progress',
    planKey: 'progress',
    price: '$7.99',
    period: '/mo',
    icon: Flame,
    color: 'text-accent',
    borderColor: 'border-accent/30',
    bgColor: 'bg-accent/5',
    badge: null,
    features: [
      '300 Kael AI messages/month',
      'Full custom workout adjustments',
      'Adaptive programming — Kael learns from your workout edits',
      'Food & package scan',
      'Advanced macro tracking',
      'Save & compare progress photos',
    ],
  },
  {
    name: 'Performance',
    planKey: 'performance',
    price: '$14.99',
    period: '/mo',
    icon: Zap,
    color: 'text-primary',
    borderColor: 'border-primary/40',
    bgColor: 'bg-primary/5',
    badge: 'Most Popular',
    features: [
      '800 Kael AI messages/month',
      'Everything in Progress',
      'AI body fat % scanner*',
      'Nutrition insights & suggestions',
      'Workout analytics dashboard',
    ],
    disclaimer:
      '* AI body fat estimates are approximations only and may not be fully accurate.',
  },
  {
    name: 'Elite',
    planKey: 'elite',
    price: '$24.99',
    period: '/mo',
    icon: Crown,
    color: 'text-chart-4',
    borderColor: 'border-chart-4/40',
    bgColor: 'bg-chart-4/5',
    badge: 'Best',
    features: [
      '2,000 Kael AI messages/month',
      'Everything in Performance',
      'Enhanced real-time workout adjustments',
      'AI calisthenics form analysis with video',
      'AI form scoring, rep/hold counting & corrective drills',
      'Elite tips & insider coaching secrets',
      'Deep recovery & deload guidance',
    ],
  },
];

const PAID_PLANS = [
  'progress',
  'performance',
  'elite',
];

const ACTIVE_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
];

function normalizePlan(value) {
  const plan =
    String(value || '')
      .trim()
      .toLowerCase();

  return PAID_PLANS.includes(plan)
    ? plan
    : 'free';
}

function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(
    String(status || '').toLowerCase()
  );
}

export default function PricingSection() {
  const [loadingPlan, setLoadingPlan] =
    useState(null);

  const [cancelling, setCancelling] =
    useState(false);

  const [currentPlan, setCurrentPlan] =
    useState('free');

  const [subscription, setSubscription] =
    useState(null);

  const [error, setError] =
    useState('');

  const [loadingSubscription, setLoadingSubscription] =
    useState(true);


  const loadSubscription = async () => {
    setLoadingSubscription(true);

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        setCurrentPlan('free');
        setSubscription(null);
        return;
      }

      /*
       * The profiles table is the single source of truth
       * for the user's current subscription entitlement.
       *
       * Stripe webhooks update these fields after billing
       * events occur.
       *
       * We intentionally do NOT query the legacy
       * stripe_subscriptions table here.
       */

      const {
        data: profile,
        error: profileError,
      } =
        await supabase
          .from('profiles')
          .select(
            'subscription_plan, subscription_status, stripe_subscription_id, stripe_price_id'
          )
          .eq('id', user.id)
          .maybeSingle();

      if (profileError) {
        console.error(
          '[PricingSection] Profile subscription lookup failed:',
          profileError
        );

        throw profileError;
      }

      const profilePlan =
        normalizePlan(
          profile?.subscription_plan
        );

      const profileStatus =
        String(
          profile?.subscription_status || ''
        ).toLowerCase();

      const profileIsActive =
        isActiveStatus(
          profileStatus
        );

      /*
       * A paid plan only counts as the current plan when
       * its subscription status is active.
       *
       * Otherwise the user is treated as free.
       */

      const resolvedPlan =
        profileIsActive &&
        profilePlan !== 'free'
          ? profilePlan
          : 'free';

      /*
       * Keep the subscription object available for the UI
       * and any future logic that needs the Stripe IDs.
       */

      if (
        profileIsActive &&
        profile?.stripe_subscription_id
      ) {
        setSubscription({
          id:
            profile.stripe_subscription_id,

          plan:
            profilePlan,

          plan_key:
            profilePlan,

          status:
            profileStatus,

          stripe_price_id:
            profile.stripe_price_id,
        });
      } else {
        setSubscription(null);
      }

      setCurrentPlan(
        resolvedPlan
      );
    } catch (loadError) {
      console.error(
        '[PricingSection] Failed to load subscription:',
        loadError
      );

      /*
       * Do not accidentally grant paid access when the
       * subscription lookup itself fails.
       */

      setCurrentPlan('free');
      setSubscription(null);
    } finally {
      setLoadingSubscription(false);
    }
  };


  useEffect(() => {
    let active = true;

    const run = async () => {
      if (active) {
        await loadSubscription();
      }
    };

    run();

    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(() => {
        if (active) {
          loadSubscription();
        }
      });

    return () => {
      active = false;

      authListener?.subscription?.unsubscribe();
    };
  }, []);


  const handleCheckout = async (plan) => {
    if (
      !plan?.planKey ||
      loadingPlan
    ) {
      return;
    }

    if (
      currentPlan ===
      plan.planKey
    ) {
      setError(
        `You already have an active ${plan.name} subscription.`
      );

      return;
    }

    setError('');
    setLoadingPlan(
      plan.planKey
    );

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          'Please sign in before upgrading your plan.'
        );
      }

      /*
       * Re-check the profile immediately before starting
       * checkout. This prevents an already-active plan from
       * being purchased again if the UI was stale.
       */

      const {
        data: freshProfile,
        error: freshProfileError,
      } =
        await supabase
          .from('profiles')
          .select(
            'subscription_plan, subscription_status'
          )
          .eq('id', user.id)
          .maybeSingle();

      if (freshProfileError) {
        throw freshProfileError;
      }

      const freshPlan =
        normalizePlan(
          freshProfile?.subscription_plan
        );

      const freshStatus =
        String(
          freshProfile?.subscription_status || ''
        ).toLowerCase();

      if (
        freshPlan ===
          plan.planKey &&
        isActiveStatus(
          freshStatus
        )
      ) {
        setCurrentPlan(
          freshPlan
        );

        setError(
          `You already have an active ${plan.name} subscription.`
        );

        return;
      }

      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          'create-checkout-session',
          {
            body: {
              plan:
                plan.planKey,
            },
          }
        );

      if (functionError) {
        throw functionError;
      }

      if (
        data?.alreadyActive ||
        data?.action ===
          'already_active'
      ) {
        setCurrentPlan(
          normalizePlan(
            data.plan ||
              plan.planKey
          )
        );

        setSubscription(
          (previous) =>
            previous
              ? {
                  ...previous,
                  plan:
                    data.plan ||
                    plan.planKey,
                  plan_key:
                    data.plan ||
                    plan.planKey,
                  status:
                    'active',
                }
              : {
                  plan:
                    data.plan ||
                    plan.planKey,
                  plan_key:
                    data.plan ||
                    plan.planKey,
                  status:
                    'active',
                }
        );

        setError(
          `You already have an active ${plan.name} subscription.`
        );

        return;
      }

      if (data?.url) {
        window.location.href =
          data.url;

        return;
      }

      if (
        data?.success &&
        data?.action ===
          'changed'
      ) {
        setCurrentPlan(
          normalizePlan(
            data.plan ||
              plan.planKey
          )
        );

        setSubscription(
          (previous) =>
            previous
              ? {
                  ...previous,
                  plan:
                    data.plan ||
                    plan.planKey,
                  plan_key:
                    data.plan ||
                    plan.planKey,
                  status:
                    'active',
                }
              : {
                  plan:
                    data.plan ||
                    plan.planKey,
                  plan_key:
                    data.plan ||
                    plan.planKey,
                  status:
                    'active',
                }
        );

        return;
      }

      throw new Error(
        data?.error ||
          'Unable to start checkout.'
      );
    } catch (
      checkoutError
    ) {
      console.error(
        '[PricingSection] Checkout failed:',
        checkoutError
      );

      setError(
        checkoutError?.message ||
          'Unable to start checkout.'
      );
    } finally {
      setLoadingPlan(null);
    }
  };


  const handleCancel = async () => {
    if (
      cancelling ||
      currentPlan ===
        'free'
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        'Cancel your current subscription? Your paid access will end immediately, and you can subscribe again at any time.'
      );

    if (!confirmed) {
      return;
    }

    setCancelling(true);
    setError('');

    try {
      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          'cancel-subscription',
          {
            body: {},
          }
        );

      if (functionError) {
        throw functionError;
      }

      if (data?.error) {
        throw new Error(
          data.error
        );
      }

      /*
       * The cancellation succeeded.
       *
       * Reload immediately instead of only changing React
       * state. This forces the entire application to
       * reinitialize and re-check the user's subscription.
       */

      window.location.reload();
    } catch (
      cancelError
    ) {
      console.error(
        '[PricingSection] Cancellation failed:',
        cancelError
      );

      setError(
        cancelError?.message ||
          'Unable to cancel your subscription.'
      );

      setCancelling(false);
    }
  };


  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

          <span>
            {error}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-4 h-4 text-chart-4" />

        <h3 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
          Upgrade Your Plan
        </h3>
      </div>

      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        Unlock the full Washek experience. The Live Workout
        Tracker is free for everyone; Elite adds real-time
        workout adjustments.
      </p>

      {plans.map((plan) => {
        const Icon =
          plan.icon;

        const isCurrent =
          currentPlan ===
          plan.planKey;

        return (
          <Card
            key={plan.name}
            className={`p-4 border-2 ${plan.borderColor} ${plan.bgColor} relative`}
          >
            {plan.badge && (
              <Badge className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-[10px] px-2 py-0.5">
                {plan.badge}
              </Badge>
            )}

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon
                  className={`w-5 h-5 ${plan.color}`}
                />

                <span className="font-heading font-bold text-base">
                  {plan.name}
                </span>
              </div>

              <div className="flex items-baseline gap-0.5">
                <span
                  className={`font-heading font-bold text-xl ${plan.color}`}
                >
                  {plan.price}
                </span>

                <span className="text-xs text-muted-foreground">
                  {plan.period}
                </span>
              </div>
            </div>

            <ul className="space-y-1.5 mb-3">
              {plan.features.map(
                (feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Check className="w-3.5 h-3.5 mt-0.5 text-accent flex-shrink-0" />

                    <span>
                      {feature}
                    </span>
                  </li>
                )
              )}
            </ul>

            {plan.disclaimer && (
              <p className="text-[10px] text-muted-foreground italic mb-3">
                {plan.disclaimer}
              </p>
            )}

            {isCurrent ? (
              <Button
                className="w-full h-10 font-heading font-semibold"
                variant="outline"
                disabled
              >
                Current Plan
              </Button>
            ) : (
              <Button
                className="w-full h-10 font-heading font-semibold"
                variant="outline"
                onClick={() =>
                  handleCheckout(
                    plan
                  )
                }
                disabled={
                  !!loadingPlan ||
                  loadingSubscription
                }
              >
                {loadingPlan ===
                plan.planKey ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Get ${plan.name}`
                )}
              </Button>
            )}
          </Card>
        );
      })}

      {currentPlan !==
        'free' &&
        !loadingSubscription && (
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5"
              onClick={
                handleCancel
              }
              disabled={
                cancelling
              }
            >
              {cancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Subscription'
              )}
            </Button>
          </div>
        )}

      <p className="text-[10px] text-muted-foreground text-center">
        Cancel anytime. Billed monthly.
      </p>
    </div>
  );
}
