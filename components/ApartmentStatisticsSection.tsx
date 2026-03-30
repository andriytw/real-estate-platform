/**
 * 12. Apartment Statistics — donut dashboard + KPI + monthly table.
 * Monthly KPIs use the same canonical day-grid pipeline as Properties Dashboard.
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { DonutCompositionCard, DonutGaugeCard } from './charts/DonutCard';
import { CostSliceDetailsCard } from './charts/CostSliceDetailsCard';
import { UserRound, Receipt, Wallet } from 'lucide-react';
import { resolveOwnerDueForMonth } from '../lib/ownerDueResolver';
import { buildSingleApartmentMonthlyPerformanceFromDashboardModel } from '../lib/propertiesDashboard/apartmentMonthlyPerformance';
import type { Booking, InvoiceData, OfferData, Property, Reservation } from '../types';

// --- Data types (minimal for aggregation) ---
interface RentRowLike {
  id?: string;
  validFrom: string;
  validTo: string;
  createdAt?: string;
  km?: number;
  bk?: number;
  hk?: number;
  muell?: number;
  strom?: number;
  gas?: number;
  wasser?: number;
  mietsteuer?: number;
  unternehmenssteuer?: number;
  warm?: number;
}
interface ExpenseItemLike {
  invoice_date?: string | null;
  line_total?: number | null;
  unit_price?: number | null;
  quantity?: number;
  /** Optional for popover display when provided by caller (e.g. PropertyExpenseItemWithDocument). */
  invoice_number?: string | null;
  vendor?: string | null;
  /** For document-level grouping when parent passes PropertyExpenseItemWithDocument. */
  document_id?: string | null;
  property_expense_documents?: {
    id?: string;
    file_name?: string;
    storage_path?: string;
    invoice_number?: string;
    invoice_date?: string;
    vendor?: string;
  } | null;
}

export interface ApartmentStatisticsSectionProps {
  /** Same inputs as Properties Dashboard month model for this apartment. */
  dashboardProperty: Property;
  dashboardBookings: Booking[];
  dashboardReservations: Reservation[];
  dashboardOffers: OfferData[];
  dashboardProformas: InvoiceData[];
  roomsCount: number;
  rentTimelineRows: RentRowLike[];
  expenseItems: ExpenseItemLike[];
  totalInventoryCost: number;
  /** Utilities cost (v1: total from meter block "Сума") — same for selected month; table may use 0 for past months */
  utilitiesCost: number;
  selectedMonth: string;
  onSelectedMonthChange: (yyyyMm: string) => void;
  pricePerRoomNight: number;
  onPricePerRoomNightChange: (value: number) => void;
  formatCurrency: (amount: number) => string;
  /** DEV only: show calculated values */
  showDebug?: boolean;
}

// --- Helpers ---
function daysInMonth(yyyyMm: string): number {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}

/** Display-only YYYY-MM → MM/YYYY. Malformed input returns original (no Date parsing). */
function formatMonthTableLabel(yyyyMm: string): string {
  const t = yyyyMm.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(t);
  if (!match) return yyyyMm;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return yyyyMm;
  return `${String(month).padStart(2, '0')}/${year}`;
}

const MONTHLY_TABLE_TH_SHARED =
  'px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight text-gray-400 whitespace-nowrap align-middle';
const MONTHLY_TABLE_TH_FIRST = `${MONTHLY_TABLE_TH_SHARED} text-left`;
const MONTHLY_TABLE_TH = `${MONTHLY_TABLE_TH_SHARED} text-right`;
const MONTHLY_TABLE_TD_MONTH =
  'px-1.5 py-0.5 text-[11px] leading-tight text-left text-gray-300 whitespace-nowrap align-middle';
const MONTHLY_TABLE_TD_NUM =
  'px-1.5 py-0.5 text-[11px] leading-tight text-right text-white whitespace-nowrap tabular-nums align-middle';
const MONTHLY_TABLE_TD_EMPTY =
  'px-1.5 py-0.5 text-[11px] leading-tight text-gray-300 whitespace-nowrap align-middle';

const COST_HOVER_HIDE_DELAY_MS = 140;
const MAX_INVOICE_ROWS = 12;
const COLLECTED_BREAKDOWN_MAX_ROWS = 12;

const OWNER_COLOR = '#8b5cf6';
const INVOICES_COLOR = '#eab308';

type CostHoverSlice = 'owner' | 'invoices';

interface InvoiceRowForPopover {
  invoiceNumber: string;
  date: string;
  vendor: string;
  sum: number;
}

export function ApartmentStatisticsSection({
  dashboardProperty,
  dashboardBookings,
  dashboardReservations,
  dashboardOffers,
  dashboardProformas,
  roomsCount,
  rentTimelineRows,
  expenseItems,
  totalInventoryCost,
  utilitiesCost,
  selectedMonth,
  onSelectedMonthChange,
  pricePerRoomNight,
  onPricePerRoomNightChange,
  formatCurrency,
  showDebug = false,
}: ApartmentStatisticsSectionProps) {
  const daysInMonthCount = useMemo(() => daysInMonth(selectedMonth), [selectedMonth]);

  const selectedMonthPerf = useMemo(
    () =>
      buildSingleApartmentMonthlyPerformanceFromDashboardModel({
        property: dashboardProperty,
        bookings: dashboardBookings,
        reservations: dashboardReservations,
        offers: dashboardOffers,
        proformas: dashboardProformas,
        monthKey: selectedMonth,
      }),
    [dashboardProperty, dashboardBookings, dashboardReservations, dashboardOffers, dashboardProformas, selectedMonth]
  );

  // --- Last 6 months for table ---
  const last6Months = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const out: string[] = [];
    for (let i = 5; i >= 0; i--) {
      let month = m - i;
      let year = y;
      while (month < 1) {
        month += 12;
        year -= 1;
      }
      while (month > 12) {
        month -= 12;
        year += 1;
      }
      out.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    return out;
  }, [selectedMonth]);

  const normalizedOwnerDueRows = useMemo(
    () =>
      rentTimelineRows.map((r, idx) => ({
        id: String(r.id ?? `row-${idx}`),
        valid_from: r.validFrom,
        valid_to: r.validTo && r.validTo !== '∞' ? r.validTo : null,
        created_at: r.createdAt ?? null,
        km: r.km,
        bk: r.bk,
        hk: r.hk,
        muell: r.muell,
        strom: r.strom,
        gas: r.gas,
        wasser: r.wasser,
        mietsteuer: r.mietsteuer,
        unternehmenssteuer: r.unternehmenssteuer,
      })),
    [rentTimelineRows]
  );

  const ownerDueByMonth = useMemo(() => {
    const out: Record<string, ReturnType<typeof resolveOwnerDueForMonth>> = {};
    const months = new Set<string>([selectedMonth, ...last6Months]);
    for (const mm of months) {
      out[mm] = resolveOwnerDueForMonth(normalizedOwnerDueRows, mm);
    }
    return out;
  }, [selectedMonth, last6Months, normalizedOwnerDueRows]);

  const last6MonthsPerf = useMemo(
    () =>
      last6Months.map((mm) =>
        buildSingleApartmentMonthlyPerformanceFromDashboardModel({
          property: dashboardProperty,
          bookings: dashboardBookings,
          reservations: dashboardReservations,
          offers: dashboardOffers,
          proformas: dashboardProformas,
          monthKey: mm,
        })
      ),
    [last6Months, dashboardProperty, dashboardBookings, dashboardReservations, dashboardOffers, dashboardProformas]
  );

  // --- Aggregation for selected month (canonical dashboard day-grid) ---
  const agg = useMemo(() => {
    const perf = selectedMonthPerf;
    const collected = perf?.collectedForApartment ?? 0;
    const plan = perf?.fullCapacityIncome ?? 0;
    const operationalDays = perf?.operationalDays ?? 0;
    const daysOutOfOrder = perf?.oooDays ?? 0;
    const daysRented = perf?.occupiedOperationalDays ?? 0;
    const daysEmpty = Math.max(0, operationalDays - daysRented);

    const ownerDue = ownerDueByMonth[selectedMonth]?.total ?? 0;

    let invoiceExpenses = 0;
    for (const item of expenseItems) {
      const dateStr = (item.invoice_date ?? '').toString().slice(0, 10);
      if (!dateStr) continue;
      const [y, m] = dateStr.split('-');
      if (y && m && `${y}-${m}` === selectedMonth) {
        const line = item.line_total != null ? Number(item.line_total) : (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
        if (Number.isFinite(line)) invoiceExpenses += line;
      }
    }

    const totalCosts = ownerDue + invoiceExpenses;
    const missingToPlan = Math.max(0, plan - collected);
    const planFulfillmentPct = plan > 0 ? (collected / plan) * 100 : 0;
    const difference = collected - plan;
    const overPlan = Math.max(0, collected - plan);
    const adr = daysRented >= 1 ? collected / daysRented : 0;
    const roomsForAdr = perf?.rooms ?? roomsCount;
    const adrMax = pricePerRoomNight * roomsForAdr || 1;
    const roomAdr = daysRented * roomsForAdr >= 1 ? collected / (daysRented * roomsForAdr) : 0;
    const avgRentable = operationalDays >= 1 ? collected / operationalDays : 0;
    const net = collected - totalCosts;
    const occupancyPct = (perf?.occupancyPctOperationalDays ?? 0) * 100;

    return {
      daysRented,
      daysEmpty,
      daysOutOfOrder,
      operationalDays,
      collected,
      ownerDue,
      invoiceExpenses,
      totalCosts,
      missingToPlan,
      planFulfillmentPct,
      difference,
      overPlan,
      adr,
      adrMax,
      roomAdr,
      avgRentable,
      net,
      occupancyPct,
      plan,
      maxRoomNights: perf?.operationalRentableNights ?? 0,
    };
  }, [selectedMonth, selectedMonthPerf, expenseItems, ownerDueByMonth, pricePerRoomNight, roomsCount]);

  const {
    daysRented,
    daysEmpty,
    daysOutOfOrder,
    operationalDays,
    collected,
    ownerDue,
    invoiceExpenses,
    totalCosts,
    missingToPlan,
    planFulfillmentPct,
    difference,
    overPlan,
    adr,
    adrMax,
    roomAdr,
    avgRentable,
    net,
    occupancyPct,
    plan,
    maxRoomNights,
  } = agg;

  const formatPct = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0') + '%';

  // --- Total Costs hover card: segment hover (position: fixed to avoid clipping) ---
  const [costHover, setCostHover] = useState<{
    slice: CostHoverSlice;
    x: number;
    y: number;
  } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setCostHover(null), COST_HOVER_HIDE_DELAY_MS);
  }, [clearHideTimer]);

  // --- Collected (Income) hover card: same array/filter as collected ---
  const [collectedHover, setCollectedHover] = useState<{ x: number; y: number } | null>(null);
  const collectedHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCollectedHideTimer = useCallback(() => {
    if (collectedHideTimerRef.current) {
      clearTimeout(collectedHideTimerRef.current);
      collectedHideTimerRef.current = null;
    }
  }, []);
  const scheduleCollectedHide = useCallback(() => {
    clearCollectedHideTimer();
    collectedHideTimerRef.current = setTimeout(() => setCollectedHover(null), COST_HOVER_HIDE_DELAY_MS);
  }, [clearCollectedHideTimer]);

  const { invoiceRowsForPopover, totalInvoiceRowsForPopover } = useMemo(() => {
    const mm = selectedMonth;
    const byKey = new Map<
      string,
      { invoiceNumber: string; date: string; vendor: string; sum: number }
    >();
    for (const item of expenseItems) {
      const dateStr = (item.invoice_date ?? item.property_expense_documents?.invoice_date ?? '').toString().slice(0, 10);
      if (!dateStr || dateStr.slice(0, 7) !== mm) continue;
      const line =
        item.line_total != null
          ? Number(item.line_total)
          : (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
      if (!Number.isFinite(line)) continue;
      const doc = item.property_expense_documents;
      const invNum = doc?.invoice_number ?? item.invoice_number ?? '';
      const vendor = doc?.vendor ?? item.vendor ?? '';
      const key =
        item.document_id != null && item.document_id !== ''
          ? `doc:${item.document_id}`
          : doc?.id != null && doc.id !== ''
            ? `doc:${doc.id}`
            : `${invNum}|${dateStr}|${vendor}|${doc?.storage_path ?? doc?.file_name ?? ''}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.sum += line;
      } else {
        byKey.set(key, {
          invoiceNumber: invNum || (doc?.file_name ?? 'Invoice'),
          date: dateStr,
          vendor,
          sum: line,
        });
      }
    }
    const rows = [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
    return {
      invoiceRowsForPopover: rows.slice(0, MAX_INVOICE_ROWS),
      totalInvoiceRowsForPopover: rows.length,
    };
  }, [selectedMonth, expenseItems]);

  const ownerBreakdownRows = useMemo(() => {
    const components = ownerDueByMonth[selectedMonth]?.component_totals ?? {};
    const buckets: Record<string, number> = {
      Kaltmiete: Number(components.km) || 0,
      Betriebskosten: Number(components.bk) || 0,
      Heizkosten: Number(components.hk) || 0,
      Müll: Number(components.muell) || 0,
      Strom: Number(components.strom) || 0,
      Gas: Number(components.gas) || 0,
      Wasser: Number(components.wasser) || 0,
      Mietsteuer: Number(components.mietsteuer) || 0,
      Unternehmenssteuer: Number(components.unternehmenssteuer) || 0,
    };
    const order = [
      'Kaltmiete',
      'Betriebskosten',
      'Heizkosten',
      'Müll',
      'Strom',
      'Gas',
      'Wasser',
      'Mietsteuer',
      'Unternehmenssteuer',
    ];
    return order
      .filter((label) => (buckets[label] ?? 0) > 0)
      .map((label) => ({ label, amount: buckets[label] ?? 0 }));
  }, [selectedMonth, ownerDueByMonth]);

  const ownerRows = useMemo(() => {
    if (ownerBreakdownRows.length > 0) {
      return ownerBreakdownRows.map((r) => ({
        label: r.label,
        value: formatCurrency(r.amount),
      }));
    }
    return [{ label: 'Owner total', value: formatCurrency(ownerDue) }];
  }, [ownerBreakdownRows, ownerDue, formatCurrency]);

  const invoiceRowsForCard = useMemo(() => {
    return invoiceRowsForPopover.map((r) => ({
      label: [r.invoiceNumber || 'Invoice', r.date, r.vendor].filter(Boolean).join(' · '),
      value: formatCurrency(r.sum),
    }));
  }, [invoiceRowsForPopover, formatCurrency]);
  const invoicesWarning =
    totalInvoiceRowsForPopover > MAX_INVOICE_ROWS
      ? `+ ${totalInvoiceRowsForPopover - MAX_INVOICE_ROWS} more (open Invoices tile)`
      : undefined;

  // Collected breakdown: per-day confirmed revenue (same as dashboard day cells)
  const { collectedBreakdownRows, collectedBreakdownWarning } = useMemo(() => {
    const perf = selectedMonthPerf;
    const rows: { label: string; value: string; amount: number }[] = [];
    let sum = 0;
    if (perf) {
      perf.monthDays.forEach((dayIso, i) => {
        const cell = perf.matrixRow.dayCells[i];
        if (cell?.kind === 'value' && Number(cell.amountNet) > 0) {
          const amount = Number(cell.amountNet);
          sum += amount;
          rows.push({ label: dayIso, value: formatCurrency(amount), amount });
        }
      });
    }
    if (import.meta.env.DEV && rows.length > 0) {
      const diff = Math.abs(sum - collected);
      if (diff > 0.02) {
        console.warn('Collected breakdown sum mismatch', { selectedMonth, collected, breakdownSum: sum, countRows: rows.length });
      }
    }
    const capped = rows.slice(0, COLLECTED_BREAKDOWN_MAX_ROWS);
    const warning =
      rows.length > COLLECTED_BREAKDOWN_MAX_ROWS ? `+ ${rows.length - COLLECTED_BREAKDOWN_MAX_ROWS} more` : undefined;
    return {
      collectedBreakdownRows: capped.map((r) => ({ label: r.label, value: r.value })),
      collectedBreakdownWarning: warning,
    };
  }, [selectedMonthPerf, selectedMonth, collected, formatCurrency]);

  return (
    <div className="space-y-6">
      {/* A) Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-gray-700 rounded-lg bg-[#16181D]">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-400">Місяць</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => onSelectedMonthChange(e.target.value)}
            className="bg-[#1C1F24] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs text-gray-500">Кімнати: {roomsCount}</span>
          <span className="text-xs text-gray-500">Днів у місяці: {daysInMonthCount}</span>
          <div>
            <label className="text-xs text-gray-500 block">Price per room-night (€)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={pricePerRoomNight || ''}
              onChange={(e) => onPricePerRoomNightChange(Number(e.target.value) || 0)}
              className="w-24 bg-[#1C1F24] border border-gray-600 rounded px-2 py-1 text-white text-sm tabular-nums"
            />
          </div>
          <div className="text-xs text-gray-400">
            <div>Max room-nights: {maxRoomNights}</div>
            <div>Full capacity income: {formatCurrency(plan)}</div>
          </div>
        </div>
      </div>

      {/* B) Donuts grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Operational Days (Rented / Empty / OOO) */}
        <DonutCompositionCard
          title="Operational Days (Rented / Empty / OOO)"
          segments={[
            { name: 'Rented', value: daysRented, color: '#10b981' },
            { name: 'Empty', value: daysEmpty, color: '#6b7280' },
            { name: 'OOO', value: daysOutOfOrder, color: '#374151' },
          ]}
          centerLabel={`Occupancy ${formatPct(occupancyPct)}`}
          subtext={`Rented ${daysRented} / ${operationalDays} days • OOO ${daysOutOfOrder}`}
        />
        {/* 2. Income vs Plan (Month) */}
        <DonutCompositionCard
          title="Income vs Plan (Month)"
          segments={[
            { name: 'Collected', value: collected, color: '#10b981' },
            { name: 'Missing', value: missingToPlan, color: '#f59e0b' },
          ]}
          centerLabel={plan > 0 ? formatPct(planFulfillmentPct) : '—'}
          subtext={`Collected: ${formatCurrency(collected)} • Plan: ${formatCurrency(plan)} • Missing: ${formatCurrency(missingToPlan)}`}
          hideDefaultTooltip
          onSliceHoverKeyChange={(key, clientXY) => {
            if (key === null) {
              scheduleCollectedHide();
              return;
            }
            clearCollectedHideTimer();
            if (key === 'Collected' && clientXY) {
              setCollectedHover({ x: clientXY.x, y: clientXY.y });
            }
          }}
        />
        {/* 3. Difference (Collected − Plan) */}
        <DonutCompositionCard
          title="Difference (Collected − Plan)"
          segments={
            difference >= 0
              ? [
                  { name: 'Plan', value: plan, color: '#3b82f6' },
                  { name: 'OverPlan', value: overPlan, color: '#10b981' },
                ]
              : [
                  { name: 'Collected', value: collected, color: '#10b981' },
                  { name: 'MissingToPlan', value: missingToPlan, color: '#f59e0b' },
                ]
          }
          centerLabel={formatCurrency(difference)}
          subtext={difference < 0 ? `Missing ${formatCurrency(missingToPlan)}` : `Over ${formatCurrency(overPlan)}`}
        />
        {/* 4. ADR (gauge) */}
        <DonutGaugeCard
          title="Average Price per Rented Day (ADR)"
          value={adr}
          max={adrMax}
          centerLabel={`${formatCurrency(adr)}/day`}
          subtext="Collected / Days Rented"
        />
        {/* 5. Room ADR (gauge) */}
        <DonutGaugeCard
          title="Avg Price per Room per Rented Day"
          value={roomAdr}
          max={pricePerRoomNight || 1}
          centerLabel={formatCurrency(roomAdr)}
          subtext="per room-night"
        />
        {/* 6. Avg Rentable (gauge) */}
        <DonutGaugeCard
          title="Average Price of Rentable Days"
          value={avgRentable}
          max={adrMax || 1}
          centerLabel={`${formatCurrency(avgRentable)}/op.day`}
          subtext="Collected / Operational Days"
        />
        {/* 7. Total Costs — segment details card (position: fixed, no scroll) */}
        <div className="relative">
          <DonutCompositionCard
            title="Total Costs (All Expenses)"
            segments={[
              { name: 'Owner Due', value: ownerDue, color: OWNER_COLOR },
              { name: 'Invoices', value: invoiceExpenses, color: INVOICES_COLOR },
            ]}
            centerLabel={formatCurrency(totalCosts)}
            subtext="Owner + Invoices"
            formatValue={formatCurrency}
            hideDefaultTooltip
            onSliceHoverKeyChange={(key, clientXY) => {
              if (key === null) {
                scheduleHide();
                return;
              }
              clearHideTimer();
              const slice: CostHoverSlice | null =
                key === 'Owner Due' ? 'owner' : key === 'Invoices' ? 'invoices' : null;
              if (slice && clientXY) {
                setCostHover({ slice, x: clientXY.x, y: clientXY.y });
              }
            }}
          />
        </div>
        {/* 8. Net Profit */}
        <DonutCompositionCard
          title="Net Profit (Чистий прибуток)"
          segments={[
            { name: 'Income', value: collected, color: '#10b981' },
            { name: 'Expense', value: totalCosts, color: '#ef4444' },
          ]}
          centerLabel={net < 0 ? `-${formatCurrency(Math.abs(net))} Loss` : formatCurrency(net)}
          subtext={`Collected − Total Costs`}
        />
      </div>

      {/* C) KPI row */}
      <div className="flex flex-wrap gap-2 p-3 border border-gray-700 rounded-lg bg-[#16181D]">
        {[
          ['Operational Days', operationalDays],
          ['OOO', daysOutOfOrder],
          ['Days Rented', daysRented],
          ['Days Empty', daysEmpty],
          ['Collected', formatCurrency(collected)],
          ['Plan', formatCurrency(plan)],
          ['Difference', formatCurrency(difference)],
          ['% Plan Fulfillment', formatPct(planFulfillmentPct)],
          ['ADR/day', formatCurrency(adr)],
          ['ADR/room-night', formatCurrency(roomAdr)],
          ['Avg/op.day', formatCurrency(avgRentable)],
          ['Owner Due', formatCurrency(ownerDue)],
          ['Invoices', formatCurrency(invoiceExpenses)],
          ['Total Costs', formatCurrency(totalCosts)],
          ['Net Profit', formatCurrency(net)],
          ['Inventory Total', formatCurrency(totalInventoryCost)],
        ].map(([label, value]) => (
          <span key={String(label)} className="px-2 py-1 rounded bg-[#1C1F24] text-xs text-gray-300">
            <span className="text-gray-500">{label}:</span> <span className="tabular-nums font-medium">{String(value)}</span>
          </span>
        ))}
      </div>

      {/* D) Monthly table (last 6 months) */}
      <div className="overflow-x-auto border border-gray-700 rounded-lg bg-[#16181D]">
        <table className="w-full text-[11px] leading-tight">
          <thead className="bg-[#23262b] border-b border-gray-700">
            <tr>
              <th className={MONTHLY_TABLE_TH_FIRST}>Month</th>
              <th className={MONTHLY_TABLE_TH}>Rooms</th>
              <th className={MONTHLY_TABLE_TH}>Op.Days</th>
              <th className={MONTHLY_TABLE_TH}>OOO</th>
              <th className={MONTHLY_TABLE_TH}>Rented</th>
              <th className={MONTHLY_TABLE_TH}>Empty</th>
              <th className={MONTHLY_TABLE_TH}>Occupancy%</th>
              <th className={MONTHLY_TABLE_TH}>Price/rn</th>
              <th className={MONTHLY_TABLE_TH}>Plan</th>
              <th className={MONTHLY_TABLE_TH}>Collected</th>
              <th className={MONTHLY_TABLE_TH}>Diff</th>
              <th className={MONTHLY_TABLE_TH}>%Fulfill</th>
              <th className={MONTHLY_TABLE_TH}>ADR</th>
              <th className={MONTHLY_TABLE_TH}>ADR/rn</th>
              <th className={MONTHLY_TABLE_TH}>Avg/op</th>
              <th className={MONTHLY_TABLE_TH}>OwnerDue</th>
              <th className={MONTHLY_TABLE_TH}>Invoices</th>
              <th className={MONTHLY_TABLE_TH}>Utilities</th>
              <th className={MONTHLY_TABLE_TH}>Total Costs</th>
              <th className={MONTHLY_TABLE_TH}>Net</th>
              <th className={MONTHLY_TABLE_TH}>Inventory</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {last6Months.map((mm, idx) => {
              const perf = last6MonthsPerf[idx];
              if (!perf) {
                return (
                  <tr key={mm} className="hover:bg-[#1C1F24]">
                    <td className={MONTHLY_TABLE_TD_EMPTY} colSpan={21}>
                      —
                    </td>
                  </tr>
                );
              }
              const coll = perf.collectedForApartment;
              const planVal = perf.fullCapacityIncome;
              const opDays = perf.operationalDays;
              const ooo = perf.oooDays;
              const rent = perf.occupiedOperationalDays;
              const empty = Math.max(0, opDays - rent);
              const occ = perf.occupancyPctOperationalDays * 100;
              const own = ownerDueByMonth[mm]?.total ?? 0;
              let inv = 0;
              for (const item of expenseItems) {
                const dateStr = (item.invoice_date ?? '').toString().slice(0, 10);
                if (dateStr && dateStr.slice(0, 7) === mm) {
                  const line = item.line_total != null ? Number(item.line_total) : (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
                  if (Number.isFinite(line)) inv += line;
                }
              }
              const util = mm === selectedMonth ? utilitiesCost : 0;
              const tot = own + inv;
              const diff = coll - planVal;
              const pct = planVal > 0 ? (coll / planVal) * 100 : 0;
              const adrVal = rent >= 1 ? coll / rent : 0;
              const roomAdrVal = rent * perf.rooms >= 1 ? coll / (rent * perf.rooms) : 0;
              const avgOp = opDays >= 1 ? coll / opDays : 0;
              const netVal = coll - tot;
              return (
                <tr key={mm} className="hover:bg-[#1C1F24]">
                  <td className={MONTHLY_TABLE_TD_MONTH}>{formatMonthTableLabel(mm)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{perf.rooms}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{opDays}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{ooo}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{rent}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{empty}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{occ.toFixed(1)}%</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{perf.planningPricePerRoom}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(planVal)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(coll)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(diff)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{pct.toFixed(1)}%</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(adrVal)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(roomAdrVal)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(avgOp)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(own)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(inv)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(util)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(tot)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(netVal)}</td>
                  <td className={MONTHLY_TABLE_TD_NUM}>{formatCurrency(totalInventoryCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Total Costs hover card (position: fixed to avoid clipping by grid/cards) */}
      {costHover && (
        <CostSliceDetailsCard
          title={costHover.slice === 'owner' ? 'Owner Due' : 'Invoices'}
          icon={costHover.slice === 'owner' ? UserRound : Receipt}
          color={costHover.slice === 'owner' ? OWNER_COLOR : INVOICES_COLOR}
          total={
            costHover.slice === 'owner'
              ? formatCurrency(ownerDue)
              : formatCurrency(invoiceExpenses)
          }
          rows={
            costHover.slice === 'owner' ? ownerRows : invoiceRowsForCard
          }
          warning={costHover.slice === 'invoices' ? invoicesWarning : undefined}
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(costHover.x + 16, window.innerWidth - 540)),
            top: Math.max(8, Math.min(costHover.y - 40, window.innerHeight - 260)),
          }}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHide}
        />
      )}

      {/* Collected (Income) hover card — same style, from Income vs Plan segment */}
      {collectedHover && (
        <CostSliceDetailsCard
          title="Collected (Income)"
          icon={Wallet}
          color="#10b981"
          total={formatCurrency(collected)}
          rows={collectedBreakdownRows}
          warning={collectedBreakdownWarning}
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(collectedHover.x + 16, window.innerWidth - 540)),
            top: Math.max(8, Math.min(collectedHover.y - 40, window.innerHeight - 260)),
          }}
          onMouseEnter={clearCollectedHideTimer}
          onMouseLeave={scheduleCollectedHide}
        />
      )}

      {/* Debug (dev-only) */}
      {showDebug && import.meta.env.DEV && (
        <details className="mt-4 p-3 border border-gray-700 rounded-lg bg-[#16181D] text-xs font-mono text-gray-400">
          <summary>Show calculated values</summary>
          <pre className="mt-2 overflow-auto max-h-48">
            {JSON.stringify(
              {
                selectedMonth,
                daysRented: agg.daysRented,
                daysEmpty: agg.daysEmpty,
                operationalDays,
                collected: agg.collected,
                plan,
                totalCosts: agg.totalCosts,
                net: agg.net,
                ownerDue: agg.ownerDue,
                invoiceExpenses: agg.invoiceExpenses,
                utilitiesCost,
              },
              null,
              2
            )}
          </pre>
        </details>
      )}
    </div>
  );
}
