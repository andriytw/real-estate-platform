import { isoToEu } from './leaseTermDates';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || y > 9999) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  // Reject impossible calendar dates (e.g. 31.02 rolls over)
  if (date.getUTCFullYear() !== y) return false;
  if (date.getUTCMonth() !== m - 1) return false;
  if (date.getUTCDate() !== d) return false;
  return true;
}

function firstToken(s: string): string {
  // Excel often copies as "YYYY-MM-DD 00:00" or "DD.MM.YYYY 0:00"
  const t = (s ?? '').trim();
  if (!t) return '';
  const space = t.indexOf(' ');
  const tab = t.indexOf('\t');
  const cut = [space, tab].filter((x) => x > 0).sort((a, b) => a - b)[0];
  const head = cut ? t.slice(0, cut) : t;
  return head.split('T')[0] ?? head;
}

/**
 * Parse a pasted date string into ISO `YYYY-MM-DD`.
 *
 * Supported inputs (safe/unambiguous only):
 * - `DD.MM.YYYY` / `D.M.YYYY` (dot implies EU order)
 * - `DD-MM-YYYY` (only if unambiguous; avoids US `MM-DD-YYYY`)
 * - `DD/MM/YYYY` (only if unambiguous; avoids US `MM/DD/YYYY`)
 * - `YYYY-MM-DD`
 * - `YYYY/MM/DD`
 *
 * Returns null if invalid or ambiguous.
 */
export function parseLooseDateToIso(raw: string): string | null {
  const token = firstToken(String(raw ?? ''));
  if (!token) return null;

  const s = token.trim();

  // Year-first: YYYY-MM-DD or YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!isValidYmd(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // Dot EU: DD.MM.YYYY / D.M.YYYY
  const dmyDot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmyDot) {
    const d = Number(dmyDot[1]);
    const m = Number(dmyDot[2]);
    const y = Number(dmyDot[3]);
    if (!isValidYmd(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  // Slash or dash: D/M/YYYY, DD/MM/YYYY, D-M-YYYY, DD-MM-YYYY
  const dmyLoose = s.match(/^(\d{1,2})([\/-])(\d{1,2})\2(\d{4})$/);
  if (dmyLoose) {
    const d = Number(dmyLoose[1]);
    const m = Number(dmyLoose[3]);
    const y = Number(dmyLoose[4]);

    // Constraint: do not guess ambiguous US-style dates.
    // Only accept when day/month ordering is unambiguous:
    // - if day > 12 -> it cannot be MM/DD
    // - else if month > 12 -> it's invalid in EU order anyway
    // - else ambiguous -> reject
    if (d <= 12) return null;
    if (!isValidYmd(y, m, d)) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
}

/** Parse loose date and format as `DD.MM.YYYY` for EU-text inputs. */
export function parseLooseDateToEu(raw: string): string | null {
  const iso = parseLooseDateToIso(raw);
  if (!iso) return null;
  const eu = isoToEu(iso);
  return eu || null;
}

