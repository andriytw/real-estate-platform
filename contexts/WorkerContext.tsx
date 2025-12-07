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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Auth error:', authError);
        return null;
      }
      
      if (!user) {
        console.warn('⚠️ No user found in auth session');
        return null;
      }

      console.log('✅ User found:', user.id, user.email);

      // Get worker profile from profiles table
      console.log('🔍 Fetching profile from profiles table...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('❌ Profile fetch error:', profileError);
        console.error('Error details:', {
          code: profileError.code,
          message: profileError.message,
          details: profileError.details,
          hint: profileError.hint
        });
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
      return null;
    }
  };

  const refreshWorker = async () => {
    try {
      console.log('🔄 refreshWorker called');
      setLoading(true);
      const currentWorker = await getCurrentWorker();
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
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ Supabase auth error:', error);
        console.error('Error code:', error.status);
        console.error('Error message:', error.message);
        alert(`Login failed: ${error.message}`); // Show alert
        throw error;
      }

      if (data.user) {
        console.log('✅ Auth successful, user ID:', data.user.id);
        console.log('✅ Session:', data.session ? 'exists' : 'missing');
        
        // Wait a bit for session to be stored
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('🔄 Refreshing worker profile...');
        await refreshWorker();
        
        // Double-check worker was loaded
        const currentWorker = await getCurrentWorker();
        if (currentWorker) {
          console.log('✅ Worker profile loaded:', currentWorker.name, currentWorker.role);
          setWorker(currentWorker);
        } else {
          console.error('❌ Worker profile not loaded after refresh');
        }
      } else {
        console.error('❌ No user data returned from auth');
        throw new Error('No user data returned');
      }
    } catch (error: any) {
      console.error('❌ Login error:', error);
      setLoading(false);
      throw error;
    } finally {
      // Don't set loading to false immediately - let refreshWorker handle it
      setTimeout(() => setLoading(false), 500);
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


