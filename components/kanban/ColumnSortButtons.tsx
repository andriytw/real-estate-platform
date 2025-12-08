import React from 'react';
import { Calendar, List, ArrowUp, ArrowDown } from 'lucide-react';

interface ColumnSortButtonsProps {
  sortBy: 'date' | 'type';
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: 'date' | 'type', order: 'asc' | 'desc') => void;
}

const ColumnSortButtons: React.FC<ColumnSortButtonsProps> = ({
  sortBy,
  sortOrder,
  onSortChange
}) => {
  const handleSortClick = (newSortBy: 'date' | 'type') => {
    if (sortBy === newSortBy) {
      // Toggle order if same sort option
      onSortChange(newSortBy, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new sort option with default order
      onSortChange(newSortBy, 'desc');
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
      <span className="text-xs text-gray-500 font-medium">Сортування:</span>
      
      {/* Sort by Date */}
      <button
        onClick={() => handleSortClick('date')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          sortBy === 'date'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-[#0D0F11] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-700'
        }`}
        title={`Сортувати за датою ${sortBy === 'date' ? (sortOrder === 'asc' ? '(зростання)' : '(спадання)') : ''}`}
      >
        <Calendar className="w-3.5 h-3.5" />
        <span>Дата</span>
        {sortBy === 'date' && (
          sortOrder === 'asc' ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        )}
      </button>

      {/* Sort by Type */}
      <button
        onClick={() => handleSortClick('type')}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          sortBy === 'type'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-[#0D0F11] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-700'
        }`}
        title={`Сортувати за типом ${sortBy === 'type' ? (sortOrder === 'asc' ? '(A-Z)' : '(Z-A)') : ''}`}
      >
        <List className="w-3.5 h-3.5" />
        <span>Тип</span>
        {sortBy === 'type' && (
          sortOrder === 'asc' ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        )}
      </button>
    </div>
  );
};

export default ColumnSortButtons;

