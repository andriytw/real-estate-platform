/**
 * UI-only access helpers for desktop dashboard routing (Pass 2).
 * Source of truth: lib/permissions.ts (canViewModule, etc.).
 */

import type { Worker } from '../types';
import { canViewModule, type AppModule } from './permissions';

const DASHBOARD_MODULE_ORDER: AppModule[] = [
  'properties',
  'facility',
  'accounting',
  'sales',
  'tasks',
  'admin',
];

/** First module the user may open in AccountDashboard sidebar order. */
export function firstAllowedDashboardModule(worker: Worker | null | undefined): AppModule | null {
  if (!worker) return null;
  for (const m of DASHBOARD_MODULE_ORDER) {
    if (canViewModule(worker, m)) return m;
  }
  return null;
}

export function canAccessDashboardModule(
  user: Worker | null | undefined,
  module: AppModule
): boolean {
  return canViewModule(user, module);
}
