import { useEffect, useState } from 'react';
import { X, Search, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Reusable modal: pick an active client.
// Used for two flows:
//   1. Assigning an unassigned draft program in place
//   2. Cloning a template to create a new program for a client
//
// Props:
//   title         — heading text
//   confirmLabel  — primary button text
//   onClose       — () => void
//   onConfirm     — (client) => Promise<void>  (parent decides what to do)
export default function AssignClientModal({ title, confirmLabel, onClose, onConfirm }) {
  const [clients, setClients] = useState([]);
  const [q, setQ]             = useState('');
  const [picked, setPicked]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

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

  const filtered = q.trim()
    ? clients.filter((c) =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q.toLowerCase())
      )
    : clients;

  async function handleConfirm() {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(picked);
    } catch (err) {
      setError(err.message ?? String(err));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-5 shadow-xl animate-fade-in max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-playfair font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            placeholder="Search clients…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1 mb-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {clients.length === 0 ? 'No active clients yet.' : 'No matches.'}
            </p>
          ) : filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setPicked(c)}
              className={`w-full text-left rounded-lg border p-3 transition flex items-center gap-3 ${
                picked?.id === c.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-background hover:border-primary/60'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-muted-foreground">
                {c.first_name[0]}{c.last_name[0]}
              </div>
              <p className="font-medium text-sm">{c.first_name} {c.last_name}</p>
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!picked || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm disabled:opacity-50"
          >
            <UserPlus size={15} /> {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
