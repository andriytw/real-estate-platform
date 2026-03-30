import type { Booking, InvoiceData, OfferData, Property, Reservation } from '../../types';
import { buildDashboardMonthData } from './selectors';
import type { DashboardApartmentMatrixRow } from './types';

const EPSILON = 1e-9;

function isOccupiedCell(cell: DashboardApartmentMatrixRow['dayCells'][number]): boolean {
  return cell?.kind === 'value' && Number(cell.amountNet) > EPSILON;
}

/**
 * Core monthly financial + occupancy counts from one dashboard matrix row + property planning price.
 * Same formulas as PropertiesDashboardPhase1 `apartmentFinancialRows` (day-cell revenue, OOO-aware plan).
 */
export function apartmentFinancialCoreFromMatrixRow(
  row: DashboardApartmentMatrixRow,
  property: Property | undefined
): {
  collectedForApartment: number;
  planningPricePerRoom: number;
  operationalDays: number;
  operationalRentableNights: number;
  fullCapacityIncome: number;
  difference: number;
  planFulfillment: number;
  occupiedOperationalDays: number;
  oooDays: number;
} {
  const planningPricePerRoom = Math.max(0, Number(property?.planningPricePerRoom ?? 0));
  const collectedForApartment = row.dayCells.reduce((sum, cell) => sum + (cell.kind === 'value' ? cell.amountNet : 0), 0);
  const operationalDays = row.dayCells.reduce((sum, cell) => sum + (cell.kind === 'ooo' ? 0 : 1), 0);
  const operationalRentableNights = operationalDays * Math.max(0, Number(row.rooms) || 0);
  const fullCapacityIncome = planningPricePerRoom * operationalRentableNights;
  const difference = collectedForApartment - fullCapacityIncome;
  const planFulfillment = fullCapacityIncome > 0 ? collectedForApartment / fullCapacityIncome : 0;

  let occupiedOperationalDays = 0;
  let oooDays = 0;
  for (const cell of row.dayCells) {
    if (cell.kind === 'ooo') {
      oooDays += 1;
      continue;
    }
    if (isOccupiedCell(cell)) occupiedOperationalDays += 1;
  }

  return {
    collectedForApartment,
    planningPricePerRoom,
    operationalDays,
    operationalRentableNights,
    fullCapacityIncome,
    difference,
    planFulfillment: Number.isFinite(planFulfillment) ? planFulfillment : 0,
    occupiedOperationalDays,
    oooDays,
  };
}

export interface SingleApartmentMonthlyPerformance {
  monthKey: string;
  matrixRow: DashboardApartmentMatrixRow;
  monthDays: string[];
  collectedForApartment: number;
  planningPricePerRoom: number;
  operationalDays: number;
  operationalRentableNights: number;
  fullCapacityIncome: number;
  difference: number;
  planFulfillment: number;
  occupancyPctOperationalDays: number;
  occupiedOperationalDays: number;
  oooDays: number;
  rooms: number;
}

/**
 * Canonical monthly stats for one apartment: same pipeline as Properties Dashboard
 * (`buildDashboardMonthData` with a single-property list).
 */
export function buildSingleApartmentMonthlyPerformanceFromDashboardModel(input: {
  property: Property;
  bookings: Booking[];
  reservations: Reservation[];
  offers: OfferData[];
  proformas: InvoiceData[];
  monthKey: string;
}): SingleApartmentMonthlyPerformance | null {
  const [y, m] = input.monthKey.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;

  const monthData = buildDashboardMonthData({
    properties: [input.property],
    bookings: input.bookings,
    reservations: input.reservations,
    offers: input.offers,
    proformas: input.proformas,
    year: y,
    monthIndex0: m - 1,
  });

  const row = monthData.rows[0];
  if (!row) return null;

  const core = apartmentFinancialCoreFromMatrixRow(row, input.property);

  return {
    monthKey: input.monthKey,
    matrixRow: row,
    monthDays: monthData.days,
    collectedForApartment: core.collectedForApartment,
    planningPricePerRoom: core.planningPricePerRoom,
    operationalDays: core.operationalDays,
    operationalRentableNights: core.operationalRentableNights,
    fullCapacityIncome: core.fullCapacityIncome,
    difference: core.difference,
    planFulfillment: core.planFulfillment,
    occupancyPctOperationalDays: row.occupancyPctOperationalDays,
    occupiedOperationalDays: core.occupiedOperationalDays,
    oooDays: core.oooDays,
    rooms: row.rooms,
  };
}
