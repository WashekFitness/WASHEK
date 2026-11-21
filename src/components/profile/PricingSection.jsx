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

import {
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  readNativeSupabaseStorageSession,
} from '@/lib/supabase';
import {
  applySubscriptionUpgrade,
  applySubscriptionCancellation,
  clearRecentUpgradeGrace,
  getRedirectUpgradeReceipt,
  clearRedirectUpgradeReceipt,
} from '@/lib/subscription';
import {
  STRIPE_TIERS,
  STRIPE_DEFAULT_PRICES,
  getTierKey,
} from '@/lib/stripeTiers';
import {
  fetchStripeTierPrices,
  startStripeCheckout,
  syncStripeSubscription,
  resolveValidSupabaseSession,
  extractInvokeErrorMessage,
  isNonJwtToken,
  fetchServerEntitlement,
  clearPendingCheckoutOnServer,
} from '@/lib/stripeCheckout';
import { queryClientInstance } from '@/lib/query-client';
import { invalidateCurrentUserCache } from '@/lib/supabaseApi';
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

const TIER_VISUALS = {
  progress: {
    period: '/mo',
    icon: Flame,
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/40 hover:border-emerald-500/70',
    bgColor: 'bg-gradient-to-b from-emerald-500/[0.08] via-card to-card',
    glowClass: 'shadow-[0_0_25px_rgba(16,185,129,0.12)]',
    iconGlow: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
    badge: null,
    badgeClass: null,
    buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white font-heading font-semibold shadow-sm transition-colors',
  },
  performance: {
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
    disclaimer:
      '* Body composition estimates are approximations only and may not be fully accurate.',
  },
  elite: {
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
  },
};

const plans = STRIPE_TIERS.map((tier) => {
  const planKey = getTierKey(tier.name);
  const visuals = TIER_VISUALS[planKey] || TIER_VISUALS.progress;
  return {
    name: tier.name,
    planKey,
    description: tier.description,
    priceId: tier.priceId,
    defaultPrice: tier.defaultPrice,
    features: tier.features,
    ...visuals,
  };
});

const PAID_PLANS = [
  'progress',
  'performance',
  'elite',
];

const ACTIVE_STATUSES = [
  'active',
  'trialing',
  'past_due',
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
  const { user, checkUserAuth, syncSupabaseSession } = useAuth();
  const onPlanChangeRef = useRef(onPlanChange);
  useEffect(() => {
    onPlanChangeRef.current = onPlanChange;
  }, [onPlanChange]);

  const currentPlanPropRef = useRef(currentPlanProp);
  useEffect(() => {
    currentPlanPropRef.current = currentPlanProp;
  }, [currentPlanProp]);

  const hasLoadedOnceRef = useRef(false);
  const lastLoadAtRef = useRef(0);

  const [loadingPlan, setLoadingPlan] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(() => {
    try {
      const storedStatus = String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
      const isActive = isActiveStatus(storedStatus);
      if (!isActive) {
        return 'free';
      }
      if (currentPlanProp && currentPlanProp !== 'free' && isActive) {
        return normalizePlan(currentPlanProp);
      }
      const stored = localStorage.getItem('washek_subscription_plan');
      if (stored && stored !== 'free') return normalizePlan(stored);
      const userObj = JSON.parse(localStorage.getItem('washek_user') || '{}');
      const userStatus = String(userObj?.subscription_status || '').toLowerCase().trim();
      if (
        isActiveStatus(userStatus) &&
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

  const currentPlanRef = useRef(currentPlan);
  useEffect(() => {
    currentPlanRef.current = currentPlan;
  }, [currentPlan]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('washek_just_canceled') === '1') {
        sessionStorage.removeItem('washek_just_canceled');
      }
      if (typeof window !== 'undefined' && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('checkout') === 'canceled') {
          localStorage.removeItem('washek_pending_checkout_plan');
          sessionStorage.removeItem('washek_pending_checkout_plan');
          localStorage.removeItem('washek_pending_checkout_session_id');
          sessionStorage.removeItem('washek_pending_checkout_session_id');
          localStorage.removeItem('washek_pending_checkout_started_at');
          sessionStorage.removeItem('washek_pending_checkout_started_at');
          document.cookie = 'washek_pending_checkout_plan=; path=/; max-age=0;';
          clearPendingCheckoutOnServer(user?.id, user?.email);
          params.delete('checkout');
          const nextSearch = params.toString();
          const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
          window.history.replaceState({}, '', nextUrl);
        }
      }
    } catch {
      // ignore storage/URL cleanup error
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    if (!hasLoadedOnceRef.current && currentPlanProp) {
      const safe = normalizePlan(currentPlanProp);
      setCurrentPlan(safe);
    }
  }, [currentPlanProp]);

  const [subscription, setSubscription] = useState(null);
  const [error, setError] = useState('');
  const [cardError, setCardError] = useState(null); // { planKey, message, needsReauth }
  const [localizedPrices, setLocalizedPrices] = useState(() => ({ ...STRIPE_DEFAULT_PRICES }));
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const checkoutPollTimerRef = useRef(null);
  const lastSyncEventRef = useRef(0);
  const autoSyncAttemptedRef = useRef(false);

  useEffect(() => {
    let active = true;

    fetchStripeTierPrices()
      .then((res) => {
        if (!active) return;
        if (res?.pricesByTier) {
          setLocalizedPrices(res.pricesByTier);
        }
      })
      .catch(() => {
        // Keep canonical Stripe tier prices on transient network error
      });

    return () => {
      active = false;
    };
  }, []);

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
    if (!hasLoadedOnceRef.current) {
      setLoadingSubscription(true);
    }
    lastLoadAtRef.current = Date.now();

    try {
      clearRecentUpgradeGrace();

      // 1. Check LocalStorage plan strictly for offline fallback
      const storedStatusRaw = (() => {
        try {
          return String(localStorage.getItem('washek_subscription_status') || '').toLowerCase().trim();
        } catch {
          return '';
        }
      })();
      const isLocallyInactive =
        !isActiveStatus(storedStatusRaw);

      const localPlanRaw = (() => {
        if (isLocallyInactive) return null;
        try {
          const p = localStorage.getItem('washek_subscription_plan');
          return p && p !== 'free' ? normalizePlan(p) : null;
        } catch {
          return null;
        }
      })();

      // 2. Query authoritative Supabase profile row (with Bearer REST fallback)
      let hasRemoteProfile = false;
      let profilePlan = 'free';
      let profileStatus = '';
      let profileSubId = null;
      let profilePriceId = null;
      let profileCancelledAt = null;
      let resolvedAuthEmail = user?.email || storedUser?.email || '';
      let effectiveUid = '';

      try {
        const storedTok = (() => {
          try {
            return localStorage.getItem('washek_auth_token') || '';
          } catch {
            return '';
          }
        })();
        const storedUid = (() => {
          try {
            const u = JSON.parse(localStorage.getItem('washek_user') || '{}');
            return u?.id && !String(u.id).startsWith('usr_') ? u.id : '';
          } catch {
            return '';
          }
        })();

        const { data: sessionData } = await supabase.auth.getSession();
        const authUid = sessionData?.session?.user?.id || '';
        if (sessionData?.session?.user?.email) {
          resolvedAuthEmail = sessionData.session.user.email;
        }
        const sessionToken = sessionData?.session?.access_token || '';
        const bearer = !isNonJwtToken(sessionToken) ? sessionToken : !isNonJwtToken(storedTok) ? storedTok : '';
        effectiveUid = authUid && !String(authUid).startsWith('usr_') ? authUid : storedUid;
        let dbProf = null;

        if (bearer && effectiveUid) {
          if (authUid && !isNonJwtToken(sessionToken)) {
            const { data: profile, error: profErr } = await supabase
              .from('profiles')
              .select('subscription_plan, subscription_status, stripe_subscription_id, stripe_price_id, subscription_cancelled_at')
              .eq('id', authUid)
              .maybeSingle();

            if (!profErr && profile) {
              dbProf = profile;
            } else if (profErr) {
              const { data: baseProfile, error: baseErr } = await supabase
                .from('profiles')
                .select('subscription_plan, subscription_status')
                .eq('id', authUid)
                .maybeSingle();
              if (!baseErr && baseProfile) {
                dbProf = baseProfile;
              }
            }
          }

          if (!dbProf) {
            const restRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(effectiveUid)}&select=subscription_plan,subscription_status,subscription_cancelled_at&limit=1`,
              {
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${bearer}`,
                },
              }
            );
            const rows = await restRes.json().catch(() => null);
            if (Array.isArray(rows) && rows[0]) {
              dbProf = rows[0];
            }
          }
        }

        if (dbProf) {
          hasRemoteProfile = true;
          profilePlan = normalizePlan(dbProf.subscription_plan);
          profileStatus = String(dbProf.subscription_status || '').toLowerCase().trim();
          profileSubId = dbProf.stripe_subscription_id || null;
          profilePriceId = dbProf.stripe_price_id || null;
          profileCancelledAt = dbProf.subscription_cancelled_at || null;
        }
      } catch (sbErr) {
        console.debug('[PricingSection] Supabase profile lookup note:', sbErr);
      }

      // 3. Check stored user object fallback (only used when offline or transient profile miss)
      let userObjPlan = null;
      let userObjStatus = '';
      if (!isLocallyInactive) {
        try {
          const u = JSON.parse(localStorage.getItem('washek_user') || '{}');
          const uStatus = String(u?.subscription_status || '').toLowerCase().trim();
          if (isActiveStatus(uStatus) && u?.subscription_plan) {
            userObjPlan = normalizePlan(u.subscription_plan);
            userObjStatus = uStatus;
          }
        } catch {
          /* ignore */
        }
      }

      let redirectReceipt = getRedirectUpgradeReceipt(
        hasRemoteProfile
          ? {
              subscription_plan: profilePlan,
              subscription_status: profileStatus,
              subscription_cancelled_at: profileCancelledAt,
            }
          : null
      );

      let resolvedPlan = 'free';
      let resolvedStatus = 'inactive';

      const dbActive = hasRemoteProfile && profilePlan !== 'free' && isActiveStatus(profileStatus);

      if (!redirectReceipt) {
        try {
          const serverEnt = await fetchServerEntitlement({
            userId: effectiveUid || user?.id || storedUser?.id || '',
            email: resolvedAuthEmail || '',
            cancelledAtIso: profileCancelledAt,
          });
          if (serverEnt?.active) {
            redirectReceipt = {
              plan: normalizePlan(serverEnt.plan),
              status: serverEnt.status,
              timestamp: serverEnt.timestamp,
              verifiedBy: serverEnt.verifiedBy,
            };
          }
        } catch {
          // ignore server entitlement note
        }
      }

      const redirectRank = redirectReceipt ? (TIER_LEVELS[normalizePlan(redirectReceipt.plan)] || 0) : 0;
      const dbRank = dbActive ? (TIER_LEVELS[profilePlan] || 0) : 0;

      if (redirectReceipt && redirectRank > 0 && (!dbActive || redirectRank > dbRank)) {
        resolvedPlan = normalizePlan(redirectReceipt.plan);
        resolvedStatus = redirectReceipt.status || 'active';
      } else if (dbActive) {
        if (redirectReceipt && profilePlan === normalizePlan(redirectReceipt.plan)) {
          clearRedirectUpgradeReceipt();
        }
        resolvedPlan = profilePlan;
        resolvedStatus = profileStatus || 'active';
      } else if (hasRemoteProfile) {
        // Authoritative remote DB confirms user is free / canceled / inactive
        resolvedPlan = 'free';
        resolvedStatus = profileStatus || 'inactive';
      } else if (!isLocallyInactive && (localPlanRaw || userObjPlan)) {
        // Transient profile miss (e.g., session hydrating): preserve cached paid plan rather than flashing Free
        resolvedPlan = localPlanRaw || userObjPlan || 'free';
        resolvedStatus = storedStatusRaw || userObjStatus || 'active';
      }

      hasLoadedOnceRef.current = true;

      if (resolvedPlan !== 'free') {
        setSubscription({
          id: profileSubId || `sub_${resolvedPlan}`,
          plan: resolvedPlan,
          plan_key: resolvedPlan,
          status: resolvedStatus,
          stripe_price_id: profilePriceId,
        });
        if (localPlanRaw !== resolvedPlan || redirectReceipt) {
          applySubscriptionUpgrade(resolvedPlan, resolvedStatus, {
            ...(dbActive ? { dbConfirmed: true } : redirectReceipt ? { persistReceipt: true } : {}),
            syncServer: false,
          });
        }
      } else {
        setSubscription(null);
        // Only overwrite localStorage cache when remote profile authoritatively returned free/canceled
        if (hasRemoteProfile) {
          try {
            localStorage.removeItem('washek_subscription_plan');
            if (resolvedStatus) {
              localStorage.setItem('washek_subscription_status', resolvedStatus);
            }
            const rawUser = localStorage.getItem('washek_user');
            if (rawUser) {
              const parsedUser = JSON.parse(rawUser);
              if (parsedUser && typeof parsedUser === 'object' && parsedUser.subscription_plan !== 'free') {
                parsedUser.subscription_plan = 'free';
                parsedUser.plan = 'free';
                parsedUser.tier = 'free';
                parsedUser.subscription_tier = 'free';
                parsedUser.subscription_status = resolvedStatus || 'inactive';
                localStorage.setItem('washek_user', JSON.stringify(parsedUser));
              }
            }
          } catch {
            // ignore storage errors
          }
        }
      }

      const prevPlan = currentPlanRef.current;
      currentPlanRef.current = resolvedPlan;
      setCurrentPlan(resolvedPlan);

      if (prevPlan !== resolvedPlan || resolvedPlan !== normalizePlan(currentPlanPropRef.current)) {
        onPlanChangeRef.current?.(resolvedPlan);
        invalidateCurrentUserCache();
        checkUserAuth?.().catch(() => {});
      }

      // Only background-reconcile Postgres with Stripe if user has a redirect receipt awaiting DB confirmation —
      // NEVER scrape Stripe passively for a normal Free user (prevents premature upgrades before subscribing).
      if (
        redirectReceipt &&
        !dbActive &&
        !autoSyncAttemptedRef.current &&
        typeof navigator !== 'undefined' &&
        navigator.onLine !== false
      ) {
        autoSyncAttemptedRef.current = true;
        syncStripeSubscription({ planKey: redirectReceipt.plan })
          .then((syncRes) => {
            if (syncRes?.verified && syncRes.plan && syncRes.plan !== 'free') {
              const verifiedPlan = normalizePlan(syncRes.plan);
              const verifiedStatus = String(syncRes.status || 'active').toLowerCase().trim();
              applySubscriptionUpgrade(verifiedPlan, verifiedStatus, {
                ...(syncRes.dbSynced ? { dbConfirmed: true } : { persistReceipt: true }),
                syncServer: false,
              });
              currentPlanRef.current = verifiedPlan;
              setCurrentPlan(verifiedPlan);
              setSubscription({
                id: syncRes.subscriptionId || `sub_${verifiedPlan}`,
                plan: verifiedPlan,
                plan_key: verifiedPlan,
                status: verifiedStatus,
              });
              onPlanChangeRef.current?.(verifiedPlan);
              invalidateCurrentUserCache();
              checkUserAuth?.().catch(() => {});
            }
          })
          .catch(() => {});
      }
    } catch (loadError) {
      console.error('[PricingSection] Failed to load subscription:', loadError);
      hasLoadedOnceRef.current = true;
    } finally {
      setLoadingSubscription(false);
    }
  }, [checkUserAuth, user?.id, user?.email, storedUser?.id, storedUser?.email]);

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

        if (!profErr && profile) {
          const dbPlan = normalizePlan(profile.subscription_plan);
          const dbStatus = String(profile.subscription_status || '').toLowerCase().trim();
          if (dbPlan !== 'free' && isActiveStatus(dbStatus)) {
            if (checkoutPollTimerRef.current) {
              clearInterval(checkoutPollTimerRef.current);
              checkoutPollTimerRef.current = null;
            }
            applySubscriptionUpgrade(dbPlan, dbStatus, { dbConfirmed: true, syncServer: false });
            setCurrentPlan(dbPlan);
            onPlanChangeRef.current?.(dbPlan);
            await checkUserAuth?.().catch(() => {});
          }
        }
        await loadSubscription();
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
      if (!active) return;
      if (!checkoutPollTimerRef.current && Date.now() - lastLoadAtRef.current < 15000) return;
      loadSubscription();
    };

    const handlePageShow = () => {
      if (!active) return;
      setLoadingPlan(null);
      loadSubscription();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    const handleVisChange = () => {
      if (document.visibilityState === 'visible' && active) {
        handleFocus();
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        window.setTimeout(() => {
          if (active) {
            loadSubscription();
          }
        }, 0);
      }
    });

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisChange);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadSubscription]);

  const handleCheckout = async (plan) => {
    if (!plan?.planKey || loadingPlan) {
      return;
    }

    if (currentPlan === plan.planKey && isActiveStatus(subscription?.status)) {
      return;
    }

    setLoadingPlan(plan.planKey);
    setError('');
    setCardError(null);

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

      const result = await startStripeCheckout({
        planKey: plan.planKey,
        email: userEmail,
        userId,
      });

      if (result?.action === 'already_active') {
        await checkUserAuth?.().catch(() => {});
        await loadSubscription();
        setLoadingPlan(null);
      }
    } catch (checkoutError) {
      const msg = checkoutError?.message || 'Unable to open Stripe Checkout.';
      console.error('[PricingSection] Stripe checkout failed:', checkoutError);
      setError(msg);
      setCardError({ planKey: plan.planKey, message: msg });
      toast.error(msg);
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
      const latestStoredUser = (() => {
        try {
          return JSON.parse(localStorage.getItem('washek_user') || '{}');
        } catch {
          return storedUser || {};
        }
      })();
      const nativeSess = readNativeSupabaseStorageSession();
      const storedTok = localStorage.getItem('washek_auth_token') || '';
      let freshToken = !isNonJwtToken(storedTok)
        ? storedTok
        : !isNonJwtToken(nativeSess?.access_token)
          ? nativeSess.access_token
          : storedTok;
      const refreshTok =
        localStorage.getItem('washek_refresh_token') ||
        nativeSess?.refresh_token ||
        '';
      const srvTok = localStorage.getItem('washek_srv_session') || '';
      const hasJwtOrRefresh = !isNonJwtToken(freshToken) || Boolean(refreshTok);

      // 1. Try obtaining a client Supabase JWT session if available (skip futile attempts for pure local vault sessions)
      let session = null;
      if (hasJwtOrRefresh) {
        try {
          session = await resolveValidSupabaseSession(false);
          if (session?.access_token) {
            freshToken = session.access_token;
          }
        } catch {
          session = null;
        }
      }

      const currentUserId =
        session?.user?.id ||
        user?.id ||
        latestStoredUser?.id ||
        latestStoredUser?.uid ||
        null;
      const currentUserEmail =
        session?.user?.email ||
        user?.email ||
        latestStoredUser?.email ||
        null;
      const cancelPayload = {
        userId: currentUserId || undefined,
        email: currentUserEmail || undefined,
      };

      const invokeCancelEdge = (activeSession) =>
        supabase.functions.invoke('cancel-subscription', {
          body: cancelPayload,
          headers: {
            Authorization: `Bearer ${activeSession.access_token}`,
          },
        });

      const looksLikeAuthFailure = (msg) =>
        /(^|\b)(401|unauthorized|jwt|missing authorization|invalid claim|invalid token|not authenticated|signed in)(\b|$)/i.test(
          String(msg || '')
        );

      let canceledConfirmed = false;
      let detailedMessage = '';
      let confirmedCancelProfile = null;
      let data = null;

      // 2. Invoke Supabase cancel-subscription Edge Function first when JWT exists (has Stripe Secret Key)
      if (!canceledConfirmed && session?.access_token && !isNonJwtToken(session.access_token)) {
        try {
          let invokeError = null;
          ({ data, error: invokeError } = await invokeCancelEdge(session));
          detailedMessage = invokeError ? await extractInvokeErrorMessage(invokeError) : '';

          if (
            (invokeError && (looksLikeAuthFailure(invokeError.message) || looksLikeAuthFailure(detailedMessage))) ||
            (data?.success === false && looksLikeAuthFailure(data?.error))
          ) {
            try {
              session = await resolveValidSupabaseSession(true);
              if (session?.access_token) {
                freshToken = session.access_token;
                ({ data, error: invokeError } = await invokeCancelEdge(session));
                detailedMessage = invokeError ? await extractInvokeErrorMessage(invokeError) : '';
              }
            } catch {
              // ignore refresh failure
            }
          }

          if (!invokeError && data?.success !== false) {
            canceledConfirmed = true;
            confirmedCancelProfile = data?.user || null;
          } else if (data?.error && !detailedMessage) {
            detailedMessage = data.error;
          }
        } catch (edgeErr) {
          console.debug('[PricingSection] Supabase cancel-subscription edge note:', edgeErr);
        }
      }

      // 3. Fallback to Express /api/cancel-subscription endpoint (cancels via Stripe API or clears local/vault state)
      if (!canceledConfirmed) {
        try {
          const proxyRes = await fetch('/api/cancel-subscription', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
              ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
            },
            body: JSON.stringify({
              ...cancelPayload,
              subscriptionId: subscription?.id || undefined,
              refreshToken: refreshTok || undefined,
            }),
          });
          const proxyData = await proxyRes.json().catch(() => null);

          if (proxyData?.refreshedSession?.access_token) {
            freshToken = proxyData.refreshedSession.access_token;
            await syncSupabaseSession?.(proxyData.refreshedSession).catch(() => {});
          }

          if (proxyRes.ok && proxyData?.success) {
            canceledConfirmed = true;
            confirmedCancelProfile = proxyData?.user || null;
          } else if (proxyData?.error) {
            detailedMessage = proxyData.error;
          }
        } catch (proxyErr) {
          console.debug('[PricingSection] Stripe cancel note:', proxyErr);
        }
      }

      if (!canceledConfirmed) {
        throw new Error(
          detailedMessage ||
            data?.error ||
            'Unable to cancel your subscription right now. Please try again.'
        );
      }

      // 4. Verify Postgres profile no longer shows an active paid plan (when backed by Supabase UUID)
      let verifiedFreeViaCancelResponse = false;
      if (confirmedCancelProfile) {
        const respPlan = normalizePlan(confirmedCancelProfile.subscription_plan);
        const respStatus = String(confirmedCancelProfile.subscription_status || '').toLowerCase().trim();
        if (respPlan === 'free' || !isActiveStatus(respStatus)) {
          verifiedFreeViaCancelResponse = true;
        }
      }

      const verifyUid =
        confirmedCancelProfile?.id ||
        (currentUserId && !String(currentUserId).startsWith('usr_') ? currentUserId : null);

      if (!verifiedFreeViaCancelResponse && verifyUid && !isNonJwtToken(freshToken)) {
        try {
          let verifyProf = null;
          const { data: clientProf, error: verifyErr } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status')
            .eq('id', verifyUid)
            .maybeSingle();

          if (!verifyErr && clientProf) {
            verifyProf = clientProf;
          } else {
            const restRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(verifyUid)}&select=subscription_plan,subscription_status&limit=1`,
              {
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${freshToken}`,
                },
              }
            );
            const rows = await restRes.json().catch(() => null);
            if (Array.isArray(rows) && rows[0]) {
              verifyProf = rows[0];
            }
          }

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

      // 5. Clear all local/session/query/user caches and reload cleanly onto Free Plan
      invalidateCurrentUserCache();
      applySubscriptionCancellation();
      setCurrentPlan('free');
      setSubscription(null);
      setShowCancelConfirm(false);
      onPlanChangeRef.current?.('free');
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

        const localizedPrice = localizedPrices[plan.planKey]?.formattedTotal || plan.defaultPrice || null;
        const displayPrice = localizedPrice || '—';

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
                    {plan.description}
                  </span>
                </div>
              </div>

              {/* Price: Cleanly isolated on right with zero overlapping badges */}
              <div className="text-right shrink-0">
                <div className="flex items-baseline justify-end gap-0.5">
                  <span className={`font-heading font-black text-2xl sm:text-3xl ${plan.color} tracking-tight`}>
                    {displayPrice}
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
            ) : currentPlan !== 'free' ? (
              <div className="space-y-2">
                <Button
                  className="w-full h-11 rounded-xl font-heading font-semibold text-xs tracking-wide bg-muted text-muted-foreground opacity-60 cursor-not-allowed border border-border/60"
                  disabled={true}
                >
                  Cancel Current Plan First
                </Button>
                <p className="text-[11px] text-center text-amber-400 font-medium leading-relaxed">
                  You have an active subscription. Please cancel your current plan below before changing plans to prevent double billing.
                </p>
              </div>
            ) : isIncludedInHigherTier ? (
              <div className="w-full h-11 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-center font-heading font-medium text-xs text-muted-foreground tracking-wider uppercase">
                Included with your {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  className={`w-full h-11 rounded-xl font-heading font-semibold text-sm tracking-wide ${plan.buttonClass}`}
                  onClick={() => handleCheckout(plan)}
                  disabled={!!loadingPlan || loadingPrices}
                >
                  {loadingPlan === plan.planKey ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Opening Stripe Checkout…
                    </>
                  ) : (
                    `Subscribe to ${plan.name}`
                  )}
                </Button>
                {cardError?.planKey === plan.planKey && cardError?.message && (
                  <p className="text-[11px] text-destructive font-medium text-center">
                    {cardError.message}
                  </p>
                )}
                <p className="text-[11px] text-center text-muted-foreground font-medium">
                  {localizedPrice
                    ? hasUsedTrial
                      ? `${localizedPrice}/mo · Cancel anytime`
                      : `7-day free trial ($0 today), then ${localizedPrice}/mo · Cancel anytime`
                    : loadingPrices
                      ? 'Loading localized price…'
                      : 'Cancel anytime'}
                </p>
              </div>
            )}
          </Card>
        );
      })}

      {currentPlan !== 'free' && (
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
