import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';

import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import {
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  syncClientSessionSafely,
} from '@/lib/supabase';
import {
  resolveValidSupabaseSession,
  getStoredUserEmail,
  syncStripeSubscription,
  applyRecoveredSessionToStorage,
} from '@/lib/stripeCheckout';
import { queryClientInstance } from '@/lib/query-client';
import { invalidateCurrentUserCache } from '@/lib/supabaseApi';
import { getServerMessageStats } from '@/lib/messageLimit';
import { useAuth } from '@/lib/AuthContext';

import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

import {
  Button,
} from '@/components/ui/button';

import {
  PLAN_LABELS,
  applySubscriptionUpgrade,
  clearRecentUpgradeGrace,
  normalizePlan,
} from '@/lib/subscription';

const ACTIVE_SUB_STATUSES = ['active', 'trialing', 'past_due'];

function readCookieValue(name) {
  try {
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : '';
  } catch {
    return '';
  }
}

function clearPendingCheckoutArtifacts() {
  try {
    localStorage.removeItem('washek_pending_checkout_plan');
    sessionStorage.removeItem('washek_pending_checkout_plan');
    localStorage.removeItem('washek_pending_checkout_session_id');
    sessionStorage.removeItem('washek_pending_checkout_session_id');
    localStorage.removeItem('washek_pending_checkout_started_at');
    sessionStorage.removeItem('washek_pending_checkout_started_at');
    document.cookie = 'washek_pending_checkout_plan=; path=/; max-age=0;';
  } catch {
    // ignore storage cleanup errors
  }
}

export default function SubscriptionReturn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkUserAuth } = useAuth();
  const checkUserAuthRef = useRef(checkUserAuth);
  useEffect(() => {
    checkUserAuthRef.current = checkUserAuth;
  }, [checkUserAuth]);

  const [status, setStatus] = useState('loading');
  const [subStatus, setSubStatus] = useState('active');
  const [planName, setPlanName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [attemptCounter, setAttemptCounter] = useState(0);

  const cancelledRef = useRef(false);

  const handleRecheck = useCallback(() => {
    setErrorMessage('');
    setStatus('loading');
    setAttemptCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let redirectTimer = null;

    const verifyProfileSyncedInDb = async (uid, bearerToken = '') => {
      if (!uid || String(uid).startsWith('usr_')) return false;
      try {
        const { data: clientProf, error: profErr } = await supabase
          .from('profiles')
          .select('subscription_plan, subscription_status')
          .eq('id', uid)
          .maybeSingle();
        if (!profErr && clientProf) {
          const p = normalizePlan(clientProf.subscription_plan);
          const s = String(clientProf.subscription_status || '').toLowerCase().trim();
          if (p !== 'free' && ACTIVE_SUB_STATUSES.includes(s)) {
            return true;
          }
        }
      } catch {
        // try REST fallback below
      }
      try {
        const tok =
          bearerToken ||
          (() => {
            try {
              return localStorage.getItem('washek_auth_token') || '';
            } catch {
              return '';
            }
          })();
        if (tok && tok.split('.').length === 3) {
          const restRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=subscription_plan,subscription_status&limit=1`,
            {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${tok}`,
              },
            }
          );
          const rows = await restRes.json().catch(() => null);
          if (Array.isArray(rows) && rows[0]) {
            const p = normalizePlan(rows[0].subscription_plan);
            const s = String(rows[0].subscription_status || '').toLowerCase().trim();
            if (p !== 'free' && ACTIVE_SUB_STATUSES.includes(s)) {
              return true;
            }
          }
        }
      } catch {
        // ignore REST check failure
      }
      return false;
    };

    const completeSuccessFlow = async (
      confirmedPlan,
      confirmedStatus,
      syncOpts = {},
      identity = {}
    ) => {
      if (cancelledRef.current) return;
      const friendlyName =
        (PLAN_LABELS && PLAN_LABELS[confirmedPlan]) ||
        confirmedPlan.charAt(0).toUpperCase() + confirmedPlan.slice(1);
      setPlanName(friendlyName);
      setSubStatus(confirmedStatus);

      // Ensure top-level localStorage has an authenticated user before applying upgrade & navigating to /
      try {
        const existingRaw = localStorage.getItem('washek_user');
        if (!existingRaw && (identity?.userId || identity?.email)) {
          const recoveredProfile = {
            id: identity.userId || undefined,
            email: identity.email || '',
            subscription_plan: confirmedPlan,
            subscription_status: confirmedStatus,
            plan: confirmedPlan,
            tier: confirmedPlan,
            subscription_tier: confirmedPlan,
            onboarded: true,
          };
          localStorage.setItem('washek_user', JSON.stringify(recoveredProfile));
          window.dispatchEvent(
            new CustomEvent('washek_session_recovered', {
              detail: { session: { user: recoveredProfile }, profile: recoveredProfile },
            })
          );
        }
      } catch {
        // ignore storage hydration errors
      }

      clearPendingCheckoutArtifacts();
      invalidateCurrentUserCache();
      const effectiveSyncOpts = syncOpts?.dbConfirmed
        ? { ...syncOpts, dbConfirmed: true }
        : {
            persistReceipt: true,
            verifiedBy: syncOpts?.verifiedBy || 'stripe_redirect',
            ...syncOpts,
          };
      applySubscriptionUpgrade(confirmedPlan, confirmedStatus, {
        ...effectiveSyncOpts,
        syncServer: false,
      });

      const srvTok =
        identity?.serverSessionToken ||
        (() => {
          try {
            return localStorage.getItem('washek_srv_session') || '';
          } catch {
            return '';
          }
        })();

      // Notify Express server & Supabase Edge Function of confirmed redirect unlock (persists across Chrome iframe partition + updates Postgres via admin)
      try {
        await Promise.allSettled([
          Promise.race([
            fetch('/api/stripe/confirm-redirect', {
              method: 'POST',
              credentials: 'include',
              keepalive: true,
              headers: {
                'Content-Type': 'application/json',
                ...(srvTok ? { 'x-washek-server-session': srvTok } : {}),
              },
              body: JSON.stringify({
                plan: confirmedPlan,
                status: confirmedStatus,
                userId: identity?.userId || undefined,
                email: identity?.email || undefined,
                sessionId: identity?.sessionId || undefined,
                verifiedBy: effectiveSyncOpts.verifiedBy || 'stripe_redirect',
              }),
            }),
            new Promise((resolve) => window.setTimeout(resolve, 1500)),
          ]),
          Promise.race([
            supabase.functions.invoke('create-checkout-session', {
              body: {
                action: 'confirm_redirect',
                plan: confirmedPlan,
                status: confirmedStatus,
                user_id: identity?.userId || undefined,
                email: identity?.email || undefined,
              },
              headers: {
                Authorization: `Bearer ${supabaseAnonKey}`,
              },
            }),
            new Promise((resolve) => window.setTimeout(resolve, 1500)),
          ]),
        ]);
      } catch {
        // non-fatal
      }

      if (cancelledRef.current) return;

      // Display the Confirmation + Syncing screen cleanly right away
      setStatus('success');

      queryClientInstance.invalidateQueries();
      await Promise.allSettled([
        checkUserAuthRef.current?.(),
        getServerMessageStats(),
      ]);

      try {
        const bc = new BroadcastChannel('washek_subscription_sync');
        bc.postMessage({
          type: 'WASHEK_SUBSCRIPTION_SUCCESS',
          plan: confirmedPlan,
          status: confirmedStatus,
          timestamp: Date.now(),
        });
        bc.close();
      } catch {
        // ignore BroadcastChannel error
      }

      try {
        localStorage.setItem(
          'washek_subscription_success_event',
          JSON.stringify({
            plan: confirmedPlan,
            status: confirmedStatus,
            timestamp: Date.now(),
          })
        );
      } catch {
        // ignore storage error
      }

      if (cancelledRef.current) return;

      redirectTimer = window.setTimeout(() => {
        if (cancelledRef.current) return;
        navigate('/', { replace: true });
      }, 1800);
    };

    const verifyPaymentAndSync = async () => {
      clearRecentUpgradeGrace();

      const subscribedParam = searchParams.get('subscribed');
      const hasSubscribedParam = Boolean(
        subscribedParam !== null ||
          searchParams.get('checkout') === 'success' ||
          searchParams.has('session_id') ||
          searchParams.has('checkout_session_id')
      );

      let localHintedPlanRaw =
        searchParams.get('plan') ||
        searchParams.get('tier') ||
        (subscribedParam && !['true', '1', 'yes'].includes(subscribedParam.toLowerCase())
          ? subscribedParam
          : '') ||
        (() => {
          try {
            return (
              sessionStorage.getItem('washek_pending_checkout_plan') ||
              localStorage.getItem('washek_pending_checkout_plan') ||
              readCookieValue('washek_pending_checkout_plan') ||
              ''
            );
          } catch {
            return '';
          }
        })();

      let sessionId =
        searchParams.get('session_id') ||
        searchParams.get('checkout_session_id') ||
        (() => {
          try {
            return (
              sessionStorage.getItem('washek_pending_checkout_session_id') ||
              localStorage.getItem('washek_pending_checkout_session_id') ||
              ''
            );
          } catch {
            return '';
          }
        })();

      const initialStoredUser = (() => {
        try {
          const raw = localStorage.getItem('washek_user');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();

      // Fetch Express server pending checkout record (bridges Chrome AI Studio iframe storage partitioning)
      let pendingServer = null;
      try {
        const q = new URLSearchParams();
        if (initialStoredUser?.id) q.set('userId', String(initialStoredUser.id));
        if (initialStoredUser?.email) q.set('email', String(initialStoredUser.email));
        const pendingRes = await Promise.race([
          fetch(`/api/checkout/pending${q.toString() ? `?${q.toString()}` : ''}`, {
            credentials: 'include',
          }).then((r) => (r.ok ? r.json() : null)),
          new Promise((resolve) => window.setTimeout(() => resolve(null), 1200)),
        ]);
        if (pendingRes?.plan) {
          pendingServer = pendingRes;
        }
      } catch {
        // ignore server pending lookup error
      }

      if (pendingServer?.serverSessionToken) {
        try {
          if (!localStorage.getItem('washek_srv_session')) {
            localStorage.setItem('washek_srv_session', pendingServer.serverSessionToken);
          }
        } catch {
          // ignore
        }
      }

      if (!localHintedPlanRaw && pendingServer?.plan) {
        localHintedPlanRaw = pendingServer.plan;
      }
      if (!sessionId && pendingServer?.sessionId) {
        sessionId = pendingServer.sessionId;
      }

      const hintedPlan = normalizePlan(localHintedPlanRaw);
      if (hintedPlan !== 'free') {
        setPlanName(PLAN_LABELS[hintedPlan] || hintedPlan);
      }

      // Recover authenticated Supabase session before verifying / querying profiles
      let authUser = null;
      let recoveredAccessToken = '';
      try {
        const session = await resolveValidSupabaseSession(false);
        authUser = session?.user || null;
        recoveredAccessToken = session?.access_token || '';
      } catch {
        // Fallback if token recovery returned no user object directly
      }

      if (!authUser?.id) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          authUser = sessionData?.session?.user || null;
          recoveredAccessToken = sessionData?.session?.access_token || recoveredAccessToken;
          if (!authUser) {
            const { data: authData } = await supabase.auth.getUser();
            authUser = authData?.user || null;
          }
        } catch (authErr) {
          console.debug('[SubscriptionReturn] Auth lookup note:', authErr);
        }
      }

      // Cross-partition recovery: if user signed in inside iframe and returned top-level, recover via serverSessionToken / pending refresh token
      if (!authUser?.id && (pendingServer?.serverSessionToken || pendingServer?.email || pendingServer?.userId)) {
        try {
          const recRes = await fetch('/api/auth/refresh-supabase-session', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(pendingServer?.serverSessionToken
                ? { 'x-washek-server-session': pendingServer.serverSessionToken }
                : {}),
            },
            body: JSON.stringify({
              email: pendingServer?.email || initialStoredUser?.email || undefined,
              userId: pendingServer?.userId || initialStoredUser?.id || undefined,
              fromCheckout: true,
            }),
          });
          const recData = await recRes.json().catch(() => null);
          if (recRes.ok && recData?.session?.access_token) {
            await syncClientSessionSafely(recData.session);
            applyRecoveredSessionToStorage(
              recData.session,
              recData.profile || null,
              recData.serverSessionToken || pendingServer?.serverSessionToken || ''
            );
            authUser = recData.session.user || null;
            recoveredAccessToken = recData.session.access_token;
          } else if (pendingServer?.serverSessionToken) {
            try {
              localStorage.setItem('washek_srv_session', pendingServer.serverSessionToken);
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore cross-partition recovery note
        }
      }

      const storedUser = (() => {
        try {
          const raw = localStorage.getItem('washek_user');
          return raw ? JSON.parse(raw) : initialStoredUser;
        } catch {
          return initialStoredUser;
        }
      })();
      const resolvedEmail = (
        authUser?.email ||
        getStoredUserEmail() ||
        pendingServer?.email ||
        ''
      )
        .toLowerCase()
        .trim();
      const resolvedUserId =
        authUser?.id ||
        storedUser?.id ||
        storedUser?.uid ||
        pendingServer?.userId ||
        '';
      const resolvedSrvToken =
        pendingServer?.serverSessionToken ||
        (() => {
          try {
            return localStorage.getItem('washek_srv_session') || '';
          } catch {
            return '';
          }
        })();

      const identity = {
        userId: resolvedUserId,
        email: resolvedEmail,
        sessionId: sessionId || undefined,
        serverSessionToken: resolvedSrvToken || undefined,
      };

      // 1. If Stripe supplied a Checkout Session ID, verify directly via Edge Function or Express
      if (sessionId) {
        const edgeAuthToken =
          recoveredAccessToken && recoveredAccessToken.split('.').length === 3
            ? recoveredAccessToken
            : supabaseAnonKey;
        try {
          const { data: edgeVerify, error: edgeErr } = await supabase.functions.invoke(
            'create-checkout-session',
            {
              body: {
                action: 'verify_session',
                session_id: sessionId,
                ...(hintedPlan !== 'free' ? { plan: hintedPlan } : {}),
                ...(resolvedUserId ? { user_id: resolvedUserId } : {}),
                ...(resolvedEmail ? { email: resolvedEmail } : {}),
              },
              headers: {
                Authorization: `Bearer ${edgeAuthToken}`,
              },
            }
          );
          if (!edgeErr && edgeVerify?.verified) {
            const confirmedPlan = normalizePlan(edgeVerify.plan || hintedPlan);
            const confirmedStatus = String(edgeVerify.status || 'active').toLowerCase().trim();
            if (confirmedPlan !== 'free' && ACTIVE_SUB_STATUSES.includes(confirmedStatus)) {
              const dbSyncedNow = Boolean(edgeVerify.db_synced ?? true);
              await completeSuccessFlow(
                confirmedPlan,
                confirmedStatus,
                dbSyncedNow ? { dbConfirmed: true } : { persistReceipt: true, verifiedBy: 'stripe_edge_verify' },
                identity
              );
              return;
            }
          }
        } catch (edgeVerifyErr) {
          console.debug('[SubscriptionReturn] Edge session verification note:', edgeVerifyErr);
        }

        try {
          const verifyRes = await fetch('/api/stripe/verify-session', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(recoveredAccessToken ? { Authorization: `Bearer ${recoveredAccessToken}` } : {}),
              ...(resolvedSrvToken ? { 'x-washek-server-session': resolvedSrvToken } : {}),
            },
            body: JSON.stringify({
              sessionId,
              plan: hintedPlan !== 'free' ? hintedPlan : undefined,
              userId: resolvedUserId || undefined,
              email: resolvedEmail || undefined,
            }),
          });
          const verifyData = await verifyRes.json().catch(() => null);
          if (verifyRes.ok && verifyData?.verified) {
            const confirmedPlan = normalizePlan(verifyData.plan || hintedPlan);
            const confirmedStatus = String(verifyData.status || 'active').toLowerCase().trim();
            if (confirmedPlan !== 'free' && ACTIVE_SUB_STATUSES.includes(confirmedStatus)) {
              const dbSyncedNow =
                Boolean(verifyData?.dbSynced) ||
                (await verifyProfileSyncedInDb(resolvedUserId, recoveredAccessToken));
              await completeSuccessFlow(
                confirmedPlan,
                confirmedStatus,
                dbSyncedNow
                  ? { dbConfirmed: true }
                  : { persistReceipt: true, verifiedBy: 'stripe_verify_session' },
                identity
              );
              return;
            }
          }
        } catch (txErr) {
          console.debug('[SubscriptionReturn] Direct Stripe session verification note:', txErr);
        }
      }

      // 2. Direct Stripe Customer & Subscription reconciliation (handles Payment Links too)
      try {
        const directSync = await syncStripeSubscription({
          planKey: hintedPlan !== 'free' ? hintedPlan : '',
        });
        if (directSync?.verified) {
          const confirmedPlan = normalizePlan(directSync.plan || hintedPlan);
          const confirmedStatus = String(directSync.status || 'active').toLowerCase().trim();
          if (confirmedPlan !== 'free' && ACTIVE_SUB_STATUSES.includes(confirmedStatus)) {
            const dbSyncedNow =
              Boolean(directSync?.dbSynced) ||
              (await verifyProfileSyncedInDb(resolvedUserId, recoveredAccessToken));
            await completeSuccessFlow(
              confirmedPlan,
              confirmedStatus,
              dbSyncedNow
                ? { dbConfirmed: true }
                : { persistReceipt: true, verifiedBy: 'stripe_sync' },
              identity
            );
            return;
          }
        }
      } catch (syncErr) {
        console.debug('[SubscriptionReturn] Stripe customer sync note:', syncErr);
      }

      // 3. Quick check against Postgres profiles table (in case webhook updated it right on redirect)
      if (authUser?.id) {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (cancelledRef.current) return;
          try {
            let dbProf = null;
            const { data: clientProf, error: profErr } = await supabase
              .from('profiles')
              .select('subscription_plan, subscription_status')
              .eq('id', authUser.id)
              .maybeSingle();

            if (!profErr && clientProf) {
              dbProf = clientProf;
            } else {
              const bearer =
                recoveredAccessToken ||
                (() => {
                  try {
                    return localStorage.getItem('washek_auth_token') || '';
                  } catch {
                    return '';
                  }
                })();
              if (bearer && bearer.split('.').length === 3) {
                const restRes = await fetch(
                  `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=subscription_plan,subscription_status&limit=1`,
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
              const dbPlan = normalizePlan(dbProf.subscription_plan);
              const dbStatus = String(dbProf.subscription_status || '').toLowerCase().trim();
              if (dbPlan !== 'free' && ACTIVE_SUB_STATUSES.includes(dbStatus)) {
                await completeSuccessFlow(dbPlan, dbStatus, { dbConfirmed: true }, identity);
                return;
              }
            }
          } catch {
            // continue brief check
          }

          if (attempt < 1) {
            await new Promise((r) => window.setTimeout(r, 600));
          }
        }
      }

      if (cancelledRef.current) return;

      // 4. Redirect confirmation: Stripe only redirects to the after-payment URL once checkout/trial completes.
      // Unlock the plan they were subscribing to across the entire app while syncing continues in background.
      if (hintedPlan !== 'free' || Boolean(sessionId) || hasSubscribedParam || Boolean(pendingServer?.plan)) {
        const unlockedPlan =
          hintedPlan !== 'free'
            ? hintedPlan
            : pendingServer?.plan
              ? normalizePlan(pendingServer.plan)
              : 'progress';
        const hasUsedTrial = Boolean(
          storedUser?.has_used_trial ||
            storedUser?.trial_used ||
            localStorage.getItem('washek_has_used_trial') === 'true'
        );
        const trialParam = searchParams.get('trial');
        const unlockedStatus =
          trialParam === 'true'
            ? 'trialing'
            : trialParam === 'false'
              ? 'active'
              : pendingServer?.trial === true
                ? 'trialing'
                : pendingServer?.trial === false
                  ? 'active'
                  : hasUsedTrial
                    ? 'active'
                    : 'trialing';

        await completeSuccessFlow(
          unlockedPlan,
          unlockedStatus,
          {
            persistReceipt: true,
            verifiedBy: 'stripe_redirect',
          },
          identity
        );
        return;
      }

      clearPendingCheckoutArtifacts();
      setStatus('error');
      setErrorMessage(
        'No pending or active Stripe checkout was found for this redirect. Please select a plan from your Profile to subscribe.'
      );
    };

    verifyPaymentAndSync();

    return () => {
      cancelledRef.current = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [searchParams, attemptCounter, navigate]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center">
        <div className="space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-lg shadow-primary/15 relative">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl animate-pulse -z-10" />
          </div>

          <h1 className="font-heading font-extrabold text-2xl tracking-tight text-foreground">
            Syncing your plan…
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Payment successful — activating your WASHEK {planName || ''} plan across your account…
          </p>

          <div className="flex items-center justify-center gap-2 text-primary font-heading font-bold text-sm pt-2">
            <Zap className="w-4 h-4 fill-primary/30" />
            <span>WASHEK {planName || 'Billing'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    const isTrial = subStatus === 'trialing';

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center">
        <div className="space-y-5 max-w-sm w-full">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/15 relative">
            <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            <div className="absolute inset-0 rounded-3xl bg-emerald-500/20 blur-xl -z-10" />
          </div>

          <div className="space-y-2">
            <h1 className="font-heading font-extrabold text-2xl tracking-tight text-foreground">
              {isTrial ? `7-Day Free Trial Activated!` : `Payment Successful · ${planName}`}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTrial
                ? `Success! Your ${planName} plan is synced and all features are unlocked for your 7-day trial ($0 today).`
                : `Success! Your ${planName} plan is synced and all features are unlocked across WASHEK.`}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-card border border-border/80 flex items-center justify-between text-left shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase font-semibold">Current Plan</p>
                <p className="text-sm font-heading font-bold text-foreground">{planName} Tier</p>
              </div>
            </div>
            <span className="text-[11px] font-heading font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              {isTrial ? '7-Day Trial Active' : 'Active & Unlocked'}
            </span>
          </div>

          <div className="pt-2">
            <Button
              className="w-full font-heading font-bold h-11"
              onClick={() => navigate('/', { replace: true })}
            >
              Enter WASHEK Dashboard
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span>Syncing across your account and redirecting…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center">
      <div className="space-y-4 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7 text-destructive" />
        </div>

        <h1 className="font-heading font-bold text-2xl tracking-tight">
          Payment Not Confirmed Yet
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {errorMessage || 'No active Stripe payment was confirmed for your account. Your current plan remains unchanged.'}
        </p>

        <div className="pt-2 space-y-2">
          <Button
            variant="default"
            className="w-full text-xs font-semibold gap-1.5"
            onClick={handleRecheck}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-check Payment Status
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => navigate('/profile', { replace: true })}
            >
              Return to Profile
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => navigate('/', { replace: true })}
            >
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
