import React, { useState } from 'react';
import { X, Plus, Edit, Archive, ArchiveRestore } from 'lucide-react';
import type { PropertyExpenseCategoryRow } from '../services/propertyExpenseCategoryService';
import { propertyExpenseCategoryService } from '../services/propertyExpenseCategoryService';

interface ExpenseCategoriesModalProps {
  onClose: () => void;
  categories: PropertyExpenseCategoryRow[];
  onRefresh: () => Promise<void>;
}

export default function ExpenseCategoriesModal({ onClose, categories, onRefresh }: ExpenseCategoriesModalProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCategories = categories.filter((c) => c.is_active);
  const archivedCategories = categories.filter((c) => !c.is_active);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await propertyExpenseCategoryService.createCategory(name);
      setNewName('');
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }
    setSaving(true);
    setError(null);
    try {
      await propertyExpenseCategoryService.updateCategory(id, { name });
      setEditingId(null);
      setEditingName('');
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await propertyExpenseCategoryService.archiveCategory(id);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await propertyExpenseCategoryService.restoreCategory(id);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md bg-[#1C1F24] border border-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Категорії витрат</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 flex-1 overflow-auto">
          {error && (
            <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">{error}</div>
          )}
          <div className="flex gap-2 mb-4">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Нова категорія"
              className="flex-1 bg-[#16181D] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newName.trim()}
              className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Додати
            </button>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Активні</p>
            {activeCategories.length === 0 ? (
              <p className="text-xs text-gray-500">Немає активних категорій.</p>
            ) : (
              activeCategories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[#16181D] border border-gray-700/50"
                >
                  {editingId === c.id ? (
                    <>
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 bg-transparent border-b border-gray-600 text-sm text-white outline-none px-1"
                        autoFocus
                      />
                      <button onClick={() => handleRename(c.id)} disabled={saving} className="text-emerald-400 hover:text-emerald-300 text-xs">OK</button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-white text-xs">Скасувати</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-white">{c.name}</span>
                      <span className="text-[10px] text-gray-500">{c.code}</span>
                      <button onClick={() => { setEditingId(c.id); setEditingName(c.name); }} className="p-1 text-gray-400 hover:text-white" title="Перейменувати"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleArchive(c.id)} disabled={saving} className="p-1 text-gray-400 hover:text-amber-400" title="В архів"><Archive className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
          {archivedCategories.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">В архіві</p>
              {archivedCategories.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 py-2 px-3 rounded-lg bg-[#16181D]/50 border border-gray-700/30"
                >
                  <span className="flex-1 text-sm text-gray-500">{c.name}</span>
                  <button onClick={() => handleRestore(c.id)} disabled={saving} className="p-1 text-gray-400 hover:text-emerald-400" title="Відновити"><ArchiveRestore className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
