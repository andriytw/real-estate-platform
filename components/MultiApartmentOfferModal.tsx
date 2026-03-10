import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Send, Search, Trash2, Link as LinkIcon } from 'lucide-react';
import { INTERNAL_COMPANIES_DATA } from '../constants';
import {
  Lead,
  MultiApartmentOfferDraft,
  MultiApartmentOfferDraftApartment,
  RequestData,
  SelectedApartmentData,
} from '../types';
import {
  buildMultiApartmentClientMessage,
  calculateOfferItemTotals,
  calculateOfferNights,
  formatApartmentIdentificationLine,
} from '../utils/salesOfferFlow';

interface MultiApartmentOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  apartments: SelectedApartmentData[];
  leads?: Lead[];
  prefilledRequestData?: Partial<RequestData>;
  onSubmit: (draft: MultiApartmentOfferDraft, mode: 'draft' | 'send') => Promise<void> | void;
}

const INTERNAL_COMPANIES = Object.keys(INTERNAL_COMPANIES_DATA);

function buildInitialApartments(apartments: SelectedApartmentData[]): MultiApartmentOfferDraftApartment[] {
  return apartments.map((apartment) => ({
    ...apartment,
    nightlyPrice: apartment.area && apartment.area > 0 ? Number((apartment.area * 2).toFixed(2)) : 100,
    taxRate: 19,
  }));
}

const MultiApartmentOfferModal: React.FC<MultiApartmentOfferModalProps> = ({
  isOpen,
  onClose,
  apartments,
  leads = [],
  prefilledRequestData,
  onSubmit,
}) => {
  const [clientType, setClientType] = useState<'Private' | 'Company'>('Private');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [internalCompany, setInternalCompany] = useState('Sotiso');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [selectedApartments, setSelectedApartments] = useState<MultiApartmentOfferDraftApartment[]>([]);
  const [clientMessage, setClientMessage] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [messageDirty, setMessageDirty] = useState(false);
  const [savingMode, setSavingMode] = useState<'draft' | 'send' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setClientType(prefilledRequestData?.companyName ? 'Company' : 'Private');
    setFirstName(prefilledRequestData?.firstName || '');
    setLastName(prefilledRequestData?.lastName || '');
    setCompanyName(prefilledRequestData?.companyName || '');
    setAddress('');
    setPhone(prefilledRequestData?.phone || '');
    setEmail(prefilledRequestData?.email || '');
    setRecipientEmail(prefilledRequestData?.email || '');
    setRecipientPhone(prefilledRequestData?.phone || '');
    setInternalCompany('Sotiso');
    setCheckIn(prefilledRequestData?.startDate || '');
    setCheckOut(prefilledRequestData?.endDate || '');
    setSelectedApartments(buildInitialApartments(apartments));
    setLeadSearch('');
    setMessageDirty(false);
  }, [isOpen, apartments, prefilledRequestData]);

  const nights = useMemo(() => calculateOfferNights(checkIn, checkOut), [checkIn, checkOut]);

  useEffect(() => {
    if (!isOpen || messageDirty) return;
    const clientLabel =
      clientType === 'Company'
        ? companyName
        : `${firstName} ${lastName}`.trim();
    setClientMessage(
      buildMultiApartmentClientMessage({
        clientLabel,
        internalCompany,
        checkIn,
        checkOut,
        apartments: selectedApartments,
      })
    );
  }, [isOpen, messageDirty, clientType, companyName, firstName, lastName, internalCompany, checkIn, checkOut, selectedApartments]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((lead) =>
        lead.name.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [leadSearch, leads]);

  const totals = useMemo(() => {
    return selectedApartments.reduce(
      (acc, apartment) => {
        const row = calculateOfferItemTotals(apartment.nightlyPrice, apartment.taxRate, nights);
        acc.net += row.netTotal;
        acc.vat += row.vatAmount;
        acc.gross += row.grossTotal;
        return acc;
      },
      { net: 0, vat: 0, gross: 0 }
    );
  }, [selectedApartments, nights]);

  if (!isOpen) return null;

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
    setRecipientEmail(lead.email || '');
    setRecipientPhone(lead.phone || '');
    setAddress(lead.address || '');
    setLeadSearch(lead.name);
  };

  const handleSubmit = async (mode: 'draft' | 'send') => {
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
        recipientEmail,
        recipientPhone,
        internalCompany,
        clientMessage,
        checkIn,
        checkOut,
      },
      apartments: selectedApartments,
    };

    try {
      setSavingMode(mode);
      await onSubmit(draft, mode);
      onClose();
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-800 bg-[#23262b] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Unified Multi-Apartment Offer</h2>
            <p className="text-sm text-gray-400">
              {selectedApartments.length} apartment{selectedApartments.length === 1 ? '' : 's'} selected
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <section className="bg-[#111315] border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Selected apartments</h3>
            {selectedApartments.map((apartment) => (
              <div key={apartment.propertyId} className="flex items-start justify-between gap-3 border border-gray-800 rounded-lg bg-[#161B22] px-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {formatApartmentIdentificationLine(apartment)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                    {apartment.apartmentGroupName ? <span>{apartment.apartmentGroupName}</span> : <span>Без групи</span>}
                    {apartment.marketplaceUrl && (
                      <a
                        href={apartment.marketplaceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <LinkIcon className="w-3 h-3" />
                        Listing
                      </a>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeApartment(apartment.propertyId)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                  title="Прибрати квартиру з оферу"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </section>

          <section className="bg-[#111315] border border-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">Shared customer / contact</h3>
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Lead lookup"
                  className="w-full pl-9 pr-3 py-2 bg-[#161B22] border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                {filteredLeads.length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-[#0D1117] border border-gray-700 rounded-lg shadow-xl overflow-hidden z-10">
                    {filteredLeads.map((lead) => (
                      <button
                        key={lead.id}
                        onClick={() => applyLead(lead)}
                        className="w-full text-left px-3 py-2 hover:bg-[#161B22] transition-colors border-b border-gray-800 last:border-b-0"
                      >
                        <div className="text-sm text-white">{lead.name}</div>
                        <div className="text-xs text-gray-500">{lead.email || lead.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setClientType('Private')}
                className={`px-3 py-2 rounded-lg text-sm ${clientType === 'Private' ? 'bg-emerald-600 text-white' : 'bg-[#161B22] text-gray-300'}`}
              >
                Private
              </button>
              <button
                onClick={() => setClientType('Company')}
                className={`px-3 py-2 rounded-lg text-sm ${clientType === 'Company' ? 'bg-emerald-600 text-white' : 'bg-[#161B22] text-gray-300'}`}
              >
                Company
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clientType === 'Company' ? (
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              ) : (
                <>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
                </>
              )}
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className="w-full md:col-span-2 bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
            </div>
          </section>

          <section className="bg-[#111315] border border-gray-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Shared dates</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <div className="bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 flex items-center">
                Nights: {nights}
              </div>
            </div>
          </section>

          <section className="bg-[#111315] border border-gray-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Per-apartment pricing and financials</h3>
              <div className="text-xs text-gray-400">Nights are shared across all apartments</div>
            </div>
            <div className="space-y-3">
              {selectedApartments.map((apartment) => {
                const rowTotals = calculateOfferItemTotals(apartment.nightlyPrice, apartment.taxRate, nights);
                return (
                  <div key={apartment.propertyId} className="border border-gray-800 rounded-lg bg-[#161B22] p-3">
                    <div className="text-sm text-white font-medium mb-3">
                      {formatApartmentIdentificationLine(apartment)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Price / Night</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={apartment.nightlyPrice}
                          onChange={(e) => updateApartment(apartment.propertyId, { nightlyPrice: Number(e.target.value) })}
                          className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Tax %</div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={apartment.taxRate}
                          onChange={(e) => updateApartment(apartment.propertyId, { taxRate: Number(e.target.value) })}
                          className="w-full bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="bg-[#111315] border border-gray-700 rounded-lg px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Nights</div>
                        <div className="text-sm text-white mt-1">{nights}</div>
                      </div>
                      <div className="bg-[#111315] border border-gray-700 rounded-lg px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Net</div>
                        <div className="text-sm text-white mt-1">{rowTotals.netTotal.toFixed(2)} EUR</div>
                      </div>
                      <div className="bg-[#111315] border border-gray-700 rounded-lg px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">VAT</div>
                        <div className="text-sm text-white mt-1">{rowTotals.vatAmount.toFixed(2)} EUR</div>
                      </div>
                      <div className="bg-[#111315] border border-gray-700 rounded-lg px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Gross</div>
                        <div className="text-sm font-semibold text-emerald-300 mt-1">{rowTotals.grossTotal.toFixed(2)} EUR</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-[#161B22] border border-gray-800 rounded-lg px-3 py-3 text-sm text-gray-300">Net total: <span className="text-white">{totals.net.toFixed(2)} EUR</span></div>
              <div className="bg-[#161B22] border border-gray-800 rounded-lg px-3 py-3 text-sm text-gray-300">VAT total: <span className="text-white">{totals.vat.toFixed(2)} EUR</span></div>
              <div className="bg-[#161B22] border border-gray-800 rounded-lg px-3 py-3 text-sm text-gray-300">Gross total: <span className="text-emerald-300 font-semibold">{totals.gross.toFixed(2)} EUR</span></div>
            </div>
          </section>

          <section className="bg-[#111315] border border-gray-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Offer communication</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select value={internalCompany} onChange={(e) => setInternalCompany(e.target.value)} className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                {INTERNAL_COMPANIES.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
              <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="Recipient email" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
              <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="Recipient phone" className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
            </div>
            <textarea
              value={clientMessage}
              onChange={(e) => {
                setClientMessage(e.target.value);
                setMessageDirty(true);
              }}
              rows={8}
              className="w-full bg-[#161B22] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </section>
        </div>

        <div className="px-6 py-4 border-t border-gray-800 bg-[#23262b] flex justify-between items-center">
          <div className="text-sm text-gray-400">
            {selectedApartments.length} apartment{selectedApartments.length === 1 ? '' : 's'} · {nights} nights
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSubmit('draft')}
              disabled={savingMode !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <Save className="w-4 h-4" />
                {savingMode === 'draft' ? 'Saving…' : 'Save as Offer'}
              </span>
            </button>
            <button
              onClick={() => handleSubmit('send')}
              disabled={savingMode !== null}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <Send className="w-4 h-4" />
                {savingMode === 'send' ? 'Saving…' : 'Save & Send'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiApartmentOfferModal;
