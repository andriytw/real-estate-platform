import { getSupabaseAdmin } from '../_lib/supabase-admin.js';
import { withTimeout } from '../_lib/with-timeout.js';
import {
  requireCommandProfile,
  assertCanCreateOffers,
  CommandAuthError,
} from '../_lib/command-auth.js';
import { resolveIdempotency, completeIdempotency, failIdempotency } from '../_lib/idempotency.js';
import { transformOfferFromDB, transformOfferToDB, transformReservationToDB } from '../_lib/commandDb.js';

const RPC_TIMEOUT_MS = 25_000;
const DB_TIMEOUT_MS = 25_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
      /** Optional display title for unit */
      propertyTitle?: string;
      /** Default internal company label when property management name missing */
      internalCompanyFallback?: string;
    };
    const draft = body.draft;
    if (!draft?.apartments?.length) {
      return json({ error: 'Invalid draft' }, 400);
    }

    const admin = getSupabaseAdmin();
    const idem = await resolveIdempotency(admin, profile.id, 'create-direct-booking', idemKey);
    if (idem.kind === 'replay') {
      return json(idem.result, 200);
    }
    if (idem.kind === 'conflict') {
      return json({ error: idem.message }, 409);
    }

    try {
      const apartment = draft.apartments[0];
      const internalCompany =
        String(body.internalCompanyFallback || '').trim() || 'Sotiso';

      const checkIn = String(draft.shared.checkIn);
      const checkOut = String(draft.shared.checkOut);
      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const diffMs = checkOutDate.getTime() - checkInDate.getTime();
      const nights = diffMs > 0 ? Math.round(diffMs / (1000 * 60 * 60 * 24)) : 0;
      const nightlyPrice = Number(apartment.nightlyPrice) || 0;
      const taxRate = Number(apartment.taxRate) ?? 19;
      const kaution = Number(apartment.kaution) || 0;
      const netTotal = Number((nights * nightlyPrice).toFixed(2));
      const vatAmount = Number((netTotal * (taxRate / 100)).toFixed(2));
      const grossTotal = Number((netTotal + vatAmount + kaution).toFixed(2));
      const leadLabel =
        draft.shared.clientType === 'Company'
          ? String(draft.shared.companyName || '').trim() || 'Guest'
          : `${String(draft.shared.firstName || '').trim()} ${String(draft.shared.lastName || '').trim()}`.trim() ||
            'Guest';

      const reservationRow = transformReservationToDB({
        propertyId: String(apartment.propertyId),
        startDate: checkIn,
        endDate: checkOut,
        status: 'open',
        leadLabel,
        clientFirstName: draft.shared.firstName || undefined,
        clientLastName: draft.shared.lastName || undefined,
        clientEmail: draft.shared.email || undefined,
        clientPhone: draft.shared.phone || undefined,
        clientAddress: draft.shared.address || undefined,
        guestsCount: 1,
        pricePerNightNet: nightlyPrice,
        taxRate,
        totalNights: nights,
        totalGross: grossTotal,
      });

      const { data: resRow, error: resErr } = await withTimeout(
        admin.from('reservations').insert([reservationRow]).select('id').single(),
        DB_TIMEOUT_MS,
        'create reservation'
      );
      if (resErr || !resRow?.id) {
        throw resErr || new Error('Reservation insert failed');
      }
      const reservationId = resRow.id as string;

      const { data: offerNoData, error: rpcError } = await withTimeout(
        admin.rpc('get_next_offer_no'),
        RPC_TIMEOUT_MS,
        'get_next_offer_no'
      );
      if (rpcError || offerNoData == null) {
        await withTimeout(
          admin.from('reservations').delete().eq('id', reservationId),
          DB_TIMEOUT_MS,
          'rollback reservation after offer_no RPC error'
        );
        throw new Error(rpcError?.message || 'Failed to generate offer number');
      }
      const offerNo = String(offerNoData);
      const price = `${grossTotal.toFixed(2)} EUR`;
      const dates = `${checkIn} to ${checkOut}`;
      const selectedLeadId = draft.shared.selectedLeadId
        ? String(draft.shared.selectedLeadId)
        : undefined;

      const offerPayload = transformOfferToDB({
        offerNo,
        clientName: leadLabel,
        propertyId: String(apartment.propertyId),
        internalCompany,
        price,
        dates,
        status: 'Sent',
        email: draft.shared.email || undefined,
        phone: draft.shared.phone || undefined,
        address: draft.shared.address || undefined,
        unit: body.propertyTitle || apartment.apartmentCode,
        reservationId,
        nightlyPrice,
        taxRate,
        nights,
        netTotal,
        vatTotal: vatAmount,
        grossTotal,
        kaution,
        leadId: selectedLeadId,
        guests: undefined,
        comments: undefined,
        clientMessage: undefined,
      });

      const { data: offerRow, error: offErr } = await withTimeout(
        admin.from('offers').insert([offerPayload]).select('*').single(),
        DB_TIMEOUT_MS,
        'create offer'
      );
      if (offErr || !offerRow) {
        await withTimeout(
          admin.from('reservations').delete().eq('id', reservationId),
          DB_TIMEOUT_MS,
          'rollback reservation after offer insert error'
        );
        throw offErr || new Error('Offer insert failed');
      }

      const result = {
        offer: transformOfferFromDB(offerRow),
        reservationId,
      };
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
    console.error('[create-direct-booking]', e);
    return json({ error: msg }, 500);
  }
}
