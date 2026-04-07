export type ActivePropertyLike = { archivedAt?: string | null };

export function isActiveProperty(p: ActivePropertyLike): boolean {
  return p.archivedAt == null;
}

export function filterActiveProperties<T extends ActivePropertyLike>(items: T[]): T[] {
  return items.filter(isActiveProperty);
}
