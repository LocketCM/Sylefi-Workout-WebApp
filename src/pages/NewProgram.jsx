import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Intermediate step: pick a client + title, insert a draft program row,
// then bounce the coach straight into the editor at /coach/programs/:id.
// Accepts ?client=<uuid> from the Programs list "Build Program" shortcut.
export default function NewProgram() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetClient = params.get('client') ?? '';

  const [clients, setClients]   = useState([]);
  const [clientId, setClientId] = useState(presetClient);
  const [title, setTitle]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('status', 'active')
        .order('first_name');
      if (error) setError(error.message);
      else setClients(data ?? []);
    })();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const client = clients.find((c) => c.id === clientId);
    if (!client) {
      setBusy(false);
      setError('Please pick a client');
      return;
    }

    // client_name is denormalized so the Programs list can show it without
    // a join. We resync it any time the program is saved.
    const { data, error: insertErr } = await supabase
      .from('programs')
      .insert({
        client_id:   clientId,
        client_name: `${client.first_name} ${client.last_name}`,
        title:       title.trim() || `${client.first_name}'s Program`,
        status:      'draft',
        workouts:    [],
      })
      .select()
      .single();

    setBusy(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    navigate(`/coach/programs/${data.id}`);
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Link to="/coach/programs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={14} /> Back to Programs
      </Link>

      <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
      <h1 className="text-3xl font-playfair font-semibold mt-1 mb-6">New Program</h1>

      <form onSubmit={handleCreate} className="space-y-4 rounded-xl bg-card border border-border p-6">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Client</label>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
          {clients.length === 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              No active clients yet. <Link to="/coach/clients" className="text-primary hover:underline">Invite one first.</Link>
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Program Title <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Strength Foundations"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Leave blank and we'll name it "{'{client}'}'s Program".
          </p>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={busy || !clientId}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create & Open Editor'}
        </button>
      </form>
    </div>
  );
}
