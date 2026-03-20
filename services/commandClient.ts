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

const DEFAULT_TIMEOUT_MS = 90_000;
const UPLOAD_TIMEOUT_MS = 120_000;

function classifyFetchError(e: unknown): CommandClientError {
  if (e instanceof CommandClientError) return e;
  const err = e as { name?: string; message?: string };
  if (err?.name === 'AbortError') {
    return new CommandClientError('timeout', 'Request timed out');
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
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
        (parsed as { error?: string })?.error || 'Conflict',
        409,
        parsed
      );
    }
    if (!res.ok) {
      const msg = (parsed as { error?: string })?.error || res.statusText || 'Request failed';
      throw new CommandClientError('server', msg, res.status, parsed);
    }
    return parsed as T;
  } catch (e) {
    throw classifyFetchError(e);
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
  const timeoutMs = options?.timeoutMs ?? UPLOAD_TIMEOUT_MS;
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
        (parsed as { error?: string })?.error || 'Conflict',
        409,
        parsed
      );
    }
    if (!res.ok) {
      const msg = (parsed as { error?: string })?.error || res.statusText || 'Request failed';
      throw new CommandClientError('server', msg, res.status, parsed);
    }
    return parsed as T;
  } catch (e) {
    throw classifyFetchError(e);
  } finally {
    clearTimeout(timer);
  }
}
