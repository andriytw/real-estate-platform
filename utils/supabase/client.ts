import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase public key: set NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) in env.'
  );
}

if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
  const urlPreview = (supabaseUrl || '').slice(0, 30);
  const keyPreview =
    supabaseAnonKey.length >= 12
      ? `${supabaseAnonKey.slice(0, 6)}...${supabaseAnonKey.slice(-6)}`
      : '***';
  const keySource = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    : 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
  console.log('[DEV] Supabase: urlPreview=', urlPreview, 'keyPreview=', keyPreview, 'keySource=', keySource);
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

/** For diagnostics only: actual REST base URL used (confirm project ref). */
export function getSupabaseRestUrl(): string {
  return supabaseUrl || '';
}
