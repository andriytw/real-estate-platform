
import React, { useState } from 'react';
import { 
  MapPin, Home, Ruler, Bath, ArrowUpFromLine, Coins, 
  Wind, Construction, Calendar, ShieldCheck, Info,
  Bell, Accessibility, Check, X, MoveVertical,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { Property } from '../types';
import TourModal from './TourModal';
import FloorPlanModal from './FloorPlanModal';
import GalleryModal from './GalleryModal';
import ShareModal from './ShareModal';
import ChatModal from './ChatModal';

interface PropertyDetailsProps {
  property: Property;
  hideActions?: boolean;
  onBookViewing?: () => void;
}

const DetailRow: React.FC<{ label: string; value: string | number | boolean; highlight?: boolean }> = ({ label, value }) => (
  <div className="flex justify-between items-center py-3 border-b border-[#272A30] last:border-0">
    <span className="text-[#9CA3AF] text-[13px] font-medium">{label}</span>
    <span className="text-[13px] font-bold text-white">
      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
    </span>
  </div>
);

const PropertyDetails: React.FC<PropertyDetailsProps> = ({ property, hideActions = false, onBookViewing }) => {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === (property.images?.length || 1) - 1 ? 0 : prev + 1));
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? (property.images?.length || 1) - 1 : prev - 1));
  };

  // Reset image index when property changes
  React.useEffect(() => {
    setCurrentImageIndex(0);
  }, [property.id]);

  const images = property.images && property.images.length > 0 ? property.images : [property.image];
  const currentImage = images[currentImageIndex];

  return (
    <div className="flex flex-col h-full font-sans">
      {/* 3D Tour Modal */}
      <TourModal 
        isOpen={isTourOpen} 
        onClose={() => setIsTourOpen(false)} 
        propertyTitle={property.address}
      />

      {/* Floor Plan Modal */}
      <FloorPlanModal 
        isOpen={isFloorPlanOpen}
        onClose={() => setIsFloorPlanOpen(false)}
      />

      {/* Gallery Modal */}
      <GalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        images={images}
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
      />

      {/* Hero Image Section */}
      <div 
        className="relative h-[400px] w-full rounded-xl overflow-hidden group shrink-0 bg-[#1C1F24] mb-6 cursor-pointer"
        onClick={() => setIsGalleryOpen(true)}
      >
        <img 
          src={currentImage} 
          alt={property.title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
        />
        
        {/* Image Navigation Overlay */}
        {images.length > 1 && (
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
               {images.map((_, idx) => (
                 <div 
                    key={idx} 
                    className={`w-2 h-2 rounded-full transition-colors ${idx === currentImageIndex ? 'bg-white' : 'bg-white/30'}`}
                 />
               ))}
            </div>
          </>
        )}

        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
           <h2 className="text-2xl font-bold text-white">{property.rooms}-Room Apartment – {property.address}</h2>
        </div>
      </div>

      {/* Icons & Specs Row */}
      <div className="flex flex-wrap items-center gap-y-3 text-sm text-gray-400 mb-6">
        <div className="flex items-center gap-5 mr-5">
          <div className="flex items-center gap-1.5">
            <Home className="w-4 h-4 text-gray-500" />
            <span>{property.rooms}rm</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ruler className="w-4 h-4 text-gray-500" />
            <span>{property.area}m²</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MoveVertical className="w-4 h-4 text-gray-500" />
            <span>{property.floor}/{property.totalFloors}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Bath className="w-4 h-4 text-gray-500" />
            <span>{property.bathrooms}ba</span>
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
              {property.floor > 0 ? <Check className="w-3 h-3 text-emerald-500" /> : <X className="w-3 h-3 text-gray-600" />}
            </div>
            <div className="flex items-center gap-1" title="Pets">
              <span className="text-lg leading-none pb-1">🐶</span>
              <X className="w-3 h-3 text-gray-600" />
            </div>
        </div>

        <div className="w-px h-4 bg-gray-700 mr-5 hidden sm:block"></div>

        <div className="flex items-baseline gap-1 ml-auto">
            <span className="text-gray-500">€</span>
            <span className="text-white font-bold text-lg">{property.price}/mo</span>
        </div>
      </div>

      {/* Media Tabs Buttons */}
      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setIsTourOpen(true)}
          className="flex-1 bg-emerald-500 text-white font-bold py-3 text-sm rounded-md hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-900/20"
        >
          3D Tour
        </button>
        <button 
          onClick={() => setIsFloorPlanOpen(true)}
          className="flex-1 bg-transparent border border-[#2E323A] text-white font-medium py-3 text-sm rounded-md hover:bg-[#2A2E35] transition-colors"
        >
          Floor Plan
        </button>
        <button 
          onClick={() => setIsGalleryOpen(true)}
          className="flex-1 bg-transparent border border-[#2E323A] text-white font-medium py-3 text-sm rounded-md hover:bg-[#2A2E35] transition-colors"
        >
          Gallery
        </button>
      </div>

      {/* Description */}
      <div className="mb-8">
        <p className="text-gray-400 text-[13px] leading-relaxed font-normal">
          {property.description}
        </p>
      </div>

      {/* Data Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-base font-bold text-white mb-3">Costs</h3>
          <div className="divide-y divide-[#272A30]">
            <DetailRow label="Net rent (Kaltmiete)" value={`€${property.netRent}`} />
            <DetailRow label="Ancillary costs (Nebenkosten)" value={`€${property.ancillaryCosts}`} />
            <DetailRow label="Heating costs (Heizkosten)" value={`€${property.heatingCosts}`} />
            <DetailRow label="Heating incl. in ancillaries" value={property.heatingIncluded ? 'Yes' : 'No'} />
            <DetailRow label="Total rent (Warmmiete)" value={`€${property.price}`} />
            <DetailRow label="Deposit (Kaution)" value={property.deposit} />
            <DetailRow label="Price per m²" value={`€${property.pricePerSqm} / m²`} />
          </div>
        </div>

        <div>
          <h3 className="text-base font-bold text-white mb-3">Building details</h3>
          <div className="divide-y divide-[#272A30]">
            <DetailRow label="Building type" value={property.buildingType} />
            <DetailRow label="Construction year" value={property.builtYear} />
            <DetailRow label="Renovation year" value={property.renovationYear || property.builtYear} />
            <DetailRow label="Floors in building" value={property.totalFloors} />
            <DetailRow label="Type of heating" value={property.heatingType} />
            <DetailRow label="Energy certificate" value={property.energyCertificate} />
            <div className="flex justify-between items-center py-3 border-b border-[#272A30]">
              <span className="text-[#9CA3AF] text-[13px] font-medium">End energy demand</span>
              <span className="text-[13px] font-bold text-white">{property.endEnergyDemand}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-[#272A30]">
              <span className="text-[#9CA3AF] text-[13px] font-medium">Energy efficiency category</span>
              <span className="bg-[#4D3800] text-[#FFD700] border border-[#664D00] w-6 h-6 flex items-center justify-center rounded-sm text-xs font-bold">
                {property.energyEfficiencyClass}
              </span>
            </div>
             <DetailRow label="Energy source" value="District heating" />
             <DetailRow label="Parking" value={property.parking} />
          </div>
        </div>
      </div>

      {/* Action Buttons - Conditionally Rendered */}
      {!hideActions && (
        <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pb-2">
          <button 
            onClick={onBookViewing}
            className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 rounded-md transition-colors"
          >
            Book Viewing
          </button>
          <button className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 rounded-md transition-colors">
            Download MagicPlan Report
          </button>
          <button 
            onClick={() => setIsShareModalOpen(true)}
            className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 rounded-md transition-colors"
          >
            Share Apartment
          </button>
          <button 
            onClick={() => setIsChatModalOpen(true)}
            className="bg-[#1C1F24] hover:bg-[#2A2E35] text-white border border-[#2E323A] font-semibold text-sm py-3 rounded-md transition-colors"
          >
            Chat
          </button>
        </div>
      )}
    </div>
  );
};

export default PropertyDetails;
