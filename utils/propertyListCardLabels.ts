import type { Property } from '../types';

/**
 * Split one address line into street vs house number (last token starting with a digit = house).
 */
export function splitStreetHouseLine(line: string): { street: string; house: string } {
  const trimmed = line.replace(/\s+/g, ' ').trim();
  if (!trimmed) return { street: '', house: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const t = parts[0] ?? '';
    return /^\d/.test(t) ? { street: '', house: t } : { street: t, house: '' };
  }
  const last = parts[parts.length - 1] ?? '';
  if (/^\d/.test(last)) {
    return { street: parts.slice(0, -1).join(' '), house: last };
  }
  return { street: trimmed, house: '' };
}

function line1FromStreetHouse(street: string, house: string): string {
  const s = street.trim();
  const h = house.trim();
  if (s && h) return `${s} ${h}`;
  return s || h;
}

function legacyFirstLineWithoutZip(p: Property): string {
  const raw = (p.fullAddress || '').trim();
  if (!raw) return '';
  let seg = raw.includes(',') ? raw.split(',')[0].trim() : raw;
  seg = seg.replace(/^\d{5}\s+/, '').trim();
  return seg.replace(/\s+/g, ' ').trim();
}

/** Visible line 1 and sort key: "<street> <house number>" only. */
export function getPropertyListPrimaryTitle(p: Property): string {
  const addr = (p.address || '').trim();
  if (addr) {
    const { street, house } = splitStreetHouseLine(addr);
    return line1FromStreetHouse(street, house);
  }
  const leg = legacyFirstLineWithoutZip(p);
  if (leg) {
    const { street, house } = splitStreetHouseLine(leg);
    return line1FromStreetHouse(street, house);
  }
  return '';
}

/** Line 2: "<unit code> • <city>" or one side only — no dangling •. */
export function getPropertyListSubtitleLine(p: Property): string | null {
  const unit = (p.title || '').trim();
  const city = (p.city || '').trim();
  if (unit && city) return `${unit} • ${city}`;
  if (unit) return unit;
  if (city) return city;
  return null;
}

function hasMetric(n: number | null | undefined): n is number {
  return n != null && !Number.isNaN(n) && Number(n) !== 0;
}

/** Line 3: area • beds • rooms (fixed order; omit empty/zero). */
export function getPropertyListMetricsLine(p: Property): string | null {
  const d = p.details;
  const areaRaw = d?.area ?? p.area;
  const bedsRaw = d?.beds;
  const roomsRaw = d?.rooms ?? p.rooms;

  const parts: string[] = [];
  if (hasMetric(areaRaw)) parts.push(`${areaRaw} m²`);
  if (hasMetric(bedsRaw)) parts.push(`${bedsRaw} beds`);
  if (hasMetric(roomsRaw)) parts.push(`${roomsRaw} rooms`);

  if (parts.length === 0) return null;
  return parts.join(' • ');
}

/** Non-empty strings to match against property search (street, house, line1, unit, city, legacy full). */
export function getPropertyListSearchParts(p: Property): string[] {
  const out: string[] = [];
  const addr = (p.address || '').trim();
  if (addr) {
    const { street, house } = splitStreetHouseLine(addr);
    const l1 = line1FromStreetHouse(street, house);
    if (l1) out.push(l1);
    if (street) out.push(street);
    if (house) out.push(house);
  } else {
    const leg = legacyFirstLineWithoutZip(p);
    if (leg) {
      const { street, house } = splitStreetHouseLine(leg);
      const l1 = line1FromStreetHouse(street, house);
      if (l1) out.push(l1);
      if (street) out.push(street);
      if (house) out.push(house);
    }
  }
  const unit = (p.title || '').trim();
  if (unit) out.push(unit);
  const city = (p.city || '').trim();
  if (city) out.push(city);
  const full = (p.fullAddress || '').trim();
  if (full) out.push(full);
  return out;
}
