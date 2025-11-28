import React, { useState } from 'react';
import { X, Download, FileText, ZoomIn, AlertCircle } from 'lucide-react';

interface FloorPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FloorPlanModal: React.FC<FloorPlanModalProps> = ({ isOpen, onClose }) => {
  const [imgError, setImgError] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 font-sans">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-[#1C1F24] z-10">
          <div>
            <h2 className="text-xl font-bold text-white">Floor Plan</h2>
            <p className="text-sm text-gray-400">Unit 4B • 3 Rooms • 85m²</p>
          </div>
          <div className="flex gap-2">
             <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors" title="Download Image">
                <Download className="w-5 h-5" />
             </button>
             <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body (Image) */}
        <div className="flex-1 overflow-auto bg-[#111315] flex items-center justify-center p-8 relative">
            {!imgError ? (
              <div className="relative group max-w-full max-h-full shadow-2xl">
                <img 
                  // High quality architectural floor plan sketch on white background
                  src="https://plus.unsplash.com/premium_photo-1676321046262-4978a7522247?q=80&w=2071&auto=format&fit=crop"
                  alt="Floor Plan" 
                  onError={() => setImgError(true)}
                  className="max-w-full max-h-[65vh] object-contain select-none"
                  style={{ 
                    // Invert colors: White background becomes dark, black lines become white
                    filter: 'invert(0.9) hue-rotate(180deg) contrast(1.2)',
                    mixBlendMode: 'screen' // Helps blend with dark background
                  }} 
                />
                <div className="absolute inset-0 pointer-events-none ring-1 ring-white/10 rounded-sm"></div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-500 h-full w-full border-2 border-dashed border-gray-800 rounded-lg">
                <AlertCircle className="w-12 h-12 mb-3 text-gray-600" />
                <p className="font-medium">Image unavailable</p>
                <p className="text-xs mt-1">Please try again later</p>
              </div>
            )}
            
            <div className="absolute bottom-6 right-6 pointer-events-none">
               <div className="bg-black/80 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border border-white/10 flex items-center gap-2 shadow-xl">
                  <ZoomIn className="w-3 h-3" />
                  <span>High Resolution</span>
               </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-[#1C1F24] flex justify-between items-center z-10">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 text-sm text-gray-400 bg-[#111315] px-3 py-2 rounded border border-gray-800">
                <FileText className="w-4 h-4 text-emerald-500" />
                <span>PDF Format (2.4 MB)</span>
             </div>
          </div>
          <button className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold py-2.5 px-6 rounded-lg transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2">
            <Download className="w-4 h-4" />
            Download Plan
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloorPlanModal;