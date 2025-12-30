import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  DollarSign, 
  FileText, 
  AlertCircle, 
  Calendar,
  Clock,
  FileCheck,
  Receipt,
  Shield,
  Home,
  Building,
  TrendingUp,
  CreditCard,
  X,
  ChevronDown,
  Filter
} from 'lucide-react';
import { TaskType } from '../../types';

interface TaskTypeFiltersProps {
  selectedTypes: TaskType[];
  onToggleType: (type: TaskType) => void;
  onClearAll: () => void;
  availableTypes: TaskType[];
  variant?: 'buttons' | 'dropdown';
}

// Icon mapping for task types
const getTaskTypeIcon = (type: TaskType) => {
  const iconMap: Record<TaskType, React.ReactNode> = {
    'Putzen': <Sparkles className="w-4 h-4" />,
    'Einzug': <ArrowRight className="w-4 h-4" />,
    'Auszug': <ArrowLeft className="w-4 h-4" />,
    'Tax Payment': <DollarSign className="w-4 h-4" />,
    'Invoice Processing': <FileText className="w-4 h-4" />,
    'Reklamation': <AlertCircle className="w-4 h-4" />,
    'Arbeit nach plan': <Calendar className="w-4 h-4" />,
    'Zeit Abgabe von wohnung': <Clock className="w-4 h-4" />,
    'Zählerstand': <FileCheck className="w-4 h-4" />,
    'Payroll': <Receipt className="w-4 h-4" />,
    'Audit': <Shield className="w-4 h-4" />,
    'Monthly Closing': <Calendar className="w-4 h-4" />,
    'Rent Collection': <Home className="w-4 h-4" />,
    'Utility Payment': <Building className="w-4 h-4" />,
    'Insurance': <Shield className="w-4 h-4" />,
    'Mortgage Payment': <CreditCard className="w-4 h-4" />,
    'VAT Return': <TrendingUp className="w-4 h-4" />,
    'Financial Report': <FileText className="w-4 h-4" />,
    'Budget Review': <FileText className="w-4 h-4" />,
    'Asset Depreciation': <TrendingUp className="w-4 h-4" />,
    'Vendor Payment': <DollarSign className="w-4 h-4" />,
    'Bank Reconciliation': <FileCheck className="w-4 h-4" />
  };
  return iconMap[type] || <FileText className="w-4 h-4" />;
};

const TaskTypeFilters: React.FC<TaskTypeFiltersProps> = ({
  selectedTypes,
  onToggleType,
  onClearAll,
  availableTypes,
  variant = 'buttons'
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  if (availableTypes.length === 0) {
    return null;
  }

  // Dropdown variant
  if (variant === 'dropdown') {
    const displayText = selectedTypes.length === 0 
      ? 'Всі типи' 
      : selectedTypes.length === 1 
        ? selectedTypes[0]
        : `${selectedTypes.length} вибрано`;

    return (
      <div className="relative px-3 py-2 border-b border-gray-800" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
            selectedTypes.length > 0
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-[#0D0F11] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-700'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Filter className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{displayText}</span>
          </div>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isDropdownOpen && (
          <div className="absolute top-full left-3 right-3 mt-1 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
            {/* Clear all option */}
            <button
              onClick={() => {
                onClearAll();
                setIsDropdownOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-b border-gray-800 ${
                selectedTypes.length === 0
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              <X className="w-3.5 h-3.5" />
              <span>Всі типи</span>
            </button>

            {/* Task type options */}
            {availableTypes.map(type => {
              const isSelected = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => {
                    onToggleType(type);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {getTaskTypeIcon(type)}
                  </div>
                  <span className="flex-1 text-left truncate">{type}</span>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Buttons variant (default)
  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-gray-800">
      {/* "All" button */}
      <button
        onClick={onClearAll}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          selectedTypes.length === 0
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-[#0D0F11] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-700'
        }`}
        title="Показати всі типи"
      >
        <X className="w-3.5 h-3.5" />
        <span>Всі</span>
      </button>

      {/* Task type filter buttons */}
      {availableTypes.map(type => {
        const isSelected = selectedTypes.includes(type);
        return (
          <button
            key={type}
            onClick={() => onToggleType(type)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isSelected
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-[#0D0F11] text-gray-400 hover:bg-gray-800 hover:text-white border border-gray-700'
            }`}
            title={type}
          >
            {getTaskTypeIcon(type)}
            <span className="truncate max-w-[80px]">{type}</span>
          </button>
        );
      })}

      {/* Count badge if multiple selected */}
      {selectedTypes.length > 1 && (
        <div className="ml-auto px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-500/30">
          {selectedTypes.length} вибрано
        </div>
      )}
    </div>
  );
};

export default TaskTypeFilters;

