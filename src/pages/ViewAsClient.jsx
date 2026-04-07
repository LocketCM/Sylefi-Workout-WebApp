import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Eye, Search, Play, Check, Clock, MessageSquare, ChevronRight, History, User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// "View as Client" — lets Meg preview a client's app from the coach side
// without logging out and claiming an invite. Two views share this file:
//   - /coach/view-as            → picker (list of clients)
//   - /coach/view-as/:clientId  → preview of that client's dashboard
//
// The preview is read-only — buttons that would normally start a workout
// or open messages are inert, with a banner explaining you're in preview mode.
export default function ViewAsClient() {
  const { clientId } = useParams();
  if (clientId) return <Preview clientId={clientId} />;
  return <Picker />;
}

// ---------------------------------------------------------------------------
// Picker — list of clients to choose from
// ---------------------------------------------------------------------------
function Picker() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      const { data, error: e } = await supabase
        .from('clients')
        .select('id, first_name, last_name, status, created_at')
        .order('first_name');
      if (e) setError(e.message);
      else setClients(data ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = !search.trim()
    ? clients
    : clients.filter((c) =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())
      );

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
        <h1 className="text-3xl font-playfair font-semibold mt-1">View as Client</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a client to preview exactly what they see in the app.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients match.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/coach/view-as/${c.id}`)}
              className="w-full text-left rounded-xl bg-card border border-border p-4 hover:border-primary/60 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-medium">
                {c.first_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{c.first_name} {c.last_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{c.status}</p>
              </div>
              <Eye size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview — read-only render of the chosen client's home screen
// ---------------------------------------------------------------------------
function Preview({ clientId }) {
  const [client, setClient]   = useState(null);
  const [program, setProgram] = useState(null);
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: c, error: cErr }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
      ]);
      if (cErr || !c) { setError(cErr?.message ?? 'Client not found'); setLoading(false); return; }
      setClient(c);

      const { data: ps } = await supabase
        .from('programs')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1);
      const activeProgram = ps?.[0] ?? null;
      setProgram(activeProgram);

      if (activeProgram) {
        const { data: ls } = await supabase
          .from('workout_logs')
          .select('id, workout_day, workout_completed, completed_at')
          .eq('client_id', clientId)
          .eq('program_id', activeProgram.id);
        setLogs(ls ?? []);
      }
      setLoading(false);
    })();
  }, [clientId]);

  const workouts = Array.isArray(program?.workouts) ? program.workouts : [];
  const hasProgram = program && workouts.length > 0;

  // Build day → status lookup just like ClientDashboard does
  const statusByDay = {};
  for (const l of logs) {
    const key = String(l.workout_day);
    const cur = statusByDay[key] ?? { completed: false, in_progress: false };
    if (l.workout_completed) cur.completed = true;
    else cur.in_progress = true;
    statusByDay[key] = cur;
  }
  const doneCount = workouts.filter((w) => statusByDay[String(w.id)]?.completed).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Preview banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 truncate">
            Preview mode — viewing as {client?.first_name ?? '…'}
          </p>
        </div>
        <Link
          to="/coach/view-as"
          className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline flex-shrink-0 inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Switch
        </Link>
      </div>

      {/* Mock client top bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest">Sylefi Wellness</p>
            <p className="font-playfair font-semibold text-sm">
              {client ? `Hey, ${client.first_name} 👋` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <InertButton ariaLabel="Messages"><MessageSquare size={18} /></InertButton>
            <InertButton ariaLabel="History"><History size={18} /></InertButton>
            <InertButton ariaLabel="Sign out"><User size={18} /></InertButton>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasProgram ? (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-primary to-teal-700 text-primary-foreground p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
                <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                Your program is ready
              </div>
              <p className="text-2xl font-playfair font-semibold mt-2">{program.title}</p>
              <p className="text-sm opacity-80 mt-1">
                {doneCount} of {workouts.length} workout{workouts.length === 1 ? '' : 's'} complete
              </p>
            </div>

            <div className="space-y-2">
              {workouts.map((w, i) => {
                const status = statusByDay[String(w.id)];
                const completed = status?.completed;
                const inProgress = status?.in_progress && !completed;
                const exCount = Array.isArray(w.exercises) ? w.exercises.length : 0;
                return (
                  <div
                    key={w.id ?? i}
                    className={`rounded-xl border p-4 flex items-center gap-3 ${
                      completed ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium flex-shrink-0 ${
                      completed ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
                    }`}>
                      {completed ? <Check size={18} strokeWidth={3} /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium truncate ${completed ? 'text-muted-foreground' : ''}`}>
                          {w.title || `Workout ${i + 1}`}
                        </p>
                        {inProgress && (
                          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent-foreground">
                            In progress
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {exCount} exercise{exCount === 1 ? '' : 's'}
                        {completed && ' · completed'}
                      </p>
                      {w.coach_note && (
                        <p className="text-xs text-accent mt-1 line-clamp-2 italic">"{w.coach_note}"</p>
                      )}
                    </div>
                    <Play size={18} className="text-primary flex-shrink-0 opacity-50" />
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-card border border-dashed border-border p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-secondary flex items-center justify-center mb-3">
              <Clock size={24} className="text-muted-foreground" />
            </div>
            <p className="font-playfair font-semibold text-lg">Your program is not yet ready</p>
            <p className="text-sm text-muted-foreground mt-1">
              Meg is working on it — you'll see it here as soon as it's published.
            </p>
          </div>
        )}

        {/* Inert contact coach card */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border opacity-90">
          <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <MessageSquare size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Contact Coach</p>
            <p className="text-xs text-muted-foreground">Send Meg a message</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>

        {/* Quick jump shortcuts for the coach */}
        <div className="rounded-xl border border-dashed border-border p-4 mt-6">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Coach shortcuts</p>
          <div className="flex flex-wrap gap-2">
            {program && (
              <Link
                to={`/coach/programs/${program.id}`}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:border-primary/60 hover:text-primary transition"
              >
                Edit this program
              </Link>
            )}
            <Link
              to={`/coach/clients/${clientId}/history`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:border-primary/60 hover:text-primary transition"
            >
              View workout history
            </Link>
            <Link
              to={`/coach/messages?client=${clientId}`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:border-primary/60 hover:text-primary transition"
            >
              Open thread
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inert button — looks like the real client button but does nothing.
function InertButton({ children, ariaLabel }) {
  return (
    <button
      type="button"
      disabled
      aria-label={ariaLabel}
      title={`${ariaLabel} (preview)`}
      className="p-2 rounded-lg text-muted-foreground opacity-60 cursor-not-allowed"
    >
      {children}
    </button>
  );
}
