
import React from 'react';
import { X, MapPin, Home, Ruler, User, Phone, Mail, Calendar, ShieldCheck } from 'lucide-react';

interface MarketDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: any; // Using 'any' for simplicity based on mock structure
}

const MarketDetailsModal: React.FC<MarketDetailsModalProps> = ({ isOpen, onClose, listing }) => {
  if (!isOpen || !listing) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 font-sans">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Close Button (Mobile) */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-20 md:hidden bg-black/50 p-2 rounded-full text-white"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Image */}
        <div className="w-full md:w-1/2 h-64 md:h-auto bg-gray-800 relative">
          <img 
            src={listing.image} 
            alt={listing.title} 
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg text-white text-sm font-medium border border-white/10">
            {listing.timeAgo}
          </div>
        </div>

        {/* Right Column: Details */}
        <div className="w-full md:w-1/2 flex flex-col bg-[#1C1F24] h-full overflow-y-auto">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-800 relative">
                <button 
                  onClick={onClose}
                  className="absolute top-6 right-6 hidden md:block text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                
                <div className="flex items-start gap-1 text-emerald-500 mb-2">
                  <MapPin className="w-4 h-4 mt-0.5" />
                  <span className="text-sm font-medium">{listing.location}</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{listing.title}</h2>
                <div className="text-3xl font-bold text-white">€{listing.price}<span className="text-base font-normal text-gray-500">/month</span></div>
            </div>

            {/* Specs Grid */}
            <div className="grid grid-cols-3 gap-4 p-6 border-b border-gray-800">
                <div className="bg-[#111315] p-3 rounded-lg border border-gray-800 text-center">
                   <div className="flex justify-center mb-1"><Home className="w-5 h-5 text-gray-500" /></div>
                   <span className="block text-lg font-bold text-white">{listing.rooms}</span>
                   <span className="text-xs text-gray-500">Rooms</span>
                </div>
                <div className="bg-[#111315] p-3 rounded-lg border border-gray-800 text-center">
                   <div className="flex justify-center mb-1"><Ruler className="w-5 h-5 text-gray-500" /></div>
                   <span className="block text-lg font-bold text-white">{listing.area}</span>
                   <span className="text-xs text-gray-500">m²</span>
                </div>
                <div className="bg-[#111315] p-3 rounded-lg border border-gray-800 text-center">
                   <div className="flex justify-center mb-1"><Calendar className="w-5 h-5 text-gray-500" /></div>
                   <span className="block text-lg font-bold text-white">ASAP</span>
                   <span className="text-xs text-gray-500">Available</span>
                </div>
            </div>

            {/* Description */}
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-wider text-gray-400">About this listing</h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                {listing.description || "No description provided by the seller."}
              </p>
            </div>

            {/* Seller Profile */}
            <div className="p-6 mt-auto bg-[#16181D]">
              <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-gray-400">Listed by</h3>
              <div className="flex items-center gap-4 mb-6">
                 <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 font-bold text-lg border border-emerald-500/30">
                    {listing.postedBy.charAt(0)}
                 </div>
                 <div>
                    <div className="flex items-center gap-2">
                       <h4 className="text-white font-bold">{listing.postedBy}</h4>
                       <span title="Verified User" className="flex items-center">
                         <ShieldCheck className="w-4 h-4 text-blue-400" />
                       </span>
                    </div>
                    <p className="text-xs text-gray-500">Member since 2023</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <button className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg font-bold transition-colors">
                    <Phone className="w-4 h-4" />
                    Call Seller
                 </button>
                 <button className="flex items-center justify-center gap-2 bg-[#2A2E35] hover:bg-[#32363F] text-white border border-gray-700 py-3 rounded-lg font-bold transition-colors">
                    <Mail className="w-4 h-4" />
                    Message
                 </button>
              </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default MarketDetailsModal;
