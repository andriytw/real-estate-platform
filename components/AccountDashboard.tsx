import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  SHELL_RESUME_DEBUG,
  registerShellDebugSnapshotGetter,
  buildAccountDashboardShellDebugSnapshot,
} from '../lib/shellDebug';
import { LayoutDashboard, Calendar, MessageSquare, Settings, LogOut, User, PieChart, TrendingUp, Users, CheckCircle2, AlertCircle, AlertTriangle, Clock, ArrowRight, Building, Briefcase, Mail, DollarSign, FileText, Calculator, ChevronDown, ChevronUp, ChevronRight, FileBox, Bookmark, X, Save, Building2, Phone, MapPin, Home, Search, Filter, Plus, Edit, Camera, BarChart3, Box, FolderOpen, Folder, File as FileIcon, Upload, Trash2, AreaChart, PenTool, DoorOpen, Wrench, Check, Zap, Droplet, Flame, Video, BookOpen, Eye, Paperclip, Square, Download, MoreVertical, Archive, RotateCcw, History } from 'lucide-react';
import { useWorker } from '../contexts/WorkerContext';

import AdminCalendar from './AdminCalendar';
import AdminMessages from './AdminMessages';
import SalesCalendar from './SalesCalendar';
import SalesStatsSection from './SalesStatsSection';
import SalesChat from './SalesChat';
import BookingDetailsModal from './BookingDetailsModal';
import type { StayOverviewStayContext } from '../utils/stayOverviewFromBooking';
import InvoiceModal from './InvoiceModal';
import OfferEditModal from './OfferEditModal';
import MultiApartmentOfferDetailsModal from './MultiApartmentOfferDetailsModal';
import MultiApartmentOfferModal from './MultiApartmentOfferModal';
import SendChannelModal, { type SendChannelPayload } from './SendChannelModal';
import LeadEditModal from './LeadEditModal';
import LeadCreateModal from './LeadCreateModal';
import ClientHistoryModal from './ClientHistoryModal';
import PropertyAddModal from './PropertyAddModal';
import RequestModal from './RequestModal';
import ConfirmPaymentModal from './ConfirmPaymentModal';
import Model3DViewer from './Model3DViewer';
import PaymentProofPdfModal from './PaymentProofPdfModal';
import ExpenseCategoriesModal from './ExpenseCategoriesModal';
import BankingDashboard from './BankingDashboard';
import UserManagement from './admin/UserManagement';
import { canViewModule, canManageUsers, type AppModule } from '../lib/permissions';
import { firstAllowedDashboardModule, canAccessDashboardModule } from '../lib/uiAccess';
import { workerRoleLabelUk } from '../lib/workerRoleLabels';
import { getCalendarEventAssigneeId, getCalendarEventAssigneeName } from '../lib/assigneeIdentity';

// Lazy-load KanbanBoard so @hello-pangea/dnd is only loaded when user opens Tasks tab.
// This avoids "X is not a constructor" on /account (CJS/ESM + esbuild minification issue with dnd).
const KanbanBoard = React.lazy(() => import('./kanban/KanbanBoard'));
import {
  propertiesService,
  apartmentGroupsService,
  tasksService,
  workersService,
  warehouseService,
  bookingsService,
  invoicesService,
  multiApartmentOffersService,
  offerHeadersService,
  offerItemsService,
  offersService,
  reservationsService,
  leadsService,
  paymentProofsService,
  propertyDocumentsService,
  propertyDepositProofsService,
  unitLeaseTermsService,
  checkBookingOverlap,
  WarehouseStockItem,
  WarehouseTransferLogRow,
  sumWarehouseStockValueEuro,
  UnitLeaseTermUi,
  addressBookPartiesService,
  propertyToPartiesAddressBookEntries,
  paymentChainService,
  paymentChainFilesService,
  rentTimelineService,
  requestsService,
  type RequestWithProperty,
} from '../services/supabaseService';
import {
  commandPostFormData,
  commandPostJson,
  CommandClientError,
} from '../services/commandClient';
import { createLeadFromRequest } from '../services/leadsService';
import { AMENITY_GROUPS } from '../utils/amenityGroups';
import { propertyInventoryService, type PropertyInventoryItemRow, type PropertyInventoryItemWithDocument } from '../services/propertyInventoryService';
import { propertyExpenseService, type PropertyExpenseItemWithDocument } from '../services/propertyExpenseService';
import { propertyExpenseCategoryService, type PropertyExpenseCategoryRow } from '../services/propertyExpenseCategoryService';
import { propertyMeterService, type PropertyMeterReadingRow, type PropertyMeterRow, type MeterType, METER_TYPES } from '../services/propertyMeterService';
import { propertyMediaService, type PropertyMediaAssetRow, type PropertyMediaAssetType } from '../services/propertyMediaService';
import { ApartmentStatisticsSection } from './ApartmentStatisticsSection';
import { VirtualDocumentsManager } from './VirtualDocumentsManager';
import PropertiesDashboardPhase1 from './properties/PropertiesDashboardPhase1';
import { recognizeInvoiceWithOcr } from '../services/ocrInvoiceClient';
import { formatLocalDateYmd } from '../lib/localDate';
import { hasBlockOverlapForPropertyHalfOpen, isPropertyBlockActiveOnDate } from '../lib/oooBlocks';

const METER_UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Одиниця' },
  { value: 'kWh', label: 'kWh' },
  { value: 'm³', label: 'm³' },
  { value: 'u.', label: 'u.' },
  { value: 'L', label: 'L' },
];

// Date helpers for current-stay tile (same logic as SalesCalendar)
function parseDateAktOrendar(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
}
function dateDiffInDaysAktOrendar(date1: Date, date2: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((date2.getTime() - date1.getTime()) / MS_PER_DAY);
}
function formatDateUAAktOrendar(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#1C1F24] rounded-xl border border-gray-800 shadow-sm mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-4 text-left cursor-pointer hover:bg-white/[0.03] transition-colors rounded-t-xl"
        aria-expanded={open}
      >
        <span className="text-xl font-bold text-white">{title}</span>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
      </button>
      {open && <div className="p-6 pt-0">{children}</div>}
    </div>
  );
}

function PropertyMediaPhotoThumb({ asset, onDelete }: { asset: PropertyMediaAssetRow; onDelete: () => void }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!asset.storage_path) return;
    propertyMediaService.getSignedUrl(asset.storage_path).then(setSignedUrl).catch(() => setSignedUrl(null));
  }, [asset.storage_path]);
  return (
    <div className="relative group">
      {signedUrl ? <img src={signedUrl} alt="" className="w-full h-20 object-cover rounded border border-gray-700" /> : <div className="w-full h-20 rounded border border-gray-700 bg-gray-800 flex items-center justify-center text-gray-500 text-xs">...</div>}
      <button type="button" onClick={onDelete} className="absolute top-1 right-1 p-1 rounded bg-red-500/80 text-white text-xs opacity-0 group-hover:opacity-100 hover:bg-red-500" title="Видалити">Delete</button>
    </div>
  );
}
import {
  ReservationData,
  OfferData,
  OfferHeaderData,
  OfferItemData,
  OfferListRow,
  MultiApartmentOfferDraft,
  OfferViewPayload,
  InvoiceData,
  CalendarEvent,
  TaskType,
  TaskStatus,
  Lead,
  Property,
  PropertyDetails,
  BuildingSpecs,
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
  ApartmentGroup,
  ContactParty,
  TenantDetails,
  PropertyDocument,
  PropertyDocumentType,
  PropertyDeposit,
  PropertyDepositProof,
  LeaseTermDraftUi,
  AddressBookPartyEntry,
  AddressBookPartyRole,
  PaymentChainAttachment,
  PaymentChain,
  PaymentChainFile,
  CreateBookingFormData,
  CreateLeadInput,
} from '../types';
import { euToIso, validateEuDate } from '../utils/leaseTermDates';
import { formatPropertyAddress } from '../utils/formatPropertyAddress';
import {
  getPropertyListPrimaryTitle,
  getPropertyListSubtitleLine,
  getPropertyListMetricsLine,
  getPropertyListSearchParts,
} from '../utils/propertyListCardLabels';
import { formatApartmentIdentificationLine, buildMultiApartmentClientMessage } from '../utils/salesOfferFlow';
import { getMarketplaceBaseUrl, getMarketplaceUrlForProperty } from '../utils/marketplaceUrl';
import { PAGE_INSTANCE_ID } from '../utils/pageInstance';
import { ensurePropertyHasCoords } from '../utils/ensurePropertyHasCoords';
import { getRoomsCount } from '../utils/propertyStats';
import { MOCK_PROPERTIES } from '../constants';
import { createFacilityTasksForBooking, updateBookingStatusFromTask, getBookingStyle } from '../bookingUtils';
import { supabase } from '../utils/supabase/client';
import { safeGetSession, safeGetUser } from '../lib/supabaseAuthGuard';
import {
  compareStreetPrimaryThenCanonical,
  compareStringsApartmentSort,
  getStreetSortKeyFromProperty,
} from '../lib/apartments/sorting';
import {
  parsePropertyListSortPayload,
  propertyListSortPayload,
  readSortPreferenceRaw,
  writeSortPreferenceRaw,
} from '../lib/sortPreferencesStorage';

// --- Types ---
type Department = 'admin' | 'properties' | 'facility' | 'accounting' | 'sales' | 'tasks';
type FacilityTab = 'overview' | 'calendar' | 'messages' | 'warehouse';
type AccountingTab = 'dashboard' | 'invoices' | 'expenses' | 'calendar' | 'banking';
type SalesTab = 'dashboard' | 'leads' | 'calendar' | 'offers' | 'reservations' | 'proformas' | 'requests' | 'history' | 'chat'; 
type PropertiesTab = 'dashboard' | 'list' | 'units';

type PaymentTileKey = 'from_company2_to_company1' | 'from_company1_to_owner' | 'owner_control';
type PaymentTileState = {
  payByDayOfMonth?: number;
  total: string;
  description: string;
  breakdown: { km?: string; bk?: string; hk?: string; muell?: string; strom?: string; gas?: string; wasser?: string };
  attachments: (File | PaymentChainAttachment)[];
};

function normalizeSearch(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .replaceAll("ß", "ss")
    .replaceAll("straße", "strasse");
}

/** Build view payload for read-only offer modal. Stable sort by offerNo then id so apartment order is identical regardless of which row's View was clicked. */
function buildOfferViewPayload(offer: OfferData, offers: OfferData[], properties: Property[]): OfferViewPayload {
  const groupOffers = offer.offerGroupId
    ? offers.filter((o) => o.offerGroupId === offer.offerGroupId)
    : [offer];
  const sorted = [...groupOffers].sort((a, b) => {
    const no = (a.offerNo ?? '').localeCompare(b.offerNo ?? '');
    if (no !== 0) return no;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
  const first = sorted[0];
  const [checkIn, checkOut] = (first.dates ?? '').split(' to ');
  const baseUrl = getMarketplaceBaseUrl();
  const apartments = sorted.map((row) => {
    const addressLine = formatApartmentIdentificationLine({
      street: row.streetSnapshot ?? '',
      houseNumber: row.houseNumberSnapshot ?? undefined,
      zip: row.zipSnapshot ?? '',
      city: row.citySnapshot ?? '',
      apartmentCode: row.apartmentCodeSnapshot ?? row.unit ?? row.propertyId ?? '',
    });
    const prop = properties.find((p) => String(p.id) === String(row.propertyId));
    const marketplaceUrl = getMarketplaceUrlForProperty(prop ?? { id: row.propertyId }, baseUrl);
    return {
      addressLine,
      propertyId: row.propertyId,
      nightlyPrice: Number(row.nightlyPrice) || 0,
      taxRate: Number(row.taxRate) || 0,
      nights: Number(row.nights) || 0,
      netTotal: Number(row.netTotal) || 0,
      vatTotal: Number(row.vatTotal) || 0,
      grossTotal: Number(row.grossTotal) || 0,
      kaution: Number(row.kaution) || 0,
      marketplaceUrl,
    };
  });
  return {
    shared: {
      clientName: first.clientName ?? '',
      email: first.email,
      phone: first.phone,
      address: first.address,
      internalCompany: first.internalCompany ?? 'Sotiso',
      clientMessage: first.clientMessage,
      checkIn: checkIn ?? '',
      checkOut: checkOut ?? '',
    },
    apartments,
    offerNo: first.offerNo,
    status: first.status,
  };
}

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
  bk_abrechnung: 'BKA',
  zvu: 'ZVU',
  zweckentfremdung_notice: 'Zweckentfremdung',
  an_abmeldung: 'An-/Abmeldung',
  other_document: 'Інший документ',
};

const DOCUMENTS_MODULE_LABELS: Record<string, string> = {
  lease_contract: 'Mietvertrag',
  handover_protocol: 'Übergabeprotokoll',
  supplier_electricity: 'Utility',
  supplier_gas: 'Utility',
  supplier_water: 'Utility',
  supplier_waste: 'Utility',
  bk_abrechnung: 'BKA',
  zvu: 'ZVU',
  an_abmeldung: 'An-/Abmeldung',
};

const DOC_TABLE = {
  wrap: 'rounded-lg border border-white/10 overflow-hidden',
  scroller: 'overflow-x-auto pr-4',
  table: 'w-full table-fixed border-separate border-spacing-0 text-xs',
  thead: 'bg-white/[0.03]',
  th: 'px-2 py-2 text-[11px] font-semibold text-gray-300 whitespace-nowrap border-b border-white/10',
  td: 'px-2 py-2 text-gray-100 whitespace-nowrap border-b border-white/5 align-middle',
  cellR: 'border-r border-white/5 last:border-r-0',
  row: 'hover:bg-white/[0.03]',
  empty: 'px-2 py-2 text-gray-500',
  actions: 'w-[84px] min-w-[84px]',
};
const DOC_TABLE_SCROLLER_UTILITY = 'min-w-0 overflow-x-hidden';
const monoNum = 'tabular-nums font-mono';
const rightNum = 'text-right tabular-nums font-mono';
const trunc = 'truncate';
const docInput = 'h-8 w-full min-w-0 px-2 rounded-md bg-[#0B1220] border border-white/10 text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50';

const UTILITY_TYPES: PropertyDocumentType[] = ['supplier_electricity', 'supplier_gas', 'supplier_water', 'supplier_waste'];
const UTILITY_KIND_LABELS: Record<string, string> = { supplier_electricity: 'Strom', supplier_gas: 'Gas', supplier_water: 'Wasser', supplier_waste: 'Müll' };
const ART_LABELS: Record<string, string> = { BEFR: 'Befr', UNBEFR: 'Unbefr', AUTO: 'Auto' };
const FIRMA_LABELS: Record<string, string> = { SOTISO: 'Sotiso', WONOVO: 'Wonovo', NOWFLATS: 'NowFlats' };

function getDefaultDocMeta(type: PropertyDocumentType): Record<string, unknown> {
  if (type === 'lease_contract') return { von: '', bis: '', nr: '', art: 'BEFR' };
  if (type === 'handover_protocol') return { datum: '', nr: '', vonId: '', vonName: '', anId: '', anName: '' };
  if (UTILITY_TYPES.includes(type)) return { anbieter: '', firma: 'SOTISO', vertragsnr: '', betrag: 0, faellig: '', von: '', bis: '', malo: '' };
  if (type === 'bk_abrechnung') return { docName: '', von: '', bis: '', jahr: '' };
  if (type === 'zvu') return { datum: '', nr: '', firmaId: '', firmaName: '', ownerId: '', ownerName: '', party: '' };
  if (type === 'an_abmeldung') return { von: '', bis: '', name: '', vertreter: '' };
  return {};
}

function formatDateEU(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** Section 7 (property payments): resolve property id for a proforma via bookingId / reservationId / offerId. */
function getPropertyIdForProforma(
  proforma: InvoiceData,
  ctx: { offers: OfferData[]; reservations: Reservation[]; confirmedBookings: Booking[] }
): string | undefined {
  const bid = proforma.bookingId != null ? String(proforma.bookingId) : null;
  if (bid) {
    const b = ctx.confirmedBookings.find((x) => String(x.id) === bid);
    if (b?.propertyId) return String(b.propertyId);
  }
  const rid = proforma.reservationId != null ? String(proforma.reservationId) : null;
  if (rid) {
    const r = ctx.reservations.find((x) => String(x.id) === rid);
    if (r) return String((r as any).propertyId ?? (r as any).roomId ?? '');
  }
  const oid = proforma.offerId ?? (proforma as any).offerIdSource;
  if (oid != null) {
    const o = ctx.offers.find((x) => String(x.id) === String(oid));
    if (o?.propertyId) return String(o.propertyId);
  }
  return undefined;
}

/** Section 7: amount from proforma (number). */
function amountNumberTile7(p: { totalGross?: number | string }): number {
  const n = Number(p.totalGross ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Section 7: format amount as EUR. */
function formatCurrencyEUR(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** Section 7: date string YYYY-MM-DD for proforma (guard missing date). */
function dateISOTile7(p: { date?: string | unknown }): string {
  if (typeof p.date === 'string') return p.date.slice(0, 10);
  if (p.date) {
    const d = new Date(p.date as string | number | Date);
    if (Number.isFinite(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return '';
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

interface AccountDashboardProps {
  /** Lightweight properties from App (marketplace load). Used only as initial seed; dashboard owns state after mount. */
  initialProperties?: Property[];
  /** Optional pre-selected property id when it represents a valid dashboard-side selection. Must exist in initialProperties. */
  initialSelectedPropertyId?: string;
}

/** When applying getAll() results, preserve enriched fields (e.g. apartmentGroupName from getById) so the selected property never downgrades. */
function mergeGetAllPreservingEnriched(prev: Property[], cleanedData: Property[]): Property[] {
  const byId = new Map(prev.map((p) => [String(p.id), p]));
  return cleanedData.map((incoming) => {
    const existing = byId.get(String(incoming.id));
    if (!existing) return incoming;
    const merged = { ...incoming };
    if (existing.apartmentGroupName != null && (incoming.apartmentGroupName == null || incoming.apartmentGroupName === '')) {
      merged.apartmentGroupName = existing.apartmentGroupName;
    }
    return merged;
  });
}

/** UI-only `<select>` value for embedded parties not linked by a saved `addressBookPartyId` that exists in the list. Never persisted. */
const ADDRESS_BOOK_LEGACY_SELECT_VALUE = '__legacy__';

function normalizeIbanForStorage(input: string): string {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function formatIbanForInput(input: string): string {
  const compact = normalizeIbanForStorage(input);
  if (!compact) return '';
  return compact.replace(/(.{4})/g, '$1 ').trimEnd();
}

function ibanCaretIndexForAlnumCount(next: string, alnumCountBeforeCaret: number): number {
  if (alnumCountBeforeCaret <= 0) return 0;
  let count = 0;
  for (let i = 0; i < next.length; i++) {
    const ch = next[i];
    if (ch === ' ') continue;
    count++;
    if (count >= alnumCountBeforeCaret) return i + 1;
  }
  return next.length;
}

function isPersistableAddressBookPartyId(id: unknown): id is string {
  return typeof id === 'string' && id.trim() !== '' && id !== ADDRESS_BOOK_LEGACY_SELECT_VALUE;
}

function addressBookRowVisibleInSelect(entries: AddressBookPartyEntry[], role: AddressBookPartyRole, id: string): boolean {
  return entries.some((e) => e.id === id && e.role === role);
}

function contactPartyHasDisplayableLegacyBody(p: ContactParty | null | undefined): boolean {
  if (!p) return false;
  if ((p.name ?? '').trim()) return true;
  if ((p.iban ?? '').trim()) return true;
  if ((p.unitIdentifier ?? '').trim()) return true;
  if ((p.contactPerson ?? '').trim()) return true;
  const a = p.address;
  if (a && [(a.street ?? '').trim(), (a.houseNumber ?? '').trim(), (a.zip ?? '').trim(), (a.city ?? '').trim(), (a.country ?? '').trim()].some(Boolean)) return true;
  if ((p.phones ?? []).some((x) => (x ?? '').trim())) return true;
  if ((p.emails ?? []).some((x) => (x ?? '').trim())) return true;
  return false;
}

function tenantLikeHasDisplayableLegacyBody(
  p: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[] }) | null | undefined
): boolean {
  if (!p) return false;
  if ((p.name ?? '').trim()) return true;
  if ((p.iban ?? '').trim()) return true;
  if ((p.phone ?? '').trim()) return true;
  if ((p.email ?? '').trim()) return true;
  const a = p.address;
  if (a && [(a.street ?? '').trim(), (a.houseNumber ?? '').trim(), (a.zip ?? '').trim(), (a.city ?? '').trim(), (a.country ?? '').trim()].some(Boolean)) return true;
  if ((p.phones ?? []).some((x) => (x ?? '').trim())) return true;
  if ((p.emails ?? []).some((x) => (x ?? '').trim())) return true;
  return false;
}

/** Select value: preselect only when saved `addressBookPartyId` exists in `entries` for `role` — no name/iban/address matching to Address Book. */
function counterpartySelectValueContact(
  party: ContactParty | null | undefined,
  role: AddressBookPartyRole,
  entries: AddressBookPartyEntry[]
): '' | typeof ADDRESS_BOOK_LEGACY_SELECT_VALUE | string {
  const id = party?.addressBookPartyId;
  if (isPersistableAddressBookPartyId(id) && addressBookRowVisibleInSelect(entries, role, id)) return id;
  if (contactPartyHasDisplayableLegacyBody(party)) return ADDRESS_BOOK_LEGACY_SELECT_VALUE;
  return '';
}

function counterpartySelectValueTenantLike(
  party: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[] }) | null | undefined,
  role: AddressBookPartyRole,
  entries: AddressBookPartyEntry[]
): '' | typeof ADDRESS_BOOK_LEGACY_SELECT_VALUE | string {
  const id = party?.addressBookPartyId;
  if (isPersistableAddressBookPartyId(id) && addressBookRowVisibleInSelect(entries, role, id)) return id;
  if (tenantLikeHasDisplayableLegacyBody(party)) return ADDRESS_BOOK_LEGACY_SELECT_VALUE;
  return '';
}

function contactPartyFromAddressBookEntry(entry: AddressBookPartyEntry): ContactParty {
  return {
    name: entry.name ?? '',
    address: {
      street: entry.street ?? '',
      houseNumber: entry.houseNumber ?? '',
      zip: entry.zip ?? '',
      city: entry.city ?? '',
      country: entry.country ?? '',
    },
    phones: entry.phones?.length ? [...entry.phones] : [''],
    emails: entry.emails?.length ? [...entry.emails] : [''],
    iban: entry.iban ?? '',
    unitIdentifier: entry.unitIdentifier ?? '',
    contactPerson: entry.contactPerson ?? '',
    ...(entry.id ? { addressBookPartyId: entry.id } : {}),
  };
}

type Card1TenantDraft = TenantDetails & {
  address?: ContactParty['address'];
  phones?: string[];
  emails?: string[];
  iban?: string;
  paymentDayOfMonth?: number;
  addressBookPartyId?: string;
};

function tenantFromAddressBookEntry(entry: AddressBookPartyEntry, base: Card1TenantDraft): Card1TenantDraft {
  return {
    ...base,
    name: entry.name ?? '',
    iban: entry.iban ?? '',
    address: {
      street: entry.street ?? '',
      houseNumber: entry.houseNumber ?? '',
      zip: entry.zip ?? '',
      city: entry.city ?? '',
      country: entry.country ?? '',
    },
    phones: entry.phones?.length ? [...entry.phones] : [''],
    emails: entry.emails?.length ? [...entry.emails] : [''],
    phone: entry.phones?.[0] ?? '',
    email: entry.emails?.[0] ?? '',
    paymentDayOfMonth:
      entry.paymentDay != null && entry.paymentDay >= 1 && entry.paymentDay <= 31 ? entry.paymentDay : base.paymentDayOfMonth,
    ...(entry.id ? { addressBookPartyId: entry.id } : {}),
  };
}

const EMPTY_TENANT_ADDR: ContactParty['address'] = { street: '', houseNumber: '', zip: '', city: '', country: '' };

function emptySecondCompanyDraft(): Card1TenantDraft & { address: ContactParty['address'] } {
  return {
    name: '',
    phone: '',
    email: '',
    rent: 0,
    deposit: 0,
    startDate: '',
    km: 0,
    bk: 0,
    hk: 0,
    address: { ...EMPTY_TENANT_ADDR },
    phones: [''],
    emails: [],
    paymentDayOfMonth: undefined,
  };
}

const AccountDashboard: React.FC<AccountDashboardProps> = ({ initialProperties = [], initialSelectedPropertyId }) => {
  const { worker, logout } = useWorker();

  const initialProps = initialProperties ?? [];
  const initialId =
    initialSelectedPropertyId && initialProps.some((p) => p.id === initialSelectedPropertyId)
      ? initialSelectedPropertyId
      : initialProps[0]?.id ?? '';

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

  useEffect(() => {
    if (!worker) return;
    if (!canAccessDashboardModule(worker, activeDepartment as AppModule)) {
      const next = firstAllowedDashboardModule(worker);
      if (next) setActiveDepartment(next as Department);
    }
  }, [worker, activeDepartment]);

  const [propertiesTab, setPropertiesTab] = useState<PropertiesTab>('dashboard');
  const [facilityTab, setFacilityTab] = useState<FacilityTab>('overview');
  const [accountingTab, setAccountingTab] = useState<AccountingTab>('dashboard');
  const [salesTab, setSalesTab] = useState<SalesTab>('leads');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [properties, setProperties] = useState<Property[]>(initialProps);
  const [propertySearch, setPropertySearch] = useState('');
  const [propertyGroupFilter, setPropertyGroupFilter] = useState<'all' | string>('all');
  const [propertyListSort, setPropertyListSort] = useState<'asc' | 'desc'>('asc');
  const [propertyListSortHydrated, setPropertyListSortHydrated] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived'>('active');
  const [propertyMenuOpenId, setPropertyMenuOpenId] = useState<string | null>(null);
  const [archiveModalPropertyId, setArchiveModalPropertyId] = useState<string | null>(null);
  const [deleteModalPropertyId, setDeleteModalPropertyId] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(initialId);
  const [isLoadingProperties, setIsLoadingProperties] = useState(initialProps.length === 0);
  const [einzugAuszugTasks, setEinzugAuszugTasks] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    const uid = worker?.id;
    if (!uid) return;
    const v = parsePropertyListSortPayload(readSortPreferenceRaw(uid, 'properties.sidebar', 'propertyList'));
    if (v) setPropertyListSort(v);
    setPropertyListSortHydrated(true);
  }, [worker?.id]);

  useEffect(() => {
    const uid = worker?.id;
    if (!uid || !propertyListSortHydrated) return;
    writeSortPreferenceRaw(uid, 'properties.sidebar', 'propertyList', propertyListSortPayload(propertyListSort));
  }, [worker?.id, propertyListSort, propertyListSortHydrated]);

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

  // Load properties from Supabase (deferred so it does not block first paint)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const run = () => {
      const loadProperties = async () => {
        if (!mountedRef.current) return;
        setIsLoadingProperties(true);
        try {
          const data = await propertiesService.getAll();
          if (!mountedRef.current) return;
          const cleanedData = data;
          setProperties((prev) => mergeGetAllPreservingEnriched(prev, cleanedData));
          setSelectedPropertyId(prev => {
            if (!prev && data.length > 0) return data[0].id;
            return prev;
          });
        } catch (error) {
          console.error('Error loading properties in Dashboard:', error);
          if (!mountedRef.current) return;
          setProperties(MOCK_PROPERTIES);
          setSelectedPropertyId(prev => {
            if (!prev && MOCK_PROPERTIES.length > 0) return MOCK_PROPERTIES[0].id;
            return prev;
          });
        } finally {
          if (mountedRef.current) setIsLoadingProperties(false);
        }
      };
      void loadProperties();
    };
    const FALLBACK_MS = 150;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 200 });
    } else {
      timeoutId = setTimeout(run, FALLBACK_MS);
    }
    return () => {
      mountedRef.current = false;
      if (idleId != null && typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount
  const [isPropertyAddModalOpen, setIsPropertyAddModalOpen] = useState(false);
  const [propertyToEdit, setPropertyToEdit] = useState<Property | undefined>(undefined);
  const [isCard2Editing, setIsCard2Editing] = useState(false);
  const [card2Draft, setCard2Draft] = useState<{ details: PropertyDetails; amenities: Record<string, boolean> } | null>(null);
  const [openAusstattungCards, setOpenAusstattungCards] = useState<Record<string, boolean>>({});
  const [isApartmentDataOpen, setIsApartmentDataOpen] = useState(true);
  useEffect(() => {
    setOpenAusstattungCards({});
  }, [selectedPropertyId]);
  type Card1EditSection = 'lease' | 'counterparties' | 'kaution' | 'documents' | 'rentTimeline' | null;
  const [editingCard1Section, setEditingCard1Section] = useState<Card1EditSection>(null);
  const [isLeaseRentalCardOpen, setIsLeaseRentalCardOpen] = useState(true);
  const [isCounterpartiesCardOpen, setIsCounterpartiesCardOpen] = useState(true);
  const [isPaymentChainCardOpen, setIsPaymentChainCardOpen] = useState(true);
  const [isKautionCardOpen, setIsKautionCardOpen] = useState(true);
  const [isDocumentsCardOpen, setIsDocumentsCardOpen] = useState(true);
  const [isRentTimelineCardOpen, setIsRentTimelineCardOpen] = useState(true);
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
  const [newDocMeta, setNewDocMeta] = useState<Record<string, unknown>>({});
  const addDocumentFileInputRef = useRef<HTMLInputElement>(null);
  const [card1Draft, setCard1Draft] = useState<{
    apartmentStatus: 'active' | 'ooo' | 'preparation' | 'rented_worker';
    address: string;
    zip: string;
    city: string;
    country: string;
    title: string;
    floor: number;
    buildingFloors: number;
    apartmentGroupId: string | null;
    landlord: ContactParty | null;
    management: ContactParty | null;
    tenant: TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number };
    secondCompany: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number }) | null;
    deposit: PropertyDeposit | null;
  } | null>(null);
  const [card1DraftBaseline, setCard1DraftBaseline] = useState<typeof card1Draft>(null);
  const isEditingLeaseCard = editingCard1Section === 'lease';
  const isEditingCounterpartiesCard = editingCard1Section === 'counterparties';
  const isEditingKautionCard = editingCard1Section === 'kaution';
  const isEditingDocumentsCard = editingCard1Section === 'documents';
  const isEditingRentTimelineCard = editingCard1Section === 'rentTimeline';
  const isInteractiveHeaderClickTarget = (t: unknown): boolean => {
    if (!(t instanceof Element)) return false;
    return !!t.closest('button, a, input, select, textarea, [role="switch"], [role="menuitem"]');
  };
  const [apartmentGroups, setApartmentGroups] = useState<ApartmentGroup[]>([]);
  const [apartmentGroupsLoaded, setApartmentGroupsLoaded] = useState(false);
  const [addApartmentGroupModalOpen, setAddApartmentGroupModalOpen] = useState(false);
  const [addApartmentGroupName, setAddApartmentGroupName] = useState('');
  const [addApartmentGroupError, setAddApartmentGroupError] = useState<string | null>(null);
  const [addApartmentGroupSaving, setAddApartmentGroupSaving] = useState(false);
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
  const [addressBookDeletingId, setAddressBookDeletingId] = useState<string | null>(null);
  const [addressBookDeleteError, setAddressBookDeleteError] = useState<string | null>(null);
  const [addressBookAddOpen, setAddressBookAddOpen] = useState(false);
  const [addressBookAddRole, setAddressBookAddRole] = useState<AddressBookPartyRole>('owner');
  const [addressBookAddDraft, setAddressBookAddDraft] = useState({
    name: '',
    iban: '',
    street: '',
    houseNumber: '',
    zip: '',
    city: '',
    country: '',
    phonesRaw: '',
    emailsRaw: '',
    paymentDay: '',
    unitIdentifier: '',
    contactPerson: '',
  });
  const [addressBookAddSaving, setAddressBookAddSaving] = useState(false);
  const [addressBookAddError, setAddressBookAddError] = useState<string | null>(null);
  const [addressBookEditOpen, setAddressBookEditOpen] = useState(false);
  const [addressBookEditId, setAddressBookEditId] = useState<string | null>(null);
  const [addressBookEditRole, setAddressBookEditRole] = useState<AddressBookPartyRole>('owner');
  const [addressBookEditDraft, setAddressBookEditDraft] = useState({
    name: '',
    iban: '',
    street: '',
    houseNumber: '',
    zip: '',
    city: '',
    country: '',
    phonesRaw: '',
    emailsRaw: '',
    contactPerson: '',
  });
  const [addressBookEditSaving, setAddressBookEditSaving] = useState(false);
  const [addressBookEditError, setAddressBookEditError] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<{ open: boolean; url: string; title?: string }>({ open: false, url: '' });
  const closeDocPreview = useCallback(() => setDocPreview({ open: false, url: '' }), []);
  useEffect(() => {
    if (!docPreview.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDocPreview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [docPreview.open, closeDocPreview]);
  const [isZweckentfremdungModalOpen, setIsZweckentfremdungModalOpen] = useState(false);
  const [zweckentfremdungDocs, setZweckentfremdungDocs] = useState<PropertyDocument[]>([]);
  const [zweckentfremdungDocsLoading, setZweckentfremdungDocsLoading] = useState(false);
  const [zweckentfremdungSwitchValue, setZweckentfremdungSwitchValue] = useState(false);
  const [zweckentfremdungSaving, setZweckentfremdungSaving] = useState(false);
  const [zweckentfremdungAddDraft, setZweckentfremdungAddDraft] = useState({ datum: '', aktenzeichen: '', bezirksamt: '', note: '' });
  const [zweckentfremdungModalFile, setZweckentfremdungModalFile] = useState<File | null>(null);
  const [zweckentfremdungAddSaving, setZweckentfremdungAddSaving] = useState(false);
  const [zweckentfremdungAddError, setZweckentfremdungAddError] = useState<string | null>(null);
  const zweckentfremdungFileInputRef = useRef<HTMLInputElement>(null);
  const [showPartiesDetails, setShowPartiesDetails] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  // Payment chain is view-only in this flow.
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
    if (!propertyId || String(propertyId).trim() === '') {
      setPaymentChainLoading(false);
      setPaymentChainError(null);
      setPaymentChainFiles({ owner_control: [], from_company1_to_owner: [], from_company2_to_company1: [] });
      setPaymentTiles({
        owner_control: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
        from_company1_to_owner: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
        from_company2_to_company1: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
      });
      return;
    }
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
      const user = await safeGetUser();
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
  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === selectedPropertyId) || properties[0] || null,
    [properties, selectedPropertyId]
  );
  const handleStatsPlanningPriceChange = useCallback(async (value: number) => {
    if (!selectedProperty?.id) return;
    const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
    const rounded = Math.round(normalized * 100) / 100;
    const previous = selectedProperty.planningPricePerRoom ?? 0;

    setProperties((prev) =>
      prev.map((p) => (p.id === selectedProperty.id ? { ...p, planningPricePerRoom: rounded } : p))
    );
    try {
      const updated = await propertiesService.update(selectedProperty.id, { planningPricePerRoom: rounded });
      setProperties((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (e) {
      setProperties((prev) =>
        prev.map((p) => (p.id === selectedProperty.id ? { ...p, planningPricePerRoom: previous } : p))
      );
      alert(e instanceof Error ? e.message : 'Failed to save planning price per room');
    }
  }, [selectedProperty]);

  // Enrich selected property with getById (apartment_group etc.) so details card has full data without extending getAll
  useEffect(() => {
    if (!selectedPropertyId) return;
    let cancelled = false;
    propertiesService.getById(selectedPropertyId).then((prop) => {
      if (cancelled || !prop) return;
      setProperties(prev => prev.map(p => p.id === prop.id ? prop : p));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedPropertyId]);

  const paymentChainParties = useMemo(() => {
    const p = selectedProperty;
    return {
      ownerParty: { name: (p?.landlord?.name ?? '').trim() || '—', iban: (p?.landlord?.iban ?? '').trim() || '—' },
      company1Party: { name: (p?.tenant?.name ?? '').trim() || '—', iban: (p?.tenant?.iban ?? '').trim() || '—' },
      company2Party: { name: (p?.secondCompany?.name ?? '').trim() || '—', iban: (p?.secondCompany?.iban ?? '').trim() || '—' },
    };
  }, [selectedProperty]);

  const filteredProperties = useMemo(() => {
    const q = normalizeSearch(propertySearch);
    if (!q) return properties;
    return properties.filter((p) => {
      const parts = getPropertyListSearchParts(p);
      return parts.some((part) => normalizeSearch(part).includes(q));
    });
  }, [properties, propertySearch]);

  const apartmentGroupsSortedByName = useMemo(
    () => [...apartmentGroups].sort((a, b) => compareStringsApartmentSort(a.name, b.name)),
    [apartmentGroups]
  );

  const displayedProperties = useMemo(() => {
    let list = filteredProperties.filter((p) =>
      archiveFilter === 'active' ? p.archivedAt == null : p.archivedAt != null
    );
    if (propertyGroupFilter !== 'all') {
      list = list.filter((p) => p.apartmentGroupId === propertyGroupFilter);
    }
    const primaryDir = propertyListSort === 'asc' ? 'asc' : 'desc';
    return [...list].sort((a, b) =>
      compareStreetPrimaryThenCanonical(
        {
          streetSortKey: getStreetSortKeyFromProperty(a),
          unit: (a.title || '').trim(),
          apartmentId: String(a.id),
        },
        {
          streetSortKey: getStreetSortKeyFromProperty(b),
          unit: (b.title || '').trim(),
          apartmentId: String(b.id),
        },
        primaryDir
      )
    );
  }, [filteredProperties, archiveFilter, propertyGroupFilter, propertyListSort]);

  useEffect(() => {
    if (activeDepartment !== 'properties' || propertiesTab !== 'dashboard') return;
    if (apartmentGroupsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await apartmentGroupsService.getAll();
        if (!cancelled) {
          setApartmentGroups(list);
          setApartmentGroupsLoaded(true);
        }
      } catch (e) {
        console.error('[AccountDashboard] apartment groups load', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDepartment, propertiesTab, apartmentGroupsLoaded]);

  const handleArchiveConfirm = useCallback(async (propertyId: string) => {
    try {
      await propertiesService.archiveProperty(propertyId);
      const data = await propertiesService.getAll();
      setProperties(data);
      if (selectedPropertyId === propertyId) {
        if (archiveFilter === 'active') {
          const activeList = data.filter((p) => p.archivedAt == null && p.id !== propertyId);
          setSelectedPropertyId(activeList[0]?.id ?? '');
        }
      }
      setArchiveModalPropertyId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка архівації');
    }
  }, [selectedPropertyId, archiveFilter]);

  const handleDeletePermanentConfirm = useCallback(async (propertyId: string) => {
    try {
      await propertiesService.deletePropertyPermanently(propertyId);
      const data = await propertiesService.getAll();
      setProperties(data);
      if (selectedPropertyId === propertyId) {
        const list = archiveFilter === 'active'
          ? data.filter((p) => p.archivedAt == null)
          : data.filter((p) => p.archivedAt != null);
        setSelectedPropertyId(list[0]?.id ?? '');
      }
      setDeleteModalPropertyId(null);
      setDeleteConfirmInput('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Помилка видалення');
    }
  }, [selectedPropertyId, archiveFilter]);

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
        createdAt: r.created_at,
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
    if (!selectedPropertyId || String(selectedPropertyId).trim() === '') {
      setPaymentChainLoading(false);
      setPaymentChainError(null);
      setPaymentChainFiles({ owner_control: [], from_company1_to_owner: [], from_company2_to_company1: [] });
      setPaymentTiles({
        owner_control: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
        from_company1_to_owner: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
        from_company2_to_company1: { payByDayOfMonth: undefined, total: '', description: '', breakdown: {}, attachments: [] },
      });
      if (import.meta.env.DEV) console.warn('[payment-chain] skip fetch: missing propertyId', { propertyId: selectedPropertyId });
      return;
    }
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
  // Manual meter readings tile (property_meter_readings / property_meters; no meterLog)
  const [meterReadingsManual, setMeterReadingsManual] = useState<PropertyMeterReadingRow[]>([]);
  const [meterMetersList, setMeterMetersList] = useState<PropertyMeterRow[]>([]);
  const [meterReadingsLoading, setMeterReadingsLoading] = useState(false);
  const [isMeterNumbersModalOpen, setIsMeterNumbersModalOpen] = useState(false);
  const [meterEditValues, setMeterEditValues] = useState<Record<MeterType, string>>({ strom: '', gas: '', wasser: '', heizung: '' });
  const [meterEditUnit, setMeterEditUnit] = useState<Record<MeterType, string>>({ strom: '', gas: '', wasser: '', heizung: '' });
  const [meterEditPricePerUnit, setMeterEditPricePerUnit] = useState<Record<MeterType, string>>({ strom: '', gas: '', wasser: '', heizung: '' });
  const [isMeterSaving, setIsMeterSaving] = useState(false);
  const [meterPhotoCountByReadingId, setMeterPhotoCountByReadingId] = useState<Record<string, number>>({});
  const [meterGalleryReadingId, setMeterGalleryReadingId] = useState<string | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<{ id: string; storage_path: string; signedUrl: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [meterEditingReadingId, setMeterEditingReadingId] = useState<string | null>(null);
  const [meterAddingNewRow, setMeterAddingNewRow] = useState(false);
  const [meterEditDraft, setMeterEditDraft] = useState<{ reading_date: string; strom: string; gas: string; wasser: string; heizung: string } | null>(null);
  const [meterDeleteConfirmId, setMeterDeleteConfirmId] = useState<string | null>(null);
  const [isMeterReadingsCollapsed, setIsMeterReadingsCollapsed] = useState(true);
  const [isInvoicesCollapsed, setIsInvoicesCollapsed] = useState(false);
  const [propertyMediaAssets, setPropertyMediaAssets] = useState<PropertyMediaAssetRow[]>([]);
  const [propertyMediaLoading, setPropertyMediaLoading] = useState(false);
  const [openMediaModalType, setOpenMediaModalType] = useState<PropertyMediaAssetType | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);
  const [photoGalleryCoverId, setPhotoGalleryCoverId] = useState<string | null>(null);
  const [photoGallerySelectedId, setPhotoGallerySelectedId] = useState<string | null>(null);
  const [photoGallerySignedUrls, setPhotoGallerySignedUrls] = useState<Record<string, string>>({});
  const [mediaStagedFile, setMediaStagedFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [tour3dViewerErrorCode, setTour3dViewerErrorCode] = useState<string | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaMultiFileHint, setMediaMultiFileHint] = useState(false);
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
  const propertyOcrFileInputRef = useRef<HTMLInputElement | null>(null);
  const depositProofFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPropertyAddFromDocumentOpen, setIsPropertyAddFromDocumentOpen] = useState(false);
  const [propertyOcrRows, setPropertyOcrRows] = useState<
    Array<{ id: string; sku: string; name: string; quantity: string; unit: string; price: string; invoiceNumber: string; purchaseDate: string; object: string }>
  >([]);
  const [propertyOcrFile, setPropertyOcrFile] = useState<File | null>(null);
  const [propertyOcrFileName, setPropertyOcrFileName] = useState<string | null>(null);
  const [propertyOcrPreviewUrl, setPropertyOcrPreviewUrl] = useState<string | null>(null);
  const [propertyOcrInvoiceNumber, setPropertyOcrInvoiceNumber] = useState<string>('');
  const [propertyOcrPurchaseDate, setPropertyOcrPurchaseDate] = useState<string>('');
  const [propertyOcrVendor, setPropertyOcrVendor] = useState<string>('');
  const [isPropertyOcrProcessing, setIsPropertyOcrProcessing] = useState(false);
  const [propertyOcrError, setPropertyOcrError] = useState<string | null>(null);
  const [isPropertyOcrSaving, setIsPropertyOcrSaving] = useState(false);
  const [propertyInventoryItems, setPropertyInventoryItems] = useState<PropertyInventoryItemWithDocument[]>([]);
  const [propertyInventoryLoading, setPropertyInventoryLoading] = useState(false);
  const [isPropertyInventoryCollapsed, setIsPropertyInventoryCollapsed] = useState(true);
  // Property expense invoices (replaces Ремонти tile)
  const [expenseItems, setExpenseItems] = useState<PropertyExpenseItemWithDocument[]>([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [isExpenseEditing, setIsExpenseEditing] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<PropertyExpenseCategoryRow[]>([]);
  const [isExpenseAddFromDocumentOpen, setIsExpenseAddFromDocumentOpen] = useState(false);
  const [expenseOcrRows, setExpenseOcrRows] = useState<Array<{ id: string; name: string; quantity: string; price: string; category_id: string }>>([]);
  const [expenseOcrFile, setExpenseOcrFile] = useState<File | null>(null);
  const [expenseOcrFileName, setExpenseOcrFileName] = useState<string | null>(null);
  const [expenseOcrPreviewUrl, setExpenseOcrPreviewUrl] = useState<string | null>(null);
  const [expenseOcrInvoiceNumber, setExpenseOcrInvoiceNumber] = useState('');
  const [expenseOcrInvoiceDate, setExpenseOcrInvoiceDate] = useState('');
  const [expenseOcrVendor, setExpenseOcrVendor] = useState('');
  const [isExpenseOcrProcessing, setIsExpenseOcrProcessing] = useState(false);
  const [expenseOcrError, setExpenseOcrError] = useState<string | null>(null);
  const [isExpenseOcrSaving, setIsExpenseOcrSaving] = useState(false);
  const [isExpenseCategoriesModalOpen, setIsExpenseCategoriesModalOpen] = useState(false);
  const [expandedExpenseGroups, setExpandedExpenseGroups] = useState<Record<string, boolean>>({});
  const expenseOcrFileInputRef = useRef<HTMLInputElement | null>(null);
  const [transferPropertyId, setTransferPropertyId] = useState<string>('');
  const [transferWorkerId, setTransferWorkerId] = useState<string>('');
  /** Per stock row: quantity to transfer (1..available). Initialized when opening transfer modal. */
  const [transferQuantitiesByStockId, setTransferQuantitiesByStockId] = useState<Record<string, number>>({});
  /** Facility Overview: confirmed warehouse → apartment transfers (stock_movements). */
  const [facilityTransferLog, setFacilityTransferLog] = useState<WarehouseTransferLogRow[]>([]);
  const [facilityTransferLogLoading, setFacilityTransferLogLoading] = useState(false);
  const [facilityTransferLogError, setFacilityTransferLogError] = useState<string | null>(null);
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
  const [requests, setRequests] = useState<RequestWithProperty[]>([]);

  // Sales → Requests: load from DB (source of truth)
  useEffect(() => {
    const load = async () => {
      try {
        const data = await requestsService.getAll();
        setRequests(data);
      } catch (e) {
        console.error('Failed to load requests from DB:', e);
      }
    };
    load();
  }, []);

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

  // Слухати події додавання нових requests (Leads створюються тільки через DB triggers)
  React.useEffect(() => {
    const handleRequestAdded = (event: CustomEvent<RequestData>) => {
      setRequests(prev => [event.detail as RequestWithProperty, ...prev]);
    };
    window.addEventListener('requestAdded', handleRequestAdded as EventListener);
    return () => window.removeEventListener('requestAdded', handleRequestAdded as EventListener);
  }, []);
  
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [offerHeaders, setOfferHeaders] = useState<OfferHeaderData[]>([]);
  const [offerItems, setOfferItems] = useState<OfferItemData[]>([]);
  const [multiOfferRows, setMultiOfferRows] = useState<OfferListRow[]>([]);

  const [reservations, setReservations] = useState<ReservationData[]>([]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [adminEvents, setAdminEvents] = useState<CalendarEvent[]>([]);
  const [accountingEvents, setAccountingEvents] = useState<CalendarEvent[]>(INITIAL_ACCOUNTING_EVENTS);

  // --- Property Card: Tasks tile state ---
  const [propertyTaskBucket, setPropertyTaskBucket] = useState<'open' | 'in_progress' | 'completed' | 'all'>('open');
  const [statsSelectedMonth, setStatsSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [propertyTaskComments, setPropertyTaskComments] = useState<Record<string, string>>({});
  const facilityTasksLoadedRef = useRef(false);

  const propertyTasks = useMemo(() => {
    if (!selectedProperty?.id) return [];
    return adminEvents.filter(e =>
      e.propertyId === selectedProperty.id && e.department === 'facility'
    );
  }, [adminEvents, selectedProperty?.id]);

  const filteredPropertyTasks = useMemo(() => {
    if (propertyTaskBucket === 'all') return propertyTasks;
    return propertyTasks.filter(e => {
      const s = e.status;
      if (propertyTaskBucket === 'open')
        return s !== 'in_progress' && !['completed', 'verified', 'archived'].includes(s);
      if (propertyTaskBucket === 'in_progress') return s === 'in_progress';
      return ['completed', 'verified', 'archived'].includes(s);
    });
  }, [propertyTasks, propertyTaskBucket]);

  const sortedPropertyTasks = useMemo(() =>
    [...filteredPropertyTasks].sort((a, b) => {
      const da = a.date ?? '\uffff';
      const db = b.date ?? '\uffff';
      if (da !== db) return da.localeCompare(db);
      const ta = a.time ?? '\uffff';
      const tb = b.time ?? '\uffff';
      return ta.localeCompare(tb);
    }),
  [filteredPropertyTasks]);

  const propertyTaskCounts = useMemo(() => {
    let open = 0, inProgress = 0, completed = 0;
    for (const e of propertyTasks) {
      const s = e.status;
      if (s === 'in_progress') inProgress++;
      else if (['completed', 'verified', 'archived'].includes(s)) completed++;
      else open++;
    }
    return { open, inProgress, completed, all: propertyTasks.length };
  }, [propertyTasks]);

  useEffect(() => {
    const taskIds = propertyTasks.map(t => t.id);
    if (taskIds.length === 0) { setPropertyTaskComments({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('task_chat_messages')
          .select('calendar_event_id, message_text, created_at')
          .in('calendar_event_id', taskIds)
          .order('created_at', { ascending: false });
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) {
          const id = (row as any).calendar_event_id;
          if (id && !map[id]) {
            const text = (row as any).message_text ?? (row as any).message ?? '';
            map[id] = String(text).replace(/\r?\n/g, ' ').trim().slice(0, 200);
          }
        }
        if (!cancelled) setPropertyTaskComments(map);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [propertyTasks]);

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
        const all = await workersService.getWorkerDirectory();
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
    const shouldLoadStock =
      activeDepartment === 'facility' &&
      ((facilityTab === 'warehouse' && warehouseTab === 'stock') || facilityTab === 'overview');
    if (!shouldLoadStock) return;

    let cancelled = false;
    const loadStock = async () => {
      try {
        setIsLoadingWarehouseStock(true);
        setWarehouseStockError(null);
        const stock = await warehouseService.getStock(filterWarehouseId || undefined);
        if (!cancelled) setWarehouseStock(stock);
      } catch (error: unknown) {
        console.error('Error loading warehouse stock:', error);
        if (!cancelled) {
          setWarehouseStockError(error instanceof Error ? error.message : 'Failed to load warehouse stock');
        }
      } finally {
        if (!cancelled) setIsLoadingWarehouseStock(false);
      }
    };

    void loadStock();
    const onTaskUpdated = () => {
      void loadStock();
    };
    window.addEventListener('taskUpdated', onTaskUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('taskUpdated', onTaskUpdated);
    };
  }, [activeDepartment, facilityTab, warehouseTab, filterWarehouseId]);

  // Facility Overview: load transfer history (canonical OUT movements after confirmed transfers)
  useEffect(() => {
    if (activeDepartment !== 'facility' || facilityTab !== 'overview') return;
    let cancelled = false;
    const loadLog = async () => {
      try {
        setFacilityTransferLogLoading(true);
        setFacilityTransferLogError(null);
        const rows = await warehouseService.getWarehouseToPropertyTransferMovements(20);
        if (!cancelled) setFacilityTransferLog(rows);
      } catch (e: unknown) {
        if (!cancelled) {
          setFacilityTransferLogError(e instanceof Error ? e.message : 'Не вдалося завантажити історію');
        }
      } finally {
        if (!cancelled) setFacilityTransferLogLoading(false);
      }
    };
    void loadLog();
    const onTaskUpdated = () => {
      void loadLog();
    };
    window.addEventListener('taskUpdated', onTaskUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('taskUpdated', onTaskUpdated);
    };
  }, [activeDepartment, facilityTab]);

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

  // Filtered stock: hide qty <= 0 (fallback if getStock returns them), then apply search
  const filteredWarehouseStock = useMemo(() => {
    const withQty = warehouseStock.filter((item) => (Number(item.quantity) ?? 0) > 0);
    if (!searchQuery.trim()) return withQty;

    const query = searchQuery.toLowerCase().trim();
    return withQty.filter((item) => {
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

  const facilityOverviewWarehouseValueEuro = useMemo(
    () => sumWarehouseStockValueEuro(warehouseStock),
    [warehouseStock]
  );

  const workerNameByIdForFacility = useMemo(() => {
    const m = new Map<string, string>();
    workers.forEach((w) => m.set(w.id, w.name));
    return m;
  }, [workers]);

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
    if (!p) return '';
    const addr = formatPropertyAddress(p);
    return addr === '-' ? '' : addr;
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
    const initialQty: Record<string, number> = {};
    for (const row of warehouseStock) {
      if (!selectedStockIds.has(row.stockId)) continue;
      const maxQ = Math.floor(Number(row.quantity) || 0);
      if (maxQ >= 1) initialQty[row.stockId] = maxQ;
    }
    setTransferQuantitiesByStockId(initialQty);
    setIsTransferModalOpen(true);
  };

  const closeTransferModal = () => {
    setIsTransferModalOpen(false);
    setTransferError(null);
    setIsExecutingTransfer(false);
    setTransferQuantitiesByStockId({});
  };

  const handleOcrReal = async () => {
    if (!uploadedInventoryFile) {
      setTransferError('Please upload a file first');
      return;
    }
    if (isOcrProcessing) return;

    setIsOcrProcessing(true);
    setTransferError(null);

    try {
      const result = await recognizeInvoiceWithOcr(uploadedInventoryFile, uploadedInventoryFileName);
      if (!result.ok) {
        setTransferError(result.message);
        return;
      }
      const ocrData = result.data;
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
      if (rows.length === 0) setTransferError('No items found in the invoice. Please check the document or try another file.');
    } catch (error: any) {
      console.error('File reading error:', error);
      setTransferError(error.message || 'Failed to read file');
    } finally {
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

  const propertyNameForOcr = selectedProperty?.title ?? '';

  const handlePropertyOcrRecognize = async () => {
    if (!propertyOcrFile || !selectedPropertyId) return;
    if (isPropertyOcrProcessing) return;
    setIsPropertyOcrProcessing(true);
    setPropertyOcrError(null);
    try {
      const result = await recognizeInvoiceWithOcr(propertyOcrFile, propertyOcrFileName);
      if (!result.ok) {
        setPropertyOcrError(result.message);
        return;
      }
      const ocrData = result.data;
      setPropertyOcrInvoiceNumber(ocrData.invoiceNumber || '');
      setPropertyOcrPurchaseDate(ocrData.purchaseDate || new Date().toISOString().split('T')[0]);
      setPropertyOcrVendor(ocrData.vendor || '');
      const rows = (ocrData.items || []).map((item: any, idx: number) => ({
        id: String(idx + 1),
        sku: item.sku || '',
        name: item.name || '',
        quantity: String(item.quantity || 1),
        unit: item.unit || 'pcs',
        price: String(item.price || 0),
        invoiceNumber: ocrData.invoiceNumber || '',
        purchaseDate: ocrData.purchaseDate || '',
        object: propertyNameForOcr,
      }));
      setPropertyOcrRows(rows);
      if (rows.length === 0) setPropertyOcrError('No items found in the document.');
    } catch (e: any) {
      setPropertyOcrError(e?.message || 'Failed');
    } finally {
      setIsPropertyOcrProcessing(false);
    }
  };

  const handlePropertyOcrCellChange = (rowId: string, field: 'sku' | 'name' | 'quantity' | 'price' | 'invoiceNumber' | 'purchaseDate', value: string) => {
    setPropertyOcrRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
    if (field === 'invoiceNumber') {
      setPropertyOcrInvoiceNumber(value);
      setPropertyOcrRows((prev) => prev.map((row) => ({ ...row, invoiceNumber: value })));
    }
    if (field === 'purchaseDate') {
      setPropertyOcrPurchaseDate(value);
      setPropertyOcrRows((prev) => prev.map((row) => ({ ...row, purchaseDate: value })));
    }
  };

  const handleSavePropertyInventoryFromOCR = async () => {
    if (!selectedPropertyId || !selectedProperty || propertyOcrRows.length === 0 || !propertyOcrFile) return;
    const validRows = propertyOcrRows.filter((row) => row.name.trim() && parseFloat(row.quantity) > 0);
    if (validRows.length === 0) {
      setPropertyOcrError('No valid items (name and quantity required).');
      return;
    }
    setIsPropertyOcrSaving(true);
    setPropertyOcrError(null);
    try {
      const { documentId } = await propertyInventoryService.createDocumentAndUpload(selectedPropertyId, propertyOcrFile, {
        file_name: propertyOcrFileName || null,
        invoice_number: propertyOcrInvoiceNumber || null,
        purchase_date: propertyOcrPurchaseDate || null,
        store: propertyOcrVendor || null,
      });
      await propertyInventoryService.appendItems(
        selectedPropertyId,
        documentId,
        validRows.map((row) => ({
          property_id: selectedPropertyId,
          document_id: documentId,
          article: row.sku?.trim() || null,
          name: row.name.trim(),
          quantity: parseFloat(row.quantity) || 1,
          unit_price: parseFloat(row.price) || null,
          invoice_number: row.invoiceNumber || null,
          purchase_date: row.purchaseDate || null,
          store: propertyOcrVendor || null,
        }))
      );
      await refreshPropertyInventory();
      setIsPropertyAddFromDocumentOpen(false);
      setPropertyOcrRows([]);
      setPropertyOcrFile(null);
      setPropertyOcrFileName(null);
      if (propertyOcrPreviewUrl) { URL.revokeObjectURL(propertyOcrPreviewUrl); setPropertyOcrPreviewUrl(null); }
      setPropertyOcrInvoiceNumber('');
      setPropertyOcrPurchaseDate('');
      setPropertyOcrVendor('');
      setPropertyOcrError(null);
    } catch (e: unknown) {
      console.error('Property OCR save error:', e);
      setPropertyOcrError(e instanceof Error ? e.message : 'Failed to save.');
      // Do not close modal on error so user can retry or fix
    } finally {
      setIsPropertyOcrSaving(false);
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
        const allProperties = await propertiesService.getAll();
        const itemName = stockItem.itemName;
        for (const property of allProperties) {
          if (property.inventory && property.inventory.length > 0) {
            // Шукаємо інвентар за itemId, invNumber або назвою товару
            const inventoryToRemove = property.inventory.filter((item: any) => {
              // Перевірка за itemId
              if (item.itemId === itemId) {
                return true;
              }
              // Перевірка за invNumber
              if (item.invNumber === invNumber) {
                return true;
              }
              // Перевірка за назвою товару (якщо немає itemId)
              if (!item.itemId && (item.name === itemName || item.type === itemName)) {
                return true;
              }
              return false;
            });
            if (inventoryToRemove.length > 0) {
              const updatedInventory = property.inventory.filter((item: any) => {
                // Залишаємо тільки ті, які не знайдені для видалення
                return !(
                  item.itemId === itemId ||
                  item.invNumber === invNumber ||
                  (!item.itemId && (item.name === itemName || item.type === itemName))
                );
              });
              // Створюємо payload тільки з необхідними полями для оновлення
              // Важливо: передаємо inventory як масив, навіть якщо він порожній
              // Також передаємо id property, щоб Supabase знав, який запис оновлювати
              const updatePayload: Partial<Property> = {
                id: property.id, // Додаємо id для явного вказання
                inventory: Array.isArray(updatedInventory) ? updatedInventory : [], // Гарантуємо, що це масив
              };
              const updatedProperty = await propertiesService.update(property.id, updatePayload);
            }
          }
        }
        
        // Оновити локальний стан properties
        setProperties((prev) => {
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
                return { ...p, inventory: updatedInventory };
              }
            }
            return p;
          });
          return updated;
        });
        
        // Оновити список квартир
        window.dispatchEvent(new CustomEvent('propertiesUpdated'));
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
  const executeInventoryTransfer = async (
    transferData: any,
    taskLike?: Pick<CalendarEvent, 'workerId' | 'assignedWorkerId'>
  ) => {
    try {
      const { transferData: items, propertyId } = transferData;

      if (!items || !Array.isArray(items) || items.length === 0) {
        console.error('❌ No items to transfer');
        return;
      }

      if (!propertyId) {
        console.error('❌ No propertyId provided');
        return;
      }

      const movementWorkerId = getCalendarEventAssigneeId(taskLike) || undefined;

      // 1) Зменшити залишки на складі + записати рух
      for (const item of items) {
        await warehouseService.decreaseStockQuantity(item.stockId, item.quantity);
        await warehouseService.createStockMovement({
          warehouseId: item.warehouseId,
          itemId: item.itemId,
          type: 'OUT',
          quantity: item.quantity,
          reason: 'Transfer to property (confirmed)',
          propertyId: propertyId,
          workerId: movementWorkerId,
          invoiceId: undefined,
        });
      }

      // 2) Insert into property_inventory_items (append-only, same table the "Möbel/Inventar" tile reads).
      // Idempotency: callers check transferExecuted before calling this function.
      // transferExecuted is set ONLY after this succeeds (see call sites).
      const inventoryRows = items.map((item: any) => ({
        property_id: propertyId,
        document_id: null as string | null,
        name: item.itemName ?? '',
        quantity: item.quantity ?? 1,
        article: item.sku ?? null,
        unit_price: item.unitPrice ?? null,
        invoice_number: item.invoiceNumber ?? null,
        purchase_date: item.purchaseDate ?? null,
        store: 'Warehouse transfer',
      }));
      await propertyInventoryService.appendItems(propertyId, null, inventoryRows);

      // Refresh the inventory tile so transferred items appear immediately
      refreshPropertyInventory();

      // 3) Оновити склад
      const refreshed = await warehouseService.getStock();
      setWarehouseStock(refreshed);
      
      // 4) Оновити список квартир (щоб інвентар відобразився в інших компонентах)
      window.dispatchEvent(new CustomEvent('propertiesUpdated'));
    } catch (error) {
      console.error('❌ Error executing inventory transfer:', error);
      throw error;
    }
  };

  const handleExecuteTransfer = async () => {
    if (!transferPropertyId || !transferWorkerId || selectedStockItems.length === 0) return;

    const invalidRow = selectedStockItems.find((row) => {
      const maxQ = Math.floor(Number(row.quantity) || 0);
      const q = transferQuantitiesByStockId[row.stockId];
      return maxQ < 1 || !Number.isInteger(q) || q < 1 || q > maxQ;
    });
    if (invalidRow) {
      setTransferError(
        'Вкажіть коректну кількість для кожної позиції: ціле число від 1 до доступного залишку на складі.'
      );
      return;
    }

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
        quantity: transferQuantitiesByStockId[row.stockId]!,
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
        const tasks = await tasksService.getAll(filters);
        
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

        // Process any verified/completed transfer tasks (e.g. confirmed in another tab) so inventory is applied
        for (const task of validTasks) {
          if (task.status === 'verified' && task.description) {
            try {
              const parsed = JSON.parse(task.description);
              if (parsed.action === 'transfer_inventory' && parsed.transferData && !parsed.transferExecuted) {
                await executeInventoryTransfer(parsed, task);
                parsed.transferExecuted = true;
                await tasksService.update(task.id, { description: JSON.stringify(parsed) });
              }
            } catch (_) { /* ignore */ }
          }
        }
        
        // Merge with current state so display fields (title, propertyId, time, description) are preserved
        // when API returns minimal data (e.g. after assignee change + taskUpdated reload)
        setAdminEvents(prev => {
          const merged = validTasks.map(apiTask => {
            const prevEvent = prev.find(e => e.id === apiTask.id);
            if (!prevEvent) return apiTask;
            return {
              ...prevEvent,
              ...apiTask,
              title: (apiTask.title?.trim()) ? apiTask.title : prevEvent.title,
              propertyId: apiTask.propertyId ?? prevEvent.propertyId,
              time: apiTask.time ?? prevEvent.time,
              description: apiTask.description ?? prevEvent.description,
              type: (apiTask.type?.trim()) ? apiTask.type : prevEvent.type,
              assignee: apiTask.assignee ?? prevEvent.assignee,
            };
          });
          return merged;
        });
        
        facilityTasksLoadedRef.current = true;
      } catch (error) {
        console.error('❌ Error loading Facility tasks:', error);
        facilityTasksLoadedRef.current = true;
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
      // Debounce reload to prevent race conditions when multiple updates happen quickly
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }
      reloadTimeout = setTimeout(() => {
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

  // Fallback: ensure facility tasks are loaded when Property Card renders
  useEffect(() => {
    if (!selectedProperty?.id || facilityTasksLoadedRef.current || adminEvents.length > 0) return;
    let cancelled = false;
    const loadFallback = async () => {
      try {
        const filters: Record<string, string> = { department: 'facility' };
        if (worker?.role === 'worker' && worker.id) filters.workerId = worker.id;
        const tasks = await tasksService.getAll(filters);
        if (!cancelled) {
          facilityTasksLoadedRef.current = true;
          setAdminEvents(tasks);
        }
      } catch (err) {
        console.error('Failed to load facility tasks (fallback):', err);
        if (!cancelled) facilityTasksLoadedRef.current = true;
      }
    };
    loadFallback();
    return () => { cancelled = true; };
  }, [selectedProperty?.id, adminEvents.length, worker]);

  // Load invoices from database
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        const loadedInvoices = await invoicesService.getAll();
        setInvoices(loadedInvoices);
      } catch (error) {
        console.error('Error loading invoices:', error);
      }
    };
    loadInvoices();
  }, []);

  // Load offers from database (single source: offers table; multi-apartment = N rows with same offer_no and offer_group_id)
  useEffect(() => {
    const loadOffers = async () => {
      try {
        const loadedOffers = await offersService.getAll();
        setOffers(loadedOffers);
      } catch (error) {
        console.error('Error loading offers:', error);
      }
    };
    loadOffers();
  }, []);

  const refreshMultiApartmentOffers = useCallback(async () => {
    const loaded = await offersService.getAll();
    setOffers(loaded);
  }, []);

  const legacyOfferRows = useMemo<OfferListRow[]>(
    () =>
      offers.map((offer) => {
        const [startDate, endDate] = (offer.dates || '').split(' to ');
        const property = properties.find((p) => String(p.id) === String(offer.propertyId));
        const apartmentLine =
          offer.apartmentCodeSnapshot != null || offer.streetSnapshot != null
            ? formatApartmentIdentificationLine({
                street: offer.streetSnapshot ?? '',
                houseNumber: offer.houseNumberSnapshot ?? undefined,
                zip: offer.zipSnapshot ?? '',
                city: offer.citySnapshot ?? '',
                apartmentCode: offer.apartmentCodeSnapshot ?? offer.unit ?? offer.propertyId,
              })
            : property
              ? formatApartmentIdentificationLine({
                  street: property.address || '',
                  houseNumber: '',
                  zip: property.zip || '',
                  city: property.city || '',
                  apartmentCode: property.title || property.id,
                })
              : offer.unit || offer.propertyId;
        return {
          sourceType: 'legacy',
          rowId: offer.id,
          offerId: offer.id,
          offerNo: offer.offerNo,
          clientName: offer.clientName,
          propertyId: offer.propertyId,
          apartmentLine,
          dates: offer.dates,
          startDate: startDate || '',
          endDate: endDate || startDate || '',
          status: offer.status,
          price: offer.price,
          internalCompany: offer.internalCompany,
          email: offer.email,
          phone: offer.phone,
          address: offer.address,
          reservationId: offer.reservationId,
        };
      }),
    [offers, properties]
  );

  const allOfferRows = useMemo(
    () =>
      [...legacyOfferRows].sort((a, b) =>
        `${b.startDate}${b.offerNo || ''}`.localeCompare(`${a.startDate}${a.offerNo || ''}`)
      ),
    [legacyOfferRows]
  );

  // Load proformas and invoiced totals when Sales > Payments tab is active
  useEffect(() => {
    if (activeDepartment !== 'sales' || salesTab !== 'proformas') return;
    const load = async () => {
      try {
        const [list, childInvoices] = await Promise.all([
          invoicesService.getProformas(),
          invoicesService.getInvoices(),
        ]);
        setProformas(list);
        const byProforma: Record<string, number> = {};
        childInvoices.forEach((inv) => {
          const pid = inv.proformaId;
          if (pid) {
            const gross = inv.totalGross ?? 0;
            byProforma[pid] = (byProforma[pid] ?? 0) + gross;
          }
        });
        setInvoicedTotalByProformaId(byProforma);
      } catch (error) {
        console.error('Error loading proformas/invoices:', error);
      }
    };
    load();
  }, [activeDepartment, salesTab]);

  // One-time load of proformas on mount for tile 7 (property payments); guarded so we do not double-load
  useEffect(() => {
    if (proformasLoadStartedRef.current) return;
    proformasLoadStartedRef.current = true;
    invoicesService
      .getProformas()
      .then((list) => setProformas(list))
      .catch((err) => {
        console.error('Error loading proformas on mount:', err);
        proformasLoadStartedRef.current = false;
      });
  }, []);

  // Listen for task updates from Kanban board
  useEffect(() => {
    const handleTaskUpdated = async () => {
      try {
        // Build filters based on user role
        const filters: any = {
          department: 'facility'
        };
        
        // If user is a manager or worker (not super_manager), filter by their ID
        if (worker?.role === 'manager' || worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        
        const tasks = await tasksService.getAll(filters);
        // Finalize transfer only when status is verified (not on completed)
        for (const task of tasks) {
          if (task.status === 'verified' && task.description) {
            try {
              const desc = task.description;
              const parsed = JSON.parse(desc);
              if (parsed.action === 'transfer_inventory' && parsed.transferData) {
                // Перевірити, чи transfer вже виконано (можна додати прапорець в parsed)
                if (!parsed.transferExecuted) {
                  await executeInventoryTransfer(parsed, task);
                  
                  // Позначити transfer як виконаний в description
                  parsed.transferExecuted = true;
                  await tasksService.update(task.id, {
                    description: JSON.stringify(parsed),
                  });
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

  // Load Accounting tasks from database
  useEffect(() => {
    const loadAccountingTasks = async () => {
      try {
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
        const filters: any = {
          department: 'accounting'
        };
        
        if (worker?.role === 'manager' || worker?.role === 'worker') {
          filters.workerId = worker.id;
        }
        
        const tasks = await tasksService.getAll(filters);
        
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
  /** Bump to remount InvoiceModal after DEBUG/RECOVERY abandon (fresh local state). */
  const [invoiceModalInstanceKey, setInvoiceModalInstanceKey] = useState(0);
  const [selectedOfferForInvoice, setSelectedOfferForInvoice] = useState<OfferData | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [selectedProformaForInvoice, setSelectedProformaForInvoice] = useState<InvoiceData | null>(null);
  const [proformas, setProformas] = useState<InvoiceData[]>([]);
  const proformasLoadStartedRef = useRef(false);
  const [expandedProformaIds, setExpandedProformaIds] = useState<Set<string>>(new Set());
  const [proformaChildInvoices, setProformaChildInvoices] = useState<Record<string, InvoiceData[]>>({});
  const [invoicedTotalByProformaId, setInvoicedTotalByProformaId] = useState<Record<string, number>>({});
  const [isOfferEditModalOpen, setIsOfferEditModalOpen] = useState(false);
  const [offerToEdit, setOfferToEdit] = useState<OfferData | null>(null);
  const [isMultiOfferDetailsOpen, setIsMultiOfferDetailsOpen] = useState(false);
  const [selectedMultiOfferHeader, setSelectedMultiOfferHeader] = useState<OfferHeaderData | null>(null);
  const [selectedMultiOfferItems, setSelectedMultiOfferItems] = useState<OfferItemData[]>([]);
  const [offerViewData, setOfferViewData] = useState<OfferViewPayload | null>(null);
  const [isOfferViewModalOpen, setIsOfferViewModalOpen] = useState(false);
  const [pendingOfferItemForInvoice, setPendingOfferItemForInvoice] = useState<OfferItemData | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestData | null>(null);
  const [confirmPaymentModalProforma, setConfirmPaymentModalProforma] = useState<InvoiceData | null>(null);
  const [paymentProofsByInvoiceId, setPaymentProofsByInvoiceId] = useState<Record<string, PaymentProof[]>>({});
  const [proofSignedUrlByInvoiceId, setProofSignedUrlByInvoiceId] = useState<Record<string, string>>({});
  const [paymentProofModal, setPaymentProofModal] = useState<{ mode: 'add' | 'replace'; proof: PaymentProof } | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [clientHistoryLead, setClientHistoryLead] = useState<Lead | null>(null);
  const [isCreateLeadModalOpen, setIsCreateLeadModalOpen] = useState(false);

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
  // Send channel picker after Save and Send (offers/proformas)
  const [sendChannelPayload, setSendChannelPayload] = useState<SendChannelPayload | null>(null);
  const offerModalCloseRef = useRef<(() => void) | null>(null);
  const sendChannelOnCloseRef = useRef<(() => void) | null>(null);
  const sendChannelResultPrefixRef = useRef<'Offer' | 'Proforma'>('Offer');
  /** Per-flow save guards (independent; no cross-blocking between offer / invoice / booking). */
  const multiOfferSaveInProgressRef = useRef(false);
  const directBookingSaveInProgressRef = useRef(false);
  const invoiceSaveInProgressRef = useRef(false);
  /** Stable idempotency keys — reused on retry within the same logical action. Reset on success or modal close. */
  const multiOfferIdempotencyKeyRef = useRef<string | null>(null);
  const directBookingIdempotencyKeyRef = useRef<string | null>(null);
  const invoiceIdempotencyKeyRef = useRef<string | null>(null);

  // DEBUG/RECOVERY: escape hatch when modal times out or user abandons stuck save — not final business logic.
  const onStuckClearAccountDashboardSaveLock = useCallback(
    (flow?: 'multiOffer' | 'directBooking' | 'invoice') => {
      console.warn('[DEBUG/RECOVERY] clearAccountDashboardSaveLock', { flow: flow || 'all', pageInstanceId: PAGE_INSTANCE_ID });
      if (!flow || flow === 'multiOffer') {
        multiOfferSaveInProgressRef.current = false;
        multiOfferIdempotencyKeyRef.current = null;
      }
      if (!flow || flow === 'directBooking') {
        directBookingSaveInProgressRef.current = false;
        directBookingIdempotencyKeyRef.current = null;
      }
      if (!flow || flow === 'invoice') {
        invoiceSaveInProgressRef.current = false;
        invoiceIdempotencyKeyRef.current = null;
      }
    },
    []
  );

  const [uebergabeprotokollLoading, setUebergabeprotokollLoading] = useState(false);
  const [uebergabeprotokollPdfLoading, setUebergabeprotokollPdfLoading] = useState(false);

  const shellModalFlagsRef = useRef<Record<string, boolean>>({});
  shellModalFlagsRef.current = {
    editingLead: !!editingLead,
    clientHistoryLead: !!clientHistoryLead,
    isCreateLeadModalOpen,
    isOfferEditModalOpen,
    docPreviewOpen: docPreview.open,
    sendChannelOpen: sendChannelPayload !== null,
    isMultiOfferDetailsOpen,
    openMediaModal: openMediaModalType != null,
    meterGallery: meterGalleryReadingId != null,
    depositProofOverlay:
      isDepositProofModalOpen && depositProofType != null && selectedProperty != null,
    addApartmentGroupModalOpen,
    isAddressBookModalOpen,
    isMeterNumbersModalOpen,
    isInvoiceModalOpen,
    confirmPaymentModalOpen: confirmPaymentModalProforma !== null,
    paymentProofModalOpen: paymentProofModal !== null,
    isOfferViewModalOpen,
    isZweckentfremdungModalOpen,
    isManageModalOpen,
    isPropertyAddModalOpen,
    isRequestModalOpen,
    archiveModalOpen: archiveModalPropertyId != null,
    deleteModalOpen: deleteModalPropertyId != null,
    isTransferModalOpen,
    isAddInventoryModalOpen,
    isPropertyAddFromDocumentOpen,
    isExpenseAddFromDocumentOpen,
    isExpenseCategoriesModalOpen,
    isCreateWarehouseModalOpen,
  };

  useEffect(() => {
    if (!SHELL_RESUME_DEBUG) return;
    return registerShellDebugSnapshotGetter(() =>
      buildAccountDashboardShellDebugSnapshot(shellModalFlagsRef.current)
    );
  }, []);

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
        }
        
        // Зберегти об'єкт в базу даних
        const savedProperty = await propertiesService.create(propertyWithoutId);
        
        // Оновити локальний стан з об'єктом з бази (з правильним ID)
        setProperties([...properties, savedProperty]);
        setSelectedPropertyId(savedProperty.id);
        void ensurePropertyHasCoords({
          id: savedProperty.id,
          address: savedProperty.address ?? undefined,
          city: savedProperty.city ?? undefined,
          country: savedProperty.country ?? undefined,
          postalCode: savedProperty.zip ?? undefined,
          existingLat: savedProperty.lat ?? undefined,
          existingLng: savedProperty.lng ?? undefined,
        });
      }
      
      setIsPropertyAddModalOpen(false);
    } catch (error) {
      console.error('❌ Error saving property:', error);
      // Показати помилку користувачу (можна додати toast notification)
      alert('Помилка збереження об\'єкта. Спробуйте ще раз.');
    }
  };

  const defaultDetails: PropertyDetails = { area: 0, rooms: 0, floor: 0, year: 0, beds: 0, baths: 0, balconies: 0, buildingFloors: 0 };

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

  const [isCard3Editing, setIsCard3Editing] = useState(false);
  const [card3Draft, setCard3Draft] = useState<{ building: BuildingSpecs; year: number } | null>(null);
  const defaultBuilding = (): BuildingSpecs => ({
    type: '', repairYear: 0, heating: '', energyClass: '', parking: '', pets: '',
    elevator: '', kitchen: '', access: '', certificate: '', energyDemand: ''
  });
  const startCard3Edit = () => {
    const prop = properties.find(p => p.id === selectedPropertyId) ?? null;
    if (!prop) return;
    const b = (prop.building || {}) as Partial<BuildingSpecs>;
    setCard3Draft({
      building: { ...defaultBuilding(), ...b, repairYear: b.repairYear ?? 0 },
      year: (prop.details?.year ?? 0) as number
    });
    setIsCard3Editing(true);
  };
  const saveCard3 = async () => {
    const prop = properties.find(p => p.id === selectedPropertyId) ?? null;
    if (!prop || !card3Draft) return;
    try {
      const updated = await propertiesService.update(prop.id, {
        building: card3Draft.building,
        details: { ...defaultDetails, ...(prop.details || {}), year: card3Draft.year }
      });
      setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedPropertyId(updated.id);
      setIsCard3Editing(false);
      setCard3Draft(null);
    } catch (err) {
      console.error('Card 3 save error:', err);
      alert('Помилка збереження. Спробуйте ще раз.');
    }
  };
  const cancelCard3 = () => {
    setIsCard3Editing(false);
    setCard3Draft(null);
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

  const addressBookRoleLabel = (r: string) => (r === 'owner' ? 'Власник' : r === 'company1' ? '1-ша фірма' : r === 'company2' ? '2-га фірма' : 'Управління');

  const startCard1SectionEdit = (section: Exclude<Card1EditSection, null>) => {
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
      contactPerson: prop.landlord.contactPerson ?? '',
      ...(isPersistableAddressBookPartyId(prop.landlord.addressBookPartyId) ? { addressBookPartyId: prop.landlord.addressBookPartyId } : {}),
    } : defaultContactParty();
    const management: ContactParty = prop.management ? {
      name: prop.management.name ?? '',
      address: { ...defAddr, ...(prop.management.address || {}) },
      phones: (prop.management.phones?.length ? [...prop.management.phones] : ['']),
      emails: (prop.management.emails?.length ? [...prop.management.emails] : ['']),
      iban: prop.management.iban ?? '',
      unitIdentifier: prop.management.unitIdentifier ?? '',
      contactPerson: prop.management.contactPerson ?? '',
      ...(isPersistableAddressBookPartyId(prop.management.addressBookPartyId) ? { addressBookPartyId: prop.management.addressBookPartyId } : {}),
    } : defaultContactParty();
    const tenant: TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number; addressBookPartyId?: string } = prop.tenant ? {
      ...prop.tenant,
      address: prop.tenant.address ? { ...defAddr, ...prop.tenant.address } : defAddr,
      phones: (prop.tenant.phones?.length ? [...prop.tenant.phones] : (prop.tenant.phone ? [prop.tenant.phone] : [''])),
      emails: (prop.tenant.emails?.length ? [...prop.tenant.emails] : (prop.tenant.email ? [prop.tenant.email] : [''])),
      paymentDayOfMonth: prop.tenant.paymentDayOfMonth,
      ...(isPersistableAddressBookPartyId(prop.tenant.addressBookPartyId) ? { addressBookPartyId: prop.tenant.addressBookPartyId } : {}),
    } : {
      name: '', phone: '', email: '', rent: 0, deposit: 0, startDate: '', km: 0, bk: 0, hk: 0,
      address: defAddr,
      phones: [''],
      emails: [''],
      paymentDayOfMonth: undefined
    };
    const secondCompany: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number; addressBookPartyId?: string }) | null = prop.secondCompany ? {
      ...prop.secondCompany,
      address: prop.secondCompany.address ? { ...defAddr, ...prop.secondCompany.address } : defAddr,
      phones: (prop.secondCompany.phones?.length ? [...prop.secondCompany.phones] : (prop.secondCompany.phone ? [prop.secondCompany.phone] : [''])),
      emails: (prop.secondCompany.emails?.length ? [...prop.secondCompany.emails] : (prop.secondCompany.email ? [prop.secondCompany.email] : [''])),
      paymentDayOfMonth: prop.secondCompany.paymentDayOfMonth,
      ...(isPersistableAddressBookPartyId(prop.secondCompany.addressBookPartyId) ? { addressBookPartyId: prop.secondCompany.addressBookPartyId } : {}),
    } : null;
    const deposit: PropertyDeposit | null = prop.deposit ? {
      amount: prop.deposit.amount ?? 0,
      status: (prop.deposit.status === 'paid' || prop.deposit.status === 'partially_returned' || prop.deposit.status === 'returned') ? 'paid' : 'unpaid',
      paidAt: prop.deposit.paidAt ?? '',
      paidTo: prop.deposit.paidTo ?? '',
      returnedAt: prop.deposit.returnedAt ?? '',
      returnedAmount: prop.deposit.returnedAmount ?? undefined,
      returnStatus: prop.deposit.returnStatus ?? (prop.deposit.status === 'partially_returned' ? 'partially_returned' : prop.deposit.status === 'returned' ? 'returned' : 'unpaid'),
      depositType: prop.deposit.depositType ?? 'TRANSFER',
      periodFrom: prop.deposit.periodFrom ?? prop.deposit.paidAt ?? '',
      periodTo: prop.deposit.periodTo ?? '',
      depositNo: prop.deposit.depositNo ?? '',
      issuerCompany: prop.deposit.issuerCompany ?? ''
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
      apartmentGroupId: prop.apartmentGroupId ?? null,
      landlord,
      management,
      tenant,
      secondCompany,
      deposit
    });
    setCard1DraftBaseline({
      apartmentStatus: (prop.apartmentStatus || 'active') as 'active' | 'ooo' | 'preparation' | 'rented_worker',
      address: prop.address ?? '',
      zip: prop.zip ?? '',
      city: prop.city ?? '',
      country: prop.country ?? '',
      title: prop.title ?? '',
      floor: prop.details?.floor ?? 0,
      buildingFloors: prop.details?.buildingFloors ?? 0,
      apartmentGroupId: prop.apartmentGroupId ?? null,
      landlord,
      management,
      tenant,
      secondCompany,
      deposit
    });
    setCard1DepositError(null);
    setLeaseTermDraft(leaseTerm ? { contractStart: leaseTerm.contract_start, contractEnd: leaseTerm.contract_end ?? '', contractType: leaseTerm.contract_type, firstPaymentDate: leaseTerm.first_payment_date ?? '', note: leaseTerm.note ?? '' } : { contractStart: '', contractEnd: '', contractType: 'befristet', firstPaymentDate: '', note: '' });
    setEditingCard1Section(section);
    if (!apartmentGroupsLoaded) {
      (async () => {
        try {
          const list = await apartmentGroupsService.getAll();
          setApartmentGroups(list);
          setApartmentGroupsLoaded(true);
        } catch (e) {
          console.error('[ApartmentGroups load]', e);
        }
      })();
    }
    if (!addressBookLoaded) {
      setAddressBookLoading(true);
      (async () => {
        try {
          const user = await safeGetUser();
          if (user?.id) {
            // Always load via shared query. RLS keeps non-managers scoped to own rows,
            // while managers/super_manager see the shared workspace list.
            const list = await addressBookPartiesService.listShared();
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

  const cancelCard1SectionEdit = () => {
    setEditingCard1Section(null);
    if (card1DraftBaseline) setCard1Draft(card1DraftBaseline);
    setCard1DepositError(null);
    setEditingRentTimelineRowId(null);
    setRentTimelineEditDraft(null);
    setRentTimelineEditError(null);
    setShowAddRentIncreaseForm(false);
    setRentIncreaseForm({ validFrom: '', validTo: '', km: '', mietsteuer: '', unternehmenssteuer: '', bk: '', hk: '', muell: '', strom: '', gas: '', wasser: '' });
    setRentIncreaseFormError(null);
    setShowAddDocumentForm(false);
    setNewDocFile(null);
    setAddDocumentError(null);
    setNewDocMeta({});
    setAddApartmentGroupModalOpen(false);
    setAddApartmentGroupName('');
    setAddApartmentGroupError(null);
    setLeaseTermDraft(leaseTerm ? { contractStart: leaseTerm.contract_start, contractEnd: leaseTerm.contract_end ?? '', contractType: leaseTerm.contract_type, firstPaymentDate: leaseTerm.first_payment_date ?? '', note: leaseTerm.note ?? '' } : null);
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
    if (d.status !== 'unpaid' && !(d.periodFrom?.trim() || d.paidAt?.trim())) return { valid: false, message: 'Для обраного статусу потрібна дата оплати.' };
    const retStatus = d.returnStatus ?? 'unpaid';
    if (retStatus === 'partially_returned' || retStatus === 'returned') {
      if (!d.returnedAt?.trim()) return { valid: false, message: 'Потрібна дата повернення.' };
      if (typeof d.returnedAmount !== 'number' || d.returnedAmount < 0) return { valid: false, message: 'Потрібна сума повернення (≥ 0).' };
      if (d.returnedAmount > amount) return { valid: false, message: 'Сума повернення не може перевищувати суму застави.' };
    }
    return { valid: true, message: null };
  };

  const saveRentTimelineRowIfEditing = useCallback(async () => {
    if (!selectedPropertyId) return;
    if (!(editingRentTimelineRowId && rentTimelineEditDraft)) return;
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
      const rows = await rentTimelineService.listRows(selectedPropertyId);
      setOwnerRentTimelineDbRows(rows);
    } catch (err) {
      console.error('Rent timeline update error:', err);
      setRentTimelineEditError(err instanceof Error ? err.message : 'Помилка збереження рядка.');
      return;
    }
    setEditingRentTimelineRowId(null);
    setRentTimelineEditDraft(null);
    setRentTimelineEditError(null);
  }, [editingRentTimelineRowId, rentTimelineEditDraft, selectedPropertyId]);

  const saveCard1Section = async (section: Exclude<Card1EditSection, null>) => {
    const prop = properties.find(p => p.id === selectedPropertyId) ?? null;
    const draftSnapshot = card1Draft;
    if (!prop || !draftSnapshot) return;

    if (section === 'rentTimeline') {
      await saveRentTimelineRowIfEditing();
      setEditingCard1Section(null);
      return;
    }

    if (section === 'documents') {
      // Documents CRUD persists immediately; “save” just exits edit mode.
      setShowAddDocumentForm(false);
      setNewDocFile(null);
      setAddDocumentError(null);
      setNewDocMeta({});
      setEditingCard1Section(null);
      return;
    }

    if (section === 'kaution') {
      const depositCheck = isCard1DepositValid(draftSnapshot.deposit);
      if (!depositCheck.valid) {
        setCard1DepositError(depositCheck.message);
        return;
      }
      setCard1DepositError(null);
    }

    try {
      if (section === 'lease') {
        const fullAddressDisplay = formatPropertyAddress({
          address: draftSnapshot.address,
          zip: draftSnapshot.zip,
          city: draftSnapshot.city,
          country: draftSnapshot.country,
        });
        const updated = await propertiesService.update(prop.id, {
          address: draftSnapshot.address,
          zip: draftSnapshot.zip,
          city: draftSnapshot.city,
          country: draftSnapshot.country,
          fullAddress: fullAddressDisplay,
          title: draftSnapshot.title,
          details: { ...(prop.details ?? {}), floor: draftSnapshot.floor, buildingFloors: draftSnapshot.buildingFloors },
          apartmentStatus: draftSnapshot.apartmentStatus,
          apartmentGroupId: draftSnapshot.apartmentGroupId ?? null,
        });
        setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
        setSelectedPropertyId(updated.id);
        setCard1DraftBaseline(draftSnapshot);
        setEditingCard1Section(null);
        return;
      }

      if (section === 'counterparties') {
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
        const t = draftSnapshot.tenant;
        const tenantPayload: TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number; addressBookPartyId?: string } = {
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
          paymentDayOfMonth: paymentDay,
          ...(isPersistableAddressBookPartyId(t.addressBookPartyId) ? { addressBookPartyId: t.addressBookPartyId } : {}),
        };
        const sc = draftSnapshot.secondCompany;
        const shouldPersistSecond =
          sc != null && (((sc.name ?? '').trim() !== '') || tenantLikeHasDisplayableLegacyBody(sc));
        const secondCompanyPayload: (TenantDetails & { address?: ContactParty['address']; phones?: string[]; emails?: string[]; iban?: string; paymentDayOfMonth?: number; addressBookPartyId?: string }) | null =
          shouldPersistSecond && sc
            ? {
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
                paymentDayOfMonth: scPaymentDay ?? undefined,
                ...(isPersistableAddressBookPartyId(sc.addressBookPartyId) ? { addressBookPartyId: sc.addressBookPartyId } : {}),
              }
            : null;
        const updated = await propertiesService.update(prop.id, {
          landlord: draftSnapshot.landlord,
          management: draftSnapshot.management,
          tenant: tenantPayload,
          secondCompany: secondCompanyPayload === null ? null : (secondCompanyPayload ?? undefined),
        });
        const user = await safeGetUser();
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
        setCard1DraftBaseline(draftSnapshot);
        setEditingCard1Section(null);
        if (user?.id && entries.length > 0) {
          try {
            setAddressBookLastError(null);
            await addressBookPartiesService.upsertMany(entries);
          } catch (e) {
            console.error('[AddressBook upsertMany]', e);
            setAddressBookLastError(String((e as Error)?.message ?? e));
          }
        }
        return;
      }

      if (section === 'kaution') {
        const depositPayload: PropertyDeposit | null = draftSnapshot.deposit != null
          ? {
              amount: typeof draftSnapshot.deposit.amount === 'number' ? draftSnapshot.deposit.amount : 0,
              status: draftSnapshot.deposit.status ?? 'unpaid',
              paidAt: draftSnapshot.deposit.periodFrom?.trim() || draftSnapshot.deposit.paidAt?.trim() || undefined,
              paidTo: draftSnapshot.deposit.paidTo?.trim() || undefined,
              returnedAt: draftSnapshot.deposit.returnedAt?.trim() || undefined,
              returnedAmount: draftSnapshot.deposit.returnedAmount,
              returnStatus: draftSnapshot.deposit.returnStatus ?? 'unpaid',
              depositType: draftSnapshot.deposit.depositType ?? 'TRANSFER',
              periodFrom: draftSnapshot.deposit.periodFrom?.trim() || undefined,
              periodTo: draftSnapshot.deposit.periodTo?.trim() || undefined,
              depositNo: draftSnapshot.deposit.depositNo?.trim() || undefined,
              issuerCompany: draftSnapshot.deposit.issuerCompany?.trim() || undefined
            }
          : null;
        const updated = await propertiesService.update(prop.id, { deposit: depositPayload });
        setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
        setSelectedPropertyId(updated.id);
        setCard1DraftBaseline(draftSnapshot);
        setEditingCard1Section(null);
        return;
      }
    } catch (err) {
      console.error('Card 1 section save error:', err);
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
    setEditingCard1Section(null);
    setCard1Draft(null);
    setCard1DraftBaseline(null);
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

  useEffect(() => {
    if (!selectedPropertyId) {
      setPropertyInventoryItems([]);
      return;
    }
    setPropertyInventoryLoading(true);
    propertyInventoryService.listItemsWithDocuments(selectedPropertyId)
      .then(setPropertyInventoryItems)
      .catch(() => setPropertyInventoryItems([]))
      .finally(() => setPropertyInventoryLoading(false));
  }, [selectedPropertyId]);

  const refreshPropertyInventory = useCallback(() => {
    if (!selectedPropertyId) return;
    propertyInventoryService.listItemsWithDocuments(selectedPropertyId).then(setPropertyInventoryItems);
  }, [selectedPropertyId]);

  const PROPERTY_INVENTORY_COLLAPSED_KEY = 'property_inventory_collapsed';
  useEffect(() => {
    if (!selectedPropertyId) return;
    const key = `${PROPERTY_INVENTORY_COLLAPSED_KEY}:${selectedPropertyId}`;
    try {
      const stored = localStorage.getItem(key);
      setIsPropertyInventoryCollapsed(stored !== 'false');
    } catch {
      setIsPropertyInventoryCollapsed(true);
    }
  }, [selectedPropertyId]);

  const setPropertyInventoryCollapsed = useCallback((value: boolean) => {
    setIsPropertyInventoryCollapsed(value);
    if (selectedPropertyId) {
      try {
        localStorage.setItem(`${PROPERTY_INVENTORY_COLLAPSED_KEY}:${selectedPropertyId}`, String(value));
      } catch {
        // ignore
      }
    }
  }, [selectedPropertyId]);

  const METER_READINGS_COLLAPSED_KEY = 'meter_readings_collapsed';
  useEffect(() => {
    if (!selectedPropertyId) return;
    const key = `${METER_READINGS_COLLAPSED_KEY}:${selectedPropertyId}`;
    try {
      const stored = localStorage.getItem(key);
      setIsMeterReadingsCollapsed(stored !== 'false');
    } catch {
      setIsMeterReadingsCollapsed(true);
    }
  }, [selectedPropertyId]);

  const setMeterReadingsCollapsed = useCallback((value: boolean) => {
    setIsMeterReadingsCollapsed(value);
    if (selectedPropertyId) {
      try {
        localStorage.setItem(`${METER_READINGS_COLLAPSED_KEY}:${selectedPropertyId}`, String(value));
      } catch {
        // ignore
      }
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setPropertyMediaAssets([]);
      return;
    }
    setPropertyMediaLoading(true);
    propertyMediaService.listAssets(selectedPropertyId).then(setPropertyMediaAssets).catch(() => setPropertyMediaAssets([])).finally(() => setPropertyMediaLoading(false));
  }, [selectedPropertyId]);

  // Header cover photo: use cover_photo_asset_id when set, else fallback to image/images[0]
  useEffect(() => {
    if (!selectedPropertyId) {
      setCoverPhotoUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const coverId = await propertyMediaService.getCoverPhotoAssetId(selectedPropertyId);
        if (cancelled) return;
        if (!coverId) {
          setCoverPhotoUrl(null);
          return;
        }
        const photos = propertyMediaAssets.filter((a) => a.type === 'photo');
        const asset = photos.find((a) => a.id === coverId);
        if (!asset?.storage_path) {
          setCoverPhotoUrl(null);
          return;
        }
        const url = await propertyMediaService.getSignedUrl(asset.storage_path);
        if (!cancelled) setCoverPhotoUrl(url);
      } catch {
        if (!cancelled) setCoverPhotoUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPropertyId, propertyMediaAssets]);

  // Photo gallery modal: load cover + signed URLs when modal opens (type photo) or assets change
  useEffect(() => {
    if (openMediaModalType !== 'photo' || !selectedPropertyId) return;
    const photos = propertyMediaAssets
      .filter((a) => a.type === 'photo')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    let cancelled = false;
    (async () => {
      try {
        const [coverId, urls] = await Promise.all([
          propertyMediaService.getCoverPhotoAssetId(selectedPropertyId),
          propertyMediaService.getPhotoSignedUrls(photos),
        ]);
        if (cancelled) return;
        setPhotoGalleryCoverId(coverId ?? null);
        setPhotoGallerySignedUrls(urls);
        setPhotoGallerySelectedId(
          coverId && photos.some((p) => p.id === coverId) ? coverId : (photos[0]?.id ?? null)
        );
      } catch {
        if (!cancelled) {
          setPhotoGalleryCoverId(null);
          setPhotoGallerySignedUrls({});
          setPhotoGallerySelectedId(photos[0]?.id ?? null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [openMediaModalType, selectedPropertyId, propertyMediaAssets]);

  // Media modal (floor_plan / magic_plan_report): clear staged file and revoke preview when modal or property changes
  useEffect(() => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }
    setMediaPreviewUrl(null);
    setMediaStagedFile(null);
    setMediaMultiFileHint(false);
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [openMediaModalType, selectedPropertyId]);

  // Expense invoices: load categories (ensure defaults) and items when property changes
  useEffect(() => {
    if (!selectedPropertyId) {
      setExpenseItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cats = await propertyExpenseCategoryService.ensureDefaults();
        if (!cancelled) setExpenseCategories(cats);
      } catch {
        if (!cancelled) setExpenseCategories([]);
      }
    })();
    setExpenseLoading(true);
    propertyExpenseService.listItemsWithDocuments(selectedPropertyId)
      .then((data) => { if (!cancelled) setExpenseItems(data); })
      .catch(() => { if (!cancelled) setExpenseItems([]); })
      .finally(() => { if (!cancelled) setExpenseLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPropertyId]);

  const refreshExpenseItems = useCallback(() => {
    if (!selectedPropertyId) return;
    propertyExpenseService.listItemsWithDocuments(selectedPropertyId).then(setExpenseItems);
    propertyExpenseCategoryService.listCategories(true).then(setExpenseCategories);
  }, [selectedPropertyId]);

  const refreshMeterData = useCallback(() => {
    if (!selectedPropertyId) return;
    setMeterReadingsLoading(true);
    Promise.all([
      propertyMeterService.listReadings(selectedPropertyId),
      propertyMeterService.listMeters(selectedPropertyId),
    ])
      .then(([readings, meters]) => {
        setMeterReadingsManual(readings);
        setMeterMetersList(meters);
        const readingIds = readings.map((r) => r.id);
        if (readingIds.length === 0) {
          setMeterPhotoCountByReadingId({});
          return;
        }
        propertyMeterService.listPhotosByReadingIds(readingIds).then((photos) => {
          const counts: Record<string, number> = {};
          photos.forEach((p) => {
            counts[p.reading_id] = (counts[p.reading_id] ?? 0) + 1;
          });
          setMeterPhotoCountByReadingId(counts);
        });
      })
      .catch(() => {
        setMeterReadingsManual([]);
        setMeterMetersList([]);
        setMeterPhotoCountByReadingId({});
      })
      .finally(() => setMeterReadingsLoading(false));
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setMeterReadingsManual([]);
      setMeterMetersList([]);
      return;
    }
    refreshMeterData();
  }, [selectedPropertyId, refreshMeterData]);

  useEffect(() => {
    if (!meterGalleryReadingId) {
      setGalleryPhotos([]);
      return;
    }
    setGalleryLoading(true);
    propertyMeterService.listReadingPhotos(meterGalleryReadingId).then((photos) => {
      if (photos.length === 0) {
        setGalleryPhotos([]);
        setGalleryLoading(false);
        return;
      }
      Promise.all(photos.map((p) => propertyMeterService.getPhotoSignedUrl(p.storage_path).then((signedUrl) => ({ id: p.id, storage_path: p.storage_path, signedUrl }))))
        .then(setGalleryPhotos)
        .catch(() => setGalleryPhotos([]))
        .finally(() => setGalleryLoading(false));
    }).catch(() => {
      setGalleryPhotos([]);
      setGalleryLoading(false);
    });
  }, [meterGalleryReadingId]);

  const handleViewExpenseDocument = useCallback(async (storagePath: string) => {
    try {
      const url = await propertyExpenseService.getDocumentSignedUrl(storagePath);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Expense document signed URL:', e);
      alert('Не вдалося відкрити документ.');
    }
  }, []);

  const handleDownloadExpenseDocument = useCallback(async (storagePath: string, fileName: string) => {
    try {
      const url = await propertyExpenseService.getDocumentSignedUrl(storagePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Expense document download:', e);
      alert('Не вдалося завантажити документ.');
    }
  }, []);

  const handleAddExpenseRow = () => {
    if (!selectedPropertyId || expenseCategories.length === 0) return;
    const newRow: PropertyExpenseItemWithDocument & { id: string } = {
      id: `new-${crypto.randomUUID()}`,
      property_id: selectedPropertyId,
      document_id: null,
      category_id: expenseCategories[0].id,
      article: null,
      name: '',
      quantity: 1,
      unit_price: 0,
      line_total: null,
      invoice_number: null,
      invoice_date: null,
      vendor: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      property_expense_documents: null,
      property_expense_categories: { id: expenseCategories[0].id, name: expenseCategories[0].name, code: expenseCategories[0].code, is_active: expenseCategories[0].is_active },
    };
    setExpenseItems((prev) => [...prev, newRow]);
    setIsExpenseEditing(true);
  };

  const handleUpdateExpenseItem = (index: number, field: string, value: string | number) => {
    setExpenseItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteExpenseItem = async (index: number) => {
    const item = expenseItems[index];
    if (!item) return;
    if (item.id.startsWith('new-')) {
      setExpenseItems((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    try {
      await propertyExpenseService.deleteItem(item.id);
      setExpenseItems((prev) => prev.filter((_, i) => i !== index));
    } catch (e) {
      console.error('Delete expense item:', e);
      alert('Не вдалося видалити. Спробуйте ще раз.');
    }
  };

  const handleDeleteExpenseGroup = async (group: { key: string; documentId: string | null; doc: { storage_path: string } | null; items: PropertyExpenseItemWithDocument[] }) => {
    const itemIds = new Set(group.items.map((i) => i.id));
    if (group.key === 'manual') {
      const toDelete = group.items.filter((i) => !i.id.startsWith('new-'));
      try {
        for (const item of toDelete) {
          await propertyExpenseService.deleteItem(item.id);
        }
        setExpenseItems((prev) => prev.filter((i) => !itemIds.has(i.id)));
      } catch (e) {
        console.error('Delete manual group:', e);
        alert('Не вдалося видалити. Спробуйте ще раз.');
      }
      return;
    }
    if (!group.documentId || !group.doc?.storage_path) return;
    try {
      await propertyExpenseService.deleteDocumentAndItems(group.documentId, group.doc.storage_path);
      setExpenseItems((prev) => prev.filter((i) => i.document_id !== group.documentId));
    } catch (e) {
      console.error('Delete expense document:', e);
      alert('Не вдалося видалити інвойс. Спробуйте ще раз.');
    }
  };

  const handleSaveExpense = async () => {
    if (!selectedPropertyId) return;
    const activeCategories = expenseCategories.filter((c) => c.is_active);
    const newRows = expenseItems.filter((i) => i.id.startsWith('new-'));
    for (const row of newRows) {
      if (!row.category_id || !row.name?.trim()) {
        alert('У кожного рядка мають бути назва та категорія.');
        return;
      }
      const cat = activeCategories.find((c) => c.id === row.category_id) || expenseCategories.find((c) => c.id === row.category_id);
      if (!cat) {
        alert('Обрана категорія недійсна.');
        return;
      }
    }
    try {
      for (const item of expenseItems) {
        if (item.id.startsWith('new-')) {
          await propertyExpenseService.createItem(selectedPropertyId, {
            category_id: item.category_id,
            name: item.name.trim(),
            quantity: item.quantity ?? 1,
            unit_price: item.unit_price ?? 0,
            article: item.article ?? null,
            invoice_number: item.invoice_number ?? null,
            invoice_date: item.invoice_date ?? null,
            vendor: item.vendor ?? null,
          });
        } else {
          await propertyExpenseService.updateItem(item.id, {
            category_id: item.category_id,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            article: item.article ?? null,
            invoice_number: item.invoice_number ?? null,
            invoice_date: item.invoice_date ?? null,
            vendor: item.vendor ?? null,
          });
        }
      }
      await refreshExpenseItems();
      setIsExpenseEditing(false);
    } catch (e) {
      console.error('Save expense error:', e);
      alert('Не вдалося зберегти. Спробуйте ще раз.');
    }
  };

  // Group expense items by document_id for invoice-level rows (doc:uuid or "manual")
  const expenseGroups = useMemo(() => {
    const byKey = new Map<string, PropertyExpenseItemWithDocument[]>();
    for (const item of expenseItems) {
      const key = item.document_id ? `doc:${item.document_id}` : 'manual';
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(item);
    }
    const groups: { key: string; documentId: string | null; doc: { storage_path: string; file_name: string | null; invoice_number: string | null; invoice_date: string | null; vendor: string | null } | null; items: PropertyExpenseItemWithDocument[] }[] = [];
    // Document groups first (order by first item's created_at or invoice_date), then manual
    const docKeys = [...byKey.entries()].filter(([k]) => k !== 'manual').sort((a, b) => {
      const aDate = a[1][0]?.invoice_date || a[1][0]?.created_at || '';
      const bDate = b[1][0]?.invoice_date || b[1][0]?.created_at || '';
      return String(bDate).localeCompare(String(aDate));
    });
    for (const [key, items] of docKeys) {
      const doc = items[0]?.property_expense_documents ?? null;
      groups.push({ key, documentId: items[0].document_id, doc, items });
    }
    if (byKey.has('manual')) {
      const items = byKey.get('manual')!;
      groups.push({ key: 'manual', documentId: null, doc: null, items });
    }
    return groups;
  }, [expenseItems]);

  const calcGroupSum = (items: PropertyExpenseItemWithDocument[]) =>
    items.reduce((s, i) => s + ((i.quantity ?? 0) * (i.unit_price ?? 0)), 0);
  const totalInvoicesAmount = expenseGroups.reduce((a, g) => a + calcGroupSum(g.items), 0);
  const monthlyInvoicesAmount = calcGroupSum(
    expenseItems.filter(
      (i) =>
        (i.property_expense_documents?.invoice_date ?? i.invoice_date ?? '').toString().slice(0, 7) ===
        statsSelectedMonth
    )
  );

  const handleExpenseOcrRecognize = async () => {
    if (!expenseOcrFile || !selectedPropertyId) return;
    if (isExpenseOcrProcessing) return;
    setIsExpenseOcrProcessing(true);
    setExpenseOcrError(null);
    try {
      const result = await recognizeInvoiceWithOcr(expenseOcrFile, expenseOcrFileName);
      if (!result.ok) {
        setExpenseOcrError(result.message);
        return;
      }
      const ocrData = result.data;
      setExpenseOcrInvoiceNumber(ocrData.invoiceNumber || '');
      // Edge function returns purchaseDate; treat it as invoiceDate fallback for expenses.
      setExpenseOcrInvoiceDate(ocrData.purchaseDate || new Date().toISOString().split('T')[0]);
      setExpenseOcrVendor(ocrData.vendor || '');
      const firstCategoryId = expenseCategories.length > 0 ? expenseCategories[0].id : '';
      const rows = (ocrData.items || []).map((item: { name?: string; quantity?: number; price?: number }, idx: number) => ({
        id: `ocr-${idx + 1}`,
        name: item.name || '',
        quantity: String(item.quantity ?? 1),
        price: String(item.price ?? 0),
        category_id: firstCategoryId,
      }));
      setExpenseOcrRows(rows);
      if (rows.length === 0) setExpenseOcrError('Документ не містить позицій.');
    } catch (e: unknown) {
      setExpenseOcrError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setIsExpenseOcrProcessing(false);
    }
  };

  const handleExpenseOcrCellChange = (rowId: string, field: 'name' | 'quantity' | 'price' | 'category_id', value: string) => {
    setExpenseOcrRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  };

  const handleExpenseOcrApplyCategoryToAll = (categoryId: string) => {
    setExpenseOcrRows((prev) => prev.map((r) => ({ ...r, category_id: categoryId })));
  };

  const handleSaveExpenseFromOCR = async () => {
    if (!selectedPropertyId || !expenseOcrFile || expenseOcrRows.length === 0) return;
    const validRows = expenseOcrRows.filter((r) => r.name.trim() && parseFloat(r.quantity) > 0);
    if (validRows.length === 0) {
      setExpenseOcrError('Додайте хоча б одну позицію з назвою та кількістю.');
      return;
    }
    const missingCategory = validRows.find((r) => !r.category_id);
    if (missingCategory) {
      setExpenseOcrError('У кожної позиції має бути обрана категорія.');
      return;
    }
    setIsExpenseOcrSaving(true);
    setExpenseOcrError(null);
    try {
      const { documentId } = await propertyExpenseService.createDocumentAndUpload(selectedPropertyId, expenseOcrFile, {
        file_name: expenseOcrFileName || null,
        invoice_number: expenseOcrInvoiceNumber || null,
        invoice_date: expenseOcrInvoiceDate || null,
        vendor: expenseOcrVendor || null,
      });
      await propertyExpenseService.appendItems(
        selectedPropertyId,
        documentId,
        validRows.map((r) => ({
          category_id: r.category_id,
          name: r.name.trim(),
          quantity: parseFloat(r.quantity) || 1,
          unit_price: parseFloat(r.price) || 0,
          invoice_number: expenseOcrInvoiceNumber || null,
          invoice_date: expenseOcrInvoiceDate || null,
          vendor: expenseOcrVendor || null,
        }))
      );
      await refreshExpenseItems();
      setIsExpenseAddFromDocumentOpen(false);
      setExpenseOcrRows([]);
      setExpenseOcrFile(null);
      setExpenseOcrFileName(null);
      if (expenseOcrPreviewUrl) { URL.revokeObjectURL(expenseOcrPreviewUrl); setExpenseOcrPreviewUrl(null); }
      setExpenseOcrInvoiceNumber('');
      setExpenseOcrInvoiceDate('');
      setExpenseOcrVendor('');
      setExpenseOcrError(null);
    } catch (e: unknown) {
      console.error('Expense OCR save error:', e);
      setExpenseOcrError(e instanceof Error ? e.message : 'Не вдалося зберегти.');
    } finally {
      setIsExpenseOcrSaving(false);
    }
  };

  const handleViewInventoryDocument = useCallback(async (storagePath: string) => {
    try {
      const url = await propertyInventoryService.getDocumentSignedUrl(storagePath);
      window.open(url, '_blank');
    } catch (e) {
      console.error('Signed URL error:', e);
      alert('Не вдалося відкрити документ.');
    }
  }, []);

  const handleDownloadInventoryDocument = useCallback(async (storagePath: string, fileName: string) => {
    try {
      const url = await propertyInventoryService.getDocumentSignedUrl(storagePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Signed URL error:', e);
      alert('Не вдалося завантажити документ.');
    }
  }, []);

  const refreshKautionProofs = () => {
    if (!selectedPropertyId) return;
    Promise.all([
      propertyDepositProofsService.getLatest(selectedPropertyId, 'payment'),
      propertyDepositProofsService.getLatest(selectedPropertyId, 'return'),
    ]).then(([payment, ret]) => setKautionProofs({ payment, return: ret })).catch(() => setKautionProofs({ payment: null, return: null }));
  };

  const uiFieldToDbColumn: Record<string, string> = {
    sku: 'article',
    name: 'name',
    quantity: 'quantity',
    unitPrice: 'unit_price',
    invoiceNumber: 'invoice_number',
    purchaseDate: 'purchase_date',
    vendor: 'store',
  };

  const handleAddInventoryRow = () => {
    if (!selectedPropertyId) return;
    const newRow: PropertyInventoryItemWithDocument = {
      id: `new-${crypto.randomUUID()}`,
      property_id: selectedPropertyId,
      document_id: null,
      article: null,
      name: '',
      quantity: 1,
      unit_price: null,
      invoice_number: null,
      purchase_date: null,
      store: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      property_inventory_documents: null,
    };
    setPropertyInventoryItems((prev) => [...prev, newRow]);
    setIsInventoryEditing(true);
  };

  const handleUpdateInventoryItem = (index: number, field: string, value: string | number) => {
    const dbField = uiFieldToDbColumn[field] ?? field;
    setPropertyInventoryItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [dbField]: value } : item))
    );
  };

  const handleDeleteInventoryItem = async (index: number) => {
    const item = propertyInventoryItems[index];
    if (!item) return;
    if (item.id.startsWith('new-')) {
      setPropertyInventoryItems((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    try {
      await propertyInventoryService.deleteItem(item.id);
      setPropertyInventoryItems((prev) => prev.filter((_, i) => i !== index));
    } catch (e) {
      console.error('Delete inventory item error:', e);
      alert('Не вдалося видалити. Спробуйте ще раз.');
    }
  };

  const handleSavePropertyInventory = async () => {
    if (!selectedPropertyId) return;
    try {
      for (const item of propertyInventoryItems) {
        if (item.id.startsWith('new-')) {
          await propertyInventoryService.createItem(selectedPropertyId, {
            name: item.name,
            quantity: item.quantity,
            article: item.article ?? null,
            unit_price: item.unit_price ?? null,
            invoice_number: item.invoice_number ?? null,
            purchase_date: item.purchase_date ?? null,
            store: item.store ?? null,
          });
        } else {
          await propertyInventoryService.updateItem(item.id, {
            name: item.name,
            quantity: item.quantity,
            article: item.article ?? null,
            unit_price: item.unit_price ?? null,
            invoice_number: item.invoice_number ?? null,
            purchase_date: item.purchase_date ?? null,
            store: item.store ?? null,
          });
        }
      }
      await refreshPropertyInventory();
      setIsInventoryEditing(false);
    } catch (e) {
      console.error('Save property inventory error:', e);
      alert('Не вдалося зберегти. Спробуйте ще раз.');
    }
  };

  // Load reservations from database on mount
  // Separate state for confirmed bookings (from bookings table)
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([]);

  // ===== OOO/BLOCK guard helpers (single source: bookings.type === 'BLOCK') =====
  // Must be declared before any handler that references hasOooBlockOverlap / assertNoOooBlockOverlap.
  // Otherwise production bundles can hit TDZ: Cannot access '…' before initialization.
  const todayIsoForEffectiveStatus = useMemo(() => formatLocalDateYmd(new Date()), []);

  const hasOooBlockOverlap = useCallback(
    (propertyIdRaw: string | null | undefined, startRaw: string, endRaw: string): boolean =>
      hasBlockOverlapForPropertyHalfOpen(propertyIdRaw, startRaw, endRaw, confirmedBookings),
    [confirmedBookings]
  );

  const assertNoOooBlockOverlap = useCallback(
    (propertyId: string | null | undefined, startIso: string, endIsoExclusive: string) => {
      if (hasOooBlockOverlap(propertyId, startIso, endIsoExclusive)) {
        throw new Error('Apartment is Out Of Order (OOO) for selected dates.');
      }
    },
    [hasOooBlockOverlap]
  );

  const isPropertyOooToday = useCallback(
    (propertyIdRaw: string | null | undefined): boolean =>
      isPropertyBlockActiveOnDate(propertyIdRaw, todayIsoForEffectiveStatus, confirmedBookings),
    [confirmedBookings, todayIsoForEffectiveStatus]
  );

  const handleSaveOffer = async (newOffer: OfferData) => {
      try {
        // Guard: do not allow offers over OOO (BLOCK) dates
        const propertyId = String(newOffer.propertyId ?? '').trim();
        const datesStr = String((newOffer as any).dates ?? '').trim();
        if (propertyId && datesStr) {
          const [sRaw, eRaw] = datesStr.split(/\s+to\s+/);
          const start = (sRaw ?? '').slice(0, 10);
          const end = (eRaw ?? '').slice(0, 10);
          if (start && end && hasOooBlockOverlap(propertyId, start, end)) {
            alert('Apartment is Out Of Order (OOO) for selected dates.');
            return;
          }
        }

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

  const stayOverviewContext = useMemo<StayOverviewStayContext>(
    () => ({
      offers,
      invoices,
      paymentProofsByInvoiceId,
      confirmedBookingIds: new Set(confirmedBookings.map((b) => String(b.id))),
      getPaymentProofSignedUrl: async (filePath: string) => {
        try {
          return await paymentProofsService.getPaymentProofSignedUrl(filePath);
        } catch {
          return null;
        }
      },
    }),
    [offers, invoices, paymentProofsByInvoiceId, confirmedBookings]
  );

  // Tile 7: property-scoped payments (same data as Payments page, filtered by selectedPropertyId)
  const propertyPayments = useMemo(() => {
    const sid = selectedPropertyId != null ? String(selectedPropertyId) : null;
    if (!sid) return [];
    const ctx = { offers, reservations, confirmedBookings };
    const filtered = proformas.filter((p) => getPropertyIdForProforma(p, ctx) === sid);
    return [...filtered].sort((a, b) => {
      const da = dateISOTile7(a);
      const db = dateISOTile7(b);
      return db.localeCompare(da);
    });
  }, [proformas, selectedPropertyId, offers, reservations, confirmedBookings]);

  const confirmedPropertyPayments = useMemo(
    () => propertyPayments.filter((p) => p.status === 'Paid'),
    [propertyPayments]
  );

  const totalReceivedTile7 = useMemo(
    () => confirmedPropertyPayments.reduce((sum, p) => sum + amountNumberTile7(p), 0),
    [confirmedPropertyPayments]
  );

  const lastPaymentTile7 = confirmedPropertyPayments.length > 0 ? confirmedPropertyPayments[0] : null;

  const propertyPaymentsInvoiceIdsKey = useMemo(
    () => propertyPayments.map((p) => String(p.id)).join(','),
    [propertyPayments]
  );

  // Load payment proofs for tile 7 when selected property and its payments change
  useEffect(() => {
    if (!selectedPropertyId || propertyPayments.length === 0) return;
    const invoiceIds = propertyPayments.map((p) => String(p.id));
    loadPaymentProofsForInvoiceIds(invoiceIds);
  }, [selectedPropertyId, propertyPaymentsInvoiceIdsKey]);

  // Property-scoped lists for tiles 8–10 (read-only)
  const propertyOffers = useMemo(() => {
    const sid = selectedPropertyId != null ? String(selectedPropertyId) : null;
    if (!sid) return [];
    return offers
      .filter((o) => String(o.propertyId) === sid)
      .sort((a, b) => (b.dates?.split(' to ')[0] ?? '').localeCompare(a.dates?.split(' to ')[0] ?? ''));
  }, [offers, selectedPropertyId]);

  const propertyReservations = useMemo(() => {
    const sid = selectedPropertyId != null ? String(selectedPropertyId) : null;
    if (!sid) return [];
    return reservations
      .filter((r) => String((r as { roomId?: string; propertyId?: string }).roomId ?? (r as any).propertyId) === sid)
      .sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  }, [reservations, selectedPropertyId]);

  /** Maps UI reservation rows to `Reservation` shape for Properties Dashboard month pipeline (Apartment Statistics). */
  const reservationsForDashboardStats = useMemo((): Reservation[] => {
    return reservations.map((r) => {
      const row = r as {
        id?: string | number;
        propertyId?: string;
        roomId?: string;
        start?: string;
        end?: string;
        startDate?: string;
        endDate?: string;
        status?: Reservation['status'];
      };
      const pid = String(row.roomId ?? row.propertyId ?? '');
      const start = row.start ?? row.startDate ?? '';
      const end = row.end ?? row.endDate ?? '';
      return {
        id: String(row.id ?? ''),
        propertyId: pid,
        startDate: start,
        endDate: end,
        status: row.status ?? 'open',
      };
    });
  }, [reservations]);

  const propertyRequests = useMemo(() => {
    const sid = selectedPropertyId != null ? String(selectedPropertyId) : null;
    if (!sid) return [];
    return requests
      .filter((r) => r.status !== 'archived' && String(r.propertyId ?? r.property?.id) === sid)
      .sort((a, b) => (b.startDate ?? b.createdAt ?? '').localeCompare(a.startDate ?? a.createdAt ?? ''));
  }, [requests, selectedPropertyId]);

  // Utilities cost from meter block "Сума" (consumption × price per type) for Apartment Statistics
  const utilitiesCostFromMeters = useMemo(() => {
    const consumptionByType: Record<MeterType, number> = { strom: 0, gas: 0, wasser: 0, heizung: 0 };
    const sortedReadings = [...meterReadingsManual].sort((a, b) => {
      const d = a.reading_date.localeCompare(b.reading_date);
      if (d !== 0) return d;
      const c = (a.created_at || '').localeCompare(b.created_at || '');
      if (c !== 0) return c;
      return (a.id || '').localeCompare(b.id || '');
    });
    METER_TYPES.forEach((type) => {
      const key = type as MeterType;
      const withVal = sortedReadings.filter((r) => (r[key] as number | null) != null).map((r) => r[key] as number);
      for (let i = 1; i < withVal.length; i++) {
        const delta = withVal[i] - withVal[i - 1];
        if (delta > 0) consumptionByType[key] += delta;
      }
    });
    const metersByType: Record<MeterType, PropertyMeterRow | undefined> = { strom: undefined, gas: undefined, wasser: undefined, heizung: undefined };
    meterMetersList.forEach((m) => { metersByType[m.type] = m; });
    let total = 0;
    METER_TYPES.forEach((t) => {
      const m = metersByType[t as MeterType];
      const consumption = consumptionByType[t as MeterType];
      const price = m?.price_per_unit;
      if (consumption != null && price != null && Number.isFinite(consumption) && Number.isFinite(price))
        total += consumption * price;
    });
    return total;
  }, [meterReadingsManual, meterMetersList]);

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

  const currentStay = useMemo((): Booking | null => {
    const todayStr = formatLocalDateYmd(new Date());
    const matches = confirmedBookings.filter(
      (b) => b.propertyId === selectedPropertyId && b.start <= todayStr && b.end > todayStr
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => (b.start > a.start ? 1 : b.start < a.start ? -1 : 0));
    return matches[0];
  }, [confirmedBookings, selectedPropertyId]);

  const handleUebergabeprotokollGenerate = async () => {
    if (!currentStay || !selectedPropertyId) return;
    setUebergabeprotokollLoading(true);
    try {
      const res = await fetch('/api/protocols/uebergabeprotokoll/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: currentStay.id, propertyId: selectedPropertyId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error != null ? (json?.stage ? `${json.error} (${json.stage})` : json.error) : `Помилка ${res.status}`;
        setToastMessage(errMsg);
        return;
      }
      if (json.url) window.open(json.url, '_blank');
      if (json.warning) setToastMessage(json.warning);
    } catch (e) {
      setToastMessage(e instanceof Error ? e.message : 'Помилка генерації акту');
    } finally {
      setUebergabeprotokollLoading(false);
    }
  };

  const handleUebergabeprotokollPdfPreview = async () => {
    if (!currentStay || !selectedPropertyId) return;
    setUebergabeprotokollPdfLoading(true);
    try {
      const res = await fetch('/api/protocols/uebergabeprotokoll/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: currentStay.id, propertyId: selectedPropertyId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error != null ? (json?.stage ? `${json.error} (${json.stage})` : json.error) : `Помилка ${res.status}`;
        setToastMessage(errMsg);
        return;
      }
      if (json.pdfUrl) {
        setDocPreview({ open: true, url: json.pdfUrl, title: 'Акт прийому-передачі (PDF)' });
      }
      if (json.warning) setToastMessage(json.warning);
    } catch (e) {
      setToastMessage(e instanceof Error ? e.message : 'Помилка генерації PDF');
    } finally {
      setUebergabeprotokollPdfLoading(false);
    }
  };

  const handleSaveReservation = async (reservation: ReservationData) => {
      try {
        // Check for overlap with confirmed bookings before creating reservation
        const propertyId = reservation.propertyId || reservation.roomId;
        if (propertyId) {
          // Guard: do not allow reservations over OOO (BLOCK) dates
          if (hasOooBlockOverlap(propertyId, reservation.start, reservation.end)) {
            alert('Apartment is Out Of Order (OOO) for selected dates.');
            return;
          }
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

  const handleAddRequest = async (request: RequestData) => {
      setRequests(prev => [request, ...prev]);
      try {
        const lead = await createLeadFromRequest(request, { origin: 'booking_form' });
        if (lead) {
          setLeads(prev => (prev.some(l => l.id === lead.id) ? prev : [lead, ...prev]));
        }
      } catch (e) {
        console.error('Failed to create lead from request:', e);
      }
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

  const handleDeleteRequest = async (requestId: string) => {
      try {
        await requestsService.delete(requestId);
        setRequests(prev => prev.filter(req => req.id !== requestId));
      } catch (e) {
        console.error('Failed to delete request:', e);
        alert('Не вдалося видалити запит.');
      }
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

  const handleManualLeadCreate = async (input: CreateLeadInput) => {
    const created = await leadsService.create(input);
    setIsCreateLeadModalOpen(false);
    try {
      await loadLeads();
    } catch (reloadErr) {
      console.error('loadLeads after manual create:', reloadErr);
      setLeads((prev) => (prev.some((l) => l.id === created.id) ? prev : [created, ...prev]));
      setToastMessage(
        'Lead created. List refresh failed — the new lead was added locally; try reloading the page if needed.'
      );
      return;
    }
    setToastMessage('Lead created successfully.');
  };

  /**
   * Delete-path note (diagnosis): delete handlers do not use per-flow save locks.
   * If delete "stops working" after a hang, likely causes: (a) error boundary / broken tree from secondary crash,
   * (b) a separate isDeleting-style guard (none on these paths as of audit), (c) unsafe string methods in render.
   */
  const handleDeleteReservation = async (id: number | string) => {
      try {
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
    const row = confirmedBookings.find((b) => String(b.id) === String(bookingId));
    if (row && String(row.type || '').toUpperCase() === 'BLOCK') {
      setToastMessage('OOO / блокування можна змінювати лише в Properties Dashboard (Apartment / Day Matrix).');
      setTimeout(() => setToastMessage(null), 6000);
      return;
    }
    try {
      await bookingsService.delete(bookingId);
      await loadConfirmedBookings();
    } catch (error) {
      console.error('Error deleting booking:', error);
      alert('Не вдалося видалити бронювання. Спробуйте ще раз.');
    }
  };

  const handleCreateBookingFromLead = async (formData: CreateBookingFormData) => {
    if (!clientHistoryLead) return;

    const property = properties.find((p) => String(p.id) === String(formData.propertyId));
    const managementName = property?.management?.name?.trim();
    const internalCompany = managementName && managementName.length > 0 ? managementName : 'Sotiso';

    const checkInDate = new Date(formData.checkIn);
    const checkOutDate = new Date(formData.checkOut);
    const diffMs = checkOutDate.getTime() - checkInDate.getTime();
    const nights =
      diffMs > 0 ? Math.round(diffMs / (1000 * 60 * 60 * 24)) : 0;

    const netTotalRaw = nights * formData.nightlyPrice;
    const netTotal = Number(netTotalRaw.toFixed(2));
    const vatAmount = Number((netTotal * (formData.taxRate / 100)).toFixed(2));
    const grossTotal = Number((netTotal + vatAmount + formData.kaution).toFixed(2));
    const price = `${grossTotal.toFixed(2)} EUR`;
    const dates = `${formData.checkIn} to ${formData.checkOut}`;

    // 1. Create technical reservation first (same payload shape as handleSaveReservation)
    const reservationToSave: Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'> = {
      propertyId: formData.propertyId,
      startDate: formData.checkIn,
      endDate: formData.checkOut,
      status: 'open',
      leadLabel: formData.clientName || clientHistoryLead.name || 'Guest',
      clientFirstName: undefined,
      clientLastName: undefined,
      clientEmail: formData.email,
      clientPhone: formData.phone,
      clientAddress: formData.address,
      guestsCount: 1,
      pricePerNightNet: formData.nightlyPrice,
      taxRate: formData.taxRate ?? 19,
      totalNights: nights,
      totalGross: grossTotal,
    };

    let savedReservation: Reservation;
    try {
      assertNoOooBlockOverlap(formData.propertyId, formData.checkIn, formData.checkOut);
      savedReservation = await reservationsService.create(reservationToSave);
    } catch (err) {
      console.error('Failed to create reservation from booking:', err);
      alert(err instanceof Error ? err.message : 'Failed to create reservation. Please try again.');
      return;
    }

    const reservationId = savedReservation.id;

    const offerNo = await offersService.getNextOfferNo();

    const offerToCreate: Omit<OfferData, 'id'> = {
      offerNo,
      clientName: formData.clientName,
      propertyId: String(formData.propertyId),
      internalCompany,
      price,
      dates,
      status: 'Sent',
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      address: formData.address || undefined,
      checkInTime: undefined,
      checkOutTime: undefined,
      guests: undefined,
      comments: formData.notes || undefined,
      unit: property?.title,
      reservationId,
      clientMessage: undefined,
      nightlyPrice: formData.nightlyPrice,
      taxRate: formData.taxRate,
      nights,
      netTotal,
      vatTotal: vatAmount,
      grossTotal,
      kaution: formData.kaution,
      leadId: clientHistoryLead.id,
    };

    try {
      assertNoOooBlockOverlap(String(offerToCreate.propertyId), String(formData.checkIn), String(formData.checkOut));
      const savedOffer = await offersService.create(offerToCreate);
      setOffers((prev) => [savedOffer, ...prev]);
      setClientHistoryLead(null);
      setSalesTab('offers');
      setToastMessage('Offer created from booking.');
      setCreatedOfferId(savedOffer.id);
    } catch (err) {
      console.error('Failed to create offer from booking:', err);
      alert(err instanceof Error ? err.message : 'Failed to create offer from booking. Please try again.');
      return;
    }
  };

  /** Calendar direct-booking: server command creates reservation + offer (auth + idempotency on API). */
  const handleSaveDirectBookingFromCalendar = async (draft: MultiApartmentOfferDraft) => {
    if (directBookingSaveInProgressRef.current) {
      return;
    }
    directBookingSaveInProgressRef.current = true;
    const traceId = directBookingIdempotencyKeyRef.current || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `db-${Date.now()}`);
    if (!directBookingIdempotencyKeyRef.current) directBookingIdempotencyKeyRef.current = traceId;
    try {
      if (!draft.apartments.length) {
        alert('No apartment in draft.');
        return;
      }
      const apartment = draft.apartments[0];
      // Guard: do not allow direct booking over OOO (BLOCK) dates
      assertNoOooBlockOverlap(apartment.propertyId, draft.shared.checkIn, draft.shared.checkOut);
      const property = properties.find((p) => String(p.id) === String(apartment.propertyId));
      const managementName = property?.management?.name?.trim();
      const internalCompany = managementName && managementName.length > 0 ? managementName : 'Sotiso';
      const leadLabel =
        draft.shared.clientType === 'Company'
          ? (draft.shared.companyName || '').trim() || 'Guest'
          : `${(draft.shared.firstName || '').trim()} ${(draft.shared.lastName || '').trim()}`.trim() || 'Guest';

      const { offer: savedOffer } = await commandPostJson<{ offer: OfferData; reservationId: string }>(
        '/api/commands/create-direct-booking',
        {
          draft,
          propertyTitle: property?.title,
          internalCompanyFallback: internalCompany,
        },
        { idempotencyKey: traceId }
      );

      directBookingIdempotencyKeyRef.current = null;
      setOffers((prev) => [savedOffer, ...prev]);
      setCreatedOfferId(savedOffer.id);
      const baseUrl = getMarketplaceBaseUrl();
      const messageBody = buildMultiApartmentClientMessage({
        clientLabel: leadLabel,
        internalCompany,
        checkIn: draft.shared.checkIn,
        checkOut: draft.shared.checkOut,
        apartments: draft.apartments,
        marketplaceBaseUrl: baseUrl,
      });
      sendChannelResultPrefixRef.current = 'Offer';
      sendChannelOnCloseRef.current = () => {
        offerModalCloseRef.current?.();
        setSalesTab('offers');
      };
      setSendChannelPayload({
        messageBody,
        documentLink: undefined,
        subject: 'Offer',
        recipientEmail: draft.shared.email?.trim() || undefined,
        recipientPhone: draft.shared.phone?.trim() || undefined,
      });
      setToastMessage('Booking created from calendar.');
      setTimeout(() => {
        loadReservations().catch((e) => console.error('[AccountDashboard] loadReservations after direct booking', e));
      }, 0);
    } catch (err) {
      console.error('[AccountDashboard] handleSaveDirectBookingFromCalendar', err);
      const msg =
        err instanceof CommandClientError ? err.message : err instanceof Error ? err.message : String(err);
      alert(`Failed to create booking: ${msg}`);
    } finally {
      directBookingSaveInProgressRef.current = false;
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
      setOfferToEdit(offer);
      const payload = buildOfferViewPayload(offer, offers, properties);
      setOfferViewData(payload);
      setIsOfferViewModalOpen(true);
  };

  const openMultiOfferDetails = async (offerHeaderId: string) => {
    const existingHeader = offerHeaders.find((header) => header.id === offerHeaderId);
    const header = existingHeader || await offerHeadersService.getById(offerHeaderId);
    if (!header) return;
    const items = await offerItemsService.getByHeaderId(offerHeaderId);
    setSelectedMultiOfferHeader(header);
    setSelectedMultiOfferItems(items);
    setIsMultiOfferDetailsOpen(true);
  };

  /** Multi-apartment offer group: server command (auth + idempotency). Lead follow-up stays client-side. */
  const handleSaveMultiApartmentOffer = async (
    draft: MultiApartmentOfferDraft,
    mode: 'draft' | 'send'
  ) => {
    if (multiOfferSaveInProgressRef.current) {
      return;
    }
    multiOfferSaveInProgressRef.current = true;
    const traceId = multiOfferIdempotencyKeyRef.current || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ma-${Date.now()}`);
    if (!multiOfferIdempotencyKeyRef.current) multiOfferIdempotencyKeyRef.current = traceId;
    try {
      // Guard: do not allow creating multi-apartment offers over OOO (BLOCK) dates
      for (const apt of draft.apartments || []) {
        assertNoOooBlockOverlap(apt.propertyId, draft.shared.checkIn, draft.shared.checkOut);
      }
      const { offers: created, leadId } = await commandPostJson<{ offers: OfferData[]; reservationIds: string[]; leadId: string | null }>(
        '/api/commands/create-multi-offer',
        { draft, mode },
        { idempotencyKey: traceId }
      );

      multiOfferIdempotencyKeyRef.current = null;

      if (leadId) {
        setTimeout(() => {
          leadsService.getAll().then(setLeads).catch((e) => console.error('[AccountDashboard] refresh leads after multi-offer', e));
        }, 0);
      }

      setOffers((prev) => {
        const ids = new Set(created.map((o) => o.id));
        return [...created, ...prev.filter((o) => !ids.has(o.id))];
      });
      setTimeout(() => {
        loadReservations().catch((e) => console.error('[AccountDashboard] loadReservations after multi-offer', e));
        offersService.getAll().then(setOffers).catch((e) => console.error('[AccountDashboard] getAll offers after multi-offer', e));
      }, 0);
      if (mode === 'send') {
        const first = created[0];
        sendChannelResultPrefixRef.current = 'Offer';
        sendChannelOnCloseRef.current = () => {
          offerModalCloseRef.current?.();
          setSalesTab('offers');
        };
        setSendChannelPayload({
          messageBody: first?.clientMessage ?? '',
          documentLink: undefined,
          subject: 'Offer',
          recipientEmail: draft.shared.email?.trim() || undefined,
          recipientPhone: draft.shared.phone?.trim() || undefined,
        });
      } else {
        setSalesTab('offers');
      }
    } catch (error) {
      console.error('[AccountDashboard] handleSaveMultiApartmentOffer catch', { traceId, error });
      const msg =
        error instanceof CommandClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      setToastMessage(`Failed to save offer: ${msg}`);
      throw error;
    } finally {
      multiOfferSaveInProgressRef.current = false;
    }
  };

  const handleSelectMultiOfferItem = async (item: OfferItemData) => {
    const siblingItems = offerItems.filter((candidate) => candidate.offerHeaderId === item.offerHeaderId);
    await Promise.all(
      siblingItems
        .filter((candidate) => candidate.status === 'Selected' && candidate.id !== item.id)
        .map((candidate) =>
          offerItemsService.update(candidate.id, { status: 'Offered', selectedAt: null })
        )
    );
    await offerItemsService.update(item.id, {
      status: 'Selected',
      selectedAt: new Date().toISOString(),
    });
    await refreshMultiApartmentOffers();
    const refreshedItems = await offerItemsService.getByHeaderId(item.offerHeaderId);
    setSelectedMultiOfferItems(refreshedItems);
  };

  const ensureLegacyOfferForItem = async (item: OfferItemData) => {
    const header = offerHeaders.find((candidate) => candidate.id === item.offerHeaderId)
      || await offerHeadersService.getById(item.offerHeaderId);
    if (!header) {
      throw new Error('Offer header not found.');
    }

    let reservationId = item.reservationId || null;
    if (!reservationId) {
      // Guard: do not allow reservation creation over OOO (BLOCK) dates
      assertNoOooBlockOverlap(item.propertyId, header.startDate, header.endDate);
      const createdReservation = await reservationsService.create({
        propertyId: item.propertyId,
        startDate: header.startDate,
        endDate: header.endDate,
        status: 'offered',
        leadLabel: header.clientName,
        clientFirstName: header.firstName,
        clientLastName: header.lastName,
        clientEmail: header.email,
        clientPhone: header.phone,
        clientAddress: header.address,
        guestsCount: 1,
        pricePerNightNet: item.nightlyPrice,
        taxRate: item.taxRate,
        totalNights: item.nights,
        totalGross: item.grossTotal,
      });
      reservationId = createdReservation.id;
    }

    let legacyOffer = item.legacyOfferId
      ? offers.find((offer) => offer.id === item.legacyOfferId) || null
      : null;

    if (!legacyOffer) {
      // Guard: do not allow offer creation over OOO (BLOCK) dates
      assertNoOooBlockOverlap(item.propertyId, header.startDate, header.endDate);
      legacyOffer = await offersService.create({
        offerNo: header.offerNo,
        clientName: header.clientName,
        propertyId: item.propertyId,
        internalCompany: header.internalCompany,
        price: `${item.grossTotal.toFixed(2)} EUR`,
        dates: `${header.startDate} to ${header.endDate}`,
        status: header.status === 'Draft' ? 'Draft' : 'Sent',
        guests: '1 Guest',
        email: header.email,
        phone: header.phone,
        address: header.address,
        unit: item.apartmentCode,
        clientMessage: header.clientMessage,
        reservationId: reservationId || undefined,
      });
      setOffers((prev) => [legacyOffer as OfferData, ...prev]);
    }

    const updatedItem = await offerItemsService.update(item.id, {
      reservationId,
      legacyOfferId: legacyOffer.id,
    });

    await refreshMultiApartmentOffers();
    return { header, item: updatedItem, legacyOffer };
  };

  const handleAddProformaFromMultiOfferItem = async (item: OfferItemData) => {
    const { item: updatedItem, legacyOffer } = await ensureLegacyOfferForItem(item);
    setPendingOfferItemForInvoice(updatedItem);
    setSelectedOfferForInvoice(legacyOffer);
    setSelectedInvoice(null);
    setSelectedProformaForInvoice(null);
    setIsInvoiceModalOpen(true);
  };

  const handleDeleteMultiOfferHeader = async (offerHeaderId: string) => {
    if (!window.confirm('Delete this multi-apartment offer and all its items?')) return;
    await offerHeadersService.delete(offerHeaderId);
    if (selectedMultiOfferHeader?.id === offerHeaderId) {
      setIsMultiOfferDetailsOpen(false);
      setSelectedMultiOfferHeader(null);
      setSelectedMultiOfferItems([]);
    }
    await refreshMultiApartmentOffers();
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
        // Guard: do not allow offer save over OOO (BLOCK) dates
        const propertyId = String(updatedOffer.propertyId ?? '').trim();
        const datesStr = String((updatedOffer as any).dates ?? '').trim();
        if (propertyId && datesStr) {
          const [sRaw, eRaw] = datesStr.split(/\s+to\s+/);
          const start = (sRaw ?? '').slice(0, 10);
          const end = (eRaw ?? '').slice(0, 10);
          if (start && end) {
            assertNoOooBlockOverlap(propertyId, start, end);
          }
        }

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
          assertNoOooBlockOverlap(propertyId, selectedReservation.start, selectedReservation.end);
          
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
          
          setCreatedOfferId(savedOffer.id);
          if (status === 'Sent') {
              sendChannelResultPrefixRef.current = 'Offer';
              sendChannelOnCloseRef.current = () => {
                  closeManageModals();
                  setSalesTab('offers');
              };
              setSendChannelPayload({
                  messageBody: savedOffer.clientMessage ?? '',
                  documentLink: undefined,
                  subject: 'Offer',
                  recipientEmail: savedOffer.email ?? undefined,
                  recipientPhone: savedOffer.phone ?? undefined,
              });
          } else {
              closeManageModals();
              setSalesTab('offers');
          }
      } catch (error) {
          console.error('Error creating offer:', error);
          alert(error instanceof Error ? error.message : 'Failed to save offer to database. Please try again.');
      }
  };
  
  const handleSendOffer = async () => {
      if (!selectedReservation) return;
      
      try {
          assertNoOooBlockOverlap(selectedReservation.propertyId || selectedReservation.roomId, selectedReservation.start, selectedReservation.end);
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
          
          setOffers(prev => [savedOffer, ...prev]);
          await updateReservationInDB(selectedReservation.id, { status: 'offered' as any });

          sendChannelResultPrefixRef.current = 'Offer';
          sendChannelOnCloseRef.current = () => {
              closeManageModals();
              setSalesTab('offers');
          };
          setSendChannelPayload({
              messageBody: savedOffer.clientMessage ?? '',
              documentLink: undefined,
              subject: 'Offer',
              recipientEmail: savedOffer.email ?? undefined,
              recipientPhone: savedOffer.phone ?? undefined,
          });
      } catch (error) {
          console.error('Error creating offer:', error);
          alert(error instanceof Error ? error.message : 'Failed to save offer to database. Please try again.');
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

  const refreshInvoicedTotals = useCallback(async () => {
    try {
      const childInvoices = await invoicesService.getInvoices();
      const byProforma: Record<string, number> = {};
      childInvoices.forEach((inv) => {
        const pid = inv.proformaId;
        if (pid) {
          const gross = inv.totalGross ?? 0;
          byProforma[pid] = (byProforma[pid] ?? 0) + gross;
        }
      });
      setInvoicedTotalByProformaId(byProforma);
    } catch (e) {
      console.error('Error refreshing invoiced totals:', e);
    }
  }, []);

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
      await refreshInvoicedTotals();
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
      await refreshInvoicedTotals();
    } catch (e) {
      console.error('Error deleting invoice:', e);
      alert('Не вдалося видалити інвойс.');
    }
  };

  /** Single server path for confirming proforma payment (no client-side RPC). */
  const confirmProformaPaymentViaCommand = async (
    proformaId: string,
    options?: { existingProofId?: string; documentNumber?: string }
  ): Promise<string> => {
    const idemKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cp-dash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fd = new FormData();
    fd.append('proformaId', proformaId);
    if (options?.documentNumber?.trim()) fd.append('documentNumber', options.documentNumber.trim());
    if (options?.existingProofId) fd.append('existingProofId', options.existingProofId);
    const { bookingId } = await commandPostFormData<{ bookingId: string; proofId: string }>(
      '/api/commands/confirm-payment',
      fd,
      { idempotencyKey: idemKey }
    );
    return bookingId;
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
    await refreshMultiApartmentOffers();
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
      await confirmProformaPaymentViaCommand(proforma.id, { existingProofId: proof.id });
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
      const newBookingId = await confirmProformaPaymentViaCommand(proforma.id);
      await refreshDataAfterPaymentConfirmed(newBookingId);
      alert('Оплату підтверджено. Створено підтверджене бронювання.');
    } catch (e: any) {
      console.error('Error confirming proforma payment:', e);
      alert(`Не вдалося підтвердити оплату: ${e.message || 'невідома помилка'}`);
    }
  };
  
  /** Invoice/proforma persist + PDF upload via server command (per-flow lock, idempotent). */
  const handleSaveInvoice = async (invoice: InvoiceData, mode?: 'save' | 'send', pdfFile?: File | null) => {
      if (invoiceSaveInProgressRef.current) {
        return;
      }
      invoiceSaveInProgressRef.current = true;
      const traceId = invoiceIdempotencyKeyRef.current || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `inv-${Date.now()}`);
      if (!invoiceIdempotencyKeyRef.current) invoiceIdempotencyKeyRef.current = traceId;
      try {
        const offerItemId = pendingOfferItemForInvoice?.id;
        let savedInvoice: InvoiceData;
        if (pdfFile) {
          const fd = new FormData();
          fd.append('invoice', JSON.stringify(invoice));
          fd.append('mode', mode || 'save');
          if (offerItemId) fd.append('offerItemId', offerItemId);
          fd.append('file', pdfFile, pdfFile.name);
          const res = await commandPostFormData<{ savedInvoice: InvoiceData }>(
            '/api/commands/save-invoice',
            fd,
            { idempotencyKey: traceId }
          );
          savedInvoice = res.savedInvoice;
        } else {
          const res = await commandPostJson<{ savedInvoice: InvoiceData }>(
            '/api/commands/save-invoice',
            { invoice, mode: mode || 'save', offerItemId },
            { idempotencyKey: traceId }
          );
          savedInvoice = res.savedInvoice;
        }
        invoiceIdempotencyKeyRef.current = null;

        const priorListed = invoices.some((inv) => inv.id === savedInvoice.id);
        if (priorListed) {
          setInvoices((prev) => prev.map((inv) => (inv.id === savedInvoice.id ? savedInvoice : inv)));
        } else {
          setInvoices((prev) => [savedInvoice, ...prev]);
        }
        
        if (invoice.offerIdSource) {
            setOffers(prev => prev.map(o => 
                o.id === invoice.offerIdSource || String(o.id) === String(invoice.offerIdSource)
                    ? { ...o, status: 'Invoiced' }
                    : o
            ));
        }

        if (pendingOfferItemForInvoice && savedInvoice.documentType === 'proforma') {
          setTimeout(() => {
            refreshMultiApartmentOffers().catch((e) => console.error('[AccountDashboard] refresh multi-offers after invoice', e));
          }, 0);
        }

        if (invoice.bookingId) {
          setTimeout(() => {
            loadReservations().catch((e) => console.error('[AccountDashboard] loadReservations after invoice save', e));
          }, 0);
        }
        
        const isProformaSend = mode === 'send' && savedInvoice.documentType === 'proforma' && !invoice.proformaId;
        if (isProformaSend) {
          const offerId = savedInvoice.offerIdSource ?? savedInvoice.offerId;
          const linkedOffer = offerId ? offers.find(o => o.id === offerId || String(o.id) === String(offerId)) : null;
          const recipientEmail = linkedOffer?.email?.trim() || undefined;
          const recipientPhone = linkedOffer?.phone?.trim() || undefined;
          const baseUrl = getMarketplaceBaseUrl().replace(/\/+$/, '');
          const brandedLink = `${baseUrl}/p/${savedInvoice.invoiceNumber}`;
          const fullName = (savedInvoice.clientName || linkedOffer?.clientName || '').trim();
          const formatIsoToDdMmYyyy = (iso: string) => {
            const s = iso.trim().slice(0, 10);
            const parts = s.split('-');
            if (parts.length !== 3) return s;
            const [y, m, day] = parts;
            if (!y || !m || !day) return s;
            return `${String(day).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
          };
          const requestedStayLine = (() => {
            const d = linkedOffer?.dates?.trim();
            if (!d) return '—';
            const parts = d.split(/\s+to\s+/i).map((s) => s.trim());
            if (parts.length < 2) return '—';
            return `${formatIsoToDdMmYyyy(parts[0])} – ${formatIsoToDdMmYyyy(parts[1])}`;
          })();
          const pid = linkedOffer?.propertyId != null ? String(linkedOffer.propertyId).trim() : '';
          const linkedProperty = pid ? properties.find((p) => String(p.id) === pid) : undefined;
          const area =
            linkedProperty != null
              ? Number(linkedProperty.details?.area ?? linkedProperty.area ?? 0) || 0
              : 0;
          const rooms = linkedProperty != null ? getRoomsCount(linkedProperty) : 0;
          const beds =
            linkedProperty != null && linkedProperty.details?.beds != null
              ? Number(linkedProperty.details.beds) || 0
              : 0;
          const netStr =
            savedInvoice.totalNet != null && Number.isFinite(Number(savedInvoice.totalNet))
              ? Number(savedInvoice.totalNet).toFixed(2)
              : '0.00';
          const vatStr =
            savedInvoice.taxAmount != null && Number.isFinite(Number(savedInvoice.taxAmount))
              ? Number(savedInvoice.taxAmount).toFixed(2)
              : '0.00';
          const grossStr =
            savedInvoice.totalGross != null && Number.isFinite(Number(savedInvoice.totalGross))
              ? Number(savedInvoice.totalGross).toFixed(2)
              : '0.00';
          const depositStr =
            linkedOffer?.kaution != null && Number.isFinite(Number(linkedOffer.kaution))
              ? Number(linkedOffer.kaution).toFixed(2)
              : '0.00';
          const greetingBlock = fullName
            ? `Hello ${fullName},\n\nthank you for your request.`
            : `Hello,\n\nthank you for your request.`;
          const messageBody = `${greetingBlock}

Please find your proforma invoice for the following stay:

Requested stay: ${requestedStayLine}

Total area: ${area} m²
Total rooms: ${rooms}
Total beds: ${beds}

Total: Net ${netStr} € · VAT ${vatStr} € · Kaution ${depositStr} € · Gross ${grossStr} €

You can view and download the proforma invoice here:
${brandedLink}

Please review the document and let us know if everything is correct.

Best regards,
Hero Rooms Team`;
          sendChannelResultPrefixRef.current = 'Proforma';
          sendChannelOnCloseRef.current = () => {
            setIsInvoiceModalOpen(false);
            setSelectedOfferForInvoice(null);
            setSelectedInvoice(null);
            setSelectedProformaForInvoice(null);
            setPendingOfferItemForInvoice(null);
            setActiveDepartment('sales');
            setSalesTab('proformas');
            setProformas(prev => [savedInvoice, ...prev]);
          };
          setSendChannelPayload({
            messageBody,
            documentLink: undefined,
            subject: `Proforma Invoice ${savedInvoice.invoiceNumber}`,
            recipientEmail,
            recipientPhone,
          });
        } else {
          setIsInvoiceModalOpen(false);
          setSelectedOfferForInvoice(null);
          setSelectedInvoice(null);
          setSelectedProformaForInvoice(null);
          setPendingOfferItemForInvoice(null);
          if (invoice.documentType === 'invoice' && invoice.proformaId) {
            setActiveDepartment('sales');
            setSalesTab('proformas');
            setProformaChildInvoices(prev => ({
              ...prev,
              [invoice.proformaId!]: [savedInvoice, ...(prev[invoice.proformaId!] ?? [])],
            }));
            setTimeout(() => {
              refreshInvoicedTotals().catch((e) => console.error('[AccountDashboard] refreshInvoicedTotals', e));
            }, 0);
          } else if (savedInvoice.documentType === 'proforma' && !invoice.proformaId) {
            setActiveDepartment('sales');
            setSalesTab('proformas');
            setProformas(prev => [savedInvoice, ...prev]);
          } else {
            setActiveDepartment('accounting');
            setAccountingTab('invoices');
          }
        }
      } catch (error: unknown) {
        console.error('[AccountDashboard] handleSaveInvoice catch', { traceId, error });
        const errorMessage =
          error instanceof CommandClientError
            ? error.message
            : (error as { message?: string; code?: string })?.message ||
              (error as { code?: string })?.code ||
              'Unknown error';
        alert(`Failed to save invoice: ${errorMessage}. Please try again.`);
      } finally {
        invoiceSaveInProgressRef.current = false;
      }
  };

  const toggleInvoiceStatus = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) {
      return;
    }
    
    const newStatus = invoice.status === 'Paid' ? 'Unpaid' : 'Paid';
    try {
      // Mark paid: single server command (same path as ConfirmPaymentModal / quick confirm)
      if (newStatus === 'Paid' && invoice.status !== 'Paid') {
        const offerId = invoice.offerId || invoice.offerIdSource;
        if (!offerId) {
          alert('Invoice must be linked to an offer to mark as paid. Please create invoice from an offer.');
          return;
        }
        try {
          const bookingId = await confirmProformaPaymentViaCommand(invoiceId);
          await refreshDataAfterPaymentConfirmed(bookingId);
          alert('Invoice marked as paid. Confirmed booking created. Competing reservations marked as lost.');
          return;
        } catch (rpcError: unknown) {
          const msg = rpcError instanceof Error ? rpcError.message : String(rpcError);
          console.error('Error confirming payment via command:', rpcError);
          alert(`Failed to confirm booking: ${msg || 'Unknown error'}`);
          return;
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
              if (linkedOffer) {
                  // Конвертувати offer в booking для створення тасок
                  const [start, end] = String(linkedOffer.dates ?? '').split(' to ');
                  
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
              } else {
              }
          }
          
          if (linkedBooking) {
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
              // Створити Facility tasks тільки якщо вони ще не існують
              if (!hasEinzugTask || !hasAuszugTask) {
                  // Отримати назву нерухомості
                  const property = properties.find(p => p.id === linkedBooking.roomId || String(p.id) === String(linkedBooking.roomId));
                  const propertyName = property?.title || property?.address || linkedBooking.address || linkedBooking.roomId;
                  const tasks = createFacilityTasksForBooking(linkedBooking, propertyName);
                  // Фільтрувати таски які вже існують
                  const newTasks = tasks.filter(task => 
                      (task.type === 'Einzug' && !hasEinzugTask) ||
                      (task.type === 'Auszug' && !hasAuszugTask)
                  );
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
                      } catch (error: any) {
                          console.error('❌ Error creating Facility task in database:', error);
                      }
                  }
                  
                  if (savedTasks.length > 0) {
                      setAdminEvents(prevEvents => [...prevEvents, ...savedTasks]);
                      // Notify other components and reload tasks from database
                      window.dispatchEvent(new CustomEvent('taskUpdated'));
                  } else {
                      console.warn('⚠️ No tasks were created. Check if tasks already exist or if there was an error.');
                      console.warn('hasEinzugTask:', hasEinzugTask, 'hasAuszugTask:', hasAuszugTask, 'newTasksCount:', newTasks.length);
                  }
              } else {
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
      console.error('Error updating invoice status:', error);
      alert('Failed to update invoice status. Please try again.');
    }
  };

  const handleAdminEventAdd = (event: CalendarEvent) => {
      setAdminEvents(prev => [...prev, event]);
  };

  const handleAdminEventUpdate = async (updatedEvent: CalendarEvent) => {
      // Transfer verify: finalize BEFORE persisting verified; minimal PATCH on success; on failure toast + log, do not set verified
      if (updatedEvent.status === 'verified' && updatedEvent.description) {
        try {
          const parsed = JSON.parse(updatedEvent.description);
          if (parsed?.action === 'transfer_inventory' && parsed?.transferData && !parsed?.transferExecuted) {
            try {
              await executeInventoryTransfer(parsed, updatedEvent);
            } catch (finalizeErr: any) {
              const errMsg = finalizeErr?.message ?? String(finalizeErr);
              console.error('❌ Finalize inventory transfer failed', { task_id: updatedEvent.id, error: errMsg });
              setToastMessage(errMsg || 'Transfer finalization failed. Please try again.');
              return;
            }
            parsed.transferExecuted = true;
            const patchPayload = {
              status: 'verified' as const,
              description: JSON.stringify(parsed),
              date: updatedEvent.date,
              day: updatedEvent.day,
            };
            const savedTask = await tasksService.update(updatedEvent.id, patchPayload);
            setAdminEvents(prev => prev.map(ev => (ev.id === updatedEvent.id ? { ...ev, ...savedTask } : ev)));
            window.dispatchEvent(new CustomEvent('taskUpdated'));
            return;
          }
        } catch (_) { /* not JSON or not transfer */ }
      }
      // CRITICAL: Update local state FIRST to prevent task disappearing from calendar
      // This ensures the task remains visible immediately, even before DB update completes
      setAdminEvents(prev => {
        const updated = prev.map(ev => {
          // Only update the exact task that was changed; MERGE so partial updatedEvent never wipes existing fields
          if (ev.id === updatedEvent.id) {
            return { ...ev, ...updatedEvent };
          }
          // Do NOT modify other tasks, even if they have the same bookingId
          return ev;
        });
        return updated;
      });
      
      const taskBeforeUpdate = adminEvents.find(ev => ev.id === updatedEvent.id);

      try {
          // Minimal PATCH: assignee always; status/date/day only when changed (bulletproof, no accidental overwrites)
          const patchPayload: Partial<CalendarEvent> = {
            workerId: updatedEvent.workerId,
            assignedWorkerId: updatedEvent.assignedWorkerId ?? updatedEvent.workerId,
            assignee: updatedEvent.assignee,
          };
          if (taskBeforeUpdate && updatedEvent.status !== taskBeforeUpdate.status) {
            patchPayload.status = updatedEvent.status;
          }
          if (taskBeforeUpdate && (updatedEvent.date !== taskBeforeUpdate.date || updatedEvent.day !== taskBeforeUpdate.day)) {
            patchPayload.date = updatedEvent.date;
            patchPayload.day = updatedEvent.day;
          }
          await tasksService.update(updatedEvent.id, patchPayload);
          // Notify other components (Kanban) about task update
          // NOTE: We do NOT reload tasks here to prevent race condition
          // The local state is already updated above, and Kanban will reload on its own
          window.dispatchEvent(new CustomEvent('taskUpdated'));
      } catch (error: any) {
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
      
      // Task-derived meterLog: tile now uses manual property_meter_readings. Kept for possible future use.
      const METER_LOG_FROM_TASKS = false;
      if (METER_LOG_FROM_TASKS) {
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
      }

      // Automatically add Tenant and Rental Agreement when 'Einzug' is Archived
      if (updatedEvent.status === 'archived' && updatedEvent.type === 'Einzug') {
          const linkedOffer = offers.find(o => {
              const [start] = String(o.dates ?? '').split(' to ');
              return o.propertyId === updatedEvent.propertyId && start === updatedEvent.date;
          });

          if (linkedOffer) {
              setProperties(prevProps => prevProps.map(prop => {
                  if (prop.id === updatedEvent.propertyId) {
                      const [start, end] = String(linkedOffer.dates ?? '').split(' to ');
                      const priceStr = String(linkedOffer.price ?? '');
                      const rentVal = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
                      const newTenant = {
                          name: linkedOffer.clientName, phone: linkedOffer.phone || '-', email: linkedOffer.email || '-',
                          rent: rentVal, deposit: 0, startDate: start,
                          km: rentVal, bk: 0, hk: 0
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
    if (isLoadingProperties && properties.length === 0) {
      return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#111315]" aria-busy="true">
          <div className="w-full md:w-[350px] flex-shrink-0 border-r border-gray-800 p-4 space-y-3 bg-[#161B22] animate-pulse">
            <div className="h-10 rounded-lg bg-gray-800/60" />
            <div className="h-9 rounded-lg bg-gray-800/60" />
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="h-9 flex-1 rounded-md bg-gray-800/60" />
              <div className="h-9 flex-1 rounded-md bg-gray-800/60" />
            </div>
            <div className="flex gap-2 rounded-lg border border-gray-800/80 p-0.5">
              <div className="h-8 flex-1 rounded-md bg-gray-800/60" />
              <div className="h-8 flex-1 rounded-md bg-gray-800/60" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-800/60" />
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0D1117] animate-pulse">
            <div className="h-64 rounded-xl bg-gray-800/60 mb-8" />
            <div className="space-y-6">
              <div className="h-32 rounded-xl bg-gray-800/60" />
              <div className="h-48 rounded-xl bg-gray-800/60" />
              <div className="h-40 rounded-xl bg-gray-800/60" />
            </div>
          </div>
        </div>
      );
    }
    const showEmptyActive = archiveFilter === 'active' && displayedProperties.length === 0;
    const expense =
      !selectedProperty || showEmptyActive
        ? { mortgage: 0, management: 0, taxIns: 0, reserve: 0 }
        : selectedProperty.ownerExpense || { mortgage: 0, management: 0, taxIns: 0, reserve: 0 };
    const totalExpense = expense.mortgage + expense.management + expense.taxIns + expense.reserve;
    const totalInventoryCost = propertyInventoryItems.reduce((acc, item) => {
      const unitPrice = item.unit_price ?? 0;
      const qty = Number(item.quantity) || 0;
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
            <div className="relative mb-3">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
               <input
                 id="property-search"
                 name="property-search"
                 type="text"
                 value={propertySearch}
                 onChange={(e) => setPropertySearch(e.target.value)}
                 placeholder="Search street, unit, city…"
                 aria-label="Search properties"
                 className="w-full bg-[#0D1117] border border-gray-700 rounded-lg py-2 pl-9 text-sm text-white focus:border-emerald-500 outline-none"
               />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
               <label className="sr-only" htmlFor="property-group-filter">Apartment group</label>
               <select
                 id="property-group-filter"
                 value={propertyGroupFilter}
                 onChange={(e) => setPropertyGroupFilter(e.target.value)}
                 aria-label="Filter by apartment group"
                 className="w-full min-w-0 flex-1 bg-[#0D1117] border border-gray-700 rounded-lg py-2 px-2 text-sm text-white focus:border-emerald-500 outline-none"
               >
                 <option value="all">All groups</option>
                 {apartmentGroupsSortedByName.map((ag) => (
                   <option key={ag.id} value={ag.id}>{ag.name}</option>
                 ))}
               </select>
               <label className="sr-only" htmlFor="property-list-sort">Sort</label>
               <select
                 id="property-list-sort"
                 value={propertyListSort}
                 onChange={(e) => setPropertyListSort(e.target.value as 'asc' | 'desc')}
                 aria-label="Sort property list"
                 className="w-full min-w-0 flex-1 bg-[#0D1117] border border-gray-700 rounded-lg py-2 px-2 text-sm text-white focus:border-emerald-500 outline-none"
               >
                 <option value="asc">A → Z</option>
                 <option value="desc">Z → A</option>
               </select>
            </div>
            <div className="flex rounded-lg border border-gray-700 p-0.5 mb-3 bg-[#0D1117]">
               <button type="button" onClick={() => setArchiveFilter('active')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${archiveFilter === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>Active</button>
               <button type="button" onClick={() => setArchiveFilter('archived')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${archiveFilter === 'archived' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>Archived</button>
            </div>
            {displayedProperties.map((prop) => {
               const line1 = getPropertyListPrimaryTitle(prop) || '—';
               const subtitle = getPropertyListSubtitleLine(prop);
               const metrics = getPropertyListMetricsLine(prop);
               return (
               <div key={prop.id} className={`cursor-pointer px-3 py-2 rounded-xl border transition-all duration-200 ${selectedPropertyId === prop.id ? 'bg-[#1C1F24] border-l-4 border-l-emerald-500 border-y-transparent border-r-transparent shadow-lg' : 'bg-[#1C1F24] border-gray-800 hover:bg-[#23262b] hover:border-gray-700'}`}>
                  <div onClick={() => { setSelectedPropertyId(prop.id); setPropertyMenuOpenId(null); }} className="block min-w-0">
                     <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                           <h3 className="font-semibold text-white text-sm leading-snug truncate" title={line1}>{line1}</h3>
                           {subtitle ? (
                              <p className="text-xs text-gray-400 truncate mt-0.5 leading-snug" title={subtitle}>{subtitle}</p>
                           ) : null}
                           {metrics ? (
                              <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{metrics}</p>
                           ) : null}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                           {archiveFilter === 'archived' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-600/50 text-gray-400">Archived</span>}
                           {prop.zweckentfremdungFlag && <span className="text-amber-500" title="Zweckentfremdung Hinweis"><AlertTriangle className="w-4 h-4" /></span>}
                           <span className={`text-[10px] px-1.5 py-0.5 rounded ${prop.termStatus === 'green' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{prop.termStatus === 'green' ? 'Active' : 'Expiring'}</span>
                           <button type="button" onClick={(e) => { e.stopPropagation(); setPropertyMenuOpenId(prev => prev === prop.id ? null : prop.id); }} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white" aria-label="Actions"><MoreVertical className="w-4 h-4" /></button>
                        </div>
                     </div>
                  </div>
                  {propertyMenuOpenId === prop.id && (
                     <div className="mt-1.5 pt-1.5 border-t border-gray-700 flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {prop.archivedAt == null ? (
                           <button type="button" onClick={() => { setArchiveModalPropertyId(prop.id); setPropertyMenuOpenId(null); }} className="text-left px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded flex items-center gap-2"><Archive className="w-3.5 h-3.5" /> Archive…</button>
                        ) : (
                           <>
                              <button type="button" onClick={async () => { try { await propertiesService.restoreProperty(prop.id); const data = await propertiesService.getAll(); setProperties(data); setPropertyMenuOpenId(null); } catch (e) { alert(e instanceof Error ? e.message : 'Помилка'); } }} className="text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 rounded flex items-center gap-2"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
                              <button type="button" onClick={() => { setDeleteModalPropertyId(prop.id); setDeleteConfirmInput(''); setPropertyMenuOpenId(null); }} className="text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete permanently…</button>
                           </>
                        )}
                     </div>
                  )}
               </div>
               );
            })}
         </div>

         {/* Right Content - Details */}
         <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#0D1117]">
            {showEmptyActive ? (
              <div className="flex min-h-[240px] flex-1 items-center justify-center text-gray-400">No active properties</div>
            ) : !selectedProperty ? (
              <div className="flex min-h-[240px] flex-1 items-center justify-center text-gray-400">No properties</div>
            ) : (
            <>
            {/* Header */}
            <div className="relative h-64 rounded-xl overflow-hidden mb-8 group">
               {(() => {
                  const headerImageUrl = coverPhotoUrl?.trim() || selectedProperty.image?.trim() || selectedProperty.images?.[0]?.trim() || '';
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
                  <p className="text-lg text-gray-300 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-500" /> {formatPropertyAddress(selectedProperty)}</p>
               </div>
            </div>

            {/* Lease / rental — split into six cards (UI only) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isLeaseRentalCardOpen}
                    aria-controls="lease-rent-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsLeaseRentalCardOpen((open) => !open); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsLeaseRentalCardOpen((open) => !open); } }}
                >
                    <h2 id="lease-rent-card-heading" className="text-2xl font-bold text-white">Оренда квартири</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isLeaseRentalCardOpen}
                            aria-controls="lease-rent-card-body"
                            onClick={() => setIsLeaseRentalCardOpen((open) => !open)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isLeaseRentalCardOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isLeaseRentalCardOpen ? 'rotate-180' : ''}`} />
                        </button>
                    {editingCard1Section === null ? (
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => { setZweckentfremdungSwitchValue(!!selectedProperty?.zweckentfremdungFlag); setZweckentfremdungAddDraft({ datum: '', aktenzeichen: '', bezirksamt: '', note: '' }); setZweckentfremdungModalFile(null); setZweckentfremdungAddError(null); if (selectedProperty?.id) { setZweckentfremdungDocsLoading(true); propertyDocumentsService.listPropertyDocuments(selectedProperty.id).then(list => { setZweckentfremdungDocs(list.filter(d => d.type === 'zweckentfremdung_notice')); }).finally(() => setZweckentfremdungDocsLoading(false)); } setIsZweckentfremdungModalOpen(true); }} className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors" title="Zweckentfremdung — Hinweis/Anzeige wegen Zweckentfremdung">
                                {selectedProperty?.zweckentfremdungFlag ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <Square className="w-5 h-5 text-gray-500" />}
                            </button>
                            <button type="button" onClick={() => startCard1SectionEdit('lease')} aria-label="Редагувати" title="Редагувати" className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors">
                                <Edit className="w-4 h-4 text-gray-200" />
                            </button>
                        </div>
                    ) : null}
                    </div>
                </div>
                {isLeaseRentalCardOpen && (
                <div id="lease-rent-card-body" role="region" aria-labelledby="lease-rent-card-heading" className="space-y-4">
                    {isEditingLeaseCard && card1Draft ? (
                        <>
                            <div className="grid grid-cols-12 gap-4 items-start pb-4 border-b border-gray-700">
                                <div className="col-span-8"><label className="text-xs text-gray-500 block mb-1">Вулиця + номер</label><input value={card1Draft.address} onChange={e => setCard1Draft(d => d ? { ...d, address: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="Вулиця, номер будинку" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Індекс</label><input value={card1Draft.zip} onChange={e => setCard1Draft(d => d ? { ...d, zip: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Місто</label><input value={card1Draft.city} onChange={e => setCard1Draft(d => d ? { ...d, city: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Країна</label><input value={card1Draft.country} onChange={e => setCard1Draft(d => d ? { ...d, country: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Поверх (поточний)</label><input type="number" min={0} value={card1Draft.floor} onChange={e => setCard1Draft(d => d ? { ...d, floor: parseInt(e.target.value || '0', 10) } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Поверх (всього)</label><input type="number" min={0} value={card1Draft.buildingFloors} onChange={e => setCard1Draft(d => d ? { ...d, buildingFloors: parseInt(e.target.value || '0', 10) } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                <div className="col-span-4"><label className="text-xs text-gray-500 block mb-1">Квартира / Код</label><input value={card1Draft.title} onChange={e => setCard1Draft(d => d ? { ...d, title: e.target.value } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                <div className="col-span-4">
                                    <label className="text-xs text-gray-500 block mb-1">Група квартири</label>
                                    <div className="flex gap-2 items-center">
                                        <select value={card1Draft.apartmentGroupId ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, apartmentGroupId: e.target.value === '' ? null : e.target.value } : null)} className="flex-1 min-w-0 bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white focus:border-emerald-500 focus:outline-none">
                                            <option value="">—</option>
                                            {apartmentGroups.map(ag => (<option key={ag.id} value={ag.id}>{ag.name}</option>))}
                                        </select>
                                        <button type="button" onClick={() => { setAddApartmentGroupModalOpen(true); setAddApartmentGroupName(''); setAddApartmentGroupError(null); }} className="shrink-0 px-3 py-2 rounded border border-gray-600 hover:bg-gray-700 text-gray-200 text-sm whitespace-nowrap">+ Додати групу</button>
                                    </div>
                                </div>
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
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => saveCard1Section('lease')} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white">Зберегти</button>
                                <button type="button" onClick={cancelCard1SectionEdit} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800">Скасувати</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4 border-b border-gray-700">
                                <div><span className="text-xs text-gray-500 block mb-1">Адреса</span><span className="text-sm text-white font-bold">{formatPropertyAddress(selectedProperty)}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Поверх / Сторона</span><span className="text-sm text-white">{selectedProperty.details?.floor != null ? `${selectedProperty.details.floor} OG` : '—'} {selectedProperty.details?.buildingFloors != null ? ` / ${selectedProperty.details.buildingFloors} поверхов` : ''}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Квартира / Код</span><span className="text-sm text-white">{selectedProperty.title || '—'}</span></div>
                                <div><span className="text-xs text-gray-500 block mb-1">Група квартири</span><span className="text-sm text-white">{selectedProperty.apartmentGroupName ?? '—'}</span></div>
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
                                <div>
                                  <span className="text-xs text-gray-500 block mb-1">Статус квартири</span>
                                  <span className="text-sm font-medium text-white">
                                    {(() => {
                                      const effective = isPropertyOooToday(selectedProperty.id) ? 'ooo' : (selectedProperty.apartmentStatus ?? 'active');
                                      return effective === 'ooo'
                                        ? 'Out of order'
                                        : effective === 'preparation'
                                          ? 'В підготовці'
                                          : effective === 'rented_worker'
                                            ? 'Здана працівнику'
                                            : 'Активна';
                                    })()}
                                  </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                )}
            </section>
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isCounterpartiesCardOpen}
                    aria-controls="counterparties-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsCounterpartiesCardOpen((open) => !open); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsCounterpartiesCardOpen((open) => !open); } }}
                >
                    <h2 id="counterparties-card-heading" className="text-2xl font-bold text-white">Контрагенти</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isCounterpartiesCardOpen}
                            aria-controls="counterparties-card-body"
                            onClick={() => setIsCounterpartiesCardOpen((open) => !open)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isCounterpartiesCardOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isCounterpartiesCardOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {editingCard1Section === null ? (
                            <button type="button" onClick={() => startCard1SectionEdit('counterparties')} className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors" title="Редагувати">
                                <Edit className="w-4 h-4 text-gray-200" />
                            </button>
                        ) : null}
                    </div>
                </div>
                {isCounterpartiesCardOpen && (
                <div id="counterparties-card-body" role="region" aria-labelledby="counterparties-card-heading" className="space-y-4">
                    {isEditingCounterpartiesCard && card1Draft ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start pb-4 border-b border-gray-700">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Власник (орендодавець)</h3>
                                    <label className="text-xs text-gray-500 block mb-1">Контрагент</label>
                                    <select
                                        className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"
                                        value={counterpartySelectValueContact(card1Draft.landlord, 'owner', addressBookEntries)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === ADDRESS_BOOK_LEGACY_SELECT_VALUE) return;
                                            if (v === '') setCard1Draft((d) => (d ? { ...d, landlord: defaultContactParty() } : null));
                                            else {
                                                const entry = addressBookEntries.find((x) => x.id === v && x.role === 'owner');
                                                if (!entry?.id) return;
                                                setCard1Draft((d) => (d ? { ...d, landlord: contactPartyFromAddressBookEntry(entry) } : null));
                                            }
                                        }}
                                    >
                                        <option value="">Вибрати зі списку</option>
                                        {counterpartySelectValueContact(card1Draft.landlord, 'owner', addressBookEntries) === ADDRESS_BOOK_LEGACY_SELECT_VALUE ? (
                                            <option value={ADDRESS_BOOK_LEGACY_SELECT_VALUE}>Поточний запис (не з Address Book)</option>
                                        ) : null}
                                        {addressBookEntries
                                            .filter((e) => e.role === 'owner' && e.id)
                                            .map((entry) => (
                                                <option key={entry.id} value={entry.id as string}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">1-ша фірма</h3>
                                    <label className="text-xs text-gray-500 block mb-1">Контрагент</label>
                                    <select
                                        className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"
                                        value={counterpartySelectValueTenantLike(card1Draft.tenant, 'company1', addressBookEntries)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === ADDRESS_BOOK_LEGACY_SELECT_VALUE) return;
                                            if (v === '') {
                                                setCard1Draft((d) =>
                                                    d
                                                        ? {
                                                            ...d,
                                                            tenant: {
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
                                                                paymentDayOfMonth: undefined,
                                                            },
                                                        }
                                                        : null
                                                );
                                            } else {
                                                setCard1Draft((d) => {
                                                    if (!d) return null;
                                                    const entry = addressBookEntries.find((x) => x.id === v && x.role === 'company1');
                                                    if (!entry?.id) return d;
                                                    return { ...d, tenant: tenantFromAddressBookEntry(entry, d.tenant as Card1TenantDraft) };
                                                });
                                            }
                                        }}
                                    >
                                        <option value="">Вибрати зі списку</option>
                                        {counterpartySelectValueTenantLike(card1Draft.tenant, 'company1', addressBookEntries) === ADDRESS_BOOK_LEGACY_SELECT_VALUE ? (
                                            <option value={ADDRESS_BOOK_LEGACY_SELECT_VALUE}>Поточний запис (не з Address Book)</option>
                                        ) : null}
                                        {addressBookEntries
                                            .filter((e) => e.role === 'company1' && e.id)
                                            .map((entry) => (
                                                <option key={entry.id} value={entry.id as string}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">2-га фірма</h3>
                                    <label className="text-xs text-gray-500 block mb-1">Контрагент</label>
                                    <select
                                        className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"
                                        value={counterpartySelectValueTenantLike(card1Draft.secondCompany, 'company2', addressBookEntries)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === ADDRESS_BOOK_LEGACY_SELECT_VALUE) return;
                                            if (v === '') setCard1Draft((d) => (d ? { ...d, secondCompany: null } : null));
                                            else {
                                                setCard1Draft((d) => {
                                                    if (!d) return null;
                                                    const entry = addressBookEntries.find((x) => x.id === v && x.role === 'company2');
                                                    if (!entry?.id) return d;
                                                    const base = d.secondCompany ?? emptySecondCompanyDraft();
                                                    return { ...d, secondCompany: tenantFromAddressBookEntry(entry, base) };
                                                });
                                            }
                                        }}
                                    >
                                        <option value="">Вибрати зі списку</option>
                                        {counterpartySelectValueTenantLike(card1Draft.secondCompany, 'company2', addressBookEntries) === ADDRESS_BOOK_LEGACY_SELECT_VALUE ? (
                                            <option value={ADDRESS_BOOK_LEGACY_SELECT_VALUE}>Поточний запис (не з Address Book)</option>
                                        ) : null}
                                        {addressBookEntries
                                            .filter((e) => e.role === 'company2' && e.id)
                                            .map((entry) => (
                                                <option key={entry.id} value={entry.id as string}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Управління</h3>
                                    <label className="text-xs text-gray-500 block mb-1">Контрагент</label>
                                    <select
                                        className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"
                                        value={counterpartySelectValueContact(card1Draft.management, 'management', addressBookEntries)}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === ADDRESS_BOOK_LEGACY_SELECT_VALUE) return;
                                            if (v === '') setCard1Draft((d) => (d ? { ...d, management: defaultContactParty() } : null));
                                            else {
                                                const entry = addressBookEntries.find((x) => x.id === v && x.role === 'management');
                                                if (!entry?.id) return;
                                                setCard1Draft((d) => (d ? { ...d, management: contactPartyFromAddressBookEntry(entry) } : null));
                                            }
                                        }}
                                    >
                                        <option value="">Вибрати зі списку</option>
                                        {counterpartySelectValueContact(card1Draft.management, 'management', addressBookEntries) === ADDRESS_BOOK_LEGACY_SELECT_VALUE ? (
                                            <option value={ADDRESS_BOOK_LEGACY_SELECT_VALUE}>Поточний запис (не з Address Book)</option>
                                        ) : null}
                                        {addressBookEntries
                                            .filter((e) => e.role === 'management' && e.id)
                                            .map((entry) => (
                                                <option key={entry.id} value={entry.id as string}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => saveCard1Section('counterparties')} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white">Зберегти</button>
                                <button type="button" onClick={cancelCard1SectionEdit} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800">Скасувати</button>
                            </div>
                        </>
                    ) : (
                        <>
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
                                                const user = await safeGetUser();
                                                if (!user) throw new Error('Not authenticated');

                                                const list = await addressBookPartiesService.listShared();
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
                        </>
                    )}
                </div>
                )}
            </section>
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isPaymentChainCardOpen}
                    aria-controls="payment-chain-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsPaymentChainCardOpen((open) => !open); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsPaymentChainCardOpen((open) => !open); } }}
                >
                    <h2 id="payment-chain-card-heading" className="text-2xl font-bold text-white">Платіжний ланцюжок</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isPaymentChainCardOpen}
                            aria-controls="payment-chain-card-body"
                            onClick={() => setIsPaymentChainCardOpen((open) => !open)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isPaymentChainCardOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isPaymentChainCardOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>
                {isPaymentChainCardOpen && (
                <div id="payment-chain-card-body" role="region" aria-labelledby="payment-chain-card-heading" className="space-y-4">
                    {editingCard1Section != null ? (
                        <p className="text-sm text-gray-400">Платіжний ланцюжок — тільки перегляд. Щоб редагувати інші дані, використайте «Редагувати» в потрібній картці.</p>
                    ) : (
                        <>
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
                                            <div className="space-y-1 leading-snug">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">ВЛАСНИК (отримує)</div>
                                                <div className="text-xs text-gray-500">Очікуване отримання щомісяця</div>
                                                <div className="text-sm font-semibold text-emerald-400">Отримувач: {paymentChainParties.ownerParty.name}</div>
                                                <div className="text-sm text-gray-400 font-mono">IBAN: {paymentChainParties.ownerParty.iban}</div>
                                            </div>
                                            <div className="mt-2 text-sm text-gray-400">Отримати до (1–31): {paymentTiles.from_company1_to_owner.payByDayOfMonth != null && paymentTiles.from_company1_to_owner.payByDayOfMonth >= 1 && paymentTiles.from_company1_to_owner.payByDayOfMonth <= 31 ? `до ${paymentTiles.from_company1_to_owner.payByDayOfMonth} числа` : '—'}</div>
                                            <div className="mt-1 text-sm font-semibold text-white">Сума (разом): {ownerTotalAuto != null && typeof ownerTotalAuto === 'number' ? `€${Number(ownerTotalAuto).toFixed(2)}` : '—'}</div>
                                            {showPaymentDetails && activeRentRow && (
                                                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                    <div>Kaltmiete: €{(activeRentRow.km ?? 0).toFixed(2)}</div>
                                                    <div>Betriebskosten: €{(activeRentRow.bk ?? 0).toFixed(2)}</div>
                                                    <div>Heizkosten: €{(activeRentRow.hk ?? 0).toFixed(2)}</div>
                                                    <div className="text-emerald-400 font-medium">Warmmiete: €{(activeRentRow.warm ?? 0).toFixed(2)}</div>
                                                </div>
                                            )}
                                            {paymentChainFiles.owner_control.length > 0 && (
                                                <ul className="mt-2 list-none space-y-1 w-full">
                                                    {paymentChainFiles.owner_control.map(f => (
                                                        <li key={f.id} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                                            <span className="truncate flex-1">{f.file_name}</span>
                                                            <button type="button" onClick={() => handlePaymentChainViewFile(f.storage_path)} className="text-emerald-500 hover:text-emerald-400">Переглянути</button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hidden md:flex md:col-span-1 items-center justify-center text-gray-500 pt-8"><ArrowRight className="w-5 h-5 rotate-180" /></div>
                                    <div className="md:col-span-3">
                                        <div className="rounded-lg border border-gray-800 bg-[#0f1113] p-3">
                                            {paymentChainParties.ownerParty.name === '—' ? (
                                                <>
                                                    <div className="text-sm text-gray-500 py-2">Додай власника в Контрагенти</div>
                                                    <button type="button" onClick={() => startCard1SectionEdit('counterparties')} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400">Додати в Контрагенти</button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="space-y-1 leading-snug">
                                                        <div className="text-xs text-gray-400 uppercase tracking-wider">1-ША ФІРМА → ВЛАСНИК</div>
                                                        <div className="text-xs text-gray-500">Платіж щомісяця</div>
                                                        <div className="text-sm text-amber-400 font-medium">Платник: {paymentChainParties.company1Party.name}</div>
                                                        <div className="text-sm font-semibold text-emerald-400">Отримувач: {paymentChainParties.ownerParty.name}</div>
                                                        <div className="text-sm text-gray-400 font-mono">IBAN: {paymentChainParties.ownerParty.iban}</div>
                                                    </div>
                                                    <>
                                                            <div className="mt-2 text-sm text-gray-400">Оплатити до (1–31): {paymentTiles.from_company1_to_owner.payByDayOfMonth != null && paymentTiles.from_company1_to_owner.payByDayOfMonth >= 1 && paymentTiles.from_company1_to_owner.payByDayOfMonth <= 31 ? `до ${paymentTiles.from_company1_to_owner.payByDayOfMonth}-го числа (щомісяця)` : '—'}</div>
                                                            <div className="mt-1 text-sm text-gray-400">Сума (разом): {paymentTiles.from_company1_to_owner.total || '—'}</div>
                                                            {paymentTiles.from_company1_to_owner.description && <div className="text-sm text-gray-400 mt-0.5">Опис: {paymentTiles.from_company1_to_owner.description}</div>}
                                                            {showPaymentDetails && (
                                                                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                                    {['km', 'bk', 'hk'].map(k => (paymentTiles.from_company1_to_owner.breakdown as Record<string, string>)[k] && <div key={k}>{k === 'km' ? 'Kaltmiete' : k === 'bk' ? 'Betriebskosten' : 'Heizkosten'}: {(paymentTiles.from_company1_to_owner.breakdown as Record<string, string>)[k]}</div>)}
                                                                    {!paymentTiles.from_company1_to_owner.breakdown.km && !paymentTiles.from_company1_to_owner.breakdown.bk && !paymentTiles.from_company1_to_owner.breakdown.hk && <div>—</div>}
                                                                </div>
                                                            )}
                                                            {paymentChainFiles.from_company1_to_owner.length > 0 && (
                                                                <ul className="mt-2 list-none space-y-1 w-full">
                                                                    {paymentChainFiles.from_company1_to_owner.map(f => (
                                                                        <li key={f.id} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                                                            <span className="truncate flex-1">{f.file_name}</span>
                                                                            <button type="button" onClick={() => handlePaymentChainViewFile(f.storage_path)} className="text-emerald-500 hover:text-emerald-400">Переглянути</button>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                    </>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hidden md:flex md:col-span-1 items-center justify-center text-gray-500 pt-8"><ArrowRight className="w-5 h-5 rotate-180" /></div>
                                    <div className="md:col-span-3">
                                        <div className="rounded-lg border border-gray-800 bg-[#0f1113] p-3">
                                            {paymentChainParties.company1Party.name === '—' ? (
                                                <>
                                                    <div className="text-sm text-gray-500 py-2">Додай 1-шу фірму в Контрагенти</div>
                                                    <button type="button" onClick={() => startCard1SectionEdit('counterparties')} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400">Додати в Контрагенти</button>
                                                </>
                                            ) : paymentChainParties.company2Party.name === '—' ? (
                                                <>
                                                    <div className="text-sm text-gray-500 py-2">Додай 2-гу фірму в Контрагенти</div>
                                                    <button type="button" onClick={() => startCard1SectionEdit('counterparties')} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400">Додати в Контрагенти</button>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="space-y-1 leading-snug">
                                                        <div className="text-xs text-gray-400 uppercase tracking-wider">2-ГА ФІРМА → 1-ША ФІРМА</div>
                                                        <div className="text-xs text-gray-500">Платіж щомісяця</div>
                                                        <div className="text-sm text-amber-400 font-medium">Платник: {paymentChainParties.company2Party.name}</div>
                                                        <div className="text-sm font-semibold text-emerald-400">Отримувач: {paymentChainParties.company1Party.name}</div>
                                                        <div className="text-sm text-gray-400 font-mono">IBAN: {paymentChainParties.company1Party.iban}</div>
                                                    </div>
                                                    <>
                                                            <div className="mt-2 text-sm text-gray-400">Оплатити до (1–31): {paymentTiles.from_company2_to_company1.payByDayOfMonth != null && paymentTiles.from_company2_to_company1.payByDayOfMonth >= 1 && paymentTiles.from_company2_to_company1.payByDayOfMonth <= 31 ? `до ${paymentTiles.from_company2_to_company1.payByDayOfMonth}-го числа (щомісяця)` : '—'}</div>
                                                            <div className="mt-1 text-sm text-gray-400">Сума (разом): {paymentTiles.from_company2_to_company1.total || '—'}</div>
                                                            {paymentTiles.from_company2_to_company1.description && <div className="text-sm text-gray-400 mt-0.5">Опис: {paymentTiles.from_company2_to_company1.description}</div>}
                                                            {showPaymentDetails && (
                                                                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                                    {['km', 'bk', 'hk'].map(k => (paymentTiles.from_company2_to_company1.breakdown as Record<string, string>)[k] && <div key={k}>{k === 'km' ? 'Kaltmiete' : k === 'bk' ? 'Betriebskosten' : 'Heizkosten'}: {(paymentTiles.from_company2_to_company1.breakdown as Record<string, string>)[k]}</div>)}
                                                                    {!paymentTiles.from_company2_to_company1.breakdown.km && !paymentTiles.from_company2_to_company1.breakdown.bk && !paymentTiles.from_company2_to_company1.breakdown.hk && <div>—</div>}
                                                                </div>
                                                            )}
                                                            {paymentChainFiles.from_company2_to_company1.length > 0 && (
                                                                <ul className="mt-2 list-none space-y-1 w-full">
                                                                    {paymentChainFiles.from_company2_to_company1.map(f => (
                                                                        <li key={f.id} className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                                                            <span className="truncate flex-1">{f.file_name}</span>
                                                                            <button type="button" onClick={() => handlePaymentChainViewFile(f.storage_path)} className="text-emerald-500 hover:text-emerald-400">Переглянути</button>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                    </>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hidden md:block md:col-span-1" />
                                </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                )}
            </section>
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isKautionCardOpen}
                    aria-controls="kaution-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsKautionCardOpen((open) => !open); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsKautionCardOpen((open) => !open); } }}
                >
                    <h2 id="kaution-card-heading" className="text-2xl font-bold text-white">Застава (Kaution)</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isKautionCardOpen}
                            aria-controls="kaution-card-body"
                            onClick={() => setIsKautionCardOpen((open) => !open)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isKautionCardOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isKautionCardOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {editingCard1Section === null ? (
                            <button type="button" onClick={() => startCard1SectionEdit('kaution')} className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors" title="Редагувати">
                                <Edit className="w-4 h-4 text-gray-200" />
                            </button>
                        ) : null}
                    </div>
                </div>
                {isKautionCardOpen && (
                <div id="kaution-card-body" role="region" aria-labelledby="kaution-card-heading" className="space-y-4">
                    {isEditingKautionCard && card1Draft ? (
                        <>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Застава (Kaution)</h3>
                                {(() => {
                                  const def = { amount: 0, status: 'unpaid' as const, returnStatus: 'unpaid' as const, depositType: 'TRANSFER' as const, periodFrom: '', periodTo: '', depositNo: '', issuerCompany: '' };
                                  const base = (d: typeof card1Draft) => d?.deposit ? { ...def, ...d.deposit } : def;
                                  return (
                                    <>
                                      {/* Row 1: Payment — grid 12 + action column */}
                                      <div className="flex items-end gap-4">
                                        <div className="grid flex-1 grid-cols-12 gap-4 items-center min-w-0">
                                          <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Von</label><input type="date" value={card1Draft.deposit?.periodFrom ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), periodFrom: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                          <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Bis</label><input type="date" value={card1Draft.deposit?.periodTo ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), periodTo: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                          <div className="col-span-1"><label className="text-xs text-gray-500 block mb-1">Nr</label><input value={card1Draft.deposit?.depositNo ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), depositNo: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                          <div className="col-span-2 min-w-0"><label className="text-xs text-gray-500 block mb-1">Firma</label><input value={card1Draft.deposit?.issuerCompany ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), issuerCompany: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                          <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Оплачено кому</label><input value={card1Draft.deposit?.paidTo ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), paidTo: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                          <div className="col-span-1"><label className="text-xs text-gray-500 block mb-1">Typ</label><select value={card1Draft.deposit?.depositType ?? 'TRANSFER'} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), depositType: e.target.value as PropertyDeposit['depositType'] } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"><option value="CASH">Bar</option><option value="TRANSFER">ÜW</option><option value="GUARANTEE">BU</option></select></div>
                                          <div className="col-span-1"><label className="text-xs text-gray-500 block mb-1">Сума (€)</label><input type="number" min={0} step={0.01} value={card1Draft.deposit?.amount ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), amount: parseFloat(e.target.value) || 0 } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="0" /></div>
                                          <div className="col-span-1"><label className="text-xs text-gray-500 block mb-1">Статус</label><select value={card1Draft.deposit?.status ?? 'unpaid'} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), status: e.target.value as PropertyDeposit['status'] } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"><option value="unpaid">Не оплачено</option><option value="paid">Оплачено</option></select></div>
                                        </div>
                                        <div className="w-[120px] flex items-center justify-end gap-2 shrink-0">
                                          <button type="button" onClick={() => { setDepositProofType('payment'); setDepositProofFile(null); setDepositProofError(null); setIsDepositProofModalOpen(true); }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати підтвердження оплати"><Plus className="w-4 h-4" /></button>
                                          {kautionProofs.payment ? <button type="button" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.payment!.filePath); setDocPreview({ open: true, url, title: 'Підтвердження оплати застави' }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors" title="Переглянути підтвердження оплати"><FileText className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><FileText className="w-4 h-4" /></button>}
                                          {kautionProofs.payment ? <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { propertyDepositProofsService.delete(kautionProofs.payment!.id).then(() => refreshKautionProofs()).catch((e) => alert(e?.message || 'Помилка видалення')); } }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити підтвердження оплати"><Trash2 className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><Trash2 className="w-4 h-4" /></button>}
                                        </div>
                                      </div>
                                      {/* Row 2: Refund — grid 12 + action column */}
                                      <div className="flex items-end gap-4 mt-4">
                                        <div className="grid flex-1 grid-cols-12 gap-4 items-center min-w-0">
                                          <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Дата повернення</label><input type="date" value={card1Draft.deposit?.returnedAt ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), returnedAt: e.target.value } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                          <div className="col-span-6"><label className="text-xs text-gray-500 block mb-1">Повернув хто / від кого</label><input value="" readOnly className="w-full bg-[#0D1117] border border-gray-700 rounded p-2 text-sm text-gray-500" placeholder="—" title="Поле не зберігається в базі" /></div>
                                          <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Сума повернення (€)</label><input type="number" min={0} step={0.01} value={card1Draft.deposit?.returnedAmount ?? ''} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), returnedAmount: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                          <div className="col-span-2"><label className="text-xs text-gray-500 block mb-1">Статус</label><select value={card1Draft.deposit?.returnStatus ?? 'unpaid'} onChange={e => setCard1Draft(d => d ? { ...d, deposit: { ...base(d), returnStatus: e.target.value as PropertyDeposit['returnStatus'] } } : null)} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white"><option value="unpaid">Не повернено</option><option value="partially_returned">Частково повернено</option><option value="returned">Повернено</option></select></div>
                                        </div>
                                        <div className="w-[120px] flex items-center justify-end gap-2 shrink-0">
                                          <button type="button" onClick={() => { setDepositProofType('return'); setDepositProofFile(null); setDepositProofError(null); setIsDepositProofModalOpen(true); }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors" title="Додати підтвердження повернення"><Plus className="w-4 h-4" /></button>
                                          {kautionProofs.return ? <button type="button" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.return!.filePath); setDocPreview({ open: true, url, title: 'Підтвердження повернення застави' }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors" title="Переглянути підтвердження повернення"><FileText className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><FileText className="w-4 h-4" /></button>}
                                          {kautionProofs.return ? <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { propertyDepositProofsService.delete(kautionProofs.return!.id).then(() => refreshKautionProofs()).catch((e) => alert(e?.message || 'Помилка видалення')); } }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити підтвердження повернення"><Trash2 className="w-4 h-4" /></button> : <button type="button" disabled className="p-1.5 text-gray-600 cursor-not-allowed rounded" title="Немає документу"><Trash2 className="w-4 h-4" /></button>}
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                                {card1DepositError && <p className="text-sm text-red-400 mt-2">{card1DepositError}</p>}
                                <div className="mt-2">
                                    <button type="button" onClick={() => { if (window.confirm('Очистити заставу повністю? Це видалить дані застави (deposit) з цієї квартири.')) { setCard1Draft(d => d ? { ...d, deposit: null } : null); setCard1DepositError(null); } }} className="text-sm text-amber-400 hover:text-amber-300 font-medium">Очистити заставу</button>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => saveCard1Section('kaution')} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white">Зберегти</button>
                                <button type="button" onClick={cancelCard1SectionEdit} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800">Скасувати</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Застава (Kaution)</h3>
                                {(selectedProperty.deposit || kautionProofs.payment || kautionProofs.return) ? (
                                    <>
                                        {/* Row 1: Payment — grid 12 + right actions */}
                                        <div className="flex items-end gap-4">
                                            <div className="grid flex-1 grid-cols-12 gap-4 items-center min-w-0">
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Von</span><span className="text-sm text-white">{(selectedProperty.deposit?.periodFrom ?? selectedProperty.deposit?.paidAt)?.trim() || '—'}</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Bis</span><span className="text-sm text-white">{selectedProperty.deposit?.periodTo?.trim() || '—'}</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Nr</span><span className="text-sm text-white">{selectedProperty.deposit?.depositNo?.trim() || '—'}</span></div>
                                                <div className="col-span-2 min-w-0"><span className="text-xs text-gray-500 block mb-1">Firma</span><span className="text-sm text-white truncate block">{selectedProperty.deposit?.issuerCompany?.trim() || '—'}</span></div>
                                                <div className="col-span-2 min-w-0"><span className="text-xs text-gray-500 block mb-1">Оплачено кому</span><span className="text-sm text-white truncate block">{selectedProperty.deposit?.paidTo?.trim() || '—'}</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Typ</span><span className="text-sm text-white">{(() => { const dt = selectedProperty.deposit?.depositType ?? 'TRANSFER'; return dt === 'CASH' ? 'Bar' : dt === 'GUARANTEE' ? 'BU' : 'ÜW'; })()}</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Сума (€)</span><span className="text-sm text-white font-bold">{(() => { const n = Number(selectedProperty.deposit?.amount); return (n != null && !Number.isNaN(n)) ? `€${n.toFixed(2)}` : '—'; })()}</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${(selectedProperty.deposit?.status ?? 'unpaid') === 'paid' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{(selectedProperty.deposit?.status ?? 'unpaid') === 'paid' ? 'Оплачено' : 'Не оплачено'}</span></div>
                                            </div>
                                            <div className="w-[120px] flex items-center justify-end gap-2 shrink-0">
                                                {kautionProofs.payment ? (
                                                    <button type="button" title="Підтвердження оплати застави" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.payment!.filePath); setDocPreview({ open: true, url, title: 'Підтвердження оплати застави' }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"><FileText className="w-4 h-4" /></button>
                                                ) : <span className="text-sm text-gray-500">—</span>}
                                            </div>
                                        </div>
                                        {/* Row 2: Refund — grid 12 + right actions */}
                                        <div className="flex items-end gap-4 mt-4">
                                            <div className="grid flex-1 grid-cols-12 gap-4 items-center min-w-0">
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Дата повернення</span><span className="text-sm text-white">{selectedProperty.deposit?.returnedAt?.trim() || '—'}</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Сума повернення (€)</span><span className="text-sm text-white">{selectedProperty.deposit?.returnedAmount != null ? (() => { const n = Number(selectedProperty.deposit!.returnedAmount); return !Number.isNaN(n) ? `€${n.toFixed(2)}` : '—'; })() : '—'}</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${(selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'returned' ? 'bg-emerald-500/20 text-emerald-400' : (selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'partially_returned' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>{(selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'returned' ? 'Повернено' : (selectedProperty.deposit?.returnStatus ?? 'unpaid') === 'partially_returned' ? 'Частково повернено' : 'Не повернено'}</span></div>
                                                <div className="col-span-6 min-w-0"><span className="text-xs text-gray-500 block mb-1">Повернув хто / від кого</span><span className="text-sm text-gray-500 truncate block">—</span></div>
                                            </div>
                                            <div className="w-[120px] flex items-center justify-end gap-2 shrink-0">
                                                {kautionProofs.return ? (
                                                    <button type="button" title="Підтвердження повернення застави" onClick={async () => { try { const url = await propertyDepositProofsService.getSignedUrl(kautionProofs.return!.filePath); setDocPreview({ open: true, url, title: 'Підтвердження повернення застави' }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"><FileText className="w-4 h-4" /></button>
                                                ) : <span className="text-sm text-gray-500">—</span>}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Empty state: same two-row structure */}
                                        <div className="flex items-end gap-4">
                                            <div className="grid flex-1 grid-cols-12 gap-4 items-center min-w-0">
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Von</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Bis</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Nr</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Firma</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Оплачено кому</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Typ</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Сума (€)</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-1"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className="text-sm text-gray-500">—</span></div>
                                            </div>
                                            <div className="w-[120px] flex items-center justify-end shrink-0"><span className="text-sm text-gray-500">—</span></div>
                                        </div>
                                        <div className="flex items-end gap-4 mt-4">
                                            <div className="grid flex-1 grid-cols-12 gap-4 items-center min-w-0">
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Дата повернення</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Сума повернення (€)</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-2"><span className="text-xs text-gray-500 block mb-1">Статус</span><span className="text-sm text-gray-500">—</span></div>
                                                <div className="col-span-6"><span className="text-xs text-gray-500 block mb-1">Повернув хто / від кого</span><span className="text-sm text-gray-500">—</span></div>
                                            </div>
                                            <div className="w-[120px] flex items-center justify-end shrink-0"><span className="text-sm text-gray-500">—</span></div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
                )}
            </section>
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isDocumentsCardOpen}
                    aria-controls="documents-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsDocumentsCardOpen((open) => !open); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsDocumentsCardOpen((open) => !open); } }}
                >
                    <h2 id="documents-card-heading" className="text-2xl font-bold text-white">Документи та договори</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isDocumentsCardOpen}
                            aria-controls="documents-card-body"
                            onClick={() => setIsDocumentsCardOpen((open) => !open)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isDocumentsCardOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isDocumentsCardOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {editingCard1Section === null ? (
                            <button type="button" onClick={() => startCard1SectionEdit('documents')} className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors" title="Редагувати">
                                <Edit className="w-4 h-4 text-gray-200" />
                            </button>
                        ) : null}
                    </div>
                </div>
                {isDocumentsCardOpen && (
                <div id="documents-card-body" role="region" aria-labelledby="documents-card-heading" className="space-y-4">
                    {isEditingDocumentsCard && card1Draft ? (
                        <>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Документи та договори</h3>
                                <input ref={addDocumentFileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setNewDocFile(f); }} />
                                {card1DocumentsLoading ? <p className="text-xs text-gray-500">Завантаження…</p> : card1DocumentsError ? <p className="text-xs text-red-400">{card1DocumentsError}</p> : (
                                    <>
                                        {/* Mietvertrag */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-white">Mietvertrag</span>
                                                <button type="button" onClick={() => { setNewDocType('lease_contract'); setNewDocMeta(getDefaultDocMeta('lease_contract')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button>
                                            </div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE.scroller}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[260px]" /><col className="w-[90px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Art</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && newDocType === 'lease_contract' && (
                                                            <tr className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.nr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, nr: e.target.value }))} className={docInput} placeholder="Nr" /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.art ?? 'BEFR')} onChange={e => setNewDocMeta(m => ({ ...m, art: e.target.value }))} className={docInput}><option value="BEFR">Befr</option><option value="UNBEFR">Unbefr</option><option value="AUTO">Auto</option></select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const von = String(newDocMeta.von ?? '').trim(); const art = String(newDocMeta.art ?? '').trim(); if (!von || !art) { setAddDocumentError('Von та Art обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'lease_contract', docId); const meta = { ...newDocMeta }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'lease_contract', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('lease_contract')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>
                                                        )}
                                                        {showAddDocumentForm && newDocType === 'lease_contract' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}
                                                        {card1Documents.filter(d => d.type === 'lease_contract').length === 0 && !(showAddDocumentForm && newDocType === 'lease_contract') ? <tr><td colSpan={5} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'lease_contract').map((doc) => {
                                                            const m = (doc.meta || {}) as Record<string, unknown>;
                                                            const vonS = String(m.von ?? '—'); const bisS = String(m.bis ?? '—'); const nrS = String(m.nr ?? '—'); const artS = ART_LABELS[String(m.art)] ?? String(m.art ?? '—');
                                                            return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={vonS}>{vonS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={bisS}>{bisS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={nrS}>{nrS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`}>{artS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>;
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Übergabeprotokoll */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-white">Übergabeprotokoll</span>
                                                <button type="button" onClick={async () => { setNewDocType('handover_protocol'); setNewDocMeta(getDefaultDocMeta('handover_protocol')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); if (!addressBookLoaded) { setAddressBookLoading(true); try { const user = await safeGetUser(); if (user?.id) { const list = await addressBookPartiesService.listShared(); setAddressBookEntries(list); setAddressBookLoaded(true); } } finally { setAddressBookLoading(false); } } }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button>
                                            </div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE.scroller}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[260px]" /><col className="w-[260px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Datum</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>An</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && newDocType === 'handover_protocol' && (
                                                            <tr className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.datum ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, datum: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.nr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, nr: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.vonId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, vonId: id, vonName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.anId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, anId: id, anName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}>
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button>
                                                                        <span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span>
                                                                        <button
                                                                            type="button"
                                                                            disabled={addingDocument}
                                                                            onClick={async () => {
                                                                                if (!selectedProperty) return;

                                                                                const diagId = crypto.randomUUID();
                                                                                let currentUserId: string | null = null;
                                                                                try {
                                                                                    const u = await safeGetUser();
                                                                                    currentUserId = u?.id ?? null;
                                                                                } catch {}

                                                                                // Temporary diagnostics scoped ONLY to Übergabeprotokoll
                                                                                console.log('UEGP_VALIDATE_OK', {
                                                                                    diagId,
                                                                                    userId: currentUserId,
                                                                                    propertyId: selectedProperty.id,
                                                                                    addressBookEntries: addressBookEntries.length,
                                                                                });

                                                                                if (addressBookEntries.length === 0) {
                                                                                    setAddDocumentError('Немає контрагентів — додай у Контрагенти');
                                                                                    console.warn('UEGP_BLOCKED_NO_PARTIES', { diagId, userId: currentUserId, propertyId: selectedProperty.id });
                                                                                    return;
                                                                                }
                                                                                const datum = String(newDocMeta.datum ?? '').trim();
                                                                                const vonId = String(newDocMeta.vonId ?? '').trim();
                                                                                const anId = String(newDocMeta.anId ?? '').trim();
                                                                                if (!datum || !vonId || !anId) {
                                                                                    setAddDocumentError('Datum, Von та An обовʼязкові');
                                                                                    console.warn('UEGP_BLOCKED_REQUIRED_FIELDS', { diagId, userId: currentUserId, propertyId: selectedProperty.id, datum, vonId, anId });
                                                                                    return;
                                                                                }

                                                                                setAddingDocument(true);
                                                                                setAddDocumentError(null);

                                                                                const docId = crypto.randomUUID();
                                                                                let uploadReturnFilePath: string | null = null;
                                                                                try {
                                                                                    if (newDocFile) {
                                                                                        console.log('UEGP_UPLOAD_START', { diagId, userId: currentUserId, propertyId: selectedProperty.id, docId });
                                                                                        uploadReturnFilePath = await propertyDocumentsService.uploadPropertyDocumentFile(
                                                                                            newDocFile,
                                                                                            selectedProperty.id,
                                                                                            'handover_protocol',
                                                                                            docId
                                                                                        );
                                                                                        // (1) return value from uploadPropertyDocumentFile(...)
                                                                                        console.log('UEGP_UPLOAD_OK', { diagId, docId, filePath: uploadReturnFilePath });
                                                                                    } else {
                                                                                        // (1) explicit: no upload in no-file flow
                                                                                        console.log('UEGP_UPLOAD_OK', { diagId, docId, filePath: null });
                                                                                    }

                                                                                    const vonName = String(newDocMeta.vonName ?? '');
                                                                                    const anName = String(newDocMeta.anName ?? '');
                                                                                    const meta = { datum, nr: newDocMeta.nr, vonId, vonName, anId, anName, von: vonName, an: anName };

                                                                                    console.log('UEGP_INSERT_START', { diagId, propertyId: selectedProperty.id, docId, filePath: uploadReturnFilePath });
                                                                                    const created = await propertyDocumentsService.createPropertyDocument({
                                                                                        id: docId,
                                                                                        propertyId: selectedProperty.id,
                                                                                        type: 'handover_protocol',
                                                                                        filePath: uploadReturnFilePath,
                                                                                        title: null,
                                                                                        meta,
                                                                                    });
                                                                                    // (2) value written into property_documents.file_path (read back)
                                                                                    console.log('UEGP_INSERT_OK', { diagId, docId, dbFilePath: created.filePath });

                                                                                    const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id);
                                                                                    setCard1Documents(list);
                                                                                    setNewDocMeta(getDefaultDocMeta('handover_protocol'));
                                                                                    setNewDocFile(null);
                                                                                    setShowAddDocumentForm(false);
                                                                                    if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = '';
                                                                                } catch (e: any) {
                                                                                    const errObj = {
                                                                                        message: e?.message ?? String(e),
                                                                                        code: e?.code,
                                                                                        details: e?.details,
                                                                                        hint: e?.hint,
                                                                                        status: e?.status,
                                                                                    };
                                                                                    console.warn('UEGP_ERROR', { diagId, docId, uploadReturnFilePath, err: errObj });
                                                                                    if (uploadReturnFilePath) propertyDocumentsService.removePropertyDocumentFile(uploadReturnFilePath).catch(() => {});
                                                                                    setAddDocumentError(e instanceof Error ? e.message : 'Помилка');
                                                                                } finally {
                                                                                    setAddingDocument(false);
                                                                                }
                                                                            }}
                                                                            className="p-1 text-emerald-500 hover:text-emerald-400 rounded"
                                                                            title="Зберегти"
                                                                        >
                                                                            <Check className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {showAddDocumentForm && newDocType === 'handover_protocol' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}
                                                        {card1Documents.filter(d => d.type === 'handover_protocol').length === 0 && !(showAddDocumentForm && newDocType === 'handover_protocol') ? <tr><td colSpan={5} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'handover_protocol').map((doc) => {
                                                            const m = (doc.meta || {}) as Record<string, unknown>;
                                                            const vonDisplay = (m.vonId ? addressBookEntries.find(e => e.id === m.vonId)?.name : null) ?? String(m.vonName ?? m.von ?? '—');
                                                            const anDisplay = (m.anId ? addressBookEntries.find(e => e.id === m.anId)?.name : null) ?? String(m.anName ?? m.an ?? '—');
                                                            const hasFile = doc.filePath != null;
                                                            const viewTitle = hasFile ? 'Переглянути' : 'No document attached';
                                                            return (
                                                                <tr key={doc.id} className={DOC_TABLE.row}>
                                                                    <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={String(m.datum ?? '—')}>{String(m.datum ?? '—')}</td>
                                                                    <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={String(m.nr ?? '—')}>{String(m.nr ?? '—')}</td>
                                                                    <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={vonDisplay}>{vonDisplay}</td>
                                                                    <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={anDisplay}>{anDisplay}</td>
                                                                    <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}>
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                disabled={!hasFile}
                                                                                onClick={hasFile ? async () => {
                                                                                    const diagId = crypto.randomUUID();
                                                                                    // (3) value passed into getDocumentSignedUrl(...)
                                                                                    console.log('UEGP_OPEN_START', { diagId, docId: doc.id, filePathArg: doc.filePath });
                                                                                    try {
                                                                                        const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath as string);
                                                                                        console.log('UEGP_OPEN_OK', { diagId, docId: doc.id });
                                                                                        setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] });
                                                                                    } catch (e: any) {
                                                                                        const errObj = {
                                                                                            message: e?.message ?? String(e),
                                                                                            code: e?.code,
                                                                                            details: e?.details,
                                                                                            hint: e?.hint,
                                                                                            status: e?.status,
                                                                                        };
                                                                                        console.warn('UEGP_OPEN_ERR', { diagId, docId: doc.id, filePathArg: doc.filePath, err: errObj });
                                                                                        alert(e instanceof Error ? e.message : 'Не вдалося відкрити');
                                                                                    }
                                                                                } : undefined}
                                                                                className={`p-1 rounded ${hasFile ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'}`}
                                                                                title={viewTitle}
                                                                            >
                                                                                <Eye className="w-4 h-4" />
                                                                            </button>
                                                                            <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Utility */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-white">Utility</span>
                                                <button type="button" onClick={() => { setNewDocType('supplier_electricity'); setNewDocMeta(getDefaultDocMeta('supplier_electricity')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button>
                                            </div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE_SCROLLER_UTILITY}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[90px]" /><col className="w-[220px]" /><col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[90px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[140px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Kind</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Anb</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Firma</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Betrag</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Fällig</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>MaLo</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && (newDocType === 'supplier_electricity' || newDocType === 'supplier_gas' || newDocType === 'supplier_water' || newDocType === 'supplier_waste') && (
                                                            <tr className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={newDocType} onChange={e => { const t = e.target.value as PropertyDocumentType; setNewDocType(t); setNewDocMeta(getDefaultDocMeta(t)); }} className={docInput}>{UTILITY_TYPES.map(t => <option key={t} value={t}>{UTILITY_KIND_LABELS[t]}</option>)}</select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.anbieter ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, anbieter: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.firma ?? 'SOTISO')} onChange={e => setNewDocMeta(m => ({ ...m, firma: e.target.value }))} className={docInput}><option value="SOTISO">Sotiso</option><option value="WONOVO">Wonovo</option><option value="NOWFLATS">NowFlats</option></select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.vertragsnr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, vertragsnr: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="number" step={0.01} value={newDocMeta.betrag != null ? Number(newDocMeta.betrag) : ''} onChange={e => setNewDocMeta(m => ({ ...m, betrag: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.faellig ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, faellig: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.malo ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, malo: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className={`${trunc} max-w-12 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ? '…' : '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const von = String(newDocMeta.von ?? '').trim(); const firma = String(newDocMeta.firma ?? '').trim(); if (!von || !firma) { setAddDocumentError('Von та Firma обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, newDocType, docId); const meta: Record<string, unknown> = { ...newDocMeta }; if (typeof meta.betrag === 'string') meta.betrag = parseFloat(meta.betrag as string) || 0; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: newDocType, filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta(newDocType)); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>
                                                        )}
                                                        {showAddDocumentForm && (newDocType === 'supplier_electricity' || newDocType === 'supplier_gas' || newDocType === 'supplier_water' || newDocType === 'supplier_waste') && addDocumentError && <tr><td colSpan={10} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}
                                                        {card1Documents.filter(d => UTILITY_TYPES.includes(d.type)).length === 0 && !(showAddDocumentForm && (newDocType === 'supplier_electricity' || newDocType === 'supplier_gas' || newDocType === 'supplier_water' || newDocType === 'supplier_waste')) ? <tr><td colSpan={10} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => UTILITY_TYPES.includes(d.type)).map((doc) => {
                                                            const m = (doc.meta || {}) as Record<string, unknown>;
                                                            const anbS = String(m.anbieter ?? '—'); const firmaS = FIRMA_LABELS[String(m.firma)] ?? String(m.firma ?? '—'); const nrS = String(m.vertragsnr ?? '—'); const betragV = m.betrag != null ? Number(m.betrag) : '—'; const faelligS = String(m.faellig ?? '—'); const vonS = String(m.von ?? '—'); const bisS = String(m.bis ?? '—'); const maloS = String(m.malo ?? '—');
                                                            return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`}>{UTILITY_KIND_LABELS[doc.type] ?? doc.type}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={anbS}>{anbS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={firmaS}>{firmaS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={nrS}>{nrS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${rightNum}`}>{betragV}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={faelligS}>{faelligS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={vonS}>{vonS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={bisS}>{bisS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={maloS}>{maloS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>;
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                        {/* BKA */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-white">BKA</span>
                                                <button type="button" onClick={() => { setNewDocType('bk_abrechnung'); setNewDocMeta(getDefaultDocMeta('bk_abrechnung')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button>
                                            </div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE.scroller}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[90px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Document</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Jahr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && newDocType === 'bk_abrechnung' && (
                                                            <tr className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="text" value={String(newDocMeta.docName ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, docName: e.target.value }))} className={docInput} placeholder="Enter document name" /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.jahr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, jahr: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const docName = String(newDocMeta.docName ?? '').trim(); if (!docName) { setAddDocumentError('Document name обовʼязковий'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'bk_abrechnung', docId); const meta = { ...newDocMeta }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'bk_abrechnung', filePath, title: docName || null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('bk_abrechnung')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>
                                                        )}
                                                        {showAddDocumentForm && newDocType === 'bk_abrechnung' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}
                                                        {card1Documents.filter(d => d.type === 'bk_abrechnung').length === 0 && !(showAddDocumentForm && newDocType === 'bk_abrechnung') ? <tr><td colSpan={5} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'bk_abrechnung').map((doc) => {
                                                            const m = (doc.meta || {}) as Record<string, unknown>;
                                                            const docDisplay = doc.title ?? m.docName ?? m.docDatum ?? '—'; const docDisplayS = String(docDisplay); const vonS = String(m.von ?? '—'); const bisS = String(m.bis ?? '—'); const jahrS = String(m.jahr ?? '—');
                                                            return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={docDisplayS}>{docDisplayS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={vonS}>{vonS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={bisS}>{bisS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${rightNum}`} title={jahrS}>{jahrS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>;
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                        {/* ZVU */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-white">ZVU</span>
                                                <button type="button" onClick={async () => { setNewDocType('zvu'); setNewDocMeta(getDefaultDocMeta('zvu')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); if (!addressBookLoaded) { setAddressBookLoading(true); try { const user = await safeGetUser(); if (user?.id) { const list = await addressBookPartiesService.listShared(); setAddressBookEntries(list); setAddressBookLoaded(true); } } finally { setAddressBookLoading(false); } } }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button>
                                            </div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE.scroller}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[280px]" /><col className="w-[280px]" /><col className="w-[70px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Datum</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Firma</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Owner</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>1/2</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && newDocType === 'zvu' && (
                                                            <tr className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.datum ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, datum: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.nr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, nr: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.firmaId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, firmaId: id, firmaName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.ownerId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, ownerId: id, ownerName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.party ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, party: e.target.value }))} className={docInput}><option value="">—</option><option value="1">1</option><option value="2">2</option></select></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}>
                                                                  <div className="flex items-center justify-end gap-2">
                                                                    <button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button>
                                                                    <span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span>
                                                                    <button
                                                                      type="button"
                                                                      disabled={addingDocument}
                                                                      onClick={async () => {
                                                                        if (!selectedProperty) return;
                                                                        const datum = String(newDocMeta.datum ?? '').trim();
                                                                        if (!datum) {
                                                                          setAddDocumentError('Datum обовʼязковий');
                                                                          return;
                                                                        }
                                                                        setAddingDocument(true);
                                                                        setAddDocumentError(null);
                                                                        const docId = crypto.randomUUID();
                                                                        let filePath: string | null = null;
                                                                        try {
                                                                          if (newDocFile) {
                                                                            filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'zvu', docId);
                                                                          }
                                                                          const meta = { datum: newDocMeta.datum, nr: newDocMeta.nr, firmaId: newDocMeta.firmaId, firmaName: newDocMeta.firmaName, ownerId: newDocMeta.ownerId, ownerName: newDocMeta.ownerName, party: newDocMeta.party };
                                                                          await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'zvu', filePath, title: null, meta });
                                                                          const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id);
                                                                          setCard1Documents(list);
                                                                          setNewDocMeta(getDefaultDocMeta('zvu'));
                                                                          setNewDocFile(null);
                                                                          setShowAddDocumentForm(false);
                                                                          if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = '';
                                                                        } catch (e) {
                                                                          if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {});
                                                                          setAddDocumentError(e instanceof Error ? e.message : 'Помилка');
                                                                        } finally {
                                                                          setAddingDocument(false);
                                                                        }
                                                                      }}
                                                                      className="p-1 text-emerald-500 hover:text-emerald-400 rounded"
                                                                      title="Зберегти"
                                                                    >
                                                                      <Check className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button>
                                                                  </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {showAddDocumentForm && newDocType === 'zvu' && addDocumentError && <tr><td colSpan={6} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}
                                                        {card1Documents.filter(d => d.type === 'zvu').length === 0 && !(showAddDocumentForm && newDocType === 'zvu') ? <tr><td colSpan={6} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'zvu').map((doc) => {
                                                            const m = (doc.meta || {}) as Record<string, unknown>;
                                                            const firmaName = (m.firmaId ? addressBookEntries.find(e => e.id === m.firmaId)?.name : null) ?? String(m.firmaName ?? '—');
                                                            const ownerName = (m.ownerId ? addressBookEntries.find(e => e.id === m.ownerId)?.name : null) ?? String(m.ownerName ?? '—');
                                                            const datumS = String(m.datum ?? '—'); const nrS = String(m.nr ?? '—'); const partyS = String(m.party ?? '—');
                                                            const hasFile = doc.filePath != null;
                                                            const viewTitle = hasFile ? 'Переглянути' : 'No document attached';
                                                            return (
                                                              <tr key={doc.id} className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={datumS}>{datumS}</td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={nrS}>{nrS}</td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={firmaName}>{firmaName}</td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={ownerName}>{ownerName}</td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`}>{partyS}</td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}>
                                                                  <div className="flex items-center justify-end gap-2">
                                                                    <button
                                                                      type="button"
                                                                      disabled={!hasFile}
                                                                      onClick={
                                                                        hasFile
                                                                          ? async () => {
                                                                              try {
                                                                                const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath as string);
                                                                                setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] });
                                                                              } catch (e) {
                                                                                alert(e instanceof Error ? e.message : 'Не вдалося відкрити');
                                                                              }
                                                                            }
                                                                          : undefined
                                                                      }
                                                                      className={`p-1 rounded ${hasFile ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'}`}
                                                                      title={viewTitle}
                                                                    >
                                                                      <Eye className="w-4 h-4" />
                                                                    </button>
                                                                    <button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button>
                                                                  </div>
                                                                </td>
                                                              </tr>
                                                            );
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                        {/* An-/Abmeldung */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1">
                                                <span className="text-xs font-semibold text-white">An-/Abmeldung</span>
                                                <button type="button" onClick={() => { setNewDocType('an_abmeldung'); setNewDocMeta(getDefaultDocMeta('an_abmeldung')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button>
                                            </div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE.scroller}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[280px]" /><col className="w-[280px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Name</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Vertreter</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && newDocType === 'an_abmeldung' && (
                                                            <tr className={DOC_TABLE.row}>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.name ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, name: e.target.value }))} className={docInput} placeholder="Vorname Nachname" /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.vertreter ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, vertreter: e.target.value }))} className={docInput} /></td>
                                                                <td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const von = String(newDocMeta.von ?? '').trim(); const name = String(newDocMeta.name ?? '').trim(); if (!von || !name) { setAddDocumentError('Von та Name обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'an_abmeldung', docId); const meta = { von: newDocMeta.von, bis: newDocMeta.bis || undefined, name, vertreter: newDocMeta.vertreter || undefined }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'an_abmeldung', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('an_abmeldung')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>
                                                        )}
                                                        {showAddDocumentForm && newDocType === 'an_abmeldung' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}
                                                        {card1Documents.filter(d => d.type === 'an_abmeldung').length === 0 && !(showAddDocumentForm && newDocType === 'an_abmeldung') ? <tr><td colSpan={5} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'an_abmeldung').map((doc) => {
                                                            const m = (doc.meta || {}) as Record<string, unknown>;
                                                            const bisVal = m.bis != null && String(m.bis).trim() !== '' ? String(m.bis) : null;
                                                            const vonS = String(m.von ?? '—'); const nameS = String(m.name ?? '—'); const vertS = String(m.vertreter ?? '—');
                                                            return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={vonS}>{vonS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`}>{bisVal ?? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-600 text-gray-300">Aktiv</span>}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={nameS}>{nameS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={vertS}>{vertS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>;
                                                        })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => saveCard1Section('documents')} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white">Готово</button>
                                <button type="button" onClick={cancelCard1SectionEdit} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800">Скасувати</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="pb-4 border-b border-gray-700">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Документи та договори</h3>
                                <input ref={addDocumentFileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setNewDocFile(f); }} />
                                {card1DocumentsLoading ? <p className="text-xs text-gray-500">Завантаження…</p> : card1DocumentsError ? <p className="text-xs text-red-400">{card1DocumentsError}</p> : (
                                    <>
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1"><span className="text-xs font-semibold text-white">Mietvertrag</span><button type="button" onClick={() => { setNewDocType('lease_contract'); setNewDocMeta(getDefaultDocMeta('lease_contract')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button></div>
                                            <div className={DOC_TABLE.wrap}>
                                                <div className={DOC_TABLE.scroller}>
                                                    <table className={DOC_TABLE.table}>
                                                        <colgroup><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[260px]" /><col className="w-[90px]" /><col className={DOC_TABLE.actions} /></colgroup>
                                                        <thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Art</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead>
                                                        <tbody>
                                                        {showAddDocumentForm && newDocType === 'lease_contract' && (
                                                            <tr className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.nr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, nr: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.art ?? 'BEFR')} onChange={e => setNewDocMeta(m => ({ ...m, art: e.target.value }))} className={docInput}><option value="BEFR">Befr</option><option value="UNBEFR">Unbefr</option><option value="AUTO">Auto</option></select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const von = String(newDocMeta.von ?? '').trim(); const art = String(newDocMeta.art ?? '').trim(); if (!von || !art) { setAddDocumentError('Von та Art обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'lease_contract', docId); const meta = { ...newDocMeta }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'lease_contract', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('lease_contract')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>
                                                        )}{showAddDocumentForm && newDocType === 'lease_contract' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}{card1Documents.filter(d => d.type === 'lease_contract').length === 0 && !(showAddDocumentForm && newDocType === 'lease_contract') ? <tr><td colSpan={5} className={DOC_TABLE.empty}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'lease_contract').map((doc) => { const m = (doc.meta || {}) as Record<string, unknown>; const vonS = String(m.von ?? '—'); const bisS = String(m.bis ?? '—'); const nrS = String(m.nr ?? '—'); const artS = ART_LABELS[String(m.art)] ?? String(m.art ?? '—'); return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={vonS}>{vonS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={bisS}>{bisS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={nrS}>{nrS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`}>{artS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1"><span className="text-xs font-semibold text-white">Übergabeprotokoll</span><button type="button" onClick={async () => { setNewDocType('handover_protocol'); setNewDocMeta(getDefaultDocMeta('handover_protocol')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); if (!addressBookLoaded) { setAddressBookLoading(true); try { const user = await safeGetUser(); if (user?.id) { const list = await addressBookPartiesService.listShared(); setAddressBookEntries(list); setAddressBookLoaded(true); } } finally { setAddressBookLoading(false); } } }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button></div>
                                            <div className={DOC_TABLE.wrap}><div className={DOC_TABLE.scroller}><table className={DOC_TABLE.table}><colgroup><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[260px]" /><col className="w-[260px]" /><col className={DOC_TABLE.actions} /></colgroup><thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Datum</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>An</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead><tbody>{showAddDocumentForm && newDocType === 'handover_protocol' && (<tr className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.datum ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, datum: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.nr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, nr: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.vonId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, vonId: id, vonName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.anId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, anId: id, anName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className={`${trunc} max-w-16 text-gray-500`} title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument} onClick={async () => { if (!selectedProperty) return; if (addressBookEntries.length === 0) { setAddDocumentError('Немає контрагентів — додай у Контрагенти'); return; } const datum = String(newDocMeta.datum ?? '').trim(); const vonId = String(newDocMeta.vonId ?? '').trim(); const anId = String(newDocMeta.anId ?? '').trim(); if (!datum || !vonId || !anId) { setAddDocumentError('Datum, Von та An обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { if (newDocFile) { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'handover_protocol', docId); } const vonName = String(newDocMeta.vonName ?? ''); const anName = String(newDocMeta.anName ?? ''); const meta = { datum, nr: newDocMeta.nr, vonId, vonName, anId, anName, von: vonName, an: anName }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'handover_protocol', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('handover_protocol')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>)}{showAddDocumentForm && newDocType === 'handover_protocol' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}{card1Documents.filter(d => d.type === 'handover_protocol').length === 0 && !(showAddDocumentForm && newDocType === 'handover_protocol') ? <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-xs`}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'handover_protocol').map((doc) => { const m = (doc.meta || {}) as Record<string, unknown>; const vonDisplay = (m.vonId ? addressBookEntries.find(e => e.id === m.vonId)?.name : null) ?? String(m.vonName ?? m.von ?? '—'); const anDisplay = (m.anId ? addressBookEntries.find(e => e.id === m.anId)?.name : null) ?? String(m.anName ?? m.an ?? '—'); const hasFile = doc.filePath != null; const viewTitle = hasFile ? 'Переглянути' : 'No document attached'; return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={String(m.datum ?? '—')}>{String(m.datum ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={String(m.nr ?? '—')}>{String(m.nr ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={vonDisplay}>{vonDisplay}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={anDisplay}>{anDisplay}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" disabled={!hasFile} onClick={hasFile ? async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath as string); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } } : undefined} className={`p-1 rounded ${hasFile ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'}`} title={viewTitle}><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}</tbody></table></div></div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1"><span className="text-xs font-semibold text-white">Utility</span><button type="button" onClick={() => { setNewDocType('supplier_electricity'); setNewDocMeta(getDefaultDocMeta('supplier_electricity')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button></div>
                                            <div className={DOC_TABLE.wrap}><div className={DOC_TABLE_SCROLLER_UTILITY}><table className={DOC_TABLE.table}><colgroup><col className="w-[90px]" /><col className="w-[220px]" /><col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[90px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[140px]" /><col className={DOC_TABLE.actions} /></colgroup><thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Kind</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Anb</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Firma</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Betrag</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Fällig</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>MaLo</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead><tbody>{showAddDocumentForm && (newDocType === 'supplier_electricity' || newDocType === 'supplier_gas' || newDocType === 'supplier_water' || newDocType === 'supplier_waste') && (<tr className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={newDocType} onChange={e => { const t = e.target.value as PropertyDocumentType; setNewDocType(t); setNewDocMeta(getDefaultDocMeta(t)); }} className={docInput}>{UTILITY_TYPES.map(t => <option key={t} value={t}>{UTILITY_KIND_LABELS[t]}</option>)}</select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.anbieter ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, anbieter: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.firma ?? 'SOTISO')} onChange={e => setNewDocMeta(m => ({ ...m, firma: e.target.value }))} className={docInput}><option value="SOTISO">Sotiso</option><option value="WONOVO">Wonovo</option><option value="NOWFLATS">NowFlats</option></select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.vertragsnr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, vertragsnr: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="number" step={0.01} value={newDocMeta.betrag != null ? Number(newDocMeta.betrag) : ''} onChange={e => setNewDocMeta(m => ({ ...m, betrag: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.faellig ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, faellig: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.malo ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, malo: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center gap-0.5 flex-nowrap"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className="truncate max-w-12 text-gray-500" title={newDocFile?.name}>{newDocFile?.name ? '…' : '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const von = String(newDocMeta.von ?? '').trim(); const firma = String(newDocMeta.firma ?? '').trim(); if (!von || !firma) { setAddDocumentError('Von та Firma обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, newDocType, docId); const meta: Record<string, unknown> = { ...newDocMeta }; if (typeof meta.betrag === 'string') meta.betrag = parseFloat(meta.betrag as string) || 0; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: newDocType, filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta(newDocType)); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>)}{showAddDocumentForm && (newDocType === 'supplier_electricity' || newDocType === 'supplier_gas' || newDocType === 'supplier_water' || newDocType === 'supplier_waste') && addDocumentError && <tr><td colSpan={10} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}{card1Documents.filter(d => UTILITY_TYPES.includes(d.type)).length === 0 && !(showAddDocumentForm && (newDocType === 'supplier_electricity' || newDocType === 'supplier_gas' || newDocType === 'supplier_water' || newDocType === 'supplier_waste')) ? <tr><td colSpan={10} className={`${DOC_TABLE.empty} text-xs`}>Keine Einträge</td></tr> : card1Documents.filter(d => UTILITY_TYPES.includes(d.type)).map((doc) => { const m = (doc.meta || {}) as Record<string, unknown>; const kindLabel = UTILITY_KIND_LABELS[doc.type] ?? doc.type; const anb = String(m.anbieter ?? '—'); const firmaLabel = FIRMA_LABELS[String(m.firma)] ?? String(m.firma ?? '—'); const nr = String(m.vertragsnr ?? '—'); const betrag = m.betrag != null ? Number(m.betrag) : '—'; const faellig = String(m.faellig ?? '—'); const von = String(m.von ?? '—'); const bis = String(m.bis ?? '—'); const malo = String(m.malo ?? '—'); return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={kindLabel}>{kindLabel}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={anb}>{anb}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={firmaLabel}>{firmaLabel}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={nr}>{nr}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${rightNum}`}>{betrag}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={faellig}>{faellig}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={von}>{von}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={bis}>{bis}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={malo}>{malo}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}</tbody></table></div></div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1"><span className="text-xs font-semibold text-white">BKA</span><button type="button" onClick={() => { setNewDocType('bk_abrechnung'); setNewDocMeta(getDefaultDocMeta('bk_abrechnung')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button></div>
                                            <div className={DOC_TABLE.wrap}><div className={DOC_TABLE.scroller}><table className={DOC_TABLE.table}><colgroup><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[90px]" /><col className={DOC_TABLE.actions} /></colgroup><thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Document</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Jahr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead><tbody>{showAddDocumentForm && newDocType === 'bk_abrechnung' && (<tr className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="text" value={String(newDocMeta.docName ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, docName: e.target.value }))} className={docInput} placeholder="Enter document name" /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.jahr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, jahr: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center gap-0.5 flex-nowrap"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className="truncate max-w-16 text-gray-500" title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const docName = String(newDocMeta.docName ?? '').trim(); if (!docName) { setAddDocumentError('Document name обовʼязковий'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'bk_abrechnung', docId); const meta = { ...newDocMeta }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'bk_abrechnung', filePath, title: docName || null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('bk_abrechnung')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>)}{showAddDocumentForm && newDocType === 'bk_abrechnung' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}{card1Documents.filter(d => d.type === 'bk_abrechnung').length === 0 && !(showAddDocumentForm && newDocType === 'bk_abrechnung') ? <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-xs`}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'bk_abrechnung').map((doc) => { const m = (doc.meta || {}) as Record<string, unknown>; const docDisplay = doc.title ?? m.docName ?? m.docDatum ?? '—'; const docDisplayS = String(docDisplay); const von = String(m.von ?? '—'); const bis = String(m.bis ?? '—'); const jahr = String(m.jahr ?? '—'); return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={docDisplayS}>{docDisplayS}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={von}>{von}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={bis}>{bis}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${rightNum}`} title={jahr}>{jahr}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}</tbody></table></div></div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1"><span className="text-xs font-semibold text-white">ZVU</span><button type="button" onClick={async () => { setNewDocType('zvu'); setNewDocMeta(getDefaultDocMeta('zvu')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); if (!addressBookLoaded) { setAddressBookLoading(true); try { const user = await safeGetUser(); if (user?.id) { const list = await addressBookPartiesService.listShared(); setAddressBookEntries(list); setAddressBookLoaded(true); } } finally { setAddressBookLoading(false); } } }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button></div>
                                            <div className={DOC_TABLE.wrap}><div className={DOC_TABLE.scroller}><table className={DOC_TABLE.table}><colgroup><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[280px]" /><col className="w-[280px]" /><col className="w-[70px]" /><col className={DOC_TABLE.actions} /></colgroup><thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Datum</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Nr</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Firma</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Owner</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>1/2</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead><tbody>{showAddDocumentForm && newDocType === 'zvu' && (<tr className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.datum ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, datum: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.nr ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, nr: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.firmaId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, firmaId: id, firmaName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.ownerId ?? '')} onChange={e => { const id = e.target.value; const entry = addressBookEntries.find(x => x.id === id); setNewDocMeta(m => ({ ...m, ownerId: id, ownerName: entry?.name ?? '' })); }} className={docInput}><option value="">—</option>{addressBookEntries.map(e => <option key={e.id ?? e.name} value={e.id ?? ''}>{e.name}</option>)}</select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><select value={String(newDocMeta.party ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, party: e.target.value }))} className={docInput}><option value="">—</option><option value="1">1</option><option value="2">2</option></select></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center gap-0.5 flex-nowrap"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className="truncate max-w-16 text-gray-500" title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument} onClick={async () => { if (!selectedProperty) return; const datum = String(newDocMeta.datum ?? '').trim(); if (!datum) { setAddDocumentError('Datum обовʼязковий'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { if (newDocFile) { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'zvu', docId); } const meta = { datum: newDocMeta.datum, nr: newDocMeta.nr, firmaId: newDocMeta.firmaId, firmaName: newDocMeta.firmaName, ownerId: newDocMeta.ownerId, ownerName: newDocMeta.ownerName, party: newDocMeta.party }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'zvu', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('zvu')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>)}{showAddDocumentForm && newDocType === 'zvu' && addDocumentError && <tr><td colSpan={6} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}{card1Documents.filter(d => d.type === 'zvu').length === 0 && !(showAddDocumentForm && newDocType === 'zvu') ? <tr><td colSpan={6} className={`${DOC_TABLE.empty} text-xs`}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'zvu').map((doc) => { const m = (doc.meta || {}) as Record<string, unknown>; const firmaName = (m.firmaId ? addressBookEntries.find(e => e.id === m.firmaId)?.name : null) ?? String(m.firmaName ?? '—'); const ownerName = (m.ownerId ? addressBookEntries.find(e => e.id === m.ownerId)?.name : null) ?? String(m.ownerName ?? '—'); const hasFile = doc.filePath != null; const viewTitle = hasFile ? 'Переглянути' : 'No document attached'; return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={String(m.datum ?? '—')}>{String(m.datum ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={String(m.nr ?? '—')}>{String(m.nr ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={firmaName}>{firmaName}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={ownerName}>{ownerName}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={String(m.party ?? '—')}>{String(m.party ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" disabled={!hasFile} onClick={hasFile ? async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath as string); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } } : undefined} className={`p-1 rounded ${hasFile ? 'text-gray-400 hover:text-white' : 'text-gray-600 cursor-not-allowed'}`} title={viewTitle}><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}</tbody></table></div></div>
                                        </div>
                                        {/* An-/Abmeldung */}
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between py-1"><span className="text-xs font-semibold text-white">An-/Abmeldung</span><button type="button" onClick={() => { setNewDocType('an_abmeldung'); setNewDocMeta(getDefaultDocMeta('an_abmeldung')); setNewDocTitle(''); setNewDocDate(''); setNewDocFile(null); setAddDocumentError(null); addDocumentFileInputRef.current && (addDocumentFileInputRef.current.value = ''); setShowAddDocumentForm(true); }} className="p-1 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/20 rounded" title="Додати"><Plus className="w-4 h-4" /></button></div>
                                            <div className={DOC_TABLE.wrap}><div className={DOC_TABLE.scroller}><table className={DOC_TABLE.table}><colgroup><col className="w-[110px]" /><col className="w-[110px]" /><col className="w-[280px]" /><col className="w-[280px]" /><col className={DOC_TABLE.actions} /></colgroup><thead className={DOC_TABLE.thead}><tr><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Von</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Bis</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Name</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`}>Vertreter</th><th className={`${DOC_TABLE.th} ${DOC_TABLE.cellR}`} /></tr></thead><tbody>{showAddDocumentForm && newDocType === 'an_abmeldung' && (<tr className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.von ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, von: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input type="date" value={String(newDocMeta.bis ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, bis: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.name ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, name: e.target.value }))} className={docInput} placeholder="Vorname Nachname" /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><input value={String(newDocMeta.vertreter ?? '')} onChange={e => setNewDocMeta(m => ({ ...m, vertreter: e.target.value }))} className={docInput} /></td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center gap-0.5 flex-nowrap"><button type="button" onClick={() => addDocumentFileInputRef.current?.click()} className="p-1 text-gray-400 hover:text-white rounded" title="Файл"><Paperclip className="w-3.5 h-3.5" /></button><span className="truncate max-w-16 text-gray-500" title={newDocFile?.name}>{newDocFile?.name ?? '—'}</span><button type="button" disabled={addingDocument || !newDocFile} onClick={async () => { if (!selectedProperty || !newDocFile) return; const von = String(newDocMeta.von ?? '').trim(); const name = String(newDocMeta.name ?? '').trim(); if (!von || !name) { setAddDocumentError('Von та Name обовʼязкові'); return; } setAddingDocument(true); setAddDocumentError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(newDocFile, selectedProperty.id, 'an_abmeldung', docId); const meta = { von: newDocMeta.von, bis: newDocMeta.bis || undefined, name, vertreter: newDocMeta.vertreter || undefined }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'an_abmeldung', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setCard1Documents(list); setNewDocMeta(getDefaultDocMeta('an_abmeldung')); setNewDocFile(null); setShowAddDocumentForm(false); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; } catch (e) { if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); setAddDocumentError(e instanceof Error ? e.message : 'Помилка'); } finally { setAddingDocument(false); } }} className="p-1 text-emerald-500 hover:text-emerald-400 rounded" title="Зберегти"><Check className="w-3.5 h-3.5" /></button><button type="button" onClick={() => { setShowAddDocumentForm(false); setAddDocumentError(null); setNewDocMeta({}); setNewDocFile(null); if (addDocumentFileInputRef.current) addDocumentFileInputRef.current.value = ''; }} className="p-1 text-gray-400 hover:text-white rounded" title="Скасувати"><X className="w-3.5 h-3.5" /></button></div></td></tr>)}{showAddDocumentForm && newDocType === 'an_abmeldung' && addDocumentError && <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-red-400 text-xs`}>{addDocumentError}</td></tr>}{card1Documents.filter(d => d.type === 'an_abmeldung').length === 0 && !(showAddDocumentForm && newDocType === 'an_abmeldung') ? <tr><td colSpan={5} className={`${DOC_TABLE.empty} text-xs`}>Keine Einträge</td></tr> : card1Documents.filter(d => d.type === 'an_abmeldung').map((doc) => { const m = (doc.meta || {}) as Record<string, unknown>; const bisVal = m.bis != null && String(m.bis).trim() !== '' ? String(m.bis) : null; return <tr key={doc.id} className={DOC_TABLE.row}><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`} title={String(m.von ?? '—')}>{String(m.von ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${monoNum}`}>{bisVal ?? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-600 text-gray-300">Aktiv</span>}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={String(m.name ?? '—')}>{String(m.name ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR} ${trunc}`} title={String(m.vertreter ?? '—')}>{String(m.vertreter ?? '—')}</td><td className={`${DOC_TABLE.td} ${DOC_TABLE.cellR}`}><div className="flex items-center justify-end gap-2"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Не вдалося відкрити'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Переглянути"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (window.confirm('Видалити документ безповоротно?')) { const pid = selectedProperty!.id; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => {}).catch((e) => alert(e?.message || 'Помилка')).finally(() => { propertyDocumentsService.listPropertyDocuments(pid).then(setCard1Documents); }); } }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Видалити"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}</tbody></table></div></div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
                )}
            </section>
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isRentTimelineCardOpen}
                    aria-controls="rent-timeline-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsRentTimelineCardOpen((open) => !open); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsRentTimelineCardOpen((open) => !open); } }}
                >
                    <h2 id="rent-timeline-card-heading" className="text-2xl font-bold text-white">Рентний таймлайн</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isRentTimelineCardOpen}
                            aria-controls="rent-timeline-card-body"
                            onClick={() => setIsRentTimelineCardOpen((open) => !open)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isRentTimelineCardOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isRentTimelineCardOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {editingCard1Section === null ? (
                            <button type="button" onClick={() => startCard1SectionEdit('rentTimeline')} className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors" title="Редагувати">
                                <Edit className="w-4 h-4 text-gray-200" />
                            </button>
                        ) : null}
                    </div>
                </div>
                {isRentTimelineCardOpen && (
                <div id="rent-timeline-card-body" role="region" aria-labelledby="rent-timeline-card-heading" className="space-y-4">
                    {isEditingRentTimelineCard && card1Draft ? (
                        <>
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
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => saveCard1Section('rentTimeline')} className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white">Зберегти</button>
                                <button type="button" onClick={cancelCard1SectionEdit} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800">Скасувати</button>
                            </div>
                        </>
                    ) : (
                        <>
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
                                <button type="button" onClick={() => { startCard1SectionEdit('rentTimeline'); setShowAddRentIncreaseForm(true); }} className="mt-2 text-sm text-emerald-500 hover:text-emerald-400 font-medium">+ Додати підвищення оренди</button>
                            </div>
                        </>
                    )}
                </div>
                )}
            </section>
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
                    {isZweckentfremdungModalOpen && selectedProperty && (
                        <div className="fixed inset-0 z-[218] flex items-center justify-center bg-black/60 p-4" onClick={() => setIsZweckentfremdungModalOpen(false)}>
                            <div className="bg-[#1C1F24] w-full max-w-lg rounded-xl border border-gray-700 shadow-xl flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                                    <h3 className="text-lg font-bold text-white">Zweckentfremdung</h3>
                                    <button type="button" onClick={() => setIsZweckentfremdungModalOpen(false)} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-sm text-white">Hinweis/Anzeige wegen Zweckentfremdung</span>
                                        <button type="button" role="switch" aria-checked={zweckentfremdungSwitchValue} onClick={() => setZweckentfremdungSwitchValue(!zweckentfremdungSwitchValue)} className={`relative w-11 h-6 rounded-full transition-colors ${zweckentfremdungSwitchValue ? 'bg-amber-500' : 'bg-gray-600'}`}>
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${zweckentfremdungSwitchValue ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    <button type="button" disabled={zweckentfremdungSaving} onClick={async () => { if (!selectedProperty) return; setZweckentfremdungSaving(true); try { const updated = await propertiesService.update(selectedProperty.id, { zweckentfremdungFlag: zweckentfremdungSwitchValue, zweckentfremdungUpdatedAt: new Date().toISOString() }); setProperties(prev => prev.map(p => p.id === updated.id ? updated : p)); } finally { setZweckentfremdungSaving(false); } }} className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white">Speichern</button>
                                    <input type="file" ref={zweckentfremdungFileInputRef} className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setZweckentfremdungModalFile(e.target.files?.[0] ?? null)} />
                                    <div className="border-t border-gray-700 pt-4">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Dokument anfügen</h4>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div><label className="text-gray-500 block mb-0.5">Datum (Pflicht)</label><input type="date" value={zweckentfremdungAddDraft.datum} onChange={e => setZweckentfremdungAddDraft(d => ({ ...d, datum: e.target.value }))} className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-white" /></div>
                                            <div><label className="text-gray-500 block mb-0.5">Aktenzeichen</label><input value={zweckentfremdungAddDraft.aktenzeichen} onChange={e => setZweckentfremdungAddDraft(d => ({ ...d, aktenzeichen: e.target.value }))} className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-white" /></div>
                                            <div className="col-span-2"><label className="text-gray-500 block mb-0.5">Bezirksamt</label><input value={zweckentfremdungAddDraft.bezirksamt} onChange={e => setZweckentfremdungAddDraft(d => ({ ...d, bezirksamt: e.target.value }))} className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-white" /></div>
                                            <div className="col-span-2"><label className="text-gray-500 block mb-0.5">Notiz</label><input value={zweckentfremdungAddDraft.note} onChange={e => setZweckentfremdungAddDraft(d => ({ ...d, note: e.target.value }))} className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-white" /></div>
                                            <div className="col-span-2 flex items-center gap-2">
                                                <button type="button" onClick={() => zweckentfremdungFileInputRef.current?.click()} className="p-1.5 text-gray-400 hover:text-white rounded border border-gray-700" title="Datei"><Paperclip className="w-4 h-4" /></button>
                                                <span className="text-gray-500 truncate flex-1">{zweckentfremdungModalFile?.name ?? '—'}</span>
                                                <button type="button" disabled={zweckentfremdungAddSaving || !zweckentfremdungAddDraft.datum.trim() || !zweckentfremdungModalFile} onClick={async () => { if (!selectedProperty || !zweckentfremdungModalFile) return; const datum = zweckentfremdungAddDraft.datum.trim(); if (!datum) { setZweckentfremdungAddError('Datum ist Pflicht'); return; } setZweckentfremdungAddSaving(true); setZweckentfremdungAddError(null); const docId = crypto.randomUUID(); let filePath: string | null = null; try { filePath = await propertyDocumentsService.uploadPropertyDocumentFile(zweckentfremdungModalFile, selectedProperty.id, 'zweckentfremdung_notice', docId); const meta = { datum, aktenzeichen: zweckentfremdungAddDraft.aktenzeichen, bezirksamt: zweckentfremdungAddDraft.bezirksamt, note: zweckentfremdungAddDraft.note }; await propertyDocumentsService.createPropertyDocument({ id: docId, propertyId: selectedProperty.id, type: 'zweckentfremdung_notice', filePath, title: null, meta }); const list = await propertyDocumentsService.listPropertyDocuments(selectedProperty.id); setZweckentfremdungDocs(list.filter(d => d.type === 'zweckentfremdung_notice')); setZweckentfremdungAddDraft({ datum: '', aktenzeichen: '', bezirksamt: '', note: '' }); setZweckentfremdungModalFile(null); if (zweckentfremdungFileInputRef.current) zweckentfremdungFileInputRef.current.value = ''; } catch (e) { setZweckentfremdungAddError(e instanceof Error ? e.message : 'Fehler'); if (filePath) propertyDocumentsService.removePropertyDocumentFile(filePath).catch(() => {}); } finally { setZweckentfremdungAddSaving(false); } }} className="p-1.5 text-emerald-500 hover:text-emerald-400 rounded" title="Speichern"><Check className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                        {zweckentfremdungAddError && <p className="text-xs text-red-400 mt-1">{zweckentfremdungAddError}</p>}
                                    </div>
                                    <div className="border-t border-gray-700 pt-4">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Anzeigen / Beschwerden</h4>
                                        {zweckentfremdungDocsLoading ? <p className="text-sm text-gray-500">Laden…</p> : (
                                            <div className="overflow-x-auto border border-gray-700 rounded-lg">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-[#23262b] text-gray-400"><tr><th className="px-2 py-1 text-left font-medium w-24">Datum</th><th className="px-2 py-1 text-left font-medium w-20">Aktenz.</th><th className="px-2 py-1 text-left font-medium min-w-0">Bezirksamt</th><th className="px-2 py-1 w-20" /></tr></thead>
                                                    <tbody className="divide-y divide-gray-700/50">
                                                        {zweckentfremdungDocs.length === 0 ? <tr><td colSpan={4} className="px-2 py-2 text-gray-500">Keine Einträge</td></tr> : zweckentfremdungDocs.map(doc => { const m = (doc.meta || {}) as Record<string, unknown>; return <tr key={doc.id} className="hover:bg-[#23262b]"><td className="px-2 py-1 text-white whitespace-nowrap">{String(m.datum ?? '—')}</td><td className="px-2 py-1 text-white whitespace-nowrap">{String(m.aktenzeichen ?? '—')}</td><td className="px-2 py-1 text-white truncate">{String(m.bezirksamt ?? '—')}</td><td className="px-2 py-1"><div className="flex items-center gap-0.5 justify-end"><button type="button" onClick={async () => { try { const url = await propertyDocumentsService.getDocumentSignedUrl(doc.filePath); setDocPreview({ open: true, url, title: doc.title ?? DOCUMENT_TYPE_LABELS[doc.type] }); } catch (e) { alert(e instanceof Error ? e.message : 'Fehler'); } }} className="p-1 text-gray-400 hover:text-white rounded" title="Ansehen"><Eye className="w-4 h-4" /></button><button type="button" onClick={() => { if (!window.confirm('Dokument endgültig löschen?')) return; propertyDocumentsService.deletePropertyDocumentHard(doc).then(() => { setZweckentfremdungDocs(prev => prev.filter(d => d.id !== doc.id)); }).catch(e => alert(e instanceof Error ? e.message : 'Fehler')); }} className="p-1 text-red-400 hover:text-red-300 rounded" title="Löschen"><Trash2 className="w-4 h-4" /></button></div></td></tr>; })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {addApartmentGroupModalOpen && (
                        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!addApartmentGroupSaving) { setAddApartmentGroupModalOpen(false); setAddApartmentGroupError(null); } }}>
                            <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-xl p-4" onClick={e => e.stopPropagation()}>
                                <h3 className="text-lg font-bold text-white mb-3">Додати групу квартир</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Назва групи</label>
                                        <input value={addApartmentGroupName} onChange={e => { setAddApartmentGroupName(e.target.value); setAddApartmentGroupError(null); }} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="Наприклад: Berlin Zentrum" disabled={addApartmentGroupSaving} />
                                    </div>
                                    {addApartmentGroupError && <p className="text-xs text-amber-500">{addApartmentGroupError}</p>}
                                    <div className="flex gap-2 justify-end pt-1">
                                        <button type="button" onClick={() => { if (!addApartmentGroupSaving) { setAddApartmentGroupModalOpen(false); setAddApartmentGroupError(null); } }} className="px-3 py-2 rounded border border-gray-600 hover:bg-gray-700 text-gray-200 text-sm">Скасувати</button>
                                        <button type="button" disabled={addApartmentGroupSaving || !addApartmentGroupName.trim()} onClick={async () => {
                                            const name = addApartmentGroupName.trim();
                                            if (!name) return;
                                            setAddApartmentGroupError(null);
                                            setAddApartmentGroupSaving(true);
                                            try {
                                                const created = await apartmentGroupsService.create(name);
                                                const list = await apartmentGroupsService.getAll();
                                                setApartmentGroups(list);
                                                setCard1Draft(d => d ? { ...d, apartmentGroupId: created.id } : null);
                                                setAddApartmentGroupModalOpen(false);
                                                setAddApartmentGroupName('');
                                            } catch (err) {
                                                setAddApartmentGroupError(err instanceof Error ? err.message : 'Помилка створення групи.');
                                            } finally {
                                                setAddApartmentGroupSaving(false);
                                            }
                                        }} className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium">Зберегти</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {isAddressBookModalOpen && (
                        <>
                        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" onClick={() => { setAddressBookAddOpen(false); setIsAddressBookModalOpen(false); }}>
                            <div className="bg-[#1C1F24] w-full max-w-2xl max-h-[80vh] rounded-xl border border-gray-700 shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                                    <h3 className="text-lg font-bold text-white">Address Book</h3>
                                    <button type="button" onClick={() => { setAddressBookAddOpen(false); setIsAddressBookModalOpen(false); }} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                                    {addressBookDeleteError && <p className="text-xs text-amber-500 mb-3">Delete failed: {addressBookDeleteError}</p>}
                                    {addressBookLoading ? (
                                        <p className="text-sm text-gray-500">Завантаження…</p>
                                    ) : (
                                        <div className="space-y-4">
                                            <p className="text-xs text-gray-500">Додавайте записи кнопкою «+» у секції. Контрагенти на квартирі обираються з цього списку.</p>
                                            {(['owner', 'company1', 'company2', 'management'] as const).map(role => {
                                                const byRole = addressBookEntries.filter(e => e.role === role);
                                                const roleLabel = role === 'owner' ? 'Власник' : role === 'company1' ? '1-ша фірма' : role === 'company2' ? '2-га фірма' : 'Управління';
                                                return (
                                                    <div key={role}>
                                                        <div className="flex items-center justify-between gap-2 mb-2">
                                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{roleLabel}</h4>
                                                            <button
                                                                type="button"
                                                                title={`Додати в «${roleLabel}»`}
                                                                onClick={() => {
                                                                    setAddressBookAddRole(role);
                                                                    setAddressBookAddDraft({
                                                                        name: '',
                                                                        iban: '',
                                                                        street: '',
                                                                        houseNumber: '',
                                                                        zip: '',
                                                                        city: '',
                                                                        country: '',
                                                                        phonesRaw: '',
                                                                        emailsRaw: '',
                                                                        paymentDay: '',
                                                                        unitIdentifier: '',
                                                                        contactPerson: '',
                                                                    });
                                                                    setAddressBookAddError(null);
                                                                    setAddressBookAddOpen(true);
                                                                }}
                                                                className="p-1.5 rounded-md border border-gray-600 bg-[#111315] hover:bg-[#15181b] text-emerald-500 shrink-0"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                            </button>
                                                        </div>
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
                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                <button
                                                                                    type="button"
                                                                                    title="Редагувати"
                                                                                    disabled={isDeleting}
                                                                                    onClick={() => {
                                                                                        if (!entry.id) return;
                                                                                        setAddressBookEditError(null);
                                                                                        setAddressBookEditId(entry.id);
                                                                                        setAddressBookEditRole(role);
                                                                                        setAddressBookEditDraft({
                                                                                            name: String(entry.name ?? ''),
                                                                                            iban: formatIbanForInput(String(entry.iban ?? '')),
                                                                                            street: String(entry.street ?? ''),
                                                                                            houseNumber: String(entry.houseNumber ?? ''),
                                                                                            zip: String(entry.zip ?? ''),
                                                                                            city: String(entry.city ?? ''),
                                                                                            country: String(entry.country ?? ''),
                                                                                            phonesRaw: (entry.phones ?? []).join(', '),
                                                                                            emailsRaw: (entry.emails ?? []).join(', '),
                                                                                            contactPerson: String(entry.contactPerson ?? ''),
                                                                                        });
                                                                                        setAddressBookEditOpen(true);
                                                                                    }}
                                                                                    className={`p-2 rounded-md border border-gray-700 text-gray-200 ${isDeleting ? 'opacity-50 cursor-not-allowed' : 'bg-[#111315] hover:bg-[#15181b]'}`}
                                                                                >
                                                                                    <Edit className="w-4 h-4" size={16} />
                                                                                </button>
                                                                                <button type="button" title="Видалити з Address Book" disabled={isDeleting} onClick={async () => { if (!window.confirm('Видалити цей контакт з Address Book?')) return; setAddressBookDeleteError(null); setAddressBookDeletingId(entry.id!); const removed = entry; setAddressBookEntries(prev => prev.filter(e => e.id !== entry.id)); try { await addressBookPartiesService.deleteById(entry.id!); } catch (e) { console.error('[AddressBook deleteById]', e); setAddressBookDeleteError(String((e as Error)?.message ?? e)); const user = await safeGetUser(); if (user?.id) { const list = await addressBookPartiesService.listShared(); setAddressBookEntries(list); } else { setAddressBookEntries(prev => [...prev, removed]); } } finally { setAddressBookDeletingId(null); } }} className={`p-2 rounded-md border border-gray-700 text-gray-200 ${isDeleting ? 'opacity-50 cursor-not-allowed' : 'bg-[#111315] hover:bg-[#15181b]'}`}><Trash2 className="w-4 h-4" size={16} /></button>
                                                                            </div>
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
                        {addressBookAddOpen && (
                            <div className="fixed inset-0 z-[225] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!addressBookAddSaving) setAddressBookAddOpen(false); }}>
                                <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-xl p-4" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="text-sm font-bold text-white">Новий запис — {addressBookRoleLabel(addressBookAddRole)}</h4>
                                        <button type="button" disabled={addressBookAddSaving} onClick={() => setAddressBookAddOpen(false)} className="text-gray-400 hover:text-white p-1 rounded disabled:opacity-50"><X className="w-4 h-4" /></button>
                                    </div>
                                    {addressBookAddError && <p className="text-xs text-amber-500 mb-2">{addressBookAddError}</p>}
                                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Назва</label><input value={addressBookAddDraft.name} onChange={e => setAddressBookAddDraft(d => ({ ...d, name: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="Компанія / контакт" /></div>
                                        <div>
                                          <label className="text-xs text-gray-500 block mb-0.5">IBAN</label>
                                          <input
                                            value={addressBookAddDraft.iban}
                                            onChange={(e) => {
                                              const el = e.target;
                                              const raw = el.value;
                                              const rawCaret = el.selectionStart ?? raw.length;
                                              const alnumBefore = normalizeIbanForStorage(raw.slice(0, Math.max(0, rawCaret))).length;
                                              const next = formatIbanForInput(raw);
                                              const nextCaret = ibanCaretIndexForAlnumCount(next, alnumBefore);
                                              setAddressBookAddDraft((d) => ({ ...d, iban: next }));
                                              requestAnimationFrame(() => {
                                                try {
                                                  el.setSelectionRange(nextCaret, nextCaret);
                                                } catch {
                                                  /* ignore */
                                                }
                                              });
                                            }}
                                            onPaste={(e) => {
                                              const pasted = e.clipboardData.getData('text');
                                              const el = e.currentTarget;
                                              const raw = el.value;
                                              const start = el.selectionStart ?? raw.length;
                                              const end = el.selectionEnd ?? raw.length;
                                              const merged = `${raw.slice(0, start)}${pasted}${raw.slice(end)}`;
                                              const caretRawAfter = start + pasted.length;
                                              const alnumBefore = normalizeIbanForStorage(merged.slice(0, Math.max(0, caretRawAfter))).length;
                                              const next = formatIbanForInput(merged);
                                              const nextCaret = ibanCaretIndexForAlnumCount(next, alnumBefore);
                                              e.preventDefault();
                                              setAddressBookAddDraft((d) => ({ ...d, iban: next }));
                                              requestAnimationFrame(() => {
                                                try {
                                                  el.setSelectionRange(nextCaret, nextCaret);
                                                } catch {
                                                  /* ignore */
                                                }
                                              });
                                            }}
                                            className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white font-mono"
                                            placeholder="—"
                                          />
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Вулиця</label><input value={addressBookAddDraft.street} onChange={e => setAddressBookAddDraft(d => ({ ...d, street: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-xs text-gray-500 block mb-0.5">Номер</label><input value={addressBookAddDraft.houseNumber} onChange={e => setAddressBookAddDraft(d => ({ ...d, houseNumber: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                            <div><label className="text-xs text-gray-500 block mb-0.5">Індекс</label><input value={addressBookAddDraft.zip} onChange={e => setAddressBookAddDraft(d => ({ ...d, zip: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Місто</label><input value={addressBookAddDraft.city} onChange={e => setAddressBookAddDraft(d => ({ ...d, city: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Країна</label><input value={addressBookAddDraft.country} onChange={e => setAddressBookAddDraft(d => ({ ...d, country: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Телефони (через кому)</label><input value={addressBookAddDraft.phonesRaw} onChange={e => setAddressBookAddDraft(d => ({ ...d, phonesRaw: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Email (через кому)</label><input value={addressBookAddDraft.emailsRaw} onChange={e => setAddressBookAddDraft(d => ({ ...d, emailsRaw: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        {(addressBookAddRole === 'company1' || addressBookAddRole === 'company2') && (
                                            <div><label className="text-xs text-gray-500 block mb-0.5">День оплати (1–31)</label><input value={addressBookAddDraft.paymentDay} onChange={e => setAddressBookAddDraft(d => ({ ...d, paymentDay: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="—" /></div>
                                        )}
                                        {(addressBookAddRole === 'owner' || addressBookAddRole === 'management') && (
                                            <>
                                                <div><label className="text-xs text-gray-500 block mb-0.5">ID (одиниця)</label><input value={addressBookAddDraft.unitIdentifier} onChange={e => setAddressBookAddDraft(d => ({ ...d, unitIdentifier: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                                <div><label className="text-xs text-gray-500 block mb-0.5">Контактна персона</label><input value={addressBookAddDraft.contactPerson} onChange={e => setAddressBookAddDraft(d => ({ ...d, contactPerson: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <button type="button" disabled={addressBookAddSaving} onClick={() => setAddressBookAddOpen(false)} className="px-3 py-2 rounded border border-gray-600 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50">Скасувати</button>
                                        <button
                                            type="button"
                                            disabled={addressBookAddSaving || !addressBookAddDraft.name.trim()}
                                            onClick={async () => {
                                                setAddressBookAddError(null);
                                                if (!addressBookAddDraft.name.trim()) {
                                                    setAddressBookAddError('Вкажіть назву.');
                                                    return;
                                                }
                                                setAddressBookAddSaving(true);
                                                try {
                                                    const user = await safeGetUser();
                                                    if (!user?.id) throw new Error('Not authenticated');
                                                    const phones = addressBookAddDraft.phonesRaw.split(',').map(s => s.trim()).filter(Boolean);
                                                    const emails = addressBookAddDraft.emailsRaw.split(',').map(s => s.trim()).filter(Boolean);
                                                    let paymentDay: number | null = null;
                                                    if ((addressBookAddRole === 'company1' || addressBookAddRole === 'company2') && addressBookAddDraft.paymentDay.trim()) {
                                                        const n = parseInt(addressBookAddDraft.paymentDay, 10);
                                                        if (n >= 1 && n <= 31) paymentDay = n;
                                                    }
                                                    const entry: AddressBookPartyEntry = {
                                                        ownerUserId: user.id,
                                                        role: addressBookAddRole,
                                                        name: addressBookAddDraft.name.trim(),
                                                        iban: normalizeIbanForStorage(addressBookAddDraft.iban),
                                                        street: addressBookAddDraft.street.trim(),
                                                        zip: addressBookAddDraft.zip.trim(),
                                                        city: addressBookAddDraft.city.trim(),
                                                        houseNumber: addressBookAddDraft.houseNumber.trim() || null,
                                                        country: addressBookAddDraft.country.trim() || null,
                                                        phones,
                                                        emails,
                                                        paymentDay,
                                                        unitIdentifier:
                                                            addressBookAddRole === 'owner' || addressBookAddRole === 'management'
                                                                ? addressBookAddDraft.unitIdentifier.trim() || null
                                                                : null,
                                                        contactPerson:
                                                            addressBookAddRole === 'owner' || addressBookAddRole === 'management'
                                                                ? addressBookAddDraft.contactPerson.trim() || null
                                                                : null,
                                                    };
                                                    await addressBookPartiesService.upsertMany([entry]);
                                                    const list = await addressBookPartiesService.listShared();
                                                    setAddressBookEntries(list);
                                                    setAddressBookLoaded(true);
                                                    setAddressBookAddOpen(false);
                                                } catch (e) {
                                                    setAddressBookAddError(e instanceof Error ? e.message : String(e));
                                                } finally {
                                                    setAddressBookAddSaving(false);
                                                }
                                            }}
                                            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
                                        >
                                            Зберегти
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {addressBookEditOpen && (
                            <div className="fixed inset-0 z-[226] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!addressBookEditSaving) setAddressBookEditOpen(false); }}>
                                <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-xl p-4" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-3">
                                        <h4 className="text-sm font-bold text-white">Edit counterparty — {addressBookRoleLabel(addressBookEditRole)}</h4>
                                        <button type="button" disabled={addressBookEditSaving} onClick={() => setAddressBookEditOpen(false)} className="text-gray-400 hover:text-white p-1 rounded disabled:opacity-50"><X className="w-4 h-4" /></button>
                                    </div>
                                    {addressBookEditError && <p className="text-xs text-amber-500 mb-2">{addressBookEditError}</p>}
                                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Назва</label><input value={addressBookEditDraft.name} onChange={e => setAddressBookEditDraft(d => ({ ...d, name: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" placeholder="Компанія / контакт" /></div>
                                        <div>
                                          <label className="text-xs text-gray-500 block mb-0.5">IBAN</label>
                                          <input
                                            value={addressBookEditDraft.iban}
                                            onChange={(e) => {
                                              const el = e.target;
                                              const raw = el.value;
                                              const rawCaret = el.selectionStart ?? raw.length;
                                              const alnumBefore = normalizeIbanForStorage(raw.slice(0, Math.max(0, rawCaret))).length;
                                              const next = formatIbanForInput(raw);
                                              const nextCaret = ibanCaretIndexForAlnumCount(next, alnumBefore);
                                              setAddressBookEditDraft((d) => ({ ...d, iban: next }));
                                              requestAnimationFrame(() => {
                                                try {
                                                  el.setSelectionRange(nextCaret, nextCaret);
                                                } catch {
                                                  /* ignore */
                                                }
                                              });
                                            }}
                                            onPaste={(e) => {
                                              const pasted = e.clipboardData.getData('text');
                                              const el = e.currentTarget;
                                              const raw = el.value;
                                              const start = el.selectionStart ?? raw.length;
                                              const end = el.selectionEnd ?? raw.length;
                                              const merged = `${raw.slice(0, start)}${pasted}${raw.slice(end)}`;
                                              const caretRawAfter = start + pasted.length;
                                              const alnumBefore = normalizeIbanForStorage(merged.slice(0, Math.max(0, caretRawAfter))).length;
                                              const next = formatIbanForInput(merged);
                                              const nextCaret = ibanCaretIndexForAlnumCount(next, alnumBefore);
                                              e.preventDefault();
                                              setAddressBookEditDraft((d) => ({ ...d, iban: next }));
                                              requestAnimationFrame(() => {
                                                try {
                                                  el.setSelectionRange(nextCaret, nextCaret);
                                                } catch {
                                                  /* ignore */
                                                }
                                              });
                                            }}
                                            className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white font-mono"
                                            placeholder="—"
                                          />
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Вулиця</label><input value={addressBookEditDraft.street} onChange={e => setAddressBookEditDraft(d => ({ ...d, street: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-xs text-gray-500 block mb-0.5">Номер</label><input value={addressBookEditDraft.houseNumber} onChange={e => setAddressBookEditDraft(d => ({ ...d, houseNumber: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                            <div><label className="text-xs text-gray-500 block mb-0.5">Індекс</label><input value={addressBookEditDraft.zip} onChange={e => setAddressBookEditDraft(d => ({ ...d, zip: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        </div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Місто</label><input value={addressBookEditDraft.city} onChange={e => setAddressBookEditDraft(d => ({ ...d, city: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Країна</label><input value={addressBookEditDraft.country} onChange={e => setAddressBookEditDraft(d => ({ ...d, country: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Телефони (через кому)</label><input value={addressBookEditDraft.phonesRaw} onChange={e => setAddressBookEditDraft(d => ({ ...d, phonesRaw: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Email (через кому)</label><input value={addressBookEditDraft.emailsRaw} onChange={e => setAddressBookEditDraft(d => ({ ...d, emailsRaw: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-0.5">Контактна персона</label><input value={addressBookEditDraft.contactPerson} onChange={e => setAddressBookEditDraft(d => ({ ...d, contactPerson: e.target.value }))} className="w-full bg-[#111315] border border-gray-700 rounded p-2 text-sm text-white" /></div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <button type="button" disabled={addressBookEditSaving} onClick={() => setAddressBookEditOpen(false)} className="px-3 py-2 rounded border border-gray-600 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50">Скасувати</button>
                                        <button
                                            type="button"
                                            disabled={addressBookEditSaving || !addressBookEditDraft.name.trim() || !addressBookEditId}
                                            onClick={async () => {
                                                setAddressBookEditError(null);
                                                if (!addressBookEditId) {
                                                    setAddressBookEditError('Missing id.');
                                                    return;
                                                }
                                                if (!addressBookEditDraft.name.trim()) {
                                                    setAddressBookEditError('Вкажіть назву.');
                                                    return;
                                                }
                                                setAddressBookEditSaving(true);
                                                try {
                                                    const phones = addressBookEditDraft.phonesRaw.split(',').map(s => s.trim()).filter(Boolean);
                                                    const emails = addressBookEditDraft.emailsRaw.split(',').map(s => s.trim()).filter(Boolean);
                                                    await addressBookPartiesService.updateById(addressBookEditId, {
                                                        name: addressBookEditDraft.name,
                                                        iban: normalizeIbanForStorage(addressBookEditDraft.iban),
                                                        street: addressBookEditDraft.street,
                                                        houseNumber: addressBookEditDraft.houseNumber,
                                                        zip: addressBookEditDraft.zip,
                                                        city: addressBookEditDraft.city,
                                                        country: addressBookEditDraft.country,
                                                        phones,
                                                        emails,
                                                        contactPerson: addressBookEditDraft.contactPerson,
                                                    });
                                                    const list = await addressBookPartiesService.listShared();
                                                    setAddressBookEntries(list);
                                                    setAddressBookLoaded(true);
                                                    setAddressBookEditOpen(false);
                                                } catch (e) {
                                                    setAddressBookEditError(e instanceof Error ? e.message : String(e));
                                                } finally {
                                                    setAddressBookEditSaving(false);
                                                }
                                            }}
                                            className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium"
                                        >
                                            Зберегти
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        </>
                    )}
                    {docPreview.open && (
                        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-4" onClick={closeDocPreview}>
                            <div className="max-w-4xl w-[92vw] max-h-[85vh] flex flex-col rounded-xl border border-gray-700 bg-[#0B0F14] shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                                    <span className="text-sm font-semibold text-white truncate flex-1 min-w-0">{docPreview.title ?? ''}</span>
                                    <button type="button" onClick={closeDocPreview} className="text-gray-400 hover:text-white p-1.5 rounded shrink-0"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="min-h-0 flex-1 overflow-auto p-4">
                                    {(() => {
                                        const isPdf = (() => {
                                            try {
                                                return new URL(docPreview.url).pathname.toLowerCase().endsWith('.pdf');
                                            } catch {
                                                return /\.pdf(\?|$)/i.test(docPreview.url);
                                            }
                                        })();
                                        const pathForExt = (() => {
                                            try {
                                                return new URL(docPreview.url).pathname.toLowerCase();
                                            } catch {
                                                return docPreview.url.split('?')[0].toLowerCase();
                                            }
                                        })();
                                        if (isPdf) {
                                            return <iframe src={docPreview.url} title={docPreview.title} className="w-full min-h-[75vh] rounded-b bg-white" />;
                                        }
                                        if (['.png', '.jpg', '.jpeg', '.webp'].some(ext => pathForExt.endsWith(ext))) {
                                            return <img src={docPreview.url} alt={docPreview.title} className="max-w-full max-h-[75vh] object-contain mx-auto" />;
                                        }
                                        return (
                                            <div className="text-center py-6">
                                                <p className="text-gray-400 mb-4">Файл не можна переглянути тут</p>
                                                <button type="button" onClick={() => window.open(docPreview.url, '_blank')} className="text-sm text-emerald-500 hover:text-emerald-400">Відкрити в новій вкладці</button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}
            {/* Card 2: Unit Details & Ausstattung — single editable form (details + amenities only; no building) */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <>
                <div
                    className="flex justify-between items-center mb-4 cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isApartmentDataOpen}
                    aria-controls="apartment-data-card-body"
                    onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsApartmentDataOpen((o) => !o); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsApartmentDataOpen((o) => !o); } }}
                >
                    <h2 id="apartment-data-card-heading" className="text-2xl font-bold text-white">🏠 Дані квартири</h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            aria-expanded={isApartmentDataOpen}
                            aria-controls="apartment-data-card-body"
                            onClick={() => setIsApartmentDataOpen((o) => !o)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-white/[0.03] hover:text-gray-400 transition-colors"
                            aria-label={isApartmentDataOpen ? 'Згорнути розділ' : 'Розгорнути розділ'}
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${isApartmentDataOpen ? 'rotate-180' : ''}`} />
                        </button>
                    {!isCard2Editing && (
                        <button
                            type="button"
                            onClick={startCard2Edit}
                            aria-label="Редагувати"
                            title="Редагувати"
                            className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors"
                        >
                            <Edit className="w-4 h-4 text-gray-200" />
                        </button>
                    )}
                    </div>
                </div>
                {(isApartmentDataOpen || isCard2Editing) && (
                <div id="apartment-data-card-body" role="region" aria-labelledby="apartment-data-card-heading">
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
                            <div className="flex flex-wrap items-end gap-x-10 gap-y-4 mb-6">
                                <div className="min-w-[120px]">
                                    <div className="text-xs text-gray-400">Площа</div>
                                    {view ? (
                                        <div className="text-lg font-semibold text-white leading-none">{(d.area != null && d.area !== 0) ? `${d.area} m²` : '—'}</div>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <input type="number" min={0} step={0.1} className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={d.area != null && d.area !== 0 ? d.area : ''} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, area: parseFloat(e.target.value) || 0 } })} placeholder="—" />
                                            <span className="text-gray-500 text-sm">m²</span>
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-[120px]">
                                    <div className="text-xs text-gray-400">Кімнати</div>
                                    {view ? <div className="text-lg font-semibold text-white leading-none">{phNum(d.rooms)}</div> : (
                                        <input type="number" className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={numOrZero(d.rooms)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, rooms: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div className="min-w-[120px]">
                                    <div className="text-xs text-gray-400">Ліжка</div>
                                    {view ? <div className="text-lg font-semibold text-white leading-none">{(d.beds != null && d.beds !== 0) ? String(d.beds) : '—'}</div> : (
                                        <input type="number" className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={d.beds != null && d.beds !== 0 ? d.beds : ''} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, beds: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div className="min-w-[120px]">
                                    <div className="text-xs text-gray-400">Ванни</div>
                                    {view ? <div className="text-lg font-semibold text-white leading-none">{(d.baths != null && d.baths !== 0) ? String(d.baths) : '—'}</div> : (
                                        <input type="number" className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={d.baths != null && d.baths !== 0 ? d.baths : ''} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, baths: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div className="min-w-[120px]">
                                    <div className="text-xs text-gray-400">Балкони</div>
                                    {view ? <div className="text-lg font-semibold text-white leading-none">{(d.balconies != null && d.balconies !== 0) ? String(d.balconies) : '—'}</div> : (
                                        <input type="number" className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={d.balconies != null && d.balconies !== 0 ? d.balconies : ''} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, balconies: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                    )}
                                </div>
                                <div className="min-w-[120px]">
                                    <div className="text-xs text-gray-400">Поверх</div>
                                    {view ? (
                                        <div className="text-lg font-semibold text-white leading-none">{phNum(d.floor)}/{phNum(d.buildingFloors)}</div>
                                    ) : (
                                        <div className="flex items-center gap-1">
                                            <input type="number" className="w-14 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={numOrZero(d.floor)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, floor: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                            <span className="text-gray-500 text-sm">/</span>
                                            <input type="number" className="w-14 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={numOrZero(d.buildingFloors)} onChange={e => card2Draft && setCard2Draft({ ...card2Draft, details: { ...card2Draft.details, buildingFloors: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="border-t border-gray-700 pt-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">AUSSTATTUNG</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {AMENITY_GROUPS.map(({ groupLabel, keys }, groupIndex) => {
                                        const groupKey = `ausstattung-g-${groupIndex}`;
                                        const isOpen = !!openAusstattungCards[groupKey];
                                        const selectedCount = keys.filter(k => !!a[k]).length;
                                        const panelId = `ausstattung-panel-${groupKey}`;
                                        const headerId = `ausstattung-header-${groupKey}`;
                                        return (
                                            <div key={groupKey} className="bg-[#111315] border border-gray-700 rounded-lg overflow-hidden">
                                                <button
                                                    type="button"
                                                    id={headerId}
                                                    aria-expanded={isOpen}
                                                    aria-controls={panelId}
                                                    onClick={() => setOpenAusstattungCards(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
                                                    className="w-full flex items-center justify-between gap-2 min-h-[48px] px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
                                                >
                                                    <span className="text-xs font-semibold text-gray-400 truncate">{groupLabel}</span>
                                                    <span className="flex items-center gap-2 shrink-0">
                                                        <span className="text-xs text-gray-500 tabular-nums">{selectedCount}/{keys.length}</span>
                                                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                                    </span>
                                                </button>
                                                <div id={panelId} role="region" aria-labelledby={headerId} className={isOpen ? 'border-t border-gray-700/50' : 'hidden'}>
                                                    {isOpen && (
                                                        <div className="p-3 space-y-1.5">
                                                            {keys.map((key) => {
                                                                const checked = !!a[key];
                                                                return (
                                                                    <div key={key} className="flex items-center gap-2 min-h-[28px]">
                                                                        {view ? (
                                                                            checked ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <span className="w-4 h-4 shrink-0 text-gray-500 text-center leading-4 text-sm">—</span>
                                                                        ) : (
                                                                            <input
                                                                                type="checkbox"
                                                                                className="rounded border-gray-600 bg-[#0D1117] text-emerald-500 focus:ring-emerald-500 shrink-0"
                                                                                checked={checked}
                                                                                onChange={e => card2Draft && setCard2Draft({ ...card2Draft, amenities: { ...card2Draft.amenities, [key]: e.target.checked } })}
                                                                            />
                                                                        )}
                                                                        <span className="text-sm text-white truncate">{key}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
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
                </div>
                )}
                </>
            </section>

            {/* Card 3 — Building */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Будівля</h2>
                    {!isCard3Editing ? (
                        <button
                            type="button"
                            onClick={startCard3Edit}
                            aria-label="Редагувати"
                            title="Редагувати"
                            className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors"
                        >
                            <Edit className="w-4 h-4 text-gray-200" />
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button type="button" onClick={saveCard3} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                                <Save className="w-4 h-4" /> Зберегти
                            </button>
                            <button type="button" onClick={cancelCard3} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                                Скасувати
                            </button>
                        </div>
                    )}
                </div>
                {(() => {
                    const view = !isCard3Editing;
                    const b: Partial<BuildingSpecs> = view ? (selectedProperty.building || {}) : (card3Draft?.building || {});
                    const yearVal = view ? (selectedProperty.details?.year ?? 0) : (card3Draft?.year ?? 0);
                    const repairYearVal = view ? (selectedProperty.building?.repairYear ?? 0) : (card3Draft?.building?.repairYear ?? 0);
                    const str = (v: string | undefined) => (v != null && String(v).trim() !== '') ? String(v).trim() : '—';
                    return (
                        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Тип будівлі</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{str(b.type)}</div> : (
                                    <input type="text" className="w-40 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={b.type || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, building: { ...card3Draft.building, type: e.target.value } })} placeholder="—" />
                                )}
                            </div>
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Рік побудови</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{yearVal ? String(yearVal) : '—'}</div> : (
                                    <input type="number" className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={yearVal || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, year: parseInt(e.target.value || '0', 10) })} placeholder="—" />
                                )}
                            </div>
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Рік ремонту</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{repairYearVal ? String(repairYearVal) : '—'}</div> : (
                                    <input type="number" className="w-20 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={repairYearVal || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, building: { ...card3Draft.building, repairYear: parseInt(e.target.value || '0', 10) } })} placeholder="—" />
                                )}
                            </div>
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Ліфт</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{str(b.elevator)}</div> : (
                                    <input type="text" className="w-24 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={b.elevator || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, building: { ...card3Draft.building, elevator: e.target.value } })} placeholder="—" />
                                )}
                            </div>
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Доступність</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{str(b.access)}</div> : (
                                    <input type="text" className="w-24 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={b.access || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, building: { ...card3Draft.building, access: e.target.value } })} placeholder="—" />
                                )}
                            </div>
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Сертифікат</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{str(b.certificate)}</div> : (
                                    <input type="text" className="w-28 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={b.certificate || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, building: { ...card3Draft.building, certificate: e.target.value } })} placeholder="—" />
                                )}
                            </div>
                            <div className="min-w-[120px]">
                                <div className="text-xs text-gray-400">Енергоклас</div>
                                {view ? <div className="text-lg font-semibold text-white leading-none">{str(b.energyClass)}</div> : (
                                    <input type="text" className="w-16 bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-sm text-white" value={b.energyClass || ''} onChange={e => card3Draft && setCard3Draft({ ...card3Draft, building: { ...card3Draft.building, energyClass: e.target.value } })} placeholder="—" />
                                )}
                            </div>
                        </div>
                    );
                })()}
            </section>

            {/* Інвойси (Витрати) — property expense invoices, per-row category */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isInvoicesCollapsed}
                        onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setIsInvoicesCollapsed((prev) => !prev); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsInvoicesCollapsed((prev) => !prev); } }}
                    >
                        <button
                            type="button"
                            aria-expanded={!isInvoicesCollapsed}
                            aria-label="Згорнути/розгорнути інвойси"
                            onClick={() => setIsInvoicesCollapsed((prev) => !prev)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                        >
                            {isInvoicesCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </button>
                        <h2 className="text-xl font-bold text-white">Інвойси (Витрати)</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-sm">Всього: <span className="text-white font-semibold">{formatCurrencyEUR(totalInvoicesAmount)}</span></span>
                        <span className="text-emerald-400 text-sm">За місяць: <span className="text-emerald-300 font-semibold">{formatCurrencyEUR(monthlyInvoicesAmount)}</span></span>
                        {!isInvoicesCollapsed && (
                        <>
                        <button
                            type="button"
                            onClick={() => setIsExpenseCategoriesModalOpen(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
                        >
                            Категорії
                        </button>
                        <button
                            onClick={() => {
                                if (isExpenseEditing) handleSaveExpense();
                                else setIsExpenseEditing(true);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${isExpenseEditing ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'}`}
                        >
                            {isExpenseEditing ? <><Check className="w-3 h-3 mr-1 inline"/> Зберегти</> : <><Edit className="w-3 h-3 mr-1 inline"/> Редагувати</>}
                        </button>
                        {isExpenseEditing && (
                            <button
                                onClick={() => { setIsExpenseEditing(false); refreshExpenseItems(); }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-600 text-gray-300 hover:bg-gray-700/50"
                            >
                                Скасувати
                            </button>
                        )}
                        {isExpenseEditing && (
                            <button
                                onClick={handleAddExpenseRow}
                                disabled={expenseCategories.length === 0}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                            >
                                <Plus className="w-3 h-3 mr-1 inline" /> Додати
                            </button>
                        )}
                        <button
                            onClick={() => setIsExpenseAddFromDocumentOpen(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
                        >
                            <Upload className="w-3 h-3 mr-1 inline" /> Додати з документа
                        </button>
                        </>
                        )}
                    </div>
                </div>
                {!isInvoicesCollapsed && (
                <div className="rounded-lg border border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-sm text-left">
                        <colgroup>
                            <col className="w-10" />
                            <col className="w-[95px]" />
                            <col className="w-[90px]" />
                            <col className="w-[100px]" />
                            <col className="w-[120px]" />
                            <col className="w-[90px]" />
                            <col className="w-[85px]" />
                            {isExpenseEditing && <col className="w-10" />}
                        </colgroup>
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase w-10" aria-label="Розгорнути" />
                                <th className="p-3 font-bold text-xs uppercase">Дата</th>
                                <th className="p-3 font-bold text-xs uppercase">Інвойс №</th>
                                <th className="p-3 font-bold text-xs uppercase">Постачальник</th>
                                <th className="p-3 font-bold text-xs uppercase">Документ</th>
                                <th className="p-3 font-bold text-xs uppercase">Об'єкт</th>
                                <th className="p-3 font-bold text-xs uppercase text-right">Сума</th>
                                {isExpenseEditing && <th className="p-3 font-bold text-xs uppercase text-center">Дії</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {expenseLoading ? (
                                <tr><td colSpan={isExpenseEditing ? 8 : 7} className="p-4 text-center text-gray-500 text-sm">Завантаження...</td></tr>
                            ) : expenseGroups.length === 0 ? (
                                <tr><td colSpan={isExpenseEditing ? 8 : 7} className="p-4 text-center text-gray-500 text-xs">Немає витрат. Додайте вручну або з документа.</td></tr>
                            ) : (
                                expenseGroups.map((group) => {
                                    const isExpanded = expandedExpenseGroups[group.key] ?? false;
                                    const doc = group.doc;
                                    const formattedDate = doc?.invoice_date
                                        ? new Date(doc.invoice_date).toLocaleDateString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit' })
                                        : (group.key === 'manual' && group.items[0]?.invoice_date
                                            ? new Date(group.items[0].invoice_date).toLocaleDateString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit' })
                                            : '—');
                                    const invoiceNumber = doc?.invoice_number ?? '—';
                                    const vendor = group.key === 'manual' ? 'Без документа (Manual)' : (doc?.vendor ?? '—');
                                    const groupSum = calcGroupSum(group.items);
                                    return (
                                        <React.Fragment key={group.key}>
                                            <tr className="hover:bg-[#1C1F24]">
                                                <td className="p-2 align-middle">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedExpenseGroups((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                                                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                                                        aria-expanded={isExpanded}
                                                        aria-label={isExpanded ? 'Згорнути' : 'Розгорнути'}
                                                    >
                                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                </td>
                                                <td className="p-3 text-gray-400 text-xs">{formattedDate}</td>
                                                <td className="p-3 text-gray-400 text-xs">{invoiceNumber}</td>
                                                <td className="p-3 text-gray-400 text-xs min-w-0 truncate" title={typeof vendor === 'string' ? vendor : ''}>{vendor}</td>
                                                <td className="p-3 text-gray-400 text-xs">
                                                    {doc?.storage_path ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                aria-label="Переглянути документ"
                                                                title="Переглянути"
                                                                onClick={() => handleViewExpenseDocument(doc.storage_path)}
                                                                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                aria-label="Скачати документ"
                                                                title="Скачати"
                                                                onClick={() => handleDownloadExpenseDocument(doc.storage_path, doc.file_name || 'document')}
                                                                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : '—'}
                                                </td>
                                                <td className="p-3 text-gray-400 text-xs">{selectedProperty?.title ?? '—'}</td>
                                                <td className="p-3 text-right text-white font-mono text-xs">{groupSum.toFixed(2)} €</td>
                                                {isExpenseEditing && (
                                                    <td className="p-2 text-center align-middle">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteExpenseGroup(group)}
                                                            className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                            title="Видалити весь інвойс"
                                                            aria-label="Видалити весь інвойс"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={isExpenseEditing ? 8 : 7} className="p-0 bg-[#16181D] align-top">
                                                        <div className="px-4 pb-3 pt-0">
                                                            <table className="w-full text-sm text-left border border-gray-700 rounded-lg overflow-hidden">
                                                                <colgroup>
                                                                    <col className="w-[110px]" />
                                                                    <col className="w-[80px]" />
                                                                    <col />
                                                                    <col className="w-[60px]" />
                                                                    <col className="w-[85px]" />
                                                                    {isExpenseEditing && <col className="w-[70px]" />}
                                                                </colgroup>
                                                                <thead className="bg-[#23262b] text-gray-400">
                                                                    <tr>
                                                                        <th className="p-2 font-bold text-xs uppercase">Категорія</th>
                                                                        <th className="p-2 font-bold text-xs uppercase">Артикул</th>
                                                                        <th className="p-2 font-bold text-xs uppercase">Назва</th>
                                                                        <th className="p-2 font-bold text-xs uppercase text-right">К-сть</th>
                                                                        <th className="p-2 font-bold text-xs uppercase text-right">Ціна (од.)</th>
                                                                        {isExpenseEditing && <th className="p-2 font-bold text-xs uppercase text-center">Дії</th>}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-700/50">
                                                                    {group.items.map((item) => {
                                                                        const globalIndex = expenseItems.findIndex((i) => i.id === item.id);
                                                                        if (globalIndex < 0) return null;
                                                                        const cat = item.property_expense_categories;
                                                                        return (
                                                                            <tr key={item.id} className="hover:bg-[#1C1F24]">
                                                                                <td className="p-2 text-gray-400 text-xs">
                                                                                    {isExpenseEditing ? (
                                                                                        <select
                                                                                            value={item.category_id}
                                                                                            onChange={(e) => handleUpdateExpenseItem(globalIndex, 'category_id', e.target.value)}
                                                                                            className="bg-[#16181D] border border-gray-700 rounded px-2 py-1 text-xs text-white w-full"
                                                                                        >
                                                                                            {expenseCategories.filter((c) => c.is_active).map((c) => (
                                                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                                                            ))}
                                                                                            {expenseCategories.filter((c) => !c.is_active).map((c) => (
                                                                                                <option key={c.id} value={c.id}>{c.name} (архів)</option>
                                                                                            ))}
                                                                                        </select>
                                                                                    ) : (cat ? (cat.is_active ? cat.name : `${cat.name} (архів)`) : '—')}
                                                                                </td>
                                                                                <td className="p-2 text-gray-400 text-xs">
                                                                                    {isExpenseEditing ? (
                                                                                        <input
                                                                                            className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                                                                            value={item.article ?? ''}
                                                                                            onChange={(e) => handleUpdateExpenseItem(globalIndex, 'article', e.target.value)}
                                                                                        />
                                                                                    ) : (item.article ?? '—')}
                                                                                </td>
                                                                                <td className="p-2 min-w-0">
                                                                                    {isExpenseEditing ? (
                                                                                        <input
                                                                                            className="bg-transparent border-b border-gray-700 w-full text-sm text-white outline-none min-w-0"
                                                                                            value={item.name}
                                                                                            onChange={(e) => handleUpdateExpenseItem(globalIndex, 'name', e.target.value)}
                                                                                            placeholder="Назва"
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="block text-white font-semibold text-sm overflow-hidden truncate" title={item.name}>{item.name}</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-2 text-right">
                                                                                    {isExpenseEditing ? (
                                                                                        <input
                                                                                            type="number"
                                                                                            className="bg-transparent border-b border-gray-700 w-12 text-right text-white outline-none text-xs"
                                                                                            value={item.quantity ?? 1}
                                                                                            onChange={(e) => handleUpdateExpenseItem(globalIndex, 'quantity', parseFloat(e.target.value) || 0)}
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="text-gray-300 font-mono text-xs">{item.quantity ?? 0}</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-2 text-right">
                                                                                    {isExpenseEditing ? (
                                                                                        <input
                                                                                            type="number"
                                                                                            className="bg-transparent border-b border-gray-700 w-16 text-right text-white outline-none text-xs"
                                                                                            value={item.unit_price ?? 0}
                                                                                            onChange={(e) => handleUpdateExpenseItem(globalIndex, 'unit_price', parseFloat(e.target.value) || 0)}
                                                                                        />
                                                                                    ) : (
                                                                                        <span className="text-white font-mono text-xs">{(item.unit_price ?? 0).toFixed(2)} €</span>
                                                                                    )}
                                                                                </td>
                                                                                {isExpenseEditing && (
                                                                                    <td className="p-2 text-center">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleDeleteExpenseItem(globalIndex)}
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
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>
                )}
            </section>

            {/* Inventory */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6">
                <div className="flex justify-between items-center mb-4">
                    <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isPropertyInventoryCollapsed}
                        onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setPropertyInventoryCollapsed(!isPropertyInventoryCollapsed); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPropertyInventoryCollapsed(!isPropertyInventoryCollapsed); } }}
                    >
                        <button
                            type="button"
                            aria-expanded={!isPropertyInventoryCollapsed}
                            aria-label="Згорнути/розгорнути інвентар"
                            onClick={() => setPropertyInventoryCollapsed(!isPropertyInventoryCollapsed)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                        >
                            {isPropertyInventoryCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </button>
                        <h2 className="text-xl font-bold text-white">Меблі (Інвентар)</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        {isPropertyInventoryCollapsed ? (
                            <span className="text-gray-400 text-sm">Загальна вартість: <span className="text-emerald-400 font-semibold">{formatCurrencyEUR(totalInventoryCost)}</span></span>
                        ) : (
                            <>
                            <button 
                                onClick={() => {
                                  if (isPropertyInventoryCollapsed) setPropertyInventoryCollapsed(false);
                                  if (isInventoryEditing) handleSavePropertyInventory(); else setIsInventoryEditing(true);
                                }}
                                aria-label={isInventoryEditing ? 'Зберегти' : 'Редагувати'}
                                title={isInventoryEditing ? 'Зберегти' : 'Редагувати'}
                                className={`rounded-lg border transition-colors inline-flex items-center justify-center ${isInventoryEditing ? 'px-3 py-1.5 text-xs font-bold bg-emerald-500 text-white border-emerald-500' : 'p-2 bg-gray-800 text-gray-400 border-gray-700 hover:text-white hover:bg-gray-700'}`}
                            >
                                {isInventoryEditing ? <><Check className="w-3 h-3 mr-1 inline"/>Зберегти</> : <Edit className="w-4 h-4" />}
                            </button>
                            {isInventoryEditing && (
                                <button
                                    onClick={() => {
                                      if (isPropertyInventoryCollapsed) setPropertyInventoryCollapsed(false);
                                      handleAddInventoryRow();
                                    }}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                >
                                    <Plus className="w-3 h-3 mr-1 inline" /> Додати
                                </button>
                            )}
                            <button
                                onClick={() => setIsPropertyAddFromDocumentOpen(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
                            >
                                <Upload className="w-3 h-3 mr-1 inline" /> Додати з документа
                            </button>
                            </>
                        )}
                    </div>
                </div>
                {!isPropertyInventoryCollapsed && (
                <>
                <div className="rounded-lg border border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-sm text-left">
                        <colgroup>
                            <col className="w-[110px]" />
                            <col />
                            <col className="w-[70px]" />
                            <col className="w-[90px]" />
                            <col className="w-[110px]" />
                            <col className="w-[110px]" />
                            <col className="w-[90px]" />
                            <col className="w-[90px]" />
                            <col className="w-[90px]" />
                            {isInventoryEditing && <col className="w-[80px]" />}
                        </colgroup>
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-3 font-bold text-xs uppercase">Артикул</th>
                                <th className="p-3 font-bold text-xs uppercase">Назва товару</th>
                                <th className="p-3 font-bold text-xs uppercase text-right">К-сть</th>
                                <th className="p-3 font-bold text-xs uppercase text-right">Ціна (од.)</th>
                                <th className="p-3 font-bold text-xs uppercase">Номер інвойсу</th>
                                <th className="p-3 font-bold text-xs uppercase">Дата покупки</th>
                                <th className="p-3 font-bold text-xs uppercase">Магазин</th>
                                <th className="p-3 font-bold text-xs uppercase">Документ</th>
                                <th className="p-3 font-bold text-xs uppercase">Об'єкт</th>
                                {isInventoryEditing && (
                                  <th className="p-3 font-bold text-xs uppercase text-center">Дії</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                            {propertyInventoryLoading ? (
                              <tr><td colSpan={11} className="p-4 text-center text-gray-500 text-sm">Завантаження...</td></tr>
                            ) : (
                            propertyInventoryItems.map((item, idx) => {
                              const unitPrice = item.unit_price ?? 0;
                              const formattedPrice = unitPrice > 0 ? `€${Number(unitPrice).toFixed(2)}` : '-';
                              const formattedDate = item.purchase_date
                                ? new Date(item.purchase_date).toLocaleDateString('uk-UA', { year: 'numeric', month: '2-digit', day: '2-digit' })
                                : '-';
                              return (
                                <tr key={item.id} className="hover:bg-[#1C1F24]">
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                        value={item.article || ''}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'sku', e.target.value)}
                                        placeholder="SKU"
                                      />
                                    ) : (item.article || '-')}
                                  </td>
                                  <td className="p-3 min-w-0">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-white outline-none min-w-0"
                                        value={item.name || ''}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'name', e.target.value)}
                                        placeholder="Назва товару"
                                      />
                                    ) : (
                                      <span
                                        className="block text-white font-semibold text-sm overflow-hidden"
                                        title={item.name || ''}
                                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}
                                      >
                                        {item.name || '-'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    {isInventoryEditing ? (
                                      <input
                                        type="number"
                                        className="bg-transparent border-b border-gray-700 w-16 text-right text-white outline-none"
                                        value={Number(item.quantity) || 0}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'quantity', parseInt(e.target.value || '0', 10))}
                                      />
                                    ) : (
                                      <span className="text-gray-300 font-mono">{Number(item.quantity) || 0}</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    {isInventoryEditing ? (
                                      <input
                                        type="number"
                                        className="bg-transparent border-b border-gray-700 w-20 text-right text-white outline-none"
                                        value={unitPrice}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'unitPrice', parseFloat(e.target.value || '0'))}
                                      />
                                    ) : (
                                      <span className="text-white font-mono">{formattedPrice}</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                        value={item.invoice_number || ''}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'invoiceNumber', e.target.value)}
                                        placeholder="INV-..."
                                      />
                                    ) : (item.invoice_number || '-')}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        type="date"
                                        className="bg-transparent border-b border-gray-700 text-xs text-white outline-none"
                                        value={item.purchase_date || ''}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'purchaseDate', e.target.value)}
                                      />
                                    ) : formattedDate}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {isInventoryEditing ? (
                                      <input
                                        className="bg-transparent border-b border-gray-700 w-full text-xs text-white outline-none"
                                        value={item.store || ''}
                                        onChange={(e) => handleUpdateInventoryItem(idx, 'vendor', e.target.value)}
                                        placeholder="Магазин"
                                      />
                                    ) : (item.store || '-')}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {item.document_id && item.property_inventory_documents?.storage_path ? (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] text-gray-500 truncate max-w-[120px]" title={item.property_inventory_documents.invoice_number || item.property_inventory_documents.file_name || ''}>
                                          {item.property_inventory_documents.invoice_number || item.property_inventory_documents.file_name || 'Документ'}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            aria-label="Переглянути документ"
                                            title="Переглянути документ"
                                            onClick={() => handleViewInventoryDocument(item.property_inventory_documents!.storage_path!)}
                                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                                          >
                                            <Eye className="w-4 h-4" />
                                          </button>
                                          <button
                                            type="button"
                                            aria-label="Скачати документ"
                                            title="Скачати документ"
                                            onClick={() => handleDownloadInventoryDocument(item.property_inventory_documents!.storage_path!, item.property_inventory_documents?.file_name || 'document')}
                                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                                          >
                                            <Download className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                    ) : '—'}
                                  </td>
                                  <td className="p-3 text-gray-400 text-xs">
                                    {selectedProperty?.title ?? '-'}
                                  </td>
                                  {isInventoryEditing && (
                                    <td className="p-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteInventoryItem(idx)}
                                        className="text-red-500 hover:text-red-400 p-1"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm font-bold text-gray-400">
                      Загальна вартість:
                      <span className="text-emerald-500 ml-1">
                        {totalInventoryCost.toFixed(2)} €
                      </span>
                    </p>
                </div>
                </>
                )}
            </section>

            {/* Meter Readings — manual-only (property_meter_readings + property_meters). No meterLog/reservations/groupMeterReadingsByRental. */}
            {selectedPropertyId && (
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-gray-800 shadow-sm mb-6" data-meter-tile="manual">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <div
                        className="flex items-center gap-2 cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isMeterReadingsCollapsed}
                        onClick={(e) => { if (isInteractiveHeaderClickTarget(e.target)) return; setMeterReadingsCollapsed(!isMeterReadingsCollapsed); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMeterReadingsCollapsed(!isMeterReadingsCollapsed); } }}
                    >
                        <button
                            type="button"
                            aria-expanded={!isMeterReadingsCollapsed}
                            aria-label="Згорнути/розгорнути показання лічильників"
                            onClick={() => setMeterReadingsCollapsed(!isMeterReadingsCollapsed)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                        >
                            {isMeterReadingsCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                        </button>
                        <h2 className="text-xl font-bold text-white">Показання Лічильників</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        {isMeterReadingsCollapsed ? (
                            <span className="text-gray-400 text-sm">Total: <span className="text-white font-semibold">{formatCurrencyEUR(utilitiesCostFromMeters)}</span></span>
                        ) : (
                            <>
                            <button
                                type="button"
                                onClick={() => {
                                    if (isMeterReadingsCollapsed) setMeterReadingsCollapsed(false);
                                    setMeterEditValues(meterMetersList.reduce<Record<MeterType, string>>((acc, m) => { acc[m.type] = m.meter_number ?? ''; return acc; }, { strom: '', gas: '', wasser: '', heizung: '' }));
                                    setMeterEditUnit(meterMetersList.reduce<Record<MeterType, string>>((acc, m) => { acc[m.type] = (m.unit === 'm3' ? 'm³' : (m.unit ?? '')); return acc; }, { strom: '', gas: '', wasser: '', heizung: '' }));
                                    setMeterEditPricePerUnit(meterMetersList.reduce<Record<MeterType, string>>((acc, m) => { acc[m.type] = m.price_per_unit != null ? String(m.price_per_unit) : ''; return acc; }, { strom: '', gas: '', wasser: '', heizung: '' }));
                                    setIsMeterNumbersModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
                            >
                                Лічильники
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (isMeterReadingsCollapsed) setMeterReadingsCollapsed(false);
                                    setMeterAddingNewRow(true);
                                    const d = new Date();
                                    setMeterEditDraft({ reading_date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), strom: '', gas: '', wasser: '', heizung: '' });
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            >
                                + Додати зняття
                            </button>
                            </>
                        )}
                    </div>
                </div>
                {!isMeterReadingsCollapsed && (
                <>
                {meterReadingsLoading ? (
                    <div className="p-8 text-center text-gray-500 text-sm border border-gray-700 rounded-lg">Завантаження...</div>
                ) : (() => {
                    const metersByType: Record<MeterType, PropertyMeterRow | undefined> = { strom: undefined, gas: undefined, wasser: undefined, heizung: undefined };
                    meterMetersList.forEach((m) => { metersByType[m.type] = m; });
                    const formatDate = (d: string) => {
                        const [y, mo, day] = d.split('-');
                        return `${day}.${mo}.${y}`;
                    };
                    const parseMeterValue = (s: string): number | null => {
                        const t = s.trim();
                        if (t === '') return null;
                        const n = parseFloat(t.replace(',', '.'));
                        return Number.isFinite(n) ? n : null;
                    };
                    const nf = (value: number | null | undefined, maxDecimals = 2) =>
                        value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('uk-UA', { maximumFractionDigits: maxDecimals }).format(value);
                    const nf2 = (value: number | null | undefined) =>
                        value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
                    const eur = (value: number | null | undefined) =>
                        value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
                    const consumptionByType: Record<MeterType, number> = { strom: 0, gas: 0, wasser: 0, heizung: 0 };
                    const sortedReadings = [...meterReadingsManual].sort((a, b) => {
                        const d = a.reading_date.localeCompare(b.reading_date);
                        if (d !== 0) return d;
                        const c = (a.created_at || '').localeCompare(b.created_at || '');
                        if (c !== 0) return c;
                        return (a.id || '').localeCompare(b.id || '');
                    });
                    METER_TYPES.forEach((type) => {
                        const key = type as MeterType;
                        const withVal = sortedReadings.filter((r) => (r[key] as number | null) != null).map((r) => r[key] as number);
                        for (let i = 1; i < withVal.length; i++) {
                            const delta = withVal[i] - withVal[i - 1];
                            if (delta > 0) consumptionByType[key] += delta;
                        }
                    });
                    return (
                        <div className="overflow-x-auto border border-gray-700 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                                    <tr>
                                        <th className="p-2 text-left font-bold text-xs uppercase">Дата</th>
                                        {METER_TYPES.map((t) => (
                                            <th key={t} className="p-2 text-right font-bold text-xs uppercase">{t.charAt(0).toUpperCase() + t.slice(1)}</th>
                                        ))}
                                        <th className="p-2 text-center font-bold text-xs uppercase">Дії</th>
                                    </tr>
                                    <tr>
                                        <th className="p-2 text-left text-xs text-gray-500">{'\u00A0'}</th>
                                        {METER_TYPES.map((t) => (
                                            <th key={t} className="p-2 text-right text-xs font-mono text-gray-500">№ {metersByType[t]?.meter_number ?? '—'}</th>
                                        ))}
                                        <th className="p-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700/50 bg-[#16181D]">
                                    {meterAddingNewRow && meterEditDraft && (
                                        <tr className="bg-[#23262b]/50">
                                            <td className="p-2"><input type="date" value={meterEditDraft.reading_date} onChange={(e) => setMeterEditDraft((d) => d ? { ...d, reading_date: e.target.value } : null)} className="w-full max-w-[120px] bg-[#16181D] border border-gray-600 rounded px-2 py-1 text-xs text-white" /></td>
                                            {METER_TYPES.map((t) => (
                                                <td key={t} className="p-2"><input type="text" inputMode="decimal" value={meterEditDraft[t]} onChange={(e) => setMeterEditDraft((d) => d ? { ...d, [t]: e.target.value } : null)} className="w-full max-w-[80px] bg-[#16181D] border border-gray-600 rounded px-2 py-1 text-xs text-white text-right" placeholder="—" /></td>
                                            ))}
                                            <td className="p-2 text-center">
                                                <span className="text-gray-500 text-xs">📷0</span>
                                                <button type="button" onClick={async () => { if (!selectedPropertyId || !meterEditDraft.reading_date.trim()) return; const hasVal = METER_TYPES.some((k) => meterEditDraft![k].trim()); if (!hasVal) return; setIsMeterSaving(true); try { await propertyMeterService.createReading(selectedPropertyId, { reading_date: meterEditDraft.reading_date, strom: parseMeterValue(meterEditDraft.strom), gas: parseMeterValue(meterEditDraft.gas), wasser: parseMeterValue(meterEditDraft.wasser), heizung: parseMeterValue(meterEditDraft.heizung) }); refreshMeterData(); setMeterAddingNewRow(false); setMeterEditDraft(null); } catch (e) { console.error(e); alert('Не вдалося зберегти.'); } finally { setIsMeterSaving(false); } }} className="ml-1 text-emerald-400 hover:text-emerald-300 p-0.5" title="Зберегти">✅</button>
                                                <button type="button" onClick={() => { setMeterAddingNewRow(false); setMeterEditDraft(null); }} className="ml-0.5 text-red-400 hover:text-red-300 p-0.5" title="Скасувати">✖</button>
                                            </td>
                                        </tr>
                                    )}
                                    {meterReadingsManual.map((r) => {
                                        const photoCount = meterPhotoCountByReadingId[r.id] ?? 0;
                                        const isEditing = meterEditingReadingId === r.id;
                                        const draft = isEditing ? meterEditDraft : null;
                                        return (
                                            <tr key={r.id} className="hover:bg-[#1C1F24]">
                                                <td className="p-2 text-gray-300 text-xs">
                                                    {isEditing && draft ? <input type="date" value={draft.reading_date} onChange={(e) => setMeterEditDraft((d) => d ? { ...d, reading_date: e.target.value } : null)} className="w-full max-w-[120px] bg-[#16181D] border border-gray-600 rounded px-2 py-1 text-xs text-white" /> : formatDate(r.reading_date)}
                                                </td>
                                                {METER_TYPES.map((t) => (
                                                    <td key={t} className="p-2 text-right font-mono text-xs text-white">
                                                        {isEditing && draft ? <input type="text" inputMode="decimal" value={draft[t]} onChange={(e) => setMeterEditDraft((d) => d ? { ...d, [t]: e.target.value } : null)} className="w-full max-w-[80px] bg-[#16181D] border border-gray-600 rounded px-2 py-1 text-xs text-white text-right" placeholder="—" /> : (r[t] != null ? nf(r[t] as number, 2) : '—')}
                                                    </td>
                                                ))}
                                                <td className="p-2 text-center text-xs">
                                                    {isEditing && draft ? (
                                                        <><span className="text-gray-500">📷{photoCount}</span><button type="button" disabled={isMeterSaving} onClick={async () => { if (!draft) return; setIsMeterSaving(true); try { await propertyMeterService.updateReading(r.id, { reading_date: draft.reading_date, strom: parseMeterValue(draft.strom), gas: parseMeterValue(draft.gas), wasser: parseMeterValue(draft.wasser), heizung: parseMeterValue(draft.heizung) }); refreshMeterData(); setMeterEditingReadingId(null); setMeterEditDraft(null); } catch (e) { console.error(e); alert('Не вдалося зберегти.'); } finally { setIsMeterSaving(false); } }} className="ml-1 text-emerald-400 hover:text-emerald-300 p-0.5">✅</button><button type="button" onClick={() => { setMeterEditingReadingId(null); setMeterEditDraft(null); }} className="ml-0.5 text-red-400 hover:text-red-300 p-0.5">✖</button></>
                                                    ) : (
                                                        <><button type="button" onClick={() => setMeterGalleryReadingId(r.id)} className="text-gray-400 hover:text-white p-0.5" title="Фото">📷{photoCount}</button><button type="button" onClick={() => { setMeterEditingReadingId(r.id); setMeterEditDraft({ reading_date: r.reading_date, strom: r.strom != null ? String(r.strom) : '', gas: r.gas != null ? String(r.gas) : '', wasser: r.wasser != null ? String(r.wasser) : '', heizung: r.heizung != null ? String(r.heizung) : '' }); }} className="ml-1 text-gray-400 hover:text-white p-0.5" title="Редагувати">✏️</button>{meterDeleteConfirmId === r.id ? <><button type="button" onClick={async () => { try { await propertyMeterService.deleteReading(r.id); refreshMeterData(); setMeterDeleteConfirmId(null); } catch (e) { console.error(e); alert('Не вдалося видалити.'); } }} className="ml-1 text-red-400">Так</button><button type="button" onClick={() => setMeterDeleteConfirmId(null)} className="ml-0.5 text-gray-400">Ні</button></> : <button type="button" onClick={() => setMeterDeleteConfirmId(r.id)} className="ml-1 text-gray-400 hover:text-red-400 p-0.5" title="Видалити">🗑</button>}</>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-[#23262b] text-gray-400 border-t-2 border-gray-600">
                                    <tr><td className="p-2 text-xs font-bold">Споживання Δ</td>{METER_TYPES.map((t) => <td key={t} className="p-2 text-right font-mono text-xs text-white">{nf(consumptionByType[t], 2)}</td>)}<td className="p-2" /></tr>
                                    <tr><td className="p-2 text-xs font-bold">Ціна</td>{METER_TYPES.map((t) => { const m = metersByType[t]; const price = m?.price_per_unit; const unit = m?.unit; if (price == null || !Number.isFinite(price)) return <td key={t} className="p-2 text-right text-xs text-white">—</td>; if (unit) return <td key={t} className="p-2 text-right text-xs text-white">{`${nf2(price)} €/${unit}`}</td>; return <td key={t} className="p-2 text-right text-xs text-white">{`${nf2(price)} €`}</td>; })}<td className="p-2" /></tr>
                                    <tr><td className="p-2 text-xs font-bold">Сума</td>{METER_TYPES.map((t) => { const m = metersByType[t]; const consumption = consumptionByType[t]; const price = m?.price_per_unit; if (consumption == null || price == null || !Number.isFinite(consumption) || !Number.isFinite(price)) return <td key={t} className="p-2 text-right font-mono text-xs text-white">—</td>; return <td key={t} className="p-2 text-right font-mono text-xs text-white">{eur(consumption * price)}</td>; })}<td className="p-2" /></tr>
                                </tfoot>
                            </table>
                        </div>
                    );
                })()}
                </>
                )}
            </section>
            )}

            {/* Modals for meter tile */}
            {isMeterNumbersModalOpen && selectedPropertyId && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4" onClick={() => setIsMeterNumbersModalOpen(false)}>
                    <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Лічильники</h3>
                            <button type="button" onClick={() => setIsMeterNumbersModalOpen(false)} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 space-y-3">
                            {METER_TYPES.map((type) => (
                                <div key={type} className="space-y-1">
                                    <label className="block text-xs font-medium text-gray-400 capitalize">{type}</label>
                                    <input type="text" value={meterEditValues[type]} onChange={(e) => setMeterEditValues(prev => ({ ...prev, [type]: e.target.value }))} className="w-full bg-[#16181D] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="Номер лічильника" />
                                    <select value={meterEditUnit[type]} onChange={(e) => setMeterEditUnit(prev => ({ ...prev, [type]: e.target.value }))} className="w-full bg-[#16181D] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50">
                                                {METER_UNIT_OPTIONS.map((opt) => <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                    <input type="text" value={meterEditPricePerUnit[type]} onChange={(e) => setMeterEditPricePerUnit(prev => ({ ...prev, [type]: e.target.value }))} className="w-full bg-[#16181D] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" placeholder="Ціна за одиницю" />
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-gray-700 flex justify-end gap-2">
                            <button type="button" onClick={() => setIsMeterNumbersModalOpen(false)} className="px-3 py-1.5 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-700/50">Скасувати</button>
                            <button
                                type="button"
                                disabled={isMeterSaving}
                                onClick={async () => {
                                    if (!selectedPropertyId) return;
                                    setIsMeterSaving(true);
                                    try {
                                        for (const t of METER_TYPES) {
                                            const meterNumber = meterEditValues[t].trim() || null;
                                            let unit = meterEditUnit[t].trim() || null;
                                            if (unit === 'm3') unit = 'm³';
                                            const pricePerUnit = meterEditPricePerUnit[t].trim() ? parseFloat(meterEditPricePerUnit[t].replace(',', '.')) : null;
                                            await propertyMeterService.upsertMeter(selectedPropertyId, t, meterNumber, unit, pricePerUnit);
                                        }
                                        refreshMeterData();
                                        setIsMeterNumbersModalOpen(false);
                                    } catch (e) {
                                        console.error(e);
                                        alert('Не вдалося зберегти.');
                                    } finally {
                                        setIsMeterSaving(false);
                                    }
                                }}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                            >
                                {isMeterSaving ? 'Збереження...' : 'Зберегти'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Meter readings gallery modal */}
            {meterGalleryReadingId && (
                <div className="fixed inset-0 z-[221] flex items-center justify-center bg-black/60 p-4" onClick={() => setMeterGalleryReadingId(null)}>
                    <div className="bg-[#1C1F24] w-full max-w-2xl max-h-[90vh] rounded-xl border border-gray-700 shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                            <h3 className="text-lg font-bold text-white">Фото показників</h3>
                            <div className="flex items-center gap-2">
                                <input type="file" multiple accept="image/*" className="hidden" id="meter-gallery-upload" onChange={async (e) => { const files = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; if (!selectedPropertyId || !meterGalleryReadingId || files.length === 0) return; setGalleryLoading(true); try { await propertyMeterService.uploadReadingPhotos(selectedPropertyId, meterGalleryReadingId, files); const photos = await propertyMeterService.listReadingPhotos(meterGalleryReadingId); const withUrls = await Promise.all(photos.map((p) => propertyMeterService.getPhotoSignedUrl(p.storage_path).then((signedUrl) => ({ id: p.id, storage_path: p.storage_path, signedUrl })))); setGalleryPhotos(withUrls); refreshMeterData(); } catch (err) { console.error(err); alert('Не вдалося завантажити фото.'); } finally { setGalleryLoading(false); } }} />
                                <label htmlFor="meter-gallery-upload" className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 cursor-pointer hover:bg-emerald-500/30">+ Додати фото</label>
                                <button type="button" onClick={() => setMeterGalleryReadingId(null)} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                        <div className="p-4 overflow-auto flex-1">
                            {galleryLoading ? (
                                <p className="text-gray-500 text-sm">Завантаження...</p>
                            ) : galleryPhotos.length === 0 ? (
                                <p className="text-gray-500 text-sm">Немає фото.</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {galleryPhotos.map((p, i) => (
                                        <div key={p.id} className="relative group">
                                            <button type="button" onClick={() => window.open(p.signedUrl, '_blank')} className="block w-full rounded-lg overflow-hidden border border-gray-700 hover:border-emerald-500/50 transition-colors">
                                                <img src={p.signedUrl} alt="" className="w-full h-24 object-cover" />
                                            </button>
                                            <button type="button" onClick={async () => { try { await propertyMeterService.deleteReadingPhoto(p.id, p.storage_path); setGalleryPhotos((prev) => prev.filter((x) => x.id !== p.id)); refreshMeterData(); } catch (err) { console.error(err); alert('Не вдалося видалити фото.'); } }} className="absolute top-1 right-1 p-1 rounded bg-red-500/80 text-white text-xs opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity" title="Видалити">🗑</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Media & Plans — 4 tiles in one row, compact */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {(() => {
                  const photos = propertyMediaAssets.filter((a) => a.type === 'photo');
                  const reports = propertyMediaAssets.filter((a) => a.type === 'magic_plan_report').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  const floorPlans = propertyMediaAssets.filter((a) => a.type === 'floor_plan').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                  const tour3d = propertyMediaAssets.find((a) => a.type === 'tour3d');
                  const formatDate = (d: string) => { const x = new Date(d); const day = String(x.getDate()).padStart(2, '0'); const mo = String(x.getMonth() + 1).padStart(2, '0'); const y = x.getFullYear(); return `${day}.${mo}.${y}`; };
                  const photosCount = photos.length;
                  const latestMagicPlanStr = reports.length > 0 ? `Generated: ${formatDate(reports[0].created_at)}` : '—';
                  const latestFloorPlan = floorPlans[0];
                  const latestFloorPlanStr = latestFloorPlan && latestFloorPlan.size_bytes != null ? `PDF, ${(latestFloorPlan.size_bytes / (1024 * 1024)).toFixed(1)} MB` : '—';
                  const tour3dActive = !!(tour3d?.external_url);
                  return (
                    <>
                      <button type="button" onClick={() => setOpenMediaModalType('photo')} className="bg-[#1C1F24] p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex items-center gap-2 text-left min-h-0">
                        <div className="bg-yellow-500/10 p-2 rounded shrink-0 text-yellow-500"><Camera className="w-4 h-4"/></div>
                        <div className="min-w-0 flex-1"><h3 className="font-bold text-white text-xs">Галерея Фото</h3><p className="text-[10px] text-gray-500 truncate">{propertyMediaLoading ? '...' : `${photosCount} items`}</p></div>
                      </button>
                      <button type="button" onClick={() => setOpenMediaModalType('magic_plan_report')} className="bg-[#1C1F24] p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex items-center gap-2 text-left min-h-0">
                        <div className="bg-blue-500/10 p-2 rounded shrink-0 text-blue-500"><AreaChart className="w-4 h-4"/></div>
                        <div className="min-w-0 flex-1"><h3 className="font-bold text-white text-xs">Magic Plan Report</h3><p className="text-[10px] text-gray-500 truncate">{propertyMediaLoading ? '...' : latestMagicPlanStr}</p></div>
                      </button>
                      <button type="button" onClick={() => setOpenMediaModalType('tour3d')} className="bg-[#1C1F24] p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex items-center gap-2 text-left min-h-0">
                        <div className="bg-purple-500/10 p-2 rounded shrink-0 text-purple-500"><Box className="w-4 h-4"/></div>
                        <div className="min-w-0 flex-1"><h3 className="font-bold text-white text-xs">3D Тур</h3><p className="text-[10px] text-gray-500 truncate">{propertyMediaLoading ? '...' : (tour3dActive ? 'Active' : 'Not set')}</p></div>
                      </button>
                      <button type="button" onClick={() => setOpenMediaModalType('floor_plan')} className="bg-[#1C1F24] p-3 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors flex items-center gap-2 text-left min-h-0">
                        <div className="bg-emerald-500/10 p-2 rounded shrink-0 text-emerald-500"><PenTool className="w-4 h-4"/></div>
                        <div className="min-w-0 flex-1"><h3 className="font-bold text-white text-xs">План (Floor Plan)</h3><p className="text-[10px] text-gray-500 truncate">{propertyMediaLoading ? '...' : latestFloorPlanStr}</p></div>
                      </button>
                    </>
                  );
                })()}
            </section>

            {/* Property Media modals (Photo / Magic Plan / Floor Plan / 3D Tour) */}
            {openMediaModalType && selectedPropertyId && (() => {
              const type = openMediaModalType;
              const refreshMedia = () => propertyMediaService.listAssets(selectedPropertyId).then(setPropertyMediaAssets);
              const assets = propertyMediaAssets.filter((a) => a.type === type);
              const titles: Record<PropertyMediaAssetType, string> = { photo: 'Галерея Фото', magic_plan_report: 'Magic Plan Report', floor_plan: 'План (Floor Plan)', tour3d: '3D Тур' };
              return (
                <div className="fixed inset-0 z-[222] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpenMediaModalType(null)}>
                  <div className="bg-[#1C1F24] w-full max-w-2xl max-h-[90vh] rounded-xl border border-gray-700 shadow-xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
                      <h3 className="text-lg font-bold text-white">{titles[type]}</h3>
                      <button type="button" onClick={() => setOpenMediaModalType(null)} className="text-gray-400 hover:text-white p-1.5 rounded"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-4 overflow-auto flex-1">
                      {type === 'tour3d' ? (() => {
                        const TOUR3D_ACCEPT = '.obj,application/octet-stream';
                        const MAX_TOUR3D_SIZE = 50 * 1024 * 1024;
                        const allowedExts = ['.obj'];
                        const validateTour3dFile = (file: File): { ok: true } | { ok: false; message: string } => {
                          if (file.size > MAX_TOUR3D_SIZE) return { ok: false, message: 'Файл завеликий (max 50 MB)' };
                          const ext = file.name.toLowerCase().replace(/^.*\./, '.');
                          if (!allowedExts.includes(ext)) return { ok: false, message: 'Дозволений формат: OBJ' };
                          return { ok: true };
                        };
                        const handleTour3dFileSelect = (file: File | null): boolean => {
                          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
                          setMediaPreviewUrl(null);
                          setMediaStagedFile(null);
                          setTour3dViewerErrorCode(null);
                          if (!file) return false;
                          const v = validateTour3dFile(file);
                          if (!v.ok) { alert(v.message); return false; }
                          setMediaStagedFile(file);
                          setMediaPreviewUrl(URL.createObjectURL(file));
                          return true;
                        };
                        const handleTour3dClear = () => {
                          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
                          setMediaPreviewUrl(null);
                          setMediaStagedFile(null);
                          setTour3dViewerErrorCode(null);
                        };
                        const handleTour3dSave = async () => {
                          if (!mediaStagedFile) return;
                          const urlToRevoke = mediaPreviewUrl;
                          setMediaUploading(true);
                          try {
                            await propertyMediaService.uploadAssetFiles(selectedPropertyId, 'tour3d', [mediaStagedFile]);
                            await refreshMedia();
                            setMediaPreviewUrl(null);
                            setMediaStagedFile(null);
                            setOpenMediaModalType(null);
                          } catch (err) {
                            console.error(err);
                            alert('Не вдалося завантажити.');
                          } finally {
                            if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
                            setMediaPreviewUrl(null);
                            setMediaStagedFile(null);
                            setMediaUploading(false);
                          }
                        };
                        const handleTour3dCancel = () => {
                          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
                          setMediaPreviewUrl(null);
                          setMediaStagedFile(null);
                          setOpenMediaModalType(null);
                        };
                        const tour3dKind = 'obj' as const;
                        const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
                        return (
                          <div className="space-y-3">
                            <input type="file" accept={TOUR3D_ACCEPT} className="hidden" id="media-tour3d-upload"
                              onChange={(e) => {
                                const list = e.target.files;
                                const f = list?.[0] ?? null;
                                const multiple = list && list.length > 1;
                                const accepted = handleTour3dFileSelect(f);
                                e.currentTarget.value = '';
                                if (multiple && accepted) { setMediaMultiFileHint(true); setTimeout(() => setMediaMultiFileHint(false), 2500); }
                              }}
                            />
                            <div className="border border-dashed border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-gray-500 hover:bg-gray-800/30 transition-colors"
                              onClick={() => document.getElementById('media-tour3d-upload')?.click()}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const list = e.dataTransfer.files; const f = list?.[0] ?? null; const multiple = list && list.length > 1; const accepted = handleTour3dFileSelect(f); if (multiple && accepted) { setMediaMultiFileHint(true); setTimeout(() => setMediaMultiFileHint(false), 2500); } }}
                            >
                              {mediaStagedFile ? <span className="text-sm text-gray-300">{mediaStagedFile.name} · {formatSize(mediaStagedFile.size)}</span> : <span className="text-sm text-gray-400">Перетягніть OBJ або натисніть для вибору</span>}
                            </div>
                            {mediaMultiFileHint && <p className="text-xs text-gray-400">Використано перший файл з кількох.</p>}
                            {mediaStagedFile && mediaPreviewUrl && (
                              <>
                                <div className="rounded-lg border border-gray-700 overflow-hidden bg-[#16181D] min-h-[280px] max-h-[420px] h-72">
                                  <Model3DViewer
                                    url={mediaPreviewUrl}
                                    kind={tour3dKind}
                                    className="w-full h-full"
                                    onError={(info) => setTour3dViewerErrorCode(info.code)}
                                  />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button type="button" onClick={() => document.getElementById('media-tour3d-upload')?.click()} className="px-2 py-1 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-700/50">Змінити</button>
                                  <button type="button" onClick={handleTour3dClear} className="px-2 py-1 rounded text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10">Видалити</button>
                                  <button type="button" onClick={handleTour3dSave} disabled={mediaUploading} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50">{mediaUploading ? '...' : 'Зберегти'}</button>
                                  <button type="button" onClick={handleTour3dCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700/50">Скасувати</button>
                                </div>
                              </>
                            )}
                            {mediaStagedFile && !mediaPreviewUrl && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <button type="button" onClick={handleTour3dClear} className="px-2 py-1 rounded text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10">Видалити</button>
                                <button type="button" onClick={handleTour3dSave} disabled={mediaUploading} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50">{mediaUploading ? '...' : 'Зберегти'}</button>
                                <button type="button" onClick={handleTour3dCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700/50">Скасувати</button>
                              </div>
                            )}
                            {!mediaStagedFile && <div className="flex gap-2"><button type="button" onClick={handleTour3dCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700/50">Скасувати</button></div>}
                            <ul className="space-y-2">
                              {assets.map((a) => (
                                <li key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-700/50">
                                  <span className="text-sm text-white truncate">{a.file_name || a.storage_path || (a.external_url ? 'External link' : a.id)}</span>
                                  <div className="flex gap-1 shrink-0">
                                    {a.storage_path && <button type="button" onClick={async () => { try { const url = await propertyMediaService.getSignedUrl(a.storage_path!); window.open(url, '_blank'); } catch (e) { console.error(e); alert('Не вдалося відкрити.'); } }} className="px-2 py-1 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-700/50">Open</button>}
                                    {a.external_url && <button type="button" onClick={() => window.open(a.external_url!, '_blank')} className="px-2 py-1 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-700/50">Open</button>}
                                    <button type="button" onClick={async () => { if (!confirm('Видалити?')) return; try { await propertyMediaService.deleteAsset(a.id); refreshMedia(); } catch (e) { console.error(e); alert('Не вдалося видалити.'); } }} className="px-2 py-1 rounded text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10">Delete</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })() : type === 'photo' ? (() => {
                        const photos = assets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                        const selectedUrl = photoGallerySelectedId ? photoGallerySignedUrls[photoGallerySelectedId] : null;
                        const isCover = photoGallerySelectedId && photoGalleryCoverId === photoGallerySelectedId;
                        const fileInputId = 'media-photo-upload';
                        const handleUpload = async (files: File[]) => {
                          if (!files.length) return;
                          try {
                            await propertyMediaService.uploadAssetFiles(selectedPropertyId, 'photo', files);
                            await refreshMedia();
                            const list = await propertyMediaService.listAssets(selectedPropertyId);
                            setPropertyMediaAssets(list);
                            const newPhotos = list.filter((a) => a.type === 'photo').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                            const [coverId, urls] = await Promise.all([
                              propertyMediaService.getCoverPhotoAssetId(selectedPropertyId),
                              propertyMediaService.getPhotoSignedUrls(newPhotos),
                            ]);
                            setPhotoGalleryCoverId(coverId ?? null);
                            setPhotoGallerySignedUrls(urls);
                            setPhotoGallerySelectedId(newPhotos[0]?.id ?? null);
                          } catch (err) {
                            console.error(err);
                            alert('Не вдалося завантажити.');
                          }
                        };
                        const handleDelete = async () => {
                          if (!photoGallerySelectedId || !confirm('Видалити фото?')) return;
                          const wasCover = photoGalleryCoverId === photoGallerySelectedId;
                          try {
                            await propertyMediaService.deleteAsset(photoGallerySelectedId);
                            await refreshMedia();
                            const list = await propertyMediaService.listAssets(selectedPropertyId);
                            setPropertyMediaAssets(list);
                            const remaining = list.filter((a) => a.type === 'photo').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                            const [coverId, urls] = await Promise.all([
                              propertyMediaService.getCoverPhotoAssetId(selectedPropertyId),
                              propertyMediaService.getPhotoSignedUrls(remaining),
                            ]);
                            setPhotoGalleryCoverId(coverId ?? null);
                            setPhotoGallerySignedUrls(urls);
                            setPhotoGallerySelectedId(remaining[0]?.id ?? null);
                            if (wasCover) setCoverPhotoUrl(null);
                          } catch (e) {
                            console.error(e);
                            alert('Не вдалося видалити.');
                          }
                        };
                        return (
                          <div className="space-y-4 flex flex-col min-h-0">
                            <div className="flex items-center gap-2 shrink-0">
                              <input type="file" multiple accept="image/*" className="hidden" id={fileInputId} onChange={(e) => { const f = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; handleUpload(f); }} />
                              <label htmlFor={fileInputId} className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 cursor-pointer hover:bg-emerald-500/30">+ Додати фото</label>
                              <div
                                className="flex-1 min-w-0 border border-dashed border-gray-600 rounded-lg px-4 py-3 text-center text-sm text-gray-400 cursor-pointer hover:border-emerald-500/50 hover:text-gray-300"
                                onClick={() => document.getElementById(fileInputId)?.click()}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer?.files ? Array.from(e.dataTransfer.files).filter((x) => x.type.startsWith('image/')) : []; handleUpload(f); }}
                              >
                                Перетягни фото сюди або натисни щоб вибрати
                              </div>
                            </div>
                            <div className="flex-1 min-h-0 flex flex-col gap-3">
                              <div className="rounded-lg border border-gray-700 overflow-hidden bg-[#16181D] flex items-center justify-center min-h-[240px] shrink-0">
                                {selectedUrl ? (
                                  <img src={selectedUrl} alt="" className="max-h-[320px] w-auto object-contain" />
                                ) : (
                                  <span className="text-gray-500 text-sm">Обери фото знизу</span>
                                )}
                              </div>
                              {photoGallerySelectedId && (
                                <div className="flex items-center gap-2 flex-wrap shrink-0">
                                  {isCover ? (
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/50">Головне фото</span>
                                  ) : (
                                    <button type="button" onClick={async () => { try { await propertyMediaService.setCoverPhoto(selectedPropertyId, photoGallerySelectedId); setPhotoGalleryCoverId(photoGallerySelectedId); setCoverPhotoUrl(selectedUrl ?? null); } catch (e) { console.error(e); alert('Не вдалося встановити головне фото.'); } }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30">Зробити головним</button>
                                  )}
                                  <button type="button" onClick={handleDelete} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/50 text-red-400 hover:bg-red-500/10">Видалити</button>
                                </div>
                              )}
                              <div className="flex gap-2 overflow-x-auto pb-1 shrink-0" style={{ minHeight: 72 }}>
                                {photos.map((a) => (
                                  <button type="button" key={a.id} onClick={() => setPhotoGallerySelectedId(a.id)} className={`relative shrink-0 w-16 h-16 rounded border-2 overflow-hidden ${photoGallerySelectedId === a.id ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-gray-700'} ${photoGalleryCoverId === a.id ? 'ring-2 ring-amber-400' : ''}`}>
                                    {photoGallerySignedUrls[a.id] ? <img src={photoGallerySignedUrls[a.id]} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500 text-xs">...</div>}
                                    {photoGalleryCoverId === a.id && <span className="absolute top-0.5 right-0.5 text-amber-400" title="Головне">★</span>}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })() : (() => {
                        const MEDIA_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
                        const MAX_FILE_SIZE = 30 * 1024 * 1024;
                        const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
                        const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
                        const validateMediaFile = (file: File): { ok: true } | { ok: false; message: string } => {
                          if (file.size > MAX_FILE_SIZE) return { ok: false, message: 'Файл завеликий (max 30 MB)' };
                          const mimeOk = allowedMimes.includes(file.type);
                          const ext = file.name.toLowerCase().replace(/^.*\./, '.');
                          const extOk = allowedExts.includes(ext);
                          if (!mimeOk && !extOk) return { ok: false, message: 'Дозволені формати: PDF, JPG, PNG, WebP' };
                          return { ok: true };
                        };
                        const handleFileSelect = (file: File | null): boolean => {
                          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
                          setMediaPreviewUrl(null);
                          setMediaStagedFile(null);
                          if (!file) return false;
                          const v = validateMediaFile(file);
                          if (!v.ok) { alert(v.message); return false; }
                          setMediaStagedFile(file);
                          setMediaPreviewUrl(URL.createObjectURL(file));
                          return true;
                        };
                        const handleClearStaged = () => {
                          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
                          setMediaPreviewUrl(null);
                          setMediaStagedFile(null);
                        };
                        const handleSave = async () => {
                          if (!mediaStagedFile) return;
                          const urlToRevoke = mediaPreviewUrl;
                          setMediaUploading(true);
                          try {
                            await propertyMediaService.uploadAssetFiles(selectedPropertyId, type, [mediaStagedFile]);
                            await refreshMedia();
                            setMediaPreviewUrl(null);
                            setMediaStagedFile(null);
                            setOpenMediaModalType(null);
                          } catch (err) {
                            console.error(err);
                            alert('Не вдалося завантажити.');
                          } finally {
                            if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
                            setMediaPreviewUrl(null);
                            setMediaStagedFile(null);
                            setMediaUploading(false);
                          }
                        };
                        const handleCancel = () => {
                          if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
                          setMediaPreviewUrl(null);
                          setMediaStagedFile(null);
                          setOpenMediaModalType(null);
                        };
                        const isPdf = mediaStagedFile?.type === 'application/pdf' || /\.pdf$/i.test(mediaStagedFile?.name ?? '');
                        const isImage = mediaStagedFile && ['image/jpeg', 'image/png', 'image/webp'].includes(mediaStagedFile.type);
                        const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
                        return (
                          <div className="space-y-3">
                            <input
                              type="file"
                              accept={MEDIA_ACCEPT}
                              className="hidden"
                              id={`media-${type}-upload`}
                              onChange={(e) => {
                                const list = e.target.files;
                                const f = list?.[0] ?? null;
                                const multiple = list && list.length > 1;
                                const accepted = handleFileSelect(f);
                                e.currentTarget.value = '';
                                if (multiple && accepted) { setMediaMultiFileHint(true); setTimeout(() => setMediaMultiFileHint(false), 2500); }
                              }}
                            />
                            <div
                              className="border border-dashed border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-gray-500 hover:bg-gray-800/30 transition-colors"
                              onClick={() => document.getElementById(`media-${type}-upload`)?.click()}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const list = e.dataTransfer.files; const f = list?.[0] ?? null; const multiple = list && list.length > 1; const accepted = handleFileSelect(f); if (multiple && accepted) { setMediaMultiFileHint(true); setTimeout(() => setMediaMultiFileHint(false), 2500); } }}
                            >
                              {mediaStagedFile ? (
                                <span className="text-sm text-gray-300">{mediaStagedFile.name} · {formatSize(mediaStagedFile.size)}</span>
                              ) : (
                                <span className="text-sm text-gray-400">Перетягніть файл сюди або натисніть для вибору (PDF, JPG, PNG, WebP)</span>
                              )}
                            </div>
                            {mediaMultiFileHint && <p className="text-xs text-gray-400">Використано перший файл з кількох.</p>}
                            {mediaStagedFile && mediaPreviewUrl && (
                              <>
                                <div className="rounded-lg border border-gray-700 overflow-hidden bg-gray-900 min-h-[200px] max-h-[320px] flex items-center justify-center">
                                  {isPdf ? (
                                    <embed src={mediaPreviewUrl} type="application/pdf" className="w-full h-[300px]" title="PDF preview" />
                                  ) : isImage ? (
                                    <img src={mediaPreviewUrl} alt="" className="max-w-full max-h-[300px] object-contain" />
                                  ) : (
                                    <p className="text-gray-500 text-sm">Preview not available</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button type="button" onClick={() => document.getElementById(`media-${type}-upload`)?.click()} className="px-2 py-1 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-700/50">Змінити</button>
                                  <button type="button" onClick={handleClearStaged} className="px-2 py-1 rounded text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10">Видалити</button>
                                  <button type="button" onClick={handleSave} disabled={mediaUploading} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50">{mediaUploading ? '...' : 'Зберегти'}</button>
                                  <button type="button" onClick={handleCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700/50">Скасувати</button>
                                </div>
                              </>
                            )}
                            {mediaStagedFile && !mediaPreviewUrl && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <button type="button" onClick={handleClearStaged} className="px-2 py-1 rounded text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10">Видалити</button>
                                <button type="button" onClick={handleSave} disabled={mediaUploading} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 disabled:opacity-50">{mediaUploading ? '...' : 'Зберегти'}</button>
                                <button type="button" onClick={handleCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700/50">Скасувати</button>
                              </div>
                            )}
                            {!mediaStagedFile && (
                              <div className="flex gap-2">
                                <button type="button" onClick={handleCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-600 text-gray-400 hover:bg-gray-700/50">Скасувати</button>
                              </div>
                            )}
                            <ul className="space-y-2">
                              {assets.map((a) => (
                                <li key={a.id} className="flex items-center justify-between gap-2 py-2 border-b border-gray-700/50">
                                  <span className="text-sm text-white truncate">{a.file_name || a.storage_path || a.id}</span>
                                  <div className="flex gap-1 shrink-0">
                                    {a.storage_path && <button type="button" onClick={async () => { try { const url = await propertyMediaService.getSignedUrl(a.storage_path!); window.open(url, '_blank'); } catch (e) { console.error(e); alert('Не вдалося відкрити.'); } }} className="px-2 py-1 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-700/50">Open</button>}
                                    <button type="button" onClick={async () => { if (!confirm('Видалити?')) return; try { await propertyMediaService.deleteAsset(a.id); refreshMedia(); } catch (e) { console.error(e); alert('Не вдалося видалити.'); } }} className="px-2 py-1 rounded text-xs border border-red-500/50 text-red-400 hover:bg-red-500/10">Delete</button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Tasks tile — Facility tasks for this property */}
            <CollapsibleSection title="Tasks" defaultOpen={true}>
              <div className="mb-3 flex flex-wrap gap-2">
                {(['open', 'in_progress', 'completed', 'all'] as const).map(bucket => {
                  const label = bucket === 'open' ? 'Open' : bucket === 'in_progress' ? 'In Progress' : bucket === 'completed' ? 'Completed' : 'All';
                  const count = bucket === 'open' ? propertyTaskCounts.open : bucket === 'in_progress' ? propertyTaskCounts.inProgress : bucket === 'completed' ? propertyTaskCounts.completed : propertyTaskCounts.all;
                  const active = propertyTaskBucket === bucket;
                  return (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => setPropertyTaskBucket(bucket)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      {label} ({count})
                    </button>
                  );
                })}
              </div>
              {sortedPropertyTasks.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">No tasks for this apartment.</p>
              ) : (
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#16181D] divide-y divide-gray-700/50">
                  {sortedPropertyTasks.map(e => {
                    const assigneeId = getCalendarEventAssigneeId(e);
                    const resolvedName = getCalendarEventAssigneeName(e, (id) => workers.find((w) => w.id === id)?.name) || '';
                    const assigneeLabel = !assigneeId ? 'Unassigned' : (resolvedName || '—');
                    const assigneeMuted = !assigneeId || !resolvedName;

                    const addr = selectedProperty?.address || selectedProperty?.fullAddress || (selectedProperty as any)?.full_address || '—';
                    const addressUnit = `${addr} — ${selectedProperty?.title ?? '—'}`;

                    let rawPreview = ((e.description ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120))
                      || (propertyTaskComments[e.id] ?? '');
                    if (/^auto-generated:/i.test(rawPreview)) rawPreview = rawPreview.replace(/^auto-generated:\s*/i, '').trim();
                    const msgPreview = rawPreview || '—';

                    const st = e.status;
                    const statusMap: Record<string, { color: string; label: string }> = {
                      open: { color: 'bg-gray-500/20 text-gray-400', label: 'OPEN' },
                      assigned: { color: 'bg-blue-500/20 text-blue-400', label: 'ASSIGNED' },
                      in_progress: { color: 'bg-yellow-500/20 text-yellow-400', label: 'IN PROGRESS' },
                      completed: { color: 'bg-green-500/20 text-green-400', label: 'COMPLETED' },
                      verified: { color: 'bg-green-500/20 text-green-400', label: 'VERIFIED' },
                      archived: { color: 'bg-green-500/20 text-green-400', label: 'COMPLETED' },
                    };
                    const { color: statusColor, label: statusLabel } = statusMap[st] ?? { color: 'bg-gray-500/20 text-gray-400', label: st.toUpperCase() };

                    return (
                      <div key={e.id} className="flex items-center gap-x-3 px-3 py-2 text-sm min-w-0">
                        <span className="text-gray-400 w-12 shrink-0 text-xs tabular-nums">{e.time || '—'}</span>
                        {e.type && (
                          <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-purple-500/20 text-purple-300 whitespace-nowrap max-w-[100px] truncate">
                            {e.type}
                          </span>
                        )}
                        <span className="truncate min-w-0 text-gray-300" title={addressUnit}>{addressUnit}</span>
                        <span className={`shrink-0 text-xs truncate max-w-[110px] ${assigneeMuted ? 'text-gray-500 italic' : 'text-gray-400'}`} title={assigneeLabel}>{assigneeLabel}</span>
                        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase rounded whitespace-nowrap ${statusColor}`}>
                          {statusLabel}
                        </span>
                        <span className="hidden lg:block truncate min-w-0 text-gray-500 text-xs italic" title={msgPreview}>{msgPreview}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleSection>

            {/* 5. Актуальний Орендар — current occupancy from Rent Calendar (confirmedBookings) */}
            <CollapsibleSection title="5. Актуальний Орендар" defaultOpen={true}>
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#16181D]">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-x-4 gap-y-2 p-3 items-center text-sm">
                        <div className="text-xs font-bold text-gray-400 uppercase">Орендар</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Період</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Ночі</div>
                        <div className="text-xs font-bold text-gray-400 uppercase text-right tabular-nums">Осіб</div>
                        <div className="text-xs font-bold text-gray-400 uppercase text-right tabular-nums">Сплачено</div>
                        <div className="text-xs font-bold text-gray-400 uppercase text-right tabular-nums">Всього</div>
                        <div className="text-xs font-bold text-gray-400 uppercase">Дії</div>
                        {currentStay ? (() => {
                          const startD = parseDateAktOrendar(currentStay.start);
                          const endD = parseDateAktOrendar(currentStay.end);
                          const todayD = new Date();
                          todayD.setHours(0, 0, 0, 0);
                          const totalNights = dateDiffInDaysAktOrendar(startD, endD);
                          const nightsLived = Math.max(0, Math.min(dateDiffInDaysAktOrendar(startD, todayD), totalNights));
                          const nightsLeft = totalNights - nightsLived;
                          const guestsNum = (typeof currentStay.guests === 'string' && /(\d+)/.test(currentStay.guests)) ? (currentStay.guests.match(/(\d+)/)?.[1] ?? '—') : '—';
                          const formatEurAktOrendar = (v: string | number | undefined | null): string => {
                            if (v === undefined || v === null || v === '') return '0,00 €';
                            const s = String(v).replace(/,/g, '.').replace(/[^\d.-]/g, '');
                            const n = parseFloat(s);
                            return Number.isFinite(n) ? `${n.toFixed(2).replace('.', ',')} €` : '0,00 €';
                          };
                          const totalRaw = currentStay.totalGross ?? currentStay.price ?? 0;
                          const totalNum = Number(totalRaw);
                          const totalAmountNumSafe = Number.isFinite(totalNum) ? totalNum : 0;
                          const hasSourceInvoice = currentStay.sourceInvoiceId ?? (currentStay as any).source_invoice_id ?? null;
                          const statusLower = String(currentStay.status ?? '').toLowerCase();
                          const isPaidByStatus = statusLower === 'paid' || statusLower === 'invoiced';
                          const isPaidConfirmed = Boolean(hasSourceInvoice) || isPaidByStatus;
                          const paidAmountNum = isPaidConfirmed ? totalAmountNumSafe : 0;
                          return (
                            <>
                              <div className="text-white font-medium truncate">{currentStay.guest || '—'}</div>
                              <div className="text-gray-300">{formatDateUAAktOrendar(currentStay.start)} → {formatDateUAAktOrendar(currentStay.end)}</div>
                              <div className="text-gray-300">{totalNights} (прожито {nightsLived}, залишилось {nightsLeft})</div>
                              <div className="text-gray-300 text-right tabular-nums">{guestsNum}</div>
                              <div className="text-gray-300 text-right tabular-nums">{formatEurAktOrendar(paidAmountNum)}</div>
                              <div className="text-gray-300 text-right tabular-nums">{formatEurAktOrendar(totalAmountNumSafe)}</div>
                              <div className="flex flex-row gap-2 items-center">
                                <button
                                  type="button"
                                  disabled={!currentStay || !selectedPropertyId || uebergabeprotokollLoading}
                                  onClick={handleUebergabeprotokollGenerate}
                                  title={currentStay && selectedPropertyId ? 'Акт прийому-передачі (DOCX)' : 'Оберіть об\'єкт і наявність орендаря'}
                                  className="bg-gray-600 text-gray-400 py-1 px-2 rounded text-xs font-medium cursor-not-allowed disabled:opacity-60 disabled:cursor-not-allowed enabled:bg-emerald-600 enabled:text-white enabled:hover:bg-emerald-500 enabled:cursor-pointer"
                                >
                                  {uebergabeprotokollLoading ? '…' : 'ÜGP'}
                                </button>
                                <button
                                  type="button"
                                  disabled={!currentStay || !selectedPropertyId || uebergabeprotokollPdfLoading}
                                  onClick={handleUebergabeprotokollPdfPreview}
                                  title={currentStay && selectedPropertyId ? 'Перегляд PDF' : 'Оберіть об\'єкт і наявність орендаря'}
                                  className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed enabled:cursor-pointer border border-gray-600"
                                >
                                  {uebergabeprotokollPdfLoading ? <span className="text-xs">…</span> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </>
                          );
                        })() : (
                          <>
                            <div className="text-gray-500 italic col-span-6">Зараз ніхто не проживає</div>
                            <div className="flex flex-row gap-2 items-center">
                              <button type="button" disabled title="Акт прийому-передачі (DOCX)" className="bg-gray-600 text-gray-400 py-1 px-2 rounded text-xs font-medium cursor-not-allowed">ÜGP</button>
                            </div>
                          </>
                        )}
                    </div>
                </div>
            </CollapsibleSection>

            {false && (
            <>
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
            </>
            )}

            {/* 7. Дохід — property-scoped, same data as Payments page */}
            <CollapsibleSection title="7. Дохід" defaultOpen={true}>
                <div className="mb-4 p-4 border border-gray-700 rounded-lg bg-[#16181D] flex justify-between items-center">
                    <div>
                        <span className="text-xs text-gray-500 block">Отримано всього</span>
                        <span className="inline-flex items-center px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 font-medium tabular-nums text-lg text-emerald-400">
                            {formatCurrencyEUR(totalReceivedTile7)}
                        </span>
                    </div>
                    <span className="text-xs text-gray-400">
                        Остання оплата: {lastPaymentTile7
                            ? `${formatDateEU(lastPaymentTile7.date)} — ${formatCurrencyEUR(amountNumberTile7(lastPaymentTile7))} — ${lastPaymentTile7.invoiceNumber}`
                            : 'Немає оплат'}
                    </span>
                </div>
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#16181D]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4 font-bold text-xs uppercase">Number</th>
                                <th className="p-4 font-bold text-xs uppercase">Client</th>
                                <th className="p-4 font-bold text-xs uppercase">Date</th>
                                <th className="p-4 font-bold text-xs uppercase">Amount</th>
                                <th className="p-4 font-bold text-xs uppercase">Document</th>
                                <th className="p-4 font-bold text-xs uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {propertyPayments.length > 0 ? (
                                propertyPayments.map((proforma) => (
                                    <tr key={proforma.id} className="hover:bg-[#1C1F24]">
                                        <td className="p-4 font-mono text-gray-300">{proforma.invoiceNumber}</td>
                                        <td className="p-4 text-white">{proforma.clientName}</td>
                                        <td className="p-4 tabular-nums text-gray-300">{formatDateEU(dateISOTile7(proforma) || undefined)}</td>
                                        <td className="p-4 tabular-nums text-white">{formatCurrencyEUR(amountNumberTile7(proforma))}</td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                              {proforma.fileUrl ? (
                                                <a href={proforma.fileUrl} target="_blank" rel="noopener noreferrer" className={DOC_LINK_PILL}>
                                                  <FileText className="w-3.5 h-3.5" />
                                                  PDF
                                                </a>
                                              ) : null}
                                              {(proofSignedUrlByInvoiceId[proforma.id] ?? proforma.paymentProofUrl) ? (
                                                <a href={proofSignedUrlByInvoiceId[proforma.id] ?? proforma.paymentProofUrl ?? '#'} target="_blank" rel="noopener noreferrer" className={DOC_LINK_PILL}>
                                                  <FileText className="w-3.5 h-3.5" />
                                                  PDF
                                                </a>
                                              ) : null}
                                              {!proforma.fileUrl && !(proofSignedUrlByInvoiceId[proforma.id] ?? proforma.paymentProofUrl) ? (
                                                <span className="text-gray-500">—</span>
                                              ) : null}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {proforma.status === 'Paid' ? (
                                                <span className="text-emerald-400 text-xs">Confirmed ✓</span>
                                            ) : (
                                                <span className="text-gray-400 text-xs">{proforma.status ?? '—'}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="hover:bg-[#1C1F24]">
                                    <td colSpan={6} className="p-4 text-center text-gray-500">Немає оплат</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>

            {/* 8. Запити — property-scoped, read-only */}
            <CollapsibleSection title="8. Запити" defaultOpen={false}>
                <div className="bg-[#16181D] border border-gray-800 rounded-lg overflow-hidden">
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {propertyRequests.length > 0 ? (
                                propertyRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-[#16181D]">
                                        <td className="p-4 text-gray-400">#{req.id}</td>
                                        <td className="p-4 font-bold">{req.firstName} {req.lastName}</td>
                                        <td className="p-4">{req.email ?? '—'}</td>
                                        <td className="p-4">{req.phone ?? '—'}</td>
                                        <td className="p-4 tabular-nums">{formatDateEU(req.startDate)} – {formatDateEU(req.endDate)}</td>
                                        <td className="p-4">{req.peopleCount ?? '—'}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : req.status === 'processed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-gray-500/20 text-gray-500'}`}>
                                                {req.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-4 text-center text-gray-500">Немає записів</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>

            {/* 9. Резервації — property-scoped, read-only */}
            <CollapsibleSection title="9. Резервації" defaultOpen={false}>
                <div className="bg-[#16181D] border border-gray-800 rounded-lg overflow-hidden">
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {propertyReservations.length > 0 ? (
                                propertyReservations.map((res) => {
                                    const linkedOffer = offers.find((o) => o.reservationId != null && String(o.reservationId) === String(res.id));
                                    const offerNoDisplay = linkedOffer ? linkedOffer.offerNo ?? linkedOffer.id : '—';
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
                                            <td className={`p-4 font-mono text-sm truncate max-w-[140px] ${isLostOrCancelled ? 'text-gray-500' : 'text-gray-300'}`}>{res.reservationNo || String(res.id)}</td>
                                            <td className={`p-4 font-mono text-sm ${isLostOrCancelled ? 'text-gray-500' : 'text-gray-300'}`}>{offerNoDisplay}</td>
                                            <td className={`p-4 font-bold ${isLostOrCancelled ? 'text-gray-500 line-through' : ''}`}>{res.guest}</td>
                                            <td className={`p-4 ${isLostOrCancelled ? 'text-gray-500' : ''}`}>{getPropertyNameById((res as { roomId?: string }).roomId)}</td>
                                            <td className={`p-4 tabular-nums ${isLostOrCancelled ? 'text-gray-500' : ''}`}>{formatDateEU(res.start)} – {formatDateEU(res.end)}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${getReservationStatusBadge()}`}>{res.status}</span>
                                            </td>
                                            <td className={`p-4 text-right font-mono ${isLostOrCancelled ? 'text-gray-500' : ''}`}>{res.price ?? '—'}</td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-4 text-center text-gray-500">Немає записів</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>

            {/* 10. Офери — property-scoped, read-only */}
            <CollapsibleSection title="10. Офери" defaultOpen={false}>
                <div className="bg-[#16181D] border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                            <tr>
                                <th className="p-4">Proforma No.</th>
                                <th className="p-4">Offer No.</th>
                                <th className="p-4">Client</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {propertyOffers.length > 0 ? (
                                propertyOffers.map((offer) => {
                                    const isLost = offer.status === 'Lost';
                                    const [offerStart, offerEnd] = (offer.dates ?? '').split(' to ');
                                    const linkedProforma = invoices.find((inv) => inv.documentType === 'proforma' && (String(inv.offerId ?? inv.offerIdSource) === String(offer.id)));
                                    const getStatusStyle = () => {
                                        if (offer.status === 'Draft') return 'bg-gray-500/20 text-gray-400 border-gray-500';
                                        if (offer.status === 'Invoiced') return 'bg-purple-500/20 text-purple-400 border-purple-500';
                                        if (offer.status === 'Accepted') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500';
                                        if (offer.status === 'Lost') return 'bg-red-500/20 text-red-400 border-red-500';
                                        return 'bg-blue-500/20 text-blue-500 border-blue-500';
                                    };
                                    return (
                                        <tr key={offer.id} className={`hover:bg-[#16181D] ${isLost ? 'opacity-70' : ''}`}>
                                            <td className={`p-4 font-mono text-sm ${isLost ? 'text-gray-500' : 'text-gray-300'}`}>{linkedProforma?.invoiceNumber ?? '—'}</td>
                                            <td className={`p-4 font-mono text-sm ${isLost ? 'text-gray-500' : 'text-gray-300'}`}>{offer.offerNo ?? '—'}</td>
                                            <td className={`p-4 font-bold ${isLost ? 'text-gray-500 line-through' : ''}`}>{offer.clientName}</td>
                                            <td className={`p-4 ${isLost ? 'text-gray-500' : ''}`}>{getPropertyNameById(offer.propertyId)}</td>
                                            <td className={`p-4 tabular-nums ${isLost ? 'text-gray-500' : ''}`}>{offerStart && offerEnd ? [offerStart, offerEnd].map((d) => formatDateEU(d)).join(' – ') : '—'}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded text-xs font-bold border border-dashed ${getStatusStyle()}`}>{offer.status}</span>
                                            </td>
                                            <td className={`p-4 text-right font-mono ${isLost ? 'text-gray-500' : ''}`}>{offer.price ?? '—'}</td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-4 text-center text-gray-500">Немає записів</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>

            {/* 11. Документи — Virtual Documents Manager (read-only) */}
            <CollapsibleSection title="11. Документи" defaultOpen={false}>
                {selectedProperty && (
                    <VirtualDocumentsManager propertyId={selectedProperty.id} />
                )}
            </CollapsibleSection>

            {/* 12. Apartment Statistics */}
            <CollapsibleSection title="12. Apartment Statistics" defaultOpen={false}>
              <ApartmentStatisticsSection
                dashboardProperty={selectedProperty}
                dashboardBookings={confirmedBookings}
                dashboardReservations={reservationsForDashboardStats}
                dashboardOffers={offers}
                dashboardProformas={proformas}
                roomsCount={getRoomsCount(selectedProperty)}
                rentTimelineRows={rentTimelineRows}
                expenseItems={expenseItems}
                totalInventoryCost={totalInventoryCost}
                utilitiesCost={utilitiesCostFromMeters}
                selectedMonth={statsSelectedMonth}
                onSelectedMonthChange={setStatsSelectedMonth}
                pricePerRoomNight={Number(selectedProperty?.planningPricePerRoom ?? 0)}
                onPricePerRoomNightChange={handleStatsPlanningPriceChange}
                formatCurrency={formatCurrencyEUR}
                showDebug={import.meta.env.DEV}
              />
            </CollapsibleSection>

            {/* Danger Zone: Archive / Restore / Delete permanently */}
            <section className="bg-[#1C1F24] p-6 rounded-xl border border-red-900/40 shadow-sm mb-6">
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Danger Zone</h2>
              <div className="flex flex-wrap gap-3">
                {selectedProperty.archivedAt == null ? (
                  <button type="button" onClick={() => setArchiveModalPropertyId(selectedProperty.id)} className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors flex items-center gap-2">
                    <Archive className="w-4 h-4" /> Archive property
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={async () => { try { await propertiesService.restoreProperty(selectedProperty.id); const data = await propertiesService.getAll(); setProperties(data); } catch (e) { alert(e instanceof Error ? e.message : 'Помилка'); } }} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white transition-colors flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" /> Restore
                    </button>
                    <button type="button" onClick={() => { setDeleteModalPropertyId(selectedProperty.id); setDeleteConfirmInput(''); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center gap-2">
                      <Trash2 className="w-4 h-4" /> Delete permanently
                    </button>
                  </>
                )}
              </div>
            </section>

            </>
            )}
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

    return (
      <div className="h-full w-full bg-[#0D1117] text-white flex flex-col overflow-auto">
        <div className="px-6 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-xl font-bold">Facility Overview</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Поточна вартість залишків на складі та історія перевезень у квартири (підтверджені рухи).
          </p>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div className="bg-[#161B22] border border-gray-800 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-white">Вартість інвентарю на складі</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">Current stock value — усі склади, поточні залишки × ціна за одиницю</p>
                  {isLoadingWarehouseStock ? (
                    <p className="text-sm text-gray-500 mt-3">Завантаження…</p>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-white mt-3 tabular-nums">
                        €{facilityOverviewWarehouseValueEuro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {warehouseStockError && (
                        <p className="text-[11px] text-amber-400 mt-2">{warehouseStockError}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#161B22] border border-gray-800 rounded-lg p-5 xl:row-span-1">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <History className="w-5 h-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">Історія перевезень (склад → квартира)</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Лише реальні перевезення склад → квартира після підтвердження задачі (рух OUT у системі).
                  </p>
                </div>
              </div>
              {facilityTransferLogLoading ? (
                <p className="text-sm text-gray-500 py-6 text-center">Завантаження…</p>
              ) : facilityTransferLogError ? (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">{facilityTransferLogError}</p>
              ) : facilityTransferLog.length === 0 ? (
                <div className="py-10 text-center text-gray-500 text-sm border border-dashed border-gray-700 rounded-md">
                  Поки немає підтверджених перевезень. Після виконання задачі Facility з перевезенням з&apos;явиться запис.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-800 rounded-md max-h-[min(24rem,50vh)] overflow-y-auto">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-[#020617] text-gray-400 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium">Дата / час</th>
                        <th className="px-2 py-2 text-left font-medium">Склад</th>
                        <th className="px-2 py-2 text-left font-medium">Квартира</th>
                        <th className="px-2 py-2 text-left font-medium">Товар</th>
                        <th className="px-2 py-2 text-right font-medium">К-сть</th>
                        <th className="px-2 py-2 text-left font-medium">Од.</th>
                        <th className="px-2 py-2 text-left font-medium">Працівник</th>
                        <th className="px-2 py-2 text-left font-medium">Статус</th>
                        <th className="px-2 py-2 text-left font-medium">ID руху</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {facilityTransferLog.map((row) => {
                        const dt = row.date ? new Date(row.date) : null;
                        const when = dt && !Number.isNaN(dt.getTime())
                          ? dt.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
                          : '—';
                        const workerLabel = row.workerId
                          ? workerNameByIdForFacility.get(row.workerId) ?? row.workerId.slice(0, 8) + '…'
                          : '—';
                        return (
                          <tr key={row.id} className="hover:bg-white/[0.03]">
                            <td className="px-2 py-2 text-gray-300 whitespace-nowrap">{when}</td>
                            <td className="px-2 py-2 text-gray-300 max-w-[8rem] truncate" title={row.warehouseName}>
                              {row.warehouseName}
                            </td>
                            <td className="px-2 py-2 text-gray-300 max-w-[12rem] truncate" title={row.propertyLabel}>
                              {row.propertyLabel}
                            </td>
                            <td className="px-2 py-2 text-gray-100 max-w-[14rem]">
                              <div className="truncate font-medium" title={row.itemName}>{row.itemName}</div>
                              {row.sku && <div className="text-[10px] text-gray-500 truncate">SKU: {row.sku}</div>}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-gray-200">{row.quantity}</td>
                            <td className="px-2 py-2 text-gray-400">{row.unit ?? '—'}</td>
                            <td className="px-2 py-2 text-gray-400 max-w-[7rem] truncate" title={workerLabel}>
                              {workerLabel}
                            </td>
                            <td className="px-2 py-2 text-emerald-400/90">Підтверджено</td>
                            <td className="px-2 py-2 text-gray-500 font-mono text-[10px]" title={row.id}>
                              {row.id.slice(0, 8)}…
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
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

  const transferQuantityInputsValid =
    selectedStockItems.length > 0 &&
    selectedStockItems.every((row) => {
      const maxQ = Math.floor(Number(row.quantity) || 0);
      const q = transferQuantitiesByStockId[row.stockId];
      return maxQ >= 1 && Number.isInteger(q) && q >= 1 && q <= maxQ;
    });

  const renderSalesContent = () => {
    if (salesTab === 'dashboard') {
      return (
        <SalesStatsSection
          reservations={reservations}
          offers={offers}
          confirmedBookings={confirmedBookings}
          adminEvents={adminEvents}
          properties={properties}
          invoices={invoices}
          leads={leads}
          onViewProforma={(proformaId) => {
            setSalesTab('proformas');
            setExpandedProformaIds((prev) => new Set([...prev, proformaId]));
          }}
        />
      );
    }
    if (salesTab === 'leads') {
        return (
            <div className="p-8 bg-[#0D1117] text-white">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <h2 className="text-2xl font-bold">Leads List</h2>
                  <button
                    type="button"
                    onClick={() => setIsCreateLeadModalOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    Create Lead
                  </button>
                </div>
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
                                <tr
                                    key={lead.id}
                                    onClick={() => setClientHistoryLead(lead)}
                                    className="hover:bg-[#16181D] cursor-pointer"
                                >
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
                                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-2">
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setEditingLead(lead); }} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Редагувати"><Edit className="w-4 h-4" /></button>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors" title="Видалити"><Trash2 className="w-4 h-4" /></button>
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
                                <th className="p-4">Client</th>
                                <th className="p-4">Property</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {allOfferRows.map((row) => {
                                const rowOffer = offers.find((offer) => offer.id === row.offerId);
                                const linkedProforma = invoices.find((inv) => inv.documentType === 'proforma' && String(inv.offerId || inv.offerIdSource) === String(row.offerId));
                                const isMuted = ['Draft', 'Invoiced', 'Lost', 'Rejected', 'Expired', 'Converted'].includes(row.status);
                                const getStatusStyle = () => {
                                  if (row.status === 'Draft') return 'bg-gray-500/20 text-gray-400 border-gray-500';
                                  if (row.status === 'Invoiced' || row.status === 'Converted') return 'bg-purple-500/20 text-purple-400 border-purple-500';
                                  if (row.status === 'Selected') return 'bg-amber-500/20 text-amber-400 border-amber-500';
                                  if (row.status === 'Rejected' || row.status === 'Expired' || row.status === 'Lost') return 'bg-red-500/20 text-red-400 border-red-500';
                                  if (row.status === 'Accepted') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500';
                                  return 'bg-blue-500/20 text-blue-500 border-blue-500';
                                };

                                return (
                                  <tr key={row.rowId} className={`hover:bg-[#16181D] ${isMuted ? 'opacity-70' : ''}`}>
                                    <td className="p-4 text-gray-300 font-mono text-sm">{linkedProforma?.invoiceNumber ?? '—'}</td>
                                    <td className="p-4 text-gray-300 font-mono text-sm">{row.offerNo ?? '—'}</td>
                                    <td className="p-4 font-bold">{row.clientName}</td>
                                    <td className="p-4">{row.apartmentLine}</td>
                                    <td className="p-4 tabular-nums">{[row.startDate, row.endDate].filter(Boolean).map((d) => formatDateEU(d)).join(' – ')}</td>
                                    <td className="p-4">
                                      <span className={`px-2 py-1 rounded text-xs font-bold border border-dashed ${getStatusStyle()}`}>
                                        {row.status}
                                      </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">{row.price}</td>
                                    <td className="p-4 text-center">
                                      <div className="flex justify-between items-center gap-4">
                                        <div className="flex gap-2 items-center">
                                          {rowOffer && row.status === 'Draft' && (
                                            <button
                                              onClick={() => setOffers((prev) => prev.map((offer) => offer.id === rowOffer.id ? { ...offer, status: 'Sent' } : offer))}
                                              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-xs font-bold transition-colors"
                                            >
                                              Send Offer
                                            </button>
                                          )}
                                          {rowOffer && row.status === 'Sent' && (
                                            <button
                                              onClick={() => handleCreateInvoiceClick(rowOffer)}
                                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold transition-colors"
                                            >
                                              Add Proforma
                                            </button>
                                          )}
                                          {row.status === 'Invoiced' || row.status === 'Converted' ? (
                                            <span className="px-3 py-1.5 text-gray-500 text-xs">Proforma added</span>
                                          ) : null}
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                          {rowOffer && (
                                            <>
                                              <button
                                                onClick={() => handleViewOffer(rowOffer)}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-colors"
                                              >
                                                View
                                              </button>
                                              <button
                                                onClick={() => handleDeleteOffer(rowOffer.id)}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold transition-colors"
                                                title="Delete offer"
                                              >
                                                Delete
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                            })}
                            {allOfferRows.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-500">No offers found.</td>
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
                                <th className="p-4">Operating Company</th>
                                <th className="p-4">Client</th>
                                <th className="px-2 py-2">Date</th>
                                <th className="px-2 py-2 text-right tabular-nums w-24">Price/night</th>
                                <th className="px-2 py-2 text-right tabular-nums w-20">Net</th>
                                <th className="px-2 py-2 text-right tabular-nums w-20">VAT</th>
                                <th className="px-2 py-2 text-right tabular-nums w-20">Kaution</th>
                                <th className="p-4 w-28">Kaution Status</th>
                                <th className="px-2 py-2 text-right tabular-nums w-20">Gross</th>
                                <th className="px-2 py-2 text-right tabular-nums">Remaining</th>
                                <th className="p-4">Document</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right w-32">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {proformas.map(proforma => {
                                const lost = isProformaLost(proforma);
                                const offerId = proforma.offerId || proforma.offerIdSource;
                                const linkedOffer = offerId ? offers.find(o => String(o.id) === String(offerId)) : undefined;
                                const propertyId = getPropertyIdForProforma(proforma, { offers, reservations, confirmedBookings });
                                const linkedProperty = propertyId ? properties.find(p => String(p.id) === String(propertyId)) : undefined;
                                const operatingCompanyDisplay = (linkedProperty?.secondCompany?.name ?? '').trim() || (linkedProperty?.tenant?.name ?? '').trim() || '—';
                                const priceNight = linkedOffer?.nightlyPrice != null ? `€${Number(linkedOffer.nightlyPrice).toFixed(2)}` : '—';
                                const kautionVal = linkedOffer ? (linkedOffer.kaution != null ? `€${Number(linkedOffer.kaution).toFixed(2)}` : '€0.00') : '—';
                                const numCell = 'px-2 py-2 text-right tabular-nums whitespace-nowrap';
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
                                        <td className={`p-4 ${lost ? 'line-through text-gray-500' : ''}`}>{operatingCompanyDisplay}</td>
                                        <td className={`p-4 ${lost ? 'line-through text-gray-500' : ''}`}>{proforma.clientName}</td>
                                        <td className="px-2 py-2 tabular-nums">{formatDateEU(proforma.date)}</td>
                                        <td className={numCell}>{priceNight}</td>
                                        <td className={numCell}>{proforma.totalNet != null ? `€${Number(proforma.totalNet).toFixed(2)}` : '—'}</td>
                                        <td className={numCell}>{proforma.taxAmount != null ? `€${Number(proforma.taxAmount).toFixed(2)}` : '—'}</td>
                                        <td className={numCell}>{kautionVal}</td>
                                        <td className="p-4">
                                            {linkedOffer && linkedOffer.kaution != null && Number(linkedOffer.kaution) > 0 ? (
                                              <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                                                {proforma.kautionStatus === 'returned' ? (
                                                  <>
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">Returned</span>
                                                    {!lost && (
                                                      <button
                                                        type="button"
                                                        onClick={async () => {
                                                          try {
                                                            await invoicesService.update(proforma.id, { ...proforma, kautionStatus: 'not_returned' });
                                                            setProformas((prev) => prev.map((p) => (p.id === proforma.id ? { ...p, kautionStatus: 'not_returned' as const } : p)));
                                                            setInvoices((prev) => prev.map((inv) => (inv.id === proforma.id ? { ...inv, kautionStatus: 'not_returned' as const } : inv)));
                                                          } catch (e) {
                                                            console.error(e);
                                                            alert((e as Error)?.message ?? 'Failed to update');
                                                          }
                                                        }}
                                                        className="text-xs text-emerald-400 hover:text-emerald-300"
                                                      >
                                                        Undo
                                                      </button>
                                                    )}
                                                  </>
                                                ) : (
                                                  <>
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">Not Returned</span>
                                                    {!lost && (
                                                      <button
                                                        type="button"
                                                        onClick={async () => {
                                                          try {
                                                            await invoicesService.update(proforma.id, { ...proforma, kautionStatus: 'returned' });
                                                            setProformas((prev) => prev.map((p) => (p.id === proforma.id ? { ...p, kautionStatus: 'returned' as const } : p)));
                                                            setInvoices((prev) => prev.map((inv) => (inv.id === proforma.id ? { ...inv, kautionStatus: 'returned' as const } : inv)));
                                                          } catch (e) {
                                                            console.error(e);
                                                            alert((e as Error)?.message ?? 'Failed to update');
                                                          }
                                                        }}
                                                        className="text-xs text-emerald-400 hover:text-emerald-300"
                                                      >
                                                        Mark returned
                                                      </button>
                                                    )}
                                                  </>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="text-gray-500">—</span>
                                            )}
                                        </td>
                                        <td className={numCell}>{proforma.totalGross != null ? `€${Number(proforma.totalGross).toFixed(2)}` : '—'}</td>
                                        <td className={`${numCell} text-right`}>
                                            {(() => {
                                              const invTotal = invoicedTotalByProformaId[proforma.id] ?? 0;
                                              const proformaGross = proforma.totalGross ?? 0;
                                              const remaining = proformaGross - invTotal;
                                              const rounded = Number(remaining.toFixed(2));
                                              if (rounded > 0) {
                                                return <span className="text-red-400">€{rounded.toFixed(2)}</span>;
                                              }
                                              if (rounded === 0) {
                                                return <span className="text-emerald-400">€0.00</span>;
                                              }
                                              return <>-€{Math.abs(rounded).toFixed(2)}</>;
                                            })()}
                                        </td>
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
                                            {[...(paymentProofsByInvoiceId[proforma.id] ?? [])]
                                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                                .map(proof => (
                                                        <tr key={proof.id} className="text-sm text-gray-300 hover:bg-[#16181D]">
                                                            <td className="p-4" />
                                                            <td className="p-4 pl-8 font-mono">{proof.documentNumber ?? '—'}</td>
                                                            <td className="p-4 text-gray-500">—</td>
                                                            <td className="p-4" />
                                                            <td className="px-2 py-2 tabular-nums text-gray-400">{formatDateEU(proof.createdAt)}</td>
                                                            <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                            <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                            <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                            <td className="p-4 text-gray-500">—</td>
                                                            <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                            <td className="px-2 py-2 text-gray-500">—</td>
                                                            <td className="px-2 py-2 text-gray-500">—</td>
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
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPaymentProofModal({ mode: 'replace', proof })}
                                                                            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
                                                                        >
                                                                            Replace
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPaymentProofModal({ mode: 'add', proof })}
                                                                            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
                                                                        >
                                                                            Add PDF
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            {(proformaChildInvoices[proforma.id] ?? []).map(inv => (
                                                <tr key={inv.id} className="text-sm text-gray-300 hover:bg-[#16181D]">
                                                    <td className="p-4" />
                                                    <td className="p-4 pl-8 font-mono">{inv.invoiceNumber}</td>
                                                    <td className="p-4 text-gray-500">—</td>
                                                    <td className="p-4" />
                                                    <td className="px-2 py-2 tabular-nums">{formatDateEU(inv.date)}</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">—</td>
                                                    <td className="p-4 text-gray-500">—</td>
                                                    <td className="px-2 py-2 text-right tabular-nums">€{inv.totalGross?.toFixed(2) ?? '—'}</td>
                                                    <td className="px-2 py-2 text-gray-500">—</td>
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
                                                <td colSpan={14} className="p-4 pl-8 text-left">
                                                    <button
                                                        type="button"
                                                        disabled={lost}
                                                        onClick={() => !lost && handleAddInvoiceToProforma(proforma)}
                                                        className="text-left hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        + Add invoice
                                                    </button>
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                </React.Fragment>
                                );
                            })}
                            {proformas.length === 0 && (
                                <tr>
                                    <td colSpan={15} className="p-8 text-center text-gray-500">No payments yet. Add a proforma from an offer (Offers tab → Add Proforma).</td>
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
                                    <td className="p-4 text-gray-400">{req.property ? `${req.property.address ?? ''} — ${req.property.title ?? ''}`.trim() || `#${req.id}` : `#${req.id}`}</td>
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
          onSaveMultiApartmentOffer={handleSaveMultiApartmentOffer}
          onSaveDirectBooking={handleSaveDirectBookingFromCalendar}
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
          proofSignedUrlByInvoiceId={proofSignedUrlByInvoiceId}
          adminEvents={adminEvents}
          properties={properties}
          sortPrefsUserId={worker?.id ?? null}
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
          onShowToast={setToastMessage}
          offerModalCloseRef={offerModalCloseRef}
          onStuckClearAccountDashboardSaveLock={onStuckClearAccountDashboardSaveLock}
          stayContext={stayOverviewContext}
          onOpenOfferFromCalendar={handleViewOffer}
          onOpenProformaFromCalendar={handleAddInvoiceToProforma}
          onOpenInvoiceFromCalendar={handleViewInvoice}
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

  if (worker?.role === 'worker') {
    return (
      <div className="flex h-screen bg-[#111315] text-white items-center justify-center font-sans px-4">
        <p className="text-gray-400 text-center">Перенаправлення до мобільного інтерфейсу…</p>
      </div>
    );
  }

  if (worker && firstAllowedDashboardModule(worker) == null) {
    return (
      <div className="flex h-screen bg-[#111315] text-white items-center justify-center font-sans px-4">
        <p className="text-gray-400 text-center">Немає доступу до панелі керування.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#111315] text-white overflow-hidden font-sans">
      <div className="fixed left-0 top-0 h-full z-30" onMouseLeave={() => setSidebarOpen(false)}>
        <div className="fixed left-0 top-0 h-full w-4 z-20" onMouseEnter={() => setSidebarOpen(true)} aria-hidden />
        <div className={`fixed left-0 top-0 h-full w-64 z-30 flex flex-col border-r border-gray-800 bg-[#111315] transition-transform duration-300 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ willChange: 'transform' }}>
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Building2 className="w-6 h-6 text-emerald-500" /> HeroRooms</h1>
        </div>
        <div className="flex-1 overflow-y-auto py-4 space-y-1 px-3">
          {/* Admin Section — can_manage_users capability */}
          {worker && canManageUsers(worker) && (
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

          {/* Properties — scope-based (not universal for all managers) */}
          {worker && canViewModule(worker, 'properties') && (
            <>
          <button onClick={() => { toggleSection('properties'); setActiveDepartment('properties'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Home className="w-4 h-4" /> Properties</span><ChevronDown className="w-3 h-3" />
          </button>
          
          {expandedSections.properties && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button
                    onClick={() => { setActiveDepartment('properties'); setPropertiesTab('dashboard'); }}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${activeDepartment === 'properties' && propertiesTab === 'dashboard' ? 'text-emerald-500 font-bold bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Dashboard
                </button>
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
            </>
          )}
          
          {/* Facility */}
          {worker && canViewModule(worker, 'facility') && (
            <>
          <button onClick={() => { toggleSection('facility'); setActiveDepartment('facility'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Settings className="w-4 h-4" /> Facility</span><ChevronDown className="w-3 h-3" />
          </button>
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
            </>
          )}

          {/* Accounting */}
          <div className="mb-2">
            {worker && canViewModule(worker, 'accounting') && (
            <>
            <button onClick={() => { toggleSection('accounting'); setActiveDepartment('accounting'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><Clock className="w-4 h-4" /> Accounting</span><ChevronDown className="w-3 h-3" />
            </button>
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
            </>
            )}
          </div>

          {/* Sales */}
          {worker && canViewModule(worker, 'sales') && (
            <>
          <button onClick={() => { toggleSection('sales'); setActiveDepartment('sales'); }} className="w-full flex items-center justify-between p-2 text-sm font-medium rounded-lg transition-colors mb-1 text-gray-400 hover:text-white hover:bg-gray-800/50">
              <span className="flex items-center gap-3"><TrendingUp className="w-4 h-4" /> Sales Department</span><ChevronDown className="w-3 h-3" />
          </button>
          {expandedSections.sales && (
              <div className="ml-4 space-y-1 border-l border-gray-700 pl-3 my-1">
                <button 
                  onClick={() => { setActiveDepartment('sales'); setSalesTab('dashboard'); }} 
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeDepartment === 'sales' && salesTab === 'dashboard'
                      ? 'text-emerald-500 font-bold bg-emerald-500/10'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Dashboard
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
            </>
          )}

          {/* Tasks / Kanban Board */}
          {worker && canViewModule(worker, 'tasks') && (
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
                <div className="text-xs text-gray-500 ml-5 capitalize">
                  {workerRoleLabelUk(worker.role)} • scope: {worker.departmentScope ?? `legacy (${worker.department})`}
                </div>
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
      </div>

      <div className={`relative z-0 flex-1 bg-[#0D1117] overflow-x-hidden ${activeDepartment === 'properties' && propertiesTab === 'dashboard' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        {activeDepartment === 'admin' && renderAdminContent()}
        {activeDepartment === 'properties' && (propertiesTab === 'dashboard' ? (
          <PropertiesDashboardPhase1 onConfirmedBookingsChanged={loadConfirmedBookings} />
        ) : (
          renderPropertiesContent()
        ))}
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
                          {(() => {
                            const maxQ = Math.floor(Number(row.quantity) || 0);
                            const q = transferQuantitiesByStockId[row.stockId];
                            const displayVal = q === undefined ? '' : String(q);
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <input
                                  id={`transfer-qty-${row.stockId}`}
                                  type="number"
                                  min={1}
                                  max={maxQ >= 1 ? maxQ : 1}
                                  step={1}
                                  inputMode="numeric"
                                  disabled={maxQ < 1}
                                  value={displayVal}
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    if (raw === '') {
                                      setTransferQuantitiesByStockId((prev) => {
                                        const next = { ...prev };
                                        delete next[row.stockId];
                                        return next;
                                      });
                                      return;
                                    }
                                    if (!/^\d+$/.test(raw)) return;
                                    let n = parseInt(raw, 10);
                                    if (Number.isNaN(n)) return;
                                    if (n > maxQ) n = maxQ;
                                    setTransferQuantitiesByStockId((prev) => ({
                                      ...prev,
                                      [row.stockId]: n,
                                    }));
                                  }}
                                  onBlur={() => {
                                    if (maxQ < 1) return;
                                    const qNow = transferQuantitiesByStockId[row.stockId];
                                    if (qNow === undefined || !Number.isInteger(qNow) || qNow < 1 || qNow > maxQ) {
                                      setTransferQuantitiesByStockId((prev) => ({
                                        ...prev,
                                        [row.stockId]: maxQ,
                                      }));
                                    }
                                  }}
                                  className="w-20 bg-[#020617] border border-gray-700 rounded-md px-2 py-1 text-right font-mono text-gray-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                                />
                                <span className="text-[10px] text-gray-500">max {maxQ}</span>
                              </div>
                            );
                          })()}
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
                  disabled={
                    !transferPropertyId ||
                    !transferWorkerId ||
                    selectedStockItems.length === 0 ||
                    !transferQuantityInputsValid ||
                    isExecutingTransfer
                  }
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                    !transferPropertyId ||
                    !transferWorkerId ||
                    selectedStockItems.length === 0 ||
                    !transferQuantityInputsValid ||
                    isExecutingTransfer
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
                        <embed
                          src={uploadedInventoryPreviewUrl}
                          type="application/pdf"
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

      {isPropertyAddFromDocumentOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-6xl h-[90vh] max-h-[95vh] bg-[#020617] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Add inventory from document</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  For this property. Drag & drop or upload, then recognize with OCR and save to property inventory.
                </p>
                {selectedProperty?.title && (
                  <p className="text-[11px] text-gray-300 mt-1">Об'єкт: {selectedProperty.title}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsPropertyAddFromDocumentOpen(false);
                  setPropertyOcrError(null);
                  setPropertyOcrRows([]);
                  setPropertyOcrFile(null);
                  setPropertyOcrFileName(null);
                  if (propertyOcrPreviewUrl) { URL.revokeObjectURL(propertyOcrPreviewUrl); setPropertyOcrPreviewUrl(null); }
                  setPropertyOcrInvoiceNumber('');
                  setPropertyOcrPurchaseDate('');
                  setPropertyOcrVendor('');
                }}
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 flex-1 flex flex-col overflow-hidden space-y-4 text-xs text-gray-100">
              {propertyOcrError && (
                <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">{propertyOcrError}</div>
              )}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[3fr,4fr] gap-4 items-stretch min-h-0">
                <div className="flex flex-col gap-3 h-full min-h-0">
                  <input
                    ref={propertyOcrFileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (propertyOcrPreviewUrl) URL.revokeObjectURL(propertyOcrPreviewUrl);
                      if (file) {
                        setPropertyOcrFile(file);
                        setPropertyOcrFileName(file.name);
                        setPropertyOcrPreviewUrl(URL.createObjectURL(file));
                        setPropertyOcrRows([]);
                        setPropertyOcrError(null);
                      } else {
                        setPropertyOcrFile(null);
                        setPropertyOcrFileName(null);
                        setPropertyOcrPreviewUrl(null);
                      }
                    }}
                  />
                  {!propertyOcrFile && (
                    <div
                      className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-blue-500/70 bg-black/20 rounded-xl px-4 py-8 cursor-pointer transition-colors"
                      onClick={() => propertyOcrFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          if (propertyOcrPreviewUrl) URL.revokeObjectURL(propertyOcrPreviewUrl);
                          setPropertyOcrFile(file);
                          setPropertyOcrFileName(file.name);
                          setPropertyOcrPreviewUrl(URL.createObjectURL(file));
                          setPropertyOcrRows([]);
                          setPropertyOcrError(null);
                        }
                      }}
                    >
                      <Upload className="w-6 h-6 text-blue-400 mb-2" />
                      <span className="text-xs font-medium text-white">Drag & drop file here or click to browse</span>
                      <span className="mt-1 text-[11px] text-gray-500">PDF, JPG, PNG or Excel with item list</span>
                    </div>
                  )}
                  {propertyOcrPreviewUrl && propertyOcrFile && (
                    <div className="relative flex-1 min-h-0 border border-gray-800 rounded-xl overflow-hidden bg-black/40">
                      <div className="absolute top-2 right-2 z-10">
                        <button type="button" onClick={() => propertyOcrFileInputRef.current?.click()} className="px-2 py-1 rounded-md bg-black/70 text-[10px] text-gray-200 border border-gray-600 hover:bg-black/90">Change file</button>
                      </div>
                      {propertyOcrFile.type === 'application/pdf' ? (
                        <embed src={propertyOcrPreviewUrl} type="application/pdf" className="w-full h-full min-h-[200px]" title="PDF preview" />
                      ) : (
                        <img src={propertyOcrPreviewUrl} alt="Preview" className="w-full h-auto max-h-full object-contain" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 h-full min-h-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Step 2 – recognize with OCR and review items.</span>
                    <button
                      onClick={handlePropertyOcrRecognize}
                      disabled={isPropertyOcrProcessing || !propertyOcrFile}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-2 transition-colors ${isPropertyOcrProcessing || !propertyOcrFile ? 'bg-purple-600/40 text-purple-200/70 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isPropertyOcrProcessing ? 'Recognizing…' : 'Recognize with OCR'}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 border border-gray-800 rounded-lg p-3 bg-[#020617] flex flex-col">
                    {propertyOcrRows.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[11px] text-gray-500 text-center">OCR result will appear here after recognition.</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-2 border-b border-gray-800">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Номер інвойсу</label>
                            <input
                              value={propertyOcrInvoiceNumber}
                              onChange={(e) => { setPropertyOcrInvoiceNumber(e.target.value); setPropertyOcrRows((prev) => prev.map((r) => ({ ...r, invoiceNumber: e.target.value }))); }}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="INV-2025-0001"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Дата покупки</label>
                            <input
                              type="date"
                              value={propertyOcrPurchaseDate}
                              onChange={(e) => { setPropertyOcrPurchaseDate(e.target.value); setPropertyOcrRows((prev) => prev.map((r) => ({ ...r, purchaseDate: e.target.value }))); }}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Магазин</label>
                            <input
                              value={propertyOcrVendor}
                              onChange={(e) => setPropertyOcrVendor(e.target.value)}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Назва магазину"
                            />
                          </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                          <table className="min-w-full text-[11px]">
                            <thead className="bg-[#020617] text-gray-300 border-b border-gray-800 sticky top-0">
                              <tr>
                                <th className="px-2 py-2 text-left">Артикул</th>
                                <th className="px-2 py-2 text-left">Назва товару</th>
                                <th className="px-2 py-2 text-right">К-сть</th>
                                <th className="px-2 py-2 text-right">Ціна (од.)</th>
                                <th className="px-2 py-2 text-left">Номер інвойсу</th>
                                <th className="px-2 py-2 text-left">Дата покупки</th>
                                <th className="px-2 py-2 text-left">Магазин</th>
                                <th className="px-2 py-2 text-left">Об'єкт</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              {propertyOcrRows.map((row) => (
                                <tr key={row.id}>
                                  <td className="px-2 py-1.5">
                                    <input value={row.sku} onChange={(e) => handlePropertyOcrCellChange(row.id, 'sku', e.target.value)} className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="SKU" />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <input value={row.name} onChange={(e) => handlePropertyOcrCellChange(row.id, 'name', e.target.value)} className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input value={row.quantity} onChange={(e) => handlePropertyOcrCellChange(row.id, 'quantity', e.target.value)} className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-right text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input value={row.price} onChange={(e) => handlePropertyOcrCellChange(row.id, 'price', e.target.value)} className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-right text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </td>
                                  <td className="px-2 py-1.5"><span className="text-[11px] text-gray-400">{row.invoiceNumber || '-'}</span></td>
                                  <td className="px-2 py-1.5"><span className="text-[11px] text-gray-400">{row.purchaseDate || '-'}</span></td>
                                  <td className="px-2 py-1.5"><span className="text-[11px] text-gray-400">{propertyOcrVendor || '-'}</span></td>
                                  <td className="px-2 py-1.5"><span className="text-[11px] text-gray-400">{row.object || '-'}</span></td>
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
              <div className="text-gray-400">Recognized items: <span className="text-gray-200 font-medium">{propertyOcrRows.length}</span></div>
              <div className="flex gap-2">
                <button onClick={() => { setIsPropertyAddFromDocumentOpen(false); setPropertyOcrError(null); setPropertyOcrRows([]); setPropertyOcrFile(null); setPropertyOcrFileName(null); if (propertyOcrPreviewUrl) { URL.revokeObjectURL(propertyOcrPreviewUrl); setPropertyOcrPreviewUrl(null); } setPropertyOcrInvoiceNumber(''); setPropertyOcrPurchaseDate(''); setPropertyOcrVendor(''); }} className="px-3 py-1.5 rounded-md border border-gray-700 text-gray-300 hover:bg-white/5 transition-colors">Close</button>
                <button
                  onClick={handleSavePropertyInventoryFromOCR}
                  disabled={propertyOcrRows.length === 0 || isPropertyOcrSaving}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${propertyOcrRows.length === 0 || isPropertyOcrSaving ? 'bg-emerald-600/30 text-emerald-200/60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                >
                  <Save className="w-4 h-4" />
                  {isPropertyOcrSaving ? 'Saving...' : 'Save to inventory'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isExpenseAddFromDocumentOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-6xl h-[90vh] max-h-[95vh] bg-[#020617] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Додати витрати з документа</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Завантажте інвойс, розпізнайте OCR та оберіть категорію для кожної позиції.
                </p>
                {selectedProperty?.title && (
                  <p className="text-[11px] text-gray-300 mt-1">Об'єкт: {selectedProperty.title}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsExpenseAddFromDocumentOpen(false);
                  setExpenseOcrError(null);
                  setExpenseOcrRows([]);
                  setExpenseOcrFile(null);
                  setExpenseOcrFileName(null);
                  if (expenseOcrPreviewUrl) { URL.revokeObjectURL(expenseOcrPreviewUrl); setExpenseOcrPreviewUrl(null); }
                  setExpenseOcrInvoiceNumber('');
                  setExpenseOcrInvoiceDate('');
                  setExpenseOcrVendor('');
                }}
                className="p-1.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 flex-1 flex flex-col overflow-hidden space-y-4 text-xs text-gray-100">
              {expenseOcrError && (
                <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/40 rounded-md px-3 py-2">{expenseOcrError}</div>
              )}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[3fr,4fr] gap-4 items-stretch min-h-0">
                <div className="flex flex-col gap-3 h-full min-h-0">
                  <input
                    ref={expenseOcrFileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (expenseOcrPreviewUrl) URL.revokeObjectURL(expenseOcrPreviewUrl);
                      if (file) {
                        setExpenseOcrFile(file);
                        setExpenseOcrFileName(file.name);
                        setExpenseOcrPreviewUrl(URL.createObjectURL(file));
                        setExpenseOcrRows([]);
                        setExpenseOcrError(null);
                      } else {
                        setExpenseOcrFile(null);
                        setExpenseOcrFileName(null);
                        setExpenseOcrPreviewUrl(null);
                      }
                    }}
                  />
                  {!expenseOcrFile && (
                    <div
                      className="relative flex flex-col items-center justify-center border-2 border-dashed border-gray-700 hover:border-blue-500/70 bg-black/20 rounded-xl px-4 py-8 cursor-pointer transition-colors"
                      onClick={() => expenseOcrFileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          if (expenseOcrPreviewUrl) URL.revokeObjectURL(expenseOcrPreviewUrl);
                          setExpenseOcrFile(file);
                          setExpenseOcrFileName(file.name);
                          setExpenseOcrPreviewUrl(URL.createObjectURL(file));
                          setExpenseOcrRows([]);
                          setExpenseOcrError(null);
                        }
                      }}
                    >
                      <Upload className="w-6 h-6 text-blue-400 mb-2" />
                      <span className="text-xs font-medium text-white">Перетягніть файл або натисніть</span>
                      <span className="mt-1 text-[11px] text-gray-500">PDF, JPG, PNG</span>
                    </div>
                  )}
                  {expenseOcrPreviewUrl && expenseOcrFile && (
                    <div className="relative flex-1 min-h-0 border border-gray-800 rounded-xl overflow-hidden bg-black/40">
                      <div className="absolute top-2 right-2 z-10">
                        <button type="button" onClick={() => expenseOcrFileInputRef.current?.click()} className="px-2 py-1 rounded-md bg-black/70 text-[10px] text-gray-200 border border-gray-600 hover:bg-black/90">Змінити</button>
                      </div>
                      {expenseOcrFile.type === 'application/pdf' ? (
                        <embed src={expenseOcrPreviewUrl} type="application/pdf" className="w-full h-full min-h-[200px]" title="PDF preview" />
                      ) : (
                        <img src={expenseOcrPreviewUrl} alt="Preview" className="w-full h-auto max-h-full object-contain" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 h-full min-h-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">Розпізнати OCR та обрати категорію для кожної позиції.</span>
                    <button
                      onClick={handleExpenseOcrRecognize}
                      disabled={isExpenseOcrProcessing || !expenseOcrFile || expenseCategories.length === 0}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-2 transition-colors ${isExpenseOcrProcessing || !expenseOcrFile || expenseCategories.length === 0 ? 'bg-purple-600/40 text-purple-200/70 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {isExpenseOcrProcessing ? 'Розпізнавання…' : 'Recognize with OCR'}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 border border-gray-800 rounded-lg p-3 bg-[#020617] flex flex-col">
                    {expenseOcrRows.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-[11px] text-gray-500 text-center">
                        {expenseCategories.length === 0 ? 'Спочатку додайте категорії (кнопка «Категорії»).' : 'Результат OCR з\'явиться тут після розпізнавання.'}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-2 border-b border-gray-800">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Номер інвойсу</label>
                            <input
                              value={expenseOcrInvoiceNumber}
                              onChange={(e) => setExpenseOcrInvoiceNumber(e.target.value)}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="INV-..."
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Дата</label>
                            <input
                              type="date"
                              value={expenseOcrInvoiceDate}
                              onChange={(e) => setExpenseOcrInvoiceDate(e.target.value)}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1">Постачальник</label>
                            <input
                              value={expenseOcrVendor}
                              onChange={(e) => setExpenseOcrVendor(e.target.value)}
                              className="w-full bg-transparent border border-gray-700 rounded px-2 py-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="Фірма / магазин"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pb-1">
                          <span className="text-[10px] text-gray-500">Застосувати категорію до всіх:</span>
                          <select
                            onChange={(e) => { const v = e.target.value; if (v) handleExpenseOcrApplyCategoryToAll(v); }}
                            className="bg-[#16181D] border border-gray-700 rounded px-2 py-1 text-[11px] text-white"
                          >
                            <option value="">— оберіть —</option>
                            {expenseCategories.filter((c) => c.is_active).map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                          <table className="min-w-full text-[11px]">
                            <thead className="bg-[#020617] text-gray-300 border-b border-gray-800 sticky top-0">
                              <tr>
                                <th className="px-2 py-2 text-left">Назва</th>
                                <th className="px-2 py-2 text-right">К-сть</th>
                                <th className="px-2 py-2 text-right">Ціна (од.)</th>
                                <th className="px-2 py-2 text-left">Категорія</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              {expenseOcrRows.map((row) => (
                                <tr key={row.id}>
                                  <td className="px-2 py-1.5">
                                    <input
                                      value={row.name}
                                      onChange={(e) => handleExpenseOcrCellChange(row.id, 'name', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      placeholder="Назва"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      value={row.quantity}
                                      onChange={(e) => handleExpenseOcrCellChange(row.id, 'quantity', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-right text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      value={row.price}
                                      onChange={(e) => handleExpenseOcrCellChange(row.id, 'price', e.target.value)}
                                      className="w-full bg-transparent border border-gray-700 rounded px-1.5 py-1 text-[11px] text-right text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select
                                      value={row.category_id}
                                      onChange={(e) => handleExpenseOcrCellChange(row.id, 'category_id', e.target.value)}
                                      className="w-full bg-[#16181D] border border-gray-700 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                      <option value="">— оберіть категорію —</option>
                                      {expenseCategories.filter((c) => c.is_active).map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
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
                Позицій: <span className="text-gray-200 font-medium">{expenseOcrRows.length}</span>
                {expenseOcrRows.length > 0 && (
                  <span className="ml-2 text-amber-400">
                    {expenseOcrRows.every((r) => r.category_id) ? 'Усі з категорією' : 'Оберіть категорію для кожної позиції'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsExpenseAddFromDocumentOpen(false);
                    setExpenseOcrError(null);
                    setExpenseOcrRows([]);
                    setExpenseOcrFile(null);
                    setExpenseOcrFileName(null);
                    if (expenseOcrPreviewUrl) { URL.revokeObjectURL(expenseOcrPreviewUrl); setExpenseOcrPreviewUrl(null); }
                    setExpenseOcrInvoiceNumber('');
                    setExpenseOcrInvoiceDate('');
                    setExpenseOcrVendor('');
                  }}
                  className="px-3 py-1.5 rounded-md border border-gray-700 text-gray-300 hover:bg-white/5 transition-colors"
                >
                  Закрити
                </button>
                <button
                  onClick={handleSaveExpenseFromOCR}
                  disabled={
                    expenseOcrRows.length === 0 ||
                    isExpenseOcrSaving ||
                    !expenseOcrRows.every((r) => r.name.trim() && parseFloat(r.quantity) > 0 && r.category_id)
                  }
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-colors ${
                    expenseOcrRows.length === 0 || isExpenseOcrSaving || !expenseOcrRows.every((r) => r.name.trim() && parseFloat(r.quantity) > 0 && r.category_id)
                      ? 'bg-emerald-600/30 text-emerald-200/60 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {isExpenseOcrSaving ? 'Збереження…' : 'Зберегти'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isExpenseCategoriesModalOpen && (
        <ExpenseCategoriesModal
          onClose={() => { setIsExpenseCategoriesModalOpen(false); refreshExpenseItems(); }}
          categories={expenseCategories}
          onRefresh={() => propertyExpenseCategoryService.listCategories(true).then(setExpenseCategories)}
        />
      )}

      {/* Stay overview Documents: proforma opens via fileUrl or onOpenInvoice only; onOpenProforma is the add/upload flow and is ignored there. */}
      <BookingDetailsModal
          isOpen={isManageModalOpen}
          onClose={closeManageModals}
          booking={selectedReservation}
          stayContext={stayOverviewContext}
          onShowToast={(msg) => setToastMessage(msg)}
          onOpenOffer={handleViewOffer}
          onOpenProforma={handleAddInvoiceToProforma}
          onOpenInvoice={handleViewInvoice}
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
      {isOfferViewModalOpen && offerViewData && (
        <MultiApartmentOfferModal
          isOpen
          mode="view"
          viewData={offerViewData}
          onClose={() => {
            setOfferViewData(null);
            setIsOfferViewModalOpen(false);
          }}
          apartments={[]}
          onSubmit={async () => {}}
        />
      )}
      <InvoiceModal
        key={invoiceModalInstanceKey}
        isOpen={isInvoiceModalOpen}
        onClose={() => {
          invoiceIdempotencyKeyRef.current = null;
          setIsInvoiceModalOpen(false);
          setSelectedOfferForInvoice(null);
          setSelectedInvoice(null);
          setSelectedProformaForInvoice(null);
          setPendingOfferItemForInvoice(null);
        }}
        onAbandonStuck={(phase) => {
          console.warn('[DEBUG/RECOVERY] InvoiceModal abandon stuck flow', { phase, pageInstanceId: PAGE_INSTANCE_ID });
          onStuckClearAccountDashboardSaveLock('invoice');
          setInvoiceModalInstanceKey((k) => k + 1);
          setIsInvoiceModalOpen(false);
          setSelectedOfferForInvoice(null);
          setSelectedInvoice(null);
          setSelectedProformaForInvoice(null);
          setPendingOfferItemForInvoice(null);
        }}
        offer={selectedOfferForInvoice}
        invoice={selectedInvoice}
        proforma={selectedProformaForInvoice}
        onSave={handleSaveInvoice}
        reservations={reservations}
        offers={offers}
      />
      <SendChannelModal
        isOpen={sendChannelPayload !== null}
        onClose={() => {
          const fn = sendChannelOnCloseRef.current;
          sendChannelOnCloseRef.current = null;
          setSendChannelPayload(null);
          fn?.();
        }}
        payload={sendChannelPayload}
        onResultMessage={(msg) => {
          const prefix = sendChannelResultPrefixRef.current || 'Offer';
          setToastMessage(`${prefix} saved and ${msg}`);
          setTimeout(() => setToastMessage(null), 5000);
        }}
        onError={(msg) => {
          setToastMessage(msg);
          setTimeout(() => setToastMessage(null), 6000);
        }}
      />
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
      <MultiApartmentOfferDetailsModal
        isOpen={isMultiOfferDetailsOpen}
        onClose={() => {
          setIsMultiOfferDetailsOpen(false);
          setSelectedMultiOfferHeader(null);
          setSelectedMultiOfferItems([]);
        }}
        header={selectedMultiOfferHeader}
        items={selectedMultiOfferItems}
        onSelectItem={handleSelectMultiOfferItem}
        onAddProforma={handleAddProformaFromMultiOfferItem}
      />
      <LeadCreateModal
        isOpen={isCreateLeadModalOpen}
        onClose={() => setIsCreateLeadModalOpen(false)}
        onCreate={handleManualLeadCreate}
      />
      {editingLead && (
        <LeadEditModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSave={(updates) => handleSaveLeadEdit(editingLead.id, updates)}
        />
      )}
      {clientHistoryLead && (
        <ClientHistoryModal
          lead={clientHistoryLead}
          onClose={() => setClientHistoryLead(null)}
          context={{
            leads,
            offers,
            reservations,
            confirmedBookings,
            invoices,
            proformas,
            properties,
            paymentProofsByInvoiceId,
          }}
          onCreateBooking={handleCreateBookingFromLead}
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
      {/* Archive property confirmation */}
      {archiveModalPropertyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md bg-[#1C1F24] border border-gray-800 rounded-xl shadow-xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">Archive property?</h2>
            <p className="text-sm text-gray-400 mb-6">This will hide it from active lists. You can restore later.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setArchiveModalPropertyId(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors">Cancel</button>
              <button type="button" onClick={() => archiveModalPropertyId && handleArchiveConfirm(archiveModalPropertyId)} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors">Archive</button>
            </div>
          </div>
        </div>
      )}
      {/* Permanent delete confirmation */}
      {deleteModalPropertyId && (() => {
        const prop = properties.find(p => p.id === deleteModalPropertyId);
        const confirmLabel = prop?.title ?? 'DELETE';
        const match = deleteConfirmInput.trim() === confirmLabel || deleteConfirmInput.trim() === 'DELETE';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-md bg-[#1C1F24] border border-gray-800 rounded-xl shadow-xl p-6">
              <h2 className="text-lg font-bold text-white mb-2">Permanently delete property?</h2>
              <p className="text-sm text-gray-400 mb-4">This cannot be undone. All dependent data must be removed first.</p>
              <p className="text-xs text-gray-500 mb-2">Type the property title or &quot;DELETE&quot; to confirm:</p>
              <input type="text" value={deleteConfirmInput} onChange={(e) => setDeleteConfirmInput(e.target.value)} placeholder={confirmLabel} className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 mb-6 focus:outline-none focus:ring-1 focus:ring-red-500" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setDeleteModalPropertyId(null); setDeleteConfirmInput(''); }} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="button" disabled={!match} onClick={() => deleteModalPropertyId && handleDeletePermanentConfirm(deleteModalPropertyId)} className={`px-4 py-2 rounded-lg font-medium transition-colors ${match ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-red-900/30 text-red-200/60 cursor-not-allowed'}`}>Delete permanently</button>
              </div>
            </div>
          </div>
        );
      })()}
      <RequestModal 
        isOpen={isRequestModalOpen} 
        onClose={() => { setIsRequestModalOpen(false); setSelectedRequest(null); }} 
        request={selectedRequest}
        onGoToCalendar={handleGoToCalendarFromRequest}
        properties={properties}
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
