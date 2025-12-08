
import React, { useState, useMemo } from 'react';
import { Search, MapPin, Euro, Home, Clock, Plus, ChevronDown, Filter, AlertCircle } from 'lucide-react';
import MarketPostModal from './MarketPostModal';
import { Property } from '../types';

interface MarketplaceProps {
  onListingClick: (listing: any) => void;
  properties?: Property[]; // Optional: if provided, use these instead of loading
  loading?: boolean; // Optional: loading state from parent
  error?: string | null; // Optional: error message from parent
}

const MarketFilterDropdown: React.FC<{ 
  label: string; 
  value: string; 
  options: { label: string, value: string }[]; 
  onChange: (val: string) => void 
}> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1 min-w-[140px]">
    <label className="text-xs text-gray-400 font-medium ml-1">{label}</label>
    <div className="relative">
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-[#111315] text-sm text-white border border-gray-700 hover:border-gray-600 rounded-lg py-2.5 px-3 pr-8 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
      >
        {options.map((opt, idx) => (
          <option key={idx} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  </div>
);

const Marketplace: React.FC<MarketplaceProps> = ({ onListingClick, properties: propsProperties, loading: propsLoading, error: propsError }) => {
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  
  // Use properties from props if provided, otherwise empty array
  const properties = propsProperties || [];
  const loading = propsLoading !== undefined ? propsLoading : false;
  const error = propsError || null;
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState('Any');
  const [roomFilter, setRoomFilter] = useState('Any');

  // Filtering Logic - convert Property to marketplace listing format
  const filteredListings = useMemo(() => {
    return properties
      .filter(property => {
        // Search Text
        const matchesSearch = 
          property.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
          property.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (property.city && property.city.toLowerCase().includes(searchQuery.toLowerCase()));

        // Price Filter (Max Price)
        let matchesPrice = true;
        if (priceFilter !== 'Any' && property.price) {
          matchesPrice = property.price <= parseInt(priceFilter);
        }

        // Room Filter (Min Rooms)
        let matchesRooms = true;
        if (roomFilter !== 'Any') {
          matchesRooms = property.rooms >= parseFloat(roomFilter);
        }

        return matchesSearch && matchesPrice && matchesRooms;
      })
      .map(property => ({
        id: property.id,
        title: property.title,
        location: property.fullAddress || `${property.address}, ${property.city}`,
        price: property.price || 0,
        rooms: property.rooms || 0,
        area: property.area || 0,
        image: property.image || property.images?.[0] || '',
        postedBy: 'Property Owner',
        timeAgo: 'Recently',
        description: property.description || ''
      }));
  }, [properties, searchQuery, priceFilter, roomFilter]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#111315] p-6 lg:p-8 font-sans">
      
      <MarketPostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Community Marketplace</h1>
        <p className="text-gray-400 text-sm">Find sublets, WG rooms, and private listings from the community.</p>
      </div>

      {/* Filters Section */}
      <div className="bg-[#1C1F24] p-5 rounded-xl border border-gray-800 mb-6 shadow-lg">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          
          {/* Search */}
          <div className="flex-1 w-full">
            <label className="text-xs text-gray-400 font-medium ml-1 mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for rooms, districts..." 
                className="w-full bg-[#111315] border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Dropdowns */}
          <div className="flex gap-3 w-full md:w-auto">
             <MarketFilterDropdown 
                label="Max Price" 
                value={priceFilter}
                onChange={setPriceFilter}
                options={[
                  { label: 'Any Price', value: 'Any' },
                  { label: 'Up to €500', value: '500' },
                  { label: 'Up to €800', value: '800' },
                  { label: 'Up to €1000', value: '1000' },
                  { label: 'Up to €1500', value: '1500' },
                ]} 
             />
             <MarketFilterDropdown 
                label="Min Rooms" 
                value={roomFilter}
                onChange={setRoomFilter}
                options={[
                  { label: 'Any', value: 'Any' },
                  { label: '1+ Rooms', value: '1' },
                  { label: '2+ Rooms', value: '2' },
                  { label: '3+ Rooms', value: '3' },
                ]} 
             />
          </div>
        </div>
      </div>

      {/* Post Ad Button (Located under filters as requested) */}
      <button 
        onClick={() => setIsPostModalOpen(true)}
        className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-500 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all mb-8 group"
      >
        <div className="bg-emerald-500 text-white p-1 rounded-md group-hover:scale-110 transition-transform">
          <Plus className="w-5 h-5" />
        </div>
        <span>Post a New Ad to Market</span>
      </button>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {loading ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-lg font-medium">Loading properties...</p>
          </div>
        ) : error ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-red-400">
            <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Failed to load properties</p>
            <p className="text-sm text-gray-500">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filteredListings.length > 0 ? (
          filteredListings.map((item) => (
            <div 
              key={item.id} 
              onClick={() => onListingClick(item)}
              className="bg-[#1C1F24] border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-all hover:-translate-y-1 cursor-pointer group"
            >
              
              <div className="h-48 overflow-hidden relative">
                 <img src={item.image} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                 <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                    {item.timeAgo}
                 </div>
              </div>

              <div className="p-4">
                 <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white truncate flex-1 mr-2">{item.title}</h3>
                    <span className="text-emerald-500 font-bold">€{item.price}</span>
                 </div>
                 
                 <div className="flex items-center gap-1 text-gray-400 text-xs mb-4">
                    <MapPin className="w-3 h-3" />
                    {item.location}
                 </div>

                 <div className="flex items-center gap-4 text-xs text-gray-300 mb-4 bg-[#111315] p-2 rounded border border-gray-800">
                    <div className="flex items-center gap-1">
                       <Home className="w-3 h-3 text-gray-500" />
                       {item.rooms} Rm
                    </div>
                    <div className="flex items-center gap-1">
                       <div className="w-1 h-1 rounded-full bg-gray-600"></div>
                       {item.area} m²
                    </div>
                 </div>

                 <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                    <span className="text-xs text-gray-500">Posted by <span className="text-gray-300">{item.postedBy}</span></span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onListingClick(item);
                      }}
                      className="text-xs font-bold text-emerald-500 hover:text-emerald-400"
                    >
                      Details
                    </button>
                 </div>
              </div>

            </div>
          ))
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
            <Filter className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-lg font-medium">No listings match your filters.</p>
            <button 
              onClick={() => {setPriceFilter('Any'); setRoomFilter('Any'); setSearchQuery('')}}
              className="mt-2 text-emerald-500 hover:underline text-sm"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Marketplace;
