import type { Booking, InvoiceData, OfferData, Property, Reservation } from '../../types';
import { formatLocalDateYmd } from '../localDate';
import { isPropertyBlockActiveOnDate } from '../oooBlocks';
import { getRoomsCount } from '../../utils/propertyStats';
import { monthRangeIso } from './date';
import { buildConfirmedRevenueMap, buildDailyOooMap, resolveApartmentDayCell } from './dayCellResolver';
import {
  computeDailyMetrics,
  computeMonthlyDashboardKpis,
  computePerApartmentOperationalOccupancy,
} from './metrics';
import type { DashboardApartmentMatrixRow, DashboardMonthData, MonthlyDashboardSummary } from './types';

function getBedsCount(property: Property): number {
  const beds = Number(property.details?.beds ?? 0);
  return Number.isFinite(beds) ? Math.max(0, beds) : 0;
}

function getArea(property: Property): number {
  const area = Number(property.details?.area ?? property.area ?? 0);
  return Number.isFinite(area) ? Math.max(0, area) : 0;
}

function statusLabel(status?: Property['apartmentStatus']): string {
  if (status === 'rented_worker') return 'Employee';
  if (status === 'preparation') return 'In preparation';
  if (status === 'ooo') return 'OOO';
  return 'Active';
}

function getWohnung(property: Property): string {
  return (property.title || '').trim() || String(property.id);
}

interface BuildDashboardMonthDataInput {
  properties: Property[];
  bookings: Booking[];
  reservations: Reservation[];
  offers: OfferData[];
  proformas: InvoiceData[];
  year: number;
  monthIndex0: number;
}

export function buildDashboardMonthData(input: BuildDashboardMonthDataInput): DashboardMonthData {
  const { fromIso, toIsoExclusive, days } = monthRangeIso(input.year, input.monthIndex0);
  const propertyIds = input.properties.map((p) => String(p.id));
  const todayStr = formatLocalDateYmd(new Date());

  const oooByProperty = buildDailyOooMap(propertyIds, days, input.bookings);
  const revenueByProperty = buildConfirmedRevenueMap(propertyIds, days, {
    bookings: input.bookings,
    reservations: input.reservations,
    offers: input.offers,
    proformas: input.proformas,
    monthFromIso: fromIso,
    monthToIsoExclusive: toIsoExclusive,
  });

  const rows: DashboardApartmentMatrixRow[] = input.properties.map((property) => {
    const dayCells = days.map((dayIso) =>
      resolveApartmentDayCell(String(property.id), dayIso, {
        oooByProperty,
        revenueByProperty,
      })
    );

    const effectiveApartmentStatus =
      isPropertyBlockActiveOnDate(String(property.id), todayStr, input.bookings) ? 'ooo' : property.apartmentStatus;

    const rowBase: DashboardApartmentMatrixRow = {
      apartmentId: String(property.id),
      abteilung: String(property.apartmentGroupName ?? '').trim(),
      statusLabel: statusLabel(effectiveApartmentStatus),
      adresse: String(property.address ?? ''),
      wohnung: getWohnung(property),
      qm: getArea(property),
      betten: getBedsCount(property),
      rooms: getRoomsCount(property),
      dayCells,
      occupancyPctOperationalDays: 0,
    };

    rowBase.occupancyPctOperationalDays = computePerApartmentOperationalOccupancy(rowBase);
    return rowBase;
  });

  const totalRoomsAcrossApartments = rows.reduce((sum, row) => sum + Math.max(0, Number(row.rooms) || 0), 0);
  const dailyMetrics = computeDailyMetrics(rows, days, totalRoomsAcrossApartments);
  const monthlyKpis = computeMonthlyDashboardKpis(rows, days.length);
  const monthlyTotals = {
    occupiedRoomNights: dailyMetrics.reduce((sum, day) => sum + day.occupiedRoomNights, 0),
    notOccupiedRoomNights: dailyMetrics.reduce((sum, day) => sum + day.notOccupiedRoomNights, 0),
    oooRoomNights: dailyMetrics.reduce((sum, day) => sum + day.oooRoomNights, 0),
    totalRoomNights: dailyMetrics.reduce((sum, day) => sum + day.totalRoomNights, 0),
  };

  const summary: MonthlyDashboardSummary = {
    apartments: rows.length,
    rooms: totalRoomsAcrossApartments,
    beds: rows.reduce((sum, row) => sum + Math.max(0, Number(row.betten) || 0), 0),
    active: input.properties.filter((p) => (p.apartmentStatus ?? 'active') === 'active').length,
    employee: input.properties.filter((p) => p.apartmentStatus === 'rented_worker').length,
    inPreparation: input.properties.filter((p) => p.apartmentStatus === 'preparation').length,
    oooRoomNights: monthlyTotals.oooRoomNights,
    rentedPctAvailableApartments: monthlyKpis.rentedPctAvailableApartments,
    rentedPctAvailableRooms: monthlyKpis.rentedPctAvailableRooms,
    averagePricePerRoom: monthlyKpis.averagePricePerRoom,
    occupiedRoomNights: monthlyTotals.occupiedRoomNights,
    notOccupiedRoomNights: monthlyTotals.notOccupiedRoomNights,
    totalRoomNights: monthlyTotals.totalRoomNights,
  };

  return {
    monthStartIso: fromIso,
    days,
    rows,
    dailyMetrics,
    summary,
  };
}
