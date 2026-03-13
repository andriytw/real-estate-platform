/**
 * Shared stats section: BookingStatsTiles (Check-ins, Check-outs, Cleanings, Reminders)
 * + Proforma dashboard tiles (Paid, Open, Kaution Liability) with month/Operating Company filters.
 * Used by Sales Department → Dashboard only.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Booking, CalendarEvent, Property } from '../types';
import { ReservationData, OfferData, InvoiceData, PaymentProof } from '../types';
import BookingStatsTiles from './BookingStatsTiles';
import BookingListModal from './BookingListModal';
import { useSalesAllBookings } from '../hooks/useSalesAllBookings';
import { paymentProofsService } from '../services/supabaseService';
import { X } from 'lucide-react';

export interface SalesStatsSectionProps {
  reservations: ReservationData[];
  offers: OfferData[];
  confirmedBookings: Booking[];
  adminEvents: CalendarEvent[];
  properties: Property[];
  invoices: InvoiceData[];
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

const SalesStatsSection: React.FC<SalesStatsSectionProps> = ({
  reservations,
  offers,
  confirmedBookings,
  adminEvents,
  properties,
  invoices,
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
  const [proofsByInvoiceId, setProofsByInvoiceId] = useState<Record<string, PaymentProof[]>>({});

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

  const tileClass = 'rounded-lg border border-gray-700 bg-[#1C1F24] p-4 min-w-[180px]';
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

        {/* Proforma tiles */}
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => setIsPaidModalOpen(true)}
            className={`${tileClass} text-left hover:border-emerald-600/50 hover:bg-[#23262b] transition-colors cursor-pointer`}
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
            className={`${tileClass} text-left hover:border-emerald-600/50 hover:bg-[#23262b] transition-colors cursor-pointer`}
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
            className={`${tileClass} text-left hover:border-emerald-600/50 hover:bg-[#23262b] transition-colors cursor-pointer`}
          >
            <div className={tileTitleClass}>Kaution Liability</div>
            <div className={amountClass}>€{kautionLiabilityTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className={countClass}>{kautionLiabilityProformas.length} open deposits</div>
          </button>
        </div>

        {/* Booking stats tiles (existing) */}
        <div className="pt-2">
          <BookingStatsTiles
            reservations={allBookings}
            confirmedBookings={confirmedBookings}
            adminEvents={adminEvents}
            properties={properties}
            initialDate={TODAY}
            onTileClick={handleStatsTileClick}
          />
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

      {/* Paid Proformas detail modal — same shell as Kaution Liability */}
      {isPaidModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1C1F24] rounded-xl border border-gray-700 shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Paid Proformas</h3>
              <button
                type="button"
                onClick={() => setIsPaidModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
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
                  {paidProformas.map((p) => (
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
              {paidProformas.length === 0 && (
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
            <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Open Proformas</h3>
              <button
                type="button"
                onClick={() => setIsOpenModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
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
                  {openProformas.map((p) => (
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
              {openProformas.length === 0 && (
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
            <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Kaution Liability — Open deposits</h3>
              <button
                type="button"
                onClick={() => setIsKautionLiabilityModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
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
                  {kautionLiabilityProformas.map((p) => (
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
              {kautionLiabilityProformas.length === 0 && (
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
