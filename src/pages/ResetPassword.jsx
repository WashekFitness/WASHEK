import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KeyRound, Shield, CheckCircle2, ArrowRight, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { BRAND_LOGO_SRC, handleBrandLogoError } from '@/lib/brandLogo';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // 1. Check for token in URL hash (e.g. #access_token=...&refresh_token=...&type=recovery)
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const hashParams = new URLSearchParams(hash);
    const tokenFromHash = hashParams.get('access_token');
    const typeFromHash = hashParams.get('type');

    // 2. Check for token or code in query params
    const tokenFromQuery = searchParams.get('token') || searchParams.get('access_token') || searchParams.get('code');
    const emailParam = searchParams.get('email');

    if (emailParam) {
      setEmail(emailParam.trim());
    }

    const token = tokenFromHash || tokenFromQuery;
    if (token) {
      setAccessToken(token);
      setHasToken(true);
      try {
        localStorage.setItem('washek_auth_token', token);
      } catch (err) {
        console.debug('[RESET] Token save note:', err);
      }
    } else {
      // Also check stored token if any
      const storedToken = localStorage.getItem('washek_auth_token');
      if (storedToken && typeFromHash === 'recovery') {
        setAccessToken(storedToken);
        setHasToken(true);
      }
    }
  }, [searchParams]);

  const handleSendResetEmail = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error('Please enter your email address.');
      return;
    }

    setSendingReset(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to send password reset email.');
      }
      if (data?.recoveryCode) {
        setRecoveryCode(data.recoveryCode);
        toast.success(`Recovery code generated: ${data.recoveryCode}. Enter your new password below.`);
      } else {
        toast.success(data?.message || `Password reset link and code sent to ${cleanEmail}`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to send password reset instructions.');
    } finally {
      setSendingReset(false);
    }
  };

  const updatePassword = async (e) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = recoveryCode.trim();

    if (!hasToken && !accessToken && !cleanCode) {
      toast.error('Please enter the 6-digit recovery code from your email or click the reset link in your email.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          newPassword: password,
          email: cleanEmail || undefined,
          accessToken: accessToken || undefined,
          recoveryCode: cleanCode || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to update your password. Please verify your recovery code.');
      }

      setSuccess(true);
      toast.success('Password updated successfully! Welcome back.');

      // If a session was returned, save it
      if (data?.session?.access_token) {
        try {
          localStorage.setItem('washek_auth_token', data.session.access_token);
        } catch {
          // ignore
        }
      }

      // Automatically redirect to login after short delay
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (error) {
      console.error('[RESET] Password update failed:', error);
      toast.error(error?.message || 'Unable to update your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center px-6 py-12 safe-top safe-bottom overflow-hidden selection:bg-primary/20">
      {/* Mega Glowing Ambient Atmosphere */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] bg-primary/20 dark:bg-primary/25 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-blue-600/15 dark:bg-blue-600/20 rounded-full blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex relative mb-4 group">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/60 via-blue-500/40 to-primary/30 blur-lg opacity-80" />
            <img
              src={BRAND_LOGO_SRC}
              onError={handleBrandLogoError}
              alt="WASHEK"
              className="relative w-20 h-20 rounded-2xl object-cover shadow-[0_0_30px_rgba(37,99,235,0.4)] border border-primary/40 dark:border-primary/50"
            />
          </div>

          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
            WASHEK
          </h1>

          <p className="text-sm text-muted-foreground font-medium mt-1">
            Account Security & Password Recovery
          </p>
        </div>

        <div className="bg-card/95 backdrop-blur-2xl border border-primary/30 dark:border-primary/40 rounded-3xl p-7 shadow-[0_0_55px_rgba(37,99,235,0.22)] dark:shadow-[0_0_65px_rgba(37,99,235,0.28)]">
          {success ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-lg text-foreground">Password Updated!</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Your password has been securely reset. Redirecting to sign in…
                </p>
              </div>
              <Button
                type="button"
                className="w-full h-11 rounded-xl"
                onClick={() => navigate('/login', { replace: true })}
              >
                Continue to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={updatePassword} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <span className="font-heading font-bold text-sm text-foreground">
                  {hasToken ? 'Enter Your New Password' : 'Reset Your Password'}
                </span>
              </div>

              {/* Email field if not provided by token */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Athlete Email
                </label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="athlete@washek.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl h-11 bg-background/50 border-border/70 text-sm"
                    required
                  />
                  {!hasToken && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSendResetEmail}
                      disabled={sendingReset || !email}
                      className="h-11 px-3 text-xs shrink-0 rounded-xl border-primary/30 text-primary hover:bg-primary/10"
                    >
                      {sendingReset ? (
                        <span className="inline-block w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Recovery code field if not token verified */}
              {!hasToken && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      6-Digit Recovery Code
                    </label>
                    <button
                      type="button"
                      onClick={handleSendResetEmail}
                      disabled={sendingReset || !email}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Resend Code
                    </button>
                  </div>
                  <Input
                    type="text"
                    placeholder="e.g. 123456"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    className="rounded-xl h-11 bg-background/50 border-border/70 font-mono text-sm tracking-wider"
                    required={!hasToken}
                  />
                  <p className="text-[10px] text-muted-foreground/80 mt-1">
                    Sent to your email address when you request a reset.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  New Password
                </label>
                <Input
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  className="rounded-xl h-11 bg-background/50 border-border/70 text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  autoComplete="new-password"
                  className="rounded-xl h-11 bg-background/50 border-border/70 text-sm"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-2xl font-bold font-heading text-sm bg-primary text-primary-foreground hover:bg-primary/95 transition-all duration-200 active:scale-[0.98] shadow-[0_0_24px_rgba(37,99,235,0.45)] hover:shadow-[0_0_35px_rgba(37,99,235,0.65)] border border-primary/40 flex items-center justify-center gap-2 mt-2"
                disabled={loading}
              >
                {loading ? (
                  'Updating Password…'
                ) : (
                  <>
                    <span>Save & Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <button
                type="button"
                className="w-full pt-1 text-xs text-muted-foreground hover:text-primary font-medium text-center transition-colors"
                onClick={() => navigate('/login', { replace: true })}
              >
                Back to Sign In
              </button>
            </form>
          )}

          <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70 font-medium">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>End-to-end encrypted password update</span>
          </div>
        </div>
      </div>
    </div>
  );
}
