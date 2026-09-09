import React, { Suspense, lazy } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/toaster';
import { queryClientInstance } from '@/lib/query-client';
import { AppSettingsProvider } from '@/lib/AppSettingsContext';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

import AppLayout from '@/components/layout/AppLayout';
import ProgramWeekBootstrap from '@/components/program/ProgramWeekBootstrap';

import PageNotFound from '@/lib/PageNotFound';

import Dashboard from '@/pages/Dashboard';
import Onboarding from '@/pages/Onboarding';
import About from '@/pages/About';
import Contact from '@/pages/Contact';
import Login from '@/pages/Login';
import ResetPassword from '@/pages/ResetPassword';

const Program = lazy(() => import('@/pages/Program'));
const Nutrition = lazy(() => import('@/pages/Nutrition'));
const Progress = lazy(() => import('@/pages/Progress'));
const Profile = lazy(() => import('@/pages/Profile'));
const Kael = lazy(() => import('@/pages/Kael'));
const ProgressPhotos = lazy(() => import('@/pages/ProgressPhotos'));
const FormLab = lazy(() => import('@/pages/FormLab'));
const ProgramDay = lazy(() => import('@/pages/ProgramDay'));
const LiveWorkout = lazy(() => import('@/pages/LiveWorkout'));
const SubscriptionReturn = lazy(
  () => import('@/pages/SubscriptionReturn')
);

function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

function AuthenticatedApp() {
  const { isLoadingAuth, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return <PageLoader />;
  }

  if (
    !isAuthenticated &&
    location.pathname !== '/login' &&
    location.pathname !== '/reset-password'
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
      {isAuthenticated && <ProgramWeekBootstrap />}

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

            <Route path="/about" element={<About />} />

            <Route path="/contact" element={<Contact />} />
          </Route>

          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </Suspense>
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
        </QueryClientProvider>
      </AuthProvider>
    </AppSettingsProvider>
  );
}

export default App;
