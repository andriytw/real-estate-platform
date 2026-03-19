import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, User, Mail, Phone, MapPin, Building2, Calendar, Users, FileText } from 'lucide-react';
import type { CreateLeadInput, Lead } from '../types';

export interface LeadCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Create only; parent handles close, reload, toasts. Throw on API failure. */
  onCreate: (input: CreateLeadInput) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildLeadDisplayName(
  companyName: string,
  firstName: string,
  lastName: string,
  email: string,
  phone: string
): string {
  const co = companyName.trim();
  if (co) return co;
  const full = `${firstName} ${lastName}`.trim();
  if (full) return full;
  if (firstName.trim()) return firstName.trim();
  if (lastName.trim()) return lastName.trim();
  const em = email.trim();
  if (em) return em;
  const ph = phone.trim();
  if (ph) return ph;
  return 'Manual lead';
}

function bothDatesValidForPreferred(start: string, end: string): boolean {
  const a = start.trim();
  const b = end.trim();
  if (!a || !b) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(a) && /^\d{4}-\d{2}-\d{2}$/.test(b);
}

function peopleCountFromGuests(raw: string): number {
  const n = Number(String(raw).trim());
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 1;
}

/** Fixed-order notes; only non-empty lines; no Preferred stay / Guests when structured preferred_dates is used. */
function buildManualNotes(params: {
  interestedProperty: string;
  budget: string;
  preferredStayText: string;
  guestsText: string;
  internalNotes: string;
  omitPreferredStayAndGuests: boolean;
}): string | undefined {
  const lines: string[] = [];
  const ip = params.interestedProperty.trim();
  if (ip) lines.push(`Interested property: ${ip}`);
  const bud = params.budget.trim();
  if (bud) lines.push(`Budget: ${bud}`);
  if (!params.omitPreferredStayAndGuests) {
    const ps = params.preferredStayText.trim();
    if (ps) lines.push(`Preferred stay: ${ps}`);
    const g = params.guestsText.trim();
    if (g) lines.push(`Guests: ${g}`);
  }
  const internal = params.internalNotes.trim();
  if (internal) lines.push(`Internal notes: ${internal}`);
  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

const LeadCreateModal: React.FC<LeadCreateModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<Lead['status']>('Active');
  const [interestedProperty, setInterestedProperty] = useState('');
  const [budget, setBudget] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setFirstName('');
    setLastName('');
    setCompanyName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setStatus('Active');
    setInterestedProperty('');
    setBudget('');
    setCheckIn('');
    setCheckOut('');
    setGuests('');
    setInternalNotes('');
    setSaving(false);
  }, []);

  useEffect(() => {
    if (isOpen) resetForm();
  }, [isOpen, resetForm]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const em = email.trim();
    const ph = phone.trim();
    const co = companyName.trim();
    const fn = firstName.trim();
    const ln = lastName.trim();

    if (em && !EMAIL_RE.test(em)) {
      window.alert('Please enter a valid email address or leave email empty.');
      return;
    }

    if (!em && !ph && !co && !fn && !ln) {
      window.alert('Enter at least one of: email, phone, first name, last name, or company name.');
      return;
    }

    const isCompany = co.length > 0;
    const type: Lead['type'] = isCompany ? 'Company' : 'Private';
    const name = buildLeadDisplayName(co, fn, ln, em, ph);

    const structuredPreferred = bothDatesValidForPreferred(checkIn, checkOut);
    let preferredDates: CreateLeadInput['preferredDates'];
    let preferredStayForNotes = '';
    let guestsForNotes = '';

    if (structuredPreferred) {
      preferredDates = [
        {
          start: checkIn.trim(),
          end: checkOut.trim(),
          peopleCount: peopleCountFromGuests(guests),
        },
      ];
    } else {
      if (checkIn.trim() || checkOut.trim()) {
        preferredStayForNotes = [checkIn.trim(), checkOut.trim()].filter(Boolean).join(' → ');
      }
      if (guests.trim()) {
        guestsForNotes = guests.trim();
      }
    }

    const notes = buildManualNotes({
      interestedProperty,
      budget,
      preferredStayText: preferredStayForNotes,
      guestsText: guestsForNotes,
      internalNotes,
      omitPreferredStayAndGuests: structuredPreferred,
    });

    const input: CreateLeadInput = {
      name,
      type,
      email: em,
      phone: ph,
      address: address.trim(),
      status,
      source: 'manual',
    };

    if (isCompany) {
      const contact = `${fn} ${ln}`.trim();
      if (contact) {
        input.contactPerson = contact;
      }
    }

    if (notes) {
      input.notes = notes;
    }
    if (preferredDates?.length) {
      input.preferredDates = preferredDates;
    }

    setSaving(true);
    try {
      await onCreate(input);
    } catch (e) {
      console.error('Lead create failed:', e);
      window.alert(e instanceof Error ? e.message : 'Failed to create lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1C1F24] w-full max-w-lg max-h-[90vh] rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center shrink-0">
          <h3 className="text-xl font-bold text-white">Create lead</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto flex-1 min-h-0 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
                <User className="w-3 h-3" /> First name
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
              <Building2 className="w-3 h-3" /> Company name
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              placeholder="Optional — if set, lead type is Company"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
              <Mail className="w-3 h-3" /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
              <Phone className="w-3 h-3" /> Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
              <MapPin className="w-3 h-3" /> Address
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Lead['status'])}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            >
              <option value="Active">Active</option>
              <option value="Potential">Potential</option>
              <option value="Past">Past</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Interested property</label>
            <input
              value={interestedProperty}
              onChange={(e) => setInterestedProperty(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Budget / price note</label>
            <input
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Check-in
              </label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Check-out
              </label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
              <Users className="w-3 h-3" /> Number of guests
            </label>
            <input
              type="number"
              min={1}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              placeholder="Used when both dates are set (default 1)"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
              <FileText className="w-3 h-3" /> Internal notes
            </label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none resize-y"
            />
          </div>
          <p className="text-[10px] text-gray-500">Source is set to manual. Both check-in and check-out dates must be set to store preferred dates in structured form.</p>
        </div>
        <div className="p-5 border-t border-gray-800 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Create lead'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeadCreateModal;
