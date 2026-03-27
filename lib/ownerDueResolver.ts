export interface OwnerDueResolverInputRow {
  id: string;
  valid_from: string;
  valid_to?: string | null;
  created_at?: string | null;
  km?: number | null;
  bk?: number | null;
  hk?: number | null;
  muell?: number | null;
  strom?: number | null;
  gas?: number | null;
  wasser?: number | null;
  mietsteuer?: number | null;
  unternehmenssteuer?: number | null;
}

export interface OwnerDueResolvedBlock {
  row_id: string;
  valid_from: string;
  valid_to: string | null;
  created_at: string | null;
  segment_start: string;
  segment_end: string;
  segment_days: number;
  row_days: number;
  factor: number;
  prorated_total: number;
  components: Record<string, number>;
}

export interface OwnerDueResolvedMonth {
  total: number;
  component_totals: Record<string, number>;
  blocks: OwnerDueResolvedBlock[];
}

const COMPONENT_KEYS = [
  'km',
  'bk',
  'hk',
  'muell',
  'strom',
  'gas',
  'wasser',
  'mietsteuer',
  'unternehmenssteuer',
] as const;

const OPEN_END_SENTINEL = '9999-12-31';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmdToEpochDay(ymd: string): number | null {
  const raw = (ymd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const utcMs = Date.UTC(y, m - 1, d);
  const dt = new Date(utcMs);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.floor(utcMs / DAY_MS);
}

function epochDayToYmd(epochDay: number): string {
  return new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
}

function monthBoundsEpochDays(monthKey: string): { start: number; end: number } | null {
  const raw = (monthKey ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const startMs = Date.UTC(y, m - 1, 1);
  const endMs = Date.UTC(y, m, 0);
  return { start: Math.floor(startMs / DAY_MS), end: Math.floor(endMs / DAY_MS) };
}

function toSafeNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseCreatedAtEpochMs(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

interface NormalizedRowInternal extends OwnerDueResolverInputRow {
  id: string;
  valid_from: string;
  valid_to: string | null;
  created_at: string | null;
  fromDay: number;
  toDay: number;
  createdAtMs: number;
  rowDays: number;
  rowTotal: number;
  componentRaw: Record<string, number>;
}

function compareRowsForDay(a: NormalizedRowInternal, b: NormalizedRowInternal): number {
  if (a.fromDay !== b.fromDay) return a.fromDay - b.fromDay;
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return a.id.localeCompare(b.id);
}

function buildRowBlock(row: NormalizedRowInternal, segmentStart: number, segmentEnd: number): OwnerDueResolvedBlock {
  const segmentDays = Math.max(0, segmentEnd - segmentStart + 1);
  const fullMonthShortcut = row.rowDays >= 28 && segmentDays >= 28;
  const factor = fullMonthShortcut ? 1 : segmentDays / row.rowDays;
  const components: Record<string, number> = {};
  for (const key of COMPONENT_KEYS) {
    components[key] = row.componentRaw[key] * factor;
  }
  return {
    row_id: row.id,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    created_at: row.created_at,
    segment_start: epochDayToYmd(segmentStart),
    segment_end: epochDayToYmd(segmentEnd),
    segment_days: segmentDays,
    row_days: row.rowDays,
    factor,
    prorated_total: row.rowTotal * factor,
    components,
  };
}

export function resolveOwnerDueForMonth(
  rows: OwnerDueResolverInputRow[],
  monthKey: string
): OwnerDueResolvedMonth {
  const bounds = monthBoundsEpochDays(monthKey);
  const componentTotals: Record<string, number> = {};
  for (const key of COMPONENT_KEYS) componentTotals[key] = 0;
  if (!bounds || rows.length === 0) {
    return { total: 0, component_totals: componentTotals, blocks: [] };
  }

  const normalized: NormalizedRowInternal[] = rows
    .map((row) => {
      const fromDay = parseYmdToEpochDay(row.valid_from);
      const toParsed = parseYmdToEpochDay(row.valid_to && row.valid_to !== '∞' ? row.valid_to : OPEN_END_SENTINEL);
      if (fromDay == null || toParsed == null) return null;
      const toDay = toParsed;
      if (toDay < fromDay) return null;
      const componentRaw: Record<string, number> = {};
      for (const key of COMPONENT_KEYS) {
        componentRaw[key] = toSafeNumber(row[key]);
      }
      const rowTotal = COMPONENT_KEYS.reduce((sum, key) => sum + componentRaw[key], 0);
      return {
        ...row,
        id: String(row.id),
        valid_from: row.valid_from.slice(0, 10),
        valid_to: row.valid_to && row.valid_to !== '∞' ? row.valid_to.slice(0, 10) : null,
        created_at: row.created_at ? String(row.created_at) : null,
        fromDay,
        toDay,
        createdAtMs: parseCreatedAtEpochMs(row.created_at),
        rowDays: Math.max(1, toDay - fromDay + 1),
        rowTotal,
        componentRaw,
      } satisfies NormalizedRowInternal;
    })
    .filter((row): row is NormalizedRowInternal => row !== null);

  if (normalized.length === 0) {
    return { total: 0, component_totals: componentTotals, blocks: [] };
  }

  const dayWinnerByEpoch = new Map<number, NormalizedRowInternal>();
  for (let day = bounds.start; day <= bounds.end; day += 1) {
    const active = normalized.filter((row) => row.fromDay <= day && day <= row.toDay);
    if (active.length === 0) continue;
    let winner = active[0];
    for (let i = 1; i < active.length; i += 1) {
      const candidate = active[i];
      if (compareRowsForDay(candidate, winner) > 0) winner = candidate;
    }
    dayWinnerByEpoch.set(day, winner);
  }

  const blocks: OwnerDueResolvedBlock[] = [];
  let currentRow: NormalizedRowInternal | null = null;
  let segmentStart = bounds.start;
  for (let day = bounds.start; day <= bounds.end + 1; day += 1) {
    const winner = dayWinnerByEpoch.get(day) ?? null;
    const changed = (winner?.id ?? null) !== (currentRow?.id ?? null);
    if (!changed) continue;
    if (currentRow) {
      blocks.push(buildRowBlock(currentRow, segmentStart, day - 1));
    }
    currentRow = winner;
    segmentStart = day;
  }

  let total = 0;
  for (const block of blocks) {
    total += block.prorated_total;
    for (const key of COMPONENT_KEYS) {
      componentTotals[key] += block.components[key] ?? 0;
    }
  }
  return { total, component_totals: componentTotals, blocks };
}

