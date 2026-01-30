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
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
      }
      return;
    }
    setMapError(null);
  }, [open]);

  // Mapbox only: dynamic import inside useEffect, client-only
  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      setMapReady(false);
      return;
    }
    if (!token) {
      setMapError('Mapbox token missing');
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

      <div className="flex-1 min-h-0 relative bg-[#111315]">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
        {/* Dark placeholder when no token or map failed */}
        {(!token || mapError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#0D1117] to-[#161B22] p-4">
            <div className="text-center max-w-md">
              <p className="text-gray-400 font-medium mb-2">
                {!token ? 'Mapbox token missing' : 'Map failed to load'}
              </p>
              {mapError && <p className="text-gray-500 text-sm break-words mb-2">{mapError}</p>}
              <p className="text-gray-500 text-xs">Set NEXT_PUBLIC_MAPBOX_TOKEN or VITE_MAPBOX_TOKEN in .env</p>
              <p className="text-gray-600 text-xs mt-2">Calendar is unaffected. Close overlay to continue.</p>
            </div>
          </div>
        )}
        {token && !mapError && !mapReady && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-[#111315]">
            Loading map…
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesMapOverlay;
