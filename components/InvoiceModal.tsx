
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { X, Save, FileText, Download, Edit2, Check, Upload } from 'lucide-react';
import { OfferData, InvoiceData, CompanyDetails, ReservationData } from '../types';
import { INTERNAL_COMPANIES_DATA } from '../constants';
import { invoicesService } from '../services/supabaseService';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer?: OfferData | null;
  invoice?: InvoiceData | null;
  /** Parent proforma when adding an invoice under a proforma */
  proforma?: InvoiceData | null;
  onSave: (invoice: InvoiceData) => void;
  reservations?: ReservationData[];
  offers?: OfferData[];
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, offer, invoice, proforma, onSave, reservations = [], offers = [] }) => {
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
  /** PDF file for Add Proforma / Add Invoice flows (required) */
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  /** Blob URL for PDF preview in Add Proforma / Add Invoice */
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Create blob URL for PDF preview immediately so iframe shows on first paint
  useLayoutEffect(() => {
    if (!isOpen) {
      setPdfPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    if (!pdfFile) {
      setPdfPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(pdfFile);
    setPdfPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    return () => URL.revokeObjectURL(url);
  }, [isOpen, pdfFile]);

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
        setPdfFile(null);

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

        // Визначити bookingId та offerIdSource
        // Покращена логіка для всіх випадків
        let bookingId: string | number | undefined;
        let offerIdSource: string | undefined;
        
        // Перевірити чи це ReservationData (має roomId та start/end)
        if ('roomId' in offer && 'start' in offer) {
            // Це резервація - використати її id як bookingId
            bookingId = (offer as any).id;
            // #region agent log
            console.log('✅ InvoiceModal: Found reservation, using id as bookingId:', bookingId);
            fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceModal.tsx:74',message:'Found reservation, using id as bookingId',data:{bookingId,offerId:offer.id,offerIdType:typeof offer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'INVOICE_CREATE'})}).catch(()=>{});
            // #endregion
        } else if ('id' in offer && offer.id) {
            // Це OfferData - використати id як offerIdSource (для RPC)
            offerIdSource = String(offer.id);
            // Також використати як bookingId для backward compatibility
            if (typeof offer.id === 'number') {
                bookingId = offer.id;
            } else {
                const numId = Number(offer.id);
                bookingId = !isNaN(numId) ? numId : offer.id;
            }
            // #region agent log
            console.log('✅ InvoiceModal: Using offer.id as offerIdSource:', offerIdSource);
            fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceModal.tsx:78',message:'Using offer.id as offerIdSource',data:{bookingId,offerIdSource,offerId:offer.id,offerIdType:typeof offer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'INVOICE_CREATE'})}).catch(()=>{});
            // #endregion
        }
        
        // Якщо bookingId все ще undefined, спробувати знайти reservation за propertyId та dates
        if (!bookingId && reservations && reservations.length > 0) {
            // Try to find reservation by matching offer's propertyId and dates
            if ('propertyId' in offer && offer.propertyId && 'dates' in offer && offer.dates) {
                const [offerStart] = offer.dates.split(' to ');
                const matchingReservation = reservations.find(r => {
                    // Match by propertyId (roomId)
                    if (r.roomId !== offer.propertyId && String(r.roomId) !== String(offer.propertyId)) {
                        return false;
                    }
                    // Match by start date
                    return r.start === offerStart || String(r.start) === String(offerStart);
                });
                
                if (matchingReservation) {
                    bookingId = matchingReservation.id;
                    // #region agent log
                    console.log('✅ InvoiceModal: Found reservation by propertyId and dates, setting bookingId:', bookingId);
                    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceModal.tsx:103',message:'Found reservation by propertyId and dates, setting bookingId',data:{bookingId,bookingIdType:typeof bookingId,offerId:offer.id,offerPropertyId:offer.propertyId,offerStart,reservationId:matchingReservation.id,reservationRoomId:matchingReservation.roomId,reservationStart:matchingReservation.start},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'INVOICE_CREATE'})}).catch(()=>{});
                    // #endregion
                } else {
                    // #region agent log
                    console.warn('⚠️ InvoiceModal: No matching reservation found by propertyId and dates', { offerPropertyId: offer.propertyId, offerStart, reservationsCount: reservations.length });
                    fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceModal.tsx:111',message:'No matching reservation found by propertyId and dates',data:{offerId:offer.id,offerPropertyId:offer.propertyId,offerStart,reservationsCount:reservations.length,reservationPropertyIds:reservations.map(r=>({id:r.id,roomId:r.roomId,start:r.start}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'INVOICE_CREATE'})}).catch(()=>{});
                    // #endregion
                }
            }
        }
        
        // Final check: if bookingId is still undefined, log error
        if (!bookingId) {
            // #region agent log
            console.error('❌ InvoiceModal: bookingId is undefined after all checks!', { offerId: offer.id, offerType: typeof offer, hasRoomId: 'roomId' in offer, hasStart: 'start' in offer, hasPropertyId: 'propertyId' in offer, hasDates: 'dates' in offer, reservationsAvailable: reservations?.length || 0 });
            fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceModal.tsx:120',message:'❌ CRITICAL: bookingId is undefined after all checks',data:{offerId:offer.id,offerIdType:typeof offer.id,hasRoomId:'roomId' in offer,hasStart:'start' in offer,hasPropertyId:'propertyId' in offer,hasDates:'dates' in offer,offerKeys:Object.keys(offer),reservationsAvailable:reservations?.length || 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'INVOICE_CREATE'})}).catch(()=>{});
            // #endregion
        }

        // Визначити dates - для резервації використати start/end, для offer - dates
        const dates = 'dates' in offer ? offer.dates : (`${(offer as any).start} to ${(offer as any).end}`);

        const isProformaMode = !proforma;
        setInvoiceData({
          id: Date.now().toString(), // New ID
          invoiceNumber: isProformaMode ? `PRO-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}` : `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
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
          offerId: 'id' in offer ? String(offer.id) : undefined, // Primary field for RPC
          offerIdSource: 'id' in offer ? String(offer.id) : undefined, // Legacy field for backward compatibility
          bookingId: bookingId,
          documentType: 'proforma',
        });
        
        // #region agent log
        console.log('📋 InvoiceModal: Setting invoiceData with:', { bookingId, offerIdSource: 'id' in offer ? String(offer.id) : undefined, offerId: offer.id, offerIdType: typeof offer.id });
        fetch('http://127.0.0.1:7243/ingest/3536f1c8-286e-409c-836c-4604f4d74f53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InvoiceModal.tsx:115',message:'Setting invoiceData with bookingId and offerIdSource',data:{bookingId,bookingIdType:typeof bookingId,offerIdSource:'id' in offer ? String(offer.id) : undefined,offerId:offer.id,offerIdType:typeof offer.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'INVOICE_CREATE'})}).catch(()=>{});
        // #endregion
        
        setClientAddress(offer.address || '');
        setIsEditing(true); // Default to edit mode for new invoices
        setPdfFile(null);
      } else if (proforma && !invoice) {
        // CASE 3: Adding Invoice under a Proforma
        const companyKey = proforma.internalCompany || 'Sotiso';
        const companyData = INTERNAL_COMPANIES_DATA[companyKey] || INTERNAL_COMPANIES_DATA['Sotiso'];
        setSenderDetails(companyData);
        setInvoiceData({
          id: Date.now().toString(),
          invoiceNumber: `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`,
          date: new Date().toISOString().split('T')[0],
          dueDate: proforma.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          internalCompany: proforma.internalCompany,
          clientName: proforma.clientName,
          clientAddress: proforma.clientAddress || '',
          items: proforma.items || [],
          totalNet: proforma.totalNet ?? 0,
          taxAmount: proforma.taxAmount ?? 0,
          totalGross: proforma.totalGross ?? 0,
          status: 'Unpaid',
          documentType: 'invoice',
          proformaId: proforma.id,
          offerId: proforma.offerId,
          offerIdSource: proforma.offerIdSource ?? proforma.offerId,
          bookingId: proforma.bookingId,
        });
        setClientAddress(proforma.clientAddress || '');
        setIsEditing(true);
        setPdfFile(null);
      }
    }
  }, [offer, invoice, proforma, isOpen]);

  const isAddProformaMode = Boolean(offer && !invoice && !proforma);
  const isAddInvoiceToProformaMode = Boolean(proforma && !invoice);

  const handleSave = async () => {
    if (!invoiceData || !senderDetails) return;
    let fileUrl: string | undefined;
    if ((isAddProformaMode || isAddInvoiceToProformaMode) && pdfFile) {
      setUploading(true);
      try {
        const prefix = isAddInvoiceToProformaMode && proforma ? `proforma-${proforma.id}` : 'proforma';
        fileUrl = await invoicesService.uploadInvoicePdf(pdfFile, prefix);
      } catch (e) {
        console.error('PDF upload failed:', e);
        alert('Failed to upload PDF. Please try again.');
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    if ((isAddProformaMode || isAddInvoiceToProformaMode) && !fileUrl) {
      alert('Please attach a PDF file before saving.');
      return;
    }
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
      offerId: invoiceData.offerId,
      bookingId: invoiceData.bookingId,
      fileUrl: fileUrl ?? invoiceData.fileUrl,
      documentType: invoiceData.documentType,
      proformaId: invoiceData.proformaId,
    };
    onSave(finalInvoice);
  };

  const handleSimulatePdf = () => {
      alert(`Downloading PDF for Invoice #${invoiceData.invoiceNumber}... (Simulation)`);
  };

  if (!isOpen || !senderDetails) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className={`bg-[#1C1F24] w-full max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200 ${(isAddProformaMode || isAddInvoiceToProformaMode) ? 'max-w-5xl' : 'max-w-4xl'}`}>
        
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-3">
             <div className="bg-purple-500/10 p-2 rounded text-purple-500"><FileText className="w-5 h-5" /></div>
             <div>
                <h3 className="text-xl font-bold text-white">
                  {invoice ? 'View Invoice' : isAddProformaMode ? 'Add Proforma' : isAddInvoiceToProformaMode ? 'Add Invoice' : 'Create Invoice'}
                </h3>
                <p className="text-xs text-gray-400">{invoiceData.invoiceNumber}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
             {!(isAddProformaMode || isAddInvoiceToProformaMode) && (
               <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className={`p-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${isEditing ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
               >
                  {isEditing ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                  {isEditing ? 'Done Editing' : 'Edit'}
               </button>
             )}
             <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg transition-colors">
                <X className="w-5 h-5" />
             </button>
          </div>
        </div>

        {(isAddProformaMode || isAddInvoiceToProformaMode) ? (
          /* Two columns: left = compact fields, right = PDF upload + preview */
          <div className="p-4 bg-[#1C1F24] text-white flex gap-4 h-[520px] min-h-[480px]">
            {/* Left: compact fields */}
            <div className="flex-shrink-0 w-[280px] flex flex-col gap-2 overflow-y-auto">
              <label className="text-[10px] font-medium text-gray-400">
                {isAddProformaMode ? 'Proforma number' : 'Invoice number'}
              </label>
              <input
                value={invoiceData.invoiceNumber}
                onChange={e => setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })}
                className="w-full bg-[#111315] border border-gray-700 rounded px-2 py-1.5 text-xs text-white font-mono"
                placeholder={isAddProformaMode ? 'PRO-2026-00001' : 'INV-2026-00001'}
              />
              {offer && (
                <div className="mt-1 space-y-0.5 text-[10px]">
                  {[
                    ['Client', invoiceData.clientName || (offer as any).guest],
                    ['Date', invoiceData.date],
                    ['Amount', invoiceData.totalGross != null ? `€${invoiceData.totalGross.toFixed(2)}` : (offer as any).price],
                    ['Email', (offer as any).email],
                    ['Phone', (offer as any).phone],
                    ['Address', invoiceData.clientAddress || (offer as any).address],
                    ['Dates', offer.dates || ((offer as any).start && (offer as any).end ? `${(offer as any).start} – ${(offer as any).end}` : '')],
                    ['Check-in', (offer as any).checkInTime],
                    ['Check-out', (offer as any).checkOutTime],
                    ['Guests', (offer as any).guests],
                    ['Unit', (offer as any).unit || (offer as any).propertyId || (offer as any).roomId],
                    ['Res/Offer No', (offer as any).reservationNo || (offer as any).offerNo || (offer as any).bookingNo],
                    ['Company', (offer as any).company || (offer as any).companyName],
                    ['Rate plan', (offer as any).ratePlan],
                    ['Guarantee', (offer as any).guarantee],
                    ['Comments', (offer as any).comments],
                  ].filter(([, v]) => v != null && String(v).trim() !== '').map(([label, value]) => (
                    <div key={String(label)} className="flex gap-1.5 truncate">
                      <span className="text-gray-500 flex-shrink-0">{label}:</span>
                      <span className="text-white truncate" title={String(value)}>{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!offer && (
                <div className="mt-1 space-y-0.5 text-[10px]">
                  <div className="flex gap-1.5"><span className="text-gray-500">Client:</span> <span className="text-white">{invoiceData.clientName}</span></div>
                  <div className="flex gap-1.5"><span className="text-gray-500">Date:</span> <span className="text-white">{invoiceData.date}</span></div>
                  <div className="flex gap-1.5"><span className="text-gray-500">Amount:</span> <span className="text-white">€{invoiceData.totalGross?.toFixed(2) ?? '—'}</span></div>
                </div>
              )}
            </div>
            {/* Right: PDF upload + preview */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 border border-gray-700 rounded-lg overflow-hidden bg-[#111315]">
              <label className="text-[10px] font-medium text-gray-400 px-2 pt-2 flex-shrink-0">PDF file <span className="text-red-400">*</span></label>
              {!pdfFile ? (
                <div
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-purple-500'); }}
                  onDragLeave={e => { e.currentTarget.classList.remove('border-purple-500'); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-purple-500');
                    const f = e.dataTransfer.files[0];
                    if (f && f.type === 'application/pdf') setPdfFile(f);
                  }}
                  className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded m-2 min-h-[200px] hover:border-gray-600 transition-colors"
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    id="invoice-pdf-upload"
                    onChange={e => { const f = e.target.files?.[0]; if (f && f.type === 'application/pdf') setPdfFile(f); }}
                  />
                  <label htmlFor="invoice-pdf-upload" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-gray-500" />
                    <span className="text-xs text-gray-400">Drop PDF or click</span>
                  </label>
                </div>
              ) : (
                <>
                  <div className="px-2 pb-1 flex items-center gap-2 flex-shrink-0">
                    <span className="text-emerald-400 text-xs truncate flex-1">{pdfFile.name}</span>
                    <label className="text-[10px] text-gray-400 cursor-pointer hover:text-white" htmlFor="invoice-pdf-upload">Change</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      id="invoice-pdf-upload"
                      onChange={e => { const f = e.target.files?.[0]; if (f && f.type === 'application/pdf') setPdfFile(f); }}
                    />
                  </div>
                  <div className="flex-1 min-h-[320px] relative bg-[#0d0f11]">
                    {pdfPreviewUrl && (
                      <iframe
                        src={pdfPreviewUrl}
                        title="PDF preview"
                        className="absolute inset-0 w-full h-full border-0 rounded"
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
        /* Body - Invoice Layout */
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
        )}

        {/* Footer Actions */}
        <div className="p-5 border-t border-gray-800 bg-[#161B22] flex gap-3 justify-end sticky bottom-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                Cancel
            </button>
            {!(isAddProformaMode || isAddInvoiceToProformaMode) && (
              <button 
                  onClick={handleSimulatePdf}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-[#1C1F24] border border-gray-700 hover:bg-gray-700 text-white transition-colors flex items-center gap-2"
              >
                  <Download className="w-4 h-4" />
                  Save as PDF
              </button>
            )}
            {((isAddProformaMode || isAddInvoiceToProformaMode) ? true : isEditing) && (
                <button 
                    onClick={handleSave}
                    disabled={(isAddProformaMode || isAddInvoiceToProformaMode) && (!pdfFile || uploading)}
                    className="px-6 py-2 rounded-lg text-sm font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save className="w-4 h-4" />
                    {uploading ? 'Uploading…' : (isAddProformaMode || isAddInvoiceToProformaMode) ? 'Save' : 'Зберегти і відправити'}
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default InvoiceModal;
