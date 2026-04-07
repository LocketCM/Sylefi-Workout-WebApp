import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Subscribes to unread message counts and keeps the document title in sync.
//
// Two roles:
//   - 'coach'  → counts messages from clients that the coach hasn't read
//   - 'client' → counts messages from the coach for this specific clientId
//
// Returns the live count. Also prefixes document.title with "(N) " whenever
// the count is > 0, so the browser tab acts as a passive notification.

export function useCoachUnreadMessages() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { count: c } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('read', false)
        .eq('sender_role', 'client');
      if (!cancelled) setCount(c ?? 0);
    }

    load();
    const ch = supabase
      .channel('coach-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  useDocumentTitleBadge(count);
  return count;
}

export function useClientUnreadMessages(clientId) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    async function load() {
      const { count: c } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('read', false)
        .eq('sender_role', 'coach');
      if (!cancelled) setCount(c ?? 0);
    }

    load();
    const ch = supabase
      .channel(`client-unread-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `client_id=eq.${clientId}` },
        load
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [clientId]);

  useDocumentTitleBadge(count);
  return count;
}

// Coach: count of completed workout_logs the coach hasn't seen yet.
// Updates in realtime when clients finish workouts.
export function useCoachUnreadCompletions() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { count: c } = await supabase
        .from('workout_logs')
        .select('id', { count: 'exact', head: true })
        .eq('workout_completed', true)
        .eq('coach_seen', false);
      if (!cancelled) setCount(c ?? 0);
    }

    load();
    const ch = supabase
      .channel('coach-unread-completions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_logs' }, load)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  return count;
}

// Prefix document.title with "(N) " whenever count > 0. We capture the
// "base" title once on mount so re-runs don't keep stacking prefixes.
function useDocumentTitleBadge(count) {
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, '');
    };
  }, [count]);
}
