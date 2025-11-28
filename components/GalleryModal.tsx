import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  title: string;
}

const GalleryModal: React.FC<GalleryModalProps> = ({ isOpen, onClose, images, title }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setCurrentIndex(0);
  }, [isOpen]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'ArrowLeft') handlePrev();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') onClose();
  }, [isOpen, handleNext, handlePrev, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6 z-20 flex justify-between items-start">
        <div>
          <h2 className="text-white text-lg font-bold drop-shadow-md">{title}</h2>
          <p className="text-gray-400 text-sm">{currentIndex + 1} / {images.length}</p>
        </div>
        <button 
          onClick={onClose}
          className="bg-black/50 hover:bg-white/20 text-white p-2 rounded-full transition-colors backdrop-blur-md"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Image Area */}
      <div className="flex-1 flex items-center justify-center relative group select-none">
        {/* Left Arrow */}
        <button 
          onClick={handlePrev}
          className="absolute left-4 md:left-8 p-3 bg-black/30 hover:bg-white/10 text-white rounded-full transition-colors backdrop-blur-sm z-10"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>

        {/* Image */}
        <div className="relative max-w-full max-h-full px-4 md:px-20 py-4">
          <img 
            src={images[currentIndex]} 
            alt={`Gallery image ${currentIndex + 1}`}
            className="max-h-[80vh] max-w-full object-contain shadow-2xl rounded-sm"
          />
        </div>

        {/* Right Arrow */}
        <button 
          onClick={handleNext}
          className="absolute right-4 md:right-8 p-3 bg-black/30 hover:bg-white/10 text-white rounded-full transition-colors backdrop-blur-sm z-10"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      </div>

      {/* Thumbnails Strip */}
      <div className="h-24 bg-[#111315] border-t border-gray-800 p-4 flex justify-center items-center gap-3 overflow-x-auto">
        {images.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`
              relative flex-shrink-0 h-16 w-24 rounded-md overflow-hidden transition-all
              ${currentIndex === idx ? 'ring-2 ring-emerald-500 opacity-100' : 'opacity-50 hover:opacity-80'}
            `}
          >
            <img src={img} alt={`Thumbnail ${idx}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default GalleryModal;