'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const getMapboxToken = (): string => {
  if (typeof window === 'undefined') return '';
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [leafletError, setLeafletError] = useState<string | null>(null);
  const token = open ? getMapboxToken() : '';

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setMapReady(false);
      setMapError(null);
      setLeafletError(null);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
      }
      return;
    }
    setMapError(null);
    setLeafletError(null);
  }, [open]);

  // Mapbox: only in useEffect, only when open && token, client-only
  useEffect(() => {
    if (!open || !token || typeof window === 'undefined') {
      setMapReady(false);
      return;
    }
    const container = mapContainerRef.current;
    if (!container) return;

    let cancelled = false;

    (async () => {
      try {
        await import('mapbox-gl/dist/mapbox-gl.css');
        const mb = await import('mapbox-gl');
        const mapboxgl = mb.default ?? mb;
        if (cancelled || !container) return;
        if (!mapboxgl.accessToken) mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [BERLIN_CENTER.lng, BERLIN_CENTER.lat],
          zoom: DEFAULT_ZOOM,
        });
        if (cancelled) {
          map.remove();
          return;
        }
        mapInstanceRef.current = map;
        setMapReady(true);
        setMapError(null);
      } catch (e) {
        if (!cancelled) {
          setMapError(e instanceof Error ? e.message : String(e));
          setMapReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
      }
      setMapReady(false);
    };
  }, [open, token]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0D1117]">
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

      <div className="flex-1 min-h-0 relative">
        {token ? (
          <>
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full bg-[#111315]" />
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0D1117]/95 p-4">
                <div className="text-center max-w-md">
                  <p className="text-red-400 font-medium mb-2">Map failed to load</p>
                  <p className="text-gray-400 text-sm break-words">{mapError}</p>
                  <p className="text-gray-500 text-xs mt-2">Calendar is unaffected. Close overlay to continue.</p>
                </div>
              </div>
            )}
            {!mapReady && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-[#111315]">Loading map…</div>
            )}
          </>
        ) : (
          <LeafletFallbackMap onError={setLeafletError} leafletError={leafletError} />
        )}
      </div>
    </div>
  );
};

interface LeafletFallbackMapProps {
  onError: (msg: string | null) => void;
  leafletError: string | null;
}

const LeafletFallbackMap: React.FC<LeafletFallbackMapProps> = ({ onError, leafletError }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    let cancelled = false;

    (async () => {
      try {
        await import('leaflet/dist/leaflet.css');
        const L = await import('leaflet');
        const lib = L.default ?? L;
        if (cancelled || !mapRef.current) return;
        const map = lib.map(mapRef.current).setView([BERLIN_CENTER.lat, BERLIN_CENTER.lng], DEFAULT_ZOOM);
        lib.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(map);
        mapInstanceRef.current = map;
        onError(null);
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
      }
    };
  }, [onError]);

  return (
    <div className="w-full h-full relative bg-[#111315]">
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />
      {leafletError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D1117]/95 p-4">
          <div className="text-center max-w-md">
            <p className="text-gray-400 text-sm">No Mapbox token. Set NEXT_PUBLIC_MAPBOX_TOKEN or VITE_MAPBOX_TOKEN.</p>
            <p className="text-gray-500 text-xs mt-2">Leaflet fallback: {leafletError}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesMapOverlay;
