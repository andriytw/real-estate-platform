

import React, { useState, useEffect, useRef } from 'react';
import { RequestData, Property } from '../types';
import { ChevronLeft, ChevronRight, Filter, X, Plus, Calculator, Briefcase, User, Save, FileText, CreditCard } from 'lucide-react';
import { Booking, ReservationData, OfferData, InvoiceData, CalendarEvent, BookingStatus } from '../types';
import BookingDetailsModal from './BookingDetailsModal';
import BookingStatsTiles from './BookingStatsTiles';
import BookingListModal from './BookingListModal';
import { getBookingColor, getBookingBorderStyle, getBookingStyle } from '../bookingUtils';

interface SalesCalendarProps {
  onSaveOffer?: (offer: OfferData) => void;
  onSaveReservation?: (reservation: ReservationData) => void;
  onDeleteReservation?: (id: number) => void;
  onAddLead?: (bookingData: any) => void; // New Prop for Lead creation
  reservations?: ReservationData[];
  offers?: OfferData[];
  invoices?: InvoiceData[];
  adminEvents?: CalendarEvent[];
  prefilledRequestData?: Partial<RequestData>; // Для префілу форми з Request
  properties?: Property[]; // Реальні об'єкти з Properties List
}

const INITIAL_BOOKINGS: Booking[] = [
  { 
      id: 1, roomId: 'L1', start: '2025-11-05', end: '2025-11-12', guest: 'Hans Müller', color: 'bg-emerald-600', checkInTime: '15:00', checkOutTime: '11:00',
      status: 'Confirmed', price: '720.00 EUR', balance: '-720.00 EUR', guests: '1 Adult', unit: 'K1.L1.Shev', 
      comments: 'Guest requested a quiet room', paymentAccount: 'Visa **** 1111', company: 'N/A', 
      ratePlan: 'Non Refundable', guarantee: 'Prepayment', cancellationPolicy: 'No free cancellation', 
      noShowPolicy: 'No free no-show', channel: 'Direct', type: 'GUEST',
      address: 'Musterstraße 1, Berlin', phone: '+49 123 456789', email: 'hans@example.com',
      pricePerNight: 120, taxRate: 19, totalGross: '720.00', guestList: [{firstName: 'Hans', lastName: 'Müller'}],
      clientType: 'Private', firstName: 'Hans', lastName: 'Müller'
  },
  { 
      id: 2, roomId: 'B2', start: '2025-11-10', end: '2025-11-15', guest: 'Eva Schmidt', color: 'bg-emerald-600', checkInTime: '14:00', checkOutTime: '10:00',
      status: 'In-House', price: '1200.00 EUR', balance: '0.00 EUR', guests: '6 Adults', unit: 'B2.Berl.H22', 
      comments: 'VIP Client', paymentAccount: 'MasterCard **** 5678', company: 'Dream Co.', 
      ratePlan: 'Flexible', guarantee: 'Credit Card', cancellationPolicy: 'Free up to 24h', 
      noShowPolicy: 'Charge 1st night', channel: 'Booking.com', type: 'GUEST',
      address: 'Testweg 2, Hamburg', phone: '+49 987 654321', email: 'eva@example.com',
      pricePerNight: 240, taxRate: 19, totalGross: '1200.00', guestList: [{firstName: 'Eva', lastName: 'Schmidt'}],
      clientType: 'Private', firstName: 'Eva', lastName: 'Schmidt'
  },
  { 
      id: 9, roomId: 'B2', start: '2025-11-20', end: '2025-11-23', guest: 'Maintenance', color: 'bg-red-600', checkInTime: '08:00', checkOutTime: '17:00',
      status: 'Out of Service', price: 'N/A', balance: 'N/A', guests: '0', unit: 'B2.Berl.H22', 
      comments: 'Roof repair.', paymentAccount: 'Internal', company: 'Tech Dept', 
      ratePlan: 'Maintenance', guarantee: 'N/A', cancellationPolicy: 'N/A', 
      noShowPolicy: 'N/A', channel: 'Internal', type: 'BLOCK'
  }
];

const DAY_WIDTH = 48; // px
const NUM_DAYS = 30;

const parseDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDateISO = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateDiffInDays = (date1: Date, date2: Date) => {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const diffTime = date2.getTime() - date1.getTime();
  return Math.round(diffTime / MS_PER_DAY);
};

// Initial Empty Form Data Generator
const getInitialFormData = () => ({
  roomId: '',
  clientType: 'Private' as 'Private' | 'Company',
  firstName: '',
  lastName: '',
  companyName: '',
  address: '',
  phone: '',
  email: '',
  pricePerNight: 100,
  taxRate: 19, // percent
  startDate: '',
  endDate: '',
});

const SalesCalendar: React.FC<SalesCalendarProps> = ({
  onSaveOffer,
  onSaveReservation,
  onDeleteReservation,
  onAddLead,
  reservations = [],
  offers = [],
  invoices = [],
  adminEvents = [],
  prefilledRequestData,
  properties = [],
}) => {
  // State
  const [bookings, setBookings] = useState<Booking[]>([]); // Без демо-бронювань

  // Поточна дата / місяць
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [cityFilter, setCityFilter] = useState('ALL');
  const [hoveredBooking, setHoveredBooking] = useState<{booking: Booking, x: number, y: number} | null>(null);
  
  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{roomId: string, date: Date} | null>(null);
  const [dragEnd, setDragEnd] = useState<{roomId: string, date: Date} | null>(null);
  const lastMonthSwitchRef = useRef<number>(0); // Для debounce перемикання місяця

  // Add Booking Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // View Details Modal State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Stats Tiles Modal State
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'checkin' | 'checkout' | 'cleaning' | 'reminder'>('checkin');
  const [statsModalItems, setStatsModalItems] = useState<(Booking | CalendarEvent)[]>([]);
  const [statsModalDate, setStatsModalDate] = useState<Date>(new Date());
  const [statsModalTitle, setStatsModalTitle] = useState<string>('');

  // New Booking Form State
  const [formData, setFormData] = useState(() => {
    const initial = getInitialFormData();
    // Префіл з Request якщо є
    if (prefilledRequestData) {
      return {
        ...initial,
        firstName: prefilledRequestData.firstName || initial.firstName,
        lastName: prefilledRequestData.lastName || initial.lastName,
        email: prefilledRequestData.email || initial.email,
        phone: prefilledRequestData.phone || initial.phone,
        companyName: prefilledRequestData.companyName || initial.companyName,
        startDate: prefilledRequestData.startDate || initial.startDate,
        endDate: prefilledRequestData.endDate || initial.endDate,
      };
    }
    return initial;
  });
  
  // Відкрити модал автоматично якщо є prefilled data
  useEffect(() => {
    if (prefilledRequestData && !isAddModalOpen) {
      setIsAddModalOpen(true);
    }
  }, [prefilledRequestData]);
  
  const [guests, setGuests] = useState<{firstName: string, lastName: string}[]>([{ firstName: '', lastName: '' }]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Convert Offers to Booking Objects for Visualization
  const offerBookings: Booking[] = offers.map(offer => {
    // Parse dates string "YYYY-MM-DD to YYYY-MM-DD"
    const parts = offer.dates.split(' to ');
    const start = parts[0];
    const end = parts[1] || start;

    // FIRST: Check if there's a reservation with this ID and use its status directly
    const linkedReservation = reservations.find(r => 
        String(r.id) === String(offer.id) || r.id === Number(offer.id)
    );
    
    if (linkedReservation && linkedReservation.status) {
        // Use the status directly from reservations array - this is the source of truth
        const bookingStatus = linkedReservation.status;
        const statusText = String(bookingStatus).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const colorClass = getBookingStyle(bookingStatus);
        
        return {
            id: Number(offer.id) || Date.now(),
            roomId: offer.propertyId,
            start,
            end,
            guest: offer.clientName + (statusText !== 'Offer Sent' && statusText !== 'Draft' ? ` (${statusText})` : ' (Offer)'),
            color: colorClass, 
            checkInTime: offer.checkInTime || '15:00',
            checkOutTime: offer.checkOutTime || '11:00',
            status: bookingStatus,
            price: offer.price,
            balance: '0.00 EUR',
            guests: offer.guests || '-',
            unit: offer.unit || '-',
            comments: offer.comments || 'Converted from Offer',
            paymentAccount: 'Pending',
            company: 'N/A',
            internalCompany: offer.internalCompany,
            ratePlan: '-',
            guarantee: '-',
            cancellationPolicy: '-',
            noShowPolicy: '-',
            channel: 'Direct',
            type: 'GUEST',
            address: offer.address || '-',
            phone: offer.phone || '-',
            email: offer.email || '-',
            guestList: offer.guestList || []
        };
    }

    // FALLBACK: Check if this offer has an associated invoice
    const linkedInvoice = invoices.find(inv => inv.offerIdSource === offer.id || inv.offerIdSource === String(offer.id));
    const isPaid = linkedInvoice?.status === 'Paid';

    // Determine Status using BookingStatus enum
    let bookingStatus: BookingStatus | string = BookingStatus.OFFER_SENT;
    let statusText: string = offer.status;

    if (linkedInvoice) {
        if (isPaid) {
            // Check if Auszug (Move-Out) Task is verified (completed)
            const moveOutTask = adminEvents.find(e => 
                e.propertyId === offer.propertyId && 
                e.type === 'Auszug' && 
                e.date === end &&
                e.bookingId === (linkedInvoice.bookingId || offer.id)
            );
            
            // Check if Einzug (Move-In) Task is verified (done)
            const moveInTask = adminEvents.find(e => 
                e.propertyId === offer.propertyId && 
                e.type === 'Einzug' && 
                e.date === start &&
                e.bookingId === (linkedInvoice.bookingId || offer.id)
            );

            if (moveOutTask && moveOutTask.status === 'verified') {
                bookingStatus = BookingStatus.COMPLETED;
                statusText = 'Completed';
            } else if (moveInTask && moveInTask.status === 'verified') {
                bookingStatus = BookingStatus.CHECK_IN_DONE;
                statusText = 'Checked In';
            } else {
                bookingStatus = BookingStatus.PAID;
                statusText = 'Paid';
            }
        } else {
            bookingStatus = BookingStatus.INVOICED;
            statusText = 'Invoiced';
        }
    } else if (offer.status === 'Sent') {
        bookingStatus = BookingStatus.OFFER_SENT;
        statusText = 'Offer Sent';
    } else if (offer.status === 'Draft') {
        bookingStatus = BookingStatus.OFFER_PREPARED;
        statusText = 'Draft';
    }

    // Use centralized color functions
    const colorClass = getBookingStyle(bookingStatus);

    return {
      id: Number(offer.id) || Date.now(), // Generate a number ID if not numeric
      roomId: offer.propertyId,
      start,
      end,
      guest: offer.clientName + (statusText !== 'Sent' && statusText !== 'Draft' ? ` (${statusText})` : ' (Offer)'),
      color: colorClass, 
      checkInTime: offer.checkInTime || '15:00',
      checkOutTime: offer.checkOutTime || '11:00',
      status: bookingStatus,
      price: offer.price,
      balance: '0.00 EUR',
      guests: offer.guests || '-',
      unit: offer.unit || '-',
      comments: offer.comments || 'Converted from Offer',
      paymentAccount: 'Pending',
      company: 'N/A', // Guest Company placeholder
      internalCompany: offer.internalCompany, // Map the issuing firm
      ratePlan: '-',
      guarantee: '-',
      cancellationPolicy: '-',
      noShowPolicy: '-',
      channel: 'Direct',
      type: 'GUEST',
      // Map extended fields
      address: offer.address || '-',
      phone: offer.phone || '-',
      email: offer.email || '-',
      guestList: offer.guestList || []
    };
  });

  // Combine local bookings, reservations props, and converted offers
  // Filter out duplicates based on ID to prevent issues
  // Оновити кольори для reservations на основі статусу
  const reservationsWithColors = reservations.map(r => ({
    ...r,
    color: getBookingStyle(r.status)
  }));
  
  const allBookings = [
    ...bookings.map(b => ({
      ...b,
      color: getBookingStyle(b.status)
    })), 
    ...reservationsWithColors.filter(r => !bookings.some(b => b.id === r.id)),
    ...offerBookings
  ];

  // Constants for Today (dynamic)
  const TODAY = today;

  // Побудувати список кімнат із реальних properties
  const roomsFromProperties = React.useMemo(
    () =>
      (properties || []).map((p) => ({
        id: p.id,
        name: p.title,
        city: p.city,
        details: p.address || p.fullAddress || '',
      })),
    [properties]
  );

  const cities = [
    'ALL',
    ...Array.from(new Set(roomsFromProperties.map((r) => r.city).filter(Boolean))).sort(),
  ];

  const filteredRooms = roomsFromProperties.filter(
    (r) => cityFilter === 'ALL' || r.city === cityFilter
  );

  const getRoomNameById = (roomId: string | undefined | null) => {
    if (!roomId) return '';
    const room = roomsFromProperties.find((r) => r.id === roomId);
    return room?.name || roomId;
  };
  const todayOffsetDays = dateDiffInDays(currentDate, TODAY);

  // Auto-scroll
  useEffect(() => {
    if (scrollContainerRef.current && todayOffsetDays >= 0 && todayOffsetDays < NUM_DAYS) {
        const scrollPos = (todayOffsetDays * DAY_WIDTH) - (scrollContainerRef.current.clientWidth / 2) + (DAY_WIDTH / 2);
        scrollContainerRef.current.scrollLeft = scrollPos;
    }
  }, [currentDate]);

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    newDate.setDate(1);
    setCurrentDate(newDate);
  };

  // --- Form Reset Helper ---
  const resetForm = () => {
    setFormData(getInitialFormData());
    setGuests([{ firstName: '', lastName: '' }]);
  };

  // --- Drag Handlers ---
  
  const getDateFromIndex = (index: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + index);
    return d;
  };

  const handleMouseDown = (roomId: string, dayIndex: number) => {
    setIsDragging(true);
    const date = getDateFromIndex(dayIndex);
    setDragStart({ roomId, date });
    setDragEnd({ roomId, date });
  };

  const handleMouseEnter = (roomId: string, dayIndex: number) => {
    if (isDragging && dragStart && dragStart.roomId === roomId) {
      // Автоматичне перемикання місяця при перетягуванні за межі вікна
      const now = Date.now();
      const DEBOUNCE_DELAY = 300; // Затримка 300мс для уникнення занадто частого перемикання
      
      if (dayIndex >= NUM_DAYS && (now - lastMonthSwitchRef.current) > DEBOUNCE_DELAY) {
        // Перетягування вправо за межі вікна - перейти на наступний місяць
        lastMonthSwitchRef.current = now;
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + 1);
        newDate.setDate(1);
        setCurrentDate(newDate);
        // Обчислити абсолютну дату для нового dayIndex відносно нового місяця
        // НЕ змінювати dragStart - він залишається на початковій даті
        setTimeout(() => {
          const newEndDate = getDateFromIndex(dayIndex - NUM_DAYS);
          setDragEnd({ roomId, date: newEndDate });
        }, 50);
        return; // Не встановлювати dragEnd тут, оскільки це буде зроблено в setTimeout
      } else if (dayIndex < 0 && (now - lastMonthSwitchRef.current) > DEBOUNCE_DELAY) {
        // Перетягування вліво за межі вікна - перейти на попередній місяць
        lastMonthSwitchRef.current = now;
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() - 1);
        newDate.setDate(1);
        setCurrentDate(newDate);
        // Обчислити абсолютну дату для нового dayIndex відносно нового місяця
        // НЕ змінювати dragStart - він залишається на початковій даті
        setTimeout(() => {
          const newEndDate = getDateFromIndex(NUM_DAYS + dayIndex);
          setDragEnd({ roomId, date: newEndDate });
        }, 50);
        return; // Не встановлювати dragEnd тут, оскільки це буде зроблено в setTimeout
      }
      
      // Якщо не перемикаємо місяць, просто оновити dragEnd з абсолютною датою
      const endDate = getDateFromIndex(dayIndex);
      setDragEnd({ roomId, date: endDate });
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragEnd) {
      // Використовувати абсолютні дати з dragStart і dragEnd
      const startD = dragStart.date < dragEnd.date ? dragStart.date : dragEnd.date;
      const endD = dragStart.date > dragEnd.date ? dragStart.date : dragEnd.date;

      // RESET and then SET
      resetForm();
      setFormData(prev => ({
        ...prev,
        roomId: dragStart.roomId,
        startDate: formatDateISO(startD),
        endDate: formatDateISO(endD),
      }));
      setIsAddModalOpen(true);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  const handleManualAdd = () => {
    resetForm();
    setFormData(prev => ({
        ...prev,
        roomId: filteredRooms[0]?.id || '',
        startDate: formatDateISO(TODAY),
        endDate: formatDateISO(new Date(TODAY.getTime() + 86400000)),
    }));
    setIsAddModalOpen(true);
  };

  const handleBookingClick = (e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation();
    setSelectedBooking(booking);
  };

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

  // --- Form Calculation ---
  
  const calculateFinancials = () => {
    if (!formData.startDate || !formData.endDate) return { nights: 0, net: '0.00', gross: '0.00' };
    const start = parseDate(formData.startDate);
    const end = parseDate(formData.endDate);
    const nights = Math.max(1, dateDiffInDays(start, end));
    const netTotal = nights * (formData.pricePerNight || 0);
    const grossTotal = netTotal * (1 + (formData.taxRate || 0) / 100);
    return { nights, net: netTotal.toFixed(2), gross: grossTotal.toFixed(2) };
  };

  const { nights, net, gross } = calculateFinancials();

  // --- Form Actions ---

  const handleGuestChange = (index: number, field: 'firstName' | 'lastName', value: string) => {
    const newGuests = [...guests];
    newGuests[index][field] = value;
    setGuests(newGuests);
  };

  const addGuest = () => {
    setGuests([...guests, { firstName: '', lastName: '' }]);
  };

  const handleReserve = () => {
    // Validation for required fields
    const errors: string[] = [];
    
    if (!formData.roomId) {
      errors.push('Room/Property is required');
    }
    if (!formData.startDate) {
      errors.push('Start date is required');
    }
    if (!formData.endDate) {
      errors.push('End date is required');
    }
    if (formData.clientType === 'Company' && !formData.companyName) {
      errors.push('Company name is required');
    }
    if (formData.clientType !== 'Company' && !formData.firstName && !formData.lastName) {
      errors.push('Guest name (first or last name) is required');
    }
    
    if (errors.length > 0) {
      alert('Please fix the following errors:\n\n' + errors.join('\n'));
      return;
    }
    
    const newBooking: Booking = {
      id: Date.now(),
      roomId: formData.roomId,
      start: formData.startDate,
      end: formData.endDate,
      guest: formData.clientType === 'Company' ? formData.companyName : `${formData.firstName} ${formData.lastName}`,
      color: getBookingStyle(BookingStatus.RESERVED), // Use centralized color function
      checkInTime: '15:00',
      checkOutTime: '11:00',
      status: BookingStatus.RESERVED, // Use BookingStatus enum
      price: `${gross} EUR`,
      balance: '0.00 EUR',
      guests: `${guests.length} Guests`,
      unit: 'AUTO-UNIT',
      comments: 'Reserved via Dashboard',
      paymentAccount: 'Pending',
      company: formData.clientType === 'Company' ? formData.companyName : 'N/A',
      ratePlan: 'Standard',
      guarantee: 'None',
      cancellationPolicy: 'Standard',
      noShowPolicy: 'Standard',
      channel: 'Manual',
      type: 'GUEST',
      createdAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      // Detailed data
      address: formData.address,
      phone: formData.phone,
      email: formData.email,
      pricePerNight: formData.pricePerNight,
      taxRate: formData.taxRate,
      totalGross: gross,
      guestList: guests,
      clientType: formData.clientType,
      firstName: formData.firstName,
      lastName: formData.lastName,
      companyName: formData.companyName
    };

    // IMPORTANT: Only save reservation, do not create offer here
    if (onSaveReservation) {
        onSaveReservation(newBooking);
    } else {
        // Fallback if prop not provided
        setBookings([...bookings, newBooking]);
    }
    
    // Auto-save lead logic
    if (onAddLead) {
        onAddLead(formData);
    }

    setIsAddModalOpen(false);
  };

  // --- Render ---

  // Days Header Generation
  const daysHeader = [];
  const tempDate = new Date(currentDate);
  for (let i = 0; i < NUM_DAYS; i++) {
    const dayNum = tempDate.getDate();
    const dayName = tempDate.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = tempDate.getTime() === TODAY.getTime();
    const isWeekend = tempDate.getDay() === 0 || tempDate.getDay() === 6;

    daysHeader.push(
        <div 
            key={i} 
            className={`
                w-[48px] min-w-[48px] flex flex-col items-center justify-center border-r border-gray-800 h-16 text-xs select-none
                ${isToday ? 'bg-emerald-500/10 text-emerald-500 font-bold border-b-2 border-b-emerald-500' : isWeekend ? 'bg-[#1C1F24] text-gray-500' : 'bg-[#16181D] text-gray-400'}
            `}
        >
            <span className="uppercase text-[10px]">{dayName.slice(0, 2)}</span>
            <span className="text-sm">{dayNum}</span>
        </div>
    );
    tempDate.setDate(tempDate.getDate() + 1);
  }

  return (
    <div className="h-full flex flex-col bg-[#111315] overflow-hidden select-none">
      
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-800 bg-[#161B22] flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Availability Calendar</h2>
            <div className="flex items-center bg-[#0D1117] rounded-lg border border-gray-700 p-1">
                <button onClick={() => changeMonth(-1)} className="p-1.5 hover:text-white text-gray-400 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <span className="px-4 font-bold text-white text-sm min-w-[140px] text-center">
                    {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => changeMonth(1)} className="p-1.5 hover:text-white text-gray-400 transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>
         </div>

         <div className="flex items-center gap-3">
            <button 
                onClick={handleManualAdd}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-900/20"
            >
                <Plus className="w-4 h-4" /> Add Booking
            </button>
            
            <div className="flex items-center gap-2 border-l border-gray-700 pl-3">
                <Filter className="w-4 h-4 text-gray-400" />
                <select 
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    className="bg-[#0D1117] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none"
                >
                    {cities.map(city => (
                        <option key={city} value={city}>{city === 'ALL' ? 'All Cities' : city}</option>
                    ))}
                </select>
            </div>
         </div>
      </div>

      {/* Stats Tiles */}
      <div className="px-4 py-4 bg-[#111315] border-b border-gray-800">
        <BookingStatsTiles
          reservations={allBookings}
          adminEvents={adminEvents}
          properties={properties}
          initialDate={TODAY}
          onTileClick={handleStatsTileClick}
        />
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 flex overflow-hidden relative">
         
         {/* Left Sidebar (Rooms) */}
         <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#161B22] z-20 flex flex-col">
            <div className="h-16 border-b border-gray-800 flex items-center px-4 font-bold text-white bg-[#1C1F24]">
                Properties ({filteredRooms.length})
            </div>
            <div className="overflow-y-auto flex-1 scrollbar-hide">
                {filteredRooms.map(room => (
                    <div key={room.id} className="h-16 border-b border-gray-800 flex flex-col justify-center px-4 hover:bg-[#1C1F24] transition-colors group relative">
                        <span className="text-sm font-bold text-white truncate">{room.name}</span>
                        <span className="text-xs text-gray-500 truncate">{room.city}</span>
                    </div>
                ))}
            </div>
         </div>

         {/* Calendar Scroll Area */}
         <div 
            className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0D1117]" 
            ref={scrollContainerRef}
            onMouseMove={(e) => {
              if (isDragging && dragStart && dragEnd) {
                const container = scrollContainerRef.current;
                if (!container) return;
                
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const scrollLeft = container.scrollLeft;
                const totalWidth = NUM_DAYS * DAY_WIDTH;
                
                // Перевірка, чи курсор справа від останнього дня
                if (mouseX + scrollLeft > totalWidth - DAY_WIDTH) {
                  const now = Date.now();
                  const DEBOUNCE_DELAY = 300;
                  if ((now - lastMonthSwitchRef.current) > DEBOUNCE_DELAY) {
                    lastMonthSwitchRef.current = now;
                    const newDate = new Date(currentDate);
                    newDate.setMonth(newDate.getMonth() + 1);
                    newDate.setDate(1);
                    setCurrentDate(newDate);
                    // Оновити dragEnd з новою датою (останній день нового місяця в межах вікна)
                    setTimeout(() => {
                      const newEndDate = getDateFromIndex(NUM_DAYS - 1);
                      setDragEnd({ roomId: dragStart.roomId, date: newEndDate });
                    }, 50);
                  }
                }
                // Перевірка, чи курсор зліва від першого дня
                else if (mouseX + scrollLeft < DAY_WIDTH) {
                  const now = Date.now();
                  const DEBOUNCE_DELAY = 300;
                  if ((now - lastMonthSwitchRef.current) > DEBOUNCE_DELAY) {
                    lastMonthSwitchRef.current = now;
                    const newDate = new Date(currentDate);
                    newDate.setMonth(newDate.getMonth() - 1);
                    newDate.setDate(1);
                    setCurrentDate(newDate);
                    // Оновити dragEnd з новою датою (перший день попереднього місяця в межах вікна)
                    setTimeout(() => {
                      const newEndDate = getDateFromIndex(0);
                      setDragEnd({ roomId: dragStart.roomId, date: newEndDate });
                    }, 50);
                  }
                }
              }
            }}
         >
            <div className="min-w-max">
                
                {/* Dates Header */}
                <div className="sticky top-0 z-10 flex border-b border-gray-800 shadow-md bg-[#161B22]">
                    {daysHeader}
                </div>

                {/* Booking Grid Rows */}
                <div className="relative">
                    
                    {/* Today Line */}
                    {todayOffsetDays >= 0 && todayOffsetDays < NUM_DAYS && (
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500/50 z-0 pointer-events-none"
                            style={{ left: `${(todayOffsetDays * DAY_WIDTH) + (DAY_WIDTH / 2)}px` }}
                        />
                    )}

                    {filteredRooms.map(room => (
                        <div key={room.id} className="h-16 border-b border-gray-800 relative flex bg-[#111315]/50 hover:bg-[#161B22]/50 transition-colors">
                            {/* Grid Lines & Cells for Selection */}
                            {Array.from({ length: NUM_DAYS }).map((_, i) => {
                                const cellDate = getDateFromIndex(i);
                                let isSelected = false;
                                
                                if (isDragging && dragStart && dragEnd && dragStart.roomId === room.id) {
                                    const startDate = dragStart.date;
                                    const endDate = dragEnd.date;
                                    const minDate = startDate < endDate ? startDate : endDate;
                                    const maxDate = startDate > endDate ? startDate : endDate;
                                    
                                    // Варіант А: Кожен місяць показує тільки свою частину виділення
                                    // Якщо minDate в попередньому місяці, то в поточному місяці виділення починається з першого дня
                                    // Якщо maxDate в наступному місяці, то в поточному місяці виділення закінчується останнім днем
                                    const cellDateStr = formatDateISO(cellDate);
                                    const minDateStr = formatDateISO(minDate);
                                    const maxDateStr = formatDateISO(maxDate);
                                    
                                    // Визначити межі поточного місяця
                                    const currentMonthStart = new Date(currentDate);
                                    currentMonthStart.setDate(1);
                                    const currentMonthEnd = new Date(currentDate);
                                    currentMonthEnd.setMonth(currentMonthEnd.getMonth() + 1);
                                    currentMonthEnd.setDate(0); // Останній день поточного місяця
                                    
                                    const currentMonthStartStr = formatDateISO(currentMonthStart);
                                    const currentMonthEndStr = formatDateISO(currentMonthEnd);
                                    
                                    // Визначити фактичні межі виділення в поточному місяці
                                    const effectiveMinDate = minDateStr < currentMonthStartStr ? currentMonthStartStr : minDateStr;
                                    const effectiveMaxDate = maxDateStr > currentMonthEndStr ? currentMonthEndStr : maxDateStr;
                                    
                                    isSelected = cellDateStr >= effectiveMinDate && cellDateStr <= effectiveMaxDate;
                                }
                                
                                return (
                                    <div 
                                        key={i} 
                                        onMouseDown={() => handleMouseDown(room.id, i)}
                                        onMouseEnter={() => handleMouseEnter(room.id, i)}
                                        onMouseUp={handleMouseUp}
                                        className={`w-[48px] min-w-[48px] border-r border-gray-800/50 h-full cursor-pointer ${isSelected ? 'bg-blue-500/30' : ''}`} 
                                    />
                                );
                            })}

                            {/* Bookings */}
                            {allBookings.filter(b => b.roomId === room.id).map(booking => {
                                const startDate = parseDate(booking.start);
                                const endDate = parseDate(booking.end);
                                const startOffset = dateDiffInDays(currentDate, startDate);
                                const nights = dateDiffInDays(startDate, endDate); // кількість ночей

                                // Перевірка, чи резервація перетинається з поточним вікном
                                // Резервація повністю поза вікном, якщо:
                                // - вона закінчується до початку вікна (startOffset + nights < 0)
                                // - або починається після кінця вікна (startOffset >= NUM_DAYS)
                                if (nights <= 0 || (startOffset + nights) < 0 || startOffset >= NUM_DAYS) return null;

                                // Візуально показуємо з дня заїзду до дня виїзду (включно),
                                // тобто додаємо одну клітинку для дня виїзду.
                                const totalDays = nights + 1;
                                
                                // Обчислення позиції та ширини для часткового відображення
                                let left: number;
                                let width: number;
                                
                                if (startOffset < 0) {
                                    // Резервація починається до початку вікна, але закінчується всередині
                                    left = 0;
                                    width = (startOffset + totalDays - 0.3) * DAY_WIDTH;
                                } else if (startOffset + totalDays > NUM_DAYS) {
                                    // Резервація починається всередині вікна, але закінчується після кінця
                                    left = startOffset * DAY_WIDTH + DAY_WIDTH * 0.6;
                                    width = (NUM_DAYS - startOffset - 0.3) * DAY_WIDTH;
                                } else {
                                    // Резервація повністю в межах вікна
                                    left = startOffset * DAY_WIDTH + DAY_WIDTH * 0.6;
                                    width = (totalDays - 1.3) * DAY_WIDTH;
                                }
                                
                                return (
                                    <div 
                                        key={booking.id}
                                        onClick={(e) => handleBookingClick(e, booking)}
                                        onMouseEnter={(e) => setHoveredBooking({ booking, x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHoveredBooking(null)}
                                        className={`
                                            absolute top-2 h-12 rounded-md text-xs text-white flex px-2 shadow-lg z-10 cursor-pointer
                                            ${getBookingColor(booking.status)} ${getBookingBorderStyle(booking.status)} hover:opacity-90 hover:scale-[1.01] transition-transform
                                        `}
                                        style={{ left: `${left}px`, width: `${width}px` }}
                                    >
                                        <div className="flex justify-between items-center w-full h-full px-4">
                                            {/* Left: Check-in */}
                                            <span className="font-mono text-[10px] font-bold opacity-80 ml-2">{booking.checkInTime}</span>
                                            
                                            {/* Center */}
                                            <div className="flex flex-col items-center justify-center flex-1 px-2 min-w-0">
                                                <span className="font-bold text-xs truncate w-full text-center leading-tight">{booking.guest}</span>
                                                <span className="text-[9px] opacity-80 truncate leading-tight mt-0.5">
                                                    {nights}N | {parseInt(booking.guests || '0')}G
                                                </span>
                                            </div>

                                            {/* Right: Check-out */}
                                            <span className="font-mono text-[10px] font-bold opacity-80 mr-2">{booking.checkOutTime}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
         </div>
      </div>

      {/* --- HOVER TOOLTIP --- */}
      {hoveredBooking && !isDragging && !selectedBooking && (
        <div 
            className="fixed z-[100] bg-[#1F2937] border border-gray-700 text-white p-3 rounded-lg shadow-2xl pointer-events-none min-w-[200px]"
            style={{ left: hoveredBooking.x + 15, top: hoveredBooking.y + 15 }}
        >
            <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-2">
                <span className="font-bold text-white">{hoveredBooking.booking.guest}</span>
                <span className="text-xs font-bold text-emerald-400">({hoveredBooking.booking.status})</span>
            </div>
            <div className="text-xs text-gray-400 mb-2">
                Property: {getRoomNameById(hoveredBooking.booking.roomId)}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                    <span className="text-gray-500 block">Check-in</span>
                    <span className="font-bold text-[#A855F7]">{hoveredBooking.booking.start}</span>
                </div>
                <div className="text-right">
                    <span className="text-gray-500 block">Check-out</span>
                    <span className="font-bold text-[#3B82F6]">{hoveredBooking.booking.end}</span>
                </div>
            </div>
        </div>
      )}

      {/* --- ADD BOOKING MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1C1F24] w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
                {/* Header */}
                <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center sticky top-0 z-10">
                    <h3 className="text-lg font-bold text-white">{formData.roomId && bookings.find(b => b.id === parseInt(formData.roomId || '0')) ? 'Edit Booking' : 'Add Booking'}</h3>
                    <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Room Display */}
                    <div className="bg-[#111315] p-3 rounded-lg border border-gray-800 flex items-center gap-3">
                        <div className="bg-blue-500/10 p-2 rounded text-blue-500"><Briefcase className="w-5 h-5" /></div>
                        <div>
                            <span className="block text-xs text-gray-500">Selected Property</span>
                            <span className="text-white font-bold">{getRoomNameById(formData.roomId) || 'Select Room'}</span>
                        </div>
                    </div>

                    {/* Client Type Switch */}
                    <div className="flex bg-[#111315] p-1 rounded-lg border border-gray-800">
                        <button 
                            onClick={() => setFormData({...formData, clientType: 'Private'})}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${formData.clientType === 'Private' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Private Person
                        </button>
                        <button 
                            onClick={() => setFormData({...formData, clientType: 'Company'})}
                            className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${formData.clientType === 'Company' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            Company
                        </button>
                    </div>

                    {/* Personal / Company Info */}
                    <div className="grid grid-cols-2 gap-4">
                        {formData.clientType === 'Private' ? (
                            <>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">First Name</label>
                                    <input 
                                        className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none"
                                        value={formData.firstName}
                                        onChange={e => setFormData({...formData, firstName: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 mb-1 block">Last Name</label>
                                    <input 
                                        className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none"
                                        value={formData.lastName}
                                        onChange={e => setFormData({...formData, lastName: e.target.value})}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="col-span-2">
                                <label className="text-xs text-gray-400 mb-1 block">Company Name</label>
                                <input 
                                    className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none"
                                    value={formData.companyName}
                                    onChange={e => setFormData({...formData, companyName: e.target.value})}
                                />
                            </div>
                        )}
                        <div className="col-span-2">
                            <label className="text-xs text-gray-400 mb-1 block">Address</label>
                            <input 
                                className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none"
                                value={formData.address}
                                onChange={e => setFormData({...formData, address: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                            <input 
                                className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none"
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Email</label>
                            <input 
                                className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 outline-none"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Date & Price Calculation */}
                    <div className="border-t border-gray-800 pt-4">
                        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Calculator className="w-4 h-4" /> Dates & Price</h4>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Check-in</label>
                                <input type="date" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white outline-none" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Check-out</label>
                                <input type="date" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white outline-none" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Price per Night (Net)</label>
                                <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white outline-none" value={formData.pricePerNight} onChange={e => setFormData({...formData, pricePerNight: Number(e.target.value)})} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 mb-1 block">Tax Rate (%)</label>
                                <select className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white outline-none" value={formData.taxRate} onChange={e => setFormData({...formData, taxRate: Number(e.target.value)})}>
                                    <option value={0}>0%</option>
                                    <option value={7}>7%</option>
                                    <option value={19}>19%</option>
                                </select>
                            </div>
                        </div>

                        {/* Explicitly Split Stats: Nights and Guests */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Tile 1: Total Nights */}
                            <div className="bg-[#111315] border border-gray-800 p-3 rounded-lg flex justify-between items-center">
                                <span className="text-gray-400 text-xs">Total Nights</span>
                                <span className="text-white font-bold text-lg">{nights}</span>
                            </div>
                            
                            {/* Tile 2: Guests */}
                            <div className="bg-[#111315] border border-gray-800 p-3 rounded-lg flex justify-between items-center">
                                <span className="text-gray-400 text-xs">Guests</span>
                                <span className="text-white font-bold text-lg">{guests.length}</span>
                            </div>
                        </div>

                        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg flex justify-between items-center">
                            <span className="text-emerald-500 font-bold text-sm">Total Gross</span>
                            <span className="text-2xl font-bold text-white">€{gross}</span>
                        </div>
                    </div>

                    {/* Guest List */}
                    <div className="border-t border-gray-800 pt-4">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-bold text-white flex items-center gap-2"><User className="w-4 h-4" /> Guest List</h4>
                            <button onClick={addGuest} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Add Guest</button>
                        </div>
                        <div className="space-y-2">
                            {guests.map((guest, i) => (
                                <div key={i} className="flex gap-2">
                                    <input placeholder="First Name" className="flex-1 bg-[#111315] border border-gray-700 rounded p-2 text-xs text-white outline-none" value={guest.firstName} onChange={e => handleGuestChange(i, 'firstName', e.target.value)} />
                                    <input placeholder="Last Name" className="flex-1 bg-[#111315] border border-gray-700 rounded p-2 text-xs text-white outline-none" value={guest.lastName} onChange={e => handleGuestChange(i, 'lastName', e.target.value)} />
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end sticky bottom-0 z-10">
                    <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleReserve}
                        className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-colors flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Reserve
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* --- REUSABLE BOOKING DETAILS MODAL --- */}
      <BookingDetailsModal 
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
        // Calendar view is read-only for offers logic usually, or we can add it if needed. 
        // For now, let's keep it simple as per request: the "Manage" view needs the actions.
      />

      {/* --- STATS TILES MODAL --- */}
      <BookingListModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        title={statsModalTitle}
        items={statsModalItems}
        type={statsModalType}
        properties={properties}
        date={statsModalDate}
      />

    </div>
  );
};

export default SalesCalendar;