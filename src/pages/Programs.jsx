import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, ClipboardList, CheckCircle2, PenLine, AlertTriangle, Bookmark,
  FolderPlus, LayoutList, Pencil, Trash2, X, Timer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Coach-side Programs list. Shows every program grouped by status
// (published first, then drafts). Clicking any row opens the editor.
// Clients without a program get a "Build Program" shortcut so coach can
// quickly spin one up without leaving the page.
export default function Programs() {
  const [programs, setPrograms] = useState([]);
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showWktTemplates, setShowWktTemplates] = useState(false);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('programs-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients'  }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: progs, error: progErr }, { data: cls, error: clsErr }] = await Promise.all([
      supabase.from('programs').select('*').order('updated_at', { ascending: false }),
      supabase.from('clients').select('id, first_name, last_name, status').eq('status', 'active').order('first_name'),
    ]);
    if (progErr || clsErr) setError((progErr ?? clsErr).message);
    else {
      setPrograms(progs ?? []);
      setClients(cls ?? []);
      setError('');
    }
    setLoading(false);
  }

  // Templates and unassigned drafts have no client_id and live in their own
  // sections. Everything else is grouped by status under each client.
  const templates        = programs.filter((p) => p.is_template === true);
  const unassigned       = programs.filter((p) => !p.is_template && !p.client_id);
  const assigned         = programs.filter((p) => !p.is_template && p.client_id);
  const published        = assigned.filter((p) => p.status === 'active');
  const drafts           = assigned.filter((p) => p.status === 'draft');
  const clientsWithoutProgram = clients.filter(
    (c) => !assigned.some((p) => p.client_id === c.id && p.status !== 'completed')
  );

  // Count active programs per client so we can flag duplicates.
  const activeCountByClient = {};
  for (const p of published) {
    activeCountByClient[p.client_id] = (activeCountByClient[p.client_id] ?? 0) + 1;
  }
  const duplicateClientIds = new Set(
    Object.entries(activeCountByClient).filter(([, n]) => n > 1).map(([id]) => id)
  );
  const hasDuplicates = duplicateClientIds.size > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
          <h1 className="text-3xl font-playfair font-semibold mt-1">Programs</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWktTemplates(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card font-medium hover:bg-secondary transition text-sm"
          >
            <LayoutList size={16} /> Workout Templates
          </button>
          <Link
            to="/coach/programs/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            <Plus size={18} /> New Program
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {hasDuplicates && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Heads up — some clients have more than one published program.</p>
            <p className="text-xs opacity-80 mt-0.5">
              The client app will only show the most recently published one. Unpublish the older program to clean this up.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : programs.length === 0 && clientsWithoutProgram.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {published.length > 0 && (
            <Section title="Published" icon={CheckCircle2} iconClass="text-primary">
              {published.map((p) => (
                <ProgramRow
                  key={p.id}
                  program={p}
                  duplicate={duplicateClientIds.has(p.client_id)}
                />
              ))}
            </Section>
          )}

          {drafts.length > 0 && (
            <Section title="Drafts" icon={PenLine} iconClass="text-muted-foreground">
              {drafts.map((p) => <ProgramRow key={p.id} program={p} />)}
            </Section>
          )}

          {unassigned.length > 0 && (
            <Section title="Unassigned drafts" icon={FolderPlus} iconClass="text-muted-foreground">
              {unassigned.map((p) => <ProgramRow key={p.id} program={p} />)}
            </Section>
          )}

          {templates.length > 0 && (
            <Section title="Templates" icon={Bookmark} iconClass="text-accent">
              {templates.map((p) => <ProgramRow key={p.id} program={p} />)}
            </Section>
          )}

          {clientsWithoutProgram.length > 0 && (
            <Section title="Clients without a program" icon={ClipboardList} iconClass="text-accent">
              {clientsWithoutProgram.map((c) => (
                <Link
                  key={c.id}
                  to={`/coach/programs/new?client=${c.id}`}
                  className="flex items-center justify-between rounded-xl bg-card border border-dashed border-border p-4 hover:border-primary/60 transition"
                >
                  <div>
                    <p className="font-medium">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-muted-foreground">No program yet</p>
                  </div>
                  <span className="text-xs font-medium text-primary flex items-center gap-1">
                    <Plus size={14} /> Build Program
                  </span>
                </Link>
              ))}
            </Section>
          )}
        </div>
      )}

      {showWktTemplates && (
        <WorkoutTemplatesManager onClose={() => setShowWktTemplates(false)} />
      )}
    </div>
  );
}

function Section({ title, icon: Icon, iconClass, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className={iconClass} />
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ProgramRow({ program, duplicate = false }) {
  const workoutCount = Array.isArray(program.workouts) ? program.workouts.length : 0;
  const isTemplate   = program.is_template === true;
  const isUnassigned = !isTemplate && !program.client_id;

  const statusBadge = isTemplate
    ? { text: 'Template',   cls: 'bg-accent/15 text-accent' }
    : isUnassigned
      ? { text: 'Unassigned', cls: 'bg-secondary text-muted-foreground' }
      : program.status === 'active'
        ? { text: 'Published', cls: 'bg-primary/15 text-primary' }
        : { text: 'Draft',     cls: 'bg-secondary text-muted-foreground' };

  const subtitle = isTemplate
    ? `Reusable · ${workoutCount} workout${workoutCount === 1 ? '' : 's'}`
    : isUnassigned
      ? `Not assigned · ${workoutCount} workout${workoutCount === 1 ? '' : 's'}`
      : `${program.client_name || '—'} · ${workoutCount} workout${workoutCount === 1 ? '' : 's'}` +
        (program.published_at ? ` · published ${new Date(program.published_at).toLocaleDateString()}` : '');

  return (
    <Link
      to={`/coach/programs/${program.id}`}
      className={`flex items-center justify-between rounded-xl bg-card border p-4 transition ${
        duplicate ? 'border-amber-500/50 hover:border-amber-500' :
        isTemplate ? 'border-accent/30 hover:border-accent/60' :
        'border-border hover:border-primary/60'
      }`}
    >
      <div className="min-w-0 flex items-center gap-3">
        {isTemplate && <Bookmark size={16} className="text-accent flex-shrink-0" />}
        {isUnassigned && <FolderPlus size={16} className="text-muted-foreground flex-shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-medium truncate">{program.title || 'Untitled program'}</p>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge.cls}`}>
              {statusBadge.text}
            </span>
            {duplicate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <AlertTriangle size={11} /> Duplicate active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// WorkoutTemplatesManager — full modal for managing workout templates.
// Meg can view all templates, create new ones, edit existing, and delete.
// ---------------------------------------------------------------------------
const WKT_CATEGORIES = ['Lower', 'Upper', 'Push', 'Pull', 'Full Body', 'Cardio', 'Core', 'Other'];

function WorkoutTemplatesManager({ onClose }) {
  const [templates, setTemplates] = useState([]);
  const [library, setLibrary]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [editing, setEditing]     = useState(null); // null=list, {}=new, {...}=edit

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: tpls, error: e1 }, { data: lib, error: e2 }] = await Promise.all([
      supabase.from('workout_templates').select('*').order('title'),
      supabase.from('exercises').select('*').order('name'),
    ]);
    if (e1 || e2) setError((e1 ?? e2).message);
    else { setTemplates(tpls ?? []); setLibrary(lib ?? []); setError(''); }
    setLoading(false);
  }

  async function deleteTpl(id) {
    if (!confirm('Delete this workout template?')) return;
    const { error: e } = await supabase.from('workout_templates').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setTemplates((t) => t.filter((x) => x.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-xl animate-fade-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {editing !== null ? (
          <WorkoutTemplateEditor
            template={editing}
            library={library}
            onSaved={() => { setEditing(null); load(); }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="font-playfair font-semibold text-xl">Workout Templates</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reusable single-session workouts — slot them into any program with one tap.
                </p>
              </div>
              <button onClick={onClose} className="p-1.5 rounded hover:bg-secondary"><X size={18} /></button>
            </div>

            <div className="px-6 py-3 border-b border-border">
              <button
                onClick={() => setEditing({})}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm"
              >
                <Plus size={16} /> New Workout Template
              </button>
            </div>

            {error && (
              <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
              ) : templates.length === 0 ? (
                <div className="text-center py-10">
                  <LayoutList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No workout templates yet. Create one above, or save one from the program editor
                    using the bookmark button on any workout card.
                  </p>
                </div>
              ) : templates.map((tpl) => (
                <div key={tpl.id} className="rounded-lg border border-border bg-background p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{tpl.title}</p>
                      {tpl.category && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent">
                          {tpl.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(tpl.exercises?.length ?? 0)} exercise{(tpl.exercises?.length ?? 0) === 1 ? '' : 's'}
                      {tpl.exercises?.some((e) => e.exercise_type === 'timed') && (
                        <span className="inline-flex items-center gap-0.5 ml-1.5">
                          <Timer size={10} /> incl. timed
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing(tpl)}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteTpl(tpl.id)}
                    className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkoutTemplateEditor — create or edit a single workout template.
// Inline exercise list with add-from-library, reorder, remove, and the
// same sets/reps/duration/weight/coach_note fields as the program editor.
// ---------------------------------------------------------------------------
const rid = () => Math.random().toString(36).slice(2, 10);

function WorkoutTemplateEditor({ template, library, onSaved, onCancel }) {
  const isEdit = Boolean(template.id);
  const [title, setTitle]       = useState(template.title ?? '');
  const [cat, setCat]           = useState(template.category ?? '');
  const [exercises, setExercises] = useState(
    (template.exercises ?? []).map((e) => ({ ...e, id: e.id ?? rid() }))
  );
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  function addFromLibrary(libEx) {
    const additions = Array.isArray(libEx) ? libEx : [libEx];
    setExercises((prev) => [
      ...prev,
      ...additions.map((ex) => ({
        id: rid(),
        exercise_id:   ex.id,
        name:          ex.name,
        video_url:     ex.video_url ?? null,
        exercise_type: ex.exercise_type ?? 'reps',
        sets:          ex.default_sets ?? null,
        reps:          ex.default_reps ?? null,
        duration:      ex.default_duration ?? null,
        weight:        ex.default_weight ?? null,
        coach_note:    '',
      })),
    ]);
    setShowPicker(false);
  }

  function updateEx(eid, patch) {
    setExercises((arr) => arr.map((e) => (e.id === eid ? { ...e, ...patch } : e)));
  }
  function removeEx(eid) {
    setExercises((arr) => arr.filter((e) => e.id !== eid));
  }
  function moveEx(eid, dir) {
    setExercises((arr) => {
      const i = arr.findIndex((e) => e.id === eid);
      if (i < 0) return arr;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Give the template a name.'); return; }
    setBusy(true);
    setError('');
    const payload = {
      title: title.trim(),
      category: cat || null,
      exercises: exercises.map((ex) => ({
        exercise_id:   ex.exercise_id ?? null,
        name:          ex.name,
        video_url:     ex.video_url ?? null,
        exercise_type: ex.exercise_type ?? 'reps',
        sets:          ex.sets   === '' || ex.sets   == null ? null : Number(ex.sets),
        reps:          ex.reps   === '' || ex.reps   == null ? null : Number(ex.reps),
        duration:      ex.duration === '' || ex.duration == null ? null : Number(ex.duration),
        weight:        ex.weight === '' || ex.weight == null ? null : Number(ex.weight),
        coach_note:    (ex.coach_note ?? '').trim(),
      })),
      updated_at: new Date().toISOString(),
    };

    const { error: saveErr } = isEdit
      ? await supabase.from('workout_templates').update(payload).eq('id', template.id)
      : await supabase.from('workout_templates').insert(payload);
    setBusy(false);
    if (saveErr) { setError(saveErr.message); return; }
    if (navigator.vibrate) navigator.vibrate(20);
    onSaved();
  }

  return (
    <form onSubmit={save} className="flex flex-col max-h-[90vh]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="font-playfair font-semibold text-lg">
          {isEdit ? 'Edit Workout Template' : 'New Workout Template'}
        </h2>
        <button type="button" onClick={onCancel} className="p-1.5 rounded hover:bg-secondary"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Template name *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lower Body A"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            >
              <option value="">None</option>
              {WKT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Exercises */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Exercises</p>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <TplExerciseRow
                key={ex.id}
                exercise={ex}
                index={i}
                total={exercises.length}
                onUpdate={(patch) => updateEx(ex.id, patch)}
                onRemove={() => removeEx(ex.id)}
                onMove={(dir) => moveEx(ex.id, dir)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="mt-2 w-full py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-primary hover:border-primary/60 transition flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Add Exercise from Library
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-t border-border">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 text-sm"
        >
          {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg border border-input bg-card hover:bg-secondary transition text-sm"
        >
          Cancel
        </button>
      </div>

      {showPicker && (
        <TplExercisePicker
          library={library}
          onClose={() => setShowPicker(false)}
          onPick={addFromLibrary}
        />
      )}
    </form>
  );
}

// Compact exercise row for the template editor
function TplExerciseRow({ exercise, index, total, onUpdate, onRemove, onMove }) {
  const isTimed = exercise.exercise_type === 'timed';
  return (
    <div className="rounded-lg bg-card border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex flex-col gap-0.5">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp size={12} /></button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown size={12} /></button>
        </div>
        <p className="flex-1 font-medium text-sm truncate">{exercise.name}</p>
        <button
          type="button"
          onClick={() => onUpdate({ exercise_type: isTimed ? 'reps' : 'timed' })}
          className={`p-1.5 rounded transition ${isTimed ? 'text-accent bg-accent/10' : 'text-muted-foreground hover:bg-secondary'}`}
          title={isTimed ? 'Timed — click for reps' : 'Rep-based — click for timed'}
        ><Timer size={14} /></button>
        <button type="button" onClick={onRemove}
          className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniNum label="Sets" value={exercise.sets} onChange={(v) => onUpdate({ sets: v })} />
        {isTimed
          ? <MiniNum label="Duration (sec)" value={exercise.duration} onChange={(v) => onUpdate({ duration: v })} />
          : <MiniNum label="Reps" value={exercise.reps} onChange={(v) => onUpdate({ reps: v })} />}
        <MiniNum label="Weight" value={exercise.weight} onChange={(v) => onUpdate({ weight: v })} step="0.5" />
      </div>
    </div>
  );
}

function MiniNum({ label, value, onChange, step = '1' }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</span>
      <input type="number" min="0" step={step} value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
      />
    </label>
  );
}

// Simplified exercise picker for the template editor (same pattern as ProgramEditor's)
function TplExercisePicker({ library, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const filtered = q.trim()
    ? library.filter((e) => `${e.name} ${e.category ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    : library;

  function toggle(ex) {
    setSelected((s) => s.includes(ex.id) ? s.filter((id) => id !== ex.id) : [...s, ex.id]);
  }
  function commit() {
    if (!selected.length) return;
    const byId = Object.fromEntries(library.map((e) => [e.id, e]));
    onPick(selected.map((id) => byId[id]).filter(Boolean));
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-4 shadow-xl animate-fade-in max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-playfair font-semibold text-lg">Add Exercises</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-secondary"><X size={16} /></button>
        </div>
        <div className="relative mb-3">
          <input autoFocus type="text" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full pl-3 pr-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm" />
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No matches.</p>
          ) : filtered.map((ex) => {
            const sel = selected.includes(ex.id);
            return (
              <button key={ex.id} type="button" onClick={() => toggle(ex)}
                className={`w-full text-left rounded-lg border p-3 transition flex items-center gap-3 ${
                  sel ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/60'}`}>
                <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold border ${
                  sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card'}`}>
                  {sel ? '✓' : ''}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{ex.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ex.category ?? 'Uncategorized'}
                    {ex.exercise_type === 'timed' && ' · Timed'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex justify-end gap-2">
          <button type="button" onClick={commit} disabled={!selected.length}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 text-sm disabled:opacity-50">
            <Plus size={14} /> Add {selected.length || ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground mb-4">
        No programs yet. Invite a client first, then build their first program here.
      </p>
      <Link
        to="/coach/clients"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition text-sm"
      >
        Go to Clients
      </Link>
    </div>
  );
}
