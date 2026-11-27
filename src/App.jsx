import React, { Suspense, lazy } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { queryClientInstance } from '@/lib/query-client';
import { AppSettingsProvider, useAppSettings } from '@/lib/AppSettingsContext';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

import AppLayout from '@/components/layout/AppLayout';
import ProgramWeekBootstrap from '@/components/program/ProgramWeekBootstrap';
import { useMidnightSync } from '@/hooks/useMidnightSync';

import PageNotFound from '@/lib/PageNotFound';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineIndicator from '@/components/pwa/OfflineIndicator';
import QuickStartTutorialModal from '@/components/tutorial/QuickStartTutorialModal';
import LanguageTranslator from '@/components/LanguageTranslator';

function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk')
  );
}

function lazyWithRetry(importer, key) {
  return lazy(async () => {
    const storageKey = `washek_chunk_reload_${key}`;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const mod = await importer();
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // ignore storage access issues
        }
        return mod;
      } catch (err) {
        lastError = err;
        if (!isChunkLoadError(err) || attempt === 2) break;
        await new Promise((r) => window.setTimeout(r, 350 * (attempt + 1)));
      }
    }

    if (isChunkLoadError(lastError)) {
      try {
        const lastReload = Number(window.sessionStorage.getItem(storageKey) || 0);
        if (!lastReload || Date.now() - lastReload > 15000) {
          window.sessionStorage.setItem(storageKey, String(Date.now()));
          window.location.reload();
          return new Promise(() => {});
        }
      } catch {
        // fall through and let ErrorBoundary show reload button
      }
    }

    throw lastError;
  });
}

const Dashboard = lazyWithRetry(() => import('@/pages/Dashboard'), 'dashboard');
const Onboarding = lazyWithRetry(() => import('@/pages/Onboarding'), 'onboarding');
const About = lazyWithRetry(() => import('@/pages/About'), 'about');
const Contact = lazyWithRetry(() => import('@/pages/Contact'), 'contact');
const Login = lazyWithRetry(() => import('@/pages/Login'), 'login');
const ResetPassword = lazyWithRetry(() => import('@/pages/ResetPassword'), 'reset-password');
const Terms = lazyWithRetry(() => import('@/pages/Terms'), 'terms');
const Privacy = lazyWithRetry(() => import('@/pages/Privacy'), 'privacy');
const Profile = lazyWithRetry(() => import('@/pages/Profile'), 'profile');
const Program = lazyWithRetry(() => import('@/pages/Program'), 'program');
const Nutrition = lazyWithRetry(() => import('@/pages/Nutrition'), 'nutrition');
const Progress = lazyWithRetry(() => import('@/pages/Progress'), 'progress');
const Kael = lazyWithRetry(() => import('@/pages/Kael'), 'kael');
const ProgressPhotos = lazyWithRetry(() => import('@/pages/ProgressPhotos'), 'photos');
const FormLab = lazyWithRetry(() => import('@/pages/FormLab'), 'formlab');
const MuscleHeatmapPage = lazyWithRetry(() => import('@/pages/MuscleHeatmapPage'), 'muscle-heatmap');
const ProgramDay = lazyWithRetry(() => import('@/pages/ProgramDay'), 'program-day');
const LiveWorkout = lazyWithRetry(() => import('@/pages/LiveWorkout'), 'live-workout');
const SubscriptionReturn = lazyWithRetry(() => import('@/pages/SubscriptionReturn'), 'subscription-return');

import { supabase } from '@/lib/supabase';
import { resolveValidSupabaseSession } from '@/lib/stripeCheckout';
import { supabaseApi } from '@/lib/supabaseApi';
import { applySubscriptionUpgrade, normalizePlan } from '@/lib/subscription';

function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

function GlobalMidnightWatcher() {
  const { user } = useAuth();
  useMidnightSync(user);
  return null;
}

function ProfileLanguageSync() {
  const { user } = useAuth();
  const { settings, updateSettings } = useAppSettings();
  const syncedUidRef = React.useRef('');

  React.useEffect(() => {
    const uid = user?.id || user?.email || '';
    if (!uid) {
      syncedUidRef.current = '';
      return;
    }
    if (syncedUidRef.current === uid) return;
    syncedUidRef.current = uid;
    if (
      !settings?.languageExplicitlySet &&
      user?.language &&
      typeof user.language === 'string' &&
      user.language.trim() &&
      user.language !== settings?.language
    ) {
      updateSettings({
        language: user.language.trim(),
        ...(user.country ? { country: user.country } : {}),
        ...(user.unit ? { unit: user.unit } : {}),
      });
    }
  }, [user, settings?.language, settings?.languageExplicitlySet, updateSettings]);

  return null;
}

function SubscriptionWatcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const lastAppliedRef = React.useRef(0);

  React.useEffect(() => {
    const verifyAndSyncFromServer = async (showToast = false) => {
      try {
        const freshUser = await supabaseApi.auth.me(true);
        const verifiedPlan = normalizePlan(freshUser?.subscription_plan);
        const verifiedStatus = String(freshUser?.subscription_status || '').toLowerCase().trim();
        const isVerifiedActive =
          verifiedPlan !== 'free' &&
          ['active', 'trialing', 'past_due'].includes(verifiedStatus);

        if (isVerifiedActive) {
          applySubscriptionUpgrade(verifiedPlan, verifiedStatus, { syncServer: false });
          queryClientInstance.invalidateQueries();
          await checkUserAuth?.().catch(() => {});

          const now = Date.now();
          if (showToast && now - lastAppliedRef.current > 2000) {
            lastAppliedRef.current = now;
          }
        }
      } catch {
        // ignore transient network lookup error
      }
    };

    const isReturnRoute =
      location.pathname.startsWith('/subscription') ||
      location.pathname.startsWith('/checkout') ||
      location.pathname.startsWith('/welcome') ||
      location.pathname === '/success';
    const params = new URLSearchParams(location.search);
    if (
      !isReturnRoute &&
      (params.has('subscribed') ||
        params.has('session_id') ||
        params.has('checkout_session_id') ||
        params.get('checkout') === 'success')
    ) {
      navigate(`/subscription-return${location.search}`, { replace: true });
      return;
    }

    if (!isReturnRoute && (params.has('plan') || params.has('sub_status'))) {
      params.delete('plan');
      params.delete('sub_status');
      const nextSearch = params.toString();
      const cleanUrl = nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const handleOpenerCheckoutReturn = async (sourceWindow, expectedPlanRaw = '') => {
      const expectedPlan = normalizePlan(expectedPlanRaw);
      try {
        let uid = null;
        try {
          const validSession = await resolveValidSupabaseSession(false);
          uid = validSession?.user?.id || null;
        } catch {
          const { data: sessionData } = await supabase.auth.getSession();
          uid = sessionData?.session?.user?.id || null;
        }

        if (!uid) {
          sourceWindow?.postMessage(
            { type: 'WASHEK_CHECKOUT_NOT_CONFIRMED' },
            window.location.origin
          );
          return;
        }

        let confirmedPlan = 'free';
        let confirmedStatus = 'inactive';

        for (let attempt = 0; attempt < 25; attempt++) {
          try {
            const { data: dbProf, error: profErr } = await supabase
              .from('profiles')
              .select('subscription_plan, subscription_status')
              .eq('id', uid)
              .maybeSingle();

            if (!profErr && dbProf) {
              const dbPlan = normalizePlan(dbProf.subscription_plan);
              const dbStatus = String(dbProf.subscription_status || '').toLowerCase().trim();
              const matchesExpected = expectedPlan === 'free' || dbPlan === expectedPlan;
              if (dbPlan !== 'free' && matchesExpected && ['active', 'trialing', 'past_due'].includes(dbStatus)) {
                confirmedPlan = dbPlan;
                confirmedStatus = dbStatus;
                break;
              }
            }
          } catch {
            // continue polling
          }

          if (attempt < 24) {
            await new Promise((r) => window.setTimeout(r, 900));
          }
        }

        if (confirmedPlan !== 'free' && ['active', 'trialing', 'past_due'].includes(confirmedStatus)) {
          applySubscriptionUpgrade(confirmedPlan, confirmedStatus, { syncServer: false });
          queryClientInstance.invalidateQueries();
          await checkUserAuth?.().catch(() => {});

          const now = Date.now();
          if (now - lastAppliedRef.current > 2000) {
            lastAppliedRef.current = now;
          }

          sourceWindow?.postMessage(
            {
              type: 'WASHEK_CHECKOUT_CONFIRMED',
              plan: confirmedPlan,
              status: confirmedStatus,
            },
            window.location.origin
          );
          return;
        }
      } catch {
        // fall through to not confirmed
      }

      sourceWindow?.postMessage(
        { type: 'WASHEK_CHECKOUT_NOT_CONFIRMED' },
        window.location.origin
      );
    };

    // Listen for cross-tab checkout return notifications and verify authoritatively against DB
    const onWindowMsg = (e) => {
      if (e.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS') {
        verifyAndSyncFromServer(true);
      } else if (e.data?.type === 'WASHEK_CHECKOUT_RETURN' && e.origin === window.location.origin) {
        handleOpenerCheckoutReturn(e.source, e.data?.plan || '');
      }
    };
    window.addEventListener('message', onWindowMsg);

    let bc = null;
    try {
      bc = new BroadcastChannel('washek_subscription_sync');
      bc.onmessage = (e) => {
        if (e.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS') {
          verifyAndSyncFromServer(true);
        }
      };
    } catch {
      /* ignore */
    }

    const onStorage = (e) => {
      if (e.key === 'washek_subscription_success_event' && e.newValue) {
        verifyAndSyncFromServer(true);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('message', onWindowMsg);
      window.removeEventListener('storage', onStorage);
      bc?.close();
    };
  }, [location.search, location.pathname, checkUserAuth]);

  return null;
}

function AuthenticatedApp() {
  const { isLoadingAuth, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoadingAuth && !isAuthenticated) {
    return <PageLoader />;
  }

  if (
    !isAuthenticated &&
    location.pathname !== '/login' &&
    location.pathname !== '/reset-password' &&
    location.pathname !== '/subscription-return' &&
    location.pathname !== '/subscription/return' &&
    location.pathname !== '/subscription-success' &&
    location.pathname !== '/checkout/success' &&
    location.pathname !== '/checkout/return' &&
    location.pathname !== '/success' &&
    location.pathname !== '/welcome' &&
    location.pathname !== '/terms' &&
    location.pathname !== '/privacy'
  ) {
    return <Navigate to="/login" replace />;
  }

  if (
    isAuthenticated &&
    location.pathname === '/login'
  ) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <OfflineIndicator />
      <SubscriptionWatcher />
      {isAuthenticated && <ProfileLanguageSync />}
      {isAuthenticated && <GlobalMidnightWatcher />}
      {isAuthenticated && <ProgramWeekBootstrap />}
      {isAuthenticated && <QuickStartTutorialModal />}

      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/onboarding" element={<Onboarding />} />

            <Route path="/live-workout" element={<LiveWorkout />} />

            <Route
              path="/subscription-return"
              element={<SubscriptionReturn />}
            />
            <Route
              path="/subscription/return"
              element={<SubscriptionReturn />}
            />
            <Route
              path="/subscription-success"
              element={<SubscriptionReturn />}
            />
            <Route
              path="/checkout/success"
              element={<SubscriptionReturn />}
            />
            <Route
              path="/checkout/return"
              element={<SubscriptionReturn />}
            />
            <Route
              path="/success"
              element={<SubscriptionReturn />}
            />
            <Route
              path="/welcome"
              element={<SubscriptionReturn />}
            />

            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />

              <Route path="/program" element={<Program />} />

              <Route
                path="/program/day/:dayIndex"
                element={<ProgramDay />}
              />

              <Route path="/nutrition" element={<Nutrition />} />

              <Route path="/progress" element={<Progress />} />

              <Route path="/profile" element={<Profile />} />

              <Route path="/kael" element={<Kael />} />

              <Route path="/photos" element={<ProgressPhotos />} />

              <Route path="/formlab" element={<FormLab />} />
              <Route path="/muscle-heatmap" element={<MuscleHeatmapPage />} />
              <Route path="/heatmap" element={<Navigate to="/muscle-heatmap" replace />} />

              <Route path="/about" element={<About />} />

              <Route path="/contact" element={<Contact />} />

              <Route path="/terms" element={<Terms />} />

              <Route path="/privacy" element={<Privacy />} />
            </Route>

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

function App() {
  return (
    <AppSettingsProvider>
      <LanguageTranslator />
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>

          <Toaster />
          <SonnerToaster />
        </QueryClientProvider>
      </AuthProvider>
    </AppSettingsProvider>
  );
}

export default App;
