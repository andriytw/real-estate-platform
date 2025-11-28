
import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, User, Building2, DollarSign, Mail, Phone, MapPin, AlignLeft, Users } from 'lucide-react';
import { OfferData } from '../types';
import { ROOMS } from '../constants';

interface OfferEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: OfferData | null;
  onSave: (updatedOffer: OfferData) => void;
}

const OfferEditModal: React.FC<OfferEditModalProps> = ({ isOpen, onClose, offer, onSave }) => {
  const [formData, setFormData] = useState<OfferData | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (isOpen && offer) {
      setFormData({ ...offer });
      // Parse dates "YYYY-MM-DD to YYYY-MM-DD"
      const parts = offer.dates.split(' to ');
      setStartDate(parts[0] || '');
      setEndDate(parts[1] || parts[0] || '');
    }
  }, [isOpen, offer]);

  const handleChange = (field: keyof OfferData, value: string) => {
    if (formData) {
      setFormData({ ...formData, [field]: value });
    }
  };

  const handleSave = () => {
    if (formData) {
      const updatedOffer = {
        ...formData,
        dates: `${startDate} to ${endDate}`
      };
      onSave(updatedOffer);
    }
  };

  if (!isOpen || !formData) return null;

  const INTERNAL_COMPANIES = ['Sotiso', 'Wonowo', 'NowFlats'];

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold text-white">Edit Offer</h3>
            <p className="text-xs text-gray-400">ID: #{formData.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Section 1: Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <User className="w-3 h-3" /> Client Name
                </label>
                <input 
                  value={formData.clientName}
                  onChange={(e) => handleChange('clientName', e.target.value)}
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <Building2 className="w-3 h-3" /> Issuing Company
                </label>
                <select 
                  value={formData.internalCompany}
                  onChange={(e) => handleChange('internalCompany', e.target.value)}
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  {INTERNAL_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
             </div>
          </div>

          {/* Section 2: Dates & Price */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#111315] rounded-lg border border-gray-800">
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <Calendar className="w-3 h-3" /> Start Date
                </label>
                <input 
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <Calendar className="w-3 h-3" /> End Date
                </label>
                <input 
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <DollarSign className="w-3 h-3" /> Total Price
                </label>
                <input 
                  value={formData.price}
                  onChange={(e) => handleChange('price', e.target.value)}
                  className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-2.5 text-sm text-white font-bold focus:border-emerald-500 focus:outline-none" 
                />
             </div>
          </div>

          {/* Section 3: Contact Details */}
          <div className="space-y-4">
             <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Contact Details</h4>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                       <Mail className="w-3 h-3" /> Email
                    </label>
                    <input 
                      value={formData.email || ''}
                      onChange={(e) => handleChange('email', e.target.value)}
                      className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                       <Phone className="w-3 h-3" /> Phone
                    </label>
                    <input 
                      value={formData.phone || ''}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                       <MapPin className="w-3 h-3" /> Address
                    </label>
                    <input 
                      value={formData.address || ''}
                      onChange={(e) => handleChange('address', e.target.value)}
                      className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                    />
                </div>
             </div>
          </div>

          {/* Section 4: Additional Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <Users className="w-3 h-3" /> Guests
                </label>
                <input 
                  value={formData.guests || ''}
                  onChange={(e) => handleChange('guests', e.target.value)}
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                />
             </div>
             <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <Building2 className="w-3 h-3" /> Unit
                </label>
                <input 
                  value={formData.unit || ''}
                  onChange={(e) => handleChange('unit', e.target.value)}
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                />
             </div>
             <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                   <AlignLeft className="w-3 h-3" /> Comments
                </label>
                <textarea 
                  rows={3}
                  value={formData.comments || ''}
                  onChange={(e) => handleChange('comments', e.target.value)}
                  className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none resize-none" 
                />
             </div>
          </div>

        </div>

        <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end sticky bottom-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Cancel
            </button>
            <button 
                onClick={handleSave}
                className="px-6 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-colors flex items-center gap-2"
            >
                <Save className="w-4 h-4" />
                Save Changes
            </button>
        </div>

      </div>
    </div>
  );
};

export default OfferEditModal;
