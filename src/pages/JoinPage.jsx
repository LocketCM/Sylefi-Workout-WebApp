import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import logoUrl from '/sylefi-logo.webp';

// Three-step client onboarding:
// 1. Verify code → look up clients row, check expiry + code_used
// 2. Collect email/phone (optional polish on what coach already has)
// 3. Sign in anonymously → link auth user to clients row → redirect to /client
export default function JoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCode = (params.get('code') ?? '').toUpperCase();

  const [step, setStep] = useState('verify'); // 'verify' | 'profile' | 'done'
  const [code, setCode] = useState(initialCode);
  const [client, setClient] = useState(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Auto-verify if a code came in via URL. If it's longer than 6 chars
  // it's a returning-client sign-in code, not a first-time invite — bounce
  // to /signin so the right flow handles it.
  useEffect(() => {
    if (initialCode && initialCode.length > 6) {
      navigate(`/signin?code=${encodeURIComponent(initialCode)}`, { replace: true });
      return;
    }
    if (initialCode && initialCode.length >= 4) {
      verifyCode(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyCode(rawCode) {
    setBusy(true);
    setError('');
    const trimmed = (rawCode ?? code).trim().toUpperCase();
    if (trimmed.length < 4) {
      setBusy(false);
      setError('Please enter your full code.');
      return;
    }
    // If they typed a longer code into the invite box, route them to the
    // returning-client sign-in page where it actually belongs.
    if (trimmed.length > 6) {
      setBusy(false);
      navigate(`/signin?code=${encodeURIComponent(trimmed)}`);
      return;
    }

    // We're not signed in yet, so RLS would normally block this read.
    // Solution: sign in anonymously *first*, then the policies that grant
    // authenticated users access to their own row will let us look this up.
    // We'll bind the user_id only after the client confirms.
    const { error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr) {
      setBusy(false);
      setError('Could not start a session: ' + anonErr.message);
      return;
    }

    // Look up the code via SECURITY DEFINER RPC so RLS doesn't block us
    // before the user_id is bound. The function only returns the row if
    // the code is unused and unexpired, and only the safe fields.
    const { data, error: lookupErr } = await supabase
      .rpc('verify_invite_code', { p_code: trimmed });

    if (lookupErr) {
      setBusy(false);
      setError(lookupErr.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setBusy(false);
      setError('That code doesn\'t match any invite, or it has expired or already been used. Double-check with your coach.');
      return;
    }

    setClient(row);
    setEmail(data.email ?? '');
    setPhone(data.phone ?? '');
    setStep('profile');
    setBusy(false);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  async function completeJoin(e) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError('');

    // Atomic claim via SECURITY DEFINER function — binds user_id, sets active,
    // marks code used. Re-validates the code server-side so it can't be replayed.
    const { error: claimErr } = await supabase.rpc('claim_invite', {
      p_code:  code.trim().toUpperCase(),
      p_email: email,
      p_phone: phone,
    });

    if (claimErr) {
      setBusy(false);
      setError(claimErr.message);
      return;
    }

    setStep('done');
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    setTimeout(() => navigate('/client'), 1500);
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
            Join Sylefi Wellness
          </h1>
        </div>

        {step === 'verify' && (
          <form
            onSubmit={(e) => { e.preventDefault(); verifyCode(); }}
            className="space-y-4 animate-fade-in"
          >
            <p className="text-sm text-muted-foreground text-center">
              Enter the 6-character code your coach sent you.
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={32}
              autoCapitalize="characters"
              autoCorrect="off"
              className="w-full px-4 py-3 rounded-lg border border-input bg-card text-center text-2xl font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={busy || code.length < 4}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? 'Verifying…' : 'Verify Code'}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              Returning client?{' '}
              <Link to="/signin" className="text-primary hover:underline">
                Sign in with your personal code
              </Link>
            </p>
          </form>
        )}

        {step === 'profile' && client && (
          <form onSubmit={completeJoin} className="space-y-4 animate-fade-in">
            <div className="rounded-lg bg-secondary p-4 text-center">
              <p className="text-xs text-muted-foreground">Welcome,</p>
              <p className="font-playfair font-semibold text-lg">
                {client.first_name} {client.last_name}
              </p>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Confirm your contact details so your coach can reach you.
            </p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Phone (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/15 text-primary flex items-center justify-center mb-4 animate-celebrate">
              <Check size={32} />
            </div>
            <p className="font-playfair font-semibold text-xl mb-1">You're in!</p>
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
