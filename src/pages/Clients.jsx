import { useEffect, useState } from 'react';
import { Plus, Search, Trash2, Copy, Check, X, RefreshCw, History, KeyRound, Pencil, AlertCircle, Dumbbell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { generateInviteCode, inviteExpiryISO, buildInviteUrl, buildSignInUrl } from '@/lib/inviteCode';
import { copyText } from '@/lib/clipboard';

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'active',   label: 'Active' },
  { key: 'invited',  label: 'Invited' },
  { key: 'inactive', label: 'Inactive' },
];

export default function Clients() {
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState('all');
  const [search, setSearch]     = useState('');
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [reissued,   setReissued]       = useState(null); // client row w/ new code
  const [reissuing,  setReissuing]      = useState(null); // id being reissued
  const [signInFor,  setSignInFor]      = useState(null); // client row to show sign-in link for
  const [editingClient, setEditingClient] = useState(null); // client row being edited
  const [logForClient, setLogForClient]   = useState(null); // client row to pick a workout for

  useEffect(() => {
    load();

    // Realtime: any insert/update/delete on the clients table reloads the list.
    // At 1–10 clients this is fine; we can switch to surgical patches later.
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else { setClients(data ?? []); setError(''); }
    setLoading(false);
  }

  async function deleteClient(id) {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) setError(error.message);
  }

  // Regenerates the invite code for an existing client row.
  // Same row, same history — the client gets a fresh 7-day code to get back in.
  async function reissueInvite(client) {
    if (!confirm(
      `Send ${client.first_name} a new invite code?\n\n` +
      `Their old code will stop working. All their workouts, program, ` +
      `and messages stay intact.`
    )) return;
    setReissuing(client.id);
    const newCode = generateInviteCode();
    const { error: rpcErr } = await supabase.rpc('regenerate_invite_code', {
      p_client_id: client.id,
      p_new_code:  newCode,
    });
    setReissuing(null);
    if (rpcErr) { setError(rpcErr.message); return; }
    // Show the new code in a modal so Meg can copy the link.
    setReissued({ ...client, invite_code: newCode });
    if (navigator.vibrate) navigator.vibrate(30);
  }

  const filtered = clients.filter((c) => {
    if (tab !== 'all' && c.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${c.first_name} ${c.last_name} ${c.email ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Coach Portal</p>
          <h1 className="text-3xl font-playfair font-semibold mt-1">Clients</h1>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
        >
          <Plus size={18} /> Invite Client
        </button>
      </div>

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
        </div>
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                tab === t.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Client list */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {clients.length === 0
              ? 'No clients yet. Click "Invite Client" to get started.'
              : 'No clients match this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              busy={reissuing === c.id}
              onDelete={() => deleteClient(c.id)}
              onReissue={() => reissueInvite(c)}
              onShowSignIn={() => setSignInFor(c)}
              onEdit={() => setEditingClient(c)}
              onLogWorkout={() => setLogForClient(c)}
            />
          ))}
        </div>
      )}

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
      {reissued && <ReissueModal client={reissued} onClose={() => setReissued(null)} />}
      {signInFor && <SignInLinkModal client={signInFor} onClose={() => setSignInFor(null)} />}
      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
        />
      )}
      {logForClient && (
        <LogWorkoutPickerModal
          client={logForClient}
          onClose={() => setLogForClient(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    active:   'bg-primary/15 text-primary',
    invited:  'bg-accent/20 text-accent-foreground',
    inactive: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? styles.inactive}`}>
      {status}
    </span>
  );
}

function ClientRow({ client, busy, onDelete, onReissue, onShowSignIn, onEdit, onLogWorkout }) {
  const name = client.display_name || `${client.first_name} ${client.last_name}`;
  const isActive = client.status === 'active';
  return (
    <div className="rounded-xl bg-card border border-border p-4 flex items-center justify-between gap-4 hover:border-primary/50 transition">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-playfair font-semibold flex-shrink-0">
          {(client.first_name?.[0] ?? '?').toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium truncate">{name}</p>
            <StatusBadge status={client.status} />
          </div>
          {client.email && (
            <p className="text-xs text-muted-foreground truncate">{client.email}</p>
          )}
          {client.phone && (
            <p className="text-xs text-muted-foreground truncate">{client.phone}</p>
          )}
          {client.status === 'invited' && client.invite_code && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Code: <span className="font-mono">{client.invite_code}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
          aria-label="Edit client"
          title="Edit client"
        >
          <Pencil size={16} />
        </button>
        {isActive && (
          <button
            onClick={onLogWorkout}
            className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
            aria-label="Log in-person workout"
            title="Log in-person workout"
          >
            <Dumbbell size={16} />
          </button>
        )}
        {isActive && client.access_code && (
          <button
            onClick={onShowSignIn}
            className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
            aria-label="Sign-in link"
            title="Personal sign-in link"
          >
            <KeyRound size={16} />
          </button>
        )}
        <Link
          to={`/coach/clients/${client.id}/history`}
          className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
          aria-label="View workout history"
          title="View workout history"
        >
          <History size={16} />
        </Link>
        <button
          onClick={onReissue}
          disabled={busy}
          className="p-2 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition disabled:opacity-50"
          aria-label="Re-send invite code"
          title="Re-send invite code"
        >
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
          aria-label="Delete client"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

// Modal: shows the active client's permanent sign-in link so Meg can copy
// it and send it to the client to bookmark. She can also customize the
// code into something memorable (e.g. JANE-DOE-2026) or randomize it.
function SignInLinkModal({ client, onClose }) {
  const [copied, setCopied]   = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(client.access_code ?? '');
  const [code, setCode]       = useState(client.access_code ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const url = buildSignInUrl(code);

  async function copyLink() {
    const ok = await copyText(url);
    if (!ok) { alert('Could not copy — please select the link above manually.'); return; }
    setCopied(true);
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => setCopied(false), 1500);
  }

  // Validate + persist a new code. Allow A–Z, 0–9, dashes; 4–32 chars.
  // Always uppercased for visual consistency.
  async function saveCode() {
    setError('');
    const cleaned = (draft ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,32}$/.test(cleaned)) {
      setError('Use 4–32 characters. Letters, numbers, and dashes only.');
      return;
    }
    if (cleaned === code) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error: updErr } = await supabase
      .from('clients')
      .update({ access_code: cleaned })
      .eq('id', client.id);
    setSaving(false);
    if (updErr) {
      // Most common: unique-violation if another client already has this code.
      setError(
        updErr.message.includes('duplicate') || updErr.code === '23505'
          ? 'That code is already in use by another client. Pick a different one.'
          : updErr.message
      );
      return;
    }
    setCode(cleaned);
    setEditing(false);
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // Generate a fresh random 12-char code into the draft field. Doesn't save
  // until Meg hits Save — gives her a chance to back out.
  function randomize() {
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 12; i++) {
      out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    setDraft(out);
    setError('');
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-playfair font-semibold text-xl">Personal Sign-In Link</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This is <strong className="text-foreground">{client.first_name}</strong>'s permanent sign-in link.
            It never expires and can be reused on any device. They should bookmark it
            (or "Add to Home Screen") so they can always get back to their dashboard.
          </p>

          {/* Code display / editor */}
          <div className="rounded-lg bg-secondary p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Personal sign-in code</p>
              {!editing && (
                <button
                  onClick={() => { setDraft(code); setEditing(true); setError(''); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition"
                >
                  <Pencil size={12} /> Customize
                </button>
              )}
            </div>

            {!editing ? (
              <p className="text-xl font-mono font-bold tracking-widest text-primary text-center">
                {code}
              </p>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.toUpperCase())}
                  placeholder="JANE-DOE-2026"
                  maxLength={32}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-card text-center text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground text-center">
                  4–32 characters · letters, numbers, and dashes
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={randomize}
                    disabled={saving}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-medium hover:bg-secondary transition disabled:opacity-50"
                  >
                    <RefreshCw size={12} /> Randomize
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => { setEditing(false); setDraft(code); setError(''); }}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-card transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveCode}
                    disabled={saving || !draft.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Check size={12} /> {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {error && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
                    <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 text-xs font-mono break-all bg-background">
            {url}
          </div>
          <button
            onClick={copyLink}
            disabled={editing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Sign-In Link</>}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Treat it like a password — anyone with this link can sign in as {client.first_name}.
          </p>
        </div>
      </div>
    </div>
  );
}

// Edit a client's name, contact info, and notes. Coach-only — RLS already
// allows admins to update any clients row. Validates that first/last name
// stay non-empty so the rest of the app (which displays "first last")
// doesn't break. Display name is the optional override Meg can use for
// nicknames or organization (e.g. "Jane S. - Mondays").
function EditClientModal({ client, onClose }) {
  const [firstName,   setFirstName]   = useState(client.first_name ?? '');
  const [lastName,    setLastName]    = useState(client.last_name ?? '');
  const [displayName, setDisplayName] = useState(client.display_name ?? '');
  const [email,       setEmail]       = useState(client.email ?? '');
  const [phone,       setPhone]       = useState(client.phone ?? '');
  const [notes,       setNotes]       = useState(client.notes ?? '');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required.');
      return;
    }
    setSaving(true);
    const { error: e2 } = await supabase
      .from('clients')
      .update({
        first_name:   firstName.trim(),
        last_name:    lastName.trim(),
        display_name: displayName.trim() || null,
        email:        email.trim() || null,
        phone:        phone.trim() || null,
        notes:        notes.trim() || null,
      })
      .eq('id', client.id);
    setSaving(false);
    if (e2) {
      setError(e2.message);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(20);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card rounded-2xl border border-border max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-playfair font-semibold">Edit Client</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary transition"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={save} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">First name *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Last name *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Display name <span className="text-muted-foreground/70">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What should they be called in the app?"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Overrides "First Last" in the client list. Leave blank to use their real name.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Notes <span className="text-muted-foreground/70">(coach-only)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Goals, preferences, scheduling notes, emergency contact, anything you want to remember…"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{notes.length}/1000</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition text-sm"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-input bg-card hover:bg-secondary transition text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Shown after Meg successfully regenerates an invite code. Same layout as
// the "Invite Created" step of the InviteModal — reusing the visual pattern
// so it feels familiar.
function ReissueModal({ client, onClose }) {
  const [copied, setCopied] = useState(false);
  const url = buildInviteUrl(client.invite_code);

  async function copyLink() {
    const ok = await copyText(url);
    if (!ok) { alert('Could not copy — please select the link above manually.'); return; }
    setCopied(true);
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-playfair font-semibold text-xl">New Invite Code</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send this link to <strong className="text-foreground">{client.first_name} {client.last_name}</strong>.
            Their old code no longer works. The new code expires in 7 days and can only be used once —
            but all their existing workouts, program, and messages are untouched.
          </p>
          <div className="rounded-lg bg-secondary p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">New one-time code</p>
            <p className="text-2xl font-mono font-bold tracking-widest text-primary">
              {client.invite_code}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3 text-xs font-mono break-all bg-background">
            {url}
          </div>
          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
          >
            {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Invite Link</>}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ onClose }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [created, setCreated]     = useState(null); // the created client row
  const [copied, setCopied]       = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const code = generateInviteCode();
    const { data, error } = await supabase
      .from('clients')
      .insert({
        first_name:     firstName.trim(),
        last_name:      lastName.trim(),
        status:         'invited',
        invite_code:    code,
        invite_expires: inviteExpiryISO(7),
        code_used:      false,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCreated(data);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  async function copyLink() {
    if (!created) return;
    const ok = await copyText(buildInviteUrl(created.invite_code));
    if (!ok) { setError('Could not copy — long-press the link above to copy manually.'); return; }
    setCopied(true);
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-playfair font-semibold text-xl">
            {created ? 'Invite Created' : 'Invite New Client'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        {!created ? (
          <form onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the client's name. We'll generate a one-time code that expires in 7 days.
            </p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && (
              <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create Invite'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send this link to <strong className="text-foreground">{created.first_name} {created.last_name}</strong>.
              The code expires in 7 days and can only be used once.
            </p>
            <div className="rounded-lg bg-secondary p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">One-time code</p>
              <p className="text-2xl font-mono font-bold tracking-widest text-primary">
                {created.invite_code}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3 text-xs font-mono break-all bg-background">
              {buildInviteUrl(created.invite_code)}
            </div>
            <button
              onClick={copyLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
            >
              {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Invite Link</>}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Picker shown when Meg taps the dumbbell icon on an active client. Loads
// the client's current active program and lists the workouts in it so she
// can pick which one she just trained them on. Tapping a workout routes
// into CoachLogWorkout. If the client has no active program we tell her
// plainly — she'd need to assign one before logging a session.
function LogWorkoutPickerModal({ client, onClose }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [program, setProgram] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error: e } = await supabase
        .from('programs')
        .select('id, title, workouts')
        .eq('client_id', client.id)
        .eq('status', 'active')
        .maybeSingle();
      if (e) { setError(e.message); setLoading(false); return; }
      setProgram(data);
      setLoading(false);
    })();
  }, [client.id]);

  function pick(workoutId) {
    onClose();
    navigate(`/coach/clients/${client.id}/log/${workoutId}`);
  }

  const workouts = Array.isArray(program?.workouts) ? program.workouts : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fade-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-playfair font-semibold text-xl">Log In-Person Workout</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Pick which workout from{' '}
          <strong className="text-foreground">{client.first_name}</strong>'s program you just ran.
          You'll fill in the sets, reps, and weights they actually did — it saves to their
          history marked as logged by you.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading program…</p>
        ) : error ? (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        ) : !program ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {client.first_name} doesn't have an active program yet. Assign or build one
              first, then come back here.
            </p>
          </div>
        ) : workouts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              This program has no workouts yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
              {program.title || 'Active program'}
            </p>
            {workouts.map((w) => (
              <button
                key={w.id}
                onClick={() => pick(w.id)}
                className="w-full text-left p-3 rounded-lg border border-border bg-background hover:border-primary hover:bg-primary/5 transition flex items-center gap-3"
              >
                <Dumbbell size={16} className="text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{w.title || 'Untitled workout'}</p>
                  <p className="text-xs text-muted-foreground">
                    {(w.exercises?.length ?? 0)} exercise{(w.exercises?.length ?? 0) === 1 ? '' : 's'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
