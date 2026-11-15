import { createClient } from '@supabase/supabase-js';

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://edvvwnaxmjuvwnxineph.supabase.co';
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_hR5RWMT6qfPKbONf3G783A_Log5r61I';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

let inFlightRefreshPromise = null;

/**
 * Finds the stored Supabase native auth token entry across any sb-*-auth-token localStorage key.
 */
export function readNativeSupabaseStorageSession() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const preferredKey = 'sb-edvvwnaxmjuvwnxineph-auth-token';
    const rawPreferred = localStorage.getItem(preferredKey);
    if (rawPreferred) {
      const parsed = JSON.parse(rawPreferred);
      if (parsed?.access_token || parsed?.refresh_token) return parsed;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.access_token || parsed?.refresh_token) return parsed;
        } catch {
          // ignore malformed entry
        }
      }
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

/**
 * Deduplicates concurrent Supabase refreshSession() calls so single-use refresh tokens are never raced.
 */
export async function refreshSupabaseSessionLocked(explicitRefreshToken = '') {
  if (inFlightRefreshPromise) {
    return await inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    try {
      const nativeSession = readNativeSupabaseStorageSession();
      const candidateRefresh =
        nativeSession?.refresh_token ||
        explicitRefreshToken ||
        (() => {
          try {
            return localStorage.getItem('washek_refresh_token') || '';
          } catch {
            return '';
          }
        })();

      const { data, error } = await supabase.auth.refreshSession(
        candidateRefresh ? { refresh_token: candidateRefresh } : undefined
      );

      if (!error && data?.session?.access_token) {
        try {
          localStorage.setItem('washek_auth_token', data.session.access_token);
          if (data.session.refresh_token) {
            localStorage.setItem('washek_refresh_token', data.session.refresh_token);
          }
        } catch {
          // ignore storage errors
        }
        return data.session;
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return await inFlightRefreshPromise;
}

/**
 * Persists Supabase session tokens and synchronizes the client SDK without risking lock deadlocks.
 */
export async function syncClientSessionSafely(session, timeoutMs = 1500) {
  if (!session?.access_token) return null;
  try {
    localStorage.setItem('washek_auth_token', session.access_token);
    if (session.refresh_token) {
      localStorage.setItem('washek_refresh_token', session.refresh_token);
    }
  } catch {
    // ignore storage write errors
  }

  const refreshTok =
    session.refresh_token ||
    (() => {
      try {
        return localStorage.getItem('washek_refresh_token') || '';
      } catch {
        return '';
      }
    })();

  if (!refreshTok) {
    return session;
  }

  try {
    const result = await Promise.race([
      supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: refreshTok,
      }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: { session }, error: null, timedOut: true }), timeoutMs)
      ),
    ]);
    return result?.data?.session || session;
  } catch {
    return session;
  }
}

