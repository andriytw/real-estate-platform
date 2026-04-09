import { describe, expect, it } from 'vitest';
import {
  APARTMENT_TEXT_COLLATOR,
  compareApartmentCanonical,
  compareStreetPrimaryThenCanonical,
  compareWohnungPrimaryCanonical,
  parseApartmentUnitKey,
} from './sorting';

describe('parseApartmentUnitKey', () => {
  it('never throws on garbage input', () => {
    const p = parseApartmentUnitKey('!!!\0\x00');
    expect(p.normalizedRaw).toBeDefined();
    expect(p.buildingRank).toBeDefined();
  });
});

describe('building order VH < SF < QG/HH', () => {
  it('VH before SF before QG', () => {
    expect(
      compareApartmentCanonical(
        { unit: 'VH EG-L', apartmentId: 'a' },
        { unit: 'SF EG-L', apartmentId: 'b' }
      )
    ).toBeLessThan(0);
    expect(
      compareApartmentCanonical(
        { unit: 'SF EG-L', apartmentId: 'a' },
        { unit: 'QG EG-L', apartmentId: 'b' }
      )
    ).toBeLessThan(0);
  });

  it('QG and HH same group (tie on building — raw/id breaks)', () => {
    const q = parseApartmentUnitKey('QG 1.OG-L');
    const h = parseApartmentUnitKey('HH 1.OG-L');
    expect(q.buildingRank).toBe(h.buildingRank);
  });
});

describe('SFL < SF generic < SFR', () => {
  it('orders SFL before generic SF before SFR', () => {
    expect(
      compareApartmentCanonical(
        { unit: 'SFL 1.OG-L', apartmentId: '1' },
        { unit: 'SF 1.OG-L', apartmentId: '2' }
      )
    ).toBeLessThan(0);
    expect(
      compareApartmentCanonical(
        { unit: 'SF 1.OG-L', apartmentId: '1' },
        { unit: 'SFR 1.OG-L', apartmentId: '2' }
      )
    ).toBeLessThan(0);
  });
});

describe('floor order UG < EG < n.OG < DG < unknown', () => {
  it('UG before EG before 1OG before DG before unknown', () => {
    const ug = parseApartmentUnitKey('VH UG-L');
    const eg = parseApartmentUnitKey('VH EG-L');
    const og1 = parseApartmentUnitKey('VH 1.OG-L');
    const dg = parseApartmentUnitKey('VH DG-L');
    const unk = parseApartmentUnitKey('VH ZIMMER-X');
    expect(ug.floorRank).toBeLessThan(eg.floorRank);
    expect(eg.floorRank).toBeLessThan(og1.floorRank);
    expect(og1.floorRank).toBeLessThan(dg.floorRank);
    expect(dg.floorRank).toBeLessThan(unk.floorRank);
  });
});

describe('position L < ML < M < MR < R', () => {
  it('orders positions', () => {
    expect(
      compareApartmentCanonical({ unit: 'VH EG-L', apartmentId: '1' }, { unit: 'VH EG-ML', apartmentId: '2' })
    ).toBeLessThan(0);
    expect(
      compareApartmentCanonical({ unit: 'VH EG-ML', apartmentId: '1' }, { unit: 'VH EG-M', apartmentId: '2' })
    ).toBeLessThan(0);
    expect(
      compareApartmentCanonical({ unit: 'VH EG-M', apartmentId: '1' }, { unit: 'VH EG-MR', apartmentId: '2' })
    ).toBeLessThan(0);
    expect(
      compareApartmentCanonical({ unit: 'VH EG-MR', apartmentId: '1' }, { unit: 'VH EG-R', apartmentId: '2' })
    ).toBeLessThan(0);
  });
});

describe('descending primary does not invert canonical order within same address', () => {
  it('street desc reverses street but keeps unit order', () => {
    const a = {
      streetSortKey: 'Same Str 1',
      unit: 'VH EG-L',
      apartmentId: '1',
    };
    const b = {
      streetSortKey: 'Same Str 1',
      unit: 'VH EG-R',
      apartmentId: '2',
    };
    const asc = compareStreetPrimaryThenCanonical(a, b, 'asc');
    const desc = compareStreetPrimaryThenCanonical(a, b, 'desc');
    expect(asc).toBeLessThan(0);
    expect(desc).toBe(asc);
  });

  it('street desc flips different streets', () => {
    const a = { streetSortKey: 'A Str 1', unit: 'EG-L', apartmentId: '1' };
    const b = { streetSortKey: 'B Str 2', unit: 'EG-L', apartmentId: '2' };
    expect(compareStreetPrimaryThenCanonical(a, b, 'asc')).toBeLessThan(0);
    expect(compareStreetPrimaryThenCanonical(a, b, 'desc')).toBeGreaterThan(0);
  });
});

describe('Intl.Collator', () => {
  it('uses de numeric collation', () => {
    expect(APARTMENT_TEXT_COLLATOR.resolvedOptions().locale.startsWith('de')).toBe(true);
    expect(APARTMENT_TEXT_COLLATOR.resolvedOptions().numeric).toBe(true);
  });
});

describe('compareWohnungPrimaryCanonical', () => {
  it('reverses unit primary only; id tiebreak stable', () => {
    const a = { unit: 'VH EG-L', apartmentId: 'z' };
    const b = { unit: 'VH EG-R', apartmentId: 'a' };
    expect(compareWohnungPrimaryCanonical(a, b, 'asc')).toBeLessThan(0);
    expect(compareWohnungPrimaryCanonical(a, b, 'desc')).toBeGreaterThan(0);
    const same = { unit: 'VH EG-L', apartmentId: 'a' };
    const same2 = { unit: 'VH EG-L', apartmentId: 'b' };
    expect(compareWohnungPrimaryCanonical(same, same2, 'desc')).toBe(
      APARTMENT_TEXT_COLLATOR.compare('a', 'b')
    );
  });
});

describe('determinism without apartmentId', () => {
  it('uses sourceIndex when ids missing', () => {
    expect(
      compareApartmentCanonical({ unit: 'X', sourceIndex: 2 }, { unit: 'X', sourceIndex: 5 })
    ).toBeLessThan(0);
  });
});
