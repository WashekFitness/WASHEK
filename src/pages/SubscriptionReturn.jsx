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
} from '@/lib/supabase';
import { resolveValidSupabaseSession } from '@/lib/stripeCheckout';
import { queryClientInstance } from '@/lib/query-client';

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

function clearPendingCheckoutArtifacts() {
  try {
    localStorage.removeItem('washek_pending_checkout_plan');
    sessionStorage.removeItem('washek_pending_checkout_plan');
    document.cookie = 'washek_pending_checkout_plan=; path=/; max-age=0;';
  } catch {
    // ignore storage cleanup errors
  }
}

export default function SubscriptionReturn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
    let closeFallbackTimer = null;

    let openerCleanup = null;

    const completeSuccessFlow = (confirmedPlan, confirmedStatus) => {
      if (cancelledRef.current) return;
      const friendlyName =
        (PLAN_LABELS && PLAN_LABELS[confirmedPlan]) ||
        confirmedPlan.charAt(0).toUpperCase() + confirmedPlan.slice(1);
      setPlanName(friendlyName);
      setSubStatus(confirmedStatus);

      // Sync verified DB subscription locally and invalidate queries
      applySubscriptionUpgrade(confirmedPlan, confirmedStatus, {
        syncServer: false,
      });
      queryClientInstance.invalidateQueries();

      // Notify open tabs to refresh from Postgres
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: 'WASHEK_SUBSCRIPTION_SUCCESS',
              plan: confirmedPlan,
              status: confirmedStatus,
            },
            '*'
          );
        }
      } catch {
        // ignore cross-origin error
      }

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

      setStatus('success');

      const redirectUrl = '/';
      redirectTimer = window.setTimeout(() => {
        if (cancelledRef.current) return;
        if (window.opener && !window.opener.closed) {
          try {
            window.close();
          } catch {
            // ignore popup close restriction
          }
          closeFallbackTimer = window.setTimeout(() => {
            if (!cancelledRef.current && !window.closed) {
              window.location.replace(redirectUrl);
            }
          }, 300);
        } else {
          window.location.replace(redirectUrl);
        }
      }, 1200);
    };

    const verifyPaymentWithDatabase = async () => {
      clearRecentUpgradeGrace();

      // Hint label only while verifying (never used to grant access)
      const hintedPlanRaw =
        searchParams.get('plan') ||
        searchParams.get('tier') ||
        (() => {
          try {
            return (
              sessionStorage.getItem('washek_pending_checkout_plan') ||
              localStorage.getItem('washek_pending_checkout_plan') ||
              ''
            );
          } catch {
            return '';
          }
        })();
      const hintedPlan = normalizePlan(hintedPlanRaw);
      if (hintedPlan !== 'free') {
        setPlanName(PLAN_LABELS[hintedPlan] || hintedPlan);
      }

      // Recover authenticated Supabase session before reading profiles
      let authUser = null;
      try {
        const session = await resolveValidSupabaseSession(false);
        authUser = session?.user || null;
      } catch {
        // Fallback if token recovery returned no user object directly
      }

      if (!authUser?.id) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          authUser = sessionData?.session?.user || null;
          if (!authUser) {
            const { data: authData } = await supabase.auth.getUser();
            authUser = authData?.user || null;
          }
        } catch (authErr) {
          console.debug('[SubscriptionReturn] Auth lookup note:', authErr);
        }
      }

      // If this return tab has no local session (e.g. Chrome storage partitioning when opened from AI Studio iframe),
      // delegate authoritative Postgres verification to window.opener (which holds the authenticated session).
      if (!authUser?.id && window.opener && !window.opener.closed) {
        const sessionId = searchParams.get('session_id') || '';
        let settled = false;

        const onOpenerReply = (event) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === 'WASHEK_CHECKOUT_CONFIRMED') {
            settled = true;
            openerCleanup?.();
            clearPendingCheckoutArtifacts();
            const confirmedPlan = normalizePlan(event.data?.plan || hintedPlan);
            const confirmedStatus = String(event.data?.status || 'active').toLowerCase().trim();
            if (confirmedPlan !== 'free' && ACTIVE_SUB_STATUSES.includes(confirmedStatus)) {
              completeSuccessFlow(confirmedPlan, confirmedStatus);
            } else {
              setStatus('error');
              setErrorMessage(
                'Payment has not been confirmed by Stripe yet. Your plan stays unchanged until Stripe completes payment.'
              );
            }
          } else if (event.data?.type === 'WASHEK_CHECKOUT_NOT_CONFIRMED') {
            settled = true;
            openerCleanup?.();
            clearPendingCheckoutArtifacts();
            setStatus('error');
            setErrorMessage(
              'Payment has not been confirmed by Stripe yet. Your plan stays unchanged until Stripe completes payment. If you just paid, tap Re-check Payment Status below.'
            );
          }
        };

        window.addEventListener('message', onOpenerReply);
        const safetyTimeout = window.setTimeout(() => {
          if (!settled && !cancelledRef.current) {
            settled = true;
            openerCleanup?.();
            setStatus('error');
            setErrorMessage(
              'Still waiting for Stripe payment confirmation. Tap Re-check Payment Status or return to the WASHEK tab.'
            );
          }
        }, 26000);

        const pingOpener = () => {
          if (settled || cancelledRef.current) return;
          try {
            window.opener.postMessage(
              {
                type: 'WASHEK_CHECKOUT_RETURN',
                plan: hintedPlan,
                sessionId,
              },
              window.location.origin
            );
          } catch {
            // ignore postMessage error
          }
        };

        openerCleanup = () => {
          window.removeEventListener('message', onOpenerReply);
          clearTimeout(safetyTimeout);
        };

        pingOpener();
        window.setTimeout(pingOpener, 600);
        return;
      }

      if (!authUser?.id) {
        if (cancelledRef.current) return;
        clearPendingCheckoutArtifacts();
        setStatus('error');
        setErrorMessage(
          'Please sign in to your WASHEK account so we can verify your Stripe payment status.'
        );
        return;
      }

      // Poll authoritative Supabase profiles table until Stripe webhook writes an active/trialing paid plan
      let confirmedPlan = 'free';
      let confirmedStatus = 'inactive';

      for (let attempt = 0; attempt < 25; attempt++) {
        if (cancelledRef.current) return;
        try {
          const { data: dbProf, error: profErr } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_status, stripe_subscription_id')
            .eq('id', authUser.id)
            .maybeSingle();

          if (!profErr && dbProf) {
            const dbPlan = normalizePlan(dbProf.subscription_plan);
            const dbStatus = String(dbProf.subscription_status || '').toLowerCase().trim();
            if (dbPlan !== 'free' && ACTIVE_SUB_STATUSES.includes(dbStatus)) {
              confirmedPlan = dbPlan;
              confirmedStatus = dbStatus;
              break;
            }
          }
        } catch {
          // continue polling
        }

        if (attempt < 24) {
          await new Promise((r) => window.setTimeout(r, 1000));
        }
      }

      if (cancelledRef.current) return;

      clearPendingCheckoutArtifacts();

      // Strict payment verification guard: do NOT upgrade unless Postgres profiles confirms paid active/trialing
      if (confirmedPlan === 'free' || !ACTIVE_SUB_STATUSES.includes(confirmedStatus)) {
        try {
          localStorage.removeItem('washek_subscription_plan');
          localStorage.setItem('washek_subscription_status', confirmedStatus || 'inactive');
        } catch {
          // ignore
        }
        setStatus('error');
        setErrorMessage(
          'Payment has not been confirmed by Stripe yet. Your plan stays unchanged until Stripe completes payment. If you just paid, tap Re-check Payment Status below.'
        );
        return;
      }

      completeSuccessFlow(confirmedPlan, confirmedStatus);
    };

    verifyPaymentWithDatabase();

    return () => {
      cancelledRef.current = true;
      openerCleanup?.();
      if (redirectTimer) clearTimeout(redirectTimer);
      if (closeFallbackTimer) clearTimeout(closeFallbackTimer);
    };
  }, [searchParams, attemptCounter]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center">
        <div className="space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-lg shadow-primary/15 relative">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl animate-pulse -z-10" />
          </div>

          <h1 className="font-heading font-extrabold text-2xl tracking-tight text-foreground">
            Verifying your payment…
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Checking Stripe payment confirmation with your WASHEK account{planName ? ` for ${planName}` : ''}…
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
              {isTrial ? `7-Day Free Trial Activated!` : `Payment Confirmed · ${planName}`}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTrial
                ? `All ${planName} features are unlocked for your 7-day trial ($0 today). Auto-renews after 7 days · Cancel anytime in your profile.`
                : `Your subscription has been confirmed and all your ${planName} features are unlocked.`}
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
              onClick={() => {
                if (window.opener && !window.opener.closed) {
                  try {
                    window.close();
                  } catch {
                    /* ignore window close restriction */
                  }
                }
                navigate('/', { replace: true });
              }}
            >
              Enter WASHEK Dashboard
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span>Redirecting into WASHEK automatically…</span>
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
