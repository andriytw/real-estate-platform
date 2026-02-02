import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, getSupabaseRestUrl } from '../utils/supabase/client';

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
    const isDev = import.meta.env.DEV;
    try {
      if (isDev && typeof window !== 'undefined') {
        console.log('[DEV] WorkerContext: supabaseUrl=', getSupabaseRestUrl(), 'window.location.origin=', window.location.origin);
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (isDev && typeof window !== 'undefined') {
        console.log('[DEV] WorkerContext: after getUser() user=', !!user, 'userId=', user?.id, 'authError=', authError?.message ?? authError);
      }
      if (authError || !user) {
        const errMsg = authError?.message ?? 'Not authenticated';
        if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: returning error (no user)', { error: errMsg });
        return { worker: null, error: errMsg };
      }
      let { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      const code = (profileError as { code?: string } | null)?.code;
      if (isDev && typeof window !== 'undefined') {
        console.log('[DEV] WorkerContext: after profiles select single()', { profile: profile ?? null, errorCode: code, errorMessage: profileError?.message });
      }
      if (profileError && code === 'PGRST116') {
        const tryInsert = async (payload: Record<string, unknown>): Promise<{ error: { message?: string; code?: string } | null }> => {
          const { error } = await supabase.from('profiles').insert(payload);
          return { error };
        };
        const isColumnError = (e: { message?: string; code?: string } | null) =>
          e && (e.code === '42703' || /column.*does not exist|undefined_column/i.test(e.message ?? ''));
        let insertError: { message?: string; code?: string } | null = null;
        insertError = (await tryInsert({ id: user.id, name: user.email ?? 'Unknown', email: user.email ?? undefined })).error;
        if (isDev && typeof window !== 'undefined') {
          console.log('[DEV] WorkerContext: insert attempt 1', { insertError: insertError ? { message: insertError.message, code: insertError.code } : null });
        }
        if (insertError && isColumnError(insertError)) {
          insertError = (await tryInsert({ id: user.id, name: user.email ?? 'Unknown' })).error;
          if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: insert attempt 2', { insertError: insertError ? { message: insertError.message, code: insertError.code } : null });
        }
        if (insertError && isColumnError(insertError)) {
          insertError = (await tryInsert({ id: user.id })).error;
          if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: insert attempt 3', { insertError: insertError ? { message: insertError.message, code: insertError.code } : null });
        }
        if (insertError) {
          const msg = insertError.message ?? 'Profile not found';
          const codeStr = insertError.code ? ` (code: ${insertError.code})` : '';
          if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: returning error (insert failed)', { error: msg, code: insertError.code });
          return { worker: null, error: `${msg}${codeStr}` };
        }
        const result = await supabase.from('profiles').select('*').eq('id', user.id).single();
        profile = result.data;
        profileError = result.error;
        if (isDev && typeof window !== 'undefined') {
          console.log('[DEV] WorkerContext: after re-select', { profile: profile ?? null, error: profileError ? { message: profileError.message, code: (profileError as { code?: string }).code } : null });
        }
      }
      if (profileError || !profile) {
        const msg = profileError?.message ?? 'Profile not found';
        const errCode = (profileError as { code?: string } | null)?.code;
        const codeStr = errCode ? ` (code: ${errCode})` : '';
        if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: returning error (profile select)', { error: msg, code: errCode });
        return { worker: null, error: `${msg}${codeStr}` };
      }
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
      if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: returning error (catch)', { error: message });
      return { worker: null, error: message };
    }
  }, []);

  const PROFILE_LOAD_TIMEOUT_MS = 15000;

  const getCurrentWorkerWithTimeout = useCallback(async (): Promise<{ worker: Worker | null; error: string | null }> => {
    const timeoutPromise = new Promise<{ worker: Worker | null; error: string | null }>((resolve) => {
      setTimeout(
        () => resolve({ worker: null, error: 'Profile load timed out. Please retry or log out.' }),
        PROFILE_LOAD_TIMEOUT_MS
      );
    });
    return Promise.race([getCurrentWorker(), timeoutPromise]);
  }, [getCurrentWorker]);

  const loadWorkerWhenSessionExists = useCallback(async () => {
    const { worker: w, error: err } = await getCurrentWorkerWithTimeout();
    if (err) {
      setWorkerError(err);
    } else if (w) {
      setWorker(w);
      setWorkerError(null);
    } else {
      setWorkerError('Failed to load profile.');
    }
  }, [getCurrentWorkerWithTimeout]);

  const refreshWorker = useCallback(async () => {
    if (session == null) return;
    setWorkerError(null);
    const { worker: w, error: err } = await getCurrentWorkerWithTimeout();
    if (err) {
      setWorkerError(err);
    } else if (w) {
      setWorker(w);
      setWorkerError(null);
    } else {
      setWorkerError('Failed to load profile.');
    }
  }, [session, getCurrentWorkerWithTimeout]);

  const retryWorker = useCallback(async () => {
    setWorkerError(null);
    await loadWorkerWhenSessionExists();
  }, [loadWorkerWhenSessionExists]);

  const syncSessionAndWorker = useCallback(async () => {
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        console.log('[DEV] WorkerContext: after getSession() (sync) hasSession=', !!s, 'userId=', s?.user?.id);
      }
      setSession(s ?? null);
      if (s) {
        const { worker: w, error: err } = await getCurrentWorkerWithTimeout();
        if (err) {
          setWorkerError(err);
        } else if (w) {
          setWorker(w);
          setWorkerError(null);
        } else {
          setWorkerError('Failed to load profile.');
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
  }, [getCurrentWorkerWithTimeout]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        console.log('[DEV] WorkerContext: after getSession() hasSession=', !!s, 'userId=', s?.user?.id);
      }
      if (!mounted) return;
      setSession(s ?? null);
      if (s) {
        const { worker: w, error: err } = await getCurrentWorkerWithTimeout();
        if (!mounted) return;
        if (err) {
          setWorkerError(err);
        } else if (w) {
          setWorker(w);
          setWorkerError(null);
        } else {
          setWorkerError('Failed to load profile.');
        }
      } else {
        setWorker(null);
        setWorkerError(null);
      }
    })();
    return () => { mounted = false; };
  }, [getCurrentWorkerWithTimeout]);

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
        const { worker: w, error: err } = await getCurrentWorkerWithTimeout();
        if (err) {
          setWorkerError(err);
          throw new Error('Worker profile not found. Please contact administrator.');
        }
        setWorker(w);
      }
    } finally {
      /* session is set above, so loading becomes false */
    }
  }, [getCurrentWorkerWithTimeout]);

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
