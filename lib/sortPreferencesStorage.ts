/**
 * Per-user, per-list sort preferences in localStorage. Fail-safe: invalid or unknown schema => null (use defaults).
 */

export const SORT_PREFS_STORAGE_PREFIX = 'appSortPrefs:v1:';

function storageKey(userId: string, pageKey: string, listKey: string): string {
  return `${SORT_PREFS_STORAGE_PREFIX}${userId}:${pageKey}:${listKey}`;
}

export function readSortPreferenceRaw(userId: string, pageKey: string, listKey: string): unknown | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(userId, pageKey, listKey));
    if (raw == null || raw === '') return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function writeSortPreferenceRaw(userId: string, pageKey: string, listKey: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId, pageKey, listKey), JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

const SCHEMA_V1 = 1;

/** Property list sidebar A/Z */
export type PropertyListSortDir = 'asc' | 'desc';

export function parsePropertyListSortPayload(raw: unknown): PropertyListSortDir | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_V1) return null;
  if (o.kind !== 'propertyListSort') return null;
  const dir = o.dir;
  if (dir !== 'asc' && dir !== 'desc') return null;
  return dir;
}

export function propertyListSortPayload(dir: PropertyListSortDir): Record<string, unknown> {
  return { schemaVersion: SCHEMA_V1, kind: 'propertyListSort', dir };
}

/** Sales calendar availability list — internal enums only */
export type AvailabilityListSortMode = 'streetAsc' | 'roomsAsc' | 'bedsAsc';

export function parseAvailabilityListSortPayload(raw: unknown): AvailabilityListSortMode | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_V1) return null;
  if (o.kind !== 'availabilityListSort') return null;
  const mode = o.mode;
  if (mode !== 'streetAsc' && mode !== 'roomsAsc' && mode !== 'bedsAsc') return null;
  return mode;
}

export function availabilityListSortPayload(mode: AvailabilityListSortMode): Record<string, unknown> {
  return { schemaVersion: SCHEMA_V1, kind: 'availabilityListSort', mode };
}

export type TableSortDir = 'asc' | 'desc';

export type MatrixSortKeyPersist =
  | 'abteilung'
  | 'statusLabel'
  | 'adresse'
  | 'wohnung'
  | 'qm'
  | 'betten'
  | 'rooms'
  | 'occupancyPct'
  | null;

export type FinancialSortKeyPersist =
  | 'abteilung'
  | 'statusLabel'
  | 'adresse'
  | 'wohnung'
  | 'qm'
  | 'betten'
  | 'rooms'
  | 'collectedForApartment'
  | 'planningPricePerRoom'
  | 'fullCapacityIncome'
  | 'difference'
  | 'planFulfillment'
  | 'invoices'
  | 'ownerDue'
  | 'totalCost'
  | null;

const MATRIX_KEYS = new Set<string>([
  'abteilung',
  'statusLabel',
  'adresse',
  'wohnung',
  'qm',
  'betten',
  'rooms',
  'occupancyPct',
]);

const FIN_KEYS = new Set<string>([
  'abteilung',
  'statusLabel',
  'adresse',
  'wohnung',
  'qm',
  'betten',
  'rooms',
  'collectedForApartment',
  'planningPricePerRoom',
  'fullCapacityIncome',
  'difference',
  'planFulfillment',
  'invoices',
  'ownerDue',
  'totalCost',
]);

export function parseMatrixTableSortPayload(raw: unknown): { key: MatrixSortKeyPersist; dir: TableSortDir } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_V1) return null;
  if (o.kind !== 'matrixTableSort') return null;
  const key = o.key;
  if (key !== null && (typeof key !== 'string' || !MATRIX_KEYS.has(key))) return null;
  const dir = o.dir;
  if (dir !== 'asc' && dir !== 'desc') return null;
  return { key: key as MatrixSortKeyPersist, dir };
}

export function matrixTableSortPayload(key: MatrixSortKeyPersist, dir: TableSortDir): Record<string, unknown> {
  return { schemaVersion: SCHEMA_V1, kind: 'matrixTableSort', key, dir };
}

export function parseFinancialTableSortPayload(raw: unknown): { key: FinancialSortKeyPersist; dir: TableSortDir } | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_V1) return null;
  if (o.kind !== 'financialTableSort') return null;
  const key = o.key;
  if (key !== null && (typeof key !== 'string' || !FIN_KEYS.has(key))) return null;
  const dir = o.dir;
  if (dir !== 'asc' && dir !== 'desc') return null;
  return { key: key as FinancialSortKeyPersist, dir };
}

export function financialTableSortPayload(key: FinancialSortKeyPersist, dir: TableSortDir): Record<string, unknown> {
  return { schemaVersion: SCHEMA_V1, kind: 'financialTableSort', key, dir };
}

export type ModalStreetSort = 'default' | 'asc' | 'desc';

export function parseModalStreetSortPayload(raw: unknown): ModalStreetSort | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_V1) return null;
  if (o.kind !== 'modalStreetSort') return null;
  const order = o.order;
  if (order !== 'default' && order !== 'asc' && order !== 'desc') return null;
  return order;
}

export function modalStreetSortPayload(order: ModalStreetSort): Record<string, unknown> {
  return { schemaVersion: SCHEMA_V1, kind: 'modalStreetSort', order };
}
