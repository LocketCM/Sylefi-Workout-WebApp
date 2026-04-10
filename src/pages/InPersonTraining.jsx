import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, History, Search, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { LogWorkoutPickerModal } from '@/pages/Clients';

// Dedicated quick-access page for the clients Meg also trains in person.
//
// The flow on a studio day:
//   1. Open this page from the sidebar (one click)
//   2. Big tap-target cards, one per in-person client
//   3. Tap a card → workout picker modal → coach log session
//   4. Back here after finishing → next client
//
// No Edit modal in the way, no status filtering, no roster scrolling.
// Just the people she's physically seeing this week.
//
// We intentionally pull from the same `clients` table — this page is
// a view, not a separate list. Toggling the flag on a client in the
// Edit Client modal (or promoting/demoting one) instantly adds/removes
// them here via the clients realtime subscription.
export default function InPersonTraining() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [picker, setPicker]   = useState(null); // client whose workout picker is open

  useEffect(() => {
    load();
    // Keep the list live if Meg flips a client's in-person flag from
    // another tab / the Clients page mid-session.
    const ch = supabase
      .channel('inperson-clients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    setLoading(true);
    const { data, error: e } = await supabase
      .from('clients')
      .select('*')
      .eq('trains_in_person', true)
      .order('first_name', { ascending: true });
    if (e) setError(e.message);
    else { setClients(data ?? []); setError(''); }
    setLoading(false);
  }

  const filtered = search.trim()
    ? clients.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.display_name ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : clients;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
        <h1 className="text-3xl font-playfair font-semibold mt-1">In-Person Training</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quick access to clients you see in the studio. Tap any card to log today's session.
        </p>
      </div>

      {/* Search */}
      {clients.length > 0 && (
        <div className="relative mb-5 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clients.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No matches.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <ClientCard key={c.id} client={c} onLog={() => setPicker(c)} />
          ))}
        </div>
      )}

      {picker && (
        <LogWorkoutPickerModal client={picker} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

// One card per flagged client. The whole card is the "log workout" button
// because that's 95% of why Meg is on this page — the history link is a
// secondary action for when she wants to peek at last week's numbers
// before this session.
function ClientCard({ client, onLog }) {
  const name = client.display_name || `${client.first_name} ${client.last_name}`;
  return (
    <div className="rounded-xl border border-border bg-card hover:border-primary/60 transition overflow-hidden">
      <button
        onClick={onLog}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-primary/5 transition"
      >
        <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-playfair font-semibold text-lg flex-shrink-0">
          {(client.first_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{name}</p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Dumbbell size={11} /> Tap to log today's session
          </p>
        </div>
      </button>

      {/* Secondary actions — small, unobtrusive row along the bottom */}
      <div className="px-4 py-2 border-t border-border bg-background/50 flex items-center justify-between text-xs">
        {client.phone ? (
          <a
            href={`tel:${client.phone}`}
            className="text-muted-foreground hover:text-primary transition truncate"
            onClick={(e) => e.stopPropagation()}
            title={client.phone}
          >
            {client.phone}
          </a>
        ) : (
          <span className="text-muted-foreground/60 italic">No phone on file</span>
        )}
        <Link
          to={`/coach/clients/${client.id}/history`}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition flex-shrink-0 ml-2"
          title="View history"
        >
          <History size={12} /> History
        </Link>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <Dumbbell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="font-medium mb-1">No in-person clients yet</p>
      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
        Open any client from the <Link to="/coach/clients" className="text-primary underline">Clients</Link> page,
        tap the <Pencil size={12} className="inline align-middle" /> pencil to edit them, and flip the
        <strong className="text-foreground"> "I also train this client in person" </strong>
        toggle. They'll show up here automatically.
      </p>
    </div>
  );
}
