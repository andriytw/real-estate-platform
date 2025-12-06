import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Singleton instance to prevent multiple GoTrueClient instances
let supabaseInstance: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  // Return existing instance if already created
  if (supabaseInstance) {
    return supabaseInstance;
  }
  
  // Vite exposes env vars with VITE_ prefix
  const supabaseUrl = 
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  
  const supabaseKey = 
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    const errorMsg = `Missing Supabase environment variables. 
      URL: ${supabaseUrl ? '✓' : '✗'} 
      Key: ${supabaseKey ? '✓' : '✗'}
      Please check your .env.local file and ensure variables are prefixed with VITE_ or NEXT_PUBLIC_.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Use @supabase/supabase-js directly for Vite
  supabaseInstance = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'sb-auth-token'
    }
  });
  
  return supabaseInstance;
}

