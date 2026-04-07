import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MessageSquare, History, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Coach Activity feed — chronological list of recently completed workouts.
// Acts as the "notification center" for the coach. Marks all unseen
// completions as seen on mount so the badge clears.
//
// Programs run ~12 workouts per client per month, so even with 15 clients
// this list should never get unwieldy. We page by limit if it ever does.
export default function Activity() {
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);

      // 1. Fetch the most recent completed logs (last 60 days, capped at 100).
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error: e } = await supabase
        .from('workout_logs')
        .select('id, client_id, workout_title, exercise_logs, client_notes, completed_at, coach_seen')
        .eq('workout_completed', true)
        .gte('completed_at', cutoff)
        .order('completed_at', { ascending: false })
        .limit(100);
      if (e) { setError(e.message); setLoading(false); return; }

      // 2. Hydrate client names in a single query.
      const clientIds = [...new Set((data ?? []).map((l) => l.client_id))];
      let nameById = {};
      if (clientIds.length > 0) {
        const { data: cls } = await supabase
          .from('clients')
          .select('id, first_name, last_name')
          .in('id', clientIds);
        nameById = Object.fromEntries(
          (cls ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`])
        );
      }
      const enriched = (data ?? []).map((l) => ({
        ...l,
        client_name: nameById[l.client_id] ?? 'Unknown client',
      }));
      setLogs(enriched);
      setLoading(false);

      // 3. Mark every unseen one as seen — clears the badge.
      const unseenIds = (data ?? []).filter((l) => !l.coach_seen).map((l) => l.id);
      if (unseenIds.length > 0) {
        await supabase
          .from('workout_logs')
          .update({ coach_seen: true })
          .in('id', unseenIds);
      }
    })();
  }, []);

  // Group logs by date for nicer scanning.
  const groups = groupByDate(logs);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
      <h1 className="text-3xl font-playfair font-semibold mt-1 mb-2">Activity</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Recent workout completions from your clients. Last 60 days.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No completed workouts yet. Once your clients start logging, they'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ label, items }) => (
            <div key={label}>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{label}</h2>
              <div className="space-y-2">
                {items.map((log) => <ActivityRow key={log.id} log={log} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({ log }) {
  const completed = new Date(log.completed_at);
  const exerciseCount = Array.isArray(log.exercise_logs) ? log.exercise_logs.length : 0;
  const hasNote = (log.client_notes ?? '').trim().length > 0;

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="font-medium truncate">
              <span className="text-primary">{log.client_name}</span> finished{' '}
              <span>{log.workout_title || 'a workout'}</span>
            </p>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTime(completed)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} logged
          </p>

          {hasNote && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-secondary text-sm">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                <MessageSquare size={11} /> Client note
              </div>
              <p className="text-sm whitespace-pre-wrap">{log.client_notes}</p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs">
            <Link
              to={`/coach/clients/${log.client_id}/history`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition"
            >
              <History size={12} /> Full history
            </Link>
            <span className="text-muted-foreground/50">·</span>
            <Link
              to={`/coach/messages?client=${log.client_id}`}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition"
            >
              <MessageSquare size={12} /> Send a message
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- Date helpers --------------------------------------------------------
function groupByDate(logs) {
  const buckets = new Map();
  for (const log of logs) {
    const label = relativeDayLabel(new Date(log.completed_at));
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(log);
  }
  return Array.from(buckets, ([label, items]) => ({ label, items }));
}

function relativeDayLabel(d) {
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diff = Math.round((today - target) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)   return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
