import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Check, Play, Pause, RotateCcw, Square, MessageSquare,
  ChevronDown, ChevronUp, Timer,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import DriveVideoEmbed from '@/components/DriveVideoEmbed';
import { formatWeight } from '@/lib/formatters';

// Client-facing workout logger.
//
// Flow:
//   1. Look up the client row for this user.
//   2. Pull their currently published program.
//   3. Find the workout inside program.workouts whose local id matches :workoutId.
//   4. Look for an in-progress workout_log (workout_completed=false) — if found,
//      restore its exercise_logs as our local state. Otherwise seed fresh logs
//      from the program's exercises.
//   5. Auto-save (debounced) on every change.
//   6. When client taps "Finish Workout", set workout_completed=true, fire
//      confetti, and bounce back to the dashboard.
//
// Each entry in exercise_logs has the shape:
//   {
//     exercise_id, name, video_url, coach_note,        // snapshot from program
//     target_sets, target_reps, target_weight,          // what coach prescribed
//     sets_completed, reps_completed, weight_used,      // what client actually did
//     completed,                                        // bool checkbox
//     client_note                                       // optional client note
//   }

export default function WorkoutSession() {
  const { workoutId } = useParams();
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [client, setClient]   = useState(null);
  const [program, setProgram] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [logId, setLogId]     = useState(null);     // workout_logs row id
  const [logs, setLogs]       = useState([]);       // exercise_logs array
  const [clientNotes, setClientNotes] = useState('');
  const [savingHint, setSavingHint]   = useState('');
  const [finishing, setFinishing]     = useState(false);

  // Debounce timer ref so we don't hammer the DB on every keystroke.
  const saveTimer = useRef(null);
  // Track in-flight insert so concurrent edits don't create two rows.
  const insertingRef = useRef(false);

  // ---------- Initial load ---------------------------------------------------
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      setError('');

      // 1. client row
      const { data: c, error: cErr } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cErr || !c) { setError(cErr?.message ?? 'Client not found.'); setLoading(false); return; }
      setClient(c);

      // 2. active program
      const { data: p, error: pErr } = await supabase
        .from('programs')
        .select('*')
        .eq('client_id', c.id)
        .eq('status', 'active')
        .maybeSingle();
      if (pErr || !p) { setError(pErr?.message ?? 'No active program.'); setLoading(false); return; }
      setProgram(p);

      // 3. find the matching workout inside program.workouts
      const w = (p.workouts ?? []).find((x) => x.id === workoutId);
      if (!w) { setError('Workout not found in your program.'); setLoading(false); return; }
      setWorkout(w);

      // 4. look for an in-progress log for this workout
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
        // Resume — but make sure log entries cover every exercise currently in
        // the program (in case Meg edited the program between sessions).
        const merged = mergeLogsWithProgram(existing.exercise_logs ?? [], w.exercises ?? []);
        setLogId(existing.id);
        setLogs(merged);
        setClientNotes(existing.client_notes ?? '');
      } else {
        // Don't create the DB row yet — just hold fresh state in memory.
        // We'll lazily insert on the first real interaction so that opening
        // a workout and immediately backing out doesn't litter history.
        setLogs((w.exercises ?? []).map((e) => freshLogEntry(e)));
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, workoutId]);

  // ---------- Lazy insert ----------------------------------------------------
  // Insert the workout_logs row on the first real interaction. Returns the
  // logId so callers can chain an update if needed.
  async function ensureLogRow() {
    if (logId) return logId;
    if (insertingRef.current) return null;
    if (!client || !program || !workout) return null;
    insertingRef.current = true;
    const { data: created, error: insErr } = await supabase
      .from('workout_logs')
      .insert({
        client_id:        client.id,
        program_id:       program.id,
        workout_day:      String(workoutId),
        workout_title:    workout.title || 'Workout',
        exercise_logs:    logs,
        workout_completed: false,
        client_notes:     clientNotes,
      })
      .select()
      .single();
    insertingRef.current = false;
    if (insErr) { setError(insErr.message); return null; }
    setLogId(created.id);
    return created.id;
  }

  // ---------- Auto-save (debounced) -----------------------------------------
  // Only fires once a logId exists — i.e. after the user has interacted at
  // least once. Drafts that the user immediately bails on never hit the DB.
  useEffect(() => {
    if (!logId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavingHint('Saving…');
    saveTimer.current = setTimeout(async () => {
      const { error: upErr } = await supabase
        .from('workout_logs')
        .update({
          exercise_logs: logs,
          client_notes:  clientNotes,
        })
        .eq('id', logId);
      if (upErr) { setSavingHint('Save failed'); return; }
      setSavingHint('Saved');
      setTimeout(() => setSavingHint(''), 1200);
    }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, clientNotes]);

  // ---------- Helpers --------------------------------------------------------
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

    // Unchecking is always allowed.
    if (current.completed) {
      setLogs((arr) => arr.map((l, i) => (i === idx ? { ...l, completed: false } : l)));
      if (navigator.vibrate) navigator.vibrate(20);
      ensureLogRow();
      return;
    }

    // Marking complete: require sets + reps (or sets-only for timed).
    // Weight is intentionally optional (bodyweight movements). We *don't*
    // auto-fill from target anymore — Meg wants to see what the client
    // actually did, not assume they hit prescription.
    const isTimed = current.exercise_type === 'timed';
    const setsOk = current.sets_completed !== null && current.sets_completed !== '' && current.sets_completed !== undefined;
    const repsOk = isTimed || (current.reps_completed !== null && current.reps_completed !== '' && current.reps_completed !== undefined);
    if (!setsOk || !repsOk) {
      setLogs((arr) => arr.map((l, i) => (i === idx ? { ...l, _needsActuals: true } : l)));
      if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
      return;
    }

    setLogs((arr) => arr.map((l, i) =>
      i === idx ? { ...l, completed: true, _needsActuals: false } : l
    ));
    if (navigator.vibrate) navigator.vibrate(40);
    ensureLogRow();
  }

  async function finishWorkout() {
    setFinishing(true);
    // Make sure we have a row to finalize (covers the case where someone
    // hits Finish without ticking anything off — rare, but possible).
    const id = logId ?? (await ensureLogRow());
    if (!id) { setFinishing(false); return; }
    // Final save — flush any pending debounced changes immediately.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const { error: finErr } = await supabase
      .from('workout_logs')
      .update({
        exercise_logs:     logs,
        client_notes:      clientNotes,
        workout_completed: true,
        completed_at:      new Date().toISOString(),
      })
      .eq('id', id);
    if (finErr) { setError(finErr.message); setFinishing(false); return; }

    // Celebrate!
    fireConfetti();
    if (navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 80]);
    setTimeout(() => navigate('/client'), 1400);
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
  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <Link to="/client" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      {/* Sticky header with progress */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to="/client" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
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
        {/* Workout-level coach note (if any) */}
        {workout.coach_note && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex gap-3">
            <MessageSquare size={16} className="text-accent flex-shrink-0 mt-0.5" />
            <p className="text-sm italic text-foreground">"{workout.coach_note}"</p>
          </div>
        )}

        {/* Exercises */}
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

        {/* Notes for the coach */}
        <div className="rounded-xl bg-card border border-border p-4">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Notes for Meg (optional)
          </label>
          <textarea
            rows={3}
            value={clientNotes}
            onChange={(e) => updateClientNotes(e.target.value)}
            placeholder="How did this workout feel? Anything she should know?"
            className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
          />
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
            {finishing ? 'Finishing…' : allDone ? 'Finish Workout' : `Finish Workout (${completedCount}/${totalCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExerciseLogCard — one exercise to log
// ---------------------------------------------------------------------------
// Exported so the coach's in-person logging page (CoachLogWorkout) can reuse
// the exact same row rendering without duplicating UI. The component is pure
// — it doesn't care who's driving it.
export function ExerciseLogCard({ log, index, unit = 'lbs', onUpdate, onToggleComplete }) {
  const [showVideo, setShowVideo] = useState(false);
  const isTimed = log.exercise_type === 'timed';

  return (
    <div className={`rounded-xl border p-4 transition ${
      log.completed ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'
    }`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <button
          onClick={onToggleComplete}
          className={`w-7 h-7 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition ${
            log.completed
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-border hover:border-primary'
          }`}
          aria-label={log.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {log.completed && <Check size={14} strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-medium ${log.completed ? 'line-through text-muted-foreground' : ''}`}>
              {index + 1}. {log.name}
            </p>
            {isTimed && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-medium">
                <Timer size={9} /> Timed
              </span>
            )}
          </div>
          {(log.target_sets || log.target_reps || log.target_duration || log.target_weight) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Target: {[
                log.target_sets     && `${log.target_sets} sets`,
                !isTimed && log.target_reps && `${log.target_reps} reps`,
                isTimed && log.target_duration && fmtSecs(log.target_duration) + ' hold',
                log.target_weight   && formatWeight(log.target_weight, unit),
              ].filter(Boolean).join(' × ')}
            </p>
          )}
        </div>
      </div>

      {/* Coach note */}
      {log.coach_note && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20">
          <p className="text-xs italic text-foreground">
            <span className="text-accent font-medium not-italic">Meg: </span>
            {log.coach_note}
          </p>
        </div>
      )}

      {/* Video toggle */}
      {log.video_url && (
        <div className="mb-3">
          <button
            onClick={() => setShowVideo((v) => !v)}
            className="text-xs font-medium text-primary inline-flex items-center gap-1 hover:underline"
          >
            <Play size={12} />
            {showVideo ? 'Hide demo' : 'Watch demo'}
            {showVideo ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showVideo && (
            <div className="mt-2">
              <DriveVideoEmbed url={log.video_url} title={log.name} />
            </div>
          )}
        </div>
      )}

      {/* Countdown timer for timed exercises */}
      {isTimed && log.target_duration && (
        <CountdownTimer
          targetSeconds={log.target_duration}
          setsCompleted={log.sets_completed}
          targetSets={log.target_sets}
          onComplete={(actualSecs) => {
            // Auto-increment sets_completed so the client doesn't have to
            // type anything — the timer finishing IS the rep.
            const prevSets = Number(log.sets_completed) || 0;
            onUpdate({
              sets_completed: prevSets + 1,
              duration_completed: `${actualSecs}s`,
              _needsActuals: false,
            });
          }}
        />
      )}

      {/* Actuals */}
      <div className={`grid gap-2 ${isTimed ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <NumField
          label="Sets *"
          value={log.sets_completed}
          required={log._needsActuals}
          onChange={(v) => onUpdate({ sets_completed: v, _needsActuals: false })}
        />
        {isTimed ? (
          <TextField
            label="Time held"
            value={log.duration_completed}
            placeholder={log.target_duration ? `${log.target_duration}s` : 'e.g. 45s'}
            onChange={(v) => onUpdate({ duration_completed: v })}
          />
        ) : (
          <NumField
            label="Reps *"
            value={log.reps_completed}
            required={log._needsActuals}
            onChange={(v) => onUpdate({ reps_completed: v, _needsActuals: false })}
          />
        )}
        <TextField
          label={`Weight (${unit})`}
          value={log.weight_used}
          placeholder="e.g. 95 or BW"
          onChange={(v) => onUpdate({ weight_used: v })}
        />
      </div>
      {log._needsActuals && (
        <p className="text-xs text-destructive mt-2">
          {isTimed
            ? 'Enter your actual sets before marking complete.'
            : 'Enter your actual sets and reps before marking complete.'}
        </p>
      )}

      {/* Per-exercise client note */}
      <input
        type="text"
        value={log.client_note ?? ''}
        onChange={(e) => onUpdate({ client_note: e.target.value })}
        placeholder="Note (optional)…"
        className="w-full mt-2 px-3 py-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-xs"
      />
    </div>
  );
}

function NumField({ label, value, onChange, step = '1', required = false }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`w-full px-2 py-1.5 rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm ${
          required ? 'border-destructive ring-1 ring-destructive/40' : 'border-input'
        }`}
      />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------
// Exported alongside ExerciseLogCard so the coach-driven version of this flow
// can seed/merge exercise_logs without duplicating the logic.
export function freshLogEntry(programExercise) {
  return {
    id:               programExercise.id,
    exercise_id:      programExercise.exercise_id ?? null,
    name:             programExercise.name,
    video_url:        programExercise.video_url ?? null,
    coach_note:       programExercise.coach_note ?? '',
    exercise_type:    programExercise.exercise_type ?? 'reps',
    target_sets:      programExercise.sets ?? null,
    target_reps:      programExercise.reps ?? null,
    target_duration:  programExercise.duration ?? null,
    target_weight:    programExercise.weight ?? null,
    sets_completed:   null,
    reps_completed:   null,
    duration_completed: null,
    weight_used:      null,
    completed:        false,
    client_note:      '',
  };
}

// If Meg edited the program after the client started a log, fold any new
// exercises in (and refresh the snapshotted target/coach_note/video) without
// throwing away what they've already entered.
export function mergeLogsWithProgram(existingLogs, programExercises) {
  const byId = new Map(existingLogs.map((l) => [l.id, l]));
  return programExercises.map((pe) => {
    const prev = byId.get(pe.id);
    if (!prev) return freshLogEntry(pe);
    return {
      ...prev,
      // Refresh snapshots from program (coach may have updated targets)
      name:            pe.name,
      video_url:       pe.video_url ?? null,
      coach_note:      pe.coach_note ?? '',
      exercise_type:   pe.exercise_type ?? 'reps',
      target_sets:     pe.sets ?? null,
      target_reps:     pe.reps ?? null,
      target_duration: pe.duration ?? null,
      target_weight:   pe.weight ?? null,
    };
  });
}

// Format seconds → "0:45", "1:30", etc.
export function fmtSecs(s) {
  const n = Number(s);
  if (!n || n <= 0) return '0:00';
  const m = Math.floor(n / 60);
  const sec = Math.floor(n % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Timer audio
//
// Mobile browsers (iOS Safari especially) suspend audio when JS timers fire
// outside a user gesture — so a beep scheduled via setTimeout/setInterval
// after a 30-second wait often won't play. The fix is to pre-schedule the
// done beep on the Web Audio engine the moment the user taps Start, using
// audio-clock timing. The OS/audio engine handles playback even if the JS
// thread is throttled or the screen locks.
// ---------------------------------------------------------------------------

// Shared, lazily-created AudioContext. Mobile browsers limit context creation
// and require a user gesture to unlock — keeping one around and resuming it
// on every gesture is more reliable than spinning up new ones.
let sharedAudioCtx = null;
function getAudioCtx() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === 'suspended') {
      // resume() is best-effort — fire and forget.
      sharedAudioCtx.resume().catch(() => {});
    }
    // Kick off the alarm-sample preload as soon as the context exists. The
    // first call returns null synchronously; later calls return the buffer
    // once decoded.
    ensureAlarmBuffer();
    return sharedAudioCtx;
  } catch { return null; }
}

// ---- Alarm sample (mixkit slot-machine-win) -------------------------------
// We split the load into two stages so the buffer is ready by the time a
// timer ends:
//   1. Fetch the wav bytes at module load — no AudioContext needed yet.
//   2. Decode the bytes the moment the AudioContext is created (first user
//      gesture). decodeAudioData is async but fast (~30ms for this size).
// scheduleAlarmLoop reads `alarmBuffer` synchronously; if it's not ready yet
// (only the very first short-timer run of a fresh page), the synth chime
// fallback kicks in.
const ALARM_URL = `${import.meta.env.BASE_URL}sounds/timer-alarm.wav`;
let alarmBytesPromise  = null; // Promise<ArrayBuffer | null>
let alarmBufferPromise = null; // Promise<AudioBuffer | null>
let alarmBuffer        = null; // resolved AudioBuffer, available synchronously

function preloadAlarmBytes() {
  if (alarmBytesPromise) return alarmBytesPromise;
  if (typeof fetch !== 'function') return Promise.resolve(null);
  alarmBytesPromise = fetch(ALARM_URL)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${ALARM_URL}`);
      return r.arrayBuffer();
    })
    .catch(err => {
      console.warn('[timer-alarm] fetch failed:', err);
      alarmBytesPromise = null; // allow retry on next call
      return null;
    });
  return alarmBytesPromise;
}
// Kick off the fetch the moment this module is imported (page load).
if (typeof window !== 'undefined') preloadAlarmBytes();

// Promise-shaped sibling of ensureAlarmBuffer. Resolves to the AudioBuffer
// once both the fetch and decode complete, or null on failure. Callers can
// `.then()` this to schedule the sample as soon as it's ready, even if the
// timer ends before decode finishes.
function whenAlarmBufferReady() {
  if (alarmBuffer) return Promise.resolve(alarmBuffer);
  if (alarmBufferPromise) return alarmBufferPromise;
  const ctx = sharedAudioCtx;
  if (!ctx) return Promise.resolve(null);
  alarmBufferPromise = preloadAlarmBytes().then(bytes => {
    if (!bytes) return null;
    // slice(0) hands decodeAudioData a private copy — some browsers neuter
    // the underlying ArrayBuffer after decode, which would block retries.
    return ctx.decodeAudioData(bytes.slice(0))
      .then(buf => {
        alarmBuffer = buf;
        return buf;
      })
      .catch(err => {
        console.warn('[timer-alarm] decode failed:', err);
        alarmBufferPromise = null; // allow retry
        return null;
      });
  });
  return alarmBufferPromise;
}

// Synchronous accessor — returns the buffer if already decoded, otherwise
// kicks off the decode pipeline and returns null. Used by callers that
// want the fast path; the slow path uses whenAlarmBufferReady().
function ensureAlarmBuffer() {
  if (alarmBuffer) return alarmBuffer;
  whenAlarmBufferReady();
  return null;
}

// Build and start the looping AudioBufferSourceNode. startAt is the audio-
// clock time the alarm was originally scheduled for; we clamp to ctx.currentTime
// in case decode took longer than the timer's remaining time.
function createAlarmSource(ctx, buffer, startAt) {
  const t   = Math.max(startAt, ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop   = true;
  const gain = ctx.createGain();
  gain.gain.value = 0.85;
  src.connect(gain).connect(ctx.destination);
  src.start(t);
  return src;
}

// Schedule one tone "blip" on the given context at an absolute audio time.
// Returns the oscillator so the caller can cancel it (osc.stop()) if needed.
// shape: 'pulse' = fast attack, sustain at peak, fast release (square/buzz beeps).
// shape: 'chime' = fast attack, long natural decay across the full duration (bells).
function scheduleTone(ctx, freq, startAt, dur, {
  type    = 'sine',
  peak    = 0.25,
  attack  = 0.01,
  shape   = 'pulse',
} = {}) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attack);
  if (shape === 'chime') {
    // Bell-like: peak immediately, then a smooth exponential decay to silence
    // over the entire duration. No sustain section.
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  } else {
    // Pulse: hold at peak, then quick release at the tail.
    gain.gain.setValueAtTime(peak, startAt + Math.max(attack, dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  }
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
  return osc;
}

// Single short beep for "go". Plays immediately during a user gesture.
function playStartBeep() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  scheduleTone(ctx, 880, ctx.currentTime, 0.15);
}

// Pre-schedule the repeating alarm starting `secondsFromNow` in the future.
// Primary path: loop the slot-machine wav via AudioBufferSourceNode scheduled
// on the audio clock. Fallback path (if the wav isn't decoded yet — rare,
// only on a cold first-ever run): a synthesised triangle-wave ding-dong chime
// so the user still gets an audible cue.
// Pre-scheduling on the audio clock is what makes this reliable on phones with
// the screen off — JS timers get throttled, but the audio engine doesn't.
const ALARM_TOTAL_SECS = 180;

function scheduleAlarmLoop(secondsFromNow) {
  const ctx = getAudioCtx();
  if (!ctx) return [];
  const t0 = ctx.currentTime + Math.max(0, secondsFromNow);

  // Fast path: buffer already decoded — schedule the sample on the audio
  // clock and we're done.
  if (alarmBuffer) {
    return [createAlarmSource(ctx, alarmBuffer, t0)];
  }

  // Slow path: buffer is still decoding. Return a pending handle whose
  // .stop() satisfies the same shape as a real node, so cancellation works
  // through cancelScheduledTones unchanged. When decode resolves, fill in
  // the source — t0 is captured up front, and createAlarmSource clamps to
  // "now" if the timer already fired.
  const pending = {
    cancelled: false,
    src: null,
    stop() {
      this.cancelled = true;
      if (this.src) { try { this.src.stop(); } catch { /* ignore */ } }
    },
  };
  whenAlarmBufferReady().then(buf => {
    if (pending.cancelled) return;
    const ctx2 = getAudioCtx();
    if (!ctx2) return;
    if (buf) {
      pending.src = createAlarmSource(ctx2, buf, t0);
    } else {
      // Decode failed — fall back to synth chime starting from "now" so the
      // user still gets a cue.
      const start = Math.max(t0, ctx2.currentTime);
      const CYCLE = 1.3, NOTE_GAP = 0.42, NOTE_DUR = 0.75;
      const chimeOpts = { type: 'triangle', peak: 0.45, attack: 0.005, shape: 'chime' };
      const cycles = Math.floor(ALARM_TOTAL_SECS / CYCLE);
      const oscs = [];
      for (let i = 0; i < cycles; i++) {
        const cs = start + i * CYCLE;
        oscs.push(scheduleTone(ctx2, 784,  cs,            NOTE_DUR, chimeOpts));
        oscs.push(scheduleTone(ctx2, 1175, cs + NOTE_GAP, NOTE_DUR, chimeOpts));
      }
      // Attach the synth nodes so a later Stop press can cancel them too.
      pending.src = {
        stop() { for (const o of oscs) { try { o.stop(); } catch { /* ignore */ } } },
      };
    }
  });
  return [pending];
}

// Cancel a previously-scheduled alarm (used on pause/reset/stop). Works for
// both OscillatorNode and AudioBufferSourceNode — both expose .stop().
function cancelScheduledTones(nodes) {
  for (const node of nodes ?? []) {
    try { node.stop(); } catch { /* already stopped or never started */ }
  }
}

// ---------------------------------------------------------------------------
// CountdownTimer — a simple start/pause/reset countdown. Fires onComplete
// when the clock hits zero. Independent of the data layer — ExerciseLogCard
// decides what to do with the result.
// ---------------------------------------------------------------------------
function CountdownTimer({ targetSeconds, setsCompleted = 0, targetSets, onComplete }) {
  const [remaining, setRemaining] = useState(targetSeconds);
  const [status, setStatus]       = useState('idle'); // idle | running | paused | done
  const [alarmActive, setAlarmActive] = useState(false); // chime + vibration currently sounding
  const intervalRef = useRef(null);
  const scheduledTonesRef = useRef([]); // oscillators queued for the alarm loop
  const vibrateIntervalRef = useRef(null); // periodic vibration while alarm is sounding

  const doneSets = Number(setsCompleted) || 0;
  const totalSets = Number(targetSets) || 0;
  const allSetsDone = totalSets > 0 && doneSets >= totalSets;

  function clear() { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } }

  function clearVibrate() {
    // Only zero out the buzzer if we actually started one — calling
    // navigator.vibrate before the user has tapped on the frame trips a
    // Chrome intervention warning during React strict-mode double mounts.
    const wasBuzzing = vibrateIntervalRef.current !== null;
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (wasBuzzing && navigator.vibrate) { try { navigator.vibrate(0); } catch { /* ignore */ } }
  }

  function startAlarmVibrate() {
    if (!navigator.vibrate) return;
    // Buzz pattern fires immediately, then repeats every cycle until cleared.
    const pattern = [400, 150, 400, 150, 400];
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
    clearVibrate();
    vibrateIntervalRef.current = setInterval(() => {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }, 1700);
  }

  function cancelDoneTones() {
    cancelScheduledTones(scheduledTonesRef.current);
    scheduledTonesRef.current = [];
    clearVibrate();
    setAlarmActive(false);
  }

  function start() {
    // Always reset timer for the next set
    setRemaining(targetSeconds);
    setStatus('running');
    // Audio: play the start blip and pre-schedule the done ding on the audio
    // engine. Pre-scheduling is what makes the done sound reliable on phones —
    // the beep is queued during this user gesture, so it plays even if JS
    // timers get throttled when the screen sleeps.
    playStartBeep();
    cancelDoneTones();
    scheduledTonesRef.current = scheduleAlarmLoop(targetSeconds);
    const startedAt = Date.now();
    clear();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const next = targetSeconds - elapsed;
      if (next <= 0) {
        setRemaining(0);
        setStatus('done');
        clear();
        // Keep scheduledTonesRef as-is — the alarm is now sounding off the
        // audio engine and reset()/start() needs the refs to cancel it.
        startAlarmVibrate();
        setAlarmActive(true);
        onComplete?.(targetSeconds);
      } else {
        setRemaining(next);
      }
    }, 250);
  }

  function resume() {
    setStatus('running');
    // Re-schedule the alarm for whatever remains.
    cancelDoneTones();
    scheduledTonesRef.current = scheduleAlarmLoop(remaining);
    const startedAt = Date.now();
    const startRemaining = remaining;
    clear();
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const next = startRemaining - elapsed;
      if (next <= 0) {
        setRemaining(0);
        setStatus('done');
        clear();
        startAlarmVibrate();
        setAlarmActive(true);
        onComplete?.(targetSeconds);
      } else {
        setRemaining(next);
      }
    }, 250);
  }

  function pause() {
    setStatus('paused');
    clear();
    cancelDoneTones();
  }

  function reset() {
    setStatus('idle');
    setRemaining(targetSeconds);
    clear();
    cancelDoneTones();
  }

  useEffect(() => () => { clear(); cancelDoneTones(); }, []);
  useEffect(() => {
    if (status === 'idle') setRemaining(targetSeconds);
  }, [targetSeconds]);

  const pct = targetSeconds > 0 ? (remaining / targetSeconds) * 100 : 0;
  const isDone = status === 'done';

  return (
    <div className={`rounded-lg border p-3 mb-2 text-center transition ${
      isDone ? 'bg-primary/10 border-primary/40' : 'bg-secondary/50 border-border'
    }`}>
      {/* Set progress line */}
      {totalSets > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          Set <span className="font-semibold text-foreground">{Math.min(doneSets + 1, totalSets)}</span> of {totalSets}
          {allSetsDone && <span className="text-primary font-medium"> — All sets done!</span>}
        </p>
      )}

      {/* Circular progress ring */}
      <div className="relative w-20 h-20 mx-auto mb-2">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" className="text-border" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r="15" fill="none" stroke="currentColor"
            className={isDone ? 'text-primary' : 'text-accent'}
            strokeWidth="2.5"
            strokeDasharray={`${pct * 0.9425} 94.25`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-mono text-lg font-bold ${isDone ? 'text-primary' : ''}`}>
            {fmtSecs(remaining)}
          </span>
        </div>
      </div>

      {isDone && !allSetsDone && (
        <p className="text-xs font-medium text-primary mb-2">
          Set complete! {totalSets > 0 ? `${totalSets - doneSets} set${totalSets - doneSets === 1 ? '' : 's'} to go.` : "Time's up!"}
        </p>
      )}
      {isDone && allSetsDone && (
        <p className="text-xs font-medium text-primary mb-2">All sets finished!</p>
      )}

      <div className="flex items-center justify-center gap-2">
        {alarmActive ? (
          // While the alarm is sounding, Stop is the only action — big,
          // centered, red — so it's impossible to miss. Pressing it silences
          // the alarm and reveals the normal Next Set / Reset row.
          <button
            onClick={cancelDoneTones}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-destructive text-destructive-foreground text-base font-semibold hover:opacity-90 transition shadow-md"
          >
            <Square size={18} fill="currentColor" /> Stop
          </button>
        ) : (
          <>
            {status === 'idle' && (
              <button
                onClick={start}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
              >
                <Play size={14} /> {doneSets > 0 ? 'Start Next Set' : 'Start Timer'}
              </button>
            )}
            {status === 'paused' && (
              <button
                onClick={resume}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
              >
                <Play size={12} /> Resume
              </button>
            )}
            {status === 'running' && (
              <button
                onClick={pause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium hover:opacity-90 transition"
              >
                <Pause size={12} /> Pause
              </button>
            )}
            {status === 'done' && !allSetsDone && (
              <button
                onClick={start}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
              >
                <Play size={14} /> Next Set
              </button>
            )}
            {status !== 'idle' && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-medium hover:bg-secondary transition"
              >
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function fireConfetti() {
  const colors = ['#0d9488', '#14b8a6', '#fbbf24', '#ffffff'];
  // Two bursts from the bottom corners — feels celebratory without being obnoxious.
  confetti({ particleCount: 80, spread: 70, origin: { x: 0.2, y: 0.9 }, colors });
  confetti({ particleCount: 80, spread: 70, origin: { x: 0.8, y: 0.9 }, colors });
  setTimeout(() => {
    confetti({ particleCount: 60, spread: 100, origin: { y: 0.7 }, colors });
  }, 250);
}
