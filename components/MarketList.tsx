import React from 'react';
import { MapPin, Home } from 'lucide-react';
import type { Property } from '../types';
import { formatPropertyAddress } from '../utils/formatPropertyAddress';

interface MarketListProps {
  properties: Property[];
  coverPhotoUrlByPropertyId?: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onListingClick: (property: Property) => void;
  distancesById: Record<string, number>;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
}

export default function MarketList({
  properties,
  coverPhotoUrlByPropertyId = {},
  selectedId,
  onSelect,
  onListingClick,
  distancesById,
  setCardRef,
}: MarketListProps) {
  return (
    <div className="flex flex-col gap-4 pb-6">
      {properties.map((property) => {
        const coverUrl =
          coverPhotoUrlByPropertyId[property.id] ||
          property.image ||
          property.images?.[0] ||
          '';
        const beds = property.details?.beds ?? 0;
        const rooms = property.rooms ?? 0;
        const area = property.area ?? 0;
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
            <div className="h-40 overflow-hidden relative">
              <img
                src={coverUrl}
                alt={property.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                Recently
              </div>
            </div>
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-white truncate flex-1 mr-2">{property.title}</h3>
                <span className="text-emerald-500 font-bold shrink-0">€{price}</span>
              </div>
              <div className="flex items-center gap-1 text-gray-400 text-xs mb-2">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{location}</span>
              </div>
              {distancesById[property.id] != null && (
                <p className="text-[11px] text-emerald-400/90 mb-2">
                  {distancesById[property.id].toFixed(1)} km from searched address
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-300 mb-4 bg-[#111315] p-2 rounded border border-gray-800">
                <div className="flex items-center gap-1">
                  <Home className="w-3 h-3 text-gray-500" />
                  {rooms} Rm
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-gray-600" />
                  {area} m²
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-gray-600" />
                  {beds} Beds
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                <span className="text-xs text-gray-500">
                  Posted by <span className="text-gray-300">Property Owner</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onListingClick(property);
                  }}
                  className="text-xs font-bold text-emerald-500 hover:text-emerald-400"
                >
                  Details
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
