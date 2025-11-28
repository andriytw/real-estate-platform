
import React, { useState, useEffect } from 'react';
import { X, Save, FileText, Download, Edit2, Check } from 'lucide-react';
import { OfferData, InvoiceData, CompanyDetails } from '../types';
import { INTERNAL_COMPANIES_DATA } from '../constants';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer?: OfferData | null;
  invoice?: InvoiceData | null;
  onSave: (invoice: InvoiceData) => void;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, offer, invoice, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Partial<InvoiceData>>({
    invoiceNumber: '',
    date: '',
    dueDate: '',
    items: [],
  });
  
  // State for sender details (auto-filled but editable)
  const [senderDetails, setSenderDetails] = useState<CompanyDetails | null>(null);
  const [clientAddress, setClientAddress] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (invoice) {
        // CASE 1: Viewing/Editing an Existing Invoice
        const companyKey = invoice.internalCompany || 'Sotiso';
        const companyData = INTERNAL_COMPANIES_DATA[companyKey] || INTERNAL_COMPANIES_DATA['Sotiso'];
        setSenderDetails(companyData);
        
        setInvoiceData({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.date,
          dueDate: invoice.dueDate,
          internalCompany: invoice.internalCompany,
          clientName: invoice.clientName,
          clientAddress: invoice.clientAddress,
          items: invoice.items,
          totalNet: invoice.totalNet,
          taxAmount: invoice.taxAmount,
          totalGross: invoice.totalGross,
          status: invoice.status,
          offerIdSource: invoice.offerIdSource
        });
        setClientAddress(invoice.clientAddress || '');
        setIsEditing(false); // Default to read-only view

      } else if (offer) {
        // CASE 2: Creating New Invoice from Offer or Reservation
        const companyKey = offer.internalCompany || 'Sotiso';
        const companyData = INTERNAL_COMPANIES_DATA[companyKey] || INTERNAL_COMPANIES_DATA['Sotiso'];
        setSenderDetails(companyData);

        // Parse price - підтримка як OfferData так і ReservationData
        const priceString = typeof offer.price === 'string' ? offer.price.replace(/[^0-9.]/g, '') : String(offer.price || '0');
        const priceVal = parseFloat(priceString) || 0;
        const taxRate = 0.19; // 19%
        const net = priceVal / (1 + taxRate);
        const tax = priceVal - net;

        // Визначити bookingId - якщо це резервація, використати id напряму
        let bookingId: string | number | undefined;
        if ('id' in offer && typeof offer.id === 'number') {
            bookingId = offer.id;
        } else if ('id' in offer) {
            bookingId = Number(offer.id) || undefined;
        }

        // Визначити dates - для резервації використати start/end, для offer - dates
        const dates = 'dates' in offer ? offer.dates : (`${(offer as any).start} to ${(offer as any).end}`);

        setInvoiceData({
          id: Date.now().toString(), // New ID
          invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
          date: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          internalCompany: companyKey,
          clientName: offer.clientName || (offer as any).guest,
          clientAddress: offer.address || (offer as any).address || '',
          items: [
            {
              description: `Accommodation: ${offer.propertyId || (offer as any).roomId} (${dates})`,
              quantity: 1,
              unitPrice: Number(net.toFixed(2)),
              total: Number(net.toFixed(2))
            }
          ],
          totalNet: Number(net.toFixed(2)),
          taxAmount: Number(tax.toFixed(2)),
          totalGross: priceVal,
          status: 'Unpaid',
          offerIdSource: 'id' in offer ? String(offer.id) : undefined,
          bookingId: bookingId
        });
        
        setClientAddress(offer.address || '');
        setIsEditing(true); // Default to edit mode for new invoices
      }
    }
  }, [offer, invoice, isOpen]);

  const handleSave = () => {
    if (invoiceData && senderDetails) {
        const finalInvoice: InvoiceData = {
            id: invoiceData.id || Date.now().toString(),
            invoiceNumber: invoiceData.invoiceNumber!,
            date: invoiceData.date!,
            dueDate: invoiceData.dueDate!,
            internalCompany: invoiceData.internalCompany || 'Sotiso',
            clientName: invoiceData.clientName!,
            clientAddress: clientAddress,
            items: invoiceData.items!,
            totalNet: invoiceData.totalNet!,
            taxAmount: invoiceData.taxAmount!,
            totalGross: invoiceData.totalGross!,
            status: invoiceData.status || 'Unpaid',
            offerIdSource: invoiceData.offerIdSource,
            bookingId: invoiceData.bookingId
        };
        onSave(finalInvoice);
    }
  };

  const handleSimulatePdf = () => {
      alert(`Downloading PDF for Invoice #${invoiceData.invoiceNumber}... (Simulation)`);
  };

  if (!isOpen || !senderDetails) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#1C1F24] w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="bg-purple-500/10 p-2 rounded text-purple-500"><FileText className="w-5 h-5" /></div>
             <div>
                <h3 className="text-xl font-bold text-white">{invoice ? 'View Invoice' : 'Create Invoice'}</h3>
                <p className="text-xs text-gray-400">{invoiceData.invoiceNumber}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <button 
                onClick={() => setIsEditing(!isEditing)}
                className={`p-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${isEditing ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
             >
                {isEditing ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {isEditing ? 'Done Editing' : 'Edit'}
             </button>
             <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {/* Body - Invoice Layout */}
        <div className="p-8 bg-white text-gray-900 min-h-[600px] font-mono text-sm">
            {/* Invoice Header */}
            <div className="flex justify-between mb-12">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">INVOICE</h1>
                    <div className="space-y-1 text-gray-600">
                        <div className="flex gap-2">
                            <span className="font-bold w-24">Invoice No:</span>
                            <input 
                                disabled={!isEditing}
                                value={invoiceData.invoiceNumber}
                                onChange={e => setInvoiceData({...invoiceData, invoiceNumber: e.target.value})}
                                className="bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none w-40 disabled:border-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <span className="font-bold w-24">Date:</span>
                            <input 
                                type="date"
                                disabled={!isEditing}
                                value={invoiceData.date}
                                onChange={e => setInvoiceData({...invoiceData, date: e.target.value})}
                                className="bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none w-40 disabled:border-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <span className="font-bold w-24">Due Date:</span>
                            <input 
                                type="date"
                                disabled={!isEditing}
                                value={invoiceData.dueDate}
                                onChange={e => setInvoiceData({...invoiceData, dueDate: e.target.value})}
                                className="bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none w-40 disabled:border-none"
                            />
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-xl font-bold text-gray-500 ml-auto mb-2">
                        {senderDetails.logo}
                    </div>
                    <h2 className="font-bold text-lg">{senderDetails.name}</h2>
                    <p className="text-gray-500 max-w-[200px] leading-tight ml-auto">{senderDetails.address}</p>
                    <p className="text-gray-500 mt-1">{senderDetails.email}</p>
                </div>
            </div>

            {/* Bill To */}
            <div className="mb-12">
                <h3 className="text-gray-500 font-bold uppercase text-xs mb-2">Bill To:</h3>
                <div className="border-l-4 border-gray-200 pl-4">
                    <input 
                        disabled={!isEditing}
                        value={invoiceData.clientName}
                        onChange={e => setInvoiceData({...invoiceData, clientName: e.target.value})}
                        className="block w-full font-bold text-lg bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none disabled:border-none mb-1"
                    />
                    <textarea 
                        disabled={!isEditing}
                        value={clientAddress}
                        onChange={e => setClientAddress(e.target.value)}
                        className="block w-full text-gray-600 bg-transparent border border-dashed border-gray-300 focus:border-blue-500 outline-none disabled:border-none resize-none"
                        rows={3}
                        placeholder="Client Address..."
                    />
                </div>
            </div>

            {/* Items Table */}
            <table className="w-full mb-8">
                <thead>
                    <tr className="border-b-2 border-gray-800 text-left">
                        <th className="py-2 w-[50%]">Description</th>
                        <th className="py-2 text-right">Qty</th>
                        <th className="py-2 text-right">Price</th>
                        <th className="py-2 text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {invoiceData.items?.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-200">
                            <td className="py-4">
                                <input 
                                    disabled={!isEditing}
                                    value={item.description}
                                    onChange={e => {
                                        const newItems = [...invoiceData.items!];
                                        newItems[idx].description = e.target.value;
                                        setInvoiceData({...invoiceData, items: newItems});
                                    }}
                                    className="w-full bg-transparent outline-none disabled:cursor-default"
                                />
                            </td>
                            <td className="py-4 text-right">{item.quantity}</td>
                            <td className="py-4 text-right">€{item.unitPrice.toFixed(2)}</td>
                            <td className="py-4 text-right font-bold">€{item.total.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mb-12">
                <div className="w-64 space-y-2">
                    <div className="flex justify-between text-gray-600">
                        <span>Subtotal (Net)</span>
                        <span>€{invoiceData.totalNet?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span>VAT (19%)</span>
                        <span>€{invoiceData.taxAmount?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-xl border-t-2 border-gray-800 pt-2">
                        <span>Total</span>
                        <span>€{invoiceData.totalGross?.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Footer / Bank Info */}
            <div className="border-t border-gray-200 pt-8 text-xs text-gray-500 flex justify-between">
                <div>
                    <p className="font-bold mb-1">Bank Information:</p>
                    <p>IBAN: {senderDetails.iban}</p>
                    <p>Tax ID: {senderDetails.taxId}</p>
                </div>
                <div className="text-right">
                    <p>Thank you for your business.</p>
                </div>
            </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end sticky bottom-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Cancel
            </button>
            <button 
                onClick={handleSimulatePdf}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-[#1C1F24] border border-gray-700 hover:bg-gray-700 text-white transition-colors flex items-center gap-2"
            >
                <Download className="w-4 h-4" />
                Save as PDF
            </button>
            {isEditing && (
                <button 
                    onClick={handleSave}
                    className="px-6 py-2 rounded-lg text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition-colors flex items-center gap-2"
                >
                    <Save className="w-4 h-4" />
                    Save Invoice
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default InvoiceModal;
