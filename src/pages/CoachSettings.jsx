import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

// Coach settings page. Currently houses the global welcome message that
// shows on every client's dashboard. Built to grow — additional global
// settings (default rest timer, default units, etc.) can drop into the
// same Section pattern.
//
// Storage lives in app_settings (key/value). RLS only allows admins to write.
export default function CoachSettings() {
  const { user } = useAuth();

  const [welcome, setWelcome]     = useState('');
  const [original, setOriginal]   = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [savedHint, setSavedHint] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'welcome_message')
        .maybeSingle();
      if (e) setError(e.message);
      // value is jsonb so it deserializes as a JS string
      const text = typeof data?.value === 'string' ? data.value : '';
      setWelcome(text);
      setOriginal(text);
      setLoading(false);
    })();
  }, []);

  const dirty = welcome !== original;

  async function save() {
    setSaving(true);
    setError('');
    const { error: e } = await supabase
      .from('app_settings')
      .upsert(
        {
          key:        'welcome_message',
          value:      welcome,            // supabase-js stringifies for jsonb
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        },
        { onConflict: 'key' }
      );
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    setOriginal(welcome);
    setSavedHint('Saved');
    setTimeout(() => setSavedHint(''), 1500);
  }

  // Live preview using the same {first_name} substitution clients see.
  const preview = (welcome || '').replace(/\{first_name\}/gi, 'Sarah');

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Settings</p>
        <h1 className="text-3xl font-playfair font-semibold mt-1">Coach Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tweak how the app looks for your clients.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-card border border-border p-5">
            <p className="font-medium">Welcome message</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Shows at the top of every client's dashboard. Use{' '}
              <code className="px-1 py-0.5 rounded bg-secondary text-foreground">{'{first_name}'}</code>{' '}
              to drop in their first name.
            </p>

            <textarea
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Welcome back, {first_name} 💪"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-[11px] text-muted-foreground">{welcome.length}/200</p>
              {savedHint && (
                <p className="text-xs text-primary inline-flex items-center gap-1">
                  <Check size={12} /> {savedHint}
                </p>
              )}
            </div>

            {/* Live preview */}
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Preview</p>
              <div className="rounded-xl bg-gradient-to-br from-primary to-teal-700 text-primary-foreground px-5 py-4">
                <p className="text-lg font-playfair font-semibold">
                  {preview || 'Welcome back, Sarah 👋'}
                </p>
                <p className="text-xs opacity-70 mt-1">As your clients will see it</p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              {dirty && (
                <button
                  onClick={() => setWelcome(original)}
                  className="px-4 py-2 rounded-lg border border-input bg-card hover:bg-secondary transition text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
