/**
 * Canonical apartment / unit sorting for lists site-wide.
 * Text comparisons use a single Intl.Collator (de, numeric, base, ignore punctuation).
 */

import type { Property } from '../../types';

/** Single shared collator for all apartment-sort text comparisons. */
export const APARTMENT_TEXT_COLLATOR = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
  ignorePunctuation: true,
});

export function compareStringsApartmentSort(a: string, b: string): number {
  return APARTMENT_TEXT_COLLATOR.compare(a ?? '', b ?? '');
}

/**
 * Split one address line into street vs house number (last token starting with a digit = house).
 * Canonical implementation — shared across the app.
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

/**
 * Canonical street sort key: "<street> <house>" from one address line (or first segment before comma).
 * Use for every "street A–Z" / primary address ordering across the app.
 */
export function getStreetSortKey(addressOrFullLine: string): string {
  let line = (addressOrFullLine || '').trim();
  if (!line) return '';
  if (line.includes(',')) line = line.split(',')[0].trim();
  line = line.replace(/^\d{5}\s+/, '').trim();
  line = line.replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const { street, house } = splitStreetHouseLine(line);
  return line1FromStreetHouse(street, house);
}

/** Same visible line 1 / sort key as Property list sidebar. */
export function getStreetSortKeyFromProperty(p: Property): string {
  const addr = (p.address || '').trim();
  if (addr) return getStreetSortKey(addr);
  const raw = (p.fullAddress || '').trim();
  if (!raw) return '';
  let seg = raw.includes(',') ? raw.split(',')[0].trim() : raw;
  seg = seg.replace(/^\d{5}\s+/, '').trim();
  return getStreetSortKey(seg.replace(/\s+/g, ' ').trim());
}

/** Floor rank: UG(0) < EG(1) < 1.OG(2) < 2.OG(3) … < DG < unknown. */
const FLOOR_DG = 9998;
const FLOOR_UNKNOWN = 99999;

function floorRankFromString(s: string): number {
  const up = s.replace(/,/g, '.').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!up) return FLOOR_UNKNOWN;
  if (/\bUG\b/.test(up) || /UNTERGESCHOSS/i.test(s) || /\bKELLER\b/i.test(s)) return 0;
  if (/\bEG\b/.test(up)) return 1;
  if (/\bDG\b/.test(up)) return FLOOR_DG;
  const mDot = up.match(/(\d+)\s*\.\s*OG/);
  if (mDot) {
    const n = parseInt(mDot[1] ?? '', 10);
    if (n >= 1 && n <= 99) return n + 1;
  }
  const mNoDot = up.match(/\b(\d+)\s*OG\b/);
  if (mNoDot) {
    const n = parseInt(mNoDot[1] ?? '', 10);
    if (n >= 1 && n <= 99) return n + 1;
  }
  if (/\/\s*EG\b/i.test(s)) return 1;
  return FLOOR_UNKNOWN;
}

/** Building part: VH (1), SF group (2), QG/HH (3); unknown last. */
const BUILDING_VH = 1;
const BUILDING_SF = 2;
const BUILDING_QG_HH = 3;
const BUILDING_UNKNOWN = 999;

/** SFL < generic SF (2) < SFR within SF group. */
const SF_NONE = 0;
const SF_SFL = 1;
const SF_GENERIC = 2;
const SF_SFR = 3;

/** Position: L < ML < M < MR < R; unknown last. */
const POS_UNKNOWN = 999;

function positionRankFromString(s: string): number {
  const up = s.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!up) return POS_UNKNOWN;
  if (/MITTE-LINKS|MITTE\s+LINKS/.test(up) || /\bML\b/.test(up)) return 2;
  if (/MITTE-RECHTS|MITTE\s+RECHTS/.test(up) || /\bMR\b/.test(up)) return 4;
  if (/\bMITTE\b/.test(up)) return 3;
  if (/\bLINKS\b/.test(up)) return 1;
  if (/\bRECHTS\b/.test(up)) return 5;
  return POS_UNKNOWN;
}

function refinePositionFromEnd(s: string): number {
  const t = s.trim();
  const end = t.match(
    /(?:^|[-\s/])(ML|MR|MITTE-LINKS|MITTE-RECHTS|MITTE|LINKS|RECHTS|[LRM])\s*$/i
  );
  if (end) {
    const token = (end[1] ?? '').toUpperCase();
    if (token === 'L' || token === 'LINKS') return 1;
    if (token === 'ML' || token === 'MITTE-LINKS') return 2;
    if (token === 'M' || token === 'MITTE') return 3;
    if (token === 'MR' || token === 'MITTE-RECHTS') return 4;
    if (token === 'R' || token === 'RECHTS') return 5;
  }
  return positionRankFromString(s);
}

function detectBuildingAndSfSub(up: string): { building: number; sfSub: number } {
  if (/\bSFL\b/.test(up)) return { building: BUILDING_SF, sfSub: SF_SFL };
  if (/\bSFR\b/.test(up)) return { building: BUILDING_SF, sfSub: SF_SFR };
  if (/\bSF\b/.test(up)) return { building: BUILDING_SF, sfSub: SF_GENERIC };
  if (/\bVH\b/.test(up) || /VORDERHAUS/.test(up)) return { building: BUILDING_VH, sfSub: SF_NONE };
  if (/\bQG\b/.test(up) || /\bHH\b/.test(up) || /HINTERHAUS/.test(up) || /QUERGEB/.test(up)) {
    return { building: BUILDING_QG_HH, sfSub: SF_NONE };
  }
  if (/SEITENFL/.test(up)) return { building: BUILDING_SF, sfSub: SF_GENERIC };
  return { building: BUILDING_UNKNOWN, sfSub: SF_NONE };
}

export interface ParsedUnit {
  buildingRank: number;
  sfSubRank: number;
  floorRank: number;
  positionRank: number;
  normalizedRaw: string;
}

function normalizeRawUnit(unit: string): string {
  return unit.replace(/\s+/g, ' ').trim();
}

function parseApartmentUnitKeyInner(unit: string): ParsedUnit {
  const normalizedRaw = normalizeRawUnit(unit);
  const up = normalizedRaw.toUpperCase();
  const { building, sfSub } = detectBuildingAndSfSub(up);
  const floorRank = floorRankFromString(normalizedRaw);
  let positionRank = refinePositionFromEnd(normalizedRaw);
  if (positionRank === POS_UNKNOWN) positionRank = positionRankFromString(normalizedRaw);
  return {
    buildingRank: building,
    sfSubRank: sfSub,
    floorRank,
    positionRank,
    normalizedRaw: normalizedRaw || '',
  };
}

function compareApartmentUnitParsedOnly(a: ApartmentCanonicalInput, b: ApartmentCanonicalInput): number {
  const pa = parseApartmentUnitKey(a.unit ?? '');
  const pb = parseApartmentUnitKey(b.unit ?? '');
  return compareParsedUnit(pa, pb);
}

function fallbackParsedUnit(unit: string): ParsedUnit {
  const normalizedRaw = normalizeRawUnit(unit);
  return {
    buildingRank: BUILDING_UNKNOWN,
    sfSubRank: SF_NONE,
    floorRank: FLOOR_UNKNOWN,
    positionRank: POS_UNKNOWN,
    normalizedRaw: normalizedRaw || '',
  };
}

/**
 * Total, non-throwing: every input yields a deterministic ParsedUnit.
 */
export function parseApartmentUnitKey(unit: string): ParsedUnit {
  try {
    return parseApartmentUnitKeyInner(unit ?? '');
  } catch {
    return fallbackParsedUnit(unit ?? '');
  }
}

function compareParsedUnit(a: ParsedUnit, b: ParsedUnit): number {
  if (a.buildingRank !== b.buildingRank) return a.buildingRank - b.buildingRank;
  if (a.sfSubRank !== b.sfSubRank) return a.sfSubRank - b.sfSubRank;
  if (a.floorRank !== b.floorRank) return a.floorRank - b.floorRank;
  if (a.positionRank !== b.positionRank) return a.positionRank - b.positionRank;
  const raw = compareStringsApartmentSort(a.normalizedRaw, b.normalizedRaw);
  if (raw !== 0) return raw;
  return 0;
}

export interface ApartmentCanonicalInput {
  unit: string;
  apartmentId?: string;
  /** Original array index when ids are missing — deterministic tie-break. */
  sourceIndex?: number;
}

/**
 * Canonical apartment order (always ascending). Uses apartmentId then sourceIndex when unit-parse ties.
 */
export function compareApartmentCanonical(a: ApartmentCanonicalInput, b: ApartmentCanonicalInput): number {
  const pa = parseApartmentUnitKey(a.unit ?? '');
  const pb = parseApartmentUnitKey(b.unit ?? '');
  const c = compareParsedUnit(pa, pb);
  if (c !== 0) return c;
  const idA = (a.apartmentId ?? '').trim();
  const idB = (b.apartmentId ?? '').trim();
  const idCmp = compareStringsApartmentSort(idA, idB);
  if (idCmp !== 0) return idCmp;
  const ia = (a.sourceIndex ?? 0) >>> 0;
  const ib = (b.sourceIndex ?? 0) >>> 0;
  return ia - ib;
}

export interface StreetThenCanonicalInput extends ApartmentCanonicalInput {
  /** From getStreetSortKey / getStreetSortKeyFromProperty. */
  streetSortKey: string;
}

export function compareStreetPrimaryThenCanonical(
  a: StreetThenCanonicalInput,
  b: StreetThenCanonicalInput,
  primaryDir: 'asc' | 'desc'
): number {
  const streetCmp = compareStringsApartmentSort(a.streetSortKey ?? '', b.streetSortKey ?? '');
  if (streetCmp !== 0) return primaryDir === 'asc' ? streetCmp : -streetCmp;
  return compareApartmentCanonical(a, b);
}

/**
 * Sort by canonical unit only for primary; `dir` applies only to that comparison.
 * Ties: apartmentId (asc), then sourceIndex (asc).
 */
export function compareWohnungPrimaryCanonical(
  a: ApartmentCanonicalInput,
  b: ApartmentCanonicalInput,
  primaryDir: 'asc' | 'desc'
): number {
  const u = compareApartmentUnitParsedOnly(a, b);
  if (u !== 0) return primaryDir === 'asc' ? u : -u;
  const idA = (a.apartmentId ?? '').trim();
  const idB = (b.apartmentId ?? '').trim();
  const idCmp = compareStringsApartmentSort(idA, idB);
  if (idCmp !== 0) return idCmp;
  return (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0);
}

/** Empty strings sort last; then collator compare. */
export function compareLocaleEmptyLastApartmentSort(a: string, b: string, asc: boolean): number {
  const ae = !(a ?? '').trim();
  const be = !(b ?? '').trim();
  if (ae || be) {
    if (ae && be) return 0;
    if (ae) return 1;
    if (be) return -1;
  }
  const c = compareStringsApartmentSort(a ?? '', b ?? '');
  return asc ? c : -c;
}
