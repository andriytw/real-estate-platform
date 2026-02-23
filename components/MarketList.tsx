import React from 'react';
import { MapPin, Home } from 'lucide-react';

export interface MarketListItem {
  id: string;
  title: string;
  location: string;
  price: number;
  rooms: number;
  area: number;
  image: string;
  postedBy: string;
  timeAgo: string;
  description?: string;
}

interface MarketListProps {
  listings: MarketListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onListingClick: (item: MarketListItem) => void;
  distancesById: Record<string, number>;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
}

export default function MarketList({
  listings,
  selectedId,
  onSelect,
  onListingClick,
  distancesById,
  setCardRef,
}: MarketListProps) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto min-h-0">
      {listings.map((item) => (
        <div
          key={item.id}
          ref={(el) => setCardRef(item.id, el)}
          onClick={() => onSelect(item.id)}
          className={`
            bg-[#1C1F24] border rounded-xl overflow-hidden transition-all cursor-pointer group
            ${selectedId === item.id ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-gray-800 hover:border-gray-600'}
            hover:-translate-y-0.5
          `}
        >
          <div className="h-40 overflow-hidden relative">
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
              {item.timeAgo}
            </div>
          </div>
          <div className="p-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-white truncate flex-1 mr-2">{item.title}</h3>
              <span className="text-emerald-500 font-bold shrink-0">€{item.price}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-400 text-xs mb-2">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{item.location}</span>
            </div>
            {distancesById[item.id] != null && (
              <p className="text-[11px] text-emerald-400/90 mb-2">
                {distancesById[item.id].toFixed(1)} km from searched address
              </p>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-300 mb-4 bg-[#111315] p-2 rounded border border-gray-800">
              <div className="flex items-center gap-1">
                <Home className="w-3 h-3 text-gray-500" />
                {item.rooms} Rm
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-gray-600" />
                {item.area} m²
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-800">
              <span className="text-xs text-gray-500">
                Posted by <span className="text-gray-300">{item.postedBy}</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onListingClick(item);
                }}
                className="text-xs font-bold text-emerald-500 hover:text-emerald-400"
              >
                Details
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
