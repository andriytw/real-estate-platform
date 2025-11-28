import React from 'react';
import { ChevronDown } from 'lucide-react';

const FilterDropdown: React.FC<{ label: string; value: string; options: string[] }> = ({ label, value, options }) => (
  <div className="flex flex-col gap-1 min-w-[100px] flex-1">
    <label className="text-xs text-gray-400 font-medium ml-1">{label}</label>
    <div className="relative">
      <select className="w-full appearance-none bg-[#1C1F24] text-sm text-white border border-gray-700 hover:border-gray-600 rounded-lg py-2.5 px-3 pr-8 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer">
        <option>{value}</option>
        {options.map((opt, idx) => (
          <option key={idx} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  </div>
);

const FilterBar: React.FC = () => {
  return (
    <div className="bg-[#111315] px-6 py-4 border-b border-gray-800">
      <div className="flex flex-wrap lg:flex-nowrap items-end gap-3">
        <FilterDropdown label="City" value="Berlin" options={['Hamburg', 'Munich', 'Frankfurt']} />
        <FilterDropdown label="District" value="Mitte" options={['Charlottenburg', 'Kreuzberg', 'Pankow']} />
        <FilterDropdown label="Rooms" value="Any" options={['1+', '2+', '3+', '4+']} />
        <FilterDropdown label="Floor" value="Any" options={['Ground', '1', '2', '3', '4+']} />
        <FilterDropdown label="Elevator" value="Any" options={['Yes', 'No']} />
        <FilterDropdown label="Pets" value="Any" options={['Allowed', 'Not Allowed']} />
        <FilterDropdown label="Status" value="Available" options={['Reserved', 'Rented']} />
        
        <div className="flex-1 lg:flex-none min-w-[120px]">
          <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 px-4 rounded-lg transition-colors shadow-lg shadow-emerald-900/20">
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;