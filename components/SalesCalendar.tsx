

import React, { useState, useEffect, useRef } from 'react';
import { RequestData, Property } from '../types';
import { ChevronLeft, ChevronRight, Filter, X, Plus, Calculator, Briefcase, User, Save, FileText, CreditCard, Calendar, Search } from 'lucide-react';
import { Booking, ReservationData, OfferData, InvoiceData, CalendarEvent, BookingStatus, Lead } from '../types';
import BookingDetailsModal from './BookingDetailsModal';
import BookingStatsTiles from './BookingStatsTiles';
import BookingListModal from './BookingListModal';
import { getBookingColor, getBookingBorderStyle, getBookingStyle } from '../bookingUtils';

// Helper to normalize date strings for stacking key
const normalizeDateKey = (v: string) => {
  if (!v) return '';
  if (v.length >= 10) return v.slice(0, 10); // YYYY-MM-DD
  return v;
};

// Helper to get reservation label with priority (never returns "N/A")
function getReservationLabel(r: ReservationData): string {
  // Priority: internalCompany || companyName || company
  if (r.internalCompany && r.internalCompany.trim() && r.internalCompany !== 'N/A') return r.internalCompany.trim();
  if (r.companyName && r.companyName.trim() && r.companyName !== 'N/A') return r.companyName.trim();
  if (r.company && r.company.trim() && r.company !== 'N/A') return r.company.trim();
  
  // Priority: leadLabel (if available)
  if ((r as any).leadLabel && (r as any).leadLabel.trim()) return (r as any).leadLabel.trim();
  
  // Priority: firstName + lastName OR clientFirstName + clientLastName
  if (r.firstName || r.lastName) {
    const name = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    if (name) return name;
  }
  if ((r as any).clientFirstName || (r as any).clientLastName) {
    const name = `${(r as any).clientFirstName || ''} ${(r as any).clientLastName || ''}`.trim();
    if (name) return name;
  }
  
  // Priority: guest (only if not "N/A" or empty)
  if (r.guest && r.guest.trim() && r.guest !== 'N/A' && r.guest !== 'Guest') return r.guest.trim();
  
  // Priority: email || phone
  if (r.email && r.email.trim()) return r.email.trim();
  if (r.phone && r.phone.trim()) return r.phone.trim();
  
  // Fallback: Reservation #id
  return `Reservation #${r.id}`;
}

// Never show blank in calendar/tooltip — API/DB may return empty guest
function getDisplayGuest(booking: { guest?: string | null }): string {
  const g = booking.guest;
  if (g != null && String(g).trim()) return String(g).trim();
  return 'Guest';
}

interface SalesCalendarProps {
  onSaveOffer?: (offer: OfferData) => void;
  onSaveReservation?: (reservation: ReservationData) => void;
  onDeleteReservation?: (id: number | string) => Promise<void> | void;
  onDeleteBooking?: (bookingId: number | string) => Promise<void> | void; // Delete confirmed booking from calendar
  onAddLead?: (bookingData: any) => void; // New Prop for Lead creation
  leads?: Lead[]; // For search/autocomplete when creating reservation
  reservations?: ReservationData[]; // Holds from reservations table (dashed)
  confirmedBookings?: Booking[]; // Confirmed bookings from bookings table (solid)
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
const NUM_DAYS = 120; // Початкова кількість днів (4 місяці)

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
  onDeleteBooking,
  onAddLead,
  leads = [],
  reservations = [],
  confirmedBookings = [],
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

  const [startDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Почати з 30 днів назад
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [totalDays, setTotalDays] = useState(NUM_DAYS);
  const [cityFilter, setCityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [minPeopleFilter, setMinPeopleFilter] = useState<number | null>(null);
  const [minRoomsFilter, setMinRoomsFilter] = useState<number | null>(null);
  const [hoveredBooking, setHoveredBooking] = useState<{booking: Booking, x: number, y: number} | null>(null);
  
  // Додати state для поточного видимого місяця
  const [currentVisibleMonth, setCurrentVisibleMonth] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  
  // Drag Selection State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{roomId: string, date: Date} | null>(null);
  const [dragEnd, setDragEnd] = useState<{roomId: string, date: Date} | null>(null);
  
  const getTotalDays = () => totalDays;

  // Add Booking Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [showLeadSuggestions, setShowLeadSuggestions] = useState(false);
  const leadSearchRef = useRef<HTMLDivElement>(null);

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

  // Refs for drag state so document-level mouseup can read current values
  const dragStateRef = useRef({ isDragging: false, dragStart: null as { roomId: string; date: Date } | null, dragEnd: null as { roomId: string; date: Date } | null });
  useEffect(() => {
    dragStateRef.current = { isDragging, dragStart, dragEnd };
  }, [isDragging, dragStart, dragEnd]);

  // Build latestOfferByReservationId map (optimized, no sorting in render loops)
  const latestOfferByReservationId = React.useMemo(() => {
    const map = new Map<string, OfferData>();
    for (const offer of offers) {
      if (!offer.reservationId) continue;
      const resId = String(offer.reservationId);
      const prev = map.get(resId);
      if (!prev) map.set(resId, offer);
      else {
        const a = new Date(prev.createdAt ?? 0).getTime();
        const b = new Date(offer.createdAt ?? 0).getTime();
        if (b > a) map.set(resId, offer);
      }
    }
    return map;
  }, [offers]);

  // Convert Offers to Booking Objects for Visualization (exclude offers linked to a reservation — that reservation stripe is shown and styled as "offered")
  const offerBookings: Booking[] = offers
    .filter(offer => !offer.reservationId)
    .map(offer => {
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

  // Separate confirmed bookings (solid) from reservations (dashed holds)
  // Confirmed bookings come from bookings table (created when invoice paid)
  // Reservations come from reservations table (holds, can overlap)
  const confirmedBookingsWithColors = React.useMemo(
    () => confirmedBookings.map(b => ({ ...b, color: getBookingStyle(b.status), isConfirmed: true })),
    [confirmedBookings]
  );

  // Create individual reservation items (active only: exclude lost/won/cancelled)
  const reservationItems = React.useMemo(() => {
    const active = reservations.filter(
      r => r.status !== 'lost' && r.status !== 'won' && r.status !== 'cancelled'
    );

    return active.map(reservation => {
      return {
        id: reservation.id, // REAL DB id
        roomId: reservation.roomId,
        propertyId: reservation.propertyId,
        start: reservation.start,
        end: reservation.end,
        guest: getReservationLabel(reservation), // Never "N/A"
        status: reservation.status as any,
        color: getBookingStyle(reservation.status as any),
        checkInTime: reservation.checkInTime || '15:00',
        checkOutTime: reservation.checkOutTime || '11:00',
        price: reservation.price || '0.00 EUR',
        balance: reservation.balance || '0.00 EUR',
        guests: reservation.guests || '1 Guest',
        unit: reservation.unit || 'AUTO-UNIT',
        comments: reservation.comments || 'Reservation',
        paymentAccount: reservation.paymentAccount || 'Pending',
        company: reservation.company || 'N/A',
        ratePlan: reservation.ratePlan || 'Standard',
        guarantee: reservation.guarantee || 'None',
        cancellationPolicy: reservation.cancellationPolicy || 'Standard',
        noShowPolicy: reservation.noShowPolicy || 'Standard',
        channel: reservation.channel || 'Manual',
        type: reservation.type || 'GUEST',
        address: reservation.address,
        phone: reservation.phone,
        email: reservation.email,
        pricePerNight: reservation.pricePerNight,
        taxRate: reservation.taxRate,
        totalGross: reservation.totalGross,
        guestList: reservation.guestList || [],
        clientType: reservation.clientType,
        firstName: reservation.firstName,
        lastName: reservation.lastName,
        companyName: reservation.companyName,
        internalCompany: reservation.internalCompany,
        createdAt: reservation.createdAt,
        isReservation: true,
        reservationId: reservation.id, // Store real reservation id for delete
      } as Booking & { isReservation: true; reservationId: string | number };
    });
  }, [reservations]);

  // Helper: two date ranges overlap (same room is checked separately)
  const datesOverlap = (s1: string, e1: string, s2: string, e2: string) => {
    const a = normalizeDateKey(s1);
    const b = normalizeDateKey(e1);
    const c = normalizeDateKey(s2);
    const d = normalizeDateKey(e2);
    return a < d && c < b;
  };

  // Stacking constants for reservation stripes
  const STRIPE_H = 26; // Height of each reservation stripe in pixels
  const STRIPE_GAP = 6; // Gap between stacked stripes in pixels
  const BASE_TOP_PX = 8; // Base top offset for first stripe
  const stackIndexByReservationId = React.useMemo(() => {
    const map = new Map<string, number>();
    const active = reservations.filter(
      r => r.status !== 'lost' && r.status !== 'won' && r.status !== 'cancelled'
    );

    // Group by room, then for each reservation find all in same room that OVERLAP it (same or different end date)
    const byRoom = new Map<string, ReservationData[]>();
    for (const r of active) {
      const arr = byRoom.get(r.roomId) ?? [];
      arr.push(r);
      byRoom.set(r.roomId, arr);
    }

    for (const [, roomReservations] of byRoom.entries()) {
      for (const r of roomReservations) {
        const overlapping = roomReservations.filter(
          other => datesOverlap(r.start, r.end, other.start, other.end)
        );
        const sorted = [...overlapping].sort((a, b) => {
          const A = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const B = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return B - A; // Newest first → index 0 is top stripe
        });
        const index = sorted.findIndex(x => String(x.id) === String(r.id));
        map.set(String(r.id), index >= 0 ? index : 0);
      }
    }

    return map;
  }, [reservations]);

  // Compute max stack count per room for row height (max overlapping reservations in that room)
  const maxStackForRoomId = React.useMemo(() => {
    const map = new Map<string, number>();
    const active = reservations.filter(
      r => r.status !== 'lost' && r.status !== 'won' && r.status !== 'cancelled'
    );
    const byRoom = new Map<string, ReservationData[]>();
    for (const r of active) {
      const arr = byRoom.get(r.roomId) ?? [];
      arr.push(r);
      byRoom.set(r.roomId, arr);
    }

    for (const [roomId, roomReservations] of byRoom.entries()) {
      let maxStack = 0;
      for (const r of roomReservations) {
        const overlapping = roomReservations.filter(
          other => datesOverlap(r.start, r.end, other.start, other.end)
        );
        if (overlapping.length > maxStack) maxStack = overlapping.length;
      }
      map.set(roomId, maxStack);
    }

    return map;
  }, [reservations]);

  const allBookings = React.useMemo(() => {
    return [
      ...confirmedBookingsWithColors,
      ...reservationItems,
      ...offerBookings // keep only if needed by existing UI
    ];
  }, [confirmedBookingsWithColors, reservationItems, offerBookings]);

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
        rooms: p.details?.rooms ?? p.rooms ?? 0,
        beds: p.details?.beds ?? 0,
      })),
    [properties]
  );

  const cities = [
    'ALL',
    ...Array.from(new Set(roomsFromProperties.map((r) => r.city).filter(Boolean))).sort(),
  ];

  const filteredRooms = React.useMemo(() => {
    return roomsFromProperties.filter((r) => {
      // City filter
      const matchesCity = cityFilter === 'ALL' || r.city === cityFilter;
      
      // Search filter (case-insensitive, partial match)
      const matchesSearch = searchQuery === '' || 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.details && r.details.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // People/beds filter (ліжка)
      const matchesPeople = minPeopleFilter === null || (r.beds >= minPeopleFilter);
      // Rooms filter (кімнати)
      const matchesRooms = minRoomsFilter === null || (r.rooms >= minRoomsFilter);
      
      return matchesCity && matchesSearch && matchesPeople && matchesRooms;
    });
  }, [roomsFromProperties, cityFilter, searchQuery, minPeopleFilter, minRoomsFilter]);

  const getRoomNameById = (roomId: string | undefined | null) => {
    if (!roomId) return '';
    const room = roomsFromProperties.find((r) => r.id === roomId);
    return room?.name || roomId;
  };
  const todayOffsetDays = dateDiffInDays(startDate, TODAY);
  
  // Auto-scroll to today on initial load
  useEffect(() => {
    if (scrollContainerRef.current && todayOffsetDays >= 0 && todayOffsetDays < totalDays) {
        const scrollPos = (todayOffsetDays * DAY_WIDTH) - (scrollContainerRef.current.clientWidth / 2) + (DAY_WIDTH / 2);
        scrollContainerRef.current.scrollLeft = scrollPos;
    }
  }, []); // Тільки при першому рендері

  // Infinite scroll - додавати дні при наближенні до кінця
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      // Додавати дні при наближенні до кінця (за 500px)
      if (scrollLeft + clientWidth > scrollWidth - 500) {
        setTotalDays(prev => prev + 30); // Додати ще місяць
      }
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [totalDays]);

  // Функція для переходу до сьогодні
  const scrollToToday = () => {
    const todayOffset = dateDiffInDays(startDate, TODAY);
    if (scrollContainerRef.current) {
      if (todayOffset >= 0 && todayOffset < totalDays) {
        const scrollLeft = todayOffset * DAY_WIDTH - scrollContainerRef.current.clientWidth / 2 + DAY_WIDTH / 2;
        scrollContainerRef.current.scrollTo({ left: scrollLeft, behavior: 'smooth' });
      } else if (todayOffset < 0) {
        // Сьогодні в минулому - додати дні на початок
        const daysToAdd = Math.abs(todayOffset) + 30;
        setTotalDays(prev => prev + daysToAdd);
        setTimeout(() => {
          if (scrollContainerRef.current) {
            const newTodayOffset = dateDiffInDays(startDate, TODAY) + daysToAdd;
            const scrollLeft = newTodayOffset * DAY_WIDTH - scrollContainerRef.current.clientWidth / 2 + DAY_WIDTH / 2;
            scrollContainerRef.current.scrollTo({ left: scrollLeft, behavior: 'smooth' });
          }
        }, 50);
      } else {
        // Сьогодні в майбутньому - додати дні в кінець
        const daysNeeded = todayOffset - totalDays + 30;
        setTotalDays(prev => prev + daysNeeded);
        setTimeout(() => {
          if (scrollContainerRef.current) {
            const scrollLeft = todayOffset * DAY_WIDTH - scrollContainerRef.current.clientWidth / 2 + DAY_WIDTH / 2;
            scrollContainerRef.current.scrollTo({ left: scrollLeft, behavior: 'smooth' });
          }
        }, 50);
      }
    }
  };

  // Функція для навігації до конкретного місяця
  const scrollToMonth = (offset: number) => {
    // Використовувати поточний видимий місяць як базу
    const targetMonth = new Date(currentVisibleMonth);
    targetMonth.setMonth(targetMonth.getMonth() + offset);
    targetMonth.setDate(1); // Початок місяця
    targetMonth.setHours(0, 0, 0, 0);
    
    // Знайти індекс першого дня цього місяця
    const targetOffsetDays = dateDiffInDays(startDate, targetMonth);
    
    if (scrollContainerRef.current) {
      if (targetOffsetDays >= 0 && targetOffsetDays < totalDays) {
        // Місяць вже в межах завантажених днів - прокрутити до початку місяця
        const scrollPos = targetOffsetDays * DAY_WIDTH;
        scrollContainerRef.current.scrollTo({ left: scrollPos, behavior: 'smooth' });
        setCurrentVisibleMonth(targetMonth);
      } else if (targetOffsetDays < 0) {
        // Місяць в минулому - додати дні на початок
        const daysToAdd = Math.abs(targetOffsetDays) + 30;
        setTotalDays(prev => prev + daysToAdd);
        setTimeout(() => {
          if (scrollContainerRef.current) {
            const newTargetOffsetDays = dateDiffInDays(startDate, targetMonth) + daysToAdd;
            scrollContainerRef.current.scrollTo({ left: newTargetOffsetDays * DAY_WIDTH, behavior: 'smooth' });
            setCurrentVisibleMonth(targetMonth);
          }
        }, 50);
      } else {
        // Місяць в майбутньому - додати дні в кінець
        const daysNeeded = targetOffsetDays - totalDays + 30;
        setTotalDays(prev => prev + daysNeeded);
        setTimeout(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ left: targetOffsetDays * DAY_WIDTH, behavior: 'smooth' });
            setCurrentVisibleMonth(targetMonth);
          }
        }, 50);
      }
    }
  };

  // --- Form Reset Helper ---
  const resetForm = () => {
    setFormData(getInitialFormData());
    setGuests([{ firstName: '', lastName: '' }]);
  };

  // --- Drag Handlers ---
  
  const getDateFromIndex = (index: number): Date => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    return date;
  };

  // Відстежувати поточний видимий місяць на основі прокрутки
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      // Обчислити, який день зараз видимий в центрі екрану
      const centerDayIndex = Math.floor(scrollLeft / DAY_WIDTH) + Math.floor(container.clientWidth / (2 * DAY_WIDTH));
      if (centerDayIndex >= 0 && centerDayIndex < totalDays) {
        const centerDate = getDateFromIndex(centerDayIndex);
        // Оновити поточний місяць, якщо він змінився
        const newMonth = new Date(centerDate.getFullYear(), centerDate.getMonth(), 1);
        setCurrentVisibleMonth(prev => {
          if (prev.getTime() !== newMonth.getTime()) {
            return newMonth;
          }
          return prev;
        });
      }
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    // Викликати одразу для встановлення початкового значення
    handleScroll();
    
    return () => container.removeEventListener('scroll', handleScroll);
  }, [totalDays, startDate]);

  const handleMouseDown = (roomId: string, dayIndex: number) => {
    setIsDragging(true);
    const date = getDateFromIndex(dayIndex);
    setDragStart({ roomId, date });
    setDragEnd({ roomId, date });
  };

  const handleMouseEnter = (roomId: string, dayIndex: number) => {
    if (isDragging && dragStart && dragStart.roomId === roomId) {
      // Якщо тягнемо за межі поточного вікна, додати дні
      if (dayIndex >= totalDays) {
        const extraDaysNeeded = dayIndex - totalDays + 1;
        setTotalDays(prev => prev + Math.min(extraDaysNeeded, 30));
      }
      
      // Обчислити абсолютну дату для dragEnd
      const endDate = getDateFromIndex(dayIndex);
      setDragEnd({ roomId, date: endDate });
    }
  };

  const applyDragSelection = (start: { roomId: string; date: Date }, end: { roomId: string; date: Date }) => {
    const startD = start.date < end.date ? start.date : end.date;
    const endD = start.date > end.date ? start.date : end.date;
    resetForm();
    setFormData(prev => ({
      ...prev,
      roomId: start.roomId,
      startDate: formatDateISO(startD),
      endDate: formatDateISO(endD),
    }));
    setIsAddModalOpen(true);
  };

  const handleMouseUp = () => {
    if (isDragging && dragStart && dragEnd) {
      applyDragSelection(dragStart, dragEnd);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // Document-level mouseup so releasing outside a cell still applies selection
  useEffect(() => {
    const onDocMouseUp = () => {
      const { isDragging: d, dragStart: start, dragEnd: end } = dragStateRef.current;
      if (d && start && end) {
        applyDragSelection(start, end);
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    };
    document.addEventListener('mouseup', onDocMouseUp);
    return () => document.removeEventListener('mouseup', onDocMouseUp);
  }, []);

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
  
  for (let i = 0; i < totalDays; i++) {
    const date = getDateFromIndex(i);
    const dayNum = date.getDate();
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const isToday = date.getTime() === TODAY.getTime();
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    daysHeader.push(
      <div 
        key={i} 
        className={`
          w-[48px] min-w-[48px] flex flex-col items-center justify-center border-r border-gray-800 h-12 text-xs select-none
          ${isToday ? 'bg-emerald-500/10 text-emerald-500 font-bold border-b-2 border-b-emerald-500' : isWeekend ? 'bg-[#1C1F24] text-gray-500' : 'bg-[#16181D] text-gray-400'}
        `}
      >
        <span className="uppercase text-[10px]">{dayName.slice(0, 2)}</span>
        <span className="text-sm">{dayNum}</span>
      </div>
    );
  }

  // Month Names Row Generation
  const monthNamesRow = [];
  const monthBoundaries: number[] = [0]; // Зберігаємо індекси початку кожного місяця
  let currentMonth = null;
  let monthStartIndex = 0;
  let monthName = '';
  const todayMonthKey = `${TODAY.getFullYear()}-${TODAY.getMonth()}`;

  // Пройтися по всіх днях
  for (let i = 0; i < totalDays; i++) {
    const date = getDateFromIndex(i);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    
    if (currentMonth !== monthKey) {
      // Закрити попередній місяць
      if (currentMonth !== null) {
        const monthWidth = (i - monthStartIndex) * DAY_WIDTH;
        
        monthNamesRow.push(
          <div 
            key={`month-${monthStartIndex}`} 
            style={{ width: `${monthWidth}px`, minWidth: `${monthWidth}px` }}
            className={`flex items-center justify-center text-emerald-400 font-bold text-[12px] uppercase border-r border-gray-800 bg-gray-900/30`}
          >
            {monthName}
          </div>
        );
      }
      // Почати новий місяць
      currentMonth = monthKey;
      monthStartIndex = i;
      monthName = date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
      monthBoundaries.push(i); // Додати індекс початку нового місяця
    }
  }
  
  // Додати останній місяць
  if (currentMonth !== null) {
    const monthWidth = (totalDays - monthStartIndex) * DAY_WIDTH;
    
    monthNamesRow.push(
      <div 
        key={`month-${monthStartIndex}`} 
        style={{ width: `${monthWidth}px`, minWidth: `${monthWidth}px` }}
        className={`flex items-center justify-center text-emerald-400 font-bold text-[12px] uppercase border-r border-gray-800 bg-gray-900/30`}
      >
        {monthName}
      </div>
    );
  }
  
  // Додати останній індекс як кінець останнього місяця
  monthBoundaries.push(totalDays);

  return (
    <div className="h-full flex flex-col bg-[#111315] overflow-hidden select-none">
      
      {/* Toolbar */}
      <div className="p-4 border-b border-gray-800 bg-[#161B22] flex flex-col md:flex-row justify-between items-center gap-4">
         <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Availability Calendar</h2>
            
            {/* Today Button */}
            <button 
                onClick={scrollToToday}
                className="flex items-center gap-2 bg-[#0D1117] hover:bg-[#161B22] border border-gray-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                title="Go to today"
            >
                <Calendar className="w-4 h-4" />
                <span>Today</span>
            </button>
            
            {/* Month Navigation */}
            <div className="flex items-center bg-[#0D1117] rounded-lg border border-gray-700 p-1">
                <button 
                    onClick={() => scrollToMonth(-1)} 
                    className="p-1.5 hover:text-white text-gray-400 transition-colors"
                    title="Previous month"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="px-4 font-bold text-white text-sm min-w-[140px] text-center">
                    {currentVisibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button 
                    onClick={() => scrollToMonth(1)} 
                    className="p-1.5 hover:text-white text-gray-400 transition-colors"
                    title="Next month"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
         </div>

         <div className="flex items-center gap-3">
            <button 
                onClick={handleManualAdd}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-900/20"
            >
                <Plus className="w-4 h-4" /> Add Booking
            </button>
         </div>
      </div>

      {/* Stats Tiles */}
      <div className="px-4 py-4 bg-[#111315] border-b border-gray-800">
        <BookingStatsTiles
          reservations={allBookings} // Mixed calendar data (for UI lists if needed)
          confirmedBookings={confirmedBookings} // ✅ ONLY confirmed bookings from bookings table
          adminEvents={adminEvents}
          properties={properties}
          initialDate={TODAY}
          onTileClick={handleStatsTileClick}
        />
      </div>

      {/* Filters: under tiles */}
      <div className="px-4 py-3 bg-[#0D1117] border-b border-gray-800 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[140px]"
          >
            {cities.map(city => (
              <option key={city} value={city}>{city === 'ALL' ? 'Усі міста' : city}</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[160px] max-w-[220px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук об'єктів..."
            className="w-full pl-9 pr-3 py-2 bg-[#161B22] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={minRoomsFilter === null ? '' : minRoomsFilter}
          onChange={(e) => setMinRoomsFilter(e.target.value === '' ? null : Number(e.target.value))}
          className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[100px]"
          title="Кімнати"
        >
          <option value="">Кімнати: усі</option>
          <option value={1}>1+</option>
          <option value={2}>2+</option>
          <option value={3}>3+</option>
          <option value={4}>4+</option>
        </select>
        <select
          value={minPeopleFilter === null ? '' : minPeopleFilter}
          onChange={(e) => setMinPeopleFilter(e.target.value === '' ? null : Number(e.target.value))}
          className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[100px]"
          title="Ліжка"
        >
          <option value="">Ліжка: усі</option>
          <option value={1}>1+</option>
          <option value={2}>2+</option>
          <option value={3}>3+</option>
          <option value={4}>4+</option>
        </select>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {filteredRooms.length === 0 ? (
            <span className="text-red-400">Нічого не знайдено</span>
          ) : (
            <>{filteredRooms.length} {filteredRooms.length === 1 ? 'об\'єкт' : 'об\'єктів'}</>
          )}
        </span>
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 flex overflow-hidden relative">
         
         {/* Left Sidebar (Rooms) */}
         <div className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#161B22] z-20 flex flex-col">
            <div className="sticky top-0 z-30 border-b border-gray-800 bg-[#1C1F24] flex flex-col justify-center px-4 py-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Пошук об'єктів..."
                        className="w-full pl-10 pr-3 py-2 bg-[#0D1117] border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                </div>
            </div>
            <div className="overflow-y-auto flex-1 scrollbar-hide">
                {filteredRooms.map(room => {
                    const BASE_ROW_HEIGHT = 64;
                    const maxStack = maxStackForRoomId.get(room.id) ?? 0;
                    const extraHeight = maxStack > 0 ? (maxStack - 1) * (STRIPE_H + STRIPE_GAP) : 0;
                    const rowMinHeight = BASE_ROW_HEIGHT + extraHeight;
                    return (
                    <div
                        key={room.id}
                        className="border-b border-gray-800 flex flex-col justify-center px-4 hover:bg-[#1C1F24] transition-colors group relative"
                        style={{ height: `${rowMinHeight}px`, minHeight: `${rowMinHeight}px` }}
                    >
                        <span className="text-sm font-bold text-white truncate">{room.name}</span>
                        {room.details && (
                            <span className="text-xs text-gray-500 truncate">{room.details}</span>
                        )}
                        {room.city && (
                            <span className="text-xs text-gray-400 truncate">{room.city}</span>
                        )}
                    </div>
                    );
                })}
            </div>
         </div>

         {/* Calendar Scroll Area */}
         <div 
            className="flex-1 overflow-x-auto overflow-y-auto relative bg-[#0D1117]" 
            ref={scrollContainerRef}
         >
            <div className="min-w-max">
                
                {/* Combined Month Names and Dates Header */}
                <div className="sticky top-0 z-20 flex flex-col">
                    {/* Month Names Row */}
                    <div className="flex border-b border-gray-800 bg-[#111315] h-7">
                        {monthNamesRow}
                    </div>
                    {/* Dates Header */}
                    <div className="flex border-b border-gray-800 shadow-md bg-[#161B22]">
                        {daysHeader}
                    </div>
                </div>

                {/* Booking Grid Rows */}
                <div className="relative">
                    
                    {/* Month Boundary Lines */}
                    {monthBoundaries.map((boundaryIndex, idx) => {
                      if (idx === 0) return null; // Пропускаємо перший індекс (0)
                      const left = boundaryIndex * DAY_WIDTH;
                      return (
                        <div
                          key={`month-boundary-${boundaryIndex}`}
                          className="absolute top-0 bottom-0 w-[1.5px] bg-gray-600/70 z-0 pointer-events-none"
                          style={{ left: `${left}px` }}
                        />
                      );
                    })}
                    
                    {/* Today Line */}
                    {todayOffsetDays >= 0 && todayOffsetDays < totalDays && (
                        <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500/50 z-1 pointer-events-none"
                            style={{ left: `${(todayOffsetDays * DAY_WIDTH) + (DAY_WIDTH / 2)}px` }}
                        />
                    )}

                    {filteredRooms.map(room => {
                        // Calculate row height: base (h-16 = 64px) + extra for stacked reservations
                        const BASE_ROW_HEIGHT = 64; // h-16 = 64px
                        const maxStack = maxStackForRoomId.get(room.id) ?? 0;
                        const extraHeight = maxStack > 0 ? (maxStack - 1) * (STRIPE_H + STRIPE_GAP) : 0;
                        const rowMinHeight = BASE_ROW_HEIGHT + extraHeight;

                        return (
                        <div 
                            key={room.id} 
                            className="border-b border-gray-800 relative flex bg-[#111315]/50 hover:bg-[#161B22]/50 transition-colors"
                            style={{ height: `${rowMinHeight}px`, minHeight: `${rowMinHeight}px` }}
                        >
                            {/* Grid Lines & Cells for Selection */}
                            {Array.from({ length: getTotalDays() }).map((_, i) => {
                                const cellDate = getDateFromIndex(i);
                                
                                let isSelected = false;
                                
                                if (isDragging && dragStart && dragEnd && dragStart.roomId === room.id) {
                                    const startDate = dragStart.date;
                                    const endDate = dragEnd.date;
                                    const minDate = startDate < endDate ? startDate : endDate;
                                    const maxDate = startDate > endDate ? startDate : endDate;
                                    
                                    const cellDateStr = formatDateISO(cellDate);
                                    const minDateStr = formatDateISO(minDate);
                                    const maxDateStr = formatDateISO(maxDate);
                                    
                                    isSelected = cellDateStr >= minDateStr && cellDateStr <= maxDateStr;
                                }
                                
                                return (
                                    <div 
                                        key={i} 
                                        onMouseDown={() => handleMouseDown(room.id, i)}
                                        onMouseEnter={() => handleMouseEnter(room.id, i)}
                                        onMouseUp={handleMouseUp}
                                        className={`w-[48px] min-w-[48px] border-r border-gray-800/50 h-full cursor-pointer relative z-[1] pointer-events-auto ${isSelected ? 'bg-blue-500/30' : ''}`} 
                                    />
                                );
                            })}

                            {/* Bookings */}
                            {allBookings.filter(b => b.roomId === room.id).map(booking => {
                                const displayGuest = getDisplayGuest(booking);
                                const bookingStartDate = parseDate(booking.start);
                                const bookingEndDate = parseDate(booking.end);
                                
                                // Обчислити offset від startDate календаря
                                const startOffset = dateDiffInDays(startDate, bookingStartDate);
                                const nights = dateDiffInDays(bookingStartDate, bookingEndDate); // кількість ночей
                                const totalDays = getTotalDays();
                                

                                // Перевірка, чи резервація перетинається з поточним вікном (включаючи додаткові дні)
                                // Резервація повністю поза вікном, якщо:
                                // - вона закінчується до початку вікна (startOffset + nights < 0)
                                // - або починається після кінця вікна (startOffset >= totalDays)
                                if (nights <= 0 || (startOffset + nights) < 0 || startOffset >= totalDays) return null;

                                // Візуально показуємо з дня заїзду до дня виїзду (включно),
                                // тобто додаємо одну клітинку для дня виїзду.
                                const bookingTotalDays = nights + 1;
                                const viewTotalDays = getTotalDays();
                                
                                // Обчислення позиції та ширини для часткового відображення
                                let left: number;
                                let width: number;
                                
                                if (startOffset < 0) {
                                    // Резервація починається до початку вікна, але закінчується всередині
                                    left = 0;
                                    width = (startOffset + bookingTotalDays - 0.3) * DAY_WIDTH;
                                } else if (startOffset + bookingTotalDays > viewTotalDays) {
                                    // Резервація починається всередині вікна, але закінчується після кінця
                                    left = startOffset * DAY_WIDTH + DAY_WIDTH * 0.6;
                                    width = (viewTotalDays - startOffset - 0.3) * DAY_WIDTH;
                                } else {
                                    // Резервація повністю в межах вікна
                                    left = startOffset * DAY_WIDTH + DAY_WIDTH * 0.6;
                                    width = (bookingTotalDays - 1.3) * DAY_WIDTH;
                                }
                                
                                // Determine if this is a reservation (hold) or confirmed booking
                                const isReservation = (booking as any).isReservation === true;
                                const isConfirmed = (booking as any).isConfirmed === true || (!isReservation);
                                const reservationHasOffer = isReservation && (booking.status === 'offered' || (booking as any).status === 'offered');
                                
                                // Calculate dynamic top offset for stacking
                                const stackIndex = isReservation 
                                  ? (stackIndexByReservationId.get(String(booking.id)) ?? 0)
                                  : 0;
                                
                                // For reservations: use new constants, inline styles for top/height
                                // For confirmed bookings: keep existing layout
                                const topPx = isReservation 
                                  ? BASE_TOP_PX + stackIndex * (STRIPE_H + STRIPE_GAP)
                                  : 8; // Base top for confirmed bookings
                                
                                // Reservation stripe: dashed = open hold, solid = offer created/sent
                                const reservationBorderClass = reservationHasOffer
                                  ? 'border-2 border-white/60 ring-1 ring-white/20 shadow-[0_1px_0_rgba(0,0,0,0.35)] hover:-translate-y-[1px]'
                                  : 'border-2 border-dashed border-white/55 ring-1 ring-white/20 shadow-[0_1px_0_rgba(0,0,0,0.35)] hover:-translate-y-[1px]';
                                
                                return (
                                    <div 
                                        key={booking.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleBookingClick(e, booking);
                                        }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                        }}
                                        onMouseMove={(e) => {
                                            // Prevent drag selection when moving over stripe
                                            if (isDragging) {
                                                e.stopPropagation();
                                            }
                                        }}
                                        onMouseEnter={(e) => setHoveredBooking({ booking, x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHoveredBooking(null)}
                                        className={`
                                            absolute rounded-md text-xs text-white flex shadow-lg z-10 cursor-pointer items-center pointer-events-auto
                                            ${isReservation 
                                                ? 'bg-sky-500/70 hover:bg-sky-500/85 ' + reservationBorderClass
                                                : 'h-12 px-2 ' + getBookingColor(booking.status) + ' ' + getBookingBorderStyle(booking.status)
                                            } hover:scale-[1.01] transition-all duration-150
                                        `}
                                        style={{ 
                                            left: `${left}px`, 
                                            width: `${width}px`, 
                                            top: `${topPx}px`,
                                            height: isReservation ? `${STRIPE_H}px` : undefined,
                                        }}
                                    >
                                        {isReservation ? (() => {
                                            const showTimes = width >= 110;
                                            const showDetails = width >= 140;
                                            const showOnlyInitials = width < 70;
                                            
                                            // Get first letter for initials fallback
                                            const getInitial = (str: string) => {
                                                const trimmed = str.trim();
                                                return trimmed ? trimmed[0].toUpperCase() : '?';
                                            };
                                            
                                            return (
                                                <div className="flex items-center w-full h-full px-2.5 whitespace-nowrap">
                                                    {showOnlyInitials ? (
                                                        // Very narrow: show only initial
                                                        <span className="font-bold text-[12px] w-full text-center">
                                                            {getInitial(displayGuest)}
                                                        </span>
                                                    ) : showTimes ? (
                                                        <>
                                                            {/* Left: Check-in time (fixed width) */}
                                                            <span className="font-mono text-[10px] opacity-70 w-[44px] text-left shrink-0 whitespace-nowrap">
                                                                {booking.checkInTime}
                                                            </span>
                                                            
                                                            {/* Center: Guest/Company label */}
                                                            <span className="font-medium text-[11px] truncate flex-1 min-w-0 text-center whitespace-nowrap px-1">
                                                                {displayGuest}
                                                            </span>
                                                            
                                                            {/* Right: Check-out time (fixed width) */}
                                                            <span className="font-mono text-[10px] opacity-70 w-[44px] text-right shrink-0 whitespace-nowrap">
                                                                {booking.checkOutTime}
                                                            </span>
                                                            
                                                            {/* Optional: Nights/Guests (if space allows) */}
                                                            {showDetails && (
                                                                <span className="text-[9px] opacity-60 ml-2 shrink-0 whitespace-nowrap">
                                                                    {nights}N · {parseInt(booking.guests || '0')}G
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        // Narrow: show only label centered
                                                        <span className="font-medium text-[11px] truncate w-full text-center whitespace-nowrap">
                                                            {displayGuest}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            // Full confirmed booking: check-in, guest, nights/guests, check-out
                                            <div className="flex justify-between items-center w-full h-full px-4">
                                                {/* Left: Check-in */}
                                                <span className="font-mono text-[10px] font-bold opacity-80 ml-2">{booking.checkInTime}</span>
                                                
                                                {/* Center */}
                                                <div className="flex flex-col items-center justify-center flex-1 px-2 min-w-0">
                                                    <span className="font-bold text-xs truncate w-full text-center leading-tight">{displayGuest}</span>
                                                    <span className="text-[9px] opacity-80 truncate leading-tight mt-0.5">
                                                        {nights}N | {parseInt(booking.guests || '0')}G
                                                    </span>
                                                </div>

                                                {/* Right: Check-out */}
                                                <span className="font-mono text-[10px] font-bold opacity-80 mr-2">{booking.checkOutTime}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        );
                    })}
                </div>
            </div>
         </div>
      </div>

      {/* --- HOVER TOOLTIP --- */}
      {hoveredBooking && !isDragging && !selectedBooking && (() => {
        const booking = hoveredBooking.booking;
        const displayGuest = getDisplayGuest(booking);
        const bookingStartDate = parseDate(booking.start);
        const bookingEndDate = parseDate(booking.end);
        const nights = dateDiffInDays(bookingStartDate, bookingEndDate);
        const guestsCount = parseInt(booking.guests || '0') || 1;
        
        return (
          <div 
            className="fixed z-[100] bg-[#1F2937] border border-gray-700 text-white p-3 rounded-lg shadow-2xl pointer-events-none min-w-[200px]"
            style={{ left: hoveredBooking.x + 15, top: hoveredBooking.y + 15 }}
          >
            <div className="flex justify-between items-center mb-2 border-b border-gray-600 pb-2">
              <span className="font-bold text-white">{displayGuest}</span>
              <span className="text-xs font-bold text-emerald-400">({booking.status})</span>
            </div>
            <div className="text-xs text-gray-400 mb-2">
              Property: {getRoomNameById(booking.roomId)}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
              <div>
                <span className="text-gray-500 block">Check-in</span>
                <span className="font-bold text-[#A855F7]">{booking.start}</span>
                {booking.checkInTime && (
                  <span className="text-gray-400 block text-[10px]">{booking.checkInTime}</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-gray-500 block">Check-out</span>
                <span className="font-bold text-[#3B82F6]">{booking.end}</span>
                {booking.checkOutTime && (
                  <span className="text-gray-400 block text-[10px]">{booking.checkOutTime}</span>
                )}
              </div>
            </div>
            <div className="text-xs text-gray-400 border-t border-gray-600 pt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Nights:</span>
                <span className="font-semibold text-white">{nights}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">Guests:</span>
                <span className="font-semibold text-white">{guestsCount}</span>
              </div>
            </div>
          </div>
        );
      })()}

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

                    {/* Lead search: autocomplete from leads */}
                    {leads.length > 0 && (
                      <div className="relative" ref={leadSearchRef}>
                        <label className="block text-xs text-gray-400 mb-1">Пошук гостя / лідів</label>
                        <input
                          type="text"
                          value={leadSearchQuery}
                          onChange={e => { setLeadSearchQuery(e.target.value); setShowLeadSuggestions(true); }}
                          onFocus={() => leadSearchQuery.trim() && setShowLeadSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowLeadSuggestions(false), 180)}
                          placeholder="Введіть ім'я, email, телефон, адресу..."
                          className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none placeholder-gray-500"
                        />
                        {showLeadSuggestions && leadSearchQuery.trim() && (() => {
                          const q = leadSearchQuery.trim().toLowerCase();
                          const searchable = (l: Lead) => [l.name, l.contactPerson, l.email, l.phone, l.address].filter(Boolean).join(' ').toLowerCase();
                          const filtered = leads.filter(l => searchable(l).includes(q)).slice(0, 10);
                          if (filtered.length === 0) return null;
                          return (
                            <ul className="absolute left-0 right-0 top-full mt-1 z-20 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                              {filtered.map(l => (
                                <li
                                  key={l.id}
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    const isCompany = l.type === 'Company';
                                    const parts = l.name.trim().split(/\s+/);
                                    const firstName = isCompany ? '' : (parts[0] || '');
                                    const lastName = isCompany ? '' : (parts.slice(1).join(' ') || '');
                                    setFormData(prev => ({
                                      ...prev,
                                      clientType: isCompany ? 'Company' : 'Private',
                                      firstName,
                                      lastName,
                                      companyName: isCompany ? l.name : '',
                                      email: l.email || '',
                                      phone: l.phone || '',
                                      address: l.address || '',
                                    }));
                                    setLeadSearchQuery('');
                                    setShowLeadSuggestions(false);
                                  }}
                                  className="px-3 py-2 text-sm text-white hover:bg-[#23262b] cursor-pointer border-b border-gray-800 last:border-0"
                                >
                                  <span className="font-medium">{l.name}</span>
                                  {(l.email || l.phone) && <span className="text-gray-400 ml-2">· {l.email || l.phone}</span>}
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </div>
                    )}

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
        onDeleteReservation={onDeleteReservation ? async (id: number | string) => {
          const result = onDeleteReservation(id);
          if (result instanceof Promise) {
            await result;
          }
          setSelectedBooking(null);
        } : undefined}
        onDeleteBooking={onDeleteBooking ? async (bookingId: number | string) => {
          await onDeleteBooking(bookingId);
          setSelectedBooking(null);
        } : undefined}
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