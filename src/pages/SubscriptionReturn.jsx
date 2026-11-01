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
  firebaseApi,
} from '@/lib/firebaseApi';

import {
  auth as firebaseAuth,
} from '@/lib/firebase';

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

    // Detect plan from query parameters, with pending checkout storage fallback
    const rawPlanParam = searchParams.get('plan') || '';
    const rawStatusParam = searchParams.get('status') || '';
    const resolvedStatus = rawStatusParam === 'active' ? 'active' : 'trialing';
    setSubStatus(resolvedStatus);

    const pendingPlan = (() => {
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

    const resolvedPlan = normalizePlan(rawPlanParam || pendingPlan);
    const sessionId = searchParams.get('session_id') || searchParams.get('sessionId') || '';

    if (!resolvedPlan || resolvedPlan === 'free') {
      setStatus('error');
      setErrorMessage('No valid subscription plan was found in this return link.');
      return;
    }

    const friendlyName = (PLAN_LABELS && PLAN_LABELS[resolvedPlan]) ||
      resolvedPlan.charAt(0).toUpperCase() + resolvedPlan.slice(1);
    setPlanName(friendlyName);

    // Apply upgrade instantly across all local storage & application state
    applySubscriptionUpgrade(resolvedPlan, resolvedStatus, { sessionId });

    // Clean up temporary pending plan
    try {
      localStorage.removeItem('washek_pending_checkout_plan');
      sessionStorage.removeItem('washek_pending_checkout_plan');
    } catch (_err) {
      // ignore
    }

    const synchronizeAndComplete = async () => {
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

      // 1. Call backend server checkout sync endpoint
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

      // 2. Update Firebase / Firestore user profile if logged in
      try {
        if (firebaseAuth?.currentUser) {
          await firebaseApi.auth.updateProfile({
            subscription_plan: resolvedPlan,
            subscription_status: resolvedStatus,
            tier: resolvedPlan,
            plan: resolvedPlan,
            subscription_tier: resolvedPlan,
          });
        }
      } catch (err) {
        console.debug('[SubscriptionReturn] Firestore sync note:', err);
      }

      // 3. Query or update Supabase profile
      try {
        if (uid) {
          await supabase
            .from('profiles')
            .update({
              subscription_plan: resolvedPlan,
              subscription_status: resolvedStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', uid);
        }
      } catch (err) {
        console.debug('[SubscriptionReturn] Supabase profile sync note:', err);
      }

      // 4. Re-verify with auth.me
      try {
        await supabaseApi.auth.me(true);
      } catch (_err) {
        // ignore
      }

      if (cancelled) return;

      // Mark success
      setStatus('success');

      // Auto-redirect to home page after a brief confirmation moment
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          navigate('/', { replace: true });
        }
      }, 3500);

      return () => clearTimeout(timer);
    };

    synchronizeAndComplete();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);



  /*
   * ==========================================================
   * LOADING
   * ==========================================================
   */
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 safe-top safe-bottom text-center">
        <div className="space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-sm">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>

          <h1 className="font-heading font-bold text-2xl tracking-tight">
            Confirming your 7-day free trial…
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Stripe checkout completed. WASHEK is unlocking all {planName || 'plan'} features for your 7-day free trial now ($0 charged today).
          </p>

          <div className="flex items-center justify-center gap-2 text-primary font-medium text-sm pt-2">
            <Zap className="w-4 h-4 fill-primary/20" />
            <span>WASHEK {planName}</span>
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
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-9 h-9 text-emerald-500" />
          </div>

          <div className="space-y-2">
            <h1 className="font-heading font-bold text-2xl tracking-tight">
              {isTrial ? `Your 7-Day Free Trial is Active!` : `You're on ${planName}!`}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {isTrial
                ? `All ${planName} features are immediately unlocked for your 7-day trial ($0 today). Auto-renews after 7 days · Cancel anytime in your profile.`
                : `Your subscription has been confirmed and all your ${planName} features are immediately unlocked.`}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-border/80 flex items-center justify-between text-left">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Plan</p>
                <p className="text-sm font-semibold">{planName} Tier</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              {isTrial ? '7-Day Trial Active' : 'Active'}
            </span>
          </div>

          <div className="pt-2">
            <Button
              className="w-full font-heading font-semibold"
              onClick={() => navigate('/', { replace: true })}
            >
              Enter WASHEK Dashboard
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span>Redirecting to your dashboard automatically…</span>
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
