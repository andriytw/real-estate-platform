import React, { useState, useRef, useCallback, useMemo } from 'react';
import MarketList, { type MarketListItem } from './MarketList';
import MarketMap, { type ListingForMap } from './MarketMap';
import { haversineKm } from '../utils/haversine';
import type { Property } from '../types';

function validCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

interface MarketSplitViewProps {
  properties: Property[];
  filteredListings: MarketListItem[];
  loading: boolean;
  error: string | null;
  onListingClick: (item: MarketListItem) => void;
  onClearFilters?: () => void;
}

export default function MarketSplitView({
  properties,
  filteredListings,
  loading,
  error,
  onListingClick,
  onClearFilters,
}: MarketSplitViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchPoint, setSearchPoint] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [distancesById, setDistancesById] = useState<Record<string, number>>({});
  const cardRefsMap = useRef<Record<string, HTMLDivElement | null>>({});
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    cardRefsMap.current[id] = el;
  }, []);

  const listingsForMap: ListingForMap[] = useMemo(
    () =>
      properties
        .filter((p) => validCoords(p.lat, p.lng))
        .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, title: p.title })),
    [properties]
  );

  const handleSelectListing = useCallback(
    (id: string) => {
      setSelectedId(id);
      const prop = properties.find((p) => p.id === id);
      if (prop && validCoords(prop.lat, prop.lng) && mapRef.current) {
        mapRef.current.flyTo({
          center: [prop.lng!, prop.lat!],
          zoom: 14,
          essential: true,
        });
      }
    },
    [properties]
  );

  const handleSelectMarker = useCallback((id: string) => {
    setSelectedId(id);
    const el = cardRefsMap.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleSearchPointSelect = useCallback(
    (point: { lat: number; lng: number; label: string }) => {
      setSearchPoint(point);
      const next: Record<string, number> = {};
      properties.forEach((p) => {
        if (validCoords(p.lat, p.lng)) {
          next[p.id] = haversineKm(point.lat, point.lng, p.lat!, p.lng!);
        }
      });
      setDistancesById(next);
    },
    [properties]
  );

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-gray-500">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg font-medium">Loading properties...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-red-400">
        <p className="text-lg font-medium">{error}</p>
      </div>
    );
  }

  if (filteredListings.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-gray-500 gap-2">
        <p className="text-lg font-medium">No listings match your filters.</p>
        {onClearFilters && (
          <button type="button" onClick={onClearFilters} className="text-emerald-500 hover:underline text-sm">
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex gap-4">
      <div className="w-[460px] max-w-[520px] min-w-[420px] flex-shrink-0 min-h-0 overflow-y-auto flex flex-col gap-4 p-4 border-r border-gray-800 bg-[#111315]">
        <MarketList
          listings={filteredListings}
          selectedId={selectedId}
          onSelect={handleSelectListing}
          onListingClick={onListingClick}
          distancesById={distancesById}
          setCardRef={setCardRef}
        />
      </div>
      <div className="flex-1 min-h-0 min-w-0">
        <MarketMap
          listings={listingsForMap}
          selectedId={selectedId}
          onSelectMarker={handleSelectMarker}
          searchPoint={searchPoint}
          onSearchPointSelect={handleSearchPointSelect}
          mapRef={mapRef}
        />
      </div>
    </div>
  );
}
