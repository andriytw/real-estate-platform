/**
 * Guards against supabase.auth.getSession() / getUser() hanging indefinitely
 * after tab return. When the Supabase JS client's internal token-refresh lock
 * gets stuck (browser throttled the background refresh mid-flight), these
 * calls never resolve. We race them against a timeout and, on timeout,
 * clear the stuck internal state so the next attempt can proceed.
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
 * Safe getSession: returns session or null. Never hangs longer than AUTH_CALL_TIMEOUT_MS.
 * On timeout, returns null (caller should treat as "not signed in").
 */
export async function safeGetSession(): Promise<Session | null> {
  try {
    const { data } = await raceWithTimeout(supabase.auth.getSession(), 'getSession');
    return data?.session ?? null;
  } catch (e) {
    if (e instanceof AuthHangTimeoutError) {
      _dbg('authGuard:getSession:fallback', 'getSession hung — returning null session', {});
      return null;
    }
    throw e;
  }
}

/**
 * Safe getUser: returns user or null. Never hangs longer than AUTH_CALL_TIMEOUT_MS.
 */
export async function safeGetUser(): Promise<User | null> {
  try {
    const { data } = await raceWithTimeout(supabase.auth.getUser(), 'getUser');
    return data?.user ?? null;
  } catch (e) {
    if (e instanceof AuthHangTimeoutError) {
      _dbg('authGuard:getUser:fallback', 'getUser hung — returning null user', {});
      return null;
    }
    throw e;
  }
}
