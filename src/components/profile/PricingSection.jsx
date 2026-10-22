import { useEffect, useState } from 'react';

import {
  Check,
  Zap,
  Crown,
  Flame,
  Loader2,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { supabase } from '@/lib/supabase';
import {
  applySubscriptionUpgrade,
  applySubscriptionCancellation,
} from '@/lib/subscription';
import { auth as firebaseAuth } from '@/lib/firebase';
import { firebaseApi } from '@/lib/firebaseApi';
import { toast } from 'sonner';

const freePlan = {
  name: 'Free',
  planKey: 'free',
  price: '$0',
  period: '/forever',
  icon: ShieldCheck,
  color: 'text-muted-foreground',
  borderColor: 'border-border/60',
  bgColor: 'bg-muted/10',
  badge: null,
  features: [
    '100 Kael AI messages/month',
    'Super accurate baseline coaching (100% scientific & biomechanical accuracy on every answer)',
    'Direct, concise guidance (~40–80 words) with essential execution cues',
    'Full live workout tracker with auto-rest timer',
    'Standard response streaming speed',
  ],
};

const plans = [
  {
    name: 'Progress',
    planKey: 'progress',
    price: '$9.99',
    period: '/mo',
    paymentUrl: 'https://buy.stripe.com/test_9B67sNcsOaiW1ETgLtg3603',
    icon: Flame,
    color: 'text-accent',
    borderColor: 'border-accent/30',
    bgColor: 'bg-accent/5',
    badge: null,
    features: [
      '300 Kael AI messages/month (3x Free)',
      'Faster & smarter Kael AI — answers quicker with biomechanical rationale & progression milestones',
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
    price: '$17.99',
    period: '/mo',
    paymentUrl: 'https://buy.stripe.com/test_8x23cx50m9eS97l52Lg3605',
    icon: Zap,
    color: 'text-primary',
    borderColor: 'border-primary/40',
    bgColor: 'bg-primary/5',
    badge: 'Most Popular',
    features: [
      '800 Kael AI messages/month (8x Free)',
      'Even faster & higher-intelligence Kael — tempo breakdowns, activation cues & fueling synergy',
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
    price: '$34.99',
    period: '/mo',
    paymentUrl: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
    icon: Crown,
    color: 'text-chart-4',
    borderColor: 'border-chart-4/40',
    bgColor: 'bg-chart-4/5',
    badge: 'Best',
    features: [
      '2,000 Kael AI messages/month (20x Free)',
      'Lightning-fast, masterclass Kael AI — kinetic chain mastery, insider secrets & recovery diagnostics',
      'Everything in Performance',
      'Live workout adjustments (real-time coaching while training)',
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

export default function PricingSection({ onPlanChange }) {
  const [loadingPlan, setLoadingPlan] =
    useState(null);

  const [cancelling, setCancelling] =
    useState(false);

  const [showCancelConfirm, setShowCancelConfirm] =
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
        // Fall back to local storage cached plan if Supabase auth user is not available
        let localPlan = 'free';
        try {
          localPlan = localStorage.getItem('washek_subscription_plan') ||
            JSON.parse(localStorage.getItem('washek_user') || '{}')?.subscription_plan ||
            'free';
        } catch (_err) {
          // ignore
        }
        const safeLocal = normalizePlan(localPlan);
        setCurrentPlan(safeLocal);
        onPlanChange?.(safeLocal);
        setSubscription(null);
        return;
      }

      /*
       * The profiles table is the single source of truth
       * for the user's current subscription entitlement.
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

      const storedStatus = (() => {
        try {
          return String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
        } catch {
          return '';
        }
      })();
      const isLocallyCanceled = storedStatus === 'canceled' || storedStatus === 'cancelled';

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

      // If user canceled or database reports canceled or inactive free, purge local overrides
      if (isLocallyCanceled || profileStatus === 'canceled' || profileStatus === 'cancelled' || (!profileIsActive && profilePlan === 'free')) {
        applySubscriptionCancellation();
      }

      // Check if user has an upgraded local override
      const localPlanOverride = (() => {
        if (isLocallyCanceled) return null;
        try {
          const stored = localStorage.getItem('washek_subscription_status');
          if (stored === 'canceled' || stored === 'cancelled') return null;
          return localStorage.getItem('washek_subscription_plan') || null;
        } catch {
          return null;
        }
      })();

      const resolvedPlan = isLocallyCanceled
        ? 'free'
        : (profileIsActive && profilePlan !== 'free')
          ? profilePlan
          : (profileStatus !== 'canceled' && profileStatus !== 'cancelled' && localPlanOverride && localPlanOverride !== 'free' ? normalizePlan(localPlanOverride) : 'free');

      if (
        !isLocallyCanceled &&
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
      onPlanChange?.(resolvedPlan);

      if (resolvedPlan !== 'free' && !isLocallyCanceled) {
        applySubscriptionUpgrade(resolvedPlan, profileStatus || 'active');
      }
    } catch (loadError) {
      console.error(
        '[PricingSection] Failed to load subscription:',
        loadError
      );

      let fallbackLocal = 'free';
      try {
        fallbackLocal = localStorage.getItem('washek_subscription_plan') ||
          JSON.parse(localStorage.getItem('washek_user') || '{}')?.subscription_plan ||
          'free';
      } catch (_err) {
        // ignore
      }
      const safePlan = normalizePlan(fallbackLocal);
      setCurrentPlan(safePlan);
      onPlanChange?.(safePlan);
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

      if (!user && !plan.paymentUrl) {
        throw new Error(
          'Please sign in before upgrading your plan.'
        );
      }

      /*
       * Re-check the profile immediately before starting
       * checkout. This prevents an already-active plan from
       * being purchased again if the UI was stale.
       */
      if (user) {
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

        if (!freshProfileError && freshProfile) {
          const freshPlan =
            normalizePlan(
              freshProfile.subscription_plan
            );

          const freshStatus =
            String(
              freshProfile.subscription_status || ''
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
        }
      }

      /*
       * Directly navigate to the designated Stripe Payment URL.
       * Attach client_reference_id (user ID) and prefilled_email
       * so Stripe automatically attributes the subscription to their account.
       */
      /*
       * Store pending checkout plan so return/confirmation page can verify
       * even if third-party redirect strips query params.
       */
      try {
        localStorage.setItem('washek_pending_checkout_plan', plan.planKey);
      } catch (_err) {
        // Storage write note
      }

      /*
       * Call create-checkout-session to create a real Stripe Checkout Session
       * with success_url pointing back to this running app instance.
       */
      let checkoutSessionUrl = null;
      try {
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
                app_url:
                  typeof window !== 'undefined' && window.location.origin
                    ? window.location.origin
                    : 'https://washek.ai.studio',
              },
            }
          );

        if (!functionError && data) {
          if (
            data?.alreadyActive ||
            data?.action ===
              'already_active'
          ) {
            setCurrentPlan(plan.planKey);
            onPlanChange?.(plan.planKey);
            applySubscriptionUpgrade(plan.planKey, 'active');
            toast.success(`You already have an active ${plan.name} subscription.`);
            return;
          }

          if (data?.url) {
            checkoutSessionUrl = data.url;
          }
        }
      } catch (err) {
        console.warn('[PricingSection] Edge function create-checkout-session note:', err);
      }

      // If we got a Stripe Checkout Session URL, redirect there!
      if (checkoutSessionUrl) {
        try {
          if (window.top && window.top !== window) {
            window.top.location.href = checkoutSessionUrl;
            return;
          }
        } catch (_err) {
          // Cross-origin top navigation fallback
        }

        window.location.href = checkoutSessionUrl;
        return;
      }

      /*
       * Fallback to direct payment link if the Edge function was unavailable.
       */
      if (plan.paymentUrl) {
        let destinationUrl = plan.paymentUrl;
        try {
          const urlObj = new URL(destinationUrl);
          if (user?.email) {
            urlObj.searchParams.set('prefilled_email', user.email);
          }
          if (user?.id) {
            urlObj.searchParams.set('client_reference_id', user.id);
          }
          destinationUrl = urlObj.toString();
        } catch (_err) {
          // URL parse fallback
        }

        try {
          if (window.top && window.top !== window) {
            window.top.location.href = destinationUrl;
            return;
          }
        } catch (_err) {
          // Window top navigation fallback
        }

        window.location.href = destinationUrl;
        return;
      }

      throw new Error('Unable to initialize checkout session. Please try again.');
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


  const executeCancel = async () => {
    if (
      cancelling ||
      currentPlan === 'free'
    ) {
      return;
    }

    setCancelling(true);
    setError('');

    try {
      // 1. Immediately apply local cancellation across all storage, UI state, and global events
      applySubscriptionCancellation();
      setCurrentPlan('free');
      setSubscription(null);
      setShowCancelConfirm(false);
      onPlanChange?.('free');

      // 2. Resolve current user identity for backend cancellation
      let currentUserId = null;
      let currentUserEmail = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          currentUserId = authData.user.id;
          currentUserEmail = authData.user.email;
        }
      } catch (_authErr) {
        // ignore
      }

      if (!currentUserId && firebaseAuth?.currentUser) {
        currentUserId = firebaseAuth.currentUser.uid;
        currentUserEmail = firebaseAuth.currentUser.email;
      }

      const cancelPayload = {
        userId: currentUserId,
        email: currentUserEmail,
      };

      // 3. Invoke Supabase cancel-subscription Edge Function
      try {
        await supabase.functions.invoke(
          'cancel-subscription',
          {
            body: cancelPayload,
          }
        );
      } catch (invokeErr) {
        console.debug('[PricingSection] cancel-subscription invoke note:', invokeErr);
      }

      // 4. Server-side proxy cancel endpoint
      try {
        await fetch('/api/cancel-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cancelPayload),
        });
      } catch (srvErr) {
        console.debug('[PricingSection] Server cancel endpoint note:', srvErr);
      }

      // 5. Client-side sync to Firebase / Firestore profile
      try {
        if (firebaseAuth?.currentUser) {
          await firebaseApi.auth.updateProfile({
            subscription_plan: 'free',
            subscription_status: 'canceled',
            tier: 'free',
            plan: 'free',
            subscription_tier: 'free',
          });
        }
      } catch (fbErr) {
        console.debug('[PricingSection] Firestore sync note:', fbErr);
      }

      toast.success('Your subscription has been canceled. Your account is now on the Free Plan.');
    } catch (cancelError) {
      console.error(
        '[PricingSection] Cancellation failed:',
        cancelError
      );

      setError(
        cancelError?.message ||
          'Unable to cancel your subscription.'
      );
    } finally {
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

      {/* =========================================================
          SECTION HEADER
          ========================================================= */}
      <div className="flex items-center gap-2 mb-1">
        <Crown className="w-4 h-4 text-chart-4" />

        <h3 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">
          Plans & Upgrades
        </h3>
      </div>

      <p className="text-xs text-muted-foreground -mt-2 mb-3">
        The Live Workout Tracker and baseline coaching are free for everyone.
        Upgrades unlock higher monthly Kael message volumes, progressively faster and deeper AI coaching, and specialized athletic tools.
      </p>

      {/* =========================================================
          FREE PLAN (BASELINE)
          ========================================================= */}
      <Card
        className={`p-4 border-2 ${freePlan.borderColor} ${freePlan.bgColor} relative`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`w-5 h-5 ${freePlan.color}`} />

            <span className="font-heading font-bold text-base">
              {freePlan.name}
            </span>
          </div>

          <div className="flex items-baseline gap-0.5">
            <span className={`font-heading font-bold text-xl ${freePlan.color}`}>
              {freePlan.price}
            </span>

            <span className="text-xs text-muted-foreground">
              {freePlan.period}
            </span>
          </div>
        </div>

        <ul className="space-y-1.5 mb-3">
          {freePlan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2 text-sm"
            >
              <Check className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />

              <span>
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {currentPlan === 'free' ? (
          <Button
            className="w-full h-10 font-heading font-semibold"
            variant="outline"
            disabled
          >
            Current Plan
          </Button>
        ) : (
          <div className="text-[11px] text-center text-muted-foreground italic py-1">
            Included with your account baseline
          </div>
        )}
      </Card>

      {/* =========================================================
          PAID UPGRADE PLANS
          ========================================================= */}
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
              <div className="space-y-1.5">
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
                <p className="text-[11px] text-center text-muted-foreground">
                  7 days free, then {plan.price}/mo · Cancel anytime in 1 tap
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {currentPlan !==
        'free' &&
        !loadingSubscription && (
          <div className="pt-2">
            {showCancelConfirm ? (
              <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
                <div className="space-y-1">
                  <p className="font-heading font-semibold text-sm text-destructive flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0" />
                    Cancel {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} Subscription?
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Your paid access will end immediately and your account will return to the Free baseline plan. You can re-subscribe at any time.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={cancelling}
                  >
                    Keep My Plan
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="flex-1 text-xs font-semibold"
                    onClick={executeCancel}
                    disabled={cancelling}
                  >
                    {cancelling ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      'Confirm Cancel'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelling}
              >
                Cancel Subscription
              </Button>
            )}
          </div>
        )}

      <p className="text-[10px] text-muted-foreground text-center">
        Cancel anytime. Billed monthly.
      </p>
    </div>
  );
}
