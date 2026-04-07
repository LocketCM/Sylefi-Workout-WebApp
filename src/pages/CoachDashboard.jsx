import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Mail, Dumbbell, MessageSquare, AlertTriangle, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

// Coach home — pulls live counts from Supabase. Realtime keeps them fresh.
// Pulls a friendly display name from Supabase user_metadata, falling back
// gracefully if no full_name has been set yet.
function getCoachName(user) {
  if (!user) return '';
  const meta = user.user_metadata ?? {};
  return meta.full_name || meta.first_name || meta.name || '';
}

export default function CoachDashboard() {
  const { user } = useAuth();
  const coachName = getCoachName(user);
  const [stats, setStats] = useState({
    activeClients:     null,
    pendingInvites:    null,
    publishedPrograms: null,
    unreadMessages:    null,
  });
  const [stalePrograms, setStalePrograms] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
    loadStale();
    // Refresh stats whenever clients/programs/messages change.
    const ch = supabase
      .channel('dashboard-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' },  () => { loadStats(); loadStale(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programs' }, () => { loadStats(); loadStale(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, loadStats)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // "Stale" = a published program that hasn't been re-published in 3+ weeks.
  // Meg asked for this because clients can drift if their plan goes too long
  // without an update.
  async function loadStale() {
    const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: e } = await supabase
      .from('programs')
      .select('id, title, client_id, client_name, published_at')
      .eq('status', 'active')
      .lt('published_at', cutoff)
      .order('published_at', { ascending: true });
    if (!e) setStalePrograms(data ?? []);
  }

  async function loadStats() {
    try {
      const [active, pending, programs, messages] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'invited'),
        supabase.from('programs').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('read', false).eq('sender_role', 'client'),
      ]);
      const firstError = [active, pending, programs, messages].find((r) => r.error);
      if (firstError) throw firstError.error;
      setStats({
        activeClients:     active.count   ?? 0,
        pendingInvites:    pending.count  ?? 0,
        publishedPrograms: programs.count ?? 0,
        unreadMessages:    messages.count ?? 0,
      });
    } catch (err) {
      setError(err.message ?? 'Failed to load stats');
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
        <h1 className="text-3xl font-playfair font-semibold mt-1">
          Welcome back{coachName ? `, ${coachName}` : ''}
        </h1>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Clients"     value={stats.activeClients}     icon={Users}         to="/coach/clients" />
        <StatCard label="Pending Invites"    value={stats.pendingInvites}    icon={Mail}          to="/coach/clients?filter=invited" />
        <StatCard label="Published Programs" value={stats.publishedPrograms} icon={Dumbbell}      to="/coach/programs" />
        <StatCard label="Unread Messages"    value={stats.unreadMessages}    icon={MessageSquare} to="/coach/messages" />
      </div>

      {stalePrograms.length > 0 && (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
            <h2 className="font-playfair font-semibold text-lg">
              Time for a refresh
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {stalePrograms.length === 1
              ? "1 client hasn't gotten a new program in over 3 weeks."
              : `${stalePrograms.length} clients haven't gotten a new program in over 3 weeks.`}
          </p>
          <div className="space-y-2">
            {stalePrograms.map((p) => {
              const days = Math.floor((Date.now() - new Date(p.published_at).getTime()) / (24 * 60 * 60 * 1000));
              return (
                <Link
                  key={p.id}
                  to={`/coach/programs/${p.id}`}
                  className="flex items-center justify-between rounded-lg bg-card border border-border p-3 hover:border-amber-500/50 transition"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{p.client_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.title} · last published {days} days ago
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-card border border-border p-6">
        <h2 className="font-playfair font-semibold text-lg mb-2">You're connected ✓</h2>
        <p className="text-sm text-muted-foreground">
          Click <strong>Clients</strong> in the sidebar to invite your first test client, or{' '}
          <strong>Programs</strong> to start building.
        </p>
      </div>
    </div>
  );
}

// Stat cards are clickable — each links to the relevant page so the dashboard
// doubles as a quick nav. Hover ring uses the primary (teal) color.
function StatCard({ label, value, icon: Icon, to }) {
  const body = (
    <div className="rounded-xl bg-card border border-border p-4 hover:border-primary/60 hover:shadow-sm transition cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <p className="text-2xl font-playfair font-semibold">
        {value === null ? '…' : value}
      </p>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
