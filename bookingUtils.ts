import { BookingStatus, CalendarEvent } from './types';

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
 * @param status - Статус бронювання або резервації
 * @returns true якщо бронювання має відображатись в Reservations
 */
export function shouldShowInReservations(status: BookingStatus | string): boolean {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;
  
  // Support both BookingStatus enum values and Reservation status strings
  return normalizedStatus === BookingStatus.RESERVED ||
         normalizedStatus === BookingStatus.OFFER_SENT ||
         normalizedStatus === BookingStatus.INVOICED ||
         normalizedStatus === 'open' ||
         normalizedStatus === 'offered' ||
         normalizedStatus === 'invoiced';
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
 * @param propertyName - Назва нерухомості (опціонально, якщо не передано, використовується roomId)
 * @returns Масив CalendarEvent для Einzug та Auszug
 */
export function createFacilityTasksForBooking(booking: any, propertyName?: string): Array<Omit<CalendarEvent, 'id'>> {
  const getDay = (dateStr: string) => parseInt(dateStr.split('-')[2], 10);
  const propertyAddress = propertyName || booking.address || booking.roomId || 'Unknown Property';
  
  const checkInTask: Omit<CalendarEvent, 'id'> = {
    title: `${propertyAddress} - Einzug`,
    propertyId: booking.roomId,
    bookingId: booking.id,
    unitId: booking.unit,
    time: booking.checkInTime || '15:00',
    isAllDay: false,
    type: 'Einzug' as const,
    day: getDay(booking.start),
    date: booking.start,
    description: `Auto-generated: Move-in for ${booking.guest}. Please record meter readings.`,
    status: 'open' as const,
    meterReadings: { electricity: '', water: '', gas: '' },
    department: 'facility'
  };
  
  const checkOutTask: Omit<CalendarEvent, 'id'> = {
    title: `${propertyAddress} - Auszug`,
    propertyId: booking.roomId,
    bookingId: booking.id,
    unitId: booking.unit,
    time: booking.checkOutTime || '11:00',
    isAllDay: false,
    type: 'Auszug' as const,
    day: getDay(booking.end),
    date: booking.end,
    description: `Auto-generated: Move-out for ${booking.guest}. Please record meter readings.`,
    status: 'open' as const,
    meterReadings: { electricity: '', water: '', gas: '' },
    department: 'facility'
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

/**
 * Централізована функція для оновлення статусу бронювання
 * Використовується для атомарного оновлення статусу з логуванням та синхронізацією
 * @param bookingId - ID бронювання
 * @param newStatus - Новий статус
 * @param options - Додаткові опції (лог, синхронізація з DB тощо)
 * @returns Функція для оновлення статусу (для використання в setState)
 */
export function updateBookingStatus(
  bookingId: string | number,
  newStatus: BookingStatus,
  options?: { log?: boolean; syncToDB?: boolean }
): (prev: any[]) => any[] {
  // Логування (якщо потрібно)
  if (options?.log !== false) {
    console.log(`[Booking Status Update] Booking ${bookingId}: ${newStatus} at ${new Date().toISOString()}`);
  }
  
  // Синхронізація з DB (якщо потрібно - тут можна додати API виклик)
  if (options?.syncToDB) {
    // TODO: Додати API виклик для синхронізації з DB
    // await syncBookingStatusToDB(bookingId, newStatus);
  }
  
  // Отримуємо новий колір на основі статусу
  const newColor = getBookingStyle(newStatus);
  
  // Повертаємо функцію для оновлення стану (статус + колір)
  return (prev: any[]) => prev.map(item => 
    item.id === bookingId || String(item.id) === String(bookingId)
      ? { ...item, status: newStatus, color: newColor }
      : item
  );
}

/**
 * Оновлює статус бронювання на 'paid' та створює Facility tasks
 * @param bookingId - ID бронювання
 * @param booking - Об'єкт бронювання
 * @returns Об'єкт з функцією оновлення статусу та масивом tasks
 */
export function updateBookingStatusAndCreateTasks(
  bookingId: string | number,
  booking: any
): { updateStatus: (prev: any[]) => any[], tasks: any[] } {
  // Оновлюємо статус на 'paid'
  const updateStatus = updateBookingStatus(bookingId, BookingStatus.PAID, { log: true });
  
  // Створюємо Facility tasks
  const tasks = createFacilityTasksForBooking(booking);
  
  return { updateStatus, tasks };
}

