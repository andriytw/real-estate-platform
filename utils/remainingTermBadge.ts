/**
 * Sidebar badge: remaining time until owner/landlord `unit_lease_terms.contract_end` (ISO YYYY-MM-DD).
 */

export type RemainingTermBadgeTone = 'green' | 'amber' | 'red' | 'gray';

const MS_PER_DAY = 86400000;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse YYYY-MM-DD to local calendar date; invalid -> null. */
function parseIsoDateLocal(iso: string): Date | null {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  if (y < 1 || mo < 0 || mo > 11 || day < 1 || day > 31) return null;
  const d = new Date(y, mo, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d;
}

/** Full calendar months from start (inclusive floor) to end, when both are start-of-day and end > start. */
function fullCalendarMonthsFromTo(start: Date, end: Date): number {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return months;
}

export function getRemainingTermBadge(
  contractEndIso: string | null | undefined,
  today: Date = new Date()
): { label: string; tone: RemainingTermBadgeTone } {
  if (contractEndIso == null || String(contractEndIso).trim() === '') {
    return { label: 'No term', tone: 'gray' };
  }
  const end = parseIsoDateLocal(String(contractEndIso));
  if (!end) {
    return { label: 'No term', tone: 'gray' };
  }
  const t = startOfLocalDay(today);
  const e = startOfLocalDay(end);
  const daysDiff = Math.round((e.getTime() - t.getTime()) / MS_PER_DAY);

  if (daysDiff < 0) {
    return { label: 'Expired', tone: 'red' };
  }
  if (daysDiff === 0) {
    return { label: 'Ends today', tone: 'red' };
  }

  const totalMonths = fullCalendarMonthsFromTo(t, e);

  if (totalMonths >= 12) {
    const y = Math.floor(totalMonths / 12);
    const m = totalMonths % 12;
    const label = m === 0 ? `${y}y` : `${y}y ${m}m`;
    const tone: RemainingTermBadgeTone = totalMonths > 6 ? 'green' : 'amber';
    return { label, tone };
  }
  if (totalMonths >= 1) {
    return {
      label: `${totalMonths}m`,
      tone: totalMonths > 6 ? 'green' : 'amber',
    };
  }

  // Less than one full calendar month ahead
  return {
    label: `${daysDiff}d`,
    tone: daysDiff < 30 ? 'red' : 'amber',
  };
}

export function remainingTermBadgeClassName(tone: RemainingTermBadgeTone): string {
  switch (tone) {
    case 'green':
      return 'bg-emerald-500/10 text-emerald-500';
    case 'amber':
      return 'bg-amber-500/10 text-amber-500';
    case 'red':
      return 'bg-red-500/10 text-red-500';
    case 'gray':
    default:
      return 'bg-gray-600/30 text-gray-400';
  }
}
