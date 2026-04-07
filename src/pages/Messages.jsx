import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import MessageThread from '@/components/MessageThread';

// Coach Messages page — split view (clients on the left, thread on the right).
// On mobile we collapse to one panel at a time.
//
// Pre-selects a client via ?client=<uuid> if provided.
export default function Messages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preselect = searchParams.get('client');

  const [clients, setClients]       = useState([]);
  const [previews, setPreviews]     = useState({}); // clientId -> { lastBody, lastAt, unread }
  const [activeId, setActiveId]     = useState(preselect ?? null);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    load();
    const ch = supabase
      .channel('coach-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients'  }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: cls, error: cErr }, { data: msgs, error: mErr }] = await Promise.all([
      supabase.from('clients').select('id, first_name, last_name, status').eq('status', 'active').order('first_name'),
      supabase.from('messages').select('client_id, sender_role, content, read, created_at').order('created_at', { ascending: false }),
    ]);
    if (cErr || mErr) { setError((cErr ?? mErr).message); setLoading(false); return; }

    // Build a per-client preview/unread map from the (already DESC-sorted) message list.
    const map = {};
    for (const m of msgs ?? []) {
      const cur = map[m.client_id] ?? { lastBody: null, lastAt: null, unread: 0 };
      if (cur.lastBody === null) {
        cur.lastBody = m.content;
        cur.lastAt   = m.created_at;
      }
      if (!m.read && m.sender_role === 'client') cur.unread += 1;
      map[m.client_id] = cur;
    }

    setClients(cls ?? []);
    setPreviews(map);
    setError('');
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const needle = search.toLowerCase();
    return clients.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(needle));
  }, [clients, search]);

  // Sort by most recent message first, then alpha for those with no messages.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aAt = previews[a.id]?.lastAt;
      const bAt = previews[b.id]?.lastAt;
      if (aAt && bAt) return bAt.localeCompare(aAt);
      if (aAt) return -1;
      if (bAt) return 1;
      return a.first_name.localeCompare(b.first_name);
    });
  }, [filtered, previews]);

  const activeClient = clients.find((c) => c.id === activeId);

  function selectClient(id) {
    setActiveId(id);
    setSearchParams({ client: id });
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen flex flex-col">
      <div className="px-6 pt-6 pb-3">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
        <h1 className="text-3xl font-playfair font-semibold mt-1">Messages</h1>
      </div>

      {error && (
        <div className="mx-6 mb-3 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="flex-1 min-h-0 flex border-t border-border">
        {/* Client list */}
        <aside className={`${activeId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-border bg-card`}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-muted-foreground p-4">Loading…</p>
            ) : sorted.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4">No clients yet.</p>
            ) : (
              sorted.map((c) => {
                const p = previews[c.id] ?? {};
                const isActive = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectClient(c.id)}
                    className={`w-full text-left p-3 border-b border-border transition flex items-start gap-3 ${
                      isActive ? 'bg-primary/10' : 'hover:bg-secondary'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-medium flex-shrink-0">
                      {c.first_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm truncate">{c.first_name} {c.last_name}</p>
                        {p.lastAt && (
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {shortTime(p.lastAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {p.lastBody ?? <em>No messages yet</em>}
                        </p>
                        {p.unread > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center px-1">
                            {p.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className={`${activeId ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0 bg-background`}>
          {activeClient ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button
                  onClick={() => { setActiveId(null); setSearchParams({}); }}
                  className="md:hidden text-sm text-muted-foreground"
                >
                  ← Back
                </button>
                <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-medium">
                  {activeClient.first_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{activeClient.first_name} {activeClient.last_name}</p>
                  <p className="text-xs text-muted-foreground">Client</p>
                </div>
              </div>
              <MessageThread
                clientId={activeClient.id}
                senderRole="coach"
                peerName={activeClient.first_name}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Pick a client to start chatting</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function shortTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
