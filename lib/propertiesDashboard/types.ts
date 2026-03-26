import type { Property } from '../../types';

export type DashboardDayCell =
  | { kind: 'ooo'; amountNet: null }
  | { kind: 'zero'; amountNet: 0 }
  | { kind: 'value'; amountNet: number };

export interface DashboardApartmentMatrixRow {
  apartmentId: string;
  abteilung: string;
  statusLabel: string;
  adresse: string;
  wohnung: string;
  qm: number;
  betten: number;
  rooms: number;
  dayCells: DashboardDayCell[];
  occupancyPctOperationalDays: number;
}

export interface DailyDashboardMetrics {
  isoDate: string;
  dayOfMonth: number;
  rentedPctAvailableApartments: number;
  rentedPctAvailableRooms: number;
  averagePricePerRoom: number;
  occupiedRoomNights: number;
  notOccupiedRoomNights: number;
  oooRoomNights: number;
  totalRoomNights: number;
}

export interface MonthlyDashboardSummary {
  apartments: number;
  rooms: number;
  beds: number;
  active: number;
  employee: number;
  inPreparation: number;
  oooRoomNights: number;
  rentedPctAvailableApartments: number;
  rentedPctAvailableRooms: number;
  averagePricePerRoom: number;
  occupiedRoomNights: number;
  notOccupiedRoomNights: number;
  totalRoomNights: number;
}

export interface DashboardMonthData {
  monthStartIso: string;
  days: string[];
  rows: DashboardApartmentMatrixRow[];
  dailyMetrics: DailyDashboardMetrics[];
  summary: MonthlyDashboardSummary;
}

export interface DashboardRawData {
  properties: Property[];
}
