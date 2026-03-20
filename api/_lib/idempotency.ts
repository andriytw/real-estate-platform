import type { SupabaseClient } from '@supabase/supabase-js';

const STALE_IN_PROGRESS_MS = 120_000;

export type IdempotencyOutcome =
  | { kind: 'proceed'; rowId: string }
  | { kind: 'replay'; result: unknown }
  | { kind: 'conflict'; message: string };

/**
 * Race-safe idempotency: unique (user_id, command, idempotency_key).
 * - First writer gets proceed.
 * - Duplicate completed → replay stored JSON.
 * - Duplicate in_progress recent → conflict (409).
 * - Duplicate in_progress stale or failed → reclaim proceed.
 */
export async function resolveIdempotency(
  admin: SupabaseClient,
  userId: string,
  command: string,
  idempotencyKey: string
): Promise<IdempotencyOutcome> {
  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await admin
    .from('command_idempotency')
    .insert({
      user_id: userId,
      command,
      idempotency_key: idempotencyKey,
      status: 'in_progress',
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (!insErr && inserted?.id) {
    return { kind: 'proceed', rowId: inserted.id };
  }

  const code = (insErr as { code?: string } | null)?.code;
  if (code !== '23505' && insErr) {
    console.error('[idempotency] insert error', insErr);
    throw insErr;
  }

  const { data: existing, error: selErr } = await admin
    .from('command_idempotency')
    .select('id, status, result_json, updated_at')
    .eq('user_id', userId)
    .eq('command', command)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (selErr || !existing) {
    throw selErr || new Error('Idempotency row missing after conflict');
  }

  if (existing.status === 'completed' && existing.result_json != null) {
    return { kind: 'replay', result: existing.result_json };
  }

  if (existing.status === 'in_progress') {
    const updated = new Date(existing.updated_at).getTime();
    if (Number.isFinite(updated) && Date.now() - updated < STALE_IN_PROGRESS_MS) {
      return { kind: 'conflict', message: 'Same operation is already in progress; retry shortly.' };
    }
    await admin
      .from('command_idempotency')
      .update({ status: 'in_progress', updated_at: now })
      .eq('id', existing.id);
    return { kind: 'proceed', rowId: existing.id };
  }

  if (existing.status === 'failed') {
    await admin
      .from('command_idempotency')
      .update({ status: 'in_progress', result_json: null, updated_at: now })
      .eq('id', existing.id);
    return { kind: 'proceed', rowId: existing.id };
  }

  return { kind: 'conflict', message: 'Unexpected idempotency state' };
}

export async function completeIdempotency(
  admin: SupabaseClient,
  rowId: string,
  result: unknown
): Promise<void> {
  await admin
    .from('command_idempotency')
    .update({
      status: 'completed',
      result_json: result,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId);
}

export async function failIdempotency(admin: SupabaseClient, rowId: string, errorMessage: string): Promise<void> {
  await admin
    .from('command_idempotency')
    .update({
      status: 'failed',
      error_message: errorMessage.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId);
}
