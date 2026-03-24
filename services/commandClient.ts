import { supabase } from '../utils/supabase/client';

export type CommandErrorKind = 'timeout' | 'network' | 'auth' | 'conflict' | 'server' | 'unknown';

export class CommandClientError extends Error {
  kind: CommandErrorKind;
  status?: number;
  body?: unknown;
  constructor(kind: CommandErrorKind, message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'CommandClientError';
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

export const COMMAND_JSON_TIMEOUT_MS = 90_000;
export const COMMAND_UPLOAD_TIMEOUT_MS = 120_000;

/** Parse JSON error body from command routes (error may be string or wrongly-shaped). */
export function parseCommandApiErrorMessage(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return 'Request failed';
  const p = parsed as Record<string, unknown>;
  const err = p.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err !== null && typeof err === 'object') {
    const em = (err as { message?: unknown }).message;
    if (typeof em === 'string' && em.trim()) return em.trim();
  }
  if (typeof p.details === 'string' && p.details.trim()) return p.details.trim();
  return 'Request failed';
}

function classifyFetchError(e: unknown, timeoutMs?: number): CommandClientError {
  if (e instanceof CommandClientError) return e;
  const err = e as { name?: string; message?: string };
  if (err?.name === 'AbortError') {
    const seconds = typeof timeoutMs === 'number' ? Math.round(timeoutMs / 1000) : null;
    const message = seconds != null ? `Request timed out after ${seconds}s` : 'Request timed out';
    return new CommandClientError('timeout', message, undefined, timeoutMs != null ? { timeoutMs } : undefined);
  }
  return new CommandClientError('network', err?.message || 'Network error');
}

/**
 * POST JSON to /api/commands/* with Bearer token, idempotency key, and timeout.
 */
export async function commandPostJson<T = unknown>(
  path: string,
  body: unknown,
  options?: { idempotencyKey?: string; timeoutMs?: number }
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new CommandClientError('auth', 'Not signed in');
  }
  const key =
    options?.idempotencyKey ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const timeoutMs = options?.timeoutMs ?? COMMAND_JSON_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': key,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (res.status === 401) {
      throw new CommandClientError('auth', 'Unauthorized', 401, parsed);
    }
    if (res.status === 403) {
      throw new CommandClientError('auth', 'Forbidden', 403, parsed);
    }
    if (res.status === 409) {
      throw new CommandClientError(
        'conflict',
        parseCommandApiErrorMessage(parsed) || 'Conflict',
        409,
        parsed
      );
    }
    if (!res.ok) {
      const msg = parseCommandApiErrorMessage(parsed) || res.statusText || 'Request failed';
      throw new CommandClientError('server', msg, res.status, parsed);
    }
    return parsed as T;
  } catch (e) {
    throw classifyFetchError(e, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST multipart FormData (invoice + optional PDF) to command route.
 */
export async function commandPostFormData<T = unknown>(
  path: string,
  formData: FormData,
  options?: { idempotencyKey?: string; timeoutMs?: number }
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new CommandClientError('auth', 'Not signed in');
  }
  const key =
    options?.idempotencyKey ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const timeoutMs = options?.timeoutMs ?? COMMAND_UPLOAD_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': key,
      },
      body: formData,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (res.status === 401) {
      throw new CommandClientError('auth', 'Unauthorized', 401, parsed);
    }
    if (res.status === 403) {
      throw new CommandClientError('auth', 'Forbidden', 403, parsed);
    }
    if (res.status === 409) {
      throw new CommandClientError(
        'conflict',
        parseCommandApiErrorMessage(parsed) || 'Conflict',
        409,
        parsed
      );
    }
    if (!res.ok) {
      const msg = parseCommandApiErrorMessage(parsed) || res.statusText || 'Request failed';
      throw new CommandClientError('server', msg, res.status, parsed);
    }
    return parsed as T;
  } catch (e) {
    throw classifyFetchError(e, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}
