import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function PageNotFound() {
  const location = useLocation();
  const { user, authChecked } = useAuth();
  const pageName = location.pathname.substring(1);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2"><h1 className="text-7xl font-light text-muted-foreground/40">404</h1><div className="h-0.5 w-16 bg-border mx-auto" /></div>
        <div className="space-y-3"><h2 className="text-2xl font-medium">Page Not Found</h2><p className="text-muted-foreground leading-relaxed">The page <span className="font-medium text-foreground/80">"{pageName}"</span> could not be found in this application.</p></div>
        {authChecked && user?.role === 'admin' && <div className="p-4 bg-muted rounded-lg border border-border text-left"><p className="text-sm font-medium">Admin Note</p><p className="text-sm text-muted-foreground mt-1">This route is not registered in the Supabase-backed application.</p></div>}
        <button onClick={() => { window.location.href = user ? '/' : '/login'; }} className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors">Go Home</button>
      </div>
    </div>
  );
}
