import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Support both Vite (import.meta.env) and Next.js (process.env) environments
  const supabaseUrl = import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_URL || 
                      import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
                      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : '');
  
  const supabaseKey = import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                     import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                     (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : '');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
  }

  return createBrowserClient(supabaseUrl, supabaseKey)
}

