import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Sun, Moon, Play, ChevronRight, Clock, MessageSquare, Check, History } from 'lucide-react';
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

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasProgram ? (
          <ReadyProgram program={program} workouts={workouts} logs={logs} />
        ) : (
          <NotReadyYet />
        )}

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
