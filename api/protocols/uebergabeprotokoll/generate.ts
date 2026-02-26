/**
 * POST /api/protocols/uebergabeprotokoll/generate
 * Body: { bookingId: string, propertyId: string }
 * Returns: { url: string, warning?: string }
 * Generates Guest Übergabeprotokoll DOCX from template, uploads to property-documents, returns signed URL.
 */

import { createClient } from '@supabase/supabase-js';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const TEMPLATE_BUCKET = 'templates';
const TEMPLATE_PATH = 'guest/uebergabeprotokoll/v1/template.docx';
const OUTPUT_BUCKET = 'property-documents';
const SIGNED_URL_EXPIRY_SEC = 600;

function formatDDMMYYYY(isoDate: string): string {
  const s = (isoDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

function buildPlaceholders(
  booking: Record<string, unknown>,
  property: Record<string, unknown>,
  aggregatedInventory: { name: string; quantity: number }[]
): { data: Record<string, string>; warning?: string } {
  const startDate = (booking.start_date ?? booking.start) as string | undefined;
  const endDate = (booking.end_date ?? booking.end) as string | undefined;
  const checkIn = formatDDMMYYYY(startDate || '');
  const checkOut = formatDDMMYYYY(endDate || '');

  const clientType = (booking.client_type ?? booking.clientType) as string | undefined;
  const isCompany = String(clientType || '').toLowerCase() === 'company';
  let companyName = '';
  if (isCompany) {
    const cn = (booking.company_name ?? booking.companyName ?? booking.company) as string | undefined;
    if (cn != null && String(cn).trim() !== '' && String(cn).trim().toLowerCase() !== 'n/a') {
      companyName = String(cn).trim();
    }
  }
  if (!companyName) {
    const first = (booking.first_name ?? booking.firstName ?? '') as string;
    const last = (booking.last_name ?? booking.lastName ?? '') as string;
    companyName = `${first} ${last}`.trim();
  }
  if (!companyName) {
    companyName = (booking.guest as string) ?? '';
  }

  const guestList = (booking.guest_list ?? booking.guestList ?? []) as Array<{ firstName?: string; lastName?: string; first_name?: string; last_name?: string }>;
  const guestNames = [1, 2, 3, 4, 5].map((i) => {
    const g = guestList[i - 1];
    if (!g) return '';
    const fn = (g.firstName ?? g.first_name ?? '').trim();
    const ln = (g.lastName ?? g.last_name ?? '').trim();
    return `${fn} ${ln}`.trim();
  });

  const streetPart = String(property.address ?? property.street ?? '').trim();
  const street = streetPart || String(property.full_address ?? '').trim();
  const apt = String(property.title ?? property.unit ?? '').trim();

  const data: Record<string, string> = {
    STREET: street,
    APT: apt,
    checkIn,
    checkOut,
    companyName,
    representedBy: '',
    companyPhone: (booking.phone ?? '').toString().trim(),
    guest1Name: guestNames[0],
    guest2Name: guestNames[1],
    guest3Name: guestNames[2],
    guest4Name: guestNames[3],
    guest5Name: guestNames[4],
    guest1Phone: '',
    guest2Phone: '',
    guest3Phone: '',
    guest4Phone: '',
    guest5Phone: '',
  };

  for (let i = 1; i <= 46; i++) {
    const row = aggregatedInventory[i - 1];
    data[`name${i}`] = row ? String(row.name).trim() : '';
    data[`q${i}`] = row ? String(row.quantity) : '';
  }

  let warning: string | undefined;
  if (aggregatedInventory.length > 46) {
    warning = `У шаблоні лише 46 рядків інвентарю; показано перші 46 з ${aggregatedInventory.length}.`;
  }

  return { data, warning };
}

function aggregateInventory(
  items: Array<{ name: string | null; quantity?: number | null }>
): { name: string; quantity: number }[] {
  const byName = new Map<string, number>();
  for (const it of items) {
    const name = (it.name ?? '').trim();
    if (!name) continue;
    const q = Number(it.quantity);
    const add = Number.isFinite(q) ? q : 0;
    byName.set(name, (byName.get(name) ?? 0) + add);
  }
  return Array.from(byName.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([name, quantity]) => ({ name, quantity }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = body?.bookingId ?? body?.booking_id;
    const propertyId = body?.propertyId ?? body?.property_id;
    if (!bookingId || !propertyId) {
      return new Response(
        JSON.stringify({ error: 'Missing bookingId or propertyId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: bookingRow, error: bookingErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', String(bookingId))
      .single();

    if (bookingErr || !bookingRow) {
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: propertyRow, error: propertyErr } = await supabase
      .from('properties')
      .select('*')
      .eq('id', String(propertyId))
      .single();

    if (propertyErr || !propertyRow) {
      return new Response(
        JSON.stringify({ error: 'Property not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: inventoryRows, error: invErr } = await supabase
      .from('property_inventory_items')
      .select('name, quantity')
      .eq('property_id', String(propertyId));

    const inventory = (inventoryRows ?? []) as Array<{ name: string | null; quantity?: number | null }>;
    if (invErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to load inventory' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const aggregated = aggregateInventory(inventory);
    const { data: placeholders, warning } = buildPlaceholders(
      bookingRow as Record<string, unknown>,
      propertyRow as Record<string, unknown>,
      aggregated
    );

    const { data: templateBlob, error: downloadErr } = await supabase.storage
      .from(TEMPLATE_BUCKET)
      .download(TEMPLATE_PATH);

    if (downloadErr || !templateBlob) {
      return new Response(
        JSON.stringify({ error: 'Template not found in storage. Run scripts/upload-uebergabeprotokoll-template.js first.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const templateBuffer = Buffer.from(await templateBlob.arrayBuffer());
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render(placeholders);
    const outBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    }) as Buffer;

    const startDate = (bookingRow.start_date ?? bookingRow.start) as string | undefined;
    const checkInLabel = formatDDMMYYYY(startDate || '') || 'document';
    const outputPath = `properties/${propertyId}/bookings/${bookingId}/uebergabeprotokoll_${checkInLabel}.docx`;

    const { error: uploadErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .upload(outputPath, outBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to save document: ' + uploadErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(OUTPUT_BUCKET)
      .createSignedUrl(outputPath, SIGNED_URL_EXPIRY_SEC);

    if (signErr || !signed?.signedUrl) {
      return new Response(
        JSON.stringify({ error: 'Failed to create download link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const response: { url: string; warning?: string } = { url: signed.signedUrl };
    if (warning) response.warning = warning;

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
