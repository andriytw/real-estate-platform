import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import MapGL, { Marker, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MarketMap.css';
import { fetchSuggestions, type GeocodeSuggestion } from '../utils/mapboxGeocode';

const DEFAULT_CENTER: [number, number] = [13.405, 52.52];
const DEFAULT_ZOOM = 10;
const MAX_RAYS = 30;
const ORIGIN_RADIUS_PX = 14;

/** Stable grouping key for identical map coordinates (avoids float drift). */
function listingCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

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
  withinRadiusIds: Set<string> | null;
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
  searchPoint: { lat: number; lng: number; label: string } | null;
  onSearchPointSelect: (point: { lat: number; lng: number; label: string }) => void;
  onClearSearchPoint?: () => void;
  mapRef: React.RefObject<mapboxgl.Map | null>;
  radiusKm: number | null;
  setRadiusKm: (v: number | null) => void;
  distancesById: Record<string, number>;
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
  withinRadiusIds,
  selectedId,
  onSelectMarker,
  searchPoint,
  onSearchPointSelect,
  onClearSearchPoint,
  mapRef,
  radiusKm,
  setRadiusKm,
  distancesById,
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
  const [mapReady, setMapReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const token = import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const forceRepaint = useCallback(() => {
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (map && typeof map.resize === 'function' && typeof map.triggerRepaint === 'function') {
      try {
        map.resize();
        map.triggerRepaint();
      } catch (_) {}
    }
  }, [mapRef]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        requestAnimationFrame(forceRepaint);
        setTimeout(forceRepaint, 50);
      }
    };
    const onFocus = () => {
      requestAnimationFrame(forceRepaint);
      setTimeout(forceRepaint, 50);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    const el = containerRef.current;
    if (el) {
      const ro = new ResizeObserver(() => forceRepaint());
      ro.observe(el);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pageshow', onFocus);
        ro.disconnect();
      };
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [forceRepaint]);

  useEffect(() => {
    requestAnimationFrame(forceRepaint);
  }, [searchPoint, withinRadiusIds?.size ?? 0, forceRepaint]);

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
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      if (map && typeof map.flyTo === 'function') {
        map.flyTo({ center: [s.lng, s.lat], zoom: 13, essential: true });
      }
    },
    [onSearchPointSelect, mapRef]
  );

  /** One marker per coordinate; ids in original `listings` order (no sort). */
  const groupedListingMarkers = useMemo(() => {
    const buckets = new Map<string, { lat: number; lng: number; ids: string[] }>();
    for (const item of listings) {
      const k = listingCoordKey(item.lat, item.lng);
      let b = buckets.get(k);
      if (!b) {
        b = { lat: item.lat, lng: item.lng, ids: [] };
        buckets.set(k, b);
      }
      b.ids.push(item.id);
    }
    const seen = new Set<string>();
    const ordered: { lat: number; lng: number; ids: string[]; count: number }[] = [];
    for (const item of listings) {
      const k = listingCoordKey(item.lat, item.lng);
      if (seen.has(k)) continue;
      seen.add(k);
      const b = buckets.get(k);
      if (b) ordered.push({ ...b, count: b.ids.length });
    }
    return ordered;
  }, [listings]);

  const { raysLineGeoJson, rayLabels } = useMemo(() => {
    const empty = {
      raysLineGeoJson: { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature<GeoJSON.LineString>[] },
      rayLabels: [] as { id: string; midLng: number; midLat: number; km: number }[],
    };
    const forRays = withinRadiusIds
      ? listings.filter((item) => withinRadiusIds.has(item.id))
      : listings;
    if (!searchPoint || forRays.length === 0) return empty;

    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    const hasProject = map && typeof map.project === 'function' && typeof map.unproject === 'function';

    const sorted = [...forRays]
      .map((item) => ({ item, km: distancesById[item.id] ?? Infinity }))
      .filter(({ km }) => Number.isFinite(km))
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_RAYS)
      .map(({ item, km }) => ({ item, km }));

    const sLng = searchPoint.lng;
    const sLat = searchPoint.lat;
    const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const rayLabelsResult: { id: string; midLng: number; midLat: number; km: number }[] = [];

    for (const { item, km } of sorted) {
      let startLng = sLng;
      let startLat = sLat;
      let shiftedOriginPx: { x: number; y: number } | null = null;
      let targetPx: { x: number; y: number } | null = null;

      if (hasProject && map) {
        const originPx = map.project([sLng, sLat]);
        const tPx = map.project([item.lng, item.lat]);
        targetPx = tPx;
        const dx = tPx.x - originPx.x;
        const dy = tPx.y - originPx.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const u = { x: dx / len, y: dy / len };
          shiftedOriginPx = {
            x: originPx.x + u.x * ORIGIN_RADIUS_PX,
            y: originPx.y + u.y * ORIGIN_RADIUS_PX,
          };
          const shiftedLngLat = map.unproject(shiftedOriginPx);
          startLng = shiftedLngLat.lng;
          startLat = shiftedLngLat.lat;
        }
      }

      lineFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [startLng, startLat],
            [item.lng, item.lat],
          ],
        },
        properties: { id: item.id, kmLabel: `${km.toFixed(1)} km` },
      });

      if (hasProject && map && shiftedOriginPx && targetPx) {
        const midPx = {
          x: (shiftedOriginPx.x + targetPx.x) / 2,
          y: (shiftedOriginPx.y + targetPx.y) / 2,
        };
        const midLngLat = map.unproject(midPx);
        rayLabelsResult.push({ id: item.id, midLng: midLngLat.lng, midLat: midLngLat.lat, km });
      } else {
        rayLabelsResult.push({
          id: item.id,
          midLng: (startLng + item.lng) / 2,
          midLat: (startLat + item.lat) / 2,
          km,
        });
      }
    }

    return {
      raysLineGeoJson: { type: 'FeatureCollection' as const, features: lineFeatures },
      rayLabels: rayLabelsResult,
    };
  }, [searchPoint, listings, withinRadiusIds, distancesById, mapReady]);

  return (
    <div className="relative w-full h-full min-h-0 bg-[#0D1117]">
      {/* Overlay: glass bar only under top controls row; no blur on map */}
      <div className="market-controls-overlay">
        <div className="market-glass-bar">
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
          {searchPoint && onClearSearchPoint && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSuggestions([]);
                setSuggestionsOpen(false);
                onClearSearchPoint();
              }}
              className="ml-1 text-xs text-gray-400 hover:text-emerald-400 whitespace-nowrap"
            >
              Clear address
            </button>
          )}
        </div>
        {searchPoint != null ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 text-sm">Radius</span>
            <span className="text-white text-sm min-w-[3rem]">
              {radiusKm == null ? 'Any' : `${radiusKm} km`}
            </span>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={radiusKm ?? 25}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-24 h-2 bg-[#1C1F24] rounded-lg appearance-none cursor-pointer accent-emerald-500"
              aria-label="Radius in km"
            />
            <button
              type="button"
              onClick={() => setRadiusKm(null)}
              className="text-xs text-gray-400 hover:text-emerald-400 whitespace-nowrap"
            >
              Clear radius
            </button>
          </div>
        ) : (
          <span className="text-gray-500 text-xs">Set a search address</span>
        )}
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
      </div>

      <div ref={containerRef} className="w-full h-full min-h-0">
        <MapGL
          onLoad={({ target }) => {
            if (mapRef && typeof mapRef === 'object') (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = target;
            setMapReady(true);
            requestAnimationFrame(forceRepaint);
          }}
          onUnload={() => {
            if (mapRef && typeof mapRef === 'object') (mapRef as React.MutableRefObject<mapboxgl.Map | null>).current = null;
            setMapReady(false);
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
        {groupedListingMarkers.map((group) => {
          const inRadius =
            !withinRadiusIds || group.ids.some((id) => withinRadiusIds.has(id));
          const isSelected =
            selectedId != null && group.ids.includes(selectedId);
          const idToSelect =
            selectedId != null && group.ids.includes(selectedId)
              ? selectedId
              : group.ids[0];
          return (
            <Marker
              key={listingCoordKey(group.lat, group.lng)}
              longitude={group.lng}
              latitude={group.lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectMarker(idToSelect);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className={`marker-wrap ${!inRadius ? 'marker-hidden' : ''}`}>
                <div
                  className={`marker-dot ${isSelected ? 'marker-dot-selected' : ''}${
                    group.count > 1 ? ' marker-dot-with-count' : ''
                  }`}
                >
                  {group.count > 1 ? (
                    <span className="marker-dot-count">{group.count}</span>
                  ) : null}
                </div>
              </div>
            </Marker>
          );
        })}
        {searchPoint && (
          <Marker
            longitude={searchPoint.lng}
            latitude={searchPoint.lat}
            anchor="center"
            style={{ pointerEvents: 'none' }}
          >
            <div className="marker-wrap">
              <div className="marker-dot-blue" />
            </div>
          </Marker>
        )}
        {searchPoint && raysLineGeoJson.features.length > 0 && (
          <Source id="rays-lines" type="geojson" data={raysLineGeoJson}>
            <Layer
              id="rays-line-layer"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': 'rgba(255,255,255,0.5)',
                'line-width': 1.5,
                'line-opacity': 0.7,
              }}
            />
          </Source>
        )}
        {searchPoint &&
          rayLabels.map((label) => (
            <Marker
              key={`ray-label-${label.id}`}
              longitude={label.midLng}
              latitude={label.midLat}
              anchor="center"
            >
              <div className="ray-km-label">{label.km.toFixed(1)} km</div>
            </Marker>
          ))}
        </MapGL>
      </div>
    </div>
  );
}
