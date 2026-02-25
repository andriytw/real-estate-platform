import React, { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import type { Property, Worker } from '../types';
import PropertyDetails from './PropertyDetails';

interface PropertyDetailsModalProps {
  property: Property;
  onClose: () => void;
  worker?: Worker | null;
  coverPhotoUrl?: string | null;
  onBookViewing?: () => void;
  onRequireLogin?: () => void;
}

export default function PropertyDetailsModal({
  property,
  onClose,
  worker,
  coverPhotoUrl,
  onBookViewing,
  onRequireLogin,
}: PropertyDetailsModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Enter' && onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close modal"
      />
      <div
        className="relative w-full max-w-[1100px] max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0D0F11] border border-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-black/50 hover:bg-black/70 text-gray-300 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="p-4 md:p-6">
          <PropertyDetails
            property={property}
            worker={worker}
            coverPhotoUrl={coverPhotoUrl}
            onBookViewing={onBookViewing}
            onRequireLogin={onRequireLogin}
            compact
          />
        </div>
      </div>
    </div>
  );
}
