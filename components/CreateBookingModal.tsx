/**
 * Create Booking modal — lightweight internal booking form for known clients from Leads/Client History.
 * Shell only: form with prefilled client data; Save does not persist (stub) until a safe creation path exists.
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Lead, Property, CreateBookingFormData } from '../types';
import { getPropertyDisplayLabel } from '../utils/formatPropertyAddress';

export interface CreateBookingModalProps {
  lead: Lead;
  properties: Property[];
  onClose: () => void;
  onSave?: (data: CreateBookingFormData) => void;
}

const CreateBookingModal: React.FC<CreateBookingModalProps> = ({ lead, properties, onClose, onSave }) => {
  const [clientName, setClientName] = useState(lead.name);
  const [email, setEmail] = useState(lead.email ?? '');
  const [phone, setPhone] = useState(lead.phone ?? '');
  const [address, setAddress] = useState(lead.address ?? '');
  const [propertyId, setPropertyId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [nightlyPrice, setNightlyPrice] = useState(0);
  const [taxRate, setTaxRate] = useState(7.7);
  const [kaution, setKaution] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setClientName(lead.name);
    setEmail(lead.email ?? '');
    setPhone(lead.phone ?? '');
    setAddress(lead.address ?? '');
  }, [lead]);

  const nights = (() => {
    if (!checkIn || !checkOut) return 0;
    const a = new Date(checkIn);
    const b = new Date(checkOut);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
  })();
  const netTotal = nights * nightlyPrice;
  const vatAmount = netTotal * (taxRate / 100);
  const grossPreview = netTotal + vatAmount;

  const handleSave = async () => {
    // Stub mode: no real save wired, keep old behavior.
    if (!onSave) {
      onClose();
      return;
    }

    setError(null);

    if (!clientName.trim()) {
      setError('Client name is required.');
      return;
    }

    if (!propertyId) {
      setError('Property is required.');
      return;
    }

    if (!checkIn || !checkOut) {
      setError('Check-in and check-out dates are required.');
      return;
    }

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError('Dates are invalid.');
      return;
    }

    const diffMs = end.getTime() - start.getTime();
    const nightsComputed = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffMs <= 0 || nightsComputed <= 0) {
      setError('Check-out must be after check-in and nights must be greater than 0.');
      return;
    }

    if (nightlyPrice <= 0) {
      setError('Nightly price must be greater than 0.');
      return;
    }

    if (taxRate < 0) {
      setError('Tax rate cannot be negative.');
      return;
    }

    if (kaution < 0) {
      setError('Kaution cannot be negative.');
      return;
    }

    const payload: CreateBookingFormData = {
      clientName,
      email,
      phone,
      address,
      propertyId,
      checkIn,
      checkOut,
      nightlyPrice,
      taxRate,
      kaution,
      notes,
    };

    try {
      await onSave(payload);
      // Important: parent (AccountDashboard) is single source of truth for close.
      // Do not call onClose() here on success; parent closes by clearing clientHistoryLead.
    } catch (e) {
      // Keep modal open so the user can retry.
      // eslint-disable-next-line no-console
      console.error('Failed to create booking from lead:', e);
      setError('Failed to create booking. Please try again.');
    }
  };

  const isStub = onSave == null;

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-[#23262b]">
          <h2 className="text-xl font-bold text-white">Create Booking</h2>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-auto space-y-4">
          {isStub && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              This is a stub. Save will not create a record until a safe creation path is implemented.
            </div>
          )}
          {error && (
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-xs">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="create-booking-client-name" className="block text-xs font-medium text-gray-400 mb-1">Client name</label>
            <input id="create-booking-client-name" name="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="create-booking-email" className="block text-xs font-medium text-gray-400 mb-1">Email</label>
            <input id="create-booking-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="create-booking-phone" className="block text-xs font-medium text-gray-400 mb-1">Phone</label>
            <input id="create-booking-phone" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="create-booking-address" className="block text-xs font-medium text-gray-400 mb-1">Address</label>
            <input id="create-booking-address" name="address" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="create-booking-property" className="block text-xs font-medium text-gray-400 mb-1">Property (required)</label>
            <select id="create-booking-property" name="propertyId" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white">
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{getPropertyDisplayLabel(p)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-booking-check-in" className="block text-xs font-medium text-gray-400 mb-1">Check-in</label>
              <input id="create-booking-check-in" name="checkIn" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
            </div>
            <div>
              <label htmlFor="create-booking-check-out" className="block text-xs font-medium text-gray-400 mb-1">Check-out</label>
              <input id="create-booking-check-out" name="checkOut" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
            </div>
          </div>
          <div className="text-xs text-gray-500">Nights: {nights}</div>
          <div>
            <label htmlFor="create-booking-nightly" className="block text-xs font-medium text-gray-400 mb-1">Price / nightly</label>
            <input id="create-booking-nightly" name="nightlyPrice" type="number" min={0} step={0.01} value={nightlyPrice || ''} onChange={(e) => setNightlyPrice(Number(e.target.value) || 0)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="create-booking-tax" className="block text-xs font-medium text-gray-400 mb-1">Tax rate (%)</label>
            <input id="create-booking-tax" name="taxRate" type="number" min={0} step={0.1} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div className="text-xs text-gray-500">Net: {netTotal.toFixed(2)} · VAT: {vatAmount.toFixed(2)} · Gross: {grossPreview.toFixed(2)}</div>
          <div>
            <label htmlFor="create-booking-kaution" className="block text-xs font-medium text-gray-400 mb-1">Kaution</label>
            <input id="create-booking-kaution" name="kaution" type="number" min={0} step={0.01} value={kaution || ''} onChange={(e) => setKaution(Number(e.target.value) || 0)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="create-booking-notes" className="block text-xs font-medium text-gray-400 mb-1">Internal notes (optional)</label>
            <textarea id="create-booking-notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
        </div>
        <div className="p-4 border-t border-gray-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium">Cancel</button>
          <button type="button" onClick={handleSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium">Save / Create Booking</button>
        </div>
      </div>
    </div>
  );
};

export default CreateBookingModal;
