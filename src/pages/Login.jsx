import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, ArrowRight, KeyRound, CheckCircle2, Mail, AlertTriangle, UserX } from 'lucide-react';
import { BRAND_LOGO_SRC, handleBrandLogoError } from '@/lib/brandLogo';

export default function Login() {
  const navigate = useNavigate();
  const { signInWithEmail, signUpWithEmail, resetPassword } = useAuth();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Granular diagnostic feedback banner
  const [diagnosticNotice, setDiagnosticNotice] = useState(null);
  const [existingAccountNotice, setExistingAccountNotice] = useState(null);
  const [quickResetSent, setQuickResetSent] = useState(false);
  const [quickResetLoading, setQuickResetLoading] = useState(false);
  const [inlineResetOpen, setInlineResetOpen] = useState(false);
  const [inlineNewPassword, setInlineNewPassword] = useState('');
  const [inlineResetLoading, setInlineResetLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('deleted') === 'true') {
      toast.success('Your account has been permanently deleted.');
    }
  }, []);

  const handleInstantReset = async (targetEmail) => {
    const clean = (targetEmail || email || '').trim();
    if (!clean) {
      toast.error('Please enter your email address first.');
      return;
    }
    if (!inlineNewPassword || inlineNewPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    setInlineResetLoading(true);
    try {
      const res = await fetch('/api/auth/instant-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean, newPassword: inlineNewPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Unable to update password.');
      }
      toast.success('Password updated! Signing in to your account…');
      if (data?.session?.access_token) {
        localStorage.setItem('washek_auth_token', data.session.access_token);
      }
      if (data?.profile || data?.user) {
        localStorage.setItem('washek_user', JSON.stringify(data.profile || data.user));
      }
      await signInWithEmail(clean, inlineNewPassword);
      navigate('/');
    } catch (err) {
      toast.error(err?.message || 'Failed to update password.');
    } finally {
      setInlineResetLoading(false);
    }
  };

  const handleQuickReset = async (targetEmail) => {
    const clean = (targetEmail || email || '').trim();
    if (!clean) {
      toast.error('Please enter your email address first.');
      return;
    }
    setQuickResetLoading(true);
    try {
      await resetPassword(clean);
      setQuickResetSent(true);
      toast.success(`Password reset code generated and sent for ${clean}`);
    } catch (err) {
      toast.error(err?.message || 'Unable to send password reset email.');
    } finally {
      setQuickResetLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error('Please enter your email address.');
      return;
    }

    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!firstName.trim()) {
          toast.error('Please enter your first name.');
          setLoading(false);
          return;
        }

        try {
          await signUpWithEmail(cleanEmail, password, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          });
          toast.success('Account created! Welcome to WASHEK.');
          navigate('/');
        } catch (signupErr) {
          const errText = signupErr?.message || '';
          const isEmailInUse =
            signupErr?.code === 'auth/email-already-in-use' ||
            errText.toLowerCase().includes('already exists') ||
            errText.toLowerCase().includes('already in use') ||
            errText.toLowerCase().includes('already registered');

          if (isEmailInUse) {
            // Attempt signing in immediately in case user entered existing password
            try {
              await signInWithEmail(cleanEmail, password);
              toast.success('Welcome back to WASHEK!');
              navigate('/');
              return;
            } catch {
              // Seamlessly switch to login tab with clear resolution guidance
              setMode('login');
              setExistingAccountNotice(cleanEmail);
              toast.info('Account already exists for this email. Please sign in below or reset your password.');
              return;
            }
          }
          throw signupErr;
        }
      } else {
        await signInWithEmail(cleanEmail, password);
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (error) {
      console.debug('[Auth Note]', error?.message || error);
      const rawMsg = error?.message || '';
      const reason = error?.reason || (error?.code === 'auth/wrong-password' ? 'incorrect_password' : error?.code === 'auth/user-not-found' ? 'user_not_found' : null);
      const targetEmail = error?.targetEmail || cleanEmail;

      if (reason === 'incorrect_password' || error?.code === 'auth/wrong-password' || rawMsg.toLowerCase().includes('password you entered does not match')) {
        setDiagnosticNotice({
          type: 'incorrect_password',
          email: targetEmail,
          title: `Incorrect Password for ${targetEmail}`,
          message: `An active athlete account exists for this email address, but the password entered did not match.`,
          suggestion: 'reset_password',
        });
        toast.error(`Incorrect password for ${targetEmail}. Please check your password or reset it below.`);
      } else if (reason === 'user_not_found' || error?.code === 'auth/user-not-found' || rawMsg.toLowerCase().includes('no athlete account found') || rawMsg.toLowerCase().includes('must create an account')) {
        setDiagnosticNotice({
          type: 'user_not_found',
          email: targetEmail,
          title: 'No Athlete Account Found',
          message: `No active athlete account was found for ${targetEmail}. You must create an account first before signing in.`,
          suggestion: 'create_account',
        });
        toast.error(`No athlete account found for ${targetEmail}. Please create an account first.`);
      } else if (reason === 'email_not_confirmed' || error?.code === 'auth/email-not-confirmed') {
        setDiagnosticNotice({
          type: 'email_not_confirmed',
          email: targetEmail,
          title: 'Email Confirmation Required',
          message: `Your account for ${targetEmail} requires email confirmation before signing in.`,
          suggestion: 'resend_confirmation',
        });
        toast.error(`Email confirmation pending for ${targetEmail}.`);
      } else {
        setDiagnosticNotice({
          type: 'error',
          email: targetEmail,
          title: 'Sign In Failed',
          message: rawMsg || 'Authentication failed. Please verify your credentials.',
          suggestion: 'retry',
        });
        toast.error(rawMsg || 'Authentication failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (e) => {
    e.preventDefault();
    const resetEmail = forgotEmail.trim();

    if (!resetEmail) {
      toast.error('Enter the email you used to create your account.');
      return;
    }

    setForgotLoading(true);
    try {
      if (resetPassword) {
        await resetPassword(resetEmail);
      }
      toast.success('Password reset instructions have been sent to your email.');
      setForgotEmail('');
      setShowForgotPassword(false);
    } catch (error) {
      toast.error(error?.message || 'Unable to send password reset email.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center px-6 py-12 safe-top safe-bottom overflow-hidden selection:bg-primary/20">
      {/* Mega Glowing Ambient Atmosphere */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-primary/20 dark:bg-primary/25 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-blue-600/15 dark:bg-blue-600/20 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed top-20 left-10 w-80 h-80 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex relative mb-5 group">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/60 via-blue-500/40 to-primary/30 blur-lg opacity-80 group-hover:opacity-100 transition duration-500" />
            <img
              src={BRAND_LOGO_SRC}
              onError={handleBrandLogoError}
              alt="WASHEK"
              className="relative w-20 h-20 rounded-2xl object-cover shadow-[0_0_30px_rgba(37,99,235,0.4)] border border-primary/40 dark:border-primary/50"
            />
          </div>

          <div className="flex items-center justify-center mb-2">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground drop-shadow-sm">
              WASHEK
            </h1>
          </div>

          <p className="text-sm text-muted-foreground font-medium">
            Next-Generation Performance Coaching & Biometrics
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-card/95 backdrop-blur-2xl border border-primary/30 dark:border-primary/40 rounded-3xl p-7 shadow-[0_0_55px_rgba(37,99,235,0.22)] dark:shadow-[0_0_65px_rgba(37,99,235,0.28)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]">


          {/* Granular Diagnostic Authentication Feedback Banner */}
          {diagnosticNotice && mode === 'login' && (
            <div
              className={`mb-5 p-4 rounded-2xl border shadow-[0_0_25px_rgba(37,99,235,0.22)] relative overflow-hidden ${
                diagnosticNotice.type === 'incorrect_password'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                  : diagnosticNotice.type === 'user_not_found'
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-200'
                    : 'bg-primary/10 border-primary/40 text-foreground'
              }`}
            >
              <div className="relative z-10 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {diagnosticNotice.type === 'incorrect_password' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : diagnosticNotice.type === 'user_not_found' ? (
                      <UserX className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <KeyRound className="w-4 h-4 text-primary shrink-0" />
                    )}
                    <span className="font-heading font-bold text-xs uppercase tracking-wider text-foreground">
                      {diagnosticNotice.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiagnosticNotice(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    aria-label="Dismiss notice"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {diagnosticNotice.message}
                </p>

                {diagnosticNotice.type === 'incorrect_password' && (
                  <div className="pt-2 space-y-3">
                    {inlineResetOpen ? (
                      <div className="p-3 rounded-xl bg-background/80 border border-amber-500/30 space-y-2">
                        <span className="text-[11px] font-semibold text-foreground block">
                          Set New Password for {diagnosticNotice.email}
                        </span>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder="Min 6 characters"
                            value={inlineNewPassword}
                            onChange={(e) => setInlineNewPassword(e.target.value)}
                            minLength={6}
                            autoComplete="new-password"
                            className="rounded-lg h-9 bg-background/90 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={inlineResetLoading || inlineNewPassword.length < 6}
                            onClick={() => handleInstantReset(diagnosticNotice.email)}
                            className="h-9 px-3 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 shrink-0"
                          >
                            {inlineResetLoading ? 'Updating…' : 'Save & Sign In'}
                          </Button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInlineResetOpen(false)}
                          className="text-[10px] text-muted-foreground hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setInlineResetOpen(true)}
                          className="h-8 px-3 text-xs font-semibold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-sm flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Set New Password Now</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={quickResetLoading || quickResetSent}
                          onClick={() => handleQuickReset(diagnosticNotice.email)}
                          className="h-8 px-3 text-xs font-semibold rounded-xl border-amber-500/40 bg-card hover:bg-amber-500/15 text-amber-400 shadow-sm flex items-center gap-1.5"
                        >
                          {quickResetLoading ? (
                            <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          ) : quickResetSent ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                              <span>Code Generated</span>
                            </>
                          ) : (
                            <>
                              <Mail className="w-3.5 h-3.5" />
                              <span>Email / Code Reset</span>
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/reset-password?email=${encodeURIComponent(diagnosticNotice.email)}`)}
                          className="h-8 px-2.5 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <span>Reset Page</span>
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {diagnosticNotice.type === 'user_not_found' && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setMode('signup');
                        setDiagnosticNotice(null);
                      }}
                      className="h-8 px-3 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5"
                    >
                      <span>Create Account with this Email</span>
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fallback Existing Account Banner */}
          {!diagnosticNotice && existingAccountNotice && mode === 'login' && (
            <div className="mb-5 p-4 rounded-2xl bg-primary/10 border border-primary/40 shadow-[0_0_25px_rgba(37,99,235,0.22)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/15 rounded-full blur-xl pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-heading font-bold text-xs text-foreground uppercase tracking-wider">
                      Existing Account Found
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExistingAccountNotice(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  An account is already registered for <span className="text-foreground font-semibold font-mono text-[11px]">{existingAccountNotice}</span>. Enter your password to sign in, or click below to send a password reset link.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={quickResetLoading || quickResetSent}
                    onClick={() => handleQuickReset(existingAccountNotice)}
                    className="h-8 px-3 text-xs font-semibold rounded-xl border-primary/40 bg-card hover:bg-primary/15 text-primary shadow-[0_0_15px_rgba(37,99,235,0.25)] flex items-center gap-1.5"
                  >
                    {quickResetLoading ? (
                      <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : quickResetSent ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                        <span>Reset Email Sent</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" />
                        <span>Send Password Reset Link</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary focus:shadow-[0_0_15px_rgba(37,99,235,0.25)] transition-all"
                  required
                />
                <Input
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary focus:shadow-[0_0_15px_rgba(37,99,235,0.25)] transition-all"
                />
              </div>
            )}

            <Input
              type="email"
              placeholder="athlete@washek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary focus:shadow-[0_0_15px_rgba(37,99,235,0.25)] transition-all"
              required
            />

            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary focus:shadow-[0_0_15px_rgba(37,99,235,0.25)] transition-all"
              required
            />

            {mode === 'login' && (
              <div className="flex justify-center text-center">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors text-center"
                  onClick={() => {
                    setForgotEmail(email);
                    setShowForgotPassword(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-2xl font-bold font-heading text-sm bg-primary text-primary-foreground hover:bg-primary/95 transition-all duration-200 active:scale-[0.98] shadow-[0_0_24px_rgba(37,99,235,0.45)] hover:shadow-[0_0_35px_rgba(37,99,235,0.65)] border border-primary/40 flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                'Processing…'
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Athlete Profile'}</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>

            <button
              type="button"
              className="w-full pt-2 text-xs text-muted-foreground hover:text-primary font-medium text-center transition-colors"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setExistingAccountNotice(null);
              }}
            >
              {mode === 'login'
                ? "Don't have an account yet? Create one"
                : 'Already have an account? Sign in'}
            </button>
          </form>

          {/* Security & Sync Pill */}
          <div className="mt-6 pt-5 border-t border-border/40 dark:border-white/5 flex flex-col items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80 font-medium">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>Encrypted cloud persistence</span>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              By signing in, you agree to WASHEK's{' '}
              <a href="/terms" className="underline hover:text-foreground">Terms</a> and{' '}
              <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>.
            </p>
          </div>
        </div>

        {/* Forgot Password Modal */}
        {showForgotPassword && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-md px-6">
            <div className="w-full max-w-md rounded-3xl border border-border/80 dark:border-white/15 bg-card p-6 shadow-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <h2 className="font-heading text-xl font-bold text-foreground">
                Reset Password
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your email address and we'll send you instructions to regain access to your account.
              </p>

              <form onSubmit={sendPasswordReset} className="mt-5 space-y-4">
                <Input
                  type="email"
                  placeholder="athlete@washek.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="rounded-xl h-11 bg-background/60"
                  required
                />

                <Button
                  type="submit"
                  className="w-full h-11 rounded-xl"
                  disabled={forgotLoading}
                >
                  {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                </Button>

                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:text-foreground text-center"
                  onClick={() => setShowForgotPassword(false)}
                  disabled={forgotLoading}
                >
                  Back to Sign In
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
