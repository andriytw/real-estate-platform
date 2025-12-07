import { createBrowserClient } from '@supabase/ssr'

// Singleton instance
let supabaseInstance: any = null;

export function createClient() {
  if (supabaseInstance) return supabaseInstance;

  // Support all common naming conventions for Supabase Env Vars
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 
                      import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_URL || 
                      import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
                      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : '');
  
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
                     import.meta.env.VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                     import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                     (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : '');

  console.log('🔌 Initializing Supabase Client...');
  console.log('   URL found:', !!supabaseUrl, supabaseUrl ? `${supabaseUrl.substring(0, 10)}...` : 'MISSING');
  console.log('   Key found:', !!supabaseKey, supabaseKey ? `${supabaseKey.substring(0, 5)}...` : 'MISSING');

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ CRITICAL ERROR: Missing Supabase environment variables!');
    console.error('   Please check Vercel Environment Variables or .env.local');
    // Don't throw to prevent white screen of death, but functionality will fail
    // Return a dummy object if needed or just let it fail later with a clear error
    
    // Attempt to create a client anyway to prevent immediate crash, even if it won't work
    try {
       supabaseInstance = createBrowserClient(
        supabaseUrl || 'https://placeholder.supabase.co', 
        supabaseKey || 'placeholder'
      );
      return supabaseInstance;
    } catch (e) {
      console.error('Failed to create placeholder client', e);
      return null;
    }
  }

  try {
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseKey);
    return supabaseInstance;
  } catch (error) {
    console.error('❌ Error creating Supabase client:', error);
    throw error;
  }
}
