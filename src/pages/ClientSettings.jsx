import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

// Client-facing settings page. Currently lets a client choose their preferred
// weight unit (lbs or kg) and toggle dark/light mode. Designed to grow over
// time — add new sections by dropping them into the main column.
export default function ClientSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [client, setClient]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [savedHint, setSavedHint] = useState('');
  const [dark, setDark] = useState(() => localStorage.getItem('sw-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sw-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error: e } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (e) setError(e.message);
      else setClient(data);
      setLoading(false);
    })();
  }, [user?.id]);

  async function setUnit(nextUnit) {
    if (!client || client.weight_unit === nextUnit) return;
    setError('');
    // Optimistic UI — flip immediately, roll back on failure.
    const previous = client.weight_unit;
    setClient({ ...client, weight_unit: nextUnit });
    const { error: e } = await supabase
      .from('clients')
      .update({ weight_unit: nextUnit })
      .eq('id', client.id);
    if (e) {
      setError(e.message);
      setClient({ ...client, weight_unit: previous });
      return;
    }
    setSavedHint('Saved');
    setTimeout(() => setSavedHint(''), 1500);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-xl mx-auto p-4 sm:p-6">
        <button
          onClick={() => navigate('/client')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Settings</p>
          <h1 className="text-3xl font-playfair font-semibold mt-1">Your Preferences</h1>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !client ? (
          <p className="text-sm text-muted-foreground">Couldn't load your profile.</p>
        ) : (
          <div className="space-y-4">
            {/* Weight unit */}
            <Section
              title="Weight unit"
              hint="Choose how weights show across the app. We don't convert numbers — this is just a label."
            >
              <div className="flex gap-2">
                <UnitButton
                  active={client.weight_unit === 'lbs'}
                  onClick={() => setUnit('lbs')}
                >
                  Pounds (lbs)
                </UnitButton>
                <UnitButton
                  active={client.weight_unit === 'kg'}
                  onClick={() => setUnit('kg')}
                >
                  Kilograms (kg)
                </UnitButton>
              </div>
              {savedHint && (
                <p className="mt-2 text-xs text-primary inline-flex items-center gap-1">
                  <Check size={12} /> {savedHint}
                </p>
              )}
            </Section>

            {/* Theme */}
            <Section
              title="Appearance"
              hint="Pick the look that's easier on your eyes. Saved on this device."
            >
              <button
                onClick={() => setDark(!dark)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-input bg-card hover:bg-secondary transition"
              >
                {dark ? <Sun size={16} /> : <Moon size={16} />}
                {dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              </button>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <p className="font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{hint}</p>}
      {children}
    </div>
  );
}

function UnitButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card border-input hover:border-primary/60'
      }`}
    >
      {children}
    </button>
  );
}
