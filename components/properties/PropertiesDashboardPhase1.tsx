import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bed, ChevronDown, ChevronRight, Download, Eye, LayoutGrid, Ruler, X } from 'lucide-react';
import { bookingsService, invoicesService, offersService, paymentProofsService, propertiesService, rentTimelineService, reservationsService } from '../../services/supabaseService';
import { propertyExpenseService, type PropertyExpenseItemWithDocument } from '../../services/propertyExpenseService';
import { buildExpenseInvoiceGroupsForMonth, pickExpenseInvoiceDocumentTarget } from '../../lib/propertyExpenseInvoiceGroups';
import type { Booking, InvoiceData, OfferData, Property, RentTimelineRowDB, Reservation } from '../../types';
import { buildDashboardMonthData } from '../../lib/propertiesDashboard/selectors';
import { apartmentFinancialCoreFromMatrixRow } from '../../lib/propertiesDashboard/apartmentMonthlyPerformance';
import { buildPaidProformaContributionsByProperty } from '../../lib/propertiesDashboard/dayCellResolver';
import type { DailyDashboardMetrics } from '../../lib/propertiesDashboard/types';
import { resolveOwnerDueForMonth } from '../../lib/ownerDueResolver';

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

function normalizeModalIdentityLabel(value: string | undefined | null): string {
  const t = (value ?? '').trim();
  return t === '' ? '—' : t;
}

function operatingCompanyLabel(property: Property | undefined): string {
  const sc = (property?.secondCompany?.name ?? '').trim();
  if (sc) return sc;
  const tn = (property?.tenant?.name ?? '').trim();
  return tn || '—';
}

function expenseInvoiceCompositeKey(apartmentId: string, groupKey: string): string {
  return JSON.stringify({ apartmentId, groupKey });
}

/** Shared grid for Apartment Expenses Breakdown modal: col1 fixed 2.25rem, identity flexible, three fixed financial columns. */
const MODAL_EXPENSES_BREAKDOWN_GRID =
  'grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_12rem_12rem_14rem] gap-x-3 items-center';

/** Shared grid for Apartment Performance Breakdown modal: chevron + identity columns + KPI columns. */
const MODAL_PERFORMANCE_BREAKDOWN_GRID =
  'grid w-full min-w-0 grid-cols-[2.25rem_8rem_8rem_minmax(0,1fr)_6rem_6rem_8.5rem_8.5rem_8.5rem_7.5rem] gap-x-2 items-center';

const PERFORMANCE_APT_HEADER_CELL_CLASS =
  'truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500';
const PERFORMANCE_APT_CELL_CLASS = 'truncate text-[12px] leading-tight';
const PERFORMANCE_APT_CELL_MUTED_CLASS = `${PERFORMANCE_APT_CELL_CLASS} text-gray-400`;
const PERFORMANCE_APT_CELL_STREET_CLASS = `${PERFORMANCE_APT_CELL_CLASS} text-gray-300`;
const PERFORMANCE_APT_CELL_UNIT_CLASS = `${PERFORMANCE_APT_CELL_CLASS} text-white`;
const PERFORMANCE_APT_CELL_NUM_CLASS = 'text-right tabular-nums text-[12px] leading-tight text-white';

const PERFORMANCE_CONTRIB_SEGMENT_CLASS = 'min-w-0 truncate whitespace-nowrap text-[11px] leading-tight';
const PERFORMANCE_CONTRIB_META_CLASS = `${PERFORMANCE_CONTRIB_SEGMENT_CLASS} text-gray-400`;
const PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS = `${PERFORMANCE_CONTRIB_SEGMENT_CLASS} text-gray-500`;
const PERFORMANCE_CONTRIB_LINK_CLASS =
  'min-w-0 truncate whitespace-nowrap text-[11px] leading-tight text-emerald-200 hover:text-emerald-100 hover:underline underline-offset-2';

const PERFORMANCE_CONTRIB_ROW_CLASS =
  'grid min-w-[86rem] grid-cols-[9rem_9rem_12rem_4.5rem_7rem_12rem_1fr_1fr_8.5rem] gap-x-3 items-center';

function fileNameFromUrl(href: string | undefined | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
    const decoded = decodeURIComponent(last);
    return decoded || null;
  } catch {
    const last = String(href).split('?')[0]?.split('#')[0]?.split('/').filter(Boolean).pop() ?? '';
    try {
      const decoded = decodeURIComponent(last);
      return decoded || null;
    } catch {
      return last || null;
    }
  }
}

function nextDayIso(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

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
    <div className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
        <span className="min-w-0 flex-1 truncate text-left text-gray-400">{label}</span>
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
  const [apartmentExpenseModalGroupFilter, setApartmentExpenseModalGroupFilter] = useState<'all' | string>('all');
  const [apartmentExpenseModalOperatorFilter, setApartmentExpenseModalOperatorFilter] = useState<'all' | string>('all');
  const [expandedExpenseInvoiceKeys, setExpandedExpenseInvoiceKeys] = useState<Set<string>>(new Set());
  const [performanceModalOpen, setPerformanceModalOpen] = useState(false);
  const [expandedPerformanceApartments, setExpandedPerformanceApartments] = useState<Set<string>>(new Set());
  const [performanceModalSearch, setPerformanceModalSearch] = useState('');
  const [performanceModalStreetSort, setPerformanceModalStreetSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [performanceModalGroupFilter, setPerformanceModalGroupFilter] = useState<'all' | string>('all');
  const [performanceModalOperatorFilter, setPerformanceModalOperatorFilter] = useState<'all' | string>('all');
  const [proformaDocBundlesById, setProformaDocBundlesById] = useState<
    Record<
      string,
      | { status: 'idle' | 'loading' }
      | {
          status: 'loaded';
          bundle: {
            proformaId: string;
            proformaFileUrl: string | null;
            invoices: Array<{ id: string; invoiceNumber: string; date: string; fileUrl: string | null }>;
            proofsByInvoiceId: Record<string, Array<{ id: string; fileName: string | null; href: string }>>;
            hasAnyProofs: boolean;
          };
        }
      | { status: 'error'; message: string }
    >
  >({});

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
    const [y, m] = monthKey.split('-').map(Number);
    const monthLabel =
      Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12
        ? new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : monthKey;
    return { monthKey, monthLabel };
  }, [selectedMonth]);

  const ownerDueResolvedByApartment = useMemo(() => {
    const out: Record<string, ReturnType<typeof resolveOwnerDueForMonth>> = {};
    const { monthKey } = dashboardMonthContext;
    for (const [apartmentId, rows] of Object.entries(rentRowsByPropertyId)) {
      out[apartmentId] = resolveOwnerDueForMonth(
        rows.map((r) => ({
          id: String(r.id),
          valid_from: r.valid_from,
          valid_to: r.valid_to,
          created_at: r.created_at,
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
        monthKey
      );
    }
    return out;
  }, [dashboardMonthContext, rentRowsByPropertyId]);

  const apartmentFinancialRows = useMemo<ApartmentFinancialRow[]>(() => {
    if (!monthData) return [];
    const { monthKey } = dashboardMonthContext;
    const propertyById = new Map(properties.map((p) => [String(p.id), p]));

    return monthData.rows.map((row) => {
      const property = propertyById.get(row.apartmentId);
      const core = apartmentFinancialCoreFromMatrixRow(row, property);

      const items = expenseItemsByPropertyId[row.apartmentId] ?? [];
      const invoices = items.reduce((sum, item) => {
        if (!invoiceItemInSelectedMonth(item, monthKey)) return sum;
        const line = expenseInvoiceLineAmount(item);
        return Number.isFinite(line) ? sum + line : sum;
      }, 0);

      const ownerDue = ownerDueResolvedByApartment[row.apartmentId]?.total ?? 0;

      const totalCost = invoices + ownerDue;

      return {
        apartmentId: row.apartmentId,
        abteilung: row.abteilung,
        statusLabel: row.statusLabel,
        adresse: row.adresse,
        wohnung: row.wohnung,
        qm: row.qm,
        betten: row.betten,
        rooms: row.rooms,
        collectedForApartment: core.collectedForApartment,
        planningPricePerRoom: core.planningPricePerRoom,
        operationalRentableNights: core.operationalRentableNights,
        fullCapacityIncome: core.fullCapacityIncome,
        difference: core.difference,
        planFulfillment: core.planFulfillment,
        invoices,
        ownerDue,
        totalCost,
      };
    });
  }, [monthData, dashboardMonthContext, properties, expenseItemsByPropertyId, ownerDueResolvedByApartment]);

  const expensesSummaryTotals = useMemo(() => {
    const invoices = apartmentFinancialRows.reduce((s, r) => s + r.invoices, 0);
    const ownerDue = apartmentFinancialRows.reduce((s, r) => s + r.ownerDue, 0);
    return { invoices, ownerDue, totalExpenses: invoices + ownerDue };
  }, [apartmentFinancialRows]);

  const apartmentExpenseModalRows = useMemo(() => {
    const { monthKey } = dashboardMonthContext;
    const propertyById = new Map(properties.map((p) => [String(p.id), p]));
    return apartmentFinancialRows.map((finRow) => {
      const property = propertyById.get(finRow.apartmentId);
      const normalizedGroup = normalizeModalIdentityLabel(property?.apartmentGroupName);
      const normalizedOperator = operatingCompanyLabel(property);
      const propertyTitle = normalizeModalIdentityLabel(property?.title);
      const items = expenseItemsByPropertyId[finRow.apartmentId] ?? [];
      const monthItems = items.filter((item) => invoiceItemInSelectedMonth(item, monthKey));
      const invoiceGroups = buildExpenseInvoiceGroupsForMonth(monthItems, expenseInvoiceLineAmount);

      const rentRows = rentRowsByPropertyId[finRow.apartmentId] ?? [];
      const rentRowById = new Map(rentRows.map((r) => [String(r.id), r]));
      const ownerDueBlocks = (ownerDueResolvedByApartment[finRow.apartmentId]?.blocks ?? [])
        .map((block) => {
          const sourceRow = rentRowById.get(String(block.row_id));
          const lineEntries: Array<{ label: string; raw: number }> = [];
          for (const def of OWNER_DUE_COMPONENT_DEFS) {
            const raw = block.components[def.key] ?? 0;
            if (Math.abs(raw) > 1e-12) lineEntries.push({ label: def.label, raw });
          }
          let displayLines: Array<{ label: string; displayAmount: string }>;
          if (lineEntries.length === 0) {
            displayLines = [{ label: 'Total', displayAmount: formatCurrency(block.prorated_total) }];
          } else {
            const reconciled = reconcileDisplayCurrencyParts(
              lineEntries.map((e) => e.raw),
              block.prorated_total
            );
            displayLines = lineEntries.map((e, i) => ({
              label: e.label,
              displayAmount: formatCurrency(reconciled[i]),
            }));
          }
          return {
            rentRowId: block.row_id,
            validFrom: block.segment_start,
            validTo: block.segment_end,
            tenantName: sourceRow?.tenant_name,
            proratedTotal: block.prorated_total,
            displayLines,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);

      return {
        apartmentId: finRow.apartmentId,
        abteilung: finRow.abteilung,
        normalizedGroup,
        normalizedOperator,
        propertyTitle,
        adresse: finRow.adresse,
        wohnung: finRow.wohnung,
        invoices: finRow.invoices,
        ownerDue: finRow.ownerDue,
        totalCost: finRow.totalCost,
        invoiceGroups,
        ownerDueBlocks,
      };
    });
  }, [apartmentFinancialRows, dashboardMonthContext, expenseItemsByPropertyId, properties, rentRowsByPropertyId, ownerDueResolvedByApartment]);

  const modalGroupFilterOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of apartmentExpenseModalRows) uniq.add(r.normalizedGroup);
    return [...uniq].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [apartmentExpenseModalRows]);

  const modalOperatorFilterOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of apartmentExpenseModalRows) uniq.add(r.normalizedOperator);
    return [...uniq].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [apartmentExpenseModalRows]);

  const displayedApartmentExpenseRows = useMemo(() => {
    const rows = apartmentExpenseModalRows;
    const qNorm = apartmentExpenseModalSearch.trim().toLowerCase();
    const filtered = rows.filter((block) => {
      if (qNorm !== '') {
        const haystack = [block.normalizedGroup, block.normalizedOperator, `${block.adresse ?? ''}`, `${block.wohnung ?? ''}`]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(qNorm)) return false;
      }
      if (apartmentExpenseModalGroupFilter !== 'all' && block.normalizedGroup !== apartmentExpenseModalGroupFilter) return false;
      if (apartmentExpenseModalOperatorFilter !== 'all' && block.normalizedOperator !== apartmentExpenseModalOperatorFilter) return false;
      return true;
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
  }, [
    apartmentExpenseModalRows,
    apartmentExpenseModalSearch,
    apartmentExpenseModalStreetSort,
    apartmentExpenseModalGroupFilter,
    apartmentExpenseModalOperatorFilter,
  ]);

  const expensesModalVisibleTotals = useMemo(() => {
    if (displayedApartmentExpenseRows.length === 0) {
      return { ownerDue: 0, invoices: 0, totalExpenses: 0 };
    }
    let invoices = 0;
    let ownerDue = 0;
    let totalExpenses = 0;
    for (const block of displayedApartmentExpenseRows) {
      invoices += block.invoices;
      ownerDue += block.ownerDue;
      totalExpenses += block.totalCost;
    }
    return { invoices, ownerDue, totalExpenses };
  }, [displayedApartmentExpenseRows]);

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

  const contributionsByApartmentId = useMemo(() => {
    if (!monthData) return new Map();
    const fromIso = monthData.days[0] ?? dashboardMonthContext.monthKey + '-01';
    const lastDay = monthData.days[monthData.days.length - 1];
    const toIsoExclusive = lastDay ? nextDayIso(lastDay) : fromIso;
    return buildPaidProformaContributionsByProperty(
      properties.map((p) => String(p.id)),
      monthData.days,
      {
        bookings,
        reservations,
        offers,
        proformas,
        monthFromIso: fromIso,
        monthToIsoExclusive: toIsoExclusive,
      }
    );
  }, [monthData, dashboardMonthContext, properties, bookings, reservations, offers, proformas]);

  const ensureProformaDocsLoaded = useCallback(
    async (proformaId: string) => {
      setProformaDocBundlesById((prev) => {
        const cur = prev[proformaId];
        if (cur && (cur.status === 'loading' || cur.status === 'loaded')) return prev;
        return { ...prev, [proformaId]: { status: 'loading' } };
      });

      try {
        const invoices = await invoicesService.getInvoicesByProformaId(proformaId);
        const normalizedInvoices = invoices.map((inv) => ({
          id: String(inv.id),
          invoiceNumber: String(inv.invoiceNumber ?? ''),
          date: String(inv.date ?? ''),
          fileUrl: inv.fileUrl ?? null,
        }));

        const proofsByInvoiceId: Record<string, Array<{ id: string; fileName: string | null; href: string }>> = {};
        let hasAnyProofs = false;

        for (const inv of normalizedInvoices) {
          const proofs = await paymentProofsService.getByInvoiceId(inv.id);
          const rows: Array<{ id: string; fileName: string | null; href: string }> = [];
          for (const proof of proofs) {
            const filePath = proof.filePath ?? '';
            if (filePath.trim() === '') continue;
            const href = await paymentProofsService.getPaymentProofSignedUrl(filePath);
            rows.push({ id: String(proof.id), fileName: proof.fileName ?? null, href });
          }
          if (rows.length > 0) hasAnyProofs = true;
          proofsByInvoiceId[inv.id] = rows;
        }

        setProformaDocBundlesById((prev) => ({
          ...prev,
          [proformaId]: {
            status: 'loaded',
            bundle: {
              proformaId,
              proformaFileUrl: proformas.find((p) => String(p.id) === String(proformaId))?.fileUrl ?? null,
              invoices: normalizedInvoices,
              proofsByInvoiceId,
              hasAnyProofs,
            },
          },
        }));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setProformaDocBundlesById((prev) => ({ ...prev, [proformaId]: { status: 'error', message } }));
      }
    },
    [proformas]
  );

  const togglePerformanceApartmentExpand = useCallback(
    (apartmentId: string) => {
      setExpandedPerformanceApartments((prev) => {
        const next = new Set(prev);
        const willExpand = !next.has(apartmentId);
        if (willExpand) {
          next.add(apartmentId);

          // Preload docs once per proformaId when apartment becomes expanded.
          const contributions = (contributionsByApartmentId as Map<string, any>).get(apartmentId) ?? [];
          for (const c of contributions) {
            const proformaId = String(c?.proforma?.id ?? '');
            if (proformaId) void ensureProformaDocsLoaded(proformaId);
          }
        } else {
          next.delete(apartmentId);
        }
        return next;
      });
    },
    [contributionsByApartmentId, ensureProformaDocsLoaded]
  );

  const apartmentPerformanceModalRows = useMemo(() => {
    const propertyById = new Map(properties.map((p) => [String(p.id), p]));
    const occupancyByApartmentId = new Map<string, number>();
    for (const r of monthData?.rows ?? []) {
      occupancyByApartmentId.set(String(r.apartmentId), r.occupancyPctOperationalDays);
    }

    return apartmentFinancialRows.map((finRow) => {
      const property = propertyById.get(finRow.apartmentId);
      const normalizedGroup = normalizeModalIdentityLabel(property?.apartmentGroupName);
      const normalizedOperator = operatingCompanyLabel(property);
      const occupancyPct = occupancyByApartmentId.get(finRow.apartmentId) ?? 0;

      return {
        apartmentId: finRow.apartmentId,
        normalizedGroup,
        normalizedOperator,
        adresse: finRow.adresse,
        wohnung: finRow.wohnung,
        occupancyPct,
        collected: finRow.collectedForApartment,
        plan: finRow.fullCapacityIncome,
        difference: finRow.difference,
        planFulfillment: finRow.planFulfillment,
      };
    });
  }, [apartmentFinancialRows, monthData, properties]);

  const performanceModalGroupFilterOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of apartmentPerformanceModalRows) uniq.add(r.normalizedGroup);
    return [...uniq].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [apartmentPerformanceModalRows]);

  const performanceModalOperatorFilterOptions = useMemo(() => {
    const uniq = new Set<string>();
    for (const r of apartmentPerformanceModalRows) uniq.add(r.normalizedOperator);
    return [...uniq].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [apartmentPerformanceModalRows]);

  const displayedApartmentPerformanceRows = useMemo(() => {
    const rows = apartmentPerformanceModalRows;
    const qNorm = performanceModalSearch.trim().toLowerCase();
    const filtered = rows.filter((block) => {
      if (qNorm !== '') {
        const haystack = [block.normalizedGroup, block.normalizedOperator, `${block.adresse ?? ''}`, `${block.wohnung ?? ''}`]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(qNorm)) return false;
      }
      if (performanceModalGroupFilter !== 'all' && block.normalizedGroup !== performanceModalGroupFilter) return false;
      if (performanceModalOperatorFilter !== 'all' && block.normalizedOperator !== performanceModalOperatorFilter) return false;
      return true;
    });
    if (performanceModalStreetSort === 'default') {
      return filtered;
    }
    return filtered.slice().sort((a, b) => {
      const cmp = (a.adresse ?? '').localeCompare(b.adresse ?? '', undefined, { sensitivity: 'base' });
      if (cmp !== 0) {
        return performanceModalStreetSort === 'asc' ? cmp : -cmp;
      }
      return a.apartmentId.localeCompare(b.apartmentId);
    });
  }, [
    apartmentPerformanceModalRows,
    performanceModalSearch,
    performanceModalStreetSort,
    performanceModalGroupFilter,
    performanceModalOperatorFilter,
  ]);

  const performanceModalVisibleTotals = useMemo(() => {
    if (displayedApartmentPerformanceRows.length === 0) {
      return { collected: 0, plan: 0, difference: 0, planFulfillment: 0 };
    }
    let collected = 0;
    let plan = 0;
    let difference = 0;
    for (const row of displayedApartmentPerformanceRows) {
      collected += row.collected;
      plan += row.plan;
      difference += row.difference;
    }
    const planFulfillment = plan > 0 ? collected / plan : 0;
    return {
      collected,
      plan,
      difference,
      planFulfillment: Number.isFinite(planFulfillment) ? planFulfillment : 0,
    };
  }, [displayedApartmentPerformanceRows]);

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

  const toggleExpenseInvoiceExpand = useCallback((apartmentId: string, groupKey: string) => {
    const composite = expenseInvoiceCompositeKey(apartmentId, groupKey);
    setExpandedExpenseInvoiceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(composite)) next.delete(composite);
      else next.add(composite);
      return next;
    });
  }, []);

  const handleViewExpenseDocumentModal = useCallback(async (storagePath: string) => {
    try {
      const url = await propertyExpenseService.getDocumentSignedUrl(storagePath);
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
      alert('Could not open document.');
    }
  }, []);

  const handleDownloadExpenseDocumentModal = useCallback(async (storagePath: string, fileName: string) => {
    try {
      const url = await propertyExpenseService.getDocumentSignedUrl(storagePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document';
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert('Could not download document.');
    }
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

        <button
          type="button"
          onClick={() => setPerformanceModalOpen(true)}
          className="bg-[#1C1F24] border border-gray-800 rounded-xl p-4 text-left w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-[#0D1117] hover:border-gray-600 transition-colors"
        >
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
          <p className="mt-3 text-[11px] text-gray-500">Click for full breakdown</p>
        </button>

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
                <label htmlFor="expenses-modal-group" className="sr-only">
                  Filter by apartment group
                </label>
                <select
                  id="expenses-modal-group"
                  value={apartmentExpenseModalGroupFilter}
                  onChange={(e) => setApartmentExpenseModalGroupFilter(e.target.value)}
                  className="shrink-0 max-w-[10rem] rounded-md border border-gray-700 bg-[#0D1117] px-2 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="all">All groups</option>
                  {modalGroupFilterOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <label htmlFor="expenses-modal-operator" className="sr-only">
                  Filter by operator company
                </label>
                <select
                  id="expenses-modal-operator"
                  value={apartmentExpenseModalOperatorFilter}
                  onChange={(e) => setApartmentExpenseModalOperatorFilter(e.target.value)}
                  className="shrink-0 max-w-[12rem] rounded-md border border-gray-700 bg-[#0D1117] px-2 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="all">All companies</option>
                  {modalOperatorFilterOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
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
                  valueFormatted={formatCurrency(expensesModalVisibleTotals.ownerDue)}
                />
                <ModalExpenseFinancialCell
                  label="Invoices:"
                  valueFormatted={formatCurrency(expensesModalVisibleTotals.invoices)}
                />
                <ModalExpenseFinancialCell
                  label="Total Expenses:"
                  valueFormatted={formatCurrency(expensesModalVisibleTotals.totalExpenses)}
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
                    : 'No apartments match your search or filters.'}
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
                      <div className="min-w-0 text-sm">
                        <div className="grid min-w-0 grid-cols-[10rem_10rem_minmax(0,1fr)_7.5rem] items-center gap-x-2 whitespace-nowrap">
                          <span className="truncate text-gray-400" title={block.normalizedGroup}>
                            {block.normalizedGroup}
                          </span>
                          <span className="truncate text-gray-400" title={block.normalizedOperator}>
                            {block.normalizedOperator}
                          </span>
                          <span className="truncate text-gray-300" title={block.adresse || '—'}>
                            {block.adresse || '—'}
                          </span>
                          <span className="truncate text-white" title={block.wohnung || '—'}>
                            {block.wohnung || '—'}
                          </span>
                        </div>
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
                          {block.invoiceGroups.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-500">No invoices for this month.</p>
                          ) : (
                            <ul className="mt-2 space-y-2">
                              {block.invoiceGroups.map((g) => {
                                const composite = expenseInvoiceCompositeKey(block.apartmentId, g.key);
                                const invExpanded = expandedExpenseInvoiceKeys.has(composite);
                                const first = g.items[0];
                                const docTarget = pickExpenseInvoiceDocumentTarget(g.items);
                                const invDateRaw = first.property_expense_documents?.invoice_date ?? first.invoice_date;
                                const invDate = invDateRaw ? String(invDateRaw).slice(0, 10) : '—';
                                const invNum =
                                  first.property_expense_documents?.invoice_number ?? first.invoice_number ?? '—';
                                const vendor = first.vendor ?? first.property_expense_documents?.vendor ?? '—';
                                return (
                                  <li key={g.key} className="overflow-hidden rounded border border-gray-800/80 bg-[#1C1F24] text-xs">
                                    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                                      <button
                                        type="button"
                                        onClick={() => toggleExpenseInvoiceExpand(block.apartmentId, g.key)}
                                        className="shrink-0 p-1 text-gray-400 hover:bg-gray-800 hover:text-white rounded"
                                        aria-expanded={invExpanded}
                                        aria-label={invExpanded ? 'Collapse invoice' : 'Expand invoice'}
                                      >
                                        {invExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      </button>
                                      <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-gray-300">
                                        <span className="text-gray-500 whitespace-nowrap">{invDate}</span>
                                        <span className="font-medium text-white">{invNum}</span>
                                        <span className="text-gray-400 min-w-0 truncate max-w-[12rem]" title={vendor}>
                                          {vendor}
                                        </span>
                                        <span className="text-gray-500 truncate max-w-[10rem]" title={block.propertyTitle}>
                                          {block.propertyTitle}
                                        </span>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1">
                                        {docTarget ? (
                                          <>
                                            <button
                                              type="button"
                                              aria-label="Preview document"
                                              title="Preview"
                                              onClick={() => handleViewExpenseDocumentModal(docTarget.storagePath)}
                                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                                            >
                                              <Eye className="h-4 w-4" />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label="Download document"
                                              title="Download"
                                              onClick={() =>
                                                handleDownloadExpenseDocumentModal(docTarget.storagePath, docTarget.fileName)
                                              }
                                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                                            >
                                              <Download className="h-4 w-4" />
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-[10px] text-gray-600 px-1" title="No document attached">
                                            No doc
                                          </span>
                                        )}
                                        <span className="ml-1 font-semibold tabular-nums text-emerald-100">{formatCurrency(g.total)}</span>
                                      </div>
                                    </div>
                                    {invExpanded ? (
                                      <div className="border-t border-gray-800 px-2 pb-2 pt-1">
                                        <table className="w-full text-left text-[11px] border-separate border-spacing-0">
                                          <thead className="text-gray-500">
                                            <tr>
                                              <th className="py-1 pr-2 font-semibold">Category</th>
                                              <th className="py-1 pr-2 font-semibold">Article</th>
                                              <th className="py-1 pr-2 font-semibold">Name</th>
                                              <th className="py-1 pr-2 font-semibold text-right">Qty</th>
                                              <th className="py-1 font-semibold text-right">Unit price</th>
                                            </tr>
                                          </thead>
                                          <tbody className="text-gray-300">
                                            {g.items.map((line) => (
                                              <tr key={line.id} className="border-t border-gray-800/80">
                                                <td className="py-1 pr-2 align-top">{line.property_expense_categories?.name ?? '—'}</td>
                                                <td className="py-1 pr-2 align-top">{line.article ?? '—'}</td>
                                                <td className="py-1 pr-2 align-top">{line.name}</td>
                                                <td className="py-1 pr-2 align-top text-right tabular-nums">{line.quantity}</td>
                                                <td className="py-1 align-top text-right tabular-nums">
                                                  {formatCurrency(Number(line.unit_price) || 0)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : null}
                                  </li>
                                );
                              })}
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

      {performanceModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-8 sm:pt-12 bg-black/70"
          role="presentation"
          onClick={() => setPerformanceModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="performance-modal-title"
            className="relative w-full max-w-[90rem] max-h-[85vh] overflow-y-auto overflow-x-auto rounded-xl border border-gray-800 bg-[#1C1F24] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start gap-3 border-b border-gray-800 pb-4 mb-4 sm:flex-nowrap sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 shrink basis-full sm:max-w-[min(100%,24rem)] sm:basis-auto">
                <h2 id="performance-modal-title" className="text-lg font-semibold text-white">
                  Apartment Performance Breakdown
                </h2>
                <p className="mt-0.5 text-sm text-gray-400">{dashboardMonthContext.monthLabel}</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-[1_1_auto] sm:justify-end">
                <input
                  id="performance-modal-search"
                  type="search"
                  value={performanceModalSearch}
                  onChange={(e) => setPerformanceModalSearch(e.target.value)}
                  placeholder="Search by street..."
                  aria-label="Search apartments"
                  className="min-w-[10rem] max-w-full flex-1 rounded-md border border-gray-700 bg-[#0D1117] px-2.5 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                />
                <label htmlFor="performance-modal-sort" className="sr-only">
                  Sort by street
                </label>
                <select
                  id="performance-modal-sort"
                  value={performanceModalStreetSort}
                  onChange={(e) => setPerformanceModalStreetSort(e.target.value as 'default' | 'asc' | 'desc')}
                  className="shrink-0 rounded-md border border-gray-700 bg-[#0D1117] px-2 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="default">Street (default)</option>
                  <option value="asc">Street A–Z</option>
                  <option value="desc">Street Z–A</option>
                </select>
                <label htmlFor="performance-modal-group" className="sr-only">
                  Filter by apartment group
                </label>
                <select
                  id="performance-modal-group"
                  value={performanceModalGroupFilter}
                  onChange={(e) => setPerformanceModalGroupFilter(e.target.value)}
                  className="shrink-0 max-w-[10rem] rounded-md border border-gray-700 bg-[#0D1117] px-2 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="all">All groups</option>
                  {performanceModalGroupFilterOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <label htmlFor="performance-modal-operator" className="sr-only">
                  Filter by operator company
                </label>
                <select
                  id="performance-modal-operator"
                  value={performanceModalOperatorFilter}
                  onChange={(e) => setPerformanceModalOperatorFilter(e.target.value)}
                  className="shrink-0 max-w-[12rem] rounded-md border border-gray-700 bg-[#0D1117] px-2 py-1.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="all">All companies</option>
                  {performanceModalOperatorFilterOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setPerformanceModalOpen(false)}
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-w-0 rounded-lg border border-gray-800 bg-[#0D1117]/50 p-4 text-sm">
              <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Collected</span>
                  <span className="font-semibold tabular-nums text-white">{formatCurrency(performanceModalVisibleTotals.collected)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Full Capacity Income</span>
                  <span className="font-semibold tabular-nums text-white">{formatCurrency(performanceModalVisibleTotals.plan)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Difference</span>
                  <span className="font-semibold tabular-nums text-white">{formatSignedCurrency(performanceModalVisibleTotals.difference)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">% of Plan Fulfillment</span>
                  <span className="font-semibold tabular-nums text-white">{formatPct(performanceModalVisibleTotals.planFulfillment)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">By apartment</h3>
              {displayedApartmentPerformanceRows.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {apartmentPerformanceModalRows.length === 0
                    ? 'No apartments for this month.'
                    : 'No apartments match your search or filters.'}
                </p>
              ) : null}

              <div
                aria-hidden
                className={`w-full rounded border border-gray-800 bg-[#0D1117]/40 px-2.5 py-1 ${MODAL_PERFORMANCE_BREAKDOWN_GRID}`}
              >
                <span />
                <span className={PERFORMANCE_APT_HEADER_CELL_CLASS}>Group</span>
                <span className={PERFORMANCE_APT_HEADER_CELL_CLASS}>Operator</span>
                <span className={PERFORMANCE_APT_HEADER_CELL_CLASS}>Street</span>
                <span className={PERFORMANCE_APT_HEADER_CELL_CLASS}>Unit</span>
                <span className={`${PERFORMANCE_APT_HEADER_CELL_CLASS} text-right`}>Occupancy %</span>
                <span className={`${PERFORMANCE_APT_HEADER_CELL_CLASS} text-right`}>Collected</span>
                <span className={`${PERFORMANCE_APT_HEADER_CELL_CLASS} text-right`}>Plan</span>
                <span className={`${PERFORMANCE_APT_HEADER_CELL_CLASS} text-right`}>Difference</span>
                <span className={`${PERFORMANCE_APT_HEADER_CELL_CLASS} text-right`}>% Fulfill</span>
              </div>

              {displayedApartmentPerformanceRows.map((row) => {
                const expanded = expandedPerformanceApartments.has(row.apartmentId);
                const contributions = (contributionsByApartmentId as Map<string, any>).get(row.apartmentId) ?? [];
                return (
                  <div key={row.apartmentId} className="rounded-lg border border-gray-800 bg-[#0D1117]/40">
                    <button
                      type="button"
                      onClick={() => togglePerformanceApartmentExpand(row.apartmentId)}
                      className={`w-full px-2.5 py-1.5 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500/40 ${MODAL_PERFORMANCE_BREAKDOWN_GRID}`}
                    >
                      <span className="flex h-full shrink-0 items-center justify-center text-gray-500">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                      <span className={PERFORMANCE_APT_CELL_MUTED_CLASS} title={row.normalizedGroup}>
                        {row.normalizedGroup}
                      </span>
                      <span className={PERFORMANCE_APT_CELL_MUTED_CLASS} title={row.normalizedOperator}>
                        {row.normalizedOperator}
                      </span>
                      <span className={PERFORMANCE_APT_CELL_STREET_CLASS} title={row.adresse || '—'}>
                        {row.adresse || '—'}
                      </span>
                      <span className={PERFORMANCE_APT_CELL_UNIT_CLASS} title={row.wohnung || '—'}>
                        {row.wohnung || '—'}
                      </span>
                      <span className={PERFORMANCE_APT_CELL_NUM_CLASS}>{formatPct(row.occupancyPct)}</span>
                      <span className={PERFORMANCE_APT_CELL_NUM_CLASS}>{formatCurrency(row.collected)}</span>
                      <span className={PERFORMANCE_APT_CELL_NUM_CLASS}>{formatCurrency(row.plan)}</span>
                      <span className={PERFORMANCE_APT_CELL_NUM_CLASS}>{formatSignedCurrency(row.difference)}</span>
                      <span className={PERFORMANCE_APT_CELL_NUM_CLASS}>{formatPct(row.planFulfillment)}</span>
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-gray-800 px-3 pb-4 pt-3 pl-10">
                        {contributions.length === 0 ? (
                          <p className="text-sm text-gray-500">No confirmed paid proformas contribute to this month.</p>
                        ) : (
                          <div className="space-y-2">
                            {contributions.map((c: any) => {
                              const proformaId = String(c.proforma?.id ?? '');
                              const bundleState = proformaDocBundlesById[proformaId] ?? { status: 'idle' as const };
                              const overlapNights = Array.isArray(c.overlapDays) ? c.overlapDays.length : 0;

                              return (
                                <div key={proformaId} className="rounded border border-gray-800/80 bg-[#1C1F24] px-3 py-2">
                                  <div className="overflow-x-auto">
                                    <div className={PERFORMANCE_CONTRIB_ROW_CLASS}>
                                      <span className={PERFORMANCE_CONTRIB_META_CLASS} title="Interval">
                                        {c.interval?.startIso ?? '—'} → {c.interval?.endIsoExclusive ?? '—'}
                                      </span>
                                      {bundleState.status === 'loaded' && bundleState.bundle.proformaFileUrl ? (
                                        <a
                                          href={bundleState.bundle.proformaFileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={PERFORMANCE_CONTRIB_LINK_CLASS}
                                          title="Open proforma PDF"
                                        >
                                          {c.proforma?.invoiceNumber ?? proformaId}
                                        </a>
                                      ) : (
                                        <span className={PERFORMANCE_CONTRIB_META_CLASS} title="Proforma">
                                          {c.proforma?.invoiceNumber ?? proformaId}
                                        </span>
                                      )}
                                      <span className={PERFORMANCE_CONTRIB_META_CLASS} title="Client">
                                        {c.proforma?.clientName ?? '—'}
                                      </span>
                                      <span className={PERFORMANCE_CONTRIB_META_CLASS} title="Nights">
                                        {overlapNights}n
                                      </span>
                                      <span className={PERFORMANCE_CONTRIB_META_CLASS} title="Nightly net">
                                        {formatCurrency(Number(c.nightlyNet) || 0)}
                                      </span>

                                      {/* Proforma doc slot */}
                                      {bundleState.status === 'loaded' ? (
                                        bundleState.bundle.proformaFileUrl ? (
                                          <a
                                            href={bundleState.bundle.proformaFileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={PERFORMANCE_CONTRIB_LINK_CLASS}
                                            title={fileNameFromUrl(bundleState.bundle.proformaFileUrl) ?? 'Proforma'}
                                          >
                                            {fileNameFromUrl(bundleState.bundle.proformaFileUrl) ?? 'Proforma'}
                                          </a>
                                        ) : (
                                          <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Proforma</span>
                                        )
                                      ) : bundleState.status === 'loading' ? (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Loading…</span>
                                      ) : bundleState.status === 'error' ? (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Fetch failed</span>
                                      ) : (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>—</span>
                                      )}

                                      {/* Invoice doc(s) slot */}
                                      {bundleState.status === 'loaded' ? (
                                        bundleState.bundle.invoices.length === 0 ? (
                                          <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>No invoices</span>
                                        ) : (
                                          <span className="min-w-0 truncate whitespace-nowrap">
                                            {bundleState.bundle.invoices.map((inv, idx) => {
                                              const label = inv.invoiceNumber || fileNameFromUrl(inv.fileUrl) || 'Invoice';
                                              const sep = idx === 0 ? '' : ', ';
                                              return inv.fileUrl ? (
                                                <span key={inv.id}>
                                                  {sep}
                                                  <a
                                                    href={inv.fileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={PERFORMANCE_CONTRIB_LINK_CLASS}
                                                    title={label}
                                                  >
                                                    {label}
                                                  </a>
                                                </span>
                                              ) : (
                                                <span key={inv.id} className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS} title={label}>
                                                  {sep}
                                                  {label}
                                                </span>
                                              );
                                            })}
                                          </span>
                                        )
                                      ) : bundleState.status === 'loading' ? (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Loading…</span>
                                      ) : bundleState.status === 'error' ? (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Fetch failed</span>
                                      ) : (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>—</span>
                                      )}

                                      {/* Payment proof doc(s) slot */}
                                      {bundleState.status === 'loaded' ? (
                                        bundleState.bundle.invoices.length === 0 ? (
                                          <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>—</span>
                                        ) : !bundleState.bundle.hasAnyProofs ? (
                                          <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Invoices present, no payment proofs</span>
                                        ) : (
                                          <span className="min-w-0 truncate whitespace-nowrap">
                                            {bundleState.bundle.invoices
                                              .flatMap((inv) => bundleState.bundle.proofsByInvoiceId[inv.id] ?? [])
                                              .map((p, idx) => {
                                                const label = p.fileName ?? 'Payment Proof';
                                                const sep = idx === 0 ? '' : ', ';
                                                return (
                                                  <span key={p.id}>
                                                    {sep}
                                                    <a
                                                      href={p.href}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className={PERFORMANCE_CONTRIB_LINK_CLASS}
                                                      title={label}
                                                    >
                                                      {label}
                                                    </a>
                                                  </span>
                                                );
                                              })}
                                          </span>
                                        )
                                      ) : bundleState.status === 'loading' ? (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Loading…</span>
                                      ) : bundleState.status === 'error' ? (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>Fetch failed</span>
                                      ) : (
                                        <span className={PERFORMANCE_CONTRIB_DOC_PLACEHOLDER_CLASS}>—</span>
                                      )}

                                      <span className="text-right tabular-nums text-[11px] font-semibold leading-tight text-emerald-100" title="Allocated (month)">
                                        {formatCurrency(Number(c.allocatedNetForMonth) || 0)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
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
