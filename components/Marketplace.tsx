import React, { useState, useMemo } from 'react';
import MarketPostModal from './MarketPostModal';
import MarketSplitView from './MarketSplitView';
import { Property } from '../types';
import { getPropertyStats } from '../utils/propertyStats';

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

  const [priceFilter, setPriceFilter] = useState('Any');
  const [roomFilter, setRoomFilter] = useState('Any');
  const [bedsFilter, setBedsFilter] = useState<'any' | '1' | '2' | '3' | '4' | '5'>('any');

  const filteredProperties = useMemo(() => {
    return properties.filter((property) => {
      let matchesPrice = true;
      if (priceFilter !== 'Any' && property.price != null) {
        matchesPrice = property.price <= parseInt(priceFilter, 10);
      }

      let matchesRooms = true;
      if (roomFilter !== 'Any') {
        matchesRooms = getPropertyStats(property).rooms >= parseFloat(roomFilter);
      }

      const { beds } = getPropertyStats(property);
      const matchesBeds = bedsFilter === 'any' || beds >= Number(bedsFilter);

      return matchesPrice && matchesRooms && matchesBeds;
    });
  }, [properties, priceFilter, roomFilter, bedsFilter]);

  return (
    <div className="h-[100dvh] flex flex-col min-h-0 bg-[#111315] font-sans">
      <MarketPostModal isOpen={isPostModalOpen} onClose={() => setIsPostModalOpen(false)} />

      <div className="flex-shrink-0 p-6 lg:p-8 pb-2">
        <h1 className="text-2xl font-bold text-white mb-1">Community Marketplace</h1>
        <p className="text-gray-400 text-sm">Find sublets, WG rooms, and private listings from the community.</p>
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
          }}
        />
      </div>
    </div>
  );
};

export default Marketplace;
