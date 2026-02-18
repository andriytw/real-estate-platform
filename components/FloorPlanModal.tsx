import React, { useState } from 'react';
import { X, FileText, AlertCircle } from 'lucide-react';

interface FloorPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  title?: string;
}

const FloorPlanModal: React.FC<FloorPlanModalProps> = ({ isOpen, onClose, imageUrl = null, title }) => {
  const [imgError, setImgError] = useState(false);
  const isPdf = imageUrl != null && (imageUrl.toLowerCase().endsWith('.pdf') || imageUrl.includes('pdf'));

  if (!isOpen) return null;

  const showPlaceholder = imageUrl == null || imageUrl === '';
  const showContent = !showPlaceholder && !imgError;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 font-sans">
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-[#1C1F24] z-10">
          <div>
            <h2 className="text-xl font-bold text-white">Floor Plan</h2>
            <p className="text-sm text-gray-400">{title ?? 'Unit 4B • 3 Rooms • 85m²'}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[#111315] flex items-center justify-center p-8 relative">
          {showPlaceholder && (
            <div className="flex flex-col items-center justify-center text-gray-500 h-full w-full border-2 border-dashed border-gray-800 rounded-lg">
              <AlertCircle className="w-12 h-12 mb-3 text-gray-600" />
              <p className="font-medium">Floor plan not available</p>
              <p className="text-xs mt-1">Please try again later</p>
            </div>
          )}
          {showContent && isPdf && (
            <iframe
              src={imageUrl}
              title="Floor Plan"
              className="w-full h-full min-h-[65vh] border-0 rounded"
            />
          )}
          {showContent && !isPdf && (
            <div className="relative group max-w-full max-h-full shadow-2xl">
              <img
                src={imageUrl}
                alt="Floor Plan"
                onError={() => setImgError(true)}
                className="max-w-full max-h-[65vh] object-contain select-none"
              />
            </div>
          )}
          {showContent && imgError && (
            <div className="flex flex-col items-center justify-center text-gray-500 h-full w-full border-2 border-dashed border-gray-800 rounded-lg">
              <AlertCircle className="w-12 h-12 mb-3 text-gray-600" />
              <p className="font-medium">Image unavailable</p>
              <p className="text-xs mt-1">Please try again later</p>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-700 bg-[#1C1F24] flex justify-between items-center z-10">
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-[#111315] px-3 py-2 rounded border border-gray-800">
            <FileText className="w-4 h-4 text-emerald-500" />
            <span>{isPdf ? 'PDF' : 'Image'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloorPlanModal;