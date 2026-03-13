/**
 * Create Booking modal — lightweight internal booking form for known clients from Leads/Client History.
 * Shell only: form with prefilled client data; Save does not persist (stub) until a safe creation path exists.
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Lead, Property } from '../types';

export interface CreateBookingModalProps {
  lead: Lead;
  properties: Property[];
  onClose: () => void;
  onSave?: (data: CreateBookingFormData) => void;
}

export interface CreateBookingFormData {
  clientName: string;
  email: string;
  phone: string;
  address: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  nightlyPrice: number;
  taxRate: number;
  kaution: number;
  notes: string;
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

  const handleSave = () => {
    if (onSave) {
      onSave({
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
      });
    }
    onClose();
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
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Client name</label>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Property (required)</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white">
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.title ?? p.address ?? p.id}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Check-in</label>
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Check-out</label>
              <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
            </div>
          </div>
          <div className="text-xs text-gray-500">Nights: {nights}</div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Price / nightly</label>
            <input type="number" min={0} step={0.01} value={nightlyPrice || ''} onChange={(e) => setNightlyPrice(Number(e.target.value) || 0)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Tax rate (%)</label>
            <input type="number" min={0} step={0.1} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div className="text-xs text-gray-500">Net: {netTotal.toFixed(2)} · VAT: {vatAmount.toFixed(2)} · Gross: {grossPreview.toFixed(2)}</div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Kaution</label>
            <input type="number" min={0} step={0.01} value={kaution || ''} onChange={(e) => setKaution(Number(e.target.value) || 0)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Internal notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white" />
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
