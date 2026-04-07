import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Search,
  Save, Send, MessageSquarePlus, X, UserPlus, Bookmark, Copy,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AssignClientModal from '@/components/AssignClientModal';

// The heart of the coach portal: assemble a client's program.
//
// Data shape (stored in programs.workouts as JSONB):
// [
//   {
//     id: "local-uuid",              // client-side id, used for React keys
//     title: "Lower Body Day",
//     coach_note: "",                // optional
//     exercises: [
//       {
//         id: "local-uuid",
//         exercise_id: "<library uuid>",
//         name: "Barbell squat",     // SNAPSHOT — library can change later
//         video_url: "...",          // SNAPSHOT
//         sets: 4, reps: 8, weight: 95,
//         coach_note: ""             // optional
//       }
//     ]
//   }
// ]
//
// Each exercise carries its own name + video_url copy, so if Meg later
// renames/deletes "Barbell squat" in the library, existing programs still
// work perfectly.

// ---- Tiny id helper (no uuid dep needed client-side) -----------------------
const rid = () => Math.random().toString(36).slice(2, 10);

export default function ProgramEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [program, setProgram]   = useState(null);
  const [title, setTitle]       = useState('');
  const [workouts, setWorkouts] = useState([]);
  const [library, setLibrary]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [saveMsg, setSaveMsg]   = useState('');

  // The "Add exercise" picker is a modal that targets a specific workout.
  const [pickerFor, setPickerFor] = useState(null); // workout local id or null

  // Assign-client modal state. 'assign' = bind unassigned draft to a client.
  // 'clone'  = clone a template into a new program for a client.
  const [assignMode, setAssignMode] = useState(null); // null | 'assign' | 'clone'

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: prog, error: progErr }, { data: lib, error: libErr }] = await Promise.all([
        supabase.from('programs').select('*').eq('id', id).maybeSingle(),
        supabase.from('exercises').select('*').order('name'),
      ]);
      if (progErr || libErr) { setError((progErr ?? libErr).message); setLoading(false); return; }
      if (!prog)             { setError('Program not found.');       setLoading(false); return; }

      setProgram(prog);
      setTitle(prog.title ?? '');
      // Normalize: make sure every workout/exercise has a local id for keys.
      setWorkouts((prog.workouts ?? []).map((w) => ({
        id: w.id ?? rid(),
        title: w.title ?? '',
        coach_note: w.coach_note ?? '',
        exercises: (w.exercises ?? []).map((e) => ({
          id: e.id ?? rid(),
          exercise_id: e.exercise_id ?? null,
          name: e.name ?? '',
          video_url: e.video_url ?? null,
          sets: e.sets ?? null,
          reps: e.reps ?? null,
          weight: e.weight ?? null,
          coach_note: e.coach_note ?? '',
        })),
      })));
      setLibrary(lib ?? []);
      setLoading(false);
    })();
  }, [id]);

  // ---- Workout-level helpers -----------------------------------------------
  function addWorkout() {
    setWorkouts((ws) => [...ws, { id: rid(), title: '', coach_note: '', exercises: [] }]);
  }
  function removeWorkout(wid) {
    if (!confirm('Delete this workout from the program?')) return;
    setWorkouts((ws) => ws.filter((w) => w.id !== wid));
  }
  function updateWorkout(wid, patch) {
    setWorkouts((ws) => ws.map((w) => (w.id === wid ? { ...w, ...patch } : w)));
  }
  function moveWorkout(wid, dir) {
    setWorkouts((ws) => {
      const i = ws.findIndex((w) => w.id === wid);
      if (i < 0) return ws;
      const j = i + dir;
      if (j < 0 || j >= ws.length) return ws;
      const next = ws.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // ---- Exercise-level helpers ----------------------------------------------
  function addExerciseToWorkout(wid, libExercise) {
    setWorkouts((ws) => ws.map((w) => w.id === wid ? {
      ...w,
      exercises: [...w.exercises, {
        id: rid(),
        exercise_id: libExercise.id,
        name:        libExercise.name,
        video_url:   libExercise.video_url ?? null,
        // Seed with the library defaults. Coach can override below.
        sets:   libExercise.default_sets   ?? null,
        reps:   libExercise.default_reps   ?? null,
        weight: libExercise.default_weight ?? null,
        coach_note: '',
      }],
    } : w));
    setPickerFor(null);
  }
  function removeExercise(wid, eid) {
    setWorkouts((ws) => ws.map((w) => w.id === wid ? {
      ...w, exercises: w.exercises.filter((e) => e.id !== eid),
    } : w));
  }
  function updateExercise(wid, eid, patch) {
    setWorkouts((ws) => ws.map((w) => w.id === wid ? {
      ...w, exercises: w.exercises.map((e) => e.id === eid ? { ...e, ...patch } : e),
    } : w));
  }
  function moveExercise(wid, eid, dir) {
    setWorkouts((ws) => ws.map((w) => {
      if (w.id !== wid) return w;
      const i = w.exercises.findIndex((e) => e.id === eid);
      if (i < 0) return w;
      const j = i + dir;
      if (j < 0 || j >= w.exercises.length) return w;
      const next = w.exercises.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...w, exercises: next };
    }));
  }

  // ---- Save / Publish / Unpublish ------------------------------------------
  async function save({ publish = false, unpublish = false } = {}) {
    // Templates and unassigned drafts cannot be published — there's no client
    // to publish them to. The Publish button is hidden in those cases, but
    // guard here too in case anything ever calls save({publish:true}) on one.
    if (publish && !program.client_id) {
      setError('Assign this program to a client before publishing.');
      return;
    }

    // Safety gate: if publishing, make sure this client doesn't already have
    // a different active program. Two active programs for one client would
    // cause the client dashboard's .maybeSingle() to throw, so we have to
    // catch it here.
    if (publish) {
      const { data: conflicts, error: confErr } = await supabase
        .from('programs')
        .select('id, title')
        .eq('client_id', program.client_id)
        .eq('status', 'active')
        .neq('id', id);
      if (confErr) { setError(confErr.message); return; }
      if (conflicts && conflicts.length > 0) {
        const other = conflicts[0];
        const ok = confirm(
          `${program.client_name} already has a published program ` +
          `("${other.title}").\n\n` +
          `Publishing this one will leave them with TWO active programs, ` +
          `and they may not see either correctly.\n\n` +
          `Tip: unpublish or delete the old one first.\n\n` +
          `Publish anyway?`
        );
        if (!ok) return;
      }
    }

    setSaving(true);
    setError('');
    setSaveMsg('');

    const fallbackTitle =
      program.is_template          ? 'Untitled Template' :
      program.client_name          ? `${program.client_name}'s Program` :
                                     'Untitled Draft';

    const payload = {
      title: title.trim() || fallbackTitle,
      workouts: workouts.map((w) => ({
        id: w.id,
        title: w.title.trim(),
        coach_note: w.coach_note.trim(),
        exercises: w.exercises.map((e) => ({
          id: e.id,
          exercise_id: e.exercise_id,
          name: e.name,
          video_url: e.video_url,
          sets:   e.sets   === '' || e.sets   == null ? null : Number(e.sets),
          reps:   e.reps   === '' || e.reps   == null ? null : Number(e.reps),
          weight: e.weight === '' || e.weight == null ? null : Number(e.weight),
          coach_note: (e.coach_note ?? '').trim(),
        })),
      })),
    };

    if (publish) {
      payload.status = 'active';
      payload.published_at = new Date().toISOString();
    } else if (unpublish) {
      payload.status = 'draft';
    } else if (program.status === 'active') {
      // Already-published program being edited in place — refresh the
      // published_at timestamp so the 3-week stale clock resets. The status
      // stays 'active' (we don't touch it).
      payload.published_at = new Date().toISOString();
    }

    const { data, error: saveErr } = await supabase
      .from('programs')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    setSaving(false);
    if (saveErr) { setError(saveErr.message); return; }
    setProgram(data);
    setSaveMsg(
      publish    ? 'Published!' :
      unpublish  ? 'Moved back to draft' :
      program.status === 'active' ? 'Changes saved & republished' :
      'Saved'
    );
    if (navigator.vibrate) navigator.vibrate(publish ? [30, 40, 30] : 20);
    setTimeout(() => setSaveMsg(''), 2500);
  }

  // ---- Assign / Clone -------------------------------------------------------
  // Assign in place: convert this unassigned draft into a real program
  // attached to a client. Stays a draft afterward so coach can review.
  async function assignToClient(client) {
    const newTitle =
      title.trim() ||
      (program.is_template ? `${client.first_name}'s Program` : `${client.first_name}'s Program`);

    const { data, error: assignErr } = await supabase
      .from('programs')
      .update({
        client_id:   client.id,
        client_name: `${client.first_name} ${client.last_name}`,
        title:       newTitle,
      })
      .eq('id', id)
      .select()
      .single();

    if (assignErr) throw new Error(assignErr.message);
    setProgram(data);
    setTitle(data.title ?? '');
    setAssignMode(null);
    setSaveMsg(`Assigned to ${client.first_name}`);
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => setSaveMsg(''), 2500);
  }

  // Clone a template into a brand-new program for a client. Original template
  // stays untouched so it can be reused. Navigates to the new program.
  async function cloneTemplateForClient(client) {
    // Save any in-flight edits to the template first so the clone reflects them.
    const cleanWorkouts = workouts.map((w) => ({
      id: w.id,
      title: w.title.trim(),
      coach_note: w.coach_note.trim(),
      exercises: w.exercises.map((e) => ({
        id: e.id,
        exercise_id: e.exercise_id,
        name: e.name,
        video_url: e.video_url,
        sets:   e.sets   === '' || e.sets   == null ? null : Number(e.sets),
        reps:   e.reps   === '' || e.reps   == null ? null : Number(e.reps),
        weight: e.weight === '' || e.weight == null ? null : Number(e.weight),
        coach_note: (e.coach_note ?? '').trim(),
      })),
    }));

    const { data: created, error: cloneErr } = await supabase
      .from('programs')
      .insert({
        client_id:   client.id,
        client_name: `${client.first_name} ${client.last_name}`,
        title:       title.trim() || `${client.first_name}'s Program`,
        status:      'draft',
        is_template: false,
        workouts:    cleanWorkouts,
      })
      .select()
      .single();

    if (cloneErr) throw new Error(cloneErr.message);
    setAssignMode(null);
    if (navigator.vibrate) navigator.vibrate(20);
    navigate(`/coach/programs/${created.id}`);
  }

  // Convert a draft into a template (or vice versa) without changing anything else.
  async function convertToTemplate() {
    if (program.client_id) {
      const ok = confirm(
        `Convert "${program.title}" to a template?\n\n` +
        `This will unlink it from ${program.client_name}. ` +
        `If they had it published, it'll become a draft.\n\n` +
        `Tip: Use "Save as new template" instead if you want to keep this program for ${program.client_name}.`
      );
      if (!ok) return;
    }
    const { data, error: convErr } = await supabase
      .from('programs')
      .update({
        is_template: true,
        client_id:   null,
        client_name: null,
        status:      'draft',
      })
      .eq('id', id)
      .select()
      .single();
    if (convErr) { setError(convErr.message); return; }
    setProgram(data);
    setSaveMsg('Saved as template');
    setTimeout(() => setSaveMsg(''), 2500);
  }

  // "Save as new template" — copies the current program into a new template
  // row, leaving the original alone.
  async function saveAsNewTemplate() {
    const cleanWorkouts = workouts.map((w) => ({
      id: w.id,
      title: w.title.trim(),
      coach_note: w.coach_note.trim(),
      exercises: w.exercises.map((e) => ({
        id: e.id,
        exercise_id: e.exercise_id,
        name: e.name,
        video_url: e.video_url,
        sets:   e.sets   === '' || e.sets   == null ? null : Number(e.sets),
        reps:   e.reps   === '' || e.reps   == null ? null : Number(e.reps),
        weight: e.weight === '' || e.weight == null ? null : Number(e.weight),
        coach_note: (e.coach_note ?? '').trim(),
      })),
    }));
    const { error: tplErr } = await supabase
      .from('programs')
      .insert({
        client_id:   null,
        client_name: null,
        is_template: true,
        status:      'draft',
        title:       (title.trim() || 'Untitled') + ' (template)',
        workouts:    cleanWorkouts,
      });
    if (tplErr) { setError(tplErr.message); return; }
    setSaveMsg('Saved as new template');
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => setSaveMsg(''), 2500);
  }

  async function deleteProgram() {
    if (!confirm('Delete this program permanently? Workout logs will be kept.')) return;
    const { error: delErr } = await supabase.from('programs').delete().eq('id', id);
    if (delErr) { setError(delErr.message); return; }
    navigate('/coach/programs');
  }

  // ---- Render ---------------------------------------------------------------
  if (loading)  return <div className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></div>;
  if (!program) return <div className="p-6"><p className="text-sm text-destructive">{error || 'Not found'}</p></div>;

  const isPublished = program.status === 'active';
  const isTemplate  = program.is_template === true;
  const isUnassigned = !program.client_id && !isTemplate;

  const headerLabel =
    isTemplate   ? 'Template · Reusable' :
    isUnassigned ? 'Unassigned draft' :
                   `${program.client_name} · ${isPublished ? 'Published' : 'Draft'}`;

  return (
    <div className="p-6 max-w-4xl mx-auto pb-32">
      {/* Header */}
      <Link to="/coach/programs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft size={14} /> Back to Programs
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest flex items-center gap-2">
            {isTemplate && <Bookmark size={12} className="text-accent" />}
            <span className={isTemplate ? 'text-accent font-medium' : 'text-muted-foreground'}>
              {headerLabel}
            </span>
          </p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isTemplate ? 'Template name' : 'Program title'}
            className="w-full mt-1 text-3xl font-playfair font-semibold bg-transparent focus:outline-none border-b border-transparent focus:border-border pb-1"
          />
        </div>
      </div>

      {/* Banner explaining the mode for templates / unassigned drafts */}
      {(isTemplate || isUnassigned) && (
        <div className={`mb-4 px-4 py-3 rounded-lg border text-sm flex items-start gap-2 ${
          isTemplate
            ? 'bg-accent/10 border-accent/30 text-accent-foreground'
            : 'bg-secondary border-border text-muted-foreground'
        }`}>
          {isTemplate ? <Bookmark size={16} className="flex-shrink-0 mt-0.5 text-accent" /> : <UserPlus size={16} className="flex-shrink-0 mt-0.5" />}
          <div>
            <p className="font-medium text-foreground">
              {isTemplate ? 'This is a reusable template' : 'This program is not assigned to a client yet'}
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              {isTemplate
                ? 'Templates can be cloned to create new programs for any client. The template stays untouched.'
                : 'Build it out, then assign it to a client when you\'re ready. You can also save it as a template to reuse.'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Workouts */}
      <div className="space-y-4">
        {workouts.map((w, wIdx) => (
          <WorkoutCard
            key={w.id}
            index={wIdx}
            workout={w}
            total={workouts.length}
            library={library}
            onUpdate={(patch) => updateWorkout(w.id, patch)}
            onRemove={() => removeWorkout(w.id)}
            onMove={(dir) => moveWorkout(w.id, dir)}
            onOpenPicker={() => setPickerFor(w.id)}
            onRemoveExercise={(eid) => removeExercise(w.id, eid)}
            onUpdateExercise={(eid, patch) => updateExercise(w.id, eid, patch)}
            onMoveExercise={(eid, dir) => moveExercise(w.id, eid, dir)}
          />
        ))}

        <button
          onClick={addWorkout}
          className="w-full py-6 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-primary transition flex items-center justify-center gap-2 font-medium"
        >
          <Plus size={18} /> Add Workout
        </button>
      </div>

      {/* Sticky footer with save/publish actions */}
      <div className="fixed bottom-0 left-0 md:left-64 right-0 border-t border-border bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3 text-sm text-muted-foreground min-w-0">
          {saveMsg && <span className="text-primary font-medium animate-fade-in truncate">{saveMsg}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={deleteProgram}
            className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>

          {/* Save (always available) */}
          <button
            onClick={() => save()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card font-medium hover:bg-secondary transition text-sm disabled:opacity-50"
            title={isPublished ? 'Save changes (stays published)' : 'Save as draft'}
          >
            <Save size={15} />{' '}
            {saving
              ? 'Saving…'
              : isPublished
                ? 'Save Changes'
                : isTemplate
                  ? 'Save Template'
                  : 'Save Draft'}
          </button>

          {/* Template-only: clone for a client */}
          {isTemplate && (
            <button
              onClick={() => setAssignMode('clone')}
              disabled={saving || workouts.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm disabled:opacity-50"
              title="Create a new program for a client from this template"
            >
              <Copy size={15} /> Use Template
            </button>
          )}

          {/* Unassigned-only: assign to a client (in place) */}
          {isUnassigned && (
            <button
              onClick={() => setAssignMode('assign')}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm disabled:opacity-50"
            >
              <UserPlus size={15} /> Assign to Client
            </button>
          )}

          {/* Assigned-program: Publish / Unpublish */}
          {!isTemplate && !isUnassigned && (
            isPublished ? (
              <button
                onClick={() => save({ unpublish: true })}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary font-medium hover:opacity-90 transition text-sm disabled:opacity-50"
              >
                Unpublish
              </button>
            ) : (
              <button
                onClick={() => save({ publish: true })}
                disabled={saving || workouts.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm disabled:opacity-50"
              >
                <Send size={15} /> Publish
              </button>
            )
          )}

          {/* "Save as new template" — handy on any non-template program */}
          {!isTemplate && (
            <button
              onClick={saveAsNewTemplate}
              disabled={saving || workouts.length === 0}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition text-sm disabled:opacity-50"
              title="Save a copy of this program as a reusable template"
            >
              <Bookmark size={15} /> Save as Template
            </button>
          )}
        </div>
      </div>

      {/* Exercise picker modal */}
      {pickerFor && (
        <ExercisePicker
          library={library}
          onClose={() => setPickerFor(null)}
          onPick={(ex) => addExerciseToWorkout(pickerFor, ex)}
        />
      )}

      {/* Assign / Clone client picker */}
      {assignMode === 'assign' && (
        <AssignClientModal
          title="Assign program to a client"
          confirmLabel="Assign"
          onClose={() => setAssignMode(null)}
          onConfirm={assignToClient}
        />
      )}
      {assignMode === 'clone' && (
        <AssignClientModal
          title="Use template for a client"
          confirmLabel="Create program"
          onClose={() => setAssignMode(null)}
          onConfirm={cloneTemplateForClient}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkoutCard — single workout block with its exercises
// ---------------------------------------------------------------------------
function WorkoutCard({
  index, workout, total, onUpdate, onRemove, onMove,
  onOpenPicker, onRemoveExercise, onUpdateExercise, onMoveExercise,
}) {
  const [showNote, setShowNote] = useState(Boolean(workout.coach_note));

  return (
    <div className="rounded-xl bg-card border border-border p-4">
      {/* Workout header */}
      <div className="flex items-start gap-2 mb-3">
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <input
          type="text"
          value={workout.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder={`Workout ${index + 1} (e.g. Lower Body Day)`}
          className="flex-1 text-lg font-medium bg-transparent focus:outline-none border-b border-transparent focus:border-border pb-1"
        />

        <button
          onClick={() => setShowNote((v) => !v)}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          title="Add coach note"
        >
          <MessageSquarePlus size={16} />
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
          aria-label="Delete workout"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Optional workout-level coach note */}
      {showNote && (
        <textarea
          rows={2}
          value={workout.coach_note}
          onChange={(e) => onUpdate({ coach_note: e.target.value })}
          placeholder="Coach note for this workout (optional)…"
          className="w-full mb-3 px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
        />
      )}

      {/* Exercises */}
      <div className="space-y-2">
        {workout.exercises.map((ex, eIdx) => (
          <ExerciseRow
            key={ex.id}
            exercise={ex}
            index={eIdx}
            total={workout.exercises.length}
            onUpdate={(patch) => onUpdateExercise(ex.id, patch)}
            onRemove={() => onRemoveExercise(ex.id)}
            onMove={(dir) => onMoveExercise(ex.id, dir)}
          />
        ))}
      </div>

      <button
        onClick={onOpenPicker}
        className="mt-3 w-full py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/60 transition flex items-center justify-center gap-1.5"
      >
        <Plus size={14} /> Add Exercise
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExerciseRow — one exercise inside a workout
// ---------------------------------------------------------------------------
function ExerciseRow({ exercise, index, total, onUpdate, onRemove, onMove }) {
  const [showNote, setShowNote] = useState(Boolean(exercise.coach_note));

  return (
    <div className="rounded-lg bg-background border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp size={12} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown size={12} />
          </button>
        </div>
        <p className="flex-1 font-medium text-sm truncate">{exercise.name}</p>
        <button
          onClick={() => setShowNote((v) => !v)}
          className="p-1.5 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          title="Add coach note"
        >
          <MessageSquarePlus size={14} />
        </button>
        <button
          onClick={onRemove}
          className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
          aria-label="Remove"
        >
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <NumField label="Sets"   value={exercise.sets}   onChange={(v) => onUpdate({ sets: v })} />
        <NumField label="Reps"   value={exercise.reps}   onChange={(v) => onUpdate({ reps: v })} />
        <NumField label="Weight" value={exercise.weight} onChange={(v) => onUpdate({ weight: v })} step="0.5" />
      </div>

      {showNote && (
        <textarea
          rows={2}
          value={exercise.coach_note}
          onChange={(e) => onUpdate({ coach_note: e.target.value })}
          placeholder="Coach note for this exercise (optional)…"
          className="w-full mt-2 px-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring text-xs resize-none"
        />
      )}
    </div>
  );
}

function NumField({ label, value, onChange, step = '1' }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded-md border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring text-sm"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// ExercisePicker — modal to add an exercise from the library into a workout
// ---------------------------------------------------------------------------
function ExercisePicker({ library, onClose, onPick }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q.trim()) return library;
    const needle = q.toLowerCase();
    return library.filter((e) =>
      `${e.name} ${e.category ?? ''}`.toLowerCase().includes(needle)
    );
  }, [library, q]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg p-4 shadow-xl animate-fade-in max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-playfair font-semibold text-lg">Add Exercise</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            placeholder="Search exercises…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No matches.</p>
          ) : filtered.map((ex) => (
            <button
              key={ex.id}
              onClick={() => onPick(ex)}
              className="w-full text-left rounded-lg border border-border bg-background p-3 hover:border-primary/60 transition"
            >
              <p className="font-medium text-sm">{ex.name}</p>
              <p className="text-xs text-muted-foreground">
                {ex.category ?? 'Uncategorized'}
                {(ex.default_sets || ex.default_reps || ex.default_weight) && ' · '}
                {[
                  ex.default_sets   && `${ex.default_sets} sets`,
                  ex.default_reps   && `${ex.default_reps} reps`,
                  ex.default_weight && `${ex.default_weight} lbs`,
                ].filter(Boolean).join(' × ')}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
