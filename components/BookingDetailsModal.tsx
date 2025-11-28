
import React, { useState } from 'react';
import { X, Briefcase, Euro, CreditCard, Mail, Phone, MapPin, User, FileText, Send, Save, Building2, ChevronDown, FilePlus2, Download, Edit3 } from 'lucide-react';
import { Booking, OfferData } from '../types';
import { ROOMS } from '../constants';

interface BookingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onConvertToOffer?: (status: 'Draft' | 'Sent', company: string, email: string) => void;
  onCreateInvoice?: (offer: OfferData) => void; // New Callback
  onEdit?: () => void; // New Edit Callback
}

const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({ isOpen, onClose, booking, onConvertToOffer, onCreateInvoice, onEdit }) => {
  const [isEmailPromptOpen, setIsEmailPromptOpen] = useState(false);
  const [selectedInternalCompany, setSelectedInternalCompany] = useState('Sotiso');
  const [clientEmailInput, setClientEmailInput] = useState('');
  
  if (!isOpen || !booking) return null;

  const INTERNAL_COMPANIES = ['Sotiso', 'Wonowo', 'NowFlats'];

  const handleOpenEmailPrompt = () => {
    setClientEmailInput(booking.email || '');
    setIsEmailPromptOpen(true);
  };

  const handleSendAction = () => {
    if (onConvertToOffer) {
        onConvertToOffer('Sent', selectedInternalCompany, clientEmailInput);
        setIsEmailPromptOpen(false);
    }
  };

  const handleSaveDraft = () => {
    if (onConvertToOffer) {
        onConvertToOffer('Draft', selectedInternalCompany, '');
    }
  };
  
  const handleCreateInvoice = () => {
    if (onCreateInvoice) {
        // Construct basic OfferData from booking to pass back
        const offerData: OfferData = {
            id: String(booking.id),
            clientName: booking.guest,
            propertyId: booking.roomId,
            internalCompany: booking.internalCompany || 'Sotiso',
            price: booking.price,
            dates: `${booking.start} to ${booking.end}`,
            status: 'Sent', 
            address: booking.address,
            email: booking.email,
            phone: booking.phone,
            guests: booking.guests,
            guestList: booking.guestList,
            unit: booking.unit,
            checkInTime: booking.checkInTime,
            checkOutTime: booking.checkOutTime,
            comments: booking.comments,
        };
        onCreateInvoice(offerData);
    }
  };

  const handleDownloadPdf = () => {
      alert("Downloading Offer PDF...");
  };

  // If Email Prompt is Open (Nested Modal)
  if (isEmailPromptOpen) {
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1C1F24] w-full max-w-md rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
                <div className="p-5 border-b border-gray-800 bg-[#23262b]">
                    <h3 className="text-lg font-bold text-white">Send Offer</h3>
                </div>
                <div className="p-6">
                    <label className="block text-xs font-medium text-gray-400 mb-2">Client Email</label>
                    <input 
                        type="email"
                        value={clientEmailInput}
                        onChange={(e) => setClientEmailInput(e.target.value)}
                        className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        placeholder="client@example.com"
                    />
                </div>
                <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end">
                    <button 
                        onClick={() => setIsEmailPromptOpen(false)}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSendAction}
                        className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center gap-2"
                    >
                        <Send className="w-4 h-4" />
                        Confirm Send
                    </button>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-[#1C1F24] w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
            {/* Header */}
            <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center sticky top-0 z-10">
                <div>
                    <h3 className="text-xl font-bold text-white">Reservation Details</h3>
                    <p className="text-xs text-gray-400">ID: #{booking.id}</p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="p-6 space-y-8">
                
                {/* Top Row: Status & Main Info */}
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${booking.color.replace('bg-', 'text-').replace('600', '400')} bg-white/5 border border-white/10`}>
                                {booking.status}
                            </span>
                            
                            {/* Internal Company Badge */}
                            {booking.internalCompany && (
                                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    <Building2 className="w-3 h-3" />
                                    {booking.internalCompany}
                                </span>
                            )}

                            <span className="text-sm text-gray-500">{booking.channel}</span>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{booking.guest}</h2>
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Briefcase className="w-4 h-4" />
                                <span>{ROOMS.find(r => r.id === booking.roomId)?.name || booking.roomId}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                        <div className="bg-[#111315] border border-gray-800 p-4 rounded-xl min-w-[140px]">
                            <span className="text-xs text-gray-500 block mb-1">Check-In</span>
                            <div className="font-bold text-white">{booking.start}</div>
                            <div className="text-xs text-emerald-500 font-mono mt-1">{booking.checkInTime}</div>
                        </div>
                        <div className="bg-[#111315] border border-gray-800 p-4 rounded-xl min-w-[140px]">
                            <span className="text-xs text-gray-500 block mb-1">Check-Out</span>
                            <div className="font-bold text-white">{booking.end}</div>
                            <div className="text-xs text-red-400 font-mono mt-1">{booking.checkOutTime}</div>
                        </div>
                    </div>
                </div>

                <div className="h-px bg-gray-800"></div>
                
                {/* Offer / Invoice Actions */}
                {onCreateInvoice && (
                    <div className="flex flex-wrap gap-4">
                        {onEdit && (
                            <button 
                                onClick={onEdit}
                                className="flex-1 bg-[#1C1F24] border border-gray-700 hover:bg-gray-800 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                <Edit3 className="w-4 h-4" /> Edit Offer
                            </button>
                        )}
                        <button 
                            onClick={handleDownloadPdf}
                            className="flex-1 bg-[#1C1F24] border border-gray-700 hover:bg-gray-800 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <Download className="w-4 h-4" /> Download Offer PDF
                        </button>
                        <button 
                            onClick={handleCreateInvoice}
                            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-purple-900/20"
                        >
                            <FilePlus2 className="w-4 h-4" /> Create Invoice
                        </button>
                    </div>
                )}

                {/* Convert to Offer Section */}
                {onConvertToOffer && (
                    <div className="bg-[#161B22] border border-gray-800 rounded-lg p-4 mb-4">
                        <h4 className="text-sm font-bold text-emerald-500 mb-3 flex items-center gap-2">
                            <Send className="w-4 h-4" /> Convert to Offer
                        </h4>
                        <div className="flex gap-4 items-end">
                             <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-400 mb-1 flex items-center gap-2">
                                    <Building2 className="w-3 h-3 text-emerald-500" /> Issuing Company
                                </label>
                                <div className="relative">
                                    <select 
                                        value={selectedInternalCompany}
                                        onChange={(e) => setSelectedInternalCompany(e.target.value)}
                                        className="w-full appearance-none bg-[#111315] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
                                    >
                                        {INTERNAL_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                                </div>
                             </div>
                             <div className="flex gap-2">
                                <button 
                                    onClick={handleSaveDraft}
                                    className="px-4 py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg transition-colors flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Save as Offer
                                </button>
                                <button 
                                    onClick={handleOpenEmailPrompt}
                                    className="px-4 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-colors flex items-center gap-2"
                                >
                                    <Send className="w-4 h-4" />
                                    Save & Send
                                </button>
                             </div>
                        </div>
                    </div>
                )}

                {/* Three Column Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    
                    {/* Column 1: Financials */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Euro className="w-4 h-4" /> Financials
                        </h4>
                        <div className="bg-[#111315] rounded-lg p-4 border border-gray-800 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">Total Price</span>
                                <span className="text-white font-bold">{booking.price}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">Balance</span>
                                <span className={`font-bold ${booking.balance.startsWith('-') ? 'text-emerald-500' : 'text-red-400'}`}>
                                    {booking.balance}
                                </span>
                            </div>
                            <div className="h-px bg-gray-800 my-2"></div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <CreditCard className="w-3 h-3" />
                                <span>{booking.paymentAccount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Contact Info */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <User className="w-4 h-4" /> Contact
                        </h4>
                        <div className="space-y-3">
                            {booking.email && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400">
                                        <Mail className="w-4 h-4" />
                                    </div>
                                    <span className="text-white">{booking.email}</span>
                                </div>
                            )}
                            {booking.phone && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400">
                                        <Phone className="w-4 h-4" />
                                    </div>
                                    <span className="text-white">{booking.phone}</span>
                                </div>
                            )}
                            {booking.address && (
                                <div className="flex items-center gap-3 text-sm">
                                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400">
                                        <MapPin className="w-4 h-4" />
                                    </div>
                                    <span className="text-white truncate max-w-[200px]">{booking.address}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Column 3: Guest List & Extra */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <User className="w-4 h-4" /> Guest List
                        </h4>
                        <div className="bg-[#111315] rounded-lg p-4 border border-gray-800">
                            {booking.guestList && booking.guestList.length > 0 ? (
                                <ul className="space-y-2">
                                    {booking.guestList.map((g, i) => (
                                        <li key={i} className="text-sm text-white flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div>
                                            {g.firstName} {g.lastName}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500 italic">No guest list provided.</p>
                            )}
                        </div>
                    </div>

                </div>

                {/* Bottom: Comments */}
                <div className="space-y-2">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Comments & Notes
                    </h4>
                    <div className="bg-[#111315] p-4 rounded-lg border border-gray-800 text-sm text-gray-300">
                        {booking.comments || "No comments."}
                    </div>
                </div>

            </div>

            <div className="p-5 border-t border-gray-800 bg-[#161B22] flex justify-end">
                <button onClick={onClose} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors">
                    Close
                </button>
            </div>
        </div>
    </div>
  );
};

export default BookingDetailsModal;
