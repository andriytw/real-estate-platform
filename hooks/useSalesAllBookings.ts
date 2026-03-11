/**
 * Shared hook for Sales: builds allBookings for the Sales Rent Calendar grid and stats tiles.
 *
 * Business rule: Offer/Proforma/Payment flow is commercial pipeline logic. Calendar visibility is
 * occupancy logic. The Sales Rent Calendar must show only confirmed occupancy (real stays after
 * "Confirm payment"). It must NOT show offers, Sent offers, proformas, invoiced/payment-pending
 * states, or any pre-confirmation commercial state. Those remain visible in their sections
 * (Offers, Proformas, Payments).
 *
 * Therefore allBookings returned here contains ONLY confirmed bookings (from the bookings table,
 * created when the manager confirms payment). Reservations and offers are not included in the
 * calendar layer.
 */
import React from 'react';
import { Booking, ReservationData, OfferData, InvoiceData, CalendarEvent } from '../types';
import { getBookingStyle } from '../bookingUtils';

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

  // Sales Rent Calendar: only confirmed occupancy. No offers, reservations, or pre-confirmation states.
  const allBookings = React.useMemo(() => {
    return [...confirmedBookingsWithColors];
  }, [confirmedBookingsWithColors]);

  return { allBookings };
}
