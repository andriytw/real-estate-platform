-- Supabase Database Schema for Real Estate Management Platform
-- Run this in Supabase SQL Editor to create all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Properties table (нерухомість)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  address TEXT NOT NULL,
  zip TEXT,
  city TEXT NOT NULL,
  district TEXT,
  country TEXT DEFAULT 'Ukraine',
  price DECIMAL(10,2) NOT NULL,
  price_per_sqm DECIMAL(10,2),
  rooms INTEGER NOT NULL,
  area DECIMAL(10,2) NOT NULL,
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Available' CHECK (status IN ('Available', 'Reserved', 'Rented', 'Maintenance')),
  
  -- Details
  details JSONB DEFAULT '{}'::jsonb,
  building JSONB DEFAULT '{}'::jsonb,
  inventory JSONB DEFAULT '[]'::jsonb,
  meter_readings JSONB DEFAULT '[]'::jsonb,
  meter_log JSONB DEFAULT '[]'::jsonb,
  
  -- Tenant info
  tenant JSONB,
  rental_history JSONB DEFAULT '[]'::jsonb,
  rent_payments JSONB DEFAULT '[]'::jsonb,
  owner_expense JSONB,
  future_payments JSONB DEFAULT '[]'::jsonb,
  repair_requests JSONB DEFAULT '[]'::jsonb,
  events JSONB DEFAULT '[]'::jsonb,
  
  -- Additional fields
  full_address TEXT,
  meta TEXT,
  term TEXT,
  term_status TEXT CHECK (term_status IN ('green', 'red')),
  balance DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  
  -- Backward compatibility
  floor INTEGER,
  total_floors INTEGER,
  bathrooms INTEGER,
  balcony BOOLEAN DEFAULT false,
  built_year INTEGER,
  renovation_year INTEGER,
  net_rent DECIMAL(10,2),
  ancillary_costs DECIMAL(10,2),
  heating_costs DECIMAL(10,2),
  heating_included BOOLEAN DEFAULT false,
  deposit TEXT,
  building_type TEXT,
  heating_type TEXT,
  energy_certificate TEXT,
  end_energy_demand TEXT,
  energy_efficiency_class TEXT,
  parking TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookings table (бронювання)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  guest TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  check_in_time TEXT,
  check_out_time TEXT,
  status TEXT DEFAULT 'reserved' CHECK (status IN ('reserved', 'offer_prepared', 'offer_sent', 'invoiced', 'paid', 'check_in_done', 'completed')),
  price TEXT,
  balance TEXT,
  guests TEXT,
  unit TEXT,
  comments TEXT,
  payment_account TEXT,
  company TEXT,
  rate_plan TEXT,
  guarantee TEXT,
  cancellation_policy TEXT,
  no_show_policy TEXT,
  channel TEXT,
  type TEXT DEFAULT 'GUEST' CHECK (type IN ('GUEST', 'BLOCK')),
  
  -- Contact info
  address TEXT,
  phone TEXT,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  internal_company TEXT,
  client_type TEXT CHECK (client_type IN ('Private', 'Company')),
  
  -- Pricing
  price_per_night DECIMAL(10,2),
  tax_rate DECIMAL(5,2),
  total_gross TEXT,
  guest_list JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Offers table (офери)
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  internal_company TEXT NOT NULL,
  price TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Sent', 'Invoiced')),
  guests TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  check_in_time TEXT,
  check_out_time TEXT,
  guest_list JSONB DEFAULT '[]'::jsonb,
  comments TEXT,
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoices table (інвойси)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT UNIQUE NOT NULL,
  date DATE NOT NULL,
  due_date DATE NOT NULL,
  internal_company TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_address TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_net DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL,
  total_gross DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'Unpaid' CHECK (status IN ('Paid', 'Unpaid', 'Overdue')),
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leads table (ліди)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Company', 'Private')),
  contact_person TEXT,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Past', 'Potential')),
  source TEXT, -- requestId якщо створено з Request
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Requests table (запити)
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company_name TEXT,
  people_count INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  message TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'archived')),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Calendar Events table (події календаря)
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  unit_id TEXT,
  time TEXT,
  is_all_day BOOLEAN DEFAULT false,
  type TEXT NOT NULL,
  day INTEGER,
  date DATE,
  description TEXT,
  assignee TEXT,
  assigned_worker_id TEXT,
  has_unread_message BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'done_by_worker', 'verified', 'pending', 'review', 'archived', 'completed')),
  meter_readings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table (кімнати/юніти)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  details TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Companies table (компанії)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  iban TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  email TEXT NOT NULL,
  logo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_bookings_property_id ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);
CREATE INDEX IF NOT EXISTS idx_bookings_end_date ON bookings(end_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_offers_property_id ON offers(property_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_calendar_events_property_id ON calendar_events(property_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);

-- Enable Row Level Security (RLS)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for now - you can restrict later)
CREATE POLICY "Allow all operations on properties" ON properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bookings" ON bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on offers" ON offers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on leads" ON leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on requests" ON requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on calendar_events" ON calendar_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on companies" ON companies FOR ALL USING (true) WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to auto-update updated_at
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_requests_updated_at BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

