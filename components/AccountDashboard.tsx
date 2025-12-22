
import React, { useState, useEffect, useMemo } from 'react';
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
import UserManagement from './admin/UserManagement';
import { propertiesService, tasksService, workersService, warehouseService, WarehouseStockItem } from '../services/supabaseService';
import { ReservationData, OfferData, InvoiceData, CalendarEvent, TaskType, TaskStatus, Lead, Property, RentalAgreement, MeterLogEntry, FuturePayment, PropertyEvent, BookingStatus, RequestData, Worker, Warehouse } from '../types';
import { MOCK_PROPERTIES } from '../constants';
import { shouldShowInReservations, createFacilityTasksForBooking, updateBookingStatusFromTask, getBookingStyle } from '../bookingUtils';

// --- Types ---
type Department = 'admin' | 'properties' | 'facility' | 'accounting' | 'sales' | 'tasks';
type FacilityTab = 'overview' | 'calendar' | 'messages' | 'warehouse';
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
    admin: false,
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
  const [warehouseTab, setWarehouseTab] = useState<'warehouses' | 'stock' | 'addInventory'>('warehouses');
  const [warehouseStock, setWarehouseStock] = useState<WarehouseStockItem[]>([]);
  const [isLoadingWarehouseStock, setIsLoadingWarehouseStock] = useState(false);
  const [warehouseStockError, setWarehouseStockError] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isExecutingTransfer, setIsExecutingTransfer] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isAddInventoryModalOpen, setIsAddInventoryModalOpen] = useState(false);
  const [uploadedInventoryFileName, setUploadedInventoryFileName] = useState<string | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrInventoryRows, setOcrInventoryRows] = useState<
    Array<{
      id: string;
      sku: string;
      name: string;
      quantity: string;
      unit: string;
      price: string;
      invoiceNumber: string;
      purchaseDate: string;
      object: string; // Always "Склад" for OCR items
    }>
  >([]);
  const [ocrInvoiceNumber, setOcrInvoiceNumber] = useState<string>('');
  const [ocrPurchaseDate, setOcrPurchaseDate] = useState<string>('');
  const [transferPropertyId, setTransferPropertyId] = useState<string>('');
  const [transferWorkerId, setTransferWorkerId] = useState<string>('');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [isCreateWarehouseModalOpen, setIsCreateWarehouseModalOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState<string>('');
  const [newWarehouseLocation, setNewWarehouseLocation] = useState<string>('');
  const [newWarehouseDescription, setNewWarehouseDescription] = useState<string>('');

  // Warehouse stock filters & search
  const [filterWarehouseId, setFilterWarehouseId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  // --- Warehouse: load workers (for assigning transfer tasks) & stock ---
  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const all = await workersService.getAll();
        // Prefer facility department workers for warehouse transfers
        const facilityWorkers = all.filter((w) => w.department === 'facility');
        setWorkers(facilityWorkers.length ? facilityWorkers : all);
      } catch (error) {
        console.error('Error loading workers for warehouse:', error);
      }
    };

    loadWorkers();
  }, []);

  // Load warehouses
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const all = await warehouseService.getWarehouses();
        setWarehouses(all);
        // Auto-select first warehouse if only one exists
        if (all.length === 1) {
          setSelectedWarehouseId(all[0].id);
        } else if (all.length > 0 && !selectedWarehouseId) {
          // Select first warehouse by default if none selected
          setSelectedWarehouseId(all[0].id);
        }
      } catch (error) {
        console.error('Error loading warehouses:', error);
      }
    };

    if (activeDepartment === 'facility' && facilityTab === 'warehouse') {
      loadWarehouses();
    }
  }, [activeDepartment, facilityTab]);

  // Load warehouses when Add inventory modal opens
  useEffect(() => {
    if (isAddInventoryModalOpen && warehouses.length === 0) {
      const loadWarehouses = async () => {
        try {
          const all = await warehouseService.getWarehouses();
          setWarehouses(all);
          // Auto-select first warehouse if only one exists
          if (all.length === 1) {
            setSelectedWarehouseId(all[0].id);
          } else if (all.length > 0 && !selectedWarehouseId) {
            setSelectedWarehouseId(all[0].id);
          }
        } catch (error) {
          console.error('Error loading warehouses:', error);
        }
      };
      loadWarehouses();
    }
  }, [isAddInventoryModalOpen]);

  useEffect(() => {
    const shouldLoadStock = activeDepartment === 'facility' && facilityTab === 'warehouse' && warehouseTab === 'stock';
    if (!shouldLoadStock) return;

    const loadStock = async () => {
      try {
        setIsLoadingWarehouseStock(true);
        setWarehouseStockError(null);
        const stock = await warehouseService.getStock(filterWarehouseId || undefined);
        setWarehouseStock(stock);
      } catch (error: any) {
        console.error('Error loading warehouse stock:', error);
        setWarehouseStockError(error?.message || 'Failed to load warehouse stock');
      } finally {
        setIsLoadingWarehouseStock(false);
      }
    };

    loadStock();
  }, [activeDepartment, facilityTab, warehouseTab, filterWarehouseId]);

  // Autocomplete suggestions for warehouse stock search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const suggestions = new Set<string>();

    warehouseStock.forEach((item) => {
      // Назва товару
      if (item.itemName?.toLowerCase().includes(query)) {
        suggestions.add(item.itemName);
      }
      // Артикул
      if (item.sku?.toLowerCase().includes(query)) {
        suggestions.add(item.sku);
      }
      // Номер інвойсу
      if (item.invoiceNumber?.toLowerCase().includes(query)) {
        suggestions.add(item.invoiceNumber);
      }
      // Дата покупки
      if (item.purchaseDate) {
        const dateStr = new Date(item.purchaseDate).toLocaleDateString('uk-UA');
        if (dateStr.toLowerCase().includes(query)) {
          suggestions.add(dateStr);
        }
      }
      // Ціна
      if (item.unitPrice != null) {
        const priceStr = `€${item.unitPrice.toFixed(2)}`;
        if (priceStr.toLowerCase().includes(query)) {
          suggestions.add(priceStr);
        }
      }
      // Назва складу
      if (item.warehouseName?.toLowerCase().includes(query)) {
        suggestions.add(item.warehouseName);
      }
      // Назва квартири
      if (item.lastPropertyName?.toLowerCase().includes(query)) {
        suggestions.add(item.lastPropertyName);
      }
      // Адреса (вулиця)
      if (item.propertyAddress?.toLowerCase().includes(query)) {
        suggestions.add(item.propertyAddress);
      }
    });

    const list = Array.from(suggestions).slice(0, 10);
    setSearchSuggestions(list);
    setShowSuggestions(list.length > 0);
  }, [searchQuery, warehouseStock]);

  // Filtered stock based on search query
  const filteredWarehouseStock = useMemo(() => {
    if (!searchQuery.trim()) return warehouseStock;

    const query = searchQuery.toLowerCase().trim();
    return warehouseStock.filter((item) => {
      const dateStr = item.purchaseDate
        ? new Date(item.purchaseDate).toLocaleDateString('uk-UA').toLowerCase()
        : '';
      const priceStr = item.unitPrice != null ? `€${item.unitPrice.toFixed(2)}`.toLowerCase() : '';

      return (
        item.itemName?.toLowerCase().includes(query) ||
        item.sku?.toLowerCase().includes(query) ||
        item.invoiceNumber?.toLowerCase().includes(query) ||
        dateStr.includes(query) ||
        priceStr.includes(query) ||
        item.warehouseName?.toLowerCase().includes(query) ||
        item.lastPropertyName?.toLowerCase().includes(query) ||
        item.propertyAddress?.toLowerCase().includes(query)
      );
    });
  }, [warehouseStock, searchQuery]);

  const getPropertyNameById = (id: string | number | undefined) => {
    if (!id) return '';
    const stringId = String(id);
    const p = properties.find((prop) => prop.id === stringId);
    return p?.title || stringId;
  };

  const getPropertyAddressById = (id: string | number | undefined) => {
    if (!id) return '';
    const stringId = String(id);
    const p = properties.find((prop) => prop.id === stringId);
    return p?.fullAddress || p?.address || '';
  };

  const toggleStockSelection = (stockId: string) => {
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      if (next.has(stockId)) {
        next.delete(stockId);
      } else {
        next.add(stockId);
      }
      return next;
    });
  };

  const openTransferModal = () => {
    if (!selectedStockIds.size) return;
    // Preselect first property & worker if available
    setTransferPropertyId((prev) => prev || (properties[0]?.id ?? ''));
    setTransferWorkerId((prev) => prev || (workers[0]?.id ?? ''));
    setIsTransferModalOpen(true);
  };

  const closeTransferModal = () => {
    setIsTransferModalOpen(false);
    setTransferError(null);
    setIsExecutingTransfer(false);
  };

  const handleOcrMock = () => {
    if (!uploadedInventoryFileName) {
      setUploadedInventoryFileName('inventory_list.pdf');
    }
    setIsOcrProcessing(true);
    setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      const mockInvoiceNumber = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`;
      setOcrInvoiceNumber(mockInvoiceNumber);
      setOcrPurchaseDate(today);
      setOcrInventoryRows([
        {
          id: '1',
          sku: 'BED-160-200',
          name: 'Bed 160x200',
          quantity: '2',
          unit: 'pcs',
          price: '350',
          invoiceNumber: mockInvoiceNumber,
          purchaseDate: today,
          object: 'Склад',
        },
        {
          id: '2',
          sku: 'CHAIR-001',
          name: 'Chair',
          quantity: '4',
          unit: 'pcs',
          price: '45',
          invoiceNumber: mockInvoiceNumber,
          purchaseDate: today,
          object: 'Склад',
        },
        {
          id: '3',
          sku: 'TABLE-001',
          name: 'Table',
          quantity: '1',
          unit: 'pcs',
          price: '120',
          invoiceNumber: mockInvoiceNumber,
          purchaseDate: today,
          object: 'Склад',
        },
      ]);
      setIsOcrProcessing(false);
    }, 800);
  };

  const handleOcrCellChange = (
    rowId: string,
    field: 'sku' | 'name' | 'quantity' | 'unit' | 'price' | 'invoiceNumber' | 'purchaseDate',
    value: string
  ) => {
    setOcrInventoryRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
    // If invoice number or date changes, update all rows
    if (field === 'invoiceNumber') {
      setOcrInvoiceNumber(value);
      setOcrInventoryRows((prev) =>
        prev.map((row) => ({ ...row, invoiceNumber: value }))
      );
    }
    if (field === 'purchaseDate') {
      setOcrPurchaseDate(value);
      setOcrInventoryRows((prev) =>
        prev.map((row) => ({ ...row, purchaseDate: value }))
      );
    }
  };

  const handleSaveInventoryFromOCR = async () => {
    if (ocrInventoryRows.length === 0) return;

    if (!selectedWarehouseId) {
      setTransferError('Please select a warehouse to save inventory.');
      return;
    }

    try {
      setIsExecutingTransfer(true);
      setTransferError(null);

      // Convert OCR rows to format expected by warehouseService
      const itemsToAdd = ocrInventoryRows
        .filter((row) => row.name.trim() && parseFloat(row.quantity) > 0)
        .map((row) => ({
          name: row.name.trim(),
          quantity: parseFloat(row.quantity) || 0,
          unit: row.unit.trim() || 'pcs',
          price: parseFloat(row.price) || undefined,
          category: undefined, // Can be extended later
          sku: row.sku?.trim() || undefined,
        }));

      if (itemsToAdd.length === 0) {
        setTransferError('No valid items to save. Please check name and quantity fields.');
        return;
      }

      // Get invoice number and date from first row (they should be the same for all)
      const invoiceNumber = ocrInvoiceNumber || ocrInventoryRows[0]?.invoiceNumber || undefined;
      const purchaseDate = ocrPurchaseDate || ocrInventoryRows[0]?.purchaseDate || undefined;

      await warehouseService.addInventoryFromOCR(itemsToAdd, selectedWarehouseId, invoiceNumber, purchaseDate);

      // Refresh stock list
      const refreshed = await warehouseService.getStock();
      setWarehouseStock(refreshed);

      // Close modal and reset
      setIsAddInventoryModalOpen(false);
      setOcrInventoryRows([]);
      setUploadedInventoryFileName(null);
      setOcrInvoiceNumber('');
      setOcrPurchaseDate('');
      setTransferError(null);
      alert(`✅ Successfully added ${itemsToAdd.length} item(s) to warehouse stock!`);
    } catch (error: any) {
      console.error('Error saving inventory from OCR:', error);
      setTransferError(error?.message || 'Failed to save inventory. Please try again.');
    } finally {
      setIsExecutingTransfer(false);
    }
  };

  const handleDeleteStockItem = async (stockId: string) => {
    if (!confirm('Are you sure you want to delete this item from warehouse stock? This will also remove it from all apartments where it was transferred.')) return;

    try {
      // Спочатку отримуємо інформацію про stock item, щоб знати itemId
      const stockItem = warehouseStock.find(item => item.stockId === stockId);
      if (!stockItem) {
        alert('Stock item not found');
        return;
      }

      const itemId = stockItem.itemId;
      const invNumber = `WAREHOUSE-${itemId}`;

      // Видаляємо зі складу
      await warehouseService.deleteStockItem(stockId);

      // Знаходимо всі квартири, де є цей інвентар, і видаляємо його
      if (itemId) {
        console.log(`🗑️ Removing inventory with itemId ${itemId} (${stockItem.itemName}) from all properties...`);
        const allProperties = await propertiesService.getAll();
        const itemName = stockItem.itemName;
        
        for (const property of allProperties) {
          if (property.inventory && property.inventory.length > 0) {
            // Шукаємо інвентар за itemId, invNumber або назвою товару
            const inventoryToRemove = property.inventory.filter((item: any) => {
              // Перевірка за itemId
              if (item.itemId === itemId) {
                console.log(`  ✓ Found by itemId in ${property.title}: ${item.name || item.type}`);
                return true;
              }
              // Перевірка за invNumber
              if (item.invNumber === invNumber) {
                console.log(`  ✓ Found by invNumber in ${property.title}: ${item.name || item.type}`);
                return true;
              }
              // Перевірка за назвою товару (якщо немає itemId)
              if (!item.itemId && (item.name === itemName || item.type === itemName)) {
                console.log(`  ✓ Found by name in ${property.title}: ${item.name || item.type}`);
                return true;
              }
              return false;
            });
            
            if (inventoryToRemove.length > 0) {
              console.log(`🗑️ Removing ${inventoryToRemove.length} inventory item(s) from property: ${property.title}`);
              const updatedInventory = property.inventory.filter((item: any) => {
                // Залишаємо тільки ті, які не знайдені для видалення
                return !(
                  item.itemId === itemId ||
                  item.invNumber === invNumber ||
                  (!item.itemId && (item.name === itemName || item.type === itemName))
                );
              });
              
              await propertiesService.update(property.id, {
                ...property,
                inventory: updatedInventory,
              });
            }
          }
        }
        
        // Оновити локальний стан properties
        setProperties((prev) => {
          return prev.map((p) => {
            if (p.inventory && p.inventory.length > 0) {
              const updatedInventory = p.inventory.filter((item: any) => {
                // Залишаємо тільки ті, які не відповідають критеріям видалення
                return !(
                  item.itemId === itemId ||
                  item.invNumber === invNumber ||
                  (!item.itemId && (item.name === itemName || item.type === itemName))
                );
              });
              if (updatedInventory.length !== p.inventory.length) {
                console.log(`  ✓ Updated local state for property: ${p.title}`);
                return { ...p, inventory: updatedInventory };
              }
            }
            return p;
          });
        });
        
        // Оновити список квартир
        window.dispatchEvent(new CustomEvent('propertiesUpdated'));
        console.log('✅ Inventory removal completed');
      }

      // Refresh stock list
      const refreshed = await warehouseService.getStock();
      setWarehouseStock(refreshed);
      // Remove from selection if selected
      setSelectedStockIds((prev) => {
        const next = new Set(prev);
        next.delete(stockId);
        return next;
      });
      
      console.log('✅ Stock item deleted and removed from all properties');
    } catch (error: any) {
      console.error('Error deleting stock item:', error);
      alert(`Failed to delete item: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleCreateWarehouse = async () => {
    if (!newWarehouseName.trim()) {
      alert('Please enter warehouse name');
      return;
    }

    try {
      const newWarehouse = await warehouseService.createWarehouse(
        newWarehouseName.trim(),
        newWarehouseLocation.trim() || undefined,
        newWarehouseDescription.trim() || undefined
      );
      // Refresh warehouses list
      const refreshed = await warehouseService.getWarehouses();
      setWarehouses(refreshed);
      // Auto-select newly created warehouse
      setSelectedWarehouseId(newWarehouse.id);
      // Close modal and reset form
      setIsCreateWarehouseModalOpen(false);
      setNewWarehouseName('');
      setNewWarehouseLocation('');
      setNewWarehouseDescription('');
      alert(`✅ Warehouse "${newWarehouse.name}" created successfully!`);
    } catch (error: any) {
      console.error('Error creating warehouse:', error);
      alert(`Failed to create warehouse: ${error?.message || 'Unknown error'}`);
    }
  };

  // Функція для виконання transfer інвентарю після підтвердження завдання
  const executeInventoryTransfer = async (transferData: any) => {
    try {
      console.log('📦 Starting inventory transfer execution...', transferData);
      const { transferData: items, propertyId } = transferData;

      if (!items || !Array.isArray(items) || items.length === 0) {
        console.error('❌ No items to transfer');
        return;
      }

      if (!propertyId) {
        console.error('❌ No propertyId provided');
        return;
      }

      console.log(`📦 Transferring ${items.length} items to property ${propertyId}`);

      // 1) Зменшити залишки на складі + записати рух
      for (const item of items) {
        console.log(`📦 Processing item: ${item.itemName}, quantity: ${item.quantity}, stockId: ${item.stockId}`);
        await warehouseService.decreaseStockQuantity(item.stockId, item.quantity);
        await warehouseService.createStockMovement({
          warehouseId: item.warehouseId,
          itemId: item.itemId,
          type: 'OUT',
          quantity: item.quantity,
          reason: 'Transfer to property (confirmed)',
          propertyId: propertyId,
          workerId: undefined,
          invoiceId: undefined,
        });
      }

      console.log('✅ Warehouse stock decreased and movements created');

      // 2) Оновити інвентар квартири (отримуємо property з бази для надійності)
      const property = await propertiesService.getById(propertyId);
      if (!property) {
        console.error(`❌ Property ${propertyId} not found`);
        return;
      }

      console.log(`📦 Property found: ${property.title}, current inventory items: ${(property.inventory || []).length}`);
      const newInventory = [...(property.inventory || [])];

      items.forEach((item: any) => {
        const invId = `WAREHOUSE-${item.itemId}`;
        const existingIndex = newInventory.findIndex((i: any) => i.invNumber === invId);

        if (existingIndex >= 0) {
          const existing = newInventory[existingIndex];
          newInventory[existingIndex] = {
            ...existing,
            quantity: (existing.quantity || 0) + item.quantity,
          };
          console.log(`📦 Updated existing inventory item: ${item.itemName}, new quantity: ${newInventory[existingIndex].quantity}`);
        } else {
          const newItem = {
            type: item.itemName,
            invNumber: invId,
            quantity: item.quantity,
            cost: item.unitPrice || 0,
            itemId: item.itemId,
            name: item.itemName,
            unitPrice: item.unitPrice || 0,
            totalCost: (item.unitPrice || 0) * item.quantity,
            sku: item.sku,
            invoiceNumber: item.invoiceNumber,
            purchaseDate: item.purchaseDate,
          };
          newInventory.push(newItem);
          console.log(`📦 Added new inventory item: ${item.itemName}, quantity: ${item.quantity}`);
        }
      });

      console.log(`📦 Updating property with ${newInventory.length} inventory items`);
      const updatedProperty = {
        ...property,
        inventory: newInventory,
      };
      await propertiesService.update(propertyId, updatedProperty);

      console.log('✅ Property inventory updated successfully');

      // Оновити локальний стан properties (selectedProperty оновиться автоматично через properties.find())
      setProperties((prev) => {
        const updated = prev.map((p) => (p.id === propertyId ? updatedProperty : p));
        return updated;
      });
      console.log('✅ Local properties state updated');

      // 3) Оновити склад
      const refreshed = await warehouseService.getStock();
      setWarehouseStock(refreshed);
      console.log('✅ Warehouse stock refreshed');
      
      // 4) Оновити список квартир (щоб інвентар відобразився в інших компонентах)
      window.dispatchEvent(new CustomEvent('propertiesUpdated'));
      console.log('✅ Properties update event dispatched');
      console.log('✅ Inventory transfer completed successfully');
    } catch (error) {
      console.error('❌ Error executing inventory transfer:', error);
      throw error;
    }
  };

  const handleExecuteTransfer = async () => {
    if (!transferPropertyId || !transferWorkerId || selectedStockItems.length === 0) return;

    try {
      setIsExecutingTransfer(true);
      setTransferError(null);

      // НЕ міняємо warehouse_stock і property.inventory відразу!
      // Тільки створюємо завдання з інформацією про transfer
      // Transfer виконається тільки після підтвердження завдання (completed/verified)

      // 1) Підготувати дані для transfer (зберігаємо в завданні)
      const transferData = selectedStockItems.map((row) => ({
        stockId: row.stockId,
        warehouseId: row.warehouseId,
        itemId: row.itemId,
        itemName: row.itemName,
        quantity: row.quantity,
        unitPrice: row.unitPrice || row.defaultPrice || 0,
        sku: row.sku,
        invoiceNumber: row.invoiceNumber,
        purchaseDate: row.purchaseDate,
      }));

      // 2) Створити завдання для працівника (Facility) з даними про transfer
      const propertyName = getPropertyNameById(transferPropertyId) || 'квартира';
      const workerObj = workers.find((w) => w.id === transferWorkerId);
      const today = new Date();

      const taskDescription = {
        action: 'transfer_inventory',
        transferData: transferData,
        propertyId: transferPropertyId,
        originalDescription: `Перевезти інвентар зі складу в ${propertyName}. Призначено: ${workerObj?.name || 'працівник'}.`,
      };

      await tasksService.create({
        id: '', // буде згенеровано на бекенді
        title: `Перевезти інвентар (${selectedStockItems.length} поз.) – ${propertyName}`,
        propertyId: transferPropertyId,
        bookingId: undefined,
        unitId: undefined,
        time: `${today.getHours().toString().padStart(2, '0')}:00`,
        isAllDay: false,
        type: 'Arbeit nach plan',
        day: today.getDate(),
        date: today.toISOString().split('T')[0],
        description: JSON.stringify(taskDescription),
        assignee: workerObj?.name,
        assignedWorkerId: transferWorkerId,
        hasUnreadMessage: false,
        status: 'open',
        meterReadings: undefined,
        priority: 'medium',
        isIssue: false,
        managerId: worker?.id,
        workerId: transferWorkerId,
        department: 'facility',
        images: [],
        checklist: [],
        locationText: getPropertyAddressById(transferPropertyId),
        createdAt: today.toISOString(),
      });

      // 3) Оновити календар Facility
      window.dispatchEvent(new CustomEvent('taskUpdated'));

      // 4) Перечитати склад та очистити вибір
      const refreshed = await warehouseService.getStock();
      setWarehouseStock(refreshed);
      setSelectedStockIds(new Set());
      setIsTransferModalOpen(false);
    } catch (error: any) {
      console.error('Error creating transfer task:', error);
      setTransferError(error?.message || 'Не вдалося створити завдання. Спробуйте ще раз.');
    } finally {
      setIsExecutingTransfer(false);
    }
  };

  // Load Facility tasks from database
  useEffect(() => {
    const loadFacilityTasks = async () => {
      try {
        console.log('🔄 Loading Facility tasks from database...');
        console.log('👤 Current user:', worker?.id, worker?.role, worker?.department);
        
        // Build filters based on user role
        const filters: any = {
          department: 'facility'
        };
        
        // If user is a manager or worker (not super_manager), filter by their ID
        if (worker?.role === 'manager' || worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        // For super_manager, don't filter by workerId - show all facility tasks
        
        const tasks = await tasksService.getAll(filters);
        console.log('✅ Loaded Facility tasks:', tasks.length);
        console.log('📋 Tasks:', tasks.map(t => ({ id: t.id, title: t.title, workerId: t.workerId, department: t.department })));
        
        setAdminEvents(tasks);
      } catch (error) {
        console.error('❌ Error loading Facility tasks:', error);
        // Keep INITIAL_ADMIN_EVENTS as fallback
      }
    };
    
    if (worker) {
      loadFacilityTasks();
    }
  }, [worker]);

  // Listen for task updates from Kanban board
  useEffect(() => {
    const handleTaskUpdated = async () => {
      try {
        console.log('🔄 Task updated event received, reloading Facility tasks...');
        
        // Build filters based on user role
        const filters: any = {
          department: 'facility'
        };
        
        // If user is a manager or worker (not super_manager), filter by their ID
        if (worker?.role === 'manager' || worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        
        const tasks = await tasksService.getAll(filters);
        console.log('✅ Reloaded Facility tasks:', tasks.length);
        
        // Перевірити, чи є transfer tasks, які стали completed/verified і потребують виконання
        for (const task of tasks) {
          if ((task.status === 'completed' || task.status === 'verified') && task.description) {
            try {
              const desc = task.description;
              const parsed = JSON.parse(desc);
              if (parsed.action === 'transfer_inventory' && parsed.transferData) {
                // Перевірити, чи transfer вже виконано (можна додати прапорець в parsed)
                if (!parsed.transferExecuted) {
                  console.log('📦 Executing inventory transfer for task:', task.id);
                  await executeInventoryTransfer(parsed);
                  
                  // Позначити transfer як виконаний в description
                  parsed.transferExecuted = true;
                  await tasksService.update(task.id, {
                    description: JSON.stringify(parsed),
                  });
                  
                  console.log('✅ Inventory transfer executed for task:', task.id);
                }
              }
            } catch (e) {
              // Не JSON або не transfer task - ігноруємо
            }
          }
        }
        
        setAdminEvents(tasks);
      } catch (error) {
        console.error('❌ Error reloading Facility tasks:', error);
      }
    };
    
    window.addEventListener('taskUpdated', handleTaskUpdated);
    window.addEventListener('kanbanTaskCreated', handleTaskUpdated);
    
    return () => {
      window.removeEventListener('taskUpdated', handleTaskUpdated);
      window.removeEventListener('kanbanTaskCreated', handleTaskUpdated);
    };
  }, [worker]);

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

  const handleAdminEventUpdate = async (updatedEvent: CalendarEvent) => {
      try {
          // Update in database
          await tasksService.update(updatedEvent.id, updatedEvent);
          console.log('✅ Task updated in database:', updatedEvent.id);
          
          // Notify other components (Kanban) about task update
          window.dispatchEvent(new CustomEvent('taskUpdated'));
      } catch (error: any) {
          console.error('❌ Error updating task in database:', error);
          // Continue with local update even if DB update fails
      }
      
      // Update local state
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
    // Use unitPrice if present, otherwise fall back to legacy cost field
    const totalInventoryCost = selectedProperty.inventory.reduce((acc, item: any) => {
      const unitPrice = item.unitPrice != null ? item.unitPrice : (item.cost || 0);
      const qty = item.quantity || 0;
      return acc + unitPrice * qty;
    }, 0);

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
                            <button
                                onClick={handleAddInventoryRow}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            >
                                <Plus className="w-3 h-3 mr-1 inline" /> Додати
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-hidden border border-gray-700 rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase">Артикул</th>
                                <th className="p-3 font-bold text-xs uppercase">Назва товару</th>
                                <th className="p-3 font-bold text-xs uppercase text-right">К-сть</th>
                                <th className="p-3 font-bold text-xs uppercase text-right">Ціна (од.)</th>
                                <th className="p-3 font-bold text-xs uppercase">Номер інвойсу</th>
                                <th className="p-3 font-bold text-xs uppercase">Дата покупки</th>
                                {isInventoryEditing && (
                                  <th className="p-3 font-bold text-xs uppercase text-center">Дії</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {selectedProperty.inventory.map((item: any, idx: number) => {
                              const unitPrice =
                                item.unitPrice != null ? item.unitPrice : (item.cost || 0);
                              const formattedPrice =
                                unitPrice > 0 ? `€${unitPrice.toFixed(2)}` : '-';
                              const formattedDate = item.purchaseDate
                                ? new Date(item.purchaseDate).toLocaleDateString('uk-UA', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                  })
                                : '-';

                              return (
                                <tr key={idx} className="hover:bg-[#1C1F24]">
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                        value={item.sku || ''}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(idx, 'sku', e.target.value)
                                        }
                                        placeholder="SKU"
                                      />
                                    ) : (
                                      item.sku || '-'
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-white outline-none"
                                        value={item.name || item.type || ''}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(idx, 'name', e.target.value)
                                        }
                                        placeholder="Назва товару"
                                      />
                                    ) : (
                                      <span className="text-white font-bold">
                                        {item.name || item.type}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    {isInventoryEditing ? (
                                      <input
                                        type="number"
                                        className="bg-transparent border-b border-gray-700 w-16 text-right text-white outline-none"
                                        value={item.quantity || 0}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(
                                            idx,
                                            'quantity',
                                            parseInt(e.target.value || '0', 10)
                                          )
                                        }
                                      />
                                    ) : (
                                      <span className="text-gray-300 font-mono">
                                        {item.quantity || 0}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    {isInventoryEditing ? (
                                      <input
                                        type="number"
                                        className="bg-transparent border-b border-gray-700 w-20 text-right text-white outline-none"
                                        value={unitPrice}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(
                                            idx,
                                            'unitPrice',
                                            parseFloat(e.target.value || '0')
                                          )
                                        }
                                      />
                                    ) : (
                                      <span className="text-white font-mono">
                                        {formattedPrice}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                        value={item.invoiceNumber || ''}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(
                                            idx,
                                            'invoiceNumber',
                                            e.target.value
                                          )
                                        }
                                        placeholder="INV-..."
                                      />
                                    ) : (
                                      item.invoiceNumber || '-'
                                    )}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        type="date"
                                        className="bg-transparent border-b border-gray-700 text-xs text-white outline-none"
                                        value={item.purchaseDate || ''}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(
                                            idx,
                                            'purchaseDate',
                                            e.target.value
                                          )
                                        }
                                      />
                                    ) : (
                                      formattedDate
                                    )}
                                  </td>
                                  {isInventoryEditing && (
                                    <td className="p-3 text-center">
                                      <button
                                        onClick={() => handleDeleteInventoryItem(idx)}
                                        className="text-red-500 hover:text-red-400 p-1"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm font-bold text-gray-400">
                      Загальна вартість:
                      <span className="text-emerald-500 ml-1">
                        {totalInventoryCost.toFixed(2)} €
                      </span>
                    </p>
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
      return (
        <AdminCalendar 
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
        />
      );
    }

    if (facilityTab === 'messages') return <AdminMessages />;

    if (facilityTab === 'warehouse') {
      return (
        <div className="h-full w-full bg-[#0D1117] text-white flex flex-col">
          {/* Header with tabs */}
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Facility Warehouse</h2>
              <p className="text-xs text-gray-400">
                Manage stock, transfers to apartments and invoice imports (draft UI)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCreateWarehouseModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Warehouse
              </button>
              <div className="flex items-center gap-2 text-xs bg-[#161B22] rounded-full p-1">
                <button
                  onClick={() => setWarehouseTab('warehouses')}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    warehouseTab === 'warehouses'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Warehouses
                </button>
                <button
                  onClick={() => setWarehouseTab('stock')}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    warehouseTab === 'stock'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Stock
                </button>
                <button
                  onClick={() => setWarehouseTab('addInventory')}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    warehouseTab === 'addInventory'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Add inventory
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {warehouseTab === 'warehouses' ? (
              <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Warehouses List</h3>
                    <p className="text-xs text-gray-400">
                      Manage your warehouses. Create, view, and manage warehouse locations.
                    </p>
                  </div>
                </div>

                {warehouses.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-sm">
                    No warehouses created yet. Click "Create Warehouse" button to add your first warehouse.
                  </div>
                ) : (
                  <div className="overflow-auto border border-gray-800 rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#1F2933] text-gray-300">
                        <tr>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Name</th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Location</th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Description</th>
                          <th className="px-3 py-2 text-center border-b border-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {warehouses.map((warehouse) => (
                          <tr key={warehouse.id} className="hover:bg-white/5">
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-100">{warehouse.name}</div>
                            </td>
                            <td className="px-3 py-2 text-gray-400">{warehouse.location || '-'}</td>
                            <td className="px-3 py-2 text-gray-400">{warehouse.description || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={async () => {
                                  if (confirm(`Are you sure you want to delete warehouse "${warehouse.name}"?`)) {
                                    try {
                                      // Note: We need to add deleteWarehouse method to service
                                      // For now, just show a message
                                      alert('Delete functionality will be added. For now, you can delete manually from database.');
                                    } catch (error: any) {
                                      alert(`Failed to delete warehouse: ${error?.message || 'Unknown error'}`);
                                    }
                                  }
                                }}
                                className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                title="Delete warehouse"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : warehouseTab === 'stock' ? (
              <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Warehouse Stock</h3>
                    <p className="text-xs text-gray-400">
                      Select items from warehouse and transfer them to apartments with task creation.
                    </p>
                  </div>
                  <button
                    onClick={openTransferModal}
                    disabled={selectedStockIds.size === 0}
                    className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
                      selectedStockIds.size === 0
                        ? 'bg-emerald-600/30 text-emerald-300/60 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                    Transfer to apartment
                    {selectedStockIds.size > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full bg-black/30 text-[10px]">
                        {selectedStockIds.size}
                      </span>
                    )}
                  </button>
                </div>

                {/* Filters & search */}
                <div className="mb-4 flex items-center gap-3">
                  {/* Warehouse filter */}
                  <select
                    value={filterWarehouseId}
                    onChange={(e) => setFilterWarehouseId(e.target.value)}
                    className="px-3 py-2 bg-[#161B22] border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Всі склади</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.location ? `(${w.location})` : ''}
                      </option>
                    ))}
                  </select>

                  {/* Search with autocomplete */}
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setShowSuggestions(searchSuggestions.length > 0)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Пошук: назва товару, артикул, інвойс, дата, ціна, склад, квартира, адреса..."
                      className="w-full px-3 py-2 bg-[#161B22] border border-gray-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {showSuggestions && searchSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-[#1F2933] border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                        {searchSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSearchQuery(suggestion);
                              setShowSuggestions(false);
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5 transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {warehouseStockError && (
                  <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
                    {warehouseStockError}
                  </div>
                )}

                {isLoadingWarehouseStock ? (
                  <div className="py-12 text-center text-gray-400 text-sm">Loading warehouse stock...</div>
                ) : filteredWarehouseStock.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-sm">
                    {searchQuery.trim()
                      ? 'Нічого не знайдено за вашим запитом.'
                      : 'No items on warehouse yet. Import invoice on the Invoices tab or add stock manually in database.'}
                  </div>
                ) : (
                  <div className="overflow-auto border border-gray-800 rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-[#1F2933] text-gray-300">
                        <tr>
                          <th className="w-8 px-3 py-2 border-b border-gray-700">
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded border-gray-600 bg-transparent text-emerald-500"
                              checked={selectedStockIds.size > 0 && selectedStockIds.size === warehouseStock.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStockIds(new Set(warehouseStock.map((s) => s.stockId)));
                                } else {
                                  setSelectedStockIds(new Set());
                                }
                              }}
                            />
                          </th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Артикул</th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Назва товару</th>
                          <th className="px-3 py-2 text-right border-b border-gray-700">К-сть</th>
                          <th className="px-3 py-2 text-right border-b border-gray-700">Ціна (од.)</th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Номер інвойсу</th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Дата покупки</th>
                          <th className="px-3 py-2 text-left border-b border-gray-700">Об'єкт</th>
                          <th className="px-3 py-2 text-center border-b border-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {filteredWarehouseStock.map((row) => {
                          const selected = selectedStockIds.has(row.stockId);
                          // Format purchase date
                          const formattedDate = row.purchaseDate
                            ? new Date(row.purchaseDate).toLocaleDateString('uk-UA', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                              })
                            : '-';
                          // Format price
                          const formattedPrice = row.unitPrice != null ? `€${row.unitPrice.toFixed(2)}` : '-';
                          // Determine object (warehouse / transfer in progress / property name)
                          let objectName: string;
                          const transferStatus = row.transferTaskStatus || '';
                          const isTransferInProgress =
                            transferStatus &&
                            !['completed', 'verified', 'archived'].includes(transferStatus);

                          if (isTransferInProgress && (row.propertyAddress || row.lastPropertyName)) {
                            const address = row.propertyAddress || row.lastPropertyName || 'квартиру';
                            objectName = `В процесі перевезення на ${address}`;
                          } else if (row.lastPropertyName) {
                            objectName = row.lastPropertyName;
                          } else {
                            objectName = row.warehouseName || 'Склад';
                          }
                          return (
                            <tr
                              key={row.stockId}
                              className={selected ? 'bg-emerald-500/5' : 'hover:bg-white/5'}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3 rounded border-gray-600 bg-transparent text-emerald-500"
                                  checked={selected}
                                  onChange={() => toggleStockSelection(row.stockId)}
                                />
                              </td>
                              <td className="px-3 py-2 text-gray-400">{row.sku || '-'}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-100">{row.itemName}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-gray-100">{row.quantity}</td>
                              <td className="px-3 py-2 text-right text-gray-300">{formattedPrice}</td>
                              <td className="px-3 py-2 text-gray-400">{row.invoiceNumber || '-'}</td>
                              <td className="px-3 py-2 text-gray-400">{formattedDate}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`text-xs font-medium ${
                                    row.lastPropertyName
                                      ? 'text-blue-400'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {objectName}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => handleDeleteStockItem(row.stockId)}
                                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                  title="Delete from warehouse"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Add Inventory from Document</h3>
                    <p className="text-xs text-gray-400">
                      Upload an invoice or item list, recognize it with OCR and adjust items before adding to stock.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsAddInventoryModalOpen(true);
                      setUploadedInventoryFileName(null);
                      setOcrInventoryRows([]);
                      setOcrInvoiceNumber('');
                      setOcrPurchaseDate('');
                      setTransferError(null);
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Add inventory
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  This is a draft UI. Later we will connect AI OCR (Gemini) and map recognized lines directly into
                  <code> warehouse_invoices</code> and <code> warehouse_invoice_lines</code> and update stock
                  automatically.
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return <div className="p-8 text-white">Facility Overview (Preserved)</div>;
  };

  const renderAdminContent = () => {
    return (
      <div className="h-full w-full">
        <UserManagement />
      </div>
    );
  };

  const renderTasksContent = () => {
    return (
      <div className="h-full w-full">
        <KanbanBoard />
      </div>
    );
  };

  // --- Warehouse Transfer Modal ---
  const selectedStockItems = warehouseStock.filter((row) => selectedStockIds.has(row.stockId));


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
                                    <td className="p-4">{getPropertyNameById(res.roomId)}</td>
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
                                        <td className="p-4">{getPropertyNameById(offer.propertyId)}</td>
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
                                    <td className="p-4">{getPropertyNameById(res.roomId)}</td>
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
      return (
        <SalesCalendar 
          onSaveOffer={handleSaveOffer} 
          onSaveReservation={handleSaveReservation} 
          onDeleteReservation={handleDeleteReservation}
          onAddLead={handleAddLeadFromBooking}
          reservations={reservations}
          offers={offers}
          invoices={invoices}
          adminEvents={adminEvents}
          properties={properties}
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
        />
      );
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
          {/* Admin Section - Only visible to super_manager */}
          {worker?.role === 'super_manager' && (
            <>
              <button onClick={() => { toggleSection('admin'); setActiveDepartment('admin'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
                <span className="flex items-center gap-3"><Users className="w-4 h-4" /> Адмін</span>
                {expandedSections.admin ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {expandedSections.admin && (
                <div className="ml-4 mb-2 space-y-1 border-l border-gray-700 pl-3">
                  <button 
                    onClick={() => { setActiveDepartment('admin'); }}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${activeDepartment === 'admin' ? 'text-emerald-500 font-bold bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    Користувачі
                  </button>
                </div>
              )}
            </>
          )}

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
          {/* Facility - Only show if user has access */}
          {(!worker?.categoryAccess || worker.categoryAccess.includes('facility')) && (
          <button onClick={() => { toggleSection('facility'); setActiveDepartment('facility'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Settings className="w-4 h-4" /> Facility</span><ChevronDown className="w-3 h-3" />
          </button>
          )}
          {expandedSections.facility && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button
                  onClick={() => { setActiveDepartment('facility'); setFacilityTab('overview'); }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'facility' && facilityTab === 'overview'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => { setActiveDepartment('facility'); setFacilityTab('calendar'); }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'facility' && facilityTab === 'calendar'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Calendar & Tasks
                </button>
                <button
                  onClick={() => { setActiveDepartment('facility'); setFacilityTab('warehouse'); }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'facility' && facilityTab === 'warehouse'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Warehouse
                </button>
                <button
                  onClick={() => { setActiveDepartment('facility'); setFacilityTab('messages'); }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'facility' && facilityTab === 'messages'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Messages
                </button>
              </div>
          )}

          {/* Accounting */}
          <div className="mb-2">
            {/* Accounting - Only show if user has access */}
            {(!worker?.categoryAccess || worker.categoryAccess.includes('accounting')) && (
            <button onClick={() => { toggleSection('accounting'); setActiveDepartment('accounting'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Clock className="w-4 h-4" /> Accounting</span><ChevronDown className="w-3 h-3" />
            </button>
            )}
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
          {/* Sales Department - Only show if user has access */}
          {(!worker?.categoryAccess || worker.categoryAccess.includes('sales')) && (
          <button onClick={() => { toggleSection('sales'); setActiveDepartment('sales'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><TrendingUp className="w-4 h-4" /> Sales Department</span><ChevronDown className="w-3 h-3" />
          </button>
          )}
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
          {/* Tasks - Only show if user has access */}
          {(!worker?.categoryAccess || worker.categoryAccess.includes('tasks')) && (
            <button onClick={() => { toggleSection('tasks'); setActiveDepartment('tasks'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4" /> Tasks</span><ChevronDown className="w-3 h-3" />
            </button>
          )}
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
        {activeDepartment === 'admin' && renderAdminContent()}
        {activeDepartment === 'properties' && renderPropertiesContent()}
        {activeDepartment === 'facility' && renderFacilityContent()}
        {activeDepartment === 'accounting' && renderAccountingContent()}
        {activeDepartment === 'sales' && renderSalesContent()}
        {activeDepartment === 'tasks' && renderTasksContent()}
      </div>

      {/* Modals */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-3xl bg-[#0B1120] border border-gray-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Box className="w-4 h-4 text-emerald-400" />
                  Перевезти інвентар зі складу в квартиру
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Вибрано позицій: {selectedStockItems.length}. Після підтвердження склад оновиться та створиться таска
                  для працівника.
                </p>
              </div>
              <button
                onClick={closeTransferModal}
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4 text-xs text-gray-100">
              {transferError && (
                <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
                  {transferError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Квартира (Property)</label>
                  <select
                    value={transferPropertyId}
                    onChange={(e) => setTransferPropertyId(e.target.value)}
                    className="w-full bg-[#020617] border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} — {p.address}
                      </option>
                    ))}
                  </select>
                  {transferPropertyId && (
                    <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      <span>{getPropertyAddressById(transferPropertyId)}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Виконавець (Працівник)</label>
                  <select
                    value={transferWorkerId}
                    onChange={(e) => setTransferWorkerId(e.target.value)}
                    className="w-full bg-[#020617] border border-gray-700 rounded-md px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.department})
                      </option>
                    ))}
                    {workers.length === 0 && <option value="">Немає працівників</option>}
                  </select>
                </div>
              </div>

              <div className="border border-gray-800 rounded-md overflow-hidden">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-[#020617] text-gray-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Предмет</th>
                      <th className="px-3 py-2 text-right">На складі</th>
                      <th className="px-3 py-2 text-right">К-сть до перевезення</th>
                      <th className="px-3 py-2 text-left">Одиниця</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {selectedStockItems.map((row) => (
                      <tr key={row.stockId}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-100">{row.itemName}</div>
                          {row.category && <div className="text-[10px] text-gray-500">{row.category}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-300">{row.quantity}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-block px-2 py-1 bg-black/40 rounded-md border border-gray-700">
                            max {row.quantity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-400">{row.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between text-[11px]">
              <div className="text-gray-400">
                Квартира:{' '}
                <span className="text-gray-200 font-medium">
                  {transferPropertyId ? getPropertyNameById(transferPropertyId) : 'не вибрано'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeTransferModal}
                  className="px-3 py-1.5 rounded-md border border-gray-700 text-gray-300 hover:bg-white/5 transition-colors"
                >
                  Скасувати
                </button>
                <button
                  disabled={!transferPropertyId || !transferWorkerId || selectedStockItems.length === 0 || isExecutingTransfer}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                    !transferPropertyId || !transferWorkerId || selectedStockItems.length === 0 || isExecutingTransfer
                      ? 'bg-emerald-600/30 text-emerald-200/60 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                  onClick={handleExecuteTransfer}
                >
                  <Check className="w-4 h-4" />
                  {isExecutingTransfer ? 'Виконую...' : 'Виконувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddInventoryModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-5xl max-h-[90vh] bg-[#020617] border border-gray-800 rounded-2xl shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Add inventory from document</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Drag & drop or upload an invoice / item list, then recognize it with OCR and adjust items manually.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddInventoryModalOpen(false);
                  setTransferError(null);
                  setOcrInventoryRows([]);
                  setUploadedInventoryFileName(null);
                  setOcrInvoiceNumber('');
                  setOcrPurchaseDate('');
                }}
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 flex-1 overflow-auto space-y-4 text-xs text-gray-100">
              {transferError && (
                <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
                  {transferError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-[2fr,3fr] gap-4">
                <label
                  className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-blue-500/70 bg-black/20 rounded-xl px-4 py-8 cursor-pointer transition-colors"
                >
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadedInventoryFileName(file.name);
                        setOcrInventoryRows([]);
                      }
                    }}
                  />
                  <Upload className="w-6 h-6 text-blue-400 mb-2" />
                  <span className="text-xs font-medium text-white">
                    Drag & drop file here or click to browse
                  </span>
                  <span className="mt-1 text-[11px] text-gray-500">
                    PDF, JPG, PNG or Excel with item list
                  </span>
                  {uploadedInventoryFileName && (
                    <span className="mt-3 px-2 py-1 rounded bg-blue-500/10 text-blue-300 text-[11px]">
                      Selected: {uploadedInventoryFileName}
                    </span>
                  )}
                </label>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-gray-400">
                      Step 2 – recognize document with OCR and review extracted items.
                    </div>
                    <button
                      onClick={handleOcrMock}
                      disabled={isOcrProcessing}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-2 transition-colors ${
                        isOcrProcessing
                          ? 'bg-purple-600/40 text-purple-200/70 cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-500 text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isOcrProcessing ? 'Recognizing… (mock)' : 'Recognize with OCR (mock)'}
                    </button>
                  </div>
                  <div className="flex-1 border border-gray-800 rounded-lg p-3 bg-[#020617]">
                    {ocrInventoryRows.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[11px] text-gray-500 text-center">
                        OCR result will appear here as an editable table after recognition.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Warehouse selection */}
                        {warehouses.length === 0 ? (
                          <div className="mb-3 p-3 bg-yellow-500/10 border border-yellow-500/40 rounded-md">
                            <p className="text-[11px] text-yellow-400 mb-2">
                              No warehouses found. Please create a warehouse first.
                            </p>
                            <button
                              onClick={() => {
                                setIsAddInventoryModalOpen(false);
                                setIsCreateWarehouseModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-md text-[11px] font-medium"
                            >
                              Create Warehouse
                            </button>
                          </div>
                        ) : (
                          <div className="pb-2 border-b border-gray-800">
                            <label className="block text-[10px] text-gray-400 mb-1">Склад (Warehouse)</label>
                            <select
                              value={selectedWarehouseId}
                              onChange={(e) => setSelectedWarehouseId(e.target.value)}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="">-- Select warehouse --</option>
                              {warehouses.map((wh) => (
                                <option key={wh.id} value={wh.id}>
                                  {wh.name} {wh.location ? `(${wh.location})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {/* Invoice and Date fields (shared for all items) */}
                        <div className="grid grid-cols-2 gap-3 pb-2 border-b border-gray-800">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Номер інвойсу</label>
                            <input
                              value={ocrInvoiceNumber}
                              onChange={(e) => {
                                setOcrInvoiceNumber(e.target.value);
                                setOcrInventoryRows((prev) =>
                                  prev.map((row) => ({ ...row, invoiceNumber: e.target.value }))
                                );
                              }}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="INV-2025-0001"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Дата покупки</label>
                            <input
                              type="date"
                              value={ocrPurchaseDate}
                              onChange={(e) => {
                                setOcrPurchaseDate(e.target.value);
                                setOcrInventoryRows((prev) =>
                                  prev.map((row) => ({ ...row, purchaseDate: e.target.value }))
                                );
                              }}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        {/* Items table */}
                        <div className="max-h-64 overflow-auto">
                          <table className="min-w-full text-[11px]">
                            <thead className="bg-[#020617] text-gray-300 border-b border-gray-800 sticky top-0">
                              <tr>
                                <th className="px-2 py-2 text-left">Артикул</th>
                                <th className="px-2 py-2 text-left">Назва товару</th>
                                <th className="px-2 py-2 text-right">К-сть</th>
                                <th className="px-2 py-2 text-right">Ціна (од.)</th>
                                <th className="px-2 py-2 text-left">Об'єкт</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              {ocrInventoryRows.map((row) => (
                                <tr key={row.id}>
                                  <td className="px-2 py-1.5">
                                    <input
                                      value={row.sku}
                                      onChange={(e) => handleOcrCellChange(row.id, 'sku', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      placeholder="SKU"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input
                                      value={row.name}
                                      onChange={(e) => handleOcrCellChange(row.id, 'name', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      value={row.quantity}
                                      onChange={(e) => handleOcrCellChange(row.id, 'quantity', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-right text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      value={row.price}
                                      onChange={(e) => handleOcrCellChange(row.id, 'price', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-right text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <span className="text-[11px] text-gray-400">{row.object}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between text-[11px]">
              <div className="text-gray-400">
                Recognized items:{' '}
                <span className="text-gray-200 font-medium">{ocrInventoryRows.length}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsAddInventoryModalOpen(false);
                    setTransferError(null);
                    setOcrInventoryRows([]);
                    setUploadedInventoryFileName(null);
                    setOcrInvoiceNumber('');
                    setOcrPurchaseDate('');
                  }}
                  className="px-3 py-1.5 rounded-md border border-gray-700 text-gray-300 hover:bg-white/5 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSaveInventoryFromOCR}
                  disabled={ocrInventoryRows.length === 0 || isExecutingTransfer || !selectedWarehouseId || warehouses.length === 0}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                    ocrInventoryRows.length === 0 || isExecutingTransfer || !selectedWarehouseId || warehouses.length === 0
                      ? 'bg-emerald-600/30 text-emerald-200/60 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {isExecutingTransfer ? 'Saving...' : 'Save to inventory'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Create Warehouse Modal */}
      {isCreateWarehouseModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md bg-[#020617] border border-gray-800 rounded-2xl shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Create Warehouse</h2>
              <button
                onClick={() => {
                  setIsCreateWarehouseModalOpen(false);
                  setNewWarehouseName('');
                  setNewWarehouseLocation('');
                  setNewWarehouseDescription('');
                }}
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Name *</label>
                <input
                  type="text"
                  value={newWarehouseName}
                  onChange={(e) => setNewWarehouseName(e.target.value)}
                  className="w-full bg-transparent border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Main Warehouse"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Location</label>
                <input
                  type="text"
                  value={newWarehouseLocation}
                  onChange={(e) => setNewWarehouseLocation(e.target.value)}
                  className="w-full bg-transparent border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Berlin, Germany"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Description</label>
                <textarea
                  value={newWarehouseDescription}
                  onChange={(e) => setNewWarehouseDescription(e.target.value)}
                  className="w-full bg-transparent border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Optional description"
                  rows={3}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setIsCreateWarehouseModalOpen(false);
                  setNewWarehouseName('');
                  setNewWarehouseLocation('');
                  setNewWarehouseDescription('');
                }}
                className="px-4 py-2 rounded-md border border-gray-700 text-gray-300 hover:bg-white/5 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateWarehouse}
                disabled={!newWarehouseName.trim()}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  !newWarehouseName.trim()
                    ? 'bg-blue-600/30 text-blue-200/60 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountDashboard;
