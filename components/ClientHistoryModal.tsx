import React, { useMemo, useState, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin } from 'lucide-react';
import type { Lead, Booking, InvoiceData, ReservationData, Property, CreateBookingFormData } from '../types';
import { buildClientHistoryForLead, type ClientHistoryContext, type ClientHistory } from '../utils/clientHistory';
import { getPropertyDisplayLabel } from '../utils/formatPropertyAddress';
import CreateBookingModal from './CreateBookingModal';

export interface ClientHistoryModalProps {
  lead: Lead;
  onClose: () => void;
  context: ClientHistoryContext;
  onCreateOffer?: () => void;
  onCreateBooking?: (data: CreateBookingFormData) => Promise<void> | void;
}

function formatDateEU(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatCurrency(amount: number): string {
  return `${Number(amount).toFixed(2).replace('.', ',')} €`;
}

function getPropertyDisplayLabelForTable(propertyId: string | undefined, properties: Property[]): string {
  if (!propertyId) return '—';
  const p = properties.find((x) => String(x.id) === String(propertyId));
  if (!p) return `#${String(propertyId).slice(0, 8)}`;
  return getPropertyDisplayLabel(p, { maxAddressChars: 50 });
}

type TabId = 'overview' | 'rental' | 'financials' | 'offers' | 'activity';

const ClientHistoryModal: React.FC<ClientHistoryModalProps> = ({ lead, onClose, context, onCreateOffer, onCreateBooking }) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showCreateBookingModal, setShowCreateBookingModal] = useState(false);

  const history = useMemo(() => buildClientHistoryForLead(lead, context), [lead, context]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'rental', label: 'Rental History' },
    { id: 'financials', label: 'Financials' },
    { id: 'offers', label: 'Offers & Requests' },
    { id: 'activity', label: 'Activity / Notes' },
  ];

  const { properties } = context;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#23262b] shrink-0">
          <h2 className="text-xl font-bold text-white">Client History</h2>
          <div className="flex items-center gap-2">
            {onCreateOffer != null && (
              <button
                type="button"
                onClick={onCreateOffer}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50 transition-colors"
              >
                Create Offer
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateBookingModal(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-emerald-600 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              Create Booking
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 bg-[#1C1F24] px-4 gap-1 shrink-0">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === id ? 'text-emerald-500 font-bold bg-emerald-500/10' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {showCreateBookingModal && (
          <CreateBookingModal
            lead={lead}
            properties={context.properties}
            onClose={() => setShowCreateBookingModal(false)}
            onSave={onCreateBooking ?? undefined}
          />
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-[#0D1117]">
          {activeTab === 'overview' && (
            <OverviewTab history={history} properties={properties} formatDateEU={formatDateEU} formatCurrency={formatCurrency} />
          )}
          {activeTab === 'rental' && (
            <RentalTab history={history} properties={properties} formatDateEU={formatDateEU} getPropertyName={getPropertyDisplayLabelForTable} />
          )}
          {activeTab === 'financials' && (
            <FinancialsTab history={history} properties={properties} formatDateEU={formatDateEU} formatCurrency={formatCurrency} getPropertyName={getPropertyDisplayLabelForTable} />
          )}
          {activeTab === 'offers' && (
            <OffersTab history={history} properties={properties} formatDateEU={formatDateEU} formatCurrency={formatCurrency} getPropertyName={getPropertyDisplayLabelForTable} />
          )}
          {activeTab === 'activity' && (
            <ActivityTab history={history} formatDateEU={formatDateEU} />
          )}
        </div>
      </div>
    </div>
  );
};

function OverviewTab({
  history,
  properties,
  formatDateEU,
  formatCurrency,
}: {
  history: ClientHistory;
  properties: Property[];
  formatDateEU: (v: string | undefined) => string;
  formatCurrency: (n: number) => string;
}) {
  const { lead, limitedByIdentity, matchedOffers, matchedReservations, matchedBookings, totalGross, totalPaid, totalOpen, depositReceived, depositReturned } = history;
  const totalRentals = matchedReservations.length + matchedBookings.length;

  return (
    <div className="space-y-6">
      {limitedByIdentity && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
          Email and phone are missing; history is limited to this lead.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#1C1F24] border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Contact</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <span className="font-bold text-white">{lead.name}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${lead.type === 'Company' ? 'bg-blue-500/20 text-blue-500' : 'bg-purple-500/20 text-purple-500'}`}>
                {lead.type}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                lead.status === 'Active' ? 'bg-emerald-500/20 text-emerald-500' :
                lead.status === 'Potential' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-gray-500/20 text-gray-500'
              }`}>
                {lead.status}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300"><Mail className="w-4 h-4 text-gray-500" />{lead.email || '—'}</div>
            <div className="flex items-center gap-2 text-sm text-gray-300"><Phone className="w-4 h-4 text-gray-500" />{lead.phone || '—'}</div>
            <div className="flex items-center gap-2 text-sm text-gray-300"><MapPin className="w-4 h-4 text-gray-500" />{lead.address || '—'}</div>
            <div className="text-xs text-gray-500">Created {formatDateEU(lead.createdAt)} · Last contact {lead.lastContactAt ? formatDateEU(lead.lastContactAt) : '—'}</div>
          </div>
        </div>
        <div className="bg-[#1C1F24] border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">Summary</h3>
          <div className="grid grid-cols-2 gap-3">
            <KPI label="Rentals" value={String(totalRentals)} />
            <KPI label="Offers" value={String(history.matchedOffers.length)} />
            <KPI label="Total paid" value={formatCurrency(totalPaid)} />
            <KPI label="Open balance" value={formatCurrency(totalOpen)} />
            <KPI label="Deposit received" value={formatCurrency(depositReceived)} />
            <KPI label="Deposit returned" value={formatCurrency(depositReturned)} />
          </div>
        </div>
      </div>
      {!history.matchedReservations.length && !history.matchedBookings.length && !history.matchedOffers.length && !history.matchedProformas.length && !history.matchedInvoices.length && (
        <p className="text-gray-500 text-sm">No linked rental or financial history found for this contact.</p>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function RentalTab({
  history,
  properties,
  formatDateEU,
  getPropertyName,
}: {
  history: ClientHistory;
  properties: Property[];
  formatDateEU: (v: string | undefined) => string;
  getPropertyName: (id: string | undefined, props: Property[]) => string;
}) {
  const rows: Array<{ id: string; propertyId?: string; start: string; end: string; status: string; source: string; guest?: string }> = [];
  history.matchedReservations.forEach((r) => {
    const res = r as ReservationData & { startDate?: string; endDate?: string };
    const start = res.start ?? res.startDate ?? '';
    const end = res.end ?? res.endDate ?? '';
    rows.push({
      id: String((r as { id?: string }).id ?? (r as Booking).id),
      propertyId: res.propertyId ?? (r as Booking).roomId,
      start,
      end,
      status: String(res.status ?? ''),
      source: 'Reservation',
      guest: res.guest,
    });
  });
  history.matchedBookings.forEach((b) => {
    rows.push({
      id: String(b.id),
      propertyId: b.propertyId ?? b.roomId,
      start: b.start,
      end: b.end,
      status: String(b.status ?? ''),
      source: 'Booking',
      guest: b.guest,
    });
  });
  rows.sort((a, b) => (b.start > a.start ? 1 : b.start < a.start ? -1 : 0));

  if (rows.length === 0) {
    return <p className="text-gray-500 text-sm">No linked rental or financial history found for this contact.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
          <tr>
            <th className="p-3">Property</th>
            <th className="p-3">Check-in</th>
            <th className="p-3">Check-out</th>
            <th className="p-3">Status</th>
            <th className="p-3">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-[#16181D]">
              <td className="p-3 font-medium text-white">{getPropertyName(row.propertyId, properties)}</td>
              <td className="p-3 text-gray-300">{formatDateEU(row.start)}</td>
              <td className="p-3 text-gray-300">{formatDateEU(row.end)}</td>
              <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">{row.status}</span></td>
              <td className="p-3 text-gray-400">{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinancialsTab({
  history,
  properties,
  formatDateEU,
  formatCurrency,
  getPropertyName,
}: {
  history: ClientHistory;
  properties: Property[];
  formatDateEU: (v: string | undefined) => string;
  formatCurrency: (n: number) => string;
  getPropertyName: (id: string | undefined, props: Property[]) => string;
}) {
  const { matchedProformas, matchedInvoices, totalGross, totalPaid, totalOpen, depositReceived, depositReturned } = history;
  const all = [...matchedProformas, ...matchedInvoices].sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KPI label="Total gross" value={formatCurrency(totalGross)} />
        <KPI label="Total paid" value={formatCurrency(totalPaid)} />
        <KPI label="Total open" value={formatCurrency(totalOpen)} />
        <KPI label="Deposit received" value={formatCurrency(depositReceived)} />
        <KPI label="Deposit returned" value={formatCurrency(depositReturned)} />
      </div>
      {all.length === 0 ? (
        <p className="text-gray-500 text-sm">No linked rental or financial history found for this contact.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
              <tr>
                <th className="p-3">Number</th>
                <th className="p-3">Property</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Gross</th>
                <th className="p-3">Paid</th>
                <th className="p-3">Deposit returned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {all.map((inv) => {
                let propId: string | undefined;
                if (inv.offerId) propId = history.matchedOffers.find((o) => String(o.id) === String(inv.offerId))?.propertyId;
                if (!propId && inv.reservationId) {
                  const res = history.matchedReservations.find((r) => String((r as { id?: string }).id ?? (r as Booking).id) === String(inv.reservationId));
                  propId = res?.propertyId ?? (res as Booking)?.roomId;
                }
                if (!propId && inv.bookingId) {
                  const book = history.matchedBookings.find((b) => String(b.id) === String(inv.bookingId));
                  propId = book?.propertyId ?? book?.roomId;
                }
                return (
                  <tr key={inv.id} className="hover:bg-[#16181D]">
                    <td className="p-3 font-mono text-gray-300">{inv.invoiceNumber ?? '—'}</td>
                    <td className="p-3 text-gray-300">{getPropertyName(propId, properties)}</td>
                    <td className="p-3 text-gray-300">{formatDateEU(inv.date)}</td>
                    <td className="p-3 text-right text-white">{formatCurrency(inv.totalGross ?? 0)}</td>
                    <td className="p-3">{inv.status === 'Paid' ? <span className="text-emerald-400">Yes</span> : <span className="text-gray-500">No</span>}</td>
                    <td className="p-3">{inv.kautionStatus === 'returned' ? <span className="text-emerald-400">Yes</span> : <span className="text-gray-500">No</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OffersTab({
  history,
  properties,
  formatDateEU,
  formatCurrency,
  getPropertyName,
}: {
  history: ClientHistory;
  properties: Property[];
  formatDateEU: (v: string | undefined) => string;
  formatCurrency: (n: number) => string;
  getPropertyName: (id: string | undefined, props: Property[]) => string;
}) {
  const offers = [...history.matchedOffers].sort((a, b) => {
    const da = a.createdAt ?? '';
    const db = b.createdAt ?? '';
    return db < da ? 1 : db > da ? -1 : 0;
  });

  if (offers.length === 0 && history.matchedLeadIds.size <= 1) {
    return <p className="text-gray-500 text-sm">No offers or requests found for this contact.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-400">Offers</h3>
      {offers.length === 0 ? (
        <p className="text-gray-500 text-sm">No offers linked to this contact.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#23262b] text-gray-400 border-b border-gray-700">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Property</th>
                <th className="p-3">Offer No.</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {offers.map((o) => (
                <tr key={o.id} className="hover:bg-[#16181D]">
                  <td className="p-3 text-gray-300">{formatDateEU(o.createdAt)}</td>
                  <td className="p-3 text-white">{getPropertyName(o.propertyId, properties)}</td>
                  <td className="p-3 font-mono text-gray-300">{o.offerNo ?? o.id}</td>
                  <td className="p-3 text-gray-300">{o.price ?? (o.grossTotal != null ? formatCurrency(o.grossTotal) : '—')}</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActivityTab({ history, formatDateEU }: { history: ClientHistory; formatDateEU: (v: string | undefined) => string }) {
  const { activity, lead } = history;

  return (
    <div className="space-y-4">
      {lead.notes && (
        <div className="bg-[#1C1F24] border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 mb-2">Notes</h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{lead.notes}</p>
        </div>
      )}
      <h3 className="text-sm font-bold text-gray-400">Timeline</h3>
      {activity.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity recorded.</p>
      ) : (
        <ul className="space-y-2">
          {activity.map((ev, i) => (
            <li key={`${ev.type}-${ev.date}-${i}`} className="flex items-center gap-3 text-sm">
              <span className="text-gray-500 shrink-0">{formatDateEU(ev.date)}</span>
              <span className="text-white">{ev.type}</span>
              {ev.label && <span className="text-gray-400 font-mono">{ev.label}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ClientHistoryModal;
