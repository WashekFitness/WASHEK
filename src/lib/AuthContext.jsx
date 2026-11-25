import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  supabase,
  readNativeSupabaseStorageSession,
  refreshSupabaseSessionLocked,
  syncClientSessionSafely,
} from '@/lib/supabase';
import {
  supabaseApi,
  invalidateCurrentUserCache,
  isUserMarkedOnboarded,
  markUserOnboarded,
} from '@/lib/supabaseApi';
import { isLogo } from '@/lib/avatarUtils';
import {
  enforceUserSubscriptionState,
  isActiveSubscriptionStatus,
  normalizePlan,
  getPlanRank,
  getRedirectUpgradeReceipt,
  applySubscriptionUpgrade,
  syncSubscriptionStorageKeys,
} from '@/lib/subscription';
import { fetchServerEntitlement } from '@/lib/stripeCheckout';
import { getCachedMessageStats } from '@/lib/messageLimit';
import { markNewAccountForQuickStart } from '@/lib/quickStartTutorial';

function preserveMonthlyKaelCount(nextUser, prevUser = null) {
  if (!nextUser || typeof nextUser !== 'object') return nextUser;
  try {
    const stats = getCachedMessageStats(nextUser);
    const sameUserPrev =
      prevUser &&
      ((prevUser.email && nextUser.email && String(prevUser.email).toLowerCase().trim() === String(nextUser.email).toLowerCase().trim()) ||
        (prevUser.id && nextUser.id && prevUser.id === nextUser.id));
    const prevSameMonth =
      sameUserPrev && prevUser?.kael_msg_month === stats.monthKey
        ? Math.max(0, Number(prevUser?.kael_msg_count || 0))
        : 0;
    const nextSameMonth =
      nextUser?.kael_msg_month === stats.monthKey
        ? Math.max(0, Number(nextUser?.kael_msg_count || 0))
        : 0;
    const mergedCount = Math.max(stats.used, prevSameMonth, nextSameMonth);
    return {
      ...nextUser,
      kael_msg_count: mergedCount,
      kael_msg_month: stats.monthKey,
    };
  } catch {
    return nextUser;
  }
}

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('washek_user');
      if (!saved) return null;
      let parsed = enforceUserSubscriptionState(JSON.parse(saved));
      let modified = false;
      if (parsed && isLogo(parsed.avatar_url)) {
        parsed.avatar_url = null;
        parsed.photo_url = null;
        modified = true;
      }
      if (parsed) {
        const receipt = getRedirectUpgradeReceipt(parsed);
        const parsedActive = isActiveSubscriptionStatus(parsed.subscription_status);
        const parsedRank = parsedActive ? getPlanRank(parsed.subscription_plan) : 0;
        const receiptRank = receipt ? getPlanRank(receipt.plan) : 0;
        if (receipt && (!parsedActive || receiptRank > parsedRank)) {
          parsed = {
            ...parsed,
            subscription_plan: receipt.plan,
            subscription_status: receipt.status,
            plan: receipt.plan,
            tier: receipt.plan,
            subscription_tier: receipt.plan,
          };
          modified = true;
        } else if (!parsedActive) {
          try {
            localStorage.removeItem('washek_subscription_plan');
          } catch (_err) {
            // ignore
          }
          modified = true;
        }
      }
      if (parsed && modified) {
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

  const [isLoadingAuth, setIsLoadingAuth] = useState(() => {
    try {
      return !localStorage.getItem('washek_user');
    } catch {
      return true;
    }
  });

  const [isLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(() => {
    try {
      return !!localStorage.getItem('washek_user');
    } catch {
      return false;
    }
  });
  const [appPublicSettings] = useState(null);

  // Safety timeout: Never let auth loading block the app for more than 800ms
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }, 800);

    return () => clearTimeout(safetyTimer);
  }, []);

  // Format Supabase user into standard app athlete profile
  const formatAthleteUser = useCallback((supaUser, profileData = {}) => {
    if (!supaUser) return null;
    const meta = supaUser.user_metadata || {};
    const firstName = profileData.first_name || meta.first_name || '';
    const lastName = profileData.last_name || meta.last_name || '';
    const fullName =
      profileData.full_name ||
      meta.full_name ||
      [firstName, lastName].filter(Boolean).join(' ') ||
      supaUser.email?.split('@')[0] ||
      'Athlete';

    const cleansedAvatar =
      profileData.avatar_url && !isLogo(profileData.avatar_url)
        ? profileData.avatar_url
        : null;

    return enforceUserSubscriptionState({
      ...profileData,
      id: supaUser.id,
      email: supaUser.email || meta.email || '',
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      role: profileData.role || meta.role || 'athlete',
      subscription_plan: profileData.subscription_plan || profileData.plan || 'free',
      subscription_status: profileData.subscription_status || 'inactive',
      avatar_url: cleansedAvatar,
      photo_url: cleansedAvatar,
      onboarded: profileData.onboarded ?? true,
      created_at: profileData.created_at || supaUser.created_at || new Date().toISOString(),
    });
  }, []);

  const loadSessionInFlightRef = useRef(null);
  const lastLoadedTokenRef = useRef('');

  // Load user from Supabase session (deduplicated across concurrent mounts/events)
  const loadSupabaseSessionUser = useCallback(() => {
    if (loadSessionInFlightRef.current) {
      return loadSessionInFlightRef.current;
    }
    const promise = (async () => {
    try {
      const storedToken = (() => {
        try {
          return localStorage.getItem('washek_auth_token') || '';
        } catch {
          return '';
        }
      })();
      const storedUserObj = (() => {
        try {
          const raw = localStorage.getItem('washek_user');
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();
      const storedEmail = storedUserObj?.email ? String(storedUserObj.email).toLowerCase().trim() : '';
      const isVaultTok =
        storedToken.startsWith('vault_tok_') || storedToken.startsWith('washek_sess_');

      // If user is authenticated via a Vault session, never overwrite with a leftover native Supabase session
      if (isVaultTok && storedUserObj?.email) {
        const refreshedVaultUser = await supabaseApi.auth.me(true).catch(() => null);
        const resolvedVaultUser = preserveMonthlyKaelCount(
          enforceUserSubscriptionState(refreshedVaultUser || storedUserObj),
          storedUserObj
        );
        setUser(resolvedVaultUser);
        setIsAuthenticated(true);
        try {
          localStorage.setItem('washek_user', JSON.stringify(resolvedVaultUser));
          syncSubscriptionStorageKeys(resolvedVaultUser);
          const nextPlan = normalizePlan(resolvedVaultUser?.subscription_plan);
          if (
            typeof window !== 'undefined' &&
            nextPlan !== 'free' &&
            isActiveSubscriptionStatus(resolvedVaultUser?.subscription_status)
          ) {
            window.dispatchEvent(
              new CustomEvent('washek_subscription_updated', {
                detail: {
                  plan: nextPlan,
                  status: resolvedVaultUser.subscription_status || 'active',
                },
              })
            );
          }
        } catch {
          // ignore
        }
        return resolvedVaultUser;
      }

      let session = null;
      try {
        const { data } = await supabase.auth.getSession();
        const sEmail = data?.session?.user?.email
          ? String(data.session.user.email).toLowerCase().trim()
          : '';
        if (!storedEmail || !sEmail || sEmail === storedEmail) {
          session = data?.session || null;
        }
      } catch (_sErr) {
        // session query note
      }

      // If no active session but genuine JWT/refresh tokens are in localStorage, attempt recovery or refresh
      if (!session) {
        const nativeSession = readNativeSupabaseStorageSession();
        const nativeEmail = nativeSession?.user?.email
          ? String(nativeSession.user.email).toLowerCase().trim()
          : '';
        const token =
          storedToken && !isVaultTok
            ? storedToken
            : (!storedEmail || !nativeEmail || nativeEmail === storedEmail)
              ? nativeSession?.access_token || ''
              : '';
        const refreshToken =
          localStorage.getItem('washek_refresh_token') ||
          (!isVaultTok && (!storedEmail || !nativeEmail || nativeEmail === storedEmail)
            ? nativeSession?.refresh_token
            : '') ||
          '';

        if (!isVaultTok && refreshToken) {
          if (token && !token.startsWith('vault_tok_') && !token.startsWith('washek_sess_')) {
            try {
              session = await syncClientSessionSafely({
                access_token: token,
                refresh_token: refreshToken,
              });
            } catch (_rErr) {
              // recovery note
            }
          }
          if (!session?.access_token) {
            session = await refreshSupabaseSessionLocked(refreshToken);
          }
        }
      }

      // Refresh proactively if token is expired or within 60s of expiry
      if (session?.access_token && session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
        const refreshed = await refreshSupabaseSessionLocked(
          session.refresh_token || localStorage.getItem('washek_refresh_token') || ''
        );
        if (refreshed?.access_token) {
          session = refreshed;
        }
      }

      if (session?.access_token) {
        lastLoadedTokenRef.current = session.access_token;
        try {
          localStorage.setItem('washek_auth_token', session.access_token);
          if (session.refresh_token) {
            localStorage.setItem('washek_refresh_token', session.refresh_token);
          }
        } catch {
          // ignore
        }
      }

      if (session?.user) {
        try {
          const profileUser = await supabaseApi.auth.me(true);
          if (profileUser) {
            setUser(profileUser);
            setIsAuthenticated(true);
            try {
              localStorage.setItem('washek_user', JSON.stringify(profileUser));
              syncSubscriptionStorageKeys(profileUser);
              const nextPlan = normalizePlan(profileUser?.subscription_plan);
              if (
                typeof window !== 'undefined' &&
                nextPlan !== 'free' &&
                isActiveSubscriptionStatus(profileUser?.subscription_status)
              ) {
                window.dispatchEvent(
                  new CustomEvent('washek_subscription_updated', {
                    detail: {
                      plan: nextPlan,
                      status: profileUser.subscription_status || 'active',
                    },
                  })
                );
              }
            } catch (err) {
              console.debug('[AUTH] Storage note:', err);
            }
            return profileUser;
          }
        } catch {
          const fallbackUser = preserveMonthlyKaelCount(formatAthleteUser(session.user), storedUserObj);
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
    } catch (err) {
      console.debug('[AUTH] Session load note:', err);
    }
    return null;
    })();
    loadSessionInFlightRef.current = promise;
    return promise.finally(() => {
      if (loadSessionInFlightRef.current === promise) {
        loadSessionInFlightRef.current = null;
      }
    });
  }, [formatAthleteUser]);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const sessionUser = await loadSupabaseSessionUser();
      if (sessionUser) {
        return sessionUser;
      }

      // Check if local storage has a cached user session - leave user logged in!
      const stored = localStorage.getItem('washek_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.email) {
            setUser(parsed);
            setIsAuthenticated(true);
            return parsed;
          }
        } catch {
          // ignore
        }
      }

      setUser(null);
      setIsAuthenticated(false);
      return null;
    } catch (error) {
      console.warn('[AUTH] Auth check error:', error?.message || error);
      return null;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, [loadSupabaseSessionUser]);

  // Listen to Supabase auth state changes
  useEffect(() => {
    let mounted = true;

    // Initial check
    loadSupabaseSessionUser().then(async (loaded) => {
      if (!mounted) return;
      let resolvedUser = loaded;
      if (!resolvedUser) {
        const stored = localStorage.getItem('washek_user');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.email) {
              resolvedUser = parsed;
              setUser(parsed);
              setIsAuthenticated(true);

              // Background check - only log out if account was explicitly marked deleted
              fetch('/api/auth/verify-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: parsed.email }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (mounted && d?.deleted === true) {
                    localStorage.removeItem('washek_user');
                    localStorage.removeItem('washek_auth_token');
                    localStorage.removeItem('washek_refresh_token');
                    setUser(null);
                    setIsAuthenticated(false);
                  }
                })
                .catch(() => {});
            }
          } catch {
            // ignore
          }
        }
      }

      // Cross-partition entitlement check whenever loaded user is not already on an active Elite plan
      if (
        mounted &&
        resolvedUser &&
        (normalizePlan(resolvedUser.subscription_plan) !== 'elite' ||
          !isActiveSubscriptionStatus(resolvedUser.subscription_status))
      ) {
        try {
          const ent = await fetchServerEntitlement({
            userId: resolvedUser.id,
            email: resolvedUser.email,
            cancelledAtIso: resolvedUser.subscription_cancelled_at || null,
          });
          const curActive = isActiveSubscriptionStatus(resolvedUser.subscription_status);
          const curRank = curActive ? getPlanRank(resolvedUser.subscription_plan) : 0;
          const entRank = ent?.active ? getPlanRank(ent.plan) : 0;
          if (mounted && ent?.active && ent.plan && ent.plan !== 'free' && (!curActive || entRank > curRank)) {
            applySubscriptionUpgrade(ent.plan, ent.status, {
              persistReceipt: true,
              timestamp: ent.timestamp,
              syncServer: false,
            });
            setUser((prev) =>
              prev
                ? {
                    ...prev,
                    subscription_plan: ent.plan,
                    subscription_status: ent.status,
                    tier: ent.plan,
                    plan: ent.plan,
                    subscription_tier: ent.plan,
                    subscription_cancelled_at: null,
                  }
                : prev
            );
          }
        } catch {
          // ignore server entitlement probe error
        }
      }

      if (mounted) {
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    });

    const { data: supaListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
          const activeToken = (() => {
            try {
              return localStorage.getItem('washek_auth_token') || '';
            } catch {
              return '';
            }
          })();
          const activeEmail = (() => {
            try {
              const raw = localStorage.getItem('washek_user');
              const parsed = raw ? JSON.parse(raw) : null;
              return parsed?.email ? String(parsed.email).toLowerCase().trim() : '';
            } catch {
              return '';
            }
          })();
          const sessionEmail = session?.user?.email
            ? String(session.user.email).toLowerCase().trim()
            : '';
          if (
            (activeToken.startsWith('vault_tok_') || activeToken.startsWith('washek_sess_')) ||
            (activeEmail && sessionEmail && activeEmail !== sessionEmail)
          ) {
            return;
          }

          const incomingToken = session?.access_token || '';
          const tokenUnchanged =
            Boolean(incomingToken) && incomingToken === lastLoadedTokenRef.current;

          if (incomingToken) {
            try {
              localStorage.setItem('washek_auth_token', incomingToken);
              if (session.refresh_token) {
                localStorage.setItem('washek_refresh_token', session.refresh_token);
              }
            } catch {
              // ignore
            }
          }

          if (tokenUnchanged && event !== 'USER_UPDATED') {
            return;
          }

          invalidateCurrentUserCache();
          if (session?.user) {
            // Defer outside Supabase's internal auth lock callback to prevent getSession/setSession deadlocks
            window.setTimeout(() => {
              if (mounted) {
                loadSupabaseSessionUser();
              }
            }, 0);
          }
        } else if (event === 'SIGNED_OUT') {
          const activeToken = (() => {
            try {
              return localStorage.getItem('washek_auth_token') || '';
            } catch {
              return '';
            }
          })();
          if (activeToken.startsWith('vault_tok_') || activeToken.startsWith('washek_sess_')) {
            return;
          }
          lastLoadedTokenRef.current = '';
          invalidateCurrentUserCache();
          setUser(null);
          setIsAuthenticated(false);
          try {
            localStorage.removeItem('washek_user');
            localStorage.removeItem('washek_auth_token');
            localStorage.removeItem('washek_refresh_token');
          } catch (_e) {
            // Ignore cleanup error
          }
        }
      }
    );

    return () => {
      mounted = false;
      supaListener?.subscription?.unsubscribe?.();
    };
  }, [loadSupabaseSessionUser]);

  // Listen to avatar changes
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

  // Listen to subscription plan updates across the app
  useEffect(() => {
    const handleSubUpdated = (e) => {
      const rawPlan = e.detail?.plan ?? e.detail?.subscription_plan;
      const rawStatus = e.detail?.status ?? e.detail?.subscription_status;
      if (rawPlan || rawStatus) {
        const requestedPlan = normalizePlan(rawPlan || 'free');
        const nextStatus = String(
          rawStatus || (requestedPlan === 'free' ? 'canceled' : 'active')
        ).toLowerCase().trim();
        const isActive = requestedPlan !== 'free' && isActiveSubscriptionStatus(nextStatus);
        const effectivePlan = isActive ? requestedPlan : 'free';
        setUser((prev) => {
          if (!prev) return prev;
          const updated = enforceUserSubscriptionState({
            ...prev,
            subscription_plan: effectivePlan,
            subscription_status: nextStatus,
            tier: effectivePlan,
            plan: effectivePlan,
            subscription_tier: effectivePlan,
          });
          try {
            localStorage.setItem('washek_user', JSON.stringify(updated));
            if (!isActive) {
              localStorage.removeItem('washek_subscription_plan');
              localStorage.setItem('washek_subscription_status', updated.subscription_status);
            } else {
              localStorage.setItem('washek_subscription_plan', effectivePlan);
              localStorage.setItem('washek_subscription_status', nextStatus);
            }
          } catch (_err) {
            // ignore
          }
          return updated;
        });
      }
    };

    window.addEventListener('washek_subscription_updated', handleSubUpdated);
    window.addEventListener('washek_user_changed', handleSubUpdated);

    const handleSessionRecovered = (e) => {
      const recoveredUser = e.detail?.session?.user;
      const profileData = e.detail?.profile;
      if (recoveredUser?.id || profileData?.id) {
        setUser((prev) => {
          const updated = preserveMonthlyKaelCount(
            enforceUserSubscriptionState({
              ...(prev || {}),
              ...(profileData || {}),
              id: recoveredUser?.id || profileData?.id || prev?.id,
              email: recoveredUser?.email || profileData?.email || prev?.email || '',
              onboarded: prev?.onboarded ?? profileData?.onboarded ?? true,
            }),
            prev
          );
          try {
            localStorage.setItem('washek_user', JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
        setIsAuthenticated(true);
      }
    };
    window.addEventListener('washek_session_recovered', handleSessionRecovered);

    return () => {
      window.removeEventListener('washek_subscription_updated', handleSubUpdated);
      window.removeEventListener('washek_user_changed', handleSubUpdated);
      window.removeEventListener('washek_session_recovered', handleSessionRecovered);
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      return data;
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
    lastLoadedTokenRef.current = '';
    invalidateCurrentUserCache();

    const cleanEmail = email.trim();
    let authSucceeded = false;
    let finalProfile = null;
    let lastError = null;

    try {
      // Authenticate with Supabase via backend proxy
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await response.json();

      if (response.ok && (data?.user || data?.profile)) {
        authSucceeded = true;
        const u = data.user || {};
        const p = data.profile || {};
        const meta = u.user_metadata || {};
        const fullName =
          p.full_name ||
          meta.full_name ||
          [p.first_name || meta.first_name, p.last_name || meta.last_name].filter(Boolean).join(' ') ||
          cleanEmail.split('@')[0] ||
          'Athlete';

        finalProfile = enforceUserSubscriptionState({
          ...p,
          id: u.id || p.id,
          email: u.email || p.email || cleanEmail,
          first_name: p.first_name || meta.first_name || '',
          last_name: p.last_name || meta.last_name || '',
          full_name: fullName,
          role: p.role || meta.role || 'athlete',
          subscription_plan: p.subscription_plan || p.plan || 'free',
          subscription_status: p.subscription_status || 'inactive',
        });

        if (data.serverSessionToken) {
          try {
            localStorage.setItem('washek_srv_session', data.serverSessionToken);
          } catch {
            // ignore
          }
        }

        if (data.session?.access_token) {
          try {
            localStorage.setItem('washek_auth_token', data.session.access_token);
            if (data.session.refresh_token) {
              localStorage.setItem('washek_refresh_token', data.session.refresh_token);
              await syncClientSessionSafely({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              });
            } else if (data.isVaultSession) {
              // Server /api/auth/signin already verified against Supabase and fell back to vault;
              // clear stale refresh tokens and any mismatched native session instead of leaking a prior account JWT.
              localStorage.removeItem('washek_refresh_token');
              try {
                const { data: nativeData } = await supabase.auth.getSession();
                const nativeEmail = nativeData?.session?.user?.email
                  ? String(nativeData.session.user.email).toLowerCase().trim()
                  : '';
                if (nativeEmail && nativeEmail !== cleanEmail.toLowerCase()) {
                  await supabase.auth.signOut({ scope: 'local' });
                }
              } catch {
                // ignore local signOut cleanup errors
              }
            } else {
              // Non-vault token missing refresh token: try browser signInWithPassword once
              try {
                const { data: directData } = await supabase.auth.signInWithPassword({
                  email: cleanEmail,
                  password,
                });
                if (directData?.session?.access_token) {
                  localStorage.setItem('washek_auth_token', directData.session.access_token);
                  if (directData.session.refresh_token) {
                    localStorage.setItem('washek_refresh_token', directData.session.refresh_token);
                  }
                  if (directData.user?.id) {
                    finalProfile.id = directData.user.id;
                  }
                }
              } catch {
                // keep existing session without triggering SIGNED_OUT
              }
            }
          } catch (tokenErr) {
            console.debug('[AUTH] Token storage note:', tokenErr);
          }
        }

        if (finalProfile.onboarded === true) {
          markUserOnboarded(finalProfile.id, cleanEmail);
        } else if (
          finalProfile.onboarded === false &&
          (isUserMarkedOnboarded(finalProfile.id, cleanEmail) ||
            Boolean(finalProfile.active_program_id || finalProfile.last_program_generated_at))
        ) {
          finalProfile.onboarded = true;
        }
      } else {
        const srvErr = new Error(data?.error || 'Invalid email or password.');
        srvErr.code = data?.code || 'auth/invalid-credential';
        srvErr.reason = data?.reason;
        srvErr.suggestion = data?.suggestion;
        srvErr.targetEmail = data?.email || cleanEmail;
        lastError = srvErr;
      }
    } catch (err) {
      console.debug('[AUTH] Signin error:', err);
      const netErr = new Error('Invalid email or password. Please verify your credentials or create an athlete account.');
      netErr.code = 'auth/invalid-credential';
      lastError = netErr;
    }

    if (authSucceeded && finalProfile) {
      try {
        localStorage.removeItem('washek_subscription_cancelled_at');
        localStorage.removeItem('washek_redirect_upgrade_receipt');
        localStorage.removeItem('washek_recent_upgrade');
        if (
          finalProfile.subscription_plan &&
          finalProfile.subscription_plan !== 'free' &&
          isActiveSubscriptionStatus(finalProfile.subscription_status)
        ) {
          localStorage.setItem('washek_subscription_plan', finalProfile.subscription_plan);
          localStorage.setItem('washek_subscription_status', finalProfile.subscription_status);
        } else {
          localStorage.removeItem('washek_subscription_plan');
          localStorage.setItem(
            'washek_subscription_status',
            finalProfile.subscription_status || 'inactive'
          );
        }
        localStorage.setItem('washek_user', JSON.stringify(finalProfile));
      } catch (err) {
        console.debug('[AUTH] Storage note:', err);
      }
      setUser(finalProfile);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      return finalProfile;
    }

    setIsLoadingAuth(false);
    const friendlyMsg =
      lastError?.message ||
      'Invalid email or password. Please verify your credentials or create an athlete account.';
    const finalErr = new Error(friendlyMsg);
    if (lastError?.code) finalErr.code = lastError.code;
    if (lastError?.reason) finalErr.reason = lastError.reason;
    if (lastError?.suggestion) finalErr.suggestion = lastError.suggestion;
    finalErr.targetEmail = lastError?.targetEmail || cleanEmail;

    setAuthError({
      type: 'email_sign_in',
      message: friendlyMsg,
      code: finalErr.code,
      reason: finalErr.reason,
      suggestion: finalErr.suggestion,
      targetEmail: finalErr.targetEmail,
    });
    throw finalErr;
  }, []);

  const signUpWithEmail = useCallback(async (email, password, metadata = {}) => {
    setIsLoadingAuth(true);
    setAuthError(null);
    lastLoadedTokenRef.current = '';
    invalidateCurrentUserCache();

    const cleanEmail = email.trim();
    const firstName = (metadata?.firstName || '').trim();
    const lastName = (metadata?.lastName || '').trim();
    const fullName =
      [firstName, lastName].filter(Boolean).join(' ').trim() || cleanEmail.split('@')[0] || 'Athlete';

    try {
      // Primary signup via server proxy (creates Supabase account, profile, & session)
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          metadata: {
            firstName,
            lastName,
            fullName,
          },
        }),
      });

      const data = await response.json();

      if (response.ok && (data?.user || data?.profile)) {
        const u = data.user || {};
        const p = data.profile || {};
        const meta = u.user_metadata || {};
        const resolvedName =
          p.full_name ||
          fullName ||
          meta.full_name ||
          cleanEmail.split('@')[0] ||
          'Athlete';

        const isBrandNewAccount = data?.isNewAccount !== false;
        const finalProfile = enforceUserSubscriptionState({
          ...p,
          id: u.id || p.id,
          email: u.email || cleanEmail,
          first_name: firstName || p.first_name || meta.first_name || '',
          last_name: lastName || p.last_name || meta.last_name || '',
          full_name: resolvedName,
          role: p.role || meta.role || 'athlete',
          onboarded: p.onboarded ?? (isBrandNewAccount ? false : true),
          subscription_plan: p.subscription_plan || 'free',
          subscription_status: p.subscription_status || 'inactive',
        });

        if (isBrandNewAccount && finalProfile.onboarded !== true) {
          markNewAccountForQuickStart(finalProfile);
        }

        if (data.serverSessionToken) {
          try {
            localStorage.setItem('washek_srv_session', data.serverSessionToken);
          } catch {
            // ignore
          }
        }

        if (data.session?.access_token) {
          try {
            localStorage.setItem('washek_auth_token', data.session.access_token);
            if (data.session.refresh_token) {
              localStorage.setItem('washek_refresh_token', data.session.refresh_token);
              await syncClientSessionSafely({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              });
            } else if (data.isVaultSession) {
              localStorage.removeItem('washek_refresh_token');
            }
          } catch (tokenErr) {
            console.debug('[AUTH] Token store note:', tokenErr);
          }
        }

        try {
          localStorage.removeItem('washek_subscription_cancelled_at');
          localStorage.removeItem('washek_redirect_upgrade_receipt');
          localStorage.removeItem('washek_recent_upgrade');
          if (
            finalProfile.subscription_plan &&
            finalProfile.subscription_plan !== 'free' &&
            isActiveSubscriptionStatus(finalProfile.subscription_status)
          ) {
            localStorage.setItem('washek_subscription_plan', finalProfile.subscription_plan);
            localStorage.setItem('washek_subscription_status', finalProfile.subscription_status);
          } else {
            localStorage.removeItem('washek_subscription_plan');
            localStorage.setItem(
              'washek_subscription_status',
              finalProfile.subscription_status || 'inactive'
            );
          }
          localStorage.setItem('washek_user', JSON.stringify(finalProfile));
        } catch {
          // ignore
        }
        setUser(finalProfile);
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        return finalProfile;
      }

      const srvErr = new Error(data?.error || 'Registration failed.');
      srvErr.code = data?.code || 'auth/signup-failed';
      throw srvErr;
    } catch (err) {
      setIsLoadingAuth(false);
      setAuthError({
        type: 'email_sign_up',
        message: err?.message || 'Failed to create athlete account.',
        code: err?.code,
      });
      throw err;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      let uid = user?.id;
      let email = user?.email;

      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          uid = data.user.id;
          email = data.user.email;
        }
      } catch (_authErr) {
        // ignore
      }

      // Invoke Supabase delete-account Edge Function first if active JWT session exists (cancels Stripe subscription + cleans storage/auth)
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken && accessToken.split('.').length === 3) {
          await supabase.functions.invoke('delete-account', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
        }
      } catch (edgeErr) {
        console.debug('[AUTH] Supabase delete-account edge note:', edgeErr);
      }

      // Purge from backend database and credential vault
      try {
        await fetch('/api/user/delete-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, email }),
        });
      } catch (srvErr) {
        console.debug('[AUTH] Server delete account note:', srvErr);
      }

      // Delete Supabase session if active
      try {
        await supabase.auth.signOut().catch(() => {});
      } catch (supaErr) {
        console.debug('[AUTH] Supabase cleanup note:', supaErr);
      }

      // Clear all cached data across storage
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore storage error */
      }

      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      return true;
    } finally {
      setIsLoadingAuth(false);
    }
  }, [user]);

  const changePassword = useCallback(async ({ newPassword, currentPassword, email, recoveryCode }) => {
    const cleanNewPass = (newPassword || '').trim();
    if (!cleanNewPass || cleanNewPass.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    const token = localStorage.getItem('washek_auth_token') || '';
    const targetEmail = (email || user?.email || '').trim().toLowerCase();

    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        newPassword: cleanNewPass,
        currentPassword: currentPassword ? String(currentPassword) : undefined,
        email: targetEmail || undefined,
        accessToken: token || undefined,
        recoveryCode: recoveryCode ? String(recoveryCode).trim() : undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Unable to update password. Please check your credentials and try again.');
    }

    return data;
  }, [user?.email]);

  const resetPassword = useCallback(async (email) => {
    const cleanEmail = (email || '').trim();
    if (!cleanEmail) {
      throw new Error('Please enter your email address.');
    }

    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    const data = await response.json();
    if (response.ok && data?.success) {
      return true;
    }

    throw new Error(data?.error || 'Password reset request failed.');
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut().catch(() => {});
    } catch (err) {
      console.warn('[AUTH] Sign out error:', err);
    } finally {
      lastLoadedTokenRef.current = '';
      invalidateCurrentUserCache();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      try {
        localStorage.removeItem('washek_auth_token');
        localStorage.removeItem('washek_refresh_token');
        localStorage.removeItem('washek_srv_session');
        localStorage.removeItem('washek_user');
        localStorage.removeItem('washek_subscription_plan');
        localStorage.removeItem('washek_subscription_status');
        localStorage.removeItem('washek_subscription_cancelled_at');
        localStorage.removeItem('washek_recent_upgrade');
        localStorage.removeItem('washek_redirect_upgrade_receipt');
        localStorage.removeItem('washek_pending_checkout_plan');
        localStorage.removeItem('washek_pending_checkout_session_id');
        localStorage.removeItem('washek_pending_checkout_started_at');
      } catch (err) {
        console.debug('[AUTH] Storage cleanup error:', err);
      }
    }
  }, []);

  const syncSupabaseSession = useCallback(async (session, profileData = null, serverSessionToken = '') => {
    if (!session?.access_token) return null;
    lastLoadedTokenRef.current = session.access_token;
    invalidateCurrentUserCache();
    try {
      localStorage.setItem('washek_auth_token', session.access_token);
      if (session.refresh_token) {
        localStorage.setItem('washek_refresh_token', session.refresh_token);
      }
      if (serverSessionToken) {
        localStorage.setItem('washek_srv_session', serverSessionToken);
      }
      await syncClientSessionSafely({
        access_token: session.access_token,
        refresh_token: session.refresh_token || localStorage.getItem('washek_refresh_token') || '',
      });
    } catch {
      // ignore storage/session errors
    }

    const updatedUser = formatAthleteUser(
      session.user || { id: profileData?.id, email: profileData?.email || user?.email },
      profileData || {}
    );
    if (updatedUser) {
      updatedUser.onboarded = user?.onboarded ?? profileData?.onboarded ?? true;
      setUser(updatedUser);
      setIsAuthenticated(true);
      try {
        localStorage.setItem('washek_user', JSON.stringify(updatedUser));
      } catch {
        // ignore
      }
    }
    return updatedUser;
  }, [formatAthleteUser, user]);

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
        changePassword,
        deleteAccount,
        resetPassword,
        logout,
        syncSupabaseSession,
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
