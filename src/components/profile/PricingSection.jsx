import { useEffect, useState, useRef, useCallback } from 'react';

import {
  Check,
  Zap,
  Crown,
  Flame,
  Loader2,
  XCircle,
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import { supabase } from '@/lib/supabase';
import {
  applySubscriptionUpgrade,
  applySubscriptionCancellation,
  clearRecentUpgradeGrace,
} from '@/lib/subscription';
import {
  createStripeCheckout,
  resolveValidSupabaseSession,
  extractInvokeErrorMessage,
} from '@/lib/stripeCheckout';
import { queryClientInstance } from '@/lib/query-client';
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
  const { user, checkUserAuth, logout, syncSupabaseSession } = useAuth();
  const onPlanChangeRef = useRef(onPlanChange);
  useEffect(() => {
    onPlanChangeRef.current = onPlanChange;
  }, [onPlanChange]);

  const [loadingPlan, setLoadingPlan] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(() => {
    try {
      const storedStatus = String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
      if (storedStatus === 'canceled' || storedStatus === 'cancelled' || storedStatus === 'inactive') {
        return 'free';
      }
      if (currentPlanProp && currentPlanProp !== 'free') {
        return normalizePlan(currentPlanProp);
      }
      const stored = localStorage.getItem('washek_subscription_plan');
      if (stored && stored !== 'free') return normalizePlan(stored);
      const userObj = JSON.parse(localStorage.getItem('washek_user') || '{}');
      const userStatus = String(userObj?.subscription_status || '').toLowerCase().trim();
      if (
        userStatus !== 'canceled' &&
        userStatus !== 'cancelled' &&
        userStatus !== 'inactive' &&
        userObj?.subscription_plan &&
        userObj.subscription_plan !== 'free'
      ) {
        return normalizePlan(userObj.subscription_plan);
      }
    } catch {
      // ignore
    }
    return 'free';
  });

  useEffect(() => {
    try {
      if (sessionStorage.getItem('washek_just_canceled') === '1') {
        sessionStorage.removeItem('washek_just_canceled');
        toast.success('Your subscription has been canceled. Your account is now on the Free Plan.');
      }
    } catch {
      // ignore sessionStorage error
    }
  }, []);

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
  const [billingSyncModal, setBillingSyncModal] = useState(null); // { mode: 'checkout' | 'cancel', plan?, email }
  const [billingSyncStep, setBillingSyncStep] = useState('password'); // 'password' | 'otp'
  const [billingPassword, setBillingPassword] = useState('');
  const [billingOtpSent, setBillingOtpSent] = useState(false);
  const [billingOtpCode, setBillingOtpCode] = useState('');
  const [billingNewPassword, setBillingNewPassword] = useState('');
  const [billingSyncBusy, setBillingSyncBusy] = useState(false);
  const [billingSyncError, setBillingSyncError] = useState('');
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
      clearRecentUpgradeGrace();

      // 1. Check LocalStorage plan as offline fallback only when status isn't canceled/inactive
      const storedStatusRaw = (() => {
        try {
          return String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
        } catch {
          return '';
        }
      })();
      const isLocallyInactive =
        storedStatusRaw === 'canceled' ||
        storedStatusRaw === 'cancelled' ||
        storedStatusRaw === 'inactive';

      const localPlanRaw = (() => {
        if (isLocallyInactive) return null;
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
      if (!isLocallyInactive) {
        try {
          const u = JSON.parse(localStorage.getItem('washek_user') || '{}');
          const uStatus = String(u?.subscription_status || '').toLowerCase().trim();
          if (uStatus !== 'canceled' && uStatus !== 'cancelled' && uStatus !== 'inactive' && u?.subscription_plan) {
            userObjPlan = normalizePlan(u.subscription_plan);
          }
        } catch {
          /* ignore */
        }
      }

      // Resolve the true active plan (Postgres profiles is authoritative)
      let resolvedPlan = 'free';
      let resolvedStatus = 'inactive';

      if (hasRemoteProfile) {
        const dbActive = profilePlan !== 'free' && isActiveStatus(profileStatus);
        if (dbActive) {
          resolvedPlan = profilePlan;
          resolvedStatus = profileStatus || 'active';
        } else {
          // DB authoritatively shows free / canceled / inactive
          resolvedPlan = 'free';
          resolvedStatus = profileStatus || 'inactive';
        }
      } else if (!isLocallyInactive) {
        if (localPlanRaw && localPlanRaw !== 'free') {
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
        if (hasRemoteProfile) {
          try {
            localStorage.removeItem('washek_subscription_plan');
            localStorage.removeItem('washek_recent_upgrade');
            localStorage.setItem('washek_subscription_status', resolvedStatus || 'inactive');
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
      setCurrentPlan('free');
    } finally {
      setLoadingSubscription(false);
    }
  }, [currentPlanProp]);

  // Listen for payment signals from checkout return tab and verify against Postgres before unlocking
  useEffect(() => {
    const handlePlanVerified = async () => {
      const now = Date.now();
      if (now - lastSyncEventRef.current < 1500) {
        return;
      }
      lastSyncEventRef.current = now;

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) return;
        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status')
          .eq('id', uid)
          .maybeSingle();

        if (profErr || !profile) return;
        const dbPlan = normalizePlan(profile.subscription_plan);
        const dbStatus = String(profile.subscription_status || '').toLowerCase().trim();
        if (dbPlan === 'free' || !isActiveStatus(dbStatus)) {
          return;
        }

        if (checkoutPollTimerRef.current) {
          clearInterval(checkoutPollTimerRef.current);
          checkoutPollTimerRef.current = null;
        }

        applySubscriptionUpgrade(dbPlan, dbStatus, { syncServer: false });
        setBlockedCheckout(null);
        setCurrentPlan(dbPlan);
        onPlanChangeRef.current?.(dbPlan);
        await checkUserAuth?.().catch(() => {});
        await loadSubscription();
        toast.success(`Payment verified! Your ${dbPlan.charAt(0).toUpperCase() + dbPlan.slice(1)} plan is now active.`);
      } catch {
        // ignore transient verification errors
      }
    };

    const handleWindowMsg = (event) => {
      if (event.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS') {
        handlePlanVerified();
      }
    };
    window.addEventListener('message', handleWindowMsg);

    let bc = null;
    try {
      bc = new BroadcastChannel('washek_subscription_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS') {
          handlePlanVerified();
        }
      };
    } catch {
      /* BroadcastChannel not supported in this environment */
    }

    const handleStorageEvent = (event) => {
      if (event.key === 'washek_subscription_success_event' && event.newValue) {
        handlePlanVerified();
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
        const uid = sessionData?.session?.user?.id || user?.id;
        if (!uid) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status')
          .eq('id', uid)
          .maybeSingle();

        const dbPlan = normalizePlan(profile?.subscription_plan);
        const dbStatus = String(profile?.subscription_status || '').toLowerCase().trim();
        if (dbPlan === expectedPlan && isActiveStatus(dbStatus)) {
          clearInterval(checkoutPollTimerRef.current);
          checkoutPollTimerRef.current = null;
          applySubscriptionUpgrade(dbPlan, dbStatus, { syncServer: false });
          setBlockedCheckout(null);
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
  }, [checkUserAuth, loadSubscription, user?.id]);

  const openCheckoutTab = useCallback((destinationUrl, plan, reservedWin) => {
    startPostCheckoutPolling(plan.planKey);

    let tabOpened = false;
    if (reservedWin && !reservedWin.closed) {
      try {
        reservedWin.location.href = destinationUrl;
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
        return true;
      }

      setBlockedCheckout({
        planKey: plan.planKey,
        planName: plan.name,
        url: destinationUrl,
      });
      toast.info(`Click "Continue to ${plan.name} Checkout" below to open Stripe.`);
      return true;
    }

    toast.info(`Stripe Checkout opened in new tab. Complete checkout to unlock ${plan.name}.`);
    return true;
  }, [startPostCheckoutPolling]);

  const openBillingSyncModalFor = useCallback((mode, email, plan = null) => {
    setBillingSyncStep('password');
    setBillingPassword('');
    setBillingOtpSent(false);
    setBillingOtpCode('');
    setBillingNewPassword('');
    setBillingSyncError('');
    setBillingSyncModal({ mode, email, plan });
  }, []);

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
      let needsBillingSync = false;

      // 1. Primary: create real Stripe Checkout Session via Supabase Edge Function
      try {
        const checkoutResult = await createStripeCheckout(plan.planKey);
        if (
          checkoutResult?.action === 'already_active' ||
          checkoutResult?.action === 'already_current' ||
          checkoutResult?.action === 'changed'
        ) {
          closeReservedWindow();
          applySubscriptionUpgrade(plan.planKey, 'active', { syncServer: false });
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
        if (edgeErr?.code === 'BILLING_SYNC_REQUIRED') {
          needsBillingSync = true;
        } else if (edgeErr?.code === 'AUTH_SESSION_EXPIRED') {
          needsReauth = true;
        }
        console.warn('[PricingSection] createStripeCheckout note:', checkoutErrorMessage || edgeErr);
      }

      // 2. Fallback: Express checkout endpoint (also runs server JWKS/HMAC vault session recovery automatically)
      if (!destinationUrl) {
        try {
          let freshToken = '';
          let sessionUserId = userId;
          let sessionUserEmail = userEmail;
          try {
            const validSession = await resolveValidSupabaseSession(false);
            freshToken = validSession?.access_token || '';
            sessionUserId = validSession?.user?.id || userId;
            sessionUserEmail = validSession?.user?.email || userEmail;
          } catch {
            const { data: sessionData } = await supabase.auth.getSession();
            freshToken =
              sessionData?.session?.access_token ||
              localStorage.getItem('washek_auth_token') ||
              '';
            sessionUserId = sessionData?.session?.user?.id || userId;
            sessionUserEmail = sessionData?.session?.user?.email || userEmail;
          }

          const refreshTok = localStorage.getItem('washek_refresh_token') || '';
          const srvTok = localStorage.getItem('washek_srv_session') || '';

          if (freshToken || srvTok || sessionUserEmail) {
            const sessionRes = await fetch('/api/create-checkout-session', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
                ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
              },
              body: JSON.stringify({
                plan: plan.planKey,
                userId: sessionUserId,
                email: sessionUserEmail,
                returnUrl: window.location.origin,
                hasUsedTrial,
                refreshToken: refreshTok || undefined,
              }),
            });
            const sessionDataJson = await sessionRes.json().catch(() => null);

            if (sessionDataJson?.refreshedSession?.access_token) {
              await syncSupabaseSession?.(sessionDataJson.refreshedSession).catch(() => {});
            }

            if (
              sessionRes.ok &&
              (
                sessionDataJson?.action === 'already_active' ||
                sessionDataJson?.action === 'already_current' ||
                sessionDataJson?.action === 'changed'
              )
            ) {
              closeReservedWindow();
              applySubscriptionUpgrade(plan.planKey, 'active', { syncServer: false });
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
              needsBillingSync = false;
            } else if (
              sessionRes.status === 409 ||
              sessionDataJson?.code === 'VAULT_SUPABASE_SYNC_NEEDED' ||
              sessionDataJson?.needsBillingPasswordSync
            ) {
              needsBillingSync = true;
              needsReauth = false;
            } else if (sessionDataJson?.error) {
              checkoutErrorMessage = sessionDataJson.error;
              if (sessionRes.status === 401 || sessionDataJson?.code === 'AUTH_SESSION_EXPIRED') {
                if (sessionUserEmail) needsBillingSync = true;
                else needsReauth = true;
              }
            }
          }
        } catch (err) {
          console.debug('[PricingSection] create-checkout-session fetch note:', err);
        }
      }

      if (!destinationUrl && (needsBillingSync || (needsReauth && userEmail)) && userEmail) {
        closeReservedWindow();
        openBillingSyncModalFor('checkout', userEmail, plan);
        return;
      }

      if (!destinationUrl) {
        closeReservedWindow();
        const err = new Error(
          checkoutErrorMessage ||
            'Please sign in to connect your account with Stripe Checkout.'
        );
        if (needsReauth || !userEmail) err.code = 'AUTH_SESSION_EXPIRED';
        throw err;
      }

      openCheckoutTab(destinationUrl, plan, checkoutWin);
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
    if (cancelling || currentPlan === 'free') {
      return;
    }

    setCancelling(true);
    setError('');

    try {
      // 1. Obtain a freshly validated Supabase JWT session so Edge Function auth succeeds
      let session = null;
      try {
        session = await resolveValidSupabaseSession(false);
      } catch (sessionErr) {
        if (sessionErr?.code === 'BILLING_SYNC_REQUIRED' && (user?.email || storedUser?.email)) {
          setCancelling(false);
          openBillingSyncModalFor('cancel', user?.email || storedUser?.email);
          return;
        }
        await checkUserAuth?.().catch(() => {});
        try {
          session = await resolveValidSupabaseSession(true);
        } catch (retryErr) {
          if (retryErr?.code === 'BILLING_SYNC_REQUIRED' && (user?.email || storedUser?.email)) {
            setCancelling(false);
            openBillingSyncModalFor('cancel', user?.email || storedUser?.email);
            return;
          }
          throw retryErr;
        }
      }

      const currentUserId = session?.user?.id || user?.id || storedUser?.id || null;
      const currentUserEmail = session?.user?.email || user?.email || storedUser?.email || null;
      const cancelPayload = {
        userId: currentUserId,
        email: currentUserEmail,
      };

      const invokeCancelEdge = (activeSession) =>
        supabase.functions.invoke('cancel-subscription', {
          body: cancelPayload,
          headers: {
            Authorization: `Bearer ${activeSession.access_token}`,
          },
        });

      // 2. Call Supabase cancel-subscription Edge Function with explicit Authorization header
      let { data, error: invokeError } = await invokeCancelEdge(session);
      let detailedMessage = invokeError ? await extractInvokeErrorMessage(invokeError) : '';

      const looksLikeAuthFailure = (msg) =>
        /(^|\b)(401|unauthorized|jwt|missing authorization|invalid claim|invalid token|not authenticated|signed in)(\b|$)/i.test(
          String(msg || '')
        );

      if (
        (invokeError && (looksLikeAuthFailure(invokeError.message) || looksLikeAuthFailure(detailedMessage))) ||
        (data?.success === false && looksLikeAuthFailure(data?.error))
      ) {
        session = await resolveValidSupabaseSession(true);
        ({ data, error: invokeError } = await invokeCancelEdge(session));
        detailedMessage = invokeError ? await extractInvokeErrorMessage(invokeError) : '';
      }

      let canceledConfirmed = Boolean(!invokeError && data?.success !== false);

      // 3. Fallback through Express proxy forwarding the authenticated Supabase JWT if Edge invoke failed
      if (!canceledConfirmed) {
        try {
          const proxyRes = await fetch('/api/cancel-subscription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(cancelPayload),
          });
          const proxyData = await proxyRes.json().catch(() => null);
          if (proxyRes.ok && proxyData?.success) {
            canceledConfirmed = true;
          } else if (proxyData?.error) {
            detailedMessage = proxyData.error;
          }
        } catch (proxyErr) {
          console.debug('[PricingSection] Cancel proxy note:', proxyErr);
        }
      }

      if (!canceledConfirmed) {
        throw new Error(
          detailedMessage ||
            data?.error ||
            'Unable to cancel your subscription right now. Please try again.'
        );
      }

      // 4. Verify Postgres profile no longer shows an active paid plan (when profile row exists)
      if (currentUserId) {
        try {
          const { data: verifyProf } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status')
            .eq('id', currentUserId)
            .maybeSingle();

          if (verifyProf) {
            const dbPlan = normalizePlan(verifyProf.subscription_plan);
            const dbStatus = String(verifyProf.subscription_status || '').toLowerCase().trim();
            if (dbPlan !== 'free' && isActiveStatus(dbStatus)) {
              throw new Error(
                'Cancellation did not complete on billing database. Please retry.'
              );
            }
          }
        } catch (verifyErr) {
          if (verifyErr?.message?.includes('billing database')) {
            throw verifyErr;
          }
        }
      }

      // 5. Clear all local/session/query subscription caches and reload cleanly onto Free Plan
      applySubscriptionCancellation();
      setCurrentPlan('free');
      setSubscription(null);
      setShowCancelConfirm(false);
      onPlanChange?.('free');
      queryClientInstance.clear();

      try {
        sessionStorage.setItem('washek_just_canceled', '1');
      } catch {
        // ignore sessionStorage error
      }

      window.location.reload();
    } catch (cancelError) {
      console.error('[PricingSection] Cancellation failed:', cancelError);
      const errMsg = cancelError?.message || 'Unable to cancel your subscription.';
      setError(errMsg);
      toast.error(errMsg);
      setCancelling(false);
    }
  };

  const finishAfterBillingSync = async (reservedWin) => {
    const targetMode = billingSyncModal?.mode;
    const targetPlan = billingSyncModal?.plan;
    setBillingSyncModal(null);

    if (targetMode === 'cancel') {
      if (reservedWin && !reservedWin.closed) {
        try {
          reservedWin.close();
        } catch {
          // ignore
        }
      }
      await executeCancel();
      return;
    }

    if (targetPlan) {
      try {
        const result = await createStripeCheckout(targetPlan.planKey);
        if (
          result?.action === 'already_active' ||
          result?.action === 'already_current' ||
          result?.action === 'changed'
        ) {
          if (reservedWin && !reservedWin.closed) {
            try {
              reservedWin.close();
            } catch {
              // ignore
            }
          }
          applySubscriptionUpgrade(targetPlan.planKey, 'active', { syncServer: false });
          setCurrentPlan(targetPlan.planKey);
          onPlanChangeRef.current?.(targetPlan.planKey);
          await checkUserAuth?.().catch(() => {});
          await loadSubscription();
          toast.success(`Your ${targetPlan.name} subscription is active and synced!`);
          return;
        }
        if (result?.url) {
          openCheckoutTab(result.url, targetPlan, reservedWin);
          return;
        }
      } catch (err) {
        if (reservedWin && !reservedWin.closed) {
          try {
            reservedWin.close();
          } catch {
            // ignore
          }
        }
        toast.error(err?.message || 'Unable to launch Stripe Checkout.');
      }
    }
  };

  const handleBillingPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!billingSyncModal?.email || !billingPassword || billingSyncBusy) return;

    setBillingSyncBusy(true);
    setBillingSyncError('');

    let reservedWin = null;
    if (billingSyncModal.mode === 'checkout') {
      try {
        reservedWin = window.open('about:blank', '_blank');
      } catch {
        reservedWin = null;
      }
    }

    try {
      const res = await fetch('/api/auth/sync-supabase-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: billingSyncModal.email,
          password: billingPassword,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.session?.access_token) {
        throw new Error(
          data?.error ||
            'That password did not match your cloud billing password. Try your original password or verify with a 6-digit email code below.'
        );
      }

      await syncSupabaseSession?.(data.session, data.profile || null, data.serverSessionToken || '');
      await finishAfterBillingSync(reservedWin);
    } catch (err) {
      if (reservedWin && !reservedWin.closed) {
        try {
          reservedWin.close();
        } catch {
          // ignore
        }
      }
      setBillingSyncError(err?.message || 'Unable to verify password.');
    } finally {
      setBillingSyncBusy(false);
    }
  };

  const handleSendBillingOtp = async () => {
    if (!billingSyncModal?.email || billingSyncBusy) return;
    setBillingSyncBusy(true);
    setBillingSyncError('');
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(billingSyncModal.email, {
        redirectTo: `${window.location.origin}/profile`,
      });
      if (resetErr) throw resetErr;
      setBillingOtpSent(true);
      toast.success(`Verification email sent to ${billingSyncModal.email}. Enter the 6-digit code below.`);
    } catch (err) {
      setBillingSyncError(err?.message || 'Unable to send verification code email.');
    } finally {
      setBillingSyncBusy(false);
    }
  };

  const handleVerifyBillingOtp = async (e) => {
    e.preventDefault();
    if (!billingSyncModal?.email || !billingOtpCode.trim() || billingNewPassword.length < 6 || billingSyncBusy) return;

    setBillingSyncBusy(true);
    setBillingSyncError('');

    let reservedWin = null;
    if (billingSyncModal.mode === 'checkout') {
      try {
        reservedWin = window.open('about:blank', '_blank');
      } catch {
        reservedWin = null;
      }
    }

    try {
      const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
        email: billingSyncModal.email,
        token: billingOtpCode.trim(),
        type: 'recovery',
      });
      if (otpErr || !otpData?.session?.access_token) {
        throw new Error(otpErr?.message || 'Invalid or expired 6-digit verification code.');
      }

      const { data: updatedUser, error: updErr } = await supabase.auth.updateUser({
        password: billingNewPassword,
      });
      if (updErr) {
        throw new Error(updErr.message || 'Unable to set updated password.');
      }

      const vaultSyncRes = await fetch('/api/auth/sync-vault-after-otp', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otpData.session.access_token}`,
        },
        body: JSON.stringify({ newPassword: billingNewPassword }),
      });
      const vaultSyncData = await vaultSyncRes.json().catch(() => null);

      const finalSession = {
        ...otpData.session,
        user: updatedUser?.user || otpData.session.user,
      };
      await syncSupabaseSession?.(finalSession, null, vaultSyncData?.serverSessionToken || '');
      await finishAfterBillingSync(reservedWin);
    } catch (err) {
      if (reservedWin && !reservedWin.closed) {
        try {
          reservedWin.close();
        } catch {
          // ignore
        }
      }
      setBillingSyncError(err?.message || 'Unable to verify email code.');
    } finally {
      setBillingSyncBusy(false);
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

      {billingSyncModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-3xl border border-primary/35 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-foreground">
                    {billingSyncModal.mode === 'cancel'
                      ? 'Confirm Password to Cancel Plan'
                      : 'Authorize Stripe Checkout'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Signed in as <span className="font-semibold text-foreground">{billingSyncModal.email}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBillingSyncModal(null)}
                disabled={billingSyncBusy}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="Close billing authorization"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Your account is signed in locally, and Stripe Checkout needs to verify your cloud billing password once to connect your subscription.
            </p>

            {billingSyncError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {billingSyncError}
              </div>
            )}

            {billingSyncStep === 'password' ? (
              <form onSubmit={handleBillingPasswordSubmit} className="space-y-3">
                <Input
                  type="password"
                  placeholder="Enter your cloud account password"
                  value={billingPassword}
                  onChange={(e) => setBillingPassword(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                  className="h-11 rounded-xl bg-background/60"
                />
                <Button
                  type="submit"
                  disabled={billingSyncBusy || !billingPassword}
                  className="w-full h-11 rounded-xl font-heading font-semibold text-sm"
                >
                  {billingSyncBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying & Connecting…
                    </>
                  ) : billingSyncModal.mode === 'cancel' ? (
                    'Verify & Cancel Subscription'
                  ) : (
                    `Verify & Open ${billingSyncModal.plan?.name || ''} Checkout`
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setBillingSyncStep('otp');
                    setBillingSyncError('');
                  }}
                  className="w-full text-xs text-primary hover:underline text-center pt-1 font-medium"
                >
                  Used a local recovery password or forgot original password? Verify with email code
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                {!billingOtpSent ? (
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendBillingOtp}
                      disabled={billingSyncBusy}
                      className="w-full h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 border-primary/40"
                    >
                      {billingSyncBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 text-primary" />
                      )}
                      <span>Send 6-Digit Verification Code to {billingSyncModal.email}</span>
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyBillingOtp} className="space-y-3">
                    <Input
                      type="text"
                      placeholder="6-digit verification code from email"
                      value={billingOtpCode}
                      onChange={(e) => setBillingOtpCode(e.target.value)}
                      required
                      autoFocus
                      className="h-11 rounded-xl bg-background/60"
                    />
                    <Input
                      type="password"
                      placeholder="Set synced password (min 6 characters)"
                      value={billingNewPassword}
                      onChange={(e) => setBillingNewPassword(e.target.value)}
                      minLength={6}
                      required
                      className="h-11 rounded-xl bg-background/60"
                    />
                    <Button
                      type="submit"
                      disabled={billingSyncBusy || !billingOtpCode.trim() || billingNewPassword.length < 6}
                      className="w-full h-11 rounded-xl font-heading font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      {billingSyncBusy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Syncing & Opening Stripe…
                        </>
                      ) : (
                        <>
                          <KeyRound className="h-4 w-4" />
                          <span>Verify Code & Open Stripe Checkout</span>
                        </>
                      )}
                    </Button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setBillingSyncStep('password');
                    setBillingSyncError('');
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-center pt-1"
                >
                  Back to password verification
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
