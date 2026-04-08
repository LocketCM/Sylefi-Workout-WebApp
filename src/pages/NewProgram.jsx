import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, FolderPlus, User, Bookmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Intermediate step: pick a destination (client / unassigned / template) + title,
// insert a draft program row, then bounce the coach into the editor at
// /coach/programs/:id. Accepts ?client=<uuid> from the Programs list shortcut.
//
// Three modes:
//   client     — assigned to a specific client (the original behavior)
//   unassigned — built without a client; assigned later from the editor
//   template   — reusable; cloned each time it's used for a real client
export default function NewProgram() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetClient = params.get('client') ?? '';

  const [clients, setClients]   = useState([]);
  const [mode, setMode]         = useState('client');
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

    let payload = {
      title:    title.trim(),
      status:   'draft',
      workouts: [],
    };

    if (mode === 'client') {
      const client = clients.find((c) => c.id === clientId);
      if (!client) {
        setBusy(false);
        setError('Please pick a client.');
        return;
      }
      payload.client_id   = clientId;
      payload.client_name = `${client.first_name} ${client.last_name}`;
      payload.is_template = false;
      if (!payload.title) payload.title = `${client.first_name}'s Program`;
    } else if (mode === 'unassigned') {
      payload.client_id   = null;
      payload.client_name = null;
      payload.is_template = false;
      if (!payload.title) payload.title = 'Untitled Draft';
    } else {
      // template
      payload.client_id   = null;
      payload.client_name = null;
      payload.is_template = true;
      if (!payload.title) payload.title = 'Untitled Template';
    }

    const { data, error: insertErr } = await supabase
      .from('programs')
      .insert(payload)
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

      <form onSubmit={handleCreate} className="space-y-5 rounded-xl bg-card border border-border p-6">
        {/* Mode picker */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">What are you building?</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <ModeCard
              active={mode === 'client'}
              onClick={() => setMode('client')}
              icon={User}
              label="For a client"
              desc="Assign now"
            />
            <ModeCard
              active={mode === 'unassigned'}
              onClick={() => setMode('unassigned')}
              icon={FolderPlus}
              label="Unassigned"
              desc="Assign later"
            />
            <ModeCard
              active={mode === 'template'}
              onClick={() => setMode('template')}
              icon={Bookmark}
              label="Template"
              desc="Reuse anytime"
            />
          </div>
        </div>

        {/* Client picker — only when mode === 'client' */}
        {mode === 'client' && (
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
                {' '}Or build an Unassigned draft / Template instead.
              </p>
            )}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {mode === 'template' ? 'Template Name' : 'Program Title'}{' '}
            <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              mode === 'template'  ? 'e.g. 4-Week Hypertrophy' :
              mode === 'unassigned'? 'e.g. Strength Foundations' :
                                     'e.g. Strength Foundations'
            }
            className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={busy || (mode === 'client' && !clientId)}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create & Open Editor'}
        </button>
      </form>
    </div>
  );
}

function ModeCard({ active, onClick, icon: Icon, label, desc }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition ${
        active
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background hover:border-primary/60'
      }`}
    >
      <Icon size={16} className={active ? 'text-primary mb-1.5' : 'text-muted-foreground mb-1.5'} />
      <p className="font-medium text-sm">{label}</p>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
    </button>
  );
}
