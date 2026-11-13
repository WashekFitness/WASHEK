import React, { Suspense } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { queryClientInstance } from '@/lib/query-client';
import { AppSettingsProvider } from '@/lib/AppSettingsContext';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

import AppLayout from '@/components/layout/AppLayout';
import ProgramWeekBootstrap from '@/components/program/ProgramWeekBootstrap';
import { useMidnightSync } from '@/hooks/useMidnightSync';

import PageNotFound from '@/lib/PageNotFound';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineIndicator from '@/components/pwa/OfflineIndicator';

import Dashboard from '@/pages/Dashboard';
import Onboarding from '@/pages/Onboarding';
import About from '@/pages/About';
import Contact from '@/pages/Contact';
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import Profile from '@/pages/Profile';
import Program from '@/pages/Program';
import Nutrition from '@/pages/Nutrition';
import Progress from '@/pages/Progress';
import Kael from '@/pages/Kael';
import ProgressPhotos from '@/pages/ProgressPhotos';
import FormLab from '@/pages/FormLab';
import MuscleHeatmapPage from '@/pages/MuscleHeatmapPage';
import ProgramDay from '@/pages/ProgramDay';
import LiveWorkout from '@/pages/LiveWorkout';
import SubscriptionReturn from '@/pages/SubscriptionReturn';

import { supabaseApi } from '@/lib/supabaseApi';
import { applySubscriptionUpgrade, normalizePlan } from '@/lib/subscription';
import { toast } from 'sonner';

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

function SubscriptionWatcher() {
  const location = useLocation();
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
            toast.success(
              `Payment confirmed! You are now upgraded to the ${verifiedPlan.charAt(0).toUpperCase() + verifiedPlan.slice(1)} plan.`
            );
          }
        }
      } catch {
        // ignore transient network lookup error
      }
    };

    // Strip any ?subscribed= / ?plan= query parameters without trusting client URL params to grant upgrades
    const params = new URLSearchParams(location.search);
    if (params.has('subscribed') || params.has('plan') || params.has('sub_status')) {
      const hasSubHint = params.has('subscribed');
      params.delete('subscribed');
      params.delete('plan');
      params.delete('sub_status');
      const nextSearch = params.toString();
      const cleanUrl = nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      if (hasSubHint) {
        verifyAndSyncFromServer(true);
      }
    }

    // Listen for cross-tab checkout return notifications and verify authoritatively against DB
    const onWindowMsg = (e) => {
      if (e.data?.type === 'WASHEK_SUBSCRIPTION_SUCCESS') {
        verifyAndSyncFromServer(true);
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
      {isAuthenticated && <GlobalMidnightWatcher />}
      {isAuthenticated && <ProgramWeekBootstrap />}

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
