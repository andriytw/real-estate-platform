import React, { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Property } from '../types';
import { AMENITY_GROUPS } from '../utils/amenityGroups';

interface ApartmentDataSectionProps {
  property: Property;
}

export default function ApartmentDataSection({ property }: ApartmentDataSectionProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // property.amenities: normalized Record<string, boolean> from full fetch (loadPropertyFull)
  const amenities = property.amenities ?? {};

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  return (
    <div className="mb-8">
      <h3 className="text-base font-bold text-white mb-3">Ausstattung</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AMENITY_GROUPS.map(({ groupLabel, keys }, groupIndex) => {
          const groupKey = `ausstattung-g-${groupIndex}`;
          const isOpen = !!openGroups[groupKey];
          const selectedCount = keys.filter((k) => !!amenities[k]).length;
          return (
            <div key={groupKey} className="bg-[#1C1F24] border border-white/10 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className="w-full flex items-center justify-between gap-2 min-h-[48px] px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-xs font-semibold text-gray-400 truncate">{groupLabel}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {selectedCount}/{keys.length}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-white/10 p-3 space-y-1.5">
                  {keys.map((key) => {
                    const checked = !!amenities[key];
                    return (
                      <div key={key} className="flex items-center gap-2 min-h-[28px]">
                        {checked ? (
                          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <span className="w-4 h-4 shrink-0 text-gray-500 text-center leading-4 text-sm">—</span>
                        )}
                        <span className="text-sm text-white truncate">{key}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
