import { supabase } from '../utils/supabase/client';
import {
  Property,
  Booking,
  OfferData,
  InvoiceData,
  PaymentProof,
  Lead,
  RequestData,
  CalendarEvent,
  Room,
  CompanyDetails,
  Worker,
  TaskWorkflow,
  TaskComment,
  CategoryAccess,
  Item,
  Warehouse,
  WarehouseStock,
  StockMovement,
  WarehouseInvoice,
  WarehouseInvoiceLine,
  Reservation,
  PropertyDocument,
  PropertyDocumentType,
  PropertyDepositProof,
  UnitLeaseTermDb,
  LeaseTermDraftUi,
  AddressBookPartyEntry,
  AddressBookPartyRole,
  ContactParty,
  TenantDetails,
  PaymentChain,
  PaymentChainTile,
  PaymentChainAttachment,
  PaymentChainEdge,
  PaymentChainFile,
  PaymentChainState,
  PaymentChainEdgeKey,
  PaymentChainTileKey,
  RentTimelineRowDB,
  RentalAgreement,
} from '../types';
import { isoToEu } from '../utils/leaseTermDates';

// Lightweight type for joined stock + item for UI
export interface WarehouseStockItem {
  stockId: string;
  warehouseId: string;
  itemId: string;
  quantity: number;
  itemName: string;
  unit: string;
  category?: string;
  sku?: string;
  defaultPrice?: number;
  // New fields for extended stock view
  unitPrice?: number; // Price per unit (from invoice or default)
  invoiceNumber?: string; // Invoice number from first IN movement
  purchaseDate?: string; // Purchase date from first IN movement
  vendor?: string; // Vendor/store name where item was purchased
  lastPropertyName?: string | null; // Property name if transferred, null if still on warehouse
  warehouseName?: string; // Human-readable warehouse name
  propertyAddress?: string; // Property address (street) for search
  transferTaskStatus?: string | null; // Status of last transfer task (calendar_events.status)
}

// ==================== WORKERS ====================
export const workersService = {
  async getAll(): Promise<Worker[]> {
    console.log('🔄 Fetching all workers from database...');
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) {
      console.error('❌ Error fetching workers:', error);
      throw error;
    }
    
    console.log('✅ Raw workers data from DB:', data.map(w => ({ id: w.id, email: w.email, role: w.role, department: w.department })));
    const transformed = data.map(transformWorkerFromDB);
    console.log('✅ Transformed workers:', transformed.map(w => ({ id: w.id, email: w.email, role: w.role, department: w.department })));
    return transformed;
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

// ==================== WAREHOUSE (STOCK & INVOICES) ====================

export const warehouseService = {
  /**
   * Load stock with joined item info for UI.
   * Includes invoice info from first IN movement and last property from TRANSFER/OUT movements.
   * 
   * Note: In the future, invoiceNumber and purchaseDate can come directly from AI-recognized invoices
   * (from OCR modal Add inventory), which will create warehouse_invoices and warehouse_invoice_lines records.
   */
  async getStock(warehouseId?: string): Promise<WarehouseStockItem[]> {
    console.log('📦 Loading warehouse stock...', warehouseId ? { warehouseId } : 'all warehouses');

    let query = supabase
      .from('warehouse_stock')
      .select(
        `
        id,
        warehouse_id,
        item_id,
        quantity,
        items (
          id,
          name,
          category,
          sku,
          default_price,
          unit
        ),
        warehouses (
          id,
          name
        )
      `
      )
      // Show items in the same order as they were originally inserted (e.g. from OCR),
      // so the warehouse list visually matches the recognition order.
      .order('created_at', { ascending: true });

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error loading warehouse stock:', error);
      throw error;
    }

    // For each stock item, fetch invoice info and last property
    const enrichedItems = await Promise.all(
      (data || []).map(async (row: any): Promise<WarehouseStockItem> => {
        const itemId = row.item_id;
        const stockWarehouseId = row.warehouse_id;
        const warehouseName: string | undefined = row.warehouses?.name || undefined;

        // Find first IN movement for this item (to get invoice info)
        const { data: firstInMovement } = await supabase
          .from('stock_movements')
          .select('invoice_id, date')
          .eq('item_id', itemId)
          .eq('warehouse_id', stockWarehouseId)
          .eq('type', 'IN')
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle();

        let invoiceNumber: string | undefined;
        let purchaseDate: string | undefined;
        let unitPrice: number | undefined;
        let vendor: string | undefined;

        if (firstInMovement?.invoice_id) {
          // Fetch invoice details
          const { data: invoice } = await supabase
            .from('warehouse_invoices')
            .select('invoice_number, date, vendor')
            .eq('id', firstInMovement.invoice_id)
            .maybeSingle();

          if (invoice) {
            invoiceNumber = invoice.invoice_number;
            purchaseDate = invoice.date;
            vendor = invoice.vendor;

            // Try to get unit price from invoice line
            const { data: invoiceLine } = await supabase
              .from('warehouse_invoice_lines')
              .select('unit_price')
              .eq('invoice_id', firstInMovement.invoice_id)
              .eq('suggested_item_id', itemId)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();

            if (invoiceLine?.unit_price) {
              unitPrice = parseFloat(invoiceLine.unit_price);
            }
          }
        }

        // If no invoice price, use default_price from items
        if (!unitPrice) {
          unitPrice = row.items?.default_price != null ? parseFloat(row.items.default_price) : undefined;
        }

        // Determine current location: if quantity > 0, item is on warehouse
        // Only check for property if quantity = 0 (all items transferred)
        const currentQuantity = parseFloat(row.quantity ?? 0);
        let lastPropertyName: string | null = null;
        let propertyAddress: string | undefined;
        let transferTaskStatus: string | null = null;

        // Only check for property transfer if quantity is 0 (all items transferred)
        if (currentQuantity === 0) {
          // Find last TRANSFER or OUT movement with property_id (to determine where items went)
          const { data: lastTransferMovement } = await supabase
            .from('stock_movements')
            .select('property_id, date')
            .eq('item_id', itemId)
            .eq('warehouse_id', stockWarehouseId)
            .in('type', ['TRANSFER', 'OUT'])
            .not('property_id', 'is', null)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastTransferMovement?.property_id) {
            // Check if this transfer happened after purchase (if we have purchase date)
            const shouldShowProperty =
              !purchaseDate || new Date(lastTransferMovement.date) >= new Date(purchaseDate);

            if (shouldShowProperty) {
              // Fetch property name + address
              const { data: property } = await supabase
                .from('properties')
                .select('title, address, full_address')
                .eq('id', lastTransferMovement.property_id)
                .maybeSingle();

              if (property) {
                if (property.title) lastPropertyName = property.title;
                propertyAddress = property.full_address || property.address || undefined;
              }

              // Try to find related Facility task for this transfer to determine status
              const { data: transferTask } = await supabase
                .from('calendar_events')
                .select('status')
                .eq('department', 'facility')
                .eq('type', 'Arbeit nach plan')
                .eq('property_id', lastTransferMovement.property_id)
                .ilike('title', '%Перевезти інвентар%')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (transferTask) {
                transferTaskStatus = transferTask.status || null;
              }
            }
          }
        }

        return {
          stockId: row.id,
          warehouseId: row.warehouse_id,
          itemId: row.item_id,
          quantity: parseFloat(row.quantity ?? 0),
          itemName: row.items?.name || 'Unknown item',
          unit: row.items?.unit || 'pcs',
          category: row.items?.category || undefined,
          sku: row.items?.sku || undefined,
          defaultPrice: row.items?.default_price != null ? parseFloat(row.items.default_price) : undefined,
          unitPrice: unitPrice,
          invoiceNumber: invoiceNumber,
          purchaseDate: purchaseDate,
          vendor: vendor,
          lastPropertyName: lastPropertyName,
          warehouseName,
          propertyAddress,
          transferTaskStatus,
        };
      })
    );

    return enrichedItems;
  },

  /**
   * Decrease stock quantity for a specific stock row.
   * Quantity is validated on the client side before calling this.
   */
  async decreaseStockQuantity(stockId: string, quantityToSubtract: number): Promise<void> {
    if (quantityToSubtract <= 0) return;

    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('quantity')
      .eq('id', stockId)
      .single();

    if (error) {
      console.error('❌ Error reading current stock quantity:', error);
      throw error;
    }

    const currentQty = parseFloat(data?.quantity ?? 0);
    const newQty = Math.max(currentQty - quantityToSubtract, 0);

    const { error: updateError } = await supabase
      .from('warehouse_stock')
      .update({ quantity: newQty })
      .eq('id', stockId);

    if (updateError) {
      console.error('❌ Error updating stock quantity:', updateError);
      throw updateError;
    }
  },

  /**
   * Create stock movement entries for audit/history.
   */
  async createStockMovement(movement: Omit<StockMovement, 'id' | 'createdAt' | 'updatedAt' | 'date'>): Promise<void> {
    const payload = {
      warehouse_id: movement.warehouseId,
      item_id: movement.itemId,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason,
      property_id: movement.propertyId,
      worker_id: movement.workerId,
      invoice_id: movement.invoiceId,
      // date, created_at, updated_at handled by DB defaults
    };

    const { error } = await supabase.from('stock_movements').insert([payload]);
    if (error) {
      console.error('❌ Error creating stock movement:', error);
      throw error;
    }
  },

  /**
   * Simple helpers for invoices list (used by Warehouse → Invoices tab).
   * AI parsing / Edge Function will fill lines on the server later.
   */
  async getInvoices(): Promise<WarehouseInvoice[]> {
    const { data, error } = await supabase
      .from('warehouse_invoices')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('❌ Error loading warehouse invoices:', error);
      throw error;
    }

    return (data || []).map(
      (row: any): WarehouseInvoice => ({
        id: row.id,
        vendor: row.vendor,
        invoiceNumber: row.invoice_number,
        date: row.date,
        fileUrl: row.file_url || undefined,
        createdBy: row.created_by || undefined,
        lines: [], // Lines are loaded separately for now
      })
    );
  },

  async getInvoiceLines(invoiceId: string): Promise<WarehouseInvoiceLine[]> {
    const { data, error } = await supabase
      .from('warehouse_invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error loading warehouse invoice lines:', error);
      throw error;
    }

    return (data || []).map(
      (row: any): WarehouseInvoiceLine => ({
        id: row.id,
        invoiceId: row.invoice_id,
        itemName: row.item_name,
        description: row.description || undefined,
        quantity: parseFloat(row.quantity ?? 0),
        unitPrice: parseFloat(row.unit_price ?? 0),
        totalPrice: parseFloat(row.total_price ?? 0),
        suggestedItemId: row.suggested_item_id || undefined,
        targetPropertyId: row.target_property_id || undefined,
      })
    );
  },

  /**
   * Create simple invoice record – for now used as a mock when testing AI flow.
   * Lines can be created separately via createInvoiceLines.
   */
  async createInvoice(
    payload: Omit<WarehouseInvoice, 'id' | 'lines' | 'createdAt' | 'updatedAt'>
  ): Promise<WarehouseInvoice> {
    const insertData = {
      vendor: payload.vendor,
      invoice_number: payload.invoiceNumber,
      date: payload.date,
      file_url: payload.fileUrl,
      created_by: payload.createdBy,
    };

    const { data, error } = await supabase
      .from('warehouse_invoices')
      .insert([insertData])
      .select('*')
      .single();

    if (error) {
      console.error('❌ Error creating warehouse invoice:', error);
      throw error;
    }

    return {
      id: data.id,
      vendor: data.vendor,
      invoiceNumber: data.invoice_number,
      date: data.date,
      fileUrl: data.file_url || undefined,
      createdBy: data.created_by || undefined,
      lines: [],
    };
  },

  async createInvoiceLines(
    invoiceId: string,
    lines: Array<Omit<WarehouseInvoiceLine, 'id' | 'invoiceId' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    if (!lines.length) return;

    const insertData = lines.map((l) => ({
      invoice_id: invoiceId,
      item_name: l.itemName,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      total_price: l.totalPrice,
      suggested_item_id: l.suggestedItemId,
      target_property_id: l.targetPropertyId,
    }));

    const { error } = await supabase.from('warehouse_invoice_lines').insert(insertData);
    if (error) {
      console.error('❌ Error creating warehouse invoice lines:', error);
      throw error;
    }
  },

  /**
   * Add inventory items from OCR table to warehouse stock.
   * Creates/updates items in catalog and adds/updates warehouse_stock.
   * Optionally creates invoice record if invoiceNumber and purchaseDate are provided.
   */
  async addInventoryFromOCR(
    items: Array<{
      name: string;
      quantity: number;
      unit: string;
      price?: number;
      category?: string;
      sku?: string;
    }>,
    warehouseId?: string,
    invoiceNumber?: string,
    purchaseDate?: string,
    vendor?: string
  ): Promise<void> {
    if (!items.length) return;

    // Get default warehouse (first one) if not provided
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      const { data: warehouses } = await supabase
        .from('warehouses')
        .select('id')
        .limit(1);
      if (!warehouses || warehouses.length === 0) {
        throw new Error('No warehouse found. Please create a warehouse first.');
      }
      targetWarehouseId = warehouses[0].id;
    }

    // Create invoice if invoiceNumber and purchaseDate are provided
    let invoiceId: string | undefined;
    if (invoiceNumber && purchaseDate) {
      try {
        const invoice = await this.createInvoice({
          vendor: vendor || 'Unknown',
          invoiceNumber: invoiceNumber,
          date: purchaseDate,
          fileUrl: undefined,
          createdBy: undefined,
        });
        invoiceId = invoice.id;
      } catch (error) {
        console.warn('⚠️ Failed to create invoice, continuing without invoice link:', error);
      }
    }

    for (const item of items) {
      if (!item.name || item.quantity <= 0) continue;

      // Find or create Item in catalog
      let itemId: string;
      const { data: existingItem } = await supabase
        .from('items')
        .select('id')
        .eq('name', item.name.trim())
        .maybeSingle();

      if (existingItem) {
        itemId = existingItem.id;
        // Update default_price and sku if provided
        const updateData: any = {};
        if (item.price !== undefined && item.price > 0) {
          updateData.default_price = item.price;
        }
        if (item.sku) {
          updateData.sku = item.sku.trim();
        }
        if (Object.keys(updateData).length > 0) {
          await supabase.from('items').update(updateData).eq('id', itemId);
        }
      } else {
        // Create new Item
        const { data: newItem, error: createError } = await supabase
          .from('items')
          .insert([
            {
              name: item.name.trim(),
              category: item.category || 'General',
              unit: item.unit || 'pcs',
              default_price: item.price || null,
              sku: item.sku?.trim() || null,
            },
          ])
          .select('id')
          .single();

        if (createError) {
          console.error(`❌ Error creating item "${item.name}":`, createError);
          continue;
        }
        itemId = newItem.id;
      }

      // Find or create warehouse_stock entry
      const { data: existingStock } = await supabase
        .from('warehouse_stock')
        .select('id, quantity')
        .eq('warehouse_id', targetWarehouseId)
        .eq('item_id', itemId)
        .maybeSingle();

      if (existingStock) {
        // Update quantity (add to existing)
        const newQuantity = parseFloat(existingStock.quantity ?? 0) + item.quantity;
        await supabase
          .from('warehouse_stock')
          .update({ quantity: newQuantity })
          .eq('id', existingStock.id);
      } else {
        // Create new stock entry
        await supabase.from('warehouse_stock').insert([
          {
            warehouse_id: targetWarehouseId,
            item_id: itemId,
            quantity: item.quantity,
          },
        ]);
      }

      // Create stock movement (IN type) with invoice link if available
      await this.createStockMovement({
        warehouseId: targetWarehouseId,
        itemId: itemId,
        type: 'IN',
        quantity: item.quantity,
        reason: 'OCR import',
        invoiceId: invoiceId,
      });
    }
  },

  /**
   * Delete stock item (remove from warehouse_stock).
   */
  async deleteStockItem(stockId: string): Promise<void> {
    const { error } = await supabase.from('warehouse_stock').delete().eq('id', stockId);
    if (error) {
      console.error('❌ Error deleting stock item:', error);
      throw error;
    }
  },

  /**
   * Get all warehouses.
   */
  async getWarehouses(): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ Error loading warehouses:', error);
      throw error;
    }

    return (data || []).map(
      (row: any): Warehouse => ({
        id: row.id,
        name: row.name,
        location: row.location || undefined,
        description: row.description || undefined,
      })
    );
  },

  /**
   * Create a new warehouse.
   */
  async createWarehouse(
    name: string,
    location?: string,
    description?: string
  ): Promise<Warehouse> {
    const insertData: any = {
      name: name.trim(),
    };
    if (location) insertData.location = location.trim();
    if (description) insertData.description = description.trim();

    const { data, error } = await supabase
      .from('warehouses')
      .insert([insertData])
      .select('*')
      .single();

    if (error) {
      console.error('❌ Error creating warehouse:', error);
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      location: data.location || undefined,
      description: data.description || undefined,
    };
  },
};

// ==================== USER MANAGEMENT ====================
export const usersService = {
  // Get all users (same as workersService.getAll but with more context)
  async getAll(): Promise<Worker[]> {
    return workersService.getAll();
  },

  // Create new user without sending invitation
  async createWithoutInvite(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_manager' | 'manager' | 'worker';
    department: 'facility' | 'accounting' | 'sales' | 'general';
    categoryAccess?: CategoryAccess[];
  }): Promise<Worker> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env variables');
    const functionsUrl = `${supabaseUrl}/functions/v1/invite-user`;

    console.log('👤 Creating user without invitation:', userData.email);

    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        department: userData.department,
        categoryAccess: userData.categoryAccess || ['properties', 'facility', 'accounting', 'sales', 'tasks'],
        skipInvite: true, // Don't send invitation
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to create user: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success || !result.user) {
      throw new Error('Failed to create user: Invalid response from server');
    }

    console.log('✅ User created without invitation:', result.user.email);
    
    // Transform to Worker format
    return {
      id: result.user.id,
      name: result.user.name,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      phone: undefined,
      department: result.user.department,
      role: result.user.role,
      managerId: undefined,
      isActive: true,
      categoryAccess: result.user.categoryAccess,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  // Create new user and send invite link via Edge Function
  async create(userData: {
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_manager' | 'manager' | 'worker';
    department: 'facility' | 'accounting' | 'sales' | 'general';
    categoryAccess?: CategoryAccess[];
  }): Promise<Worker> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env variables');
    const functionsUrl = `${supabaseUrl}/functions/v1/invite-user`;

    // Get current session token for authentication (if JWT verification is enabled)
    // If JWT verification is disabled in Edge Function, we can use anon key directly
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || anonKey;

    console.log('📧 Calling Edge Function to invite user:', userData.email);
    console.log('🔑 Using auth token:', authToken ? 'present' : 'missing');

    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`, // Use anon key when JWT verification is disabled
        'apikey': anonKey,
      },
      body: JSON.stringify({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        department: userData.department,
        categoryAccess: userData.categoryAccess || ['properties', 'facility', 'accounting', 'sales', 'tasks'],
        emailRedirectTo: `${window.location.origin}/login`
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to create user: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success || !result.user) {
      throw new Error('Failed to create user: Invalid response from server');
    }

    console.log('✅ User created and invitation sent:', result.user.email);
    
    // Transform to Worker format
    return {
      id: result.user.id,
      name: result.user.name,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      email: result.user.email,
      phone: undefined,
      department: result.user.department,
      role: result.user.role,
      managerId: undefined,
      isActive: true,
      categoryAccess: result.user.categoryAccess,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  // Resend invitation email for existing user
  async resendInvite(userId: string, email: string): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_* env variables');
    const functionsUrl = `${supabaseUrl}/functions/v1/invite-user`;

    // Get current session token for authentication (if JWT verification is enabled)
    // If JWT verification is disabled in Edge Function, we can use anon key directly
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || anonKey;

    console.log('📧 Resending invitation to:', email);
    console.log('🔑 Using auth token:', authToken ? 'present' : 'missing');

    const response = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`, // Use anon key when JWT verification is disabled
        'apikey': anonKey,
      },
      body: JSON.stringify({
        userId: userId,
        email: email,
        emailRedirectTo: `${window.location.origin}/login`
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Failed to resend invitation: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error('Failed to resend invitation: Invalid response from server');
    }

    console.log('✅ Invitation resent to:', email);
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
    
    // Always update role if provided (even if it's the same value)
    if (updates.role !== undefined) {
      updateData.role = updates.role;
      console.log('📝 Setting role in updateData:', updates.role);
    }
    if (updates.department !== undefined) {
      updateData.department = updates.department;
      console.log('📝 Setting department in updateData:', updates.department);
    }
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
    console.log('📝 Updating user in database:', { id, updateData, role: updates.role, department: updates.department });
    
    // First, try UPDATE with SELECT to get immediate result
    const { error: updateError, data: updateResult } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select('id, role, department, name'); // Select to verify update

    if (updateError) {
      console.error('❌ Error updating user in database:', updateError);
      throw new Error(`Помилка оновлення в базі даних: ${updateError.message || updateError.details || 'Невідома помилка'}`);
    }
    
    console.log('✅ Update result from database (immediate):', updateResult);
    
    // If updateResult is empty, it might be RLS blocking the SELECT
    // In that case, we'll fetch separately
    if (!updateResult || updateResult.length === 0) {
      console.warn('⚠️ UPDATE succeeded but SELECT returned no rows - likely RLS issue, fetching separately...');
    } else {
      console.log('✅ Role in update result:', updateResult[0]?.role);
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
      // Для manager/worker: показувати завдання призначені їм АБО verified/archived/completed завдання (які мають бути видимі всім)
      // Використовуємо or() для включення завдань з правильним worker_id, без worker_id, або verified/archived/completed завдання
      query = query.or(`worker_id.eq.${filters.workerId},worker_id.is.null,status.eq.verified,status.eq.archived,status.eq.completed`);
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

    // Ensure transfer tasks (and any task with payload) persist property_id and description; production had NULLs without this
    const propertyIdSrc = task.propertyId ?? (task as any).property_id;
    if (propertyIdSrc != null && propertyIdSrc !== '') {
      dbData.property_id = propertyIdSrc;
    }
    const descriptionSrc = task.description ?? (task as any).description;
    if (descriptionSrc != null && descriptionSrc !== '') {
      dbData.description = typeof descriptionSrc === 'string' ? descriptionSrc : JSON.stringify(descriptionSrc);
    }

    // Debug: verify payload before insert (safe, no PII)
    if (task.title?.includes('Перевезти інвентар') || task.title?.includes('transfer')) {
      console.log('[transfer task create]', {
        title: task.title?.slice(0, 60),
        hasPropertyId: !!dbData.property_id,
        descriptionLength: (dbData.description?.length ?? 0),
        dbDataPropertyId: dbData.property_id ?? null,
        dbDataDescriptionLength: (dbData.description?.length ?? 0),
      });
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1062',message:'tasksService.update called',data:{taskId:id,updates:{workerId:updates.workerId,status:updates.status,bookingId:updates.bookingId}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
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
    
    // #region agent log
    const result = transformCalendarEventFromDB(data);
    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1075',message:'tasksService.update completed',data:{taskId:result.id,taskType:result.type,bookingId:result.bookingId,workerId:result.workerId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    return result;
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
        ? 'id, title, address, city, district, country, price, rooms, area, image, images, status, full_address, description, zip, zweckentfremdung_flag, zweckentfremdung_updated_at, cover_photo_asset_id'
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1182',message:'propertiesService.update entry',data:{propertyId:id,hasInventory:!!updates.inventory,inventoryCount:updates.inventory?.length||0,inventoryItems:updates.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    const dbData = transformPropertyToDB(updates as Property);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1186',message:'dbData before update',data:{hasInventory:!!dbData.inventory,inventoryCount:dbData.inventory?.length||0,inventoryItems:dbData.inventory?.slice(0,3)||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    const { data, error } = await supabase
      .from('properties')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1193',message:'propertiesService.update error',data:{error:error.message,code:error.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      throw error;
    }
    
    const transformed = transformPropertyFromDB(data);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f1e0709a-55bc-4f79-9118-1c26783278f9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1200',message:'propertiesService.update success',data:{propertyId:id,returnedInventoryCount:transformed.inventory?.length||0,returnedInventoryItems:transformed.inventory?.slice(0,3).map((i:any)=>({itemId:i.itemId,invNumber:i.invNumber,name:i.name,type:i.type}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    return transformed;
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

// ==================== ADDRESS BOOK (parties auto-capture) ====================
function addressBookRowFromDB(db: any): AddressBookPartyEntry {
  return {
    id: db.id,
    ownerUserId: db.owner_user_id,
    role: db.role as AddressBookPartyRole,
    name: db.name ?? '',
    iban: db.iban ?? '',
    street: db.street ?? '',
    zip: db.zip ?? '',
    city: db.city ?? '',
    houseNumber: db.house_number ?? null,
    country: db.country ?? null,
    phones: db.phones ?? null,
    emails: db.emails ?? null,
    paymentDay: db.payment_day ?? null,
    unitIdentifier: db.unit_identifier ?? null,
    contactPerson: db.contact_person ?? null,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function toPhonesArray(party: { phone?: string; phones?: string[] }): string[] {
  if (Array.isArray(party.phones) && party.phones.length) {
    return party.phones.map((s) => String(s).trim()).filter(Boolean);
  }
  if (party.phone != null && String(party.phone).trim()) {
    return [String(party.phone).trim()];
  }
  return [];
}

function toEmailsArray(party: { email?: string; emails?: string[] }): string[] {
  if (Array.isArray(party.emails) && party.emails.length) {
    return party.emails.map((s) => String(s).trim()).filter(Boolean);
  }
  if (party.email != null && String(party.email).trim()) {
    return [String(party.email).trim()];
  }
  return [];
}

export const addressBookPartiesService = {
  async listByRole(ownerUserId: string, role?: AddressBookPartyRole): Promise<AddressBookPartyEntry[]> {
    let q = supabase
      .from('address_book_parties')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .order('role', { ascending: true })
      .order('name', { ascending: true });
    if (role) q = q.eq('role', role);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(addressBookRowFromDB);
  },

  /** Upsert by (owner_user_id, role, name, iban, street, zip, city). Gets user inside for RLS; normalizes so phones/emails are always arrays (NOT NULL in DB). */
  async upsertMany(entries: AddressBookPartyEntry[]): Promise<void> {
    if (!entries.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const normStr = (v: any) => (v == null ? '' : String(v).trim());
    const normArr = (arr?: string[]) =>
      Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : [];
    const filtered = entries.filter((e) => (e.name ?? '').trim() !== '');
    if (!filtered.length) return;
    const rows = filtered.map((e) => ({
      owner_user_id: user.id,
      role: e.role,
      name: normStr(e.name),
      iban: normStr(e.iban),
      street: normStr(e.street),
      zip: normStr(e.zip),
      city: normStr(e.city),
      house_number: e.houseNumber != null ? String(e.houseNumber).trim() : null,
      country: e.country != null ? String(e.country).trim() : null,
      phones: normArr(e.phones),
      emails: normArr(e.emails),
      payment_day: e.paymentDay != null ? e.paymentDay : null,
      unit_identifier: e.unitIdentifier != null ? String(e.unitIdentifier).trim() : null,
      contact_person: e.contactPerson != null ? String(e.contactPerson).trim() : null,
    }));
    console.debug('[AddressBook upsertMany]', rows.length, 'rows');
    const { error } = await supabase
      .from('address_book_parties')
      .upsert(rows, { onConflict: 'owner_user_id,role,name,iban,street,zip,city' });
    if (error) throw error;
  },

  async deleteById(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('address_book_parties')
      .delete()
      .eq('id', id)
      .eq('owner_user_id', user.id);
    if (error) throw error;
  },
};

/** Build Address Book entries from a property (for auto-capture after save). Owner = landlord, company1 = tenant, company2 = secondCompany, management = management. */
export function propertyToPartiesAddressBookEntries(
  ownerUserId: string,
  property: {
    landlord?: ContactParty | null;
    tenant?: TenantDetails | null;
    secondCompany?: TenantDetails | null;
    management?: ContactParty | null;
  }
): AddressBookPartyEntry[] {
  const entries: AddressBookPartyEntry[] = [];
  const emptyAddr = { street: '', houseNumber: '', zip: '', city: '', country: '' };

  if (property.landlord?.name) {
    const a = property.landlord.address ?? emptyAddr;
    entries.push({
      ownerUserId,
      role: 'owner',
      name: property.landlord.name.trim() || '',
      iban: property.landlord.iban ?? '',
      street: a.street ?? '',
      zip: a.zip ?? '',
      city: a.city ?? '',
      houseNumber: a.houseNumber ?? null,
      country: a.country ?? null,
      phones: toPhonesArray(property.landlord),
      emails: toEmailsArray(property.landlord),
      paymentDay: null,
      unitIdentifier: property.landlord.unitIdentifier ?? null,
      contactPerson: property.landlord.contactPerson ?? null,
    });
  }

  if (property.tenant?.name) {
    const a = property.tenant.address ?? emptyAddr;
    entries.push({
      ownerUserId,
      role: 'company1',
      name: property.tenant.name.trim() || '',
      iban: property.tenant.iban ?? '',
      street: a.street ?? '',
      zip: a.zip ?? '',
      city: a.city ?? '',
      houseNumber: a.houseNumber ?? null,
      country: a.country ?? null,
      phones: toPhonesArray(property.tenant),
      emails: toEmailsArray(property.tenant),
      paymentDay: property.tenant.paymentDayOfMonth ?? null,
      unitIdentifier: null,
      contactPerson: null,
    });
  }

  if (property.secondCompany?.name) {
    const a = property.secondCompany.address ?? emptyAddr;
    entries.push({
      ownerUserId,
      role: 'company2',
      name: property.secondCompany.name.trim() || '',
      iban: property.secondCompany.iban ?? '',
      street: a.street ?? '',
      zip: a.zip ?? '',
      city: a.city ?? '',
      houseNumber: a.houseNumber ?? null,
      country: a.country ?? null,
      phones: toPhonesArray(property.secondCompany),
      emails: toEmailsArray(property.secondCompany),
      paymentDay: property.secondCompany.paymentDayOfMonth ?? null,
      unitIdentifier: null,
      contactPerson: null,
    });
  }

  if (property.management?.name) {
    const a = property.management.address ?? emptyAddr;
    entries.push({
      ownerUserId,
      role: 'management',
      name: property.management.name.trim() || '',
      iban: property.management.iban ?? '',
      street: a.street ?? '',
      zip: a.zip ?? '',
      city: a.city ?? '',
      houseNumber: a.houseNumber ?? null,
      country: a.country ?? null,
      phones: toPhonesArray(property.management),
      emails: toEmailsArray(property.management),
      paymentDay: null,
      unitIdentifier: property.management.unitIdentifier ?? null,
      contactPerson: property.management.contactPerson ?? null,
    });
  }

  return entries.filter((e) => e.name !== '');
}

// ==================== RESERVATIONS ====================
export const reservationsService = {
  async getAll(): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data.map(transformReservationFromDB);
  },

  async getById(id: string): Promise<Reservation | null> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return transformReservationFromDB(data);
  },

  async getByPropertyId(propertyId: string): Promise<Reservation[]> {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('property_id', propertyId)
      .order('start_date', { ascending: true });
    
    if (error) throw error;
    return data.map(transformReservationFromDB);
  },

  async create(reservation: Omit<Reservation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Reservation> {
    const dbData = transformReservationToDB(reservation);
    const { data, error } = await supabase
      .from('reservations')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformReservationFromDB(data);
  },

  async update(id: string, updates: Partial<Reservation>): Promise<Reservation> {
    const dbData = transformReservationToDB(updates as Reservation);
    const { data, error } = await supabase
      .from('reservations')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return transformReservationFromDB(data);
  },

  async delete(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete not allowed or reservation not found. Check your role (Sales) and RLS policies.');
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
    
    // If company_id is not provided, get the first company from database
    if (!dbData.company_id) {
      const { data: companies, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .single();
      
      if (companyError) {
        console.error('❌ Error fetching default company:', companyError);
        throw new Error('No company found. Please create a company first.');
      }
      
      if (companies) {
        dbData.company_id = companies.id;
        console.log('✅ Using default company_id:', companies.id);
      }
    }
    
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
    const { data, error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id.toString())
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete not allowed or booking not found. Check your role and RLS policies.');
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
  },

  async delete(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('offers')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete not allowed or offer not found. Check your role (Sales) and RLS policies.');
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
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1368',message:'invoicesService.create called',data:{invoiceNumber:invoice.invoiceNumber,bookingId:invoice.bookingId,offerIdSource:invoice.offerIdSource,dbData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const { data, error } = await supabase
      .from('invoices')
      .insert([dbData])
      .select()
      .single();
    
    if (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'supabaseService.ts:1376',message:'Error inserting invoice to Supabase',data:{error:error.message,errorCode:error.code,errorDetails:error.details,errorHint:error.hint,dbData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      throw error;
    }
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
    const { data, error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete not allowed or invoice not found. Check your role (Sales/Accounting) and RLS policies.');
  },

  /** Proformas only (document_type = 'proforma') */
  async getProformas(): Promise<InvoiceData[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('document_type', 'proforma')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformInvoiceFromDB);
  },

  /** Invoices under a proforma (document_type = 'invoice', proforma_id = ...) */
  async getInvoicesByProformaId(proformaId: string): Promise<InvoiceData[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('document_type', 'invoice')
      .eq('proforma_id', proformaId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformInvoiceFromDB);
  },

  /** Upload PDF to invoice-pdfs bucket; returns public or signed URL for file_url. Keeps original filename (only / and \ sanitized for path safety). */
  async uploadInvoicePdf(file: File, pathPrefix?: string): Promise<string> {
    const bucket = 'invoice-pdfs';
    const originalName = (file.name || 'document.pdf').replace(/[\0/\\]/g, '_').slice(0, 200).trim() || 'document.pdf';
    const path = pathPrefix
      ? `${pathPrefix}/${Date.now()}-${originalName}`
      : `${Date.now()}-${originalName}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message || 'Storage upload failed');
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  },

  /** Upload payment proof PDF to payment-proofs bucket; path payments/{proformaId}/{timestamp}_{filename}.pdf. Returns public URL for payment_proof_url. (Legacy; new flow uses paymentProofsService.uploadPaymentProofFile.) */
  async uploadPaymentProofPdf(file: File, proformaId: string): Promise<string> {
    const bucket = 'payment-proofs';
    const originalName = (file.name || 'document.pdf').replace(/[\0/\\]/g, '_').slice(0, 200).trim() || 'document.pdf';
    const path = `payments/${proformaId}/${Date.now()}_${originalName}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message || 'Storage upload failed');
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  }
};

// ==================== PAYMENT PROOFS ====================
const PAYMENT_PROOFS_BUCKET = 'payment-proofs';

export const paymentProofsService = {
  async getByInvoiceId(invoiceId: string): Promise<PaymentProof[]> {
    const { data, error } = await supabase
      .from('payment_proofs')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(transformPaymentProofFromDB);
  },

  /** Returns next suggested document number (e.g. PAY-2026-000001). */
  async getNextDocumentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PAY-${year}-`;
    const { data, error } = await supabase
      .from('payment_proofs')
      .select('document_number')
      .not('document_number', 'is', null)
      .like('document_number', `${prefix}%`);
    if (error) throw error;
    let maxN = 0;
    for (const row of data || []) {
      const num = row.document_number?.replace(prefix, '');
      const n = parseInt(num || '0', 10);
      if (!Number.isNaN(n) && n > maxN) maxN = n;
    }
    const next = maxN + 1;
    return `${prefix}${String(next).padStart(6, '0')}`;
  },

  async create(payload: { invoiceId: string; createdBy?: string; documentNumber?: string }): Promise<PaymentProof> {
    let docNum = payload.documentNumber?.trim() || null;
    if (!docNum) {
      docNum = await this.getNextDocumentNumber();
    }
    const { data, error } = await supabase
      .from('payment_proofs')
      .insert([{
        invoice_id: payload.invoiceId,
        created_by: payload.createdBy ?? null,
        document_number: docNum,
        is_current: false,
        state: 'active',
      }])
      .select()
      .single();
    if (error) throw error;
    return transformPaymentProofFromDB(data);
  },

  async update(id: string, updates: Partial<PaymentProof>): Promise<PaymentProof> {
    const dbData = transformPaymentProofToDB(updates);
    if (Object.keys(dbData).length === 0) {
      const { data, error } = await supabase.from('payment_proofs').select('*').eq('id', id).single();
      if (error) throw error;
      return transformPaymentProofFromDB(data);
    }
    const { data, error } = await supabase
      .from('payment_proofs')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return transformPaymentProofFromDB(data);
  },

  /** Upload to payments/{invoiceId}/{proofId}/{timestamp}_{filename}.pdf; returns storage path. */
  async uploadPaymentProofFile(file: File, invoiceId: string, proofId: string): Promise<string> {
    const originalName = (file.name || 'document.pdf').replace(/[\0/\\]/g, '_').slice(0, 200).trim() || 'document.pdf';
    const path = `payments/${invoiceId}/${proofId}/${Date.now()}_${originalName}`;
    const { error } = await supabase.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message || 'Storage upload failed');
    return path;
  },

  /** Get signed URL for a payment proof file (works with public or private bucket). */
  async getPaymentProofSignedUrl(filePath: string, expirySeconds: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PAYMENT_PROOFS_BUCKET)
      .createSignedUrl(filePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  /** Set one proof as current for the invoice; clear is_current on others. Call after RPC success when new proof has file. */
  async setCurrentProof(invoiceId: string, proofId: string): Promise<void> {
    const { data: existing } = await supabase
      .from('payment_proofs')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('is_current', true);
    const toClear = (existing || []).filter((r: { id: string }) => r.id !== proofId);
    for (const row of toClear) {
      await supabase.from('payment_proofs').update({ is_current: false, updated_at: new Date().toISOString() }).eq('id', row.id);
    }
    await supabase.from('payment_proofs').update({ is_current: true, updated_at: new Date().toISOString() }).eq('id', proofId);
  },
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

  async getById(id: string): Promise<Lead | null> {
    const { data, error } = await supabase.from('leads').select('*').eq('id', id).single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data ? transformLeadFromDB(data) : null;
  },

  async create(lead: Omit<Lead, 'id'>): Promise<Lead> {
    const dbData = transformLeadToDB(lead as Lead);
    const { data, error } = await supabase
      .from('leads')
      .insert([dbData])
      .select()
      .single();
    
    if (error) throw error;
    return transformLeadFromDB(data);
  },

  async update(id: string, updates: Partial<Lead>): Promise<Lead> {
    const dbData: Record<string, unknown> = {};
    if (updates.name !== undefined) dbData.name = updates.name;
    if (updates.type !== undefined) dbData.type = updates.type;
    if (updates.contactPerson !== undefined) dbData.contact_person = updates.contactPerson;
    if (updates.email !== undefined) dbData.email = updates.email;
    if (updates.phone !== undefined) dbData.phone = updates.phone;
    if (updates.address !== undefined) dbData.address = updates.address;
    if (updates.status !== undefined) dbData.status = updates.status;
    if (updates.source !== undefined) dbData.source = updates.source;
    if (Object.keys(dbData).length === 0) {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Lead not found');
      return existing;
    }
    const { data, error } = await supabase
      .from('leads')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return transformLeadFromDB(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
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
    lastInviteSentAt: db.last_invite_sent_at || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function normalizePaymentChainFromDB(raw: any): PaymentChain | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const toTile = (t: any): PaymentChainTile | undefined => {
    if (t == null || typeof t !== 'object') return undefined;
    const att = t.attachments;
    const attachments: PaymentChainAttachment[] = Array.isArray(att)
      ? att.map((a: any) => ({ path: a.path ?? '', name: a.name ?? '', size: a.size, mime: a.mime, uploadedAt: a.uploadedAt }))
      : [];
    return {
      payByDayOfMonth: t.payByDayOfMonth != null && t.payByDayOfMonth >= 1 && t.payByDayOfMonth <= 31 ? t.payByDayOfMonth : undefined,
      total: typeof t.total === 'string' ? t.total : undefined,
      description: typeof t.description === 'string' ? t.description : undefined,
      breakdown: t.breakdown && typeof t.breakdown === 'object' ? { ...t.breakdown } : undefined,
      attachments: attachments.length ? attachments : undefined,
    };
  };
  const owner = toTile(raw.owner ?? raw.owner_control);
  const company1 = toTile(raw.company1 ?? raw.from_company1_to_owner);
  const company2 = toTile(raw.company2 ?? raw.from_company2_to_company1);
  if (!owner && !company1 && !company2) return undefined;
  return { owner, company1, company2 };
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
    amenities: typeof db.amenities === 'object' && db.amenities !== null ? db.amenities : {},
    inventory: Array.isArray(db.inventory) ? db.inventory : (db.inventory ? JSON.parse(db.inventory) : []),
    meterReadings: db.meter_readings || db.meterReadings || [],
    meterLog: db.meter_log || db.meterLog || [],
    tenant: db.tenant,
    rentalHistory: db.rental_history || db.rentalHistory || [],
    apartmentStatus: db.apartment_status || db.apartmentStatus || 'active',
    zweckentfremdungFlag: db.zweckentfremdung_flag === true,
    zweckentfremdungUpdatedAt: db.zweckentfremdung_updated_at ?? undefined,
    landlord: db.landlord,
    management: db.management,
    secondCompany: db.second_company ?? undefined,
    deposit: (() => {
      const raw = db.deposit ?? db.kaution;
      if (raw == null) return undefined;
      let obj: Record<string, unknown>;
      if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch { return undefined; }
      } else if (typeof raw === 'object') {
        obj = { ...raw };
      } else {
        return undefined;
      }
      const dt = obj.depositType ?? obj.deposit_type;
      obj.depositType = (dt === 'CASH' || dt === 'TRANSFER' || dt === 'GUARANTEE') ? dt : 'TRANSFER';
      obj.periodFrom = obj.periodFrom ?? obj.period_from ?? obj.paidAt ?? '';
      obj.periodTo = obj.periodTo ?? obj.period_to ?? '';
      obj.depositNo = obj.depositNo ?? obj.deposit_no ?? '';
      obj.issuerCompany = obj.issuerCompany ?? obj.issuer_company ?? '';
      return obj;
    })(),
    rentPayments: db.rent_payments || db.rentPayments || [],
    paymentChain: normalizePaymentChainFromDB(db.payment_chain),
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
    buildingType: db.building_type || db.buildingType,
    heatingType: db.heating_type || db.heatingType,
    energyCertificate: db.energy_certificate || db.energyCertificate,
    endEnergyDemand: db.end_energy_demand || db.endEnergyDemand,
    energyEfficiencyClass: db.energy_efficiency_class || db.energyEfficiencyClass,
    parking: db.parking,
    marketplaceUrl: db.marketplace_url,
    cover_photo_asset_id: db.cover_photo_asset_id ?? undefined,
  };
}

function transformPropertyToDB(property: Property): any {
  const result: any = {};
  
  // Додаємо поля тільки якщо вони визначені (для Partial<Property>)
  if (property.title !== undefined) result.title = property.title;
  if (property.address !== undefined) result.address = property.address;
  if (property.zip !== undefined) result.zip = property.zip;
  if (property.city !== undefined) result.city = property.city;
  if (property.district !== undefined) result.district = property.district;
  if (property.country !== undefined) result.country = property.country;
  if (property.price !== undefined) result.price = property.price;
  if (property.pricePerSqm !== undefined) result.price_per_sqm = property.pricePerSqm;
  if (property.rooms !== undefined) result.rooms = property.rooms;
  if (property.area !== undefined) result.area = property.area;
  if (property.image !== undefined) result.image = property.image;
  if (property.images !== undefined) result.images = property.images;
  if (property.status !== undefined) result.status = property.status;
  if (property.fullAddress !== undefined) result.full_address = property.fullAddress;
  if (property.meta !== undefined) result.meta = property.meta;
  if (property.term !== undefined) result.term = property.term;
  if (property.termStatus !== undefined) result.term_status = property.termStatus;
  if (property.balance !== undefined) result.balance = property.balance;
  if (property.description !== undefined) result.description = property.description;
  if (property.details !== undefined) result.details = property.details;
  if (property.building !== undefined) result.building = property.building;
  if (property.amenities !== undefined) result.amenities = property.amenities;
  // КРИТИЧНО: inventory завжди має бути масивом (навіть порожнім), не undefined
  // Якщо inventory передано, завжди встановлюємо його (навіть якщо це порожній масив)
  if (property.inventory !== undefined) {
    result.inventory = Array.isArray(property.inventory) ? property.inventory : [];
  }
  if (property.meterReadings !== undefined) result.meter_readings = property.meterReadings;
  if (property.meterLog !== undefined) result.meter_log = property.meterLog;
  if (property.tenant !== undefined) result.tenant = property.tenant;
  if (property.rentalHistory !== undefined) result.rental_history = property.rentalHistory;
  if (property.apartmentStatus !== undefined) result.apartment_status = property.apartmentStatus;
  if (property.zweckentfremdungFlag !== undefined) result.zweckentfremdung_flag = property.zweckentfremdungFlag;
  if (property.zweckentfremdungUpdatedAt !== undefined) result.zweckentfremdung_updated_at = property.zweckentfremdungUpdatedAt;
  if (property.landlord !== undefined) result.landlord = property.landlord;
  if (property.management !== undefined) result.management = property.management;
  if (property.secondCompany !== undefined) result.second_company = property.secondCompany;
  if (property.deposit !== undefined) result.deposit = property.deposit;
  if (property.paymentChain !== undefined) result.payment_chain = property.paymentChain;
  if (property.rentPayments !== undefined) result.rent_payments = property.rentPayments;
  if (property.ownerExpense !== undefined) result.owner_expense = property.ownerExpense;
  if (property.futurePayments !== undefined) result.future_payments = property.futurePayments;
  if (property.repairRequests !== undefined) result.repair_requests = property.repairRequests;
  if (property.events !== undefined) result.events = property.events;
  if (property.floor !== undefined) result.floor = property.floor;
  if (property.totalFloors !== undefined) result.total_floors = property.totalFloors;
  if (property.bathrooms !== undefined) result.bathrooms = property.bathrooms;
  if (property.balcony !== undefined) result.balcony = property.balcony;
  if (property.builtYear !== undefined) result.built_year = property.builtYear;
  if (property.renovationYear !== undefined) result.renovation_year = property.renovationYear;
  if (property.netRent !== undefined) result.net_rent = property.netRent;
  if (property.ancillaryCosts !== undefined) result.ancillary_costs = property.ancillaryCosts;
  if (property.heatingCosts !== undefined) result.heating_costs = property.heatingCosts;
  if (property.heatingIncluded !== undefined) result.heating_included = property.heatingIncluded;
  if (property.buildingType !== undefined) result.building_type = property.buildingType;
  if (property.heatingType !== undefined) result.heating_type = property.heatingType;
  if (property.energyCertificate !== undefined) result.energy_certificate = property.energyCertificate;
  if (property.endEnergyDemand !== undefined) result.end_energy_demand = property.endEnergyDemand;
  if (property.energyEfficiencyClass !== undefined) result.energy_efficiency_class = property.energyEfficiencyClass;
  if (property.parking !== undefined) result.parking = property.parking;
  if (property.marketplaceUrl !== undefined) result.marketplace_url = property.marketplaceUrl;
  
  return result;
}

function transformBookingFromDB(db: any): Booking {
  return {
    id: db.id, // UUID as string
    roomId: db.room_id,
    propertyId: db.property_id, // UUID reference to properties table
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
    bookingNo: db.booking_no,
    companyId: db.company_id,
    sourceInvoiceId: db.source_invoice_id,
    sourceOfferId: db.source_offer_id,
    sourceReservationId: db.source_reservation_id,
    createdAt: db.created_at,
  };
}

function transformBookingToDB(booking: Booking): any {
  const result: any = {
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
  
  // Only include company_id if provided (let DB trigger handle booking_no)
  if (booking.companyId !== undefined) {
    result.company_id = booking.companyId;
  }
  
  // Source fields (for confirmed bookings)
  if (booking.sourceInvoiceId !== undefined) {
    result.source_invoice_id = booking.sourceInvoiceId;
  }
  if (booking.sourceOfferId !== undefined) {
    result.source_offer_id = booking.sourceOfferId;
  }
  if (booking.sourceReservationId !== undefined) {
    result.source_reservation_id = booking.sourceReservationId;
  }
  
  return result;
}

function transformOfferFromDB(db: any): OfferData {
  return {
    id: db.id,
    offerNo: db.offer_no,
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
    clientMessage: db.client_message,
    reservationId: db.reservation_id,
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
    client_message: offer.clientMessage,
    reservation_id: offer.reservationId,
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
    offerId: db.offer_id, // Primary field
    offerIdSource: db.offer_id, // Legacy field for backward compatibility
    bookingId: db.booking_id,
    reservationId: db.reservation_id ?? undefined,
    fileUrl: db.file_url ?? undefined,
    paymentProofUrl: db.payment_proof_url ?? undefined,
    documentType: db.document_type ?? 'proforma',
    proformaId: db.proforma_id ?? undefined,
  };
}

function transformInvoiceToDB(invoice: InvoiceData): any {
  // Convert bookingId and offerId to UUID format if they exist
  // If they are numbers or invalid UUIDs, set to null to avoid foreign key errors
  const isValidUUID = (str: string | number | undefined): boolean => {
    if (!str) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(String(str));
  };
  
  // Prefer offerId over offerIdSource
  const offerId = invoice.offerId || invoice.offerIdSource;
  // When reservationId is set (proforma from reservation), do not set booking_id (it is set only after payment confirmed)
  const reservationId = invoice.reservationId && isValidUUID(invoice.reservationId) ? invoice.reservationId : null;
  const bookingId = reservationId ? null : (invoice.bookingId && isValidUUID(invoice.bookingId) ? invoice.bookingId : null);

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
    offer_id: offerId && isValidUUID(offerId) ? offerId : null,
    booking_id: bookingId,
    reservation_id: reservationId,
    file_url: invoice.fileUrl ?? null,
    payment_proof_url: invoice.paymentProofUrl ?? null,
    document_type: invoice.documentType ?? 'proforma',
    proforma_id: invoice.proformaId && isValidUUID(invoice.proformaId) ? invoice.proformaId : null,
  };
}

function transformPaymentProofFromDB(db: any): PaymentProof {
  return {
    id: db.id,
    invoiceId: db.invoice_id,
    documentNumber: db.document_number ?? undefined,
    createdAt: db.created_at,
    createdBy: db.created_by ?? undefined,
    filePath: db.file_path ?? undefined,
    fileName: db.file_name ?? undefined,
    fileUploadedAt: db.file_uploaded_at ?? undefined,
    notes: db.notes ?? undefined,
    isCurrent: db.is_current === true,
    state: db.state || 'active',
    replacedByProofId: db.replaced_by_proof_id ?? undefined,
    replacesProofId: db.replaces_proof_id ?? undefined,
    updatedAt: db.updated_at,
    rpcConfirmedAt: db.rpc_confirmed_at ?? undefined,
  };
}

function transformPaymentProofToDB(proof: Partial<PaymentProof>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (proof.documentNumber !== undefined) out.document_number = proof.documentNumber;
  if (proof.filePath !== undefined) out.file_path = proof.filePath;
  if (proof.fileName !== undefined) out.file_name = proof.fileName;
  if (proof.fileUploadedAt !== undefined) out.file_uploaded_at = proof.fileUploadedAt;
  if (proof.notes !== undefined) out.notes = proof.notes;
  if (proof.isCurrent !== undefined) out.is_current = proof.isCurrent;
  if (proof.state !== undefined) out.state = proof.state;
  if (proof.replacedByProofId !== undefined) out.replaced_by_proof_id = proof.replacedByProofId;
  if (proof.replacesProofId !== undefined) out.replaces_proof_id = proof.replacesProofId;
  if (proof.rpcConfirmedAt !== undefined) out.rpc_confirmed_at = proof.rpcConfirmedAt;
  if (Object.keys(out).length > 0) out.updated_at = new Date().toISOString();
  return out;
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
    workflowSteps: db.workflow_steps || undefined,
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
  // Explicitly convert undefined to null for UUID fields to avoid Supabase errors
  const workerIdValue = (event.workerId || event.assignedWorkerId) || null;
  const managerIdValue = event.managerId || null;
  const bookingIdValue = event.bookingId || null;
  const propertyIdValue = event.propertyId || null;
  
  const result: any = {
    title: event.title,
    property_id: propertyIdValue,
    booking_id: bookingIdValue,
    unit_id: event.unitId || null,
    time: event.time || null,
    is_all_day: event.isAllDay || false,
    type: event.type,
    day: event.day || null,
    date: event.date || null,
    description: event.description || null,
    assignee: event.assignee || null,
    assigned_worker_id: workerIdValue, // legacy support
    has_unread_message: event.hasUnreadMessage || false,
    status: event.status || 'open',
    meter_readings: event.meterReadings || null,
    // Kanban fields
    priority: event.priority || null,
    is_issue: event.isIssue || false,
    manager_id: managerIdValue,
    worker_id: workerIdValue, // Explicitly null instead of undefined
    department: event.department,
    images: event.images || null,
    checklist: event.checklist || null,
    location_text: event.locationText || null,
  };
  
  // Only include workflow_steps if it exists and the column exists in DB
  // This prevents errors if migration hasn't been run yet
  if (event.workflowSteps !== undefined && event.workflowSteps !== null) {
    result.workflow_steps = event.workflowSteps;
  }
  
  return result;
}

// ==================== FILE UPLOAD FOR EINZUG/AUSZUG ====================
export const fileUploadService = {
  /**
   * Upload file to Supabase Storage for Einzug/Auszug tasks
   * @param file - File to upload
   * @param propertyId - Property ID where check-in/check-out happens
   * @param taskType - 'Einzug' or 'Auszug'
   * @param date - Date of check-in/check-out (format: DD.MM.YYYY)
   * @param companyName - Company/tenant name
   * @param stepNumber - Step number (1, 2, or 3)
   * @param stepName - Step name (e.g., 'keys', 'before_photos', 'meter_readings')
   * @returns Public URL of uploaded file
   */
  async uploadTaskFile(
    file: File,
    propertyId: string,
    taskType: 'Einzug' | 'Auszug',
    date: string, // Format: DD.MM.YYYY
    companyName: string,
    stepNumber: number,
    stepName: string
  ): Promise<string> {
    const bucket = 'property-files';
    const folderName = `${date} - ${companyName}`;
    const stepFolder = `step${stepNumber}_${stepName}`;
    const filePath = `${propertyId}/${taskType}/${folderName}/${stepFolder}/${Date.now()}-${file.name}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading file:', error);
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  },

  /**
   * List files in a property's Einzug/Auszug folder
   * @param propertyId - Property ID
   * @param taskType - 'Einzug' or 'Auszug'
   * @param folderName - Folder name (e.g., '07.01.2026 - Сотісо')
   * @returns Array of file paths
   */
  async listTaskFiles(
    propertyId: string,
    taskType: 'Einzug' | 'Auszug',
    folderName?: string
  ): Promise<string[]> {
    const bucket = 'property-files';
    let path = `${propertyId}/${taskType}`;
    if (folderName) {
      path += `/${folderName}`;
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('Error listing files:', error);
      throw error;
    }

    return data.map(file => `${path}/${file.name}`);
  },

  /**
   * Get public URL for a file
   * @param filePath - Full path to file in storage
   * @returns Public URL
   */
  getPublicUrl(filePath: string): string {
    const bucket = 'property-files';
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);
    return data.publicUrl;
  }
};

// ==================== PROPERTY DOCUMENTS (Card 1 Documents Center) ====================
const PROPERTY_DOCS_BUCKET = 'property-docs';

function transformPropertyDocumentFromDB(db: {
  id: string;
  property_id: string;
  type: string;
  file_path: string;
  title?: string | null;
  doc_date?: string | null;
  notes?: string | null;
  meta?: unknown;
  created_at: string;
}): PropertyDocument {
  return {
    id: db.id,
    propertyId: db.property_id,
    type: db.type as PropertyDocumentType,
    filePath: db.file_path,
    title: db.title ?? undefined,
    docDate: db.doc_date ?? undefined,
    createdAt: db.created_at,
    notes: db.notes ?? undefined,
    meta: (db.meta != null && typeof db.meta === 'object') ? (db.meta as Record<string, unknown>) : undefined,
  };
}

export const propertyDocumentsService = {
  async listPropertyDocuments(propertyId: string): Promise<PropertyDocument[]> {
    const { data, error } = await supabase
      .from('property_documents')
      .select('id, property_id, type, file_path, title, doc_date, notes, meta, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message || 'Failed to list property documents');
    return (data || []).map(transformPropertyDocumentFromDB);
  },

  /** Create DB row with explicit id (same id used in storage path to avoid orphans). doc_date derived from meta when not provided. */
  async createPropertyDocument(params: {
    id: string;
    propertyId: string;
    type: PropertyDocumentType;
    filePath: string;
    title?: string | null;
    docDate?: string | null;
    notes?: string | null;
    meta?: Record<string, unknown> | null;
  }): Promise<PropertyDocument> {
    const meta = params.meta ?? {};
    let docDate: string | null = params.docDate ?? null;
    if (docDate == null || docDate === '') {
      const m = meta as Record<string, unknown>;
      if (params.type === 'lease_contract' && typeof m.von === 'string') docDate = m.von;
      else if (params.type === 'handover_protocol' && typeof m.datum === 'string') docDate = m.datum;
      else if (params.type === 'bk_abrechnung' && typeof m.docDatum === 'string') docDate = m.docDatum;
      else if (params.type === 'zvu' && typeof m.datum === 'string') docDate = m.datum;
      else if (params.type === 'zweckentfremdung_notice' && typeof m.datum === 'string') docDate = m.datum;
      else if (params.type === 'an_abmeldung' && typeof m.von === 'string') docDate = m.von;
      else if ((params.type === 'supplier_electricity' || params.type === 'supplier_gas' || params.type === 'supplier_water' || params.type === 'supplier_waste') && (typeof m.faellig === 'string' || typeof m.von === 'string')) docDate = (m.faellig as string) || (m.von as string);
    }
    const { data, error } = await supabase
      .from('property_documents')
      .insert({
        id: params.id,
        property_id: params.propertyId,
        type: params.type,
        file_path: params.filePath,
        title: params.title ?? null,
        doc_date: docDate,
        notes: params.notes ?? null,
        meta,
      })
      .select('id, property_id, type, file_path, title, doc_date, notes, meta, created_at')
      .single();
    if (error) throw new Error(error.message || 'Failed to create property document');
    return transformPropertyDocumentFromDB(data);
  },

  /** Best-effort remove file from storage (e.g. after failed insert to avoid orphan). */
  async removePropertyDocumentFile(filePath: string): Promise<void> {
    await supabase.storage.from(PROPERTY_DOCS_BUCKET).remove([filePath]);
  },

  /** Hard delete: 1) remove file from Storage, 2) delete DB row. If storage delete fails, DB is not touched and error is thrown. */
  async deletePropertyDocumentHard(doc: PropertyDocument): Promise<void> {
    const { error: storageError } = await supabase.storage
      .from(PROPERTY_DOCS_BUCKET)
      .remove([doc.filePath]);
    if (storageError) throw new Error(storageError.message || 'Failed to delete file from storage');
    const { error: dbError } = await supabase
      .from('property_documents')
      .delete()
      .eq('id', doc.id);
    if (dbError) throw new Error(dbError.message || 'Failed to delete document record');
  },

  /** Create signed URL for viewing/downloading (bucket is private). Expiry in seconds. */
  async getDocumentSignedUrl(filePath: string, expirySeconds: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PROPERTY_DOCS_BUCKET)
      .createSignedUrl(filePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to get document URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  /** Upload file to property-docs; returns storage path. Path: properties/{propertyId}/{type}/{docId}_{filename}. Use same docId as row id when inserting. */
  async uploadPropertyDocumentFile(
    file: File,
    propertyId: string,
    type: PropertyDocumentType,
    docId: string
  ): Promise<string> {
    const safeName = file.name.replace(/[/\\]/g, '_');
    const filePath = `properties/${propertyId}/${type}/${docId}_${safeName}`;
    const { error } = await supabase.storage
      .from(PROPERTY_DOCS_BUCKET)
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(error.message || 'Storage upload failed');
    return filePath;
  },
};

// ==================== PROPERTY DEPOSIT PROOFS (Kaution only, independent from property_documents) ====================
const DEPOSIT_PROOFS_BUCKET = 'property-docs';

function transformDepositProofFromDB(db: {
  id: string;
  property_id: string;
  proof_type: string;
  bucket: string;
  file_path: string;
  original_filename?: string | null;
  mime_type?: string | null;
  created_at: string;
}): PropertyDepositProof {
  return {
    id: db.id,
    propertyId: db.property_id,
    proofType: db.proof_type as 'payment' | 'return',
    bucket: db.bucket,
    filePath: db.file_path,
    originalFilename: db.original_filename ?? undefined,
    mimeType: db.mime_type ?? undefined,
    createdAt: db.created_at,
  };
}

export const propertyDepositProofsService = {
  async getLatest(propertyId: string, proofType: 'payment' | 'return'): Promise<PropertyDepositProof | null> {
    const { data, error } = await supabase
      .from('property_deposit_proofs')
      .select('id, property_id, proof_type, bucket, file_path, original_filename, mime_type, created_at')
      .eq('property_id', propertyId)
      .eq('proof_type', proofType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Failed to get deposit proof');
    return data ? transformDepositProofFromDB(data) : null;
  },

  async create(propertyId: string, proofType: 'payment' | 'return', file: File): Promise<PropertyDepositProof> {
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[/\\]/g, '_');
    const filePath = `deposit_proofs/${propertyId}/${proofType}/${id}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(DEPOSIT_PROOFS_BUCKET)
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw new Error(uploadError.message || 'Storage upload failed');

    const { data: sessionData } = await supabase.auth.getSession();
    const createdBy = sessionData?.session?.user?.id ?? null;

    const { data, error } = await supabase
      .from('property_deposit_proofs')
      .insert({
        id,
        property_id: propertyId,
        proof_type: proofType,
        bucket: DEPOSIT_PROOFS_BUCKET,
        file_path: filePath,
        original_filename: file.name || null,
        mime_type: file.type || null,
        created_by: createdBy,
      })
      .select('id, property_id, proof_type, bucket, file_path, original_filename, mime_type, created_at')
      .single();
    if (error) {
      await supabase.storage.from(DEPOSIT_PROOFS_BUCKET).remove([filePath]);
      throw new Error(error.message || 'Failed to create deposit proof record');
    }
    return transformDepositProofFromDB(data);
  },

  async delete(proofId: string): Promise<void> {
    const { data: row, error: fetchError } = await supabase
      .from('property_deposit_proofs')
      .select('bucket, file_path')
      .eq('id', proofId)
      .single();
    if (fetchError || !row) throw new Error('Deposit proof not found');
    const { error: storageError } = await supabase.storage.from(row.bucket).remove([row.file_path]);
    if (storageError) throw new Error(storageError.message || 'Failed to delete file from storage');
    const { error: dbError } = await supabase.from('property_deposit_proofs').delete().eq('id', proofId);
    if (dbError) throw new Error(dbError.message || 'Failed to delete deposit proof record');
  },

  async getSignedUrl(filePath: string, expirySeconds: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(DEPOSIT_PROOFS_BUCKET)
      .createSignedUrl(filePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to get document URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },
};

// ==================== PAYMENT CHAIN FILES (property-files bucket) ====================
const PROPERTY_FILES_BUCKET = 'property-files';

export const paymentChainFilesService = {
  /** Upload a file to property-files: properties/{propertyId}/payment-chain/{tileKey}/{yyyy-mm}/{timestamp}_{safeFilename} */
  async upload(
    propertyId: string,
    tileKey: 'owner' | 'company1' | 'company2',
    file: File
  ): Promise<PaymentChainAttachment> {
    const now = new Date();
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const timestamp = now.getTime();
    const safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const path = `properties/${propertyId}/payment-chain/${tileKey}/${yyyyMm}/${timestamp}_${safe}`;
    const { error } = await supabase.storage.from(PROPERTY_FILES_BUCKET).upload(path, file, { upsert: false });
    if (error) throw new Error(error.message || 'Failed to upload file');
    return {
      path,
      name: file.name || safe,
      size: file.size,
      mime: file.type || undefined,
      uploadedAt: now.toISOString(),
    };
  },

  async getSignedUrl(filePath: string, expirySeconds: number = 600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(PROPERTY_FILES_BUCKET)
      .createSignedUrl(filePath, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  async remove(filePath: string): Promise<void> {
    const { error } = await supabase.storage.from(PROPERTY_FILES_BUCKET).remove([filePath]);
    if (error) throw new Error(error.message || 'Failed to delete file');
  },
};

// ==================== PAYMENT CHAIN (new tables: edges + files) ====================
const PAYMENT_CHAIN_BUCKET = 'property-files';

function paymentChainEdgeFromRow(r: any): PaymentChainEdge {
  return {
    id: r.id,
    property_id: r.property_id,
    edge_key: r.edge_key,
    pay_by_day_of_month: r.pay_by_day_of_month,
    amount_total: r.amount_total != null ? Number(r.amount_total) : null,
    description: r.description,
    breakdown: r.breakdown,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function paymentChainFileFromRow(r: any): PaymentChainFile {
  return {
    id: r.id,
    property_id: r.property_id,
    tile_key: r.tile_key,
    storage_path: r.storage_path,
    file_name: r.file_name,
    mime_type: r.mime_type,
    size_bytes: r.size_bytes,
    uploaded_by: r.uploaded_by,
    created_at: r.created_at,
  };
}

export const paymentChainService = {
  async getPaymentChain(propertyId: string): Promise<PaymentChainState> {
    const [edgesRes, filesRes] = await Promise.all([
      supabase.from('payment_chain_edges').select('*').eq('property_id', propertyId),
      supabase.from('payment_chain_files').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
    ]);
    if (edgesRes.error) throw new Error(edgesRes.error.message || 'Failed to fetch payment chain edges');
    if (filesRes.error) throw new Error(filesRes.error.message || 'Failed to fetch payment chain files');

    const edgeRows = (edgesRes.data || []) as any[];
    const fileRows = (filesRes.data || []) as any[];

    const edges: Record<PaymentChainEdgeKey, PaymentChainEdge | null> = {
      C1_TO_OWNER: null,
      C2_TO_C1: null,
    };
    edgeRows.forEach(r => {
      if (r.edge_key === 'C1_TO_OWNER' || r.edge_key === 'C2_TO_C1') edges[r.edge_key] = paymentChainEdgeFromRow(r);
    });

    const filesByTile: Record<PaymentChainTileKey, PaymentChainFile[]> = {
      C1_TO_OWNER: [],
      C2_TO_C1: [],
      OWNER_RECEIPT: [],
    };
    fileRows.forEach(r => {
      if (r.tile_key in filesByTile) filesByTile[r.tile_key as PaymentChainTileKey].push(paymentChainFileFromRow(r));
    });

    const hasAny = edgeRows.length > 0 || fileRows.length > 0;
    if (hasAny) return { edges, filesByTile };

    const { data: propRow } = await supabase.from('properties').select('payment_chain').eq('id', propertyId).single();
    const raw = (propRow as any)?.payment_chain;
    const legacy = normalizePaymentChainFromDB(raw);
    if (!legacy) return { edges, filesByTile };

    const t = (legacy.company1?.payByDayOfMonth != null && legacy.company1.payByDayOfMonth >= 1 && legacy.company1.payByDayOfMonth <= 31) ? legacy.company1.payByDayOfMonth : null;
    const amt1 = legacy.company1?.total != null ? legacy.company1.total : null;
    if (legacy.company1) {
      edges.C1_TO_OWNER = {
        id: `legacy-${propertyId}-C1_TO_OWNER`,
        property_id: propertyId,
        edge_key: 'C1_TO_OWNER',
        pay_by_day_of_month: t,
        amount_total: amt1,
        description: legacy.company1.description ?? null,
        breakdown: legacy.company1.breakdown ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    const t2 = (legacy.company2?.payByDayOfMonth != null && legacy.company2.payByDayOfMonth >= 1 && legacy.company2.payByDayOfMonth <= 31) ? legacy.company2.payByDayOfMonth : null;
    const amt2 = legacy.company2?.total != null ? legacy.company2.total : null;
    if (legacy.company2) {
      edges.C2_TO_C1 = {
        id: `legacy-${propertyId}-C2_TO_C1`,
        property_id: propertyId,
        edge_key: 'C2_TO_C1',
        pay_by_day_of_month: t2,
        amount_total: amt2,
        description: legacy.company2.description ?? null,
        breakdown: legacy.company2.breakdown ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    (legacy.owner?.attachments || []).forEach((a: PaymentChainAttachment) => {
      filesByTile.OWNER_RECEIPT.push({
        id: `legacy-${a.path}`,
        property_id: propertyId,
        tile_key: 'OWNER_RECEIPT',
        storage_path: a.path,
        file_name: a.name,
        mime_type: a.mime ?? null,
        size_bytes: a.size ?? null,
        uploaded_by: null,
        created_at: a.uploadedAt || new Date().toISOString(),
      });
    });
    (legacy.company1?.attachments || []).forEach((a: PaymentChainAttachment) => {
      filesByTile.C1_TO_OWNER.push({
        id: `legacy-${a.path}`,
        property_id: propertyId,
        tile_key: 'C1_TO_OWNER',
        storage_path: a.path,
        file_name: a.name,
        mime_type: a.mime ?? null,
        size_bytes: a.size ?? null,
        uploaded_by: null,
        created_at: a.uploadedAt || new Date().toISOString(),
      });
    });
    (legacy.company2?.attachments || []).forEach((a: PaymentChainAttachment) => {
      filesByTile.C2_TO_C1.push({
        id: `legacy-${a.path}`,
        property_id: propertyId,
        tile_key: 'C2_TO_C1',
        storage_path: a.path,
        file_name: a.name,
        mime_type: a.mime ?? null,
        size_bytes: a.size ?? null,
        uploaded_by: null,
        created_at: a.uploadedAt || new Date().toISOString(),
      });
    });
    return { edges, filesByTile };
  },

  async upsertEdge(
    propertyId: string,
    edge_key: PaymentChainEdgeKey,
    payload: { payByDayOfMonth?: number | null; amount_total?: string | null; description?: string | null; breakdown?: Record<string, string> | null }
  ): Promise<PaymentChainEdge> {
    const row = {
      property_id: propertyId,
      edge_key,
      pay_by_day_of_month: payload.payByDayOfMonth ?? null,
      amount_total: payload.amount_total != null ? String(payload.amount_total) : null,
      description: payload.description ?? null,
      breakdown: payload.breakdown ?? null,
    };
    const { data, error } = await supabase
      .from('payment_chain_edges')
      .upsert(row, { onConflict: 'property_id,edge_key', ignoreDuplicates: false })
      .select()
      .single();
    if (error) throw new Error(error.message || 'Failed to upsert payment chain edge');
    return paymentChainEdgeFromRow(data);
  },

  async uploadFile(
    propertyId: string,
    tile_key: PaymentChainTileKey,
    file: File,
    uploadedBy?: string | null
  ): Promise<PaymentChainFile> {
    const id = crypto.randomUUID();
    const safe = (file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const storage_path = `${propertyId}/payment-chain/${tile_key}/${id}_${safe}`;
    const { error: storageError } = await supabase.storage.from(PAYMENT_CHAIN_BUCKET).upload(storage_path, file, { upsert: false });
    if (storageError) throw new Error(storageError.message || 'Failed to upload file');
    const fileRow = {
      property_id: propertyId,
      tile_key,
      storage_path,
      file_name: file.name || safe,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: uploadedBy ?? null,
    };
    const { data, error } = await supabase.from('payment_chain_files').insert(fileRow).select().single();
    if (error) throw new Error(error.message || 'Failed to insert payment chain file');
    return paymentChainFileFromRow(data);
  },

  async getFileSignedUrl(storage_path: string, expirySeconds: number = 3600): Promise<string> {
    const { data, error } = await supabase.storage.from(PAYMENT_CHAIN_BUCKET).createSignedUrl(storage_path, expirySeconds);
    if (error) throw new Error(error.message || 'Failed to create signed URL');
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  },

  async deleteFileById(id: string): Promise<void> {
    const { data, error: fetchError } = await supabase.from('payment_chain_files').select('storage_path').eq('id', id).single();
    if (fetchError || !data) throw new Error('File not found');
    const path = (data as any).storage_path;
    const { error: storageError } = await supabase.storage.from(PAYMENT_CHAIN_BUCKET).remove([path]);
    if (storageError) throw new Error(storageError.message || 'Failed to delete file from storage');
    const { error: deleteError } = await supabase.from('payment_chain_files').delete().eq('id', id);
    if (deleteError) throw new Error(deleteError.message || 'Failed to delete file record');
  },
};

// ==================== RENT TIMELINE (OWNER PAYMENT SCHEDULE) ====================

export const rentTimelineService = {
  async listRows(propertyId: string): Promise<RentTimelineRowDB[]> {
    const { data, error } = await supabase
      .from('rent_timeline_rows')
      .select('*')
      .eq('property_id', propertyId)
      .order('valid_from', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to fetch rent timeline rows');
    return (data || []) as RentTimelineRowDB[];
  },

  async insertRow(
    propertyId: string,
    payload: {
      valid_from: string;
      valid_to?: string | null;
      km: number;
      mietsteuer?: number;
      unternehmenssteuer?: number;
      bk: number;
      hk: number;
      muell?: number;
      strom?: number;
      gas?: number;
      wasser?: number;
      status?: string;
    }
  ): Promise<RentTimelineRowDB> {
    const external_id = crypto.randomUUID();
    const row = {
      property_id: propertyId,
      external_id,
      valid_from: payload.valid_from,
      valid_to: payload.valid_to ?? null,
      tenant_name: null,
      status: payload.status ?? 'ACTIVE',
      km: payload.km ?? 0,
      mietsteuer: payload.mietsteuer ?? 0,
      unternehmenssteuer: payload.unternehmenssteuer ?? 0,
      bk: payload.bk ?? 0,
      hk: payload.hk ?? 0,
      muell: payload.muell ?? 0,
      strom: payload.strom ?? 0,
      gas: payload.gas ?? 0,
      wasser: payload.wasser ?? 0,
    };
    const { data, error } = await supabase.from('rent_timeline_rows').insert(row).select().single();
    if (error) throw new Error(error.message || 'Failed to insert rent timeline row');
    return data as RentTimelineRowDB;
  },

  async updateRow(
    rowId: string,
    patch: Partial<{
      valid_from: string;
      valid_to: string | null;
      km: number;
      mietsteuer: number;
      unternehmenssteuer: number;
      bk: number;
      hk: number;
      muell: number;
      strom: number;
      gas: number;
      wasser: number;
      status: string;
    }>
  ): Promise<void> {
    const payload: Record<string, unknown> = {};
    if (patch.valid_from !== undefined) payload.valid_from = patch.valid_from;
    if (patch.valid_to !== undefined) payload.valid_to = patch.valid_to;
    if (patch.km !== undefined) payload.km = patch.km;
    if (patch.mietsteuer !== undefined) payload.mietsteuer = patch.mietsteuer;
    if (patch.unternehmenssteuer !== undefined) payload.unternehmenssteuer = patch.unternehmenssteuer;
    if (patch.bk !== undefined) payload.bk = patch.bk;
    if (patch.hk !== undefined) payload.hk = patch.hk;
    if (patch.muell !== undefined) payload.muell = patch.muell;
    if (patch.strom !== undefined) payload.strom = patch.strom;
    if (patch.gas !== undefined) payload.gas = patch.gas;
    if (patch.wasser !== undefined) payload.wasser = patch.wasser;
    if (patch.status !== undefined) payload.status = patch.status;
    if (Object.keys(payload).length === 0) return;
    const { error } = await supabase.from('rent_timeline_rows').update(payload).eq('id', rowId);
    if (error) throw new Error(error.message || 'Failed to update rent timeline row');
  },

  /**
   * Backfill from legacy properties.rental_history. Migrates dates + km/bk/hk only; new fields = 0.
   * Does NOT set tenant_name (owner payment schedule only).
   */
  async backfillFromLegacy(propertyId: string, legacyAgreements: RentalAgreement[]): Promise<number> {
    if (!legacyAgreements?.length) return 0;
    const rows = legacyAgreements.map((a) => ({
      property_id: propertyId,
      external_id: a.id,
      valid_from: a.startDate || '',
      valid_to: (a.endDate && a.endDate.trim() && a.endDate !== '∞') ? a.endDate : null,
      tenant_name: null,
      status: a.status || 'ACTIVE',
      km: a.km ?? 0,
      mietsteuer: a.mietsteuer ?? 0,
      unternehmenssteuer: a.unternehmenssteuer ?? 0,
      bk: a.bk ?? 0,
      hk: a.hk ?? 0,
      muell: a.muell ?? 0,
      strom: a.strom ?? 0,
      gas: a.gas ?? 0,
      wasser: a.wasser ?? 0,
    }));
    const { error } = await supabase
      .from('rent_timeline_rows')
      .upsert(rows, { onConflict: 'property_id,external_id', ignoreDuplicates: false });
    if (error) throw new Error(error.message || 'Failed to backfill rent timeline');
    return rows.length;
  },
};

// ==================== UNIT LEASE TERMS ====================

/** Lease term for UI: DB row with dates in DD.MM.YYYY. */
export type UnitLeaseTermUi = Omit<UnitLeaseTermDb, 'contract_start' | 'contract_end' | 'first_payment_date'> & {
  contract_start: string;
  contract_end: string | null;
  first_payment_date: string | null;
};

export const unitLeaseTermsService = {
  /**
   * Get lease term by property id. Returns null if none. Dates converted to DD.MM.YYYY for UI.
   */
  async getByPropertyId(propertyId: string): Promise<UnitLeaseTermUi | null> {
    const { data, error } = await supabase
      .from('unit_lease_terms')
      .select('*')
      .eq('unit_id', propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message || 'Failed to fetch lease term');
    if (!data) return null;
    const row = data as UnitLeaseTermDb;
    return {
      ...row,
      contract_start: isoToEu(row.contract_start),
      contract_end: row.contract_end != null ? isoToEu(row.contract_end) : null,
      first_payment_date: row.first_payment_date != null ? isoToEu(row.first_payment_date) : null,
    };
  },

  /**
   * Upsert lease term for property. One call; onConflict unit_id.
   * row dates must be in YYYY-MM-DD.
   */
  async upsertByPropertyId(
    propertyId: string,
    row: {
      contract_start: string;
      contract_end?: string | null;
      contract_type: 'befristet' | 'unbefristet' | 'mit automatischer Verlängerung';
      first_payment_date?: string | null;
      note?: string | null;
    }
  ): Promise<UnitLeaseTermUi> {
    const { data, error } = await supabase
      .from('unit_lease_terms')
      .upsert(
        {
          unit_id: propertyId,
          contract_start: row.contract_start,
          contract_end: row.contract_end ?? null,
          contract_type: row.contract_type,
          first_payment_date: row.first_payment_date ?? null,
          note: row.note ?? null,
        },
        { onConflict: 'unit_id' }
      )
      .select()
      .single();
    if (error) throw new Error(error.message || 'Failed to save lease term');
    const dbRow = data as UnitLeaseTermDb;
    return {
      ...dbRow,
      contract_start: isoToEu(dbRow.contract_start),
      contract_end: dbRow.contract_end != null ? isoToEu(dbRow.contract_end) : null,
      first_payment_date: dbRow.first_payment_date != null ? isoToEu(dbRow.first_payment_date) : null,
    };
  },
};

// ==================== RESERVATION TRANSFORMS ====================

function transformReservationFromDB(db: any): Reservation {
  return {
    id: db.id,
    reservationNo: db.reservation_no ?? undefined,
    propertyId: db.property_id,
    startDate: db.start_date,
    endDate: db.end_date,
    status: db.status,
    leadLabel: db.lead_label,
    clientFirstName: db.client_first_name,
    clientLastName: db.client_last_name,
    clientEmail: db.client_email,
    clientPhone: db.client_phone,
    clientAddress: db.client_address,
    guestsCount: db.guests_count,
    pricePerNightNet: db.price_per_night_net ? parseFloat(db.price_per_night_net) : undefined,
    taxRate: db.tax_rate ? parseFloat(db.tax_rate) : undefined,
    totalNights: db.total_nights,
    totalGross: db.total_gross ? parseFloat(db.total_gross) : undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function transformReservationToDB(reservation: Reservation): any {
  return {
    property_id: reservation.propertyId,
    start_date: reservation.startDate,
    end_date: reservation.endDate,
    status: reservation.status,
    lead_label: reservation.leadLabel,
    client_first_name: reservation.clientFirstName,
    client_last_name: reservation.clientLastName,
    client_email: reservation.clientEmail,
    client_phone: reservation.clientPhone,
    client_address: reservation.clientAddress,
    guests_count: reservation.guestsCount,
    price_per_night_net: reservation.pricePerNightNet,
    tax_rate: reservation.taxRate,
    total_nights: reservation.totalNights,
    total_gross: reservation.totalGross,
  };
}

// ==================== RPC WRAPPER FUNCTIONS ====================

/**
 * Check if a date range overlaps with any confirmed booking
 * @param propertyId - Property UUID
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns true if overlaps, false otherwise
 */
export async function checkBookingOverlap(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_booking_overlap', {
    p_property_id: propertyId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  
  if (error) {
    console.error('Error checking booking overlap:', error);
    throw error;
  }
  
  return data === true;
}

/**
 * Mark invoice as paid and confirm booking (winning flow)
 * This is an atomic RPC that:
 * - Sets invoice status to 'Paid'
 * - Creates confirmed booking
 * - Marks winning reservation/offer
 * - Marks losing overlapping reservations/offers
 * @param invoiceId - Invoice UUID
 * @returns Created booking UUID
 */
export async function markInvoicePaidAndConfirmBooking(
  invoiceId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('mark_invoice_paid_and_confirm_booking', {
    p_invoice_id: invoiceId,
  });
  
  if (error) {
    console.error('Error marking invoice paid and confirming booking:', error);
    throw error;
  }
  
  if (!data) {
    throw new Error('RPC returned no booking ID');
  }
  
  return data;
}
