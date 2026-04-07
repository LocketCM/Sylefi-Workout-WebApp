import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Reusable two-party chat thread used by both the coach Messages page and
// the client Messages page. The only difference is which `senderRole` is
// "us" — the rendering, realtime subscription, and read-receipt logic are
// identical.
//
// Props:
//   clientId    — uuid of the clients row this thread belongs to
//   senderRole  — 'coach' | 'client' (which side of the conversation this user is)
//   peerName    — display name shown in the empty state placeholder
export default function MessageThread({ clientId, senderRole, peerName }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const scrollerRef = useRef(null);

  // Initial load + realtime subscription
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: e } = await supabase
        .from('messages')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (e) setError(e.message);
      else setMessages(data ?? []);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`thread-${clientId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => setMessages((m) => [...m, payload.new])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        (payload) => setMessages((m) => m.map((x) => (x.id === payload.new.id ? payload.new : x)))
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [clientId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark messages from the OTHER party as read whenever they appear / open.
  useEffect(() => {
    if (messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => !m.read && m.sender_role !== senderRole)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase.from('messages').update({ read: true }).in('id', unreadIds).then(() => {});
  }, [messages, senderRole]);

  async function sendMessage(e) {
    e?.preventDefault?.();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    const { error: insErr } = await supabase
      .from('messages')
      .insert({ client_id: clientId, sender_role: senderRole, content });
    setSending(false);
    if (insErr) { setError(insErr.message); return; }
    setDraft('');
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages scroller */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {loading ? (
          <p className="text-xs text-muted-foreground text-center">Loading…</p>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              No messages yet. Say hi to {peerName || 'them'} 👋
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_role === senderRole;
            const prev = messages[i - 1];
            const showDate = !prev || !sameDay(prev.created_at, m.created_at);
            return (
              <div key={m.id}>
                {showDate && (
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground text-center my-3">
                    {formatDayLabel(m.created_at)}
                  </p>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    mine
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-secondary text-foreground rounded-bl-sm'
                  }`}>
                    {m.content}
                    <p className={`text-[10px] mt-0.5 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-destructive bg-destructive/10">{error}</div>
      )}

      {/* Composer */}
      <form onSubmit={sendMessage} className="border-t border-border p-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring text-sm max-h-32"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

// ---- Date helpers ---------------------------------------------------------
function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}
function formatDayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today))     return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
