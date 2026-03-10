/**
 * Shared hook: builds allBookings (confirmed + reservations + offers) for Sales calendar grid and stats tiles.
 * Single source of truth — used by SalesCalendar and SalesStatsSection to avoid duplicate logic.
 */
import React from 'react';
import { Booking, ReservationData, OfferData, InvoiceData, CalendarEvent } from '../types';
import { BookingStatus } from '../types';
import { getBookingStyle } from '../bookingUtils';

function getReservationLabel(r: ReservationData): string {
  if (r.internalCompany && r.internalCompany.trim() && r.internalCompany !== 'N/A') return r.internalCompany.trim();
  if (r.companyName && r.companyName.trim() && r.companyName !== 'N/A') return r.companyName.trim();
  if (r.company && r.company.trim() && r.company !== 'N/A') return r.company.trim();
  if ((r as any).leadLabel && (r as any).leadLabel.trim()) return (r as any).leadLabel.trim();
  if (r.firstName || r.lastName) {
    const name = `${r.firstName || ''} ${r.lastName || ''}`.trim();
    if (name) return name;
  }
  if ((r as any).clientFirstName || (r as any).clientLastName) {
    const name = `${(r as any).clientFirstName || ''} ${(r as any).clientLastName || ''}`.trim();
    if (name) return name;
  }
  if (r.guest && r.guest.trim() && r.guest !== 'N/A' && r.guest !== 'Guest') return r.guest.trim();
  if (r.email && r.email.trim()) return r.email.trim();
  if (r.phone && r.phone.trim()) return r.phone.trim();
  return `Reservation #${r.id}`;
}

export interface UseSalesAllBookingsParams {
  reservations: ReservationData[];
  offers: OfferData[];
  confirmedBookings: Booking[];
  invoices: InvoiceData[];
  adminEvents: CalendarEvent[];
}

export function useSalesAllBookings({
  reservations,
  offers,
  confirmedBookings,
  invoices,
  adminEvents,
}: UseSalesAllBookingsParams): { allBookings: Booking[] } {
  const confirmedBookingsWithColors = React.useMemo(
    () => confirmedBookings.map(b => ({ ...b, color: getBookingStyle(b.status), isConfirmed: true })),
    [confirmedBookings]
  );

  const reservationItems = React.useMemo((): Booking[] => {
    const active = reservations.filter(
      r => r.status !== 'lost' && r.status !== 'won' && r.status !== 'cancelled'
    );
    return active.map(reservation => ({
      id: reservation.id,
      roomId: reservation.roomId,
      propertyId: reservation.propertyId,
      start: reservation.start,
      end: reservation.end,
      guest: getReservationLabel(reservation),
      status: reservation.status as any,
      color: getBookingStyle(reservation.status as any),
      checkInTime: reservation.checkInTime || '15:00',
      checkOutTime: reservation.checkOutTime || '11:00',
      price: reservation.price || '0.00 EUR',
      balance: reservation.balance || '0.00 EUR',
      guests: reservation.guests || '1 Guest',
      unit: reservation.unit || 'AUTO-UNIT',
      comments: reservation.comments || 'Reservation',
      paymentAccount: reservation.paymentAccount || 'Pending',
      company: reservation.company || 'N/A',
      ratePlan: reservation.ratePlan || 'Standard',
      guarantee: reservation.guarantee || 'None',
      cancellationPolicy: reservation.cancellationPolicy || 'Standard',
      noShowPolicy: reservation.noShowPolicy || 'Standard',
      channel: reservation.channel || 'Manual',
      type: reservation.type || 'GUEST',
      address: reservation.address,
      phone: reservation.phone,
      email: reservation.email,
      pricePerNight: reservation.pricePerNight,
      taxRate: reservation.taxRate,
      totalGross: reservation.totalGross,
      guestList: reservation.guestList || [],
      clientType: reservation.clientType,
      firstName: reservation.firstName,
      lastName: reservation.lastName,
      companyName: reservation.companyName,
      internalCompany: reservation.internalCompany,
      createdAt: reservation.createdAt,
      isReservation: true,
      reservationId: reservation.id,
    })) as Booking[];
  }, [reservations]);

  const offerBookings: Booking[] = React.useMemo(() => {
    return offers
      .filter(offer => !offer.reservationId)
      .map(offer => {
        const parts = offer.dates.split(' to ');
        const start = parts[0];
        const end = parts[1] || start;
        const linkedReservation = reservations.find(r =>
          String(r.id) === String(offer.id) || r.id === Number(offer.id)
        );
        if (linkedReservation && linkedReservation.status) {
          const bookingStatus = linkedReservation.status;
          const statusText = String(bookingStatus).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const colorClass = getBookingStyle(bookingStatus);
          return {
            id: Number(offer.id) || Date.now(),
            roomId: offer.propertyId,
            start,
            end,
            guest: offer.clientName + (statusText !== 'Offer Sent' && statusText !== 'Draft' ? ` (${statusText})` : ' (Offer)'),
            color: colorClass,
            checkInTime: offer.checkInTime || '15:00',
            checkOutTime: offer.checkOutTime || '11:00',
            status: bookingStatus,
            price: offer.price,
            balance: '0.00 EUR',
            guests: offer.guests || '-',
            unit: offer.unit || '-',
            comments: offer.comments || 'Converted from Offer',
            paymentAccount: 'Pending',
            company: 'N/A',
            internalCompany: offer.internalCompany,
            ratePlan: '-',
            guarantee: '-',
            cancellationPolicy: '-',
            noShowPolicy: '-',
            channel: 'Direct',
            type: 'GUEST',
            address: offer.address || '-',
            phone: offer.phone || '-',
            email: offer.email || '-',
            guestList: offer.guestList || [],
          } as Booking;
        }
        const linkedInvoice = invoices.find(inv => inv.offerIdSource === offer.id || inv.offerIdSource === String(offer.id));
        const isPaid = linkedInvoice?.status === 'Paid';
        let bookingStatus: BookingStatus | string = BookingStatus.OFFER_SENT;
        let statusText: string = offer.status;
        if (linkedInvoice) {
          if (isPaid) {
            const moveOutTask = adminEvents.find(e =>
              e.propertyId === offer.propertyId && e.type === 'Auszug' && e.date === end &&
              e.bookingId === (linkedInvoice.bookingId || offer.id)
            );
            const moveInTask = adminEvents.find(e =>
              e.propertyId === offer.propertyId && e.type === 'Einzug' && e.date === start &&
              e.bookingId === (linkedInvoice.bookingId || offer.id)
            );
            if (moveOutTask && moveOutTask.status === 'verified') {
              bookingStatus = BookingStatus.COMPLETED;
              statusText = 'Completed';
            } else if (moveInTask && moveInTask.status === 'verified') {
              bookingStatus = BookingStatus.CHECK_IN_DONE;
              statusText = 'Checked In';
            } else {
              bookingStatus = BookingStatus.PAID;
              statusText = 'Paid';
            }
          } else {
            bookingStatus = BookingStatus.INVOICED;
            statusText = 'Invoiced';
          }
        } else if (offer.status === 'Sent') {
          bookingStatus = BookingStatus.OFFER_SENT;
          statusText = 'Offer Sent';
        } else if (offer.status === 'Draft') {
          bookingStatus = BookingStatus.OFFER_PREPARED;
          statusText = 'Draft';
        }
        const colorClass = getBookingStyle(bookingStatus);
        return {
          id: Number(offer.id) || Date.now(),
          roomId: offer.propertyId,
          start,
          end,
          guest: offer.clientName + (statusText !== 'Sent' && statusText !== 'Draft' ? ` (${statusText})` : ' (Offer)'),
          color: colorClass,
          checkInTime: offer.checkInTime || '15:00',
          checkOutTime: offer.checkOutTime || '11:00',
          status: bookingStatus,
          price: offer.price,
          balance: '0.00 EUR',
          guests: offer.guests || '-',
          unit: offer.unit || '-',
          comments: offer.comments || 'Converted from Offer',
          paymentAccount: 'Pending',
          company: 'N/A',
          internalCompany: offer.internalCompany,
          ratePlan: '-',
          guarantee: '-',
          cancellationPolicy: '-',
          noShowPolicy: '-',
          channel: 'Direct',
          type: 'GUEST',
          address: offer.address || '-',
          phone: offer.phone || '-',
          email: offer.email || '-',
          guestList: offer.guestList || [],
        } as Booking;
      });
  }, [offers, reservations, invoices, adminEvents]);

  const allBookings = React.useMemo(() => {
    return [
      ...confirmedBookingsWithColors,
      ...reservationItems,
      ...offerBookings,
    ];
  }, [confirmedBookingsWithColors, reservationItems, offerBookings]);

  return { allBookings };
}
