import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase-admin.js';
import { withTimeout } from './with-timeout.js';
import type { CommandAuthProfile } from './server-permissions.js';
import {
  evaluateConfirmPaymentServerDecision,
  evaluateCreateOffersServerDecision,
  evaluateSaveInvoiceServerDecision,
} from './server-permissions.js';

const AUTH_DB_TIMEOUT_MS = 25_000;
const ENABLE_PERMISSION_BRANCH_TELEMETRY = process.env.PERMISSION_BRANCH_TELEMETRY === '1';

/** Command API auth profile — same shape as CommandAuthProfile (Pass 1 / Phase 3A fields). */
export type CommandProfile = CommandAuthProfile;

export class CommandAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CommandAuthError';
    this.status = status;
  }
}

function parseBearer(request: Request): string | null {
  const h = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!h || !h.startsWith('Bearer ')) return null;
  const t = h.slice(7).trim();
  return t.length > 0 ? t : null;
}

type ProfileRow = {
  id: string;
  role: string | null;
  department: string | null;
  department_scope: string | null;
  is_active: boolean | null;
  category_access: unknown;
  can_manage_users: boolean | null;
  can_be_task_assignee: boolean | null;
};

function normalizeProfile(row: ProfileRow): CommandProfile {
  return {
    id: row.id,
    role: String(row.role || 'worker'),
    department: row.department != null ? String(row.department) : null,
    department_scope: row.department_scope != null ? String(row.department_scope) : null,
    is_active: row.is_active,
    category_access: row.category_access,
    can_manage_users: row.can_manage_users === true,
    can_be_task_assignee: row.can_be_task_assignee !== false,
  };
}

/**
 * Validate JWT via Auth API and load profiles row (service role — profiles may be RLS-restricted).
 * Primary fields: department_scope, can_manage_users; department/category_access transitional.
 */
export async function requireCommandProfile(request: Request): Promise<CommandProfile> {
  const token = parseBearer(request);
  if (!token) {
    throw new CommandAuthError(401, 'Missing or invalid Authorization bearer token');
  }

  const admin = getSupabaseAdmin();
  const { data: userData, error: userErr } = await withTimeout(
    admin.auth.getUser(token),
    AUTH_DB_TIMEOUT_MS,
    'auth getUser'
  );
  if (userErr || !userData?.user?.id) {
    throw new CommandAuthError(401, userErr?.message || 'Invalid or expired session');
  }
  const userId = userData.user.id;

  const { data: profile, error: profErr } = await withTimeout(
    admin
      .from('profiles')
      .select(
        'id, role, department, department_scope, is_active, category_access, can_manage_users, can_be_task_assignee'
      )
      .eq('id', userId)
      .maybeSingle(),
    AUTH_DB_TIMEOUT_MS,
    'load profiles for command'
  );

  if (profErr) {
    console.error('[command-auth] profiles load error', profErr.message);
    throw new CommandAuthError(500, 'Failed to load user profile');
  }
  if (!profile) {
    throw new CommandAuthError(403, 'User profile not found');
  }
  if (profile.is_active === false) {
    throw new CommandAuthError(403, 'User account is inactive');
  }

  return normalizeProfile(profile as ProfileRow);
}

export function assertCanCreateOffers(profile: CommandProfile): void {
  const decision = evaluateCreateOffersServerDecision(profile);
  if (ENABLE_PERMISSION_BRANCH_TELEMETRY) {
    console.log('[authz-branch]', {
      permission: 'create_offers',
      tag: decision.tag,
      role: profile.role,
      scope: profile.department_scope ?? 'null',
    });
  }
  if (!decision.allowed) {
    throw new CommandAuthError(403, 'Access denied: sales access required to create offers or bookings');
  }
}

export function assertCanSaveInvoice(profile: CommandProfile): void {
  const decision = evaluateSaveInvoiceServerDecision(profile);
  if (ENABLE_PERMISSION_BRANCH_TELEMETRY) {
    console.log('[authz-branch]', {
      permission: 'save_invoice',
      tag: decision.tag,
      role: profile.role,
      scope: profile.department_scope ?? 'null',
    });
  }
  if (!decision.allowed) {
    throw new CommandAuthError(403, 'Access denied: cannot save invoices or proformas');
  }
}

export function assertCanConfirmPayment(profile: CommandProfile): void {
  const decision = evaluateConfirmPaymentServerDecision(profile);
  if (ENABLE_PERMISSION_BRANCH_TELEMETRY) {
    console.log('[authz-branch]', {
      permission: 'confirm_payment',
      tag: decision.tag,
      role: profile.role,
      scope: profile.department_scope ?? 'null',
    });
  }
  if (!decision.allowed) {
    throw new CommandAuthError(403, 'Access denied: cannot confirm payment for this invoice');
  }
}

export async function assertInvoiceExistsForConfirm(
  admin: SupabaseClient,
  proformaId: string
): Promise<{ id: string; status: string; document_type: string | null }> {
  const { data, error } = await withTimeout(
    admin.from('invoices').select('id, status, document_type').eq('id', proformaId).maybeSingle(),
    AUTH_DB_TIMEOUT_MS,
    'assertInvoiceExistsForConfirm'
  );
  if (error || !data) {
    throw new CommandAuthError(404, 'Invoice not found');
  }
  const dt = data.document_type;
  if (dt != null && dt !== 'proforma' && dt !== 'invoice') {
    throw new CommandAuthError(400, 'This document type cannot be confirmed via payment confirmation');
  }
  if (data.status === 'Paid') {
    throw new CommandAuthError(400, 'Invoice is already paid');
  }
  return data as { id: string; status: string; document_type: string | null };
}
