import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Sparkles, Shield, ArrowRight } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      toast.success('Welcome back, Athlete!');
      navigate('/');
    } catch (err) {
      console.error('[Google Sign In Error]', err);
      toast.error(err?.message || 'Google sign-in could not be completed.');
    } finally {
      setGoogleLoading(false);
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

        await signUpWithEmail(cleanEmail, password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        toast.success('Account created! Welcome to WASHEK.');
        navigate('/');
      } else {
        await signInWithEmail(cleanEmail, password);
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (error) {
      console.error('[Auth Error]', error);
      const msg = error?.message || 'Authentication failed. Please verify your credentials.';
      toast.error(msg);
      if (mode === 'signup' && msg.toLowerCase().includes('already exists')) {
        setMode('login');
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
      {/* Ambient Luxury Atmospheric Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex relative mb-5 group">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-primary/50 to-primary/20 blur-md opacity-75 group-hover:opacity-100 transition duration-500" />
            <img
              src="/washek-fitness-logo.jpg"
              alt="WASHEK"
              className="relative w-20 h-20 rounded-2xl object-cover shadow-2xl border border-white/10 dark:border-white/15"
            />
          </div>

          <div className="flex items-center justify-center mb-2">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
              WASHEK
            </h1>
          </div>

          <p className="text-sm text-muted-foreground font-medium">
            Next-Generation Performance Coaching & Biometrics
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-card/90 backdrop-blur-xl border border-border/80 dark:border-white/10 rounded-3xl p-7 shadow-2xl dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-2xl bg-secondary/80 hover:bg-secondary text-foreground font-medium text-sm border border-border/80 dark:border-white/10 transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow"
          >
            {googleLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60 dark:border-white/10" />
            </div>
            <span className="relative bg-card px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              or continue with email
            </span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary"
                  required
                />
                <Input
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary"
                />
              </div>
            )}

            <Input
              type="email"
              placeholder="athlete@washek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary"
              required
            />

            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className="rounded-xl h-11 bg-background/50 border-border/70 dark:border-white/10 text-sm focus:border-primary"
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
              className="w-full h-11 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 active:scale-[0.98] shadow-md shadow-primary/20 flex items-center justify-center gap-2"
              disabled={loading || googleLoading}
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
              className="w-full pt-2 text-xs text-muted-foreground hover:text-foreground font-medium text-center transition-colors"
              onClick={() =>
                setMode(mode === 'login' ? 'signup' : 'login')
              }
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
