/**
 * Categories for canonical accounting property documents (per user, per direction).
 */

import { supabase } from '../utils/supabase/client';
import { safeGetUser } from '../lib/supabaseAuthGuard';

export type AccountingDocumentDirection = 'expense' | 'income';

export interface AccountingDocumentCategoryRow {
  id: string;
  user_id: string;
  direction: AccountingDocumentDirection;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_EXPENSE: { code: string; name: string; sort_order: number }[] = [
  { code: 'materials', name: 'Матеріали', sort_order: 1 },
  { code: 'services', name: 'Послуги', sort_order: 2 },
  { code: 'utilities', name: 'Комунальні', sort_order: 3 },
  { code: 'tax_fees', name: 'Податки / збори', sort_order: 4 },
  { code: 'other', name: 'Інше', sort_order: 10 },
];

const DEFAULT_INCOME: { code: string; name: string; sort_order: number }[] = [
  { code: 'rent', name: 'Оренда', sort_order: 1 },
  { code: 'deposit', name: 'Депозит / застава', sort_order: 2 },
  { code: 'services', name: 'Послуги', sort_order: 3 },
  { code: 'reimbursement', name: 'Відшкодування', sort_order: 4 },
  { code: 'other', name: 'Інше', sort_order: 10 },
];

export const accountingDocumentCategoryService = {
  async listByDirection(direction: AccountingDocumentDirection, includeArchived = false): Promise<AccountingDocumentCategoryRow[]> {
    let q = supabase
      .from('accounting_document_categories')
      .select('*')
      .eq('direction', direction)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (!includeArchived) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AccountingDocumentCategoryRow[];
  },

  async ensureDefaults(): Promise<AccountingDocumentCategoryRow[]> {
    const user = await safeGetUser();
    if (!user?.id) return [];
    const existing = await supabase
      .from('accounting_document_categories')
      .select('*')
      .order('direction')
      .order('sort_order');
    if (existing.error) throw existing.error;
    const rows = (existing.data ?? []) as AccountingDocumentCategoryRow[];
    const hasExpense = rows.some((r) => r.direction === 'expense');
    const hasIncome = rows.some((r) => r.direction === 'income');
    const toInsert: {
      user_id: string;
      direction: AccountingDocumentDirection;
      name: string;
      code: string;
      sort_order: number;
      is_active: boolean;
    }[] = [];
    if (!hasExpense) {
      toInsert.push(
        ...DEFAULT_EXPENSE.map((c) => ({
          user_id: user.id,
          direction: 'expense' as const,
          name: c.name,
          code: c.code,
          sort_order: c.sort_order,
          is_active: true,
        }))
      );
    }
    if (!hasIncome) {
      toInsert.push(
        ...DEFAULT_INCOME.map((c) => ({
          user_id: user.id,
          direction: 'income' as const,
          name: c.name,
          code: c.code,
          sort_order: c.sort_order,
          is_active: true,
        }))
      );
    }
    if (toInsert.length === 0) return rows;
    const { data, error } = await supabase.from('accounting_document_categories').insert(toInsert).select();
    if (error) throw error;
    const inserted = (data ?? []) as AccountingDocumentCategoryRow[];
    return [...rows, ...inserted].sort((a, b) => {
      if (a.direction !== b.direction) return a.direction.localeCompare(b.direction);
      return a.sort_order - b.sort_order;
    });
  },
};
