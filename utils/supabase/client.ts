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

/**
 * In-process exclusive lock that replaces navigator.locks to avoid the
 * deadlock where browser-throttled background token refresh leaves the
 * Navigator Lock held forever, freezing ALL Supabase operations on tab return.
 * Serialises auth operations within the same tab; cross-tab coordination
 * (which navigator.locks provides) is not needed for this app.
 */
const PROCESS_LOCKS: Record<string, Promise<unknown>> = {};
async function processLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const prev = PROCESS_LOCKS[name] ?? Promise.resolve();
  const current = (acquireTimeout >= 0
    ? Promise.race([
        prev.catch(() => null),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Lock "${name}" acquire timeout`)), acquireTimeout),
        ),
      ])
    : prev.catch(() => null)
  ).then(() => fn());
  PROCESS_LOCKS[name] = current.catch(() => null);
  return current;
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    lock: processLock,
  },
});

/** For diagnostics only: actual REST base URL used (confirm project ref). */
export function getSupabaseRestUrl(): string {
  return supabaseUrl || '';
}
