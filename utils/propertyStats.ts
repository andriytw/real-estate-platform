import type { Property } from '../types';

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function getPropertyStats(p: Property): { rooms: number; beds: number; area: number } {
  const d = p.details;
  return {
    rooms: toNum(d?.rooms),
    beds: toNum(d?.beds),
    area: toNum(d?.area),
  };
}
