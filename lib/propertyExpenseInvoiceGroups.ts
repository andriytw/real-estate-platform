import type { PropertyExpenseItemWithDocument } from '../services/propertyExpenseService';

export type ExpenseInvoiceGroupKey = string;

/** Primary: document_id. Fallback: deterministic composite from stable fields (same contract everywhere). */
export function expenseInvoiceGroupKey(item: PropertyExpenseItemWithDocument): ExpenseInvoiceGroupKey {
  if (item.document_id) return `doc:${item.document_id}`;
  const inv = (item.invoice_number ?? item.property_expense_documents?.invoice_number ?? '').trim().toLowerCase();
  const date = (item.invoice_date ?? item.property_expense_documents?.invoice_date ?? '').toString().slice(0, 10);
  const vendor = (item.vendor ?? item.property_expense_documents?.vendor ?? '').trim().toLowerCase();
  const storage = (item.property_expense_documents?.storage_path ?? '').trim();
  return `nodo:${inv}|${date}|${vendor}|${storage}`;
}

function invoiceGroupSortDate(item: PropertyExpenseItemWithDocument): string {
  const d = item.property_expense_documents?.invoice_date ?? item.invoice_date ?? '';
  return (d || '').toString().slice(0, 10);
}

export interface ExpenseInvoiceGroupMonth {
  key: ExpenseInvoiceGroupKey;
  items: PropertyExpenseItemWithDocument[];
  total: number;
}

function expenseInvoiceLineAmountLike(item: PropertyExpenseItemWithDocument): number {
  return item.line_total != null
    ? Number(item.line_total)
    : (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
}

/**
 * Group month items by expenseInvoiceGroupKey; sort groups by date desc, then invoice number, then key.
 */
export function buildExpenseInvoiceGroupsForMonth(
  monthItems: PropertyExpenseItemWithDocument[],
  lineAmount: (i: PropertyExpenseItemWithDocument) => number = expenseInvoiceLineAmountLike
): ExpenseInvoiceGroupMonth[] {
  const map = new Map<string, PropertyExpenseItemWithDocument[]>();
  for (const item of monthItems) {
    const k = expenseInvoiceGroupKey(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  const groups: ExpenseInvoiceGroupMonth[] = [...map.entries()].map(([key, items]) => ({
    key,
    items,
    total: items.reduce((s, i) => s + lineAmount(i), 0),
  }));
  groups.sort((a, b) => {
    const dateA = invoiceGroupSortDate(a.items[0]);
    const dateB = invoiceGroupSortDate(b.items[0]);
    if (dateB !== dateA) return dateB.localeCompare(dateA);
    const numA = (a.items[0]?.invoice_number ?? a.items[0]?.property_expense_documents?.invoice_number ?? '').trim();
    const numB = (b.items[0]?.invoice_number ?? b.items[0]?.property_expense_documents?.invoice_number ?? '').trim();
    const c = numB.localeCompare(numA, undefined, { numeric: true });
    if (c !== 0) return c;
    return a.key.localeCompare(b.key);
  });
  return groups;
}

function pickRepresentativeDoc(items: PropertyExpenseItemWithDocument): PropertyExpenseItemWithDocument['property_expense_documents'] {
  const withDoc = items.find((i) => i.property_expense_documents?.storage_path);
  return withDoc?.property_expense_documents ?? items[0]?.property_expense_documents ?? null;
}

export function pickExpenseInvoiceDocumentTarget(
  items: PropertyExpenseItemWithDocument[]
): { storagePath: string; fileName: string } | null {
  const doc = pickRepresentativeDoc(items);
  if (!doc?.storage_path) return null;
  return { storagePath: doc.storage_path, fileName: doc.file_name || 'document' };
}
