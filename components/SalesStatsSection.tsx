/**
 * Shared stats section: 4 tiles (Check-ins, Check-outs, Cleanings, Reminders) + BookingListModal.
 * Used by Sales Department → Dashboard only. Extracted from Rent Calendar; behavior 1:1 preserved.
 */
import React, { useState, useMemo } from 'react';
import { Booking, CalendarEvent, Property } from '../types';
import { ReservationData, OfferData, InvoiceData } from '../types';
import BookingStatsTiles from './BookingStatsTiles';
import BookingListModal from './BookingListModal';
import { useSalesAllBookings } from '../hooks/useSalesAllBookings';

export interface SalesStatsSectionProps {
  reservations: ReservationData[];
  offers: OfferData[];
  confirmedBookings: Booking[];
  adminEvents: CalendarEvent[];
  properties: Property[];
  invoices: InvoiceData[];
}

const SalesStatsSection: React.FC<SalesStatsSectionProps> = ({
  reservations,
  offers,
  confirmedBookings,
  adminEvents,
  properties,
  invoices,
}) => {
  const { allBookings } = useSalesAllBookings({
    reservations,
    offers,
    confirmedBookings,
    invoices,
    adminEvents,
  });

  const TODAY = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'checkin' | 'checkout' | 'cleaning' | 'reminder'>('checkin');
  const [statsModalItems, setStatsModalItems] = useState<(Booking | CalendarEvent)[]>([]);
  const [statsModalDate, setStatsModalDate] = useState<Date>(new Date());
  const [statsModalTitle, setStatsModalTitle] = useState<string>('');

  const handleStatsTileClick = (
    type: 'checkin' | 'checkout' | 'cleaning' | 'reminder',
    date: Date,
    items: (Booking | CalendarEvent)[]
  ) => {
    const titles = {
      checkin: 'Check-ins',
      checkout: 'Check-outs',
      cleaning: 'Cleanings',
      reminder: 'Reminders (Check-outs in 2 days)',
    };
    setStatsModalType(type);
    setStatsModalItems(items);
    setStatsModalDate(date);
    setStatsModalTitle(titles[type]);
    setIsStatsModalOpen(true);
  };

  return (
    <>
      <div className="px-4 py-4 bg-[#111315] border-b border-gray-800">
        <BookingStatsTiles
          reservations={allBookings}
          confirmedBookings={confirmedBookings}
          adminEvents={adminEvents}
          properties={properties}
          initialDate={TODAY}
          onTileClick={handleStatsTileClick}
        />
      </div>
      <BookingListModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        title={statsModalTitle}
        items={statsModalItems}
        type={statsModalType}
        properties={properties}
        date={statsModalDate}
      />
    </>
  );
};

export default SalesStatsSection;
