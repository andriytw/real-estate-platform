
import React, { useState, useEffect, useMemo } from 'react';
import { X, Briefcase, Euro, CreditCard, Mail, Phone, MapPin, User, FileText, Send, Save, Building2, ChevronDown, FilePlus2, Trash2, Copy, Check, Calendar, ExternalLink } from 'lucide-react';
import { Booking, OfferData, BookingStatus, InvoiceData } from '../types';
import { ROOMS } from '../constants';
import { canCreateInvoice } from '../bookingUtils';
import { getMarketplaceBaseUrl, getMarketplaceUrlForProperty } from '../utils/marketplaceUrl';
import {
  type StayOverviewStayContext,
  buildCompactTimeline,
  computeNights,
  derivePaymentBadge,
  formatTimelineDate,
  getStayPhase,
  isBookingConfirmedForProtocol,
  resolveStayChain,
} from '../utils/stayOverviewFromBooking';
import { openUebergabeProtocolFromBooking } from '../utils/openUebergabeProtocolFromBooking';
import { openUrlInPreOpenedWindow } from '../utils/openUrlInPreOpenedWindow';

export type { StayOverviewStayContext } from '../utils/stayOverviewFromBooking';

interface BookingDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  onConvertToOffer?: (status: 'Draft' | 'Sent', company: string, email: string, phone: string, clientMessage: string) => void;
  onCreateInvoice?: (offer: OfferData) => void;
  onEdit?: () => void;
  onSendOffer?: () => void;
  onUpdateBookingStatus?: (bookingId: number, newStatus: BookingStatus) => void;
  onDeleteReservation?: (id: number | string) => Promise<void> | void;
  onDeleteOffer?: (offerId: string) => void;
  onDeleteBooking?: (bookingId: number | string) => Promise<void> | void;
  isViewingOffer?: boolean;
  /** Optional: offers/invoices/proofs from parent (e.g. calendar). Modal works fully without it. */
  stayContext?: StayOverviewStayContext | null;
  /** Toasts for async document errors (popups blocked, network, etc.). Falls back to alert if omitted. */
  onShowToast?: (message: string) => void;
  onOpenOffer?: (offer: OfferData) => void;
  onOpenProforma?: (proforma: InvoiceData) => void;
  onOpenInvoice?: (invoice: InvoiceData) => void;
}

const EMPTY_CHAIN = {
  offer: null,
  proforma: null,
  finalInvoice: null,
  sourceInvoice: null,
  currentProof: null,
} as const;

const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({
  isOpen,
  onClose,
  booking,
  onConvertToOffer,
  onCreateInvoice,
  onEdit,
  onSendOffer,
  onUpdateBookingStatus,
  onDeleteReservation,
  onDeleteOffer,
  onDeleteBooking,
  isViewingOffer,
  stayContext,
  onShowToast,
  onOpenOffer,
  onOpenProforma,
  onOpenInvoice,
}) => {
  const [selectedInternalCompany, setSelectedInternalCompany] = useState('Sotiso');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientMessage, setClientMessage] = useState('');
  const [copiedBookingNo, setCopiedBookingNo] = useState(false);
  const [copiedTechnicalKey, setCopiedTechnicalKey] = useState<string | null>(null);
  const [copiedMarketplaceUrl, setCopiedMarketplaceUrl] = useState(false);
  const [property, setProperty] = useState<any>(null);
  const [docActionLoading, setDocActionLoading] = useState<'protocol' | 'proof' | null>(null);

  const INTERNAL_COMPANIES = ['Sotiso', 'Wonowo', 'NowFlats'];

  const marketplaceBaseUrl = getMarketplaceBaseUrl();
  const getMarketplaceUrl = (prop: { marketplaceUrl?: string; id?: string } | null) =>
    getMarketplaceUrlForProperty(prop, marketplaceBaseUrl);

  const propertyIdToFetch = booking?.propertyId ?? booking?.roomId;
  useEffect(() => {
    if (propertyIdToFetch != null && propertyIdToFetch !== '') {
      const id = String(propertyIdToFetch);
      import('../services/supabaseService').then(({ propertiesService }) => {
        propertiesService.getById(id).then(setProperty).catch(() => setProperty(null));
      });
    } else {
      setProperty(null);
    }
  }, [propertyIdToFetch]);

  const ctxNormalized: StayOverviewStayContext = useMemo(
    () => ({
      offers: stayContext?.offers ?? [],
      invoices: stayContext?.invoices ?? [],
      paymentProofsByInvoiceId: stayContext?.paymentProofsByInvoiceId ?? {},
      confirmedBookingIds: stayContext?.confirmedBookingIds,
      getPaymentProofSignedUrl: stayContext?.getPaymentProofSignedUrl,
    }),
    [stayContext]
  );

  const resolvedChain = useMemo(() => {
    if (!booking) return { ...EMPTY_CHAIN };
    return resolveStayChain(booking, ctxNormalized);
  }, [booking, ctxNormalized]);

  const paymentBadge = useMemo(() => {
    if (!booking) return null;
    const inv = resolvedChain.sourceInvoice ?? resolvedChain.finalInvoice;
    return derivePaymentBadge(booking, inv);
  }, [booking, resolvedChain.sourceInvoice, resolvedChain.finalInvoice]);

  const timelineRows = useMemo(() => {
    if (!booking) return [];
    return buildCompactTimeline(booking, resolvedChain);
  }, [booking, resolvedChain]);

  const nights = booking ? computeNights(booking.start, booking.end) : null;
  const stayPhase = booking ? getStayPhase(booking) : 'upcoming';

  const displayName = useMemo(() => {
    if (!booking) return '';
    if (booking.clientType === 'Company' && booking.companyName && String(booking.companyName).trim()) {
      return String(booking.companyName).trim();
    }
    return booking.guest?.trim() ? booking.guest.trim() : 'Guest';
  }, [booking]);

  useEffect(() => {
    if (booking) {
      setClientEmail(booking.email || '');
      setClientPhone(booking.phone || '');
      const guestName =
        booking.firstName && booking.lastName
          ? `${booking.firstName} ${booking.lastName}`.trim()
          : booking.guest || 'Guest';
      const propertyName = property?.title || booking.roomId || 'the apartment';
      const checkInDate = booking.start
        ? (() => {
            try {
              return new Date(booking.start).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
            } catch {
              return booking.start;
            }
          })()
        : '';
      const checkOutDate = booking.end
        ? (() => {
            try {
              return new Date(booking.end).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
            } catch {
              return booking.end;
            }
          })()
        : '';
      const totalPrice = booking.totalGross || booking.price || '0.00 EUR';
      const bookingNo = booking.bookingNo || '';

      const marketplaceUrl = getMarketplaceUrl(property);
      const marketplaceLine = marketplaceUrl ? `View listing: ${marketplaceUrl}\n\n` : '';
      const template = `Hello ${guestName},

thank you for your interest in the apartment "${propertyName}".
${marketplaceLine}Your stay: ${checkInDate}${checkOutDate ? ` – ${checkOutDate}` : ''}
${bookingNo ? `Booking number: ${bookingNo}\n` : ''}Total price: ${totalPrice}

Please find the offer attached.

Best regards,
${selectedInternalCompany} Team`;

      setClientMessage(template);
    }
  }, [booking, property, selectedInternalCompany]);

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

  const handleDeleteReservation = async () => {
    if (!onDeleteReservation || !booking) return;

    const isReservation = (booking as any)?.isReservation === true;

    const reservationId = (booking as any)?.reservationId ?? (booking as any)?.id ?? booking?.id;

    if (!reservationId) {
      alert('No valid reservation to delete.');
      return;
    }

    console.log('[DELETE] isReservation', isReservation, 'id', reservationId, booking);

    const confirmed = window.confirm('Are you sure you want to delete this reservation? This action cannot be undone.');

    if (confirmed) {
      try {
        const result = onDeleteReservation(reservationId);
        if (result instanceof Promise) {
          await result;
        }
        onClose();
      } catch (error) {
        console.error('Error deleting reservation:', error);
        alert('Failed to delete reservation. Please try again.');
      }
    }
  };

  const copyTechnical = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedTechnicalKey(key);
    setTimeout(() => setCopiedTechnicalKey(null), 2000);
  };

  const statusColorRaw = booking.color ?? 'bg-gray-600';
  const statusBadgeTone =
    typeof statusColorRaw === 'string' && statusColorRaw.startsWith('bg-')
      ? statusColorRaw.replace('bg-', 'text-').replace('600', '400')
      : 'text-gray-400';

  const phaseLabel =
    stayPhase === 'upcoming' ? 'Upcoming' : stayPhase === 'in_house' ? 'In house' : 'Completed';

  const invoicedBadge =
    String(booking.status ?? '')
      .toLowerCase()
      .includes('invoic') ||
    !!resolvedChain.proforma ||
    !!resolvedChain.finalInvoice;

  const balanceStr = booking.balance != null ? String(booking.balance) : '';
  const balanceTone =
    balanceStr && balanceStr.startsWith('-')
      ? 'text-emerald-500'
      : balanceStr &&
          balanceStr.trim() !== '' &&
          !/^0[.,]0+\s*EUR$/i.test(balanceStr.trim().replace(/\s+/g, ' ')) &&
          !/^0\s*EUR$/i.test(balanceStr.trim().replace(/\s+/g, ' '))
        ? 'text-red-400'
        : 'text-gray-300';

  const unitLine =
    (booking.unit && String(booking.unit).trim()) ||
    ROOMS.find((r) => r.id === booking.roomId)?.name ||
    booking.roomId ||
    '—';

  const addressLine = booking.address && String(booking.address).trim() ? String(booking.address).trim() : '—';

  /** Close stay modal first, then open target UI (avoids stacked modals / batched state issues). */
  const fireThenClose = (fn: () => void) => {
    onClose();
    window.setTimeout(fn, 0);
  };

  const showUserError = (message: string) => {
    if (onShowToast) onShowToast(message);
    else window.alert(message);
  };

  const propertyIdForProtocol = booking.propertyId ?? booking.roomId ?? '';
  const protocolRowEnabled =
    Boolean(propertyIdForProtocol) &&
    isBookingConfirmedForProtocol(booking, ctxNormalized) &&
    !isViewingOffer;

  const openOfferDocument = () => {
    if (!resolvedChain.offer || !onOpenOffer) return;
    fireThenClose(() => onOpenOffer(resolvedChain.offer!));
  };

  const openProformaDocument = () => {
    const p = resolvedChain.proforma;
    if (!p) return;
    if (onOpenProforma) fireThenClose(() => onOpenProforma(p));
    else if (p.fileUrl && String(p.fileUrl).trim())
      window.open(String(p.fileUrl).trim(), '_blank', 'noopener,noreferrer');
  };

  const openInvoiceDocument = () => {
    const inv = resolvedChain.finalInvoice;
    if (!inv) return;
    const sameAsProforma =
      resolvedChain.proforma && String(inv.id) === String(resolvedChain.proforma.id);
    if (sameAsProforma) {
      if (onOpenProforma && resolvedChain.proforma) fireThenClose(() => onOpenProforma(resolvedChain.proforma!));
      else if (inv.fileUrl && String(inv.fileUrl).trim())
        window.open(String(inv.fileUrl).trim(), '_blank', 'noopener,noreferrer');
      return;
    }
    if (onOpenInvoice) fireThenClose(() => onOpenInvoice(inv));
    else if (inv.fileUrl && String(inv.fileUrl).trim())
      window.open(String(inv.fileUrl).trim(), '_blank', 'noopener,noreferrer');
  };

  const openProtocolDocument = () => {
    if (!propertyIdForProtocol) {
      showUserError('Property is not set for this stay — cannot open protocol.');
      return;
    }
    if (!protocolRowEnabled) {
      showUserError('Handover protocol is only available for confirmed stays from the rent calendar.');
      return;
    }
    const preOpened = window.open('', '_blank');
    setDocActionLoading('protocol');
    void openUebergabeProtocolFromBooking({
      bookingId: booking.id,
      propertyId: propertyIdForProtocol,
      preOpenedWindow: preOpened,
      showError: showUserError,
    }).finally(() => setDocActionLoading(null));
  };

  const openPaymentProofDocument = () => {
    const proof = resolvedChain.currentProof;
    const path = proof?.filePath;
    const getSigned = ctxNormalized.getPaymentProofSignedUrl;
    if (!path || !String(path).trim()) {
      showUserError('No payment proof file on record.');
      return;
    }
    if (!getSigned) {
      showUserError('Payment proof links are not available in this view. Open the stay from the Sales calendar.');
      return;
    }
    const preOpened = window.open('', '_blank');
    setDocActionLoading('proof');
    void openUrlInPreOpenedWindow(
      preOpened,
      () => getSigned(String(path).trim()),
      showUserError,
      'Could not get a link to the payment proof.'
    ).finally(() => setDocActionLoading(null));
  };

  const offerOpenable = Boolean(resolvedChain.offer && onOpenOffer);
  const proformaOpenable = Boolean(
    resolvedChain.proforma && (onOpenProforma || (resolvedChain.proforma.fileUrl && String(resolvedChain.proforma.fileUrl).trim()))
  );
  const finalInv = resolvedChain.finalInvoice;
  const invoiceSameAsProforma =
    finalInv && resolvedChain.proforma && String(finalInv.id) === String(resolvedChain.proforma.id);
  const invoiceOpenable = Boolean(
    finalInv &&
      (invoiceSameAsProforma
        ? onOpenProforma || (finalInv.fileUrl && String(finalInv.fileUrl).trim())
        : onOpenInvoice || (finalInv.fileUrl && String(finalInv.fileUrl).trim()))
  );
  const proofOpenable = Boolean(
    resolvedChain.currentProof?.filePath &&
      String(resolvedChain.currentProof.filePath).trim() &&
      ctxNormalized.getPaymentProofSignedUrl
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-start gap-3 sticky top-0 z-10">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-white">Stay overview</h3>
            <p className="text-xs text-gray-500 mt-0.5">Operational summary — technical IDs below in Technical info</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Hero — booking fields only; property title optional add-on */}
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${statusBadgeTone} bg-white/5 border border-white/10`}
                >
                  {String(booking.status ?? '—')}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-sky-300 bg-sky-500/10 border border-sky-500/25">
                  {phaseLabel}
                </span>
                {paymentBadge === 'paid' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-500/20">
                    Paid
                  </span>
                )}
                {paymentBadge === 'unpaid' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/10 border border-amber-500/20">
                    Unpaid
                  </span>
                )}
                {invoicedBadge && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-violet-300 bg-violet-500/10 border border-violet-500/20">
                    Invoiced
                  </span>
                )}
                {booking.bookingNo && (
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="font-mono">{booking.bookingNo}</span>
                    <button
                      type="button"
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
                {booking.internalCompany && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Building2 className="w-3 h-3" />
                    {booking.internalCompany}
                  </span>
                )}
                {booking.channel && (
                  <span className="text-[10px] text-gray-500">{booking.channel}</span>
                )}
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">{displayName}</h2>
                {property?.title && (
                  <p className="text-xs text-gray-500 mt-1 truncate" title={property.title}>
                    {property.title}
                  </p>
                )}
                <div className="flex items-start gap-2 text-sm text-gray-400 mt-2">
                  <Briefcase className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0">{unitLine}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-400 mt-1">
                  <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0">{addressLine}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 shrink-0">
              <div className="bg-[#111315] border border-gray-800 p-3 rounded-lg min-w-[120px]">
                <span className="text-[10px] text-gray-500 block mb-1">Check-in</span>
                <div className="font-semibold text-white text-sm">{booking.start || '—'}</div>
                <div className="text-[10px] text-emerald-500 font-mono mt-0.5">{booking.checkInTime || '—'}</div>
              </div>
              <div className="bg-[#111315] border border-gray-800 p-3 rounded-lg min-w-[120px]">
                <span className="text-[10px] text-gray-500 block mb-1">Check-out</span>
                <div className="font-semibold text-white text-sm">{booking.end || '—'}</div>
                <div className="text-[10px] text-red-400 font-mono mt-0.5">{booking.checkOutTime || '—'}</div>
              </div>
              <div className="bg-[#111315] border border-gray-800 p-3 rounded-lg min-w-[72px] flex flex-col justify-center">
                <span className="text-[10px] text-gray-500 block mb-1">Nights</span>
                <div className="font-semibold text-white text-sm">{nights != null ? nights : '—'}</div>
              </div>
            </div>
          </div>

          <div className="h-px bg-gray-800" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <Calendar className="w-3.5 h-3.5" /> Stay
                </h4>
                <div className="bg-[#111315] rounded-lg p-3 border border-gray-800 text-sm text-gray-300 space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Guests</span>
                    <span className="text-white text-right">{booking.guests || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Source</span>
                    <span className="text-white text-right">{booking.channel || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Unit / code</span>
                    <span className="text-white text-right break-all">{unitLine}</span>
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <User className="w-3.5 h-3.5" /> Contact
                </h4>
                <div className="space-y-2">
                  {booking.email ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                      <span className="text-white break-all">{booking.email}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No email</p>
                  )}
                  {booking.phone ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                      <span className="text-white">{booking.phone}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No phone</p>
                  )}
                  {booking.address && String(booking.address).trim() ? (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                      <span className="text-white">{booking.address}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <User className="w-3.5 h-3.5" /> Guest list
                </h4>
                <div className="bg-[#111315] rounded-lg p-3 border border-gray-800">
                  {booking.guestList && booking.guestList.length > 0 ? (
                    <ul className="space-y-1">
                      {booking.guestList.map((g, i) => (
                        <li key={i} className="text-sm text-white flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-gray-600 shrink-0" />
                          {g.firstName} {g.lastName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No guest list provided.</p>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <Euro className="w-3.5 h-3.5" /> Financials
                </h4>
                <div className="bg-[#111315] rounded-lg p-3 border border-gray-800 space-y-2">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-gray-400">Total</span>
                    <span className="text-white font-semibold">{booking.price || booking.totalGross || '—'}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-gray-400">Balance</span>
                    <span className={`font-semibold ${balanceTone}`}>{balanceStr || '—'}</span>
                  </div>
                  {!paymentBadge && (
                    <p className="text-[10px] text-gray-500 pt-1 border-t border-gray-800">
                      Payment status: use balance and linked documents — not enough data for a confident Paid/Unpaid badge.
                    </p>
                  )}
                  <div className="h-px bg-gray-800 my-1" />
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <CreditCard className="w-3 h-3 shrink-0" />
                    <span>{booking.paymentAccount || '—'}</span>
                  </div>
                  {resolvedChain.offer?.kaution != null && Number.isFinite(Number(resolvedChain.offer.kaution)) && (
                    <div className="flex justify-between gap-2 text-sm pt-1 border-t border-gray-800">
                      <span className="text-gray-400">Deposit (Kaution)</span>
                      <span className="text-white">{resolvedChain.offer.kaution} EUR</span>
                    </div>
                  )}
                  {resolvedChain.proforma?.kautionStatus && (
                    <div className="flex justify-between gap-2 text-xs pt-1">
                      <span className="text-gray-500">Deposit status</span>
                      <span className="text-gray-300">{resolvedChain.proforma.kautionStatus.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <FileText className="w-3.5 h-3.5" /> Documents
                </h4>
                <div className="bg-[#111315] rounded-lg p-3 border border-gray-800 space-y-2 text-sm">
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-gray-400 shrink-0">Offer</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-right text-gray-200 truncate text-xs">
                        {resolvedChain.offer
                          ? `Linked${resolvedChain.offer.offerNo ? ` · ${resolvedChain.offer.offerNo}` : ''}`
                          : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!offerOpenable}
                        onClick={openOfferDocument}
                        className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600/80 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-gray-400 shrink-0">Proforma</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-right text-gray-200 truncate text-xs">
                        {resolvedChain.proforma
                          ? `${resolvedChain.proforma.invoiceNumber ?? 'Proforma'}`
                          : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!proformaOpenable}
                        onClick={openProformaDocument}
                        className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold bg-violet-600/80 hover:bg-violet-500 disabled:opacity-40 disabled:pointer-events-none text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-gray-400 shrink-0">Invoice</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-right text-gray-200 truncate text-xs">
                        {invoiceSameAsProforma
                          ? 'Same as proforma'
                          : finalInv
                            ? `${finalInv.invoiceNumber ?? 'Invoice'} · ${finalInv.status}`
                            : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!invoiceOpenable}
                        onClick={openInvoiceDocument}
                        className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-600/80 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-gray-400 shrink-0">Payment proof</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-right text-gray-200 truncate text-xs">
                        {resolvedChain.currentProof?.filePath
                          ? ctxNormalized.getPaymentProofSignedUrl
                            ? resolvedChain.currentProof.documentNumber ?? 'PDF'
                            : 'File on record — open from calendar for link'
                          : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!proofOpenable || docActionLoading === 'proof'}
                        onClick={openPaymentProofDocument}
                        className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold bg-sky-600/80 hover:bg-sky-500 disabled:opacity-40 disabled:pointer-events-none text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {docActionLoading === 'proof' ? '…' : 'Open'}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-gray-400 shrink-0">Handover protocol (ÜGP)</span>
                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <span className="text-right text-gray-200 truncate text-xs">
                        {protocolRowEnabled ? 'DOCX' : '—'}
                      </span>
                      <button
                        type="button"
                        disabled={!protocolRowEnabled || docActionLoading === 'protocol'}
                        onClick={openProtocolDocument}
                        className="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-40 disabled:pointer-events-none text-white inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {docActionLoading === 'protocol' ? '…' : 'Open'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <section>
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Activity</h4>
            {timelineRows.length === 0 ? (
              <p className="text-[11px] text-gray-500">No dated activity yet.</p>
            ) : (
              <ul className="space-y-1 border border-gray-800/80 rounded-lg bg-[#111315]/50 p-2">
                {timelineRows.map((row, idx) => (
                  <li key={`${row.label}-${idx}`} className="flex justify-between gap-2 text-[11px] text-gray-400">
                    <span className="text-gray-300">{row.label}</span>
                    <span className="text-gray-500 shrink-0 tabular-nums">
                      {row.at ? formatTimelineDate(row.at) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-1.5">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Notes
            </h4>
            <div className="bg-[#111315]/80 p-3 rounded-lg border border-gray-800/80 text-xs text-gray-400">
              {booking.comments || 'No comments.'}
            </div>
          </section>

          <details className="group border border-gray-800 rounded-lg bg-[#111315]/40 px-3 py-2">
            <summary className="text-[10px] font-semibold text-gray-500 cursor-pointer list-none flex items-center justify-between">
              <span>Technical info</span>
              <ChevronDown className="w-3 h-3 text-gray-600 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 space-y-1.5 text-[10px] font-mono text-gray-500 pb-1">
              {[
                ['Booking ID', String(booking.id)],
                ['Source offer ID', booking.sourceOfferId ? String(booking.sourceOfferId) : ''],
                ['Source invoice ID', booking.sourceInvoiceId ? String(booking.sourceInvoiceId) : ''],
                ['Source reservation ID', booking.sourceReservationId ? String(booking.sourceReservationId) : ''],
              ].map(([label, val]) =>
                val ? (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-gray-600 shrink-0">{label}</span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="truncate text-right" title={val}>
                        {val}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyTechnical(label, val)}
                        className="p-0.5 rounded text-gray-500 hover:text-white shrink-0"
                        title="Copy"
                      >
                        {copiedTechnicalKey === label ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </details>

          {onConvertToOffer && (
            <div className="bg-[#161B22] border border-gray-800 rounded-lg p-5">
              <h4 className="text-sm font-bold text-emerald-500 mb-4 flex items-center gap-2">
                <Send className="w-4 h-4" /> Convert to Offer
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                    <Building2 className="w-3 h-3 text-emerald-500" /> Issuing Company{' '}
                    <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedInternalCompany}
                      onChange={(e) => setSelectedInternalCompany(e.target.value)}
                      className="w-full appearance-none bg-[#111315] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none cursor-pointer"
                    >
                      {INTERNAL_COMPANIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                    <Mail className="w-3 h-3 text-emerald-500" /> Recipient Email{' '}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    placeholder="client@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                    <Phone className="w-3 h-3 text-emerald-500" /> Recipient Phone{' '}
                    <span className="text-gray-500 text-xs">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full bg-[#111315] border border-gray-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    placeholder="+49 123 456 789"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-2">
                    <FileText className="w-3 h-3 text-emerald-500" /> Message to client{' '}
                    <span className="text-red-400">*</span>
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

          {getMarketplaceUrl(property) && (() => {
            const marketplaceUrl = getMarketplaceUrl(property)!;
            return (
              <div className="bg-[#111315] border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-gray-500 block mb-1">Marketplace Listing</span>
                    <a
                      href={marketplaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-400 hover:text-emerald-300 truncate block"
                    >
                      {marketplaceUrl}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(marketplaceUrl);
                        setCopiedMarketplaceUrl(true);
                        setTimeout(() => setCopiedMarketplaceUrl(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-xs"
                      title="Copy URL"
                    >
                      {copiedMarketplaceUrl ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <a
                      href={marketplaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-xs"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="p-4 sm:p-5 border-t border-gray-800 bg-[#161B22] space-y-3">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</h4>
          <div className="flex flex-wrap items-center gap-2">
            {onConvertToOffer && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save as Offer
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndSend}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Save & Send
                </button>
              </>
            )}
            {onCreateInvoice && isViewingOffer && booking && canCreateInvoice((booking as any).status) && (
              <button
                type="button"
                onClick={() => onCreateInvoice(booking as OfferData)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
              >
                <FilePlus2 className="w-4 h-4" />
                Add Proforma
              </button>
            )}
            {!onConvertToOffer && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Close
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-900/25">
            {onDeleteOffer && isViewingOffer && booking && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this offer? This action cannot be undone.')) {
                    onDeleteOffer(String(booking.id));
                    onClose();
                  }
                }}
                className="px-4 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Offer
              </button>
            )}
            {onDeleteReservation &&
              !isViewingOffer &&
              (() => {
                const isReservation = (booking as any)?.isReservation === true;
                return isReservation ? (
                  <button
                    type="button"
                    onClick={handleDeleteReservation}
                    className="px-4 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Reservation
                  </button>
                ) : null;
              })()}
            {onDeleteBooking && !isViewingOffer && !(booking as any)?.isReservation && (
              <button
                type="button"
                onClick={async () => {
                  if (!booking?.id) return;
                  if (!window.confirm('Видалити підтверджене бронювання з календаря? Цю дію не можна скасувати.'))
                    return;
                  try {
                    const result = onDeleteBooking(booking.id);
                    if (result instanceof Promise) await result;
                    onClose();
                  } catch (e) {
                    console.error('Error deleting booking:', e);
                    alert('Не вдалося видалити бронювання.');
                  }
                }}
                className="px-4 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Видалити бронювання
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailsModal;
