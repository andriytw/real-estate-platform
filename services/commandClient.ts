import { _dbg } from '../lib/tabResumeCoalesce';
import { safeGetSession } from '../lib/supabaseAuthGuard';

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
  // #region agent log
  const _t0 = Date.now();
  _dbg('cmd:json:start','commandPostJson START — calling getSession',{path,idemKey:options?.idempotencyKey??null});
  // #endregion
  const session = await safeGetSession();
  // #region agent log
  const _t1 = Date.now();
  const _tokenPreview = session?.access_token ? session.access_token.slice(-8) : 'none';
  const _expiresAt = session?.expires_at;
  _dbg('cmd:json:gotSession','getSession returned',{path,ms:_t1-_t0,hasToken:!!session?.access_token,tokenTail:_tokenPreview,expiresAt:_expiresAt,expired:typeof _expiresAt==='number'&&_expiresAt<Math.floor(Date.now()/1000)});
  // #endregion
  const token = session?.access_token;
  if (!token) {
    // #region agent log
    _dbg('cmd:json:NO_TOKEN','No token — throwing auth error',{path,ms:_t1-_t0});
    // #endregion
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
    // #region agent log
    _dbg('cmd:json:fetch','fetch START',{path,timeoutMs});
    // #endregion
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
    // #region agent log
    _dbg('cmd:json:response','fetch returned',{path,status:res.status,ms:Date.now()-_t0});
    // #endregion
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (res.status === 401) {
      // #region agent log
      _dbg('cmd:json:401','server returned 401',{path,parsed,tokenTail:_tokenPreview,expiresAt:_expiresAt});
      // #endregion
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
    // #region agent log
    _dbg('cmd:json:CATCH','commandPostJson CATCH',{path,error:String(e),kind:(e as CommandClientError)?.kind,ms:Date.now()-_t0});
    // #endregion
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
  // #region agent log
  const _t0 = Date.now();
  _dbg('cmd:form:start','commandPostFormData START — calling getSession',{path,idemKey:options?.idempotencyKey??null});
  // #endregion
  const session = await safeGetSession();
  // #region agent log
  const _t1 = Date.now();
  const _tokenPreview = session?.access_token ? session.access_token.slice(-8) : 'none';
  const _expiresAt = session?.expires_at;
  _dbg('cmd:form:gotSession','getSession returned',{path,ms:_t1-_t0,hasToken:!!session?.access_token,tokenTail:_tokenPreview,expiresAt:_expiresAt,expired:typeof _expiresAt==='number'&&_expiresAt<Math.floor(Date.now()/1000)});
  // #endregion
  const token = session?.access_token;
  if (!token) {
    // #region agent log
    _dbg('cmd:form:NO_TOKEN','No token — throwing auth error',{path});
    // #endregion
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
    // #region agent log
    _dbg('cmd:form:fetch','fetch START',{path,timeoutMs});
    // #endregion
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Idempotency-Key': key,
      },
      body: formData,
      signal: ctrl.signal,
    });
    // #region agent log
    _dbg('cmd:form:response','fetch returned',{path,status:res.status,ms:Date.now()-_t0});
    // #endregion
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (res.status === 401) {
      // #region agent log
      _dbg('cmd:form:401','server returned 401',{path,parsed,tokenTail:_tokenPreview,expiresAt:_expiresAt});
      // #endregion
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
    // #region agent log
    _dbg('cmd:form:CATCH','commandPostFormData CATCH',{path,error:String(e),kind:(e as CommandClientError)?.kind,ms:Date.now()-_t0});
    // #endregion
    throw classifyFetchError(e, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}
