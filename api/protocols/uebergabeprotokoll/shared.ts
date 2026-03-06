/**
 * Shared data fetching and placeholder building for Übergabeprotokoll DOCX/PDF generation.
 * Used by generate.ts and generate-pdf.ts.
 */

export function formatDDMMYYYY(isoDate: string): string {
  const s = (isoDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

/** Sanitize text to a single line for DOCX (no hard breaks, no NBSP/soft hyphen). */
export function sanitizeOneLine(text: string | null | undefined): string {
  const s = String(text ?? '');
  return s
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildPlaceholders(
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
    data[`name${i}`] = row ? sanitizeOneLine(row.name) : '';
    data[`q${i}`] = row ? String(row.quantity) : '';
  }

  let warning: string | undefined;
  if (aggregatedInventory.length > 46) {
    warning = `У шаблоні лише 46 рядків інвентарю; показано перші 46 з ${aggregatedInventory.length}.`;
  }

  return { data, warning };
}

export function aggregateInventory(
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

export type ProtocolDataResult = {
  bookingRow: Record<string, unknown>;
  propertyRow: Record<string, unknown>;
  aggregated: { name: string; quantity: number }[];
  placeholders: Record<string, string>;
  warning: string | undefined;
  checkInLabel: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProtocolData(supabase: any, bookingId: string, propertyId: string): Promise<ProtocolDataResult> {
  const { data: bookingRow, error: bookingErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !bookingRow) {
    throw new Error('Booking not found');
  }

  const { data: propertyRow, error: propertyErr } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single();

  if (propertyErr || !propertyRow) {
    throw new Error('Property not found');
  }

  const { data: inventoryRows, error: invErr } = await supabase
    .from('property_inventory_items')
    .select('name, quantity')
    .eq('property_id', propertyId);

  if (invErr) {
    throw new Error('Failed to load inventory');
  }

  const inventory = (inventoryRows ?? []) as Array<{ name: string | null; quantity?: number | null }>;
  const aggregated = aggregateInventory(inventory);
  const { data: placeholders, warning } = buildPlaceholders(
    bookingRow as Record<string, unknown>,
    propertyRow as Record<string, unknown>,
    aggregated
  );

  const startDate = (bookingRow as Record<string, unknown>).start_date ?? (bookingRow as Record<string, unknown>).start;
  const checkInLabel = formatDDMMYYYY(String(startDate || '')) || 'document';

  return {
    bookingRow: bookingRow as Record<string, unknown>,
    propertyRow: propertyRow as Record<string, unknown>,
    aggregated,
    placeholders,
    warning,
    checkInLabel,
  };
}
