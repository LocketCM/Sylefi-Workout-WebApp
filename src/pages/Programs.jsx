import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ClipboardList, CheckCircle2, PenLine, AlertTriangle } from 'lucide-react';
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

  const published = programs.filter((p) => p.status === 'active');
  const drafts    = programs.filter((p) => p.status === 'draft');
  const clientsWithoutProgram = clients.filter(
    (c) => !programs.some((p) => p.client_id === c.id && p.status !== 'completed')
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
        <Link
          to="/coach/programs/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
        >
          <Plus size={18} /> New Program
        </Link>
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
  const statusBadge = program.status === 'active'
    ? { text: 'Published', cls: 'bg-primary/15 text-primary' }
    : { text: 'Draft',     cls: 'bg-secondary text-muted-foreground' };

  return (
    <Link
      to={`/coach/programs/${program.id}`}
      className={`flex items-center justify-between rounded-xl bg-card border p-4 transition ${
        duplicate ? 'border-amber-500/50 hover:border-amber-500' : 'border-border hover:border-primary/60'
      }`}
    >
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
        <p className="text-xs text-muted-foreground">
          {program.client_name || '—'} · {workoutCount} workout{workoutCount === 1 ? '' : 's'}
          {program.published_at && ` · published ${new Date(program.published_at).toLocaleDateString()}`}
        </p>
      </div>
    </Link>
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
