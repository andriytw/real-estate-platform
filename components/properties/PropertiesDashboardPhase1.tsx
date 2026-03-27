import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bed, ChevronDown, ChevronRight, LayoutGrid, Ruler, X } from 'lucide-react';
import { bookingsService, invoicesService, offersService, propertiesService, rentTimelineService, reservationsService } from '../../services/supabaseService';
import { propertyExpenseService, type PropertyExpenseItemWithDocument } from '../../services/propertyExpenseService';
import type { Booking, InvoiceData, OfferData, Property, RentTimelineRowDB, Reservation } from '../../types';
import { buildDashboardMonthData } from '../../lib/propertiesDashboard/selectors';
import type { DailyDashboardMetrics } from '../../lib/propertiesDashboard/types';

function formatPct(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(2)}%`;
}

function formatPctCompact(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return (Math.max(0, safe) * 100).toFixed(2).replace('.', ',');
}

function formatCurrency(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} €`;
}

function formatSignedCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) < 1e-9) return formatCurrency(0);
  if (safe > 0) return `+${formatCurrency(safe)}`;
  return formatCurrency(-Math.abs(safe));
}

function formatCompactNumber(value: number | null | undefined): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return safe.toFixed(2).replace('.', ',');
}

function formatCellCurrency(value: number): string {
  return value > 0 ? String(Math.round(value)) : '-';
}

function statusClass(kind: 'ooo' | 'zero' | 'value'): string {
  if (kind === 'ooo') return 'bg-gray-700/50 text-gray-200';
  if (kind === 'zero') return 'bg-red-700/35 text-red-100';
  return 'bg-emerald-700/35 text-emerald-100';
}

interface ApartmentFinancialRow {
  apartmentId: string;
  abteilung: string;
  statusLabel: string;
  adresse: string;
  wohnung: string;
  qm: number;
  betten: number;
  rooms: number;
  collectedForApartment: number;
  planningPricePerRoom: number;
  operationalRentableNights: number;
  fullCapacityIncome: number;
  difference: number;
  planFulfillment: number;
  invoices: number;
  ownerDue: number;
  totalCost: number;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function monthStart(yyyyMm: string): Date {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function monthEnd(yyyyMm: string): Date {
  const start = monthStart(yyyyMm);
  start.setMonth(start.getMonth() + 1);
  start.setDate(0);
  return start;
}

function overlapDays(rangeStart: Date, rangeEnd: Date, monthStartDate: Date, monthEndDate: Date): number {
  const start = new Date(Math.max(rangeStart.getTime(), monthStartDate.getTime()));
  const end = new Date(Math.min(rangeEnd.getTime(), monthEndDate.getTime()));
  if (start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function expenseInvoiceLineAmount(item: PropertyExpenseItemWithDocument): number {
  return item.line_total != null
    ? Number(item.line_total)
    : (Number(item.unit_price) || 0) * (Number(item.quantity) || 0);
}

/** Invoice month filter: `monthKey` is `YYYY-MM`, same as `<input type="month">`. */
function invoiceItemInSelectedMonth(item: PropertyExpenseItemWithDocument, monthKey: string): boolean {
  const raw = (item.invoice_date ?? '').toString().trim();
  const ymd = raw.slice(0, 10);
  if (!ymd || ymd.length < 7) return false;
  return ymd.slice(0, 7) === monthKey;
}

const OWNER_DUE_COMPONENT_DEFS: Array<{ key: keyof Pick<RentTimelineRowDB, 'km' | 'bk' | 'hk' | 'muell' | 'strom' | 'gas' | 'wasser' | 'mietsteuer' | 'unternehmenssteuer'>; label: string }> = [
  { key: 'km', label: 'Kaltmiete' },
  { key: 'bk', label: 'Betriebskosten' },
  { key: 'hk', label: 'Heizkosten' },
  { key: 'muell', label: 'Müll' },
  { key: 'strom', label: 'Strom' },
  { key: 'gas', label: 'Gas' },
  { key: 'wasser', label: 'Wasser' },
  { key: 'mietsteuer', label: 'Mietsteuer' },
  { key: 'unternehmenssteuer', label: 'Unternehmenssteuer' },
];

/**
 * Same proration as legacy inline owner-due reduce; full float precision.
 * Returns null when the row does not overlap the selected month.
 */
function computeOwnerDueContribution(
  rentRow: RentTimelineRowDB,
  monthStartDate: Date,
  monthEndExclusive: Date
): {
  proratedTotal: number;
  overlap: number;
  rowDays: number;
  components: Record<string, number>;
} | null {
  const von = rentRow.valid_from ? parseISODate(rentRow.valid_from) : monthStartDate;
  const bisStr = rentRow.valid_to && rentRow.valid_to !== '∞' ? rentRow.valid_to : '9999-12-31';
  const bis = parseISODate(bisStr);
  const rowDays = Math.max(1, Math.floor((bis.getTime() - von.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const overlap = overlapDays(von, bis, monthStartDate, monthEndExclusive);
  if (overlap <= 0) return null;

  const km = Number(rentRow.km) || 0;
  const bk = Number(rentRow.bk) || 0;
  const hk = Number(rentRow.hk) || 0;
  const muell = Number(rentRow.muell) || 0;
  const strom = Number(rentRow.strom) || 0;
  const gas = Number(rentRow.gas) || 0;
  const wasser = Number(rentRow.wasser) || 0;
  const mietsteuer = Number(rentRow.mietsteuer) || 0;
  const unternehmenssteuer = Number(rentRow.unternehmenssteuer) || 0;
  const rowTotal = km + bk + hk + muell + strom + gas + wasser + mietsteuer + unternehmenssteuer;
  const proratedTotal = rowDays >= 28 && overlap >= 28 ? rowTotal : rowTotal * (overlap / rowDays);
  const factor = rowDays >= 28 && overlap >= 28 ? 1 : overlap / rowDays;
  const components: Record<string, number> = {
    km: km * factor,
    bk: bk * factor,
    hk: hk * factor,
    muell: muell * factor,
    strom: strom * factor,
    gas: gas * factor,
    wasser: wasser * factor,
    mietsteuer: mietsteuer * factor,
    unternehmenssteuer: unternehmenssteuer * factor,
  };
  return { proratedTotal, overlap, rowDays, components };
}

/** Display-only: adjust last rounded part so displayed parts sum to the same 2dp as targetTotal. */
function reconcileDisplayCurrencyParts(amounts: number[], targetTotal: number): number[] {
  if (amounts.length === 0) return [];
  const target = Math.round(targetTotal * 100) / 100;
  const rounded = amounts.map((a) => Math.round(a * 100) / 100);
  const sum = rounded.reduce((s, x) => s + x, 0);
  const drift = Math.round((target - sum) * 100) / 100;
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + drift) * 100) / 100;
  return rounded;
}

/** Shared grid for Apartment Expenses Breakdown modal: col1 fixed 2.25rem, identity flexible, three fixed financial columns. */
const MODAL_EXPENSES_BREAKDOWN_GRID =
  'grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_11rem_11rem_12rem] gap-x-3 items-center';

function ModalExpenseFinancialCell({
  label,
  valueFormatted,
  valueClassName = 'text-white',
}: {
  label: string;
  valueFormatted: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 shrink-0">
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        <span className="min-w-0 shrink text-gray-400">{label}</span>
        <span className={`shrink-0 text-right font-semibold tabular-nums ${valueClassName}`}>{valueFormatted}</span>
      </div>
    </div>
  );
}

const PropertiesDashboardPhase1: React.FC = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [offers, setOffers] = useState<OfferData[]>([]);
  const [proformas, setProformas] = useState<InvoiceData[]>([]);
  const [expenseItemsByPropertyId, setExpenseItemsByPropertyId] = useState<Record<string, PropertyExpenseItemWithDocument[]>>({});
  const [rentRowsByPropertyId, setRentRowsByPropertyId] = useState<Record<string, RentTimelineRowDB[]>>({});
  const [editingPlanningCell, setEditingPlanningCell] = useState<{ propertyId: string; draft: string } | null>(null);
  const [savingPlanningFor, setSavingPlanningFor] = useState<string | null>(null);
  const [planningSaveError, setPlanningSaveError] = useState<string | null>(null);
  const [expensesModalOpen, setExpensesModalOpen] = useState(false);
  const [expandedExpenseApartments, setExpandedExpenseApartments] = useState<Set<string>>(new Set());
  const [apartmentExpenseModalSearch, setApartmentExpenseModalSearch] = useState('');
  const [apartmentExpenseModalStreetSort, setApartmentExpenseModalStreetSort] = useState<'default' | 'asc' | 'desc'>('default');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [p, b, r, o, pf] = await Promise.all([
          propertiesService.getAll(),
          bookingsService.getAll(),
          reservationsService.getAll(),
          offersService.getAll(),
          invoicesService.getProformas(),
        ]);
        const [expenseEntries, rentEntries] = await Promise.all([
          Promise.all(
            p.map(async (property) => [String(property.id), await propertyExpenseService.listItemsWithDocuments(String(property.id))] as const)
          ),
          Promise.all(
            p.map(async (property) => [String(property.id), await rentTimelineService.listRows(String(property.id))] as const)
          ),
        ]);
        if (cancelled) return;
        setProperties(p);
        setBookings(b);
        setReservations(r);
        setOffers(o);
        setProformas(pf);
        setExpenseItemsByPropertyId(Object.fromEntries(expenseEntries));
        setRentRowsByPropertyId(Object.fromEntries(rentEntries));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthData = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!y || !m) return null;
    return buildDashboardMonthData({
      properties,
      bookings,
      reservations,
      offers,
      proformas,
      year: y,
      monthIndex0: m - 1,
    });
  }, [selectedMonth, properties, bookings, reservations, offers, proformas]);

  const dashboardMonthContext = useMemo(() => {
    const monthKey = selectedMonth;
    const monthStartDate = monthStart(monthKey);
    const monthEndDate = monthEnd(monthKey);
    const monthEndExclusive = new Date(monthEndDate);
    monthEndExclusive.setDate(monthEndExclusive.getDate() + 1);
    const [y, m] = monthKey.split('-').map(Number);
    const monthLabel =
      Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12
        ? new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : monthKey;
    return { monthKey, monthStartDate, monthEndDate, monthEndExclusive, monthLabel };
  }, [selectedMonth]);

  const apartmentFinancialRows = useMemo<ApartmentFinancialRow[]>(() => {
    if (!monthData) return [];
    const { monthKey, monthStartDate: mStart, monthEndExclusive } = dashboardMonthContext;
    const propertyById = new Map(properties.map((p) => [String(p.id), p]));

    return monthData.rows.map((row) => {
      const property = propertyById.get(row.apartmentId);
      const planningPricePerRoom = Math.max(0, Number(property?.planningPricePerRoom ?? 0));
      const collectedForApartment = row.dayCells.reduce((sum, cell) => sum + (cell.kind === 'value' ? cell.amountNet : 0), 0);
      const operationalDays = row.dayCells.reduce((sum, cell) => sum + (cell.kind === 'ooo' ? 0 : 1), 0);
      const operationalRentableNights = operationalDays * Math.max(0, Number(row.rooms) || 0);
      const fullCapacityIncome = planningPricePerRoom * operationalRentableNights;

      const items = expenseItemsByPropertyId[row.apartmentId] ?? [];
      const invoices = items.reduce((sum, item) => {
        if (!invoiceItemInSelectedMonth(item, monthKey)) return sum;
        const line = expenseInvoiceLineAmount(item);
        return Number.isFinite(line) ? sum + line : sum;
      }, 0);

      const rentRows = rentRowsByPropertyId[row.apartmentId] ?? [];
      const ownerDue = rentRows.reduce((sum, rentRow) => {
        const c = computeOwnerDueContribution(rentRow, mStart, monthEndExclusive);
        return c ? sum + c.proratedTotal : sum;
      }, 0);

      const totalCost = invoices + ownerDue;
      const difference = collectedForApartment - fullCapacityIncome;
      const planFulfillment = fullCapacityIncome > 0 ? collectedForApartment / fullCapacityIncome : 0;

      return {
        apartmentId: row.apartmentId,
        abteilung: row.abteilung,
        statusLabel: row.statusLabel,
        adresse: row.adresse,
        wohnung: row.wohnung,
        qm: row.qm,
        betten: row.betten,
        rooms: row.rooms,
        collectedForApartment,
        planningPricePerRoom,
        operationalRentableNights,
        fullCapacityIncome,
        difference,
        planFulfillment: Number.isFinite(planFulfillment) ? planFulfillment : 0,
        invoices,
        ownerDue,
        totalCost,
      };
    });
  }, [monthData, dashboardMonthContext, properties, expenseItemsByPropertyId, rentRowsByPropertyId]);

  const expensesSummaryTotals = useMemo(() => {
    const invoices = apartmentFinancialRows.reduce((s, r) => s + r.invoices, 0);
    const ownerDue = apartmentFinancialRows.reduce((s, r) => s + r.ownerDue, 0);
    return { invoices, ownerDue, totalExpenses: invoices + ownerDue };
  }, [apartmentFinancialRows]);

  const apartmentExpenseModalRows = useMemo(() => {
    const { monthKey, monthStartDate: mStart, monthEndExclusive } = dashboardMonthContext;
    return apartmentFinancialRows.map((finRow) => {
      const items = expenseItemsByPropertyId[finRow.apartmentId] ?? [];
      const monthItems = items.filter((item) => invoiceItemInSelectedMonth(item, monthKey));
      const invoiceLines = monthItems.map((item) => ({
        id: item.id,
        invoiceNumber: item.invoice_number ?? item.property_expense_documents?.invoice_number ?? null,
        invoiceDate: (item.invoice_date ?? item.property_expense_documents?.invoice_date ?? null) as string | null,
        vendor: item.vendor ?? item.property_expense_documents?.vendor ?? null,
        amount: expenseInvoiceLineAmount(item),
      }));

      const rentRows = rentRowsByPropertyId[finRow.apartmentId] ?? [];
      const ownerDueBlocks = rentRows
        .map((rentRow) => {
          const c = computeOwnerDueContribution(rentRow, mStart, monthEndExclusive);
          if (!c) return null;
          const lineEntries: Array<{ label: string; raw: number }> = [];
          for (const def of OWNER_DUE_COMPONENT_DEFS) {
            const raw = c.components[def.key] ?? 0;
            if (Math.abs(raw) > 1e-12) lineEntries.push({ label: def.label, raw });
          }
          let displayLines: Array<{ label: string; displayAmount: string }>;
          if (lineEntries.length === 0) {
            displayLines = [{ label: 'Total', displayAmount: formatCurrency(c.proratedTotal) }];
          } else {
            const reconciled = reconcileDisplayCurrencyParts(
              lineEntries.map((e) => e.raw),
              c.proratedTotal
            );
            displayLines = lineEntries.map((e, i) => ({
              label: e.label,
              displayAmount: formatCurrency(reconciled[i]),
            }));
          }
          return {
            rentRowId: rentRow.id,
            validFrom: rentRow.valid_from,
            validTo: rentRow.valid_to ?? '—',
            tenantName: rentRow.tenant_name,
            proratedTotal: c.proratedTotal,
            displayLines,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);

      return {
        apartmentId: finRow.apartmentId,
        abteilung: finRow.abteilung,
        adresse: finRow.adresse,
        wohnung: finRow.wohnung,
        invoices: finRow.invoices,
        ownerDue: finRow.ownerDue,
        totalCost: finRow.totalCost,
        invoiceLines,
        ownerDueBlocks,
      };
    });
  }, [apartmentFinancialRows, dashboardMonthContext, expenseItemsByPropertyId, rentRowsByPropertyId]);

  const displayedApartmentExpenseRows = useMemo(() => {
    const rows = apartmentExpenseModalRows;
    const qNorm = apartmentExpenseModalSearch.trim().toLowerCase();
    const filtered =
      qNorm === ''
        ? rows.slice()
        : rows.filter((block) => {
            const haystack = [`${block.abteilung ?? ''}`, `${block.adresse ?? ''}`, `${block.wohnung ?? ''}`].join(' ').toLowerCase();
            return haystack.includes(qNorm);
          });
    if (apartmentExpenseModalStreetSort === 'default') {
      return filtered;
    }
    return filtered.slice().sort((a, b) => {
      const cmp = (a.adresse ?? '').localeCompare(b.adresse ?? '', undefined, { sensitivity: 'base' });
      if (cmp !== 0) {
        return apartmentExpenseModalStreetSort === 'asc' ? cmp : -cmp;
      }
      return a.apartmentId.localeCompare(b.apartmentId);
    });
  }, [apartmentExpenseModalRows, apartmentExpenseModalSearch, apartmentExpenseModalStreetSort]);

  const apartmentPerformanceSummary = useMemo(() => {
    const collected = apartmentFinancialRows.reduce((sum, row) => sum + row.collectedForApartment, 0);
    const fullCapacityIncome = apartmentFinancialRows.reduce((sum, row) => sum + row.fullCapacityIncome, 0);
    const difference = collected - fullCapacityIncome;
    const planFulfillment = fullCapacityIncome > 0 ? collected / fullCapacityIncome : 0;
    return {
      collected,
      fullCapacityIncome,
      difference,
      planFulfillment: Number.isFinite(planFulfillment) ? planFulfillment : 0,
    };
  }, [apartmentFinancialRows]);

  const monthlyRoomsPct = (monthData?.summary.rentedPctAvailableRooms ?? 0) * 100;
  const monthlyRoomsPctColorClass =
    monthlyRoomsPct < 83.0
      ? 'text-red-400'
      : monthlyRoomsPct < 85.5
      ? 'text-amber-300'
      : monthlyRoomsPct < 90.0
      ? 'text-emerald-400'
      : 'text-cyan-300';

  const commitPlanningPrice = useCallback(async (propertyId: string, draft: string) => {
    const parsed = Number(draft.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPlanningSaveError('Price per Room must be a non-negative number.');
      setEditingPlanningCell(null);
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    const previous = Number(properties.find((p) => String(p.id) === propertyId)?.planningPricePerRoom ?? 0);

    setPlanningSaveError(null);
    setEditingPlanningCell(null);
    setSavingPlanningFor(propertyId);
    setProperties((prev) =>
      prev.map((p) => (String(p.id) === propertyId ? { ...p, planningPricePerRoom: rounded } : p))
    );
    try {
      const updated = await propertiesService.update(propertyId, { planningPricePerRoom: rounded });
      setProperties((prev) => prev.map((p) => (String(p.id) === propertyId ? updated : p)));
    } catch (e) {
      setProperties((prev) =>
        prev.map((p) => (String(p.id) === propertyId ? { ...p, planningPricePerRoom: previous } : p))
      );
      setPlanningSaveError(e instanceof Error ? e.message : 'Failed to save planning price per room.');
    } finally {
      setSavingPlanningFor((cur) => (cur === propertyId ? null : cur));
    }
  }, [properties]);

  const toggleExpenseApartmentExpand = useCallback((id: string) => {
    setExpandedExpenseApartments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!expensesModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpensesModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expensesModalOpen]);

  if (loading) {
    return <div className="p-6 text-gray-300">Loading Properties Dashboard...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-300">Properties Dashboard error: {error}</div>;
  }

  if (!monthData) {
    return <div className="p-6 text-gray-300">Invalid month selected.</div>;
  }

  const frozenHeaderBase = 'px-1 py-1 border-b border-gray-700 sticky z-20 overflow-hidden';
  const frozenCellBase = 'px-1 py-1 border-b border-gray-800 sticky z-10 overflow-hidden';
  const leftZoneBoundaryClass = 'shadow-[1px_0_0_0_rgba(55,65,81,1)]';
  const dailyLabelCellClass = 'p-2 border-b border-r border-gray-800 text-gray-300 bg-[#1C1F24] whitespace-nowrap';
  const dailyDayCellClass = 'w-[56px] min-w-[56px] max-w-[56px] whitespace-nowrap text-center';
  const wohnungWidth = (() => {
    const maxChars = monthData.rows.reduce((max, row) => Math.max(max, String(row.wohnung ?? '').length), 0);
    const estimated = maxChars * 8 + 14;
    return Math.min(160, Math.max(64, estimated));
  })();
  const frozenWidths = {
    abteilung: 66,
    status: 66,
    adresse: 196,
    wohnung: wohnungWidth,
    qm: 30,
    betten: 30,
    rooms: 30,
  };
  const frozenLeft = {
    abteilung: 0,
    status: frozenWidths.abteilung,
    adresse: frozenWidths.abteilung + frozenWidths.status,
    wohnung: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse,
    qm: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse + frozenWidths.wohnung,
    betten: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse + frozenWidths.wohnung + frozenWidths.qm,
    rooms: frozenWidths.abteilung + frozenWidths.status + frozenWidths.adresse + frozenWidths.wohnung + frozenWidths.qm + frozenWidths.betten,
  };

  return (
    <div className="p-6 space-y-4 text-white pb-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Properties Dashboard</h2>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-[#1C1F24] border border-gray-700 text-white rounded-md px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-gray-400">Apartments:</span> {monthData.summary.apartments}</div>
            <div><span className="text-gray-400">Rooms:</span> {monthData.summary.rooms}</div>
            <div><span className="text-gray-400">Beds:</span> {monthData.summary.beds}</div>
            <div><span className="text-gray-400">Active:</span> {monthData.summary.active}</div>
            <div><span className="text-gray-400">Employee:</span> {monthData.summary.employee}</div>
            <div><span className="text-gray-400">OOO:</span> {monthData.summary.oooRoomNights}</div>
            <div><span className="text-gray-400">In preparation:</span> {monthData.summary.inPreparation}</div>
          </div>
        </section>

        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Monthly KPI</h3>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Rented % of Available Apartments</span>
              <span className="font-semibold">{formatPct(monthData.summary.rentedPctAvailableApartments)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Rented % of Available Rooms</span>
              <span className={`font-semibold ${monthlyRoomsPctColorClass}`}>{formatPct(monthData.summary.rentedPctAvailableRooms)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Average Price Per Rooms</span>
              <span className="font-semibold">{formatCurrency(monthData.summary.averagePricePerRoom)}</span>
            </div>
          </div>
        </section>

        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Monthly Totals</h3>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Occupied Room-Nights</span>
              <span className="font-semibold">{monthData.summary.occupiedRoomNights}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Not Occupied Room-Nights</span>
              <span className="font-semibold">{monthData.summary.notOccupiedRoomNights}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Not Occupied Room-Nights because of OOO</span>
              <span className="font-semibold">{monthData.summary.oooRoomNights}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Total Room-Nights</span>
              <span className="font-semibold">{monthData.summary.totalRoomNights}</span>
            </div>
          </div>
        </section>

        <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Apartment Performance Summary</h3>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Collected from all apartments</span>
              <span className="font-semibold">{formatCurrency(apartmentPerformanceSummary.collected)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Full Capacity Income</span>
              <span className="font-semibold">{formatCurrency(apartmentPerformanceSummary.fullCapacityIncome)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Difference</span>
              <span className="font-semibold">{formatSignedCurrency(apartmentPerformanceSummary.difference)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">% of Plan Fulfillment</span>
              <span className="font-semibold">{formatPct(apartmentPerformanceSummary.planFulfillment)}</span>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setExpensesModalOpen(true)}
          className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4 text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[#0D1117] hover:border-gray-600 transition-colors"
        >
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Apartment Expenses Summary</h3>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Invoices</span>
              <span className="font-semibold">{formatCurrency(expensesSummaryTotals.invoices)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Owner Due</span>
              <span className="font-semibold">{formatCurrency(expensesSummaryTotals.ownerDue)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Total Expenses</span>
              <span className="font-semibold text-emerald-200">{formatCurrency(expensesSummaryTotals.totalExpenses)}</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-gray-500">Click for full breakdown</p>
        </button>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Daily KPI Rows</h3>
        {(() => {
          const tile1Rows: Array<{ label: string; format: (d: DailyDashboardMetrics) => string }> = [
            {
              label: 'Rented % of Available Apartments',
              format: (d) => formatPctCompact(d.rentedPctAvailableApartments),
            },
            {
              label: 'Rented % of Available Rooms',
              format: (d) => formatPctCompact(d.rentedPctAvailableRooms),
            },
            {
              label: 'Average Price Per Rooms',
              format: (d) => formatCompactNumber(d.averagePricePerRoom),
            },
          ];
          const tile2Rows: Array<{ label: string; format: (d: DailyDashboardMetrics) => string }> = [
            {
              label: 'Occupied Room-Nights',
              format: (d) => String(d.occupiedRoomNights),
            },
            {
              label: 'Not occupied Room-Nights',
              format: (d) => String(d.notOccupiedRoomNights),
            },
            {
              label: 'Not occupied Room-Nights because of OOO',
              format: (d) => String(d.oooRoomNights),
            },
            {
              label: 'Total Room-Nights',
              format: (d) => String(d.totalRoomNights),
            },
          ];
          const renderDailyTile = (title: string, rows: Array<{ label: string; format: (d: DailyDashboardMetrics) => string }>) => (
            <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4 overflow-hidden">
              <h4 className="text-xs font-semibold text-gray-300 mb-3">{title}</h4>
              <div className="flex items-start">
                <div className="shrink-0">
                  <table className="text-xs border-separate border-spacing-0">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left p-2 border-b border-r border-gray-700 bg-[#1C1F24] whitespace-nowrap">Metric \\ Day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ label }) => (
                        <tr key={`${title}-${label}`}>
                          <td className={dailyLabelCellClass}>{label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto w-full">
                  <table className="text-xs border-separate border-spacing-0 min-w-max">
                    <thead>
                      <tr className="text-gray-400">
                        {monthData.days.map((_, i) => (
                          <th key={`${title}-kpi-day-${i}`} className={`p-2 border-b border-r border-gray-800 last:border-r-0 border-gray-700 ${dailyDayCellClass}`}>{i + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ label, format }) => (
                        <tr key={label}>
                          {monthData.dailyMetrics.map((day) => (
                            <td key={`${title}-${label}-${day.dayOfMonth}`} className={`p-2 border-b border-r border-gray-800 last:border-r-0 whitespace-nowrap ${dailyDayCellClass}`}>
                              {format(day)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
          return (
            <div className="space-y-4">
              {renderDailyTile('Daily KPI Rows — Tile 1', tile1Rows)}
              {renderDailyTile('Daily KPI Rows — Tile 2', tile2Rows)}
            </div>
          );
        })()}
      </section>

      <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Apartment / Day Matrix</h3>
        <div className="overflow-x-auto">
          <table className="min-w-[1520px] text-xs border-separate border-spacing-0 table-fixed">
            <thead>
              <tr className="text-gray-400">
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.abteilung, minWidth: frozenWidths.abteilung, maxWidth: frozenWidths.abteilung, left: frozenLeft.abteilung, backgroundColor: '#1C1F24' }}>Abteilung</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.status, minWidth: frozenWidths.status, maxWidth: frozenWidths.status, left: frozenLeft.status, backgroundColor: '#1C1F24' }}>Status</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.adresse, minWidth: frozenWidths.adresse, maxWidth: frozenWidths.adresse, left: frozenLeft.adresse, backgroundColor: '#1C1F24' }}>Adresse</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.wohnung, minWidth: frozenWidths.wohnung, maxWidth: frozenWidths.wohnung, left: frozenLeft.wohnung, backgroundColor: '#1C1F24' }}>Wohnung</th>
                <th
                  className={`${frozenHeaderBase} text-right`}
                  style={{ width: frozenWidths.qm, minWidth: frozenWidths.qm, maxWidth: frozenWidths.qm, left: frozenLeft.qm, backgroundColor: '#1C1F24' }}
                  title="QM"
                  aria-label="QM"
                >
                  <span className="inline-flex justify-end w-full"><Ruler className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                <th
                  className={`${frozenHeaderBase} text-right`}
                  style={{ width: frozenWidths.betten, minWidth: frozenWidths.betten, maxWidth: frozenWidths.betten, left: frozenLeft.betten, backgroundColor: '#1C1F24' }}
                  title="Betten"
                  aria-label="Betten"
                >
                  <span className="inline-flex justify-end w-full"><Bed className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                <th
                  className={`${frozenHeaderBase} text-right ${leftZoneBoundaryClass}`}
                  style={{ width: frozenWidths.rooms, minWidth: frozenWidths.rooms, maxWidth: frozenWidths.rooms, left: frozenLeft.rooms, backgroundColor: '#1C1F24' }}
                  title="Rooms"
                  aria-label="Rooms"
                >
                  <span className="inline-flex justify-end w-full"><LayoutGrid className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                {monthData.days.map((_, i) => (
                  <th key={`matrix-day-${i}`} className="px-1.5 py-1 border-b border-gray-700 w-[56px] min-w-[56px] max-w-[56px] text-center whitespace-nowrap bg-[#1C1F24]">{i + 1}</th>
                ))}
                <th className="px-1.5 py-1 border-b border-gray-700 sticky right-0 bg-[#1C1F24] z-10">Occupancy % of Operational Days</th>
              </tr>
            </thead>
            <tbody>
              {monthData.rows.map((row) => (
                <tr key={row.apartmentId}>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.abteilung, minWidth: frozenWidths.abteilung, maxWidth: frozenWidths.abteilung, left: frozenLeft.abteilung, backgroundColor: '#1C1F24' }}>{row.abteilung || '—'}</td>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.status, minWidth: frozenWidths.status, maxWidth: frozenWidths.status, left: frozenLeft.status, backgroundColor: '#1C1F24' }}>{row.statusLabel}</td>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.adresse, minWidth: frozenWidths.adresse, maxWidth: frozenWidths.adresse, left: frozenLeft.adresse, backgroundColor: '#1C1F24' }}>
                    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{row.adresse}</span>
                  </td>
                  <td className={`${frozenCellBase}`} style={{ width: frozenWidths.wohnung, minWidth: frozenWidths.wohnung, maxWidth: frozenWidths.wohnung, left: frozenLeft.wohnung, backgroundColor: '#1C1F24' }}>
                    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{row.wohnung}</span>
                  </td>
                  <td className={`${frozenCellBase} text-right`} style={{ width: frozenWidths.qm, minWidth: frozenWidths.qm, maxWidth: frozenWidths.qm, left: frozenLeft.qm, backgroundColor: '#1C1F24' }}>{row.qm}</td>
                  <td className={`${frozenCellBase} text-right`} style={{ width: frozenWidths.betten, minWidth: frozenWidths.betten, maxWidth: frozenWidths.betten, left: frozenLeft.betten, backgroundColor: '#1C1F24' }}>{row.betten}</td>
                  <td className={`${frozenCellBase} text-right ${leftZoneBoundaryClass}`} style={{ width: frozenWidths.rooms, minWidth: frozenWidths.rooms, maxWidth: frozenWidths.rooms, left: frozenLeft.rooms, backgroundColor: '#1C1F24' }}>{row.rooms}</td>
                  {row.dayCells.map((cell, idx) => (
                    <td key={`${row.apartmentId}-${idx}`} className={`px-1.5 py-1 border-b border-gray-800 text-center w-[56px] min-w-[56px] max-w-[56px] whitespace-nowrap relative z-0 ${statusClass(cell.kind)}`}>
                      {cell.kind === 'ooo' ? 'OOO' : formatCellCurrency(cell.amountNet)}
                    </td>
                  ))}
                  <td className="px-1.5 py-1 border-b border-gray-800 text-right sticky right-0 bg-[#1C1F24] z-10">
                    {formatPct(row.occupancyPctOperationalDays)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Apartment Financial Performance (Monthly)</h3>
        {planningSaveError && (
          <div className="mb-3 text-xs text-red-300 bg-red-900/20 border border-red-700/40 rounded px-2 py-1">
            {planningSaveError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-[2200px] text-xs border-separate border-spacing-0 table-fixed">
            <thead>
              <tr className="text-gray-400">
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.abteilung, minWidth: frozenWidths.abteilung, maxWidth: frozenWidths.abteilung, left: frozenLeft.abteilung, backgroundColor: '#1C1F24' }}>Abteilung</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.status, minWidth: frozenWidths.status, maxWidth: frozenWidths.status, left: frozenLeft.status, backgroundColor: '#1C1F24' }}>Status</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.adresse, minWidth: frozenWidths.adresse, maxWidth: frozenWidths.adresse, left: frozenLeft.adresse, backgroundColor: '#1C1F24' }}>Adresse</th>
                <th className={`${frozenHeaderBase} text-left`} style={{ width: frozenWidths.wohnung, minWidth: frozenWidths.wohnung, maxWidth: frozenWidths.wohnung, left: frozenLeft.wohnung, backgroundColor: '#1C1F24' }}>Wohnung</th>
                <th
                  className={`${frozenHeaderBase} text-right`}
                  style={{ width: frozenWidths.qm, minWidth: frozenWidths.qm, maxWidth: frozenWidths.qm, left: frozenLeft.qm, backgroundColor: '#1C1F24' }}
                  title="QM"
                  aria-label="QM"
                >
                  <span className="inline-flex justify-end w-full"><Ruler className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                <th
                  className={`${frozenHeaderBase} text-right`}
                  style={{ width: frozenWidths.betten, minWidth: frozenWidths.betten, maxWidth: frozenWidths.betten, left: frozenLeft.betten, backgroundColor: '#1C1F24' }}
                  title="Betten"
                  aria-label="Betten"
                >
                  <span className="inline-flex justify-end w-full"><Bed className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>
                <th
                  className={`${frozenHeaderBase} text-right ${leftZoneBoundaryClass}`}
                  style={{ width: frozenWidths.rooms, minWidth: frozenWidths.rooms, maxWidth: frozenWidths.rooms, left: frozenLeft.rooms, backgroundColor: '#1C1F24' }}
                  title="Rooms"
                  aria-label="Rooms"
                >
                  <span className="inline-flex justify-end w-full"><LayoutGrid className="w-3.5 h-3.5 text-gray-400" /></span>
                </th>

                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[160px]">Collected for Apartment</th>
                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[140px]">Price per Room</th>
                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[170px]">Full Capacity Income</th>
                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[140px]">Difference</th>
                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[150px]">% of Plan Fulfillment</th>
                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[120px]">Invoices</th>
                <th className="px-2 py-1 border-b border-gray-700 border-r border-gray-800 text-right min-w-[120px]">Owner Due</th>
                <th className="px-2 py-1 border-b border-gray-700 text-right min-w-[120px]">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {apartmentFinancialRows.map((row) => {
                const isEditing = editingPlanningCell?.propertyId === row.apartmentId;
                const isSaving = savingPlanningFor === row.apartmentId;
                return (
                  <tr key={`financial-${row.apartmentId}`}>
                    <td className={`${frozenCellBase}`} style={{ width: frozenWidths.abteilung, minWidth: frozenWidths.abteilung, maxWidth: frozenWidths.abteilung, left: frozenLeft.abteilung, backgroundColor: '#1C1F24' }}>{row.abteilung || '—'}</td>
                    <td className={`${frozenCellBase}`} style={{ width: frozenWidths.status, minWidth: frozenWidths.status, maxWidth: frozenWidths.status, left: frozenLeft.status, backgroundColor: '#1C1F24' }}>{row.statusLabel}</td>
                    <td className={`${frozenCellBase}`} style={{ width: frozenWidths.adresse, minWidth: frozenWidths.adresse, maxWidth: frozenWidths.adresse, left: frozenLeft.adresse, backgroundColor: '#1C1F24' }}>
                      <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{row.adresse}</span>
                    </td>
                    <td className={`${frozenCellBase}`} style={{ width: frozenWidths.wohnung, minWidth: frozenWidths.wohnung, maxWidth: frozenWidths.wohnung, left: frozenLeft.wohnung, backgroundColor: '#1C1F24' }}>
                      <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">{row.wohnung}</span>
                    </td>
                    <td className={`${frozenCellBase} text-right`} style={{ width: frozenWidths.qm, minWidth: frozenWidths.qm, maxWidth: frozenWidths.qm, left: frozenLeft.qm, backgroundColor: '#1C1F24' }}>{row.qm}</td>
                    <td className={`${frozenCellBase} text-right`} style={{ width: frozenWidths.betten, minWidth: frozenWidths.betten, maxWidth: frozenWidths.betten, left: frozenLeft.betten, backgroundColor: '#1C1F24' }}>{row.betten}</td>
                    <td className={`${frozenCellBase} text-right ${leftZoneBoundaryClass}`} style={{ width: frozenWidths.rooms, minWidth: frozenWidths.rooms, maxWidth: frozenWidths.rooms, left: frozenLeft.rooms, backgroundColor: '#1C1F24' }}>{row.rooms}</td>

                    <td className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums">{formatCurrency(row.collectedForApartment)}</td>
                    <td
                      className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums"
                      onDoubleClick={() =>
                        setEditingPlanningCell({
                          propertyId: row.apartmentId,
                          draft: row.planningPricePerRoom.toFixed(2),
                        })
                      }
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          step={0.01}
                          value={editingPlanningCell?.draft ?? ''}
                          onChange={(e) =>
                            setEditingPlanningCell((cur) =>
                              cur && cur.propertyId === row.apartmentId ? { ...cur, draft: e.target.value } : cur
                            )
                          }
                          onBlur={() => {
                            if (!editingPlanningCell || editingPlanningCell.propertyId !== row.apartmentId) return;
                            void commitPlanningPrice(row.apartmentId, editingPlanningCell.draft);
                          }}
                          onKeyDown={(e) => {
                            if (!editingPlanningCell || editingPlanningCell.propertyId !== row.apartmentId) return;
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void commitPlanningPrice(row.apartmentId, editingPlanningCell.draft);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingPlanningCell(null);
                              setPlanningSaveError(null);
                            }
                          }}
                          className="w-24 bg-[#0D1117] border border-emerald-500/70 rounded px-1 py-0.5 text-white text-xs text-right tabular-nums"
                        />
                      ) : (
                        <span className="cursor-text">{formatCompactNumber(row.planningPricePerRoom)}</span>
                      )}
                      {isSaving && <span className="ml-1 text-[10px] text-gray-500">...</span>}
                    </td>
                    <td className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums">{formatCurrency(row.fullCapacityIncome)}</td>
                    <td className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums">{formatCurrency(row.difference)}</td>
                    <td className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums">
                      {formatPct(row.planFulfillment > 0 ? row.planFulfillment : 0)}
                    </td>
                    <td className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums">{formatCurrency(row.invoices)}</td>
                    <td className="px-2 py-1 border-b border-r border-gray-800 text-right tabular-nums">{formatCurrency(row.ownerDue)}</td>
                    <td className="px-2 py-1 border-b border-gray-800 text-right tabular-nums">{formatCurrency(row.totalCost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {expensesModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-8 sm:pt-12 bg-black/70"
          role="presentation"
          onClick={() => setExpensesModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="expenses-modal-title"
            className="relative w-full max-w-[90rem] max-h-[85vh] overflow-y-auto overflow-x-auto rounded-xl border border-gray-800 bg-[#1C1F24] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start gap-3 border-b border-gray-800 pb-4 mb-4 sm:flex-nowrap sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 shrink basis-full sm:max-w-[min(100%,24rem)] sm:basis-auto">
                <h2 id="expenses-modal-title" className="text-lg font-semibold text-white">
                  Apartment Expenses Breakdown
                </h2>
                <p className="mt-0.5 text-sm text-gray-400">{dashboardMonthContext.monthLabel}</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-[1_1_auto] sm:justify-end">
                <input
                  id="expenses-modal-search"
                  type="search"
                  value={apartmentExpenseModalSearch}
                  onChange={(e) => setApartmentExpenseModalSearch(e.target.value)}
                  placeholder="Search by street..."
                  aria-label="Search apartments"
                  className="min-w-[10rem] max-w-full flex-1 rounded-md border border-gray-700 bg-[#0D1117] px-2.5 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                />
                <label htmlFor="expenses-modal-sort" className="sr-only">
                  Sort by street
                </label>
                <select
                  id="expenses-modal-sort"
                  value={apartmentExpenseModalStreetSort}
                  onChange={(e) => setApartmentExpenseModalStreetSort(e.target.value as 'default' | 'asc' | 'desc')}
                  className="shrink-0 rounded-md border border-gray-700 bg-[#0D1117] px-2 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="default">Street (default)</option>
                  <option value="asc">Street A–Z</option>
                  <option value="desc">Street Z–A</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setExpensesModalOpen(false)}
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-w-0 rounded-lg border border-gray-800 bg-[#0D1117]/50 p-4 text-sm">
              <div className={MODAL_EXPENSES_BREAKDOWN_GRID}>
                <div aria-hidden className="h-4 w-full shrink-0" />
                <div aria-hidden className="min-h-4 min-w-0" />
                <ModalExpenseFinancialCell
                  label="Owner Due:"
                  valueFormatted={formatCurrency(expensesSummaryTotals.ownerDue)}
                />
                <ModalExpenseFinancialCell
                  label="Invoices:"
                  valueFormatted={formatCurrency(expensesSummaryTotals.invoices)}
                />
                <ModalExpenseFinancialCell
                  label="Total Expenses:"
                  valueFormatted={formatCurrency(expensesSummaryTotals.totalExpenses)}
                  valueClassName="text-emerald-200"
                />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">By apartment</h3>
              {displayedApartmentExpenseRows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {apartmentExpenseModalRows.length === 0
                    ? 'No apartments for this month.'
                    : 'No apartments match your search.'}
                </p>
              ) : null}
              {displayedApartmentExpenseRows.map((block) => {
                const expanded = expandedExpenseApartments.has(block.apartmentId);
                return (
                  <div key={block.apartmentId} className="rounded-lg border border-gray-800 bg-[#0D1117]/40">
                    <button
                      type="button"
                      onClick={() => toggleExpenseApartmentExpand(block.apartmentId)}
                      className={`w-full px-3 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500/40 ${MODAL_EXPENSES_BREAKDOWN_GRID}`}
                    >
                      <span className="flex h-full shrink-0 items-center justify-center text-gray-500">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 truncate text-sm">
                        <span className="text-gray-300">{block.adresse || '—'}</span>
                        <span className="text-gray-500"> · </span>
                        <span className="text-white">{block.wohnung || '—'}</span>
                      </div>
                      <ModalExpenseFinancialCell label="Owner Due:" valueFormatted={formatCurrency(block.ownerDue)} />
                      <ModalExpenseFinancialCell label="Invoices:" valueFormatted={formatCurrency(block.invoices)} />
                      <ModalExpenseFinancialCell
                        label="Total Expenses:"
                        valueFormatted={formatCurrency(block.totalCost)}
                        valueClassName="text-emerald-200"
                      />
                    </button>
                    {expanded && (
                      <div className="space-y-4 border-t border-gray-800 px-3 pb-4 pt-2 pl-10">
                        <div>
                          <div className="text-xs font-semibold text-gray-500">Owner Due</div>
                          {block.ownerDueBlocks.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">No owner-due rows overlapping this month.</p>
                          ) : (
                            <ul className="mt-2 space-y-3">
                              {block.ownerDueBlocks.map((ob) => (
                                <li key={ob.rentRowId} className="rounded border border-gray-800/80 bg-[#1C1F24] p-3 text-sm">
                                  <div className="flex flex-wrap justify-between gap-2 text-gray-300">
                                    <span className="text-xs text-gray-500">
                                      {ob.validFrom} → {ob.validTo}
                                      {ob.tenantName ? ` · ${ob.tenantName}` : ''}
                                    </span>
                                    <span className="font-semibold tabular-nums text-white">{formatCurrency(ob.proratedTotal)}</span>
                                  </div>
                                  <ul className="mt-2 space-y-1 pl-2 text-xs text-gray-400">
                                    {ob.displayLines.map((ln, idx) => (
                                      <li key={`${ob.rentRowId}-${idx}`} className="flex justify-between gap-4">
                                        <span>{ln.label}</span>
                                        <span className="tabular-nums text-gray-200">{ln.displayAmount}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-gray-500">Invoices</div>
                          {block.invoiceLines.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">No invoice lines for this month.</p>
                          ) : (
                            <ul className="mt-2 space-y-2">
                              {block.invoiceLines.map((inv) => (
                                <li
                                  key={inv.id}
                                  className="flex flex-col gap-0.5 rounded border border-gray-800/80 bg-[#1C1F24] px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="text-gray-300">
                                    <span className="font-medium text-white">{inv.invoiceNumber ?? '—'}</span>
                                    <span className="text-gray-500"> · </span>
                                    <span>{inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : '—'}</span>
                                    {inv.vendor ? (
                                      <>
                                        <span className="text-gray-500"> · </span>
                                        <span className="text-gray-400">{inv.vendor}</span>
                                      </>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 font-semibold tabular-nums text-emerald-100">{formatCurrency(inv.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertiesDashboardPhase1;
