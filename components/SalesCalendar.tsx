

import React, { useState, useEffect, useRef } from 'react';
import { RequestData, Property } from '../types';
import { ChevronLeft, ChevronRight, Filter, X, Plus, Calculator, Briefcase, User, Save, FileText, CreditCard, Calendar, Search, Ruler, LayoutGrid, Bed } from 'lucide-react';
import { Booking, ReservationData, OfferData, InvoiceData, CalendarEvent, BookingStatus, Lead, MultiApartmentOfferDraft, PaymentProof, SelectedApartmentData } from '../types';
import BookingDetailsModal from './BookingDetailsModal';
import MultiApartmentOfferModal from './MultiApartmentOfferModal';
import { getBookingColor, getBookingBorderStyle, getBookingStyle } from '../bookingUtils';
import { useSalesAllBookings } from '../hooks/useSalesAllBookings';
import { formatPropertyAddress } from '../utils/formatPropertyAddress';

// Helper to normalize date strings for stacking key
const normalizeDateKey = (v: string) => {
  if (!v) return '';
  if (v.length >= 10) return v.slice(0, 10); // YYYY-MM-DD
  return v;
};

// Never show blank in calendar/tooltip — API/DB may return empty guest
function getDisplayGuest(booking: { guest?: string | null }): string {
  const g = booking.guest;
  if (g != null && String(g).trim()) return String(g).trim();
  return 'Guest';
}

function splitStreetAndHouseNumber(address: string | undefined) {
  const raw = String(address || '').trim();
  if (!raw) return { street: '', houseNumber: '' };
  const match = raw.match(/^(.*?)(?:\s+(\d+[A-Za-z0-9\/-]*))?$/);
  return {
    street: (match?.[1] || raw).trim(),
    houseNumber: (match?.[2] || '').trim(),
  };
}

interface SalesCalendarProps {
  onSaveOffer?: (offer: OfferData) => void;
  onSaveMultiApartmentOffer?: (draft: MultiApartmentOfferDraft, mode: 'draft' | 'send') => Promise<void> | void;
  /** When calendar drag-select opens the modal in direct-booking mode, this handler runs on save (reservation then offer). */
  onSaveDirectBooking?: (draft: MultiApartmentOfferDraft) => Promise<void>;
  onSaveReservation?: (reservation: ReservationData) => void;
  onDeleteReservation?: (id: number | string) => Promise<void> | void;
  onDeleteBooking?: (bookingId: number | string) => Promise<void> | void; // Delete confirmed booking from calendar
  onAddLead?: (bookingData: any) => void; // New Prop for Lead creation
  leads?: Lead[]; // For search/autocomplete when creating reservation
  reservations?: ReservationData[]; // Holds from reservations table (dashed)
  confirmedBookings?: Booking[]; // Confirmed bookings from bookings table (solid)
  offers?: OfferData[];
  invoices?: InvoiceData[];
  paymentProofsByInvoiceId?: Record<string, PaymentProof[]>;
  getPaymentProofSignedUrl?: (filePath: string) => Promise<string | null>;
  proofSignedUrlByInvoiceId?: Record<string, string>;
  adminEvents?: CalendarEvent[];
  prefilledRequestData?: Partial<RequestData>; // Для префілу форми з Request
  properties?: Property[]; // Реальні об'єкти з Properties List
  onShowToast?: (message: string) => void;
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
const CALENDAR_HEADER_HEIGHT = 28 + 48; // h-7 + h-12 (month row + dates row)

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
  onSaveMultiApartmentOffer,
  onSaveDirectBooking,
  onSaveReservation,
  onDeleteReservation,
  onDeleteBooking,
  onAddLead,
  leads = [],
  reservations = [],
  confirmedBookings = [],
  offers = [],
  invoices = [],
  paymentProofsByInvoiceId,
  getPaymentProofSignedUrl,
  proofSignedUrlByInvoiceId,
  adminEvents = [],
  prefilledRequestData,
  properties = [],
  onShowToast,
}) => {
  // Calendar layer: only confirmed bookings (occupancy). Offers/reservations/proformas stay in their sections.
  const { allBookings } = useSalesAllBookings({
    reservations,
    offers,
    confirmedBookings,
    invoices,
    adminEvents,
  });

  // State
  const [bookings, setBookings] = useState<Booking[]>([]); // Без демо-бронювань

  // Поточна дата / місяць
  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const TODAY = today;

  const [startDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Почати з 30 днів назад
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [totalDays, setTotalDays] = useState(NUM_DAYS);
  const [cityFilter, setCityFilter] = useState('ALL');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [minPeopleFilter, setMinPeopleFilter] = useState<number | null>(null);
  const [minRoomsFilter, setMinRoomsFilter] = useState<number | null>(null);
  const [availabilityStartDate, setAvailabilityStartDate] = useState('');
  const [availabilityEndDate, setAvailabilityEndDate] = useState('');
  const [showReservations, setShowReservations] = useState(true); // visibility toggle for reservation layer
  const [hoveredBooking, setHoveredBooking] = useState<{booking: Booking, x: number, y: number} | null>(null);
  const [ugpLoadingBookingId, setUgpLoadingBookingId] = useState<string | number | null>(null);
  const hoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proofUrlCacheRef = useRef<Record<string, string>>({});
  const [prefetchedProofUrl, setPrefetchedProofUrl] = useState<string | null>(null);
  
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
  const [isMultiOfferModalOpen, setIsMultiOfferModalOpen] = useState(false);
  /** When set, the open MultiApartmentOfferModal is in calendar direct-booking mode (property + dates from drag). */
  const [calendarDirectBookingPrefill, setCalendarDirectBookingPrefill] = useState<{ checkIn: string; checkOut: string } | null>(null);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [showLeadSuggestions, setShowLeadSuggestions] = useState(false);
  const leadSearchRef = useRef<HTMLDivElement>(null);

  // propertyById, roomsFromProperties, selectedApartmentPayloads must be declared before any useEffect that uses them (avoid TDZ)
  const propertyById = React.useMemo(
    () => new Map((properties || []).map((property) => [String(property.id), property])),
    [properties]
  );

  const roomsFromProperties = React.useMemo(
    () =>
      (properties || []).map((p) => ({
        id: p.id,
        name: p.title,
        city: p.city,
        details: formatPropertyAddress({ ...p, country: '' }),
        rooms: p.details?.rooms ?? p.rooms ?? 0,
        beds: p.details?.beds ?? 0,
        area: p.details?.area ?? p.area ?? 0,
        termStatus: p.termStatus ?? undefined,
        department: p.apartmentGroupName ?? '',
        status: p.apartmentStatus ?? null,
      })),
    [properties]
  );

  const selectedApartmentPayloads = React.useMemo<SelectedApartmentData[]>(() => {
    return selectedPropertyIds
      .map((propertyId) => propertyById.get(String(propertyId)))
      .filter((property): property is Property => Boolean(property))
      .map((property) => {
        const parts = splitStreetAndHouseNumber(property.address);
        return {
          propertyId: property.id,
          title: property.title,
          street: parts.street || property.address || '',
          houseNumber: parts.houseNumber || undefined,
          zip: property.zip || '',
          city: property.city || '',
          apartmentCode: property.title || property.id,
          apartmentGroupName: property.apartmentGroupName ?? null,
          marketplaceUrl: property.marketplaceUrl ?? null,
          status: property.apartmentStatus ?? null,
          area: property.details?.area ?? property.area ?? 0,
          rooms: property.details?.rooms ?? property.rooms ?? 0,
          beds: property.details?.beds ?? 0,
        };
      });
  }, [propertyById, selectedPropertyIds]);

  // View Details Modal State
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

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
    if (!prefilledRequestData || isMultiOfferModalOpen) return;
    const prefilledPropertyId = prefilledRequestData.propertyId ? String(prefilledRequestData.propertyId) : '';
    if (prefilledPropertyId && propertyById.has(prefilledPropertyId)) {
      setSelectedPropertyIds([prefilledPropertyId]);
      setIsMultiOfferModalOpen(true);
    } else if (prefilledPropertyId) {
      onShowToast?.('Обраний обʼєкт із запиту не знайдено в календарі.');
    }
  }, [prefilledRequestData, isMultiOfferModalOpen, propertyById, onShowToast]);

  // Prefetch confirmation signed URL when popover opens
  useEffect(() => {
    if (!hoveredBooking || !getPaymentProofSignedUrl) {
      setPrefetchedProofUrl(null);
      return;
    }
    const booking = hoveredBooking.booking;
    const invList = invoices ?? [];
    const sourceInv = invList.find(i => i.id === booking.sourceInvoiceId);
    const proformaInv = sourceInv?.documentType === 'proforma' ? sourceInv : sourceInv?.proformaId ? invList.find(p => p.id === sourceInv.proformaId) : undefined;
    const proofs = (paymentProofsByInvoiceId?.[proformaInv?.id ?? ''] ?? []).filter(p => p.filePath);
    const currentProof = proofs.find(p => p.isCurrent) ?? proofs[0];
    const filePath = currentProof?.filePath;
    if (!filePath) { setPrefetchedProofUrl(null); return; }

    // Check pre-fetched map from AccountDashboard
    const cachedFromParent = proofSignedUrlByInvoiceId?.[proformaInv?.id ?? ''];
    if (cachedFromParent) { setPrefetchedProofUrl(cachedFromParent); return; }

    // Check local cache
    if (proofUrlCacheRef.current[filePath]) { setPrefetchedProofUrl(proofUrlCacheRef.current[filePath]); return; }

    let cancelled = false;
    setPrefetchedProofUrl(null);
    getPaymentProofSignedUrl(filePath).then(url => {
      if (!cancelled && url) {
        proofUrlCacheRef.current[filePath] = url;
        setPrefetchedProofUrl(url);
      }
    });
    return () => { cancelled = true; };
  }, [hoveredBooking, invoices, paymentProofsByInvoiceId, proofSignedUrlByInvoiceId, getPaymentProofSignedUrl]);

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

  // Active reservations (business data): not lost/won/cancelled. Used for availability only.
  const activeReservations = React.useMemo(() => {
    return reservations.filter(
      r => r.status !== 'lost' && r.status !== 'won' && r.status !== 'cancelled'
    );
  }, [reservations]);

  // VISUAL ONLY: Sent offers as calendar bars when toggle is ON. One bar per offer row. Dates from persisted offer fields.
  const parseOfferDates = (datesStr: string | undefined): { start: string; end: string } => {
    const s = (datesStr ?? '').trim();
    const parts = s.split(/\s+to\s+/);
    const start = (parts[0] ?? '').slice(0, 10);
    const end = (parts[1] ?? '').slice(0, 10);
    return { start: start || '', end: end || '' };
  };
  const sentOffersAsBars = React.useMemo(() => {
    return offers
      .filter((o): o is OfferData => o.status === 'Sent')
      .map((o) => {
        const { start, end } = parseOfferDates(o.dates);
        return {
          id: o.id,
          start,
          end,
          roomId: String(o.propertyId ?? ''),
          isOffer: true as const,
          guest: o.clientName ?? 'Offer',
          status: o.status,
        };
      })
      .filter((b) => b.start && b.end);
  }, [offers]);

  const visibleOfferBars = React.useMemo(() => {
    if (!showReservations) return [];
    return sentOffersAsBars;
  }, [showReservations, sentOffersAsBars]);

  // Calendar bars = confirmed bookings + visible offer bars (toggle controls offer bar visibility)
  const calendarBookings = React.useMemo(() => {
    const asBookings = visibleOfferBars.map((b) => ({
      ...b,
      isReservation: false,
      isOffer: true as const,
      roomId: b.roomId,
    }));
    return [...allBookings, ...asBookings];
  }, [allBookings, visibleOfferBars]);

  // Availability: always use full business dataset (confirmed + all active reservations).
  // Toggle must never make a reserved apartment look available.
  const bookingsForAvailability = React.useMemo(() => {
    const asBookings = activeReservations.map(r => ({
      ...r,
      roomId: r.roomId || (r as any).propertyId || '',
    }));
    return [...allBookings, ...asBookings];
  }, [allBookings, activeReservations]);

  // Helper: two date ranges overlap (same room is checked separately)
  const datesOverlap = (s1: string, e1: string, s2: string, e2: string) => {
    const a = normalizeDateKey(s1);
    const b = normalizeDateKey(e1);
    const c = normalizeDateKey(s2);
    const d = normalizeDateKey(e2);
    return a < d && c < b;
  };

  // Stacking constants for offer/reservation stripes
  const STRIPE_H = 13; // Height of each stripe in pixels
  const STRIPE_GAP = 3; // Gap between stacked stripes in pixels
  const BASE_TOP_PX = 4; // Base top offset for first stripe
  const stackIndexByReservationId = React.useMemo(() => {
    const map = new Map<string, number>();
    const active = visibleOfferBars;

    const byRoom = new Map<string, typeof visibleOfferBars>();
    for (const r of active) {
      const roomId = r.roomId ?? '';
      const arr = byRoom.get(roomId) ?? [];
      arr.push(r);
      byRoom.set(roomId, arr);
    }

    for (const [, roomItems] of byRoom.entries()) {
      for (const r of roomItems) {
        const overlapping = roomItems.filter(
          (other) => datesOverlap(r.start, r.end, other.start, other.end)
        );
        const sorted = [...overlapping].sort((a, b) => {
          const A = String(a.id);
          const B = String(b.id);
          return A.localeCompare(B);
        });
        const index = sorted.findIndex((x) => String(x.id) === String(r.id));
        map.set(String(r.id), index >= 0 ? index : 0);
      }
    }

    return map;
  }, [visibleOfferBars]);

  // Compute max stack count per room for row height (max overlapping offer bars in that room)
  const maxStackForRoomId = React.useMemo(() => {
    const map = new Map<string, number>();
    const active = visibleOfferBars;
    const byRoom = new Map<string, typeof visibleOfferBars>();
    for (const r of active) {
      const roomId = r.roomId ?? '';
      const arr = byRoom.get(roomId) ?? [];
      arr.push(r);
      byRoom.set(roomId, arr);
    }

    for (const [roomId, roomItems] of byRoom.entries()) {
      let maxStack = 0;
      for (const r of roomItems) {
        const overlapping = roomItems.filter(
          (other) => datesOverlap(r.start, r.end, other.start, other.end)
        );
        if (overlapping.length > maxStack) maxStack = overlapping.length;
      }
      map.set(roomId, maxStack);
    }

    return map;
  }, [visibleOfferBars]);

  // Status column: real apartment status label only; do not confuse with termStatus
  const getApartmentStatusLabel = (status: string | null | undefined): string => {
    if (status == null || String(status).trim() === '') return '—';
    switch (status) {
      case 'ooo': return 'Out of order';
      case 'preparation': return 'В підготовці';
      case 'rented_worker': return 'Здана працівнику';
      case 'active': return 'Активна';
      default: return status;
    }
  };

  const cities = [
    'ALL',
    ...Array.from(new Set(roomsFromProperties.map((r) => r.city).filter(Boolean))).sort(),
  ];

  // Same field as Abteilung column: apartmentGroupName → department
  const apartmentGroups = [
    'ALL',
    ...Array.from(new Set(roomsFromProperties.map((r) => r.department).filter(Boolean))).sort(),
  ];

  const filteredRooms = React.useMemo(() => {
    let hasAvailabilityFilter = availabilityStartDate.trim() !== '' && availabilityEndDate.trim() !== '';
    let availabilityStart = '';
    let availabilityEnd = '';
    if (hasAvailabilityFilter) {
      availabilityStart = normalizeDateKey(availabilityStartDate);
      availabilityEnd = normalizeDateKey(availabilityEndDate);
      if (availabilityStart >= availabilityEnd) hasAvailabilityFilter = false; // invalid range: do not filter
    }

    return roomsFromProperties.filter((r) => {
      // City filter
      const matchesCity = cityFilter === 'ALL' || r.city === cityFilter;
      // Apartment group filter: same field as Abteilung (apartmentGroupName / department)
      const matchesGroup = groupFilter === 'ALL' || r.department === groupFilter;
      
      // Search filter (case-insensitive, partial match)
      const matchesSearch = searchQuery === '' || 
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.details && r.details.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // People/beds filter (ліжка) — exact value
      const matchesPeople = minPeopleFilter === null || (r.beds === minPeopleFilter);
      // Rooms filter (кімнати) — exact value
      const matchesRooms = minRoomsFilter === null || (r.rooms === minRoomsFilter);

      // Availability date-range filter: show only apartments with no booking overlapping [start, end)
      // Same-day turnover: booking ending on request start date does not block (end date is exclusive)
      // Always use full business data (confirmed + all active reservations). Toggle is visual only.
      const matchesAvailability = !hasAvailabilityFilter || bookingsForAvailability.every(
        (b) => String(b.roomId) !== String(r.id) || !datesOverlap(availabilityStart, availabilityEnd, normalizeDateKey(b.start), normalizeDateKey(b.end))
      );

      return matchesCity && matchesGroup && matchesSearch && matchesPeople && matchesRooms && matchesAvailability;
    });
  }, [roomsFromProperties, cityFilter, groupFilter, searchQuery, minPeopleFilter, minRoomsFilter, availabilityStartDate, availabilityEndDate, bookingsForAvailability]);

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
    // Open existing Create Offer modal in direct-booking mode with prefill (no old reservation modal)
    setSelectedPropertyIds([start.roomId]);
    setCalendarDirectBookingPrefill({ checkIn: formatDateISO(startD), checkOut: formatDateISO(endD) });
    setIsMultiOfferModalOpen(true);
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

  const togglePropertySelection = (propertyId: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleManualAdd = () => {
    if (selectedApartmentPayloads.length === 0) {
      onShowToast?.('Спочатку виберіть хоча б одну квартиру.');
      return;
    }
    setIsMultiOfferModalOpen(true);
  };

  const handleBookingClick = (e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation();
    setSelectedBooking(booking);
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
  const vatAmount = (parseFloat(gross) - parseFloat(net)).toFixed(2);
  const taxRate = Number(formData.taxRate ?? 0);
  const pricePerNightFormatted = Number(formData.pricePerNight ?? 0).toFixed(2);

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
                disabled={selectedApartmentPayloads.length === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/40 disabled:text-gray-400 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-emerald-900/20"
            >
                <Plus className="w-4 h-4" /> Create Offer
            </button>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              Selected: {selectedApartmentPayloads.length}
            </span>
         </div>
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
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[140px]"
            title="Група квартири"
          >
            {apartmentGroups.map(group => (
              <option key={group} value={group}>{group === 'ALL' ? 'Усі групи' : group}</option>
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
          <option value={1}>1 кімната</option>
          <option value={2}>2 кімнати</option>
          <option value={3}>3 кімнати</option>
          <option value={4}>4 кімнати</option>
        </select>
        <select
          value={minPeopleFilter === null ? '' : minPeopleFilter}
          onChange={(e) => setMinPeopleFilter(e.target.value === '' ? null : Number(e.target.value))}
          className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[100px]"
          title="Ліжка"
        >
          <option value="">Ліжка: усі</option>
          <option value={1}>1 ліжко</option>
          <option value={2}>2 ліжка</option>
          <option value={3}>3 ліжка</option>
          <option value={4}>4 ліжка</option>
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={availabilityStartDate}
            onChange={(e) => setAvailabilityStartDate(e.target.value)}
            className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[120px]"
            title="Заїзд"
          />
          <span className="text-gray-500 text-sm">—</span>
          <input
            type="date"
            value={availabilityEndDate}
            onChange={(e) => setAvailabilityEndDate(e.target.value)}
            className="bg-[#161B22] border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-emerald-500 focus:outline-none min-w-[120px]"
            title="Виїзд"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showReservations}
            onChange={(e) => setShowReservations(e.target.checked)}
            className="rounded border-gray-600 bg-[#161B22] text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
          />
          <span className="text-sm text-gray-300">Показувати офери</span>
        </label>
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
         
         {/* Left Sidebar (Rooms) — table-style single row per apartment, no header */}
         <div className="w-[600px] flex-shrink-0 border-r border-gray-800 bg-[#161B22] z-20 flex flex-col">
            <div
                className="sticky top-0 z-30 border-b border-gray-800 bg-[#1C1F24] flex flex-col justify-center px-4 py-3"
                style={{ minHeight: CALENDAR_HEADER_HEIGHT, height: CALENDAR_HEADER_HEIGHT }}
            >
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
            <div className="overflow-auto flex-1 scrollbar-hide">
                <table
                    className="w-full border-collapse"
                    style={{ tableLayout: 'auto', width: 'max-content', minWidth: '100%' }}
                >
                    <tbody>
                        {filteredRooms.map(room => {
                            const BASE_ROW_HEIGHT = 32;
                            const maxStack = maxStackForRoomId.get(room.id) ?? 0;
                            const extraHeight = maxStack > 0 ? (maxStack - 1) * (STRIPE_H + STRIPE_GAP) : 0;
                            const rowMinHeight = BASE_ROW_HEIGHT + extraHeight;
                            const rowClass = 'text-[11px] text-gray-200 font-medium';
                            const isSelected = selectedPropertyIds.includes(String(room.id));
                            return (
                                <tr
                                    key={room.id}
                                    onClick={() => togglePropertySelection(String(room.id))}
                                    className={`border-b border-gray-800 transition-colors group relative cursor-pointer ${isSelected ? 'bg-emerald-900/20 hover:bg-emerald-900/25' : 'hover:bg-[#252a32]'}`}
                                    style={{ height: `${rowMinHeight}px`, minHeight: `${rowMinHeight}px` }}
                                >
                                    <td className="py-1 px-2 text-left align-middle whitespace-nowrap">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => togglePropertySelection(String(room.id))}
                                            onClick={(e) => e.stopPropagation()}
                                            className="rounded border-gray-600 bg-[#111315] text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                                        />
                                    </td>
                                    <td className="py-1 px-2 text-left align-middle whitespace-nowrap">
                                        <span className={`block truncate min-w-0 ${rowClass}`} title={room.department || undefined}>{room.department || '—'}</span>
                                    </td>
                                    <td className="py-1 px-2 text-left align-middle whitespace-nowrap">
                                        <span className={rowClass}>{getApartmentStatusLabel(room.status)}</span>
                                    </td>
                                    <td className="py-1 px-2 text-left align-middle whitespace-nowrap">
                                        <span className={`block truncate min-w-0 ${rowClass} text-gray-300`} title={room.details || undefined}>{room.details || '—'}</span>
                                    </td>
                                    <td className="py-1 px-2 text-left align-middle whitespace-nowrap">
                                        <span className={`block truncate min-w-0 ${rowClass} font-semibold`} title={room.name || undefined}>{room.name || '—'}</span>
                                    </td>
                                    <td className="py-1 px-1 text-left align-middle whitespace-nowrap">
                                        <span className="flex items-center gap-0.5 w-fit" title="QM">
                                            <Ruler className="w-3 h-3 text-gray-500 shrink-0" />
                                            <span className={rowClass}>{(room.area != null && room.area !== '' && Number(room.area) > 0) ? `${room.area} м²` : '—'}</span>
                                        </span>
                                    </td>
                                    <td className="py-1 px-1 text-left align-middle whitespace-nowrap">
                                        <span className="flex items-center gap-0.5 w-fit" title="Betten">
                                            <Bed className="w-3 h-3 text-gray-500 shrink-0" />
                                            <span className={rowClass}>{room.beds ?? 0}</span>
                                        </span>
                                    </td>
                                    <td className="py-1 px-1 text-left align-middle whitespace-nowrap">
                                        <span className="flex items-center gap-0.5 w-fit" title="Rooms">
                                            <LayoutGrid className="w-3 h-3 text-gray-500 shrink-0" />
                                            <span className={rowClass}>{room.rooms ?? 0}</span>
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
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
                        // Calculate row height: base 32px + extra for stacked reservations
                        const BASE_ROW_HEIGHT = 32;
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
                            {calendarBookings
                              .filter(b => b.roomId === room.id)
                              .map(booking => {
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
                                
                                // Determine if this is an offer bar, reservation (hold), or confirmed booking
                                const isOffer = (booking as any).isOffer === true;
                                const isReservation = (booking as any).isReservation === true;
                                const isConfirmed = (booking as any).isConfirmed === true || (!isReservation && !isOffer);
                                const reservationHasOffer = isReservation && (booking.status === 'offered' || (booking as any).status === 'offered');
                                
                                // Calculate dynamic top offset for stacking (offers and reservations use same stacking)
                                const stackIndex = (stackIndexByReservationId.get(String(booking.id)) ?? 0);
                                
                                const useStripeLayout = isReservation || isOffer;
                                const topPx = useStripeLayout
                                  ? BASE_TOP_PX + stackIndex * (STRIPE_H + STRIPE_GAP)
                                  : 4;
                                
                                // Offer bar: solid. Reservation: dashed = open hold, solid = offer created/sent
                                const reservationBorderClass = (isOffer || reservationHasOffer)
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
                                        onMouseEnter={(e) => {
                                            if (hoverLeaveTimeoutRef.current) {
                                                clearTimeout(hoverLeaveTimeoutRef.current);
                                                hoverLeaveTimeoutRef.current = null;
                                            }
                                            setHoveredBooking({ booking, x: e.clientX, y: e.clientY });
                                        }}
                                        onMouseLeave={() => {
                                            hoverLeaveTimeoutRef.current = setTimeout(() => setHoveredBooking(null), 350);
                                        }}
                                        className={`
                                            absolute rounded-md text-[10px] text-white flex shadow-lg z-10 cursor-pointer items-center pointer-events-auto
                                            ${isReservation || isOffer
                                                ? 'bg-sky-500/70 hover:bg-sky-500/85 ' + reservationBorderClass
                                                : 'h-6 px-2 ' + getBookingColor(booking.status) + ' ' + getBookingBorderStyle(booking.status)
                                            } hover:scale-[1.01] transition-all duration-150
                                        `}
                                        style={{ 
                                            left: `${left}px`, 
                                            width: `${width}px`, 
                                            top: `${topPx}px`,
                                            height: (isReservation || isOffer) ? `${STRIPE_H}px` : undefined,
                                        }}
                                    >
                                        {(isReservation || isOffer) ? (() => {
                                            const showTimes = width >= 110 && !isOffer;
                                            const showDetails = width >= 140 && !isOffer;
                                            const showOnlyInitials = width < 70;
                                            
                                            const getInitial = (str: string) => {
                                                const trimmed = str.trim();
                                                return trimmed ? trimmed[0].toUpperCase() : '?';
                                            };
                                            
                                            return (
                                                <div className="flex items-center w-full h-full px-2 whitespace-nowrap">
                                                    {isOffer ? (
                                                        <span className="font-medium text-[10px] truncate w-full text-center whitespace-nowrap">
                                                            {width >= 80 ? `Offer · ${displayGuest}` : displayGuest}
                                                        </span>
                                                    ) : showOnlyInitials ? (
                                                        <span className="font-bold text-[10px] w-full text-center">
                                                            {getInitial(displayGuest)}
                                                        </span>
                                                    ) : showTimes ? (
                                                        <>
                                                            <span className="font-mono text-[9px] opacity-70 w-[40px] text-left shrink-0 whitespace-nowrap">
                                                                {booking.checkInTime}
                                                            </span>
                                                            <span className="font-medium text-[10px] truncate flex-1 min-w-0 text-center whitespace-nowrap px-0.5">
                                                                {displayGuest}
                                                            </span>
                                                            <span className="font-mono text-[9px] opacity-70 w-[40px] text-right shrink-0 whitespace-nowrap">
                                                                {booking.checkOutTime}
                                                            </span>
                                                            {showDetails && (
                                                                <span className="text-[8px] opacity-60 ml-1 shrink-0 whitespace-nowrap">
                                                                    {nights}N · {parseInt(booking.guests || '0')}G
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="font-medium text-[10px] truncate w-full text-center whitespace-nowrap">
                                                            {displayGuest}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            // Full confirmed booking: check-in, guest, nights/guests, check-out (single line)
                                            <div className="flex justify-between items-center w-full h-full px-2">
                                                {/* Left: Check-in */}
                                                <span className="font-mono text-[9px] font-bold opacity-80 shrink-0">{booking.checkInTime}</span>
                                                
                                                {/* Center: guest + nights|guests on one line */}
                                                <div className="flex items-center justify-center flex-1 px-1 min-w-0 gap-1 overflow-hidden">
                                                    <span className="font-bold text-[10px] truncate text-center whitespace-nowrap">{displayGuest}</span>
                                                    <span className="text-[8px] opacity-80 shrink-0 whitespace-nowrap">{nights}N | {parseInt(booking.guests || '0')}G</span>
                                                </div>

                                                {/* Right: Check-out */}
                                                <span className="font-mono text-[9px] font-bold opacity-80 shrink-0">{booking.checkOutTime}</span>
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
        const resList = reservations ?? [];
        const offList = offers ?? [];
        const invList = invoices ?? [];
        const linkedReservation = resList.find(r => String(r.id) === String(booking.sourceReservationId));
        const linkedOffer = offList.find(o => String(o.id) === String(booking.sourceOfferId));
        const sourceInv = invList.find(i => i.id === booking.sourceInvoiceId);
        const proformaInv = sourceInv?.documentType === 'proforma' ? sourceInv : sourceInv?.proformaId ? invList.find(p => p.id === sourceInv.proformaId) : undefined;
        const proformaNumber = proformaInv?.invoiceNumber ?? '—';
        const proofs = (paymentProofsByInvoiceId?.[proformaInv?.id ?? ''] ?? []).filter(p => p.filePath);
        const currentProof = proofs.find(p => p.isCurrent) ?? proofs[0];
        let popoverInvoices: InvoiceData[];
        let invoicesGuardTriggered = false;
        if (proformaInv) {
          popoverInvoices = invList.filter(inv => inv.proformaId === proformaInv.id);
        } else {
          const resId = booking.sourceReservationId;
          const byRes = resId
            ? invList.filter(inv => String(inv.reservationId) === String(resId))
            : [];
          const bId = booking.id;
          const byBook = bId
            ? invList.filter(inv => String(inv.bookingId) === String(bId))
            : [];
          const seen = new Set<string>();
          const merged: InvoiceData[] = [];
          for (const inv of [...byRes, ...byBook]) {
            const key = String(inv.id ?? '');
            if (!key) continue;
            if (!seen.has(key)) { seen.add(key); merged.push(inv); }
          }
          popoverInvoices = merged;
        }
        if (popoverInvoices.length > 50) {
          popoverInvoices = [];
          invoicesGuardTriggered = true;
        }
        const linkClass = 'font-mono font-semibold text-white cursor-pointer hover:underline';
        return (
          <div 
            className="fixed z-[100] bg-[#1F2937] border border-gray-700 text-white p-3 rounded-lg shadow-2xl pointer-events-auto min-w-[200px]"
            style={{ left: hoveredBooking.x + 15, top: hoveredBooking.y + 15 }}
            onMouseEnter={() => {
              if (hoverLeaveTimeoutRef.current) {
                clearTimeout(hoverLeaveTimeoutRef.current);
                hoverLeaveTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => setHoveredBooking(null)}
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
            <div className="text-xs text-gray-400 border-t border-gray-600 pt-2 mt-2">
              <div className="flex justify-between items-center mt-1">
                <span className="text-gray-500">Reservation:</span>
                <span className="font-mono font-semibold text-white">{linkedReservation?.reservationNo ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-gray-500">Offer:</span>
                <span className="font-mono font-semibold text-white">{linkedOffer?.offerNo ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-gray-500">Proforma:</span>
                {proformaInv?.fileUrl ? (
                  <a href={proformaInv.fileUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{proformaNumber}</a>
                ) : (
                  <span className="font-mono font-semibold text-white">{proformaNumber}</span>
                )}
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-gray-500">Confirmation:</span>
                {currentProof ? (
                  currentProof.filePath ? (
                    prefetchedProofUrl ? (
                      <a href={prefetchedProofUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {currentProof.documentNumber ?? 'PDF'}
                      </a>
                    ) : (
                      <span className="font-mono font-semibold text-white text-[10px] animate-pulse">loading…</span>
                    )
                  ) : (
                    <span className="font-mono font-semibold text-white">{currentProof.documentNumber ?? '—'}</span>
                  )
                ) : (
                  <span className="font-mono font-semibold text-white">—</span>
                )}
              </div>
              <div className="flex justify-between items-start mt-1 gap-2">
                <span className="text-gray-500 shrink-0">Invoices:</span>
                <span className="font-mono font-semibold text-white text-right">
                  {invoicesGuardTriggered ? (
                    <span className="text-yellow-500 text-[10px] font-normal">Too many invoices matched (possible filter issue). Showing none.</span>
                  ) : popoverInvoices.length === 0 ? '—' : popoverInvoices.map(inv => inv.fileUrl ? (
                    <a key={inv.id} href={inv.fileUrl} target="_blank" rel="noopener noreferrer" className={linkClass + ' block'}>{inv.invoiceNumber}</a>
                  ) : (
                    <span key={inv.id} className="block">{inv.invoiceNumber}</span>
                  ))}
                </span>
              </div>
              {confirmedBookings?.some(b => String(b.id) === String(booking.id)) && (
                <div className="flex justify-between items-center mt-1 gap-2">
                  <span className="text-gray-500 shrink-0">ÜGP:</span>
                  <button
                    type="button"
                    disabled={ugpLoadingBookingId === booking.id}
                    className={linkClass + ' text-left'}
                    onClick={async () => {
                      const bookingId = booking.id;
                      const propertyId = (booking as { propertyId?: string }).propertyId ?? booking.roomId;
                      if (!propertyId) {
                        onShowToast?.('Property not set');
                        return;
                      }
                      setUgpLoadingBookingId(bookingId);
                      try {
                        const res = await fetch('/api/protocols/uebergabeprotokoll/get-url', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ bookingId, propertyId, format: 'docx' }),
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          const msg = (json?.error ?? 'Помилка') + (json?.stage ? ` (${json.stage})` : '');
                          onShowToast ? onShowToast(msg) : console.error(msg);
                          return;
                        }
                        if (json?.url) window.open(json.url, '_blank');
                      } finally {
                        setUgpLoadingBookingId(null);
                      }
                    }}
                  >
                    {ugpLoadingBookingId === booking.id ? '…' : 'DOCX'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* --- ADD BOOKING MODAL (Create Offer or calendar direct-booking) --- */}
      <MultiApartmentOfferModal
        isOpen={isMultiOfferModalOpen}
        onClose={() => {
          setCalendarDirectBookingPrefill(null);
          setIsMultiOfferModalOpen(false);
        }}
        apartments={selectedApartmentPayloads}
        leads={leads}
        prefilledRequestData={
          calendarDirectBookingPrefill
            ? { startDate: calendarDirectBookingPrefill.checkIn, endDate: calendarDirectBookingPrefill.checkOut }
            : prefilledRequestData
        }
        directBookingMode={!!calendarDirectBookingPrefill}
        onSubmit={async (draft, submitMode) => {
          if (calendarDirectBookingPrefill) {
            if (onSaveDirectBooking) await onSaveDirectBooking(draft);
            setSelectedPropertyIds([]);
            return;
          }
          if (!onSaveMultiApartmentOffer) return;
          await onSaveMultiApartmentOffer(draft, submitMode);
          if (submitMode === 'draft') {
            onShowToast?.('Офер збережено.');
          } else {
            onShowToast?.('Офер збережено та позначено як надісланий.');
          }
          setSelectedPropertyIds([]);
        }}
      />

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

                        <div className="mt-4 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-lg flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                            <div className="text-xs text-emerald-200/90 sm:text-sm sm:text-white/80 space-y-0.5">
                                <div>Net: {nights} × €{pricePerNightFormatted} = €{net}</div>
                                <div>VAT {taxRate}%: €{vatAmount}</div>
                            </div>
                            <div className="text-2xl font-bold text-white shrink-0">€{gross}</div>
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
    </div>
  );
};

export default SalesCalendar;