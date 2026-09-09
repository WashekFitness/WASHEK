import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase';
import { supabaseApi } from '@/lib/supabaseApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);

  const loadAuthenticatedUser = useCallback(async (session) => {
    if (!session?.user) {
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }

    try {
      /*
       * We already know Supabase has an authenticated session.
       * Now load the application's profile data.
       */
      const profileUser = await supabaseApi.auth.me();

      setUser(profileUser);
      setIsAuthenticated(true);
      setAuthError(null);

      return profileUser;
    } catch (error) {
      console.error(
        '[AUTH] Unable to load application profile:',
        error
      );

      /*
       * The Supabase session itself is valid, so don't destroy
       * it just because profile loading had a problem.
       *
       * Build a basic user object from the Supabase auth user.
       */
      const authUser = session.user;

      const fallbackUser = {
        id: authUser.id,
        email: authUser.email,
        first_name:
          authUser.user_metadata?.first_name || '',
        last_name:
          authUser.user_metadata?.last_name || '',
        full_name:
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.first_name ||
          authUser.email ||
          'Athlete',
        role: authUser.user_metadata?.role || 'user',
      };

      setUser(fallbackUser);
      setIsAuthenticated(true);

      /*
       * Keep the authentication state alive.
       * The application can still use the Supabase session.
       */
      setAuthError(null);

      return fallbackUser;
    }
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const {
        data,
        error,
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      const session = data?.session;

      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        return null;
      }

      return await loadAuthenticatedUser(session);
    } catch (error) {
      console.error(
        '[AUTH] Supabase auth check failed:',
        error
      );

      setUser(null);
      setIsAuthenticated(false);

      setAuthError({
        type: 'unknown',
        message:
          error?.message ||
          'Authentication failed.',
      });

      return null;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [loadAuthenticatedUser]);

  const checkAppState = useCallback(
    async () => checkUserAuth(),
    [checkUserAuth]
  );

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      if (!mounted) return;

      await checkUserAuth();
    };

    initializeAuth();

    const {
      data: listener,
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        /*
         * SIGNED_OUT / no session
         */
        if (!session?.user) {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError(null);
          setAuthChecked(true);
          setIsLoadingAuth(false);
          return;
        }

        /*
         * A valid Supabase session exists.
         */
        try {
          await loadAuthenticatedUser(session);
        } catch (error) {
          if (!mounted) return;

          console.error(
            '[AUTH] Auth state change failed:',
            error
          );

          setAuthError({
            type: 'unknown',
            message:
              error?.message ||
              'Unable to load your account.',
          });
        } finally {
          if (!mounted) return;

          setAuthChecked(true);
          setIsLoadingAuth(false);
        }
      }
    );

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [checkUserAuth, loadAuthenticatedUser]);

  const logout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.assign('/login');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider'
    );
  }

  return context;
};
