import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MessageSquare, History, Sparkles, Eraser, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Coach Activity feed — chronological list of recent client activity. Two
// kinds of items show up here:
//   1. Completed workouts (workout_logs.workout_completed = true)
//   2. Quick logs the client posted from their dashboard (client_quick_logs)
//
// We merge both streams sorted by timestamp so Meg sees a single timeline.
// Marks all unseen items as seen on mount so the badge clears.
//
// Multi-select: each row has a checkbox; "Select all" toggles every visible
// row; "Clear selected" sets coach_archived=true on the picked rows so they
// drop out of the feed (still preserved in client history).
//
// Programs run ~12 workouts per client per month, so even with 15 clients
// the list should never get unwieldy. We page by limit if it ever does.
export default function Activity() {
  const [items, setItems]         = useState([]);
  const [selected, setSelected]   = useState(() => new Set()); // composite "kind:id" keys
  const [selectMode, setSelectMode] = useState(false);          // checkboxes only show in select mode
  const [clearing, setClearing]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);

      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      // 1. Fetch both streams in parallel. Skip rows already archived.
      const [{ data: workoutData, error: wErr }, { data: quickData, error: qErr }] =
        await Promise.all([
          supabase
            .from('workout_logs')
            .select('id, client_id, workout_title, exercise_logs, client_notes, completed_at, coach_seen')
            .eq('workout_completed', true)
            .eq('coach_archived', false)
            .gte('completed_at', cutoff)
            .order('completed_at', { ascending: false })
            .limit(100),
          supabase
            .from('client_quick_logs')
            .select('id, client_id, exercise, sets, notes, created_at, coach_seen')
            .eq('coach_archived', false)
            .gte('created_at', cutoff)
            .order('created_at', { ascending: false })
            .limit(100),
        ]);

      const e = wErr || qErr;
      if (e) { setError(e.message); setLoading(false); return; }

      // 2. Hydrate client names in a single query covering both streams.
      const clientIds = [
        ...new Set([
          ...(workoutData ?? []).map((l) => l.client_id),
          ...(quickData   ?? []).map((l) => l.client_id),
        ]),
      ];
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

      // 3. Merge both into one sorted timeline. `kind` distinguishes the row
      //    type at render time. `ts` is whichever timestamp the row uses so
      //    sorting is uniform.
      const merged = [
        ...(workoutData ?? []).map((l) => ({
          kind: 'workout',
          ...l,
          ts: l.completed_at,
          client_name: nameById[l.client_id] ?? 'Unknown client',
        })),
        ...(quickData ?? []).map((l) => ({
          kind: 'quick',
          ...l,
          ts: l.created_at,
          client_name: nameById[l.client_id] ?? 'Unknown client',
        })),
      ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

      setItems(merged);
      setLoading(false);

      // 4. Mark every unseen one as seen — clears the badge across both tables.
      const unseenWorkoutIds = (workoutData ?? []).filter((l) => !l.coach_seen).map((l) => l.id);
      const unseenQuickIds   = (quickData   ?? []).filter((l) => !l.coach_seen).map((l) => l.id);
      if (unseenWorkoutIds.length > 0) {
        await supabase.from('workout_logs').update({ coach_seen: true }).in('id', unseenWorkoutIds);
      }
      if (unseenQuickIds.length > 0) {
        await supabase.from('client_quick_logs').update({ coach_seen: true }).in('id', unseenQuickIds);
      }
    })();
  }, []);

  // Group by date for nicer scanning.
  const groups = groupByDate(items);

  // Selection helpers. Composite key avoids ID collisions across the two tables.
  const keyOf  = (item) => `${item.kind}:${item.id}`;
  const allKeys = items.map(keyOf);
  const allSelected   = items.length > 0 && selected.size === items.length;
  const someSelected  = selected.size > 0 && selected.size < items.length;

  function toggleOne(item) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(item);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(allKeys)
    );
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelected(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleClearSelected() {
    if (selected.size === 0) return;
    setClearing(true);
    setError('');

    // Group selected IDs by table.
    const workoutIds = [];
    const quickIds   = [];
    for (const key of selected) {
      const [kind, id] = key.split(':');
      if (kind === 'workout') workoutIds.push(id);
      else if (kind === 'quick') quickIds.push(id);
    }

    const updates = [];
    if (workoutIds.length > 0) {
      updates.push(
        supabase.from('workout_logs').update({ coach_archived: true }).in('id', workoutIds)
      );
    }
    if (quickIds.length > 0) {
      updates.push(
        supabase.from('client_quick_logs').update({ coach_archived: true }).in('id', quickIds)
      );
    }

    const results = await Promise.all(updates);
    const upErr = results.find((r) => r.error)?.error;
    setClearing(false);

    if (upErr) {
      setError(upErr.message);
      return;
    }

    // Drop the cleared items from local state so the UI updates instantly,
    // and leave select mode now that the action is done.
    setItems((prev) => prev.filter((i) => !selected.has(keyOf(i))));
    setSelected(new Set());
    setSelectMode(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
      <div className="flex items-start justify-between gap-4 mt-1 mb-2">
        <h1 className="text-3xl font-playfair font-semibold">Activity</h1>
        {!loading && !selectMode && items.length > 0 && (
          <button
            onClick={enterSelectMode}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition flex-shrink-0"
          >
            <Eraser size={13} /> Clear Activity
          </button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Recent activity from your clients — completed workouts and quick logs. Last 60 days.
      </p>

      {/* Selection toolbar — visible only after Meg taps "Clear Activity". */}
      {!loading && selectMode && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2 rounded-lg bg-card border border-border">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={toggleAll}
              aria-label="Select all"
            />
            <span className="text-muted-foreground">
              {selected.size === 0
                ? `Select all (${items.length})`
                : `${selected.size} selected`}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={exitSelectMode}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition flex-shrink-0"
            >
              <X size={13} /> Cancel
            </button>
            <button
              onClick={handleClearSelected}
              disabled={clearing || selected.size === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition flex-shrink-0"
              title="Hide selected items from your feed. They stay in client history."
            >
              <Eraser size={13} /> {clearing ? 'Clearing…' : 'Clear selected'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            All caught up. New activity will appear here as it comes in.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ label, items: rows }) => (
            <div key={label}>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{label}</h2>
              <div className="space-y-2">
                {rows.map((item) =>
                  item.kind === 'quick'
                    ? <QuickLogRow key={`q-${item.id}`} log={item} selectMode={selectMode} selected={selected.has(keyOf(item))} onToggle={() => toggleOne(item)} />
                    : <WorkoutRow  key={`w-${item.id}`} log={item} selectMode={selectMode} selected={selected.has(keyOf(item))} onToggle={() => toggleOne(item)} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowCheckbox({ checked, onToggle, label }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 mt-1 rounded border-border accent-primary flex-shrink-0 cursor-pointer"
      aria-label={label}
    />
  );
}

function WorkoutRow({ log, selectMode, selected, onToggle }) {
  const completed = new Date(log.completed_at);
  const exerciseCount = Array.isArray(log.exercise_logs) ? log.exercise_logs.length : 0;
  const hasNote = (log.client_notes ?? '').trim().length > 0;

  return (
    <div className={`rounded-xl border p-4 transition ${selected ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'}`}>
      <div className="flex items-start gap-3">
        {selectMode && (
          <RowCheckbox checked={selected} onToggle={onToggle} label={`Select workout: ${log.workout_title || 'a workout'}`} />
        )}
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

function QuickLogRow({ log, selectMode, selected, onToggle }) {
  const created = new Date(log.created_at);
  const hasNote = (log.notes ?? '').trim().length > 0;

  return (
    <div className={`rounded-xl border p-4 transition ${selected ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'}`}>
      <div className="flex items-start gap-3">
        {selectMode && (
          <RowCheckbox checked={selected} onToggle={onToggle} label={`Select quick log: ${log.exercise}`} />
        )}
        <div className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="font-medium truncate">
              <span className="text-primary">{log.client_name}</span> did a quick log
            </p>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatTime(created)}
            </span>
          </div>
          <p className="text-sm">
            <span className="font-medium">{log.exercise}</span>
            {log.sets ? <span className="text-muted-foreground"> · {log.sets} set{log.sets === 1 ? '' : 's'}</span> : null}
          </p>

          {hasNote && (
            <div className="mt-2 px-3 py-2 rounded-lg bg-secondary text-sm">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                <MessageSquare size={11} /> Notes
              </div>
              <p className="text-sm whitespace-pre-wrap">{log.notes}</p>
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
function groupByDate(items) {
  const buckets = new Map();
  for (const item of items) {
    const label = relativeDayLabel(new Date(item.ts));
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(item);
  }
  return Array.from(buckets, ([label, items]) => ({ label, items }));
}

function relativeDayLabel(d) {
  const now = new Date();
  const today = startOfDay(now);
  const target = startOfDay(d);
  const diff = Math.round((today - target) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)   return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function formatTime(d) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
