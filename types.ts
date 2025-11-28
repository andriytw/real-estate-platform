
export interface InventoryItem {
  type: string;
  invNumber: string;
  quantity: number;
  cost: number;
}

export interface MeterReading {
  name: string;
  number: string;
  initial: string; // Value at start
  current: string; // Value from latest check
  lastReadDate?: string;
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
}

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

export interface OwnerExpense {
  mortgage: number;
  management: number;
  taxIns: number;
  reserve: number;
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

export interface PropertyDetails {
  area: string;
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
  inventory: InventoryItem[];
  meterReadings?: MeterReading[]; 
  meterLog?: MeterLogEntry[];
  tenant?: TenantDetails;
  rentalHistory?: RentalAgreement[]; // New field for list of agreements
  rentPayments?: RentPayment[]; // New field for rent payments
  ownerExpense?: OwnerExpense;
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
}

export interface OfferData {
  id: string;
  clientName: string;
  propertyId: string;
  internalCompany: string;
  price: string;
  dates: string;
  status: 'Draft' | 'Sent' | 'Invoiced';
  createdAt?: string;
  guests?: string;
  email?: string;
  phone?: string;
  address?: string;
  checkInTime?: string;
  checkOutTime?: string;
  guestList?: {firstName: string, lastName: string}[];
  comments?: string;
  unit?: string;
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
  offerIdSource?: string; 
  bookingId?: string | number; // Зв'язок з бронюванням
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
}

export interface ReservationData extends Booking {}

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
}
