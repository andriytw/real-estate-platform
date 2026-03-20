import { getSupabaseAdmin } from '../_lib/supabase-admin';
import { withTimeout } from '../_lib/with-timeout';
import {
  requireCommandProfile,
  assertCanCreateOffers,
  CommandAuthError,
} from '../_lib/command-auth';
import { resolveIdempotency, completeIdempotency, failIdempotency } from '../_lib/idempotency';
import { transformOfferFromDB, transformOfferToDB } from '../_lib/commandDb';

const RPC_TIMEOUT_MS = 25_000;
const DB_TIMEOUT_MS = 25_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createLeadServerSide(
  admin: ReturnType<typeof getSupabaseAdmin>,
  draft: { shared: Record<string, unknown>; apartments: Array<Record<string, unknown>> }
): Promise<string | null> {
  const email = String(draft.shared.email ?? '').trim().toLowerCase();
  const phone = String(draft.shared.phone ?? '').trim().replace(/\s+/g, '');
  if (!email && !phone) return null;

  let existing: { id: string } | null = null;
  if (email && phone) {
    const { data } = await withTimeout(
      admin.from('leads').select('id').eq('email', email).eq('phone', phone).limit(1),
      DB_TIMEOUT_MS, 'lead dedup'
    );
    existing = data?.[0] ?? null;
  } else if (email) {
    const { data } = await withTimeout(
      admin.from('leads').select('id').eq('email', email).limit(1),
      DB_TIMEOUT_MS, 'lead dedup'
    );
    existing = data?.[0] ?? null;
  } else {
    const { data } = await withTimeout(
      admin.from('leads').select('id').eq('phone', phone).limit(1),
      DB_TIMEOUT_MS, 'lead dedup'
    );
    existing = data?.[0] ?? null;
  }
  if (existing) return existing.id;

  const name =
    (String(draft.shared.companyName ?? '').trim() ||
      `${String(draft.shared.firstName ?? '').trim()} ${String(draft.shared.lastName ?? '').trim()}`.trim()) || 'Client';
  const type = draft.shared.companyName ? 'Company' : 'Private';
  const contactPerson = draft.shared.companyName
    ? `${String(draft.shared.firstName ?? '').trim()} ${String(draft.shared.lastName ?? '').trim()}`.trim() || null
    : null;

  const { data: ins, error: insErr } = await withTimeout(
    admin.from('leads').insert({
      name,
      type,
      contact_person: contactPerson,
      email: email || '',
      phone: phone || '',
      address: String(draft.shared.address ?? '').trim(),
      status: 'Potential',
      source: 'offer',
    }).select('id').single(),
    DB_TIMEOUT_MS, 'insert lead'
  );
  if (insErr || !ins?.id) {
    console.error('[create-multi-offer] lead insert failed', insErr);
    return null;
  }
  return ins.id as string;
}

async function executeCreateMultiOffer(
  admin: ReturnType<typeof getSupabaseAdmin>,
  draft: {
    shared: Record<string, unknown>;
    apartments: Array<Record<string, unknown>>;
  },
  headerStatus: 'Draft' | 'Sent'
): Promise<{ offers: Record<string, unknown>[]; reservationIds: string[]; leadId: string | null }> {
  const checkIn = String(draft.shared.checkIn);
  const checkOut = String(draft.shared.checkOut);
  const nights = Math.max(
    1,
    Math.round(
      (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const clientName =
    draft.shared.clientType === 'Company'
      ? String(draft.shared.companyName || '').trim()
      : `${String(draft.shared.firstName || '').trim()} ${String(draft.shared.lastName || '').trim()}`.trim();
  const dates = `${checkIn} to ${checkOut}`;

  const { data: offerNoData, error: rpcError } = await withTimeout(
    admin.rpc('get_next_offer_no'),
    RPC_TIMEOUT_MS,
    'get_next_offer_no'
  );
  if (rpcError || offerNoData == null) {
    throw new Error(rpcError?.message || 'Failed to generate offer number');
  }
  const offerNo = String(offerNoData);
  const offerGroupId = crypto.randomUUID();

  const reservationRows = draft.apartments.map((apartment) => {
    const nightlyPrice = Number(apartment.nightlyPrice) || 0;
    const taxRate = Number(apartment.taxRate) || 0;
    const netTotal = nights * nightlyPrice;
    const vatAmount = netTotal * (taxRate / 100);
    const grossTotal = netTotal + vatAmount;
    const resStatus = headerStatus === 'Sent' ? 'offered' : 'open';
    return {
      property_id: apartment.propertyId,
      start_date: checkIn,
      end_date: checkOut,
      status: resStatus,
      lead_label: clientName,
      client_first_name: draft.shared.firstName?.toString().trim() ?? null,
      client_last_name: draft.shared.lastName?.toString().trim() ?? null,
      client_email: draft.shared.email?.toString().trim() ?? null,
      client_phone: draft.shared.phone?.toString().trim() ?? null,
      client_address: draft.shared.address?.toString().trim() ?? null,
      guests_count: 1,
      price_per_night_net: nightlyPrice,
      tax_rate: taxRate,
      total_nights: nights,
      total_gross: grossTotal,
    };
  });

  const { data: insertedReservations, error: resError } = await withTimeout(
    admin.from('reservations').insert(reservationRows).select('id'),
    DB_TIMEOUT_MS,
    'insert reservations'
  );
  if (resError) throw resError;

  const reservationIds = (insertedReservations ?? []).map((r: { id: string }) => r.id);
  if (reservationIds.length !== draft.apartments.length) {
    throw new Error(
      `Reservation creation failed: count mismatch (expected ${draft.apartments.length}, got ${reservationIds.length})`
    );
  }

  const rows: Record<string, unknown>[] = draft.apartments.map((apartment, index) => {
    const nightlyPrice = Number(apartment.nightlyPrice) || 0;
    const taxRate = Number(apartment.taxRate) || 0;
    const kaution = Number((apartment as { kaution?: number }).kaution ?? 0);
    const netTotal = Number((nights * nightlyPrice).toFixed(2));
    const vatAmount = Number((netTotal * (taxRate / 100)).toFixed(2));
    const grossTotal = Number((netTotal + vatAmount + kaution).toFixed(2));
    const priceStr = `${Number(grossTotal).toFixed(2)} EUR`;
    return {
      offerNo,
      clientName,
      propertyId: apartment.propertyId,
      internalCompany: draft.shared.internalCompany,
      price: priceStr,
      dates,
      status: headerStatus,
      guests: '1 Guest',
      email: draft.shared.email,
      phone: draft.shared.phone,
      address: draft.shared.address,
      unit: apartment.apartmentCode,
      clientMessage: draft.shared.clientMessage,
      offerGroupId,
      itemStatus: 'Offered',
      streetSnapshot: apartment.street,
      houseNumberSnapshot: apartment.houseNumber ?? undefined,
      zipSnapshot: apartment.zip,
      citySnapshot: apartment.city,
      apartmentCodeSnapshot: apartment.apartmentCode,
      apartmentGroupSnapshot: apartment.apartmentGroupName ?? undefined,
      nightlyPrice,
      taxRate,
      nights,
      netTotal,
      vatTotal: vatAmount,
      grossTotal,
      kaution,
      reservationId: reservationIds[index],
    };
  });

  const dbRows = rows.map((row) => transformOfferToDB(row));
  const { data: inserted, error: offerErr } = await withTimeout(
    admin.from('offers').insert(dbRows).select('*'),
    DB_TIMEOUT_MS,
    'insert offers'
  );

  if (offerErr) {
    await admin.from('reservations').delete().in('id', reservationIds);
    throw offerErr;
  }

  const insertedList = inserted ?? [];
  for (const row of insertedList) {
    if (row.reservation_id == null || row.reservation_id === '') {
      await admin.from('reservations').delete().in('id', reservationIds);
      throw new Error('Offer row missing reservation_id after insert');
    }
  }

  let leadId: string | null = null;
  if (headerStatus === 'Sent') {
    leadId = await createLeadServerSide(admin, draft);
    if (leadId) {
      const offerIds = insertedList.map((r) => r.id as string);
      await withTimeout(
        admin.from('offers').update({ lead_id: leadId }).in('id', offerIds),
        DB_TIMEOUT_MS, 'link lead to offers'
      );
    }
  }

  return {
    offers: insertedList.map((r) => transformOfferFromDB(r)),
    reservationIds,
    leadId,
  };
}

export async function POST(request: Request) {
  try {
    const profile = await requireCommandProfile(request);
    assertCanCreateOffers(profile);

    const idemKey = request.headers.get('x-idempotency-key')?.trim();
    if (!idemKey) {
      return json({ error: 'Missing X-Idempotency-Key header' }, 400);
    }

    const body = (await request.json()) as {
      draft?: { shared: Record<string, unknown>; apartments: Array<Record<string, unknown>> };
      mode?: string;
    };
    const draft = body.draft;
    const mode = body.mode === 'send' ? 'send' : 'draft';
    if (!draft?.apartments?.length) {
      return json({ error: 'Invalid draft: apartments required' }, 400);
    }

    const admin = getSupabaseAdmin();
    const idem = await resolveIdempotency(admin, profile.id, 'create-multi-offer', idemKey);
    if (idem.kind === 'replay') {
      return json(idem.result, 200);
    }
    if (idem.kind === 'conflict') {
      return json({ error: idem.message }, 409);
    }

    try {
      const headerStatus = mode === 'send' ? 'Sent' : 'Draft';
      const result = await executeCreateMultiOffer(admin, draft, headerStatus);
      await completeIdempotency(admin, idem.rowId, result);
      return json(result, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await failIdempotency(admin, idem.rowId, msg);
      return json({ error: msg }, 500);
    }
  } catch (e) {
    if (e instanceof CommandAuthError) {
      return json({ error: e.message }, e.status);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[create-multi-offer]', e);
    return json({ error: msg }, 500);
  }
}
