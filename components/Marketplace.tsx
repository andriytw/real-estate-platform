import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import MarketPostModal from './MarketPostModal';
import MarketSplitView from './MarketSplitView';
import { Property } from '../types';

interface MarketplaceProps {
  onListingClick: (listing: Property) => void;
  properties?: Property[];
  loading?: boolean;
  error?: string | null;
  coverPhotoUrlByPropertyId?: Record<string, string>;
}

const Marketplace: React.FC<MarketplaceProps> = ({ onListingClick, properties: propsProperties, loading: propsLoading, error: propsError, coverPhotoUrlByPropertyId = {} }) => {
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  const properties = propsProperties || [];
  const loading = propsLoading !== undefined ? propsLoading : false;
  const error = propsError || null;

  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState('Any');
  const [roomFilter, setRoomFilter] = useState('Any');
  const [bedsFilter, setBedsFilter] = useState<'any' | '1' | '2' | '3' | '4' | '5'>('any');

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      const matchesSearch =
        property.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (property.address && property.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (property.city && property.city.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesPrice = true;
      if (priceFilter !== 'Any' && property.price != null) {
        matchesPrice = property.price <= parseInt(priceFilter, 10);
      }

      let matchesRooms = true;
      if (roomFilter !== 'Any') {
        matchesRooms = (property.rooms ?? 0) >= parseFloat(roomFilter);
      }

      const beds = property.details?.beds ?? 0;
      const matchesBeds = bedsFilter === 'any' || beds >= Number(bedsFilter);

      return matchesSearch && matchesPrice && matchesRooms && matchesBeds;
    });
  }, [properties, searchQuery, priceFilter, roomFilter, bedsFilter]);

  return (
    <div className="h-[100dvh] flex flex-col min-h-0 bg-[#111315] font-sans">
      <MarketPostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />

      <div className="flex-shrink-0 p-6 lg:p-8 pb-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Community Marketplace</h1>
          <p className="text-gray-400 text-sm">Find sublets, WG rooms, and private listings from the community.</p>
        </div>

        <div className="bg-[#1C1F24] p-5 rounded-xl border border-gray-800 mb-6 shadow-lg">
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
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <MarketSplitView
          properties={properties}
          filteredProperties={filteredProperties}
          coverPhotoUrlByPropertyId={coverPhotoUrlByPropertyId}
          loading={loading}
          error={error}
          onListingClick={onListingClick}
          onPostAdClick={() => setIsPostModalOpen(true)}
          priceFilter={priceFilter}
          roomFilter={roomFilter}
          bedsFilter={bedsFilter}
          setPriceFilter={setPriceFilter}
          setRoomFilter={setRoomFilter}
          setBedsFilter={setBedsFilter}
          onClearFilters={() => {
            setPriceFilter('Any');
            setRoomFilter('Any');
            setBedsFilter('any');
            setSearchQuery('');
          }}
        />
      </div>
    </div>
  );
};

export default Marketplace;
