import { BookingStatus } from './types';

/**
 * Отримує клас кольору для бронювання на основі статусу
 * @param status - Статус бронювання
 * @returns Tailwind CSS класи для кольору
 */
export function getBookingColor(status: BookingStatus | string): string {
  // Підтримка старого формату для сумісності
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  
  switch (normalizedStatus) {
    case BookingStatus.RESERVED:
      return 'bg-blue-600';
    
    case BookingStatus.OFFER_PREPARED:
    case BookingStatus.OFFER_SENT:
      return 'bg-blue-600';
    
    case BookingStatus.INVOICED:
      return 'bg-blue-600';
    
    case BookingStatus.PAID:
      return 'bg-emerald-600';
    
    case BookingStatus.CHECK_IN_DONE:
      return 'bg-yellow-500';
    
    case BookingStatus.COMPLETED:
      return 'bg-gray-500 opacity-50';
    
    default:
      // Для невідомих статусів або старих форматів
      return 'bg-blue-500';
  }
}

/**
 * Отримує стиль border для бронювання на основі статусу
 * @param status - Статус бронювання
 * @returns Tailwind CSS класи для border
 */
export function getBookingBorderStyle(status: BookingStatus | string): string {
  // Підтримка старого формату для сумісності
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  
  switch (normalizedStatus) {
    case BookingStatus.RESERVED:
      return 'border-2 border-solid';
    
    case BookingStatus.OFFER_PREPARED:
    case BookingStatus.OFFER_SENT:
      return 'border-2 border-dashed';
    
    case BookingStatus.INVOICED:
      return 'border-2 border-solid';
    
    case BookingStatus.PAID:
      return 'border-2 border-solid';
    
    case BookingStatus.CHECK_IN_DONE:
      return 'border-2 border-solid';
    
    case BookingStatus.COMPLETED:
      return 'border-2 border-solid';
    
    default:
      return 'border-2 border-solid';
  }
}

/**
 * Отримує повний клас стилю для бронювання (колір + border)
 * @param status - Статус бронювання
 * @returns Повний рядок Tailwind CSS класів
 */
export function getBookingStyle(status: BookingStatus | string): string {
  const color = getBookingColor(status);
  const border = getBookingBorderStyle(status);
  return `${color} ${border}`.trim();
}

/**
 * Перевіряє чи статус дозволяє відображати бронювання в підрозділі Reservations
 * @param status - Статус бронювання
 * @returns true якщо бронювання має відображатись в Reservations
 */
export function shouldShowInReservations(status: BookingStatus | string): boolean {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  
  return normalizedStatus === BookingStatus.RESERVED ||
         normalizedStatus === BookingStatus.OFFER_SENT ||
         normalizedStatus === BookingStatus.INVOICED;
}

/**
 * Перевіряє чи можна відправити офер для цього статусу
 * @param status - Статус бронювання
 * @returns true якщо можна відправити офер
 */
export function canSendOffer(status: BookingStatus | string): boolean {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  return normalizedStatus === BookingStatus.RESERVED || normalizedStatus === BookingStatus.OFFER_PREPARED;
}

/**
 * Перевіряє чи можна створити інвойс для цього статусу
 * @param status - Статус бронювання
 * @returns true якщо можна створити інвойс
 */
export function canCreateInvoice(status: BookingStatus | string): boolean {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  return normalizedStatus === BookingStatus.OFFER_SENT || normalizedStatus === BookingStatus.OFFER_PREPARED;
}

/**
 * Створює Facility tasks для бронювання при оплаті
 * @param booking - Бронювання для якого створюються таски
 * @returns Масив CalendarEvent для Einzug та Auszug
 */
export function createFacilityTasksForBooking(booking: any): Array<{ id: string; title: string; propertyId: string; bookingId: string | number; unitId?: string; time: string; type: 'Einzug' | 'Auszug'; day: number; date: string; description: string; status: 'open'; meterReadings: { electricity: string; water: string; gas: string } }> {
  const getDay = (dateStr: string) => parseInt(dateStr.split('-')[2], 10);
  const propertyAddress = booking.roomId || 'Unknown Property';
  
  const checkInTask = {
    id: `auto-task-${Date.now()}-1`,
    title: `${propertyAddress} - Einzug`,
    propertyId: booking.roomId,
    bookingId: booking.id,
    unitId: booking.unit,
    time: booking.checkInTime || '15:00',
    type: 'Einzug' as const,
    day: getDay(booking.start),
    date: booking.start,
    description: `Auto-generated: Move-in for ${booking.guest}. Please record meter readings.`,
    status: 'open' as const,
    meterReadings: { electricity: '', water: '', gas: '' }
  };
  
  const checkOutTask = {
    id: `auto-task-${Date.now()}-2`,
    title: `${propertyAddress} - Auszug`,
    propertyId: booking.roomId,
    bookingId: booking.id,
    unitId: booking.unit,
    time: booking.checkOutTime || '11:00',
    type: 'Auszug' as const,
    day: getDay(booking.end),
    date: booking.end,
    description: `Auto-generated: Move-out for ${booking.guest}. Please record meter readings.`,
    status: 'open' as const,
    meterReadings: { electricity: '', water: '', gas: '' }
  };
  
  return [checkInTask, checkOutTask];
}

/**
 * Оновлює статус бронювання на основі верифікованої таски
 * @param task - Таска яка була верифікована
 * @returns Новий статус для бронювання або null якщо не потрібно оновлювати
 */
export function updateBookingStatusFromTask(task: any): BookingStatus | null {
  if (task.status !== 'verified') {
    return null;
  }
  
  if (task.type === 'Einzug') {
    return BookingStatus.CHECK_IN_DONE;
  }
  
  if (task.type === 'Auszug') {
    return BookingStatus.COMPLETED;
  }
  
  return null;
}

