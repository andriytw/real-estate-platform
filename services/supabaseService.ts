import { createClient } from '../utils/supabase/client';
import { Property, Booking, OfferData, InvoiceData, Lead, RequestData, CalendarEvent, Room, CompanyDetails } from '../types';

const supabase = createClient();

// ==================== PROPERTIES ====================
export const propertiesService = {
  // Get all properties
  async getAll(): Promise<Property[]> {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data.map(transformPropertyFromDB);
  },

  // Get property by ID
  async getById(id: string): Promise<Property | null> {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return transformPropertyFromDB(data);
  },

  // Create property
  async create(property: Omit<Property, 'id'>): Promise<Property> {
    const dbData = transformPropertyToDB(property);
    const { data, error } = await supabase
      .from('properties')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformPropertyFromDB(data);
  },

  // Update property
  async update(id: string, updates: Partial<Property>): Promise<Property> {
    const dbData = transformPropertyToDB(updates as Property);
    const { data, error } = await supabase
      .from('properties')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformPropertyFromDB(data);
  },

  // Delete property
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};

// ==================== BOOKINGS ====================
export const bookingsService = {
  async getAll(): Promise<Booking[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('start_date', { ascending: true });
    
    if (error) throw error;
    return data.map(transformBookingFromDB);
  },

  async getById(id: string | number): Promise<Booking | null> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id.toString())
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return transformBookingFromDB(data);
  },

  async getByPropertyId(propertyId: string): Promise<Booking[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('property_id', propertyId)
      .order('start_date', { ascending: true });
    
    if (error) throw error;
    return data.map(transformBookingFromDB);
  },

  async create(booking: Omit<Booking, 'id'>): Promise<Booking> {
    const dbData = transformBookingToDB(booking);
    const { data, error } = await supabase
      .from('bookings')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformBookingFromDB(data);
  },

  async update(id: string | number, updates: Partial<Booking>): Promise<Booking> {
    const dbData = transformBookingToDB(updates as Booking);
    const { data, error } = await supabase
      .from('bookings')
      .update(dbData)
      .eq('id', id.toString())
      .select()
      .single();
    
    if (error) throw error;
    return transformBookingFromDB(data);
  },

  async delete(id: string | number): Promise<void> {
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id.toString());
    
    if (error) throw error;
  }
};

// ==================== OFFERS ====================
export const offersService = {
  async getAll(): Promise<OfferData[]> {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data.map(transformOfferFromDB);
  },

  async create(offer: Omit<OfferData, 'id'>): Promise<OfferData> {
    const dbData = transformOfferToDB(offer);
    const { data, error } = await supabase
      .from('offers')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformOfferFromDB(data);
  },

  async update(id: string, updates: Partial<OfferData>): Promise<OfferData> {
    const dbData = transformOfferToDB(updates as OfferData);
    const { data, error } = await supabase
      .from('offers')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformOfferFromDB(data);
  }
};

// ==================== INVOICES ====================
export const invoicesService = {
  async getAll(): Promise<InvoiceData[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('date', { ascending: false });
    
    if (error) throw error;
    return data.map(transformInvoiceFromDB);
  },

  async create(invoice: Omit<InvoiceData, 'id'>): Promise<InvoiceData> {
    const dbData = transformInvoiceToDB(invoice);
    const { data, error } = await supabase
      .from('invoices')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformInvoiceFromDB(data);
  },

  async update(id: string, updates: Partial<InvoiceData>): Promise<InvoiceData> {
    const dbData = transformInvoiceToDB(updates as InvoiceData);
    const { data, error } = await supabase
      .from('invoices')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformInvoiceFromDB(data);
  }
};

// ==================== LEADS ====================
export const leadsService = {
  async getAll(): Promise<Lead[]> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data.map(transformLeadFromDB);
  },

  async create(lead: Omit<Lead, 'id'>): Promise<Lead> {
    const dbData = transformLeadToDB(lead);
    const { data, error } = await supabase
      .from('leads')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformLeadFromDB(data);
  }
};

// ==================== REQUESTS ====================
export const requestsService = {
  async getAll(): Promise<RequestData[]> {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data.map(transformRequestFromDB);
  },

  async create(request: Omit<RequestData, 'id'>): Promise<RequestData> {
    const dbData = transformRequestToDB(request);
    const { data, error } = await supabase
      .from('requests')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformRequestFromDB(data);
  },

  async update(id: string, updates: Partial<RequestData>): Promise<RequestData> {
    const dbData = transformRequestToDB(updates as RequestData);
    const { data, error } = await supabase
      .from('requests')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformRequestFromDB(data);
  }
};

// ==================== CALENDAR EVENTS ====================
export const calendarEventsService = {
  async getAll(): Promise<CalendarEvent[]> {
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .order('date', { ascending: true });
    
    if (error) throw error;
    return data.map(transformCalendarEventFromDB);
  },

  async create(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const dbData = transformCalendarEventToDB(event);
    const { data, error } = await supabase
      .from('calendar_events')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformCalendarEventFromDB(data);
  },

  async update(id: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const dbData = transformCalendarEventToDB(updates as CalendarEvent);
    const { data, error } = await supabase
      .from('calendar_events')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformCalendarEventFromDB(data);
  }
};

// ==================== TRANSFORMERS ====================

function transformPropertyFromDB(db: any): Property {
  return {
    id: db.id,
    title: db.title,
    address: db.address,
    zip: db.zip || '',
    city: db.city,
    district: db.district || '',
    country: db.country || 'Ukraine',
    price: parseFloat(db.price) || 0,
    pricePerSqm: parseFloat(db.price_per_sqm) || 0,
    rooms: db.rooms || 0,
    area: parseFloat(db.area) || 0,
    image: db.image || '',
    images: db.images || [],
    status: db.status || 'Available',
    fullAddress: db.full_address,
    meta: db.meta,
    term: db.term,
    termStatus: db.term_status,
    balance: parseFloat(db.balance) || 0,
    description: db.description,
    details: db.details || {},
    building: db.building || {},
    inventory: db.inventory || [],
    meterReadings: db.meter_readings || [],
    meterLog: db.meter_log || [],
    tenant: db.tenant,
    rentalHistory: db.rental_history || [],
    rentPayments: db.rent_payments || [],
    ownerExpense: db.owner_expense,
    futurePayments: db.future_payments || [],
    repairRequests: db.repair_requests || [],
    events: db.events || [],
    floor: db.floor,
    totalFloors: db.total_floors,
    bathrooms: db.bathrooms,
    balcony: db.balcony || false,
    builtYear: db.built_year,
    renovationYear: db.renovation_year,
    netRent: parseFloat(db.net_rent) || undefined,
    ancillaryCosts: parseFloat(db.ancillary_costs) || undefined,
    heatingCosts: parseFloat(db.heating_costs) || undefined,
    heatingIncluded: db.heating_included || false,
    deposit: db.deposit,
    buildingType: db.building_type,
    heatingType: db.heating_type,
    energyCertificate: db.energy_certificate,
    endEnergyDemand: db.end_energy_demand,
    energyEfficiencyClass: db.energy_efficiency_class,
    parking: db.parking,
  };
}

function transformPropertyToDB(property: Property): any {
  return {
    title: property.title,
    address: property.address,
    zip: property.zip,
    city: property.city,
    district: property.district,
    country: property.country,
    price: property.price,
    price_per_sqm: property.pricePerSqm,
    rooms: property.rooms,
    area: property.area,
    image: property.image,
    images: property.images,
    status: property.status,
    full_address: property.fullAddress,
    meta: property.meta,
    term: property.term,
    term_status: property.termStatus,
    balance: property.balance,
    description: property.description,
    details: property.details,
    building: property.building,
    inventory: property.inventory,
    meter_readings: property.meterReadings,
    meter_log: property.meterLog,
    tenant: property.tenant,
    rental_history: property.rentalHistory,
    rent_payments: property.rentPayments,
    owner_expense: property.ownerExpense,
    future_payments: property.futurePayments,
    repair_requests: property.repairRequests,
    events: property.events,
    floor: property.floor,
    total_floors: property.totalFloors,
    bathrooms: property.bathrooms,
    balcony: property.balcony,
    built_year: property.builtYear,
    renovation_year: property.renovationYear,
    net_rent: property.netRent,
    ancillary_costs: property.ancillaryCosts,
    heating_costs: property.heatingCosts,
    heating_included: property.heatingIncluded,
    deposit: property.deposit,
    building_type: property.buildingType,
    heating_type: property.heatingType,
    energy_certificate: property.energyCertificate,
    end_energy_demand: property.endEnergyDemand,
    energy_efficiency_class: property.energyEfficiencyClass,
    parking: property.parking,
  };
}

function transformBookingFromDB(db: any): Booking {
  return {
    id: db.id, // UUID as string
    roomId: db.room_id,
    start: db.start_date,
    end: db.end_date,
    guest: db.guest,
    color: db.color || '#3b82f6',
    checkInTime: db.check_in_time,
    checkOutTime: db.check_out_time,
    status: db.status,
    price: db.price,
    balance: db.balance,
    guests: db.guests,
    unit: db.unit,
    comments: db.comments,
    paymentAccount: db.payment_account,
    company: db.company,
    ratePlan: db.rate_plan,
    guarantee: db.guarantee,
    cancellationPolicy: db.cancellation_policy,
    noShowPolicy: db.no_show_policy,
    channel: db.channel,
    type: db.type || 'GUEST',
    address: db.address,
    phone: db.phone,
    email: db.email,
    pricePerNight: parseFloat(db.price_per_night) || undefined,
    taxRate: parseFloat(db.tax_rate) || undefined,
    totalGross: db.total_gross,
    guestList: db.guest_list || [],
    clientType: db.client_type,
    firstName: db.first_name,
    lastName: db.last_name,
    companyName: db.company_name,
    internalCompany: db.internal_company,
    createdAt: db.created_at,
  };
}

function transformBookingToDB(booking: Booking): any {
  return {
    room_id: booking.roomId,
    property_id: booking.propertyId,
    start_date: booking.start,
    end_date: booking.end,
    guest: booking.guest,
    color: booking.color,
    check_in_time: booking.checkInTime,
    check_out_time: booking.checkOutTime,
    status: booking.status,
    price: booking.price,
    balance: booking.balance,
    guests: booking.guests,
    unit: booking.unit,
    comments: booking.comments,
    payment_account: booking.paymentAccount,
    company: booking.company,
    rate_plan: booking.ratePlan,
    guarantee: booking.guarantee,
    cancellation_policy: booking.cancellationPolicy,
    no_show_policy: booking.noShowPolicy,
    channel: booking.channel,
    type: booking.type,
    address: booking.address,
    phone: booking.phone,
    email: booking.email,
    price_per_night: booking.pricePerNight,
    tax_rate: booking.taxRate,
    total_gross: booking.totalGross,
    guest_list: booking.guestList,
    client_type: booking.clientType,
    first_name: booking.firstName,
    last_name: booking.lastName,
    company_name: booking.companyName,
    internal_company: booking.internalCompany,
  };
}

function transformOfferFromDB(db: any): OfferData {
  return {
    id: db.id,
    clientName: db.client_name,
    propertyId: db.property_id,
    internalCompany: db.internal_company,
    price: db.price,
    dates: `${db.start_date} to ${db.end_date}`,
    status: db.status,
    createdAt: db.created_at,
    guests: db.guests,
    email: db.email,
    phone: db.phone,
    address: db.address,
    checkInTime: db.check_in_time,
    checkOutTime: db.check_out_time,
    guestList: db.guest_list || [],
    comments: db.comments,
    unit: db.unit,
  };
}

function transformOfferToDB(offer: OfferData): any {
  const [startDate, endDate] = offer.dates?.split(' to ') || ['', ''];
  return {
    client_name: offer.clientName,
    property_id: offer.propertyId,
    internal_company: offer.internalCompany,
    price: offer.price,
    start_date: startDate,
    end_date: endDate,
    status: offer.status,
    guests: offer.guests,
    email: offer.email,
    phone: offer.phone,
    address: offer.address,
    check_in_time: offer.checkInTime,
    check_out_time: offer.checkOutTime,
    guest_list: offer.guestList,
    comments: offer.comments,
    unit: offer.unit,
  };
}

function transformInvoiceFromDB(db: any): InvoiceData {
  return {
    id: db.id,
    invoiceNumber: db.invoice_number,
    date: db.date,
    dueDate: db.due_date,
    internalCompany: db.internal_company,
    clientName: db.client_name,
    clientAddress: db.client_address,
    items: db.items || [],
    totalNet: parseFloat(db.total_net) || 0,
    taxAmount: parseFloat(db.tax_amount) || 0,
    totalGross: parseFloat(db.total_gross) || 0,
    status: db.status,
    offerIdSource: db.offer_id,
    bookingId: db.booking_id,
  };
}

function transformInvoiceToDB(invoice: InvoiceData): any {
  return {
    invoice_number: invoice.invoiceNumber,
    date: invoice.date,
    due_date: invoice.dueDate,
    internal_company: invoice.internalCompany,
    client_name: invoice.clientName,
    client_address: invoice.clientAddress,
    items: invoice.items,
    total_net: invoice.totalNet,
    tax_amount: invoice.taxAmount,
    total_gross: invoice.totalGross,
    status: invoice.status,
    offer_id: invoice.offerIdSource,
    booking_id: invoice.bookingId,
  };
}

function transformLeadFromDB(db: any): Lead {
  return {
    id: db.id,
    name: db.name,
    type: db.type,
    contactPerson: db.contact_person,
    email: db.email,
    phone: db.phone,
    address: db.address,
    status: db.status,
    createdAt: db.created_at,
    source: db.source,
  };
}

function transformLeadToDB(lead: Lead): any {
  return {
    name: lead.name,
    type: lead.type,
    contact_person: lead.contactPerson,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    status: lead.status,
    source: lead.source,
  };
}

function transformRequestFromDB(db: any): RequestData {
  return {
    id: db.id,
    firstName: db.first_name,
    lastName: db.last_name,
    email: db.email,
    phone: db.phone,
    companyName: db.company_name,
    peopleCount: db.people_count,
    startDate: db.start_date,
    endDate: db.end_date,
    message: db.message,
    propertyId: db.property_id,
    status: db.status,
    createdAt: db.created_at,
    processedAt: db.processed_at,
  };
}

function transformRequestToDB(request: RequestData): any {
  return {
    first_name: request.firstName,
    last_name: request.lastName,
    email: request.email,
    phone: request.phone,
    company_name: request.companyName,
    people_count: request.peopleCount,
    start_date: request.startDate,
    end_date: request.endDate,
    message: request.message,
    property_id: request.propertyId,
    status: request.status,
    processed_at: request.processedAt,
  };
}

function transformCalendarEventFromDB(db: any): CalendarEvent {
  return {
    id: db.id,
    title: db.title,
    propertyId: db.property_id,
    bookingId: db.booking_id,
    unitId: db.unit_id,
    time: db.time,
    isAllDay: db.is_all_day || false,
    type: db.type,
    day: db.day,
    date: db.date,
    description: db.description,
    assignee: db.assignee,
    assignedWorkerId: db.assigned_worker_id,
    hasUnreadMessage: db.has_unread_message || false,
    status: db.status,
    meterReadings: db.meter_readings,
  };
}

function transformCalendarEventToDB(event: CalendarEvent): any {
  return {
    title: event.title,
    property_id: event.propertyId,
    booking_id: event.bookingId,
    unit_id: event.unitId,
    time: event.time,
    is_all_day: event.isAllDay,
    type: event.type,
    day: event.day,
    date: event.date,
    description: event.description,
    assignee: event.assignee,
    assigned_worker_id: event.assignedWorkerId,
    has_unread_message: event.hasUnreadMessage,
    status: event.status,
    meter_readings: event.meterReadings,
  };
}

