import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import MessageThread from '@/components/MessageThread';

// Client-side messaging — just one thread, with the coach. Way simpler than
// the coach side because there's no client list to render.
export default function ClientMessages() {
  const { user } = useAuth();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error: e } = await supabase
        .from('clients').select('*').eq('user_id', user.id).maybeSingle();
      if (e) setError(e.message);
      else setClient(data);
      setLoading(false);
    })();
  }, [user?.id]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Link to="/client" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft size={16} /> Back
        </Link>
        <div className="flex-1">
          <p className="font-playfair font-semibold">Messages</p>
          <p className="text-xs text-muted-foreground">Chat with your coach</p>
        </div>
      </div>

      {error && (
        <div className="m-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="flex-1 min-h-0">
        {loading ? (
          <p className="text-sm text-muted-foreground p-4">Loading…</p>
        ) : client ? (
          <MessageThread clientId={client.id} senderRole="client" peerName="Meg" />
        ) : (
          <p className="text-sm text-muted-foreground p-4">No client account found.</p>
        )}
      </div>
    </div>
  );
}
