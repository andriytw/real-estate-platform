import React, { useState, useMemo, useEffect, useCallback } from 'react';
import MarketPostModal from './MarketPostModal';
import MarketSplitView from './MarketSplitView';
import { Property } from '../types';
import { getPropertyStats } from '../utils/propertyStats';
import { fetchBlockedPropertyIds } from '../services/marketAvailabilityService';

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

  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string> | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const datesValid = useMemo(() => {
    const from = dateFrom?.trim().slice(0, 10);
    const to = dateTo?.trim().slice(0, 10);
    return !!from && !!to && from < to;
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!datesValid) {
      setBlockedIds(null);
      return;
    }
    const from = dateFrom!.trim().slice(0, 10);
    const to = dateTo!.trim().slice(0, 10);
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      setLoadingAvailability(true);
      fetchBlockedPropertyIds(from, to)
        .then((ids) => {
          if (!cancelled) setBlockedIds(ids);
        })
        .finally(() => {
          if (!cancelled) setLoadingAvailability(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [datesValid, dateFrom, dateTo]);

  const clearDates = useCallback(() => {
    setDateFrom(null);
    setDateTo(null);
    setBlockedIds(null);
  }, []);

  const filteredProperties = useMemo(() => {
    let list = properties.filter((property) => {
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

    if (blockedIds != null) {
      list = list.filter((p) => !blockedIds.has(p.id));
    }
    return list;
  }, [properties, priceFilter, roomFilter, bedsFilter, blockedIds]);

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
            clearDates();
          }}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          onClearDates={clearDates}
          loadingAvailability={loadingAvailability}
        />
      </div>
    </div>
  );
};

export default Marketplace;
