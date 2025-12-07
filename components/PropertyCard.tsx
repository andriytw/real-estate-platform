import React, { useState } from 'react';
import { MapPin, Home, Ruler, Euro, ImageOff } from 'lucide-react';
import { Property } from '../types';

interface PropertyCardProps {
  property: Property;
  isSelected?: boolean;
  onClick: () => void;
  onBook?: () => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, isSelected = false, onClick, onBook }) => {
  const [imageError, setImageError] = useState(false);

  // Effect to reset error state if property changes, giving a chance to reload correct image
  React.useEffect(() => {
    setImageError(false);
  }, [property.image]);

  if (!property) return null;

  return (
    <div 
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-xl cursor-pointer transition-all duration-300 ease-out group bg-[#1C1F24]
        hover:-translate-y-1
        ${isSelected 
          ? 'ring-1 ring-emerald-500 shadow-lg shadow-emerald-900/10 bg-[#23262b]' 
          : 'hover:bg-[#23262b] border border-transparent hover:border-gray-700'
        }
      `}
    >
      {/* Image Background */}
      <div className="relative h-40 w-full overflow-hidden bg-gray-800">
        {!imageError ? (
          <img 
            src={property.image} 
            alt={property.title} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#25282C] flex-col gap-2">
            <Home className="w-8 h-8 text-gray-600" />
            <span className="text-xs text-gray-500">No image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1C1F24] via-transparent to-transparent opacity-90" />
        
        {/* Location Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm border border-white/5 rounded px-2 py-1 z-10">
          <MapPin className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-medium text-white truncate max-w-[200px]">
            {property.title.split(',')[0]}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4 -mt-6 relative z-10">
         <div className="flex justify-between items-end">
            <div>
               <h3 className="text-sm font-bold text-white truncate mb-1">{property.address}</h3>
               <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Home className="w-3 h-3" /> {property.rooms}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                  <span className="flex items-center gap-1">
                    <Ruler className="w-3 h-3" /> {property.area}m²
                  </span>
               </div>
            </div>
            <div className="text-right">
               <div className="text-sm font-bold text-white">€{property.price}<span className="text-xs text-gray-500 font-normal">/mo</span></div>
            </div>
         </div>
         {onBook && (
           <button
             onClick={(e) => {
               e.stopPropagation();
               onBook();
             }}
             className="mt-3 w-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors"
           >
             Book Viewing
           </button>
         )}
      </div>
    </div>
  );
};

export default PropertyCard;