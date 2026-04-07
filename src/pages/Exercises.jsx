import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Dumbbell, Play, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toDriveEmbedUrl } from '@/lib/driveVideo';

// Categories match what the program builder will use later.
// Keep this list in sync with any UI that filters by category.
const CATEGORIES = [
  'Strength',
  'Cardio',
  'Flexibility',
  'Core',
  'Upper Body',
  'Lower Body',
  'Full Body',
  'Other',
];

export default function Exercises() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('all');
  const [editing, setEditing]     = useState(null); // null = closed, {} = new, {…} = edit

  useEffect(() => {
    load();
    const ch = supabase
      .channel('exercises-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exercises' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name', { ascending: true });
    if (error) setError(error.message);
    else { setExercises(data ?? []); setError(''); }
    setLoading(false);
  }

  async function deleteExercise(id) {
    if (!confirm('Delete this exercise? Programs already using it will keep their copy.')) return;
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) setError(error.message);
  }

  const filtered = exercises.filter((ex) => {
    if (category !== 'all' && ex.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${ex.name} ${ex.notes ?? ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
          <h1 className="text-3xl font-playfair font-semibold mt-1">Exercise Library</h1>
        </div>
        <button
          onClick={() => setEditing({})}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
        >
          <Plus size={18} /> Add Exercise
        </button>
      </div>

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring text-sm"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Dumbbell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {exercises.length === 0
              ? 'No exercises yet. Click "Add Exercise" to build your library.'
              : 'No exercises match this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onEdit={() => setEditing(ex)}
              onDelete={() => deleteExercise(ex.id)}
            />
          ))}
        </div>
      )}

      {editing !== null && (
        <ExerciseModal
          exercise={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ExerciseCard({ exercise, onEdit, onDelete }) {
  // "Watch demo" is collapsed by default so we don't preload 60+ iframes.
  const [showVideo, setShowVideo] = useState(false);
  const embedUrl = toDriveEmbedUrl(exercise.video_url);

  const defaults = [
    exercise.default_sets   ? `${exercise.default_sets} sets`     : null,
    exercise.default_reps   ? `${exercise.default_reps} reps`     : null,
    exercise.default_weight ? `${exercise.default_weight} lbs`    : null,
  ].filter(Boolean).join(' × ');

  return (
    <div className="rounded-xl bg-card border border-border p-4 hover:border-primary/50 transition">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{exercise.name}</p>
          {exercise.category && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
              {exercise.category}
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
            aria-label="Edit exercise"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
            aria-label="Delete exercise"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {defaults && (
        <p className="text-xs text-muted-foreground font-mono">{defaults}</p>
      )}
      {exercise.notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{exercise.notes}</p>
      )}

      {exercise.video_url && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            {embedUrl && (
              <button
                onClick={() => setShowVideo((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Play size={13} /> {showVideo ? 'Hide demo' : 'Watch demo'}
              </button>
            )}
            <a
              href={exercise.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground ml-auto"
            >
              Open in Drive <ExternalLink size={11} />
            </a>
          </div>
          {showVideo && embedUrl && (
            <div className="mt-3 aspect-video rounded-lg overflow-hidden bg-black/80">
              <iframe
                src={embedUrl}
                title={`${exercise.name} demo`}
                className="w-full h-full"
                allow="autoplay"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseModal({ exercise, onClose }) {
  const isEdit = Boolean(exercise.id);
  const [name,   setName]   = useState(exercise.name   ?? '');
  const [cat,    setCat]    = useState(exercise.category ?? 'Strength');
  const [sets,   setSets]   = useState(exercise.default_sets   ?? '');
  const [reps,   setReps]   = useState(exercise.default_reps   ?? '');
  const [weight, setWeight] = useState(exercise.default_weight ?? '');
  const [notes,  setNotes]  = useState(exercise.notes  ?? '');
  const [video,  setVideo]  = useState(exercise.video_url ?? '');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    // Empty number fields → null in DB so we don't store 0 as a default.
    const payload = {
      name:           name.trim(),
      category:       cat,
      default_sets:   sets   === '' ? null : Number(sets),
      default_reps:   reps   === '' ? null : Number(reps),
      default_weight: weight === '' ? null : Number(weight),
      notes:          notes.trim() || null,
      video_url:      video.trim() || null,
    };

    const { error: saveErr } = isEdit
      ? await supabase.from('exercises').update(payload).eq('id', exercise.id)
      : await supabase.from('exercises').insert(payload);

    setBusy(false);
    if (saveErr) {
      setError(saveErr.message);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(20);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-playfair font-semibold text-xl">
            {isEdit ? 'Edit Exercise' : 'Add Exercise'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goblet Squat"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Sets</label>
              <input
                type="number"
                min="0"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                placeholder="3"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Reps</label>
              <input
                type="number"
                min="0"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="10"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Lbs</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="25"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Google Drive Video URL (optional)
            </label>
            <input
              type="url"
              value={video}
              onChange={(e) => setVideo(e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Paste any Drive link. Set the file to "Anyone with the link — Viewer" so clients can watch.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Coaching Notes (optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Cues, form tips, regressions/progressions…"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Exercise'}
          </button>
        </form>
      </div>
    </div>
  );
}
