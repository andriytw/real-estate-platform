
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutDashboard, Calendar, MessageSquare, Settings, LogOut, User, PieChart, TrendingUp, Users, CheckCircle2, AlertCircle, Clock, ArrowRight, Building, Briefcase, Mail, DollarSign, FileText, Calculator, ChevronDown, ChevronRight, FileBox, Bookmark, X, Save, Send, Building2, Phone, MapPin, Home, Search, Filter, Plus, Edit, Camera, BarChart3, Box, FolderOpen, Folder, File as FileIcon, Upload, Trash2, AreaChart, PenTool, DoorOpen, Wrench, Check, Zap, Droplet, Flame, Video } from 'lucide-react';
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
import { propertiesService, tasksService, workersService, warehouseService, bookingsService, invoicesService, offersService, WarehouseStockItem } from '../services/supabaseService';
import { ReservationData, OfferData, InvoiceData, CalendarEvent, TaskType, TaskStatus, Lead, Property, RentalAgreement, MeterLogEntry, FuturePayment, PropertyEvent, BookingStatus, RequestData, Worker, Warehouse, Booking } from '../types';
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
  const [selectedDocumentFolder, setSelectedDocumentFolder] = useState<string>('Договори');
  const [einzugAuszugTasks, setEinzugAuszugTasks] = useState<CalendarEvent[]>([]);

  // Load Einzug/Auszug tasks for selected property
  useEffect(() => {
    const loadEinzugAuszugTasks = async () => {
      if (!selectedPropertyId) {
        setEinzugAuszugTasks([]);
        return;
      }

      try {
        const allTasks = await tasksService.getAll();
        const propertyTasks = allTasks.filter(
          task => task.propertyId === selectedPropertyId && 
                  (task.type === 'Einzug' || task.type === 'Auszug')
        );
        setEinzugAuszugTasks(propertyTasks);
      } catch (error) {
        console.error('Error loading Einzug/Auszug tasks:', error);
        setEinzugAuszugTasks([]);
      }
    };

    loadEinzugAuszugTasks();
  }, [selectedPropertyId]);

  // Load properties from Supabase
  useEffect(() => {
    const loadProperties = async () => {
      try {
        setIsLoadingProperties(true);
        const data = await propertiesService.getAll();
        
        // #region agent log
        if (data.length > 0) {
          const firstProperty = data[0];
          fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:120',message:'Properties loaded',data:{totalProperties:data.length,firstProperty:{id:firstProperty.id,title:firstProperty.title,inventoryCount:firstProperty.inventory?.length||0,inventoryItems:firstProperty.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type,sku:i.sku}))||[]}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        }
        // #endregion
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:129',message:'Setting properties from DB',data:{propertiesCount:data.length,isUsingMock:false,firstPropertyId:data[0]?.id,firstPropertyTitle:data[0]?.title,firstPropertyInventoryCount:data[0]?.inventory?.length||0,firstPropertyInventory:data[0]?.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // Очистити inventory, який пов'язаний зі складом, але не знайдений на складі
        // Це автоматично видалить inventory, який був видалений зі складу
        let stock: any[] = [];
        try {
          stock = await warehouseService.getStock();
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:137',message:'Warehouse stock loaded for cleanup',data:{stockCount:stock.length,stockItemIds:stock.map(s=>s.itemId).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion
        } catch (error) {
          console.error('Error loading warehouse stock for cleanup:', error);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:142',message:'Error loading warehouse stock',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
          // #endregion
        }
        
        const stockItemIds = new Set(stock.map(s => s.itemId));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:148',message:'Stock itemIds set created',data:{stockItemIdsCount:stockItemIds.size,stockItemIdsArray:Array.from(stockItemIds).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        
        // Мок-дані inventory, які потрібно видалити (якщо вони є в БД)
        // Перевіряємо як type, так і name, ігноруючи регістр
        const mockInventoryTypes = ['ліжко', 'шафа', 'холодильник', 'інше (вкажіть у кількості)', 'sofa', 'fridge'];
        const mockInvNumbers = ['KV1-L001', 'KV1-SH003', 'KV1-HOL01', 'KV1-PRM01', 'BRL-DIV04', 'BRL-HOL02', 'WRS-D001', 'WRS-H001'];
        
        const cleanedData = await Promise.all(data.map(async (property) => {
          if (property.inventory && property.inventory.length > 0) {
            const cleanedInventory = property.inventory.filter((item: any) => {
              // Видаляємо мок-дані inventory (перевіряємо type і name, ігноруючи регістр)
              const itemType = (item.type || '').toLowerCase().trim();
              const itemName = (item.name || '').toLowerCase().trim();
              
              // Перевірка на мок-дані: "ліжко", "шафа", "холодильник" в будь-якому регістрі
              const isMockItem = 
                itemType.includes('ліжко') || itemName.includes('ліжко') ||
                itemType.includes('шафа') || itemName.includes('шафа') ||
                itemType.includes('холодильник') || itemName.includes('холодильник') ||
                itemType.includes('sofa') || itemName.includes('sofa') ||
                itemType.includes('fridge') || itemName.includes('fridge') ||
                mockInventoryTypes.some(mock => itemType === mock || itemName === mock);
              
              const isMockInvNumber = item.invNumber && mockInvNumbers.includes(item.invNumber);
              
              if (isMockItem || isMockInvNumber) {
                console.log(`🗑️ Removing mock inventory: ${item.type || item.name} (${item.invNumber || 'no invNumber'}) from ${property.title}`);
                return false; // Видаляємо мок-дані
              }
              
              // Якщо склад пустий, видаляємо весь старий inventory без itemId (крім тих, що точно не мок-дані)
              // Це означає, що весь inventory має бути пов'язаний зі складом
              if (stock.length === 0) {
                // Якщо склад пустий, видаляємо весь inventory без itemId (він не може бути зі складу)
                if (!item.itemId) {
                  console.log(`🗑️ Removing old inventory (no warehouse): ${item.type || item.name} from ${property.title}`);
                  return false;
                }
              }
              
              // Залишаємо старий інвентар без itemId тільки якщо склад не пустий
              if (!item.itemId && (!item.invNumber || !item.invNumber.startsWith('WAREHOUSE-'))) {
                // Але перевіряємо, чи це не мок-дані
                if (isMockType || isMockInvNumber) {
                  return false;
                }
                return true; // Старий інвентар - залишаємо тільки якщо не мок-дані
              }
              
              // Якщо item має itemId, перевіряємо, чи він є на складі
              if (item.itemId) {
                return stockItemIds.has(item.itemId);
              }
              
              // Якщо item має invNumber у форматі WAREHOUSE-, перевіряємо, чи відповідний itemId є на складі
              if (item.invNumber && item.invNumber.startsWith('WAREHOUSE-')) {
                const itemIdFromInvNumber = item.invNumber.replace('WAREHOUSE-', '');
                return stockItemIds.has(itemIdFromInvNumber);
              }
              
              return true; // Якщо не визначено - залишаємо (старий інвентар)
            });
            
            if (cleanedInventory.length !== property.inventory.length) {
              console.log(`🧹 Cleaning inventory for ${property.title}: ${property.inventory.length} -> ${cleanedInventory.length} items`);
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:168',message:'Cleaning property inventory',data:{propertyId:property.id,propertyTitle:property.title,oldCount:property.inventory.length,newCount:cleanedInventory.length,removedItems:property.inventory.filter((i:any)=>!cleanedInventory.some((ci:any)=>ci.itemId===i.itemId&&ci.invNumber===i.invNumber)).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              // Оновити property в БД
              await propertiesService.update(property.id, {
                inventory: cleanedInventory,
              });
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:175',message:'Property inventory updated in DB',data:{propertyId:property.id,newInventoryCount:cleanedInventory.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
              // #endregion
              return { ...property, inventory: cleanedInventory };
            }
          }
          return property;
        }));
        
        setProperties(cleanedData);
        // Use functional update to avoid dependency on selectedPropertyId
        setSelectedPropertyId(prev => {
          if (!prev && data.length > 0) {
            return data[0].id;
          }
          return prev;
        });
      } catch (error) {
        console.error('Error loading properties in Dashboard:', error);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:137',message:'Error loading properties, using MOCK_PROPERTIES',data:{error:error instanceof Error ? error.message : String(error),mockPropertiesCount:MOCK_PROPERTIES.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
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
  const [propertyToEdit, setPropertyToEdit] = useState<Property | undefined>(undefined);
  const [isInventoryEditing, setIsInventoryEditing] = useState(false);
  const [expandedMeterGroups, setExpandedMeterGroups] = useState<Set<string>>(new Set());
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
  const [uploadedInventoryFile, setUploadedInventoryFile] = useState<File | null>(null);
  const [uploadedInventoryPreviewUrl, setUploadedInventoryPreviewUrl] = useState<string | null>(null);
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
  const [ocrVendor, setOcrVendor] = useState<string>('');
  const inventoryFileInputRef = useRef<HTMLInputElement | null>(null);
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

  const [offers, setOffers] = useState<OfferData[]>([]);

  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [adminEvents, setAdminEvents] = useState<CalendarEvent[]>([]);
  const [accountingEvents, setAccountingEvents] = useState<CalendarEvent[]>(INITIAL_ACCOUNTING_EVENTS);

  // Cleanup object URL for uploaded inventory preview
  useEffect(() => {
    return () => {
      if (uploadedInventoryPreviewUrl) {
        URL.revokeObjectURL(uploadedInventoryPreviewUrl);
      }
    };
  }, [uploadedInventoryPreviewUrl]);

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

  const handleOcrReal = async () => {
    if (!uploadedInventoryFile) {
      setTransferError('Please upload a file first');
      return;
    }

    setIsOcrProcessing(true);
    setTransferError(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        try {
          const base64String = reader.result as string;
          const base64Data = base64String.split(',')[1]; // Remove data:image/jpeg;base64, prefix
          const mimeType = uploadedInventoryFile.type;

          // Get Supabase client for auth
          const { createClient } = await import('../utils/supabase/client');
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            throw new Error('Not authenticated. Please log in again.');
          }

          // Get Supabase URL
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 
                            import.meta.env.NEXT_PUBLIC_SUPABASE_URL || 
                            'https://qcpuzfhawcondygspiok.supabase.co';
          
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 
                         import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                         'sb_publishable_cpQrhzVqZRCCeULDWhVJJw_ZIhcLx0Y';

          // Call Edge Function
          const response = await fetch(`${supabaseUrl}/functions/v1/ocr-invoice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': anonKey,
            },
            body: JSON.stringify({
              fileBase64: base64Data,
              mimeType: mimeType,
              fileName: uploadedInventoryFileName,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `OCR processing failed: ${response.status}`);
          }

          const result = await response.json();
          
          if (!result.success || !result.data) {
            throw new Error('Invalid OCR response format');
          }

          const ocrData = result.data;

          // Update state with recognized data
          setOcrInvoiceNumber(ocrData.invoiceNumber || '');
          setOcrPurchaseDate(ocrData.purchaseDate || new Date().toISOString().split('T')[0]);
          setOcrVendor(ocrData.vendor || '');
          
          const rows = (ocrData.items || []).map((item: any, idx: number) => ({
            id: String(idx + 1),
            sku: item.sku || '',
            name: item.name || '',
            quantity: String(item.quantity || 1),
            unit: item.unit || 'pcs',
            price: String(item.price || 0),
            invoiceNumber: ocrData.invoiceNumber || '',
            purchaseDate: ocrData.purchaseDate || '',
            object: 'Склад',
          }));

          setOcrInventoryRows(rows);
          setIsOcrProcessing(false);
          
          if (rows.length === 0) {
            setTransferError('No items found in the invoice. Please check the document or try another file.');
          } else {
            // Show success message
            console.log(`✅ OCR completed: ${rows.length} items recognized`);
          }
        } catch (error: any) {
          console.error('OCR Error:', error);
          setTransferError(error.message || 'Failed to process OCR. Please try again.');
          setIsOcrProcessing(false);
        }
      };

      reader.onerror = () => {
        setTransferError('Failed to read file');
        setIsOcrProcessing(false);
      };

      reader.readAsDataURL(uploadedInventoryFile);
    } catch (error: any) {
      console.error('File reading error:', error);
      setTransferError(error.message || 'Failed to read file');
      setIsOcrProcessing(false);
    }
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

      // Get invoice number, date, and vendor from first row (they should be the same for all)
      const invoiceNumber = ocrInvoiceNumber || ocrInventoryRows[0]?.invoiceNumber || undefined;
      const purchaseDate = ocrPurchaseDate || ocrInventoryRows[0]?.purchaseDate || undefined;
      const vendor = ocrVendor || undefined;

      await warehouseService.addInventoryFromOCR(itemsToAdd, selectedWarehouseId, invoiceNumber, purchaseDate, vendor);

      // Refresh stock list
      const refreshed = await warehouseService.getStock();
      setWarehouseStock(refreshed);

      // Close modal and reset
      setIsAddInventoryModalOpen(false);
      setOcrInventoryRows([]);
      setUploadedInventoryFile(null);
      setUploadedInventoryFileName(null);
      setOcrInvoiceNumber('');
      setOcrPurchaseDate('');
      setOcrVendor('');
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:607',message:'handleDeleteStockItem entry',data:{stockId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Спочатку отримуємо інформацію про stock item, щоб знати itemId
      const stockItem = warehouseStock.find(item => item.stockId === stockId);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:612',message:'stockItem found',data:{stockItem:stockItem?{stockId:stockItem.stockId,itemId:stockItem.itemId,itemName:stockItem.itemName}:null,warehouseStockLength:warehouseStock.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      if (!stockItem) {
        alert('Stock item not found');
        return;
      }

      const itemId = stockItem.itemId;
      const invNumber = `WAREHOUSE-${itemId}`;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:619',message:'itemId and invNumber extracted',data:{itemId,invNumber,itemName:stockItem.itemName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Видаляємо зі складу
      await warehouseService.deleteStockItem(stockId);

      // Знаходимо всі квартири, де є цей інвентар, і видаляємо його
      if (itemId) {
        console.log(`🗑️ Removing inventory with itemId ${itemId} (${stockItem.itemName}) from all properties...`);
        const allProperties = await propertiesService.getAll();
        const itemName = stockItem.itemName;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:625',message:'Starting property search',data:{allPropertiesCount:allProperties.length,itemId,itemName,invNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        for (const property of allProperties) {
          if (property.inventory && property.inventory.length > 0) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:630',message:'Checking property inventory',data:{propertyId:property.id,propertyTitle:property.title,inventoryCount:property.inventory.length,inventoryItems:property.inventory.map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // Шукаємо інвентар за itemId, invNumber або назвою товару
            const inventoryToRemove = property.inventory.filter((item: any) => {
              // Перевірка за itemId
              if (item.itemId === itemId) {
                console.log(`  ✓ Found by itemId in ${property.title}: ${item.name || item.type}`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:635',message:'Match found by itemId',data:{propertyId:property.id,item:item},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return true;
              }
              // Перевірка за invNumber
              if (item.invNumber === invNumber) {
                console.log(`  ✓ Found by invNumber in ${property.title}: ${item.name || item.type}`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:640',message:'Match found by invNumber',data:{propertyId:property.id,item:item,invNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return true;
              }
              // Перевірка за назвою товару (якщо немає itemId)
              if (!item.itemId && (item.name === itemName || item.type === itemName)) {
                console.log(`  ✓ Found by name in ${property.title}: ${item.name || item.type}`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:645',message:'Match found by name',data:{propertyId:property.id,item:item,itemName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                return true;
              }
              return false;
            });
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:650',message:'inventoryToRemove result',data:{propertyId:property.id,foundCount:inventoryToRemove.length,itemsToRemove:inventoryToRemove.map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
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
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:660',message:'Before property update',data:{propertyId:property.id,oldInventoryCount:property.inventory.length,newInventoryCount:updatedInventory.length,oldInventory:property.inventory.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type})),newInventory:updatedInventory.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              // Створюємо payload тільки з необхідними полями для оновлення
              // Важливо: передаємо inventory як масив, навіть якщо він порожній
              // Також передаємо id property, щоб Supabase знав, який запис оновлювати
              const updatePayload: Partial<Property> = {
                id: property.id, // Додаємо id для явного вказання
                inventory: Array.isArray(updatedInventory) ? updatedInventory : [], // Гарантуємо, що це масив
              };
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:667',message:'Update payload prepared',data:{propertyId:property.id,payloadInventoryCount:updatePayload.inventory?.length||0,payloadInventory:updatePayload.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
              // #endregion
              
              const updatedProperty = await propertiesService.update(property.id, updatePayload);
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:675',message:'After property update',data:{propertyId:property.id,returnedInventoryCount:updatedProperty.inventory?.length||0,returnedInventory:updatedProperty.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
              // #endregion
            }
          }
        }
        
        // Оновити локальний стан properties
        setProperties((prev) => {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:675',message:'Before local state update',data:{prevPropertiesCount:prev.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          const updated = prev.map((p) => {
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
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:685',message:'Local state updated for property',data:{propertyId:p.id,propertyTitle:p.title,oldCount:p.inventory.length,newCount:updatedInventory.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                return { ...p, inventory: updatedInventory };
              }
            }
            return p;
          });
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:692',message:'After local state update',data:{updatedPropertiesCount:updated.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          return updated;
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
            vendor: item.vendor,
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
        vendor: row.vendor,
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

      // Checklist для працівника на основі інвентарю
      const checklist = transferData.map((item) => ({
        text: `${item.itemName || 'Предмет'} × ${item.quantity || 1}`,
        checked: false,
      }));

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
        checklist,
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
        // #region agent log
        const adminEventsBeforeLoad = adminEvents.map(e => ({id: e.id, title: e.title, date: e.date, day: e.day, workerId: e.workerId}));
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1204',message:'H1: loadFacilityTasks ENTRY',data:{adminEventsCountBefore:adminEvents.length,adminEventIdsBefore:adminEvents.map(e=>e.id),adminEventsBefore:adminEventsBeforeLoad,workerRole:worker?.role,workerId:worker?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        console.log('🔄 Loading Facility tasks from database...');
        console.log('👤 Current user:', worker?.id, worker?.role, worker?.department);
        
        // Build filters based on user role
        const filters: any = {
          department: 'facility'
        };
        
        // ЗМІНА: Менеджери та Super Admin бачать ВСІ завдання Facility
        // Тільки працівники бачать тільки призначені їм завдання
        if (worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        // Для manager та super_manager - не фільтруємо по workerId, показуємо всі завдання Facility
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1221',message:'H1: BEFORE tasksService.getAll',data:{filters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        const tasks = await tasksService.getAll(filters);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1221',message:'H1-H5: AFTER tasksService.getAll',data:{tasksCount:tasks.length,tasks:tasks.map(t=>({id:t.id,title:t.title,date:t.date,day:t.day,workerId:t.workerId,status:t.status})),adminEventIdsBefore:adminEvents.map(e=>e.id),tasksIdsFromDB:tasks.map(t=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        console.log('✅ Loaded Facility tasks:', tasks.length);
        console.log('📋 All tasks:', tasks.map(t => ({ 
          id: t.id, 
          title: t.title, 
          workerId: t.workerId, 
          department: t.department, 
          bookingId: t.bookingId, 
          bookingIdType: typeof t.bookingId, 
          type: t.type,
          status: t.status,
          date: t.date,
          day: t.day
        })));
        
        // Filter out ONLY tasks with temporary "auto-task-*" IDs
        // These should not exist in database, but if they do, filter them out
        const autoTaskPattern = /^auto-task-/i;
        const validTasks = tasks.filter(t => {
            // Filter out auto-task-* IDs (these are temporary and should not exist in DB)
            if (autoTaskPattern.test(t.id)) {
                console.warn(`⚠️ Filtering out task with temporary ID: ${t.id} - ${t.title}`);
                return false;
            }
            // Keep all other IDs (UUIDs and legacy IDs)
            return true;
        });
        
        if (validTasks.length !== tasks.length) {
            console.warn(`⚠️ Filtered out ${tasks.length - validTasks.length} tasks with temporary auto-task-* IDs`);
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1257',message:'H1: BEFORE setAdminEvents (replacing state)',data:{validTasksCount:validTasks.length,validTaskIds:validTasks.map(t=>t.id),adminEventsCountBefore:adminEvents.length,adminEventIdsBefore:adminEvents.map(e=>e.id),tasksLost:adminEvents.filter(e=>!validTasks.find(t=>t.id===e.id)).map(e=>({id:e.id,title:e.title,date:e.date}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        console.log('📋 Tasks after filtering:', validTasks.length);
        if (validTasks.length > 0) {
            console.log('📋 Task IDs:', validTasks.map(t => t.id));
        }
        
        setAdminEvents(validTasks);
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1262',message:'H1: AFTER setAdminEvents (state replaced)',data:{validTasksCount:validTasks.length,validTaskIds:validTasks.map(t=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
      } catch (error) {
        console.error('❌ Error loading Facility tasks:', error);
        // Don't use INITIAL_ADMIN_EVENTS as fallback - they have invalid IDs too
        setAdminEvents([]);
      }
    };
    
    if (worker) {
      loadFacilityTasks();
    }
    
    // Listen for task updates to reload tasks
    // NOTE: We use a debounce to prevent multiple rapid reloads
    let reloadTimeout: NodeJS.Timeout | null = null;
    const handleTaskUpdated = () => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1277',message:'H1: handleTaskUpdated called',data:{adminEventsCount:adminEvents.length,adminEventIds:adminEvents.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      console.log('🔄 Task updated event received, will reload Facility tasks in 500ms...');
      // Debounce reload to prevent race conditions when multiple updates happen quickly
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1284',message:'H1: Executing debounced loadFacilityTasks',data:{adminEventsCountBeforeReload:adminEvents.length,adminEventIdsBeforeReload:adminEvents.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        console.log('🔄 Reloading Facility tasks...');
        loadFacilityTasks();
      }, 500);
    };
    
    window.addEventListener('taskUpdated', handleTaskUpdated);
    return () => {
      window.removeEventListener('taskUpdated', handleTaskUpdated);
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
    };
  }, [worker]);

  // Load invoices from database
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1255',message:'Loading invoices from Supabase',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const loadedInvoices = await invoicesService.getAll();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1258',message:'Loaded invoices from Supabase',data:{count:loadedInvoices.length,invoiceIds:loadedInvoices.map(i=>i.id),invoiceNumbers:loadedInvoices.map(i=>i.invoiceNumber)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        setInvoices(loadedInvoices);
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1263',message:'Error loading invoices from Supabase',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        console.error('Error loading invoices:', error);
      }
    };
    loadInvoices();
  }, []);

  // Load offers from database
  useEffect(() => {
    const loadOffers = async () => {
      try {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1297',message:'Loading offers from Supabase',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        const loadedOffers = await offersService.getAll();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1301',message:'Loaded offers from Supabase',data:{count:loadedOffers.length,offerIds:loadedOffers.map(o=>({id:o.id,idType:typeof o.id,clientName:o.clientName,propertyId:o.propertyId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        setOffers(loadedOffers);
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1305',message:'Error loading offers from Supabase',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        console.error('Error loading offers:', error);
      }
    };
    loadOffers();
  }, []);

  // Listen for task updates from Kanban board
  useEffect(() => {
    const handleTaskUpdated = async () => {
      try {
        console.log('🔄 Task updated event received, reloading Facility tasks...');
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1232',message:'handleTaskUpdated called',data:{workerRole:worker?.role,workerId:worker?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
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
        
        // #region agent log
        const tasksByBooking = tasks.reduce((acc: any, t) => {
          if (t.bookingId) {
            const key = String(t.bookingId);
            if (!acc[key]) acc[key] = [];
            acc[key].push({id:t.id,type:t.type,workerId:t.workerId});
          }
          return acc;
        }, {});
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1246',message:'Tasks loaded from DB',data:{totalTasks:tasks.length,tasksByBooking},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
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
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1276',message:'Setting adminEvents state',data:{tasksCount:tasks.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
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

  // Load Accounting tasks from database
  useEffect(() => {
    const loadAccountingTasks = async () => {
      try {
        console.log('🔄 Loading Accounting tasks from database...');
        console.log('👤 Current user:', worker?.id, worker?.role, worker?.department);
        
        // Build filters based on user role
        const filters: any = {
          department: 'accounting'
        };
        
        // If user is a manager or worker (not super_manager), filter by their ID
        if (worker?.role === 'manager' || worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        // For super_manager, don't filter by workerId - show all accounting tasks
        
        const tasks = await tasksService.getAll(filters);
        console.log('✅ Loaded Accounting tasks:', tasks.length);
        console.log('📋 Tasks:', tasks.map(t => ({ id: t.id, title: t.title, workerId: t.workerId, department: t.department })));
        
        setAccountingEvents(tasks);
      } catch (error) {
        console.error('❌ Error loading Accounting tasks:', error);
        // Keep INITIAL_ACCOUNTING_EVENTS as fallback
      }
    };
    
    if (worker) {
      loadAccountingTasks();
    }
  }, [worker]);

  // Listen for task updates from Kanban board for Accounting
  useEffect(() => {
    const handleAccountingTaskUpdated = async () => {
      try {
        console.log('🔄 Task updated event received, reloading Accounting tasks...');
        
        const filters: any = {
          department: 'accounting'
        };
        
        if (worker?.role === 'manager' || worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        
        const tasks = await tasksService.getAll(filters);
        console.log('✅ Reloaded Accounting tasks:', tasks.length);
        
        setAccountingEvents(tasks);
      } catch (error) {
        console.error('❌ Error reloading Accounting tasks:', error);
      }
    };
    
    window.addEventListener('taskUpdated', handleAccountingTaskUpdated);
    window.addEventListener('kanbanTaskCreated', handleAccountingTaskUpdated);
    
    return () => {
      window.removeEventListener('taskUpdated', handleAccountingTaskUpdated);
      window.removeEventListener('kanbanTaskCreated', handleAccountingTaskUpdated);
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
  const handleSaveProperty = async (newProperty: Property) => {
    try {
      if (propertyToEdit) {
        // Режим редагування - оновити існуючий об'єкт
        let propertyToUpdate: Partial<Property> = { ...newProperty };
        
        // Зберегти всі існуючі Check-In/Check-Out записи
        const existingCheckInOut = (propertyToEdit.meterLog || []).filter(
          e => e.type === 'Check-In' || e.type === 'Check-Out'
        );
        
        // Конвертувати meterReadings в meterLog (якщо є нові meterReadings)
        if (newProperty.meterReadings && newProperty.meterReadings.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const readings = {
            electricity: 'Pending',
            water: 'Pending',
            gas: 'Pending'
          };
          
          newProperty.meterReadings.forEach(meter => {
            const nameLower = meter.name.toLowerCase();
            const initialValue = meter.initial || 'Pending';
            
            if (nameLower === 'electricity' || nameLower.includes('electric') || nameLower.includes('електро') || nameLower.includes('strom')) {
              readings.electricity = initialValue;
            } else if (nameLower === 'water' || nameLower.includes('вода') || nameLower.includes('wasser')) {
              readings.water = initialValue;
            } else if (nameLower === 'gas' || nameLower.includes('газ')) {
              readings.gas = initialValue;
            } else if (nameLower === 'heating' || nameLower.includes('heizung') || nameLower.includes('опалення')) {
              readings.gas = initialValue;
            }
          });
          
          // Знайти існуючий Initial запис
          const existingInitial = propertyToEdit.meterLog?.find(e => e.type === 'Initial');
          
          if (existingInitial) {
            // Оновити існуючий Initial запис
            const updatedInitial: MeterLogEntry = {
              ...existingInitial,
              readings: readings
            };
            propertyToUpdate.meterLog = [updatedInitial, ...existingCheckInOut];
          } else {
            // Створити новий Initial запис, зберігаючи всі існуючі Check-In/Check-Out
            const initialMeterLog: MeterLogEntry = {
              date: today,
              type: 'Initial',
              readings: readings
            };
            propertyToUpdate.meterLog = [initialMeterLog, ...existingCheckInOut];
          }
          
          console.log('📊 Converting meterReadings to meterLog (edit mode):', {
            meterReadings: newProperty.meterReadings,
            existingCheckInOutCount: existingCheckInOut.length,
            updatedMeterLogCount: propertyToUpdate.meterLog.length,
            meterLog: propertyToUpdate.meterLog
          });
        } else {
          // Якщо немає meterReadings, зберегти існуючий meterLog
          propertyToUpdate.meterLog = propertyToEdit.meterLog;
        }
        
        // Зберігати meterReadings разом з meterLog (не видаляти!)
        // meterReadings потрібні для відображення в модальному вікні редагування
        if (newProperty.meterReadings !== undefined) {
          propertyToUpdate.meterReadings = newProperty.meterReadings;
        }
        
        const updatedProperty = await propertiesService.update(propertyToEdit.id, propertyToUpdate);
        console.log('✅ Property updated in database:', updatedProperty.id);
        console.log('📊 Updated property meterLog:', updatedProperty.meterLog);
        console.log('📊 Updated property meterReadings:', updatedProperty.meterReadings);
        
        // Оновити локальний стан
        setProperties(prev => prev.map(p => p.id === updatedProperty.id ? updatedProperty : p));
        setSelectedPropertyId(updatedProperty.id);
        setPropertyToEdit(undefined);
      } else {
        // Режим створення - створити новий об'єкт
        // Видалити id, щоб база даних сама згенерувала правильний UUID
        const { id, ...propertyWithoutId } = newProperty;
        
        // Конвертувати meterReadings в meterLog
        if (newProperty.meterReadings && newProperty.meterReadings.length > 0) {
          const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
          
          // Ініціалізувати readings
          const readings = {
            electricity: 'Pending',
            water: 'Pending',
            gas: 'Pending'
          };
          
          // Заповнити readings на основі типів лічильників
          newProperty.meterReadings.forEach(meter => {
            const nameLower = meter.name.toLowerCase();
            const initialValue = meter.initial || 'Pending';
            
            // Розпізнавання стандартних назв (Electricity, Water, Gas, Heating)
            if (nameLower === 'electricity' || nameLower.includes('electric') || nameLower.includes('електро') || nameLower.includes('strom')) {
              readings.electricity = initialValue;
            } else if (nameLower === 'water' || nameLower.includes('вода') || nameLower.includes('wasser')) {
              readings.water = initialValue;
            } else if (nameLower === 'gas' || nameLower.includes('газ')) {
              readings.gas = initialValue;
            } else if (nameLower === 'heating' || nameLower.includes('heizung') || nameLower.includes('опалення')) {
              // Heating зазвичай пов'язаний з газом, але можна додати як окремий лічильник
              // Поки що додаємо як gas, або можна створити окреме поле
              readings.gas = initialValue;
            }
          });
          
          // Створити MeterLogEntry з типом 'Initial'
          const initialMeterLog: MeterLogEntry = {
            date: today,
            type: 'Initial',
            readings: readings
          };
          
          // Додати meterLog до property
          propertyWithoutId.meterLog = [initialMeterLog];
          
          console.log('📊 Converting meterReadings to meterLog:', {
            meterReadings: newProperty.meterReadings,
            meterLog: propertyWithoutId.meterLog
          });
        } else {
          console.log('⚠️ No meterReadings to convert');
        }
        
        // Зберегти об'єкт в базу даних
        const savedProperty = await propertiesService.create(propertyWithoutId);
        console.log('✅ Property saved to database:', savedProperty.id);
        console.log('📊 Saved property meterLog:', savedProperty.meterLog);
        console.log('📊 Saved property meterReadings:', savedProperty.meterReadings);
        
        // Оновити локальний стан з об'єктом з бази (з правильним ID)
        setProperties([...properties, savedProperty]);
        setSelectedPropertyId(savedProperty.id);
      }
      
      setIsPropertyAddModalOpen(false);
    } catch (error) {
      console.error('❌ Error saving property:', error);
      // Показати помилку користувачу (можна додати toast notification)
      alert('Помилка збереження об\'єкта. Спробуйте ще раз.');
    }
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

  const handleSaveOffer = async (newOffer: OfferData) => {
      try {
        // Remove id before creating (database will generate UUID)
        const { id, ...offerWithoutId } = newOffer;
        const savedOffer = await offersService.create(offerWithoutId);
        setOffers([savedOffer, ...offers]);
        setSalesTab('offers');
      } catch (error) {
        console.error('Error saving offer:', error);
        alert('Failed to save offer. Please try again.');
        // Still update local state for UI responsiveness
        setOffers([newOffer, ...offers]);
        setSalesTab('offers');
      }
  };

  // Load reservations from database on mount
  useEffect(() => {
    const loadReservations = async () => {
      try {
        const bookings = await bookingsService.getAll();
        // Transform Booking[] to ReservationData[]
        // Note: Booking.id from DB is UUID (string), but ReservationData.id is number
        // We'll keep UUID as string for now and handle conversion where needed
        const reservationsData: ReservationData[] = bookings.map(booking => ({
          ...booking,
          id: booking.id as any // Allow both string and number for compatibility
        })) as ReservationData[];
        setReservations(reservationsData);
      } catch (error) {
        console.error('Error loading reservations:', error);
      }
    };
    
    loadReservations();
  }, []);

  const handleSaveReservation = async (reservation: ReservationData) => {
      try {
        // Convert ReservationData to Booking format for database
        const bookingToSave: Omit<Booking, 'id'> = {
          roomId: reservation.roomId,
          start: reservation.start,
          end: reservation.end,
          guest: reservation.guest,
          color: reservation.color || '#3b82f6',
          checkInTime: reservation.checkInTime,
          checkOutTime: reservation.checkOutTime,
          status: reservation.status || 'reserved',
          price: reservation.price,
          balance: reservation.balance,
          guests: reservation.guests,
          unit: reservation.unit,
          comments: reservation.comments,
          paymentAccount: reservation.paymentAccount,
          company: reservation.company,
          ratePlan: reservation.ratePlan,
          guarantee: reservation.guarantee,
          cancellationPolicy: reservation.cancellationPolicy,
          noShowPolicy: reservation.noShowPolicy,
          channel: reservation.channel,
          type: reservation.type || 'GUEST',
          address: reservation.address,
          phone: reservation.phone,
          email: reservation.email,
          pricePerNight: reservation.pricePerNight,
          taxRate: reservation.taxRate,
          totalGross: reservation.totalGross,
          guestList: reservation.guestList,
          clientType: reservation.clientType,
          firstName: reservation.firstName,
          lastName: reservation.lastName,
          companyName: reservation.companyName,
          internalCompany: reservation.internalCompany,
        };
        
        const savedBooking = await bookingsService.create(bookingToSave);
        
        // Update local state with saved booking (which has UUID id)
        const newReservation: ReservationData = {
          ...savedBooking,
          id: savedBooking.id as any // Keep UUID as string for compatibility
        } as ReservationData;
        
        setReservations(prev => [newReservation, ...prev]);
        
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
      } catch (error) {
        console.error('Error saving reservation:', error);
        alert('Failed to save reservation. Please try again.');
      }
  };

  // Helper function to update reservation in database and local state
  const updateReservationInDB = async (reservationId: number | string, updates: Partial<ReservationData>) => {
    try {
      const reservation = reservations.find(r => r.id === reservationId);
      if (!reservation) {
        console.error('Reservation not found for update:', reservationId);
        return;
      }
      
      const bookingId = typeof reservation.id === 'string' ? reservation.id : reservationId.toString();
      const updatedBooking = await bookingsService.update(bookingId, updates as Partial<Booking>);
      
      // Update local state
      setReservations(prev => prev.map(r => 
        r.id === reservationId
          ? { ...r, ...updates, id: updatedBooking.id as any }
          : r
      ));
    } catch (error) {
      console.error('Error updating reservation in database:', error);
      // Still update local state for UI responsiveness
      setReservations(prev => prev.map(r => 
        r.id === reservationId ? { ...r, ...updates } : r
      ));
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

  const handleDeleteReservation = async (id: number | string) => {
      try {
        // Find reservation to get the UUID if id is number
        const reservation = reservations.find(r => r.id === id);
        if (!reservation) {
          console.error('Reservation not found:', id);
          return;
        }
        
        // Use the reservation's id (which might be UUID string or number)
        const bookingId = typeof reservation.id === 'string' ? reservation.id : id.toString();
        
        await bookingsService.delete(bookingId);
        setReservations(prev => prev.filter(r => r.id !== id));
      } catch (error) {
        console.error('Error deleting reservation:', error);
        alert('Failed to delete reservation. Please try again.');
      }
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

  const handleSaveOfferUpdate = async (updatedOffer: OfferData) => {
      try {
        // Check if offer has a valid UUID (exists in database)
        const isValidUUID = (str: string | number | undefined): boolean => {
          if (!str) return false;
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          return uuidRegex.test(String(str));
        };

        let savedOffer: OfferData;
        if (isValidUUID(updatedOffer.id)) {
          // Update existing offer in Supabase
          savedOffer = await offersService.update(String(updatedOffer.id), updatedOffer);
        } else {
          // Create new offer in Supabase
          const { id, ...offerWithoutId } = updatedOffer;
          savedOffer = await offersService.create(offerWithoutId);
        }
        
        setOffers(prev => prev.map(o => o.id === updatedOffer.id ? savedOffer : o));
        const mappedBooking = mapOfferToBooking(savedOffer);
        setSelectedReservation(mappedBooking);
        setOfferToEdit(savedOffer);
        setIsOfferEditModalOpen(false);
        setIsManageModalOpen(true);
      } catch (error) {
        console.error('Error saving offer update:', error);
        alert('Failed to save offer. Please try again.');
        // Still update local state for UI responsiveness
        setOffers(prev => prev.map(o => o.id === updatedOffer.id ? updatedOffer : o));
        const mappedBooking = mapOfferToBooking(updatedOffer);
        setSelectedReservation(mappedBooking);
        setOfferToEdit(updatedOffer);
        setIsOfferEditModalOpen(false);
        setIsManageModalOpen(true);
      }
  };

  const handleConvertToOffer = async (status: 'Draft' | 'Sent', internalCompany: string, email: string) => {
      if (!selectedReservation) return;
      try {
          const offerToCreate: Omit<OfferData, 'id'> = {
              clientName: selectedReservation.guest,
              propertyId: selectedReservation.roomId, 
              internalCompany: internalCompany,
              price: selectedReservation.totalGross || selectedReservation.price,
              dates: `${selectedReservation.start} to ${selectedReservation.end}`,
              status: status,
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
          
          // Зберегти офер в БД
          const savedOffer = await offersService.create(offerToCreate);
          setOffers(prev => [savedOffer, ...prev]);
          
          // Оновити статус резервації на offer_sent або offer_prepared
          const newStatus = status === 'Sent' ? BookingStatus.OFFER_SENT : BookingStatus.OFFER_PREPARED;
          await updateReservationInDB(selectedReservation.id, { status: newStatus });
          closeManageModals();
          setSalesTab('offers');
      } catch (error) {
          console.error('Error creating offer:', error);
          alert('Failed to save offer to database. Please try again.');
      }
  };
  
  const handleSendOffer = async () => {
      if (!selectedReservation) return;
      
      try {
          // Створити Offer об'єкт з даних резервації (без id для створення нового)
          const offerToCreate: Omit<OfferData, 'id'> = {
              clientName: selectedReservation.guest,
              propertyId: selectedReservation.roomId,
              internalCompany: selectedReservation.internalCompany || 'Sotiso',
              price: selectedReservation.price,
              dates: `${selectedReservation.start} to ${selectedReservation.end}`,
              status: 'Sent',
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
          
          // Зберегти Offer в БД
          const savedOffer = await offersService.create(offerToCreate);
          
          // Додати Offer в масив offers
          setOffers(prev => [savedOffer, ...prev]);
          
          // Оновити статус резервації на offer_sent та колір
          await updateReservationInDB(selectedReservation.id, { 
            status: BookingStatus.OFFER_SENT, 
            color: getBookingStyle(BookingStatus.OFFER_SENT) 
          });
          
          closeManageModals();
          // Переключитись на вкладку Offers
          setSalesTab('offers');
      } catch (error) {
          console.error('Error creating offer:', error);
          alert('Failed to save offer to database. Please try again.');
      }
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
  
  const handleSaveInvoice = async (invoice: InvoiceData) => {
      // #region agent log
      console.log('💾 handleSaveInvoice called with:', { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, bookingId: invoice.bookingId, bookingIdType: typeof invoice.bookingId, offerIdSource: invoice.offerIdSource, offerIdSourceType: typeof invoice.offerIdSource, status: invoice.status });
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2142',message:'handleSaveInvoice called',data:{invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,status:invoice.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // CRITICAL FIX: If bookingId is missing but offerIdSource exists, try to find the reservation
      if (!invoice.bookingId && invoice.offerIdSource) {
          // Try to find reservation by offerIdSource
          const reservationByOfferId = reservations.find(r => {
              // Try exact match
              if (r.id === invoice.offerIdSource) return true;
              // Try string comparison
              if (String(r.id) === String(invoice.offerIdSource)) return true;
              // Try UUID comparison
              const rIdStr = String(r.id);
              const offerIdStr = String(invoice.offerIdSource);
              return rIdStr.toLowerCase() === offerIdStr.toLowerCase();
          });
          
          if (reservationByOfferId) {
              invoice.bookingId = reservationByOfferId.id;
              // #region agent log
              console.log('✅ Found reservation by offerIdSource, setting bookingId:', invoice.bookingId);
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2155',message:'Found reservation by offerIdSource, setting bookingId',data:{bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,offerIdSource:invoice.offerIdSource,reservationId:reservationByOfferId.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
          } else {
              // Try to find reservation by matching offer's propertyId and dates
              const linkedOffer = offers.find(o => {
                  if (o.id === invoice.offerIdSource) return true;
                  if (String(o.id) === String(invoice.offerIdSource)) return true;
                  const oIdStr = String(o.id);
                  const offerIdStr = String(invoice.offerIdSource);
                  return oIdStr.toLowerCase() === offerIdStr.toLowerCase();
              });
              
              if (linkedOffer) {
                  const [offerStart] = linkedOffer.dates.split(' to ');
                  const reservationByPropertyAndDate = reservations.find(r => {
                      if (r.roomId !== linkedOffer.propertyId) return false;
                      return r.start === offerStart || String(r.start) === String(offerStart);
                  });
                  
                  if (reservationByPropertyAndDate) {
                      invoice.bookingId = reservationByPropertyAndDate.id;
                      // #region agent log
                      console.log('✅ Found reservation by property and date, setting bookingId:', invoice.bookingId);
                      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2175',message:'Found reservation by property and date, setting bookingId',data:{bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,offerIdSource:invoice.offerIdSource,reservationId:reservationByPropertyAndDate.id,propertyId:linkedOffer.propertyId,offerStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                      // #endregion
                  }
              }
          }
      }
      
      try {
        // Check if offerIdSource exists and needs to be saved to Supabase
        if (invoice.offerIdSource) {
          const isValidUUID = (str: string | number | undefined): boolean => {
            if (!str) return false;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return uuidRegex.test(String(str));
          };

          // Check if offerIdSource is a valid UUID (exists in database)
          if (!isValidUUID(invoice.offerIdSource)) {
            // Find the offer in local state
            const localOffer = offers.find(o => 
              o.id === invoice.offerIdSource || 
              String(o.id) === String(invoice.offerIdSource)
            );

            if (localOffer) {
              // Save the offer to Supabase
              const { id, ...offerWithoutId } = localOffer;
              const savedOffer = await offersService.create(offerWithoutId);
              
              // Update local offers state
              setOffers(prev => prev.map(o => 
                o.id === localOffer.id ? savedOffer : o
              ));
              
              // Update invoice.offerIdSource with the new UUID
              invoice.offerIdSource = savedOffer.id;
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2174',message:'Saved offer to Supabase and updated invoice.offerIdSource',data:{oldOfferId:localOffer.id,newOfferId:savedOffer.id,newOfferIdType:typeof savedOffer.id,invoiceOfferIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              
              // IMPORTANT: Also update invoice.bookingId if it was pointing to the offer.id
              // This ensures that when invoice is marked as Paid, we can find the booking
              if (!invoice.bookingId || invoice.bookingId === localOffer.id || String(invoice.bookingId) === String(localOffer.id)) {
                // Try to find the actual booking/reservation for this offer
                const relatedReservation = reservations.find(r => {
                  // Check if reservation matches offer by property and dates
                  if (r.roomId !== localOffer.propertyId) return false;
                  const [offerStart] = localOffer.dates.split(' to ');
                  return r.start === offerStart || String(r.start) === String(offerStart);
                });
                
                if (relatedReservation) {
                  invoice.bookingId = relatedReservation.id;
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2187',message:'Found related reservation and updated invoice.bookingId',data:{reservationId:relatedReservation.id,reservationIdType:typeof relatedReservation.id,invoiceBookingId:invoice.bookingId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
                  // #endregion
                }
              }
            } else {
              // Offer not found in local state, set to null to avoid foreign key error
              invoice.offerIdSource = undefined;
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2195',message:'Offer not found in local state, setting offerIdSource to undefined',data:{invoiceOfferIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
            }
          } else {
            // Valid UUID, check if it exists in Supabase
            try {
              const allOffers = await offersService.getAll();
              const offerExists = allOffers.some(o => o.id === invoice.offerIdSource);
              if (!offerExists) {
                // Offer doesn't exist in Supabase, set to null
                invoice.offerIdSource = undefined;
              }
            } catch (error) {
              console.error('Error checking offer existence:', error);
              // On error, set to null to avoid foreign key error
              invoice.offerIdSource = undefined;
            }
          }
        }

        const exists = invoices.some(inv => inv.id === invoice.id);
        let savedInvoice: InvoiceData;
        
        if (exists) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2160',message:'Updating existing invoice in Supabase',data:{invoiceId:invoice.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          savedInvoice = await invoicesService.update(String(invoice.id), invoice);
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2166',message:'Creating new invoice in Supabase',data:{invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Remove id before creating (database will generate UUID)
          const { id, ...invoiceWithoutId } = invoice;
          savedInvoice = await invoicesService.create(invoiceWithoutId);
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2069',message:'Invoice saved to Supabase successfully',data:{invoiceId:savedInvoice.id,invoiceNumber:savedInvoice.invoiceNumber,bookingId:savedInvoice.bookingId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Update local state
        if (exists) {
           setInvoices(prev => prev.map(inv => inv.id === savedInvoice.id ? savedInvoice : inv));
        } else {
           setInvoices(prev => [savedInvoice, ...prev]);
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
            const bookingId = invoice.bookingId;
            const reservation = reservations.find(r => r.id === bookingId || String(r.id) === String(bookingId));
            if (reservation) {
                updateReservationInDB(reservation.id, { 
                    status: BookingStatus.INVOICED, 
                    color: getBookingStyle(BookingStatus.INVOICED) 
                });
            }
        }
        
        setIsInvoiceModalOpen(false);
        setSelectedOfferForInvoice(null);
        setSelectedInvoice(null);
        setActiveDepartment('accounting');
        setAccountingTab('invoices');
      } catch (error: any) {
        // #region agent log
        const errorDetails = error?.message || error?.code || String(error);
        const errorData = error?.details || error?.hint || error;
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2095',message:'Error saving invoice to Supabase',data:{error:errorDetails,errorCode:error?.code,errorMessage:error?.message,errorDetails:errorData,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        console.error('Error saving invoice:', error);
        const errorMessage = error?.message || error?.code || 'Unknown error';
        alert(`Failed to save invoice: ${errorMessage}. Please try again.`);
      }
  };

  const toggleInvoiceStatus = async (invoiceId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2090',message:'toggleInvoiceStatus called',data:{invoiceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2093',message:'Invoice not found in local state',data:{invoiceId,invoiceCount:invoices.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    const newStatus = invoice.status === 'Paid' ? 'Unpaid' : 'Paid';
    // #region agent log
    console.log('🔄 toggleInvoiceStatus called:', { invoiceId, oldStatus: invoice.status, newStatus, bookingId: invoice.bookingId, offerIdSource: invoice.offerIdSource });
    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2286',message:'Toggling invoice status',data:{invoiceId,oldStatus:invoice.status,newStatus,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    try {
      // Update invoice status in Supabase
      const updatedInvoice = await invoicesService.update(invoiceId, { status: newStatus });
      // #region agent log
      console.log('✅ Invoice status updated in Supabase:', { invoiceId, newStatus });
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2292',message:'Invoice status updated in Supabase',data:{invoiceId,newStatus},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Оновити статус інвойсу в локальному стані
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? updatedInvoice : inv));
      
      // CRITICAL FIX: Check if tasks need to be created even if invoice is already Paid
      // If invoice is already Paid, we should still check and create tasks if they don't exist
      const shouldCreateTasks = newStatus === 'Paid' || (invoice.status === 'Paid' && newStatus === 'Unpaid');
      
      if (shouldCreateTasks && newStatus === 'Paid') {
          // Знайти пов'язану резервацію через bookingId або offerIdSource
          let linkedBooking: ReservationData | undefined;
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2110',message:'Looking for linked booking',data:{bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource,reservationsCount:reservations.length,offersCount:offers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          if (invoice.bookingId) {
              // Enhanced booking search - try multiple matching strategies
              linkedBooking = reservations.find(r => {
                // Try exact match
                if (r.id === invoice.bookingId) return true;
                // Try string comparison
                if (String(r.id) === String(invoice.bookingId)) return true;
                // Try UUID comparison (both as strings, case-insensitive)
                const rIdStr = String(r.id);
                const bookingIdStr = String(invoice.bookingId);
                return rIdStr.toLowerCase() === bookingIdStr.toLowerCase();
              });
              
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2284',message:'Searched for booking by bookingId',data:{bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,reservationsCount:reservations.length,reservationIds:reservations.map(r=>({id:r.id,idType:typeof r.id})),found:!!linkedBooking,linkedBookingId:linkedBooking?.id,linkedBookingIdType:typeof linkedBooking?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
              // #endregion
          }
          
          if (!linkedBooking) {
              // Enhanced offer search - try multiple matching strategies
              const linkedOffer = offers.find(o => {
                // Try exact match
                if (o.id === invoice.offerIdSource) return true;
                // Try string comparison
                if (String(o.id) === String(invoice.offerIdSource)) return true;
                // Try UUID comparison (both as strings)
                const oIdStr = String(o.id);
                const offerIdStr = String(invoice.offerIdSource);
                return oIdStr.toLowerCase() === offerIdStr.toLowerCase();
              });
              
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2292',message:'Searched for offer by offerIdSource',data:{offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,offersCount:offers.length,offerIds:offers.map(o=>({id:o.id,idType:typeof o.id})),found:!!linkedOffer,linkedOfferId:linkedOffer?.id,linkedOfferIdType:typeof linkedOffer?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
              // #endregion
              
              if (linkedOffer) {
                  // Конвертувати offer в booking для створення тасок
                  const [start, end] = linkedOffer.dates.split(' to ');
                  
                  // Fix: Use offer.id directly if it's a valid UUID, don't convert to number
                  const isValidUUID = (str: string | number | undefined): boolean => {
                    if (!str) return false;
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    return uuidRegex.test(String(str));
                  };
                  
                  // Use the offer's ID directly (preserve UUID if it's a UUID, or use as-is)
                  const bookingId = isValidUUID(linkedOffer.id) 
                    ? linkedOffer.id 
                    : (typeof linkedOffer.id === 'number' ? linkedOffer.id : String(linkedOffer.id));
                  
                  linkedBooking = {
                      id: bookingId as any, // Allow both UUID and number
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
                  
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2325',message:'Created linkedBooking from offer',data:{linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id,roomId:linkedBooking.roomId,start:linkedBooking.start,end:linkedBooking.end,isUUID:isValidUUID(linkedBooking.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
                  // #endregion
              } else {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2328',message:'Offer not found in local state',data:{offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,offersCount:offers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
                  // #endregion
              }
          }
          
          if (linkedBooking) {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2148',message:'Linked booking found, updating status and creating tasks',data:{linkedBookingId:linkedBooking.id,roomId:linkedBooking.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              // Оновити статус броні на paid та колір
              updateReservationInDB(linkedBooking.id, { 
                  status: BookingStatus.PAID, 
                  color: getBookingStyle(BookingStatus.PAID) 
              });
              
              // Перевірити чи вже існують таски для цього бронювання
              // Enhanced task search - try multiple matching strategies
              const existingTasks = adminEvents.filter(e => {
                if (!e.bookingId) return false;
                // Try exact match
                if (e.bookingId === linkedBooking!.id) return true;
                // Try string comparison
                if (String(e.bookingId) === String(linkedBooking!.id)) return true;
                // Try UUID comparison (both as strings, case-insensitive)
                const eBookingIdStr = String(e.bookingId);
                const linkedBookingIdStr = String(linkedBooking!.id);
                return eBookingIdStr.toLowerCase() === linkedBookingIdStr.toLowerCase();
              });
              
              const hasEinzugTask = existingTasks.some(e => e.type === 'Einzug');
              const hasAuszugTask = existingTasks.some(e => e.type === 'Auszug');
              
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2340',message:'Checking for existing tasks',data:{linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id,adminEventsCount:adminEvents.length,existingTasksCount:existingTasks.length,existingTaskBookingIds:existingTasks.map(t=>({id:t.id,bookingId:t.bookingId,bookingIdType:typeof t.bookingId,type:t.type})),hasEinzugTask,hasAuszugTask},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              
              // Створити Facility tasks тільки якщо вони ще не існують
              if (!hasEinzugTask || !hasAuszugTask) {
                  // Отримати назву нерухомості
                  const property = properties.find(p => p.id === linkedBooking.roomId || String(p.id) === String(linkedBooking.roomId));
                  const propertyName = property?.title || property?.address || linkedBooking.address || linkedBooking.roomId;
                  
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2169',message:'Creating facility tasks',data:{linkedBookingId:linkedBooking.id,propertyName,roomId:linkedBooking.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                  // #endregion
                  
                  const tasks = createFacilityTasksForBooking(linkedBooking, propertyName);
                  
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2357',message:'Created tasks from createFacilityTasksForBooking',data:{totalTasks:tasks.length,tasks:tasks.map(t=>({type:t.type,bookingId:t.bookingId,bookingIdType:typeof t.bookingId,propertyId:t.propertyId,title:t.title})),linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
                  // #endregion
                  
                  // Фільтрувати таски які вже існують
                  const newTasks = tasks.filter(task => 
                      (task.type === 'Einzug' && !hasEinzugTask) ||
                      (task.type === 'Auszug' && !hasAuszugTask)
                  );
                  
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2365',message:'Filtered new tasks to create',data:{totalTasks:tasks.length,newTasksCount:newTasks.length,newTaskTypes:newTasks.map(t=>t.type),newTaskBookingIds:newTasks.map(t=>({type:t.type,bookingId:t.bookingId,bookingIdType:typeof t.bookingId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                  // #endregion
                  
                  // Зберегти завдання в базу даних
                  const savedTasks: CalendarEvent[] = [];
                  for (const task of newTasks) {
                      try {
                          // Створити завдання в базі даних
                          const taskToSave: Omit<CalendarEvent, 'id'> = {
                              ...task,
                              status: 'open' as TaskStatus,
                              department: 'facility',
                              assignee: undefined,
                              assignedWorkerId: undefined,
                              workerId: undefined
                          };
                          const savedTask = await tasksService.create(taskToSave);
                          savedTasks.push(savedTask);
                          // #region agent log
                          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2375',message:'Created Facility task in database',data:{taskId:savedTask.id,taskTitle:savedTask.title,taskType:savedTask.type,bookingId:savedTask.bookingId,bookingIdType:typeof savedTask.bookingId,propertyId:savedTask.propertyId,department:savedTask.department,status:savedTask.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                          // #endregion
                          console.log('✅ Created Facility task in database:', savedTask.id, savedTask.title, 'bookingId:', savedTask.bookingId);
                      } catch (error: any) {
                          // #region agent log
                          console.error('❌ Full error details:', error);
                          console.error('❌ Error message:', error?.message);
                          console.error('❌ Error code:', error?.code);
                          console.error('❌ Error details:', error?.details);
                          console.error('❌ Error hint:', error?.hint);
                          console.error('❌ Task data that failed:', {
                              type: task.type,
                              title: task.title,
                              bookingId: task.bookingId,
                              propertyId: task.propertyId,
                              department: task.department,
                              workerId: task.workerId,
                              date: task.date,
                              status: task.status
                          });
                          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2540',message:'Error creating Facility task in database',data:{error:String(error),errorMessage:error?.message,errorCode:error?.code,errorDetails:error?.details,errorHint:error?.hint,taskType:task.type,taskTitle:task.title,bookingId:task.bookingId,bookingIdType:typeof task.bookingId,propertyId:task.propertyId,propertyIdType:typeof task.propertyId,workerId:task.workerId,date:task.date,status:task.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                          // #endregion
                          console.error('❌ Error creating Facility task in database:', error);
                      }
                  }
                  
                  if (savedTasks.length > 0) {
                      setAdminEvents(prevEvents => [...prevEvents, ...savedTasks]);
                      // Notify other components and reload tasks from database
                      window.dispatchEvent(new CustomEvent('taskUpdated'));
                      // #region agent log
                      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2458',message:'✅ SUCCESS: Tasks created and taskUpdated event dispatched',data:{savedTasksCount:savedTasks.length,taskIds:savedTasks.map(t=>t.id),taskDetails:savedTasks.map(t=>({id:t.id,type:t.type,bookingId:t.bookingId,bookingIdType:typeof t.bookingId,title:t.title,propertyId:t.propertyId,department:t.department})),linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SUCCESS'})}).catch(()=>{});
                      // #endregion
                      console.log('✅ Created and added', savedTasks.length, 'Facility tasks to calendar');
                      console.log('✅ Task details:', savedTasks.map(t => ({ id: t.id, type: t.type, bookingId: t.bookingId, title: t.title })));
                  } else {
                      // #region agent log
                      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2465',message:'⚠️ WARNING: No tasks were created',data:{hasEinzugTask,hasAuszugTask,newTasksCount:newTasks.length,linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id,totalTasksFromFunction:tasks.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                      // #endregion
                      console.warn('⚠️ No tasks were created. Check if tasks already exist or if there was an error.');
                      console.warn('hasEinzugTask:', hasEinzugTask, 'hasAuszugTask:', hasAuszugTask, 'newTasksCount:', newTasks.length);
                  }
              } else {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2211',message:'Tasks already exist, skipping creation',data:{hasEinzugTask,hasAuszugTask},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                  // #endregion
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
          } else {
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2430',message:'❌ CRITICAL: No linked booking found - tasks will NOT be created',data:{bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,reservationsCount:reservations.length,offersCount:offers.length,reservationIds:reservations.map(r=>({id:r.id,idType:typeof r.id})),offerIds:offers.map(o=>({id:o.id,idType:typeof o.id})),invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'CRITICAL'})}).catch(()=>{});
              // #endregion
              console.error('❌ CRITICAL: No linked booking found for invoice:', invoice.invoiceNumber, 'bookingId:', invoice.bookingId, 'offerIdSource:', invoice.offerIdSource);
              console.error('Available reservations:', reservations.map(r => ({ id: r.id, idType: typeof r.id })));
              console.error('Available offers:', offers.map(o => ({ id: o.id, idType: typeof o.id })));
          }
      } else {
          // Якщо статус змінюється на Unpaid, повернути статус броні на invoiced та колір
          if (invoice.bookingId) {
              const bookingId = invoice.bookingId;
              const reservation = reservations.find(r => r.id === bookingId || String(r.id) === String(bookingId));
              if (reservation) {
                  updateReservationInDB(reservation.id, { 
                      status: BookingStatus.INVOICED, 
                      color: getBookingStyle(BookingStatus.INVOICED) 
                  });
              }
          }
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2238',message:'Error updating invoice status in Supabase',data:{error:String(error),invoiceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      console.error('Error updating invoice status:', error);
      alert('Failed to update invoice status. Please try again.');
    }
  };

  const handleAdminEventAdd = (event: CalendarEvent) => {
      setAdminEvents(prev => [...prev, event]);
  };

  const handleAdminEventUpdate = async (updatedEvent: CalendarEvent) => {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2655',message:'H1-H5: handleAdminEventUpdate ENTRY',data:{taskId:updatedEvent.id,taskType:updatedEvent.type,bookingId:updatedEvent.bookingId,workerId:updatedEvent.workerId,date:updatedEvent.date,day:updatedEvent.day,status:updatedEvent.status,adminEventsCount:adminEvents.length,existingTaskInState:adminEvents.find(e=>e.id===updatedEvent.id)?true:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      
      // #region agent log
      const taskBeforeUpdate = adminEvents.find(e => e.id === updatedEvent.id);
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2660',message:'H2: Task state BEFORE local update',data:{taskId:updatedEvent.id,dateBefore:taskBeforeUpdate?.date,dayBefore:taskBeforeUpdate?.day,workerIdBefore:taskBeforeUpdate?.workerId,dateAfter:updatedEvent.date,dayAfter:updatedEvent.day,workerIdAfter:updatedEvent.workerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      
      // CRITICAL: Update local state FIRST to prevent task disappearing from calendar
      // This ensures the task remains visible immediately, even before DB update completes
      setAdminEvents(prev => {
        // #region agent log
        const prevCount = prev.length;
        const taskExists = prev.find(e => e.id === updatedEvent.id);
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2667',message:'H1: BEFORE setAdminEvents local update',data:{prevCount,taskExists:!!taskExists,taskId:updatedEvent.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        const updated = prev.map(ev => {
          // Only update the exact task that was changed
          if (ev.id === updatedEvent.id) {
            return updatedEvent;
          }
          // Do NOT modify other tasks, even if they have the same bookingId
          return ev;
        });
        
        // #region agent log
        const afterCount = updated.length;
        const taskAfterUpdate = updated.find(e => e.id === updatedEvent.id);
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2674',message:'H1: AFTER setAdminEvents local update',data:{afterCount,taskAfterUpdate:!!taskAfterUpdate,taskId:updatedEvent.id,date:taskAfterUpdate?.date,day:taskAfterUpdate?.day},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        
        return updated;
      });
      
      try {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2676',message:'H3: BEFORE DB update',data:{taskId:updatedEvent.id,date:updatedEvent.date,day:updatedEvent.day,workerId:updatedEvent.workerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          
          // Update in database
          const savedTask = await tasksService.update(updatedEvent.id, updatedEvent);
          console.log('✅ Task updated in database:', updatedEvent.id);
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2678',message:'H3: AFTER DB update',data:{taskId:savedTask.id,dateFromDB:savedTask.date,dayFromDB:savedTask.day,workerIdFromDB:savedTask.workerId,dateBeforeUpdate:updatedEvent.date,dayBeforeUpdate:updatedEvent.day},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2681',message:'H1: Dispatching taskUpdated event',data:{taskId:updatedEvent.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
          // #endregion
          
          // Notify other components (Kanban) about task update
          // NOTE: We do NOT reload tasks here to prevent race condition
          // The local state is already updated above, and Kanban will reload on its own
          window.dispatchEvent(new CustomEvent('taskUpdated'));
      } catch (error: any) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2690',message:'H3: ERROR in DB update',data:{taskId:updatedEvent.id,error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          console.error('❌ Error updating task in database:', error);
          // Revert local state if DB update fails (optional - you may want to keep optimistic update)
          // For now, we keep the optimistic update for better UX
      }
      
      // Оновити статус броні якщо таска верифікована та пов'язана з бронюванням
      if (updatedEvent.status === 'verified' && updatedEvent.bookingId) {
          const newBookingStatus = updateBookingStatusFromTask(updatedEvent);
          if (newBookingStatus) {
              const bookingId = updatedEvent.bookingId;
              const reservation = reservations.find(r => r.id === bookingId || String(r.id) === String(bookingId));
              if (reservation) {
                  updateReservationInDB(reservation.id, { status: newBookingStatus });
              }
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

  // Get unit of measurement for meter type
  const getMeterUnit = (type: string): string => {
    const nameLower = type.toLowerCase();
    if (nameLower === 'electricity' || nameLower.includes('electric') || nameLower.includes('електро') || nameLower.includes('strom')) {
      return 'kWh';
    } else if (nameLower === 'gas' || nameLower.includes('газ')) {
      return 'm³';
    } else if (nameLower === 'water' || nameLower.includes('вода') || nameLower.includes('wasser')) {
      return 'm³';
    } else if (nameLower === 'heating' || nameLower.includes('heizung') || nameLower.includes('опалення')) {
      return 'kJ';
    }
    return '';
  };

  // Group meter readings by rental periods for accordion display
  const groupMeterReadingsByRental = (
    meterLog: MeterLogEntry[] = [], 
    reservations: ReservationData[] = []
  ) => {
    const groups: Array<{
      id: string;
      title: string;
      type: 'initial' | 'rental';
      checkInDate?: string;
      checkOutDate?: string;
      tenantName?: string;
      checkInReadings?: { electricity: string; water: string; gas: string };
      checkOutReadings?: { electricity: string; water: string; gas: string };
      usedAmount?: { electricity: string; water: string; gas: string };
      status: 'complete' | 'pending';
    }> = [];
    
    // Initial запис
    const initial = meterLog.find(e => e.type === 'Initial');
    if (initial) {
      groups.push({
        id: 'initial',
        title: 'Початкові показники',
        type: 'initial',
        checkInReadings: initial.readings,
        status: 'complete'
      });
    }
    
    // Групувати Check-In/Check-Out по bookingId
    const checkIns = meterLog.filter(e => e.type === 'Check-In' && e.bookingId);
    checkIns.forEach(checkIn => {
      const checkOut = meterLog.find(
        e => e.type === 'Check-Out' && e.bookingId === checkIn.bookingId
      );
      const booking = reservations.find(
        r => r.id === checkIn.bookingId || String(r.id) === String(checkIn.bookingId)
      );
      
      const tenantName = booking?.guest || booking?.firstName || 'Unknown Tenant';
      const checkInDate = checkIn.date;
      const checkOutDate = checkOut?.date;
      
      // Calculate usage
      const calculateUsage = (inVal: string, outVal: string): string => {
        if (!checkOut || inVal === 'Pending' || outVal === 'Pending') return '-';
        const checkInValue = parseFloat(inVal);
        const checkOutValue = parseFloat(outVal);
        if (isNaN(checkInValue) || isNaN(checkOutValue)) return '-';
        return (checkOutValue - checkInValue).toFixed(2);
      };
      
      groups.push({
        id: `rental-${checkIn.bookingId}`,
        title: `${tenantName} (${checkInDate}${checkOutDate ? ` - ${checkOutDate}` : ' - Ongoing'})`,
        type: 'rental',
        checkInDate,
        checkOutDate,
        tenantName,
        checkInReadings: checkIn.readings,
        checkOutReadings: checkOut?.readings || { electricity: 'Pending', water: 'Pending', gas: 'Pending' },
        usedAmount: {
          electricity: calculateUsage(checkIn.readings.electricity, checkOut?.readings.electricity || ''),
          water: calculateUsage(checkIn.readings.water, checkOut?.readings.water || ''),
          gas: calculateUsage(checkIn.readings.gas, checkOut?.readings.gas || '')
        },
        status: checkOut && 
          checkIn.readings.electricity !== 'Pending' && 
          checkOut.readings.electricity !== 'Pending' 
          ? 'complete' : 'pending'
      });
    });
    
    return groups;
  };

  const renderPropertiesContent = () => {
    const selectedProperty = properties.find(p => p.id === selectedPropertyId) || properties[0];
    
    // #region agent log
    if (selectedProperty) {
      fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1931',message:'selectedProperty used for rendering',data:{propertyId:selectedProperty.id,propertyTitle:selectedProperty.title,inventoryCount:selectedProperty.inventory?.length||0,inventoryItems:selectedProperty.inventory?.slice(0,5).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type,sku:i.sku})),isFromMock:selectedProperty.id === '1' && selectedProperty.title === 'Apartment 1, Lviv'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    }
    // #endregion
    
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
                  <p className="text-xs text-gray-500 truncate mb-2">{prop.address}</p>
                  
                  {/* Characteristics */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400">
                     {prop.details?.area && (
                        <span>Площа: <span className="text-gray-300 font-medium">{prop.details.area} м²</span></span>
                     )}
                     {(prop.details?.rooms || prop.details?.beds) && (
                        <span>Кімнати/Ліжка: <span className="text-gray-300 font-medium">{prop.details.rooms || 0}/{prop.details.beds || 0}</span></span>
                     )}
                  </div>
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
                    <button 
                      onClick={() => {
                        setPropertyToEdit(selectedProperty);
                        setIsPropertyAddModalOpen(true);
                      }}
                      className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                      <Edit className="w-4 h-4 mr-1 inline" /> Редагувати
                    </button>
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
                        <div><span className="text-gray-500 text-xs block">Ванні/Балкони</span><span className="text-white font-bold">{selectedProperty.details.baths || 0} / {selectedProperty.details.balconies || 0}</span></div>
                        <div><span className="text-gray-500 text-xs block">Тип Будівлі</span><span className="text-white font-bold">{selectedProperty.building.type}</span></div>
                        {selectedProperty.details?.year && selectedProperty.details.year > 0 && (
                            <div><span className="text-gray-500 text-xs block">Рік</span><span className="text-white font-bold">{selectedProperty.details.year}</span></div>
                        )}
                        {selectedProperty.building?.repairYear && selectedProperty.building.repairYear > 0 && (
                            <div><span className="text-gray-500 text-xs block">Ремонт</span><span className="text-white font-bold">{selectedProperty.building.repairYear}</span></div>
                        )}
                        <div><span className="text-gray-500 text-xs block">Опалення</span><span className="text-white font-bold">{selectedProperty.building.heating}</span></div>
                        <div><span className="text-gray-500 text-xs block">Центр. Опалення</span><span className="text-white font-bold">{selectedProperty.building.centralHeating}</span></div>
                        <div><span className="text-gray-500 text-xs block">Паркування</span><span className="text-white font-bold">{selectedProperty.building.parking}</span></div>
                        {selectedProperty.building?.elevator && (
                            <div><span className="text-gray-500 text-xs block">Ліфт</span><span className="text-white font-bold">{selectedProperty.building.elevator}</span></div>
                        )}
                        {selectedProperty.building?.pets && (
                            <div><span className="text-gray-500 text-xs block">Тварини</span><span className="text-white font-bold">{selectedProperty.building.pets}</span></div>
                        )}
                        {selectedProperty.building?.access && (
                            <div><span className="text-gray-500 text-xs block">Доступ</span><span className="text-white font-bold">{selectedProperty.building.access}</span></div>
                        )}
                        {selectedProperty.building?.kitchen && (
                            <div><span className="text-gray-500 text-xs block">Кухня</span><span className="text-white font-bold">{selectedProperty.building.kitchen}</span></div>
                        )}
                        {selectedProperty.building?.certificate && (
                            <div><span className="text-gray-500 text-xs block">Сертифікат</span><span className="text-white font-bold">{selectedProperty.building.certificate}</span></div>
                        )}
                        <div><span className="text-gray-500 text-xs block">Енергоклас</span><span className="text-white font-bold">{selectedProperty.building.energyClass}</span></div>
                        {selectedProperty.building?.energyDemand && (
                            <div><span className="text-gray-500 text-xs block">Попит</span><span className="text-white font-bold">{selectedProperty.building.energyDemand}</span></div>
                        )}
                    </div>
                </div>
            </section>

            {/* Rent & Owner Expenses */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">RENT & OWNER EXPENSES</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Mortgage (KM)</label>
                        <div className="bg-[#111315] border border-gray-700 rounded p-3 text-lg font-bold text-white">
                            {selectedProperty.ownerExpense?.mortgage || 0}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Management (BK)</label>
                        <div className="bg-[#111315] border border-gray-700 rounded p-3 text-lg font-bold text-white">
                            {selectedProperty.ownerExpense?.management || 0}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Tax/Ins (HK)</label>
                        <div className="bg-[#111315] border border-gray-700 rounded p-3 text-lg font-bold text-white">
                            {selectedProperty.ownerExpense?.taxIns || 0}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Reserve</label>
                        <div className="bg-[#111315] border border-gray-700 rounded p-3 text-lg font-bold text-white">
                            {selectedProperty.ownerExpense?.reserve || 0}
                        </div>
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
                                <th className="p-3 font-bold text-xs uppercase">Магазин</th>
                                {isInventoryEditing && (
                                  <th className="p-3 font-bold text-xs uppercase text-center">Дії</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {selectedProperty.inventory.map((item: any, idx: number) => {
                              // #region agent log
                              if (idx === 0) {
                                fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2075',message:'Rendering property inventory',data:{propertyId:selectedProperty.id,propertyTitle:selectedProperty.title,totalInventoryCount:selectedProperty.inventory.length,firstItem:{itemId:item.itemId,invNumber:item.invNumber,name:item.name,type:item.type,sku:item.sku}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                              }
                              // #endregion
                              
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
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                        value={item.vendor || ''}
                                        onChange={(e) =>
                                          handleUpdateInventoryItem(idx, 'vendor', e.target.value)
                                        }
                                        placeholder="Магазин"
                                      />
                                    ) : (
                                      item.vendor || '-'
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

            {/* Meter Readings (History Log) - Accordion */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <h2 className="text-xl font-bold text-white mb-4">Показання Лічильників (Історія)</h2>
                <div className="space-y-2">
                    {(() => {
                        const meterLog = selectedProperty.meterLog || [];
                        const groups = groupMeterReadingsByRental(meterLog, reservations);
                        
                        if (groups.length === 0) {
                            return (
                                <div className="p-8 text-center text-gray-500 text-sm border border-gray-700 rounded-lg">
                                    Історія показників пуста.
                                </div>
                            );
                        }
                        
                        return groups.map((group) => (
                            <div key={group.id} className="border border-gray-700/50 rounded overflow-hidden bg-[#16181D]">
                                <button
                                    onClick={() => {
                                        const newExpanded = new Set(expandedMeterGroups);
                                        if (newExpanded.has(group.id)) {
                                            newExpanded.delete(group.id);
                                        } else {
                                            newExpanded.add(group.id);
                                        }
                                        setExpandedMeterGroups(newExpanded);
                                    }}
                                    className="w-full p-2 flex justify-between items-center hover:bg-[#1C1F24] transition-colors"
                                >
                                    <div className="flex items-center gap-2 flex-1">
                                        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${expandedMeterGroups.has(group.id) ? 'rotate-180' : ''}`} />
                                        <span className="font-medium text-gray-300 text-sm">{group.title}</span>
                                        {group.type === 'rental' && (
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                group.status === 'complete' 
                                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                    : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                            }`}>
                                                {group.status === 'complete' ? 'Завершено' : 'Очікується'}
                                            </span>
                                        )}
                                    </div>
                                </button>
                                
                                {expandedMeterGroups.has(group.id) && (
                                    <div className="p-2 border-t border-gray-700 bg-[#0D1117]">
                                        {group.type === 'initial' ? (
                                            // Initial readings display - show all meterReadings in compact table
                                            <div className="space-y-1">
                                                {selectedProperty.meterReadings && selectedProperty.meterReadings.length > 0 ? (
                                                    <div className="overflow-hidden border border-gray-700 rounded">
                                                        <table className="w-full text-xs">
                                                            <thead className="bg-[#16181D] border-b border-gray-700">
                                                                <tr>
                                                                    <th className="p-1.5 text-left text-[10px] font-bold text-gray-400 uppercase">Тип</th>
                                                                    <th className="p-1.5 text-left text-[10px] font-bold text-gray-400 uppercase">Номер</th>
                                                                    <th className="p-1.5 text-right text-[10px] font-bold text-gray-400 uppercase">Початкове</th>
                                                                    <th className="p-1.5 text-right text-[10px] font-bold text-gray-400 uppercase">Кінцеве</th>
                                                                    <th className="p-1.5 text-right text-[10px] font-bold text-gray-400 uppercase">Спожито</th>
                                                                    <th className="p-1.5 text-right text-[10px] font-bold text-gray-400 uppercase">Ціна</th>
                                                                    <th className="p-1.5 text-right text-[10px] font-bold text-gray-400 uppercase">Сума</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-700/50">
                                                                {selectedProperty.meterReadings.map((meter, idx) => {
                                                                    const nameLower = meter.name.toLowerCase();
                                                                    let icon = <Flame className="w-3 h-3 text-orange-500" />;
                                                                    if (nameLower === 'electricity' || nameLower.includes('electric') || nameLower.includes('електро') || nameLower.includes('strom')) {
                                                                        icon = <Zap className="w-3 h-3 text-yellow-500" />;
                                                                    } else if (nameLower === 'water' || nameLower.includes('вода') || nameLower.includes('wasser')) {
                                                                        icon = <Droplet className="w-3 h-3 text-blue-500" />;
                                                                    } else if (nameLower === 'gas' || nameLower.includes('газ')) {
                                                                        icon = <Flame className="w-3 h-3 text-orange-500" />;
                                                                    } else if (nameLower === 'heating' || nameLower.includes('heizung') || nameLower.includes('опалення')) {
                                                                        icon = <Flame className="w-3 h-3 text-orange-500" />;
                                                                    }
                                                                    
                                                                    const initial = parseFloat(meter.initial || '0');
                                                                    const current = parseFloat(meter.current || meter.initial || '0');
                                                                    const consumed = current - initial;
                                                                    const price = meter.price || 0;
                                                                    const total = consumed * price;
                                                                    const unit = getMeterUnit(meter.name);
                                                                    
                                                                    const handlePriceChange = async (newPrice: number) => {
                                                                        const updatedMeterReadings = selectedProperty.meterReadings?.map((m, i) => 
                                                                            i === idx ? { ...m, price: newPrice } : m
                                                                        ) || [];
                                                                        
                                                                        try {
                                                                            const updatedProperty = await propertiesService.update(selectedProperty.id, {
                                                                                meterReadings: updatedMeterReadings
                                                                            });
                                                                            setProperties(prev => prev.map(p => p.id === updatedProperty.id ? updatedProperty : p));
                                                                        } catch (error) {
                                                                            console.error('Error updating meter price:', error);
                                                                        }
                                                                    };
                                                                    
                                                                    return (
                                                                        <tr key={idx} className="hover:bg-[#16181D]">
                                                                            <td className="p-1.5">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    {icon}
                                                                                    <span className="text-white text-xs">{meter.name}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-1.5">
                                                                                <span className="text-gray-300 font-mono text-[10px]">{meter.number || '-'}</span>
                                                                            </td>
                                                                            <td className="p-1.5 text-right">
                                                                                <span className="text-white font-mono text-xs font-semibold">{meter.initial || '-'}</span>
                                                                            </td>
                                                                            <td className="p-1.5 text-right">
                                                                                <span className="text-white font-mono text-xs font-semibold">{meter.current || meter.initial || '-'}</span>
                                                                            </td>
                                                                            <td className="p-1.5 text-right">
                                                                                <span className="text-gray-300 font-mono text-xs">{isNaN(consumed) ? '-' : consumed.toFixed(2)}</span>
                                                                            </td>
                                                                            <td className="p-1.5 text-right">
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    <input
                                                                                        type="number"
                                                                                        step="0.01"
                                                                                        className="bg-transparent border-b border-gray-700 w-16 text-right text-white text-xs outline-none focus:border-emerald-500"
                                                                                        value={price || ''}
                                                                                        onChange={(e) => handlePriceChange(parseFloat(e.target.value) || 0)}
                                                                                        placeholder="0.00"
                                                                                    />
                                                                                    <span className="text-gray-500 text-[10px]">{unit}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-1.5 text-right">
                                                                                <span className="text-emerald-400 font-mono text-xs font-bold">
                                                                                    {isNaN(total) || total <= 0 ? '-' : `€${total.toFixed(2)}`}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    // Fallback to meterLog if meterReadings not available
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                        <div className="flex items-center gap-2">
                                                            <Zap className="w-4 h-4 text-yellow-500" />
                                                            <span className="text-xs text-gray-400">Electricity:</span>
                                                            <span className="text-white font-mono font-bold">{group.checkInReadings?.electricity || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Droplet className="w-4 h-4 text-blue-500" />
                                                            <span className="text-xs text-gray-400">Water:</span>
                                                            <span className="text-white font-mono font-bold">{group.checkInReadings?.water || '-'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Flame className="w-4 h-4 text-orange-500" />
                                                            <span className="text-xs text-gray-400">Gas:</span>
                                                            <span className="text-white font-mono font-bold">{group.checkInReadings?.gas || '-'}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            // Rental period display
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {/* Check-In */}
                                                    <div>
                                                        <div className="text-sm font-semibold text-emerald-400 mb-2">Check-In ({group.checkInDate})</div>
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <Zap className="w-3 h-3 text-yellow-500" />
                                                                <span className="text-xs text-gray-400">Electricity:</span>
                                                                <span className="text-white font-mono text-sm">{group.checkInReadings?.electricity || '-'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Droplet className="w-3 h-3 text-blue-500" />
                                                                <span className="text-xs text-gray-400">Water:</span>
                                                                <span className="text-white font-mono text-sm">{group.checkInReadings?.water || '-'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Flame className="w-3 h-3 text-orange-500" />
                                                                <span className="text-xs text-gray-400">Gas:</span>
                                                                <span className="text-white font-mono text-sm">{group.checkInReadings?.gas || '-'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Check-Out */}
                                                    <div>
                                                        <div className="text-sm font-semibold text-red-400 mb-2">
                                                            Check-Out {group.checkOutDate ? `(${group.checkOutDate})` : '(Ongoing)'}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <Zap className="w-3 h-3 text-yellow-500" />
                                                                <span className="text-xs text-gray-400">Electricity:</span>
                                                                <span className="text-white font-mono text-sm">{group.checkOutReadings?.electricity || '-'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Droplet className="w-3 h-3 text-blue-500" />
                                                                <span className="text-xs text-gray-400">Water:</span>
                                                                <span className="text-white font-mono text-sm">{group.checkOutReadings?.water || '-'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Flame className="w-3 h-3 text-orange-500" />
                                                                <span className="text-xs text-gray-400">Gas:</span>
                                                                <span className="text-white font-mono text-sm">{group.checkOutReadings?.gas || '-'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Used Amount */}
                                                {group.usedAmount && (
                                                    <div className="pt-4 border-t border-gray-700">
                                                        <div className="text-sm font-semibold text-emerald-400 mb-2">Використано</div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <div className="flex items-center gap-2">
                                                                <Zap className="w-3 h-3 text-yellow-500" />
                                                                <span className="text-xs text-gray-400">Electricity:</span>
                                                                <span className="text-emerald-400 font-mono font-bold">{group.usedAmount.electricity}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Droplet className="w-3 h-3 text-blue-500" />
                                                                <span className="text-xs text-gray-400">Water:</span>
                                                                <span className="text-emerald-400 font-mono font-bold">{group.usedAmount.water}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Flame className="w-3 h-3 text-orange-500" />
                                                                <span className="text-xs text-gray-400">Gas:</span>
                                                                <span className="text-emerald-400 font-mono font-bold">{group.usedAmount.gas}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ));
                    })()}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[400px]">
                    <div className="border border-gray-700 rounded-lg bg-[#16181D] p-4 overflow-y-auto">
                        <h4 className="text-sm font-bold text-white mb-2 border-b border-gray-700 pb-2">Навігація</h4>
                        <ul className="space-y-1 text-sm text-gray-400">
                            <li 
                                onClick={() => setSelectedDocumentFolder('Договори')}
                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                                    selectedDocumentFolder === 'Договори' 
                                        ? 'bg-[#1C1F24] text-emerald-500 font-bold' 
                                        : 'hover:bg-[#1C1F24]'
                                }`}
                            >
                                <FolderOpen className="w-4 h-4"/> Договори (3)
                            </li>
                            <li 
                                onClick={() => setSelectedDocumentFolder('Актуальний')}
                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ml-4 ${
                                    selectedDocumentFolder === 'Актуальний' 
                                        ? 'bg-[#1C1F24] text-emerald-500 font-bold' 
                                        : 'hover:bg-[#1C1F24]'
                                }`}
                            >
                                <Folder className="w-4 h-4 text-yellow-500"/> Актуальний (1)
                            </li>
                            <li 
                                onClick={() => setSelectedDocumentFolder('Рахунки')}
                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                                    selectedDocumentFolder === 'Рахунки' 
                                        ? 'bg-[#1C1F24] text-emerald-500 font-bold' 
                                        : 'hover:bg-[#1C1F24]'
                                }`}
                            >
                                <Folder className="w-4 h-4 text-yellow-500"/> Рахунки (15)
                            </li>
                            
                            {/* Einzug Folder */}
                            {einzugAuszugTasks.filter(t => t.type === 'Einzug').length > 0 && (
                                <li className="mt-2">
                                    <div className="flex items-center gap-2 p-1.5 text-emerald-500 font-bold">
                                        <FolderOpen className="w-4 h-4"/> Einzug ({einzugAuszugTasks.filter(t => t.type === 'Einzug').length})
                                    </div>
                                    <ul className="ml-4 space-y-1 mt-1">
                                        {einzugAuszugTasks
                                            .filter(t => t.type === 'Einzug')
                                            .map(task => {
                                                const date = task.date ? (() => {
                                                    const d = new Date(task.date);
                                                    const day = d.getDate().toString().padStart(2, '0');
                                                    const month = (d.getMonth() + 1).toString().padStart(2, '0');
                                                    const year = d.getFullYear();
                                                    return `${day}.${month}.${year}`;
                                                })() : '';
                                                // Get company name from booking or property
                                                const folderName = task.bookingId 
                                                    ? `${date} - ${task.title.split(' - ')[1] || 'Unknown'}`
                                                    : `${date} - ${selectedProperty?.address || 'Unknown'}`;
                                                
                                                return (
                                                    <li
                                                        key={task.id}
                                                        onClick={() => setSelectedDocumentFolder(`Einzug-${task.id}`)}
                                                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                                                            selectedDocumentFolder === `Einzug-${task.id}`
                                                                ? 'bg-[#1C1F24] text-emerald-400 font-bold'
                                                                : 'hover:bg-[#1C1F24] text-gray-400'
                                                        }`}
                                                    >
                                                        <Folder className="w-3 h-3 text-yellow-500"/> {folderName}
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                </li>
                            )}

                            {/* Auszug Folder */}
                            {einzugAuszugTasks.filter(t => t.type === 'Auszug').length > 0 && (
                                <li className="mt-2">
                                    <div className="flex items-center gap-2 p-1.5 text-emerald-500 font-bold">
                                        <FolderOpen className="w-4 h-4"/> Auszug ({einzugAuszugTasks.filter(t => t.type === 'Auszug').length})
                                    </div>
                                    <ul className="ml-4 space-y-1 mt-1">
                                        {einzugAuszugTasks
                                            .filter(t => t.type === 'Auszug')
                                            .map(task => {
                                                const date = task.date ? (() => {
                                                    const d = new Date(task.date);
                                                    const day = d.getDate().toString().padStart(2, '0');
                                                    const month = (d.getMonth() + 1).toString().padStart(2, '0');
                                                    const year = d.getFullYear();
                                                    return `${day}.${month}.${year}`;
                                                })() : '';
                                                const folderName = task.bookingId 
                                                    ? `${date} - ${task.title.split(' - ')[1] || 'Unknown'}`
                                                    : `${date} - ${selectedProperty?.address || 'Unknown'}`;
                                                
                                                return (
                                                    <li
                                                        key={task.id}
                                                        onClick={() => setSelectedDocumentFolder(`Auszug-${task.id}`)}
                                                        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                                                            selectedDocumentFolder === `Auszug-${task.id}`
                                                                ? 'bg-[#1C1F24] text-emerald-400 font-bold'
                                                                : 'hover:bg-[#1C1F24] text-gray-400'
                                                        }`}
                                                    >
                                                        <Folder className="w-3 h-3 text-yellow-500"/> {folderName}
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                </li>
                            )}
                        </ul>
                    </div>
                    <div className="border border-gray-700 rounded-lg bg-[#16181D] p-4 overflow-y-auto">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                            <h4 className="text-sm font-bold text-white">
                                {selectedDocumentFolder.startsWith('Einzug-') || selectedDocumentFolder.startsWith('Auszug-') 
                                    ? `Файли в "${selectedDocumentFolder.split('-')[0]}"`
                                    : `Файли в "${selectedDocumentFolder}"`}
                            </h4>
                            <button className="text-emerald-500 hover:text-emerald-400"><Upload className="w-4 h-4"/></button>
                        </div>
                        <ul className="space-y-2 text-sm">
                            {(selectedDocumentFolder.startsWith('Einzug-') || selectedDocumentFolder.startsWith('Auszug-')) ? (
                                (() => {
                                    const taskId = selectedDocumentFolder.split('-')[1];
                                    const task = einzugAuszugTasks.find(t => t.id === taskId);
                                    if (!task || !task.workflowSteps) {
                                        return <li className="text-gray-500 text-center py-4">Немає файлів</li>;
                                    }
                                    
                                    // Collect all files from workflow steps
                                    const allFiles: Array<{url: string; step: number; stepName: string; isVideo: boolean}> = [];
                                    task.workflowSteps.forEach(step => {
                                        step.photos.forEach(url => allFiles.push({url, step: step.stepNumber, stepName: step.stepName, isVideo: false}));
                                        step.videos.forEach(url => allFiles.push({url, step: step.stepNumber, stepName: step.stepName, isVideo: true}));
                                    });

                                    if (allFiles.length === 0) {
                                        return <li className="text-gray-500 text-center py-4">Немає файлів</li>;
                                    }

                                    return allFiles.map((file, idx) => (
                                        <li key={idx} className="flex justify-between items-center p-2 bg-[#1C1F24] rounded border border-gray-700 hover:bg-[#23262b] transition-colors">
                                            <a 
                                                href={file.url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 text-white hover:text-emerald-400 transition-colors"
                                            >
                                                {file.isVideo ? (
                                                    <Video className="w-4 h-4 text-blue-500" />
                                                ) : (
                                                    <FileIcon className="w-4 h-4 text-red-500" />
                                                )}
                                                <span className="text-xs">Крок {file.step}: {file.stepName}</span>
                                            </a>
                                        </li>
                                    ));
                                })()
                            ) : (
                                <>
                                    <li className="flex justify-between items-center p-2 bg-[#1C1F24] rounded border border-gray-700">
                                        <span className="flex items-center gap-2 text-white"><FileIcon className="w-4 h-4 text-red-500"/> Договір_Іванов.pdf</span>
                                        <span className="text-xs text-gray-500">1.2 MB</span>
                                    </li>
                                    <li className="flex justify-between items-center p-2 hover:bg-[#1C1F24] rounded transition-colors">
                                        <span className="flex items-center gap-2 text-gray-300"><FileIcon className="w-4 h-4 text-red-500"/> Акт_Прийому.pdf</span>
                                        <span className="text-xs text-gray-500">0.8 MB</span>
                                    </li>
                                </>
                            )}
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
          onUpdateBookingStatus={async (bookingId, newStatus) => {
            const reservation = reservations.find(r => r.id === bookingId || String(r.id) === String(bookingId));
            if (reservation) {
              await updateReservationInDB(reservation.id, { status: newStatus });
            }
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
                          <th className="px-3 py-2 text-left border-b border-gray-700">Магазин</th>
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
                              <td className="px-3 py-2 text-gray-400">{row.vendor || '-'}</td>
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
                      setUploadedInventoryFile(null);
                      setUploadedInventoryFileName(null);
                      if (uploadedInventoryPreviewUrl) {
                        URL.revokeObjectURL(uploadedInventoryPreviewUrl);
                        setUploadedInventoryPreviewUrl(null);
                      }
                      setOcrInventoryRows([]);
                      setOcrInvoiceNumber('');
                      setOcrPurchaseDate('');
                      setOcrVendor('');
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
                                <th className="p-4">Booking No.</th>
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
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-300 font-mono text-sm">
                                                {res.bookingNo || '—'}
                                            </span>
                                            {res.bookingNo && (
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(res.bookingNo || '');
                                                        // Optional: show toast notification
                                                    }}
                                                    className="text-gray-500 hover:text-white transition-colors"
                                                    title="Copy booking number"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </td>
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Building2 className="w-6 h-6 text-emerald-500" /> HeroRooms</h1>
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
                <button 
                  onClick={() => { setActiveDepartment('accounting'); setAccountingTab('dashboard'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'accounting' && accountingTab === 'dashboard'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Dashboard
                </button>
                <button 
                  onClick={() => { setActiveDepartment('accounting'); setAccountingTab('invoices'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'accounting' && accountingTab === 'invoices'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Invoices
                </button>
                <button 
                  onClick={() => { setActiveDepartment('accounting'); setAccountingTab('banking'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'accounting' && accountingTab === 'banking'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Banking
                </button>
                <button 
                  onClick={() => { setActiveDepartment('accounting'); setAccountingTab('calendar'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'accounting' && accountingTab === 'calendar'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Calendar
                </button>
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
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('leads'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'leads'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Leads
                </button>
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('calendar'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'calendar'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Rent Calendar
                </button>
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('offers'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'offers'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Offers
                </button>
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('reservations'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'reservations'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Reservations
                </button>
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('requests'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'requests'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Requests
                </button>
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('chat'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'chat'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Chat
                </button>
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('history'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'history'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  History
                </button>
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
      <div className="w-full max-w-6xl h-[90vh] max-h-[95vh] bg-[#020617] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
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
                  setUploadedInventoryFile(null);
                  setUploadedInventoryFileName(null);
                  if (uploadedInventoryPreviewUrl) {
                    URL.revokeObjectURL(uploadedInventoryPreviewUrl);
                    setUploadedInventoryPreviewUrl(null);
                  }
                  setOcrInvoiceNumber('');
                  setOcrPurchaseDate('');
                  setOcrVendor('');
                }}
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 flex-1 flex flex-col overflow-hidden space-y-4 text-xs text-gray-100">
              {transferError && (
                <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">
                  {transferError}
                </div>
              )}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[3fr,4fr] gap-4 items-stretch min-h-0">
                {/* LEFT: PDF preview */}
                <div className="flex flex-col gap-3 h-full min-h-0">
                  <input
                    ref={inventoryFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (uploadedInventoryPreviewUrl) {
                        URL.revokeObjectURL(uploadedInventoryPreviewUrl);
                      }
                      if (file) {
                        setUploadedInventoryFile(file);
                        setUploadedInventoryFileName(file.name);
                        const url = URL.createObjectURL(file);
                        setUploadedInventoryPreviewUrl(url);
                        setOcrInventoryRows([]);
                        setTransferError(null);
                      } else {
                        setUploadedInventoryFile(null);
                        setUploadedInventoryFileName(null);
                        setUploadedInventoryPreviewUrl(null);
                      }
                    }}
                  />

                  {!uploadedInventoryFile && (
                    <div
                      className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-blue-500/70 bg-black/20 rounded-xl px-4 py-8 cursor-pointer transition-colors"
                      onClick={() => inventoryFileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          if (uploadedInventoryPreviewUrl) {
                            URL.revokeObjectURL(uploadedInventoryPreviewUrl);
                          }
                          setUploadedInventoryFile(file);
                          setUploadedInventoryFileName(file.name);
                          const url = URL.createObjectURL(file);
                          setUploadedInventoryPreviewUrl(url);
                          setOcrInventoryRows([]);
                          setTransferError(null);
                        }
                      }}
                    >
                      <Upload className="w-6 h-6 text-blue-400 mb-2" />
                      <span className="text-xs font-medium text-white">
                        Drag & drop file here or click to browse
                      </span>
                      <span className="mt-1 text-[11px] text-gray-500">
                        PDF, JPG, PNG or Excel with item list
                      </span>
                    </div>
                  )}

                  {uploadedInventoryPreviewUrl && (
                    <div className="relative flex-1 min-h-0 border border-gray-800 rounded-xl overflow-hidden bg-black/40">
                      <div className="absolute top-2 right-2 z-10 flex gap-2">
                        <button
                          type="button"
                          onClick={() => inventoryFileInputRef.current?.click()}
                          className="px-2 py-1 rounded-md bg-black/70 text-[10px] text-gray-200 border border-gray-600 hover:bg-black/90"
                        >
                          Change file
                        </button>
                      </div>
                      {uploadedInventoryFile?.type === 'application/pdf' ? (
                        <iframe
                          src={uploadedInventoryPreviewUrl}
                          className="w-full h-full"
                          title="Invoice preview"
                        />
                      ) : (
                        <img
                          src={uploadedInventoryPreviewUrl}
                          alt="Invoice preview"
                          className="w-full h-full object-contain bg-black"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* RIGHT: OCR table */}
                <div className="flex flex-col gap-2 h-full min-h-0">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-gray-400">
                      Step 2 – recognize document with OCR and review extracted items.
                    </div>
                    <button
                      onClick={handleOcrReal}
                      disabled={isOcrProcessing || !uploadedInventoryFile}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-2 transition-colors ${
                        isOcrProcessing || !uploadedInventoryFile
                          ? 'bg-purple-600/40 text-purple-200/70 cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-500 text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isOcrProcessing ? 'Recognizing…' : 'Recognize with OCR'}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 border border-gray-800 rounded-lg p-3 bg-[#020617] flex flex-col">
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
                        <div className="flex-1 min-h-0 overflow-auto">
                          <table className="min-w-full text-[11px]">
                            <thead className="bg-[#020617] text-gray-300 border-b border-gray-800 sticky top-0">
                              <tr>
                                <th className="px-2 py-2 text-left">Артикул</th>
                                <th className="px-2 py-2 text-left">Назва товару</th>
                                <th className="px-2 py-2 text-right">К-сть</th>
                                <th className="px-2 py-2 text-right">Ціна (од.)</th>
                                <th className="px-2 py-2 text-left">Магазин</th>
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
                                    <span className="text-[11px] text-gray-400">{ocrVendor || '-'}</span>
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
          onUpdateBookingStatus={async (bookingId, newStatus) => {
              const reservation = reservations.find(r => r.id === bookingId);
              if (reservation) {
                await updateReservationInDB(reservation.id, { status: newStatus });
              }
          }}
      />
      <InvoiceModal isOpen={isInvoiceModalOpen} onClose={() => { setIsInvoiceModalOpen(false); setSelectedOfferForInvoice(null); setSelectedInvoice(null); }} offer={selectedOfferForInvoice} invoice={selectedInvoice} onSave={handleSaveInvoice} reservations={reservations} offers={offers} />
      <OfferEditModal isOpen={isOfferEditModalOpen} onClose={() => setIsOfferEditModalOpen(false)} offer={offerToEdit} onSave={handleSaveOfferUpdate} />
      <PropertyAddModal 
        isOpen={isPropertyAddModalOpen} 
        onClose={() => {
          setIsPropertyAddModalOpen(false);
          setPropertyToEdit(undefined);
        }} 
        onSave={handleSaveProperty}
        propertyToEdit={propertyToEdit}
      />
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
