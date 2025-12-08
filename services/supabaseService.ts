import { createClient } from '../utils/supabase/client';
import { Property, Booking, OfferData, InvoiceData, Lead, RequestData, CalendarEvent, Room, CompanyDetails, Worker, TaskWorkflow, TaskComment, CategoryAccess } from '../types';

const supabase = createClient();

// ==================== WORKERS ====================
export const workersService = {
  async getAll(): Promise<Worker[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data.map(transformWorkerFromDB);
  },

  async getById(id: string): Promise<Worker | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) return null;
    return transformWorkerFromDB(data);
  }
};

// ==================== USER MANAGEMENT ====================
export const usersService = {
  // Get all users (same as workersService.getAll but with more context)
  async getAll(): Promise<Worker[]> {
    return workersService.getAll();
  },

  // Create new user and send invite link
  // Note: This requires a backend/Edge Function for admin operations
  // For now, we'll create the profile and let admin handle auth setup manually
  // Or use a generated password approach
  async create(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_manager' | 'manager' | 'worker';
    department: 'facility' | 'accounting' | 'sales' | 'general';
    categoryAccess?: CategoryAccess[];
  }): Promise<Worker> {
    // Generate a temporary password (user will need to reset it)
    const tempPassword = crypto.randomUUID().substring(0, 12) + 'A1!';
    
    // 1. Try to create user in auth (this will work if email confirmation is disabled)
    // Otherwise, we'll need to handle this via Edge Function
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: userData.email,
      password: tempPassword,
      options: {
        data: {
          first_name: userData.firstName,
          last_name: userData.lastName,
        },
        emailRedirectTo: window.location.origin + '/account'
      }
    });

    let userId: string;

    if (authError) {
      // If user already exists, check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', userData.email)
        .single();

      if (existingProfile) {
        // Update existing profile
        const profileData = {
          first_name: userData.firstName,
          last_name: userData.lastName,
          name: `${userData.firstName} ${userData.lastName}`,
          role: userData.role,
          department: userData.department,
          category_access: userData.categoryAccess || ['properties', 'facility', 'accounting', 'sales', 'tasks'],
          is_active: true,
        };

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', existingProfile.id)
          .select()
          .single();

        if (profileError) throw profileError;
        return transformWorkerFromDB(profile);
      }
      
      // User exists in auth but no profile - create profile
      // We need to get user ID from auth, but we can't query by email on client
      // For now, throw error and ask admin to use Edge Function or manual setup
      throw new Error(`Користувач з email ${userData.email} вже існує. Будь ласка, використайте Edge Function для створення користувачів або створіть профіль вручну.`);
    }

    if (!authData?.user) {
      throw new Error('Не вдалося створити користувача в auth');
    }

    userId = authData.user.id;

    // 2. Create profile
    const profileData = {
      id: userId,
      name: `${userData.firstName} ${userData.lastName}`,
      first_name: userData.firstName,
      last_name: userData.lastName,
      email: userData.email,
      role: userData.role,
      department: userData.department,
      category_access: userData.categoryAccess || ['properties', 'facility', 'accounting', 'sales', 'tasks'],
      is_active: true,
    };

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert([profileData])
      .select()
      .single();

    if (profileError) {
      // If profile insert fails, try to clean up auth user
      console.error('Profile creation failed, auth user may need cleanup:', profileError);
      throw profileError;
    }

    // Note: In production, send tempPassword via email or Edge Function
    // For now, we'll just create the user and they can use password reset
    console.log('⚠️ User created with temp password. In production, send this via email:', tempPassword);
    
    return transformWorkerFromDB(profile);
  },

  // Update user (role, department, category access)
  async update(id: string, updates: {
    role?: 'super_manager' | 'manager' | 'worker';
    department?: 'facility' | 'accounting' | 'sales' | 'general';
    categoryAccess?: CategoryAccess[];
    firstName?: string;
    lastName?: string;
  }): Promise<Worker> {
    // First, get existing data to rebuild name if needed
    const { data: existing, error: fetchError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned, which is OK
      console.error('Error fetching existing user data:', fetchError);
      throw new Error(`Помилка отримання даних користувача: ${fetchError.message}`);
    }

    const updateData: any = {};
    
    if (updates.role) updateData.role = updates.role;
    if (updates.department) updateData.department = updates.department;
    if (updates.categoryAccess) {
      // Ensure categoryAccess is properly formatted as JSONB array
      updateData.category_access = Array.isArray(updates.categoryAccess) 
        ? updates.categoryAccess 
        : [];
    }
    
    const newFirstName = updates.firstName !== undefined ? updates.firstName : existing?.first_name;
    const newLastName = updates.lastName !== undefined ? updates.lastName : existing?.last_name;
    
    if (updates.firstName !== undefined) {
      updateData.first_name = updates.firstName;
    }
    if (updates.lastName !== undefined) {
      updateData.last_name = updates.lastName;
    }
    
    // Rebuild name from first_name + last_name
    if (newFirstName && newLastName) {
      updateData.name = `${newFirstName} ${newLastName}`;
    } else if (newFirstName) {
      updateData.name = newFirstName;
    } else if (newLastName) {
      updateData.name = newLastName;
    } else if (existing?.first_name || existing?.last_name) {
      // Keep existing name if no updates provided
      const existingName = existing.first_name && existing.last_name
        ? `${existing.first_name} ${existing.last_name}`
        : (existing.first_name || existing.last_name || '');
      if (existingName) updateData.name = existingName;
    }

    // Don't update if no changes
    if (Object.keys(updateData).length === 0) {
      // Return existing user data
      const { data: currentUserData, error: currentUserError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id);
      if (currentUserError) {
        throw new Error(`Помилка отримання даних користувача: ${currentUserError.message}`);
      }
      if (!currentUserData || currentUserData.length === 0) {
        throw new Error('Користувача не знайдено');
      }
      return transformWorkerFromDB(currentUserData[0]);
    }

    // Update the user
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating user in database:', updateError);
      throw new Error(`Помилка оновлення в базі даних: ${updateError.message || updateError.details || 'Невідома помилка'}`);
    }

    // Fetch updated user data separately (to avoid RLS issues with SELECT after UPDATE)
    const { data: updatedData, error: fetchUpdatedError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchUpdatedError) {
      console.error('Error fetching updated user data:', fetchUpdatedError);
      // If update succeeded but fetch failed, still consider it a success
      // The user will see the changes after page reload
      throw new Error(`Оновлення виконано, але не вдалося отримати оновлені дані. Будь ласка, оновіть сторінку. Помилка: ${fetchUpdatedError.message}`);
    }
    
    if (!updatedData) {
      // Update succeeded but no data returned - might be RLS issue
      // Try to get user data with a different approach or just return success
      console.warn('Update succeeded but no data returned - possible RLS issue');
      throw new Error('Оновлення виконано, але не вдалося отримати оновлені дані через обмеження доступу. Будь ласка, оновіть сторінку вручну.');
    }
    
    console.log('✅ Updated user data from DB:', { id: updatedData.id, role: updatedData.role, department: updatedData.department });
    const transformed = transformWorkerFromDB(updatedData);
    console.log('✅ Transformed user data:', { id: transformed.id, role: transformed.role, department: transformed.department });
    return transformed;
    
    return transformWorkerFromDB(data);
  },

  // Deactivate user (set is_active = false)
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
  },

  // Reactivate user (set is_active = true)
  async reactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true })
      .eq('id', id);

    if (error) throw error;
  }
};

// ==================== TASKS (KANBAN & CALENDAR) ====================
export const tasksService = {
  async getAll(filters?: { 
    department?: string; 
    workerId?: string; 
    managerId?: string;
    isIssue?: boolean;
  }): Promise<CalendarEvent[]> {
    let query = supabase
      .from('calendar_events')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.department) {
      if (filters.department === 'facility') {
        // Include general tasks or tasks specifically for facility
        // For now simple filter
        query = query.eq('department', 'facility');
      } else if (filters.department === 'accounting') {
        query = query.eq('department', 'accounting');
      }
    }

    if (filters?.workerId) {
      query = query.eq('worker_id', filters.workerId);
    }

    if (filters?.managerId) {
      query = query.eq('manager_id', filters.managerId);
    }

    if (filters?.isIssue !== undefined) {
      query = query.eq('is_issue', filters.isIssue);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.map(transformCalendarEventFromDB);
  },

  async create(task: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
    const dbData = transformCalendarEventToDB(task);
    
    // Default logic for "Quick Task" (if date is missing, set to today)
    if (!dbData.date && !dbData.is_issue) { // Don't force date on backlog issues if we want them dateless?
       // Actually prompt said: "if I don't assign date/time -> automatically create for today current hour"
       const now = new Date();
       dbData.date = now.toISOString().split('T')[0];
       dbData.time = `${now.getHours().toString().padStart(2, '0')}:00`;
       dbData.day = now.getDate();
    }

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
    // Remove undefined fields to avoid overwriting with null if not intended
    Object.keys(dbData).forEach(key => dbData[key] === undefined && delete dbData[key]);

    const { data, error } = await supabase
      .from('calendar_events')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformCalendarEventFromDB(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // For Issue Reporting
  async reportIssue(issue: {
    title: string;
    description: string;
    images: string[];
    department: 'facility' | 'accounting';
    reporterId: string; // Worker ID
  }): Promise<CalendarEvent> {
    // Find department manager (simplified: just assigned to "unassigned" in that department for now, 
    // or specific logic to find manager. In our logic: Issue falls into Manager's column.
    // We need to know WHICH manager. For now, let's leave manager_id null, 
    // and Managers will filter by "department + manager_id is null" OR we assign to a default manager.
    // Better: Leave manager_id NULL, but set is_issue = true. 
    // Managers columns will fetch issues where department matches.
    
    const task: any = {
      title: issue.title,
      description: issue.description,
      images: issue.images,
      department: issue.department,
      is_issue: true,
      priority: 'high', // Issues are usually high priority
      status: 'pending',
      // No date/time -> Backlog/Inbox
    };

    const { data, error } = await supabase
      .from('calendar_events')
      .insert([task])
      .select()
      .single();

    if (error) throw error;
    return transformCalendarEventFromDB(data);
  }
};

// ==================== PROPERTIES ====================
export const propertiesService = {
  // Get all properties
  async getAll(lightweight = false): Promise<Property[]> {
    try {
      console.log('📡 propertiesService.getAll called, lightweight:', lightweight);
      // For Marketplace/public views, only load essential fields for faster loading
      const selectFields = lightweight 
        ? 'id, title, address, city, district, country, price, rooms, area, image, images, status, full_address, description, zip'
        : '*';
      
      console.log('📡 Querying properties table with fields:', selectFields);
      const { data, error } = await supabase
        .from('properties')
        .select(selectFields)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Supabase query error:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }
      
      console.log('📡 Query successful, received', data?.length || 0, 'rows');
      const transformed = data.map(transformPropertyFromDB);
      console.log('📡 Transformed', transformed.length, 'properties');
      return transformed;
    } catch (err: any) {
      console.error('❌ propertiesService.getAll error:', err);
      throw err;
    }
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
  },
  
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
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

// ==================== CALENDAR EVENTS (Legacy / Replaced by tasksService) ====================
// Keep for backward compatibility or direct calendar usage
export const calendarEventsService = tasksService;

// ==================== TRANSFORMERS ====================

function transformWorkerFromDB(db: any): Worker {
  // Build full name from first_name + last_name or fallback to name
  const firstName = db.first_name || '';
  const lastName = db.last_name || '';
  const fullName = (firstName && lastName) 
    ? `${firstName} ${lastName}` 
    : (db.name || 'Unknown');
  
  return {
    id: db.id,
    name: fullName,
    firstName: db.first_name || undefined,
    lastName: db.last_name || undefined,
    email: db.email || '',
    phone: db.phone,
    department: db.department || 'facility',
    role: db.role || 'worker',
    managerId: db.manager_id,
    isActive: db.is_active !== false,
    categoryAccess: db.category_access || ['properties', 'facility', 'accounting', 'sales', 'tasks'],
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function transformPropertyFromDB(db: any): Property {
  return {
    id: db.id,
    title: db.title,
    address: db.address,
    zip: db.zip || '',
    city: db.city,
    district: db.district || '',
    country: db.country || 'Ukraine',
    price: db.price != null ? parseFloat(db.price) : undefined,
    pricePerSqm: db.price_per_sqm != null ? parseFloat(db.price_per_sqm) : undefined,
    rooms: db.rooms || 0,
    area: db.area != null ? parseFloat(db.area) : 0,
    image: db.image || '',
    images: db.images || [],
    status: db.status || 'Available',
    fullAddress: db.full_address || db.fullAddress,
    meta: db.meta,
    term: db.term,
    termStatus: db.term_status || db.termStatus,
    balance: db.balance != null ? parseFloat(db.balance) : 0,
    description: db.description,
    // For lightweight queries, these may be undefined - provide defaults
    details: db.details || {},
    building: db.building || {},
    inventory: db.inventory || [],
    meterReadings: db.meter_readings || db.meterReadings || [],
    meterLog: db.meter_log || db.meterLog || [],
    tenant: db.tenant,
    rentalHistory: db.rental_history || db.rentalHistory || [],
    rentPayments: db.rent_payments || db.rentPayments || [],
    ownerExpense: db.owner_expense || db.ownerExpense,
    futurePayments: db.future_payments || db.futurePayments || [],
    repairRequests: db.repair_requests || db.repairRequests || [],
    events: db.events || [],
    floor: db.floor,
    totalFloors: db.total_floors || db.totalFloors,
    bathrooms: db.bathrooms,
    balcony: db.balcony || false,
    builtYear: db.built_year || db.builtYear,
    renovationYear: db.renovation_year || db.renovationYear,
    netRent: db.net_rent != null ? parseFloat(db.net_rent) : (db.netRent != null ? parseFloat(db.netRent) : undefined),
    ancillaryCosts: db.ancillary_costs != null ? parseFloat(db.ancillary_costs) : (db.ancillaryCosts != null ? parseFloat(db.ancillaryCosts) : undefined),
    heatingCosts: db.heating_costs != null ? parseFloat(db.heating_costs) : (db.heatingCosts != null ? parseFloat(db.heatingCosts) : undefined),
    heatingIncluded: db.heating_included || db.heatingIncluded || false,
    deposit: db.deposit,
    buildingType: db.building_type || db.buildingType,
    heatingType: db.heating_type || db.heatingType,
    energyCertificate: db.energy_certificate || db.energyCertificate,
    endEnergyDemand: db.end_energy_demand || db.endEnergyDemand,
    energyEfficiencyClass: db.energy_efficiency_class || db.energyEfficiencyClass,
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
    assignedWorkerId: db.worker_id, // Use worker_id preferred
    hasUnreadMessage: db.has_unread_message || false,
    status: db.status,
    meterReadings: db.meter_readings,
    // Kanban fields
    priority: db.priority || 'medium',
    isIssue: db.is_issue || false,
    managerId: db.manager_id,
    workerId: db.worker_id,
    department: db.department,
    images: db.images || [],
    checklist: db.checklist || [],
    locationText: db.location_text,
    createdAt: db.created_at || db.date || new Date().toISOString(), // Use created_at from DB, fallback to date or current time
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
    assigned_worker_id: event.workerId || event.assignedWorkerId, // legacy support
    has_unread_message: event.hasUnreadMessage,
    status: event.status,
    meter_readings: event.meterReadings,
    // Kanban fields
    priority: event.priority,
    is_issue: event.isIssue,
    manager_id: event.managerId,
    worker_id: event.workerId || event.assignedWorkerId,
    department: event.department,
    images: event.images,
    checklist: event.checklist,
    location_text: event.locationText,
  };
}
