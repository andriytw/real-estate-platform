
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Calendar, MessageSquare, Settings, LogOut, User, PieChart, TrendingUp, Users, CheckCircle2, AlertCircle, Clock, ArrowRight, Building, Briefcase, Mail, DollarSign, FileText, Calculator, ChevronDown, ChevronRight, FileBox, Bookmark, X, Save, Send, Building2, Phone, MapPin, Home, Search, Filter, Plus, Edit, Camera, BarChart3, Box, FolderOpen, Folder, File as FileIcon, Upload, Trash2, AreaChart, PenTool, DoorOpen, Wrench, Check, Zap, Droplet, Flame } from 'lucide-react';
import { useWorker } from '../contexts/WorkerContext';
import AdminCalendar from './AdminCalendar';
import AdminMessages from './AdminMessages';
import SalesCalendar from './SalesCalendar';
import SalesChat from './SalesChat';
import BookingDetailsModal from './BookingDetailsModal';
import InvoiceModal from './InvoiceModal';
import OfferEditModal from './OfferEditModal';
import PropertyAddModal from './PropertyAddModal';
import RequestModal from './RequestModal';
import BankingDashboard from './BankingDashboard';
import KanbanBoard from './kanban/KanbanBoard';
import { propertiesService } from '../services/supabaseService';
import { ReservationData, OfferData, InvoiceData, CalendarEvent, TaskType, TaskStatus, Lead, Property, RentalAgreement, MeterLogEntry, FuturePayment, PropertyEvent, BookingStatus, RequestData } from '../types';
import { ROOMS } from '../constants';
import { MOCK_PROPERTIES } from '../constants';
import { shouldShowInReservations, createFacilityTasksForBooking, updateBookingStatusFromTask, getBookingStyle } from '../bookingUtils';

// --- Types ---
type Department = 'properties' | 'facility' | 'accounting' | 'sales' | 'tasks';
type FacilityTab = 'overview' | 'calendar' | 'messages';
type AccountingTab = 'dashboard' | 'invoices' | 'expenses' | 'calendar' | 'banking';
type SalesTab = 'leads' | 'calendar' | 'offers' | 'reservations' | 'requests' | 'history' | 'chat'; 
type PropertiesTab = 'list' | 'units';

// --- TASK CATEGORIES ---
const FACILITY_TASK_TYPES: TaskType[] = [
    'Einzug', 'Auszug', 'Putzen', 'Reklamation', 'Arbeit nach plan', 'Zeit Abgabe von wohnung', 'Zählerstand'
];

const ACCOUNTING_TASK_TYPES: TaskType[] = [
    'Tax Payment', 'Payroll', 'Invoice Processing', 'Audit', 'Monthly Closing', 
    'Rent Collection', 'Utility Payment', 'Insurance', 'Mortgage Payment', 'VAT Return',
    'Financial Report', 'Budget Review', 'Asset Depreciation', 'Vendor Payment', 'Bank Reconciliation'
];

// Initial Mock Data for Activities (Facility Management) ---
interface ActivityItem {
  id: string;
  type: 'task' | 'message' | 'alert' | 'status';
  title: string;
  subtitle: string;
  timestamp: string;
  targetTab: FacilityTab;
  isUnread: boolean;
  meta?: string;
}

const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: '1',
    type: 'message',
    title: 'New Message from Hans Weber',
    subtitle: 'Regarding: Friedrichstraße 123 - Heating Issue',
    timestamp: '10 min ago',
    targetTab: 'messages',
    isUnread: true,
    meta: 'Urgent'
  },
  {
    id: '2',
    type: 'task',
    title: 'New Task Created: Final Cleaning',
    subtitle: 'Alexanderplatz 45 • Assigned to Julia',
    timestamp: '25 min ago',
    targetTab: 'calendar',
    isUnread: true,
    meta: 'Putzen'
  },
];

// Initial Mock Data for Admin Calendar
const INITIAL_ADMIN_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Friedrichstraße 123', propertyId: '1', time: '09:00', type: 'Einzug', day: 20, description: 'New tenant handover.', assignee: 'Julia Müller', status: 'pending' },
  { id: '2', title: 'Alexanderplatz 45', propertyId: '2', time: '14:00', type: 'Putzen', day: 20, description: 'Final cleaning.', assignee: 'Hans Weber', status: 'review' }, 
];

// Initial Mock Data for Accounting
const INITIAL_ACCOUNTING_EVENTS: CalendarEvent[] = [
    { id: 'acc-1', title: 'Monthly Tax Submission', propertyId: '1', time: '10:00', type: 'Tax Payment', day: 15, description: 'Submit VAT report.', status: 'pending' },
    { id: 'acc-2', title: 'Payroll Processing', propertyId: '2', time: '14:00', type: 'Payroll', day: 28, description: 'Process staff salaries.', status: 'completed' }
];

const INITIAL_LEADS: Lead[] = [
  { id: 'l1', name: 'TechCorp GmbH', type: 'Company', contactPerson: 'Mark Zuckerberg', email: 'mark@techcorp.com', phone: '+1 555 0123', address: 'Silicon Valley, CA', status: 'Active', createdAt: '2025-10-15' },
  { id: 'l2', name: 'Schmidt, Anna', type: 'Private', email: 'anna.schmidt@email.com', phone: '+49 123 4567', address: 'Berlin, Germany', status: 'Past', createdAt: '2025-08-10' },
];

const AccountDashboard: React.FC = () => {
  const { worker, logout } = useWorker();
  
  // Navigation State
  const [activeDepartment, setActiveDepartment] = useState<Department>('properties');
  const [expandedSections, setExpandedSections] = useState<Record<Department, boolean>>({
    properties: true,
    facility: true,
    accounting: true,
    sales: true,
    tasks: true
  });
  
  const [propertiesTab, setPropertiesTab] = useState<PropertiesTab>('list');
  const [facilityTab, setFacilityTab] = useState<FacilityTab>('overview');
  const [accountingTab, setAccountingTab] = useState<AccountingTab>('dashboard');
  const [salesTab, setSalesTab] = useState<SalesTab>('leads');

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);

  // Load properties from Supabase
  useEffect(() => {
    const loadProperties = async () => {
      try {
        setIsLoadingProperties(true);
        const data = await propertiesService.getAll();
        setProperties(data);
        // Use functional update to avoid dependency on selectedPropertyId
        setSelectedPropertyId(prev => {
          if (!prev && data.length > 0) {
            return data[0].id;
          }
          return prev;
        });
      } catch (error) {
        console.error('Error loading properties in Dashboard:', error);
        // Fallback to mock data if error
        setProperties(MOCK_PROPERTIES);
        setSelectedPropertyId(prev => {
          if (!prev && MOCK_PROPERTIES.length > 0) {
            return MOCK_PROPERTIES[0].id;
          }
          return prev;
        });
      } finally {
        setIsLoadingProperties(false);
      }
    };
    loadProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount
  const [isPropertyAddModalOpen, setIsPropertyAddModalOpen] = useState(false);
  const [isInventoryEditing, setIsInventoryEditing] = useState(false);

  const [activities, setActivities] = useState<ActivityItem[]>(INITIAL_ACTIVITIES);
  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const stored = localStorage.getItem('leads');
      return stored ? JSON.parse(stored) : INITIAL_LEADS;
    } catch {
      return INITIAL_LEADS;
    }
  });
  const [requests, setRequests] = useState<RequestData[]>(() => {
    // Завантажити requests з localStorage при ініціалізації
    try {
      const stored = localStorage.getItem('requests');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  // Слухати події додавання нових requests
  React.useEffect(() => {
    const handleRequestAdded = (event: CustomEvent<RequestData>) => {
      setRequests(prev => [event.detail, ...prev]);
      // Створити Lead з Request
      const newLead: Lead = {
          id: `lead-${Date.now()}`,
          name: event.detail.companyName || `${event.detail.firstName} ${event.detail.lastName}`,
          type: event.detail.companyName ? 'Company' : 'Private',
          contactPerson: event.detail.companyName ? `${event.detail.firstName} ${event.detail.lastName}` : undefined,
          email: event.detail.email,
          phone: event.detail.phone,
          address: '',
          status: 'Active',
          createdAt: new Date().toISOString().split('T')[0],
          source: event.detail.id
      };
      setLeads(prev => [...prev, newLead]);
    };
    
    window.addEventListener('requestAdded', handleRequestAdded as EventListener);
    return () => window.removeEventListener('requestAdded', handleRequestAdded as EventListener);
  }, []);
  
  // Синхронізувати requests з localStorage при змінах
  // Use length instead of array to avoid React error #310
  React.useEffect(() => {
    localStorage.setItem('requests', JSON.stringify(requests));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests.length]); // Only depend on length, not the array itself

  // Синхронізувати leads з localStorage при змінах
  // Use length instead of array to avoid React error #310
  React.useEffect(() => {
    try {
      localStorage.setItem('leads', JSON.stringify(leads));
    } catch (error) {
      console.error('Failed to save leads to localStorage:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads.length]); // Only depend on length, not the array itself

  const [offers, setOffers] = useState<OfferData[]>([
      { 
        id: '101', 
        clientName: 'TechCorp GmbH', 
        propertyId: 'B2', 
        internalCompany: 'Wonowo', 
        price: '€2400', 
        dates: '2025-11-25 to 2025-12-05', 
        status: 'Sent', 
        createdAt: 'Nov 20, 2025, 10:00 AM',
        guests: '4 Guests',
        email: 'info@techcorp.de',
        phone: '+49 30 555000',
        address: 'Tech Allee 1, 10115 Berlin',
        checkInTime: '15:00',
        checkOutTime: '11:00',
        guestList: [{firstName: 'Mark', lastName: 'Z'}, {firstName: 'Elon', lastName: 'M'}],
        comments: 'Requires projector in living room.',
        unit: 'B2.Berl.H22'
      }
  ]);

  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [adminEvents, setAdminEvents] = useState<CalendarEvent[]>(INITIAL_ADMIN_EVENTS);
  const [accountingEvents, setAccountingEvents] = useState<CalendarEvent[]>(INITIAL_ACCOUNTING_EVENTS);

  // --- Modals ---
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null);
  const [viewingOffer, setViewingOffer] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedOfferForInvoice, setSelectedOfferForInvoice] = useState<OfferData | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [isOfferEditModalOpen, setIsOfferEditModalOpen] = useState(false);
  const [offerToEdit, setOfferToEdit] = useState<OfferData | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestData | null>(null);

  // Stats
  const activePropertiesCount = properties.length;
  const activeTasksCount = 14; 
  const taskBreakdown = { cleaning: 4, repairs: 3, handover: 2, other: 5 };
  const unreadMessagesCount = activities.filter(a => a.type === 'message' && a.isUnread).length;

  const handleActivityClick = (activity: ActivityItem) => {
    const updatedActivities = activities.map(item => 
      item.id === activity.id ? { ...item, isUnread: false } : item
    );
    setActivities(updatedActivities);
    setFacilityTab(activity.targetTab);
  };

  const toggleSection = (dept: Department) => {
    setExpandedSections(prev => ({ ...prev, [dept]: !prev[dept] }));
  };

  // --- Handlers ---
  const handleSaveProperty = (newProperty: Property) => {
    setProperties([...properties, newProperty]);
    setSelectedPropertyId(newProperty.id);
    setIsPropertyAddModalOpen(false);
  };

  const handleAddInventoryRow = () => {
    const updatedProperties = properties.map(prop => {
        if (prop.id === selectedPropertyId) {
            const count = prop.inventory.length + 1;
            const prefix = prop.title.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'P');
            const autoId = `${prefix}-${prop.id}-INV${String(count).padStart(3, '0')}`;
            const newItem = { type: '', invNumber: autoId, quantity: 1, cost: 0 };
            return { ...prop, inventory: [...prop.inventory, newItem] };
        }
        return prop;
    });
    setProperties(updatedProperties);
    setIsInventoryEditing(true);
  };

  const handleUpdateInventoryItem = (index: number, field: string, value: string | number) => {
    const updatedProperties = properties.map(prop => {
        if (prop.id === selectedPropertyId) {
            const newInventory = [...prop.inventory];
            // @ts-ignore
            newInventory[index] = { ...newInventory[index], [field]: value };
            return { ...prop, inventory: newInventory };
        }
        return prop;
    });
    setProperties(updatedProperties);
  };

  const handleDeleteInventoryItem = (index: number) => {
    const updatedProperties = properties.map(prop => {
        if (prop.id === selectedPropertyId) {
            const newInventory = prop.inventory.filter((_, i) => i !== index);
            return { ...prop, inventory: newInventory };
        }
        return prop;
    });
    setProperties(updatedProperties);
  };

  const handleSaveOffer = (newOffer: OfferData) => {
      setOffers([newOffer, ...offers]);
      setSalesTab('offers');
  };

  const handleSaveReservation = (reservation: ReservationData) => {
      setReservations(prev => [reservation, ...prev]);
      // Якщо резервація створена з Request, помітити Request як processed
      if (selectedRequest) {
          setRequests(prev => prev.map(req => 
              req.id === selectedRequest.id 
                  ? { ...req, status: 'processed' as const, processedAt: new Date().toISOString() }
                  : req
          ));
          setSelectedRequest(null);
          // Request already has a lead created, so skip lead creation
      } else {
          // Create lead from reservation if it doesn't exist
          const isCompany = reservation.clientType === 'Company' || !!reservation.companyName;
          const name = isCompany 
              ? (reservation.companyName || reservation.company || reservation.guest)
              : (reservation.guest || `${reservation.firstName || ''} ${reservation.lastName || ''}`.trim());
          
          if (name && name.trim() !== '') {
              const email = reservation.email || '';
              const exists = leads.find(l => 
                  l.name.toLowerCase() === name.toLowerCase() || 
                  (l.email && email && l.email.toLowerCase() === email.toLowerCase())
              );
              
              if (!exists) {
                  const newLead: Lead = {
                      id: `lead-${Date.now()}`,
                      name: name.trim(),
                      type: isCompany ? 'Company' : 'Private',
                      contactPerson: isCompany ? (reservation.guest || `${reservation.firstName || ''} ${reservation.lastName || ''}`.trim()) : undefined,
                      email: email,
                      phone: reservation.phone || '',
                      address: reservation.address || '',
                      status: 'Active',
                      createdAt: new Date().toISOString().split('T')[0],
                      source: `reservation-${reservation.id}`
                  };
                  setLeads(prev => [...prev, newLead].sort((a, b) => a.name.localeCompare(b.name)));
              }
          }
      }
  };

  const handleAddRequest = (request: RequestData) => {
      setRequests(prev => [request, ...prev]);
      // Створити Lead з Request
      const newLead: Lead = {
          id: `lead-${Date.now()}`,
          name: request.companyName || `${request.firstName} ${request.lastName}`,
          type: request.companyName ? 'Company' : 'Private',
          contactPerson: request.companyName ? `${request.firstName} ${request.lastName}` : undefined,
          email: request.email,
          phone: request.phone,
          address: '',
          status: 'Active',
          createdAt: new Date().toISOString().split('T')[0],
          source: request.id
      };
      setLeads(prev => [...prev, newLead]);
  };

  const handleProcessRequest = (request: RequestData) => {
      // Відкрити модал з даними request
      setSelectedRequest(request);
      setIsRequestModalOpen(true);
  };

  const handleGoToCalendarFromRequest = () => {
      // Перейти в Sales calendar та префілити форму
      // selectedRequest вже буде використаний через prefilledRequestData prop
      setActiveDepartment('sales');
      setSalesTab('calendar');
      setIsRequestModalOpen(false);
      // selectedRequest залишається встановленим для префілу форми
  };

  const handleDeleteRequest = (requestId: string) => {
      setRequests(prev => prev.map(req => 
          req.id === requestId ? { ...req, status: 'archived' as const } : req
      ));
  };
  
  const handleAddLeadFromBooking = (bookingData: any) => {
    // Handle both formData from SalesCalendar and Booking objects
    const isCompany = bookingData.clientType === 'Company' || !!bookingData.companyName;
    const name = isCompany 
      ? (bookingData.companyName || bookingData.company || bookingData.guest)
      : (bookingData.guest || `${bookingData.firstName || ''} ${bookingData.lastName || ''}`.trim());
    
    if (!name || name.trim() === '') return; // Skip if no name
    
    const email = bookingData.email || '';
    const phone = bookingData.phone || '';
    
    // Check for duplicates by name or email
    const exists = leads.find(l => 
      l.name.toLowerCase() === name.toLowerCase() || 
      (l.email && email && l.email.toLowerCase() === email.toLowerCase())
    );
    if (exists) return;
    
    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      name: name.trim(),
      type: isCompany ? 'Company' : 'Private',
      contactPerson: isCompany ? (bookingData.guest || `${bookingData.firstName || ''} ${bookingData.lastName || ''}`.trim()) : undefined,
      email: email,
      phone: phone,
      address: bookingData.address || '',
      status: 'Active',
      createdAt: new Date().toISOString().split('T')[0],
      source: bookingData.source || `booking-${bookingData.id || Date.now()}`
    };
    setLeads(prev => [...prev, newLead].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleDeleteReservation = (id: number) => {
      setReservations(prev => prev.filter(r => r.id !== id));
  };

  const openManageModal = (reservation: ReservationData) => {
      setViewingOffer(false);
      setSelectedReservation(reservation);
      setIsManageModalOpen(true);
  };

  const mapOfferToBooking = (offer: OfferData): ReservationData => {
      const [start, end] = offer.dates.split(' to ');
      return {
          id: Number(offer.id) || Date.now(),
          roomId: offer.propertyId,
          start: start,
          end: end || start,
          guest: offer.clientName,
          status: offer.status === 'Sent' ? 'Offer Sent' : 'Draft Offer',
          color: 'bg-blue-600',
          checkInTime: offer.checkInTime || '-',
          checkOutTime: offer.checkOutTime || '-',
          price: offer.price,
          balance: offer.price, 
          guests: offer.guests || '-',
          unit: offer.unit || '-',
          comments: offer.comments || '',
          paymentAccount: 'Pending',
          company: 'N/A', 
          internalCompany: offer.internalCompany, 
          ratePlan: 'Standard',
          guarantee: '-',
          cancellationPolicy: '-',
          noShowPolicy: '-',
          channel: 'Direct',
          type: 'GUEST',
          createdAt: offer.createdAt,
          address: offer.address || '-',
          phone: offer.phone || '-',
          email: offer.email || '-',
          totalGross: offer.price,
          guestList: offer.guestList || []
      };
  };

  const handleViewOffer = (offer: OfferData) => {
      const mappedBooking = mapOfferToBooking(offer);
      setViewingOffer(true); 
      setOfferToEdit(offer);
      setSelectedReservation(mappedBooking);
      setIsManageModalOpen(true);
  };

  const closeManageModals = () => {
      setIsManageModalOpen(false);
      setSelectedReservation(null);
      setViewingOffer(false);
  };

  const handleEditOfferClick = () => {
      if (offerToEdit) {
          setIsManageModalOpen(false);
          setIsOfferEditModalOpen(true);
      }
  };

  const handleSaveOfferUpdate = (updatedOffer: OfferData) => {
      setOffers(prev => prev.map(o => o.id === updatedOffer.id ? updatedOffer : o));
      const mappedBooking = mapOfferToBooking(updatedOffer);
      setSelectedReservation(mappedBooking);
      setOfferToEdit(updatedOffer);
      setIsOfferEditModalOpen(false);
      setIsManageModalOpen(true);
  };

  const handleConvertToOffer = (status: 'Draft' | 'Sent', internalCompany: string, email: string) => {
      if (!selectedReservation) return;
      const newOffer: OfferData = {
          id: String(selectedReservation.id), // Використовуємо id резервації для правильного зв'язку
          clientName: selectedReservation.guest,
          propertyId: selectedReservation.roomId, 
          internalCompany: internalCompany,
          price: selectedReservation.totalGross || selectedReservation.price,
          dates: `${selectedReservation.start} to ${selectedReservation.end}`,
          status: status,
          createdAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          guests: selectedReservation.guests,
          email: email || selectedReservation.email,
          phone: selectedReservation.phone,
          address: selectedReservation.address,
          checkInTime: selectedReservation.checkInTime,
          checkOutTime: selectedReservation.checkOutTime,
          guestList: selectedReservation.guestList,
          comments: selectedReservation.comments,
          unit: selectedReservation.unit,
      };
      setOffers(prev => [newOffer, ...prev]);
      // Оновити статус резервації на offer_sent або offer_prepared
      const newStatus = status === 'Sent' ? BookingStatus.OFFER_SENT : BookingStatus.OFFER_PREPARED;
      setReservations(prev => prev.map(r => 
          r.id === selectedReservation.id
              ? { ...r, status: newStatus }
              : r
      ));
      closeManageModals();
      setSalesTab('offers');
  };
  
  const handleSendOffer = () => {
      if (!selectedReservation) return;
      
      // Створити Offer об'єкт з даних резервації
      const newOffer: OfferData = {
          id: String(selectedReservation.id),
          clientName: selectedReservation.guest,
          propertyId: selectedReservation.roomId,
          internalCompany: selectedReservation.internalCompany || 'Sotiso',
          price: selectedReservation.price,
          dates: `${selectedReservation.start} to ${selectedReservation.end}`,
          status: 'Sent',
          createdAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
          guests: selectedReservation.guests,
          email: selectedReservation.email,
          phone: selectedReservation.phone,
          address: selectedReservation.address,
          checkInTime: selectedReservation.checkInTime,
          checkOutTime: selectedReservation.checkOutTime,
          guestList: selectedReservation.guestList,
          comments: selectedReservation.comments,
          unit: selectedReservation.unit,
      };
      
      // Додати Offer в масив offers
      setOffers(prev => [newOffer, ...prev]);
      
      // Оновити статус резервації на offer_sent та колір
      setReservations(prev => prev.map(r => 
          r.id === selectedReservation.id
              ? { ...r, status: BookingStatus.OFFER_SENT, color: getBookingStyle(BookingStatus.OFFER_SENT) }
              : r
      ));
      
    closeManageModals();
      // Переключитись на вкладку Offers
      setSalesTab('offers');
  };
  
  const handleCreateInvoiceClick = (offer: OfferData | ReservationData) => {
    closeManageModals();
    // Якщо це резервація, конвертувати в offer для створення інвойсу
    if ('roomId' in offer && 'start' in offer) {
      const reservation = offer as ReservationData;
      const offerData: OfferData = {
        id: String(reservation.id),
        clientName: reservation.guest,
        propertyId: reservation.roomId,
        internalCompany: reservation.internalCompany || 'Sotiso',
        price: reservation.price,
        dates: `${reservation.start} to ${reservation.end}`,
        status: 'Sent',
        address: reservation.address,
        email: reservation.email,
        phone: reservation.phone,
        guests: reservation.guests,
        guestList: reservation.guestList,
        unit: reservation.unit,
        checkInTime: reservation.checkInTime,
        checkOutTime: reservation.checkOutTime,
        comments: reservation.comments,
      };
      setSelectedOfferForInvoice(offerData);
    } else {
      setSelectedOfferForInvoice(offer as OfferData);
    }
    setIsInvoiceModalOpen(true);
  };
  
  const handleViewInvoice = (inv: InvoiceData) => {
      setSelectedInvoice(inv);
      setIsInvoiceModalOpen(true);
  };
  
  const handleSaveInvoice = (invoice: InvoiceData) => {
      const exists = invoices.some(inv => inv.id === invoice.id);
      if (exists) {
         setInvoices(prev => prev.map(inv => inv.id === invoice.id ? invoice : inv));
      } else {
         setInvoices(prev => [invoice, ...prev]);
      }
      
      // Оновити статус Offer на 'Invoiced' замість видалення (для збереження історії)
      if (invoice.offerIdSource) {
          setOffers(prev => prev.map(o => 
              o.id === invoice.offerIdSource || String(o.id) === String(invoice.offerIdSource)
                  ? { ...o, status: 'Invoiced' }
                  : o
          ));
      }
      
      // Оновити статус резервації на invoiced та колір якщо є bookingId
      if (invoice.bookingId) {
          setReservations(prev => prev.map(r => 
              r.id === invoice.bookingId || String(r.id) === String(invoice.bookingId)
                  ? { ...r, status: BookingStatus.INVOICED, color: getBookingStyle(BookingStatus.INVOICED) }
                  : r
          ));
      }
      
      setIsInvoiceModalOpen(false);
      setSelectedOfferForInvoice(null);
      setSelectedInvoice(null);
      setActiveDepartment('accounting');
      setAccountingTab('invoices');
  };

  const toggleInvoiceStatus = (invoiceId: string) => {
    setInvoices(prev => prev.map(inv => {
        if (inv.id === invoiceId) {
            const newStatus = inv.status === 'Paid' ? 'Unpaid' : 'Paid';
            if (newStatus === 'Paid') {
                // Знайти пов'язану резервацію через bookingId або offerIdSource
                let linkedBooking: ReservationData | undefined;
                
                if (inv.bookingId) {
                    linkedBooking = reservations.find(r => r.id === inv.bookingId || String(r.id) === String(inv.bookingId));
                }
                
                if (!linkedBooking) {
                const linkedOffer = offers.find(o => o.id === inv.offerIdSource || o.id === String(inv.offerIdSource));
                if (linkedOffer) {
                        // Конвертувати offer в booking для створення тасок
                        const [start, end] = linkedOffer.dates.split(' to ');
                        linkedBooking = {
                            id: Number(linkedOffer.id) || Date.now(),
                            roomId: linkedOffer.propertyId,
                            start: start,
                            end: end || start,
                            guest: linkedOffer.clientName,
                            status: BookingStatus.OFFER_SENT,
                            color: '',
                            checkInTime: linkedOffer.checkInTime || '15:00',
                            checkOutTime: linkedOffer.checkOutTime || '11:00',
                            price: linkedOffer.price,
                            balance: '0.00 EUR',
                            guests: linkedOffer.guests || '-',
                            unit: linkedOffer.unit || '-',
                            comments: linkedOffer.comments || '',
                            paymentAccount: 'Pending',
                            company: 'N/A',
                            ratePlan: 'Standard',
                            guarantee: '-',
                            cancellationPolicy: '-',
                            noShowPolicy: '-',
                            channel: 'Direct',
                            type: 'GUEST'
                        };
                    }
                }
                
                if (linkedBooking) {
                    // Оновити статус броні на paid та колір
                    setReservations(prev => prev.map(r => 
                        r.id === linkedBooking!.id
                            ? { ...r, status: BookingStatus.PAID, color: getBookingStyle(BookingStatus.PAID) }
                            : r
                    ));
                    
                    // Перевірити чи вже існують таски для цього бронювання
                    const existingTasks = adminEvents.filter(e => 
                        e.bookingId === linkedBooking!.id || 
                        String(e.bookingId) === String(linkedBooking!.id)
                    );
                    const hasEinzugTask = existingTasks.some(e => e.type === 'Einzug');
                    const hasAuszugTask = existingTasks.some(e => e.type === 'Auszug');
                    
                    // Створити Facility tasks тільки якщо вони ще не існують
                    if (!hasEinzugTask || !hasAuszugTask) {
                        const tasks = createFacilityTasksForBooking(linkedBooking);
                        // Фільтрувати таски які вже існують
                        const newTasks = tasks.filter(task => 
                            (task.type === 'Einzug' && !hasEinzugTask) ||
                            (task.type === 'Auszug' && !hasAuszugTask)
                        );
                        // Конвертувати tasks в CalendarEvent з правильним статусом
                        const calendarEvents: CalendarEvent[] = newTasks.map(task => ({
                            ...task,
                            status: 'open' as TaskStatus,
                            assignee: undefined,
                            assignedWorkerId: undefined
                        }));
                        if (calendarEvents.length > 0) {
                            setAdminEvents(prevEvents => [...prevEvents, ...calendarEvents]);
                        }
                    }
                    
                    // Оновити meter log в property
                    setProperties(prevProps => prevProps.map(prop => {
                        if (prop.id === linkedBooking!.roomId) {
                            const newLogs: MeterLogEntry[] = [
                                { date: linkedBooking!.start, type: 'Check-In', bookingId: linkedBooking!.id, readings: { electricity: 'Pending', water: 'Pending', gas: 'Pending' } },
                                { date: linkedBooking!.end, type: 'Check-Out', bookingId: linkedBooking!.id, readings: { electricity: 'Pending', water: 'Pending', gas: 'Pending' } }
                            ];
                            const updatedLog = [...(prop.meterLog || []), ...newLogs];
                            return { ...prop, meterLog: updatedLog };
                        }
                        return prop;
                    }));
                }
            } else {
                // Якщо статус змінюється на Unpaid, повернути статус броні на invoiced та колір
                if (inv.bookingId) {
                    setReservations(prev => prev.map(r => 
                        r.id === inv.bookingId || String(r.id) === String(inv.bookingId)
                            ? { ...r, status: BookingStatus.INVOICED, color: getBookingStyle(BookingStatus.INVOICED) }
                            : r
                    ));
                }
            }
            return { ...inv, status: newStatus };
        }
        return inv;
    }));
  };

  const handleAdminEventAdd = (event: CalendarEvent) => {
      setAdminEvents(prev => [...prev, event]);
  };

  const handleAdminEventUpdate = (updatedEvent: CalendarEvent) => {
      setAdminEvents(prev => prev.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
      
      // Оновити статус броні якщо таска верифікована та пов'язана з бронюванням
      if (updatedEvent.status === 'verified' && updatedEvent.bookingId) {
          const newBookingStatus = updateBookingStatusFromTask(updatedEvent);
          if (newBookingStatus) {
              setReservations(prev => prev.map(r => 
                  r.id === updatedEvent.bookingId || String(r.id) === String(updatedEvent.bookingId)
                      ? { ...r, status: newBookingStatus }
                      : r
              ));
          }
          
          // При верифікації Einzug - оновити Property з даними орендаря
          if (updatedEvent.type === 'Einzug' && updatedEvent.propertyId) {
              const linkedBooking = reservations.find(r => 
                  r.id === updatedEvent.bookingId || String(r.id) === String(updatedEvent.bookingId)
              );
              const linkedInvoice = invoices.find(inv => 
                  inv.bookingId === updatedEvent.bookingId || String(inv.bookingId) === String(updatedEvent.bookingId)
              );
              
              if (linkedBooking) {
                  setProperties(prev => prev.map(prop => {
                      if (prop.id === updatedEvent.propertyId) {
                          // Створити нового орендаря з даних бронювання
                          const guestName = linkedBooking.guest || `${linkedBooking.firstName || ''} ${linkedBooking.lastName || ''}`.trim() || 'Unknown';
                          const rentAmount = parseFloat(String(linkedBooking.price).replace(/[^0-9.]/g, '')) || 0;
                          
                          const newTenant = {
                              name: guestName,
                              phone: linkedBooking.phone || '-',
                              email: linkedBooking.email || '-',
                              rent: rentAmount,
                              deposit: 0,
                              startDate: linkedBooking.start,
                              km: rentAmount,
                              bk: 0,
                              hk: 0
                          };
                          
                          // Створити новий договір оренди
                          const newAgreement: RentalAgreement = {
                              id: `agreement-${Date.now()}`,
                              tenantName: guestName,
                              startDate: linkedBooking.start,
                              endDate: linkedBooking.end,
                              km: rentAmount,
                              bk: 0,
                              hk: 0,
                              status: 'ACTIVE'
                          };
                          
                          // Оновити попередні активні договори на INACTIVE
                          const updatedHistory = (prop.rentalHistory || []).map(a => 
                              a.status === 'ACTIVE' ? { ...a, status: 'INACTIVE' as const } : a
                          );
                          
                          // Додати оплату з інвойсу якщо оплачено (використовуємо rentAmount з бронювання)
                          const payments = [...(prop.rentPayments || [])];
                          if (linkedInvoice?.status === 'Paid') {
                              payments.unshift({
                                  id: `payment-${Date.now()}`,
                                  date: linkedInvoice.date,
                                  month: new Date(linkedInvoice.date).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }),
                                  amount: `${rentAmount} €`,
                                  status: 'PAID' as const
                              });
                          }
                          
                          return {
                              ...prop,
                              status: 'Rented' as const,
                              term: `${linkedBooking.start} - ${linkedBooking.end}`,
                              termStatus: 'green' as const,
                              tenant: newTenant,
                              rentalHistory: [newAgreement, ...updatedHistory],
                              rentPayments: payments
                          };
                      }
                      return prop;
                  }));
              }
          }
      }
      
      // Update Meter Log in Property when Task is Verified or Archived (or when meter readings have actual values)
      const hasMeterReadings = updatedEvent.meterReadings && (
          updatedEvent.meterReadings.electricity || 
          updatedEvent.meterReadings.water || 
          updatedEvent.meterReadings.gas
      );
      const shouldUpdateMeterLog = hasMeterReadings && 
          (updatedEvent.type === 'Einzug' || updatedEvent.type === 'Auszug' || updatedEvent.type === 'Zählerstand') &&
          (updatedEvent.status === 'archived' || updatedEvent.status === 'verified' || 
           (updatedEvent.meterReadings.electricity && updatedEvent.meterReadings.electricity !== 'Pending' && updatedEvent.meterReadings.electricity.trim() !== '') ||
           (updatedEvent.meterReadings.water && updatedEvent.meterReadings.water !== 'Pending' && updatedEvent.meterReadings.water.trim() !== '') ||
           (updatedEvent.meterReadings.gas && updatedEvent.meterReadings.gas !== 'Pending' && updatedEvent.meterReadings.gas.trim() !== ''));
      
      if (shouldUpdateMeterLog) {
          setProperties(prevProps => prevProps.map(prop => {
              if (prop.id === updatedEvent.propertyId) {
                  const meterLogType = updatedEvent.type === 'Einzug' ? 'Check-In' : 
                                      updatedEvent.type === 'Auszug' ? 'Check-Out' : 
                                      'Interim';
                  
                  let updatedLog = [...(prop.meterLog || [])];
                  let found = false;
                  
                  // Try to find and update existing entry
                  updatedLog = updatedLog.map(entry => {
                      // Match by date and bookingId (if available), or just by date and type if bookingId is missing
                      const dateMatches = entry.date === updatedEvent.date;
                      const bookingIdMatches = !entry.bookingId || !updatedEvent.bookingId || 
                                              entry.bookingId === updatedEvent.bookingId || 
                                              String(entry.bookingId) === String(updatedEvent.bookingId);
                      const typeMatches = entry.type === meterLogType;
                      
                      if (dateMatches && bookingIdMatches && typeMatches) {
                          found = true;
                          return { 
                              ...entry, 
                              readings: { 
                                  electricity: updatedEvent.meterReadings?.electricity || entry.readings.electricity, 
                                  water: updatedEvent.meterReadings?.water || entry.readings.water, 
                                  gas: updatedEvent.meterReadings?.gas || entry.readings.gas 
                              }
                          };
                      }
                      return entry;
                  });
                  
                  // If no matching entry found, create a new one
                  if (!found && updatedEvent.date) {
                      const newEntry: MeterLogEntry = {
                          date: updatedEvent.date,
                          type: meterLogType,
                          bookingId: updatedEvent.bookingId,
                          readings: {
                              electricity: updatedEvent.meterReadings?.electricity || 'Pending',
                              water: updatedEvent.meterReadings?.water || 'Pending',
                              gas: updatedEvent.meterReadings?.gas || 'Pending'
                          }
                      };
                      updatedLog.push(newEntry);
                  }
                  
                  return { ...prop, meterLog: updatedLog };
              }
              return prop;
          }));
      }

      // Automatically add Tenant and Rental Agreement when 'Einzug' is Archived
      if (updatedEvent.status === 'archived' && updatedEvent.type === 'Einzug') {
          const linkedOffer = offers.find(o => {
              const [start] = o.dates.split(' to ');
              return o.propertyId === updatedEvent.propertyId && start === updatedEvent.date;
          });

          if (linkedOffer) {
              setProperties(prevProps => prevProps.map(prop => {
                  if (prop.id === updatedEvent.propertyId) {
                      const [start, end] = linkedOffer.dates.split(' to ');
                      const newTenant = {
                          name: linkedOffer.clientName, phone: linkedOffer.phone || '-', email: linkedOffer.email || '-',
                          rent: parseFloat(linkedOffer.price.replace(/[^0-9.]/g, '')) || 0, deposit: 0, startDate: start,
                          km: parseFloat(linkedOffer.price.replace(/[^0-9.]/g, '')) || 0, bk: 0, hk: 0
                      };
                      const newAgreement: RentalAgreement = {
                          id: `agree-${Date.now()}`, tenantName: newTenant.name, startDate: newTenant.startDate,
                          endDate: end || 'Indefinite', km: newTenant.km, bk: newTenant.bk, hk: newTenant.hk, status: 'ACTIVE'
                      };
                      const updatedHistory = [newAgreement, ...(prop.rentalHistory || [])];
                      return {
                          ...prop, term: `${start} - ${end || 'Indefinite'}`, termStatus: 'green', status: 'Rented',
                          tenant: newTenant, rentalHistory: updatedHistory
                      };
                  }
                  return prop;
              }));
          }
      }
  };

  const handleAccountingEventAdd = (event: CalendarEvent) => {
      setAccountingEvents(prev => [...prev, event]);
      
      setProperties(prevProps => prevProps.map(prop => {
          if (prop.id === event.propertyId) {
              const isPayment = ['Tax Payment', 'Payroll', 'Rent Collection', 'Utility Payment', 'Insurance', 'Mortgage Payment', 'Vendor Payment'].includes(event.type);
              
              if (isPayment) {
                  const newPayment: FuturePayment = {
                      date: `${new Date().getFullYear()}-11-${event.day}`,
                      recipient: 'External Party',
                      amount: 0,
                      category: event.type,
                      status: 'PENDING',
                      docId: `TASK-${event.id}`
                  };
                  return { ...prop, futurePayments: [...(prop.futurePayments || []), newPayment] };
              } else {
                  const newPropEvent: PropertyEvent = {
                      datetime: `${new Date().getFullYear()}-11-${event.day}, ${event.time}`,
                      type: 'Service',
                      status: 'Scheduled',
                      description: event.title + ': ' + event.type,
                      participant: 'Accounting',
                      priority: 'Medium'
                  };
                  return { ...prop, events: [...(prop.events || []), newPropEvent] };
              }
          }
          return prop;
      }));
  };

  const handleAccountingEventUpdate = (updatedEvent: CalendarEvent) => {
      setAccountingEvents(prev => prev.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
  };

  // Helper function to process and group meter readings
  const processMeterReadings = (meterLog: MeterLogEntry[] = [], reservations: ReservationData[] = []) => {
    // Separate grouped entries from standalone entries
    const groupedEntries: Array<{
      customerName: string;
      period: string;
      checkInDate: string;
      checkOutDate: string;
      checkInReadings: { electricity: string; water: string; gas: string };
      checkOutReadings: { electricity: string; water: string; gas: string };
      usedAmount: { electricity: string; water: string; gas: string };
      status: 'complete' | 'pending';
      bookingId?: string | number;
    }> = [];
    
    const standaloneEntries: MeterLogEntry[] = [];
    
    // Group Check-In and Check-Out by bookingId
    const checkIns = meterLog.filter(e => e.type === 'Check-In' && e.bookingId);
    const checkOuts = meterLog.filter(e => e.type === 'Check-Out' && e.bookingId);
    
    checkIns.forEach(checkIn => {
      const checkOut = checkOuts.find(co => co.bookingId === checkIn.bookingId);
      const booking = reservations.find(r => r.id === checkIn.bookingId || String(r.id) === String(checkIn.bookingId));
      
      const customerName = booking?.guest || 'Unknown Customer';
      const period = checkOut 
        ? `${checkIn.date} - ${checkOut.date}`
        : `${checkIn.date} - Ongoing`;
      
      // Calculate usage (simple difference)
      const calculateUsage = (checkInVal: string, checkOutVal: string): string => {
        if (!checkOut || checkInVal === 'Pending' || checkOutVal === 'Pending' || !checkInVal || !checkOutVal) {
          return '-';
        }
        const inVal = parseFloat(checkInVal);
        const outVal = parseFloat(checkOutVal);
        if (isNaN(inVal) || isNaN(outVal)) return '-';
        return (outVal - inVal).toFixed(2);
      };
      
      groupedEntries.push({
        customerName,
        period,
        checkInDate: checkIn.date,
        checkOutDate: checkOut?.date || '',
        checkInReadings: checkIn.readings,
        checkOutReadings: checkOut?.readings || { electricity: 'Pending', water: 'Pending', gas: 'Pending' },
        usedAmount: {
          electricity: calculateUsage(checkIn.readings.electricity, checkOut?.readings.electricity || ''),
          water: calculateUsage(checkIn.readings.water, checkOut?.readings.water || ''),
          gas: calculateUsage(checkIn.readings.gas, checkOut?.readings.gas || '')
        },
        status: checkOut && 
          checkIn.readings.electricity !== 'Pending' && checkIn.readings.water !== 'Pending' && checkIn.readings.gas !== 'Pending' &&
          checkOut.readings.electricity !== 'Pending' && checkOut.readings.water !== 'Pending' && checkOut.readings.gas !== 'Pending'
          ? 'complete' : 'pending',
        bookingId: checkIn.bookingId
      });
    });
    
    // Add standalone entries (Initial, Interim, or Check-Out without matching Check-In)
    meterLog.forEach(entry => {
      if (entry.type === 'Initial' || entry.type === 'Interim') {
        standaloneEntries.push(entry);
      } else if (entry.type === 'Check-Out' && !checkIns.find(ci => ci.bookingId === entry.bookingId)) {
        standaloneEntries.push(entry);
      }
    });
    
    return { groupedEntries, standaloneEntries };
  };

  const renderPropertiesContent = () => {
    const selectedProperty = properties.find(p => p.id === selectedPropertyId) || properties[0];
    if (!selectedProperty) return <div>Loading...</div>;
    const expense = selectedProperty.ownerExpense || { mortgage: 0, management: 0, taxIns: 0, reserve: 0 };
    const totalExpense = expense.mortgage + expense.management + expense.taxIns + expense.reserve;
    const totalInventoryCost = selectedProperty.inventory.reduce((acc, item) => acc + (item.cost * item.quantity), 0);

    return (
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#111315]">
         {/* Left Sidebar - List */}
         <div className="w-full md:w-[350px] flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-3 bg-[#161B22]">
            <div className="mb-4">
                <button 
                    onClick={() => setIsPropertyAddModalOpen(true)}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-colors"
                >
                    <Plus className="w-5 h-5" /> Додати об'єкт
                </button>
            </div>
            <div className="relative mb-4">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
               <input type="text" placeholder="Search..." className="w-full bg-[#0D1117] border border-gray-700 rounded-lg py-2 pl-9 text-sm text-white focus:border-emerald-500 outline-none" />
            </div>
            {properties.map((prop) => (
               <div key={prop.id} onClick={() => setSelectedPropertyId(prop.id)} className={`cursor-pointer p-4 rounded-xl border transition-all duration-200 ${selectedPropertyId === prop.id ? 'bg-[#1C1F24] border-l-4 border-l-emerald-500 border-y-transparent border-r-transparent shadow-lg' : 'bg-[#1C1F24] border-gray-800 hover:bg-[#23262b] hover:border-gray-700'}`}>
                  <div className="flex justify-between items-start mb-1">
                     <h3 className="font-bold text-white text-sm">{prop.title}</h3>
                     <span className={`text-[10px] px-1.5 py-0.5 rounded ${prop.termStatus === 'green' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{prop.termStatus === 'green' ? 'Active' : 'Expiring'}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{prop.address}</p>
               </div>
            ))}
         </div>

         {/* Right Content - Details */}
         <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0D1117]">
            
            {/* Header */}
            <div className="relative h-64 rounded-xl overflow-hidden mb-8 group">
               <img src={selectedProperty.image} alt={selectedProperty.title} className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-transparent to-transparent opacity-90"></div>
               <div className="absolute bottom-6 left-6 right-6">
                  <h1 className="text-4xl font-extrabold text-white mb-1 drop-shadow-md">{selectedProperty.title}</h1>
                  <p className="text-lg text-gray-300 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-500" /> {selectedProperty.fullAddress}</p>
               </div>
            </div>

            {/* 1. Basic Info (Split) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">1. Основні Дані Об'єкта</h2>
                    <button className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"><Edit className="w-4 h-4 mr-1 inline" /> Редагувати</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="border-r border-gray-700 pr-4">
                        <span className="text-xs text-gray-500 block mb-1">Термін Оренди</span>
                        <span className="text-lg font-bold text-emerald-500">{selectedProperty.term}</span>
                    </div>
                    <div className="border-r border-gray-700 pr-4 col-span-2">
                        <span className="text-xs text-gray-500 block mb-1">Опис</span>
                        <span className="text-sm text-gray-300">{selectedProperty.description}</span>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 block mb-1">Адреса</span>
                        <span className="text-sm text-white font-bold">{selectedProperty.fullAddress}</span>
                    </div>
                </div>
                
                {/* Characteristics Grid */}
                <div className="mt-6 pt-6 border-t border-gray-700">
                    <h3 className="text-lg font-bold text-white mb-4">Деталі Об'єкта та Характеристики</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-4 gap-x-6 text-sm">
                        <div><span className="text-gray-500 text-xs block">Площа</span><span className="text-white font-bold">{selectedProperty.details.area}</span></div>
                        <div><span className="text-gray-500 text-xs block">Кімнати/Ліжка</span><span className="text-white font-bold">{selectedProperty.details.rooms} / {selectedProperty.details.beds}</span></div>
                        <div><span className="text-gray-500 text-xs block">Поверх</span><span className="text-white font-bold">{selectedProperty.details.floor} / {selectedProperty.details.buildingFloors}</span></div>
                        <div><span className="text-gray-500 text-xs block">Тип Будівлі</span><span className="text-white font-bold">{selectedProperty.building.type}</span></div>
                        <div><span className="text-gray-500 text-xs block">Опалення</span><span className="text-white font-bold">{selectedProperty.building.heating}</span></div>
                        <div><span className="text-gray-500 text-xs block">Центр. Опалення</span><span className="text-white font-bold">{selectedProperty.building.centralHeating}</span></div>
                        <div><span className="text-gray-500 text-xs block">Паркування</span><span className="text-white font-bold">{selectedProperty.building.parking}</span></div>
                        <div><span className="text-gray-500 text-xs block">Енергоклас</span><span className="text-white font-bold">{selectedProperty.building.energyClass}</span></div>
                    </div>
                </div>
            </section>

            {/* Repair Requests */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Ремонти</h2>
                    <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"><Plus className="w-3 h-3 mr-1 inline"/> Додати Заявку</button>
                </div>
                <div className="overflow-hidden border border-gray-700 rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase">ID</th>
                                <th className="p-3 font-bold text-xs uppercase">Дата</th>
                                <th className="p-3 font-bold text-xs uppercase">Опис</th>
                                <th className="p-3 font-bold text-xs uppercase">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {selectedProperty.repairRequests?.map(req => (
                                <tr key={req.id} className="hover:bg-[#1C1F24]">
                                    <td className="p-3 text-white">{req.id}</td>
                                    <td className="p-3 text-gray-400">{req.date}</td>
                                    <td className="p-3 text-white">{req.description}</td>
                                    <td className="p-3"><span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30">{req.status}</span></td>
                                </tr>
                            ))}
                            {(!selectedProperty.repairRequests || selectedProperty.repairRequests.length === 0) && (
                                <tr><td colSpan={4} className="p-4 text-center text-gray-500 text-xs">Немає активних ремонтів.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Inventory */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Меблі (Інвентар)</h2>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsInventoryEditing(!isInventoryEditing)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${isInventoryEditing ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}
                        >
                            {isInventoryEditing ? <Check className="w-3 h-3 mr-1 inline"/> : <Edit className="w-3 h-3 mr-1 inline"/>}
                            {isInventoryEditing ? 'Зберегти' : 'Редагувати'}
                        </button>
                        {isInventoryEditing && (
                            <button onClick={handleAddInventoryRow} className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"><Plus className="w-3 h-3 mr-1 inline"/> Додати</button>
                        )}
                    </div>
                </div>
                <div className="overflow-hidden border border-gray-700 rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase w-[30%]">Тип</th>
                                <th className="p-3 font-bold text-xs uppercase w-[25%]">Інвентарний №</th>
                                <th className="p-3 font-bold text-xs uppercase w-[15%]">К-сть</th>
                                <th className="p-3 font-bold text-xs uppercase w-[20%]">Вартість</th>
                                {isInventoryEditing && <th className="p-3 font-bold text-xs uppercase w-[10%] text-center">Дії</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {selectedProperty.inventory.map((item, idx) => (
                                <tr key={idx} className="hover:bg-[#1C1F24]">
                                    <td className="p-3">
                                        {isInventoryEditing ? <input className="bg-transparent border-b border-gray-700 w-full text-white outline-none" value={item.type} onChange={(e) => handleUpdateInventoryItem(idx, 'type', e.target.value)} /> : <span className="text-white font-bold">{item.type}</span>}
                                    </td>
                                    <td className="p-3 text-gray-400 text-xs">{item.invNumber}</td>
                                    <td className="p-3">
                                        {isInventoryEditing ? <input type="number" className="bg-transparent border-b border-gray-700 w-16 text-white outline-none" value={item.quantity} onChange={(e) => handleUpdateInventoryItem(idx, 'quantity', parseInt(e.target.value))} /> : <span className="text-gray-300">{item.quantity} шт.</span>}
                                    </td>
                                    <td className="p-3">
                                        {isInventoryEditing ? <input type="number" className="bg-transparent border-b border-gray-700 w-20 text-white outline-none" value={item.cost} onChange={(e) => handleUpdateInventoryItem(idx, 'cost', parseFloat(e.target.value))} /> : <span className="text-white font-mono">{item.cost} €</span>}
                                    </td>
                                    {isInventoryEditing && (
                                        <td className="p-3 text-center">
                                            <button onClick={() => handleDeleteInventoryItem(idx)} className="text-red-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3"/></button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm font-bold text-gray-400">Загальна вартість: <span className="text-emerald-500 ml-1">{totalInventoryCost} €</span></p>
                </div>
            </section>

            {/* Meter Readings (History Log) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <h2 className="text-xl font-bold text-white mb-4">Показання Лічильників (Історія)</h2>
                <div className="overflow-hidden border border-gray-700 rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase">Клієнт</th>
                                <th className="p-3 font-bold text-xs uppercase">Період</th>
                                <th className="p-3 font-bold text-xs uppercase">Check-In</th>
                                <th className="p-3 font-bold text-xs uppercase">Check-Out</th>
                                <th className="p-3 font-bold text-xs uppercase">Використано</th>
                                <th className="p-3 font-bold text-xs uppercase">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {(() => {
                                const { groupedEntries, standaloneEntries } = processMeterReadings(selectedProperty.meterLog, reservations);
                                return (
                                    <>
                                        {/* Grouped Rental Periods */}
                                        {groupedEntries.map((entry, idx) => (
                                            <tr key={`grouped-${idx}`} className="hover:bg-[#1C1F24]">
                                                <td className="p-3 font-bold text-white">{entry.customerName}</td>
                                                <td className="p-3 text-gray-400">{entry.period}</td>
                                                <td className="p-3">
                                                    <div className="space-y-1">
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Zap className="w-3 h-3 text-yellow-500" /> {entry.checkInReadings.electricity || '-'}
                                                        </div>
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Droplet className="w-3 h-3 text-blue-500" /> {entry.checkInReadings.water || '-'}
                                                        </div>
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Flame className="w-3 h-3 text-orange-500" /> {entry.checkInReadings.gas || '-'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="space-y-1">
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Zap className="w-3 h-3 text-yellow-500" /> {entry.checkOutReadings.electricity || '-'}
                                                        </div>
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Droplet className="w-3 h-3 text-blue-500" /> {entry.checkOutReadings.water || '-'}
                                                        </div>
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Flame className="w-3 h-3 text-orange-500" /> {entry.checkOutReadings.gas || '-'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="space-y-1">
                                                        <div className="text-emerald-400 font-mono text-xs font-bold flex items-center gap-1">
                                                            <Zap className="w-3 h-3 text-yellow-500" /> {entry.usedAmount.electricity}
                                                        </div>
                                                        <div className="text-emerald-400 font-mono text-xs font-bold flex items-center gap-1">
                                                            <Droplet className="w-3 h-3 text-blue-500" /> {entry.usedAmount.water}
                                                        </div>
                                                        <div className="text-emerald-400 font-mono text-xs font-bold flex items-center gap-1">
                                                            <Flame className="w-3 h-3 text-orange-500" /> {entry.usedAmount.gas}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                                                        entry.status === 'complete' 
                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                                    }`}>
                                                        {entry.status === 'complete' ? 'Завершено' : 'Очікується'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        
                                        {/* Standalone Entries (Initial, Interim) */}
                                        {standaloneEntries.map((entry, idx) => (
                                            <tr key={`standalone-${idx}`} className="hover:bg-[#1C1F24]">
                                                <td className="p-3 text-gray-500">-</td>
                                                <td className="p-3 text-gray-400">{entry.date}</td>
                                                <td className="p-3" colSpan={2}>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${
                                                        entry.type === 'Initial' 
                                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                                            : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                                                    }`}>
                                                        {entry.type}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="space-y-1">
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Zap className="w-3 h-3 text-yellow-500" /> {entry.readings.electricity || '-'}
                                                        </div>
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Droplet className="w-3 h-3 text-blue-500" /> {entry.readings.water || '-'}
                                                        </div>
                                                        <div className="text-white font-mono text-xs flex items-center gap-1">
                                                            <Flame className="w-3 h-3 text-orange-500" /> {entry.readings.gas || '-'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-gray-500/20 text-gray-400 border border-gray-500/30">
                                                        {entry.readings.electricity === 'Pending' ? 'Очікується' : 'Завершено'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        
                                        {groupedEntries.length === 0 && standaloneEntries.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="p-4 text-center text-gray-500 text-xs">
                                                    Історія показників пуста.
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })()}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Media & Plans */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex justify-between items-center group cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="bg-yellow-500/10 p-2 rounded text-yellow-500"><Camera className="w-5 h-5"/></div>
                        <div><h3 className="font-bold text-white text-sm">Галерея Фото</h3><p className="text-[10px] text-gray-500">12 items</p></div>
                    </div>
                    <button className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex justify-between items-center group cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-500/10 p-2 rounded text-blue-500"><AreaChart className="w-5 h-5"/></div>
                        <div><h3 className="font-bold text-white text-sm">Magic Plan Report</h3><p className="text-[10px] text-gray-500">Generated: 05.09.2025</p></div>
                    </div>
                    <button className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex justify-between items-center group cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="bg-purple-500/10 p-2 rounded text-purple-500"><Box className="w-5 h-5"/></div>
                        <div><h3 className="font-bold text-white text-sm">3D Тур</h3><p className="text-[10px] text-gray-500">Active</p></div>
                    </div>
                    <button className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="bg-[#1C1F24] p-4 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex justify-between items-center group cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-500/10 p-2 rounded text-emerald-500"><PenTool className="w-5 h-5"/></div>
                        <div><h3 className="font-bold text-white text-sm">План (Floor Plan)</h3><p className="text-[10px] text-gray-500">PDF, 2.4 MB</p></div>
                    </div>
                    <button className="bg-emerald-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4"/></button>
                </div>
            </section>

            {/* Current Tenant */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <h2 className="text-2xl font-bold text-white mb-4">5. Актуальний Орендар</h2>
                {selectedProperty.tenant ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="bg-[#16181D] p-4 rounded-lg border border-gray-700">
                                <h3 className="text-xl font-bold text-white mb-1">{selectedProperty.tenant.name}</h3>
                                <p className="text-sm text-gray-400 mb-2">Телефон: {selectedProperty.tenant.phone} | E-mail: {selectedProperty.tenant.email}</p>
                                <p className="text-sm font-medium text-emerald-500 mb-1">Термін: {selectedProperty.tenant.startDate} - Безстроково</p>
                                <p className="text-sm text-gray-300">Місячна оплата: {selectedProperty.tenant.rent} €</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <button className="bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold transition-colors">Договір</button>
                                <button className="bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold transition-colors">Акт Прийому</button>
                                <button className="bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold transition-colors">Прописка</button>
                            </div>
                        </div>
                        {/* Chat Preview */}
                        <div className="bg-[#16181D] border border-gray-700 rounded-lg p-4 flex flex-col h-40 relative overflow-hidden">
                            <h4 className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-700 pb-1">Переписка з Орендарем</h4>
                            <div className="flex-1 space-y-2 overflow-hidden">
                                <div className="flex justify-end"><div className="bg-emerald-600 text-white text-xs px-2 py-1 rounded-t-lg rounded-bl-lg max-w-[80%]">Добрий день, де ключ від поштової скриньки?</div></div>
                                <div className="flex justify-start"><div className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded-t-lg rounded-br-lg max-w-[80%]">Ключ залишив консьєржу.</div></div>
                            </div>
                            <div className="mt-2 flex gap-2">
                                <input placeholder="Написати повідомлення..." className="flex-1 bg-[#0D1117] border border-gray-700 rounded text-xs px-2 py-1 text-white outline-none" />
                                <button className="bg-emerald-500 text-white p-1 rounded"><Send className="w-3 h-3"/></button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-gray-500 text-sm italic">Немає активного орендаря.</div>
                )}
            </section>

            {/* 6. Rental Agreements (Scrollable List) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">6. Договори Оренди</h2>
                    <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">+ Додати нового орендаря</button>
                </div>
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#16181D]">
                    <div className="max-h-[250px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 pr-1">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700 sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 font-bold text-xs uppercase w-[25%]">Орендар</th>
                                    <th className="p-3 font-bold text-xs uppercase w-[15%]">Початок</th>
                                    <th className="p-3 font-bold text-xs uppercase w-[15%]">Кінець</th>
                                    <th className="p-3 font-bold text-xs uppercase w-[10%]">KM (€)</th>
                                    <th className="p-3 font-bold text-xs uppercase w-[10%]">BK (€)</th>
                                    <th className="p-3 font-bold text-xs uppercase w-[10%]">HK (€)</th>
                                    <th className="p-3 font-bold text-xs uppercase w-[15%] text-right">Статус</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                                {selectedProperty.rentalHistory?.map((agree, idx) => (
                                    <tr key={agree.id} className="hover:bg-[#1C1F24] transition-colors">
                                        <td className="p-3 font-bold text-white">{agree.tenantName}</td>
                                        <td className="p-3 text-gray-300">{agree.startDate}</td>
                                        <td className="p-3 text-gray-300">{agree.endDate}</td>
                                        <td className="p-3 text-white font-mono">{agree.km}</td>
                                        <td className="p-3 text-white font-mono">{agree.bk}</td>
                                        <td className="p-3 text-white font-mono">{agree.hk}</td>
                                        <td className="p-3 text-right">
                                            <span className={`px-2 py-0.5 rounded text-[10px] border ${agree.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                                {agree.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {(!selectedProperty.rentalHistory || selectedProperty.rentalHistory.length === 0) && (
                                    <tr><td colSpan={7} className="p-4 text-center text-gray-500 text-xs">Історія договорів пуста.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* 7. Payments History */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <h2 className="text-xl font-bold text-white mb-4">7. Оплати (Історія Орендаря)</h2>
                <div className="mb-4 p-4 border border-gray-700 rounded-lg bg-[#16181D] flex justify-between items-center">
                    <div>
                        <span className="text-xs text-gray-500 block">Актуальний Баланс</span>
                        <span className={`text-2xl font-bold ${(selectedProperty.tenant?.rent || selectedProperty.balance || 0) < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {selectedProperty.tenant?.rent || selectedProperty.balance || 0} €
                        </span>
                    </div>
                    <span className="text-xs text-gray-400">
                        Остання оплата: {selectedProperty.rentPayments && selectedProperty.rentPayments.length > 0 
                            ? selectedProperty.rentPayments[0].date 
                            : 'Немає оплат'}
                    </span>
                </div>
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#16181D]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase">Дата</th>
                                <th className="p-3 font-bold text-xs uppercase">Місяць</th>
                                <th className="p-3 font-bold text-xs uppercase">Сума</th>
                                <th className="p-3 font-bold text-xs uppercase text-right">Статус</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {selectedProperty.rentPayments && selectedProperty.rentPayments.length > 0 ? (
                                selectedProperty.rentPayments.map((payment, index) => (
                                    <tr key={payment.id || index} className="hover:bg-[#1C1F24]">
                                        <td className="p-3 text-gray-300">{payment.date}</td>
                                        <td className="p-3 text-white">{payment.month}</td>
                                        <td className="p-3 text-white font-mono">{payment.amount}</td>
                                        <td className="p-3 text-right">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                                payment.status === 'PAID' 
                                                    ? 'text-emerald-500 bg-emerald-500/10' 
                                                    : payment.status === 'PARTIAL' 
                                                        ? 'text-yellow-500 bg-yellow-500/10' 
                                                        : 'text-red-500 bg-red-500/10'
                                            }`}>
                                                {payment.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="hover:bg-[#1C1F24]">
                                    <td colSpan={4} className="p-3 text-center text-gray-500">Немає оплат</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 8. Documents */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">8. Документи</h2>
                    <button className="text-gray-400 text-xs hover:text-white">Редагувати</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[300px]">
                    <div className="border border-gray-700 rounded-lg bg-[#16181D] p-4">
                        <h4 className="text-sm font-bold text-white mb-2 border-b border-gray-700 pb-2">Навігація</h4>
                        <ul className="space-y-1 text-sm text-gray-400">
                            <li className="flex items-center gap-2 p-1.5 bg-[#1C1F24] rounded text-emerald-500 font-bold"><FolderOpen className="w-4 h-4"/> Договори (3)</li>
                            <li className="flex items-center gap-2 p-1.5 hover:bg-[#1C1F24] rounded transition-colors ml-4"><Folder className="w-4 h-4 text-yellow-500"/> Актуальний (1)</li>
                            <li className="flex items-center gap-2 p-1.5 hover:bg-[#1C1F24] rounded transition-colors"><Folder className="w-4 h-4 text-yellow-500"/> Рахунки (15)</li>
                        </ul>
                    </div>
                    <div className="border border-gray-700 rounded-lg bg-[#16181D] p-4">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                            <h4 className="text-sm font-bold text-white">Файли в "Договори"</h4>
                            <button className="text-emerald-500 hover:text-emerald-400"><Upload className="w-4 h-4"/></button>
                        </div>
                        <ul className="space-y-2 text-sm">
                            <li className="flex justify-between items-center p-2 bg-[#1C1F24] rounded border border-gray-700">
                                <span className="flex items-center gap-2 text-white"><FileIcon className="w-4 h-4 text-red-500"/> Договір_Іванов.pdf</span>
                                <span className="text-xs text-gray-500">1.2 MB</span>
                            </li>
                            <li className="flex justify-between items-center p-2 hover:bg-[#1C1F24] rounded transition-colors">
                                <span className="flex items-center gap-2 text-gray-300"><FileIcon className="w-4 h-4 text-red-500"/> Акт_Прийому.pdf</span>
                                <span className="text-xs text-gray-500">0.8 MB</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </section>

         </div>
      </div>
    );
  };

  const renderAccountingContent = () => {
    if (accountingTab === 'calendar') {
      return <AdminCalendar 
          events={accountingEvents} 
          onAddEvent={handleAccountingEventAdd}
          onUpdateEvent={handleAccountingEventUpdate}
          showLegend={false}
          properties={properties}
          categories={ACCOUNTING_TASK_TYPES}
      />;
    }

    if (accountingTab === 'banking') {
        return <BankingDashboard />;
    }

    if (accountingTab === 'invoices') {
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Invoices List</h2>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">Invoice #</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Due Date</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {invoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-[#16181D]">
                                    <td className="p-4 text-gray-400">#{inv.invoiceNumber}</td>
                                    <td className="p-4 font-bold">{inv.clientName}</td>
                                    <td className="p-4">{inv.date}</td>
                                    <td className="p-4">{inv.dueDate}</td>
                                    <td className="p-4 text-right font-mono">€{inv.totalGross.toFixed(2)}</td>
                                    <td className="p-4">
                                        <span 
                                            onClick={() => toggleInvoiceStatus(inv.id)}
                                            className={`px-2 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                                                inv.status === 'Paid' 
                                                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                                                    : 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                                            }`}
                                        >
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => handleViewInvoice(inv)}
                                            className="text-blue-400 hover:text-blue-300 text-xs font-bold"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {invoices.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500">No invoices found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
            <div className="w-24 h-24 bg-purple-500/10 rounded-full flex items-center justify-center mb-6 border border-purple-500/20">
                <DollarSign className="w-10 h-10 text-purple-500" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Accounting Dashboard</h2>
            <p className="text-gray-400 max-w-md">Financial overview, cashflow analysis, and expense reports.</p>
        </div>
    );
  };

  const renderFacilityContent = () => {
    if (facilityTab === 'calendar') {
        return <AdminCalendar 
            events={adminEvents} 
            onAddEvent={handleAdminEventAdd}
            onUpdateEvent={handleAdminEventUpdate}
            showLegend={true}
            properties={properties}
            onUpdateBookingStatus={(bookingId, newStatus) => {
                setReservations(prev => prev.map(r => 
                    r.id === bookingId || String(r.id) === String(bookingId)
                        ? { ...r, status: newStatus }
                        : r
                ));
            }}
        />;
    }
    if (facilityTab === 'messages') return <AdminMessages />;
    return <div className="p-8 text-white">Facility Overview (Preserved)</div>;
  };

  const renderTasksContent = () => {
    return (
      <div className="h-full w-full">
        <KanbanBoard />
      </div>
    );
  };

  const renderSalesContent = () => {
    if (salesTab === 'leads') {
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Leads List</h2>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Address</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {leads.map(lead => (
                                <tr key={lead.id} className="hover:bg-[#16181D]">
                                    <td className="p-4 text-gray-400">#{lead.id}</td>
                                    <td className="p-4 font-bold">{lead.name}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            lead.type === 'Company' ? 'bg-blue-500/20 text-blue-500' : 'bg-purple-500/20 text-purple-500'
                                        }`}>
                                            {lead.type}
                                        </span>
                                    </td>
                                    <td className="p-4">{lead.email || '-'}</td>
                                    <td className="p-4">{lead.phone || '-'}</td>
                                    <td className="p-4">{lead.address || '-'}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            lead.status === 'Active' ? 'bg-emerald-500/20 text-emerald-500' :
                                            lead.status === 'Potential' ? 'bg-yellow-500/20 text-yellow-500' :
                                            'bg-gray-500/20 text-gray-500'
                                        }`}>
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-400">{lead.createdAt}</td>
                                </tr>
                            ))}
                            {leads.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">No leads found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (salesTab === 'reservations') {
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Reservations List</h2>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Guest</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {reservations.filter(res => shouldShowInReservations(res.status)).map(res => (
                                <tr key={res.id} className="hover:bg-[#16181D]">
                                    <td className="p-4 text-gray-400">#{res.id}</td>
                                    <td className="p-4 font-bold">{res.guest}</td>
                                    <td className="p-4">{ROOMS.find(r => r.id === res.roomId)?.name || res.roomId}</td>
                                    <td className="p-4">{res.start} - {res.end}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${res.status === BookingStatus.RESERVED ? 'bg-blue-500/20 text-blue-500' : res.status === BookingStatus.OFFER_SENT ? 'bg-blue-500/20 text-blue-500 border border-dashed' : res.status === BookingStatus.INVOICED ? 'bg-blue-500/20 text-blue-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                                            {res.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">{res.price}</td>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => openManageModal(res)}
                                            className="text-gray-400 hover:text-white"
                                        >
                                            Manage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {reservations.filter(res => shouldShowInReservations(res.status)).length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500">No reservations found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (salesTab === 'offers') {
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Offers List</h2>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {/* Show Sent, Draft, and Invoiced offers with visual distinction */}
                            {offers.filter(offer => offer.status === 'Sent' || offer.status === 'Draft' || offer.status === 'Invoiced').map(offer => {
                                const isDraft = offer.status === 'Draft';
                                const isInvoiced = offer.status === 'Invoiced';
                                
                                // Determine status color styling
                                const getStatusStyle = () => {
                                    if (isDraft) return 'bg-gray-500/20 text-gray-400 border-gray-500';
                                    if (isInvoiced) return 'bg-purple-500/20 text-purple-400 border-purple-500';
                                    return 'bg-blue-500/20 text-blue-500 border-blue-500';
                                };
                                
                                return (
                                    <tr key={offer.id} className={`hover:bg-[#16181D] ${isDraft || isInvoiced ? 'opacity-70' : ''}`}>
                                        <td className="p-4 text-gray-400">#{offer.id}</td>
                                        <td className="p-4 font-bold">{offer.clientName}</td>
                                        <td className="p-4">{ROOMS.find(r => r.id === offer.propertyId)?.name || offer.propertyId}</td>
                                        <td className="p-4">{offer.dates}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border border-dashed ${getStatusStyle()}`}>
                                                {offer.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono">{offer.price}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex gap-2 justify-center">
                                                <button 
                                                    onClick={() => handleViewOffer(offer)}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
                                                >
                                                    View
                                                </button>
                                                {isDraft && (
                                                    <button 
                                                        onClick={() => {
                                                            // Send draft offer
                                                            setOffers(prev => prev.map(o => 
                                                                o.id === offer.id ? { ...o, status: 'Sent' } : o
                                                            ));
                                                        }}
                                                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold transition-colors"
                                                    >
                                                        Send Offer
                                                    </button>
                                                )}
                                                {offer.status === 'Sent' && (
                                                    <button 
                                                        onClick={() => handleCreateInvoiceClick(offer)}
                                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold transition-colors"
                                                    >
                                                        Create Invoice
                                                    </button>
                                                )}
                                                {isInvoiced && (
                                                    <span className="px-3 py-1.5 text-gray-500 text-xs">Invoice Created</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {offers.filter(offer => offer.status === 'Sent' || offer.status === 'Draft' || offer.status === 'Invoiced').length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500">No offers found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (salesTab === 'requests') {
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Requests List</h2>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">People</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {requests.filter(req => req.status !== 'archived').map(req => (
                                <tr key={req.id} className="hover:bg-[#16181D]">
                                    <td className="p-4 text-gray-400">#{req.id}</td>
                                    <td className="p-4 font-bold">{req.firstName} {req.lastName}</td>
                                    <td className="p-4">{req.email}</td>
                                    <td className="p-4">{req.phone}</td>
                                    <td className="p-4">{req.startDate} - {req.endDate}</td>
                                    <td className="p-4">{req.peopleCount}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : 
                                            req.status === 'processed' ? 'bg-emerald-500/20 text-emerald-500' : 
                                            'bg-gray-500/20 text-gray-500'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex gap-2 justify-center">
                                            <button 
                                                onClick={() => handleProcessRequest(req)}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
                                            >
                                                Process
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteRequest(req.id)}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {requests.filter(req => req.status !== 'archived').length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">No requests found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (salesTab === 'history') {
        // Filter completed/archived reservations
        const completedReservations = reservations.filter(res => 
            res.status === BookingStatus.COMPLETED || 
            res.status === BookingStatus.CHECK_IN_DONE ||
            res.status === 'completed' ||
            res.status === 'archived'
        );
        
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Booking History</h2>
                <p className="text-gray-400 mb-6">Completed and archived bookings</p>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">ID</th>
                                <th className="p-4">Guest</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {completedReservations.map(res => (
                                <tr key={res.id} className="hover:bg-[#16181D] opacity-70">
                                    <td className="p-4 text-gray-400">#{res.id}</td>
                                    <td className="p-4 font-bold">{res.guest || `${res.firstName || ''} ${res.lastName || ''}`.trim() || 'Unknown Guest'}</td>
                                    <td className="p-4">{ROOMS.find(r => r.id === res.roomId)?.name || res.roomId}</td>
                                    <td className="p-4">{res.start} - {res.end}</td>
                                    <td className="p-4">
                                        <span className="px-2 py-1 rounded text-xs font-bold bg-gray-500/20 text-gray-400 border border-gray-500">
                                            {typeof res.status === 'string' ? res.status : 'Completed'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">{res.price || '-'}</td>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => {
                                                setSelectedReservation(res);
                                                setIsManageModalOpen(true);
                                            }}
                                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs font-bold transition-colors"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {completedReservations.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500">No completed bookings found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (salesTab === 'calendar') {
      return <SalesCalendar 
        onSaveOffer={handleSaveOffer} 
        onSaveReservation={handleSaveReservation} 
        onDeleteReservation={handleDeleteReservation}
        onAddLead={handleAddLeadFromBooking}
        reservations={reservations}
        offers={offers}
        invoices={invoices}
        adminEvents={adminEvents}
        prefilledRequestData={selectedRequest ? {
          firstName: selectedRequest.firstName,
          lastName: selectedRequest.lastName,
          email: selectedRequest.email,
          phone: selectedRequest.phone,
          companyName: selectedRequest.companyName,
          peopleCount: selectedRequest.peopleCount,
          startDate: selectedRequest.startDate,
          endDate: selectedRequest.endDate,
          message: selectedRequest.message,
          propertyId: selectedRequest.propertyId,
        } : undefined}
      />;
    }

    if (salesTab === 'chat') {
      return (
        <div className="h-full">
          <SalesChat
            onCreateOffer={(request) => {
              // Перейти до створення Offer з Request
              setSalesTab('offers');
              // TODO: відкрити OfferEditModal з даними з Request
            }}
            onViewRequest={(request) => {
              setSelectedRequest(request);
              setIsRequestModalOpen(true);
            }}
          />
        </div>
      );
    }

    return <div className="p-8 text-white">Sales Content (Preserved)</div>;
  };

  return (
    <div className="flex h-screen bg-[#111315] text-white overflow-hidden font-sans">
      <div className="w-64 flex-shrink-0 border-r border-gray-800 bg-[#111315] flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Building2 className="w-6 h-6 text-emerald-500" /> BIM/LAF</h1>
        </div>
        <div className="flex-1 overflow-y-auto py-4 space-y-1 px-3">
          {/* Properties */}
          <button onClick={() => { toggleSection('properties'); setActiveDepartment('properties'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Home className="w-4 h-4" /> Properties</span><ChevronDown className="w-3 h-3" />
          </button>
          
          {/* Subcategories for Properties */}
          {expandedSections.properties && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button 
                    onClick={() => { setActiveDepartment('properties'); setPropertiesTab('list'); }} 
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${activeDepartment === 'properties' && propertiesTab === 'list' ? 'text-emerald-500 font-bold bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Properties List
                </button>
                <button 
                    onClick={() => { setActiveDepartment('properties'); setPropertiesTab('units'); }} 
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${activeDepartment === 'properties' && propertiesTab === 'units' ? 'text-emerald-500 font-bold bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Units & Inventory
                </button>
              </div>
          )}
          
          {/* Facility */}
          <button onClick={() => { toggleSection('facility'); setActiveDepartment('facility'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Settings className="w-4 h-4" /> Facility</span><ChevronDown className="w-3 h-3" />
          </button>
          {expandedSections.facility && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button onClick={() => { setActiveDepartment('facility'); setFacilityTab('overview'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Overview</button>
                <button onClick={() => { setActiveDepartment('facility'); setFacilityTab('calendar'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Calendar & Tasks</button>
                <button onClick={() => { setActiveDepartment('facility'); setFacilityTab('messages'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Messages</button>
              </div>
          )}

          {/* Accounting */}
          <div className="mb-2">
            <button onClick={() => { toggleSection('accounting'); setActiveDepartment('accounting'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Clock className="w-4 h-4" /> Accounting</span><ChevronDown className="w-3 h-3" />
            </button>
            {expandedSections.accounting && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button onClick={() => { setActiveDepartment('accounting'); setAccountingTab('dashboard'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Dashboard</button>
                <button onClick={() => { setActiveDepartment('accounting'); setAccountingTab('invoices'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Invoices</button>
                <button onClick={() => { setActiveDepartment('accounting'); setAccountingTab('banking'); }} className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${activeDepartment === 'accounting' && accountingTab === 'banking' ? 'text-emerald-500 font-bold bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300'}`}>Banking</button>
                <button onClick={() => { setActiveDepartment('accounting'); setAccountingTab('calendar'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Calendar</button>
              </div>
            )}
          </div>

          {/* Sales */}
          <button onClick={() => { toggleSection('sales'); setActiveDepartment('sales'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><TrendingUp className="w-4 h-4" /> Sales Department</span><ChevronDown className="w-3 h-3" />
          </button>
          {expandedSections.sales && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('leads'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Leads</button>
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('calendar'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Rent Calendar</button>
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('offers'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Offers</button>
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('reservations'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Reservations</button>
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('requests'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Requests</button>
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('chat'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">Chat</button>
                <button onClick={() => { setActiveDepartment('sales'); setSalesTab('history'); }} className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-300">History</button>
              </div>
          )}

          {/* Tasks / Kanban Board */}
          <button onClick={() => { toggleSection('tasks'); setActiveDepartment('tasks'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4" /> Tasks</span><ChevronDown className="w-3 h-3" />
          </button>
        </div>
        
        {/* User Info & Logout */}
        <div className="mt-auto border-t border-gray-800 p-3">
          <div className="mb-2 px-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Користувач</div>
            {worker && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs font-medium text-white truncate">{worker.name}</span>
                </div>
                <div className="text-xs text-gray-500 ml-5 truncate">{worker.email}</div>
                <div className="text-xs text-gray-500 ml-5 capitalize">{worker.role.replace('_', ' ')} • {worker.department}</div>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              try {
                await logout();
                window.location.href = '/';
              } catch (error) {
                console.error('Logout error:', error);
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Вийти</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-[#0D1117]">
        {activeDepartment === 'properties' && renderPropertiesContent()}
        {activeDepartment === 'facility' && renderFacilityContent()}
        {activeDepartment === 'accounting' && renderAccountingContent()}
        {activeDepartment === 'sales' && renderSalesContent()}
        {activeDepartment === 'tasks' && renderTasksContent()}
      </div>

      {/* Modals */}
      <BookingDetailsModal 
          isOpen={isManageModalOpen} 
          onClose={closeManageModals} 
          booking={selectedReservation} 
          onConvertToOffer={!viewingOffer ? handleConvertToOffer : undefined} 
          onCreateInvoice={handleCreateInvoiceClick} 
          onEdit={viewingOffer ? handleEditOfferClick : undefined}
          onSendOffer={!viewingOffer ? handleSendOffer : undefined}
          onUpdateBookingStatus={(bookingId, newStatus) => {
              setReservations(prev => prev.map(r => 
                  r.id === bookingId
                      ? { ...r, status: newStatus }
                      : r
              ));
          }}
      />
      <InvoiceModal isOpen={isInvoiceModalOpen} onClose={() => { setIsInvoiceModalOpen(false); setSelectedOfferForInvoice(null); setSelectedInvoice(null); }} offer={selectedOfferForInvoice} invoice={selectedInvoice} onSave={handleSaveInvoice} />
      <OfferEditModal isOpen={isOfferEditModalOpen} onClose={() => setIsOfferEditModalOpen(false)} offer={offerToEdit} onSave={handleSaveOfferUpdate} />
      <PropertyAddModal isOpen={isPropertyAddModalOpen} onClose={() => setIsPropertyAddModalOpen(false)} onSave={handleSaveProperty} />
      <RequestModal 
        isOpen={isRequestModalOpen} 
        onClose={() => { setIsRequestModalOpen(false); setSelectedRequest(null); }} 
        request={selectedRequest}
        onGoToCalendar={handleGoToCalendarFromRequest}
      />
    </div>
  );
};

export default AccountDashboard;
