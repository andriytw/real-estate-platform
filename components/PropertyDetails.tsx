
import React, { useState, useEffect } from 'react';
import { 
  MapPin, Home, Ruler, Bath, ArrowUpFromLine, Coins, 
  Wind, Construction, Calendar, ShieldCheck, Info,
  Bell, Accessibility, Check, X, MoveVertical,
  ChevronLeft, ChevronRight, BedDouble, TreePine
} from 'lucide-react';
import { Property, Worker } from '../types';
import { propertyMediaService } from '../services/propertyMediaService';
import TourModal from './TourModal';
import FloorPlanModal from './FloorPlanModal';
import GalleryModal from './GalleryModal';
import ShareModal from './ShareModal';
import ChatModal from './ChatModal';
import SendRequestModal from './SendRequestModal';
import ApartmentDataSection from './ApartmentDataSection';
import { toNum } from '../utils/propertyStats';

interface PropertyDetailsProps {
  property: Property;
  hideActions?: boolean;
  onBookViewing?: () => void;
  worker?: Worker | null; // For checking if user is logged in
  onRequireLogin?: () => void; // Callback when login is required
  coverPhotoUrl?: string | null; // MP-PROD-01: signed URL for cover photo (hero image)
  /** When true (e.g. in modal), use smaller hero and tighter spacing */
  compact?: boolean;
}

const PropertyDetails: React.FC<PropertyDetailsProps> = ({ 
  property, 
  hideActions = false, 
  onBookViewing,
  worker,
  onRequireLogin,
  coverPhotoUrl = null,
  compact = false
}) => {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isSendRequestModalOpen, setIsSendRequestModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryImageUrls, setGalleryImageUrls] = useState<string[]>([]);
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState<string | null>(null);
  const [tour3dCandidates, setTour3dCandidates] = useState<Array<{ kind: 'glb' | 'ifc' | 'obj'; url: string }>>([]);
  const [tour3dLoading, setTour3dLoading] = useState(false);

  const isPropertyRoute =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/property/');
  const isGuest = !worker;
  const isPublicMarketplaceProperty = isPropertyRoute && isGuest;

  const d = property.details ?? ({} as Property['details']);
  const rooms = toNum(d?.rooms ?? property.rooms);
  const area = toNum(d?.area ?? property.area);
  const beds = toNum(d?.beds ?? property.beds);
  const baths = toNum(d?.baths ?? property.bathrooms);
  const balconies = toNum(d?.balconies ?? property.balconies);
  const floor = toNum(d?.floor ?? property.floor);
  const buildingFloors = toNum(d?.buildingFloors ?? property.totalFloors);

  // Marketplace gallery: load all photo assets for this property (cover-first), avoid resign on every render
  useEffect(() => {
    if (!property.id) {
      setGalleryImageUrls([]);
      return;
    }
    let cancelled = false;
    propertyMediaService
      .getMarketplacePhotoUrlsForProperty(property.id, 3600, property.cover_photo_asset_id ?? undefined)
      .then((urls) => {
        if (!cancelled) {
          setGalleryImageUrls(urls);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[marketplace-gallery] getMarketplacePhotoUrlsForProperty failed', err);
          setGalleryImageUrls([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [property.id]);

  const handleActionClick = (action: () => void) => {
    if (isPublicMarketplaceProperty) {
      action();
      return;
    }
    if (!worker && onRequireLogin) {
      onRequireLogin();
      return;
    }
    action();
  };

  // Reset image index when property changes
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [property.id]);

  // Load floor plan URL when Floor Plan modal opens
  useEffect(() => {
    if (!isFloorPlanOpen || !property.id) {
      setFloorPlanImageUrl(null);
      return;
    }
    let cancelled = false;
    propertyMediaService
      .getMarketplaceFloorPlanUrl(property.id, 1800)
      .then((url) => {
        if (!cancelled) setFloorPlanImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFloorPlanImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isFloorPlanOpen, property.id]);

  // Load 3D tour candidates once when Tour modal opens (no polling)
  useEffect(() => {
    if (!isTourOpen || !property.id) {
      setTour3dCandidates([]);
      setTour3dLoading(false);
      return;
    }
    let cancelled = false;
    setTour3dLoading(true);
    propertyMediaService
      .getMarketplaceTour3dCandidates(property.id, 60 * 30)
      .then((result) => {
        if (!cancelled) {
          setTour3dCandidates(result.candidates);
          setTour3dLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTour3dCandidates([]);
          setTour3dLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isTourOpen, property.id]);

  // Fallback: cover + legacy images (for gallery when no property_media_assets loaded)
  const fallbackImages =
    coverPhotoUrl
      ? [coverPhotoUrl, ...(property.images || [property.image]).filter(Boolean)]
      : (property.images && property.images.length > 0 ? property.images : [property.image]);
  // Hero always shows cover (no regression when gallery loads with different order)
  const heroImage = coverPhotoUrl ?? (fallbackImages.filter(Boolean)[0] ?? '');
  // Full gallery for modal only (N/N)
  const galleryImages = galleryImageUrls.length > 0 ? galleryImageUrls : fallbackImages.filter(Boolean);
  const safeIndex = galleryImages.length ? Math.min(currentImageIndex, galleryImages.length - 1) : 0;
  const currentImage = heroImage;

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!galleryImages.length) return;
    setCurrentImageIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!galleryImages.length) return;
    setCurrentImageIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* 3D Tour Modal */}
      <TourModal 
        isOpen={isTourOpen} 
        onClose={() => setIsTourOpen(false)} 
        propertyTitle={property.address}
        tour3dCandidates={tour3dCandidates}
        isLoading={tour3dLoading}
      />

      {/* Floor Plan Modal */}
      <FloorPlanModal 
        isOpen={isFloorPlanOpen}
        onClose={() => setIsFloorPlanOpen(false)}
        imageUrl={floorPlanImageUrl}
        title={property.address}
      />

      {/* Send Request Modal (marketplace guest) */}
      <SendRequestModal
        isOpen={isSendRequestModalOpen}
        onClose={() => setIsSendRequestModalOpen(false)}
        propertyId={property.id}
        propertyTitle={property.title}
      />

      {/* Gallery Modal */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        images={galleryImages}
        title={property.address}
      />

      {/* Share Modal */}
      <ShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        propertyTitle={property.title}
        propertyAddress={property.address}
        propertyId={property.id}
      />

      {/* Chat Modal */}
      <ChatModal 
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        propertyTitle={property.address}
        propertyId={property.id}
        worker={worker}
      />

      {/* Hero Image Section */}
      <div 
        className={`relative w-full rounded-xl overflow-hidden group shrink-0 bg-[#1C1F24] mb-6 cursor-pointer ${compact ? 'h-[280px]' : 'h-[400px]'}`}
        onClick={() => handleActionClick(() => setIsGalleryOpen(true))}
      >
        <img 
          src={currentImage} 
          alt={property.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
        />
        
        {/* Image Navigation Overlay */}
        {galleryImages.length > 1 && (
          <>
            <button 
              onClick={handlePrevImage}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors backdrop-blur-sm z-10 opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={handleNextImage}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors backdrop-blur-sm z-10 opacity-0 group-hover:opacity-100"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
            
            {/* Pagination Dots */}
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2 z-10">
               {galleryImages.map((_, idx) => (
                 <div 
                    key={idx} 
                    className={`w-2 h-2 rounded-full transition-colors ${idx === safeIndex ? 'bg-white' : 'bg-white/30'}`}
                 />
               ))}
            </div>
          </>
        )}

        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
           <h2 className="text-2xl font-bold text-white">{rooms}-Room Apartment – {property.address}</h2>
        </div>
      </div>

      {/* Icons & Specs Row: rooms, area, beds, baths, balconies, floor/total (single source — no tiles below) */}
      <div className="flex flex-wrap items-center gap-y-3 text-sm text-gray-400 mb-6">
        <div className="flex items-center gap-5 mr-5">
          <div className="flex items-center gap-1.5">
            <Home className="w-4 h-4 text-gray-500" />
            <span>{rooms > 0 ? `${rooms}rm` : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ruler className="w-4 h-4 text-gray-500" />
            <span>{area > 0 ? `${area}m²` : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BedDouble className="w-4 h-4 text-gray-500" />
            <span>{beds > 0 ? `${beds}bd` : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bath className="w-4 h-4 text-gray-500" />
            <span>{baths > 0 ? `${baths}ba` : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TreePine className="w-4 h-4 text-gray-500" />
            <span>{balconies > 0 ? `${balconies}bal` : '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MoveVertical className="w-4 h-4 text-gray-500" />
            <span>{buildingFloors > 0 ? `${floor}/${buildingFloors}` : floor > 0 ? String(floor) : '—'}</span>
          </div>
        </div>

        <div className="w-px h-4 bg-gray-700 mr-5 hidden sm:block"></div>

        <div className="flex items-center gap-4 mr-5">
            <div className="flex items-center gap-1" title="Notifications">
              <Bell className="w-4 h-4 text-gray-500" />
              <Check className="w-3 h-3 text-emerald-500" />
            </div>
            <div className="flex items-center gap-1" title="Elevator">
              <ArrowUpFromLine className="w-4 h-4 text-gray-500" />
              <Check className="w-3 h-3 text-emerald-500" />
            </div>
            <div className="flex items-center gap-1" title="Accessible">
              <Accessibility className="w-4 h-4 text-gray-500" />
              {floor > 0 ? <Check className="w-3 h-3 text-emerald-500" /> : <X className="w-3 h-3 text-gray-600" />}
            </div>
            <div className="flex items-center gap-1" title="Pets">
              <span className="text-lg leading-none pb-1">🐶</span>
              <X className="w-3 h-3 text-gray-600" />
            </div>
        </div>

      </div>

      {/* Single CTA row: 3D Tour | Floor Plan | Gallery | Send Request | Download MagicPlan Report | Share Apartment | Chat */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button 
          onClick={() => handleActionClick(() => {
            setIsTourOpen(true);
            setTour3dLoading(true);
          })}
          className="bg-emerald-500 text-white font-bold py-3 px-4 text-sm rounded-md hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-900/20"
        >
          3D Tour
        </button>
        <button 
          onClick={() => handleActionClick(() => setIsFloorPlanOpen(true))}
          className="bg-transparent border border-[#2E323A] text-white font-medium py-3 px-4 text-sm rounded-md hover:bg-[#2A2E35] transition-colors"
        >
          Floor Plan
        </button>
        <button 
          onClick={() => handleActionClick(() => setIsGalleryOpen(true))}
          className="bg-transparent border border-[#2E323A] text-white font-medium py-3 px-4 text-sm rounded-md hover:bg-[#2A2E35] transition-colors"
        >
          Gallery
        </button>
        {!hideActions && (
          <>
            <button
              type="button"
              onClick={() => handleActionClick(() => {
                if (isPublicMarketplaceProperty) {
                  setIsSendRequestModalOpen(true);
                } else {
                  onBookViewing?.();
                }
              })}
              className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 px-4 rounded-md transition-colors"
            >
              Send Request
            </button>
            <button 
              onClick={() => handleActionClick(async () => {
                try {
                  const url = await propertyMediaService.getMarketplaceMagicPlanReportUrl(property.id, 1800);
                  if (url) {
                    window.open(url, '_blank');
                  } else {
                    alert('Report unavailable');
                  }
                } catch {
                  alert('Report unavailable');
                }
              })}
              className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 px-4 rounded-md transition-colors"
            >
              Download MagicPlan Report
            </button>
            <button 
              onClick={() => handleActionClick(() => setIsShareModalOpen(true))}
              className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 px-4 rounded-md transition-colors"
            >
              Share Apartment
            </button>
            <button 
              onClick={() => handleActionClick(() => setIsChatModalOpen(true))}
              className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 px-4 rounded-md transition-colors"
            >
              Chat
            </button>
          </>
        )}
      </div>

      {/* Description */}
      <div className="mb-8">
        <p className="text-gray-400 text-[13px] leading-relaxed font-normal">
          {property.description}
        </p>
      </div>

      <ApartmentDataSection property={property} />
    </div>
  );
};

export default PropertyDetails;
