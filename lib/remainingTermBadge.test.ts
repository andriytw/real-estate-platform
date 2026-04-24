import { describe, it, expect } from 'vitest';
import { getRemainingTermBadge } from '../utils/remainingTermBadge';

/** Fixed local "today" for stable assertions. */
const june15_2025 = new Date(2025, 5, 15);

describe('getRemainingTermBadge', () => {
  it('shows Xy Ym and green when more than 1 year and >6 months (same window)', () => {
    const r = getRemainingTermBadge('2026-09-15', june15_2025);
    expect(r.label).toBe('1y 3m');
    expect(r.tone).toBe('green');
  });

  it('shows Xm and green when between 1 and 12 months and >6 months', () => {
    const r = getRemainingTermBadge('2026-02-15', june15_2025);
    expect(r.label).toBe('8m');
    expect(r.tone).toBe('green');
  });

  it('shows Xm in amber for 1–6 months', () => {
    const r = getRemainingTermBadge('2025-10-15', june15_2025);
    expect(r.label).toBe('4m');
    expect(r.tone).toBe('amber');
  });

  it('shows Xd in red for under 30 days', () => {
    const r = getRemainingTermBadge('2025-07-04', june15_2025);
    expect(r.label).toBe('19d');
    expect(r.tone).toBe('red');
  });

  it('Ends today in red', () => {
    const r = getRemainingTermBadge('2025-06-15', june15_2025);
    expect(r.label).toBe('Ends today');
    expect(r.tone).toBe('red');
  });

  it('Expired in red', () => {
    const r = getRemainingTermBadge('2025-06-10', june15_2025);
    expect(r.label).toBe('Expired');
    expect(r.tone).toBe('red');
  });

  it('No term for missing/invalid', () => {
    expect(getRemainingTermBadge(null, june15_2025).label).toBe('No term');
    expect(getRemainingTermBadge('', june15_2025).label).toBe('No term');
    expect(getRemainingTermBadge('not-a-date', june15_2025).label).toBe('No term');
  });
});
