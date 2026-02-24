import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MarketMap.css';
import { fetchSuggestions, type GeocodeSuggestion } from '../utils/mapboxGeocode';

const DEFAULT_CENTER: [number, number] = [13.405, 52.52];
const DEFAULT_ZOOM = 10;

export interface ListingForMap {
  id: string;
  lat: number;
  lng: number;
  title?: string;
}

const MapFilterDropdown: React.FC<{
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  className?: string;
}> = ({ value, options, onChange, className = '' }) => (
  <div className={`relative min-w-[120px] w-[140px] ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none bg-[#1C1F24] text-sm text-white border border-gray-700 hover:border-gray-600 rounded-lg py-2 px-3 pr-8 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
    >
      {options.map((opt, idx) => (
        <option key={idx} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
  </div>
);

interface MarketMapProps {
  listings: ListingForMap[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
  searchPoint: { lat: number; lng: number; label: string } | null;
  onSearchPointSelect: (point: { lat: number; lng: number; label: string }) => void;
  mapRef: React.RefObject<mapboxgl.Map | null>;
  priceFilter: string;
  roomFilter: string;
  bedsFilter: string;
  setPriceFilter: (v: string) => void;
  setRoomFilter: (v: string) => void;
  setBedsFilter: (v: 'any' | '1' | '2' | '3' | '4' | '5') => void;
  dateFrom: string | null;
  dateTo: string | null;
  setDateFrom: (v: string | null) => void;
  setDateTo: (v: string | null) => void;
  onClearDates: () => void;
  loadingAvailability: boolean;
}

export default function MarketMap({
  listings,
  selectedId,
  onSelectMarker,
  searchPoint,
  onSearchPointSelect,
  mapRef,
  priceFilter,
  roomFilter,
  bedsFilter,
  setPriceFilter,
  setRoomFilter,
  setBedsFilter,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  onClearDates,
  loadingAvailability,
}: MarketMapProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const token = import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQuery.trim().length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const res = await fetchSuggestions(searchQuery, 5);
      setSuggestions(res);
      setSuggestionsOpen(true);
      setSearchLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const handleSelectSuggestion = useCallback(
    (s: GeocodeSuggestion) => {
      onSearchPointSelect({ lat: s.lat, lng: s.lng, label: s.label });
      setSuggestionsOpen(false);
      setSearchQuery(s.label);
      const map = mapRef.current;
      if (map) {
        map.flyTo({ center: [s.lng, s.lat], zoom: 13, essential: true });
      }
    },
    [onSearchPointSelect, mapRef]
  );

  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);

  return (
    <div className="relative w-full h-full min-h-0 bg-[#0D1117]">
      {/* Overlay: wrap-safe row — Search address + Max Price, Min Rooms, Beds */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
        <div className="relative w-[260px] md:w-[320px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 200)}
            placeholder="Search address..."
            className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg py-2 px-3 pr-8 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          {!token && searchQuery.trim().length >= 3 && (
            <p className="mt-1 text-xs text-amber-400">Set NEXT_PUBLIC_MAPBOX_TOKEN to enable search.</p>
          )}
          {suggestionsOpen && suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full mt-1 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20">
              {suggestions.map((s, i) => (
                <li
                  key={i}
                  onMouseDown={() => handleSelectSuggestion(s)}
                  className="px-3 py-2 text-sm text-white hover:bg-[#23262b] cursor-pointer border-b border-gray-800 last:border-0"
                >
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          {searchLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">...</span>
          )}
        </div>
        <MapFilterDropdown
          value={priceFilter}
          onChange={setPriceFilter}
          options={[
            { label: 'Any Price', value: 'Any' },
            { label: 'Up to €500', value: '500' },
            { label: 'Up to €800', value: '800' },
            { label: 'Up to €1000', value: '1000' },
            { label: 'Up to €1500', value: '1500' },
          ]}
        />
        <MapFilterDropdown
          value={roomFilter}
          onChange={setRoomFilter}
          options={[
            { label: 'Any', value: 'Any' },
            { label: '1+ Rooms', value: '1' },
            { label: '2+ Rooms', value: '2' },
            { label: '3+ Rooms', value: '3' },
          ]}
        />
        <MapFilterDropdown
          value={bedsFilter}
          onChange={(v) => setBedsFilter(v as 'any' | '1' | '2' | '3' | '4' | '5')}
          options={[
            { label: 'Any Beds', value: 'any' },
            { label: '1+ Beds', value: '1' },
            { label: '2+ Beds', value: '2' },
            { label: '3+ Beds', value: '3' },
            { label: '4+ Beds', value: '4' },
            { label: '5+ Beds', value: '5' },
          ]}
        />
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom ?? ''}
            onChange={(e) => setDateFrom(e.target.value || null)}
            className="bg-[#1C1F24] border border-gray-700 rounded-lg py-2 px-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-0 max-w-[130px]"
            title="From (check-in)"
            aria-label="From (check-in)"
          />
          <span className="text-gray-500 text-xs">–</span>
          <input
            type="date"
            value={dateTo ?? ''}
            onChange={(e) => setDateTo(e.target.value || null)}
            className="bg-[#1C1F24] border border-gray-700 rounded-lg py-2 px-2 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-0 max-w-[130px]"
            title="To (check-out)"
            aria-label="To (check-out)"
          />
          {(dateFrom != null || dateTo != null) && (
            <button
              type="button"
              onClick={onClearDates}
              className="text-xs text-gray-400 hover:text-emerald-400 whitespace-nowrap"
            >
              Clear dates
            </button>
          )}
          {loadingAvailability && (
            <span className="text-[10px] text-gray-500">Checking…</span>
          )}
        </div>
      </div>

      <Map
        onLoad={({ target }) => {
          if (mapRef && typeof mapRef === 'object') (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = target;
        }}
        onUnload={() => {
          if (mapRef && typeof mapRef === 'object') (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = null;
        }}
        mapboxAccessToken={token || ''}
        initialViewState={{
          longitude: DEFAULT_CENTER[0],
          latitude: DEFAULT_CENTER[1],
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
      >
        {listings.map((item) => (
          <Marker
            key={item.id}
            longitude={item.lng}
            latitude={item.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectMarker(item.id);
            }}
            style={{ cursor: 'pointer' }}
          >
            <div
              className={
                selectedId === item.id
                  ? 'market-map-marker marker-selected w-6 h-6 rounded-full bg-emerald-500 border-2 border-white shadow-lg'
                  : 'market-map-marker w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow'
              }
            />
          </Marker>
        ))}
        {searchPoint && (
          <Marker
            longitude={searchPoint.lng}
            latitude={searchPoint.lat}
            anchor="bottom"
            style={{ pointerEvents: 'none' }}
          >
            <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
          </Marker>
        )}
      </Map>
    </div>
  );
}
