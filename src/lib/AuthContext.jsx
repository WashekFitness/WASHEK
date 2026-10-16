import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { auth, onAuthStateChanged, firebaseSignOut } from '@/lib/firebase';
import { firebaseApi, getOrCreateUserProfile } from '@/lib/firebaseApi';
import { supabase } from '@/lib/supabase';
import { supabaseApi } from '@/lib/supabaseApi';
import { isLogo } from '@/lib/avatarUtils';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('washek_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && isLogo(parsed.avatar_url)) {
        parsed.avatar_url = null;
        parsed.photo_url = null;
        try {
          localStorage.setItem('washek_user', JSON.stringify(parsed));
        } catch (_err) {
          // Ignore local storage write error
        }
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return !!localStorage.getItem('washek_user');
    } catch {
      return false;
    }
  });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);

  // Load user from Supabase session if Firebase user is not active
  const loadFallbackSupabaseUser = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (session?.user) {
        try {
          const profileUser = await supabaseApi.auth.me();
          if (profileUser) {
            setUser(profileUser);
            setIsAuthenticated(true);
            try {
              localStorage.setItem('washek_user', JSON.stringify(profileUser));
            } catch (err) {
              console.debug('[AUTH] Storage note:', err);
            }
            return profileUser;
          }
        } catch {
          const fallbackUser = {
            id: session.user.id,
            email: session.user.email,
            first_name: session.user.user_metadata?.first_name || '',
            last_name: session.user.user_metadata?.last_name || '',
            full_name:
              session.user.user_metadata?.full_name ||
              session.user.user_metadata?.first_name ||
              session.user.email ||
              'Athlete',
            role: session.user.user_metadata?.role || 'athlete',
            plan: 'pro',
            tier: 'pro',
          };
          setUser(fallbackUser);
          setIsAuthenticated(true);
          try {
            localStorage.setItem('washek_user', JSON.stringify(fallbackUser));
          } catch (err) {
            console.debug('[AUTH] Storage note:', err);
          }
          return fallbackUser;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const currentFirebaseUser = auth.currentUser;
      if (currentFirebaseUser) {
        const profile = await getOrCreateUserProfile(currentFirebaseUser);
        setUser(profile);
        setIsAuthenticated(true);
        try {
          localStorage.setItem('washek_user', JSON.stringify(profile));
        } catch (err) {
          console.debug('[AUTH] Storage note:', err);
        }
        return profile;
      }

      const fallback = await loadFallbackSupabaseUser();
      if (!fallback) {
        setUser(null);
        setIsAuthenticated(false);
        try {
          localStorage.removeItem('washek_user');
        } catch (err) {
          console.debug('[AUTH] Storage note:', err);
        }
      }
      return fallback;
    } catch (error) {
      console.warn('[AUTH] Auth check:', error?.message || error);
      setUser(null);
      setIsAuthenticated(false);
      return null;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [loadFallbackSupabaseUser]);

  // Listen to Firebase & Supabase auth state changes
  useEffect(() => {
    const handleAvatarChanged = (e) => {
      const newAvatar = e.detail?.avatarUrl ?? null;
      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, avatar_url: newAvatar, photo_url: newAvatar };
        try {
          localStorage.setItem('washek_user', JSON.stringify(updated));
        } catch (_err) {
          // Ignore local storage error
        }
        return updated;
      });
    };

    window.addEventListener('washek_avatar_changed', handleAvatarChanged);
    return () => {
      window.removeEventListener('washek_avatar_changed', handleAvatarChanged);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const unsubscribeFirebase = onAuthStateChanged(auth, async (fbUser) => {
      if (!mounted) return;

      if (fbUser) {
        try {
          const profile = await getOrCreateUserProfile(fbUser);
          if (mounted) {
            setUser(profile);
            setIsAuthenticated(true);
            setAuthError(null);
            try {
              localStorage.setItem('washek_user', JSON.stringify(profile));
            } catch (err) {
              console.debug('[AUTH] Storage note:', err);
            }
          }
        } catch (err) {
          console.warn('[AUTH] Profile load warning:', err);
        } finally {
          if (mounted) {
            setAuthChecked(true);
            setIsLoadingAuth(false);
          }
        }
      } else {
        // Check if there is an active Supabase fallback session
        const fallback = await loadFallbackSupabaseUser();
        if (mounted && !fallback) {
          let foundCached = false;
          try {
            const stored = localStorage.getItem('washek_user');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (parsed?.email) {
                setUser(parsed);
                setIsAuthenticated(true);
                foundCached = true;
              }
            }
          } catch (storageErr) {
            console.debug('[AUTH] Storage read note:', storageErr);
          }
          if (!foundCached) {
            setUser(null);
            setIsAuthenticated(false);
            try {
              localStorage.removeItem('washek_user');
            } catch (err) {
              console.debug('[AUTH] Storage note:', err);
            }
          }
        }
        if (mounted) {
          setAuthChecked(true);
          setIsLoadingAuth(false);
        }
      }
    });

    const { data: supaListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          if (session?.user && !auth.currentUser) {
            await loadFallbackSupabaseUser();
          }
        } else if (event === 'SIGNED_OUT') {
          if (!auth.currentUser) {
            setUser(null);
            setIsAuthenticated(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
      unsubscribeFirebase();
      supaListener?.subscription?.unsubscribe?.();
    };
  }, [loadFallbackSupabaseUser]);

  const signInWithGoogle = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { user: profile } = await firebaseApi.auth.signInWithGoogle();
      setUser(profile);
      setIsAuthenticated(true);
      try {
        localStorage.setItem('washek_user', JSON.stringify(profile));
      } catch (err) {
        console.debug('[AUTH] Storage note:', err);
      }
      return profile;
    } catch (err) {
      setAuthError({ type: 'google_sign_in', message: err?.message || 'Google sign in failed' });
      throw err;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    setIsLoadingAuth(true);
    setAuthError(null);

    const cleanEmail = email.trim();
    let authSucceeded = false;
    let finalProfile = null;
    let lastError = null;

    // 1. Authenticate with Supabase
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        lastError = error;
      } else if (data?.user) {
        authSucceeded = true;
        const supaUser = data.user;

        try {
          finalProfile = await supabaseApi.auth.me();
        } catch (e) {
          console.debug('[AUTH] me load note:', e);
        }

        if (!finalProfile) {
          const fullName =
            supaUser.user_metadata?.full_name ||
            [supaUser.user_metadata?.first_name, supaUser.user_metadata?.last_name]
              .filter(Boolean)
              .join(' ') ||
            cleanEmail.split('@')[0] ||
            'Athlete';

          finalProfile = {
            id: supaUser.id,
            email: supaUser.email,
            first_name: supaUser.user_metadata?.first_name || '',
            last_name: supaUser.user_metadata?.last_name || '',
            full_name: fullName,
            role: supaUser.user_metadata?.role || 'athlete',
            plan: 'free',
            tier: 'free',
            subscription_tier: 'free',
            subscription_plan: 'free',
          };
        }

        if (data.session?.access_token) {
          try {
            localStorage.setItem('washek_auth_token', data.session.access_token);
          } catch (tokenErr) {
            console.debug('[AUTH] Token storage note:', tokenErr);
          }
        }
      }
    } catch (err) {
      lastError = err;
    }

    if (authSucceeded && finalProfile) {
      setUser(finalProfile);
      setIsAuthenticated(true);
      try {
        localStorage.setItem('washek_user', JSON.stringify(finalProfile));
      } catch (err) {
        console.debug('[AUTH] Storage note:', err);
      }
      setIsLoadingAuth(false);
      return finalProfile;
    }

    setIsLoadingAuth(false);
    const friendlyMsg =
      lastError?.message && !lastError.message.toLowerCase().includes('invalid login')
        ? lastError.message
        : 'Invalid email or password. Please verify your credentials or create an athlete account.';
    const finalErr = new Error(friendlyMsg);
    setAuthError({ type: 'email_sign_in', message: friendlyMsg });
    throw finalErr;
  }, []);

  const signUpWithEmail = useCallback(async (email, password, metadata = {}) => {
    setIsLoadingAuth(true);
    setAuthError(null);

    const cleanEmail = email.trim();
    const firstName = (metadata?.firstName || '').trim();
    const lastName = (metadata?.lastName || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || cleanEmail.split('@')[0] || 'Athlete';

    try {
      // 1. Sign up with Supabase
      const { data: supaData, error: supaError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            role: 'athlete',
          },
        },
      });

      if (supaError) {
        if (
          supaError.message?.toLowerCase().includes('already registered') ||
          supaError.message?.toLowerCase().includes('already exists')
        ) {
          throw new Error('An account with this email already exists. Please sign in instead.');
        }
        throw supaError;
      }

      const supaUser = supaData?.user;
      if (!supaUser) {
        throw new Error('Could not create account. Please check your credentials and try again.');
      }

      // If session was not immediately returned, log in to establish the session
      let session = supaData.session;
      if (!session) {
        try {
          const loginRes = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
          if (loginRes.data?.session) {
            session = loginRes.data.session;
          }
        } catch {
          // non-critical
        }
      }

      // Build profile
      const profile = {
        id: supaUser.id,
        email: supaUser.email || cleanEmail,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        avatar_url: null,
        role: 'athlete',
        plan: 'free',
        tier: 'free',
        subscription_tier: 'free',
        subscription_plan: 'free',
        target_calories: 2600,
        target_protein: 190,
        target_carbs: 260,
        target_fat: 70,
        created_at: new Date().toISOString(),
      };

      // Upsert profile in Supabase profiles table
      try {
        await supabase.from('profiles').upsert(
          {
            id: supaUser.id,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            role: 'athlete',
            subscription_plan: 'free',
            subscription_tier: 'free',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch (err) {
        console.debug('[AUTH] Profile creation note:', err);
      }

      // Save to localStorage
      try {
        localStorage.setItem('washek_user', JSON.stringify(profile));
        if (session?.access_token) {
          localStorage.setItem('washek_auth_token', session.access_token);
        }
      } catch (err) {
        console.debug('[AUTH] Storage note:', err);
      }

      setUser(profile);
      setIsAuthenticated(true);
      return profile;
    } catch (err) {
      setAuthError({ type: 'email_sign_up', message: err?.message || 'Registration failed' });
      throw err;
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail) {
      throw new Error('Please enter your email address.');
    }
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      throw error;
    }
    return true;
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth).catch(() => {});
      await supabase.auth.signOut().catch(() => {});
    } catch (err) {
      console.warn('[AUTH] Sign out error:', err);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      try {
        localStorage.removeItem('washek_auth_token');
        localStorage.removeItem('washek_user');
      } catch (err) {
        console.debug('[AUTH] Storage cleanup error:', err);
      }
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.assign('/login');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        authChecked,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
