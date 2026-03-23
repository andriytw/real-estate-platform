import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, getSupabaseRestUrl } from '../utils/supabase/client';
import type { Worker } from '../types';
import { transformWorkerFromDB } from '../services/supabaseService';

export type ProfileLoadStatus = 'idle' | 'loading' | 'timed_out' | 'error' | 'ready';

interface WorkerContextType {
  session: Session | null | undefined;
  worker: Worker | null;
  /** True only while session is undefined (initializing). Not worker loading. */
  loading: boolean;
  /** Profile load state: idle, loading, timed_out (slow), error (real failure), ready. */
  profileLoadStatus: ProfileLoadStatus;
  /** Set when profileLoadStatus === 'error'. Do not treat as logout. */
  workerError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isWorker: boolean;
  refreshWorker: () => Promise<void>;
  /** Reset status and retry loading worker. */
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
  const [profileLoadStatus, setProfileLoadStatus] = useState<ProfileLoadStatus>('idle');
  const initialWorkerLoadStartedRef = useRef(false);
  const bootstrapCompleteRef = useRef(false);
  const activeProfileLoadIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = worker;
  }, [worker]);

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
        worker: transformWorkerFromDB(profile),
        error: null,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load profile';
      if (isDev && typeof window !== 'undefined') console.log('[DEV] WorkerContext: returning error (catch)', { error: message });
      return { worker: null, error: message };
    }
  }, []);

  const PROFILE_LOAD_TIMEOUT_MS = 15000;

  type ProfileLoadResult =
    | { status: 'ready'; worker: Worker }
    | { status: 'timed_out' }
    | { status: 'error'; error: string }
    | { status: 'stale' };

  const invalidateActiveProfileLoad = useCallback(() => {
    activeProfileLoadIdRef.current += 1;
  }, []);

  const loadWorkerWithTimeoutFeedback = useCallback(async (): Promise<ProfileLoadResult> => {
    const loadId = activeProfileLoadIdRef.current + 1;
    activeProfileLoadIdRef.current = loadId;
    setProfileLoadStatus('loading');
    setWorkerError(null);

    const timeoutId = window.setTimeout(() => {
      if (activeProfileLoadIdRef.current !== loadId) return;
      if (workerRef.current == null) {
        setProfileLoadStatus('timed_out');
        setWorkerError(null);
      }
    }, PROFILE_LOAD_TIMEOUT_MS);

    try {
      const result = await getCurrentWorker();
      window.clearTimeout(timeoutId);

      if (activeProfileLoadIdRef.current !== loadId) {
        return { status: 'stale' };
      }

      if (result.error) {
        setProfileLoadStatus('error');
        setWorkerError(result.error);
        return { status: 'error', error: result.error };
      }

      if (result.worker) {
        setWorker(result.worker);
        setWorkerError(null);
        setProfileLoadStatus('ready');
        return { status: 'ready', worker: result.worker };
      }

      const fallbackError = 'Failed to load profile.';
      setProfileLoadStatus('error');
      setWorkerError(fallbackError);
      return { status: 'error', error: fallbackError };
    } catch (error) {
      window.clearTimeout(timeoutId);

      if (activeProfileLoadIdRef.current !== loadId) {
        return { status: 'stale' };
      }

      const message = error instanceof Error ? error.message : 'Failed to load profile.';
      setProfileLoadStatus('error');
      setWorkerError(message);
      return { status: 'error', error: message };
    }
  }, [getCurrentWorker]);

  const loadWorkerWhenSessionExists = useCallback(async () => {
    await loadWorkerWithTimeoutFeedback();
  }, [loadWorkerWithTimeoutFeedback]);

  const refreshWorker = useCallback(async () => {
    if (session == null) return;
    await loadWorkerWithTimeoutFeedback();
  }, [session, loadWorkerWithTimeoutFeedback]);

  const retryWorker = useCallback(async () => {
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
        await loadWorkerWithTimeoutFeedback();
      } else {
        invalidateActiveProfileLoad();
        setProfileLoadStatus('idle');
        setWorker(null);
        setWorkerError(null);
      }
    } catch {
      invalidateActiveProfileLoad();
      setSession(null);
      setProfileLoadStatus('idle');
      setWorker(null);
      setWorkerError(null);
    }
  }, [invalidateActiveProfileLoad, loadWorkerWithTimeoutFeedback]);

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
        if (initialWorkerLoadStartedRef.current) {
          return;
        }
        initialWorkerLoadStartedRef.current = true;
        await loadWorkerWithTimeoutFeedback();
        bootstrapCompleteRef.current = true;
        if (!mounted) return;
      } else {
        invalidateActiveProfileLoad();
        setProfileLoadStatus('idle');
        setWorker(null);
        setWorkerError(null);
      }
    })();
    return () => {
      mounted = false;
      invalidateActiveProfileLoad();
    };
  }, [invalidateActiveProfileLoad, loadWorkerWithTimeoutFeedback]);

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
        invalidateActiveProfileLoad();
        bootstrapCompleteRef.current = false;
        initialWorkerLoadStartedRef.current = false;
        setSession(null);
        setProfileLoadStatus('idle');
        setWorker(null);
        setWorkerError(null);
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && s) {
        setSession(s);
        if (!bootstrapCompleteRef.current) return;
        await loadWorkerWhenSessionExists();
      }
      if (event === 'INITIAL_SESSION') {
        setSession(s ?? null);
        if (s) {
          if (!initialWorkerLoadStartedRef.current) {
            initialWorkerLoadStartedRef.current = true;
            await loadWorkerWhenSessionExists();
            bootstrapCompleteRef.current = true;
          }
        } else {
          invalidateActiveProfileLoad();
          setProfileLoadStatus('idle');
          setWorker(null);
          setWorkerError(null);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [invalidateActiveProfileLoad, loadWorkerWhenSessionExists]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        setSession(data.session);
        const result = await loadWorkerWithTimeoutFeedback();
        bootstrapCompleteRef.current = true;
        if (result.status === 'error') {
          throw new Error('Worker profile not found. Please contact administrator.');
        }
      }
    } finally {
      /* session is set above, so loading becomes false */
    }
  }, [loadWorkerWithTimeoutFeedback]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      invalidateActiveProfileLoad();
      bootstrapCompleteRef.current = false;
      initialWorkerLoadStartedRef.current = false;
      setSession(null);
      setProfileLoadStatus('idle');
      setWorker(null);
      setWorkerError(null);
    } finally {
      /* session/worker cleared above */
    }
  }, [invalidateActiveProfileLoad]);

  const isAdmin = worker?.role === 'super_manager';
  const isManager = worker?.role === 'manager' || worker?.role === 'super_manager';
  const isWorker = worker?.role === 'worker';

  return (
    <WorkerContext.Provider
      value={{
        session,
        worker,
        loading,
        profileLoadStatus,
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
