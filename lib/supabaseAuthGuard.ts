/**
 * Guards against supabase.auth.getSession() / getUser() hanging indefinitely
 * after tab return. When the Supabase JS client's internal token-refresh lock
 * gets stuck (browser throttled the background refresh mid-flight), these
 * calls never resolve. We race them against a timeout and, on timeout,
 * read the persisted session directly from localStorage (bypassing the stuck
 * Supabase internal lock) so the app stays logged in and functional.
 */
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase/client';
import { _dbg } from './tabResumeCoalesce';

const AUTH_CALL_TIMEOUT_MS = 8_000;

class AuthHangTimeoutError extends Error {
  constructor(method: string) {
    super(`supabase.auth.${method}() timed out after ${AUTH_CALL_TIMEOUT_MS}ms (likely tab-return token refresh deadlock)`);
    this.name = 'AuthHangTimeoutError';
  }
}

function raceWithTimeout<T>(promise: Promise<T>, method: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      _dbg(`authGuard:${method}:TIMEOUT`, `${method} HUNG for ${AUTH_CALL_TIMEOUT_MS}ms — forcing recovery`, {});
      reject(new AuthHangTimeoutError(method));
    }, AUTH_CALL_TIMEOUT_MS);

    promise.then(
      (val) => { if (!settled) { settled = true; clearTimeout(timer); resolve(val); } },
      (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } },
    );
  });
}

/**
 * Reads the Supabase session directly from localStorage, bypassing
 * the auth client's internal lock. Supabase stores the session under
 * a key matching `sb-<projectRef>-auth-token`.
 */
function readSessionFromStorage(): Session | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.access_token && parsed?.user) {
          _dbg('authGuard:localStorage', 'read session from localStorage', {
            key,
            hasToken: true,
            tokenTail: parsed.access_token.slice(-8),
            expiresAt: parsed.expires_at,
            userId: parsed.user?.id,
          });
          return parsed as Session;
        }
      }
    }
  } catch (e) {
    _dbg('authGuard:localStorage:error', 'failed to read session from localStorage', { error: String(e) });
  }
  return null;
}

/**
 * Safe getSession: returns session or null. Never hangs longer than AUTH_CALL_TIMEOUT_MS.
 * On timeout, reads the session directly from localStorage so the user stays logged in.
 */
export async function safeGetSession(): Promise<Session | null> {
  try {
    const { data } = await raceWithTimeout(supabase.auth.getSession(), 'getSession');
    return data?.session ?? null;
  } catch (e) {
    if (e instanceof AuthHangTimeoutError) {
      const stored = readSessionFromStorage();
      _dbg('authGuard:getSession:fallback', 'getSession hung — using localStorage fallback', {
        hasStoredSession: !!stored,
        tokenTail: stored?.access_token?.slice(-8) ?? 'none',
      });
      return stored;
    }
    throw e;
  }
}

/**
 * Safe getUser: returns user or null. Never hangs longer than AUTH_CALL_TIMEOUT_MS.
 * On timeout, extracts user from the localStorage session.
 */
export async function safeGetUser(): Promise<User | null> {
  try {
    const { data } = await raceWithTimeout(supabase.auth.getUser(), 'getUser');
    return data?.user ?? null;
  } catch (e) {
    if (e instanceof AuthHangTimeoutError) {
      const stored = readSessionFromStorage();
      _dbg('authGuard:getUser:fallback', 'getUser hung — using localStorage user', {
        hasStoredUser: !!stored?.user,
        userId: stored?.user?.id ?? 'none',
      });
      return stored?.user ?? null;
    }
    throw e;
  }
}
