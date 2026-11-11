import { useEffect, useState, useRef, useCallback } from 'react';

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
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';

const freePlan = {
  name: 'Free',
  planKey: 'free',
  price: '$0',
  period: '/forever',
  icon: ShieldCheck,
  color: 'text-muted-foreground',
  borderColor: 'border-border/60',
  bgColor: 'bg-card/75 backdrop-blur-md',
  badge: null,
  features: [
    '100 Coach Kael messages/month',
    'Scientific & biomechanical accuracy on every answer',
    'Direct, concise guidance with essential execution cues',
    'Full live workout tracker with auto-rest timer',
    'Standard response delivery speed',
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
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/40 hover:border-emerald-500/70',
    bgColor: 'bg-gradient-to-b from-emerald-500/[0.08] via-card to-card',
    glowClass: 'shadow-[0_0_25px_rgba(16,185,129,0.12)]',
    iconGlow: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    badge: null,
    buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white font-heading font-semibold shadow-sm transition-colors',
    features: [
      '300 Coach Kael messages/month (3x Free)',
      'In-depth Coach Kael — biomechanical rationale & progression milestones',
      'Full custom workout adjustments',
      'Adaptive programming — calibrated from your workout performance',
      'Food & package nutrition scan',
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
    borderColor: 'border-primary/60 hover:border-primary/90',
    bgColor: 'bg-gradient-to-b from-primary/[0.10] via-card to-card',
    glowClass: 'shadow-[0_0_30px_rgba(59,130,246,0.18)] ring-1 ring-primary/40',
    iconGlow: 'bg-primary/15 border-primary/30 text-primary',
    badge: 'Most Popular',
    badgeClass: 'bg-primary/15 text-primary border border-primary/30',
    buttonClass: 'bg-primary hover:bg-primary/90 text-primary-foreground font-heading font-semibold shadow-sm transition-colors',
    features: [
      '800 Coach Kael messages/month (8x Free)',
      'High-performance coaching — tempo breakdowns, activation cues & fueling synergy',
      'Everything in Progress',
      'Body composition scanner*',
      'Nutrition insights & suggestions',
      'Workout analytics dashboard',
    ],
    disclaimer:
      '* Body composition estimates are approximations only and may not be fully accurate.',
  },
  {
    name: 'Elite',
    planKey: 'elite',
    price: '$34.99',
    period: '/mo',
    paymentUrl: 'https://buy.stripe.com/test_28E3cxboK2Qu3N1cvdg3604',
    icon: Crown,
    color: 'text-amber-400',
    borderColor: 'border-amber-500/50 hover:border-amber-500/80',
    bgColor: 'bg-gradient-to-b from-amber-500/[0.08] via-card to-card',
    glowClass: 'shadow-[0_0_25px_rgba(245,158,11,0.15)]',
    iconGlow: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
    badge: 'Best Value',
    badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    buttonClass: 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-heading font-bold shadow-sm transition-colors',
    features: [
      '2,000 Coach Kael messages/month (20x Free)',
      'Masterclass coaching — kinetic chain mastery & recovery diagnostics',
      'Everything in Performance',
      'Live workout adjustments (real-time coaching while training)',
      'Form Lab video analysis',
      'Technical form scoring, rep/hold counting & corrective drills',
      'Elite tips & coaching insights',
      'Deep recovery & deload protocols',
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

const TIER_LEVELS = {
  free: 0,
  progress: 1,
  performance: 2,
  elite: 3,
};

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

export default function PricingSection({ onPlanChange, currentPlanProp }) {
  const { user } = useAuth();
  const onPlanChangeRef = useRef(onPlanChange);
  useEffect(() => {
    onPlanChangeRef.current = onPlanChange;
  }, [onPlanChange]);

  const [loadingPlan, setLoadingPlan] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(() => {
    if (currentPlanProp && currentPlanProp !== 'free') {
      return normalizePlan(currentPlanProp);
    }
    try {
      const stored = localStorage.getItem('washek_subscription_plan');
      if (stored && stored !== 'free') return normalizePlan(stored);
      const userObj = JSON.parse(localStorage.getItem('washek_user') || '{}');
      if (userObj?.subscription_plan && userObj.subscription_plan !== 'free') {
        return normalizePlan(userObj.subscription_plan);
      }
    } catch {
      // ignore
    }
    return 'free';
  });

  useEffect(() => {
    if (currentPlanProp) {
      const safe = normalizePlan(currentPlanProp);
      setCurrentPlan(safe);
    }
  }, [currentPlanProp]);

  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState('');
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const isLaunchingRef = useRef(false);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('washek_user') || '{}');
    } catch {
      return {};
    }
  })();

  const hasUsedTrial = Boolean(
    user?.has_used_trial ||
    user?.trial_used ||
    storedUser?.has_used_trial ||
    storedUser?.trial_used ||
    localStorage.getItem('washek_has_used_trial') === 'true' ||
    subscription?.status === 'canceled'
  );

  // Listen for verified payment signals from the checkout return tab
  useEffect(() => {
    const handlePlanVerified = (planKey) => {
      const safePlan = normalizePlan(planKey);
      if (safePlan && safePlan !== 'free') {
        applySubscriptionUpgrade(safePlan, 'active');
        toast.success(`Payment verified! Reloading with your new ${safePlan} plan...`);
        setTimeout(() => {
          window.location.reload();
        }, 600);
      }
    };

    const handleWindowMsg = (event) => {
      if (event.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS' && event.data?.plan) {
        handlePlanVerified(event.data.plan);
      }
    };
    window.addEventListener('message', handleWindowMsg);

    let bc = null;
    try {
      bc = new BroadcastChannel('washek_subscription_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS' && event.data?.plan) {
          handlePlanVerified(event.data.plan);
        }
      };
    } catch {
      /* BroadcastChannel not supported in this environment */
    }

    const handleStorageEvent = (event) => {
      if (event.key === 'washek_subscription_success_event' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed?.plan && parsed.plan !== 'free') {
            handlePlanVerified(parsed.plan);
          }
        } catch {
          /* ignore JSON parse errors on invalid storage events */
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('message', handleWindowMsg);
      window.removeEventListener('storage', handleStorageEvent);
      bc?.close();
    };
  }, []);

  const loadSubscription = useCallback(async () => {
    setLoadingSubscription(true);

    try {
      const storedStatus = (() => {
        try {
          return String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
        } catch {
          return '';
        }
      })();
      const isLocallyCanceled = storedStatus === 'canceled' || storedStatus === 'cancelled';

      // 1. Check LocalStorage plan directly
      const localPlanRaw = (() => {
        try {
          const p = localStorage.getItem('washek_subscription_plan');
          return p && p !== 'free' ? normalizePlan(p) : null;
        } catch {
          return null;
        }
      })();

      // 2. Check Supabase profile
      let profilePlan = 'free';
      let profileStatus = '';
      let profileSubId = null;
      let profilePriceId = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, stripe_subscription_id, stripe_price_id')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (profile) {
            profilePlan = normalizePlan(profile.subscription_plan);
            profileStatus = String(profile.subscription_status || '').toLowerCase();
            profileSubId = profile.stripe_subscription_id;
            profilePriceId = profile.stripe_price_id;
          }
        }
      } catch (sbErr) {
        console.debug('[PricingSection] Supabase profile lookup note:', sbErr);
      }

      // 4. Check stored user object
      let userObjPlan = null;
      try {
        const u = JSON.parse(localStorage.getItem('washek_user') || '{}');
        if (u?.subscription_status !== 'canceled' && u?.subscription_status !== 'cancelled' && u?.subscription_plan) {
          userObjPlan = normalizePlan(u.subscription_plan);
        }
      } catch {
        /* ignore */
      }

      // Resolve the true active plan
      let resolvedPlan = 'free';
      if (currentPlanProp && currentPlanProp !== 'free') {
        resolvedPlan = normalizePlan(currentPlanProp);
      } else if (localPlanRaw && localPlanRaw !== 'free') {
        resolvedPlan = localPlanRaw;
      } else if (userObjPlan && userObjPlan !== 'free') {
        resolvedPlan = userObjPlan;
      } else if (profilePlan && profilePlan !== 'free' && isActiveStatus(profileStatus)) {
        resolvedPlan = profilePlan;
      }

      if (resolvedPlan !== 'free') {
        // Clear any stale canceled marker since user has a paid tier
        try {
          localStorage.setItem('washek_subscription_status', profileStatus || 'active');
          localStorage.setItem('washek_subscription_plan', resolvedPlan);
        } catch {
          /* ignore */
        }

        setSubscription({
          id: profileSubId || `sub_${resolvedPlan}`,
          plan: resolvedPlan,
          plan_key: resolvedPlan,
          status: profileStatus || 'active',
          stripe_price_id: profilePriceId,
        });
      } else {
        setSubscription(null);
      }

      setCurrentPlan((prev) => {
        if (prev !== resolvedPlan) {
          onPlanChangeRef.current?.(resolvedPlan);
        }
        return resolvedPlan;
      });

      if (resolvedPlan !== 'free') {
        applySubscriptionUpgrade(resolvedPlan, profileStatus || 'active');
      }
    } catch (loadError) {
      console.error('[PricingSection] Failed to load subscription:', loadError);
      let fallbackLocal = 'free';
      try {
        fallbackLocal =
          localStorage.getItem('washek_subscription_plan') ||
          JSON.parse(localStorage.getItem('washek_user') || '{}')?.subscription_plan ||
          'free';
      } catch (_err) {
        // ignore
      }
      const safePlan = normalizePlan(fallbackLocal);
      setCurrentPlan(safePlan);
    } finally {
      setLoadingSubscription(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (active) {
      loadSubscription();
    }

    const handleFocus = () => {
      if (active) {
        loadSubscription();
      }
    };

    window.addEventListener('focus', handleFocus);
    const handleVisChange = () => {
      if (document.visibilityState === 'visible' && active) {
        handleFocus();
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      if (active) {
        loadSubscription();
      }
    });

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisChange);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadSubscription]);

  const handleCheckout = async (plan) => {
    if (!plan?.planKey || loadingPlan) {
      return;
    }

    if (currentPlan === plan.planKey && subscription?.status === 'active') {
      toast.info(`You already have active access to the ${plan.name} plan.`);
      return;
    }

    setLoadingPlan(plan.planKey);
    setError('');

    try {
      const userEmail = user?.email || storedUser?.email;
      const userId = user?.id || storedUser?.id || storedUser?.uid;

      localStorage.setItem('washek_pending_checkout_plan', plan.planKey);
      sessionStorage.setItem('washek_pending_checkout_plan', plan.planKey);
      document.cookie = `washek_pending_checkout_plan=${plan.planKey}; path=/; max-age=86400; SameSite=Lax`;

      // 1. Request Stripe Checkout Session from server
      let destinationUrl = plan.paymentUrl;
      try {
        const token = localStorage.getItem('washek_auth_token') || '';
        const sessionRes = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            plan: plan.planKey,
            userId,
            email: userEmail,
            returnUrl: window.location.origin,
            hasUsedTrial,
          }),
        });
        const sessionData = await sessionRes.json();
        if (sessionData?.url) {
          destinationUrl = sessionData.url;
        }
      } catch (err) {
        console.debug('[PricingSection] create-checkout-session fetch note:', err);
      }

      // 2. Open Stripe Checkout in new tab reliably with anchor click fallback
      let tabOpened = false;
      try {
        const win = window.open(destinationUrl, '_blank', 'noopener,noreferrer');
        if (win && !win.closed && typeof win.closed !== 'undefined') {
          tabOpened = true;
        }
      } catch (_e) {
        // window.open blocked
      }

      if (!tabOpened) {
        const link = document.createElement('a');
        link.href = destinationUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      toast.info(`Stripe Checkout opened in new tab. Complete checkout to unlock ${plan.name}.`);
    } catch (checkoutError) {
      console.error('[PricingSection] Stripe redirect failed:', checkoutError);
      setError(checkoutError?.message || 'Unable to start checkout.');
      toast.error(checkoutError?.message || 'Unable to start checkout.');
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

      if (!currentUserId && user?.id) {
        currentUserId = user.id;
        currentUserEmail = user.email;
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
    <div className="space-y-4 relative">
      {/* Ambient background glows for luminous luxury aesthetic */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-80 h-80 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 -right-20 w-80 h-80 bg-amber-500/15 rounded-full blur-[100px] pointer-events-none" />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm relative z-10">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

          <span>
            {error}
          </span>
        </div>
      )}






      {/* =========================================================
          FREE PLAN (BASELINE)
          ========================================================= */}
      <Card
        className={`p-5 rounded-3xl border ${freePlan.borderColor} ${freePlan.bgColor} shadow-sm relative overflow-hidden backdrop-blur-xl z-10`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-muted/60 border border-white/5 flex items-center justify-center">
              <ShieldCheck className={`w-5 h-5 ${freePlan.color}`} />
            </div>

            <span className="font-heading font-bold text-base">
              {freePlan.name}
            </span>
          </div>

          <div className="flex items-baseline gap-0.5">
            <span className={`font-heading font-black text-2xl ${freePlan.color}`}>
              {freePlan.price}
            </span>

            <span className="text-xs text-muted-foreground font-medium">
              {freePlan.period}
            </span>
          </div>
        </div>

        <ul className="space-y-2.5 mb-4">
          {freePlan.features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-xs text-muted-foreground"
            >
              <Check className="w-3.5 h-3.5 mt-0.5 text-muted-foreground/80 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {currentPlan === 'free' ? (
          <div className="w-full h-11 rounded-2xl bg-muted/50 border border-border/60 flex items-center justify-center font-heading font-bold text-xs text-muted-foreground tracking-wider uppercase">
            Current Baseline Plan
          </div>
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
        const Icon = plan.icon;
        const currentTierLevel = TIER_LEVELS[currentPlan] || 0;
        const cardTierLevel = TIER_LEVELS[plan.planKey] || 0;
        const isCurrent = currentPlan === plan.planKey;
        const isIncludedInHigherTier = cardTierLevel < currentTierLevel;

        return (
          <Card
            key={plan.name}
            className={`p-5 sm:p-6 rounded-3xl border-2 ${plan.borderColor} ${plan.bgColor} ${plan.glowClass} relative overflow-hidden transition-all duration-200 z-10`}
          >
            {/* Header: Title + Inline Badge on Left, Price on Right (Unobstructed) */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${plan.iconGlow}`}>
                  <Icon className={`w-5 h-5 ${plan.color}`} />
                </div>

                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-extrabold text-lg text-foreground tracking-tight">
                      {plan.name}
                    </span>
                    {plan.badge && (
                      <span className={`inline-flex items-center text-[10px] font-heading font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${plan.badgeClass}`}>
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium block mt-0.5">
                    {plan.planKey === 'progress'
                      ? 'Daily Progression'
                      : plan.planKey === 'performance'
                        ? 'High Performance'
                        : 'Masterclass Athlete'}
                  </span>
                </div>
              </div>

              {/* Price: Cleanly isolated on right with zero overlapping badges */}
              <div className="text-right shrink-0">
                <div className="flex items-baseline justify-end gap-0.5">
                  <span className={`font-heading font-black text-2xl sm:text-3xl ${plan.color} tracking-tight`}>
                    {plan.price}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {plan.period}
                  </span>
                </div>
              </div>
            </div>

            <ul className="space-y-2.5 mb-5">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-xs text-foreground/90 font-medium"
                >
                  <Check className={`w-3.5 h-3.5 mt-0.5 ${plan.color} flex-shrink-0 drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]`} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {plan.disclaimer && (
              <p className="text-[10px] text-muted-foreground italic mb-4 leading-relaxed">
                {plan.disclaimer}
              </p>
            )}

            {/* Plan Button or Locked Down Current Tier */}
            {isCurrent ? (
              <div className="w-full h-11 rounded-xl bg-secondary/80 border border-border/80 flex items-center justify-center gap-2 font-heading font-bold text-xs text-foreground tracking-wider uppercase shadow-sm">
                <Check className="w-4 h-4 text-emerald-400" />
                Current Plan · Active
              </div>
            ) : isIncludedInHigherTier ? (
              <div className="w-full h-11 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-center font-heading font-medium text-xs text-muted-foreground tracking-wider uppercase">
                Included with your {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan
              </div>
            ) : (
              <div className="space-y-1.5">
                <Button
                  className={`w-full h-11 rounded-xl font-heading font-semibold text-sm tracking-wide ${plan.buttonClass}`}
                  onClick={() => handleCheckout(plan)}
                  disabled={!!loadingPlan || loadingSubscription}
                >
                  {loadingPlan === plan.planKey ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening Stripe Checkout…
                    </>
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </Button>
                <p className="text-[11px] text-center text-muted-foreground font-medium">
                  {hasUsedTrial
                    ? `Billed today: ${plan.price}/mo · Cancel anytime`
                    : `7 days free, then ${plan.price}/mo · Cancel anytime`}
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {currentPlan !== 'free' && !loadingSubscription && (
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
