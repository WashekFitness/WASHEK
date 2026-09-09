import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              first_name: firstName.trim(),
            },
          },
        });

        if (error) throw error;

        toast.success(
          'Account created. Check your email if confirmation is enabled.'
        );

        navigate('/');
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) throw error;

        navigate('/');
      }
    } catch (error) {
      toast.error(
        error?.message || 'Authentication failed.'
      );
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
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        resetEmail,
        { redirectTo }
      );

      if (error) throw error;

      toast.success('If an account exists for that email, a password reset link has been sent.');
      setForgotEmail('');
      setShowForgotPassword(false);
    } catch (error) {
      toast.error(
        error?.message || 'Unable to send the password reset email.'
      );
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <img
            src="/washek-fitness-logo.jpg"
            alt="WASHEK"
            className="w-24 h-24 rounded-3xl object-contain mx-auto mb-5"
          />

          <h1 className="font-heading text-3xl font-bold">
            WASHEK
          </h1>

          <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1">
            Weighted Athletic System for Hybrid &amp; Elite Kalisthenics
          </p>

          <p className="text-muted-foreground mt-2">
            Your AI-powered training coach.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 bg-card border border-border rounded-3xl p-6"
        >
          {mode === 'signup' && (
            <Input
              placeholder="First name"
              value={firstName}
              onChange={(e) =>
                setFirstName(e.target.value)
              }
              required
            />
          )}

          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />

          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            minLength={6}
            required
          />

          {mode === 'login' && (
            <button
              type="button"
              className="w-full text-right text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setForgotEmail(email);
                setShowForgotPassword(true);
              }}
            >
              Forgot password?
            </button>
          )}

          <Button
            type="submit"
            className="w-full h-12"
            disabled={loading}
          >
            {loading
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </Button>

          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-foreground"
            onClick={() =>
              setMode(
                mode === 'login'
                  ? 'signup'
                  : 'login'
              )
            }
          >
            {mode === 'login'
              ? 'Need an account? Create one'
              : 'Already have an account? Sign in'}
          </button>
        </form>

        {showForgotPassword && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
            <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="font-heading text-xl font-bold">Forgot password?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter the email you used to create your WASHEK account and we’ll send you a password reset link.
              </p>

              <form onSubmit={sendPasswordReset} className="mt-5 space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoComplete="email"
                  required
                />

                <Button
                  type="submit"
                  className="w-full h-12"
                  disabled={forgotLoading}
                >
                  {forgotLoading ? 'Sending…' : 'Send Reset Email'}
                </Button>

                <button
                  type="button"
                  className="w-full text-sm text-muted-foreground hover:text-foreground"
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
