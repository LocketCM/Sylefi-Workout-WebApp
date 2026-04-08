import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Clock, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatWeight } from '@/lib/formatters';

// Workout history viewer.
//
// Two modes share this same page:
//   - Client viewing own logs:  /client/history          (uses auth → clients row)
//   - Coach viewing a client:   /coach/clients/:clientId/history
//
// Detected by route param. The shape is identical otherwise.
export default function WorkoutHistory() {
  const { user } = useAuth();
  const { clientId: routeClientId } = useParams(); // present only in coach view
  const [searchParams] = useSearchParams();
  const isCoachView = Boolean(routeClientId);

  const [client, setClient] = useState(null);
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');

      // Resolve which client's logs we're showing.
      let c = null;
      if (isCoachView) {
        const { data, error: e } = await supabase
          .from('clients').select('*').eq('id', routeClientId).maybeSingle();
        if (e) { setError(e.message); setLoading(false); return; }
        c = data;
      } else {
        if (!user) return;
        const { data, error: e } = await supabase
          .from('clients').select('*').eq('user_id', user.id).maybeSingle();
        if (e) { setError(e.message); setLoading(false); return; }
        c = data;
      }
      if (!c) { setError('Client not found.'); setLoading(false); return; }
      setClient(c);

      // Pull all completed logs, newest first. We show in-progress logs too,
      // labeled separately, so the client can resume from here as well.
      const { data: ls, error: lErr } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', c.id)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at',   { ascending: false });
      if (lErr) { setError(lErr.message); setLoading(false); return; }
      setLogs(ls ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, routeClientId]);

  const completed  = logs.filter((l) => l.workout_completed);
  const inProgress = logs.filter((l) => !l.workout_completed);

  const backLink = isCoachView ? '/coach/clients' : '/client';
  const backLabel = isCoachView ? 'Back to Clients' : 'Back to Home';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <Link to={backLink} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={14} /> {backLabel}
        </Link>

        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {isCoachView ? 'Coach View' : 'Workout History'}
          </p>
          <h1 className="text-3xl font-playfair font-semibold mt-1">
            {isCoachView && client
              ? `${client.first_name}'s History`
              : 'Your Workout History'}
          </h1>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-1">
              {completed.length} completed workout{completed.length === 1 ? '' : 's'}
              {inProgress.length > 0 && ` · ${inProgress.length} in progress`}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logs.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {inProgress.length > 0 && (
              <Section title="In progress">
                {inProgress.map((l) => <LogCard key={l.id} log={l} unit={client?.weight_unit ?? 'lbs'} />)}
              </Section>
            )}
            {completed.length > 0 && (
              <Section title="Completed">
                {completed.map((l) => <LogCard key={l.id} log={l} unit={client?.weight_unit ?? 'lbs'} />)}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

// Each log expands to show the per-exercise breakdown.
function LogCard({ log, unit = 'lbs' }) {
  const [open, setOpen] = useState(false);
  const exLogs = Array.isArray(log.exercise_logs) ? log.exercise_logs : [];
  const doneCount = exLogs.filter((e) => e.completed).length;
  const dateStr = log.completed_at
    ? new Date(log.completed_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : new Date(log.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className={`rounded-xl border ${log.workout_completed ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 flex items-center gap-3"
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          log.workout_completed ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
        }`}>
          {log.workout_completed ? <Check size={18} strokeWidth={3} /> : <Clock size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{log.workout_title || 'Workout'}</p>
          <p className="text-xs text-muted-foreground">
            {dateStr} · {doneCount} of {exLogs.length} exercise{exLogs.length === 1 ? '' : 's'}
          </p>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {exLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No exercises logged.</p>
          ) : (
            exLogs.map((e, i) => <ExerciseLogLine key={e.id ?? i} log={e} unit={unit} />)
          )}
          {log.client_notes && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20 flex gap-2">
              <MessageSquare size={14} className="text-accent flex-shrink-0 mt-0.5" />
              <p className="text-xs italic">{log.client_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseLogLine({ log, unit = 'lbs' }) {
  const target = [
    log.target_sets   && `${log.target_sets} sets`,
    log.target_reps   && `${log.target_reps} reps`,
    log.target_weight && formatWeight(log.target_weight, unit),
  ].filter(Boolean).join(' × ');
  const actual = [
    log.sets_completed && `${log.sets_completed} sets`,
    log.reps_completed && `${log.reps_completed} reps`,
    log.weight_used    && formatWeight(log.weight_used, unit),
  ].filter(Boolean).join(' × ');

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${log.completed ? 'bg-primary' : 'bg-border'}`} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${log.completed ? '' : 'text-muted-foreground'}`}>{log.name}</p>
        <p className="text-xs text-muted-foreground">
          {actual ? <span className="text-foreground">{actual}</span> : <em>not logged</em>}
          {target && <span> · target {target}</span>}
        </p>
        {log.client_note && (
          <p className="text-xs italic text-muted-foreground mt-0.5">"{log.client_note}"</p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">
        No workouts logged yet. Once a workout is finished it'll show up here.
      </p>
    </div>
  );
}
