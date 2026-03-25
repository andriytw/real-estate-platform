/**
 * Sales Department → Dashboard stats: month/Operating Company filters, then operational tiles
 * (Check-ins, Check-outs, Cleanings, Reminders), then six KPI tiles in one grid row on large screens,
 * then Available Apartments. Used by Sales Department → Dashboard only.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Booking, CalendarEvent, Property, Lead } from '../types';
import { ReservationData, OfferData, InvoiceData, PaymentProof } from '../types';
import BookingStatsTiles from './BookingStatsTiles';
import BookingListModal from './BookingListModal';
import { useSalesAllBookings } from '../hooks/useSalesAllBookings';
import { paymentProofsService } from '../services/supabaseService';
import { getPropertyDisplayLabel } from '../utils/formatPropertyAddress';
import { X } from 'lucide-react';

export interface SalesStatsSectionProps {
  reservations: ReservationData[];
  offers: OfferData[];
  confirmedBookings: Booking[];
  adminEvents: CalendarEvent[];
  properties: Property[];
  invoices: InvoiceData[];
  leads?: Lead[];
  /** When user clicks View in Kaution Liability modal, switch to Payments and optionally expand proforma */
  onViewProforma?: (proformaId: string) => void;
}

function getPropertyIdForProforma(
  proforma: InvoiceData,
  ctx: { offers: OfferData[]; reservations: ReservationData[]; confirmedBookings: Booking[] }
): string | undefined {
  const bid = proforma.bookingId != null ? String(proforma.bookingId) : null;
  if (bid) {
    const b = ctx.confirmedBookings.find((x) => String(x.id) === bid);
    if (b?.propertyId) return String(b.propertyId);
  }
  const rid = proforma.reservationId != null ? String(proforma.reservationId) : null;
  if (rid) {
    const r = ctx.reservations.find((x) => String(x.id) === rid);
    if (r) return String((r as any).propertyId ?? (r as any).roomId ?? '');
  }
  const oid = proforma.offerId ?? (proforma as any).offerIdSource;
  if (oid != null) {
    const o = ctx.offers.find((x) => String(x.id) === String(oid));
    if (o?.propertyId) return String(o.propertyId);
  }
  return undefined;
}

function formatDateEU(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function daysOpenFromDate(fromIso: string): number {
  const from = new Date(fromIso);
  const today = new Date();
  from.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Available Apartments tile: availability = only confirmed bookings (bookings table) block.
 * Counts include only properties that pass the existing active inventory filter (e.g. archivedAt == null).
 * Room count from Property.rooms; null/undefined/invalid excluded from grouped counts (not treated as 1 room).
 * Reservations/offers/unpaid proformas do not block.
 */
function getAvailablePropertiesForDate(
  dateStr: string,
  properties: Property[],
  confirmedBookings: Booking[]
): Property[] {
  const activeProperties = properties.filter((p) => p.archivedAt == null);
  const blockedIds = new Set(
    confirmedBookings
      .filter((b) => b.start <= dateStr && b.end > dateStr)
      .map((b) => String(b.propertyId))
      .filter(Boolean)
  );
  return activeProperties.filter((p) => !blockedIds.has(String(p.id)));
}

/** Room bucket for display. Returns null if rooms is invalid (excluded from grouped counts). */
function getRoomBucket(rooms: number | undefined | null): '1' | '2' | '3' | '4+' | null {
  if (typeof rooms !== 'number' || !Number.isFinite(rooms) || rooms < 1) return null;
  if (rooms === 1) return '1';
  if (rooms === 2) return '2';
  if (rooms === 3) return '3';
  if (rooms >= 4) return '4+';
  return null;
}

type PeriodKind = 'monthly' | 'today' | 'yesterday' | 'date';

/** Returns true if createdAt (ISO string) falls in the given period. Excludes invalid createdAt. */
function dateInPeriod(
  createdAt: string | undefined | null,
  period: PeriodKind,
  customDateStr: string | undefined,
  context: { todayStr: string; yesterdayStr: string; currentMonthStr: string }
): boolean {
  const datePart = createdAt != null && typeof createdAt === 'string' ? createdAt.slice(0, 10) : '';
  if (!datePart || datePart.length < 10) return false;
  const monthPart = datePart.slice(0, 7);
  if (period === 'monthly') return monthPart === context.currentMonthStr;
  if (period === 'today') return datePart === context.todayStr;
  if (period === 'yesterday') return datePart === context.yesterdayStr;
  if (period === 'date') return datePart === (customDateStr || context.todayStr);
  return false;
}

function getPeriodLabel(
  period: PeriodKind,
  customDate: string | undefined,
  ctx: { todayStr: string; yesterdayStr: string; currentMonthStr: string }
): string {
  if (period === 'monthly') return 'This month';
  if (period === 'today') return 'Today';
  if (period === 'yesterday') return 'Yesterday';
  if (period === 'date') return customDate || ctx.todayStr;
  return '';
}

const SalesStatsSection: React.FC<SalesStatsSectionProps> = ({
  reservations,
  offers,
  confirmedBookings,
  adminEvents,
  properties,
  invoices,
  leads = [],
  onViewProforma,
}) => {
  const { allBookings } = useSalesAllBookings({
    reservations,
    offers,
    confirmedBookings,
    invoices,
    adminEvents,
  });

  const TODAY = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const proformas = useMemo(
    () => (invoices || []).filter((i) => i.documentType === 'proforma'),
    [invoices]
  );

  const ctx = useMemo(
    () => ({ offers, reservations, confirmedBookings }),
    [offers, reservations, confirmedBookings]
  );

  const proformasEnriched = useMemo(() => {
    return proformas.map((p) => {
      const offerId = p.offerId || (p as any).offerIdSource;
      const linkedOffer = offerId ? offers.find((o) => String(o.id) === String(offerId)) : undefined;
      const propertyId = getPropertyIdForProforma(p, ctx);
      const linkedProperty = propertyId ? properties.find((prop) => String(prop.id) === String(propertyId)) : undefined;
      const operatingCompany =
        (linkedProperty?.secondCompany?.name ?? '').trim() ||
        (linkedProperty?.tenant?.name ?? '').trim() ||
        '—';
      const kautionAmount = linkedOffer?.kaution != null ? Number(linkedOffer.kaution) : 0;
      const dateYm = p.date ? p.date.slice(0, 7) : '';
      return {
        ...p,
        linkedOffer,
        linkedProperty,
        operatingCompany,
        kautionAmount,
        dateYm,
      };
    }, [proformas, offers, properties, ctx]);
  }, [proformas, offers, properties, ctx]);

  const operatingCompanyOptions = useMemo(() => {
    const set = new Set<string>();
    properties.forEach((prop) => {
      const name =
        (prop.secondCompany?.name ?? '').trim() || (prop.tenant?.name ?? '').trim();
      if (name) set.add(name);
    });
    return ['All', ...Array.from(set).sort()];
  }, [properties]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedOperatingCompany, setSelectedOperatingCompany] = useState<string>('All');
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsModalType, setStatsModalType] = useState<'checkin' | 'checkout' | 'cleaning' | 'reminder'>('checkin');
  const [statsModalItems, setStatsModalItems] = useState<(Booking | CalendarEvent)[]>([]);
  const [statsModalDate, setStatsModalDate] = useState<Date>(new Date());
  const [statsModalTitle, setStatsModalTitle] = useState<string>('');
  const [isPaidModalOpen, setIsPaidModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isKautionLiabilityModalOpen, setIsKautionLiabilityModalOpen] = useState(false);
  const [paidModalOpCo, setPaidModalOpCo] = useState<string>('All companies');
  const [openModalOpCo, setOpenModalOpCo] = useState<string>('All companies');
  const [kautionModalOpCo, setKautionModalOpCo] = useState<string>('All companies');
  const [proofsByInvoiceId, setProofsByInvoiceId] = useState<Record<string, PaymentProof[]>>({});

  const [availabilityDate, setAvailabilityDate] = useState<Date>(() => {
    const d = new Date(TODAY);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [availableApartmentsModalRoom, setAvailableApartmentsModalRoom] = useState<'1' | '2' | '3' | '4+' | null>(null);

  const [requestsPeriod, setRequestsPeriod] = useState<PeriodKind>('monthly');
  const [requestsCustomDate, setRequestsCustomDate] = useState<string | undefined>(undefined);
  const [offersSentPeriod, setOffersSentPeriod] = useState<PeriodKind>('monthly');
  const [offersSentCustomDate, setOffersSentCustomDate] = useState<string | undefined>(undefined);
  const [closedRentalsPeriod, setClosedRentalsPeriod] = useState<PeriodKind>('monthly');
  const [closedRentalsCustomDate, setClosedRentalsCustomDate] = useState<string | undefined>(undefined);

  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [isSentOffersModalOpen, setIsSentOffersModalOpen] = useState(false);
  const [isClosedRentalsModalOpen, setIsClosedRentalsModalOpen] = useState(false);

  const periodDateContext = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(d);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const currentMonthStr = todayStr.slice(0, 7);
    return { todayStr, yesterdayStr, currentMonthStr };
  }, []);

  const opCoMatch = useCallback(
    (opCo: string) => selectedOperatingCompany === 'All' || opCo === selectedOperatingCompany,
    [selectedOperatingCompany]
  );

  const paidProformas = useMemo(() => {
    return proformasEnriched.filter(
      (p) =>
        p.status === 'Paid' &&
        p.dateYm === selectedMonth &&
        opCoMatch(p.operatingCompany)
    );
  }, [proformasEnriched, selectedMonth, opCoMatch]);

  const openProformas = useMemo(() => {
    return proformasEnriched.filter(
      (p) =>
        p.status !== 'Paid' &&
        p.dateYm === selectedMonth &&
        opCoMatch(p.operatingCompany)
    );
  }, [proformasEnriched, selectedMonth, opCoMatch]);

  const kautionLiabilityProformas = useMemo(() => {
    return proformasEnriched.filter(
      (p) =>
        p.status === 'Paid' &&
        p.kautionAmount > 0 &&
        (p.kautionStatus === 'not_returned' || p.kautionStatus === undefined || p.kautionStatus === 'partially_returned') &&
        opCoMatch(p.operatingCompany)
    );
  }, [proformasEnriched, opCoMatch]);

  const kautionLiabilityTotal = useMemo(
    () => kautionLiabilityProformas.reduce((sum, p) => sum + p.kautionAmount, 0),
    [kautionLiabilityProformas]
  );

  const incomingRequestsFiltered = useMemo(() => {
    return leads.filter((lead) =>
      dateInPeriod(lead.createdAt, requestsPeriod, requestsCustomDate, periodDateContext)
    );
  }, [leads, requestsPeriod, requestsCustomDate, periodDateContext]);

  const offersCreatedFiltered = useMemo(() => {
    return offers.filter((o) =>
      dateInPeriod(o.createdAt, offersSentPeriod, offersSentCustomDate, periodDateContext)
    );
  }, [offers, offersSentPeriod, offersSentCustomDate, periodDateContext]);

  const closedRentalsFiltered = useMemo(() => {
    return confirmedBookings.filter((b) =>
      dateInPeriod(b.createdAt, closedRentalsPeriod, closedRentalsCustomDate, periodDateContext)
    );
  }, [confirmedBookings, closedRentalsPeriod, closedRentalsCustomDate, periodDateContext]);

  const availabilityDateStr = useMemo(() => {
    const y = availabilityDate.getFullYear();
    const m = String(availabilityDate.getMonth() + 1).padStart(2, '0');
    const d = String(availabilityDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [availabilityDate]);

  const availablePropertiesOnDate = useMemo(
    () => getAvailablePropertiesForDate(availabilityDateStr, properties, confirmedBookings),
    [availabilityDateStr, properties, confirmedBookings]
  );

  const availableByRoomBucket = useMemo(() => {
    const bucket: Record<'1' | '2' | '3' | '4+', Property[]> = { '1': [], '2': [], '3': [], '4+': [] };
    for (const p of availablePropertiesOnDate) {
      const b = getRoomBucket(p.rooms);
      if (b) bucket[b].push(p);
    }
    return bucket;
  }, [availablePropertiesOnDate]);

  const availableRoomCounts = useMemo(
    () => ({
      '1': availableByRoomBucket['1'].length,
      '2': availableByRoomBucket['2'].length,
      '3': availableByRoomBucket['3'].length,
      '4+': availableByRoomBucket['4+'].length,
    }),
    [availableByRoomBucket]
  );

  const totalAvailable = availablePropertiesOnDate.length;

  const paidModalOpCoOptions = useMemo(() => {
    const set = new Set<string>();
    paidProformas.forEach((p) => { if (p.operatingCompany && p.operatingCompany !== '—') set.add(p.operatingCompany); });
    return ['All companies', ...Array.from(set).sort()];
  }, [paidProformas]);
  const paidModalFiltered = useMemo(
    () => paidModalOpCo === 'All companies' ? paidProformas : paidProformas.filter((p) => p.operatingCompany === paidModalOpCo),
    [paidProformas, paidModalOpCo]
  );

  const openModalOpCoOptions = useMemo(() => {
    const set = new Set<string>();
    openProformas.forEach((p) => { if (p.operatingCompany && p.operatingCompany !== '—') set.add(p.operatingCompany); });
    return ['All companies', ...Array.from(set).sort()];
  }, [openProformas]);
  const openModalFiltered = useMemo(
    () => openModalOpCo === 'All companies' ? openProformas : openProformas.filter((p) => p.operatingCompany === openModalOpCo),
    [openProformas, openModalOpCo]
  );

  const kautionModalOpCoOptions = useMemo(() => {
    const set = new Set<string>();
    kautionLiabilityProformas.forEach((p) => { if (p.operatingCompany && p.operatingCompany !== '—') set.add(p.operatingCompany); });
    return ['All companies', ...Array.from(set).sort()];
  }, [kautionLiabilityProformas]);
  const kautionModalFiltered = useMemo(
    () => kautionModalOpCo === 'All companies' ? kautionLiabilityProformas : kautionLiabilityProformas.filter((p) => p.operatingCompany === kautionModalOpCo),
    [kautionLiabilityProformas, kautionModalOpCo]
  );

  const paidGross = useMemo(() => paidProformas.reduce((s, p) => s + (p.totalGross ?? 0), 0), [paidProformas]);
  const paidNet = useMemo(() => paidProformas.reduce((s, p) => s + (p.totalNet ?? 0), 0), [paidProformas]);
  const paidVat = useMemo(() => paidProformas.reduce((s, p) => s + (p.taxAmount ?? 0), 0), [paidProformas]);
  const paidKaution = useMemo(() => paidProformas.reduce((s, p) => s + p.kautionAmount, 0), [paidProformas]);
  const openGross = useMemo(() => openProformas.reduce((s, p) => s + (p.totalGross ?? 0), 0), [openProformas]);
  const openNet = useMemo(() => openProformas.reduce((s, p) => s + (p.totalNet ?? 0), 0), [openProformas]);
  const openVat = useMemo(() => openProformas.reduce((s, p) => s + (p.taxAmount ?? 0), 0), [openProformas]);
  const openKaution = useMemo(() => openProformas.reduce((s, p) => s + p.kautionAmount, 0), [openProformas]);

  useEffect(() => {
    if (!isKautionLiabilityModalOpen || kautionLiabilityProformas.length === 0) return;
    const ids = kautionLiabilityProformas.map((p) => p.id);
    let cancelled = false;
    const load = async () => {
      const next: Record<string, PaymentProof[]> = {};
      for (const id of ids) {
        if (cancelled) return;
        try {
          const list = await paymentProofsService.getByInvoiceId(id);
          next[id] = list || [];
        } catch {
          next[id] = [];
        }
      }
      if (!cancelled) setProofsByInvoiceId(next);
    };
    load();
    return () => { cancelled = true; };
  }, [isKautionLiabilityModalOpen, kautionLiabilityProformas.map((p) => p.id).join(',')]);

  const getDaysOpen = useCallback(
    (proforma: typeof kautionLiabilityProformas[0]): number => {
      const proofs = proofsByInvoiceId[proforma.id] ?? [];
      const sorted = [...proofs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const proof = sorted.find((pr) => pr.rpcConfirmedAt) || sorted[0];
      const fromIso = proof?.rpcConfirmedAt || proof?.createdAt || proforma.date;
      if (!fromIso) return 0;
      return daysOpenFromDate(fromIso);
    },
    [proofsByInvoiceId]
  );

  const handleStatsTileClick = (
    type: 'checkin' | 'checkout' | 'cleaning' | 'reminder',
    date: Date,
    items: (Booking | CalendarEvent)[]
  ) => {
    const titles = {
      checkin: 'Check-ins',
      checkout: 'Check-outs',
      cleaning: 'Cleanings',
      reminder: 'Reminders (Check-outs in 2 days)',
    };
    setStatsModalType(type);
    setStatsModalItems(items);
    setStatsModalDate(date);
    setStatsModalTitle(titles[type]);
    setIsStatsModalOpen(true);
  };

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = -12; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      out.push(`${y}-${m}`);
    }
    return out.reverse();
  }, []);

  const tileBase = 'rounded-lg border border-gray-700 bg-[#1C1F24] p-4';
  /** KPI row: equal columns on desktop, no min-width so grid can size evenly */
  const kpiTileClass = `${tileBase} min-w-0 min-h-[240px] h-full flex flex-col`;
  /** Available Apartments: same visual shell as before this layout pass */
  const availableApartmentsTileClass = `${tileBase} min-w-[180px]`;
  const kpiInteractive =
    'text-left hover:border-emerald-600/50 hover:bg-[#23262b] transition-colors cursor-pointer';
  const tileTitleClass = 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2';
  const amountClass = 'text-xl font-bold text-white tabular-nums';
  const countClass = 'text-sm text-gray-400 mt-1';

  return (
    <>
      <div className="px-4 py-4 bg-[#111315] border-b border-gray-800 space-y-4">
        {/* Proforma filters */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-400">
            Month
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            Operating Company
            <select
              value={selectedOperatingCompany}
              onChange={(e) => setSelectedOperatingCompany(e.target.value)}
              className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-[160px]"
            >
              {operatingCompanyOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Row 1: operational tiles (check-ins, check-outs, cleanings, reminders) */}
        <div className="w-full">
          <BookingStatsTiles
            reservations={allBookings}
            confirmedBookings={confirmedBookings}
            adminEvents={adminEvents}
            properties={properties}
            initialDate={TODAY}
            onTileClick={handleStatsTileClick}
          />
        </div>

        {/* Row 2: six KPI tiles — equal-width columns on large screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 w-full items-stretch">
          <button
            type="button"
            onClick={() => setIsPaidModalOpen(true)}
            className={`${kpiTileClass} ${kpiInteractive}`}
          >
            <div className={tileTitleClass}>Paid Proformas</div>
            <div className={amountClass}>€{paidGross.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className={countClass}>{paidProformas.length} proformas</div>
            <div className="mt-2 text-xs text-gray-500 space-y-0.5">
              <div>Net €{paidNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })} · VAT €{paidVat.toLocaleString('de-DE', { minimumFractionDigits: 2 })} · Kaution €{paidKaution.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsOpenModalOpen(true)}
            className={`${kpiTileClass} ${kpiInteractive}`}
          >
            <div className={tileTitleClass}>Open Proformas</div>
            <div className={amountClass}>€{openGross.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className={countClass}>{openProformas.length} proformas</div>
            <div className="mt-2 text-xs text-gray-500 space-y-0.5">
              <div>Net €{openNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })} · VAT €{openVat.toLocaleString('de-DE', { minimumFractionDigits: 2 })} · Kaution €{openKaution.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsKautionLiabilityModalOpen(true)}
            className={`${kpiTileClass} ${kpiInteractive}`}
          >
            <div className={tileTitleClass}>Kaution Liability</div>
            <div className={amountClass}>€{kautionLiabilityTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className={countClass}>{kautionLiabilityProformas.length} open deposits</div>
          </button>

          {/* Incoming Requests */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsRequestsModalOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsRequestsModalOpen(true); } }}
            className={`${kpiTileClass} ${kpiInteractive}`}
          >
            <div className={tileTitleClass}>Incoming Requests</div>
            <div className="flex flex-wrap items-center gap-1 mb-1" onClick={(e) => e.stopPropagation()}>
              {(['monthly', 'today', 'yesterday', 'date'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRequestsPeriod(p);
                    if (p === 'date' && requestsCustomDate == null) setRequestsCustomDate(periodDateContext.todayStr);
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${requestsPeriod === p ? 'bg-emerald-600/30 text-emerald-400' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}
                >
                  {p === 'monthly' ? 'Monthly' : p === 'date' ? 'Date' : p === 'today' ? 'Today' : 'Yesterday'}
                </button>
              ))}
              {requestsPeriod === 'date' && (
                <input
                  type="date"
                  value={requestsCustomDate ?? periodDateContext.todayStr}
                  onChange={(e) => { const v = e.target.value; if (v) setRequestsCustomDate(v); }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#161B22] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>
            <div className="text-xs text-gray-500 mb-1">{getPeriodLabel(requestsPeriod, requestsCustomDate, periodDateContext)}</div>
            <div className={amountClass}>{incomingRequestsFiltered.length}</div>
            <div className={countClass}>requests</div>
          </div>

          {/* Offers Created */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsSentOffersModalOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsSentOffersModalOpen(true); } }}
            className={`${kpiTileClass} ${kpiInteractive}`}
          >
            <div className={tileTitleClass}>Offers Created</div>
            <div className="flex flex-wrap items-center gap-1 mb-1" onClick={(e) => e.stopPropagation()}>
              {(['monthly', 'today', 'yesterday', 'date'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOffersSentPeriod(p);
                    if (p === 'date' && offersSentCustomDate == null) setOffersSentCustomDate(periodDateContext.todayStr);
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${offersSentPeriod === p ? 'bg-emerald-600/30 text-emerald-400' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}
                >
                  {p === 'monthly' ? 'Monthly' : p === 'date' ? 'Date' : p === 'today' ? 'Today' : 'Yesterday'}
                </button>
              ))}
              {offersSentPeriod === 'date' && (
                <input
                  type="date"
                  value={offersSentCustomDate ?? periodDateContext.todayStr}
                  onChange={(e) => { const v = e.target.value; if (v) setOffersSentCustomDate(v); }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#161B22] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>
            <div className="text-xs text-gray-500 mb-1">{getPeriodLabel(offersSentPeriod, offersSentCustomDate, periodDateContext)}</div>
            <div className={amountClass}>{offersCreatedFiltered.length}</div>
            <div className={countClass}>offers created</div>
          </div>

          {/* Closed Rentals */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsClosedRentalsModalOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsClosedRentalsModalOpen(true); } }}
            className={`${kpiTileClass} ${kpiInteractive}`}
          >
            <div className={tileTitleClass}>Closed Rentals</div>
            <div className="flex flex-wrap items-center gap-1 mb-1" onClick={(e) => e.stopPropagation()}>
              {(['monthly', 'today', 'yesterday', 'date'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setClosedRentalsPeriod(p);
                    if (p === 'date' && closedRentalsCustomDate == null) setClosedRentalsCustomDate(periodDateContext.todayStr);
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${closedRentalsPeriod === p ? 'bg-emerald-600/30 text-emerald-400' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}
                >
                  {p === 'monthly' ? 'Monthly' : p === 'date' ? 'Date' : p === 'today' ? 'Today' : 'Yesterday'}
                </button>
              ))}
              {closedRentalsPeriod === 'date' && (
                <input
                  type="date"
                  value={closedRentalsCustomDate ?? periodDateContext.todayStr}
                  onChange={(e) => { const v = e.target.value; if (v) setClosedRentalsCustomDate(v); }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-[#161B22] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>
            <div className="text-xs text-gray-500 mb-1">{getPeriodLabel(closedRentalsPeriod, closedRentalsCustomDate, periodDateContext)}</div>
            <div className={amountClass}>{closedRentalsFiltered.length}</div>
            <div className={countClass}>closed rentals</div>
          </div>
        </div>

        {/* Available Apartments — layout unchanged from product perspective; own row below KPIs */}
        <div className="w-full">
          <div className={availableApartmentsTileClass}>
            <div className={tileTitleClass}>Available Apartments</div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">{availabilityDateStr}</span>
              <div className="flex items-center gap-1">
                {(['Today', 'Tomorrow', 'Day+2'] as const).map((label, i) => {
                  const d = new Date(TODAY);
                  d.setDate(d.getDate() + i);
                  const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  const isActive = availabilityDateStr === dStr;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAvailabilityDate(new Date(d))}
                      className={`px-2 py-1 text-xs rounded transition-colors ${isActive ? 'bg-emerald-600/30 text-emerald-400' : 'bg-gray-700/50 text-gray-400 hover:text-white'}`}
                    >
                      {label}
                    </button>
                  );
                })}
                <input
                  type="date"
                  value={availabilityDateStr}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setAvailabilityDate(new Date(v + 'T12:00:00'));
                  }}
                  className="ml-1 bg-[#161B22] border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className={amountClass}>{totalAvailable}</div>
            <div className={countClass}>Total available</div>
            <div className="mt-2 space-y-1 text-sm">
              {(['1', '2', '3', '4+'] as const).map((key) => {
                const count = availableRoomCounts[key];
                const label = key === '4+' ? '4+ rooms' : `${key} room${key === '1' ? '' : 's'}`;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAvailableApartmentsModalRoom(key)}
                    className="w-full text-left px-2 py-1 rounded hover:bg-gray-700/50 text-gray-300 hover:text-white transition-colors flex justify-between"
                  >
                    <span>{label}</span>
                    <span className="tabular-nums font-medium">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <BookingListModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        title={statsModalTitle}
        items={statsModalItems}
        type={statsModalType}
        properties={properties}
        date={statsModalDate}
      />

      {/* Available Apartments by room group — list of properties */}
      {availableApartmentsModalRoom && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Available — {availableApartmentsModalRoom === '4+' ? '4+ rooms' : `${availableApartmentsModalRoom} room${availableApartmentsModalRoom === '1' ? '' : 's'}`} on {availabilityDateStr}
              </h3>
              <button
                type="button"
                onClick={() => setAvailableApartmentsModalRoom(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {availableByRoomBucket[availableApartmentsModalRoom].length === 0 ? (
                <p className="text-gray-500 text-sm">No apartments in this category.</p>
              ) : (
                <ul className="space-y-2">
                  {availableByRoomBucket[availableApartmentsModalRoom].map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-gray-800 last:border-0">
                      <span className="text-white font-medium">{getPropertyDisplayLabel(p)}</span>
                      <span className="text-gray-400 text-sm">{p.rooms} room{p.rooms === 1 ? '' : 's'}</span>
                      {(p.management?.name ?? '').trim() && (
                        <span className="text-gray-500 text-xs w-full mt-0.5">{p.management?.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Incoming Requests list modal */}
      {isRequestsModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Incoming Requests — {getPeriodLabel(requestsPeriod, requestsCustomDate, periodDateContext)}
              </h3>
              <button type="button" onClick={() => setIsRequestsModalOpen(false)} className="p-1.5 text-gray-400 hover:text-white rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {incomingRequestsFiltered.length === 0 ? (
                <p className="text-gray-500 text-sm">No requests in this period.</p>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="p-2">Name</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {incomingRequestsFiltered.map((lead) => (
                      <tr key={lead.id} className="hover:bg-[#16181D]">
                        <td className="p-2 text-white">{lead.name}</td>
                        <td className="p-2 text-gray-300">{lead.email}</td>
                        <td className="p-2 tabular-nums text-gray-300">{lead.createdAt ? formatDateEU(lead.createdAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Offers Created list modal */}
      {isSentOffersModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Offers Created — {getPeriodLabel(offersSentPeriod, offersSentCustomDate, periodDateContext)}
              </h3>
              <button type="button" onClick={() => setIsSentOffersModalOpen(false)} className="p-1.5 text-gray-400 hover:text-white rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {offersCreatedFiltered.length === 0 ? (
                <p className="text-gray-500 text-sm">No offers created in this period.</p>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="p-2">Offer No</th>
                      <th className="p-2">Client</th>
                      <th className="p-2">Dates</th>
                      <th className="p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {offersCreatedFiltered.map((o) => (
                      <tr key={o.id} className="hover:bg-[#16181D]">
                        <td className="p-2 font-mono text-white">{o.offerNo ?? '—'}</td>
                        <td className="p-2 text-gray-300">{o.clientName}</td>
                        <td className="p-2 text-gray-300">{o.dates ?? '—'}</td>
                        <td className="p-2 tabular-nums text-gray-300">{o.createdAt ? formatDateEU(o.createdAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Closed Rentals list modal */}
      {isClosedRentalsModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Closed Rentals — {getPeriodLabel(closedRentalsPeriod, closedRentalsCustomDate, periodDateContext)}
              </h3>
              <button type="button" onClick={() => setIsClosedRentalsModalOpen(false)} className="p-1.5 text-gray-400 hover:text-white rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {closedRentalsFiltered.length === 0 ? (
                <p className="text-gray-500 text-sm">No closed rentals in this period.</p>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="p-2">Guest</th>
                      <th className="p-2">Property / dates</th>
                      <th className="p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {closedRentalsFiltered.map((b) => {
                      const prop = b.propertyId ? properties.find((p) => String(p.id) === String(b.propertyId)) : undefined;
                      const propLabel = prop ? getPropertyDisplayLabel(prop) : (b.unit || String(b.propertyId || '—'));
                      const datesStr = [b.start, b.end].filter(Boolean).join(' – ') || '—';
                      return (
                        <tr key={b.id} className="hover:bg-[#16181D]">
                          <td className="p-2 text-white">{b.guest ?? '—'}</td>
                          <td className="p-2 text-gray-300">{propLabel} · {datesStr}</td>
                          <td className="p-2 tabular-nums text-gray-300">{b.createdAt ? formatDateEU(b.createdAt) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paid Proformas detail modal — same shell as Kaution Liability */}
      {isPaidModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">Paid Proformas</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400 whitespace-nowrap">Operating Company</label>
                <select
                  value={paidModalOpCo}
                  onChange={(e) => setPaidModalOpCo(e.target.value)}
                  className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-[160px]"
                >
                  {paidModalOpCoOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsPaidModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="p-2">Proforma Number</th>
                    <th className="p-2">Operating Company</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Date</th>
                    <th className="p-2 text-right">Net</th>
                    <th className="p-2 text-right">VAT</th>
                    <th className="p-2 text-right">Kaution</th>
                    <th className="p-2 text-right">Gross</th>
                    <th className="p-2 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {paidModalFiltered.map((p) => (
                    <tr key={p.id} className="hover:bg-[#16181D]">
                      <td className="p-2 font-mono text-white">{p.invoiceNumber}</td>
                      <td className="p-2 text-gray-300">{p.operatingCompany}</td>
                      <td className="p-2 text-gray-300">{p.clientName}</td>
                      <td className="p-2 tabular-nums text-gray-300">{formatDateEU(p.date)}</td>
                      <td className="p-2 text-right tabular-nums text-white">€{(p.totalNet ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-300">€{(p.taxAmount ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-300">€{p.kautionAmount.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-white">€{(p.totalGross ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right">
                        {onViewProforma ? (
                          <button
                            type="button"
                            onClick={() => { onViewProforma(p.id); setIsPaidModalOpen(false); }}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {paidModalFiltered.length === 0 && (
                <p className="p-4 text-center text-gray-500">No paid proformas for this period.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Open Proformas detail modal — same shell as Kaution Liability */}
      {isOpenModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">Open Proformas</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400 whitespace-nowrap">Operating Company</label>
                <select
                  value={openModalOpCo}
                  onChange={(e) => setOpenModalOpCo(e.target.value)}
                  className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-[160px]"
                >
                  {openModalOpCoOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsOpenModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="p-2">Proforma Number</th>
                    <th className="p-2">Operating Company</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Date</th>
                    <th className="p-2 text-right">Net</th>
                    <th className="p-2 text-right">VAT</th>
                    <th className="p-2 text-right">Kaution</th>
                    <th className="p-2 text-right">Gross</th>
                    <th className="p-2 text-right">Days Open</th>
                    <th className="p-2 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {openModalFiltered.map((p) => (
                    <tr key={p.id} className="hover:bg-[#16181D]">
                      <td className="p-2 font-mono text-white">{p.invoiceNumber}</td>
                      <td className="p-2 text-gray-300">{p.operatingCompany}</td>
                      <td className="p-2 text-gray-300">{p.clientName}</td>
                      <td className="p-2 tabular-nums text-gray-300">{formatDateEU(p.date)}</td>
                      <td className="p-2 text-right tabular-nums text-white">€{(p.totalNet ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-300">€{(p.taxAmount ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-300">€{p.kautionAmount.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-white">€{(p.totalGross ?? 0).toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-300">{daysOpenFromDate(p.date)} days</td>
                      <td className="p-2 text-right">
                        {onViewProforma ? (
                          <button
                            type="button"
                            onClick={() => { onViewProforma(p.id); setIsOpenModalOpen(false); }}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {openModalFiltered.length === 0 && (
                <p className="p-4 text-center text-gray-500">No open proformas for this period.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Kaution Liability detail modal */}
      {isKautionLiabilityModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">Kaution Liability — Open deposits</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400 whitespace-nowrap">Operating Company</label>
                <select
                  value={kautionModalOpCo}
                  onChange={(e) => setKautionModalOpCo(e.target.value)}
                  className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 min-w-[160px]"
                >
                  {kautionModalOpCoOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsKautionLiabilityModalOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
                  <tr>
                    <th className="p-2">Proforma Number</th>
                    <th className="p-2">Operating Company</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Date</th>
                    <th className="p-2 text-right">Kaution</th>
                    <th className="p-2 text-right">Days Open</th>
                    <th className="p-2">Kaution Status</th>
                    <th className="p-2 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {kautionModalFiltered.map((p) => (
                    <tr key={p.id} className="hover:bg-[#16181D]">
                      <td className="p-2 font-mono text-white">{p.invoiceNumber}</td>
                      <td className="p-2 text-gray-300">{p.operatingCompany}</td>
                      <td className="p-2 text-gray-300">{p.clientName}</td>
                      <td className="p-2 tabular-nums text-gray-300">{formatDateEU(p.date)}</td>
                      <td className="p-2 text-right tabular-nums text-white">€{p.kautionAmount.toFixed(2)}</td>
                      <td className="p-2 text-right tabular-nums text-gray-300">{getDaysOpen(p)} days</td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-400">Not Returned</span>
                      </td>
                      <td className="p-2 text-right">
                        {onViewProforma ? (
                          <button
                            type="button"
                            onClick={() => { onViewProforma(p.id); setIsKautionLiabilityModalOpen(false); }}
                            className="text-emerald-400 hover:text-emerald-300 text-xs font-medium"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kautionModalFiltered.length === 0 && (
                <p className="p-4 text-center text-gray-500">No open deposits.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SalesStatsSection;
