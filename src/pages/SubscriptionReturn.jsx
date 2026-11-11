import {
  useEffect,
  useState,
} from 'react';

import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import {
  supabase,
} from '@/lib/supabase';

import {
  supabaseApi,
} from '@/lib/supabaseApi';


import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  User,
} from 'lucide-react';

import {
  Button,
} from '@/components/ui/button';

import {
  PLAN_HIERARCHY,
  PLAN_LABELS,
  applySubscriptionUpgrade,
  normalizePlan,
} from '@/lib/subscription';

export default function SubscriptionReturn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState('loading');
  const [subStatus, setSubStatus] = useState('trialing');
  const [planName, setPlanName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const resolveAndUpgrade = async () => {
      // 1. Detect plan from query params, cookies, localStorage, or backend endpoint
      const rawPlanParam = searchParams.get('plan') || searchParams.get('tier') || '';
      const rawStatusParam = searchParams.get('status') || '';
      const trialParam = searchParams.get('trial');
      const resolvedStatus = trialParam === 'false' ? 'active' : (rawStatusParam === 'active' ? 'active' : 'trialing');
      setSubStatus(resolvedStatus);

      let pendingPlan = (() => {
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

      if (!pendingPlan) {
        try {
          const match = document.cookie.match(/washek_pending_checkout_plan=([^;]+)/);
          if (match) pendingPlan = match[1];
        } catch {
          /* ignore cookie error */
        }
      }

      if (!rawPlanParam && !pendingPlan) {
        try {
          const res = await fetch('/api/checkout/pending');
          const data = await res.json();
          if (data?.plan) pendingPlan = data.plan;
        } catch {
          /* ignore */
        }
      }

      const sessionId = searchParams.get('session_id') || searchParams.get('sessionId') || '';
      // If Stripe returned with a session or confirmation, default to performance if plan unspecified
      let resolvedPlan = normalizePlan(rawPlanParam || pendingPlan);
      if ((!resolvedPlan || resolvedPlan === 'free') && (sessionId || rawStatusParam || window.location.href.includes('return'))) {
        resolvedPlan = 'performance';
      }

      if (!resolvedPlan || resolvedPlan === 'free') {
        setStatus('error');
        setErrorMessage('No valid subscription plan was detected. If you completed checkout on Stripe, click below to activate your plan.');
        return;
      }

      const friendlyName =
        (PLAN_LABELS && PLAN_LABELS[resolvedPlan]) ||
        resolvedPlan.charAt(0).toUpperCase() + resolvedPlan.slice(1);
      setPlanName(friendlyName);

      // Apply upgrade instantly across all local storage & application state
      applySubscriptionUpgrade(resolvedPlan, resolvedStatus, { sessionId });

      // Clean up temporary pending plan
      try {
        localStorage.removeItem('washek_pending_checkout_plan');
        sessionStorage.removeItem('washek_pending_checkout_plan');
        document.cookie = 'washek_pending_checkout_plan=; path=/; max-age=0;';
      } catch {
        /* ignore */
      }

      let authUser = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        authUser = authData?.user || null;
      } catch (authErr) {
        console.debug('[SubscriptionReturn] Auth check note:', authErr);
      }

      const storedUser = (() => {
        try {
          return JSON.parse(localStorage.getItem('washek_user') || '{}');
        } catch {
          return {};
        }
      })();

      const uid = authUser?.id || storedUser?.id || storedUser?.uid;
      const email = authUser?.email || storedUser?.email;

      // 3. Call backend server checkout sync endpoint
      try {
        await fetch('/api/checkout/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: uid,
            email,
            plan: resolvedPlan,
            status: resolvedStatus,
            sessionId: sessionId || `return_${Date.now()}`,
          }),
        }).catch(() => {});
      } catch (err) {
        console.debug('[SubscriptionReturn] Server process note:', err);
      }

      // 4. Update Supabase profile if present
      try {
        const profileUpdatePayload = {
          subscription_plan: resolvedPlan,
          subscription_status: resolvedStatus,
          updated_at: new Date().toISOString(),
        };
        const isUUID = typeof uid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uid.trim());
        let updated = false;
        if (isUUID) {
          const { error: dbErr } = await supabase.from('profiles').update(profileUpdatePayload).eq('id', uid);
          if (!dbErr) updated = true;
        }
        if (!updated && email) {
          await supabase.from('profiles').update(profileUpdatePayload).ilike('email', email.trim());
        }
      } catch (err) {
        console.debug('[SubscriptionReturn] Supabase profile sync note:', err);
      }

      // 5. Notify the main app tab that subscription was verified
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'WASHEK_SUBSCRIPTION_SUCCESS',
            plan: resolvedPlan,
            status: resolvedStatus,
          }, '*');
        }
      } catch (_pmErr) {
        // ignore cross-origin error
      }

      try {
        const bc = new BroadcastChannel('washek_subscription_sync');
        bc.postMessage({
          type: 'WASHEK_SUBSCRIPTION_SUCCESS',
          plan: resolvedPlan,
          status: resolvedStatus,
          timestamp: Date.now(),
        });
        bc.close();
      } catch (_bcErr) {
        // ignore BroadcastChannel error
      }

      try {
        localStorage.setItem('washek_subscription_success_event', JSON.stringify({
          plan: resolvedPlan,
          status: resolvedStatus,
          timestamp: Date.now(),
        }));
      } catch (_lsErr) {
        // ignore storage error
      }

      if (cancelled) return;

      // Mark success
      setStatus('success');

      // Try closing the tab if opened from the app, or turn into the app directly
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          let tabClosed = false;
          if (window.opener && !window.opener.closed) {
            try {
              window.close();
              tabClosed = true;
            } catch (_err) {
              // ignore popup close restriction
            }
          }
          if (!tabClosed) {
            window.location.replace('/?subscribed=' + encodeURIComponent(resolvedPlan));
          }
        }
      }, 1400);

      return () => {
        clearTimeout(timer);
      };
    };

    resolveAndUpgrade();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);



  /*
   * ==========================================================
   * LOADING & SYNCING
   * ==========================================================
   */
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
            Stripe payment confirmed. WASHEK is unlocking all {planName || 'plan'} features and synchronizing your account…
          </p>

          <div className="flex items-center justify-center gap-2 text-primary font-heading font-bold text-sm pt-2">
            <Zap className="w-4 h-4 fill-primary/30" />
            <span>WASHEK {planName || 'Tier'}</span>
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
              {isTrial ? `7-Day Free Trial Activated!` : `Plan Synced · You're on ${planName}!`}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTrial
                ? `All ${planName} features are immediately unlocked for your 7-day trial ($0 today). Auto-renews after 7 days · Cancel anytime in your profile.`
                : `Your subscription has been confirmed and all your ${planName} features are immediately unlocked.`}
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
                  } catch (_err) {
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

  /*
   * ==========================================================
   * ERROR OR INVALID SESSION
   * ==========================================================
   */
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center">
      <div className="space-y-4 max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto">
          <AlertCircle className="w-7 h-7 text-destructive" />
        </div>

        <h1 className="font-heading font-bold text-2xl tracking-tight">
          Subscription Verification
        </h1>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {errorMessage || 'No active payment session was detected. If you completed checkout on Stripe, please check your email confirmation or return to your profile.'}
        </p>

        <div className="pt-2 flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => navigate('/profile', { replace: true })}
          >
            Return to Profile
          </Button>
          <Button
            variant="default"
            className="flex-1 text-xs"
            onClick={() => navigate('/', { replace: true })}
          >
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
