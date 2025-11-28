import React from 'react';
import { ChevronDown } from 'lucide-react';
import { FilterState } from '../types';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

const FilterDropdown: React.FC<{ 
  label: string; 
  value: string; 
  options: string[]; 
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1 min-w-[100px] flex-1">
    <label className="text-xs text-gray-400 font-medium ml-1">{label}</label>
    <div className="relative">
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-[#1C1F24] text-sm text-white border border-gray-700 hover:border-gray-600 rounded-lg py-2.5 px-3 pr-8 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
      >
        {options.map((opt, idx) => (
          <option key={idx} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  </div>
);

const FilterBar: React.FC<FilterBarProps> = ({ filters, onFilterChange }) => {
  const handleFilterChange = (field: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const handleReset = () => {
    onFilterChange({
      city: 'Any',
      district: 'Any',
      rooms: 'Any',
      floor: 'Any',
      elevator: 'Any',
      pets: 'Any',
      status: 'Any'
    });
  };

  return (
    <div className="bg-[#111315] px-6 py-4 border-b border-gray-800">
      <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
        <FilterDropdown 
          label="City" 
          value={filters.city} 
          options={['Any', 'Berlin', 'Hamburg', 'Munich', 'Frankfurt', 'Lviv', 'Kyiv', 'Warsaw', 'Krakow', 'Odesa', 'Dnipro']}
          onChange={(val) => handleFilterChange('city', val)}
        />
        <FilterDropdown 
          label="District" 
          value={filters.district} 
          options={['Any', 'Mitte', 'Charlottenburg', 'Kreuzberg', 'Pankow', 'Zaliznychnyi', 'Podil', 'Wola', 'Old Town', 'Kyivskyi', 'Central', 'Halytskyi']}
          onChange={(val) => handleFilterChange('district', val)}
        />
        <FilterDropdown 
          label="Rooms" 
          value={filters.rooms} 
          options={['Any', '1+', '2+', '3+', '4+']}
          onChange={(val) => handleFilterChange('rooms', val)}
        />
        <FilterDropdown 
          label="Floor" 
          value={filters.floor} 
          options={['Any', 'Ground', '1', '2', '3', '4+']}
          onChange={(val) => handleFilterChange('floor', val)}
        />
        <FilterDropdown 
          label="Elevator" 
          value={filters.elevator} 
          options={['Any', 'Yes', 'No']}
          onChange={(val) => handleFilterChange('elevator', val)}
        />
        <FilterDropdown 
          label="Pets" 
          value={filters.pets} 
          options={['Any', 'Allowed', 'Not Allowed']}
          onChange={(val) => handleFilterChange('pets', val)}
        />
        <FilterDropdown 
          label="Status" 
          value={filters.status} 
          options={['Any', 'Available', 'Reserved', 'Rented', 'Maintenance']}
          onChange={(val) => handleFilterChange('status', val)}
        />
        
        <div className="flex gap-2 flex-1 lg:flex-none min-w-[200px]">
          <button 
            onClick={handleReset}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold py-2.5 px-4 rounded-lg transition-colors"
          >
            Reset
          </button>
          <button 
            onClick={() => onFilterChange(filters)}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 px-4 rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;