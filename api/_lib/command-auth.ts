import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase-admin';

export type CommandProfile = {
  id: string;
  role: string;
  department: string | null;
  is_active: boolean | null;
  category_access: unknown;
};

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

/**
 * Validate JWT via Auth API and load profiles row (service role — profiles may be RLS-restricted).
 */
export async function requireCommandProfile(request: Request): Promise<CommandProfile> {
  const token = parseBearer(request);
  if (!token) {
    throw new CommandAuthError(401, 'Missing or invalid Authorization bearer token');
  }

  const admin = getSupabaseAdmin();
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    throw new CommandAuthError(401, userErr?.message || 'Invalid or expired session');
  }
  const userId = userData.user.id;

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, role, department, is_active, category_access')
    .eq('id', userId)
    .maybeSingle();

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

  return {
    id: profile.id,
    role: String(profile.role || 'worker'),
    department: profile.department != null ? String(profile.department) : null,
    is_active: profile.is_active,
    category_access: profile.category_access,
  };
}

export function hasSalesCategoryAccess(profile: CommandProfile): boolean {
  const ca = profile.category_access;
  if (!ca || !Array.isArray(ca)) return false;
  return ca.some((x) => String(x).toLowerCase() === 'sales');
}

/** Matches offers/reservations write access: sales department, super_manager, or sales category_access. */
export function assertCanCreateOffers(profile: CommandProfile): void {
  if (profile.role === 'super_manager') return;
  if (profile.department === 'sales') return;
  if (hasSalesCategoryAccess(profile)) return;
  throw new CommandAuthError(403, 'Access denied: sales access required to create offers or bookings');
}

/**
 * Invoice / proforma writes: accounting, sales, manager, super_manager, or sales category_access.
 * Mirrors practical UI access (sales creates proformas; accounting full; managers often elevated).
 */
export function assertCanSaveInvoice(profile: CommandProfile): void {
  if (profile.role === 'super_manager') return;
  if (profile.department === 'accounting' || profile.department === 'sales') return;
  if (profile.role === 'manager') return;
  if (hasSalesCategoryAccess(profile)) return;
  throw new CommandAuthError(403, 'Access denied: cannot save invoices or proformas');
}

/** Matches mark_invoice_paid_and_confirm_booking RPC gate. */
export function assertCanConfirmPayment(profile: CommandProfile): void {
  if (profile.role === 'super_manager') return;
  if (profile.department === 'accounting' || profile.department === 'sales') return;
  if (hasSalesCategoryAccess(profile)) return;
  throw new CommandAuthError(403, 'Access denied: cannot confirm payment for this invoice');
}

/** Optional: verify invoice row is proforma and unpaid before confirm — done in route. */

export async function assertInvoiceExistsForConfirm(
  admin: SupabaseClient,
  proformaId: string
): Promise<{ id: string; status: string; document_type: string | null }> {
  const { data, error } = await admin
    .from('invoices')
    .select('id, status, document_type')
    .eq('id', proformaId)
    .maybeSingle();
  if (error || !data) {
    throw new CommandAuthError(404, 'Invoice not found');
  }
  if (data.document_type !== 'proforma') {
    throw new CommandAuthError(400, 'Only proforma invoices can be confirmed this way');
  }
  if (data.status === 'Paid') {
    throw new CommandAuthError(400, 'Invoice is already paid');
  }
  return data as { id: string; status: string; document_type: string | null };
}
