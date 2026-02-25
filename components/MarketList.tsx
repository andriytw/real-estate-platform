import React from 'react';
import { MapPin, Home, Square, Bed } from 'lucide-react';
import type { Property } from '../types';
import { formatPropertyAddress } from '../utils/formatPropertyAddress';
import { getPropertyStats } from '../utils/propertyStats';

interface MarketListProps {
  properties: Property[];
  coverPhotoUrlByPropertyId?: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onListingClick: (property: Property) => void;
  distancesById: Record<string, number>;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  onClearFilters?: () => void;
}

export default function MarketList({
  properties,
  coverPhotoUrlByPropertyId = {},
  selectedId,
  onSelect,
  onListingClick,
  distancesById,
  setCardRef,
  onClearFilters,
}: MarketListProps) {
  if (properties.length === 0) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <div className="py-8 px-4 text-center">
          <p className="text-gray-500 text-sm">No listings match your filters.</p>
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-3 text-emerald-500 hover:text-emerald-400 hover:underline text-sm font-medium"
            >
              Clear filters/dates
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {properties.map((property) => {
        const coverUrl =
          coverPhotoUrlByPropertyId[property.id] ||
          property.image ||
          property.images?.[0] ||
          '';
        const { rooms, beds, area } = getPropertyStats(property);
        const price = property.price ?? 0;
        const location = formatPropertyAddress(property);

        return (
          <div
            key={property.id}
            ref={(el) => setCardRef(property.id, el)}
            onClick={() => onSelect(property.id)}
            className={`
              flex-none bg-[#1C1F24] border rounded-xl overflow-hidden transition-all cursor-pointer group
              ${selectedId === property.id ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-gray-800 hover:border-gray-600'}
              hover:-translate-y-0.5
            `}
          >
            <div className="h-44 overflow-hidden relative">
              <img
                src={coverUrl}
                alt={property.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute top-0 left-0 right-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" aria-hidden />
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-bold text-white border border-white/10">
                Recently
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-2 pt-6 pointer-events-none" aria-hidden>
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-semibold text-white text-sm truncate flex-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {property.title}
                  </h3>
                  <span className="text-emerald-400 font-bold text-sm shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    €{price}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
                    <Home className="w-2.5 h-2.5" />
                    {rooms} Rm
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
                    <Square className="w-2.5 h-2.5" />
                    {area} m²
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
                    <Bed className="w-2.5 h-2.5" />
                    {beds} Beds
                  </span>
                </div>
              </div>
            </div>
            <div className="p-2 flex items-center justify-between gap-2 min-h-0 border-t border-gray-800/80">
              <div className="min-w-0 flex-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0 text-gray-500" />
                <span className="text-xs text-gray-400 truncate">{location}</span>
              </div>
              {distancesById[property.id] != null && (
                <span className="text-[10px] text-emerald-400/90 shrink-0">
                  {distancesById[property.id].toFixed(1)} km
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onListingClick(property);
                }}
                className="text-xs font-medium text-emerald-500 hover:text-emerald-400 shrink-0 py-1 px-2"
              >
                Details
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
