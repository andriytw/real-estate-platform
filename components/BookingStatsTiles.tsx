import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, LogIn, LogOut, Sparkles, Bell } from 'lucide-react';
import { Booking, CalendarEvent, Property } from '../types';

interface BookingStatsTilesProps {
  // ⚠️ Mixed calendar data (reservations + offers + bookings). MUST NOT be used for operational stats
  reservations: Booking[];
  // ✅ ONLY confirmed bookings from bookings table (created after invoice is marked as PAID)
  confirmedBookings: Booking[];
  adminEvents: CalendarEvent[];
  properties: Property[];
  initialDate?: Date;
  onTileClick: (type: 'checkin' | 'checkout' | 'cleaning' | 'reminder', date: Date, items: any[]) => void;
}

const formatDateISO = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (date: Date, today: Date): string => {
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
};

const BookingStatsTiles: React.FC<BookingStatsTilesProps> = ({
  reservations, // Mixed calendar data - NOT used for operational stats
  confirmedBookings = [], // ONLY confirmed bookings from bookings table (default to empty array)
  adminEvents,
  properties,
  initialDate,
  onTileClick,
}) => {
  // Safety guard: Filter only truly confirmed bookings
  // Confirmed bookings have sourceInvoiceId (created by RPC when invoice paid)
  // or status 'paid'/'invoiced' (legacy confirmed bookings)
  const safeConfirmed = useMemo(() => {
    return confirmedBookings.filter(
      b => (b as any).sourceInvoiceId || (b as any).source_invoice_id || b.status === 'paid' || b.status === 'invoiced'
    );
  }, [confirmedBookings]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [checkInDate, setCheckInDate] = useState<Date>(() => {
    const d = initialDate ? new Date(initialDate) : new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [checkOutDate, setCheckOutDate] = useState<Date>(() => {
    const d = initialDate ? new Date(initialDate) : new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [cleaningDate, setCleaningDate] = useState<Date>(() => {
    const d = initialDate ? new Date(initialDate) : new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [reminderDate, setReminderDate] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const changeDate = (setter: (date: Date) => void, currentDate: Date, offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + offset);
    newDate.setHours(0, 0, 0, 0);
    setter(newDate);
  };

  // Get check-ins for a specific date - ONLY from confirmed bookings
  const getCheckInsForDate = (date: Date): Booking[] => {
    const dateStr = formatDateISO(date);
    return safeConfirmed.filter(booking => booking.start === dateStr);
  };

  // Get check-outs for a specific date - ONLY from confirmed bookings
  const getCheckOutsForDate = (date: Date): Booking[] => {
    const dateStr = formatDateISO(date);
    return safeConfirmed.filter(booking => booking.end === dateStr);
  };

  // Get cleanings for a specific date
  const getCleaningsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = formatDateISO(date);
    return adminEvents.filter(event => 
      event.type === 'Putzen' && event.date === dateStr
    );
  };

  // Get check-outs in N days from a base date - ONLY from confirmed bookings
  const getCheckOutsInDays = (baseDate: Date, days: number): Booking[] => {
    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = formatDateISO(targetDate);
    return safeConfirmed.filter(booking => booking.end === dateStr);
  };

  const checkIns = getCheckInsForDate(checkInDate);
  const checkOuts = getCheckOutsForDate(checkOutDate);
  const cleanings = getCleaningsForDate(cleaningDate);
  // For reminders, show checkouts on the reminderDate (which starts at today + 2 days)
  const reminders = getCheckOutsInDays(reminderDate, 0);

  const handleTileClick = (type: 'checkin' | 'checkout' | 'cleaning' | 'reminder', date: Date, items: any[]) => {
    onTileClick(type, date, items);
  };

  const Tile: React.FC<{
    title: string;
    count: number;
    date: Date;
    icon: React.ReactNode;
    color: string;
    onDateChange: (offset: number) => void;
    onClick: () => void;
  }> = ({ title, count, date, icon, color, onDateChange, onClick }) => (
    <div
      className={`bg-[#1C1F24] border border-gray-800 rounded-lg p-4 flex-1 cursor-pointer hover:bg-[#25282D] transition-colors ${color}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs text-gray-400 font-medium">{title}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDateChange(-1);
          }}
          className="p-1 hover:bg-gray-800 rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold text-white">{count}</span>
          <span className="text-xs text-gray-500 mt-1">{formatDateDisplay(date, today)}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDateChange(1);
          }}
          className="p-1 hover:bg-gray-800 rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-400 hover:text-white" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex gap-4 w-full">
      <Tile
        title="Check-ins"
        count={checkIns.length}
        date={checkInDate}
        icon={<LogIn className="w-4 h-4 text-purple-500" />}
        color="border-purple-500/30"
        onDateChange={(offset) => changeDate(setCheckInDate, checkInDate, offset)}
        onClick={() => handleTileClick('checkin', checkInDate, checkIns)}
      />
      <Tile
        title="Check-outs"
        count={checkOuts.length}
        date={checkOutDate}
        icon={<LogOut className="w-4 h-4 text-blue-500" />}
        color="border-blue-500/30"
        onDateChange={(offset) => changeDate(setCheckOutDate, checkOutDate, offset)}
        onClick={() => handleTileClick('checkout', checkOutDate, checkOuts)}
      />
      <Tile
        title="Cleanings"
        count={cleanings.length}
        date={cleaningDate}
        icon={<Sparkles className="w-4 h-4 text-orange-500" />}
        color="border-orange-500/30"
        onDateChange={(offset) => changeDate(setCleaningDate, cleaningDate, offset)}
        onClick={() => handleTileClick('cleaning', cleaningDate, cleanings)}
      />
      <Tile
        title="Reminders (2 days)"
        count={reminders.length}
        date={reminderDate}
        icon={<Bell className="w-4 h-4 text-yellow-500" />}
        color="border-yellow-500/30"
        onDateChange={(offset) => changeDate(setReminderDate, reminderDate, offset)}
        onClick={() => handleTileClick('reminder', reminderDate, reminders)}
      />
    </div>
  );
};

export default BookingStatsTiles;

