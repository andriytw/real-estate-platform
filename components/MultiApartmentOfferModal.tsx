import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Send, Search, Trash2 } from 'lucide-react';
import {
  Lead,
  MultiApartmentOfferDraft,
  MultiApartmentOfferDraftApartment,
  OfferViewPayload,
  RequestData,
  SelectedApartmentData,
} from '../types';
import { getMarketplaceBaseUrl } from '../utils/marketplaceUrl';
import {
  buildMultiApartmentClientMessage,
  calculateOfferItemTotals,
  calculateOfferNights,
  formatApartmentIdentificationLine,
} from '../utils/salesOfferFlow';

export type MultiApartmentOfferSubmitMode = 'draft' | 'send' | 'directBooking';

interface MultiApartmentOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartments: SelectedApartmentData[];
  leads?: Lead[];
  prefilledRequestData?: Partial<RequestData>;
  onSubmit: (draft: MultiApartmentOfferDraft, mode: MultiApartmentOfferSubmitMode) => Promise<void> | void;
  /** When true, hide offer message section and use single "Create booking" action (calendar direct-booking flow). */
  directBookingMode?: boolean;
  /** When 'view', show read-only content from viewData; apartments and onSubmit are unused. */
  mode?: 'create' | 'view';
  viewData?: OfferViewPayload;
}

/** Fixed brand for all new offers; stored as internalCompany and used in message. */
const OFFER_BRAND = 'Hero Rooms';

function buildInitialApartments(apartments: SelectedApartmentData[]): MultiApartmentOfferDraftApartment[] {
  return apartments.map((apartment) => ({
    ...apartment,
    nightlyPrice: apartment.area && apartment.area > 0 ? Number((apartment.area * 2).toFixed(2)) : 100,
    taxRate: 19,
    kaution: 0,
  }));
}

/** Format YYYY-MM-DD as DD.MM.YYYY for view display. */
function formatDateView(iso: string): string {
  const s = String(iso || '').trim();
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}.${m}.${y}` : s;
}

const MultiApartmentOfferModal: React.FC<MultiApartmentOfferModalProps> = ({
  isOpen,
  onClose,
  apartments,
  leads = [],
  prefilledRequestData,
  onSubmit,
  directBookingMode = false,
  mode = 'create',
  viewData,
}) => {
  const [clientType, setClientType] = useState<'Private' | 'Company'>('Private');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [selectedApartments, setSelectedApartments] = useState<MultiApartmentOfferDraftApartment[]>([]);
  const [clientMessage, setClientMessage] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [messageDirty, setMessageDirty] = useState(false);
  const [includeTotalInEmail, setIncludeTotalInEmail] = useState(true);
  const [savingMode, setSavingMode] = useState<MultiApartmentOfferSubmitMode | null>(null);
  /** When user selects a lead from dropdown, store id for draft.shared.selectedLeadId. */
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  /** Per-apartment string values for Price/night, Tax %, Kaution. Empty string = valid during editing; never force 0 into field. */
  const [editableApartmentStrings, setEditableApartmentStrings] = useState<Record<string, { nightlyPrice?: string; taxRate?: string; kaution?: string }>>({});

  useEffect(() => {
    if (!isOpen) return;
    setClientType(prefilledRequestData?.companyName ? 'Company' : 'Private');
    setFirstName(prefilledRequestData?.firstName || '');
    setLastName(prefilledRequestData?.lastName || '');
    setCompanyName(prefilledRequestData?.companyName || '');
    setAddress('');
    setPhone(prefilledRequestData?.phone || '');
    setEmail(prefilledRequestData?.email || '');
    setCheckIn(prefilledRequestData?.startDate || '');
    setCheckOut(prefilledRequestData?.endDate || '');
    setSelectedApartments(buildInitialApartments(apartments));
    setLeadSearch('');
    setShowLeadDropdown(false);
    setMessageDirty(false);
    setSelectedLeadId(null);
    setEditableApartmentStrings({});
  }, [isOpen, apartments, prefilledRequestData]);

  const nights = useMemo(() => calculateOfferNights(checkIn, checkOut), [checkIn, checkOut]);

  /** Numeric value for calculations only; empty/invalid string → 0. Does not write back to state. */
  const getNumericNightlyPrice = (apartment: MultiApartmentOfferDraftApartment): number => {
    const s = editableApartmentStrings[apartment.propertyId]?.nightlyPrice;
    if (s === undefined) return Number.isFinite(apartment.nightlyPrice) ? apartment.nightlyPrice : 0;
    if (s === '') return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const getNumericTaxRate = (apartment: MultiApartmentOfferDraftApartment): number => {
    const s = editableApartmentStrings[apartment.propertyId]?.taxRate;
    if (s === undefined) return Number.isFinite(apartment.taxRate) ? apartment.taxRate : 0;
    if (s === '') return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const getNumericKaution = (apartment: MultiApartmentOfferDraftApartment): number => {
    const s = editableApartmentStrings[apartment.propertyId]?.kaution;
    if (s === undefined) return Number.isFinite(apartment.kaution) ? (apartment.kaution ?? 0) : 0;
    if (s === '') return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  const totals = useMemo(() => {
    return selectedApartments.reduce(
      (acc, apartment) => {
        const nightly = getNumericNightlyPrice(apartment);
        const tax = getNumericTaxRate(apartment);
        const kautionVal = getNumericKaution(apartment);
        const row = calculateOfferItemTotals(nightly, tax, nights, kautionVal);
        acc.net += row.netTotal;
        acc.vat += row.vatAmount;
        acc.kaution += kautionVal;
        acc.gross += row.grossTotal;
        return acc;
      },
      { net: 0, vat: 0, kaution: 0, gross: 0 }
    );
  }, [selectedApartments, nights, editableApartmentStrings]);

  useEffect(() => {
    if (!isOpen || messageDirty) return;
    const clientLabel =
      clientType === 'Company'
        ? companyName
        : `${firstName} ${lastName}`.trim();
    const apartmentsWithLiveNumbers = selectedApartments.map((a) => ({
      ...a,
      nightlyPrice: getNumericNightlyPrice(a),
      taxRate: getNumericTaxRate(a),
      kaution: getNumericKaution(a),
    }));
    setClientMessage(
      buildMultiApartmentClientMessage({
        clientLabel,
        internalCompany: OFFER_BRAND,
        checkIn,
        checkOut,
        apartments: apartmentsWithLiveNumbers,
        marketplaceBaseUrl: getMarketplaceBaseUrl(),
        showTotal: includeTotalInEmail,
        combinedTotals: totals,
      })
    );
  }, [isOpen, messageDirty, clientType, companyName, firstName, lastName, checkIn, checkOut, selectedApartments, includeTotalInEmail, totals, editableApartmentStrings]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((lead) => {
        const name = (lead.name || '').toLowerCase();
        const email = (lead.email || '').toLowerCase();
        const phone = (lead.phone || '').toLowerCase();
        const contactPerson = (lead.contactPerson || '').toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q) || contactPerson.includes(q);
      })
      .slice(0, 6);
  }, [leadSearch, leads]);

  if (!isOpen) return null;

  if (mode === 'view' && viewData) {
    const { shared, apartments: viewApartments, offerNo, status } = viewData;
    const viewNights = calculateOfferNights(shared.checkIn, shared.checkOut);
    const viewTotals = viewApartments.reduce(
      (acc, a) => {
        acc.net += a.netTotal;
        acc.vat += a.vatTotal;
        acc.kaution += a.kaution ?? 0;
        acc.gross += a.grossTotal;
        return acc;
      },
      { net: 0, vat: 0, kaution: 0, gross: 0 }
    );
    return (
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-[#1C1F24] w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-xl border border-gray-700 shadow-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 bg-[#23262b] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Unified Multi-Apartment Offer</h2>
              <p className="text-xs text-gray-400">
                {offerNo ? `Offer ${offerNo}` : ''}{status ? ` · ${status}` : ''} · {viewApartments.length} apartment{viewApartments.length === 1 ? '' : 's'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-[#111315] border border-gray-800 rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Shared customer / contact</h3>
                <div className="space-y-1.5 text-sm text-white">
                  {shared.clientType != null ? (
                    <p><span className="text-gray-400">Type: </span>{shared.clientType}</p>
                  ) : null}
                  <p>{shared.clientName || '—'}</p>
                  {shared.email ? <p><span className="text-gray-400">Email: </span>{shared.email}</p> : null}
                  {shared.phone ? <p><span className="text-gray-400">Phone: </span>{shared.phone}</p> : null}
                  {shared.address ? <p><span className="text-gray-400">Address: </span>{shared.address}</p> : null}
                </div>
              </section>

              <section className="bg-[#111315] border border-gray-800 rounded-lg p-3 space-y-2">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Shared dates</h3>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-400">Check-in:</span>
                  <span className="text-white">{formatDateView(shared.checkIn) || '—'}</span>
                  <span className="text-gray-400 ml-2">Check-out:</span>
                  <span className="text-white">{formatDateView(shared.checkOut) || '—'}</span>
                  <span className="text-gray-400 ml-2">Nights: <span className="text-white">{viewNights}</span></span>
                </div>
              </section>
            </div>

            <section className="bg-[#111315] border border-gray-800 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Apartment pricing and financials</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="py-1.5 pr-2 font-medium">Address</th>
                      <th className="py-1.5 px-2 font-medium w-24">Price / night</th>
                      <th className="py-1.5 px-2 font-medium w-16">Tax %</th>
                      <th className="py-1.5 px-2 font-medium w-14">Nights</th>
                      <th className="py-1.5 px-2 font-medium w-20">Net</th>
                      <th className="py-1.5 px-2 font-medium w-20">VAT</th>
                      <th className="py-1.5 px-2 font-medium w-20">Kaution</th>
                      <th className="py-1.5 px-2 font-medium w-20">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewApartments.map((apt) => (
                      <tr key={apt.propertyId} className="border-b border-gray-800/80">
                        <td className="py-1.5 pr-2 text-white truncate max-w-[200px]" title={apt.addressLine}>
                          {apt.addressLine}
                          {apt.marketplaceUrl ? (
                            <div className="text-xs mt-0.5">
                              <a href={apt.marketplaceUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">View apartment</a>
                            </div>
                          ) : null}
                        </td>
                        <td className="py-1.5 px-2 text-white">{apt.nightlyPrice.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-white">{apt.taxRate.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-gray-300">{apt.nights}</td>
                        <td className="py-1.5 px-2 text-white">{apt.netTotal.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-white">{apt.vatTotal.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-white">{(apt.kaution ?? 0).toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-emerald-300 font-medium">{apt.grossTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3 pt-1.5 text-sm">
                <span className="text-gray-400">Net total: <span className="text-white">{viewTotals.net.toFixed(2)} EUR</span></span>
                <span className="text-gray-400">VAT total: <span className="text-white">{viewTotals.vat.toFixed(2)} EUR</span></span>
                <span className="text-gray-400">Kaution total: <span className="text-white">{viewTotals.kaution.toFixed(2)} EUR</span></span>
                <span className="text-gray-400">Gross total: <span className="text-emerald-300 font-semibold">{viewTotals.gross.toFixed(2)} EUR</span></span>
              </div>
            </section>

            <section className="bg-[#111315] border border-gray-800 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide mb-2">Offer communication</h3>
              <div className="flex gap-3 items-stretch">
                <div className="min-w-[160px] shrink-0">
                  <p className="text-sm text-gray-400">Internal company</p>
                  <p className="text-sm text-white">{shared.internalCompany || '—'}</p>
                </div>
                <div className="flex-1 min-h-[120px]">
                  <p className="text-sm text-gray-400 mb-1">Message</p>
                  <pre className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white whitespace-pre-wrap font-sans overflow-x-auto">
                    {shared.clientMessage ?? '—'}
                  </pre>
                </div>
              </div>
            </section>
          </div>

          <div className="px-4 py-3 border-t border-gray-800 bg-[#23262b] flex justify-between items-center">
            <div className="text-xs text-gray-400">
              {viewApartments.length} apartment{viewApartments.length === 1 ? '' : 's'} · {viewNights} nights
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const removeApartment = (propertyId: string) => {
    setSelectedApartments((prev) => prev.filter((apartment) => apartment.propertyId !== propertyId));
  };

  const updateApartment = (propertyId: string, patch: Partial<MultiApartmentOfferDraftApartment>) => {
    setSelectedApartments((prev) =>
      prev.map((apartment) =>
        apartment.propertyId === propertyId ? { ...apartment, ...patch } : apartment
      )
    );
  };

  const applyLead = (lead: Lead) => {
    if (lead.type === 'Company') {
      setClientType('Company');
      setCompanyName(lead.name);
      setFirstName('');
      setLastName('');
    } else {
      const parts = lead.name.split(' ');
      setClientType('Private');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' '));
      setCompanyName('');
    }
    setEmail(lead.email || '');
    setPhone(lead.phone || '');
    setAddress(lead.address || '');
    setLeadSearch(lead.name);
    setShowLeadDropdown(false);
    setSelectedLeadId(lead.id);
  };

  const handleSubmit = async (submitMode: MultiApartmentOfferSubmitMode) => {
    if (selectedApartments.length === 0) {
      alert('Виберіть хоча б одну квартиру.');
      return;
    }
    if (!checkIn || !checkOut || nights <= 0) {
      alert('Вкажіть коректні дати заїзду та виїзду.');
      return;
    }
    if (clientType === 'Company' && !companyName.trim()) {
      alert('Вкажіть назву компанії.');
      return;
    }
    if (clientType === 'Private' && !`${firstName} ${lastName}`.trim()) {
      alert('Вкажіть імʼя або прізвище клієнта.');
      return;
    }

    const draft: MultiApartmentOfferDraft = {
      shared: {
        clientType,
        firstName,
        lastName,
        companyName,
        address,
        phone,
        email,
        recipientEmail: email,
        recipientPhone: phone,
        internalCompany: OFFER_BRAND,
        clientMessage,
        checkIn,
        checkOut,
        ...(selectedLeadId ? { selectedLeadId } : {}),
      },
      apartments: selectedApartments.map((apartment) => ({
        ...apartment,
        nightlyPrice: getNumericNightlyPrice(apartment),
        taxRate: getNumericTaxRate(apartment),
        kaution: getNumericKaution(apartment),
      })),
    };

    try {
      setSavingMode(submitMode);
      await onSubmit(draft, submitMode);
      onClose();
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 bg-[#23262b] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              {directBookingMode ? 'Create booking' : 'Unified Multi-Apartment Offer'}
            </h2>
            <p className="text-xs text-gray-400">
              {selectedApartments.length} apartment{selectedApartments.length === 1 ? '' : 's'} selected
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Row 1: two columns - Shared customer/contact (left) + Shared dates (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-[#111315] border border-gray-800 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Shared customer / contact</h3>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  value={leadSearch}
                  onChange={(e) => { setLeadSearch(e.target.value); setShowLeadDropdown(true); }}
                  onFocus={() => setShowLeadDropdown(true)}
                  onBlur={() => setTimeout(() => setShowLeadDropdown(false), 150)}
                  placeholder="Lead lookup"
                  className="w-full pl-8 pr-2 py-1.5 bg-[#161B22] border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                {showLeadDropdown && filteredLeads.length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+2px)] bg-[#0D1117] border border-gray-700 rounded shadow-xl overflow-hidden z-10">
                    {filteredLeads.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => applyLead(lead)}
                        className="w-full text-left px-2 py-1.5 hover:bg-[#161B22] transition-colors border-b border-gray-800 last:border-b-0 text-sm"
                      >
                        <div className="text-white">{lead.name}</div>
                        <div className="text-xs text-gray-500">{lead.email || lead.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setClientType('Private')}
                  className={`px-2 py-1 rounded text-xs ${clientType === 'Private' ? 'bg-emerald-600 text-white' : 'bg-[#161B22] text-gray-300'}`}
                >
                  Private
                </button>
                <button
                  onClick={() => setClientType('Company')}
                  className={`px-2 py-1 rounded text-xs ${clientType === 'Company' ? 'bg-emerald-600 text-white' : 'bg-[#161B22] text-gray-300'}`}
                >
                  Company
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {clientType === 'Company' ? (
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" className="col-span-2 bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                ) : (
                  <>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                  </>
                )}
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className="col-span-2 bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
              </div>
            </section>

            <section className="bg-[#111315] border border-gray-800 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Shared dates</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500" />
                <span className="text-sm text-gray-400">Nights: <span className="text-white">{nights}</span></span>
              </div>
            </section>
          </div>

          {/* Apartment pricing: compact table, one row per apartment */}
          <section className="bg-[#111315] border border-gray-800 rounded-lg p-3 space-y-2">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wide">Apartment pricing and financials</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="py-1.5 pr-2 font-medium">Address</th>
                    <th className="py-1.5 px-2 font-medium w-24">Price / night</th>
                    <th className="py-1.5 px-2 font-medium w-16">Tax %</th>
                    <th className="py-1.5 px-2 font-medium w-14">Nights</th>
                    <th className="py-1.5 px-2 font-medium w-20">Net</th>
                    <th className="py-1.5 px-2 font-medium w-20">VAT</th>
                    <th className="py-1.5 px-2 font-medium w-20">Kaution</th>
                    <th className="py-1.5 px-2 font-medium w-20">Gross</th>
                    {!directBookingMode && <th className="py-1.5 pl-2 w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {selectedApartments.map((apartment) => {
                    const rowTotals = calculateOfferItemTotals(
                      getNumericNightlyPrice(apartment),
                      getNumericTaxRate(apartment),
                      nights,
                      getNumericKaution(apartment)
                    );
                    const id = apartment.propertyId;
                    const strings = editableApartmentStrings[id];
                    const displayNightly = strings?.nightlyPrice ?? (apartment.nightlyPrice === 0 ? '' : String(apartment.nightlyPrice));
                    const displayTaxRate = strings?.taxRate ?? (apartment.taxRate === 0 ? '' : String(apartment.taxRate));
                    const displayKaution = strings?.kaution ?? ((apartment.kaution ?? 0) === 0 ? '' : String(apartment.kaution ?? 0));
                    const inputClass = 'w-full bg-[#161B22] border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums';
                    const showRemove = !directBookingMode || selectedApartments.length > 1;
                    return (
                      <tr key={apartment.propertyId} className="border-b border-gray-800/80">
                        <td className="py-1.5 pr-2 text-white truncate max-w-[200px]" title={formatApartmentIdentificationLine(apartment)}>
                          {formatApartmentIdentificationLine(apartment)}
                        </td>
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={displayNightly}
                            onChange={(e) => setEditableApartmentStrings((prev) => ({ ...prev, [id]: { ...prev[id], nightlyPrice: e.target.value } }))}
                            className={inputClass}
                          />
                        </td>
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={displayTaxRate}
                            onChange={(e) => setEditableApartmentStrings((prev) => ({ ...prev, [id]: { ...prev[id], taxRate: e.target.value } }))}
                            className={inputClass}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-gray-300">{nights}</td>
                        <td className="py-1.5 px-2 text-white">{rowTotals.netTotal.toFixed(2)}</td>
                        <td className="py-1.5 px-2 text-white">{rowTotals.vatAmount.toFixed(2)}</td>
                        <td className="py-1 px-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={displayKaution}
                            onChange={(e) => setEditableApartmentStrings((prev) => ({ ...prev, [id]: { ...prev[id], kaution: e.target.value } }))}
                            className={inputClass}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-emerald-300 font-medium">{rowTotals.grossTotal.toFixed(2)}</td>
                        {showRemove && (
                          <td className="py-1.5 pl-2">
                            <button
                              onClick={() => removeApartment(apartment.propertyId)}
                              className="text-gray-500 hover:text-red-400 transition-colors"
                              title="Прибрати квартиру з оферу"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3 pt-1.5 text-sm">
              <span className="text-gray-400">Net total: <span className="text-white">{totals.net.toFixed(2)} EUR</span></span>
              <span className="text-gray-400">VAT total: <span className="text-white">{totals.vat.toFixed(2)} EUR</span></span>
              <span className="text-gray-400">Kaution total: <span className="text-white">{totals.kaution.toFixed(2)} EUR</span></span>
              <span className="text-gray-400">Gross total: <span className="text-emerald-300 font-semibold">{totals.gross.toFixed(2)} EUR</span></span>
            </div>
          </section>

          {/* Offer communication: hidden in direct-booking mode (calendar flow) */}
          {!directBookingMode && (
            <section className="bg-[#111315] border border-gray-800 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wide mb-2">Offer communication</h3>
              <div className="flex gap-3 items-stretch">
                <div className="flex flex-col gap-2 min-w-[160px] shrink-0">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={includeTotalInEmail}
                      onChange={(e) => setIncludeTotalInEmail(e.target.checked)}
                      className="rounded border-gray-600 bg-[#161B22] text-emerald-500 focus:ring-emerald-500"
                    />
                    Show total
                  </label>
                </div>
                <textarea
                  value={clientMessage}
                  onChange={(e) => {
                    setClientMessage(e.target.value);
                    setMessageDirty(true);
                  }}
                  rows={14}
                  placeholder="Message to client"
                  className="flex-1 min-h-[280px] bg-[#161B22] border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500 resize-y"
                />
              </div>
            </section>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-800 bg-[#23262b] flex justify-between items-center">
          <div className="text-xs text-gray-400">
            {selectedApartments.length} apartment{selectedApartments.length === 1 ? '' : 's'} · {nights} nights
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors text-sm"
            >
              Cancel
            </button>
            {directBookingMode ? (
              <button
                onClick={() => handleSubmit('directBooking')}
                disabled={savingMode !== null}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingMode === 'directBooking' ? 'Saving…' : 'Create booking'}
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleSubmit('draft')}
                  disabled={savingMode !== null}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingMode === 'draft' ? 'Saving…' : 'Save as Offer'}
                </button>
                <button
                  onClick={() => handleSubmit('send')}
                  disabled={savingMode !== null}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {savingMode === 'send' ? 'Saving…' : 'Save & Send'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiApartmentOfferModal;
