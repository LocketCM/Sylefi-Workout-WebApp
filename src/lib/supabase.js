import { createClient } from '@supabase/supabase-js';

// Supabase credentials come from .env.local (never commit that file).
// In Vite, env vars exposed to the client must be prefixed with VITE_.
const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Sylefi] Supabase env vars missing. Copy .env.local.example to .env.local and fill them in.'
  );
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
