import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// AuthContext — the single source of truth for "who is logged in".
// Wrap the app with <AuthProvider> at the top, then call useAuth() from any component.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get the current session on mount (handles page refreshes).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Subscribe to auth state changes (login, logout, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  // Coach detection — matches the is_coach() SQL function.
  // Coach is identified by user_metadata.role === 'admin'.
  const isCoach = user?.user_metadata?.role === 'admin';

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  const value = { session, user, isCoach, loading, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
