import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Vite SPA: single Supabase client from @supabase/supabase-js.
 * Session in localStorage so it persists across tab switch/resume.
 * No @supabase/ssr (cookies) — SPA only.
 */
export function createClient() {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : '');

  const supabaseKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : '');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
  }

  supabaseInstance = createSupabaseClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'heroRooms-auth',
      },
    }
  );
  return supabaseInstance;
}
