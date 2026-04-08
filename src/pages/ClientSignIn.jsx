import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import logoUrl from '/sylefi-logo.webp';

// Returning-client sign-in. Each active client has a permanent 12-character
// access_code generated when they first claimed their invite. They (or Meg)
// can bookmark a URL like /#/signin?code=AB12CD34EF56 to always get back in.
//
// Flow:
//   1. Sign in anonymously (always — even if there's an existing session,
//      we want a fresh anon user that we can rebind cleanly)
//   2. Call client_signin RPC, which validates the code and re-binds
//      clients.user_id to the new anonymous auth.uid()
//   3. Land at /client
export default function ClientSignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCode = (params.get('code') ?? '').toUpperCase();

  const [code, setCode]     = useState(initialCode);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState(null); // {first_name} after success

  useEffect(() => {
    if (initialCode && initialCode.length >= 8) {
      handleSignIn(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignIn(rawCode) {
    setBusy(true);
    setError('');
    const trimmed = (rawCode ?? code).trim().toUpperCase();
    if (trimmed.length < 8) {
      setBusy(false);
      setError('Please enter your full 12-character sign-in code.');
      return;
    }

    // Always sign out first so we start from a clean slate. Anonymous users
    // can't really "switch" — we need a fresh anon user to rebind to.
    try { await supabase.auth.signOut(); } catch { /* ignore */ }

    const { error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr) {
      setBusy(false);
      setError('Could not start a session: ' + anonErr.message);
      return;
    }

    const { data, error: rpcErr } = await supabase.rpc('client_signin', { p_code: trimmed });
    if (rpcErr) {
      setBusy(false);
      setError(rpcErr.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setBusy(false);
      setError("That sign-in code didn't match any client. Double-check with your coach.");
      return;
    }

    setSuccess(row);
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    setTimeout(() => navigate('/client'), 1200);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src={logoUrl}
            alt="Sylefi Wellness"
            className="w-24 h-24 rounded-full object-cover shadow-md mb-4"
          />
          <h1 className="text-2xl font-playfair font-semibold text-center">
            Welcome back
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Sylefi Wellness</p>
        </div>

        {!success ? (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSignIn(); }}
            className="space-y-4 animate-fade-in"
          >
            <div className="rounded-lg bg-secondary/60 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
              <KeyRound size={14} className="flex-shrink-0 mt-0.5" />
              <p>
                Enter your personal 12-character sign-in code. This is the long
                code your coach gave you — different from the one-time invite code.
              </p>
            </div>

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AB12CD34EF56"
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              className="w-full px-4 py-3 rounded-lg border border-input bg-card text-center text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || code.length < 8}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              First-time client?{' '}
              <Link to="/join" className="text-primary hover:underline">
                Join with an invite code
              </Link>
            </p>
          </form>
        ) : (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 text-primary flex items-center justify-center mb-4 animate-celebrate">
              <Check size={32} />
            </div>
            <p className="font-playfair font-semibold text-xl mb-1">
              Welcome back, {success.first_name}!
            </p>
            <p className="text-sm text-muted-foreground">Taking you to your dashboard…</p>
          </div>
        )}

        <Link to="/" className="block mt-8 text-center text-xs text-muted-foreground hover:text-foreground">
          ← Back home
        </Link>
      </div>
    </div>
  );
}
