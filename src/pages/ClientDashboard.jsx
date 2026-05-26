import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Sun, Moon, Play, ChevronRight, ChevronDown, Clock, MessageSquare, Check, History, Settings, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useClientUnreadMessages } from '@/lib/useUnreadMessages';

// Client-facing home. Shows either "not yet ready" or a list of workouts
// from their published program. Each workout card can be tapped to start
// the Workout Session (built in a later session).
export default function ClientDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [client, setClient]     = useState(null);
  const [program, setProgram]   = useState(null);
  const [logs, setLogs]         = useState([]); // workout_logs for this client+program
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dark, setDark]         = useState(() => localStorage.getItem('sw-theme') === 'dark');
  const unreadMessages          = useClientUnreadMessages(client?.id);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sw-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!user) return;
    load();
    // Realtime: if coach publishes/updates the program, the client sees it live.
    // Also reload when workout_logs change so completion checkmarks stay current.
    const ch = supabase
      .channel('client-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'programs' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  async function load() {
    setLoading(true);
    // First get the client row for this user.
    const { data: c, error: cErr } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (cErr) { setError(cErr.message); setLoading(false); return; }
    setClient(c);

    // Pull the global welcome message Meg set in Coach Settings. Don't block
    // the page if it fails — just leave the banner empty.
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'welcome_message')
      .maybeSingle()
      .then(({ data }) => {
        const text = typeof data?.value === 'string' ? data.value : '';
        setWelcomeMsg(text);
      });

    if (c) {
      // Only fetch PUBLISHED programs — drafts are coach-only.
      // If somehow there are multiple active programs (shouldn't happen, the
      // coach editor warns against it), just pick the most recently published.
      const { data: ps, error: pErr } = await supabase
        .from('programs')
        .select('*')
        .eq('client_id', c.id)
        .eq('status', 'active')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(1);
      const activeProgram = ps?.[0] ?? null;
      if (pErr) {
        setError(pErr.message);
      } else {
        setProgram(activeProgram);
      }

      // Pull workout logs for this program so we can show completion status.
      if (activeProgram) {
        const { data: ls } = await supabase
          .from('workout_logs')
          .select('id, workout_day, workout_completed, completed_at')
          .eq('client_id', c.id)
          .eq('program_id', activeProgram.id);
        setLogs(ls ?? []);
      }
    }
    setLoading(false);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const workouts = Array.isArray(program?.workouts) ? program.workouts : [];
  const hasProgram = program && workouts.length > 0;

  // Substitute {first_name} (case-insensitive) with the client's actual first
  // name. If Meg leaves the message blank, the banner is hidden.
  const welcomeText = (welcomeMsg || '').replace(
    /\{first_name\}/gi,
    client?.first_name ?? 'there',
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest">Sylefi Wellness</p>
            <p className="font-playfair font-semibold text-sm">
              {client ? `Hey, ${client.first_name} 👋` : 'Loading…'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/client/messages" className="relative p-2 rounded-lg hover:bg-secondary transition" aria-label="Messages" title="Messages">
              <MessageSquare size={18} />
              {unreadMessages > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-semibold flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </Link>
            <Link to="/client/history" className="p-2 rounded-lg hover:bg-secondary transition" aria-label="Workout history" title="Workout history">
              <History size={18} />
            </Link>
            <Link to="/client/settings" className="p-2 rounded-lg hover:bg-secondary transition" aria-label="Settings" title="Settings">
              <Settings size={18} />
            </Link>
            <button onClick={() => setDark(!dark)} className="p-2 rounded-lg hover:bg-secondary transition" aria-label="Toggle theme">
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={handleSignOut} className="p-2 rounded-lg hover:bg-secondary transition" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        {!loading && welcomeText && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
            <p className="text-sm text-foreground italic">{welcomeText}</p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasProgram ? (
          <ReadyProgram program={program} workouts={workouts} logs={logs} />
        ) : (
          <NotReadyYet />
        )}

        {/* Quick Log — extra activity outside the program */}
        {!loading && client && <QuickLogCard clientId={client.id} />}

        {/* Contact coach card — always present */}
        <Link
          to="/client/messages"
          className={`flex items-center gap-3 p-4 rounded-xl border transition ${
            unreadMessages > 0
              ? 'bg-primary/5 border-primary/40 hover:border-primary'
              : 'bg-card border-border hover:border-primary/60'
          }`}
        >
          <div className="relative w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <MessageSquare size={18} />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-card">
                {unreadMessages}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {unreadMessages > 0
                ? `${unreadMessages} new message${unreadMessages === 1 ? '' : 's'} from Meg`
                : 'Contact Coach'}
            </p>
            <p className="text-xs text-muted-foreground">
              {unreadMessages > 0 ? 'Tap to read' : 'Send Meg a message'}
            </p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

// ---- "Your program is ready" view -----------------------------------------
function ReadyProgram({ program, workouts, logs }) {
  // Build a quick lookup of workout_day -> {completed, in_progress}
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
    <>
      {/* Hero */}
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

      {/* Workout list */}
      <div className="space-y-2">
        {workouts.map((w, i) => (
          <WorkoutCard
            key={w.id ?? i}
            workout={w}
            index={i}
            status={statusByDay[String(w.id)]}
          />
        ))}
      </div>
    </>
  );
}

function WorkoutCard({ workout, index, status }) {
  const exCount = Array.isArray(workout.exercises) ? workout.exercises.length : 0;
  const completed = status?.completed;
  const inProgress = status?.in_progress && !completed;

  return (
    <Link
      to={`/client/workout/${workout.id}`}
      className={`w-full text-left rounded-xl border p-4 transition flex items-center gap-3 ${
        completed
          ? 'bg-primary/5 border-primary/40'
          : 'bg-card border-border hover:border-primary/60'
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium flex-shrink-0 ${
        completed ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'
      }`}>
        {completed ? <Check size={18} strokeWidth={3} /> : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium truncate ${completed ? 'text-muted-foreground' : ''}`}>
            {workout.title || `Workout ${index + 1}`}
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
        {workout.coach_note && (
          <p className="text-xs text-accent mt-1 line-clamp-2 italic">"{workout.coach_note}"</p>
        )}
      </div>
      <Play size={18} className="text-primary flex-shrink-0" />
    </Link>
  );
}

// ---- Quick Log card --------------------------------------------------------
// Lets the client jot down extra activity outside their program. Posts to
// client_quick_logs; Meg sees these merged into her Activity feed.
function QuickLogCard({ clientId }) {
  const [open, setOpen]         = useState(false);
  const [exercise, setExercise] = useState('');
  const [sets, setSets]         = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [savedAt, setSavedAt]   = useState(0);
  const [error, setError]       = useState('');

  async function handleSave(e) {
    e.preventDefault();
    const ex = exercise.trim();
    if (!ex) return;
    setSaving(true);
    setError('');
    const { error: insertErr } = await supabase.from('client_quick_logs').insert({
      client_id: clientId,
      exercise:  ex,
      sets:      sets === '' ? null : Math.max(0, Math.floor(Number(sets))) || null,
      notes:     notes.trim() || null,
    });
    if (insertErr) {
      setError(insertErr.message);
    } else {
      setExercise('');
      setSets('');
      setNotes('');
      setSavedAt(Date.now());
    }
    setSaving(false);
  }

  function toggleOpen() {
    setOpen((v) => !v);
    setSavedAt(0); // clear any stale success message when toggling
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-secondary/40 transition"
        aria-expanded={open}
      >
        <Sparkles size={16} className="text-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">Quick Log Workout</h3>
          {!open && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap to log extra activity outside your program.
            </p>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 -mt-1">
          <p className="text-xs text-muted-foreground mb-3">
            Log a walk, a class, anything that's not in your program.
          </p>
          <form onSubmit={handleSave} className="space-y-2">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Exercise</label>
              <input
                type="text"
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
                placeholder="e.g. Walk"
                className="w-full mt-0.5 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Sets <span className="text-muted-foreground/60 normal-case">(optional)</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                  min="0"
                  placeholder="—"
                  className="w-full mt-0.5 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="distance, time, etc."
                  className="w-full mt-0.5 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={saving || !exercise.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90 transition"
            >
              {saving ? 'Saving…' : 'Log it'}
            </button>

            {savedAt > 0 && !saving && (
              <p className="text-xs text-primary text-center">
                Logged! Meg will see it in her activity feed.
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// ---- "Not yet ready" view --------------------------------------------------
function NotReadyYet() {
  return (
    <div className="rounded-2xl bg-card border border-dashed border-border p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-secondary flex items-center justify-center mb-3">
        <Clock size={24} className="text-muted-foreground" />
      </div>
      <p className="font-playfair font-semibold text-lg">Your program is not yet ready</p>
      <p className="text-sm text-muted-foreground mt-1">
        Meg is working on it — you'll see it here as soon as it's published.
      </p>
    </div>
  );
}
