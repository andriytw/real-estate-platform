import React, { useState, useRef, useCallback, useEffect } from 'react';
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

interface MarketMapProps {
  listings: ListingForMap[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
  searchPoint: { lat: number; lng: number; label: string } | null;
  onSearchPointSelect: (point: { lat: number; lng: number; label: string }) => void;
  mapRef: React.RefObject<mapboxgl.Map | null>;
}

export default function MarketMap({
  listings,
  selectedId,
  onSelectMarker,
  searchPoint,
  onSearchPointSelect,
  mapRef,
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
      {/* Search overlay */}
      <div className="absolute top-3 left-3 z-10 w-72">
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
