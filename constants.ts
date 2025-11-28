
import { Property, Room, CompanyDetails } from './types';

export const ROOMS: Room[] = [
  { id: '1', name: 'Apartment 1, Lviv', city: 'Lviv', details: 'Address: Shevchenka 15A\n65 m² / 3 Rooms' },
  { id: '2', name: 'House, Berlin', city: 'Berlin', details: 'Address: Hauptstraße 22\n150 m² / 6 Rooms' },
  { id: '3', name: 'Studio, Krakow', city: 'Krakow', details: 'Address: Floriańska 8\n30 m² / 1 Room' },
  { id: '4', name: 'Apartment 2, Kyiv', city: 'Kyiv', details: 'Address: Sahaidachnoho 20\n80 m² / 4 Rooms' },
  { id: '5', name: 'Cottage, Odesa', city: 'Odesa', details: 'Address: Fontanska 130\n220 m² / 7 Rooms' },
  { id: '6', name: 'Apartment, Warsaw', city: 'Warsaw', details: 'Address: Prosta 50\n45 m² / 2 Rooms' },
  { id: '7', name: 'Office, Dnipro', city: 'Dnipro', details: 'Address: Yavornytskoho 1\n110 m² / Office' },
  { id: '8', name: 'Mini-Studio, Lviv', city: 'Lviv', details: 'Address: Doroshenka 5\n25 m² / 1 Room' },
];

export const INTERNAL_COMPANIES_DATA: Record<string, CompanyDetails> = {
  'Sotiso': {
    name: 'Sotiso GmbH',
    address: 'Alexanderplatz 1, 10178 Berlin, Germany',
    iban: 'DE55 1001 0010 1234 5678 90',
    taxId: 'DE123456789',
    email: 'billing@sotiso.com',
    logo: 'S'
  },
  'Wonowo': {
    name: 'Wonowo Sp. z o.o.',
    address: 'Ul. Prosta 20, 00-850 Warsaw, Poland',
    iban: 'PL99 1020 3040 5060 7080 9010 1112',
    taxId: 'PL987654321',
    email: 'billing@wonowo.com',
    logo: 'W'
  },
  'NowFlats': {
    name: 'NowFlats Inc.',
    address: '15 Main St, Dublin, Ireland',
    iban: 'IE22 AIBK 9311 5212 3456 78',
    taxId: 'IE555666777',
    email: 'billing@nowflats.com',
    logo: 'N'
  }
};

export const MOCK_PROPERTIES: Property[] = [
  {
    id: '1',
    title: 'Apartment 1, Lviv',
    address: 'Shevchenka 15A',
    fullAddress: 'Shevchenka 15A, Lviv, Ukraine',
    zip: '79000',
    city: 'Lviv',
    district: 'Zaliznychnyi',
    country: 'Ukraine',
    price: 750,
    pricePerSqm: 11.5,
    rooms: 3,
    area: 65,
    meta: "65 m² / 3",
    term: "01.01.2024 - Indefinite",
    termStatus: "green",
    balance: -750.00,
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2053&auto=format&fit=crop',
    images: [
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2053&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?q=80&w=2070&auto=format&fit=crop'
    ],
    status: 'Available',
    description: "Quiet, bright apartment in the city center, ideal for a family. Central heating.",
    
    // Details
    details: { area: "65 m²", rooms: 3, floor: 2, year: 1985, beds: 4, baths: 1, balconies: 1, buildingFloors: 5 },
    building: { 
        type: "Multi-family (MFH)", repairYear: 2015, heating: "Gas", energyClass: "C", 
        parking: "Open Space", pets: "Allowed", elevator: "No", kitchen: "Yes", 
        access: "No", certificate: "Consumption-based", energyDemand: "120", centralHeating: "No" 
    },
    inventory: [ 
        { type: "Ліжко", invNumber: "KV1-L001", quantity: 2, cost: 500 },
        { type: "Шафа", invNumber: "KV1-SH003", quantity: 3, cost: 300 },
        { type: "Холодильник", invNumber: "KV1-HOL01", quantity: 1, cost: 750 },
        { type: "Інше (Вкажіть у кількості)", invNumber: "KV1-PRM01", quantity: 1, cost: 150 }
    ],
    meterReadings: [
        { name: "Електроенергія", number: "12345", initial: "1250 кВт/год", current: "1450 кВт/год" },
        { name: "Гаряча Вода", number: "54321", initial: "50 м³", current: "55 м³" }
    ],
    tenant: { name: "Ivanov Ivan", phone: "+380 50 123 4567", email: "ivanov@example.com", rent: 750, deposit: 1800, startDate: "01.01.2024", km: 500, bk: 150, hk: 100 },
    rentalHistory: [
        { id: 'rh-1', tenantName: 'Ivanov Ivan', startDate: '01.01.2024', endDate: 'Indefinite', km: 500, bk: 150, hk: 100, status: 'ACTIVE' },
        { id: 'rh-2', tenantName: 'Petrov P.P.', startDate: '01.01.2022', endDate: '31.12.2023', km: 450, bk: 100, hk: 50, status: 'INACTIVE' },
        { id: 'rh-3', tenantName: 'Sydorenko V.V.', startDate: '01.01.2020', endDate: '31.12.2021', km: 400, bk: 90, hk: 40, status: 'ARCHIVED' },
        { id: 'rh-4', tenantName: 'Kovalchuk O.M.', startDate: '01.06.2018', endDate: '31.12.2019', km: 350, bk: 80, hk: 30, status: 'ARCHIVED' },
        { id: 'rh-5', tenantName: 'Melnyk A.I.', startDate: '01.01.2017', endDate: '31.05.2018', km: 320, bk: 70, hk: 25, status: 'ARCHIVED' },
    ],
    ownerExpense: { mortgage: 400, management: 50, taxIns: 25, reserve: 25 },
    futurePayments: [
        { date: "01.01.2026", recipient: "City Council", amount: 150.00, category: "Property Tax", status: "PENDING", docId: "TAX-2026" },
        { date: "15.02.2026", recipient: "Insurance Co.", amount: 240.00, category: "Insurance", status: "PENDING", docId: "INS-Q1" },
        { date: "01.03.2026", recipient: "Utility Service", amount: 75.00, category: "Maintenance", status: "PENDING", docId: "MAINT-MAR" },
    ],
    repairRequests: [
        { id: 1004, date: "20.10.2025", description: "Leaking kitchen tap", priority: "High", status: "New" },
        { id: 1003, date: "18.10.2025", description: "Broken socket in bedroom", priority: "Medium", status: "Assigned" },
        { id: 1002, date: "15.10.2025", description: "Intercom not working", priority: "Medium", status: "Active" },
        { id: 1001, date: "10.10.2025", description: "Lightbulb replacement", priority: "Low", status: "Closed" },
    ],
    events: [
        { datetime: "25.10.2025, 14:30", type: "Viewing", status: "Scheduled", description: "Showing for couple: Olena & Dmytro.", participant: "Agent + Clients", priority: "High" },
        { datetime: "28.10.2025, 10:00", type: "Repair", status: "Completed", description: "Tap leak fix (#1004).", participant: "Plumber", priority: "Medium" },
        { datetime: "05.11.2025, 16:00", type: "Inspection", status: "Scheduled", description: "Annual fire alarm check.", participant: "Tenant + Security Co", priority: "Medium" },
        { datetime: "10.11.2025, 09:00", type: "Service", status: "Cancelled", description: "Gas meter check.", participant: "Gas Co.", priority: "Low" },
    ]
  },
  {
    id: '2',
    title: 'House, Berlin',
    address: 'Hauptstraße 22',
    fullAddress: 'Hauptstraße 22, 10827, Berlin, Germany',
    zip: '10827',
    city: 'Berlin',
    district: 'Schöneberg',
    country: 'Germany',
    price: 1500,
    pricePerSqm: 10,
    rooms: 6,
    area: 150,
    meta: "150 m² / 6",
    term: "01.06.2023 - 31.05.2025",
    termStatus: "red",
    balance: 0.00,
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1980&auto=format&fit=crop',
    images: [],
    status: 'Available',
    description: "Spacious house in a quiet Berlin neighborhood. Ideal for a large family.",
    
    details: { area: "150 m²", rooms: 6, floor: 3, year: 2005, beds: 7, baths: 2, balconies: 0, buildingFloors: 3 },
    building: { 
        type: "Single Family (EFH)", repairYear: 2020, heating: "Heat Pump", energyClass: "A+", 
        parking: "Garage", pets: "Allowed", elevator: "No", kitchen: "Yes", 
        access: "No", certificate: "Demand-based", energyDemand: "25", centralHeating: "Yes" 
    },
    inventory: [ 
        { type: "Sofa", invNumber: "BRL-DIV04", quantity: 4, cost: 1200 },
        { type: "Fridge", invNumber: "BRL-HOL02", quantity: 2, cost: 1500 },
    ],
    meterReadings: [
        { name: "Electricity", number: "M-1001", initial: "1000 kWh", current: "2500 kWh" },
        { name: "Water", number: "W-2020", initial: "100 m³", current: "120 m³" }
    ],
    tenant: { name: "Mustermann Max", phone: "+49 30 987 654", email: "max@example.com", rent: 1500, deposit: 4500, startDate: "01.06.2023", km: 1200, bk: 200, hk: 100 },
    rentalHistory: [
        { id: 'rh-2-1', tenantName: 'Mustermann Max', startDate: '01.06.2023', endDate: '31.05.2025', km: 1200, bk: 200, hk: 100, status: 'ACTIVE' }
    ],
    ownerExpense: { mortgage: 1000, management: 150, taxIns: 100, reserve: 50 },
    futurePayments: [
        { date: "01.01.2026", recipient: "Finanzamt", amount: 350.00, category: "Property Tax", status: "PENDING", docId: "TAX-2026-BER" },
        { date: "15.02.2026", recipient: "Hausverwaltung", amount: 200.00, category: "Management Fee", status: "PENDING", docId: "HV-FEE-FEB" },
    ],
    repairRequests: [
        { id: 2001, date: "01.10.2025", description: "Ventilation filter replacement", priority: "Low", status: "Active" },
    ],
    events: [
        { datetime: "15.11.2025, 11:00", type: "Service", status: "Scheduled", description: "Heat pump maintenance.", participant: "Haustechnik Müller", priority: "High" },
    ]
  },
  {
    id: '5',
    title: 'Cottage, Odesa',
    address: 'Fontanska 130',
    fullAddress: 'Fontanska 130, Odesa, Ukraine',
    zip: '65000',
    city: 'Odesa',
    district: 'Kyivskyi',
    country: 'Ukraine',
    price: 0, // Maintenance
    pricePerSqm: 0,
    rooms: 7,
    area: 220,
    meta: "220 m² / 7",
    term: "01.01.2023 - 31.12.2025",
    termStatus: "red",
    balance: 0.00,
    image: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?q=80&w=2070&auto=format&fit=crop',
    images: [],
    status: 'Maintenance',
    description: "Private house with a large plot near the sea. Needs minor repairs.",
    
    details: { area: "220 m²", rooms: 7, floor: 2, year: 1995, beds: 8, baths: 3, balconies: 1, buildingFloors: 2 },
    building: { 
        type: "Single Family (EFH)", repairYear: 2010, heating: "Gas", energyClass: "D", 
        parking: "Open Space", pets: "Allowed", elevator: "No", kitchen: "Yes", 
        access: "No", certificate: "Consumption-based", energyDemand: "160", centralHeating: "No" 
    },
    inventory: [], 
    meterReadings: [],
    tenant: { name: "Temporarily Vacant", phone: "-", email: "-", rent: 0, deposit: 0, startDate: "N/A", km: 0, bk: 0, hk: 0 },
    rentalHistory: [],
    ownerExpense: { mortgage: 800, management: 100, taxIns: 75, reserve: 0 },
    futurePayments: [
        { date: "05.11.2025", recipient: "Repair Crew", amount: 5000.00, category: "Repair", status: "PENDING", docId: "REPAIR-KOT-NOV" },
    ],
    repairRequests: [
        { id: 5001, date: "22.10.2025", description: "Window replacement", priority: "High", status: "Assigned" },
    ],
    events: [
        { datetime: "01.12.2025, 10:00", type: "Assessment", status: "Scheduled", description: "Cost assessment for windows (#5001).", participant: "Appraiser + Manager", priority: "High" },
    ]
  },
  {
    id: '6',
    title: 'Apartment, Warsaw',
    address: 'Prosta 50',
    fullAddress: 'ul. Prosta 50, 00-838, Warsaw, Poland',
    zip: '00-838',
    city: 'Warsaw',
    district: 'Wola',
    country: 'Poland',
    price: 850,
    pricePerSqm: 18.8,
    rooms: 2,
    area: 45,
    meta: "45 m² / 2",
    term: "01.07.2025 - Indefinite",
    termStatus: "green",
    balance: 0.00,
    image: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?q=80&w=2070&auto=format&fit=crop',
    images: [],
    status: 'Available',
    description: "Stylish apartment in the center of Warsaw. Ideal for a couple.",
    
    details: { area: "45 m²", rooms: 2, floor: 12, year: 2021, beds: 2, baths: 1, balconies: 1, buildingFloors: 15 },
    building: { 
        type: "Skyscraper", repairYear: 2021, heating: "City", energyClass: "A", 
        parking: "Carport", pets: "Not Allowed", elevator: "Yes", kitchen: "Yes", 
        access: "Yes", certificate: "Demand-based", energyDemand: "50", centralHeating: "Yes" 
    },
    inventory: [ 
        { type: "Sofa", invNumber: "WRS-D001", quantity: 1, cost: 600 },
        { type: "Fridge", invNumber: "WRS-H001", quantity: 1, cost: 500 },
    ],
    meterReadings: [
        { name: "Electric", number: "E-555", initial: "500", current: "600" }
    ],
    tenant: { name: "Wozniak Anna", phone: "+48 500 987 654", email: "anna@example.com", rent: 850, deposit: 2550, startDate: "01.07.2025", km: 650, bk: 150, hk: 50 },
    rentalHistory: [
        { id: 'rh-6-1', tenantName: 'Wozniak Anna', startDate: '01.07.2025', endDate: 'Indefinite', km: 650, bk: 150, hk: 50, status: 'ACTIVE' }
    ],
    ownerExpense: { mortgage: 450, management: 100, taxIns: 40, reserve: 60 },
    futurePayments: [
        { date: "01.12.2025", recipient: "Urząd Skarbowy", amount: 180.00, category: "Tax", status: "PENDING", docId: "TAX-POL-DEC" },
    ],
    repairRequests: [],
    events: []
  },
  // Minimal placeholders for others to prevent errors
  {
    id: '3',
    title: 'Studio, Krakow',
    address: 'Floriańska 8',
    zip: '31-021',
    city: 'Krakow',
    district: 'Old Town',
    price: 600,
    pricePerSqm: 20,
    rooms: 1,
    area: 30,
    meta: "30 m² / 1",
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=2070&auto=format&fit=crop',
    status: 'Available',
    details: { area: "30 m²", rooms: 1, floor: 1, year: 1900, beds: 1, baths: 1, balconies: 0, buildingFloors: 4 },
    building: { type: "Old Town", repairYear: 2010, heating: "Gas", energyClass: "D", parking: "None", pets: "No", elevator: "No", kitchen: "Yes", access: "No", certificate: "N/A", energyDemand: "150", centralHeating: "No" },
    inventory: [],
    meterReadings: [],
    rentalHistory: [],
    images: []
  },
  {
    id: '4',
    title: 'Apartment 2, Kyiv',
    address: 'Sahaidachnoho 20',
    zip: '04070',
    city: 'Kyiv',
    district: 'Podil',
    price: 1200,
    pricePerSqm: 15,
    rooms: 4,
    area: 80,
    meta: "80 m² / 4",
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1974&auto=format&fit=crop',
    status: 'Available',
    details: { area: "80 m²", rooms: 4, floor: 3, year: 1980, beds: 4, baths: 2, balconies: 1, buildingFloors: 9 },
    building: { type: "MFH", repairYear: 2018, heating: "Central", energyClass: "C", parking: "Street", pets: "Yes", elevator: "Yes", kitchen: "Yes", access: "Yes", certificate: "N/A", energyDemand: "100", centralHeating: "Yes" },
    inventory: [],
    meterReadings: [],
    rentalHistory: [],
    images: []
  },
  {
    id: '7',
    title: 'Office, Dnipro',
    address: 'Yavornytskoho 1',
    zip: '49000',
    city: 'Dnipro',
    district: 'Central',
    price: 1800,
    pricePerSqm: 16,
    rooms: 5,
    area: 110,
    meta: "110 m² / Office",
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=2069&auto=format&fit=crop',
    status: 'Available',
    details: { area: "110 m²", rooms: 5, floor: 2, year: 2000, beds: 0, baths: 2, balconies: 0, buildingFloors: 5 },
    building: { type: "Commercial", repairYear: 2022, heating: "Electric", energyClass: "B", parking: "Lot", pets: "No", elevator: "Yes", kitchen: "No", access: "Yes", certificate: "N/A", energyDemand: "90", centralHeating: "Yes" },
    inventory: [],
    meterReadings: [],
    rentalHistory: [],
    images: []
  },
  {
    id: '8',
    title: 'Mini-Studio, Lviv',
    address: 'Doroshenka 5',
    zip: '79000',
    city: 'Lviv',
    district: 'Halytskyi',
    price: 300,
    pricePerSqm: 12,
    rooms: 1,
    area: 25,
    meta: "25 m² / 1",
    image: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?q=80&w=2071&auto=format&fit=crop',
    status: 'Available',
    details: { area: "25 m²", rooms: 1, floor: 4, year: 1910, beds: 1, baths: 1, balconies: 0, buildingFloors: 4 },
    building: { type: "Old Stock", repairYear: 2015, heating: "Electric", energyClass: "E", parking: "None", pets: "No", elevator: "No", kitchen: "Yes", access: "No", certificate: "N/A", energyDemand: "180", centralHeating: "No" },
    inventory: [],
    meterReadings: [],
    rentalHistory: [],
    images: []
  }
];

export const MOCK_MARKET_LISTINGS = [
  // ... existing market listings ...
  {
    id: 'm1',
    title: 'Sunny Flat in Neukölln',
    location: 'Neukölln, Berlin',
    price: 850,
    rooms: 2,
    area: 55,
    image: 'https://images.unsplash.com/photo-1502005229766-939760a7cb0d?q=80&w=2070&auto=format&fit=crop',
    postedBy: 'Alex K.',
    timeAgo: '2 hours ago',
    description: 'Looking for a sublet for 6 months. The apartment is fully furnished, has a south-facing balcony and is located near the canal. High-speed internet included.',
    contactEmail: 'alex@example.com',
    contactPhone: '+49 123 456 789'
  },
];
