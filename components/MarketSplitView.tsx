import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import MarketList from './MarketList';
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
  filteredProperties: Property[];
  coverPhotoUrlByPropertyId?: Record<string, string>;
  loading: boolean;
  error: string | null;
  onListingClick: (property: Property) => void;
  onPostAdClick?: () => void;
  priceFilter: string;
  roomFilter: string;
  bedsFilter: string;
  setPriceFilter: (v: string) => void;
  setRoomFilter: (v: string) => void;
  setBedsFilter: (v: 'any' | '1' | '2' | '3' | '4' | '5') => void;
  onClearFilters?: () => void;
  dateFrom: string | null;
  dateTo: string | null;
  setDateFrom: (v: string | null) => void;
  setDateTo: (v: string | null) => void;
  onClearDates: () => void;
  loadingAvailability: boolean;
}

export default function MarketSplitView({
  properties,
  filteredProperties,
  coverPhotoUrlByPropertyId = {},
  loading,
  error,
  onListingClick,
  onPostAdClick,
  priceFilter,
  roomFilter,
  bedsFilter,
  setPriceFilter,
  setRoomFilter,
  setBedsFilter,
  onClearFilters,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  onClearDates,
  loadingAvailability,
}: MarketSplitViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchPoint, setSearchPoint] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const cardRefsMap = useRef<Record<string, HTMLDivElement | null>>({});
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    cardRefsMap.current[id] = el;
  }, []);

  // Single Haversine source: one distanceKmById for list, radius filter, and rays
  const distanceKmById = useMemo(() => {
    if (!searchPoint) return {};
    const out: Record<string, number> = {};
    properties.forEach((p) => {
      if (validCoords(p.lat, p.lng)) {
        out[p.id] = haversineKm(searchPoint.lat, searchPoint.lng, p.lat!, p.lng!);
      }
    });
    return out;
  }, [searchPoint, properties]);

  const visibleProperties = useMemo(() => {
    if (!searchPoint || radiusKm == null) return filteredProperties;
    return filteredProperties.filter((p) => {
      if (!validCoords(p.lat, p.lng)) return false;
      const d = distanceKmById[p.id];
      return d != null && d <= radiusKm;
    });
  }, [filteredProperties, searchPoint, radiusKm, distanceKmById]);

  const listingsForMap: ListingForMap[] = useMemo(() => {
    return visibleProperties
      .filter((p) => validCoords(p.lat, p.lng))
      .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, title: p.title }));
  }, [visibleProperties]);

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

  const handleSearchPointSelect = useCallback((point: { lat: number; lng: number; label: string }) => {
    setSearchPoint(point);
  }, []);

  const handleClearSearchPoint = useCallback(() => {
    setSearchPoint(null);
    setRadiusKm(null);
  }, []);

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

  return (
    <div className="h-full min-h-0 flex gap-4">
      <div className="w-[460px] max-w-[520px] shrink-0 min-h-0 flex flex-col border-r border-gray-800 bg-[#111315]">
        <div className="sticky top-0 z-10 bg-[#111315] pt-2 pb-2 px-4">
          {onPostAdClick && (
            <button
              type="button"
              onClick={onPostAdClick}
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-500 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all group text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Post a New Ad to Market</span>
            </button>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4">
          <MarketList
            properties={visibleProperties}
            coverPhotoUrlByPropertyId={coverPhotoUrlByPropertyId}
            selectedId={selectedId}
            onSelect={handleSelectListing}
            onListingClick={onListingClick}
            distancesById={distanceKmById}
            setCardRef={setCardRef}
            onClearFilters={onClearFilters}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 min-w-0">
        <MarketMap
          listings={listingsForMap}
          selectedId={selectedId}
          onSelectMarker={handleSelectMarker}
          searchPoint={searchPoint}
          onSearchPointSelect={handleSearchPointSelect}
          onClearSearchPoint={handleClearSearchPoint}
          mapRef={mapRef}
          radiusKm={radiusKm}
          setRadiusKm={setRadiusKm}
          distancesById={distanceKmById}
          priceFilter={priceFilter}
          roomFilter={roomFilter}
          bedsFilter={bedsFilter}
          setPriceFilter={setPriceFilter}
          setRoomFilter={setRoomFilter}
          setBedsFilter={setBedsFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          onClearDates={onClearDates}
          loadingAvailability={loadingAvailability}
        />
      </div>
    </div>
  );
}
