import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Dumbbell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  ExerciseLogCard,
  freshLogEntry,
  mergeLogsWithProgram,
  fireConfetti,
} from '@/pages/WorkoutSession';

// Coach-facing workout logger — "I just trained Sarah in person, let me
// fill in what she did."
//
// Route: /coach/clients/:clientId/log/:workoutId
//
// This mirrors WorkoutSession.jsx but:
//   - loads the client by route param (not by auth.user.id)
//   - writes through the coach_save_workout_log RPC (SECURITY DEFINER),
//     which stamps logged_by_coach=true and coach_seen=true so the
//     Activity feed doesn't badge her own entry
//   - has a clear "Logging for <Client>" banner so it's obvious she's
//     not in her own view
//   - bounces back to /coach/clients on finish
//
// Everything else — exercise card rendering, required sets/reps, per-row
// completion toggle, autosave — reuses the same building blocks exported
// from WorkoutSession.jsx.

export default function CoachLogWorkout() {
  const { clientId, workoutId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [client, setClient]   = useState(null);
  const [program, setProgram] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [logId, setLogId]     = useState(null);
  const [logs, setLogs]       = useState([]);
  const [clientNotes, setClientNotes] = useState('');
  const [savingHint, setSavingHint]   = useState('');
  const [finishing, setFinishing]     = useState(false);

  const saveTimer    = useRef(null);
  const insertingRef = useRef(false);

  // ---------- Initial load ---------------------------------------------------
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');

      const { data: c, error: cErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();
      if (cErr || !c) { setError(cErr?.message ?? 'Client not found.'); setLoading(false); return; }
      setClient(c);

      const { data: p, error: pErr } = await supabase
        .from('programs')
        .select('*')
        .eq('client_id', c.id)
        .eq('status', 'active')
        .maybeSingle();
      if (pErr || !p) { setError(pErr?.message ?? 'This client has no active program.'); setLoading(false); return; }
      setProgram(p);

      const w = (p.workouts ?? []).find((x) => x.id === workoutId);
      if (!w) { setError('Workout not found in this program.'); setLoading(false); return; }
      setWorkout(w);

      // Look for an in-progress log for this workout — lets Meg resume if
      // she started logging and got interrupted, same as the client flow.
      const { data: existing, error: lErr } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('client_id', c.id)
        .eq('program_id', p.id)
        .eq('workout_day', String(workoutId))
        .eq('workout_completed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lErr && lErr.code !== 'PGRST116') {
        setError(lErr.message); setLoading(false); return;
      }

      if (existing) {
        const merged = mergeLogsWithProgram(existing.exercise_logs ?? [], w.exercises ?? []);
        setLogId(existing.id);
        setLogs(merged);
        setClientNotes(existing.client_notes ?? '');
      } else {
        setLogs((w.exercises ?? []).map((e) => freshLogEntry(e)));
      }

      setLoading(false);
    })();
  }, [clientId, workoutId]);

  // ---------- Save helpers ---------------------------------------------------
  // All writes go through the RPC. p_finish controls whether we're just
  // saving progress or marking the session complete.
  async function saveViaRpc(finish) {
    const { data, error: rpcErr } = await supabase.rpc('coach_save_workout_log', {
      p_log_id:        logId,
      p_client_id:     client.id,
      p_program_id:    program.id,
      p_workout_day:   String(workoutId),
      p_workout_title: workout.title || 'Workout',
      p_exercise_logs: logs,
      p_client_notes:  clientNotes,
      p_finish:        !!finish,
    });
    if (rpcErr) throw rpcErr;
    return data;
  }

  async function ensureLogRow() {
    if (logId) return logId;
    if (insertingRef.current) return null;
    if (!client || !program || !workout) return null;
    insertingRef.current = true;
    try {
      const newId = await saveViaRpc(false);
      setLogId(newId);
      return newId;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      insertingRef.current = false;
    }
  }

  // Debounced autosave — only after the first real interaction has created
  // a row, identical rhythm to the client-facing flow.
  useEffect(() => {
    if (!logId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingHint('Saving…');
    saveTimer.current = setTimeout(async () => {
      try {
        await saveViaRpc(false);
        setSavingHint('Saved');
        setTimeout(() => setSavingHint(''), 1200);
      } catch (e) {
        setSavingHint('Save failed');
        setError(e.message);
      }
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, clientNotes]);

  // ---------- Row-level edits -----------------------------------------------
  function updateLog(idx, patch) {
    setLogs((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    ensureLogRow();
  }
  function updateClientNotes(value) {
    setClientNotes(value);
    if (value.trim()) ensureLogRow();
  }
  function toggleComplete(idx) {
    const current = logs[idx];
    if (!current) return;

    if (current.completed) {
      setLogs((arr) => arr.map((l, i) => (i === idx ? { ...l, completed: false } : l)));
      ensureLogRow();
      return;
    }

    const setsOk = current.sets_completed !== null && current.sets_completed !== '' && current.sets_completed !== undefined;
    const repsOk = current.reps_completed !== null && current.reps_completed !== '' && current.reps_completed !== undefined;
    if (!setsOk || !repsOk) {
      setLogs((arr) => arr.map((l, i) => (i === idx ? { ...l, _needsActuals: true } : l)));
      return;
    }

    setLogs((arr) => arr.map((l, i) =>
      i === idx ? { ...l, completed: true, _needsActuals: false } : l
    ));
    ensureLogRow();
  }

  // ---------- Finish ---------------------------------------------------------
  async function finishWorkout() {
    setFinishing(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveViaRpc(true);
      fireConfetti();
      setTimeout(() => navigate('/coach/clients'), 1400);
    } catch (e) {
      setError(e.message);
      setFinishing(false);
    }
  }

  // ---------- Derived state --------------------------------------------------
  const completedCount = useMemo(() => logs.filter((l) => l.completed).length, [logs]);
  const totalCount     = logs.length;
  const allDone        = totalCount > 0 && completedCount === totalCount;

  // ---------- Render ---------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <p className="text-sm text-muted-foreground">Loading workout…</p>
      </div>
    );
  }
  if (error && !workout) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <Link to="/coach/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={14} /> Back to Clients
        </Link>
        <div className="px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to="/coach/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> Back
            </Link>
            <span className="text-xs text-muted-foreground">{savingHint}</span>
          </div>
          <p className="font-playfair font-semibold text-lg mt-1 truncate">{workout.title || 'Workout'}</p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{completedCount} of {totalCount} complete</span>
              <span>{totalCount === 0 ? '0%' : Math.round((completedCount / totalCount) * 100) + '%'}</span>
            </div>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: totalCount === 0 ? '0%' : `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-3">
        {/* Coach-mode banner — makes it unmistakable that this is the coach
            logging in-person, not the client themselves */}
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 flex items-start gap-3">
          <Dumbbell size={18} className="text-accent flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">
              Logging an in-person session for {client.display_name || `${client.first_name} ${client.last_name}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This workout will show up in their history marked "Logged by Meg."
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {workout.coach_note && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
            <p className="text-sm italic text-foreground">"{workout.coach_note}"</p>
          </div>
        )}

        {logs.map((log, i) => (
          <ExerciseLogCard
            key={log.id ?? i}
            log={log}
            index={i}
            unit={client?.weight_unit ?? 'lbs'}
            onUpdate={(patch) => updateLog(i, patch)}
            onToggleComplete={() => toggleComplete(i)}
          />
        ))}

        <div className="rounded-xl bg-card border border-border p-4">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Session notes (optional)
          </label>
          <textarea
            rows={3}
            value={clientNotes}
            onChange={(e) => updateClientNotes(e.target.value)}
            placeholder="How did the session go? Form cues, what to push next time…"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Stored on the session — visible to the client in their history, same as their own notes.
          </p>
        </div>
      </div>

      {/* Sticky finish footer */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur p-4 z-20">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={finishWorkout}
            disabled={finishing}
            className={`w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
              allDone
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-primary/70 text-primary-foreground hover:opacity-90'
            } disabled:opacity-50`}
          >
            <Check size={18} />
            {finishing ? 'Saving…' : allDone ? 'Finish Session' : `Finish Session (${completedCount}/${totalCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
