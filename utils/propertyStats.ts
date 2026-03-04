import type { Property } from '../types';

export function toNum(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Single source of truth for rooms count in statistics. Prefers details.rooms (same as Unit Card), then top-level rooms; supports number or string; returns integer >= 1. */
export function getRoomsCount(p: Property | null | undefined): number {
  const raw =
    p?.details?.rooms ??
    p?.rooms ??
    (p as { room_count?: number })?.room_count ??
    (p as { bedrooms?: number })?.bedrooms ??
    null;
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function getPropertyStats(p: Property): { rooms: number; beds: number; area: number } {
  const d = p.details;
  return {
    rooms: toNum(d?.rooms),
    beds: toNum(d?.beds),
    area: toNum(d?.area),
  };
}
