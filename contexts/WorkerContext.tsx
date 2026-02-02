import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '../utils/supabase/client';

const supabase = createClient();

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
  session: Session | null | undefined;
  worker: Worker | null;
  /** True only while session is undefined (initializing). Not worker loading. */
  loading: boolean;
  /** Set when worker profile fetch failed (e.g. API down). Do not treat as logout. */
  workerError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isWorker: boolean;
  refreshWorker: () => Promise<void>;
  /** Clear workerError and retry loading worker. */
  retryWorker: () => Promise<void>;
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
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);

  /** loading = session not yet determined (session === undefined) */
  const loading = session === undefined;

  const getCurrentWorker = useCallback(async (): Promise<{ worker: Worker | null; error: string | null }> => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return { worker: null, error: authError?.message ?? 'Not authenticated' };
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const code = (profileError as { code?: string } | null)?.code;
      if (profileError && code === 'PGRST116') {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            name: user.email ?? 'Unknown',
            role: 'worker',
            department: 'facility',
            is_active: true,
          });
        if (insertError) return { worker: null, error: insertError.message ?? 'Profile not found' };
        const result = await supabase.from('profiles').select('*').eq('id', user.id).single();
        profile = result.data;
        profileError = result.error;
      }
      if (profileError || !profile) return { worker: null, error: profileError?.message ?? 'Profile not found' };
      return {
        worker: {
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
        },
        error: null,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load profile';
      return { worker: null, error: message };
    }
  }, []);

  const loadWorkerWhenSessionExists = useCallback(async () => {
    const { worker: w, error: err } = await getCurrentWorker();
    if (err) {
      setWorkerError(err);
      /* do not set worker=null on transient failure */
    } else {
      setWorker(w);
      setWorkerError(null);
    }
  }, [getCurrentWorker]);

  const refreshWorker = useCallback(async () => {
    if (session == null) return;
    setWorkerError(null);
    const { worker: w, error: err } = await getCurrentWorker();
    if (err) {
      setWorkerError(err);
      /* do not set worker=null — keep previous worker on transient failure */
    } else {
      setWorker(w);
      setWorkerError(null);
    }
  }, [session, getCurrentWorker]);

  const retryWorker = useCallback(async () => {
    setWorkerError(null);
    await loadWorkerWhenSessionExists();
  }, [loadWorkerWhenSessionExists]);

  const syncSessionAndWorker = useCallback(async () => {
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s ?? null);
      if (s) {
        const { worker: w, error: err } = await getCurrentWorker();
        if (err) {
          setWorkerError(err);
          /* do not set worker=null */
        } else {
          setWorker(w);
          setWorkerError(null);
        }
      } else {
        setWorker(null);
        setWorkerError(null);
      }
    } catch {
      setSession(null);
      setWorker(null);
      setWorkerError(null);
    }
  }, [getCurrentWorker]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(s ?? null);
      if (s) {
        const { worker: w, error: err } = await getCurrentWorker();
        if (!mounted) return;
        if (err) {
          setWorkerError(err);
        } else {
          setWorker(w);
          setWorkerError(null);
        }
      } else {
        setWorker(null);
        setWorkerError(null);
      }
    })();
    return () => { mounted = false; };
  }, [getCurrentWorker]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSessionAndWorker();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncSessionAndWorker]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setWorker(null);
        setWorkerError(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && s) {
        setSession(s);
        await loadWorkerWhenSessionExists();
      }
      if (event === 'INITIAL_SESSION') {
        setSession(s ?? null);
        if (s) await loadWorkerWhenSessionExists();
        else {
          setWorker(null);
          setWorkerError(null);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [loadWorkerWhenSessionExists]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        setSession(data.session);
        setWorkerError(null);
        const { worker: w, error: err } = await getCurrentWorker();
        if (err) {
          setWorkerError(err);
          throw new Error('Worker profile not found. Please contact administrator.');
        }
        setWorker(w);
      }
    } finally {
      /* session is set above, so loading becomes false */
    }
  }, [getCurrentWorker]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setWorker(null);
      setWorkerError(null);
    } finally {
      /* session/worker cleared above */
    }
  }, []);

  const isAdmin = worker?.role === 'super_manager';
  const isManager = worker?.role === 'manager' || worker?.role === 'super_manager';
  const isWorker = worker?.role === 'worker';

  return (
    <WorkerContext.Provider
      value={{
        session,
        worker,
        loading,
        workerError,
        login,
        logout,
        isAdmin,
        isManager,
        isWorker,
        refreshWorker,
        retryWorker,
      }}
    >
      {children}
    </WorkerContext.Provider>
  );
}
