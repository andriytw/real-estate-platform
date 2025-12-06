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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        return null;
      }

      // Get worker profile from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        console.warn('No profile found for user:', user.id);
        return null;
      }

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
      console.error('Error getting current worker:', error);
      return null;
    }
  };

  const refreshWorker = async () => {
    try {
      setLoading(true);
      const currentWorker = await getCurrentWorker();
      setWorker(currentWorker);
    } catch (error) {
      console.error('Error refreshing worker:', error);
      setWorker(null);
    } finally {
      setLoading(false);
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        await refreshWorker();
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
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


