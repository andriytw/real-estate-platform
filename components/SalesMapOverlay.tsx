import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Mapbox token: NEXT_PUBLIC_MAPBOX_TOKEN or VITE_MAPBOX_TOKEN (Vite define + envPrefix)
const getMapboxToken = (): string => {
  const v = (import.meta.env as Record<string, string | undefined>);
  return v.VITE_MAPBOX_TOKEN || v.NEXT_PUBLIC_MAPBOX_TOKEN || (typeof process !== 'undefined' && (process.env as Record<string, string | undefined>)?.NEXT_PUBLIC_MAPBOX_TOKEN) || '';
};

interface SalesMapOverlayProps {
  open: boolean;
  onClose: () => void;
}

const BERLIN_CENTER = { lat: 52.52, lng: 13.405 };
const DEFAULT_ZOOM = 10.5;

const SalesMapOverlay: React.FC<SalesMapOverlayProps> = ({ open, onClose }) => {
  const [MapboxMapComponent, setMapboxMapComponent] = useState<React.ComponentType<any> | null>(null);
  const token = getMapboxToken();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lazy-load Mapbox when overlay opens and token is present
  useEffect(() => {
    if (!open || !token) {
      setMapboxMapComponent(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      import('mapbox-gl/dist/mapbox-gl.css'),
      import('react-map-gl'),
      import('mapbox-gl'),
    ]).then(([, mapModule, mapboxgl]) => {
      if (cancelled) return;
      (mapboxgl as any).default.accessToken = token;
      setMapboxMapComponent(() => mapModule.default);
    }).catch(() => setMapboxMapComponent(null));
    return () => { cancelled = true; };
  }, [open, token]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0D1117]">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#161B22]">
        <h2 className="text-lg font-bold text-white">Sales Map Mode</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Map area */}
      <div className="flex-1 min-h-0 relative">
        {token && MapboxMapComponent ? (
          <MapboxMapComponent
            mapboxAccessToken={token}
            initialViewState={{
              longitude: BERLIN_CENTER.lng,
              latitude: BERLIN_CENTER.lat,
              zoom: DEFAULT_ZOOM,
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
          />
        ) : token ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">Loading map…</div>
        ) : (
          <LeafletFallbackMap />
        )}
      </div>
    </div>
  );
};

// Leaflet + CartoDB dark tiles when no Mapbox token
const LeafletFallbackMap: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet/dist/leaflet.css');
    import('leaflet').then((L) => {
      const map = L.default.map(mapRef.current!).setView(
        [BERLIN_CENTER.lat, BERLIN_CENTER.lng],
        DEFAULT_ZOOM
      );
      L.default.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
    });
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return <div ref={mapRef} className="w-full h-full bg-[#111315]" />;
};

export default SalesMapOverlay;
