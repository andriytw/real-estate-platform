import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, ChevronDown, Check } from 'lucide-react';
import { Worker } from '../../types';
import { filterAssignableWorkers } from './assigneeUtils';

interface WorkerSelectDropdownProps {
  workers: Worker[];
  selectedWorkerId: string | null;
  onSelect: (workerId: string) => void;
  disabled?: boolean;
  columnId: string;
}

const WorkerSelectDropdown: React.FC<WorkerSelectDropdownProps> = ({
  workers,
  selectedWorkerId,
  onSelect,
  disabled = false,
  columnId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const assignable = useMemo(() => filterAssignableWorkers(workers), [workers]);
  const selectedWorker = assignable.find(w => w.id === selectedWorkerId);
  const leadership = assignable.filter(w => w.role === 'super_manager' || w.role === 'manager');
  const team = assignable.filter(w => w.role === 'worker');

  const handleSelect = (workerId: string) => {
    onSelect(workerId);
    setIsOpen(false);
  };

  const renderOption = (worker: Worker) => (
    <button
      key={worker.id}
      onClick={() => handleSelect(worker.id)}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
        selectedWorkerId === worker.id
          ? 'bg-blue-500/20 text-blue-400'
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <User className="w-4 h-4" />
        <span>{worker.name}</span>
        <span className="text-xs text-gray-500">({worker.department})</span>
      </div>
      {selectedWorkerId === worker.id && (
        <Check className="w-4 h-4 text-blue-400" />
      )}
    </button>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          disabled
            ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
            : selectedWorkerId
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
        }`}
        title={disabled ? 'Неможливо змінити: є завдання в колонці' : 'Виберіть працівника'}
      >
        <User className="w-4 h-4" />
        <span className="truncate max-w-[120px]">
          {selectedWorker ? selectedWorker.name : 'Виберіть працівника'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          {leadership.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Менеджери
              </div>
              {leadership.map(renderOption)}
            </div>
          )}

          {team.length > 0 && (
            <div className={`p-2 ${leadership.length > 0 ? 'border-t border-gray-700' : ''}`}>
              <div className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Працівники
              </div>
              {team.map(renderOption)}
            </div>
          )}

          {assignable.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Немає доступних працівників
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkerSelectDropdown;

