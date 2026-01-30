import React, { useState, useEffect } from 'react';
import { X, Save, User, Mail, Phone, MapPin, Building2 } from 'lucide-react';
import { Lead } from '../types';

interface LeadEditModalProps {
  lead: Lead;
  onClose: () => void;
  onSave: (updates: Partial<Lead>) => void;
}

const LeadEditModal: React.FC<LeadEditModalProps> = ({ lead, onClose, onSave }) => {
  const [name, setName] = useState(lead.name);
  const [type, setType] = useState<Lead['type']>(lead.type);
  const [email, setEmail] = useState(lead.email);
  const [phone, setPhone] = useState(lead.phone);
  const [address, setAddress] = useState(lead.address);
  const [status, setStatus] = useState<Lead['status']>(lead.status);

  useEffect(() => {
    setName(lead.name);
    setType(lead.type);
    setEmail(lead.email);
    setPhone(lead.phone);
    setAddress(lead.address);
    setStatus(lead.status);
  }, [lead]);

  const handleSave = () => {
    onSave({ name, type, email, phone, address, status });
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Редагувати лід</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2"><User className="w-3 h-3" /> Ім'я / Назва</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2"><Building2 className="w-3 h-3" /> Тип</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setType('Private')} className={`flex-1 py-2 text-sm font-bold rounded-md ${type === 'Private' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Private</button>
              <button type="button" onClick={() => setType('Company')} className={`flex-1 py-2 text-sm font-bold rounded-md ${type === 'Company' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>Company</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2"><Mail className="w-3 h-3" /> Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2"><Phone className="w-3 h-3" /> Телефон</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2"><MapPin className="w-3 h-3" /> Адреса</label>
            <input value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Статус</label>
            <select value={status} onChange={e => setStatus(e.target.value as Lead['status'])} className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none">
              <option value="Active">Active</option>
              <option value="Potential">Potential</option>
              <option value="Past">Past</option>
            </select>
          </div>
        </div>
        <div className="p-5 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors">Скасувати</button>
          <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"><Save className="w-4 h-4" /> Зберегти</button>
        </div>
      </div>
    </div>
  );
};

export default LeadEditModal;
