import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkRecoverySession = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (mounted && data?.session) {
          setReady(true);
        }
      } finally {
        if (mounted) setCheckingSession(false);
      }
    };

    checkRecoverySession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true);
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

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

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      toast.success('Password updated successfully.');
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error?.message || 'Unable to update your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/washek-fitness-logo.jpg"
            alt="WASHEK"
            className="w-24 h-24 rounded-3xl object-contain mx-auto mb-5"
          />

          <h1 className="font-heading text-3xl font-bold">
            WASHEK
          </h1>

          <p className="text-muted-foreground mt-2">
            Reset your password.
          </p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-6">
          {checkingSession ? (
            <p className="text-sm text-muted-foreground text-center">
              Checking your reset link…
            </p>
          ) : ready ? (
            <form onSubmit={updatePassword} className="space-y-4">
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />

              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />

              <Button
                type="submit"
                className="w-full h-12"
                disabled={loading}
              >
                {loading ? 'Updating…' : 'Update Password'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This password reset link is invalid or has expired. Please request a new one from the sign-in page.
              </p>

              <Button
                type="button"
                className="w-full h-12"
                onClick={() => navigate('/login', { replace: true })}
              >
                Back to Sign In
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
