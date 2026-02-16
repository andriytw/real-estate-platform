/**
 * Property expense categories: per-user. Used for per-item category_id on property_expense_items.
 * Seed default categories on first use (ensureDefaults).
 */

import { supabase } from '../utils/supabase/client';

export interface PropertyExpenseCategoryRow {
  id: string;
  user_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CATEGORIES: { code: string; name: string; sort_order: number }[] = [
  { code: 'materials', name: 'Матеріали', sort_order: 1 },
  { code: 'labor', name: 'Роботи / Підрядники', sort_order: 2 },
  { code: 'plumbing', name: 'Сантехніка', sort_order: 3 },
  { code: 'electrical', name: 'Електрика', sort_order: 4 },
  { code: 'finishing', name: 'Оздоблення / Плитка / Підлога', sort_order: 5 },
  { code: 'windows_doors', name: 'Вікна / Двері', sort_order: 6 },
  { code: 'tools', name: 'Інструменти / Обладнання', sort_order: 7 },
  { code: 'delivery', name: 'Доставка / Транспорт', sort_order: 8 },
  { code: 'cleaning', name: 'Прибирання / Вивіз', sort_order: 9 },
  { code: 'other', name: 'Інше', sort_order: 10 },
];

export const propertyExpenseCategoryService = {
  async listCategories(includeArchived = false): Promise<PropertyExpenseCategoryRow[]> {
    let q = supabase
      .from('property_expense_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (!includeArchived) {
      q = q.eq('is_active', true);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as PropertyExpenseCategoryRow[];
  },

  /** Call on first open of expenses tile: if user has no categories, create defaults. */
  async ensureDefaults(): Promise<PropertyExpenseCategoryRow[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return [];
    const existing = await this.listCategories(true);
    if (existing.length > 0) return existing;
    const toInsert = DEFAULT_CATEGORIES.map((c) => ({
      user_id: user.id,
      name: c.name,
      code: c.code,
      sort_order: c.sort_order,
      is_active: true,
    }));
    const { data, error } = await supabase
      .from('property_expense_categories')
      .insert(toInsert)
      .select();
    if (error) throw error;
    return (data ?? []) as PropertyExpenseCategoryRow[];
  },

  async createCategory(name: string, code?: string): Promise<PropertyExpenseCategoryRow> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Not authenticated');
    const finalCode = code ?? name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const { data, error } = await supabase
      .from('property_expense_categories')
      .insert({
        user_id: user.id,
        name,
        code: finalCode,
        sort_order: 100,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data as PropertyExpenseCategoryRow;
  },

  async updateCategory(
    id: string,
    patch: { name?: string; sort_order?: number }
  ): Promise<PropertyExpenseCategoryRow> {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;
    if (Object.keys(payload).length === 0) {
      const { data } = await supabase.from('property_expense_categories').select('*').eq('id', id).single();
      return data as PropertyExpenseCategoryRow;
    }
    const { data, error } = await supabase
      .from('property_expense_categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as PropertyExpenseCategoryRow;
  },

  async archiveCategory(id: string): Promise<void> {
    const { error } = await supabase
      .from('property_expense_categories')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  },

  async restoreCategory(id: string): Promise<void> {
    const { error } = await supabase
      .from('property_expense_categories')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw error;
  },
};
