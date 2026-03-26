export function toIsoDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDateUTC(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map((v) => Number(v));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function monthRangeIso(year: number, monthIndex0: number): { fromIso: string; toIsoExclusive: string; days: string[] } {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const next = new Date(Date.UTC(year, monthIndex0 + 1, 1));
  const days: string[] = [];

  for (let d = new Date(first); d < next; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))) {
    days.push(toIsoDateUTC(d));
  }

  return {
    fromIso: toIsoDateUTC(first),
    toIsoExclusive: toIsoDateUTC(next),
    days,
  };
}

export function eachOverlapDay(startIso: string, endIsoExclusive: string): string[] {
  if (!startIso || !endIsoExclusive || startIso >= endIsoExclusive) return [];
  const out: string[] = [];
  let d = parseIsoDateUTC(startIso);
  const end = parseIsoDateUTC(endIsoExclusive);
  while (d < end) {
    out.push(toIsoDateUTC(d));
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  }
  return out;
}

export function clampIntervalToMonth(
  startIso: string,
  endIsoExclusive: string,
  monthFromIso: string,
  monthToIsoExclusive: string
): { startIso: string; endIsoExclusive: string } | null {
  const start = startIso > monthFromIso ? startIso : monthFromIso;
  const end = endIsoExclusive < monthToIsoExclusive ? endIsoExclusive : monthToIsoExclusive;
  if (!start || !end || start >= end) return null;
  return { startIso: start, endIsoExclusive: end };
}
