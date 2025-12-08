import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '../utils/supabase/client';

const supabase = createClient();

// Worker type definition
export interface Worker {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department: 'facility' | 'accounting' | 'sales';
  role: 'worker' | 'manager' | 'super_manager';
  managerId?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface WorkerContextType {
  worker: Worker | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isWorker: boolean;
  refreshWorker: () => Promise<void>;
}

const WorkerContext = createContext<WorkerContextType | undefined>(undefined);

export function useWorker() {
  const context = useContext(WorkerContext);
  if (context === undefined) {
    throw new Error('useWorker must be used within a WorkerProvider');
  }
  return context;
}

interface WorkerProviderProps {
  children: ReactNode;
}

export function WorkerProvider({ children }: WorkerProviderProps) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);

  const getCurrentWorker = async (): Promise<Worker | null> => {
    try {
      console.log('🔍 Getting current user from Supabase Auth...');
      const authStartTime = Date.now();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      const authTime = Date.now() - authStartTime;
      console.log(`⏱️ Auth getUser took ${authTime}ms`);
      
      if (authError) {
        console.error('❌ Auth error:', authError);
        console.error('Auth error details:', {
          code: authError.code,
          message: authError.message,
          status: authError.status
        });
        return null;
      }
      
      if (!user) {
        console.warn('⚠️ No user found in auth session');
        return null;
      }

      console.log('✅ User found:', user.id, user.email);

      // Get worker profile from profiles table
      console.log('🔍 Fetching profile from profiles table for user:', user.id);
      const profileStartTime = Date.now();
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const profileTime = Date.now() - profileStartTime;
      console.log(`⏱️ Profile query took ${profileTime}ms`);

      if (profileError) {
        console.error('❌ Profile fetch error:', profileError);
        console.error('Error details:', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint
        });
        
        // If profile doesn't exist, this is a common issue
        if (profileError.code === 'PGRST116') {
          console.error('💡 Profile does not exist in database. User needs to have a profile created.');
          console.error('💡 Run: supabase/create_profile_for_user.sql or check RLS policies');
        }
        return null;
      }

      if (!profile) {
        console.warn('⚠️ No profile found for user:', user.id);
        console.warn('💡 Profile needs to be created in Supabase for user:', user.id);
        return null;
      }

      console.log('✅ Profile found:', profile.name, profile.role, profile.department);

      return {
        id: profile.id,
        name: profile.name || user.email || 'Unknown',
        email: user.email || '',
        phone: profile.phone || undefined,
        department: profile.department || 'facility',
        role: profile.role || 'worker',
        managerId: profile.manager_id || undefined,
        isActive: profile.is_active !== false,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      };
    } catch (error) {
      console.error('❌ Error getting current worker:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return null;
    }
  };

  const refreshWorker = async () => {
    try {
      console.log('🔄 refreshWorker called');
      setLoading(true);
      
      // Add timeout for getCurrentWorker to prevent infinite loading
      const workerPromise = getCurrentWorker();
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => {
          console.warn('⚠️ refreshWorker: getCurrentWorker timeout (5s)');
          resolve(null);
        }, 5000)
      );
      
      const currentWorker = await Promise.race([workerPromise, timeoutPromise]);
      console.log('🔄 refreshWorker - got worker:', currentWorker ? currentWorker.name : 'null');
      setWorker(currentWorker);
      if (currentWorker) {
        console.log('✅ Worker set in state:', currentWorker.name, currentWorker.role);
      } else {
        console.warn('⚠️ No worker to set in state');
      }
    } catch (error) {
      console.error('❌ Error refreshing worker:', error);
      setWorker(null);
    } finally {
      setLoading(false);
      console.log('🔄 refreshWorker finished, loading set to false');
    }
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const loadWorker = async () => {
      try {
        setLoading(true);
        
        const workerPromise = getCurrentWorker();
        const timeoutPromise = new Promise<null>((resolve) => 
          setTimeout(() => resolve(null), 3000)
        );
        
        const currentWorker = await Promise.race([workerPromise, timeoutPromise]);
        
        if (mounted) {
          setWorker(currentWorker);
        }
      } catch (error) {
        console.error('Error loading worker:', error);
        if (mounted) {
          setWorker(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    timeoutId = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 5000);

    loadWorker().catch(err => {
      console.error('loadWorker threw error:', err);
      if (mounted) {
        setLoading(false);
        setWorker(null);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_IN' && session) {
        await refreshWorker();
      } else if (event === 'SIGNED_OUT') {
        setWorker(null);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        await refreshWorker();
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      console.log('🔐 Attempting login for:', email);
      
      // Add timeout to prevent infinite loading
      const loginPromise = (async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('❌ Supabase auth error:', error);
          throw error;
        }

        if (data.user) {
          console.log('✅ Auth successful, user ID:', data.user.id);
          console.log('✅ Session:', data.session ? 'exists' : 'missing');
          
          // Wait a bit for session to be stored
          await new Promise(resolve => setTimeout(resolve, 200));
          
          console.log('🔄 Refreshing worker profile...');
          // refreshWorker will set loading to false when done
          await refreshWorker();
          
          // Double-check worker was loaded
          const currentWorker = await getCurrentWorker();
          if (currentWorker) {
            console.log('✅ Worker profile loaded:', currentWorker.name, currentWorker.role);
            setWorker(currentWorker);
            setLoading(false); // Ensure loading is false after successful login
          } else {
            console.error('❌ Worker profile not loaded after refresh');
            console.error('💡 This usually means the user profile does not exist in the profiles table');
            setLoading(false);
            throw new Error('Worker profile not found. Please contact administrator.');
          }
        } else {
          console.error('❌ No user data returned from auth');
          setLoading(false);
          throw new Error('No user data returned');
        }
      })();

      // Add 10 second timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Login timeout: The request took too long. Please try again.')), 10000)
      );

      await Promise.race([loginPromise, timeoutPromise]);
    } catch (error: any) {
      console.error('❌ Login error:', error);
      setLoading(false);
      // Provide user-friendly error messages
      if (error.message?.includes('timeout')) {
        throw new Error('Час очікування вичерпано. Спробуйте ще раз.');
      } else if (error.message?.includes('Invalid login credentials')) {
        throw new Error('Невірний email або пароль.');
      } else if (error.message?.includes('profile not found')) {
        throw new Error('Профіль користувача не знайдено. Зверніться до адміністратора.');
      } else {
        throw error;
      }
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setWorker(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = worker?.role === 'super_manager';
  const isManager = worker?.role === 'manager' || worker?.role === 'super_manager';
  const isWorker = worker?.role === 'worker';

  const value: WorkerContextType = {
    worker,
    loading,
    login,
    logout,
    isAdmin,
    isManager,
    isWorker,
    refreshWorker
  };

  return (
    <WorkerContext.Provider value={value}>
      {children}
    </WorkerContext.Provider>
  );
}


