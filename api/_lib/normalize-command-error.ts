/**
 * Convert thrown values (PostgREST, Storage, Error, plain objects) into safe API fields.
 * Never use String(unknown) on object errors — that yields "[object Object]".
 */

export type NormalizedCommandError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function normalizeCommandError(e: unknown): NormalizedCommandError {
  if (e instanceof Error) {
    const name = e.name && e.name !== 'Error' ? e.name : undefined;
    return {
      message: e.message?.trim() || 'Error',
      ...(name ? { code: name } : {}),
    };
  }

  if (e !== null && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const msgFromMessage = typeof o.message === 'string' ? o.message.trim() : '';
    const msgFromError = typeof o.error === 'string' ? o.error.trim() : '';
    const msgFromMsg = typeof o.msg === 'string' ? o.msg.trim() : '';
    const message =
      msgFromMessage || msgFromError || msgFromMsg || 'Request failed';

    const code = typeof o.code === 'string' && o.code ? o.code : undefined;
    const details = typeof o.details === 'string' && o.details ? o.details : undefined;
    const hint = typeof o.hint === 'string' && o.hint ? o.hint : undefined;

    return { message, code, details, hint };
  }

  if (typeof e === 'string' && e.trim()) {
    return { message: e.trim() };
  }

  return { message: 'Unknown error' };
}

/** JSON body for route responses; only includes defined fields. */
export function commandErrorResponseBody(
  norm: NormalizedCommandError,
  step?: string
): { error: string; code?: string; step?: string; details?: string; hint?: string } {
  const body: {
    error: string;
    code?: string;
    step?: string;
    details?: string;
    hint?: string;
  } = { error: norm.message };
  if (norm.code) body.code = norm.code;
  if (step) body.step = step;
  if (norm.details) body.details = norm.details;
  if (norm.hint) body.hint = norm.hint;
  return body;
}
