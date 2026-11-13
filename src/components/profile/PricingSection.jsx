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
  getRecentUpgradeGrace,
  clearRecentUpgradeGrace,
} from '@/lib/subscription';
import { createStripeCheckout, buildPaymentLinkUrl } from '@/lib/stripeCheckout';
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
  const { user, checkUserAuth, logout } = useAuth();
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
  const [cardError, setCardError] = useState(null); // { planKey, message, needsReauth }
  const [blockedCheckout, setBlockedCheckout] = useState(null); // { planKey, planName, url }
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const checkoutPollTimerRef = useRef(null);
  const lastSyncEventRef = useRef(0);

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

  const loadSubscription = useCallback(async () => {
    setLoadingSubscription(true);

    try {
      const recentGrace = getRecentUpgradeGrace();

      // 1. Check LocalStorage plan as fallback only
      const localPlanRaw = (() => {
        try {
          const p = localStorage.getItem('washek_subscription_plan');
          return p && p !== 'free' ? normalizePlan(p) : null;
        } catch {
          return null;
        }
      })();

      // 2. Query authoritative Supabase profile row
      let hasRemoteProfile = false;
      let profilePlan = 'free';
      let profileStatus = '';
      let profileSubId = null;
      let profilePriceId = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const authUid = sessionData?.session?.user?.id;
        if (authUid) {
          const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, stripe_subscription_id, stripe_price_id')
            .eq('id', authUid)
            .maybeSingle();

          if (!profErr && profile) {
            hasRemoteProfile = true;
            profilePlan = normalizePlan(profile.subscription_plan);
            profileStatus = String(profile.subscription_status || '').toLowerCase().trim();
            profileSubId = profile.stripe_subscription_id;
            profilePriceId = profile.stripe_price_id;
          }
        }
      } catch (sbErr) {
        console.debug('[PricingSection] Supabase profile lookup note:', sbErr);
      }

      // 3. Check stored user object fallback
      let userObjPlan = null;
      try {
        const u = JSON.parse(localStorage.getItem('washek_user') || '{}');
        if (u?.subscription_status !== 'canceled' && u?.subscription_status !== 'cancelled' && u?.subscription_plan) {
          userObjPlan = normalizePlan(u.subscription_plan);
        }
      } catch {
        /* ignore */
      }

      // Resolve the true active plan (authoritative DB > recent checkout grace > offline cache)
      let resolvedPlan = 'free';
      let resolvedStatus = 'inactive';

      if (hasRemoteProfile) {
        const dbActive = profilePlan !== 'free' && isActiveStatus(profileStatus);
        if (recentGrace && (!dbActive || profilePlan !== recentGrace.plan)) {
          resolvedPlan = normalizePlan(recentGrace.plan);
          resolvedStatus = recentGrace.status || 'active';
        } else if (dbActive) {
          resolvedPlan = profilePlan;
          resolvedStatus = profileStatus || 'active';
          if (recentGrace?.plan === resolvedPlan) {
            clearRecentUpgradeGrace();
          }
        } else {
          // DB authoritatively shows free / canceled / inactive
          resolvedPlan = 'free';
          resolvedStatus = profileStatus || 'inactive';
        }
      } else {
        if (recentGrace) {
          resolvedPlan = normalizePlan(recentGrace.plan);
          resolvedStatus = recentGrace.status || 'active';
        } else if (localPlanRaw && localPlanRaw !== 'free') {
          resolvedPlan = localPlanRaw;
          resolvedStatus = 'active';
        } else if (userObjPlan && userObjPlan !== 'free') {
          resolvedPlan = userObjPlan;
          resolvedStatus = 'active';
        } else if (currentPlanProp && currentPlanProp !== 'free') {
          resolvedPlan = normalizePlan(currentPlanProp);
          resolvedStatus = 'active';
        }
      }

      if (resolvedPlan !== 'free') {
        setSubscription({
          id: profileSubId || `sub_${resolvedPlan}`,
          plan: resolvedPlan,
          plan_key: resolvedPlan,
          status: resolvedStatus,
          stripe_price_id: profilePriceId,
        });
        if (localPlanRaw !== resolvedPlan) {
          applySubscriptionUpgrade(resolvedPlan, resolvedStatus, { syncServer: false });
        }
      } else {
        setSubscription(null);
        if (hasRemoteProfile && localPlanRaw) {
          try {
            localStorage.removeItem('washek_subscription_plan');
            localStorage.setItem('washek_subscription_status', resolvedStatus);
          } catch {
            /* ignore */
          }
        }
      }

      setCurrentPlan((prev) => {
        if (prev !== resolvedPlan) {
          onPlanChangeRef.current?.(resolvedPlan);
        }
        return resolvedPlan;
      });
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
  }, [currentPlanProp]);

  // Listen for verified payment signals from the checkout return tab
  useEffect(() => {
    const handlePlanVerified = (planKey, subStatus = 'active') => {
      const safePlan = normalizePlan(planKey);
      if (!safePlan || safePlan === 'free') return;

      const now = Date.now();
      if (now - lastSyncEventRef.current < 1500) {
        return;
      }
      lastSyncEventRef.current = now;

      if (checkoutPollTimerRef.current) {
        clearInterval(checkoutPollTimerRef.current);
        checkoutPollTimerRef.current = null;
      }

      applySubscriptionUpgrade(safePlan, subStatus, {
        isNewUpgrade: true,
        syncServer: false,
      });
      setCurrentPlan(safePlan);
      onPlanChangeRef.current?.(safePlan);
      checkUserAuth?.().catch(() => {});
      loadSubscription();
      toast.success(`Payment verified! Your ${safePlan.charAt(0).toUpperCase() + safePlan.slice(1)} plan is now active.`);
    };

    const handleWindowMsg = (event) => {
      if (event.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS' && event.data?.plan) {
        handlePlanVerified(event.data.plan, event.data?.status || 'active');
      }
    };
    window.addEventListener('message', handleWindowMsg);

    let bc = null;
    try {
      bc = new BroadcastChannel('washek_subscription_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS' && event.data?.plan) {
          handlePlanVerified(event.data.plan, event.data?.status || 'active');
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
            handlePlanVerified(parsed.plan, parsed?.status || 'active');
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
  }, [checkUserAuth, loadSubscription]);

  useEffect(() => {
    return () => {
      if (checkoutPollTimerRef.current) {
        clearInterval(checkoutPollTimerRef.current);
        checkoutPollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (active) {
      loadSubscription();
    }

    const handleFocus = () => {
      if (active) {
        loadSubscription();
        checkUserAuth?.().catch(() => {});
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
  }, [loadSubscription, checkUserAuth]);

  const startPostCheckoutPolling = useCallback((expectedPlan) => {
    if (checkoutPollTimerRef.current) {
      clearInterval(checkoutPollTimerRef.current);
      checkoutPollTimerRef.current = null;
    }
    const startedAt = Date.now();
    checkoutPollTimerRef.current = window.setInterval(async () => {
      if (Date.now() - startedAt > 120000) {
        clearInterval(checkoutPollTimerRef.current);
        checkoutPollTimerRef.current = null;
        return;
      }
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status')
          .eq('id', uid)
          .maybeSingle();

        const dbPlan = normalizePlan(profile?.subscription_plan);
        const dbStatus = String(profile?.subscription_status || '').toLowerCase();
        if (dbPlan === expectedPlan && isActiveStatus(dbStatus)) {
          clearInterval(checkoutPollTimerRef.current);
          checkoutPollTimerRef.current = null;
          applySubscriptionUpgrade(dbPlan, dbStatus, { isNewUpgrade: true, syncServer: false });
          setCurrentPlan(dbPlan);
          onPlanChangeRef.current?.(dbPlan);
          checkUserAuth?.().catch(() => {});
          loadSubscription();
          toast.success(`Subscription synced! Welcome to ${dbPlan.charAt(0).toUpperCase() + dbPlan.slice(1)}.`);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);
  }, [checkUserAuth, loadSubscription]);

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
    setCardError(null);
    setBlockedCheckout(null);

    // Synchronously reserve a tab inside the user click gesture so async fetches never get popup-blocked.
    // Omit 'noopener' so /subscription-return preserves window.opener to close & notify cleanly.
    let checkoutWin = null;
    try {
      checkoutWin = window.open('about:blank', '_blank');
      if (checkoutWin && !checkoutWin.closed) {
        try {
          checkoutWin.document.open();
          checkoutWin.document.write(
            '<!doctype html><html><head><title>Connecting to Stripe Checkout…</title></head>' +
              '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#090d16;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">' +
              '<div style="text-align:center;padding:24px;">' +
              '<div style="font-weight:700;font-size:18px;margin-bottom:8px;">Connecting to Stripe Checkout…</div>' +
              '<div style="font-size:13px;color:#94a3b8;">Preparing your ' +
              String(plan.name || '').replace(/[<>&"]/g, '') +
              ' plan. Redirecting in a moment…</div>' +
              '</div></body></html>'
          );
          checkoutWin.document.close();
        } catch {
          // ignore document write error
        }
      }
    } catch {
      checkoutWin = null;
    }

    const closeReservedWindow = () => {
      try {
        if (checkoutWin && !checkoutWin.closed) {
          checkoutWin.close();
        }
      } catch {
        // ignore close error
      }
    };

    try {
      const latestStoredUser = (() => {
        try {
          return JSON.parse(localStorage.getItem('washek_user') || '{}');
        } catch {
          return storedUser || {};
        }
      })();
      const userEmail = user?.email || latestStoredUser?.email || '';
      const userId = user?.id || latestStoredUser?.id || latestStoredUser?.uid || '';

      localStorage.setItem('washek_pending_checkout_plan', plan.planKey);
      sessionStorage.setItem('washek_pending_checkout_plan', plan.planKey);
      document.cookie = `washek_pending_checkout_plan=${plan.planKey}; path=/; max-age=86400; SameSite=Lax`;

      let destinationUrl = null;
      let checkoutErrorMessage = '';
      let needsReauth = false;

      // 1. Primary: create real Stripe Checkout Session via Supabase Edge Function
      try {
        const checkoutResult = await createStripeCheckout(plan.planKey);
        if (
          checkoutResult?.action === 'already_active' ||
          checkoutResult?.action === 'already_current' ||
          checkoutResult?.action === 'changed'
        ) {
          closeReservedWindow();
          applySubscriptionUpgrade(plan.planKey, 'active', { isNewUpgrade: true, syncServer: false });
          setCurrentPlan(plan.planKey);
          onPlanChangeRef.current?.(plan.planKey);
          await checkUserAuth?.().catch(() => {});
          await loadSubscription();
          toast.success(`Your ${plan.name} subscription is active and synced!`);
          return;
        }
        if (checkoutResult?.url) {
          destinationUrl = checkoutResult.url;
        }
      } catch (edgeErr) {
        checkoutErrorMessage = edgeErr?.message || '';
        if (edgeErr?.code === 'AUTH_SESSION_EXPIRED') {
          needsReauth = true;
        }
        console.warn('[PricingSection] createStripeCheckout note:', checkoutErrorMessage || edgeErr);
      }

      // 1b. If JWT wasn't ready yet, re-hydrate auth state once and retry createStripeCheckout
      if (!destinationUrl && needsReauth && userEmail) {
        try {
          await checkUserAuth?.().catch(() => {});
          const { data: refreshedSessionData } = await supabase.auth.getSession();
          const candidateToken = refreshedSessionData?.session?.access_token || '';
          if (candidateToken && !candidateToken.startsWith('vault_tok_') && candidateToken.split('.').length === 3) {
            const retryResult = await createStripeCheckout(plan.planKey);
            if (retryResult?.url) {
              destinationUrl = retryResult.url;
              needsReauth = false;
              checkoutErrorMessage = '';
            }
          }
        } catch (retryErr) {
          console.debug('[PricingSection] Session retry checkout note:', retryErr?.message || retryErr);
        }
      }

      // 2. Fallback: Express checkout endpoint passing fresh Supabase session token
      if (!destinationUrl) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const freshToken =
            sessionData?.session?.access_token ||
            localStorage.getItem('washek_auth_token') ||
            '';
          if (freshToken && !freshToken.startsWith('vault_tok_') && !freshToken.startsWith('washek_sess_') && freshToken.split('.').length === 3) {
            const sessionRes = await fetch('/api/create-checkout-session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              body: JSON.stringify({
                plan: plan.planKey,
                userId: sessionData?.session?.user?.id || userId,
                email: sessionData?.session?.user?.email || userEmail,
                returnUrl: window.location.origin,
                hasUsedTrial,
              }),
            });
            const sessionDataJson = await sessionRes.json().catch(() => null);
            if (
              sessionRes.ok &&
              (
                sessionDataJson?.action === 'already_active' ||
                sessionDataJson?.action === 'already_current' ||
                sessionDataJson?.action === 'changed'
              )
            ) {
              closeReservedWindow();
              applySubscriptionUpgrade(plan.planKey, 'active', { isNewUpgrade: true, syncServer: false });
              setCurrentPlan(plan.planKey);
              onPlanChangeRef.current?.(plan.planKey);
              await checkUserAuth?.().catch(() => {});
              await loadSubscription();
              toast.success(`Your ${plan.name} subscription is active and synced!`);
              return;
            }
            if (sessionRes.ok && sessionDataJson?.url) {
              destinationUrl = sessionDataJson.url;
              needsReauth = false;
            } else if (sessionDataJson?.error) {
              checkoutErrorMessage = sessionDataJson.error;
              if (sessionRes.status === 401 || sessionDataJson?.code === 'AUTH_SESSION_EXPIRED') {
                needsReauth = true;
              }
            }
          }
        } catch (err) {
          console.debug('[PricingSection] create-checkout-session fetch note:', err);
        }
      }

      // 3. Fallback for active authenticated app sessions (e.g. credential vault) without a Supabase JWT:
      // never show a false "session timed out" error when the athlete is actively signed in.
      if (!destinationUrl && userEmail) {
        const paymentLinkUrl =
          buildPaymentLinkUrl(plan.planKey, { userId, email: userEmail }) ||
          plan.paymentUrl;
        if (paymentLinkUrl) {
          destinationUrl = paymentLinkUrl;
          needsReauth = false;
        }
      }

      if (!destinationUrl) {
        closeReservedWindow();
        const err = new Error(
          checkoutErrorMessage ||
            (userEmail
              ? 'Unable to connect to Stripe Checkout right now. Please try again.'
              : 'Please sign in to upgrade your plan.')
        );
        if (!userEmail && needsReauth) err.code = 'AUTH_SESSION_EXPIRED';
        throw err;
      }

      // Start watching DB/events for checkout completion
      startPostCheckoutPolling(plan.planKey);

      // 3. Navigate the synchronously reserved tab, or fall back to direct navigation / user-clickable link
      let tabOpened = false;
      if (checkoutWin && !checkoutWin.closed) {
        try {
          checkoutWin.location.href = destinationUrl;
          tabOpened = true;
        } catch {
          tabOpened = false;
        }
      }

      if (!tabOpened) {
        try {
          const win = window.open(destinationUrl, '_blank');
          if (win && !win.closed && typeof win.closed !== 'undefined') {
            tabOpened = true;
          }
        } catch {
          // window.open blocked
        }
      }

      if (!tabOpened) {
        const inIframe = (() => {
          try {
            return window.self !== window.top;
          } catch {
            return true;
          }
        })();

        if (!inIframe) {
          window.location.assign(destinationUrl);
          return;
        }

        // If inside an iframe and browser blocked popups, show a native <a> button inside this plan card
        setBlockedCheckout({
          planKey: plan.planKey,
          planName: plan.name,
          url: destinationUrl,
        });
        toast.info(`Click "Continue to ${plan.name} Checkout" below to open Stripe.`);
        return;
      }

      toast.info(`Stripe Checkout opened in new tab. Complete checkout to unlock ${plan.name}.`);
    } catch (checkoutError) {
      closeReservedWindow();
      const isAuthErr = checkoutError?.code === 'AUTH_SESSION_EXPIRED';
      const msg = isAuthErr
        ? 'Please sign in to upgrade your plan.'
        : checkoutError?.message || 'Unable to start checkout.';
      console.error('[PricingSection] Stripe redirect failed:', checkoutError);
      setError(msg);
      setCardError({ planKey: plan.planKey, message: msg, needsReauth: isAuthErr });
      toast.error(msg);
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
              <div className="space-y-2">
                {blockedCheckout?.planKey === plan.planKey && blockedCheckout?.url ? (
                  <a
                    href={blockedCheckout.url}
                    target="_blank"
                    rel="opener"
                    onClick={() => startPostCheckoutPolling(plan.planKey)}
                    className={`w-full h-11 rounded-xl font-heading font-semibold text-sm tracking-wide flex items-center justify-center ${plan.buttonClass}`}
                  >
                    Continue to {plan.name} Checkout →
                  </a>
                ) : (
                  <Button
                    className={`w-full h-11 rounded-xl font-heading font-semibold text-sm tracking-wide ${plan.buttonClass}`}
                    onClick={() => handleCheckout(plan)}
                    disabled={!!loadingPlan}
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
                )}
                {cardError?.planKey === plan.planKey && cardError?.message && (
                  <div className="space-y-2 text-center">
                    <p className="text-[11px] text-destructive font-medium">
                      {cardError.message}
                    </p>
                    {cardError.needsReauth && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full text-xs font-semibold"
                        onClick={async () => {
                          await logout?.().catch(() => {});
                          window.location.assign('/login');
                        }}
                      >
                        Sign In to Continue Upgrade
                      </Button>
                    )}
                  </div>
                )}
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
