import type { DashboardApartmentMatrixRow, DashboardDayCell, DailyDashboardMetrics } from './types';

export interface MonthlyDashboardKpis {
  rentedPctAvailableApartments: number;
  rentedPctAvailableRooms: number;
  averagePricePerRoom: number;
}

const EPSILON = 1e-9;

function isOccupiedCell(cell: DashboardDayCell | null | undefined): boolean {
  return cell?.kind === 'value' && Number(cell.amountNet) > EPSILON;
}

function isOperationalCell(cell: DashboardDayCell | null | undefined): boolean {
  return cell != null && cell.kind !== 'ooo';
}

function toRooms(rawRooms: number): number {
  if (!Number.isFinite(rawRooms)) return 0;
  return Math.max(0, rawRooms);
}

/**
 * Daily H8 (Average Price Per Rooms):
 * SUM(day cell values where dayCell > 0) / SUM(rooms where dayCell > 0)
 */
export function computeDailyAveragePricePerRoom(
  rows: Array<Pick<DashboardApartmentMatrixRow, 'rooms' | 'dayCells'>>,
  dayIndex: number
): number {
  let positiveRevenueSum = 0;
  let occupiedRoomsSum = 0;

  for (const row of rows) {
    const cell = row.dayCells[dayIndex];
    if (!isOccupiedCell(cell)) continue;

    const rooms = toRooms(row.rooms);
    if (rooms <= 0) continue;

    positiveRevenueSum += Number(cell.amountNet);
    occupiedRoomsSum += rooms;
  }

  if (occupiedRoomsSum <= 0) return 0;
  return positiveRevenueSum / occupiedRoomsSum;
}

/**
 * H6 Monthly Rented % of Available Apartments:
 * COUNT(dayCells > 0) / COUNT(dayCells that are not OOO and not blank)
 *
 * This is computed directly from the full selected-month matrix
 * (not as an average of daily percentages).
 */
export function computeMonthlyRentedPctAvailableApartments(rows: DashboardApartmentMatrixRow[]): number {
  let occupiedApartmentDays = 0;
  let availableApartmentDays = 0;

  for (const row of rows) {
    for (const cell of row.dayCells) {
      if (!isOperationalCell(cell)) continue;
      availableApartmentDays += 1;
      if (isOccupiedCell(cell)) occupiedApartmentDays += 1;
    }
  }

  if (availableApartmentDays <= 0) return 0;
  return occupiedApartmentDays / availableApartmentDays;
}

/**
 * H7 Monthly Rented % of Available Rooms:
 * SUM(rooms for apartment/day where dayCell > 0)
 * /
 * SUM(rooms for apartment/day where dayCell != OOO and not blank)
 *
 * This is computed directly from the full selected-month matrix
 * (not as an average of daily percentages).
 */
export function computeMonthlyRentedPctAvailableRooms(rows: DashboardApartmentMatrixRow[]): number {
  let occupiedRoomNights = 0;
  let availableRoomNights = 0;

  for (const row of rows) {
    const rooms = toRooms(row.rooms);
    if (rooms <= 0) continue;

    for (const cell of row.dayCells) {
      if (!isOperationalCell(cell)) continue;
      availableRoomNights += rooms;
      if (isOccupiedCell(cell)) occupiedRoomNights += rooms;
    }
  }

  if (availableRoomNights <= 0) return 0;
  return occupiedRoomNights / availableRoomNights;
}

/**
 * H8 Monthly Average Price Per Rooms:
 * arithmetic average of daily H8 row values across visible month days.
 */
export function computeMonthlyAveragePricePerRoom(rows: DashboardApartmentMatrixRow[], dayCount: number): number {
  if (dayCount <= 0) return 0;

  let dailyAverageSum = 0;
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    dailyAverageSum += computeDailyAveragePricePerRoom(rows, dayIndex);
  }

  return dailyAverageSum / dayCount;
}

export function computeMonthlyDashboardKpis(rows: DashboardApartmentMatrixRow[], dayCount: number): MonthlyDashboardKpis {
  return {
    rentedPctAvailableApartments: computeMonthlyRentedPctAvailableApartments(rows),
    rentedPctAvailableRooms: computeMonthlyRentedPctAvailableRooms(rows),
    averagePricePerRoom: computeMonthlyAveragePricePerRoom(rows, dayCount),
  };
}

export function computePerApartmentOperationalOccupancy(row: Pick<DashboardApartmentMatrixRow, 'dayCells'>): number {
  let occupied = 0;
  let operational = 0;
  for (const cell of row.dayCells) {
    if (!isOperationalCell(cell)) continue;
    operational += 1;
    if (isOccupiedCell(cell)) occupied += 1;
  }
  if (operational <= 0) return 0;
  return occupied / operational;
}

export function computeDailyMetrics(
  rows: Array<Pick<DashboardApartmentMatrixRow, 'rooms' | 'dayCells'>>,
  days: string[],
  totalRoomsAcrossApartments: number
): DailyDashboardMetrics[] {
  return days.map((isoDate, dayIndex) => {
    let occupiedApartmentDays = 0;
    let availableApartmentDays = 0;
    let occupiedRoomNights = 0;
    let availableRoomNights = 0;
    let oooRoomNights = 0;

    for (const row of rows) {
      const rooms = toRooms(row.rooms);
      const cell = row.dayCells[dayIndex];

      if (cell?.kind === 'ooo') {
        oooRoomNights += rooms;
        continue;
      }

      availableApartmentDays += 1;
      availableRoomNights += rooms;

      if (isOccupiedCell(cell)) {
        occupiedApartmentDays += 1;
        occupiedRoomNights += rooms;
      }
    }

    const notOccupiedRoomNights = Math.max(0, totalRoomsAcrossApartments - occupiedRoomNights - oooRoomNights);

    return {
      isoDate,
      dayOfMonth: dayIndex + 1,
      rentedPctAvailableApartments: availableApartmentDays > 0 ? occupiedApartmentDays / availableApartmentDays : 0,
      rentedPctAvailableRooms: availableRoomNights > 0 ? occupiedRoomNights / availableRoomNights : 0,
      averagePricePerRoom: computeDailyAveragePricePerRoom(rows, dayIndex),
      occupiedRoomNights,
      notOccupiedRoomNights,
      oooRoomNights,
      totalRoomNights: totalRoomsAcrossApartments,
    };
  });
}
