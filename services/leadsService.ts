import { supabase } from '../utils/supabase/client';
import type { RequestData } from '../types';
import type { Lead } from '../types';

export type LeadOrigin = 'marketplace_request' | 'booking_form' | 'chat' | 'request';

export interface CreateLeadFromRequestOptions {
  origin?: LeadOrigin;
}

const LEAD_SELECT =
  'id, name, type, contact_person, email, phone, address, status, created_at, source, notes';

/**
 * Single place for creating a lead from a request.
 * Dedupe: when both email and phone present, match only when BOTH match same lead; when only one present, match by that field. No insert when both empty.
 * Do not depend on DB trigger; all lead creation from requests goes through this.
 */
export async function createLeadFromRequest(
  request: RequestData,
  options?: CreateLeadFromRequestOptions
): Promise<Lead | null> {
  const email = (request.email ?? '').trim().toLowerCase();
  const phone = (request.phone ?? '').trim().replace(/\s+/g, '');

  // No email/phone → cannot dedupe safely
  if (!email && !phone) {
    return null;
  }

  // Duplicate check: both email AND phone must match when both present; otherwise match by single field
  if (email && phone) {
    const { data: existing } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('email', email)
      .eq('phone', phone)
      .limit(1);
    if (existing?.length) return transformLeadFromDB(existing[0]);
  } else if (email) {
    const { data: existing } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('email', email)
      .limit(1);
    if (existing?.length) return transformLeadFromDB(existing[0]);
  } else {
    const { data: existing } = await supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('phone', phone)
      .limit(1);
    if (existing?.length) return transformLeadFromDB(existing[0]);
  }

  const name =
    (request.companyName ?? `${request.firstName ?? ''} ${request.lastName ?? ''}`.trim()) || 'Client';
  const type = request.companyName ? 'Company' : 'Private';
  const contactPerson = request.companyName
    ? `${request.firstName ?? ''} ${request.lastName ?? ''}`.trim() || undefined
    : undefined;
  const origin = options?.origin ?? 'request';

  // source is origin label; request id stored separately if possible
  const { data, error } = await supabase
    .from('leads')
    .insert({
      name: name || 'Client',
      type,
      contact_person: contactPerson ?? null,
      email: email || '',
      phone: phone || '',
      address: '', // NOT NULL in schema; empty string allowed
      status: 'Active',
      source: origin,
      notes: request.id, // store request id for reference
    })
    .select()
    .single();

  if (error) throw error;
  return transformLeadFromDB(data);
}

function transformLeadFromDB(db: Record<string, unknown>): Lead {
  return {
    id: db.id as string,
    name: (db.name as string) ?? '',
    type: (db.type as Lead['type']) ?? 'Private',
    contactPerson: db.contact_person as string | undefined,
    email: (db.email as string) ?? '',
    phone: (db.phone as string) ?? '',
    address: (db.address as string) ?? '',
    status: (db.status as Lead['status']) ?? 'Active',
    createdAt: db.created_at as string,
    source: db.source as string | undefined,
    notes: db.notes as string | undefined,
  };
}
