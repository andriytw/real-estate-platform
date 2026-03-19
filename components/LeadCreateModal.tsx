import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, User, Mail, Phone, MapPin, Building2, FileText } from 'lucide-react';
import type { CreateLeadInput, Lead } from '../types';

export interface LeadCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Create only; parent handles close, reload, toasts. Throw on API failure. */
  onCreate: (input: CreateLeadInput) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** companyName → first+last → first → last → email → phone → 'Manual lead' */
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

const LeadCreateModal: React.FC<LeadCreateModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<Lead['status']>('Active');
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

    const notesTrimmed = internalNotes.trim();
    if (notesTrimmed) {
      input.notes = notesTrimmed;
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
      <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-800 bg-[#23262b] flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-white">Create lead</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-white bg-gray-800 p-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-2.5 overflow-y-auto flex-1 min-h-0 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
                <User className="w-3 h-3" /> First name
              </label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-400 mb-0.5">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Company name
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
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
            <label className="block text-[11px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Address <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-400 mb-0.5">Status</label>
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
            <label className="block text-[11px] font-medium text-gray-400 mb-0.5 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Internal notes
            </label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none resize-y"
              placeholder="Plain text only"
            />
          </div>
        </div>
        <div className="p-4 border-t border-gray-800 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
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
