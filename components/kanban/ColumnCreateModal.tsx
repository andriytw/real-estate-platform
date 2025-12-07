import React, { useState, useEffect } from 'react';
import { X, User, Briefcase, AlertCircle } from 'lucide-react';
import { Worker } from '../../types';

interface ColumnCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onColumnCreated: (workerId: string, type: 'manager' | 'worker') => void;
  workers: Worker[];
  existingColumnIds: string[]; // IDs працівників, які вже мають колонки
}

const ColumnCreateModal: React.FC<ColumnCreateModalProps> = ({
  isOpen,
  onClose,
  onColumnCreated,
  workers,
  existingColumnIds
}) => {
  const [selectedType, setSelectedType] = useState<'manager' | 'worker'>('worker');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Фільтруємо працівників по типу
  const filteredWorkers = workers.filter(w => {
    if (selectedType === 'manager') {
      return w.role === 'manager';
    } else {
      return w.role === 'worker';
    }
  });

  // Показуємо всіх працівників (колонки не створюються автоматично)
  // Але фільтруємо тих, хто вже має колонку
  const availableWorkers = filteredWorkers.filter(w => !existingColumnIds.includes(w.id));

  // Debug logging (only when modal opens)
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 ColumnCreateModal Debug:');
      console.log('  - selectedType:', selectedType);
      console.log('  - filteredWorkers count:', filteredWorkers.length);
      console.log('  - existingColumnIds length:', existingColumnIds.length);
      console.log('  - availableWorkers count:', availableWorkers.length);
    }
  }, [isOpen, selectedType]); // Only depend on isOpen and selectedType, not on arrays

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedWorkerId) {
      setError('Будь ласка, виберіть працівника або менеджера');
      return;
    }

    // Перевірка, чи вже є колонка
    if (existingColumnIds.includes(selectedWorkerId)) {
      setError('Цей працівник вже має колонку на дошці');
      return;
    }

    onColumnCreated(selectedWorkerId, selectedType);
    // Reset form
    setSelectedWorkerId('');
    setSelectedType('worker');
    onClose();
  };

  const handleClose = () => {
    setSelectedWorkerId('');
    setSelectedType('worker');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#111315]">
          <h2 className="text-lg font-semibold text-white">Додати колонку</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Тип колонки</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#0D0F11] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('manager');
                    setSelectedWorkerId(''); // Reset selection when type changes
                  }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedType === 'manager' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Briefcase className="w-4 h-4" />
                  Manager
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('worker');
                    setSelectedWorkerId(''); // Reset selection when type changes
                  }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    selectedType === 'worker' 
                      ? 'bg-emerald-600 text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <User className="w-4 h-4" />
                  Worker
                </button>
              </div>
            </div>

            {/* Worker Selector */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Виберіть {selectedType === 'manager' ? 'менеджера' : 'працівника'}
              </label>
              {filteredWorkers.length === 0 ? (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                  Немає {selectedType === 'manager' ? 'менеджерів' : 'працівників'} в системі
                </div>
              ) : availableWorkers.length === 0 ? (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                  Всі {selectedType === 'manager' ? 'менеджери' : 'працівники'} вже мають колонки на дошці
                  <br />
                  <span className="text-xs text-yellow-500/70 mt-1 block">
                    (Створено: {existingColumnIds.length} колонок)
                  </span>
                </div>
              ) : (
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">-- Виберіть {selectedType === 'manager' ? 'менеджера' : 'працівника'} --</option>
                  {availableWorkers.map(worker => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name} ({worker.department})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={availableWorkers.length === 0 || !selectedWorkerId}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Додати колонку
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ColumnCreateModal;

