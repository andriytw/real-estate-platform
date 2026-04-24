import { describe, expect, it } from 'vitest';
import { parseLooseDateToEu, parseLooseDateToIso } from '../utils/datePaste';

describe('datePaste', () => {
  it('parses ISO-like formats', () => {
    expect(parseLooseDateToIso('2029-03-31')).toBe('2029-03-31');
    expect(parseLooseDateToIso('2029/3/31')).toBe('2029-03-31');
    expect(parseLooseDateToIso('2029-03-31 00:00')).toBe('2029-03-31');
  });

  it('parses EU dot format', () => {
    expect(parseLooseDateToIso('31.3.2029')).toBe('2029-03-31');
    expect(parseLooseDateToIso('31.03.2029')).toBe('2029-03-31');
  });

  it('parses slash/dash only when unambiguous', () => {
    expect(parseLooseDateToIso('31/3/2029')).toBe('2029-03-31');
    expect(parseLooseDateToIso('31-3-2029')).toBe('2029-03-31');
    // ambiguous: could be MM/DD
    expect(parseLooseDateToIso('3/4/2029')).toBeNull();
    expect(parseLooseDateToIso('03-04-2029')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(parseLooseDateToIso('31.02.2029')).toBeNull();
    expect(parseLooseDateToIso('2029-13-01')).toBeNull();
  });

  it('formats to DD.MM.YYYY for EU-text inputs', () => {
    expect(parseLooseDateToEu('2029-03-31')).toBe('31.03.2029');
    expect(parseLooseDateToEu('31/3/2029')).toBe('31.03.2029');
    expect(parseLooseDateToEu('31.03.2029')).toBe('31.03.2029');
  });
});

