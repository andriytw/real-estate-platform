
// Inventory entry for a specific property (apartment)
// Backward-compatible: existing fields type/invNumber/quantity/cost все ще підтримуються
export interface InventoryItem {
  // NEW: зв'язок з Item на складі (може бути відсутній для старих даних)
  itemId?: string;
  // NEW: зручна назва предмета (наприклад, "Ліжко 160x200")
  name?: string;

  // ІСНУЮЧІ ПОЛЯ (використовуються в поточному UI)
  type: string;
  invNumber: string;
  quantity: number;
  // Історично використовувалось як вартість; зберігаємо для сумісності.
  cost: number;

  // NEW: ціна за одиницю та загальна вартість для цієї квартири
  unitPrice?: number;
  totalCost?: number;

  // NEW: посилання на інвойс/рух, з якого з'явився цей предмет
  sourceInvoiceId?: string;
  lastMovementDate?: string;
}

export interface MeterReading {
  name: string;
  number: string;
  initial: string; // Value at start
  current: string; // Value from latest check (Кінцеве)
  price?: number; // Price per unit (Ціна за одиницю)
  lastReadDate?: string;
}

/** Reusable contact shape for Landlord, Management, and extended Tenant (Card 1). */
export interface ContactParty {
  name: string;
  address: {
    street: string;
    houseNumber: string;
    zip: string;
    city: string;
    country: string;
  };
  phones: string[];
  emails: string[];
  iban?: string;
}

export interface TenantDetails {
  name: string;
  phone: string;
  email: string;
  rent: number;
  deposit: number;
  startDate: string;
  km: number; // Kaltmiete
  bk: number; // Betriebskosten
  hk: number; // Heizkosten
  /** Extended: full address (Card 1). */
  address?: ContactParty['address'];
  /** Extended: multiple phones; prefer over phone when present. */
  phones?: string[];
  /** Extended: multiple emails; prefer over email when present. */
  emails?: string[];
  iban?: string;
  /** Payment day of month (1–31) for current lease. */
  paymentDayOfMonth?: number;
}

/** In Card 1 (master lease): our company as tenant. Future: external client/occupant will be a separate concept. */
export type MasterTenantDetails = TenantDetails;

export interface RentalAgreement {
  id: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  km: number;
  bk: number;
  hk: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'FUTURE';
}

export interface RentPayment {
  id: string;
  date: string;
  month: string;
  amount: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE';
}

export type PropertyDocumentType =
  | 'lease_contract'
  | 'handover_protocol'
  | 'acceptance_act'
  | 'supplier_electricity'
  | 'supplier_gas'
  | 'supplier_water'
  | 'supplier_internet'
  | 'supplier_waste'
  | 'supplier_cleaning'
  | 'supplier_hausmeister'
  | 'supplier_heating'
  | 'supplier_other'
  | 'deposit_payment_proof'
  | 'deposit_return_proof'
  | 'other_document';

export interface PropertyDocument {
  id: string;
  propertyId: string;
  type: PropertyDocumentType;
  filePath: string;
  title?: string | null;
  docDate?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface OwnerExpense {
  mortgage: number;
  management: number;
  taxIns: number;
  reserve: number;
}

/** Card 1: Kaution (deposit) — deposit paid by our company to landlord (master lease). */
export interface PropertyDeposit {
  amount: number;
  paidAt?: string;
  paidTo?: string;
  status: 'unpaid' | 'paid' | 'partially_returned' | 'returned';
  returnedAt?: string;
  returnedAmount?: number;
}

/** Kaution proof document — stored in property_deposit_proofs (independent from property_documents). */
export interface PropertyDepositProof {
  id: string;
  propertyId: string;
  proofType: 'payment' | 'return';
  bucket: string;
  filePath: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  createdAt: string;
}

export interface FuturePayment {
  date: string;
  recipient: string;
  amount: number;
  category: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  docId: string;
}

export interface RepairRequest {
  id: number;
  date: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'New' | 'Assigned' | 'Active' | 'Closed';
}

export interface PropertyEvent {
  datetime: string;
  type: 'Viewing' | 'Repair' | 'Inspection' | 'Service' | 'Assessment';
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  description: string;
  participant: string;
  priority: 'High' | 'Medium' | 'Low';
}

// ===== Warehouse & Inventory (Facility Department) =====

// Каталог предметів складу
export interface Item {
  id: string;
  name: string;
  category?: string;
  sku?: string;
  defaultPrice?: number;
  unit: string; // 'pcs', 'set', 'm2', etc.
}

// Склад (фізичне місце зберігання)
export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  description?: string;
}

// Залишки на складі
export interface WarehouseStock {
  id: string;
  warehouseId: string;
  itemId: string;
  quantity: number;
}

export type StockMovementType = 'IN' | 'OUT' | 'TRANSFER';

// Рухи по складу (історія)
export interface StockMovement {
  id: string;
  warehouseId: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  date: string; // ISO string
  reason?: string;
  propertyId?: string; // якщо рух пов'язаний з конкретною квартирою
  workerId?: string;   // якщо завдання на конкретного працівника
  invoiceId?: string;  // якщо рух з інвойсу
}

// Інвойс для складу (закупка інвентарю)
export interface WarehouseInvoice {
  id: string;
  vendor: string;
  invoiceNumber: string;
  date: string; // ISO date
  fileUrl?: string;
  createdBy?: string;
  lines: WarehouseInvoiceLine[];
}

// Рядок інвойсу (позиція закупки)
export interface WarehouseInvoiceLine {
  id: string;
  invoiceId: string;
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  suggestedItemId?: string;   // Item, до якого це, ймовірно, належить
  targetPropertyId?: string;  // Якщо інвойс явно вказує квартиру
}

export interface PropertyDetails {
  area: number;
  rooms: number;
  floor: number;
  year: number;
  beds: number;
  baths: number;
  balconies: number;
  buildingFloors: number;
}

export interface BuildingSpecs {
  type: string;
  repairYear: number;
  heating: string;
  energyClass: string;
  parking: string;
  pets: string;
  elevator: string;
  kitchen: string;
  access: string;
  certificate: string;
  energyDemand: string;
  centralHeating?: string; // Added field
}

export interface MeterLogEntry {
  date: string;
  type: 'Initial' | 'Check-In' | 'Check-Out' | 'Interim';
  bookingId?: string | number; // Link to booking for customer name lookup
  readings: {
    electricity: string;
    water: string;
    gas: string;
  };
}

export interface Property {
  id: string; 
  title: string;
  address: string;
  zip: string;
  city: string;
  district: string;
  price: number;
  pricePerSqm: number;
  rooms: number;
  area: number;
  image: string;
  images: string[]; 
  status: 'Available' | 'Reserved' | 'Rented' | 'Maintenance';
  
  // New Detailed Fields
  fullAddress?: string;
  meta?: string; 
  term?: string; 
  termStatus?: 'green' | 'red';
  balance?: number;
  country?: string;
  
  details: PropertyDetails;
  building: BuildingSpecs;
  /** Unit amenities (Ausstattung) — keys from approved list, always render all, even when false */
  amenities?: Record<string, boolean>;
  inventory: InventoryItem[];
  meterReadings?: MeterReading[]; 
  meterLog?: MeterLogEntry[];
  tenant?: TenantDetails;
  rentalHistory?: RentalAgreement[]; // New field for list of agreements
  rentPayments?: RentPayment[]; // New field for rent payments
  ownerExpense?: OwnerExpense;
  /** Card 1: apartment/lease status (active, ooo, preparation, rented_worker). Stored in apartment_status column. */
  apartmentStatus?: 'active' | 'ooo' | 'preparation' | 'rented_worker';
  /** Card 1: landlord contact (JSONB). */
  landlord?: ContactParty;
  /** Card 1: management company contact (JSONB). */
  management?: ContactParty;
  /** Card 1: Kaution (deposit) — our company's deposit to landlord. Stored in deposit JSONB. */
  deposit?: PropertyDeposit;
  futurePayments?: FuturePayment[];
  repairRequests?: RepairRequest[];
  events?: PropertyEvent[];
  
  // Backward compatibility fields
  floor?: number;
  totalFloors?: number;
  bathrooms?: number;
  balcony?: boolean;
  builtYear?: number;
  renovationYear?: number;
  netRent?: number;
  ancillaryCosts?: number;
  heatingCosts?: number;
  heatingIncluded?: boolean;
  deposit?: string;
  buildingType?: string;
  heatingType?: string;
  energyCertificate?: string;
  endEnergyDemand?: string;
  energyEfficiencyClass?: string;
  parking?: string;
  description?: string;
  marketplaceUrl?: string; // Public marketplace listing URL (e.g., herorooms.de/market/{property-slug})
}

export interface FilterState {
  city: string;
  district: string;
  rooms: string;
  floor: string;
  elevator: string;
  pets: string;
  status: string;
}

export interface Room {
  id: string;
  name: string;
  city: string;
  details: string;
}

export type BookingType = 'GUEST' | 'BLOCK';

// Booking Status State Machine
export enum BookingStatus {
  RESERVED = 'reserved',           // Менеджер створив резервацію в календарі
  OFFER_PREPARED = 'offer_prepared', // Офер підготовлено (draft)
  OFFER_SENT = 'offer_sent',       // Офер відправлено клієнту
  INVOICED = 'invoiced',           // Інвойс створено
  PAID = 'paid',                   // Інвойс оплачено
  CHECK_IN_DONE = 'check_in_done', // Check-in виконано
  COMPLETED = 'completed'          // Check-out виконано, оренда завершена
}

export interface Booking {
  id: number;
  roomId: string;
  propertyId?: string; // UUID reference to properties table
  start: string;
  end: string;
  guest: string;
  color: string; 
  checkInTime: string;
  checkOutTime: string;
  status: BookingStatus | string; // Підтримка старого формату для сумісності
  price: string;
  balance: string;
  guests: string;
  unit: string;
  comments: string;
  paymentAccount: string;
  company: string; 
  ratePlan: string;
  guarantee: string;
  cancellationPolicy: string;
  noShowPolicy: string;
  channel: string;
  type: BookingType;
  createdAt?: string;
  address?: string;
  phone?: string;
  email?: string;
  pricePerNight?: number;
  taxRate?: number;
  totalGross?: string;
  guestList?: {firstName: string, lastName: string}[];
  clientType?: 'Private' | 'Company';
  firstName?: string;
  lastName?: string;
  companyName?: string;
  internalCompany?: string;
  bookingNo?: string; // Human-readable booking number (RES-YYYY-000001)
  reservationNo?: string; // Human-readable reservation number (RES-YYYY-000001) for holds
  companyId?: string; // UUID reference to companies table
  sourceInvoiceId?: string; // UUID reference to invoices table (confirmed booking source)
  sourceOfferId?: string; // UUID reference to offers table
  sourceReservationId?: string; // UUID reference to reservations table
}

export interface OfferData {
  id: string;
  offerNo?: string; // Human-readable offer number (OFF-YYYY-000001)
  clientName: string;
  propertyId: string;
  internalCompany: string;
  price: string;
  dates: string;
  status: 'Draft' | 'Sent' | 'Invoiced' | 'Accepted' | 'Lost' | 'Rejected' | 'Expired';
  createdAt?: string;
  guests?: string;
  email?: string;
  phone?: string;
  address?: string;
  checkInTime?: string;
  checkOutTime?: string;
  guestList?: {firstName: string, lastName: string}[];
  comments?: string; // Internal notes only
  unit?: string;
  clientMessage?: string; // Client-facing message sent via email/WhatsApp
  reservationId?: string; // UUID reference to reservations table
}

export interface CompanyDetails {
  name: string;
  address: string;
  iban: string;
  taxId: string;
  logo: string;
  email: string;
}

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  internalCompany: string; 
  clientName: string;
  clientAddress: string;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  totalNet: number;
  taxAmount: number;
  totalGross: number;
  status: 'Paid' | 'Unpaid' | 'Overdue';
  offerId?: string; // UUID reference to offers table (mandatory when created from offer)
  offerIdSource?: string; // Legacy field, kept for backward compatibility
  bookingId?: string | number; // Зв'язок з бронюванням (set only after payment confirmed and booking created)
  /** Link to reservation (proforma/invoice from reservation); booking_id stays null until payment confirmed */
  reservationId?: string;
  /** URL of uploaded PDF (proforma or invoice) */
  fileUrl?: string;
  /** URL of payment proof PDF (bank statement / confirmation); separate from fileUrl */
  paymentProofUrl?: string;
  /** 'proforma' | 'invoice' – record type in invoices table */
  documentType?: 'proforma' | 'invoice';
  /** Parent proforma UUID when this record is an invoice under a proforma */
  proformaId?: string;
}

/** One row per payment confirmation; PDF optional; is_current = proof shown in main row */
export interface PaymentProof {
  id: string;
  invoiceId: string;
  documentNumber?: string;
  createdAt: string;
  createdBy?: string;
  filePath?: string;
  fileName?: string;
  fileUploadedAt?: string;
  notes?: string;
  isCurrent: boolean;
  state: 'active' | 'replaced' | 'void';
  replacedByProofId?: string;
  replacesProofId?: string;
  updatedAt: string;
  rpcConfirmedAt?: string;
}

export interface Lead {
  id: string;
  name: string; 
  type: 'Company' | 'Private';
  contactPerson?: string; 
  email: string;
  phone: string;
  address: string;
  status: 'Active' | 'Past' | 'Potential';
  createdAt: string;
  source?: string; // 'chat' | 'form' | 'request' | 'reservation' | 'manual'
  clientId?: string; // Зв'язок з Client
  propertyId?: string; // Зв'язок з Property
  lastContactAt?: string; // Останній контакт
  notes?: string; // Нотатки менеджера
  preferredDates?: Array<{ // Бажані дати
    start: string;
    end: string;
    peopleCount: number;
  }>;
  interactionCount?: number; // Скільки разів звертався
}

export interface RequestData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string;
  peopleCount: number;
  startDate: string;
  endDate: string;
  message?: string;
  propertyId?: string;
  status: 'pending' | 'processed' | 'archived';
  createdAt: string;
  processedAt?: string;
}

export interface ReservationData extends Booking {}

// New Reservation interface (separate from Booking)
export interface Reservation {
  id: string; // UUID
  reservationNo?: string; // Human-readable reservation number (RES-YYYY-000001)
  propertyId: string; // UUID reference to properties table
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'open' | 'offered' | 'invoiced' | 'won' | 'lost' | 'cancelled';
  leadLabel?: string; // Shown on calendar hold bar
  clientFirstName?: string;
  clientLastName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  guestsCount?: number;
  pricePerNightNet?: number;
  taxRate?: number;
  totalNights?: number;
  totalGross?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type TaskType = 
  // Facility Management
  | 'Einzug' | 'Auszug' | 'Putzen' | 'Reklamation' | 'Arbeit nach plan' | 'Zeit Abgabe von wohnung' | 'Zählerstand'
  // Accounting
  | 'Tax Payment' | 'Payroll' | 'Invoice Processing' | 'Audit' | 'Monthly Closing' 
  | 'Rent Collection' | 'Utility Payment' | 'Insurance' | 'Mortgage Payment' | 'VAT Return'
  | 'Financial Report' | 'Budget Review' | 'Asset Depreciation' | 'Vendor Payment' | 'Bank Reconciliation';

// Task Status State Machine for Facility Tasks
// open → assigned → done_by_worker → verified
export type TaskStatus = 'open' | 'assigned' | 'done_by_worker' | 'verified' | 'pending' | 'review' | 'archived' | 'completed';


export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskWorkflowStep {
  stepNumber: number;
  stepName: string;
  completed: boolean;
  photos: string[];
  videos: string[];
  comment?: string;
  meterReadings?: {
    electricity: string;
    water: string;
    gas: string;
  };
  completedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string; 
  propertyId?: string;
  bookingId?: string | number; // Зв'язок з бронюванням
  unitId?: string; // Додаткове поле для unit
  time?: string;
  isAllDay?: boolean;
  type: TaskType | 'other';
  day: number;
  date?: string; 
  description?: string;
  assignee?: string;
  assignedWorkerId?: string; // ID працівника, якому призначено таску
  hasUnreadMessage?: boolean;
  status: TaskStatus;
  meterReadings?: {
    electricity: string;
    water: string;
    gas: string;
  };
  
  // Kanban Fields
  priority?: TaskPriority;
  isIssue?: boolean;
  managerId?: string;
  workerId?: string; // Synced with assignedWorkerId, preferred source of truth
  department?: 'facility' | 'accounting' | 'sales' | 'general';
  images?: string[];
  checklist?: Array<{text: string; checked: boolean}>;
  locationText?: string;
  createdAt?: string; // Date when task was created (for sorting), optional for backward compatibility
  workflowSteps?: TaskWorkflowStep[]; // Step-by-step workflow data for Einzug/Auszug tasks
}

export interface TaskWorkflow {
  id: string;
  taskId: string;
  workerId: string;
  startedAt?: string;
  photosBefore?: string[];
  checklistCompleted?: boolean[]; // Or detailed objects
  photosAfter?: string[];
  completedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  status: 'active' | 'submitted' | 'verified' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface CustomColumn {
  id: string; // Unique column ID (UUID)
  workerId?: string; // Optional, assigned after selection
  title?: string; // Optional custom title
  createdAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  type: 'backlog' | 'worker' | 'manager';
  workerId?: string; // If it's a person's column
  tasks: CalendarEvent[];
}

export type CategoryAccess = 'properties' | 'facility' | 'accounting' | 'sales' | 'tasks';

export interface Worker {
  id: string;
  name: string; // Full name (for backward compatibility)
  firstName?: string; // First name
  lastName?: string; // Last name
  email: string;
  phone?: string;
  department: 'facility' | 'accounting' | 'sales' | 'general';
  role: 'super_manager' | 'manager' | 'worker';
  managerId?: string;
  isActive: boolean;
  categoryAccess?: CategoryAccess[]; // Categories user can access
  lastInviteSentAt?: string; // Timestamp of when the last invitation email was sent
  createdAt: string;
  updatedAt: string;
}

export interface TaskChatMessage {
  id: string;
  taskId: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: string;
  attachments?: string[];
}

// ==================== Smart Chat Types ====================

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName?: string;
  companyAddress?: string;
  clientType: 'Private' | 'Company';
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatRoom {
  id: string;
  requestId: string;
  propertyId?: string;
  clientId: string;
  status: 'active' | 'archived' | 'closed';
  lastMessageAt?: string;
  unreadCountManager: number;
  unreadCountClient: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Message {
  id: string;
  chatRoomId: string;
  senderType: 'client' | 'manager' | 'system';
  senderId?: string; // client_id або manager_id
  text: string;
  attachments?: Array<{
    type: 'image' | 'file';
    url: string;
    name: string;
  }>;
  isRead: boolean;
  readAt?: string;
  createdAt?: string;
}
