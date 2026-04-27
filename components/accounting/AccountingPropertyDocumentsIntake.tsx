import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Trash2,
  Upload,
  Save,
  Eye,
  Loader2,
  Scan,
  Archive,
  CheckCircle,
  PanelTop,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Property } from '../../types';
import {
  accountingPropertyDocumentsService,
  type AccountingPropertyDocumentWithCategory,
  type AccountingPropertyDocumentLineRow,
  type DocumentAuditEntry,
  type DocumentListFilters,
  type OcrStatus,
  type ProcessingStatus,
} from '../../services/accountingPropertyDocumentsService';
import {
  accountingDocumentCategoryService,
  type AccountingDocumentCategoryRow,
} from '../../services/accountingDocumentCategoryService';
import type { AccountingDocumentDirection } from '../../services/accountingDocumentCategoryService';

type Props = {
  properties: Property[];
  onDataChanged?: () => void;
};

function propertyLabel(p: Property): string {
  const address = (p.address || '').trim();
  const code = (p.title || '').trim();
  if (address && code) return `${address} — ${code}`;
  if (code) return code;
  if (address) return address;
  return p.id.slice(0, 8) + '…';
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

function toNum(s: string): number | null {
  if (!s.trim()) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function statusClass(s: ProcessingStatus): string {
  if (s === 'ready') return 'text-emerald-400';
  if (s === 'reviewed') return 'text-sky-400';
  if (s === 'archived') return 'text-gray-500';
  return 'text-amber-400/90';
}

export function AccountingPropertyDocumentsIntake({ properties, onDataChanged }: Props) {
  const [rows, setRows] = useState<AccountingPropertyDocumentWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [ocrRunningId, setOcrRunningId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryRows, setCategoryRows] = useState<AccountingDocumentCategoryRow[]>([]);
  // Filters/search
  const [statusFilter, setStatusFilter] = useState<ProcessingStatus | 'all'>('all');
  const [directionFilter, setDirectionFilter] = useState<AccountingDocumentDirection | 'all'>('all');
  const [propertyFilter, setPropertyFilter] = useState<string | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [ocrStatusFilter, setOcrStatusFilter] = useState<OcrStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [invoiceDateFrom, setInvoiceDateFrom] = useState<string>('');
  const [invoiceDateTo, setInvoiceDateTo] = useState<string>('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lineByDoc, setLineByDoc] = useState<Record<string, AccountingPropertyDocumentLineRow[]>>({});
  const [auditByDoc, setAuditByDoc] = useState<Record<string, DocumentAuditEntry[]>>({});
  const [linesLoading, setLinesLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ url: string; mime: string | null; title: string } | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const filters: DocumentListFilters = {
    processing_status: statusFilter,
    direction: directionFilter,
    property_id: propertyFilter,
    category_id: categoryFilter,
    ocr_status: ocrStatusFilter,
    q: debouncedQ,
    invoice_date_from: invoiceDateFrom || null,
    invoice_date_to: invoiceDateTo || null,
  };

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const cats = await accountingDocumentCategoryService.ensureDefaults();
      setCategoryRows(cats);
      const list = await accountingPropertyDocumentsService.listFiltered(filters);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    directionFilter,
    propertyFilter,
    categoryFilter,
    ocrStatusFilter,
    debouncedQ,
    invoiceDateFrom,
    invoiceDateTo,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep selection stable but only across currently visible rows.
  useEffect(() => {
    const visible = new Set(rows.map((r) => r.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [rows]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!lineByDoc[id]) {
      setLinesLoading(id);
      try {
        const [lines, audit] = await Promise.all([
          accountingPropertyDocumentsService.listLines(id),
          accountingPropertyDocumentsService.listAudit(id),
        ]);
        setLineByDoc((p) => ({ ...p, [id]: lines }));
        setAuditByDoc((p) => ({ ...p, [id]: audit }));
      } catch {
        setLineByDoc((p) => ({ ...p, [id]: [] }));
        setAuditByDoc((p) => ({ ...p, [id]: [] }));
      } finally {
        setLinesLoading(null);
      }
    }
  };

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError(null);
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      try {
        const created = await accountingPropertyDocumentsService.createDraftFromFile(f);
        setRows((prev) => [created, ...prev]);
        onDataChanged?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      }
    }
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    void processFiles(e.dataTransfer.files);
  };

  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
  };

  const openPreview = async (row: AccountingPropertyDocumentWithCategory) => {
    try {
      const url = await accountingPropertyDocumentsService.urlForRow(row);
      setPreview({ url, mime: row.mime, title: row.file_name || 'Document' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Open failed');
    }
  };

  const viewDocNewTab = async (row: AccountingPropertyDocumentWithCategory) => {
    try {
      const url = await accountingPropertyDocumentsService.urlForRow(row);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Open failed');
    }
  };

  const saveRow = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setSavingId(id);
    setError(null);
    try {
      const updated = await accountingPropertyDocumentsService.update(id, {
        property_id: row.property_id,
        direction: row.direction,
        category_id: row.category_id,
        document_type: row.document_type,
        counterparty_name: row.counterparty_name,
        invoice_no: row.invoice_no,
        invoice_date: row.invoice_date,
        due_date: row.due_date,
        amount_total: row.amount_total,
        currency: row.currency,
        notes: row.notes,
      });
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const runOcr = async (id: string) => {
    setOcrRunningId(id);
    setError(null);
    try {
      const updated = await accountingPropertyDocumentsService.runOcr(id);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setLineByDoc((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR failed');
      void load();
    } finally {
      setOcrRunningId(null);
    }
  };

  const markReviewed = async (id: string) => {
    setSavingId(id);
    try {
      const updated = await accountingPropertyDocumentsService.setProcessingStatus(id, 'reviewed');
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const markArchived = async (id: string) => {
    setSavingId(id);
    try {
      const updated = await accountingPropertyDocumentsService.setProcessingStatus(id, 'archived');
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    } finally {
      setSavingId(null);
    }
  };

  const batchArchive = async () => {
    if (selected.size === 0) return;
    await batchApply('batch_archive', batchArchiveSelected, { confirmText: `Archive ${selected.size} document(s)?` });
    setSelected(new Set());
  };

  const onReplacePicked: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !replaceTargetId) {
      setReplaceTargetId(null);
      return;
    }
    setSavingId(replaceTargetId);
    setError(null);
    try {
      const updated = await accountingPropertyDocumentsService.replaceFile(replaceTargetId, file);
      setRows((prev) => prev.map((r) => (r.id === replaceTargetId ? updated : r)));
      setLineByDoc((p) => {
        const n = { ...p };
        delete n[replaceTargetId];
        return n;
      });
      onDataChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setSavingId(null);
      setReplaceTargetId(null);
    }
  };

  const deleteRow = async (row: AccountingPropertyDocumentWithCategory) => {
    if (!confirm('Delete this document?')) return;
    setError(null);
    try {
      await accountingPropertyDocumentsService.deleteDocument(
        row.id,
        row.storage_path,
        row.storage_bucket ?? accountingPropertyDocumentsService.BUCKET
      );
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(row.id);
        return n;
      });
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const patchLocal = (id: string, patch: Partial<AccountingPropertyDocumentWithCategory>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch } as AccountingPropertyDocumentWithCategory;
        if (patch.direction != null && patch.direction !== r.direction) {
          next.category_id = null;
        }
        return next;
      })
    );
  };

  const categoriesFor = (d: AccountingDocumentDirection) =>
    categoryRows.filter((c) => c.direction === d && c.is_active);

  const categoryOptions = (() => {
    if (directionFilter === 'expense' || directionFilter === 'income') return categoriesFor(directionFilter);
    return categoryRows.filter((c) => c.is_active);
  })();

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const batchApply = async (
    label: string,
    fn: () => Promise<void>,
    opts?: { confirmText?: string; refreshAfter?: boolean }
  ) => {
    const confirmText = opts?.confirmText;
    if (confirmText && !confirm(confirmText)) return;
    setBatchBusy(label);
    setError(null);
    try {
      await fn();
      if (opts?.refreshAfter !== false) {
        await load();
      }
      onDataChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBatchBusy(null);
    }
  };

  const [batchPropertyId, setBatchPropertyId] = useState<string>(''); // empty means no-op
  const [batchDirection, setBatchDirection] = useState<AccountingDocumentDirection | ''>('');
  const [batchCategoryId, setBatchCategoryId] = useState<string>(''); // empty means no-op

  const batchCategories = (() => {
    const d: AccountingDocumentDirection =
      batchDirection || (directionFilter === 'expense' || directionFilter === 'income' ? directionFilter : 'expense');
    return categoriesFor(d);
  })();

  const batchAssignProperty = async () => {
    if (!batchPropertyId) return;
    await accountingPropertyDocumentsService.batchUpdate([...selected], { property_id: batchPropertyId });
  };
  const batchAssignDirection = async () => {
    if (!batchDirection) return;
    await accountingPropertyDocumentsService.batchUpdate([...selected], { direction: batchDirection, category_id: null });
  };
  const batchAssignCategory = async () => {
    if (!batchCategoryId) return;
    await accountingPropertyDocumentsService.batchUpdate([...selected], { category_id: batchCategoryId });
  };

  const batchOcr = async () => {
    const ids = [...selected];
    for (const id of ids) {
      setBatchBusy(`ocr:${id}`);
      try {
        await accountingPropertyDocumentsService.runOcr(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'OCR failed');
      }
    }
  };

  const batchArchiveSelected = async () => {
    await accountingPropertyDocumentsService.batchSetArchived([...selected]);
  };

  const batchDeleteSelected = async () => {
    await accountingPropertyDocumentsService.batchDelete(
      selectedRows.map((r) => ({
        id: r.id,
        storage_path: r.storage_path,
        storage_bucket: r.storage_bucket ?? accountingPropertyDocumentsService.BUCKET,
      }))
    );
  };

  return (
    <div className="p-6 md:p-8 bg-[#0D1117] text-white min-h-0">
      <h2 className="text-2xl font-bold mb-1">Property accounting (intake)</h2>
      <p className="text-sm text-gray-500 mb-4 max-w-2xl">
        Upload files (one row each). Set direction, property, and category, then Save. <span className="text-emerald-400">ready</span> when all three are set. Use
        OCR to fill header and lines; mark reviewed or archive when done. Migrated legacy files use the property-expense-docs bucket.
      </p>
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Status</label>
            <select
              className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProcessingStatus | 'all')}
            >
              <option value="all">All</option>
              <option value="draft">draft</option>
              <option value="ready">ready</option>
              <option value="reviewed">reviewed</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Direction</label>
            <select
              className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm"
              value={directionFilter}
              onChange={(e) => {
                const v = e.target.value as AccountingDocumentDirection | 'all';
                setDirectionFilter(v);
                setCategoryFilter('all');
              }}
            >
              <option value="all">All</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Property</label>
            <select
              className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm min-w-[200px]"
              value={propertyFilter}
              onChange={(e) => setPropertyFilter((e.target.value || 'all') as string | 'all')}
            >
              <option value="all">All</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {propertyLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Category</label>
            <select
              className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm min-w-[180px]"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter((e.target.value || 'all') as string | 'all')}
            >
              <option value="all">All</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">OCR</label>
            <select
              className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm"
              value={ocrStatusFilter}
              onChange={(e) => setOcrStatusFilter(e.target.value as OcrStatus | 'all')}
            >
              <option value="all">All</option>
              <option value="idle">idle</option>
              <option value="processing">processing</option>
              <option value="ok">ok</option>
              <option value="failed">failed</option>
              <option value="pending">pending</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Search</label>
            <input
              className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm min-w-[240px]"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Counterparty / invoice # / file…"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-gray-500">Invoice date</label>
            <div className="flex gap-2">
              <input
                type="date"
                className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm"
                value={invoiceDateFrom}
                onChange={(e) => setInvoiceDateFrom(e.target.value)}
              />
              <input
                type="date"
                className="bg-[#111315] border border-gray-700 rounded-lg px-2 py-1.5 text-sm"
                value={invoiceDateTo}
                onChange={(e) => setInvoiceDateTo(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {selected.size > 0 && (
          <div className="p-3 rounded-lg border border-gray-700 bg-[#111315] flex flex-wrap items-end gap-3">
            <div className="text-xs text-gray-400">
              Selected: <span className="text-white font-semibold">{selected.size}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Batch property</label>
              <select
                className="bg-[#0D1117] border border-gray-700 rounded-lg px-2 py-1.5 text-sm min-w-[200px]"
                value={batchPropertyId}
                onChange={(e) => setBatchPropertyId(e.target.value)}
              >
                <option value="">—</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {propertyLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!batchPropertyId || !!batchBusy}
              onClick={() => void batchApply('batch_property', batchAssignProperty, { refreshAfter: true })}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
            >
              Apply
            </button>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Batch direction</label>
              <select
                className="bg-[#0D1117] border border-gray-700 rounded-lg px-2 py-1.5 text-sm"
                value={batchDirection}
                onChange={(e) => {
                  setBatchDirection(e.target.value as AccountingDocumentDirection | '');
                  setBatchCategoryId('');
                }}
              >
                <option value="">—</option>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!batchDirection || !!batchBusy}
              onClick={() =>
                void batchApply('batch_direction', batchAssignDirection, {
                  confirmText: 'Change direction for selected documents? Categories will be cleared.',
                  refreshAfter: true,
                })
              }
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
            >
              Apply
            </button>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Batch category</label>
              <select
                className="bg-[#0D1117] border border-gray-700 rounded-lg px-2 py-1.5 text-sm min-w-[200px]"
                value={batchCategoryId}
                onChange={(e) => setBatchCategoryId(e.target.value)}
              >
                <option value="">—</option>
                {batchCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!batchCategoryId || !!batchBusy}
              onClick={() => void batchApply('batch_category', batchAssignCategory, { refreshAfter: true })}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
            >
              Apply
            </button>

            <div className="flex-1" />

            <button
              type="button"
              disabled={!!batchBusy}
              onClick={() => void batchApply('batch_ocr', batchOcr, { refreshAfter: true })}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-700/70 hover:bg-violet-700 text-sm disabled:opacity-50"
            >
              <Scan className="w-4 h-4" /> Batch OCR
            </button>
            <button
              type="button"
              disabled={!!batchBusy}
              onClick={() =>
                void batchApply('batch_archive', batchArchiveSelected, {
                  confirmText: `Archive ${selected.size} document(s)?`,
                  refreshAfter: true,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
            >
              <Archive className="w-4 h-4" /> Archive
            </button>
            <button
              type="button"
              disabled={!!batchBusy}
              onClick={() =>
                void batchApply('batch_delete', batchDeleteSelected, {
                  confirmText: `Delete ${selected.size} document(s)? This cannot be undone.`,
                  refreshAfter: true,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-700/70 hover:bg-red-700 text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/30">{error}</div>
      )}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="mb-6 border-2 border-dashed border-gray-600 rounded-xl p-8 text-center text-gray-400 hover:border-gray-500 bg-[#1C1F24] transition-colors"
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500" />
        <p className="text-sm mb-2">Drop files here, or</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
        >
          Choose files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          multiple
          onChange={(e) => {
            void processFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input ref={replaceInputRef} type="file" className="hidden" accept="application/pdf,image/*" onChange={onReplacePicked} />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[1200px]">
            <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
              <tr>
                <th className="p-2 w-8">
                  <span className="sr-only">Select</span>
                </th>
                <th className="p-2 w-8">
                  <span className="sr-only">Expand</span>
                </th>
                <th className="p-3">File</th>
                <th className="p-3">Workflow</th>
                <th className="p-3">OCR</th>
                <th className="p-3">Direction</th>
                <th className="p-3">Property</th>
                <th className="p-3">Category</th>
                <th className="p-3">Counterparty</th>
                <th className="p-3">Details</th>
                <th className="p-3">Notes</th>
                <th className="p-3 w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-gray-500">
                    No documents in this filter. Upload files above.
                  </td>
                </tr>
              ) : (
                rows.flatMap((row) => {
                  const exp = expandedId === row.id;
                  const lines = lineByDoc[row.id];
                  const audit = auditByDoc[row.id];
                  const mainRow = (
                    <tr key={row.id} className="hover:bg-[#16181D] align-top">
                      <td className="p-2 pl-2">
                        {row.processing_status !== 'archived' && (
                          <input
                            type="checkbox"
                            className="rounded border-gray-600"
                            checked={selected.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            title="Select for batch archive"
                          />
                        )}
                      </td>
                      <td className="p-1">
                        <button
                          type="button"
                          onClick={() => void toggleExpand(row.id)}
                          className="p-1 text-gray-500 hover:text-white"
                          title="Line items & audit"
                        >
                          {exp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="p-2 text-gray-300 max-w-[160px]">
                        <div className="truncate" title={row.file_name || ''}>
                          {row.file_name || '—'}
                        </div>
                      </td>
                      <td className="p-2">
                        <span className={`text-xs font-medium ${statusClass(row.processing_status)}`}>{row.processing_status}</span>
                      </td>
                      <td className="p-2">
                        <div className="text-[10px] text-gray-500 mb-0.5">{row.ocr_status ?? 'idle'}</div>
                        <button
                          type="button"
                          disabled={ocrRunningId === row.id}
                          onClick={() => void runOcr(row.id)}
                          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50"
                        >
                          {ocrRunningId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scan className="w-3.5 h-3.5" />}{' '}
                          Run OCR
                        </button>
                        {row.ocr_error && <div className="text-[10px] text-red-400/80 mt-1 max-w-[120px] truncate" title={row.ocr_error}>{row.ocr_error}</div>}
                      </td>
                      <td className="p-2">
                        <select
                          className="w-[100px] bg-[#111315] border border-gray-700 rounded px-1 py-1 text-xs"
                          value={row.direction}
                          onChange={(e) =>
                            patchLocal(row.id, {
                              direction: e.target.value as AccountingDocumentDirection,
                              category_id: null,
                            })
                          }
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          className="min-w-[120px] max-w-[200px] bg-[#111315] border border-gray-700 rounded px-1 py-1 text-xs"
                          value={row.property_id || ''}
                          onChange={(e) => patchLocal(row.id, { property_id: e.target.value || null })}
                        >
                          <option value="">—</option>
                          {properties.map((p) => (
                            <option key={p.id} value={p.id}>
                              {propertyLabel(p)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <select
                          className="min-w-[100px] max-w-[180px] bg-[#111315] border border-gray-700 rounded px-1 py-1 text-xs"
                          value={row.category_id || ''}
                          onChange={(e) => patchLocal(row.id, { category_id: e.target.value || null })}
                        >
                          <option value="">—</option>
                          {categoriesFor(row.direction).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          className="w-[120px] bg-[#111315] border border-gray-700 rounded px-1 py-1 text-xs"
                          value={row.counterparty_name || ''}
                          onChange={(e) => patchLocal(row.id, { counterparty_name: emptyToNull(e.target.value) })}
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2 space-y-1">
                        <input
                          className="w-full bg-[#111315] border border-gray-700 rounded px-1 py-0.5 text-xs font-mono"
                          value={row.invoice_no || ''}
                          onChange={(e) => patchLocal(row.id, { invoice_no: emptyToNull(e.target.value) })}
                          placeholder="Invoice #"
                        />
                        <div className="flex gap-1 flex-wrap">
                          <input
                            type="date"
                            className="bg-[#111315] border border-gray-700 rounded px-1 py-0.5 text-xs"
                            value={row.invoice_date || ''}
                            onChange={(e) => patchLocal(row.id, { invoice_date: e.target.value || null })}
                          />
                          <input
                            type="date"
                            className="bg-[#111315] border border-gray-700 rounded px-1 py-0.5 text-xs"
                            value={row.due_date || ''}
                            onChange={(e) => patchLocal(row.id, { due_date: e.target.value || null })}
                          />
                        </div>
                        <div className="flex gap-1">
                          <input
                            className="w-20 bg-[#111315] border border-gray-700 rounded px-1 py-0.5 text-xs"
                            value={row.amount_total != null ? String(row.amount_total) : ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v.trim()) {
                                patchLocal(row.id, { amount_total: null });
                                return;
                              }
                              const n = toNum(v);
                              patchLocal(row.id, { amount_total: n });
                            }}
                            placeholder="Amt"
                          />
                          <input
                            className="w-12 bg-[#111315] border border-gray-700 rounded px-1 py-0.5 text-xs"
                            value={row.currency}
                            onChange={(e) => patchLocal(row.id, { currency: e.target.value || 'EUR' })}
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          className="w-[100px] bg-[#111315] border border-gray-700 rounded px-1 py-1 text-xs"
                          value={row.notes || ''}
                          onChange={(e) => patchLocal(row.id, { notes: emptyToNull(e.target.value) })}
                          placeholder="—"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => void openPreview(row)}
                            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            <PanelTop className="w-3.5 h-3.5" /> Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => void viewDocNewTab(row)}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                          >
                            <Eye className="w-3.5 h-3.5" /> New tab
                          </button>
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            onClick={() => {
                              setReplaceTargetId(row.id);
                              replaceInputRef.current?.click();
                            }}
                            className="flex items-center gap-1 text-xs text-amber-400/90 hover:text-amber-300 disabled:opacity-50"
                          >
                            Replace file
                          </button>
                          <button
                            type="button"
                            disabled={savingId === row.id || row.processing_status !== 'ready'}
                            onClick={() => void markReviewed(row.id)}
                            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Reviewed
                          </button>
                          <button
                            type="button"
                            disabled={savingId === row.id || row.processing_status === 'archived'}
                            onClick={() => void markArchived(row.id)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 disabled:opacity-50"
                          >
                            <Archive className="w-3.5 h-3.5" /> Archive
                          </button>
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            onClick={() => void saveRow(row.id)}
                            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                          >
                            {savingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}{' '}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteRow(row)}
                            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                  if (!exp) return [mainRow];
                  const detailRow = (
                    <tr key={`${row.id}-detail`} className="bg-[#0a0c0f]">
                      <td colSpan={12} className="p-3 pl-8 border-b border-gray-800">
                        {linesLoading === row.id ? (
                          <div className="text-xs text-gray-500 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Line items</div>
                              {lines && lines.length > 0 ? (
                                <table className="w-full text-xs border border-gray-800 rounded">
                                  <thead className="bg-[#1C1F24] text-gray-400">
                                    <tr>
                                      <th className="p-1.5 text-left">Description</th>
                                      <th className="p-1.5 text-right">Qty</th>
                                      <th className="p-1.5 text-right">Unit</th>
                                      <th className="p-1.5 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((l) => (
                                      <tr key={l.id} className="border-t border-gray-800">
                                        <td className="p-1.5 text-gray-300">{l.description || '—'}</td>
                                        <td className="p-1.5 text-right text-gray-400 tabular-nums">{l.quantity ?? '—'}</td>
                                        <td className="p-1.5 text-right text-gray-400 tabular-nums">{l.unit_price ?? '—'}</td>
                                        <td className="p-1.5 text-right text-white font-mono tabular-nums">
                                          {l.line_total != null ? l.line_total : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-xs text-gray-500">No line items. Run OCR or add manually in a later version.</p>
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] uppercase text-gray-500 mb-1">Audit (latest)</div>
                              {audit && audit.length > 0 ? (
                                <ul className="text-xs text-gray-400 space-y-1 font-mono">
                                  {audit.map((a) => (
                                    <li key={a.id}>
                                      <span className="text-gray-500">{a.created_at.slice(0, 19)}</span> {a.action}
                                      {a.detail ? <span className="text-gray-600"> {JSON.stringify(a.detail)}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-gray-500">No audit entries yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                  return [mainRow, detailRow];
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#16181D] border border-gray-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-3 border-b border-gray-800">
              <h3 className="text-sm font-medium text-white truncate pr-2">{preview.title}</h3>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-gray-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-[200px] overflow-auto p-2 bg-[#0D1117]">
              {preview.mime?.includes('pdf') ? (
                <iframe title="preview" src={preview.url} className="w-full h-[min(70vh,600px)] rounded border border-gray-800" />
              ) : preview.mime?.startsWith('image/') ? (
                <img src={preview.url} alt="" className="max-w-full max-h-[70vh] mx-auto" />
              ) : (
                <iframe title="preview" src={preview.url} className="w-full h-[min(70vh,600px)] rounded border border-gray-800" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
