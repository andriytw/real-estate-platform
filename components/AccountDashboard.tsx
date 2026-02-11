
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { LayoutDashboard, Calendar, MessageSquare, Settings, LogOut, User, PieChart, TrendingUp, Users, CheckCircle2, AlertCircle, Clock, ArrowRight, Building, Briefcase, Mail, DollarSign, FileText, Calculator, ChevronDown, ChevronUp, ChevronRight, FileBox, Bookmark, X, Save, Send, Building2, Phone, MapPin, Home, Search, Filter, Plus, Edit, Camera, BarChart3, Box, FolderOpen, Folder, File as FileIcon, Upload, Trash2, AreaChart, PenTool, DoorOpen, Wrench, Check, Zap, Droplet, Flame, Video, BookOpen } from 'lucide-react';
import { useWorker } from '../contexts/WorkerContext';
import AdminCalendar from './AdminCalendar';
import AdminMessages from './AdminMessages';
import SalesCalendar from './SalesCalendar';
import SalesChat from './SalesChat';
import BookingDetailsModal from './BookingDetailsModal';
import InvoiceModal from './InvoiceModal';
import OfferEditModal from './OfferEditModal';
import LeadEditModal from './LeadEditModal';
import PropertyAddModal from './PropertyAddModal';
import RequestModal from './RequestModal';
import ConfirmPaymentModal from './ConfirmPaymentModal';
import PaymentProofPdfModal from './PaymentProofPdfModal';
import BankingDashboard from './BankingDashboard';
import UserManagement from './admin/UserManagement';

// Lazy-load KanbanBoard so @hello-pangea/dnd is only loaded when user opens Tasks tab.
// This avoids "X is not a constructor" on /account (CJS/ESM + esbuild minification issue with dnd).
const KanbanBoard = React.lazy(() => import('./kanban/KanbanBoard'));
import {
  propertiesService,
  tasksService,
  workersService,
  warehouseService,
  bookingsService,
  invoicesService,
  offersService,
  reservationsService,
  leadsService,
  paymentProofsService,
  propertyDocumentsService,
  propertyDepositProofsService,
  unitLeaseTermsService,
  checkBookingOverlap,
  markInvoicePaidAndConfirmBooking,
  WarehouseStockItem,
  UnitLeaseTermUi,
  addressBookPartiesService,
  propertyToPartiesAddressBookEntries,
  paymentChainService,
  paymentChainFilesService,
  rentTimelineService,
} from '../services/supabaseService';
import {
  ReservationData,
  OfferData,
  InvoiceData,
  CalendarEvent,
  TaskType,
  TaskStatus,
  Lead,
  Property,
  PropertyDetails,
  RentalAgreement,
  RentTimelineRowDB,
  MeterLogEntry,
  FuturePayment,
  PropertyEvent,
  BookingStatus,
  RequestData,
  Worker,
  Warehouse,
  Booking,
  Reservation,
  PaymentProof,
  ContactParty,
  TenantDetails,
  PropertyDocument,
  PropertyDocumentType,
  PropertyDeposit,
  PropertyDepositProof,
  LeaseTermDraftUi,
  AddressBookPartyEntry,
  PaymentChainAttachment,
  PaymentChain,
  PaymentChainFile,
} from '../types';
import { euToIso, validateEuDate } from '../utils/leaseTermDates';
import { MOCK_PROPERTIES } from '../constants';
import { createFacilityTasksForBooking, updateBookingStatusFromTask, getBookingStyle } from '../bookingUtils';
import { supabase } from '../utils/supabase/client';

// --- Types ---
type Department = 'admin' | 'properties' | 'facility' | 'accounting' | 'sales' | 'tasks';
type FacilityTab = 'overview' | 'calendar' | 'messages' | 'warehouse';
type AccountingTab = 'dashboard' | 'invoices' | 'expenses' | 'calendar' | 'banking';
type SalesTab = 'leads' | 'calendar' | 'offers' | 'reservations' | 'proformas' | 'requests' | 'history' | 'chat'; 
type PropertiesTab = 'list' | 'units';

type PaymentTileKey = 'from_company2_to_company1' | 'from_company1_to_owner' | 'owner_control';
type PaymentTileState = {
  payByDayOfMonth?: number;
  total: string;
  description: string;
  breakdown: { km?: string; bk?: string; hk?: string; muell?: string; strom?: string; gas?: string; wasser?: string };
  attachments: (File | PaymentChainAttachment)[];
};

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

const DOC_LINK_PILL = 'inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs text-indigo-300';

const DOCUMENT_TYPE_LABELS: Record<PropertyDocumentType, string> = {
  lease_contract: 'Договір оренди',
  handover_protocol: 'Акт прийому-передачі',
  acceptance_act: 'Акт приймання',
  supplier_electricity: 'Постачальник: електрика',
  supplier_gas: 'Постачальник: газ',
  supplier_water: 'Постачальник: вода',
  supplier_internet: 'Постачальник: інтернет',
  supplier_waste: 'Постачальник: сміття',
  supplier_cleaning: 'Постачальник: прибирання',
  supplier_hausmeister: 'Постачальник: hausmeister',
  supplier_heating: 'Постачальник: опалення',
  supplier_other: 'Постачальник: інше',
  deposit_payment_proof: 'Підтвердження оплати застави',
  deposit_return_proof: 'Підтвердження повернення застави',
  other_document: 'Інший документ',
};

function formatDateEU(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** VIEW only: trim, filter empty, join array. */
function normalizeArray(arr?: string[]): string {
  if (!arr?.length) return '';
  return arr.map((s) => String(s).trim()).filter(Boolean).join(', ');
}

/** VIEW only: build single-line address string. */
function formatAddress(addr?: { street?: string; houseNumber?: string; zip?: string; city?: string; country?: string }): string {
  if (!addr) return '';
  const streetPart = [addr.street?.trim(), addr.houseNumber?.trim()].filter(Boolean).join(' ');
  const zipCity = [addr.zip?.trim(), addr.city?.trim()].filter(Boolean).join(' ');
  const parts = [streetPart, zipCity, addr.country?.trim()].filter(Boolean);
  return parts.join(', ');
}

/** VIEW only: filter empty, join with " • ". */
function joinMeta(parts: string[]): string {
  const filtered = parts.map((p) => String(p).trim()).filter(Boolean);
  return filtered.length ? filtered.join(' • ') : '';
}

/** VIEW only: one label + value row; empty value => "—". */
function renderPartyRow(label: string, value: string | number | null | undefined): React.ReactNode {
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="mb-1.5">
      <span className="text-xs text-gray-500 block mb-1">{label}</span>
      <span className="text-sm text-white">{display}</span>
    </div>
  );
}

/** Renders a document link that fetches signed URL for the given storage path (pill style). */
const ProofLink: React.FC<{ filePath: string; label?: string }> = ({ filePath, label = 'Proof' }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    paymentProofsService.getPaymentProofSignedUrl(filePath).then((signed) => {
      if (!cancelled) setUrl(signed);
    }).catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [filePath]);
  if (!url) return <span className="text-gray-500 text-xs">…</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={DOC_LINK_PILL}>
      <FileText className="w-3.5 h-3.5" />
      {label}
    </a>
  );
};

function getActiveRentTimelineRow<T extends { validFrom: string; validTo: string }>(
  rows: T[],
  today: Date = new Date()
): T | undefined {
  if (!rows?.length) return undefined;
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const openEnd = (v: string) => !v || v === '∞' || v.trim() === '';
  const active = rows.find(r => {
    const fromOk = (r.validFrom || '') <= ymd;
    const toOk = openEnd(r.validTo) || (r.validTo || '') >= ymd;
    return fromOk && toOk;
  });
  if (active) return active;
  const sorted = [...rows].sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''));
  return sorted[0];
}

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
          (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:120',message:'Properties loaded',data:{totalProperties:data.length,firstProperty:{id:firstProperty.id,title:firstProperty.title,inventoryCount:firstProperty.inventory?.length||0,inventoryItems:firstProperty.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type,sku:i.sku}))||[]}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
        }
        // #endregion
        
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:129',message:'Setting properties from DB',data:{propertiesCount:data.length,isUsingMock:false,firstPropertyId:data[0]?.id,firstPropertyTitle:data[0]?.title,firstPropertyInventoryCount:data[0]?.inventory?.length||0,firstPropertyInventory:data[0]?.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
        // #endregion
        
        // Очистити inventory, який пов'язаний зі складом, але не знайдений на складі
        // Це автоматично видалить inventory, який був видалений зі складу
        let stock: any[] = [];
        try {
          stock = await warehouseService.getStock();
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:137',message:'Warehouse stock loaded for cleanup',data:{stockCount:stock.length,stockItemIds:stock.map(s=>s.itemId).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{}));
          // #endregion
        } catch (error) {
          console.error('Error loading warehouse stock for cleanup:', error);
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:142',message:'Error loading warehouse stock',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{}));
          // #endregion
        }
        
        const stockItemIds = new Set(stock.map(s => s.itemId));
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:148',message:'Stock itemIds set created',data:{stockItemIdsCount:stockItemIds.size,stockItemIdsArray:Array.from(stockItemIds).slice(0,5)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{}));
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
              (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:168',message:'Cleaning property inventory',data:{propertyId:property.id,propertyTitle:property.title,oldCount:property.inventory.length,newCount:cleanedInventory.length,removedItems:property.inventory.filter((i:any)=>!cleanedInventory.some((ci:any)=>ci.itemId===i.itemId&&ci.invNumber===i.invNumber)).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{}));
              // #endregion
              // Оновити property в БД
              await propertiesService.update(property.id, {
                inventory: cleanedInventory,
              });
              // #region agent log
              (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:175',message:'Property inventory updated in DB',data:{propertyId:property.id,newInventoryCount:cleanedInventory.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:137',message:'Error loading properties, using MOCK_PROPERTIES',data:{error:error instanceof Error ? error.message : String(error),mockPropertiesCount:MOCK_PROPERTIES.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
  const [isCard2Editing, setIsCard2Editing] = useState(false);
  const [card2Draft, setCard2Draft] = useState<{ details: PropertyDetails; amenities: Record<string, boolean> } | null>(null);
  const [isEditingCard1, setIsEditingCard1] = useState(false);
  const [card1Documents, setCard1Documents] = useState<PropertyDocument[]>([]);
  const [card1DocumentsLoading, setCard1DocumentsLoading] = useState(false);
  const [card1DocumentsError, setCard1DocumentsError] = useState<string | null>(null);
  const [showAddDocumentForm, setShowAddDocumentForm] = useState(false);
  const [newDocType, setNewDocType] = useState<PropertyDocumentType>('lease_contract');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocDate, setNewDocDate] = useState('');
  const [newDocFile, setNewDocFile] = useState<File | null>(null);
  const [addingDocument, setAddingDocument] = useState(false);
  const [addDocumentError, setAddDocumentError] = useState<string | null>(null);
  const [card1Draft, setCard1Draft] = useState<{
    apartmentStatus: 'active' | 'ooo' | 'preparation' | 'rented_worker';
    address: string;
    zip: string;
    city: string;
    country: string;
    title: string;
    floor: number;
    buildingFloors: number;
    landlord: ContactParty | null;
    management: ContactParty | null;
    tenant: TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number };
    secondCompany: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number }) | null;
    deposit: PropertyDeposit | null;
  } | null>(null);
  const [card1DepositError, setCard1DepositError] = useState<string | null>(null);
  const [isDepositProofModalOpen, setIsDepositProofModalOpen] = useState(false);
  const [depositProofType, setDepositProofType] = useState<'payment' | 'return' | null>(null);
  const [kautionProofs, setKautionProofs] = useState<{ payment: PropertyDepositProof | null; return: PropertyDepositProof | null }>({ payment: null, return: null });
  const [leaseTerm, setLeaseTerm] = useState<UnitLeaseTermUi | null>(null);
  const [leaseTermDraft, setLeaseTermDraft] = useState<LeaseTermDraftUi | null>(null);
  const [leaseTermSaving, setLeaseTermSaving] = useState(false);
  const [leaseTermSaveError, setLeaseTermSaveError] = useState<string | null>(null);
  const [isAddressBookModalOpen, setIsAddressBookModalOpen] = useState(false);
  const [addressBookEntries, setAddressBookEntries] = useState<AddressBookPartyEntry[]>([]);
  const [addressBookLoading, setAddressBookLoading] = useState(false);
  const [addressBookLoaded, setAddressBookLoaded] = useState(false);
  const [addressBookLastError, setAddressBookLastError] = useState<string | null>(null);
  const [addressBookDropdownOpen, setAddressBookDropdownOpen] = useState<'owner' | 'company1' | 'company2' | 'management' | null>(null);
  const [addressBookSearch, setAddressBookSearch] = useState<{ owner: string; company1: string; company2: string; management: string }>({ owner: '', company1: '', company2: '', management: '' });
  const [addressBookDeletingId, setAddressBookDeletingId] = useState<string | null>(null);
  const [addressBookDeleteError, setAddressBookDeleteError] = useState<string | null>(null);
  const [showPartiesDetails, setShowPartiesDetails] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [editingPaymentTile, setEditingPaymentTile] = useState<PaymentTileKey | null>(null);
  const [paymentTiles, setPaymentTiles] = useState<Record<PaymentTileKey, PaymentTileState>>({
    owner_control: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
    from_company1_to_owner: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
    from_company2_to_company1: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
  });
  const [paymentChainLoading, setPaymentChainLoading] = useState(false);
  const [paymentChainError, setPaymentChainError] = useState<string | null>(null);
  const [paymentChainFiles, setPaymentChainFiles] = useState<Record<PaymentTileKey, PaymentChainFile[]>>({
    owner_control: [],
    from_company1_to_owner: [],
    from_company2_to_company1: [],
  });
  const [paymentChainUploadingTile, setPaymentChainUploadingTile] = useState<PaymentTileKey | null>(null);
  const tileKeyToDb = (k: PaymentTileKey): 'OWNER_RECEIPT' | 'C1_TO_OWNER' | 'C2_TO_C1' => (k === 'owner_control' ? 'OWNER_RECEIPT' : k === 'from_company1_to_owner' ? 'C1_TO_OWNER' : 'C2_TO_C1');
  const dbTileToKey = (t: 'OWNER_RECEIPT' | 'C1_TO_OWNER' | 'C2_TO_C1'): PaymentTileKey => (t === 'OWNER_RECEIPT' ? 'owner_control' : t === 'C1_TO_OWNER' ? 'from_company1_to_owner' : 'from_company2_to_company1');
  const loadPaymentChain = useCallback(async (propertyId: string) => {
    setPaymentChainLoading(true);
    setPaymentChainError(null);
    try {
      const state = await paymentChainService.getPaymentChain(propertyId);
      setPaymentTiles(prev => {
        const next = { ...prev };
        const e1 = state.edges.C1_TO_OWNER;
        if (e1) {
          next.from_company1_to_owner = {
            ...prev.from_company1_to_owner,
            payByDayOfMonth: e1.pay_by_day_of_month ?? undefined,
            total: e1.amount_total != null ? String(e1.amount_total) : '',
            description: e1.description ?? '',
            breakdown: e1.breakdown && typeof e1.breakdown === 'object' ? { ...e1.breakdown } : {},
          };
        }
        const e2 = state.edges.C2_TO_C1;
        if (e2) {
          next.from_company2_to_company1 = {
            ...prev.from_company2_to_company1,
            payByDayOfMonth: e2.pay_by_day_of_month ?? undefined,
            total: e2.amount_total != null ? String(e2.amount_total) : '',
            description: e2.description ?? '',
            breakdown: e2.breakdown && typeof e2.breakdown === 'object' ? { ...e2.breakdown } : {},
          };
        }
        return next;
      });
      setPaymentChainFiles({
        owner_control: state.filesByTile.OWNER_RECEIPT,
        from_company1_to_owner: state.filesByTile.C1_TO_OWNER,
        from_company2_to_company1: state.filesByTile.C2_TO_C1,
      });
    } catch (e) {
      setPaymentChainError(e instanceof Error ? e.message : 'Не вдалося завантажити платіжний ланцюжок');
    } finally {
      setPaymentChainLoading(false);
    }
  }, []);
  const handlePaymentChainAddFiles = async (tileKey: PaymentTileKey, files: FileList | null) => {
    if (!files?.length || !selectedPropertyId) return;
    setPaymentChainUploadingTile(tileKey);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (let i = 0; i < files.length; i++) {
        await paymentChainService.uploadFile(selectedPropertyId, tileKeyToDb(tileKey), files[i], user?.id ?? undefined);
      }
      await loadPaymentChain(selectedPropertyId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка завантаження');
    } finally {
      setPaymentChainUploadingTile(null);
    }
  };
  const handlePaymentChainViewFile = async (storagePath: string) => {
    try { const url = await paymentChainService.getFileSignedUrl(storagePath, 600); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); }
  };
  const handlePaymentChainDeleteFile = async (tileKey: PaymentTileKey, file: PaymentChainFile) => {
    try {
      if (file.id.startsWith('legacy-')) {
        await paymentChainFilesService.remove(file.storage_path);
        setPaymentChainFiles(prev => ({ ...prev, [tileKey]: prev[tileKey].filter(f => f.id !== file.id) }));
      } else {
        await paymentChainService.deleteFileById(file.id);
        setPaymentChainFiles(prev => ({ ...prev, [tileKey]: prev[tileKey].filter(f => f.id !== file.id) }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не вдалося видалити');
    }
  };
  const [depositProofFile, setDepositProofFile] = useState<File | null>(null);
  const [depositProofError, setDepositProofError] = useState<string | null>(null);
  const [depositProofUploading, setDepositProofUploading] = useState(false);
  const [showAddRentIncreaseForm, setShowAddRentIncreaseForm] = useState(false);
  const [rentIncreaseForm, setRentIncreaseForm] = useState<{
    validFrom: string; validTo: string;
    km: string; mietsteuer: string; unternehmenssteuer: string; bk: string; hk: string;
    muell: string; strom: string; gas: string; wasser: string;
  }>({
    validFrom: '', validTo: '',
    km: '', mietsteuer: '', unternehmenssteuer: '', bk: '', hk: '',
    muell: '', strom: '', gas: '', wasser: ''
  });
  const [rentIncreaseFormError, setRentIncreaseFormError] = useState<string | null>(null);
  const [isAddingRentIncrease, setIsAddingRentIncrease] = useState(false);
  const selectedProperty = useMemo(() => properties.find(p => p.id === selectedPropertyId) || properties[0] || null, [properties, selectedPropertyId]);

  const [ownerRentTimelineDbRows, setOwnerRentTimelineDbRows] = useState<RentTimelineRowDB[]>([]);
  const [rentTimelineLoading, setRentTimelineLoading] = useState(false);
  const [rentTimelineError, setRentTimelineError] = useState<string | null>(null);

  const rentTimelineRows = useMemo(() => {
    const warmFrom = (km: number, bk: number, hk: number, mietsteuer: number, unternehmenssteuer: number, muell: number, strom: number, gas: number, wasser: number) =>
      km + bk + hk + mietsteuer + unternehmenssteuer + muell + strom + gas + wasser;
    return ownerRentTimelineDbRows.map((r) => {
      const km = Number(r.km) || 0, bk = Number(r.bk) || 0, hk = Number(r.hk) || 0;
      const mietsteuer = Number(r.mietsteuer) || 0, unternehmenssteuer = Number(r.unternehmenssteuer) || 0;
      const muell = Number(r.muell) || 0, strom = Number(r.strom) || 0, gas = Number(r.gas) || 0, wasser = Number(r.wasser) || 0;
      return {
        id: r.id,
        validFrom: r.valid_from,
        validTo: r.valid_to ? r.valid_to : '∞',
        km, mietsteuer, unternehmenssteuer, bk, hk, muell, strom, gas, wasser,
        warm: warmFrom(km, bk, hk, mietsteuer, unternehmenssteuer, muell, strom, gas, wasser)
      };
    });
  }, [ownerRentTimelineDbRows]);

  const [editingRentTimelineRowId, setEditingRentTimelineRowId] = useState<string | null>(null);
  const [rentTimelineEditDraft, setRentTimelineEditDraft] = useState<{
    validFrom: string; validTo: string;
    km: string; mietsteuer: string; unternehmenssteuer: string; bk: string; hk: string;
    muell: string; strom: string; gas: string; wasser: string;
  } | null>(null);
  const [rentTimelineEditError, setRentTimelineEditError] = useState<string | null>(null);
  const activeRentRow = useMemo(() => getActiveRentTimelineRow(rentTimelineRows), [rentTimelineRows]);
  const ownerTotalAuto = activeRentRow ? (activeRentRow.warm ?? (
    (activeRentRow.km ?? 0) + (activeRentRow.bk ?? 0) + (activeRentRow.hk ?? 0) +
    (activeRentRow.mietsteuer ?? 0) + (activeRentRow.unternehmenssteuer ?? 0) +
    (activeRentRow.strom ?? 0) + (activeRentRow.muell ?? 0) + (activeRentRow.gas ?? 0) + (activeRentRow.wasser ?? 0)
  )) : 0;

  useEffect(() => {
    if (selectedPropertyId == null) return;
    loadPaymentChain(selectedPropertyId);
  }, [selectedPropertyId, loadPaymentChain]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setOwnerRentTimelineDbRows([]);
      setRentTimelineError(null);
      return;
    }
    const prop = properties.find(p => p.id === selectedPropertyId);
    let cancelled = false;
    setRentTimelineLoading(true);
    setRentTimelineError(null);
    rentTimelineService
      .listRows(selectedPropertyId)
      .then((rows) => {
        if (cancelled) return;
        const legacy = prop?.rentalHistory;
        if (rows.length === 0 && legacy?.length) {
          return rentTimelineService.backfillFromLegacy(selectedPropertyId, legacy).then(() =>
            rentTimelineService.listRows(selectedPropertyId)
          );
        }
        return rows;
      })
      .then((rows) => {
        if (cancelled) return;
        setOwnerRentTimelineDbRows(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setRentTimelineError(e?.message || 'Не вдалося завантажити рентний таймлайн');
          setOwnerRentTimelineDbRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRentTimelineLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedPropertyId, properties]);

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
  const depositProofFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [requests, setRequests] = useState<RequestData[]>(() => {
    // Завантажити requests з localStorage при ініціалізації
    try {
      const stored = localStorage.getItem('requests');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  
  // Нормалізація для перевірки дублікатів лідів по email/phone (один контакт = один лід)
  const leadExistsByContact = (email: string, phone: string, currentLeads: Lead[]) => {
    const normEmail = (email || '').trim().toLowerCase();
    const normPhone = (phone || '').replace(/\s+/g, '').replace(/-/g, '');
    if (!normEmail && !normPhone) return false;
    return currentLeads.some(l => {
      const le = (l.email || '').trim().toLowerCase();
      const lp = (l.phone || '').replace(/\s+/g, '').replace(/-/g, '');
      return (normEmail && le === normEmail) || (normPhone && lp === normPhone);
    });
  };

  // Слухати події додавання нових requests
  React.useEffect(() => {
    const handleRequestAdded = async (event: CustomEvent<RequestData>) => {
      setRequests(prev => [event.detail, ...prev]);
      const req = event.detail;
      const name = req.companyName || `${req.firstName || ''} ${req.lastName || ''}`.trim() || 'Unknown';
      try {
        const leadsNow = await leadsService.getAll();
        if (leadExistsByContact(req.email || '', req.phone || '', leadsNow)) return;
        const newLead = await leadsService.create({
          name,
          type: req.companyName ? 'Company' : 'Private',
          contactPerson: req.companyName ? `${req.firstName || ''} ${req.lastName || ''}`.trim() || undefined : undefined,
          email: req.email || '',
          phone: req.phone || '',
          address: '',
          status: 'Active',
          createdAt: new Date().toISOString().split('T')[0],
          source: req.id
        });
        setLeads(prev => [...prev, newLead].sort((a, b) => a.name.localeCompare(b.name)));
      } catch (e) {
        console.error('Failed to create lead from request:', e);
      }
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

          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            throw new Error('Not authenticated. Please log in again.');
          }

          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          if (!supabaseUrl || !anonKey) {
            throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env variables');
          }

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
      (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:607',message:'handleDeleteStockItem entry',data:{stockId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
      // #endregion
      
      // Спочатку отримуємо інформацію про stock item, щоб знати itemId
      const stockItem = warehouseStock.find(item => item.stockId === stockId);
      
      // #region agent log
      (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:612',message:'stockItem found',data:{stockItem:stockItem?{stockId:stockItem.stockId,itemId:stockItem.itemId,itemName:stockItem.itemName}:null,warehouseStockLength:warehouseStock.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
      // #endregion
      
      if (!stockItem) {
        alert('Stock item not found');
        return;
      }

      const itemId = stockItem.itemId;
      const invNumber = `WAREHOUSE-${itemId}`;
      
      // #region agent log
      (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:619',message:'itemId and invNumber extracted',data:{itemId,invNumber,itemName:stockItem.itemName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
      // #endregion

      // Видаляємо зі складу
      await warehouseService.deleteStockItem(stockId);

      // Знаходимо всі квартири, де є цей інвентар, і видаляємо його
      if (itemId) {
        console.log(`🗑️ Removing inventory with itemId ${itemId} (${stockItem.itemName}) from all properties...`);
        const allProperties = await propertiesService.getAll();
        const itemName = stockItem.itemName;
        
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:625',message:'Starting property search',data:{allPropertiesCount:allProperties.length,itemId,itemName,invNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
        // #endregion
        
        for (const property of allProperties) {
          if (property.inventory && property.inventory.length > 0) {
            // #region agent log
            (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:630',message:'Checking property inventory',data:{propertyId:property.id,propertyTitle:property.title,inventoryCount:property.inventory.length,inventoryItems:property.inventory.map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
            // #endregion
            
            // Шукаємо інвентар за itemId, invNumber або назвою товару
            const inventoryToRemove = property.inventory.filter((item: any) => {
              // Перевірка за itemId
              if (item.itemId === itemId) {
                console.log(`  ✓ Found by itemId in ${property.title}: ${item.name || item.type}`);
                // #region agent log
                (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:635',message:'Match found by itemId',data:{propertyId:property.id,item:item},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
                // #endregion
                return true;
              }
              // Перевірка за invNumber
              if (item.invNumber === invNumber) {
                console.log(`  ✓ Found by invNumber in ${property.title}: ${item.name || item.type}`);
                // #region agent log
                (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:640',message:'Match found by invNumber',data:{propertyId:property.id,item:item,invNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
                // #endregion
                return true;
              }
              // Перевірка за назвою товару (якщо немає itemId)
              if (!item.itemId && (item.name === itemName || item.type === itemName)) {
                console.log(`  ✓ Found by name in ${property.title}: ${item.name || item.type}`);
                // #region agent log
                (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:645',message:'Match found by name',data:{propertyId:property.id,item:item,itemName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
                // #endregion
                return true;
              }
              return false;
            });
            
            // #region agent log
            (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:650',message:'inventoryToRemove result',data:{propertyId:property.id,foundCount:inventoryToRemove.length,itemsToRemove:inventoryToRemove.map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
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
              (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:660',message:'Before property update',data:{propertyId:property.id,oldInventoryCount:property.inventory.length,newInventoryCount:updatedInventory.length,oldInventory:property.inventory.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type})),newInventory:updatedInventory.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{}));
              // #endregion
              
              // Створюємо payload тільки з необхідними полями для оновлення
              // Важливо: передаємо inventory як масив, навіть якщо він порожній
              // Також передаємо id property, щоб Supabase знав, який запис оновлювати
              const updatePayload: Partial<Property> = {
                id: property.id, // Додаємо id для явного вказання
                inventory: Array.isArray(updatedInventory) ? updatedInventory : [], // Гарантуємо, що це масив
              };
              
              // #region agent log
              (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:667',message:'Update payload prepared',data:{propertyId:property.id,payloadInventoryCount:updatePayload.inventory?.length||0,payloadInventory:updatePayload.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{}));
              // #endregion
              
              const updatedProperty = await propertiesService.update(property.id, updatePayload);
              
              // #region agent log
              (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:675',message:'After property update',data:{propertyId:property.id,returnedInventoryCount:updatedProperty.inventory?.length||0,returnedInventory:updatedProperty.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{}));
              // #endregion
            }
          }
        }
        
        // Оновити локальний стан properties
        setProperties((prev) => {
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:675',message:'Before local state update',data:{prevPropertiesCount:prev.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{}));
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
                (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:685',message:'Local state updated for property',data:{propertyId:p.id,propertyTitle:p.title,oldCount:p.inventory.length,newCount:updatedInventory.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{}));
                // #endregion
                return { ...p, inventory: updatedInventory };
              }
            }
            return p;
          });
          
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:692',message:'After local state update',data:{updatedPropertiesCount:updated.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1204',message:'H1: loadFacilityTasks ENTRY',data:{adminEventsCountBefore:adminEvents.length,adminEventIdsBefore:adminEvents.map(e=>e.id),adminEventsBefore:adminEventsBeforeLoad,workerRole:worker?.role,workerId:worker?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1221',message:'H1: BEFORE tasksService.getAll',data:{filters},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
        // #endregion
        
        const tasks = await tasksService.getAll(filters);
        
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1221',message:'H1-H5: AFTER tasksService.getAll',data:{tasksCount:tasks.length,tasks:tasks.map(t=>({id:t.id,title:t.title,date:t.date,day:t.day,workerId:t.workerId,status:t.status})),adminEventIdsBefore:adminEvents.map(e=>e.id),tasksIdsFromDB:tasks.map(t=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1257',message:'H1: BEFORE setAdminEvents (replacing state)',data:{validTasksCount:validTasks.length,validTaskIds:validTasks.map(t=>t.id),adminEventsCountBefore:adminEvents.length,adminEventIdsBefore:adminEvents.map(e=>e.id),tasksLost:adminEvents.filter(e=>!validTasks.find(t=>t.id===e.id)).map(e=>({id:e.id,title:e.title,date:e.date}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
        // #endregion
        
        console.log('📋 Tasks after filtering:', validTasks.length);
        if (validTasks.length > 0) {
            console.log('📋 Task IDs:', validTasks.map(t => t.id));
        }
        
        setAdminEvents(validTasks);
        
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1262',message:'H1: AFTER setAdminEvents (state replaced)',data:{validTasksCount:validTasks.length,validTaskIds:validTasks.map(t=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
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
      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1277',message:'H1: handleTaskUpdated called',data:{adminEventsCount:adminEvents.length,adminEventIds:adminEvents.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
      // #endregion
      console.log('🔄 Task updated event received, will reload Facility tasks in 500ms...');
      // Debounce reload to prevent race conditions when multiple updates happen quickly
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1284',message:'H1: Executing debounced loadFacilityTasks',data:{adminEventsCountBeforeReload:adminEvents.length,adminEventIdsBeforeReload:adminEvents.map(e=>e.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1255',message:'Loading invoices from Supabase',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
        // #endregion
        const loadedInvoices = await invoicesService.getAll();
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1258',message:'Loaded invoices from Supabase',data:{count:loadedInvoices.length,invoiceIds:loadedInvoices.map(i=>i.id),invoiceNumbers:loadedInvoices.map(i=>i.invoiceNumber)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
        // #endregion
        setInvoices(loadedInvoices);
      } catch (error) {
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1263',message:'Error loading invoices from Supabase',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1297',message:'Loading offers from Supabase',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
        // #endregion
        const loadedOffers = await offersService.getAll();
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1301',message:'Loaded offers from Supabase',data:{count:loadedOffers.length,offerIds:loadedOffers.map(o=>({id:o.id,idType:typeof o.id,clientName:o.clientName,propertyId:o.propertyId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
        // #endregion
        setOffers(loadedOffers);
      } catch (error) {
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1305',message:'Error loading offers from Supabase',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
        // #endregion
        console.error('Error loading offers:', error);
      }
    };
    loadOffers();
  }, []);

  // Load proformas when Sales > Proformas tab is active
  useEffect(() => {
    if (activeDepartment !== 'sales' || salesTab !== 'proformas') return;
    const loadProformas = async () => {
      try {
        const list = await invoicesService.getProformas();
        setProformas(list);
      } catch (error) {
        console.error('Error loading proformas:', error);
      }
    };
    loadProformas();
  }, [activeDepartment, salesTab]);

  // Listen for task updates from Kanban board
  useEffect(() => {
    const handleTaskUpdated = async () => {
      try {
        console.log('🔄 Task updated event received, reloading Facility tasks...');
        
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1232',message:'handleTaskUpdated called',data:{workerRole:worker?.role,workerId:worker?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1246',message:'Tasks loaded from DB',data:{totalTasks:tasks.length,tasksByBooking},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1276',message:'Setting adminEvents state',data:{tasksCount:tasks.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{}));
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
  const [selectedProformaForInvoice, setSelectedProformaForInvoice] = useState<InvoiceData | null>(null);
  const [proformas, setProformas] = useState<InvoiceData[]>([]);
  const [expandedProformaIds, setExpandedProformaIds] = useState<Set<string>>(new Set());
  const [proformaChildInvoices, setProformaChildInvoices] = useState<Record<string, InvoiceData[]>>({});
  const [isOfferEditModalOpen, setIsOfferEditModalOpen] = useState(false);
  const [offerToEdit, setOfferToEdit] = useState<OfferData | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestData | null>(null);
  const [confirmPaymentModalProforma, setConfirmPaymentModalProforma] = useState<InvoiceData | null>(null);
  const [paymentProofsByInvoiceId, setPaymentProofsByInvoiceId] = useState<Record<string, PaymentProof[]>>({});
  const [proofSignedUrlByInvoiceId, setProofSignedUrlByInvoiceId] = useState<Record<string, string>>({});
  const [paymentProofModal, setPaymentProofModal] = useState<{ mode: 'add' | 'replace'; proof: PaymentProof } | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  /** Load payment proofs for given invoice ids and signed URLs for current proofs. */
  const loadPaymentProofsForInvoiceIds = async (invoiceIds: string[]) => {
    if (invoiceIds.length === 0) return;
    try {
      const byId: Record<string, PaymentProof[]> = {};
      await Promise.all(
        invoiceIds.map(async (id) => {
          const list = await paymentProofsService.getByInvoiceId(id);
          byId[id] = list;
        })
      );
      setPaymentProofsByInvoiceId(prev => ({ ...prev, ...byId }));
      const signed: Record<string, string> = {};
      await Promise.all(
        Object.entries(byId).map(async ([invId, proofs]) => {
          const current = proofs.find(p => p.isCurrent && p.filePath);
          if (current?.filePath) {
            try {
              const url = await paymentProofsService.getPaymentProofSignedUrl(current.filePath);
              signed[invId] = url;
            } catch {
              // ignore per-invoice signed URL errors
            }
          }
        })
      );
      setProofSignedUrlByInvoiceId(prev => ({ ...prev, ...signed }));
    } catch (e) {
      console.error('Error loading payment proofs:', e);
    }
  };

  // Load payment proofs when proformas are shown (Payments table)
  useEffect(() => {
    if (activeDepartment !== 'sales' || salesTab !== 'proformas' || proformas.length === 0) return;
    loadPaymentProofsForInvoiceIds(proformas.map(p => p.id));
  }, [activeDepartment, salesTab, proformas.map(p => p.id).join(',')]);

  // --- Toast notifications ---
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [createdOfferId, setCreatedOfferId] = useState<string | null>(null);

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

  const defaultDetails: PropertyDetails = { area: 0, rooms: 0, floor: 0, year: 0, beds: 0, baths: 0, balconies: 0, buildingFloors: 0 };

  const AMENITY_GROUPS: { groupLabel: string; keys: string[] }[] = [
    { groupLabel: 'Küche & Haushalt', keys: ['Kochmöglichkeit', 'Kühlschrank', 'Mikrowelle', 'Wasserkocher', 'Kochutensilien', 'Spülmaschine', 'Kaffeemaschine'] },
    { groupLabel: 'Sanvuzol & Komfort', keys: ['Privates Bad', 'Dusche', 'WC', 'Handtücher inkl.', 'Hygiene Produkte', 'Waschmaschine', 'Trockner'] },
    { groupLabel: 'Sleeping & Living', keys: ['Getrennte Betten', 'Bettwäsche inkl.', 'Zustellbett möglich', 'Arbeitsplatz', 'Spind / Safe'] },
    { groupLabel: 'Technologie & Media', keys: ['TV', 'W-LAN', 'Radio', 'Streaming Dienste'] },
    { groupLabel: 'Building & Access', keys: ['Aufzug', 'Barrierefrei', 'Ruhige Lage'] },
    { groupLabel: 'Outdoor & Location', keys: ['Terrasse', 'Gute Verkehrsanbindung', 'Geschäfte in der Nähe'] },
    { groupLabel: 'Parking', keys: ['PKW-Parkplatz', 'LKW-Parkplatz'] },
    { groupLabel: 'Freizeit / Extras', keys: ['Sauna', 'Grillmöglichkeit', 'Tisch-Fußball', 'Billardtisch', 'Dart'] },
    { groupLabel: 'Services', keys: ['24h-Rezeption', 'Frühstück', 'Lunchpaket (gg. Aufpreis)'] },
    { groupLabel: 'Rules / Shared', keys: ['Raucher', 'Gemeinschaftsbad', 'Gemeinschaftsraum'] },
  ];
  const ALL_AMENITY_KEYS = AMENITY_GROUPS.flatMap(g => g.keys);
  const defaultAmenities = Object.fromEntries(ALL_AMENITY_KEYS.map(k => [k, false]));

  const startCard2Edit = () => {
    const prop = properties.find(p => p.id === selectedPropertyId) ?? null;
    if (!prop) return;
    const d = prop.details || {};
    const a = prop.amenities || {};
    setCard2Draft({
      details: { ...defaultDetails, area: d.area ?? 0, rooms: d.rooms ?? 0, floor: d.floor ?? 0, year: d.year ?? 0, beds: d.beds ?? 0, baths: d.baths ?? 0, balconies: d.balconies ?? 0, buildingFloors: d.buildingFloors ?? 0 },
      amenities: { ...defaultAmenities, ...a }
    });
    setIsCard2Editing(true);
  };

  const saveCard2 = async () => {
    const prop = properties.find(p => p.id === selectedPropertyId) ?? null;
    if (!prop || !card2Draft) return;
    try {
      const updated = await propertiesService.update(prop.id, { details: card2Draft.details, amenities: card2Draft.amenities });
      setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedPropertyId(updated.id);
      setIsCard2Editing(false);
      setCard2Draft(null);
    } catch (err) {
      console.error('Card 2 save error:', err);
      alert('Помилка збереження. Спробуйте ще раз.');
    }
  };

  const cancelCard2 = () => {
    setIsCard2Editing(false);
    setCard2Draft(null);
  };

  const defaultContactParty = (): ContactParty => ({
    name: '',
    address: { street: '', houseNumber: '', zip: '', city: '', country: '' },
    phones: [''],
    emails: [''],
    iban: ''
  });

  const renderClearableInput = (opts: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; inputClassName?: string }) => {
    const { value, onChange, type = 'text', placeholder, inputClassName = '' } = opts;
    const showX = value != null && String(value).trim() !== '';
    return (
      <div className="relative">
        <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white ${inputClassName}`.trim()} />
        {showX && <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>}
      </div>
    );
  };

  const addressBookEntryMatchesSearch = (entry: AddressBookPartyEntry, q: string) => {
    if (!q || String(q).trim() === '') return true;
    const addr = formatAddress({ street: entry.street, houseNumber: entry.houseNumber ?? '', zip: entry.zip, city: entry.city, country: entry.country ?? '' });
    const searchable = `${entry.name ?? ''} ${addr} ${normalizeArray(entry.phones ?? [])} ${normalizeArray(entry.emails ?? [])}`.toLowerCase();
    return searchable.includes(String(q).trim().toLowerCase());
  };
  const addressBookRoleLabel = (r: string) => (r === 'owner' ? 'Власник' : r === 'company1' ? '1-ша фірма' : r === 'company2' ? '2-га фірма' : 'Управління');

  const startCard1Edit = () => {
    const prop = selectedProperty ?? properties.find(pr => pr.id === selectedPropertyId) ?? null;
    if (!prop) return;
    const defAddr = defaultContactParty().address;
    const landlord: ContactParty = prop.landlord ? {
      name: prop.landlord.name ?? '',
      address: { ...defAddr, ...(prop.landlord.address || {}) },
      phones: (prop.landlord.phones?.length ? [...prop.landlord.phones] : ['']),
      emails: (prop.landlord.emails?.length ? [...prop.landlord.emails] : ['']),
      iban: prop.landlord.iban ?? '',
      unitIdentifier: prop.landlord.unitIdentifier ?? '',
      contactPerson: prop.landlord.contactPerson ?? ''
    } : defaultContactParty();
    const management: ContactParty = prop.management ? {
      name: prop.management.name ?? '',
      address: { ...defAddr, ...(prop.management.address || {}) },
      phones: (prop.management.phones?.length ? [...prop.management.phones] : ['']),
      emails: (prop.management.emails?.length ? [...prop.management.emails] : ['']),
      iban: prop.management.iban ?? '',
      unitIdentifier: prop.management.unitIdentifier ?? '',
      contactPerson: prop.management.contactPerson ?? ''
    } : defaultContactParty();
    const tenant: TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number } = prop.tenant ? {
      ...prop.tenant,
      address: prop.tenant.address ? { ...defAddr, ...prop.tenant.address } : defAddr,
      phones: (prop.tenant.phones?.length ? [...prop.tenant.phones] : (prop.tenant.phone ? [prop.tenant.phone] : [''])),
      emails: (prop.tenant.emails?.length ? [...prop.tenant.emails] : (prop.tenant.email ? [prop.tenant.email] : [''])),
      paymentDayOfMonth: prop.tenant.paymentDayOfMonth
    } : {
      name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0,
      address: defAddr,
      phones: [''],
      emails: [''],
      paymentDayOfMonth: undefined
    };
    const secondCompany: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number }) | null = prop.secondCompany ? {
      ...prop.secondCompany,
      address: prop.secondCompany.address ? { ...defAddr, ...prop.secondCompany.address } : defAddr,
      phones: (prop.secondCompany.phones?.length ? [...prop.secondCompany.phones] : (prop.secondCompany.phone ? [prop.secondCompany.phone] : [''])),
      emails: (prop.secondCompany.emails?.length ? [...prop.secondCompany.emails] : (prop.secondCompany.email ? [prop.secondCompany.email] : [''])),
      paymentDayOfMonth: prop.secondCompany.paymentDayOfMonth
    } : null;
    const deposit: PropertyDeposit | null = prop.deposit ? {
      amount: prop.deposit.amount ?? 0,
      status: (prop.deposit.status === 'paid' || prop.deposit.status === 'partially_returned' || prop.deposit.status === 'returned') ? 'paid' : 'unpaid',
      paidAt: prop.deposit.paidAt ?? '',
      paidTo: prop.deposit.paidTo ?? '',
      returnedAt: prop.deposit.returnedAt ?? '',
      returnedAmount: prop.deposit.returnedAmount ?? undefined,
      returnStatus: prop.deposit.returnStatus ?? (prop.deposit.status === 'partially_returned' ? 'partially_returned' : prop.deposit.status === 'returned' ? 'returned' : 'unpaid')
    } : null;
    setCard1Draft({
      apartmentStatus: (prop.apartmentStatus || 'active') as 'active' | 'ooo' | 'preparation' | 'rented_worker',
      address: prop.address ?? '',
      zip: prop.zip ?? '',
      city: prop.city ?? '',
      country: prop.country ?? '',
      title: prop.title ?? '',
      floor: prop.details?.floor ?? 0,
      buildingFloors: prop.details?.buildingFloors ?? 0,
      landlord,
      management,
      tenant,
      secondCompany,
      deposit
    });
    setCard1DepositError(null);
    setLeaseTermDraft(leaseTerm ? { contractStart: leaseTerm.contract_start, contractEnd: leaseTerm.contract_end ?? '', contractType: leaseTerm.contract_type, firstPaymentDate: leaseTerm.first_payment_date ?? '', note: leaseTerm.note ?? '' } : { contractStart: '', contractEnd: '', contractType: 'befristet', firstPaymentDate: '', note: '' });
    setIsEditingCard1(true);
    if (!addressBookLoaded) {
      setAddressBookLoading(true);
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const list = await addressBookPartiesService.listByRole(user.id);
            setAddressBookEntries(list);
            setAddressBookLoaded(true);
          }
        } catch (e) {
          console.error('[AddressBook load]', e);
        } finally {
          setAddressBookLoading(false);
        }
      })();
    }
  };

  const cancelCard1Edit = () => {
    setIsEditingCard1(false);
    setCard1Draft(null);
    setLeaseTermDraft(null);
    setCard1DepositError(null);
    setEditingRentTimelineRowId(null);
    setRentTimelineEditDraft(null);
    setRentTimelineEditError(null);
  };

  const isCard1LandlordValid = (l: ContactParty | null): boolean => {
    if (!l) return true;
    const a = l.address;
    const hasContact = (l.phones?.some(ph => ph?.trim()) || l.emails?.some(em => em?.trim())) ?? false;
    return !!(l.name?.trim() && l.iban?.trim() && a?.street?.trim() && a?.houseNumber?.trim() && a?.zip?.trim() && a?.city?.trim() && a?.country?.trim() && hasContact);
  };

  const isCard1DepositValid = (d: PropertyDeposit | null): { valid: boolean; message: string | null } => {
    if (!d) return { valid: true, message: null };
    const amount = typeof d.amount === 'number' ? d.amount : 0;
    if (amount < 0) return { valid: false, message: 'Сума застави не може бути від\'ємною.' };
    if (d.status !== 'unpaid' && !d.paidAt?.trim()) return { valid: false, message: 'Для обраного статусу потрібна дата оплати.' };
    const retStatus = d.returnStatus ?? 'unpaid';
    if (retStatus === 'partially_returned' || retStatus === 'returned') {
      if (!d.returnedAt?.trim()) return { valid: false, message: 'Потрібна дата повернення.' };
      if (typeof d.returnedAmount !== 'number' || d.returnedAmount < 0) return { valid: false, message: 'Потрібна сума повернення (≥ 0).' };
      if (d.returnedAmount > amount) return { valid: false, message: 'Сума повернення не може перевищувати суму застави.' };
    }
    return { valid: true, message: null };
  };

  const saveCard1 = async () => {
    const prop = properties.find(p => p.id === selectedPropertyId) ?? null;
    const draftSnapshot = card1Draft;
    if (!prop || !draftSnapshot) return;
    const depositCheck = isCard1DepositValid(draftSnapshot.deposit);
    if (!depositCheck.valid) {
      setCard1DepositError(depositCheck.message);
      return;
    }
    setCard1DepositError(null);
    const paymentDay = draftSnapshot.tenant.paymentDayOfMonth;
    if (paymentDay != null && (paymentDay < 1 || paymentDay > 31 || !Number.isInteger(paymentDay))) {
      alert('День оплати має бути числом від 1 до 31.');
      return;
    }
    const scPaymentDay = draftSnapshot.secondCompany?.paymentDayOfMonth;
    if (scPaymentDay != null && (scPaymentDay < 1 || scPaymentDay > 31 || !Number.isInteger(scPaymentDay))) {
      alert('День оплати (2-га фірма) має бути числом від 1 до 31.');
      return;
    }
    if (editingRentTimelineRowId && rentTimelineEditDraft) {
      const d = rentTimelineEditDraft;
      setRentTimelineEditError(null);
      if (!d.validFrom?.trim()) {
        setRentTimelineEditError('Дата «Дійсний з» обовʼязкова.');
        return;
      }
      const num = (s: string) => (s === '' || s == null) ? 0 : parseFloat(s);
      const kmNum = num(d.km), bkNum = num(d.bk), hkNum = num(d.hk);
      const mietsteuerNum = num(d.mietsteuer), unternehmenssteuerNum = num(d.unternehmenssteuer);
      const stromNum = num(d.strom), muellNum = num(d.muell), gasNum = num(d.gas), wasserNum = num(d.wasser);
      const allNums = [kmNum, bkNum, hkNum, mietsteuerNum, unternehmenssteuerNum, stromNum, muellNum, gasNum, wasserNum];
      if (allNums.some(n => Number.isNaN(n) || n < 0)) {
        setRentTimelineEditError('Усі числові поля мають бути числами ≥ 0.');
        return;
      }
      if (d.validTo?.trim() && d.validTo < d.validFrom) {
        setRentTimelineEditError('Дата «Дійсний по» не може бути раніше за «Дійсний з».');
        return;
      }
      try {
        await rentTimelineService.updateRow(editingRentTimelineRowId, {
          valid_from: d.validFrom.trim(),
          valid_to: (d.validTo?.trim() && d.validTo.trim() !== '∞') ? d.validTo.trim() : null,
          km: kmNum,
          mietsteuer: mietsteuerNum,
          unternehmenssteuer: unternehmenssteuerNum,
          bk: bkNum,
          hk: hkNum,
          muell: muellNum,
          strom: stromNum,
          gas: gasNum,
          wasser: wasserNum,
        });
        const rows = await rentTimelineService.listRows(selectedPropertyId!);
        setOwnerRentTimelineDbRows(rows);
      } catch (err) {
        console.error('Rent timeline update error:', err);
        setRentTimelineEditError(err instanceof Error ? err.message : 'Помилка збереження рядка.');
        return;
      }
      setEditingRentTimelineRowId(null);
      setRentTimelineEditDraft(null);
      setRentTimelineEditError(null);
    }
    try {
      const t = draftSnapshot.tenant;
      const tenantPayload: TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number } = {
        name: t.name ?? '',
        phone: (t.phones?.[0] ?? t.phone) ?? '',
        email: (t.emails?.[0] ?? t.email) ?? '',
        rent: typeof t.rent === 'number' ? t.rent : 0,
        deposit: typeof t.deposit === 'number' ? t.deposit : 0,
        startDate: t.startDate ?? '',
        km: typeof t.km === 'number' ? t.km : 0,
        bk: typeof t.bk === 'number' ? t.bk : 0,
        hk: typeof t.hk === 'number' ? t.hk : 0,
        phones: t.phones?.length ? t.phones : undefined,
        emails: t.emails?.length ? t.emails : undefined,
        address: t.address,
        iban: t.iban ?? '',
        paymentDayOfMonth: paymentDay
      };
      const sc = draftSnapshot.secondCompany;
      const secondCompanyPayload: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number }) | null = (sc?.name?.trim()) ? {
        name: sc.name ?? '',
        phone: (sc.phones?.[0] ?? sc.phone) ?? '',
        email: (sc.emails?.[0] ?? sc.email) ?? '',
        rent: typeof sc.rent === 'number' ? sc.rent : 0,
        deposit: typeof sc.deposit === 'number' ? sc.deposit : 0,
        startDate: sc.startDate ?? '',
        km: typeof sc.km === 'number' ? sc.km : 0,
        bk: typeof sc.bk === 'number' ? sc.bk : 0,
        hk: typeof sc.hk === 'number' ? sc.hk : 0,
        phones: sc.phones?.length ? sc.phones : undefined,
        emails: sc.emails?.length ? sc.emails : undefined,
        address: sc.address,
        iban: sc.iban ?? '',
        paymentDayOfMonth: scPaymentDay ?? undefined
      } : null;
      const depositPayload: PropertyDeposit | null = draftSnapshot.deposit != null
        ? {
            amount: typeof draftSnapshot.deposit.amount === 'number' ? draftSnapshot.deposit.amount : 0,
            status: draftSnapshot.deposit.status ?? 'unpaid',
            paidAt: draftSnapshot.deposit.paidAt?.trim() || undefined,
            paidTo: draftSnapshot.deposit.paidTo?.trim() || undefined,
            returnedAt: draftSnapshot.deposit.returnedAt?.trim() || undefined,
            returnedAmount: draftSnapshot.deposit.returnedAmount,
            returnStatus: draftSnapshot.deposit.returnStatus ?? 'unpaid'
          }
        : null;
      await Promise.all([
        paymentChainService.upsertEdge(prop.id, 'C1_TO_OWNER', {
          payByDayOfMonth: paymentTiles.from_company1_to_owner.payByDayOfMonth ?? null,
          amount_total: paymentTiles.from_company1_to_owner.total || null,
          description: paymentTiles.from_company1_to_owner.description || null,
          breakdown: Object.keys(paymentTiles.from_company1_to_owner.breakdown).length ? paymentTiles.from_company1_to_owner.breakdown : null,
        }),
        paymentChainService.upsertEdge(prop.id, 'C2_TO_C1', {
          payByDayOfMonth: paymentTiles.from_company2_to_company1.payByDayOfMonth ?? null,
          amount_total: paymentTiles.from_company2_to_company1.total || null,
          description: paymentTiles.from_company2_to_company1.description || null,
          breakdown: Object.keys(paymentTiles.from_company2_to_company1.breakdown).length ? paymentTiles.from_company2_to_company1.breakdown : null,
        }),
      ]);
      const updated = await propertiesService.update(prop.id, {
        address: draftSnapshot.address,
        zip: draftSnapshot.zip,
        city: draftSnapshot.city,
        country: draftSnapshot.country,
        title: draftSnapshot.title,
        details: { ...(prop.details ?? {}), floor: draftSnapshot.floor, buildingFloors: draftSnapshot.buildingFloors },
        apartmentStatus: draftSnapshot.apartmentStatus,
        landlord: draftSnapshot.landlord,
        management: draftSnapshot.management,
        tenant: tenantPayload,
        secondCompany: secondCompanyPayload === null ? null : (secondCompanyPayload ?? undefined),
        deposit: depositPayload,
      });
      const { data: { user } } = await supabase.auth.getUser();
      const entries = user?.id
        ? propertyToPartiesAddressBookEntries(user.id, {
            landlord: draftSnapshot.landlord,
            tenant: tenantPayload,
            secondCompany: secondCompanyPayload ?? undefined,
            management: draftSnapshot.management,
          })
        : [];
      setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedPropertyId(updated.id);
      setIsEditingCard1(false);
      setCard1Draft(null);
      if (user?.id && entries.length > 0) {
        try {
          setAddressBookLastError(null);
          await addressBookPartiesService.upsertMany(entries);
        } catch (e) {
          console.error('[AddressBook upsertMany]', e);
          setAddressBookLastError(String((e as Error)?.message ?? e));
        }
      }
    } catch (err) {
      console.error('Card 1 save error:', err);
      alert('Помилка збереження. Спробуйте ще раз.');
    }
  };

  const addRentIncrease = async () => {
    if (!selectedPropertyId) return;
    const { validFrom, validTo, km, mietsteuer, unternehmenssteuer, bk, hk, muell, strom, gas, wasser } = rentIncreaseForm;
    setRentIncreaseFormError(null);
    if (!validFrom?.trim()) {
      setRentIncreaseFormError('Дата «Дійсний з» обовʼязкова.');
      return;
    }
    const num = (s: string) => (s === '' || s == null) ? 0 : parseFloat(s);
    const kmNum = num(km), bkNum = num(bk), hkNum = num(hk);
    const mietsteuerNum = num(mietsteuer), unternehmenssteuerNum = num(unternehmenssteuer);
    const stromNum = num(strom), muellNum = num(muell), gasNum = num(gas), wasserNum = num(wasser);
    const allNums = [kmNum, bkNum, hkNum, mietsteuerNum, unternehmenssteuerNum, stromNum, muellNum, gasNum, wasserNum];
    if (allNums.some(n => Number.isNaN(n) || n < 0)) {
      setRentIncreaseFormError('Усі числові поля мають бути числами ≥ 0.');
      return;
    }
    if (validTo?.trim()) {
      if (validTo < validFrom) {
        setRentIncreaseFormError('Дата «Дійсний по» не може бути раніше за «Дійсний з».');
        return;
      }
    }
    setIsAddingRentIncrease(true);
    try {
      await rentTimelineService.insertRow(selectedPropertyId, {
        valid_from: validFrom.trim(),
        valid_to: (validTo?.trim() && validTo.trim() !== '∞') ? validTo.trim() : null,
        km: kmNum,
        mietsteuer: mietsteuerNum,
        unternehmenssteuer: unternehmenssteuerNum,
        bk: bkNum,
        hk: hkNum,
        muell: muellNum,
        strom: stromNum,
        gas: gasNum,
        wasser: wasserNum,
        status: 'ACTIVE'
      });
      const rows = await rentTimelineService.listRows(selectedPropertyId);
      setOwnerRentTimelineDbRows(rows);
      setShowAddRentIncreaseForm(false);
      setRentIncreaseForm({ validFrom: '', validTo: '', km: '', mietsteuer: '', unternehmenssteuer: '', bk: '', hk: '', muell: '', strom: '', gas: '', wasser: '' });
    } catch (err) {
      console.error('Add rent increase error:', err);
      alert(err instanceof Error ? err.message : 'Помилка збереження. Спробуйте ще раз.');
    } finally {
      setIsAddingRentIncrease(false);
    }
  };

  useEffect(() => {
    setIsCard2Editing(false);
    setCard2Draft(null);
  }, [selectedPropertyId]);

  useEffect(() => {
    setIsEditingCard1(false);
    setCard1Draft(null);
    setLeaseTermDraft(null);
    setShowAddRentIncreaseForm(false);
    setRentIncreaseForm({ validFrom: '', validTo: '', km: '', mietsteuer: '', unternehmenssteuer: '', bk: '', hk: '', muell: '', strom: '', gas: '', wasser: '' });
    setRentIncreaseFormError(null);
    setEditingRentTimelineRowId(null);
    setRentTimelineEditDraft(null);
    setRentTimelineEditError(null);
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setCard1Documents([]);
      setCard1DocumentsError(null);
      return;
    }
    setCard1DocumentsLoading(true);
    setCard1DocumentsError(null);
    propertyDocumentsService.listPropertyDocuments(selectedPropertyId)
      .then(setCard1Documents)
      .catch((e) => {
        setCard1DocumentsError(e?.message || 'Не вдалося завантажити документи');
        setCard1Documents([]);
      })
      .finally(() => setCard1DocumentsLoading(false));
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setKautionProofs({ payment: null, return: null });
      return;
    }
    Promise.all([
      propertyDepositProofsService.getLatest(selectedPropertyId, 'payment'),
      propertyDepositProofsService.getLatest(selectedPropertyId, 'return'),
    ]).then(([payment, ret]) => setKautionProofs({ payment, return: ret })).catch(() => setKautionProofs({ payment: null, return: null }));
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setLeaseTerm(null);
      return;
    }
    unitLeaseTermsService.getByPropertyId(selectedPropertyId)
      .then(setLeaseTerm)
      .catch(() => setLeaseTerm(null));
  }, [selectedPropertyId]);

  const refreshKautionProofs = () => {
    if (!selectedPropertyId) return;
    Promise.all([
      propertyDepositProofsService.getLatest(selectedPropertyId, 'payment'),
      propertyDepositProofsService.getLatest(selectedPropertyId, 'return'),
    ]).then(([payment, ret]) => setKautionProofs({ payment, return: ret })).catch(() => setKautionProofs({ payment: null, return: null }));
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
  // Separate state for confirmed bookings (from bookings table)
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([]);

  // Load reservations function (extracted for reuse)
  const loadReservations = async () => {
    try {
      // Load reservations from reservations table (holds)
      const reservationsData = await reservationsService.getAll();
      // Transform Reservation to ReservationData for compatibility
      const transformedReservations: ReservationData[] = reservationsData.map(res => {
        // Build meaningful guest label (never "N/A")
        const guestLabel = res.leadLabel 
          || (res.clientFirstName || res.clientLastName 
            ? `${res.clientFirstName || ''} ${res.clientLastName || ''}`.trim() 
            : null)
          || res.clientEmail
          || res.clientPhone
          || `Reservation #${res.id}`;
        
        return {
          id: res.id as any,
          reservationNo: res.reservationNo,
          roomId: res.propertyId,
          propertyId: res.propertyId,
          start: res.startDate,
          end: res.endDate,
          guest: guestLabel, // Never "N/A" or empty
          color: getBookingStyle(res.status as any),
          checkInTime: '15:00',
          checkOutTime: '11:00',
          status: res.status as any,
          price: res.totalGross ? `${res.totalGross} EUR` : '0.00 EUR',
          balance: '0.00 EUR',
          guests: res.guestsCount ? `${res.guestsCount} Guests` : '1 Guest',
          unit: 'AUTO-UNIT',
          comments: 'Reservation',
          paymentAccount: 'Pending',
          company: undefined, // Don't set to 'N/A', let getReservationLabel handle it
          ratePlan: 'Standard',
          guarantee: 'None',
          cancellationPolicy: 'Standard',
          noShowPolicy: 'Standard',
          channel: 'Manual',
          type: 'GUEST',
          address: res.clientAddress,
          phone: res.clientPhone,
          email: res.clientEmail,
          pricePerNight: res.pricePerNightNet,
          taxRate: res.taxRate,
          totalGross: res.totalGross?.toString(),
          guestList: [],
          clientType: 'Private',
          firstName: res.clientFirstName,
          lastName: res.clientLastName,
          companyName: undefined,
          internalCompany: undefined,
          createdAt: res.createdAt,
        } as ReservationData;
      });
      setReservations(transformedReservations);
    } catch (error) {
      console.error('Error loading reservations:', error);
    }
  };

  // Load confirmed bookings function (extracted for reuse)
  const loadConfirmedBookings = async () => {
    try {
      const bookings = await bookingsService.getAll();
      setConfirmedBookings(bookings);
    } catch (error) {
      console.error('Error loading confirmed bookings:', error);
    }
  };

  const loadLeads = async () => {
    try {
      const data = await leadsService.getAll();
      setLeads(data);
    } catch (error) {
      console.error('Error loading leads:', error);
    }
  };

  useEffect(() => {
    loadReservations();
    loadConfirmedBookings();
    loadLeads();
  }, []);

  const handleSaveReservation = async (reservation: ReservationData) => {
      try {
        // Check for overlap with confirmed bookings before creating reservation
        const propertyId = reservation.propertyId || reservation.roomId;
        if (propertyId) {
          const hasOverlap = await checkBookingOverlap(propertyId, reservation.start, reservation.end);
          if (hasOverlap) {
            alert('This date range conflicts with a confirmed booking. Please choose different dates.');
            return;
          }
        }

        // Convert ReservationData to Reservation format for database
        const reservationToSave: Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'> = {
          propertyId: reservation.propertyId || reservation.roomId,
          startDate: reservation.start,
          endDate: reservation.end,
          status: 'open',
          leadLabel: reservation.guest || `${reservation.firstName || ''} ${reservation.lastName || ''}`.trim() || reservation.companyName,
          clientFirstName: reservation.firstName,
          clientLastName: reservation.lastName,
          clientEmail: reservation.email,
          clientPhone: reservation.phone,
          clientAddress: reservation.address,
          guestsCount: parseInt(reservation.guests?.replace(/\D/g, '') || '1'),
          pricePerNightNet: reservation.pricePerNight,
          taxRate: reservation.taxRate || 19,
          totalNights: Math.ceil((new Date(reservation.end).getTime() - new Date(reservation.start).getTime()) / (1000 * 60 * 60 * 24)),
          totalGross: parseFloat(reservation.totalGross?.replace(/[^\d.]/g, '') || '0'),
        };
        
        const savedReservation = await reservationsService.create(reservationToSave);
        
        // Update local state - transform Reservation back to ReservationData (include reservationNo from API)
        const newReservation: ReservationData = {
          id: savedReservation.id as any,
          reservationNo: savedReservation.reservationNo,
          roomId: savedReservation.propertyId,
          propertyId: savedReservation.propertyId,
          start: savedReservation.startDate,
          end: savedReservation.endDate,
          guest: savedReservation.leadLabel || `${savedReservation.clientFirstName || ''} ${savedReservation.clientLastName || ''}`.trim() || 'Guest',
          color: getBookingStyle(savedReservation.status as any),
          checkInTime: '15:00',
          checkOutTime: '11:00',
          status: savedReservation.status as any,
          price: savedReservation.totalGross ? `${savedReservation.totalGross} EUR` : '0.00 EUR',
          balance: '0.00 EUR',
          guests: savedReservation.guestsCount ? `${savedReservation.guestsCount} Guests` : '1 Guest',
          unit: 'AUTO-UNIT',
          comments: 'Reservation',
          paymentAccount: 'Pending',
          company: 'N/A',
          ratePlan: 'Standard',
          guarantee: 'None',
          cancellationPolicy: 'Standard',
          noShowPolicy: 'Standard',
          channel: 'Manual',
          type: 'GUEST',
          address: savedReservation.clientAddress,
          phone: savedReservation.clientPhone,
          email: savedReservation.clientEmail,
          pricePerNight: savedReservation.pricePerNightNet,
          taxRate: savedReservation.taxRate,
          totalGross: savedReservation.totalGross?.toString(),
          guestList: [],
          clientType: 'Private',
          firstName: savedReservation.clientFirstName,
          lastName: savedReservation.clientLastName,
          createdAt: savedReservation.createdAt,
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
          const isCompany = reservation.clientType === 'Company' || !!reservation.companyName;
          const name = isCompany
            ? (reservation.companyName || reservation.company || reservation.guest)
            : (reservation.guest || `${reservation.firstName || ''} ${reservation.lastName || ''}`.trim());
          if (!name || !name.trim()) return;

          const leadsNow = await leadsService.getAll();
          if (leadExistsByContact(reservation.email || '', reservation.phone || '', leadsNow)) return;

          try {
            const newLead = await leadsService.create({
              name: name.trim(),
              type: isCompany ? 'Company' : 'Private',
              contactPerson: isCompany ? (reservation.guest || `${reservation.firstName || ''} ${reservation.lastName || ''}`.trim() || undefined) : undefined,
              email: reservation.email || '',
              phone: reservation.phone || '',
              address: reservation.address || '',
              status: 'Active',
              createdAt: new Date().toISOString().split('T')[0],
              source: `reservation-${savedReservation.id}`
            });
            setLeads(prev => [...prev, newLead].sort((a, b) => a.name.localeCompare(b.name)));
          } catch (e) {
            console.error('Failed to create lead from reservation:', e);
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
      
      // Convert ReservationData updates to Reservation format
      const reservationIdStr = typeof reservationId === 'string' ? reservationId : reservationId.toString();
      
      // Map ReservationData status to Reservation status
      const reservationUpdates: Partial<Reservation> = {};
      if (updates.status) {
        // Map BookingStatus or string status to Reservation status
        const statusMap: Record<string, 'open' | 'offered' | 'invoiced' | 'won' | 'lost' | 'cancelled'> = {
          'reserved': 'open',
          'open': 'open',
          'offer_prepared': 'offered',
          'offer_sent': 'offered',
          'offered': 'offered',
          'invoiced': 'invoiced',
          'paid': 'won',
          'won': 'won',
          'completed': 'won',
          'lost': 'lost',
          'cancelled': 'cancelled',
        };
        const statusStr = String(updates.status);
        reservationUpdates.status = statusMap[statusStr] || (statusStr as 'open' | 'offered' | 'invoiced' | 'won' | 'lost' | 'cancelled');
      }
      
      // Update reservation in database using reservationsService
      const updatedReservation = await reservationsService.update(reservationIdStr, reservationUpdates);
      
      // Reload reservations to get updated data
      const reservationsData = await reservationsService.getAll();
      const transformedReservations: ReservationData[] = reservationsData.map(res => ({
        id: res.id as any,
        reservationNo: res.reservationNo,
        roomId: res.propertyId,
        propertyId: res.propertyId,
        start: res.startDate,
        end: res.endDate,
        guest: res.leadLabel || `${res.clientFirstName || ''} ${res.clientLastName || ''}`.trim() || 'Guest',
        color: getBookingStyle(res.status as any),
        checkInTime: '15:00',
        checkOutTime: '11:00',
        status: res.status as any,
        price: res.totalGross ? `${res.totalGross} EUR` : '0.00 EUR',
        balance: '0.00 EUR',
        guests: res.guestsCount ? `${res.guestsCount} Guests` : '1 Guest',
        unit: 'AUTO-UNIT',
        comments: 'Reservation',
        paymentAccount: 'Pending',
        company: 'N/A',
        ratePlan: 'Standard',
        guarantee: 'None',
        cancellationPolicy: 'Standard',
        noShowPolicy: 'Standard',
        channel: 'Manual',
        type: 'GUEST',
        address: res.clientAddress,
        phone: res.clientPhone,
        email: res.clientEmail,
        pricePerNight: res.pricePerNightNet,
        taxRate: res.taxRate,
        totalGross: res.totalGross?.toString(),
        guestList: [],
        clientType: 'Private',
        firstName: res.clientFirstName,
        lastName: res.clientLastName,
        createdAt: res.createdAt,
      })) as ReservationData[];
      
      setReservations(transformedReservations);
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
  
  const handleAddLeadFromBooking = async (bookingData: any) => {
    const isCompany = bookingData.clientType === 'Company' || !!bookingData.companyName;
    const name = isCompany
      ? (bookingData.companyName || bookingData.company || bookingData.guest)
      : (bookingData.guest || `${bookingData.firstName || ''} ${bookingData.lastName || ''}`.trim());
    if (!name || !name.trim()) return;

    const leadsNow = await leadsService.getAll();
    if (leadExistsByContact(bookingData.email || '', bookingData.phone || '', leadsNow)) return;

    try {
      const newLead = await leadsService.create({
        name: name.trim(),
        type: isCompany ? 'Company' : 'Private',
        contactPerson: isCompany ? (bookingData.guest || `${bookingData.firstName || ''} ${bookingData.lastName || ''}`.trim() || undefined) : undefined,
        email: bookingData.email || '',
        phone: bookingData.phone || '',
        address: bookingData.address || '',
        status: 'Active',
        createdAt: new Date().toISOString().split('T')[0],
        source: bookingData.source || `booking-${bookingData.id || Date.now()}`
      });
      setLeads(prev => [...prev, newLead].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error('Failed to create lead from booking:', e);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm('Видалити цей лід? Це не видалить резервації чи оферти.')) return;
    try {
      await leadsService.delete(id);
      setLeads(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error('Error deleting lead:', e);
      alert('Не вдалося видалити лід.');
    }
  };

  const handleSaveLeadEdit = async (id: string, updates: Partial<Lead>) => {
    try {
      const updated = await leadsService.update(id, updates);
      setLeads(prev => prev.map(l => l.id === id ? updated : l));
      setEditingLead(null);
    } catch (e) {
      console.error('Error updating lead:', e);
      alert('Не вдалося зберегти зміни.');
    }
  };

  const handleDeleteReservation = async (id: number | string) => {
      try {
        // Debug logging
        console.log('[DELETE] reservationsService.delete', id);
        
        // Convert id to string for comparison
        const idStr = String(id);
        
        // Find reservation to get the UUID if id is number
        const reservation = reservations.find(r => String(r.id) === idStr);
        if (!reservation) {
          console.error('Reservation not found:', id);
          alert('Reservation not found. It may have already been deleted.');
          return;
        }
        
        // Use the reservation's id (which might be UUID string or number)
        const reservationId = typeof reservation.id === 'string' ? reservation.id : idStr;
        
        // Use reservationsService.delete (not bookingsService)
        await reservationsService.delete(reservationId);
        
        // Refresh reservations list from database
        await loadReservations();
        
        // Also refresh confirmed bookings if calendar uses both
        await loadConfirmedBookings();
      } catch (error) {
        console.error('Error deleting reservation:', error);
        alert('Failed to delete reservation. Please try again.');
      }
  };

  const handleDeleteBooking = async (bookingId: number | string) => {
    try {
      await bookingsService.delete(bookingId);
      await loadConfirmedBookings();
    } catch (error) {
      console.error('Error deleting booking:', error);
      alert('Не вдалося видалити бронювання. Спробуйте ще раз.');
    }
  };

  const openManageModal = (reservation: ReservationData) => {
      setViewingOffer(false);
      setSelectedReservation({ ...reservation, isReservation: true } as ReservationData & { isReservation: true });
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

  const handleDeleteOffer = async (offerId: string) => {
      if (!confirm('Are you sure you want to delete this offer? This action cannot be undone.')) {
          return;
      }

      try {
          await offersService.delete(offerId);
          setOffers(prev => prev.filter(o => o.id !== offerId));
      } catch (error) {
          console.error('Error deleting offer:', error);
          alert('Failed to delete offer. Please try again.');
      }
  };

  const handleConvertToOffer = async (status: 'Draft' | 'Sent', internalCompany: string, email: string, phone: string, clientMessage: string) => {
      if (!selectedReservation) return;
      try {
          // Use propertyId if available (UUID), otherwise fall back to roomId
          const propertyId = selectedReservation.propertyId || selectedReservation.roomId;
          
          const offerToCreate: Omit<OfferData, 'id'> = {
              clientName: selectedReservation.guest,
              propertyId: propertyId, 
              internalCompany: internalCompany,
              price: selectedReservation.totalGross || selectedReservation.price,
              dates: `${selectedReservation.start} to ${selectedReservation.end}`,
              status: status,
              guests: selectedReservation.guests,
              email: email || selectedReservation.email,
              phone: phone || selectedReservation.phone,
              address: selectedReservation.address,
              checkInTime: selectedReservation.checkInTime,
              checkOutTime: selectedReservation.checkOutTime,
              guestList: selectedReservation.guestList,
              comments: selectedReservation.comments,
              unit: selectedReservation.unit,
              clientMessage: clientMessage,
              reservationId: selectedReservation.id as string, // Link offer to reservation
          };
          
          // Зберегти офер в БД
          const savedOffer = await offersService.create(offerToCreate);
          setOffers(prev => [savedOffer, ...prev]);
          
          // Оновити статус резервації на 'offered' when offer is created
          // Note: Reservation status uses 'offered', not BookingStatus
          await updateReservationInDB(selectedReservation.id, { status: 'offered' as any });
          
          // Show toast notification and set created offer ID for "Open Offer" link
          if (status === 'Sent') {
              setToastMessage('Offer sent successfully!');
              setCreatedOfferId(savedOffer.id);
              setTimeout(() => {
                  setToastMessage(null);
              }, 5000);
          }
          
          closeManageModals();
          if (status === 'Sent') {
              // Don't auto-redirect, let user click "Open Offer" link
          } else {
              setSalesTab('offers');
          }
      } catch (error) {
          console.error('Error creating offer:', error);
          alert('Failed to save offer to database. Please try again.');
      }
  };
  
  const handleSendOffer = async () => {
      if (!selectedReservation) return;
      
      try {
          // Generate default client message template
          const guestName = selectedReservation.guest || 'Guest';
          const checkInDate = selectedReservation.start 
            ? new Date(selectedReservation.start).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
          const checkOutDate = selectedReservation.end 
            ? new Date(selectedReservation.end).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
          const totalPrice = selectedReservation.totalGross || selectedReservation.price || '0.00 EUR';
          const internalCompany = selectedReservation.internalCompany || 'Sotiso';
          
          const defaultClientMessage = `Hello ${guestName},

thank you for your interest in the apartment.

Your stay: ${checkInDate}${checkOutDate ? ` – ${checkOutDate}` : ''}
Total price: ${totalPrice}

Please find the offer attached.

Best regards,
${internalCompany} Team`;
          
          // Створити Offer об'єкт з даних резервації (без id для створення нового)
          const offerToCreate: Omit<OfferData, 'id'> = {
              clientName: selectedReservation.guest,
              propertyId: selectedReservation.propertyId || selectedReservation.roomId,
              internalCompany: selectedReservation.internalCompany || 'Sotiso',
              price: selectedReservation.totalGross || selectedReservation.price,
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
              reservationId: selectedReservation.id as string, // Link offer to reservation
              clientMessage: defaultClientMessage, // Client-facing message
          };
          
          // Зберегти Offer в БД
          const savedOffer = await offersService.create(offerToCreate);
          
          // Додати Offer в масив offers
          setOffers(prev => [savedOffer, ...prev]);
          
          // Оновити статус резервації на 'offered' when offer is sent
          // Note: Reservation status uses 'offered', not BookingStatus
          await updateReservationInDB(selectedReservation.id, { 
            status: 'offered' as any
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
    // Якщо це резервація, зібрати один об'єкт з усіма полями резервації для модалки
    if ('roomId' in offer && 'start' in offer) {
      const reservation = offer as ReservationData;
      const offerData = {
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
        // Усі додаткові поля резервації для відображення в модалці
        reservationNo: reservation.reservationNo,
        bookingNo: reservation.bookingNo,
        company: reservation.company,
        companyName: reservation.companyName,
        ratePlan: reservation.ratePlan,
        firstName: reservation.firstName,
        lastName: reservation.lastName,
        guarantee: reservation.guarantee,
        cancellationPolicy: reservation.cancellationPolicy,
        noShowPolicy: reservation.noShowPolicy,
        balance: reservation.balance,
        paymentAccount: reservation.paymentAccount,
        channel: reservation.channel,
        pricePerNight: reservation.pricePerNight,
        taxRate: reservation.taxRate,
        totalGross: reservation.totalGross,
        clientType: reservation.clientType,
      } as OfferData;
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

  const handleAddInvoiceToProforma = (proforma: InvoiceData) => {
    setSelectedProformaForInvoice(proforma);
    setSelectedOfferForInvoice(null);
    setSelectedInvoice(null);
    setIsInvoiceModalOpen(true);
  };

  const toggleProformaExpand = async (proformaId: string) => {
    setExpandedProformaIds(prev => {
      if (prev.has(proformaId)) {
        const next = new Set(prev);
        next.delete(proformaId);
        return next;
      }
      return new Set([proformaId]);
    });
    if (!proformaChildInvoices[proformaId]) {
      try {
        const children = await invoicesService.getInvoicesByProformaId(proformaId);
        setProformaChildInvoices(prev => ({ ...prev, [proformaId]: children }));
      } catch (e) {
        console.error('Error loading invoices for proforma:', e);
      }
    }
    if (!paymentProofsByInvoiceId[proformaId]) {
      loadPaymentProofsForInvoiceIds([proformaId]);
    }
  };

  const handleDeleteProforma = async (proforma: InvoiceData) => {
    if (!window.confirm(`Видалити проформу ${proforma.invoiceNumber}?`)) return;
    try {
      await invoicesService.delete(proforma.id);
      const bookings = await bookingsService.getAll();
      const linkedBookings = bookings.filter(b => b.sourceInvoiceId != null && String(b.sourceInvoiceId) === String(proforma.id));
      for (const b of linkedBookings) {
        await bookingsService.delete(b.id);
      }
      if (linkedBookings.length > 0) {
        const updatedBookings = await bookingsService.getAll();
        setConfirmedBookings(updatedBookings);
      }
      setProformas(prev => prev.filter(p => p.id !== proforma.id));
      setExpandedProformaIds(prev => { const next = new Set(prev); next.delete(proforma.id); return next; });
      setProformaChildInvoices(prev => { const next = { ...prev }; delete next[proforma.id]; return next; });
    } catch (e) {
      console.error('Error deleting proforma:', e);
      alert('Не вдалося видалити проформу.');
    }
  };

  const handleDeleteInvoice = async (inv: InvoiceData, proformaId: string) => {
    if (!window.confirm(`Видалити інвойс ${inv.invoiceNumber}?`)) return;
    try {
      await invoicesService.delete(inv.id);
      setProformaChildInvoices(prev => ({
        ...prev,
        [proformaId]: (prev[proformaId] ?? []).filter(i => i.id !== inv.id)
      }));
    } catch (e) {
      console.error('Error deleting invoice:', e);
      alert('Не вдалося видалити інвойс.');
    }
  };

  const refreshDataAfterPaymentConfirmed = async (newBookingId: string) => {
    const reservationsData = await reservationsService.getAll();
    const transformedReservations: ReservationData[] = reservationsData.map(res => ({
      id: res.id as any,
      reservationNo: res.reservationNo,
      roomId: res.propertyId,
      propertyId: res.propertyId,
      start: res.startDate,
      end: res.endDate,
      guest: res.leadLabel || `${res.clientFirstName || ''} ${res.clientLastName || ''}`.trim() || 'Guest',
      color: getBookingStyle(res.status as any),
      checkInTime: '15:00',
      checkOutTime: '11:00',
      status: res.status as any,
      price: res.totalGross ? `${res.totalGross} EUR` : '0.00 EUR',
      balance: '0.00 EUR',
      guests: res.guestsCount ? `${res.guestsCount} Guests` : '1 Guest',
      unit: 'AUTO-UNIT',
      comments: 'Reservation',
      paymentAccount: 'Pending',
      company: 'N/A',
      ratePlan: 'Standard',
      guarantee: 'None',
      cancellationPolicy: 'Standard',
      noShowPolicy: 'Standard',
      channel: 'Manual',
      type: 'GUEST',
      address: res.clientAddress,
      phone: res.clientPhone,
      email: res.clientEmail,
      pricePerNight: res.pricePerNightNet,
      taxRate: res.taxRate,
      totalGross: res.totalGross?.toString(),
      guestList: [],
      clientType: 'Private',
      firstName: res.clientFirstName,
      lastName: res.clientLastName,
      createdAt: res.createdAt,
    })) as ReservationData[];
    setReservations(transformedReservations);
    const bookings = await bookingsService.getAll();
    setConfirmedBookings(bookings);
    const offersData = await offersService.getAll();
    setOffers(offersData);
    const list = await invoicesService.getProformas();
    setProformas(list);
    const invoicesData = await invoicesService.getAll();
    setInvoices(invoicesData);
    setProformaChildInvoices({});
    setExpandedProformaIds(new Set());
    await loadPaymentProofsForInvoiceIds(list.map(p => p.id));

    const newBooking = bookings.find(b => String(b.id) === String(newBookingId));
    if (newBooking) {
      const existingTasks = adminEvents.filter(e => {
        if (!e.bookingId) return false;
        return String(e.bookingId) === String(newBooking.id);
      });
      const hasEinzugTask = existingTasks.some(e => e.type === 'Einzug');
      const hasAuszugTask = existingTasks.some(e => e.type === 'Auszug');
      if (!hasEinzugTask || !hasAuszugTask) {
        const property = properties.find(p => p.id === newBooking.propertyId || p.id === newBooking.roomId || String(p.id) === String(newBooking.propertyId));
        const propertyName = property?.title || property?.address || newBooking.address || newBooking.roomId || 'Unknown';
        const tasks = createFacilityTasksForBooking(newBooking, propertyName);
        const newTasks = tasks.filter(task =>
          (task.type === 'Einzug' && !hasEinzugTask) || (task.type === 'Auszug' && !hasAuszugTask)
        );
        const savedTasks: CalendarEvent[] = [];
        for (const task of newTasks) {
          try {
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
          } catch (err) {
            console.error('Error creating Facility task:', err);
          }
        }
        if (savedTasks.length > 0) {
          setAdminEvents(prev => [...prev, ...savedTasks]);
          window.dispatchEvent(new CustomEvent('taskUpdated'));
        }
        setProperties(prev => prev.map(prop => {
          if (prop.id === newBooking.propertyId || String(prop.id) === String(newBooking.roomId)) {
            const newLogs: MeterLogEntry[] = [
              { date: newBooking.start, type: 'Check-In', bookingId: newBooking.id, readings: { electricity: 'Pending', water: 'Pending', gas: 'Pending' } },
              { date: newBooking.end, type: 'Check-Out', bookingId: newBooking.id, readings: { electricity: 'Pending', water: 'Pending', gas: 'Pending' } }
            ];
            return { ...prop, meterLog: [...(prop.meterLog || []), ...newLogs] };
          }
          return prop;
        }));
      }
    }
  };

  const handleRetryProofConfirmation = async (proforma: InvoiceData, proof: PaymentProof) => {
    if (proforma.status === 'Paid') return;
    if (proof.rpcConfirmedAt) return;
    try {
      await markInvoicePaidAndConfirmBooking(proforma.id);
      await paymentProofsService.update(proof.id, { rpcConfirmedAt: new Date().toISOString() });
      await loadPaymentProofsForInvoiceIds([proforma.id]);
    } catch (e) {
      console.error('Retry confirmation failed:', e);
      alert(`Retry failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleConfirmProformaPayment = async (proforma: InvoiceData) => {
    if (proforma.status === 'Paid') return;
    const offerId = proforma.offerId || proforma.offerIdSource;
    if (!offerId) {
      alert('Щоб підтвердити оплату, проформа має бути прив’язана до оффера. Додайте проформу з розділу Оффери (Offers).');
      return;
    }
    if (!window.confirm(`Підтвердити оплату проформи ${proforma.invoiceNumber}? Буде створено підтверджене бронювання.`)) return;
    try {
      const newBookingId = await markInvoicePaidAndConfirmBooking(proforma.id);
      await refreshDataAfterPaymentConfirmed(newBookingId);
      alert('Оплату підтверджено. Створено підтверджене бронювання.');
    } catch (e: any) {
      console.error('Error confirming proforma payment:', e);
      alert(`Не вдалося підтвердити оплату: ${e.message || 'невідома помилка'}`);
    }
  };
  
  const handleSaveInvoice = async (invoice: InvoiceData) => {
      // #region agent log
      console.log('💾 handleSaveInvoice called with:', { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, bookingId: invoice.bookingId, bookingIdType: typeof invoice.bookingId, offerIdSource: invoice.offerIdSource, offerIdSourceType: typeof invoice.offerIdSource, status: invoice.status });
      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2142',message:'handleSaveInvoice called',data:{invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,status:invoice.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
      // #endregion
      
      // If reservationId not set but we can find reservation by offerIdSource, set reservationId (not bookingId; booking_id only after payment confirmed)
      if (!invoice.reservationId && !invoice.bookingId && invoice.offerIdSource) {
          const reservationByOfferId = reservations.find(r => {
              if (String(r.id) === String(invoice.offerIdSource)) return true;
              const rIdStr = String(r.id);
              const offerIdStr = String(invoice.offerIdSource);
              return rIdStr.toLowerCase() === offerIdStr.toLowerCase();
          });
          
          if (reservationByOfferId) {
              invoice.reservationId = String(reservationByOfferId.id);
          } else {
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
                      invoice.reservationId = reservationByPropertyAndDate.id;
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
              invoice.offerIdSource = String(savedOffer.id);
              // #region agent log
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2174',message:'Saved offer to Supabase and updated invoice.offerIdSource',data:{oldOfferId:localOffer.id,newOfferId:savedOffer.id,newOfferIdType:typeof savedOffer.id,invoiceOfferIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
              // #endregion
              
              // Link invoice to reservation (not booking; booking_id only after payment confirmed)
              if (!invoice.reservationId && (!invoice.bookingId || invoice.bookingId === localOffer.id || String(invoice.bookingId) === String(localOffer.id))) {
                const relatedReservation = reservations.find(r => {
                  if (r.roomId !== localOffer.propertyId) return false;
                  const [offerStart] = localOffer.dates.split(' to ');
                  return r.start === offerStart || String(r.start) === String(offerStart);
                });
                
                if (relatedReservation) {
                  invoice.reservationId = String(relatedReservation.id);
                  // #region agent log
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2187',message:'Found related reservation and updated invoice.reservationId',data:{reservationId:relatedReservation.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
                  // #endregion
                }
              }
            } else {
              // Offer not found in local state, set to null to avoid foreign key error
              invoice.offerIdSource = undefined;
              // #region agent log
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2195',message:'Offer not found in local state, setting offerIdSource to undefined',data:{invoiceOfferIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
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
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2160',message:'Updating existing invoice in Supabase',data:{invoiceId:invoice.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
          // #endregion
          savedInvoice = await invoicesService.update(String(invoice.id), invoice);
        } else {
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2166',message:'Creating new invoice in Supabase',data:{invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
          // #endregion
          // Remove id before creating (database will generate UUID)
          const { id, ...invoiceWithoutId } = invoice;
          savedInvoice = await invoicesService.create(invoiceWithoutId);
        }
        
        // #region agent log
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2069',message:'Invoice saved to Supabase successfully',data:{invoiceId:savedInvoice.id,invoiceNumber:savedInvoice.invoiceNumber,bookingId:savedInvoice.bookingId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
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
        setSelectedProformaForInvoice(null);
        if (invoice.documentType === 'invoice' && invoice.proformaId) {
          setActiveDepartment('sales');
          setSalesTab('proformas');
          setProformaChildInvoices(prev => ({
            ...prev,
            [invoice.proformaId!]: [savedInvoice, ...(prev[invoice.proformaId!] ?? [])],
          }));
        } else if (savedInvoice.documentType === 'proforma' && !invoice.proformaId) {
          setActiveDepartment('sales');
          setSalesTab('proformas');
          setProformas(prev => [savedInvoice, ...prev]);
        } else {
          setActiveDepartment('accounting');
          setAccountingTab('invoices');
        }
      } catch (error: any) {
        // #region agent log
        const errorDetails = error?.message || error?.code || String(error);
        const errorData = error?.details || error?.hint || error;
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2095',message:'Error saving invoice to Supabase',data:{error:errorDetails,errorCode:error?.code,errorMessage:error?.message,errorDetails:errorData,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{}));
        // #endregion
        console.error('Error saving invoice:', error);
        const errorMessage = error?.message || error?.code || 'Unknown error';
        alert(`Failed to save invoice: ${errorMessage}. Please try again.`);
      }
  };

  const toggleInvoiceStatus = async (invoiceId: string) => {
    // #region agent log
    (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2090',message:'toggleInvoiceStatus called',data:{invoiceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{}));
    // #endregion
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
      // #region agent log
      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2093',message:'Invoice not found in local state',data:{invoiceId,invoiceCount:invoices.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{}));
      // #endregion
      return;
    }
    
    const newStatus = invoice.status === 'Paid' ? 'Unpaid' : 'Paid';
    // #region agent log
    console.log('🔄 toggleInvoiceStatus called:', { invoiceId, oldStatus: invoice.status, newStatus, bookingId: invoice.bookingId, offerIdSource: invoice.offerIdSource });
    (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2286',message:'Toggling invoice status',data:{invoiceId,oldStatus:invoice.status,newStatus,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{}));
    // #endregion
    
    try {
      // If marking as Paid, call RPC to confirm booking and mark competing reservations as lost
      if (newStatus === 'Paid' && invoice.status !== 'Paid') {
        // Check if invoice has offerId (required for RPC)
        const offerId = invoice.offerId || invoice.offerIdSource;
        if (!offerId) {
          alert('Invoice must be linked to an offer to mark as paid. Please create invoice from an offer.');
          return;
        }
        
        try {
          // Call RPC: marks invoice as paid, creates confirmed booking, marks competing reservations/offers as lost
          const bookingId = await markInvoicePaidAndConfirmBooking(invoiceId);
          console.log('✅ Invoice marked as paid and booking confirmed:', { invoiceId, bookingId });
          
          // Refresh all data after RPC
          // Reload reservations (some may be marked as lost)
          const reservationsData = await reservationsService.getAll();
          const transformedReservations: ReservationData[] = reservationsData.map(res => ({
            id: res.id as any,
            reservationNo: res.reservationNo,
            roomId: res.propertyId,
            propertyId: res.propertyId,
            start: res.startDate,
            end: res.endDate,
            guest: res.leadLabel || `${res.clientFirstName || ''} ${res.clientLastName || ''}`.trim() || 'Guest',
            color: getBookingStyle(res.status as any),
            checkInTime: '15:00',
            checkOutTime: '11:00',
            status: res.status as any,
            price: res.totalGross ? `${res.totalGross} EUR` : '0.00 EUR',
            balance: '0.00 EUR',
            guests: res.guestsCount ? `${res.guestsCount} Guests` : '1 Guest',
            unit: 'AUTO-UNIT',
            comments: 'Reservation',
            paymentAccount: 'Pending',
            company: 'N/A',
            ratePlan: 'Standard',
            guarantee: 'None',
            cancellationPolicy: 'Standard',
            noShowPolicy: 'Standard',
            channel: 'Manual',
            type: 'GUEST',
            address: res.clientAddress,
            phone: res.clientPhone,
            email: res.clientEmail,
            pricePerNight: res.pricePerNightNet,
            taxRate: res.taxRate,
            totalGross: res.totalGross?.toString(),
            guestList: [],
            clientType: 'Private',
            firstName: res.clientFirstName,
            lastName: res.clientLastName,
            createdAt: res.createdAt,
          })) as ReservationData[];
          setReservations(transformedReservations);
          
          // Reload confirmed bookings (new one was created)
          const bookings = await bookingsService.getAll();
          setConfirmedBookings(bookings);
          
          // Reload offers (some may be marked as lost)
          const offersData = await offersService.getAll();
          setOffers(offersData);
          
          // Reload invoices (status updated to Paid)
          const invoicesData = await invoicesService.getAll();
          setInvoices(invoicesData);
          
          alert('Invoice marked as paid. Confirmed booking created. Competing reservations marked as lost.');
        } catch (rpcError: any) {
          console.error('Error in RPC mark_invoice_paid_and_confirm_booking:', rpcError);
          alert(`Failed to confirm booking: ${rpcError.message || 'Unknown error'}`);
          return; // Don't update status if RPC failed
        }
      } else {
        // For Unpaid or other status changes, just update normally
        const updatedInvoice = await invoicesService.update(invoiceId, { status: newStatus });
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? updatedInvoice : inv));
      }
      
      // CRITICAL FIX: Check if tasks need to be created even if invoice is already Paid
      // If invoice is already Paid, we should still check and create tasks if they don't exist
      const shouldCreateTasks = newStatus === 'Paid' || (invoice.status === 'Paid' && newStatus === 'Unpaid');
      
      if (shouldCreateTasks && newStatus === 'Paid') {
          // Знайти пов'язану резервацію через bookingId або offerIdSource
          let linkedBooking: ReservationData | undefined;
          
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2110',message:'Looking for linked booking',data:{bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource,reservationsCount:reservations.length,offersCount:offers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{}));
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
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2284',message:'Searched for booking by bookingId',data:{bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,reservationsCount:reservations.length,reservationIds:reservations.map(r=>({id:r.id,idType:typeof r.id})),found:!!linkedBooking,linkedBookingId:linkedBooking?.id,linkedBookingIdType:typeof linkedBooking?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{}));
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
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2292',message:'Searched for offer by offerIdSource',data:{offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,offersCount:offers.length,offerIds:offers.map(o=>({id:o.id,idType:typeof o.id})),found:!!linkedOffer,linkedOfferId:linkedOffer?.id,linkedOfferIdType:typeof linkedOffer?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
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
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2325',message:'Created linkedBooking from offer',data:{linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id,roomId:linkedBooking.roomId,start:linkedBooking.start,end:linkedBooking.end,isUUID:isValidUUID(linkedBooking.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
                  // #endregion
              } else {
                  // #region agent log
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2328',message:'Offer not found in local state',data:{offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,offersCount:offers.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
                  // #endregion
              }
          }
          
          if (linkedBooking) {
              // #region agent log
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2148',message:'Linked booking found, updating status and creating tasks',data:{linkedBookingId:linkedBooking.id,roomId:linkedBooking.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2340',message:'Checking for existing tasks',data:{linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id,adminEventsCount:adminEvents.length,existingTasksCount:existingTasks.length,existingTaskBookingIds:existingTasks.map(t=>({id:t.id,bookingId:t.bookingId,bookingIdType:typeof t.bookingId,type:t.type})),hasEinzugTask,hasAuszugTask},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
              // #endregion
              
              // Створити Facility tasks тільки якщо вони ще не існують
              if (!hasEinzugTask || !hasAuszugTask) {
                  // Отримати назву нерухомості
                  const property = properties.find(p => p.id === linkedBooking.roomId || String(p.id) === String(linkedBooking.roomId));
                  const propertyName = property?.title || property?.address || linkedBooking.address || linkedBooking.roomId;
                  
                  // #region agent log
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2169',message:'Creating facility tasks',data:{linkedBookingId:linkedBooking.id,propertyName,roomId:linkedBooking.roomId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
                  // #endregion
                  
                  const tasks = createFacilityTasksForBooking(linkedBooking, propertyName);
                  
                  // #region agent log
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2357',message:'Created tasks from createFacilityTasksForBooking',data:{totalTasks:tasks.length,tasks:tasks.map(t=>({type:t.type,bookingId:t.bookingId,bookingIdType:typeof t.bookingId,propertyId:t.propertyId,title:t.title})),linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{}));
                  // #endregion
                  
                  // Фільтрувати таски які вже існують
                  const newTasks = tasks.filter(task => 
                      (task.type === 'Einzug' && !hasEinzugTask) ||
                      (task.type === 'Auszug' && !hasAuszugTask)
                  );
                  
                  // #region agent log
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2365',message:'Filtered new tasks to create',data:{totalTasks:tasks.length,newTasksCount:newTasks.length,newTaskTypes:newTasks.map(t=>t.type),newTaskBookingIds:newTasks.map(t=>({type:t.type,bookingId:t.bookingId,bookingIdType:typeof t.bookingId}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
                          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2375',message:'Created Facility task in database',data:{taskId:savedTask.id,taskTitle:savedTask.title,taskType:savedTask.type,bookingId:savedTask.bookingId,bookingIdType:typeof savedTask.bookingId,propertyId:savedTask.propertyId,department:savedTask.department,status:savedTask.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
                          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2540',message:'Error creating Facility task in database',data:{error:String(error),errorMessage:error?.message,errorCode:error?.code,errorDetails:error?.details,errorHint:error?.hint,taskType:task.type,taskTitle:task.title,bookingId:task.bookingId,bookingIdType:typeof task.bookingId,propertyId:task.propertyId,propertyIdType:typeof task.propertyId,workerId:task.workerId,date:task.date,status:task.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
                          // #endregion
                          console.error('❌ Error creating Facility task in database:', error);
                      }
                  }
                  
                  if (savedTasks.length > 0) {
                      setAdminEvents(prevEvents => [...prevEvents, ...savedTasks]);
                      // Notify other components and reload tasks from database
                      window.dispatchEvent(new CustomEvent('taskUpdated'));
                      // #region agent log
                      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2458',message:'✅ SUCCESS: Tasks created and taskUpdated event dispatched',data:{savedTasksCount:savedTasks.length,taskIds:savedTasks.map(t=>t.id),taskDetails:savedTasks.map(t=>({id:t.id,type:t.type,bookingId:t.bookingId,bookingIdType:typeof t.bookingId,title:t.title,propertyId:t.propertyId,department:t.department})),linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'SUCCESS'})}).catch(()=>{}));
                      // #endregion
                      console.log('✅ Created and added', savedTasks.length, 'Facility tasks to calendar');
                      console.log('✅ Task details:', savedTasks.map(t => ({ id: t.id, type: t.type, bookingId: t.bookingId, title: t.title })));
                  } else {
                      // #region agent log
                      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2465',message:'⚠️ WARNING: No tasks were created',data:{hasEinzugTask,hasAuszugTask,newTasksCount:newTasks.length,linkedBookingId:linkedBooking.id,linkedBookingIdType:typeof linkedBooking.id,totalTasksFromFunction:tasks.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
                      // #endregion
                      console.warn('⚠️ No tasks were created. Check if tasks already exist or if there was an error.');
                      console.warn('hasEinzugTask:', hasEinzugTask, 'hasAuszugTask:', hasAuszugTask, 'newTasksCount:', newTasks.length);
                  }
              } else {
                  // #region agent log
                  (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2211',message:'Tasks already exist, skipping creation',data:{hasEinzugTask,hasAuszugTask},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
              (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2430',message:'❌ CRITICAL: No linked booking found - tasks will NOT be created',data:{bookingId:invoice.bookingId,bookingIdType:typeof invoice.bookingId,offerIdSource:invoice.offerIdSource,offerIdSourceType:typeof invoice.offerIdSource,reservationsCount:reservations.length,offersCount:offers.length,reservationIds:reservations.map(r=>({id:r.id,idType:typeof r.id})),offerIds:offers.map(o=>({id:o.id,idType:typeof o.id})),invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'CRITICAL'})}).catch(()=>{}));
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
      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2238',message:'Error updating invoice status in Supabase',data:{error:String(error),invoiceId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{}));
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
      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2655',message:'H1-H5: handleAdminEventUpdate ENTRY',data:{taskId:updatedEvent.id,taskType:updatedEvent.type,bookingId:updatedEvent.bookingId,workerId:updatedEvent.workerId,date:updatedEvent.date,day:updatedEvent.day,status:updatedEvent.status,adminEventsCount:adminEvents.length,existingTaskInState:adminEvents.find(e=>e.id===updatedEvent.id)?true:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
      // #endregion
      
      // #region agent log
      const taskBeforeUpdate = adminEvents.find(e => e.id === updatedEvent.id);
      (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2660',message:'H2: Task state BEFORE local update',data:{taskId:updatedEvent.id,dateBefore:taskBeforeUpdate?.date,dayBefore:taskBeforeUpdate?.day,workerIdBefore:taskBeforeUpdate?.workerId,dateAfter:updatedEvent.date,dayAfter:updatedEvent.day,workerIdAfter:updatedEvent.workerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{}));
      // #endregion
      
      // CRITICAL: Update local state FIRST to prevent task disappearing from calendar
      // This ensures the task remains visible immediately, even before DB update completes
      setAdminEvents(prev => {
        // #region agent log
        const prevCount = prev.length;
        const taskExists = prev.find(e => e.id === updatedEvent.id);
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2667',message:'H1: BEFORE setAdminEvents local update',data:{prevCount,taskExists:!!taskExists,taskId:updatedEvent.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
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
        (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2674',message:'H1: AFTER setAdminEvents local update',data:{afterCount,taskAfterUpdate:!!taskAfterUpdate,taskId:updatedEvent.id,date:taskAfterUpdate?.date,day:taskAfterUpdate?.day},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
        // #endregion
        
        return updated;
      });
      
      try {
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2676',message:'H3: BEFORE DB update',data:{taskId:updatedEvent.id,date:updatedEvent.date,day:updatedEvent.day,workerId:updatedEvent.workerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
          // #endregion
          
          // Update in database
          const savedTask = await tasksService.update(updatedEvent.id, updatedEvent);
          console.log('✅ Task updated in database:', updatedEvent.id);
          
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2678',message:'H3: AFTER DB update',data:{taskId:savedTask.id,dateFromDB:savedTask.date,dayFromDB:savedTask.day,workerIdFromDB:savedTask.workerId,dateBeforeUpdate:updatedEvent.date,dayBeforeUpdate:updatedEvent.day},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
          // #endregion
          
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2681',message:'H1: Dispatching taskUpdated event',data:{taskId:updatedEvent.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{}));
          // #endregion
          
          // Notify other components (Kanban) about task update
          // NOTE: We do NOT reload tasks here to prevent race condition
          // The local state is already updated above, and Kanban will reload on its own
          window.dispatchEvent(new CustomEvent('taskUpdated'));
      } catch (error: any) {
          // #region agent log
          (import.meta.env.DEV && fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2690',message:'H3: ERROR in DB update',data:{taskId:updatedEvent.id,error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{}));
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
    // #region agent log
    if (selectedProperty) {
      (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:1931',message:'selectedProperty used for rendering',data:{propertyId:selectedProperty.id,propertyTitle:selectedProperty.title,inventoryCount:selectedProperty.inventory?.length||0,inventoryItems:selectedProperty.inventory?.slice(0,5).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type,sku:i.sku})),isFromMock:selectedProperty.id === '1' && selectedProperty.title === 'Apartment 1, Lviv'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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
                    onClick={() => { setPropertyToEdit(undefined); setIsPropertyAddModalOpen(true); }}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-colors"
                >
                    <Plus className="w-5 h-5" /> Додати квартиру
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
                     {(prop.details?.area != null && prop.details.area !== 0) && (
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
               {(() => {
                  const headerImageUrl = selectedProperty.image?.trim() || selectedProperty.images?.[0]?.trim() || '';
                  return headerImageUrl ? (
                     <img src={headerImageUrl} alt={selectedProperty.title} className="w-full h-full object-cover" />
                  ) : (
                     <div className="absolute inset-0 bg-[#1C1F24] flex flex-col items-center justify-center gap-2">
                        <Camera className="w-16 h-16 text-gray-600" />
                        <span className="text-sm text-gray-500">Немає фото</span>
                     </div>
                  );
               })()}
               <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-transparent to-transparent opacity-90"></div>
               <div className="absolute bottom-6 left-6 right-6">
                  <h1 className="text-4xl font-extrabold text-white mb-1 drop-shadow-md">{selectedProperty.title}</h1>
                  <p className="text-lg text-gray-300 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-500" /> {selectedProperty.fullAddress}</p>
               </div>
            </div>

            {/* Card 1 — Lease (Rent) + Identity */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Оренда квартири</h2>
                    {!isEditingCard1 ? (
                        <button type="button" onClick={startCard1Edit} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                            <Edit className="w-4 h-4 mr-1 inline" /> Редагувати
                        </button>
                    ) : null}
                </div>
                <div className="space-y-4">
                    {isEditingCard1 && card1Draft ? (
                        <>
                            <div className="grid grid-cols-12 gap-4 items-start pb-4 border-b border-gray-700">
                                <div className="col-span-8"><label className="text-xs text-gray-500 block mb-1">Вулиця + номер</label><input value={card1Draft.address} onChange={e => setCard1Draft(d => d ? { ...d, address: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="Вулиця, номер будинку" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Індекс</label><input value={card1Draft.zip} onChange={e => setCard1Draft(d => d ? { ...d, zip: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Місто</label><input value={card1Draft.city} onChange={e => setCard1Draft(d => d ? { ...d, city: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Країна</label><input value={card1Draft.country} onChange={e => setCard1Draft(d => d ? { ...d, country: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Поверх (поточний)</label><input type="number" min={0} value={card1Draft.floor} onChange={e => setCard1Draft(d => d ? { ...d, floor: parseInt(e.target.value || '0', 10) } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Поверх (всього)</label><input type="number" min={0} value={card1Draft.buildingFloors} onChange={e => setCard1Draft(d => d ? { ...d, buildingFloors: parseInt(e.target.value || '0', 10) } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Квартира / Код</label><input value={card1Draft.title} onChange={e => setCard1Draft(d => d ? { ...d, title: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                            </div>
                            <div className="grid grid-cols-12 gap-4 items-start pb-4 border-b border-gray-700">
                                <div className="col-span-4">
                                    <span className="text-xs text-gray-500 block mb-1">Статус квартири</span>
                                    <select value={card1Draft.apartmentStatus} onChange={e => setCard1Draft(d => d ? { ...d, apartmentStatus: e.target.value as 'active' | 'ooo' | 'preparation' | 'rented_worker' } : null)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 focus:outline-none">
                                        <option value="active">Активна</option>
                                        <option value="ooo">Out of order (OOO)</option>
                                        <option value="preparation">В підготовці</option>
                                        <option value="rented_worker">Здана працівнику</option>
                                    </select>
                                </div>
                            </div>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Термін договору</h3>
                                {leaseTermDraft != null ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="text-xs text-gray-500 block mb-1">Gültig von (DD.MM.YYYY)</label><input type="text" value={leaseTermDraft.contractStart ?? ''} onChange={e => setLeaseTermDraft(d => d ? { ...d, contractStart: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="DD.MM.YYYY" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Gültig bis (DD.MM.YYYY)</label><input type="text" value={leaseTermDraft.contractEnd ?? ''} onChange={e => setLeaseTermDraft(d => d ? { ...d, contractEnd: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="DD.MM.YYYY" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Vertragstyp</label><select value={leaseTermDraft.contractType} onChange={e => setLeaseTermDraft(d => d ? { ...d, contractType: e.target.value as LeaseTermDraftUi['contractType'] } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"><option value="befristet">befristet</option><option value="unbefristet">unbefristet</option><option value="mit automatischer Verlängerung">mit automatischer Verlängerung</option></select></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Erste Mietzahlung ab</label><input type="text" value={leaseTermDraft.firstPaymentDate ?? ''} onChange={e => setLeaseTermDraft(d => d ? { ...d, firstPaymentDate: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="DD.MM.YYYY" /><p className="text-xs text-gray-500 mt-1">Start der Mietzahlung (z. B. nach Renovierung/Freimonat)</p></div>
                                        <div className="md:col-span-2"><label className="text-xs text-gray-500 block mb-1">Notiz</label><textarea value={leaseTermDraft.note ?? ''} onChange={e => setLeaseTermDraft(d => d ? { ...d, note: e.target.value } : null)} rows={2} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white resize-y" placeholder="—" /></div>
                                    </div>
                                ) : null}
                                {leaseTermSaveError && <p className="text-sm text-red-400 mt-2">{leaseTermSaveError}</p>}
                                <div className="mt-3">
                                    <button type="button" disabled={leaseTermSaving || !leaseTermDraft || !leaseTermDraft.contractStart?.trim()} onClick={async () => { if (!selectedPropertyId || !leaseTermDraft) return; const d = leaseTermDraft; if (!d.contractStart?.trim()) { setLeaseTermSaveError('Gültig von ist erforderlich.'); return; } const errStart = validateEuDate(d.contractStart, 'Gültig von'); if (errStart) { setLeaseTermSaveError(errStart); return; } const errEnd = d.contractEnd?.trim() ? validateEuDate(d.contractEnd, 'Gültig bis') : null; if (errEnd) { setLeaseTermSaveError(errEnd); return; } const errFirst = d.firstPaymentDate?.trim() ? validateEuDate(d.firstPaymentDate, 'Erste Mietzahlung ab') : null; if (errFirst) { setLeaseTermSaveError(errFirst); return; } const isoStart = euToIso(d.contractStart); if (!isoStart) { setLeaseTermSaveError('Ungültiges Datum bei Gültig von.'); return; } const isoEnd = d.contractEnd?.trim() ? euToIso(d.contractEnd) : null; const isoFirst = d.firstPaymentDate?.trim() ? euToIso(d.firstPaymentDate) : null; if (isoEnd && isoEnd < isoStart) { setLeaseTermSaveError('Gültig bis muss am oder nach Gültig von liegen.'); return; } if (isoFirst && isoFirst < isoStart) { setLeaseTermSaveError('Erste Mietzahlung ab darf nicht vor Gültig von liegen.'); return; } setLeaseTermSaveError(null); setLeaseTermSaving(true); try { const saved = await unitLeaseTermsService.upsertByPropertyId(selectedPropertyId, { contract_start: isoStart, contract_end: isoEnd ?? undefined, contract_type: d.contractType, first_payment_date: isoFirst ?? undefined, note: d.note?.trim() || undefined }); setLeaseTerm(saved); } catch (e) { setLeaseTermSaveError(e instanceof Error ? e.message : 'Fehler beim Speichern.'); } finally { setLeaseTermSaving(false); } }} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white">Зберегти термін договору</button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start pb-4 border-b border-gray-700">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Власник (орендодавець)</h3>
                                    <div className="grid grid-cols-1 gap-2 items-start">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Назва</label>
                                            <div className="relative">
                                                <input value={card1Draft.landlord?.name ?? ''} onChange={e => { const v = e.target.value; setCard1Draft(d => d ? { ...d, landlord: d.landlord ? { ...d.landlord, name: v } : { ...defaultContactParty(), name: v } } : null); setAddressBookSearch(s => ({ ...s, owner: v })); }} onFocus={() => setAddressBookDropdownOpen('owner')} onBlur={() => setTimeout(() => setAddressBookDropdownOpen(null), 150)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white" placeholder="Імʼя або компанія" />
                                                <button type="button" onClick={() => { setCard1Draft(d => d ? { ...d, landlord: d.landlord ? { ...d.landlord, name: '' } : { ...defaultContactParty(), name: '' } } : null); setAddressBookSearch(s => ({ ...s, owner: '' })); setAddressBookDropdownOpen(null); }} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>
                                                {addressBookDropdownOpen === 'owner' && (
                                                    <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.owner)).map(entry => {
                                                            const addr = formatAddress({ street: entry.street, houseNumber: entry.houseNumber ?? '', zip: entry.zip, city: entry.city, country: entry.country ?? '' }); const meta = joinMeta([addr, normalizeArray(entry.phones ?? []), normalizeArray(entry.emails ?? [])]);
                                                            return (
                                                                <button key={entry.id ?? entry.name + entry.street} type="button" className="w-full text-left px-3 py-2 hover:bg-[#111315] border-b border-gray-700/50 last:border-0" onMouseDown={(ev) => { ev.preventDefault(); setCard1Draft(d => d ? { ...d, landlord: { name: entry.name ?? '', address: { street: entry.street ?? '', houseNumber: entry.houseNumber ?? '', zip: entry.zip ?? '', city: entry.city ?? '', country: entry.country ?? '' }, phones: entry.phones ?? [], emails: entry.emails ?? [], iban: entry.iban ?? '', unitIdentifier: entry.unitIdentifier ?? '', contactPerson: entry.contactPerson ?? '' } } : null); setAddressBookSearch(s => ({ ...s, owner: '' })); setAddressBookDropdownOpen(null); }}>
                                                                    <div className="text-sm"><span className="font-semibold text-white">{entry.name}</span><span className="ml-1.5 text-xs text-gray-400">({addressBookRoleLabel(entry.role)})</span></div>
                                                                    <div className="text-gray-400 text-xs">{meta || '—'}</div>
                                                                </button>
                                                            );
                                                        })}
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.owner)).length === 0 && <div className="px-3 py-2 text-gray-500 text-sm">Немає записів</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-1">ID</label>{renderClearableInput({ value: card1Draft.landlord?.unitIdentifier ?? '', onChange: v => setCard1Draft(d => d ? { ...d, landlord: { ...(d.landlord || defaultContactParty()), unitIdentifier: v } } : null), placeholder: '—' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Контактна персона</label>{renderClearableInput({ value: card1Draft.landlord?.contactPerson ?? '', onChange: v => setCard1Draft(d => d ? { ...d, landlord: { ...(d.landlord || defaultContactParty()), contactPerson: v } } : null), placeholder: '—' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">IBAN</label>{renderClearableInput({ value: card1Draft.landlord?.iban ?? '', onChange: v => setCard1Draft(d => d ? { ...d, landlord: { ...(d.landlord || defaultContactParty()), iban: v } } : null), placeholder: 'IBAN', inputClassName: 'font-mono' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Вулиця</label>{renderClearableInput({ value: card1Draft.landlord?.address?.street ?? '', onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, address: { ...d.landlord.address!, street: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Номер будинку</label>{renderClearableInput({ value: card1Draft.landlord?.address?.houseNumber ?? '', onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, address: { ...d.landlord.address!, houseNumber: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Індекс</label>{renderClearableInput({ value: card1Draft.landlord?.address?.zip ?? '', onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, address: { ...d.landlord.address!, zip: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Місто</label>{renderClearableInput({ value: card1Draft.landlord?.address?.city ?? '', onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, address: { ...d.landlord.address!, city: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Країна</label>{renderClearableInput({ value: card1Draft.landlord?.address?.country ?? '', onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, address: { ...d.landlord.address!, country: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Телефони</label>{(card1Draft.landlord?.phones ?? ['']).map((ph, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: ph, onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, phones: (d.landlord.phones ?? ['']).map((p, j) => j === i ? v : p) } } : null), placeholder: 'Телефон' })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, landlord: { ...(d.landlord || defaultContactParty()), phones: [...(d.landlord?.phones ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати телефон"><Phone className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, phones: (d.landlord.phones ?? ['']).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Email</label>{(card1Draft.landlord?.emails ?? ['']).map((em, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: em, onChange: v => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, emails: (d.landlord.emails ?? []).map((x, j) => j === i ? v : x) } } : null), type: 'email', placeholder: 'Email' })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, landlord: { ...(d.landlord || defaultContactParty()), emails: [...(d.landlord?.emails ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати email"><Mail className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d && d.landlord ? { ...d, landlord: { ...d.landlord, emails: (d.landlord.emails ?? []).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">1-ша фірма</h3>
                                    <div className="grid grid-cols-1 gap-2 items-start">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Імʼя</label>
                                            <div className="relative">
                                                <input value={card1Draft.tenant.name} onChange={e => { const v = e.target.value; setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, name: v } } : null); setAddressBookSearch(s => ({ ...s, company1: v })); }} onFocus={() => setAddressBookDropdownOpen('company1')} onBlur={() => setTimeout(() => setAddressBookDropdownOpen(null), 150)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white" />
                                                <button type="button" onClick={() => { setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, name: '' } } : null); setAddressBookSearch(s => ({ ...s, company1: '' })); setAddressBookDropdownOpen(null); }} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>
                                                {addressBookDropdownOpen === 'company1' && (
                                                    <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.company1)).map(entry => {
                                                            const addr = formatAddress({ street: entry.street, houseNumber: entry.houseNumber ?? '', zip: entry.zip, city: entry.city, country: entry.country ?? '' }); const meta = joinMeta([addr, normalizeArray(entry.phones ?? []), normalizeArray(entry.emails ?? [])]);
                                                            return (
                                                                <button key={entry.id ?? entry.name + entry.street} type="button" className="w-full text-left px-3 py-2 hover:bg-[#111315] border-b border-gray-700/50 last:border-0" onMouseDown={(ev) => { ev.preventDefault(); setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, name: entry.name ?? '', iban: entry.iban ?? '', address: { street: entry.street ?? '', houseNumber: entry.houseNumber ?? '', zip: entry.zip ?? '', city: entry.city ?? '', country: entry.country ?? '' }, phones: entry.phones ?? [], emails: entry.emails ?? [], paymentDayOfMonth: (entry.paymentDay != null && entry.paymentDay >= 1 && entry.paymentDay <= 31) ? entry.paymentDay : undefined, phone: (entry.phones?.[0] ?? ''), email: (entry.emails?.[0] ?? '') } } : null); setAddressBookSearch(s => ({ ...s, company1: '' })); setAddressBookDropdownOpen(null); }}>
                                                                    <div className="text-sm"><span className="font-semibold text-white">{entry.name}</span><span className="ml-1.5 text-xs text-gray-400">({addressBookRoleLabel(entry.role)})</span></div>
                                                                    <div className="text-gray-400 text-xs">{meta || '—'}</div>
                                                                </button>
                                                            );
                                                        })}
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.company1)).length === 0 && <div className="px-3 py-2 text-gray-500 text-sm">Немає записів</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-1">IBAN (необовʼязково)</label>{renderClearableInput({ value: card1Draft.tenant.iban ?? '', onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, iban: v } } : null), inputClassName: 'font-mono' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Вулиця</label>{renderClearableInput({ value: card1Draft.tenant.address?.street ?? '', onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, address: { ...(d.tenant.address || defaultContactParty().address), street: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Номер будинку</label>{renderClearableInput({ value: card1Draft.tenant.address?.houseNumber ?? '', onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, address: { ...(d.tenant.address || defaultContactParty().address), houseNumber: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Індекс</label>{renderClearableInput({ value: card1Draft.tenant.address?.zip ?? '', onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, address: { ...(d.tenant.address || defaultContactParty().address), zip: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Місто</label>{renderClearableInput({ value: card1Draft.tenant.address?.city ?? '', onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, address: { ...(d.tenant.address || defaultContactParty().address), city: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Країна</label>{renderClearableInput({ value: card1Draft.tenant.address?.country ?? '', onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, address: { ...(d.tenant.address || defaultContactParty().address), country: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">День оплати (1–31)</label><div className="relative"><select value={card1Draft.tenant.paymentDayOfMonth ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, paymentDayOfMonth: e.target.value === '' ? undefined : Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white"><option value="">—</option>{Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select>{card1Draft.tenant.paymentDayOfMonth != null && <button type="button" onClick={() => { setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, paymentDayOfMonth: undefined } } : null); setAddressBookSearch(s => ({ ...s, company1: '' })); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>}</div></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Телефони</label>{(card1Draft.tenant.phones ?? ['']).map((ph, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: ph, onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, phones: (d.tenant.phones ?? ['']).map((p, j) => j === i ? v : p) } } : null) })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, phones: [...(d.tenant.phones ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати телефон"><Phone className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, phones: (d.tenant.phones ?? ['']).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Email</label>{(card1Draft.tenant.emails ?? ['']).map((em, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: em, onChange: v => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, emails: (d.tenant.emails ?? []).map((x, j) => j === i ? v : x) } } : null), type: 'email' })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, emails: [...(d.tenant.emails ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати email"><Mail className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, tenant: { ...d.tenant, emails: (d.tenant.emails ?? []).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">2-га фірма</h3>
                                    <div className="grid grid-cols-1 gap-2 items-start">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Імʼя</label>
                                            <div className="relative">
                                                <input value={card1Draft.secondCompany?.name ?? ''} onChange={e => { const v = e.target.value; setCard1Draft(d => d ? { ...d, secondCompany: d.secondCompany ? { ...d.secondCompany, name: v } : { name: v, phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [''], paymentDayOfMonth: undefined } } : null); setAddressBookSearch(s => ({ ...s, company2: v })); }} onFocus={() => setAddressBookDropdownOpen('company2')} onBlur={() => setTimeout(() => setAddressBookDropdownOpen(null), 150)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white" />
                                                <button type="button" onClick={() => { setCard1Draft(d => d ? (d.secondCompany ? { ...d, secondCompany: { ...d.secondCompany, name: '' } } : d) : null); setAddressBookSearch(s => ({ ...s, company2: '' })); setAddressBookDropdownOpen(null); }} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>
                                                {addressBookDropdownOpen === 'company2' && (
                                                    <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.company2)).map(entry => {
                                                            const addr = formatAddress({ street: entry.street, houseNumber: entry.houseNumber ?? '', zip: entry.zip, city: entry.city, country: entry.country ?? '' }); const meta = joinMeta([addr, normalizeArray(entry.phones ?? []), normalizeArray(entry.emails ?? [])]);
                                                            return (
                                                                <button key={entry.id ?? entry.name + entry.street} type="button" className="w-full text-left px-3 py-2 hover:bg-[#111315] border-b border-gray-700/50 last:border-0" onMouseDown={(ev) => { ev.preventDefault(); const base = card1Draft?.secondCompany ?? { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [''], paymentDayOfMonth: undefined }; setCard1Draft(d => d ? { ...d, secondCompany: { ...base, name: entry.name ?? '', iban: entry.iban ?? '', address: { street: entry.street ?? '', houseNumber: entry.houseNumber ?? '', zip: entry.zip ?? '', city: entry.city ?? '', country: entry.country ?? '' }, phones: entry.phones ?? [], emails: entry.emails ?? [], paymentDayOfMonth: (entry.paymentDay != null && entry.paymentDay >= 1 && entry.paymentDay <= 31) ? entry.paymentDay : undefined, phone: (entry.phones?.[0] ?? ''), email: (entry.emails?.[0] ?? '') } } : null); setAddressBookSearch(s => ({ ...s, company2: '' })); setAddressBookDropdownOpen(null); }}>
                                                                    <div className="text-sm"><span className="font-semibold text-white">{entry.name}</span><span className="ml-1.5 text-xs text-gray-400">({addressBookRoleLabel(entry.role)})</span></div>
                                                                    <div className="text-gray-400 text-xs">{meta || '—'}</div>
                                                                </button>
                                                            );
                                                        })}
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.company2)).length === 0 && <div className="px-3 py-2 text-gray-500 text-sm">Немає записів</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-1">IBAN (необовʼязково)</label>{renderClearableInput({ value: card1Draft.secondCompany?.iban ?? '', onChange: v => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), iban: v } } : null), inputClassName: 'font-mono' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Вулиця</label>{renderClearableInput({ value: card1Draft.secondCompany?.address?.street ?? '', onChange: v => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), address: { ...(d.secondCompany?.address || defaultContactParty().address), street: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Номер будинку</label>{renderClearableInput({ value: card1Draft.secondCompany?.address?.houseNumber ?? '', onChange: v => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), address: { ...(d.secondCompany?.address || defaultContactParty().address), houseNumber: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Індекс</label>{renderClearableInput({ value: card1Draft.secondCompany?.address?.zip ?? '', onChange: v => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), address: { ...(d.secondCompany?.address || defaultContactParty().address), zip: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Місто</label>{renderClearableInput({ value: card1Draft.secondCompany?.address?.city ?? '', onChange: v => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), address: { ...(d.secondCompany?.address || defaultContactParty().address), city: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Країна</label>{renderClearableInput({ value: card1Draft.secondCompany?.address?.country ?? '', onChange: v => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), address: { ...(d.secondCompany?.address || defaultContactParty().address), country: v } } } : null) })}</div>
                                        <div>
                                        <label className="text-xs text-gray-500 block mb-1">День оплати (1–31)</label>
                                        <div className="relative">
                                          <select
                                            value={card1Draft.secondCompany?.paymentDayOfMonth ?? ''}
                                            onChange={e =>
                                              setCard1Draft(d =>
                                                d
                                                  ? {
                                                      ...d,
                                                      secondCompany: d.secondCompany
                                                        ? {
                                                            ...d.secondCompany,
                                                            paymentDayOfMonth:
                                                              e.target.value === ''
                                                                ? undefined
                                                                : Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)),
                                                          }
                                                        : {
                                                            name: '',
                                                            phone: '',
                                                            email: '',
                                                            rent: 0,
                                                            deposit: 0,
                                                            startDate: '',
                                                            km: 0,
                                                            bk: 0,
                                                            hk: 0,
                                                            address: defaultContactParty().address,
                                                            phones: [''],
                                                            emails: [],
                                                            paymentDayOfMonth:
                                                              e.target.value === ''
                                                                ? undefined
                                                                : Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)),
                                                          },
                                                    }
                                                  : null
                                              )
                                            }
                                            className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white"
                                          >
                                            <option value="">—</option>
                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(n => (
                                              <option key={n} value={n}>{n}</option>
                                            ))}
                                          </select>

                                          {card1Draft.secondCompany?.paymentDayOfMonth != null && (
                                            <button
                                              type="button"
                                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded"
                                              onClick={() => {
                                                setCard1Draft(d =>
                                                  d
                                                    ? (d.secondCompany
                                                        ? { ...d, secondCompany: { ...d.secondCompany, paymentDayOfMonth: undefined } }
                                                        : d)
                                                    : null
                                                );
                                              }}
                                            >
                                              ×
                                            </button>
                                          )}
                                        </div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Телефони</label>{(card1Draft.secondCompany?.phones ?? ['']).map((ph, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: ph, onChange: v => setCard1Draft(d => d && d.secondCompany ? { ...d, secondCompany: { ...d.secondCompany, phones: (d.secondCompany.phones ?? ['']).map((p, j) => j === i ? v : p) } } : null) })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), phones: [...(d.secondCompany?.phones ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати телефон"><Phone className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d && d.secondCompany ? { ...d, secondCompany: { ...d.secondCompany, phones: (d.secondCompany.phones ?? ['']).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Email</label>{(card1Draft.secondCompany?.emails ?? ['']).map((em, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: em, onChange: v => setCard1Draft(d => d && d.secondCompany ? { ...d, secondCompany: { ...d.secondCompany, emails: (d.secondCompany.emails ?? []).map((x, j) => j === i ? v : x) } } : null), type: 'email' })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, secondCompany: { ...(d.secondCompany || { name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0, address: defaultContactParty().address, phones: [''], emails: [] }), emails: [...(d.secondCompany?.emails ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати email"><Mail className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d && d.secondCompany ? { ...d, secondCompany: { ...d.secondCompany, emails: (d.secondCompany.emails ?? []).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Управління</h3>
                                    <div className="grid grid-cols-1 gap-2 items-start">
                                        <div>
                                            <label className="text-xs text-gray-500 block mb-1">Назва</label>
                                            <div className="relative">
                                                <input value={card1Draft.management?.name ?? ''} onChange={e => { const v = e.target.value; setCard1Draft(d => d ? { ...d, management: (d.management || defaultContactParty()).name !== undefined ? { ...(d.management || defaultContactParty()), name: v } : { ...defaultContactParty(), name: v } } : null); setAddressBookSearch(s => ({ ...s, management: v })); }} onFocus={() => setAddressBookDropdownOpen('management')} onBlur={() => setTimeout(() => setAddressBookDropdownOpen(null), 150)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white" />
                                                <button type="button" onClick={() => { setCard1Draft(d => d ? { ...d, management: d.management ? { ...d.management, name: '' } : { ...defaultContactParty(), name: '' } } : null); setAddressBookSearch(s => ({ ...s, management: '' })); setAddressBookDropdownOpen(null); }} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>
                                                {addressBookDropdownOpen === 'management' && (
                                                    <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[#1C1F24] border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.management)).map(entry => {
                                                            const addr = formatAddress({ street: entry.street, houseNumber: entry.houseNumber ?? '', zip: entry.zip, city: entry.city, country: entry.country ?? '' }); const meta = joinMeta([addr, normalizeArray(entry.phones ?? []), normalizeArray(entry.emails ?? [])]);
                                                            return (
                                                                <button key={entry.id ?? entry.name + entry.street} type="button" className="w-full text-left px-3 py-2 hover:bg-[#111315] border-b border-gray-700/50 last:border-0" onMouseDown={(ev) => { ev.preventDefault(); setCard1Draft(d => d ? { ...d, management: { name: entry.name ?? '', address: { street: entry.street ?? '', houseNumber: entry.houseNumber ?? '', zip: entry.zip ?? '', city: entry.city ?? '', country: entry.country ?? '' }, phones: entry.phones ?? [], emails: entry.emails ?? [], iban: entry.iban ?? '', unitIdentifier: entry.unitIdentifier ?? '', contactPerson: entry.contactPerson ?? '' } } : null); setAddressBookSearch(s => ({ ...s, management: '' })); setAddressBookDropdownOpen(null); }}>
                                                                    <div className="text-sm"><span className="font-semibold text-white">{entry.name}</span><span className="ml-1.5 text-xs text-gray-400">({addressBookRoleLabel(entry.role)})</span></div>
                                                                    <div className="text-gray-400 text-xs">{meta || '—'}</div>
                                                                </button>
                                                            );
                                                        })}
                                                        {addressBookEntries.filter(e => addressBookEntryMatchesSearch(e, addressBookSearch.management)).length === 0 && <div className="px-3 py-2 text-gray-500 text-sm">Немає записів</div>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-1">ID</label>{renderClearableInput({ value: card1Draft.management?.unitIdentifier ?? '', onChange: v => setCard1Draft(d => d ? { ...d, management: { ...(d.management || defaultContactParty()), unitIdentifier: v } } : null), placeholder: '—' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Контактна персона</label>{renderClearableInput({ value: card1Draft.management?.contactPerson ?? '', onChange: v => setCard1Draft(d => d ? { ...d, management: { ...(d.management || defaultContactParty()), contactPerson: v } } : null), placeholder: '—' })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Вулиця</label>{renderClearableInput({ value: card1Draft.management?.address?.street ?? '', onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, address: { ...d.management.address!, street: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Номер будинку</label>{renderClearableInput({ value: card1Draft.management?.address?.houseNumber ?? '', onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, address: { ...d.management.address!, houseNumber: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Індекс</label>{renderClearableInput({ value: card1Draft.management?.address?.zip ?? '', onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, address: { ...d.management.address!, zip: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Місто</label>{renderClearableInput({ value: card1Draft.management?.address?.city ?? '', onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, address: { ...d.management.address!, city: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Країна</label>{renderClearableInput({ value: card1Draft.management?.address?.country ?? '', onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, address: { ...d.management.address!, country: v } } } : null) })}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Телефони</label>{(card1Draft.management?.phones ?? ['']).map((ph, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: ph, onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, phones: (d.management.phones ?? []).map((p, j) => j === i ? v : p) } } : null) })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, management: { ...(d.management || defaultContactParty()), phones: [...(d.management?.phones ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати телефон"><Phone className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, phones: (d.management.phones ?? []).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Email</label>{(card1Draft.management?.emails ?? ['']).map((em, i) => (<div key={i} className="grid grid-cols-12 gap-3 items-center mb-1"><div className="col-span-9 min-w-0">{renderClearableInput({ value: em, onChange: v => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, emails: (d.management.emails ?? []).map((x, j) => j === i ? v : x) } } : null), type: 'email' })}</div><div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0 ml-1"><button type="button" onClick={() => setCard1Draft(d => d ? { ...d, management: { ...(d.management || defaultContactParty()), emails: [...(d.management?.emails ?? ['']), ''] } } : null)} className="inline-flex items-center justify-center p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати email"><Mail className="w-4 h-4" /><Plus className="w-3 h-3 ml-0.5" /></button><button type="button" onClick={() => setCard1Draft(d => d && d.management ? { ...d, management: { ...d.management, emails: (d.management.emails ?? []).filter((_, j) => j !== i) } } : null)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block mb-2">Рентний таймлайн</span>
                                {rentTimelineLoading && <p className="text-xs text-gray-500 mb-1">Завантаження…</p>}
                                {rentTimelineError && <p className="text-sm text-red-400 mb-1">{rentTimelineError}</p>}
                                {rentTimelineEditError && <p className="text-xs text-amber-400 mb-1">{rentTimelineEditError}</p>}
                                <div className="overflow-x-auto overflow-hidden border border-gray-700 rounded-lg">
                                    <table className="w-full text-sm text-left min-w-[800px]">
                                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700"><tr><th className="p-2 font-bold text-xs uppercase" title="Дійсний з">Von</th><th className="p-2 font-bold text-xs uppercase" title="Дійсний по">Bis</th><th className="p-2 font-bold text-xs uppercase text-right" title="Kaltmiete">KM</th><th className="p-2 font-bold text-xs uppercase text-right" title="Mietsteuer">MSt</th><th className="p-2 font-bold text-xs uppercase text-right" title="Unternehmenssteuer">USt</th><th className="p-2 font-bold text-xs uppercase text-right" title="Betriebskosten">BK</th><th className="p-2 font-bold text-xs uppercase text-right" title="Heizkosten">HK</th><th className="p-2 font-bold text-xs uppercase text-right" title="Müll">Müll</th><th className="p-2 font-bold text-xs uppercase text-right" title="Strom">Strom</th><th className="p-2 font-bold text-xs uppercase text-right" title="Gas">Gas</th><th className="p-2 font-bold text-xs uppercase text-right" title="Wasser">Wasser</th><th className="p-2 font-bold text-xs uppercase text-right" title="Warmmiete">WM</th></tr></thead>
                                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                                            {rentTimelineRows.length === 0 ? (
                                              <tr><td colSpan={12} className="p-3 text-gray-500 text-center">Немає даних про оренду.</td></tr>
                                            ) : rentTimelineRows.map((r) => {
                                              const isEditing = editingRentTimelineRowId === r.id && rentTimelineEditDraft;
                                              const draft = isEditing ? rentTimelineEditDraft : null;
                                              const warmPreview = draft ? ((parseFloat(draft.km) || 0) + (parseFloat(draft.bk) || 0) + (parseFloat(draft.hk) || 0) + (parseFloat(draft.mietsteuer) || 0) + (parseFloat(draft.unternehmenssteuer) || 0) + (parseFloat(draft.muell) || 0) + (parseFloat(draft.strom) || 0) + (parseFloat(draft.gas) || 0) + (parseFloat(draft.wasser) || 0)) : 0;
                                              return (
                                                <tr
                                                  key={r.id}
                                                  onClick={isEditing ? (e) => e.stopPropagation() : () => { setEditingRentTimelineRowId(r.id); setRentTimelineEditDraft({ validFrom: r.validFrom, validTo: r.validTo === '∞' ? '' : r.validTo, km: (r.km ?? 0) === 0 ? '' : String(r.km), mietsteuer: (r.mietsteuer ?? 0) === 0 ? '' : String(r.mietsteuer), unternehmenssteuer: (r.unternehmenssteuer ?? 0) === 0 ? '' : String(r.unternehmenssteuer), bk: (r.bk ?? 0) === 0 ? '' : String(r.bk), hk: (r.hk ?? 0) === 0 ? '' : String(r.hk), muell: (r.muell ?? 0) === 0 ? '' : String(r.muell), strom: (r.strom ?? 0) === 0 ? '' : String(r.strom), gas: (r.gas ?? 0) === 0 ? '' : String(r.gas), wasser: (r.wasser ?? 0) === 0 ? '' : String(r.wasser) }); setRentTimelineEditError(null); }}
                                                  className={isEditing ? '' : 'cursor-pointer hover:bg-[#1C1F24]'}
                                                >
                                                  {isEditing && draft ? (
                                                    <>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="date" value={draft.validFrom} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, validFrom: e.target.value } : null)} className="w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white" placeholder="YYYY-MM-DD" title="Von" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="date" value={draft.validTo} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, validTo: e.target.value } : null)} className="w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white" title="Bis" placeholder="∞" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.km === '0' ? '' : draft.km} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, km: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.mietsteuer === '0' ? '' : draft.mietsteuer} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, mietsteuer: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.unternehmenssteuer === '0' ? '' : draft.unternehmenssteuer} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, unternehmenssteuer: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.bk === '0' ? '' : draft.bk} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, bk: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.hk === '0' ? '' : draft.hk} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, hk: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.muell === '0' ? '' : draft.muell} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, muell: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.strom === '0' ? '' : draft.strom} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, strom: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.gas === '0' ? '' : draft.gas} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, gas: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-1" onClick={e => e.stopPropagation()}><input type="number" min={0} step={0.01} value={draft.wasser === '0' ? '' : draft.wasser} onChange={e => setRentTimelineEditDraft(d => d ? { ...d, wasser: e.target.value } : null)} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" /></td>
                                                      <td className="p-2 text-right text-emerald-400 font-mono font-bold">€{warmPreview.toFixed(2)}</td>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <td className="p-2 text-white">{r.validFrom}</td><td className="p-2 text-white">{r.validTo}</td><td className="p-2 text-right text-white font-mono">€{(r.km ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.mietsteuer ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.unternehmenssteuer ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.bk ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.hk ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.muell ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.strom ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.gas ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.wasser ?? 0).toFixed(2)}</td><td className="p-2 text-right text-emerald-400 font-mono font-bold">€{(r.warm ?? 0).toFixed(2)}</td>
                                                    </>
                                                  )}
                                                </tr>
                                              );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {showAddRentIncreaseForm ? (
                                    <div className="mt-2 p-3 bg-[#111315] border border-gray-700 rounded-lg">
                                        <div className="overflow-x-auto min-w-[800px]">
                                            <div className="grid gap-x-1.5 gap-y-0.5 items-center" style={{ gridTemplateColumns: 'minmax(88px,1.15fr) minmax(88px,1.15fr) minmax(52px,0.75fr) minmax(48px,0.7fr) minmax(48px,0.7fr) minmax(52px,0.75fr) minmax(52px,0.75fr) minmax(52px,0.75fr) minmax(52px,0.75fr) minmax(52px,0.75fr) minmax(52px,0.75fr) minmax(64px,1fr)' }}>
                                                <span className="text-xs text-gray-500 uppercase font-medium" title="Дійсний з">Von</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium" title="Дійсний по">Bis</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Kaltmiete">KM</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Mietsteuer">MSt</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Unternehmenssteuer">USt</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Betriebskosten">BK</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Heizkosten">HK</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Müll">Müll</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Strom">Strom</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Gas">Gas</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Wasser">W</span>
                                                <span className="text-xs text-gray-500 uppercase font-medium text-right" title="Warmmiete">WM</span>
                                                <div className="min-w-0"><input type="date" value={rentIncreaseForm.validFrom} onChange={e => setRentIncreaseForm(f => ({ ...f, validFrom: e.target.value }))} className="w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white" placeholder="YYYY-MM-DD" title="Von" /></div>
                                                <div className="min-w-0"><input type="date" value={rentIncreaseForm.validTo} onChange={e => setRentIncreaseForm(f => ({ ...f, validTo: e.target.value }))} className="w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white" title="Bis" placeholder="∞ / YYYY-MM-DD" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.km === '0' ? '' : rentIncreaseForm.km} onChange={e => setRentIncreaseForm(f => ({ ...f, km: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Kaltmiete" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.mietsteuer === '0' ? '' : rentIncreaseForm.mietsteuer} onChange={e => setRentIncreaseForm(f => ({ ...f, mietsteuer: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Mietsteuer" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.unternehmenssteuer === '0' ? '' : rentIncreaseForm.unternehmenssteuer} onChange={e => setRentIncreaseForm(f => ({ ...f, unternehmenssteuer: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Unternehmenssteuer" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.bk === '0' ? '' : rentIncreaseForm.bk} onChange={e => setRentIncreaseForm(f => ({ ...f, bk: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Betriebskosten" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.hk === '0' ? '' : rentIncreaseForm.hk} onChange={e => setRentIncreaseForm(f => ({ ...f, hk: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Heizkosten" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.muell === '0' ? '' : rentIncreaseForm.muell} onChange={e => setRentIncreaseForm(f => ({ ...f, muell: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Müll" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.strom === '0' ? '' : rentIncreaseForm.strom} onChange={e => setRentIncreaseForm(f => ({ ...f, strom: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Strom" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.gas === '0' ? '' : rentIncreaseForm.gas} onChange={e => setRentIncreaseForm(f => ({ ...f, gas: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Gas" /></div>
                                                <div className="min-w-0"><input type="number" min={0} step={0.01} value={rentIncreaseForm.wasser === '0' ? '' : rentIncreaseForm.wasser} onChange={e => setRentIncreaseForm(f => ({ ...f, wasser: e.target.value }))} className="no-spinner w-full h-9 bg-[#0D1117] border border-gray-700 rounded px-2 text-sm text-white text-right font-mono" placeholder="0.00" title="Wasser" /></div>
                                                <div className="min-w-0 flex items-center justify-end h-9 text-right"><span className="text-sm font-mono font-bold text-emerald-400" title="Warmmiete">€{((parseFloat(rentIncreaseForm.km) || 0) + (parseFloat(rentIncreaseForm.bk) || 0) + (parseFloat(rentIncreaseForm.hk) || 0) + (parseFloat(rentIncreaseForm.mietsteuer) || 0) + (parseFloat(rentIncreaseForm.unternehmenssteuer) || 0) + (parseFloat(rentIncreaseForm.strom) || 0) + (parseFloat(rentIncreaseForm.muell) || 0) + (parseFloat(rentIncreaseForm.gas) || 0) + (parseFloat(rentIncreaseForm.wasser) || 0)).toFixed(2)}</span></div>
                                            </div>
                                        </div>
                                        {rentIncreaseFormError && <p className="text-sm text-red-400 mt-1.5">{rentIncreaseFormError}</p>}
                                        <div className="flex justify-end gap-2 mt-2">
                                            <button type="button" disabled={isAddingRentIncrease} onClick={addRentIncrease} className="h-9 px-3 rounded text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white">Додати</button>
                                            <button type="button" disabled={isAddingRentIncrease} onClick={() => { setShowAddRentIncreaseForm(false); setRentIncreaseForm({ validFrom: '', validTo: '', km: '', mietsteuer: '', unternehmenssteuer: '', bk: '', hk: '', muell: '', strom: '', gas: '', wasser: '' }); setRentIncreaseFormError(null); }} className="h-9 px-3 rounded text-sm text-gray-400 hover:text-white">Скасувати</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setShowAddRentIncreaseForm(true)} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400 font-medium">+ Додати підвищення оренди</button>
                                )}
                            </div>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Застава (Kaution)</h3>
                                <div className="grid grid-cols-12 gap-4 items-center">
                                    {/* Row 1: Deposit payment */}
                                    <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Дата оплати</label><input type="date" value={card1Draft.deposit?.paidAt ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), paidAt: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                    <div className="col-span-3"><label className="text-xs text-gray-500 block mb-1">Оплачено кому</label><input value={card1Draft.deposit?.paidTo ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), paidTo: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                    <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Сума (€)</label><input type="number" min={0} step={0.01} value={card1Draft.deposit?.amount ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), amount: parseFloat(e.target.value) || 0 } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="0" /></div>
                                    <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Статус</label><select value={card1Draft.deposit?.status ?? 'unpaid'} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), status: e.target.value as PropertyDeposit['status'] } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"><option value="unpaid">Не оплачено</option><option value="paid">Оплачено</option></select></div>
                                    <div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0">
                                        <button type="button" onClick={() => { setDepositProofType('payment'); setDepositProofFile(null); setDepositProofError(null); setIsDepositProofModalOpen(true); }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати підтвердження оплати"><Plus className="w-4 h-4" /></button>
                                        {kautionProofs.payment ? <button type="button" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.payment!.filePath); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors" title="Переглянути підтвердження оплати"><FileText className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><FileText className="w-4 h-4" /></button>}
                                        {kautionProofs.payment ? <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { propertyDepositProofsService.delete(kautionProofs.payment!.id).then(() => refreshKautionProofs()).catch((e) => alert(e?.message || 'Помилка видалення')); } }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити підтвердження оплати"><Trash2 className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><Trash2 className="w-4 h-4" /></button>}
                                    </div>
                                    {/* Row 2: Deposit refund */}
                                    <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Дата повернення</label><input type="date" value={card1Draft.deposit?.returnedAt ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), returnedAt: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                    <div className="col-span-3"><label className="text-xs text-gray-500 block mb-1">Повернув хто / від кого</label><input value="" readOnly className="w-full bg-[#0D1117] border border-gray-700 rounded p-2 text-sm text-gray-500" placeholder="—" title="Поле не зберігається в базі" /></div>
                                    <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Сума повернення (€)</label><input type="number" min={0} step={0.01} value={card1Draft.deposit?.returnedAmount ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), returnedAmount: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                    <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Статус</label><select value={card1Draft.deposit?.returnStatus ?? 'unpaid'} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...(d.deposit || { amount: 0, status: 'unpaid', returnStatus: 'unpaid' }), returnStatus: e.target.value as PropertyDeposit['returnStatus'] } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"><option value="unpaid">Не повернено</option><option value="partially_returned">Частково повернено</option><option value="returned">Повернено</option></select></div>
                                    <div className="col-span-3 flex items-center justify-end gap-0.5 shrink-0">
                                        <button type="button" onClick={() => { setDepositProofType('return'); setDepositProofFile(null); setDepositProofError(null); setIsDepositProofModalOpen(true); }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати підтвердження повернення"><Plus className="w-4 h-4" /></button>
                                        {kautionProofs.return ? <button type="button" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.return!.filePath); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors" title="Переглянути підтвердження повернення"><FileText className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><FileText className="w-4 h-4" /></button>}
                                        {kautionProofs.return ? <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { propertyDepositProofsService.delete(kautionProofs.return!.id).then(() => refreshKautionProofs()).catch((e) => alert(e?.message || 'Помилка видалення')); } }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити підтвердження повернення"><Trash2 className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><Trash2 className="w-4 h-4" /></button>}
                                    </div>
                                </div>
                                {card1DepositError && <p className="text-sm text-red-400 mt-2">{card1DepositError}</p>}
                                <div className="mt-2">
                                    <button type="button" onClick={() => { if (window.confirm('Очистити заставу повністю? Це видалить дані застави (deposit) з цієї квартири.')) { setCard1Draft(d => d ? { ...d, deposit: null } : null); setCard1DepositError(null); } }} className="text-sm text-amber-400 hover:text-amber-300 font-medium">Очистити заставу</button>
                                </div>
                            </div>
                            {isDepositProofModalOpen && depositProofType && selectedProperty && (
                                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" onClick={() => { setIsDepositProofModalOpen(false); setDepositProofType(null); setDepositProofFile(null); setDepositProofError(null); if (depositProofFileInputRef.current) depositProofFileInputRef.current.value = ''; }}>
                                    <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
                                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                                            <h3 className="text-lg font-bold text-white">{depositProofType === 'payment' ? 'Додати підтвердження оплати' : 'Додати підтвердження повернення'}</h3>
                                            <button type="button" onClick={() => { setIsDepositProofModalOpen(false); setDepositProofType(null); setDepositProofFile(null); setDepositProofError(null); if (depositProofFileInputRef.current) depositProofFileInputRef.current.value = ''; }} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            <div>
                                                <label className="text-xs text-gray-500 block mb-2">Файл (PDF або зображення)</label>
                                                {!depositProofFile ? (
                                                    <div onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-emerald-500'); }} onDragLeave={e => e.currentTarget.classList.remove('border-emerald-500')} onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-emerald-500'); const f = e.dataTransfer.files[0]; if (f && (f.type === 'application/pdf' || f.type.startsWith('image/'))) setDepositProofFile(f); }} className="border-2 border-dashed border-gray-700 rounded-lg p-6 min-h-[120px] flex flex-col items-center justify-center gap-2 hover:border-gray-600 transition-colors">
                                                        <input ref={depositProofFileInputRef} type="file" accept=".pdf,image/*" className="hidden" id="deposit-proof-file" onChange={e => { const f = e.target.files?.[0]; if (f && (f.type === 'application/pdf' || f.type.startsWith('image/'))) setDepositProofFile(f); }} />
                                                        <label htmlFor="deposit-proof-file" className="cursor-pointer flex flex-col items-center gap-2">
                                                            <Upload className="w-8 h-8 text-gray-500" />
                                                            <span className="text-sm text-gray-400">Перетягніть файл сюди або натисніть для вибору</span>
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-700 bg-[#111315]">
                                                        <span className="text-emerald-400 text-sm truncate flex-1">{depositProofFile.name}</span>
                                                        <button type="button" onClick={() => { setDepositProofFile(null); if (depositProofFileInputRef.current) depositProofFileInputRef.current.value = ''; }} className="text-xs text-gray-400 hover:text-white">Видалити файл</button>
                                                    </div>
                                                )}
                                            </div>
                                            {depositProofError && <p className="text-sm text-red-400">{depositProofError}</p>}
                                            <div className="flex gap-2">
                                                <button type="button" disabled={depositProofUploading || !depositProofFile} onClick={async () => { if (!selectedProperty || !depositProofFile) return; setDepositProofUploading(true); setDepositProofError(null); try { await propertyDepositProofsService.create(selectedProperty.id, depositProofType!, depositProofFile); refreshKautionProofs(); setIsDepositProofModalOpen(false); setDepositProofType(null); setDepositProofFile(null); if (depositProofFileInputRef.current) depositProofFileInputRef.current.value = ''; } catch (e) { setDepositProofError(e instanceof Error ? e.message : 'Помилка'); } finally { setDepositProofUploading(false); } }} className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white">Зберегти</button>
                                                <button type="button" onClick={() => { setIsDepositProofModalOpen(false); setDepositProofType(null); setDepositProofFile(null); setDepositProofError(null); if (depositProofFileInputRef.current) depositProofFileInputRef.current.value = ''; }} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white">Скасувати</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Документи та договори</h3>
                                {card1DocumentsLoading ? <p className="text-sm text-gray-500">Завантаження…</p> : card1DocumentsError ? <p className="text-sm text-red-400">{card1DocumentsError}</p> : (
                                    <ul className="space-y-2 mb-4">
                                        {card1Documents.length === 0 ? <li className="text-sm text-gray-500">Немає документів.</li> : card1Documents.map((doc) => (
                                            <li key={doc.id} className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="text-white font-medium">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                                                {doc.title && <span className="text-gray-400">— {doc.title}</span>}
                                                {doc.docDate && <span className="text-gray-500">({doc.docDate})</span>}
                                                <button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="text-emerald-500 hover:text-emerald-400 text-xs">Відкрити</button>
                                                <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => { alert(e?.message || 'Помилка видалення'); }).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="text-red-400 hover:text-red-300 text-xs">Видалити</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {showAddDocumentForm ? (
                                    <div className="bg-[#111315] border border-gray-700 rounded-lg p-3 space-y-3">
                                        <div><label className="text-xs text-gray-500 block mb-1">Тип</label><select value={newDocType} onChange={e => setNewDocType(e.target.value as PropertyDocumentType)} className="w-full bg-[#0D1117] border border-gray-700 rounded p-2 text-sm text-white">{Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Назва (необовʼязково)</label><input value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)} className="w-full bg-[#0D1117] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Дата (необовʼязково)</label><input type="date" value={newDocDate} onChange={e => setNewDocDate(e.target.value)} className="w-full bg-[#0D1117] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">Файл (обовʼязково)</label><input type="file" accept=".pdf,image/*" onChange={e => setNewDocFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-400" /></div>
                                        {addDocumentError && <p className="text-sm text-red-400">{addDocumentError}</p>}
                                        <div className="flex gap-2">
                                            <button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, newDocType, docId); await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: newDocType, filePath, title: newDocTitle || null, docDate: newDocDate || null }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setShowAddDocumentForm(false); } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="px-3 py-1.5 rounded text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white">Зберегти</button>
                                            <button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); }} className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-white">Скасувати</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => setShowAddDocumentForm(true)} className="text-sm text-emerald-500 hover:text-emerald-400 font-medium">+ Додати документ</button>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={saveCard1} disabled={!isCard1DepositValid(card1Draft.deposit).valid} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white">Зберегти</button>
                                <button type="button" onClick={cancelCard1Edit} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800">Скасувати</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-700">
                                <div><span className="text-xs text-gray-500 block mb-1">Адреса</span><span className="text-sm text-white font-bold">{selectedProperty.fullAddress || [selectedProperty.address, selectedProperty.zip, selectedProperty.city].filter(Boolean).join(', ') || '—'}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Поверх / Сторона</span><span className="text-sm text-white">{selectedProperty.details?.floor != null ? `${selectedProperty.details.floor} OG` : '—'} {selectedProperty.details?.buildingFloors != null ? ` / ${selectedProperty.details.buildingFloors} поверхов` : ''}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Квартира / Код</span><span className="text-sm text-white">{selectedProperty.title || '—'}</span></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b border-gray-700">
                                <div><span className="text-xs text-gray-500 block mb-1">Gültig von</span><span className="text-sm text-white">{leaseTerm?.contract_start || '—'}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Gültig bis</span><span className="text-sm text-white">{leaseTerm?.contract_end ?? '—'}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Vertragstyp</span><span className="text-sm text-white">{leaseTerm?.contract_type || '—'}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Erste Mietzahlung ab</span><span className="text-sm text-white">{leaseTerm?.first_payment_date ?? '—'}</span></div>
                            </div>
                            {(leaseTerm?.note != null && leaseTerm.note.trim() !== '') && (
                                <div className="pb-4 border-b border-gray-700"><span className="text-xs text-gray-500 block mb-1">Notiz</span><span className="text-sm text-white">{leaseTerm.note}</span></div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-700">
                                <div><span className="text-xs text-gray-500 block mb-1">Статус квартири</span><span className="text-sm font-medium text-white">{selectedProperty.apartmentStatus === 'ooo' ? 'Out of order' : selectedProperty.apartmentStatus === 'preparation' ? 'В підготовці' : selectedProperty.apartmentStatus === 'rented_worker' ? 'Здана працівнику' : 'Активна'}</span></div>
                            </div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-white">Контрагенти</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowPartiesDetails(v => !v)}
                                        className="p-2 rounded-md border border-gray-700 bg-[#111315] hover:bg-[#15181b] text-gray-200 flex items-center gap-1.5 text-sm"
                                    >
                                        {showPartiesDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        {showPartiesDetails ? 'Сховати деталі' : 'Показати деталі'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setIsAddressBookModalOpen(true);
                                            setAddressBookLastError(null);

                                            if (addressBookLoaded && addressBookEntries.length > 0) return;

                                            setAddressBookLoading(true);
                                            setAddressBookEntries([]);

                                            try {
                                                const { data: { user } } = await supabase.auth.getUser();
                                                if (!user) throw new Error('Not authenticated');

                                                const list = await addressBookPartiesService.listByRole(user.id);
                                                setAddressBookEntries(list);
                                                setAddressBookLoaded(true);
                                            } catch (e) {
                                                console.error('[AddressBook listByRole]', e);
                                                setAddressBookLastError(String((e as Error)?.message ?? e));
                                            } finally {
                                                setAddressBookLoading(false);
                                            }
                                        }}
                                        className="p-2 rounded-md border border-gray-700 bg-[#111315] hover:bg-[#15181b] text-gray-200"
                                        title="Address Book"
                                    >
                                        <BookOpen size={18} />
                                    </button>
                                </div>
                            </div>
                            {addressBookLastError && (
                                <p className="text-xs text-amber-500 mt-1">Address Book sync failed: {addressBookLastError}</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b border-gray-700">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Власник (орендодавець)</h3>
                                    <div className={`text-sm font-semibold ${(selectedProperty.landlord?.name ?? '').trim() ? 'text-white' : 'text-gray-500'}`}>{(selectedProperty.landlord?.name ?? '').trim() || '—'}</div>
                                    {formatAddress(selectedProperty.landlord?.address)?.trim() && <div className="text-sm text-gray-400 mt-0.5">{formatAddress(selectedProperty.landlord?.address)}</div>}
                                    {(() => { const p = selectedProperty.landlord; const phonesLine = normalizeArray(p?.phones ?? []); const emailsLine = normalizeArray(p?.emails ?? []); const metaLine = joinMeta([phonesLine, emailsLine]); return metaLine ? <div className="text-sm text-gray-400 mt-0.5">{metaLine}</div> : null; })()}
                                    {showPartiesDetails && (
                                        <>
                                            <div className="border-t border-gray-800 mt-2 pt-2" />
                                            {renderPartyRow('ID', selectedProperty.landlord?.unitIdentifier?.trim() || undefined)}
                                            {renderPartyRow('Контакт', selectedProperty.landlord?.contactPerson)}
                                            {renderPartyRow('IBAN', selectedProperty.landlord?.iban)}
                                        </>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">1-ша фірма</h3>
                                    <div className={`text-sm font-semibold ${(selectedProperty.tenant?.name ?? '').trim() ? 'text-white' : 'text-gray-500'}`}>{(selectedProperty.tenant?.name ?? '').trim() || '—'}</div>
                                    {formatAddress(selectedProperty.tenant?.address)?.trim() && <div className="text-sm text-gray-400 mt-0.5">{formatAddress(selectedProperty.tenant?.address)}</div>}
                                    {(() => { const p = selectedProperty.tenant; const phonesLine = normalizeArray((p?.phones?.length ? p.phones : (p?.phone ? [p.phone] : []))); const emailsLine = normalizeArray((p?.emails?.length ? p.emails : (p?.email ? [p.email] : []))); const metaLine = joinMeta([phonesLine, emailsLine]); return metaLine ? <div className="text-sm text-gray-400 mt-0.5">{metaLine}</div> : null; })()}
                                    {showPartiesDetails && (
                                        <>
                                            <div className="border-t border-gray-800 mt-2 pt-2" />
                                            {renderPartyRow('IBAN', selectedProperty.tenant?.iban)}
                                            {renderPartyRow('День оплати', (selectedProperty.tenant?.paymentDayOfMonth != null && selectedProperty.tenant.paymentDayOfMonth >= 1 && selectedProperty.tenant.paymentDayOfMonth <= 31) ? selectedProperty.tenant.paymentDayOfMonth : undefined)}
                                        </>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">2-га фірма</h3>
                                    <div className={`text-sm font-semibold ${(selectedProperty.secondCompany?.name ?? '').trim() ? 'text-white' : 'text-gray-500'}`}>{(selectedProperty.secondCompany?.name ?? '').trim() || '—'}</div>
                                    {formatAddress(selectedProperty.secondCompany?.address)?.trim() && <div className="text-sm text-gray-400 mt-0.5">{formatAddress(selectedProperty.secondCompany?.address)}</div>}
                                    {(() => { const p = selectedProperty.secondCompany; const phonesLine = normalizeArray((p?.phones?.length ? p.phones : (p?.phone ? [p.phone] : []))); const emailsLine = normalizeArray((p?.emails?.length ? p.emails : (p?.email ? [p.email] : []))); const metaLine = joinMeta([phonesLine, emailsLine]); return metaLine ? <div className="text-sm text-gray-400 mt-0.5">{metaLine}</div> : null; })()}
                                    {showPartiesDetails && (
                                        <>
                                            <div className="border-t border-gray-800 mt-2 pt-2" />
                                            {renderPartyRow('IBAN', selectedProperty.secondCompany?.iban)}
                                            {renderPartyRow('День оплати', (selectedProperty.secondCompany?.paymentDayOfMonth != null && selectedProperty.secondCompany.paymentDayOfMonth >= 1 && selectedProperty.secondCompany.paymentDayOfMonth <= 31) ? selectedProperty.secondCompany.paymentDayOfMonth : undefined)}
                                        </>
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Управління</h3>
                                    <div className={`text-sm font-semibold ${(selectedProperty.management?.name ?? '').trim() ? 'text-white' : 'text-gray-500'}`}>{(selectedProperty.management?.name ?? '').trim() || '—'}</div>
                                    {formatAddress(selectedProperty.management?.address)?.trim() && <div className="text-sm text-gray-400 mt-0.5">{formatAddress(selectedProperty.management?.address)}</div>}
                                    {(() => { const p = selectedProperty.management; const phonesLine = normalizeArray(p?.phones ?? []); const emailsLine = normalizeArray(p?.emails ?? []); const metaLine = joinMeta([phonesLine, emailsLine]); return metaLine ? <div className="text-sm text-gray-400 mt-0.5">{metaLine}</div> : null; })()}
                                    {showPartiesDetails && (
                                        <>
                                            <div className="border-t border-gray-800 mt-2 pt-2" />
                                            {renderPartyRow('ID', selectedProperty.management?.unitIdentifier?.trim() || undefined)}
                                            {renderPartyRow('Контакт', selectedProperty.management?.contactPerson)}
                                            {renderPartyRow('IBAN', selectedProperty.management?.iban)}
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* Платіжний ланцюжок — edges + files from paymentChainService */}
                            <div className="pb-4 border-b border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-white">Платіжний ланцюжок</span>
                                    <button type="button" onClick={() => setShowPaymentDetails(v => !v)} className="p-2 rounded-md border border-gray-700 bg-[#111315] hover:bg-[#15181b] text-gray-200 flex items-center gap-1.5 text-sm">
                                        {showPaymentDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        {showPaymentDetails ? 'Сховати деталізацію' : 'Показати деталізацію'}
                                    </button>
                                </div>
                                {paymentChainError && <div className="text-sm text-red-400 mb-2">{paymentChainError}</div>}
                                {paymentChainLoading ? (
                                    <div className="rounded-lg border border-gray-800 bg-[#0f1113] p-4 text-gray-500 text-sm">Завантаження платіжного ланцюжка…</div>
                                ) : (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-0 items-start">
                                    <div className="md:col-span-3">
                                        <div className="rounded-lg border border-gray-800 bg-[#0f1113] p-3">
                                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">ВЛАСНИК (отримує)</div>
                                            <div className="text-xs text-gray-500 mb-2">Очікуване отримання щомісяця</div>
                                            <div className="text-sm font-semibold text-white">Отримувач: {(selectedProperty.landlord?.name ?? '').trim() || '—'}</div>
                                            <div className="text-sm text-gray-400 font-mono mt-0.5">IBAN: {(selectedProperty.landlord?.iban ?? '').trim() || '—'}</div>
                                            <div className="mt-1 text-sm text-gray-400">Отримати до (1–31): {paymentTiles.from_company1_to_owner.payByDayOfMonth != null && paymentTiles.from_company1_to_owner.payByDayOfMonth >= 1 && paymentTiles.from_company1_to_owner.payByDayOfMonth <= 31 ? `до ${paymentTiles.from_company1_to_owner.payByDayOfMonth} числа` : '—'}</div>
                                            <div className="mt-1 text-sm font-semibold text-white">Сума (разом): {ownerTotalAuto != null && typeof ownerTotalAuto === 'number' ? `€${Number(ownerTotalAuto).toFixed(2)}` : '—'}</div>
                                            {showPaymentDetails && activeRentRow && (
                                                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                    <div>Kaltmiete: €{(activeRentRow.km ?? 0).toFixed(2)}</div>
                                                    <div>Betriebskosten: €{(activeRentRow.bk ?? 0).toFixed(2)}</div>
                                                    <div>Heizkosten: €{(activeRentRow.hk ?? 0).toFixed(2)}</div>
                                                    <div className="text-emerald-400 font-medium">Warmmiete: €{(activeRentRow.warm ?? 0).toFixed(2)}</div>
                                                </div>
                                            )}
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <label className="text-xs text-emerald-500 hover:text-emerald-400 cursor-pointer">+ Додати файл<input type="file" className="hidden" multiple onChange={e => { handlePaymentChainAddFiles('owner_control', e.target.files); e.target.value = ''; }} disabled={!!paymentChainUploadingTile} /></label>
                                                {paymentChainUploadingTile === 'owner_control' && <span className="text-xs text-gray-500">завантаження…</span>}
                                                {paymentChainFiles.owner_control.length > 0 && (
                                                    <ul className="list-none space-y-1 w-full">
                                                        {paymentChainFiles.owner_control.map(f => (
                                                            <li key={f.id} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                                                <span className="truncate flex-1">{f.file_name}</span>
                                                                <button type="button" onClick={() => handlePaymentChainViewFile(f.storage_path)} className="text-emerald-500 hover:text-emerald-400">Переглянути</button>
                                                                <button type="button" onClick={() => handlePaymentChainDeleteFile('owner_control', f)} className="text-gray-400 hover:text-white">Видалити</button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="hidden md:flex md:col-span-1 items-center justify-center text-gray-500 pt-8"><ArrowRight className="w-5 h-5 rotate-180" /></div>
                                    <div className="md:col-span-3">
                                        <div className="rounded-lg border border-gray-800 bg-[#0f1113] p-3">
                                            {!(selectedProperty.landlord?.name ?? '').trim() ? (
                                                <>
                                                    <div className="text-sm text-gray-500 py-2">Додай власника в Контрагенти</div>
                                                    <button type="button" onClick={startCard1Edit} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400">Додати в Контрагенти</button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">1-ША ФІРМА → ВЛАСНИК</div>
                                                    <div className="text-xs text-gray-500 mb-2">Платіж щомісяця</div>
                                                    <div className="text-sm font-semibold text-white">Кому платити: {(selectedProperty.landlord?.name ?? '').trim() || 'Додай власника в Контрагенти'}</div>
                                                    <div className="text-sm text-gray-400 font-mono mt-0.5">IBAN: {(selectedProperty.landlord?.iban ?? '').trim() || '—'}</div>
                                                    {editingPaymentTile === 'from_company1_to_owner' ? (
                                                        <>
                                                            <div className="mt-2"><span className="text-xs text-gray-500 block">Оплатити до (1–31)</span><div className="relative"><select value={paymentTiles.from_company1_to_owner.payByDayOfMonth ?? ''} onChange={e => { const v = e.target.value; setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, payByDayOfMonth: v === '' ? undefined : Math.min(31, Math.max(1, parseInt(v, 10) || 1)) } })); }} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white"><option value="">—</option>{Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select>{paymentTiles.from_company1_to_owner.payByDayOfMonth != null && <button type="button" onClick={() => setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, payByDayOfMonth: undefined } }))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>}</div><span className="text-xs text-gray-500 block mt-0.5">кожного місяця</span></div>
                                                            <div className="mt-1"><span className="text-xs text-gray-500 block">Сума (разом)</span><input type="text" value={paymentTiles.from_company1_to_owner.total} onChange={e => setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, total: e.target.value } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white" />{ownerTotalAuto > 0 && <span className="text-xs text-gray-500 block mt-0.5">Підказка: Warmmiete зараз €{Number(ownerTotalAuto).toFixed(2)}</span>}</div>
                                                            <div className="mt-1"><span className="text-xs text-gray-500 block">Опис</span><input type="text" value={paymentTiles.from_company1_to_owner.description} onChange={e => setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, description: e.target.value } }))} placeholder="оренда, BK, HK…" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white" /></div>
                                                            {showPaymentDetails && (
                                                                <div className="mt-2 pt-2 border-t border-gray-800 space-y-1">
                                                                    <div className="text-xs text-gray-500">Kaltmiete</div><input type="text" value={paymentTiles.from_company1_to_owner.breakdown.km ?? ''} onChange={e => setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, breakdown: { ...s.from_company1_to_owner.breakdown, km: e.target.value } } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1 text-sm text-white" />
                                                                    <div className="text-xs text-gray-500">Betriebskosten</div><input type="text" value={paymentTiles.from_company1_to_owner.breakdown.bk ?? ''} onChange={e => setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, breakdown: { ...s.from_company1_to_owner.breakdown, bk: e.target.value } } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1 text-sm text-white" />
                                                                    <div className="text-xs text-gray-500">Heizkosten</div><input type="text" value={paymentTiles.from_company1_to_owner.breakdown.hk ?? ''} onChange={e => setPaymentTiles(s => ({ ...s, from_company1_to_owner: { ...s.from_company1_to_owner, breakdown: { ...s.from_company1_to_owner.breakdown, hk: e.target.value } } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1 text-sm text-white" />
                                                                </div>
                                                            )}
                                                            <div className="mt-2 flex gap-1"><button type="button" onClick={() => setEditingPaymentTile(null)} className="text-xs text-emerald-500 hover:text-emerald-400">Зберегти</button><button type="button" onClick={() => setEditingPaymentTile(null)} className="text-xs text-gray-400 hover:text-white">Скасувати</button></div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="mt-1 text-sm text-gray-400">Оплатити до (1–31): {paymentTiles.from_company1_to_owner.payByDayOfMonth != null && paymentTiles.from_company1_to_owner.payByDayOfMonth >= 1 && paymentTiles.from_company1_to_owner.payByDayOfMonth <= 31 ? `до ${paymentTiles.from_company1_to_owner.payByDayOfMonth}-го числа (щомісяця)` : '—'}</div>
                                                            <div className="text-sm text-gray-400">Сума (разом): {paymentTiles.from_company1_to_owner.total || '—'}</div>
                                                            {paymentTiles.from_company1_to_owner.description && <div className="text-sm text-gray-400 mt-0.5">Опис: {paymentTiles.from_company1_to_owner.description}</div>}
                                                            {showPaymentDetails && (
                                                                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                                    {['km', 'bk', 'hk'].map(k => (paymentTiles.from_company1_to_owner.breakdown as Record<string, string>)[k] && <div key={k}>{k === 'km' ? 'Kaltmiete' : k === 'bk' ? 'Betriebskosten' : 'Heizkosten'}: {(paymentTiles.from_company1_to_owner.breakdown as Record<string, string>)[k]}</div>)}
                                                                    {!paymentTiles.from_company1_to_owner.breakdown.km && !paymentTiles.from_company1_to_owner.breakdown.bk && !paymentTiles.from_company1_to_owner.breakdown.hk && <div>—</div>}
                                                                </div>
                                                            )}
                                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                <label className="text-xs text-emerald-500 hover:text-emerald-400 cursor-pointer">+ Додати файл<input type="file" className="hidden" multiple onChange={e => { handlePaymentChainAddFiles('from_company1_to_owner', e.target.files); e.target.value = ''; }} disabled={!!paymentChainUploadingTile} /></label>
                                                                {paymentChainUploadingTile === 'from_company1_to_owner' && <span className="text-xs text-gray-500">завантаження…</span>}
                                                                {paymentChainFiles.from_company1_to_owner.length > 0 && (
                                                                    <ul className="list-none space-y-1 w-full">
                                                                        {paymentChainFiles.from_company1_to_owner.map(f => (
                                                                            <li key={f.id} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                                                                <span className="truncate flex-1">{f.file_name}</span>
                                                                                <button type="button" onClick={() => handlePaymentChainViewFile(f.storage_path)} className="text-emerald-500 hover:text-emerald-400">Переглянути</button>
                                                                                <button type="button" onClick={() => handlePaymentChainDeleteFile('from_company1_to_owner', f)} className="text-gray-400 hover:text-white">Видалити</button>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                )}
                                                                <button type="button" onClick={() => setEditingPaymentTile('from_company1_to_owner')} className="text-xs text-emerald-500 hover:text-emerald-400">Редагувати</button>
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hidden md:flex md:col-span-1 items-center justify-center text-gray-500 pt-8"><ArrowRight className="w-5 h-5 rotate-180" /></div>
                                    <div className="md:col-span-3">
                                        <div className="rounded-lg border border-gray-800 bg-[#0f1113] p-3">
                                            {!(selectedProperty.tenant?.name ?? '').trim() ? (
                                                <>
                                                    <div className="text-sm text-gray-500 py-2">Додай 1-шу фірму в Контрагенти</div>
                                                    <button type="button" onClick={startCard1Edit} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400">Додати в Контрагенти</button>
                                                </>
                                            ) : !(selectedProperty.secondCompany?.name ?? '').trim() ? (
                                                <>
                                                    <div className="text-sm text-gray-500 py-2">Додай 2-гу фірму в Контрагенти</div>
                                                    <button type="button" onClick={startCard1Edit} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400">Додати в Контрагенти</button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">2-ГА ФІРМА → 1-ША ФІРМА</div>
                                                    <div className="text-xs text-gray-500 mb-2">Платіж щомісяця</div>
                                                    <div className="text-sm font-semibold text-white">Кому платити: {(selectedProperty.tenant?.name ?? '').trim() || 'Додай 1-шу фірму в Контрагенти'}</div>
                                                    <div className="text-sm text-gray-400 font-mono mt-0.5">IBAN: {(selectedProperty.tenant?.iban ?? '').trim() || '—'}</div>
                                                    {editingPaymentTile === 'from_company2_to_company1' ? (
                                                        <>
                                                            <div className="mt-2"><span className="text-xs text-gray-500 block">Оплатити до (1–31)</span><div className="relative"><select value={paymentTiles.from_company2_to_company1.payByDayOfMonth ?? ''} onChange={e => { const v = e.target.value; setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, payByDayOfMonth: v === '' ? undefined : Math.min(31, Math.max(1, parseInt(v, 10) || 1)) } })); }} className="w-full bg-[#111315] border border-gray-700 rounded p-2 pr-8 text-sm text-white"><option value="">—</option>{Array.from({ length: 31 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select>{paymentTiles.from_company2_to_company1.payByDayOfMonth != null && <button type="button" onClick={() => setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, payByDayOfMonth: undefined } }))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white rounded">×</button>}</div><span className="text-xs text-gray-500 block mt-0.5">кожного місяця</span></div>
                                                            <div className="mt-1"><span className="text-xs text-gray-500 block">Сума (разом)</span><input type="text" value={paymentTiles.from_company2_to_company1.total} onChange={e => setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, total: e.target.value } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white" /></div>
                                                            <div className="mt-1"><span className="text-xs text-gray-500 block">Опис</span><input type="text" value={paymentTiles.from_company2_to_company1.description} onChange={e => setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, description: e.target.value } }))} placeholder="оренда, BK, HK…" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white" /></div>
                                                            {showPaymentDetails && (
                                                                <div className="mt-2 pt-2 border-t border-gray-800 space-y-1">
                                                                    <div className="text-xs text-gray-500">Kaltmiete</div><input type="text" value={paymentTiles.from_company2_to_company1.breakdown.km ?? ''} onChange={e => setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, breakdown: { ...s.from_company2_to_company1.breakdown, km: e.target.value } } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1 text-sm text-white" />
                                                                    <div className="text-xs text-gray-500">Betriebskosten</div><input type="text" value={paymentTiles.from_company2_to_company1.breakdown.bk ?? ''} onChange={e => setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, breakdown: { ...s.from_company2_to_company1.breakdown, bk: e.target.value } } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1 text-sm text-white" />
                                                                    <div className="text-xs text-gray-500">Heizkosten</div><input type="text" value={paymentTiles.from_company2_to_company1.breakdown.hk ?? ''} onChange={e => setPaymentTiles(s => ({ ...s, from_company2_to_company1: { ...s.from_company2_to_company1, breakdown: { ...s.from_company2_to_company1.breakdown, hk: e.target.value } } }))} className="w-full bg-[#111315] border border-gray-700 rounded p-1 text-sm text-white" />
                                                                </div>
                                                            )}
                                                            <div className="mt-2 flex gap-1"><button type="button" onClick={() => setEditingPaymentTile(null)} className="text-xs text-emerald-500 hover:text-emerald-400">Зберегти</button><button type="button" onClick={() => setEditingPaymentTile(null)} className="text-xs text-gray-400 hover:text-white">Скасувати</button></div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="mt-1 text-sm text-gray-400">Оплатити до (1–31): {paymentTiles.from_company2_to_company1.payByDayOfMonth != null && paymentTiles.from_company2_to_company1.payByDayOfMonth >= 1 && paymentTiles.from_company2_to_company1.payByDayOfMonth <= 31 ? `до ${paymentTiles.from_company2_to_company1.payByDayOfMonth}-го числа (щомісяця)` : '—'}</div>
                                                            <div className="text-sm text-gray-400">Сума (разом): {paymentTiles.from_company2_to_company1.total || '—'}</div>
                                                            {paymentTiles.from_company2_to_company1.description && <div className="text-sm text-gray-400 mt-0.5">Опис: {paymentTiles.from_company2_to_company1.description}</div>}
                                                            {showPaymentDetails && (
                                                                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                                    {['km', 'bk', 'hk'].map(k => (paymentTiles.from_company2_to_company1.breakdown as Record<string, string>)[k] && <div key={k}>{k === 'km' ? 'Kaltmiete' : k === 'bk' ? 'Betriebskosten' : 'Heizkosten'}: {(paymentTiles.from_company2_to_company1.breakdown as Record<string, string>)[k]}</div>)}
                                                                    {!paymentTiles.from_company2_to_company1.breakdown.km && !paymentTiles.from_company2_to_company1.breakdown.bk && !paymentTiles.from_company2_to_company1.breakdown.hk && <div>—</div>}
                                                                </div>
                                                            )}
                                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                <label className="text-xs text-emerald-500 hover:text-emerald-400 cursor-pointer">+ Додати файл<input type="file" className="hidden" multiple onChange={e => { handlePaymentChainAddFiles('from_company2_to_company1', e.target.files); e.target.value = ''; }} disabled={!!paymentChainUploadingTile} /></label>
                                                                {paymentChainUploadingTile === 'from_company2_to_company1' && <span className="text-xs text-gray-500">завантаження…</span>}
                                                                {paymentChainFiles.from_company2_to_company1.length > 0 && (
                                                                    <ul className="list-none space-y-1 w-full">
                                                                        {paymentChainFiles.from_company2_to_company1.map(f => (
                                                                            <li key={f.id} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                                                                <span className="truncate flex-1">{f.file_name}</span>
                                                                                <button type="button" onClick={() => handlePaymentChainViewFile(f.storage_path)} className="text-emerald-500 hover:text-emerald-400">Переглянути</button>
                                                                                <button type="button" onClick={() => handlePaymentChainDeleteFile('from_company2_to_company1', f)} className="text-gray-400 hover:text-white">Видалити</button>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                )}
                                                                <button type="button" onClick={() => setEditingPaymentTile('from_company2_to_company1')} className="text-xs text-emerald-500 hover:text-emerald-400">Редагувати</button>
                                                            </div>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hidden md:block md:col-span-1" />
                                </div>
                                )}
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block mb-2">Рентний таймлайн</span>
                                {rentTimelineLoading && <p className="text-xs text-gray-500 mb-1">Завантаження…</p>}
                                {rentTimelineError && <p className="text-sm text-red-400 mb-1">{rentTimelineError}</p>}
                                <div className="overflow-x-auto overflow-hidden border border-gray-700 rounded-lg">
                                    <table className="w-full text-sm text-left min-w-[800px]">
                                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700"><tr><th className="p-2 font-bold text-xs uppercase" title="Дійсний з">Von</th><th className="p-2 font-bold text-xs uppercase" title="Дійсний по">Bis</th><th className="p-2 font-bold text-xs uppercase text-right" title="Kaltmiete">KM</th><th className="p-2 font-bold text-xs uppercase text-right" title="Mietsteuer">MSt</th><th className="p-2 font-bold text-xs uppercase text-right" title="Unternehmenssteuer">USt</th><th className="p-2 font-bold text-xs uppercase text-right" title="Betriebskosten">BK</th><th className="p-2 font-bold text-xs uppercase text-right" title="Heizkosten">HK</th><th className="p-2 font-bold text-xs uppercase text-right" title="Müll">Müll</th><th className="p-2 font-bold text-xs uppercase text-right" title="Strom">Strom</th><th className="p-2 font-bold text-xs uppercase text-right" title="Gas">Gas</th><th className="p-2 font-bold text-xs uppercase text-right" title="Wasser">Wasser</th><th className="p-2 font-bold text-xs uppercase text-right" title="Warmmiete">WM</th></tr></thead>
                                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                                            {rentTimelineRows.length === 0 ? <tr><td colSpan={12} className="p-3 text-gray-500 text-center">Немає даних про оренду.</td></tr> : rentTimelineRows.map((r) => <tr key={r.id} className="hover:bg-[#1C1F24]"><td className="p-2 text-white">{r.validFrom}</td><td className="p-2 text-white">{r.validTo}</td><td className="p-2 text-right text-white font-mono">€{(r.km ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.mietsteuer ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.unternehmenssteuer ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.bk ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.hk ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.muell ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.strom ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.gas ?? 0).toFixed(2)}</td><td className="p-2 text-right text-white font-mono">€{(r.wasser ?? 0).toFixed(2)}</td><td className="p-2 text-right text-emerald-400 font-mono font-bold">€{(r.warm ?? 0).toFixed(2)}</td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                                <button type="button" onClick={() => { startCard1Edit(); setShowAddRentIncreaseForm(true); }} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400 font-medium">+ Додати підвищення оренди</button>
                            </div>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Застава (Kaution)</h3>
                                {(selectedProperty.deposit || kautionProofs.payment || kautionProofs.return) ? (
                                    <>
                                        <div className="grid grid-cols-12 gap-4 items-center">
                                            {/* Row 1: Deposit payment */}
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Дата оплати</span><span className="text-sm text-white">{selectedProperty.deposit?.paidAt?.trim() || '—'}</span></div>
                                            <div className="col-span-3"><span className="text-xs text-gray-500 block mb-1">Оплачено кому</span><span className="text-sm text-white">{selectedProperty.deposit?.paidTo?.trim() || '—'}</span></div>
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Сума (€)</span><span className="text-sm text-white font-bold">{(() => { const n = Number(selectedProperty.deposit?.amount); return (n != null && !Number.isNaN(n)) ? `€${n.toFixed(2)}` : '—'; })()}</span></div>
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${(selectedProperty.deposit?.status ?? 'unpaid') === 'paid' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{(selectedProperty.deposit?.status ?? 'unpaid') === 'paid' ? 'Оплачено' : 'Не оплачено'}</span></div>
                                            <div className="col-span-3 flex items-center justify-end">
                                                {kautionProofs.payment ? (
                                                    <button type="button" title="Підтвердження оплати застави" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.payment!.filePath); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"><FileText className="w-4 h-4" /></button>
                                                ) : <span className="text-sm text-gray-500">—</span>}
                                            </div>
                                            {/* Row 2: Deposit return */}
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Дата повернення</span><span className="text-sm text-white">{selectedProperty.deposit?.returnedAt?.trim() || '—'}</span></div>
                                            <div className="col-span-3"><span className="text-xs text-gray-500 block mb-1">Повернув хто / від кого</span><span className="text-sm text-gray-500">—</span></div>
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Сума повернення (€)</span><span className="text-sm text-white">{selectedProperty.deposit?.returnedAmount != null ? (() => { const n = Number(selectedProperty.deposit!.returnedAmount); return !Number.isNaN(n) ? `€${n.toFixed(2)}` : '—'; })() : '—'}</span></div>
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${(selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'returned' ? 'bg-emerald-500/20 text-emerald-400' : (selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'partially_returned' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>{(selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'returned' ? 'Повернено' : (selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'partially_returned' ? 'Частково повернено' : 'Не повернено'}</span></div>
                                            <div className="col-span-3 flex items-center justify-end">
                                                {kautionProofs.return ? (
                                                    <button type="button" title="Підтвердження повернення застави" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.return!.filePath); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"><FileText className="w-4 h-4" /></button>
                                                ) : <span className="text-sm text-gray-500">—</span>}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-12 gap-4 items-center">
                                        <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Дата оплати</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-3"><span className="text-xs text-gray-500 block mb-1">Оплачено кому</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Сума (€)</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-3" />
                                        <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Дата повернення</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-3"><span className="text-xs text-gray-500 block mb-1">Повернув хто / від кого</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Сума повернення (€)</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className="text-sm text-gray-500">—</span></div>
                                        <div className="col-span-3" />
                                    </div>
                                )}
                            </div>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Документи та договори</h3>
                                {card1DocumentsLoading ? <p className="text-sm text-gray-500">Завантаження…</p> : card1DocumentsError ? <p className="text-sm text-red-400">{card1DocumentsError}</p> : (
                                    <ul className="space-y-2">
                                        {card1Documents.length === 0 ? <li className="text-sm text-gray-500">Немає документів.</li> : card1Documents.map((doc) => (
                                            <li key={doc.id} className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="text-white font-medium">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                                                {doc.title && <span className="text-gray-400">— {doc.title}</span>}
                                                {doc.docDate && <span className="text-gray-500">({doc.docDate})</span>}
                                                <button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); window.open(url, '_blank'); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="text-emerald-500 hover:text-emerald-400 text-xs">Відкрити</button>
                                                <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => { alert(e?.message || 'Помилка видалення'); }).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="text-red-400 hover:text-red-300 text-xs">Видалити</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                    {isAddressBookModalOpen && (
                        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" onClick={() => setIsAddressBookModalOpen(false)}>
                            <div className="bg-[#1C1F24] w-full max-w-2xl max-h-[80vh] rounded-xl border border-gray-700 shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                                    <h3 className="text-lg font-bold text-white">Address Book</h3>
                                    <button type="button" onClick={() => setIsAddressBookModalOpen(false)} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                                    {addressBookDeleteError && <p className="text-xs text-amber-500 mb-3">Delete failed: {addressBookDeleteError}</p>}
                                    {addressBookLoading ? <p className="text-sm text-gray-500">Завантаження…</p> : addressBookEntries.length === 0 ? <p className="text-sm text-gray-500">Немає записів. Збережіть картку обʼєкта (сторони угоди), щоб додати контакти в Address Book.</p> : (
                                        <div className="space-y-4">
                                            {(['owner', 'company1', 'company2', 'management'] as const).map(role => {
                                                const byRole = addressBookEntries.filter(e => e.role === role);
                                                const roleLabel = role === 'owner' ? 'Власник' : role === 'company1' ? '1-ша фірма' : role === 'company2' ? '2-га фірма' : 'Управління';
                                                return (
                                                    <div key={role}>
                                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{roleLabel}</h4>
                                                        {byRole.length === 0 ? <p className="text-sm text-gray-500">—</p> : (
                                                        <ul className="space-y-2">
                                                            {byRole.map(entry => {
                                                                const addressLine = formatAddress({ street: entry.street, houseNumber: entry.houseNumber ?? '', zip: entry.zip, city: entry.city, country: entry.country ?? '' });
                                                                const phonesLine = normalizeArray(entry.phones ?? []);
                                                                const emailsLine = normalizeArray(entry.emails ?? []);
                                                                const meta = joinMeta([addressLine, phonesLine, emailsLine]);
                                                                const isDeleting = entry.id != null && addressBookDeletingId === entry.id;
                                                                return (
                                                                    <li key={entry.id ?? `${entry.role}-${entry.name}-${entry.street}-${entry.zip}`} className="p-3 rounded-lg bg-[#111315] border border-gray-700 text-sm flex items-start justify-between gap-2">
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className="text-sm">
                                                                                <span className="font-semibold text-white">{entry.name}</span>
                                                                                <span className="ml-1.5 text-xs font-normal text-gray-400">({roleLabel})</span>
                                                                                {(role === 'owner' || role === 'management') && (entry.unitIdentifier ?? '').trim() && <span className="ml-1.5 text-xs font-normal text-gray-400">ID: {(entry.unitIdentifier ?? '').trim()}</span>}
                                                                                {(role === 'company1' || role === 'company2') && entry.paymentDay != null && entry.paymentDay >= 1 && entry.paymentDay <= 31 && <span className="ml-1.5 text-xs font-normal text-gray-400">Pay: {entry.paymentDay}</span>}
                                                                            </div>
                                                                            <div className={meta ? 'text-gray-400 text-xs mt-0.5' : 'text-gray-500 text-xs mt-0.5'}>{meta || '—'}</div>
                                                                        </div>
                                                                        {entry.id != null && (
                                                                            <button type="button" title="Видалити з Address Book" disabled={isDeleting} onClick={async () => { if (!window.confirm('Видалити цей контакт з Address Book?')) return; setAddressBookDeleteError(null); setAddressBookDeletingId(entry.id!); const removed = entry; setAddressBookEntries(prev => prev.filter(e => e.id !== entry.id)); try { await addressBookPartiesService.deleteById(entry.id!); } catch (e) { console.error('[AddressBook deleteById]', e); setAddressBookDeleteError(String((e as Error)?.message ?? e)); const { data: { user } } = await supabase.auth.getUser(); if (user?.id) { const list = await addressBookPartiesService.listByRole(user.id); setAddressBookEntries(list); } else { setAddressBookEntries(prev => [...prev, removed]); } } finally { setAddressBookDeletingId(null); } }} className={`p-2 rounded-md border border-gray-700 text-gray-200 shrink-0 ${isDeleting ? 'opacity-50 cursor-not-allowed' : 'bg-[#111315] hover:bg-[#15181b]'}`}><Trash2 className="w-4 h-4" size={16} /></button>
                                                                        )}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Card 2: Unit Details & Ausstattung — single editable form (details + amenities only; no building) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">🏠 Дані квартири</h2>
                    {!isCard2Editing && (
                        <button
                            onClick={startCard2Edit}
                            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                            <Edit className="w-4 h-4 mr-1 inline" /> Редагувати
                        </button>
                    )}
                </div>
                {(() => {
                    const d = isCard2Editing && card2Draft ? card2Draft.details : (selectedProperty.details || {});
                    const a = isCard2Editing && card2Draft ? card2Draft.amenities : (selectedProperty.amenities || {});
                    const view = !isCard2Editing;
                    const ph = (v: unknown) => (v !== undefined && v !== null && String(v).trim() !== '') ? String(v) : '—';
                    const phNum = (v: unknown) => (v === undefined || v === null || v === '') ? '—' : String(v);
                    const numOrZero = (v: unknown) => (v !== undefined && v !== null && !Number.isNaN(Number(v))) ? Number(v) : 0;
                    return (
                        <>
                            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Основні параметри</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-4 gap-x-6 text-sm mb-6">
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Площа</span>
                                    {view ? <span className="text-white font-bold">{(d.area != null && d.area !== 0) ? String(d.area) : '—'}</span> : (
                                        <input type="number" min={0} step={0.1} className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={d.area != null && d.area !== 0 ? d.area : ''} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, area: parseFloat(e.target.value) || 0 } })} placeholder="—" />
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Кімнати</span>
                                    {view ? <span className="text-white font-bold">{phNum(d.rooms)}</span> : (
                                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={numOrZero(d.rooms)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, rooms: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Ліжка</span>
                                    {view ? <span className="text-white font-bold">{phNum(d.beds)}</span> : (
                                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={numOrZero(d.beds)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, beds: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Ванни</span>
                                    {view ? <span className="text-white font-bold">{phNum(d.baths)}</span> : (
                                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={numOrZero(d.baths)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, baths: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Балкони</span>
                                    {view ? <span className="text-white font-bold">{phNum(d.balconies)}</span> : (
                                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={numOrZero(d.balconies)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, balconies: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Поверх (поточний)</span>
                                    {view ? <span className="text-white font-bold">{phNum(d.floor)}</span> : (
                                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={numOrZero(d.floor)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, floor: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs block mb-1">Поверх (всього)</span>
                                    {view ? <span className="text-white font-bold">{phNum(d.buildingFloors)}</span> : (
                                        <input type="number" className="w-full bg-[#111315] border border-gray-700 rounded p-1.5 text-sm text-white font-bold" value={numOrZero(d.buildingFloors)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, buildingFloors: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                            </div>
                            <div className="border-t border-gray-700 pt-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Ausstattung</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {AMENITY_GROUPS.map(({ groupLabel, keys }) => (
                                        <div key={groupLabel} className="bg-[#111315] border border-gray-700 rounded-lg p-3">
                                            <div className="text-xs font-semibold text-gray-400 mb-2">{groupLabel}</div>
                                            <div className="space-y-1.5">
                                                {keys.map((key) => {
                                                    const checked = !!a[key];
                                                    return (
                                                        <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                                                            {view ? (
                                                                <span className="text-white">{key}: <span className="font-bold">{checked ? 'Так' : '—'}</span></span>
                                                            ) : (
                                                                <>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="rounded border-gray-600 bg-[#0D1117] text-emerald-500 focus:ring-emerald-500"
                                                                        checked={checked}
                                                                        onChange={e => card2Draft && setCard2Draft({ ...card2Draft, amenities: { ...card2Draft.amenities, [key]: e.target.checked } })}
                                                                    />
                                                                    <span className="text-white">{key}</span>
                                                                </>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    );
                })()}
                {isCard2Editing && (
                    <div className="mt-6 pt-4 border-t border-gray-700 flex gap-3">
                        <button type="button" onClick={saveCard2} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                            <Save className="w-4 h-4" /> Зберегти
                        </button>
                        <button type="button" onClick={cancelCard2} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                            Скасувати
                        </button>
                    </div>
                )}
            </section>

            {/* Card 3 — Building (read-only) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <h2 className="text-2xl font-bold text-white mb-4">Будівля</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-y-4 gap-x-6 text-sm">
                    <div><span className="text-gray-500 text-xs block">Тип будівлі</span><span className="text-white font-bold">{selectedProperty.building?.type || '—'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Рік побудови</span><span className="text-white font-bold">{selectedProperty.details?.year ? String(selectedProperty.details.year) : '—'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Рік ремонту</span><span className="text-white font-bold">{selectedProperty.building?.repairYear ? String(selectedProperty.building.repairYear) : '—'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Ліфт</span><span className="text-white font-bold">{selectedProperty.building?.elevator || '—'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Доступність</span><span className="text-white font-bold">{selectedProperty.building?.access || '—'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Сертифікат</span><span className="text-white font-bold">{selectedProperty.building?.certificate || '—'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Енергоклас</span><span className="text-white font-bold">{selectedProperty.building?.energyClass || '—'}</span></div>
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
                                (import.meta.env.DEV && fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AccountDashboard.tsx:2075',message:'Rendering property inventory',data:{propertyId:selectedProperty.id,propertyTitle:selectedProperty.title,totalInventoryCount:selectedProperty.inventory.length,firstItem:{itemId:item.itemId,invNumber:item.invNumber,name:item.name,type:item.type,sku:item.sku}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{}));
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

            {/* Current Tenant - TODO: Rename "Актуальний Орендар" -> "Актуальний Клієнт" and decouple from Parties (future task) */}
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
        <React.Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">Loading tasks…</div>}>
          <KanbanBoard />
        </React.Suspense>
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
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {leads.map(lead => (
                                <tr key={lead.id} className="hover:bg-[#16181D]">
                                    <td className="p-4 text-gray-400">#{String(lead.id).slice(0, 8)}</td>
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
                                    <td className="p-4 text-gray-400">{typeof lead.createdAt === 'string' ? lead.createdAt.slice(0, 10) : lead.createdAt}</td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button type="button" onClick={() => setEditingLead(lead)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Редагувати"><Edit className="w-4 h-4" /></button>
                                            <button type="button" onClick={() => handleDeleteLead(lead.id)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {leads.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-gray-500">No leads found.</td>
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
                                <th className="p-4">Reservation ID</th>
                                <th className="p-4">Offer No.</th>
                                <th className="p-4">Guest</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {reservations.map(res => {
                                const linkedOffer = offers.find(o => o.reservationId != null && (String(o.reservationId) === String(res.id)));
                                const offerNoDisplay = linkedOffer ? (linkedOffer.offerNo || linkedOffer.id) : '—';
                                const resStatusLower = String(res.status).toLowerCase();
                                const isLostOrCancelled = ['lost', 'cancelled'].includes(resStatusLower);
                                const getReservationStatusBadge = () => {
                                    if (res.status === BookingStatus.RESERVED || resStatusLower === 'open') return 'bg-blue-500/20 text-blue-500';
                                    if (res.status === BookingStatus.OFFER_SENT || resStatusLower === 'offered') return 'bg-blue-500/20 text-blue-500 border border-dashed';
                                    if (res.status === BookingStatus.INVOICED || resStatusLower === 'invoiced') return 'bg-blue-500/20 text-blue-500';
                                    if (resStatusLower === 'won') return 'bg-emerald-500/20 text-emerald-400';
                                    if (resStatusLower === 'lost') return 'bg-red-500/20 text-red-400';
                                    if (resStatusLower === 'cancelled') return 'bg-gray-500/20 text-gray-400';
                                    return 'bg-gray-500/20 text-gray-400';
                                };
                                return (
                                <tr key={res.id} className={`hover:bg-[#16181D] ${isLostOrCancelled ? 'opacity-70' : ''}`}>
                                    <td className={`p-4 ${isLostOrCancelled ? 'text-gray-500' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-mono text-sm truncate max-w-[140px] ${isLostOrCancelled ? 'text-gray-500 line-through' : 'text-gray-300'}`} title="Reservation number or ID">
                                                {res.reservationNo || String(res.id)}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(res.reservationNo || String(res.id));
                                                }}
                                                className="text-gray-500 hover:text-white transition-colors shrink-0"
                                                title="Copy reservation number"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                    <td className={`p-4 ${isLostOrCancelled ? 'text-gray-500' : ''}`}>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-mono text-sm ${isLostOrCancelled ? 'text-gray-500' : 'text-gray-300'}`} title={linkedOffer ? 'Offer number' : undefined}>
                                                {offerNoDisplay}
                                            </span>
                                            {offerNoDisplay !== '—' && (
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(offerNoDisplay);
                                                    }}
                                                    className="text-gray-500 hover:text-white transition-colors"
                                                    title="Copy offer number"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className={`p-4 font-bold ${isLostOrCancelled ? 'text-gray-500 line-through' : ''}`}>{res.guest}</td>
                                    <td className={`p-4 ${isLostOrCancelled ? 'text-gray-500' : ''}`}>{getPropertyNameById(res.roomId)}</td>
                                    <td className={`p-4 tabular-nums ${isLostOrCancelled ? 'text-gray-500' : ''}`}>{formatDateEU(res.start)} – {formatDateEU(res.end)}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${getReservationStatusBadge()}`}>
                                            {res.status}
                                        </span>
                                    </td>
                                    <td className={`p-4 text-right font-mono ${isLostOrCancelled ? 'text-gray-500' : ''}`}>{res.price}</td>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => openManageModal(res)}
                                            className="text-gray-400 hover:text-white"
                                        >
                                            Manage
                                        </button>
                                    </td>
                                </tr>
                            );
                            })}
                            {reservations.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">No reservations found.</td>
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
                                <th className="p-4">Proforma No.</th>
                                <th className="p-4">Offer No.</th>
                                <th className="p-4">Reservation No.</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {offers.map(offer => {
                                const isDraft = offer.status === 'Draft';
                                const isInvoiced = offer.status === 'Invoiced';
                                const isLost = offer.status === 'Lost';
                                const isOfferClosedForActions = offer.status === 'Accepted' || offer.status === 'Lost';
                                
                                // Find linked reservation: by offer.reservationId first, else by matching dates, client, and property
                                const [offerStart, offerEnd] = offer.dates.split(' to ');
                                const linkedBooking = reservations.find(booking => {
                                    const bookingStart = booking.start?.split('T')[0] || booking.start;
                                    const bookingEnd = booking.end?.split('T')[0] || booking.end;
                                    return bookingStart === offerStart && 
                                           bookingEnd === offerEnd &&
                                           booking.guest === offer.clientName &&
                                           booking.roomId === offer.propertyId;
                                });
                                const linkedReservation = offer.reservationId
                                    ? reservations.find(r => String(r.id) === String(offer.reservationId))
                                    : linkedBooking;
                                const linkedProforma = invoices.find(inv => inv.documentType === 'proforma' && (String(inv.offerId || inv.offerIdSource) === String(offer.id)));
                                
                                const getStatusStyle = () => {
                                    if (isDraft) return 'bg-gray-500/20 text-gray-400 border-gray-500';
                                    if (isInvoiced) return 'bg-purple-500/20 text-purple-400 border-purple-500';
                                    if (offer.status === 'Accepted') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500';
                                    if (offer.status === 'Lost') return 'bg-red-500/20 text-red-400 border-red-500';
                                    return 'bg-blue-500/20 text-blue-500 border-blue-500';
                                };
                                
                                return (
                                    <tr key={offer.id} className={`hover:bg-[#16181D] ${isDraft || isInvoiced || isLost ? 'opacity-70' : ''}`}>
                                        <td className={`p-4 ${isLost ? 'text-gray-500' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono text-sm ${isLost ? 'text-gray-500' : 'text-gray-300'}`}>
                                                    {linkedProforma?.invoiceNumber ?? '—'}
                                                </span>
                                                {(linkedProforma?.invoiceNumber) && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(linkedProforma.invoiceNumber || '');
                                                        }}
                                                        className="text-gray-500 hover:text-white transition-colors"
                                                        title="Copy proforma number"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`p-4 ${isLost ? 'text-gray-500' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono text-sm ${isLost ? 'text-gray-500' : 'text-gray-300'}`}>
                                                    {offer.offerNo ?? '—'}
                                                </span>
                                                {(offer.offerNo) && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(offer.offerNo || '');
                                                        }}
                                                        className="text-gray-500 hover:text-white transition-colors"
                                                        title="Copy offer number"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`p-4 ${isLost ? 'text-gray-500' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono text-sm ${isLost ? 'text-gray-500' : 'text-gray-300'}`}>
                                                    {linkedReservation?.reservationNo ?? '—'}
                                                </span>
                                                {(linkedReservation?.reservationNo) && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(linkedReservation.reservationNo || '');
                                                        }}
                                                        className="text-gray-500 hover:text-white transition-colors"
                                                        title="Copy reservation number"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className={`p-4 font-bold ${isLost ? 'text-gray-500 line-through' : ''}`}>{offer.clientName}</td>
                                        <td className={`p-4 ${isLost ? 'text-gray-500' : ''}`}>{getPropertyNameById(offer.propertyId)}</td>
                                        <td className={`p-4 tabular-nums ${isLost ? 'text-gray-500' : ''}`}>{[offerStart, offerEnd].map(d => formatDateEU(d)).join(' – ')}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border border-dashed ${getStatusStyle()}`}>
                                                {offer.status}
                                            </span>
                                        </td>
                                        <td className={`p-4 text-right font-mono ${isLost ? 'text-gray-500' : ''}`}>{offer.price}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex justify-between items-center gap-4">
                                                <div className="flex gap-2 items-center">
                                                    {!isOfferClosedForActions && isDraft && (
                                                        <button 
                                                            onClick={() => {
                                                                setOffers(prev => prev.map(o => 
                                                                    o.id === offer.id ? { ...o, status: 'Sent' } : o
                                                                ));
                                                            }}
                                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold transition-colors"
                                                        >
                                                            Send Offer
                                                        </button>
                                                    )}
                                                    {!isOfferClosedForActions && offer.status === 'Sent' && (
                                                        <button 
                                                            onClick={() => handleCreateInvoiceClick(offer)}
                                                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold transition-colors"
                                                        >
                                                            Add Proforma
                                                        </button>
                                                    )}
                                                    {!isOfferClosedForActions && isInvoiced && (
                                                        <span className="px-3 py-1.5 text-gray-500 text-xs">Proforma added</span>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <button 
                                                        onClick={() => handleViewOffer(offer)}
                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
                                                    >
                                                        View
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteOffer(offer.id)}
                                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition-colors"
                                                        title="Delete offer"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {offers.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-8 text-center text-gray-500">No offers found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (salesTab === 'proformas') {
        const isProformaLost = (p: InvoiceData): boolean => {
            if (p.reservationId) {
                const res = reservations.find(r => String(r.id) === String(p.reservationId));
                return res ? (res.status === 'lost' || res.status === 'cancelled') : false;
            }
            const offerId = p.offerId || p.offerIdSource;
            if (offerId) {
                const off = offers.find(o => String(o.id) === String(offerId));
                return off ? (off.status === 'Lost') : false;
            }
            return false;
        };
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <h2 className="text-2xl font-bold mb-6">Payments</h2>
                <div className="bg-[#1C1F24] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4 w-10" />
                                <th className="p-4">Number</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Document</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {proformas.map(proforma => {
                                const lost = isProformaLost(proforma);
                                return (
                                <React.Fragment key={proforma.id}>
                                    <tr className={`hover:bg-[#16181D] border-b border-white/5 ${lost ? 'opacity-70 text-gray-500' : ''}`}>
                                        <td className="p-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleProformaExpand(proforma.id)}
                                                className="text-gray-400 hover:text-white"
                                            >
                                                {expandedProformaIds.has(proforma.id) ? (
                                                    <ChevronDown className="w-4 h-4" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td className={`p-4 font-mono ${lost ? 'line-through text-gray-500' : ''}`}>{proforma.invoiceNumber}</td>
                                        <td className={`p-4 ${lost ? 'line-through text-gray-500' : ''}`}>{proforma.clientName}</td>
                                        <td className="p-4 tabular-nums">{formatDateEU(proforma.date)}</td>
                                        <td className="p-4">€{proforma.totalGross?.toFixed(2) ?? '—'}</td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                              {proforma.fileUrl ? (
                                                <a href={proforma.fileUrl} target="_blank" rel="noopener noreferrer" className={DOC_LINK_PILL}>
                                                  <FileText className="w-3.5 h-3.5" />
                                                  PDF
                                                </a>
                                              ) : (
                                                <span className="text-gray-500">—</span>
                                              )}
                                              {(proofSignedUrlByInvoiceId[proforma.id] ?? proforma.paymentProofUrl) ? (
                                                <a href={proofSignedUrlByInvoiceId[proforma.id] ?? proforma.paymentProofUrl ?? '#'} target="_blank" rel="noopener noreferrer" className={DOC_LINK_PILL}>
                                                  <FileText className="w-3.5 h-3.5" />
                                                  PDF
                                                </a>
                                              ) : null}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {!lost && (proforma.status === 'Paid' ? (
                                                <span className="text-emerald-400 text-xs">Confirmed ✓</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmPaymentModalProforma(proforma)}
                                                    className="px-3 py-1.5 rounded text-xs font-bold transition-colors bg-green-600 hover:bg-green-500 text-white"
                                                    title="Confirm payment"
                                                >
                                                    Confirm payment
                                                </button>
                                            ))}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteProforma(proforma)}
                                                    className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${lost ? 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50' : 'text-red-400 hover:text-red-300 hover:bg-red-900/30'}`}
                                                    title="Delete proforma"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedProformaIds.has(proforma.id) && (
                                        <>
                                            {(proformaChildInvoices[proforma.id] ?? []).map(inv => (
                                                <tr key={inv.id} className="text-sm text-gray-300 hover:bg-[#16181D]">
                                                    <td className="p-4" />
                                                    <td className="p-4 pl-8 font-mono">{inv.invoiceNumber}</td>
                                                    <td className="p-4" />
                                                    <td className="p-4 tabular-nums">{formatDateEU(inv.date)}</td>
                                                    <td className="p-4 tabular-nums">€{inv.totalGross?.toFixed(2) ?? '—'}</td>
                                                    <td className="p-4">
                                                        {inv.fileUrl ? (
                                                            <a href={inv.fileUrl} target="_blank" rel="noopener noreferrer" className={DOC_LINK_PILL}>
                                                                <FileText className="w-3.5 h-3.5" />
                                                                PDF
                                                            </a>
                                                        ) : (
                                                            <span className="text-gray-500">—</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4" />
                                                    <td className="p-4 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteInvoice(inv, proforma.id)}
                                                            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded text-xs font-medium transition-colors"
                                                            title="Delete invoice"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="text-sm text-gray-400 hover:bg-[#16181D]">
                                                <td className="p-4" />
                                                <td colSpan={6} className="p-4 pl-8">
                                                    <button
                                                        type="button"
                                                        disabled={lost}
                                                        onClick={() => !lost && handleAddInvoiceToProforma(proforma)}
                                                        className="text-left hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        + Add invoice
                                                    </button>
                                                </td>
                                                <td className="p-4" />
                                            </tr>
                                            {[...(paymentProofsByInvoiceId[proforma.id] ?? [])]
                                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                .map(proof => (
                                                        <tr key={proof.id} className="text-sm text-gray-300 hover:bg-[#16181D]">
                                                            <td className="p-4" />
                                                            <td className="p-4 pl-8 font-mono">{proof.documentNumber ?? '—'}</td>
                                                            <td className="p-4" />
                                                            <td className="p-4 tabular-nums text-gray-400">{formatDateEU(proof.createdAt)}</td>
                                                            <td className="p-4" />
                                                            <td className="p-4">
                                                                {proof.filePath ? (
                                                                    <ProofLink filePath={proof.filePath} label="PDF" />
                                                                ) : (
                                                                    <span className="text-gray-500">—</span>
                                                                )}
                                                            </td>
                                                            <td className="p-4">
                                                                {proof.rpcConfirmedAt ? (
                                                                    <span className="text-emerald-400 text-xs">Confirmed ✓</span>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-amber-400 text-xs">Not confirmed</span>
                                                                        {proforma.status !== 'Paid' && (
                                                                            <button type="button" onClick={() => handleRetryProofConfirmation(proforma, proof)} className="ml-2 px-2 py-1 rounded text-xs bg-amber-600 hover:bg-amber-500 text-white">Retry</button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                                                    {proof.filePath ? (
                                                                        <button type="button" onClick={() => setPaymentProofModal({ mode: 'replace', proof })} className="px-2 py-1 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white">Replace</button>
                                                                    ) : (
                                                                        <button type="button" onClick={() => setPaymentProofModal({ mode: 'add', proof })} className="px-2 py-1 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white">Add PDF</button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                        </>
                                    )}
                                </React.Fragment>
                                );
                            })}
                            {proformas.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">No payments yet. Add a proforma from an offer (Offers tab → Add Proforma).</td>
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
                                    <td className="p-4 tabular-nums">{formatDateEU(req.startDate)} – {formatDateEU(req.endDate)}</td>
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
                                    <td className="p-4 tabular-nums">{formatDateEU(res.start)} – {formatDateEU(res.end)}</td>
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
          onDeleteBooking={handleDeleteBooking}
          onAddLead={handleAddLeadFromBooking}
          leads={leads}
          reservations={reservations}
          confirmedBookings={confirmedBookings}
          offers={offers}
          invoices={invoices}
          paymentProofsByInvoiceId={paymentProofsByInvoiceId}
          getPaymentProofSignedUrl={async (filePath) => { try { return await paymentProofsService.getPaymentProofSignedUrl(filePath); } catch { return null; } }}
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
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('proformas'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'proformas'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Payments
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
          onDeleteReservation={handleDeleteReservation}
          onDeleteOffer={viewingOffer ? handleDeleteOffer : undefined}
          isViewingOffer={viewingOffer}
      />
      <InvoiceModal isOpen={isInvoiceModalOpen} onClose={() => { setIsInvoiceModalOpen(false); setSelectedOfferForInvoice(null); setSelectedInvoice(null); setSelectedProformaForInvoice(null); }} offer={selectedOfferForInvoice} invoice={selectedInvoice} proforma={selectedProformaForInvoice} onSave={handleSaveInvoice} reservations={reservations} offers={offers} />
      <ConfirmPaymentModal
        isOpen={!!confirmPaymentModalProforma}
        onClose={() => setConfirmPaymentModalProforma(null)}
        proforma={confirmPaymentModalProforma}
        onConfirmed={async (newBookingId) => {
          await refreshDataAfterPaymentConfirmed(newBookingId);
          setConfirmPaymentModalProforma(null);
        }}
      />
      <PaymentProofPdfModal
        isOpen={!!paymentProofModal}
        onClose={() => setPaymentProofModal(null)}
        mode={paymentProofModal?.mode ?? 'add'}
        proof={paymentProofModal?.proof ?? null}
        onDone={async () => {
          if (paymentProofModal?.proof) await loadPaymentProofsForInvoiceIds([paymentProofModal.proof.invoiceId]);
        }}
      />
      <OfferEditModal 
          isOpen={isOfferEditModalOpen} 
          onClose={() => setIsOfferEditModalOpen(false)} 
          offer={offerToEdit} 
          onSave={handleSaveOfferUpdate}
          onDelete={handleDeleteOffer}
      />
      {editingLead && (
        <LeadEditModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSave={(updates) => handleSaveLeadEdit(editingLead.id, updates)}
        />
      )}
      <PropertyAddModal 
        isOpen={isPropertyAddModalOpen} 
        onClose={() => {
          setIsPropertyAddModalOpen(false);
          setPropertyToEdit(undefined);
        }} 
        onSave={handleSaveProperty}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-[300] border border-gray-700">
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-medium">{toastMessage}</span>
            {createdOfferId && (
              <button
                onClick={() => {
                  setSalesTab('offers');
                  const offer = offers.find(o => o.id === createdOfferId);
                  if (offer) {
                    handleViewOffer(offer);
                  }
                  setToastMessage(null);
                  setCreatedOfferId(null);
                }}
                className="ml-3 text-emerald-400 hover:text-emerald-300 text-sm font-medium underline"
              >
                Open Offer →
              </button>
            )}
          </div>
          <button
            onClick={() => {
              setToastMessage(null);
              setCreatedOfferId(null);
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountDashboard;
