
import React, { useState, useEffect } from 'react';
import { X, Briefcase, Euro, CreditCard, Mail, Phone, MapPin, User, FileText, Send, Save, Building2, ChevronDown, FilePlus2, Download, Edit3, Trash2, Copy, Check } from 'lucide-react';
import { Booking, OfferData, BookingStatus } from '../types';
import { ROOMS } from '../constants';
import { canSendOffer, canCreateInvoice } from '../bookingUtils';

interface BookingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onConvertToOffer?: (status: 'Draft' | 'Sent', company: string, email: string, phone: string, clientMessage: string) => void;
  onCreateInvoice?: (offer: OfferData) => void; // New Callback
  onEdit?: () => void; // New Edit Callback
  onSendOffer?: () => void; // New callback for sending offer
  onUpdateBookingStatus?: (bookingId: number, newStatus: BookingStatus) => void; // New callback for updating status
  onDeleteReservation?: (id: number) => void; // Delete reservation callback
  onDeleteOffer?: (offerId: string) => void; // Delete offer callback
  isViewingOffer?: boolean; // Flag to indicate if viewing an offer
}

const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({ isOpen, onClose, booking, onConvertToOffer, onCreateInvoice, onEdit, onSendOffer, onUpdateBookingStatus, onDeleteReservation, onDeleteOffer, isViewingOffer }) => {
  const [selectedInternalCompany, setSelectedInternalCompany] = useState('Sotiso');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientMessage, setClientMessage] = useState('');
  const [copiedBookingNo, setCopiedBookingNo] = useState(false);
  const [copiedInternalId, setCopiedInternalId] = useState(false);
  const [copiedMarketplaceUrl, setCopiedMarketplaceUrl] = useState(false);
  const [property, setProperty] = useState<any>(null);
  
  const INTERNAL_COMPANIES = ['Sotiso', 'Wonowo', 'NowFlats'];

  // Fetch property for marketplace URL
  useEffect(() => {
    if (booking?.propertyId) {
      import('../services/supabaseService').then(({ propertiesService }) => {
        propertiesService.getById(booking.propertyId!).then(setProperty).catch(() => setProperty(null));
      });
    }
  }, [booking?.propertyId]);

  // Initialize form fields when booking changes
  useEffect(() => {
    if (booking) {
      setClientEmail(booking.email || '');
      setClientPhone(booking.phone || '');
      // Generate message template with safe fallbacks
      const guestName = (booking.firstName && booking.lastName) 
        ? `${booking.firstName} ${booking.lastName}`.trim()
        : (booking.guest || 'Guest');
      const propertyName = property?.title || booking.roomId || 'the apartment';
      const checkInDate = booking.start 
        ? (() => {
            try {
              return new Date(booking.start).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch {
              return booking.start;
            }
          })()
        : '';
      const checkOutDate = booking.end 
        ? (() => {
            try {
              return new Date(booking.end).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
            } catch {
              return booking.end;
            }
          })()
        : '';
      const totalPrice = booking.totalGross || booking.price || '0.00 EUR';
      const bookingNo = booking.bookingNo || '';
      
      const template = `Hello ${guestName},

thank you for your interest in the apartment "${propertyName}".

Your stay: ${checkInDate}${checkOutDate ? ` – ${checkOutDate}` : ''}
${bookingNo ? `Booking number: ${bookingNo}\n` : ''}Total price: ${totalPrice}

Please find the offer attached.

Best regards,
${selectedInternalCompany} Team`;
      
      setClientMessage(template);
    }
  }, [booking, property, selectedInternalCompany]);

  // Update message template when company changes
  useEffect(() => {
    if (booking && clientMessage) {
      const lines = clientMessage.split('\n');
      const lastLine = lines[lines.length - 1];
      if (lastLine.includes('Team')) {
        lines[lines.length - 1] = `${selectedInternalCompany} Team`;
        setClientMessage(lines.join('\n'));
      }
    }
  }, [selectedInternalCompany]);

  if (!isOpen || !booking) return null;

  const handleSaveDraft = () => {
    if (onConvertToOffer) {
        onConvertToOffer('Draft', selectedInternalCompany, clientEmail, clientPhone, clientMessage);
    }
  };

  const handleSaveAndSend = () => {
    if (onConvertToOffer) {
        onConvertToOffer('Sent', selectedInternalCompany, clientEmail, clientPhone, clientMessage);
    }
  };
  
  const handleDownloadPdf = () => {
      alert("Downloading Offer PDF...");
  };

  const handleDeleteReservation = () => {
    if (!onDeleteReservation || !booking) return;
    
    const confirmed = window.confirm(
      "Are you sure you want to delete this reservation? This action cannot be undone."
    );
    
    if (confirmed) {
      onDeleteReservation(booking.id);
      onClose();
    }
  };


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
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${booking.color.replace('bg-', 'text-').replace('600', '400')} bg-white/5 border border-white/10`}>
                                {booking.status}
                            </span>
                            
                            {/* Booking Number */}
                            {booking.bookingNo && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <span className="font-mono">{booking.bookingNo}</span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(booking.bookingNo || '');
                                            setCopiedBookingNo(true);
                                            setTimeout(() => setCopiedBookingNo(false), 2000);
                                        }}
                                        className="hover:text-emerald-300 transition-colors"
                                        title="Copy booking number"
                                    >
                                        {copiedBookingNo ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            )}
                            
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

                {/* Convert to Offer Section */}
                {onConvertToOffer && (
                    <div className="bg-[#161B22] border border-gray-800 rounded-lg p-6 mb-4">
                        <h4 className="text-sm font-bold text-emerald-500 mb-4 flex items-center gap-2">
                            <Send className="w-4 h-4" /> Convert to Offer
                        </h4>
                        
                        <div className="space-y-4">
                            {/* Issuing Company */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                                    <Building2 className="w-3 h-3 text-emerald-500" /> Issuing Company <span className="text-red-400">*</span>
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

                            {/* Recipient Email */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                                    <Mail className="w-3 h-3 text-emerald-500" /> Recipient Email <span className="text-red-400">*</span>
                                </label>
                                <input 
                                    type="email"
                                    value={clientEmail}
                                    onChange={(e) => setClientEmail(e.target.value)}
                                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                    placeholder="client@example.com"
                                />
                            </div>

                            {/* Recipient Phone */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                                    <Phone className="w-3 h-3 text-emerald-500" /> Recipient Phone <span className="text-gray-500 text-xs">(optional)</span>
                                </label>
                                <input 
                                    type="tel"
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                                    placeholder="+49 123 456 789"
                                />
                            </div>

                            {/* Message to Client */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                                    <FileText className="w-3 h-3 text-emerald-500" /> Message to client <span className="text-red-400">*</span>
                                </label>
                                <textarea 
                                    value={clientMessage}
                                    onChange={(e) => setClientMessage(e.target.value)}
                                    rows={10}
                                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none resize-y font-mono"
                                    placeholder="Enter message to client..."
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Internal ID Section */}
                <div className="bg-[#111315] border border-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-xs text-gray-500 block mb-1">Internal ID</span>
                            <span className="text-sm font-mono text-gray-400">{String(booking.id)}</span>
                        </div>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(String(booking.id));
                                setCopiedInternalId(true);
                                setTimeout(() => setCopiedInternalId(false), 2000);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-xs"
                            title="Copy Internal ID"
                        >
                            {copiedInternalId ? (
                                <>
                                    <Check className="w-3 h-3" />
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Marketplace Listing Section */}
                {property?.marketplaceUrl && (
                    <div className="bg-[#111315] border border-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <span className="text-xs text-gray-500 block mb-1">Marketplace Listing</span>
                                <a 
                                    href={property.marketplaceUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-sm text-emerald-400 hover:text-emerald-300 truncate block"
                                >
                                    {property.marketplaceUrl}
                                </a>
                            </div>
                            <div className="flex items-center gap-2 ml-3">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(property.marketplaceUrl);
                                        setCopiedMarketplaceUrl(true);
                                        setTimeout(() => setCopiedMarketplaceUrl(false), 2000);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-xs"
                                    title="Copy URL"
                                >
                                    {copiedMarketplaceUrl ? (
                                        <>
                                            <Check className="w-3 h-3" />
                                            <span>Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copy</span>
                                        </>
                                    )}
                                </button>
                                <a
                                    href={property.marketplaceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-xs"
                                    title="Open in new tab"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
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

            <div className="p-5 border-t border-gray-800 bg-[#161B22]">
                {/* Actions Section */}
                {onConvertToOffer && (
                    <div className="mb-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Actions</h4>
                        <div className="flex gap-3">
                            <button 
                                onClick={onClose}
                                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveDraft}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                Save as Offer
                            </button>
                            <button 
                                onClick={handleSaveAndSend}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                            >
                                <Send className="w-4 h-4" />
                                Save & Send
                            </button>
                        </div>
                    </div>
                )}

                {/* Other Actions (Delete, Download PDF, Close) */}
                <div className="flex justify-end gap-3">
                    {isViewingOffer && onCreateInvoice && (
                        <button 
                            onClick={handleDownloadPdf}
                            className="px-6 py-2 bg-[#1C1F24] border border-gray-700 hover:bg-gray-800 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Download Offer PDF
                        </button>
                    )}
                    {onDeleteOffer && isViewingOffer && booking && (
                        <button 
                            onClick={() => {
                                if (confirm('Are you sure you want to delete this offer? This action cannot be undone.')) {
                                    onDeleteOffer(String(booking.id));
                                    onClose();
                                }
                            }}
                            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Offer
                        </button>
                    )}
                    {onDeleteReservation && !isViewingOffer && (
                        <button 
                            onClick={handleDeleteReservation}
                            className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Reservation
                        </button>
                    )}
                    {!onConvertToOffer && (
                        <button onClick={onClose} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors">
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default BookingDetailsModal;
