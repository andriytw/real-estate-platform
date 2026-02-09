/**
 * Date conversion for lease terms: UI uses DD.MM.YYYY, DB uses YYYY-MM-DD.
 */

/** Convert YYYY-MM-DD to DD.MM.YYYY for display. Returns '' for null/empty. */
export function isoToEu(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = iso.trim();
  if (d.length !== 10) return d;
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

const DDMMYYYY_REGEX = /^\d{2}\.\d{2}\.\d{4}$/;

/**
 * Validate DD.MM.YYYY: format and real calendar date (e.g. 31.02.2026 fails).
 * Returns error message or null if valid.
 */
export function validateEuDate(value: string | null | undefined, fieldName: string): string | null {
  if (value == null || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!DDMMYYYY_REGEX.test(trimmed)) return `${fieldName}: Format DD.MM.YYYY erforderlich.`;
  const iso = euToIso(trimmed);
  if (!iso) return `${fieldName}: Ungültiges Datum (z. B. 31.02.2026).`;
  return null;
}

/** Convert DD.MM.YYYY to YYYY-MM-DD for DB. Returns null if invalid or empty. */
export function euToIso(eu: string | null | undefined): string | null {
  if (eu == null || eu.trim() === '') return null;
  const trimmed = eu.trim();
  const parts = trimmed.split(/[.\-/]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y) return null;
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  const year = y.length === 2 ? `20${y}` : y;
  if (year.length !== 4 || month.length !== 2 || day.length !== 2) return null;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible calendar dates (e.g. 31.02 rolls to next month in JS)
  const [yNum, mNum, dNum] = [parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)];
  if (date.getUTCFullYear() !== yNum || date.getUTCMonth() !== mNum || date.getUTCDate() !== dNum) return null;
  return iso;
}
