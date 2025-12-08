import React from 'react';
import { X, Plus } from 'lucide-react';

interface ColumnCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onColumnCreated: () => void; // No parameters - creates empty column
}

const ColumnCreateModal: React.FC<ColumnCreateModalProps> = ({
  isOpen,
  onClose,
  onColumnCreated
}) => {
  if (!isOpen) return null;

  const handleCreate = () => {
    onColumnCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#111315]">
          <h2 className="text-lg font-semibold text-white">Створити колонку</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/10 rounded-full mb-4">
              <Plus className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-gray-400 text-sm">
              Створити нову порожню колонку?
              <br />
              <span className="text-xs text-gray-500">Працівника можна буде призначити пізніше</span>
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Створити колонку
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnCreateModal;

