import React, { useState, useMemo } from 'react';
import { Search, Plus, ChevronDown, Filter } from 'lucide-react';
import MarketPostModal from './MarketPostModal';
import MarketSplitView from './MarketSplitView';
import { Property } from '../types';
import { formatPropertyAddress } from '../utils/formatPropertyAddress';

interface MarketplaceProps {
  onListingClick: (listing: any) => void;
  properties?: Property[]; // Optional: if provided, use these instead of loading
  loading?: boolean; // Optional: loading state from parent
  error?: string | null; // Optional: error message from parent
  coverPhotoUrlByPropertyId?: Record<string, string>; // MP-PROD-01: cover photo signed URLs for cards
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

const Marketplace: React.FC<MarketplaceProps> = ({ onListingClick, properties: propsProperties, loading: propsLoading, error: propsError, coverPhotoUrlByPropertyId = {} }) => {
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  
  // Use properties from props if provided, otherwise empty array
  const properties = propsProperties || [];
  const loading = propsLoading !== undefined ? propsLoading : false;
  const error = propsError || null;
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState('Any');
  const [roomFilter, setRoomFilter] = useState('Any');

  // Filtering Logic - convert Property to marketplace listing format (MP-PROD-01: card image = cover URL or fallback)
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
        location: formatPropertyAddress(property),
        price: property.price || 0,
        rooms: property.rooms || 0,
        area: property.area || 0,
        image: coverPhotoUrlByPropertyId[property.id] || property.image || property.images?.[0] || '',
        postedBy: 'Property Owner',
        timeAgo: 'Recently',
        description: property.description || ''
      }));
  }, [properties, searchQuery, priceFilter, roomFilter, coverPhotoUrlByPropertyId]);

  return (
    <div className="h-[100dvh] flex flex-col min-h-0 bg-[#111315] font-sans">
      <MarketPostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />

      <div className="flex-shrink-0 p-6 lg:p-8 pb-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Community Marketplace</h1>
          <p className="text-gray-400 text-sm">Find sublets, WG rooms, and private listings from the community.</p>
        </div>

        <div className="bg-[#1C1F24] p-5 rounded-xl border border-gray-800 mb-6 shadow-lg">
          <div className="flex flex-col md:flex-row gap-4 items-end">
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

        <button
          onClick={() => setIsPostModalOpen(true)}
          className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/50 text-emerald-500 font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all group"
        >
          <div className="bg-emerald-500 text-white p-1 rounded-md group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <span>Post a New Ad to Market</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <MarketSplitView
          properties={properties}
          filteredListings={filteredListings}
          loading={loading}
          error={error}
          onListingClick={onListingClick}
          onClearFilters={() => {
            setPriceFilter('Any');
            setRoomFilter('Any');
            setSearchQuery('');
          }}
        />
      </div>
    </div>
  );
};

export default Marketplace;
