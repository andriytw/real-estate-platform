import React, { useState } from 'react';
import { X, Download, Mail } from 'lucide-react';
import { Booking, CalendarEvent, Property } from '../types';

interface BookingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: (Booking | CalendarEvent)[];
  type: 'checkin' | 'checkout' | 'cleaning' | 'reminder';
  properties: Property[];
  date: Date;
}

const formatDateISO = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPropertyName = (propertyId: string | undefined, properties: Property[]): string => {
  if (!propertyId) return 'Unknown';
  const property = properties.find(p => p.id === propertyId);
  if (!property) return propertyId;

  // Використовуємо address або fullAddress як вулицю (як в SalesCalendar: details = p.address || p.fullAddress)
  const street = (property.fullAddress as string | undefined) || property.address || '';
  
  // Використовуємо title як назву квартири (як в SalesCalendar: name = p.title)
  const title = property.title || '';
  
  // Формуємо частини: вулиця + назва квартири
  const parts: string[] = [];
  if (street && street.trim().length > 0) {
    parts.push(street.trim());
  }
  if (title && title.trim().length > 0) {
    parts.push(title.trim());
  }

  // Якщо нічого не знайшли, повертаємо propertyId
  return parts.length > 0 ? parts.join(' — ') : propertyId;
};

// Отримуємо тільки назву квартири (title)
const getApartmentName = (propertyId: string | undefined, properties: Property[]): string => {
  if (!propertyId) return 'Unknown';
  const property = properties.find(p => p.id === propertyId);
  if (!property) return propertyId;
  return property.title || propertyId;
};

// Отримуємо тільки адресу (вулицю)
const getAddress = (propertyId: string | undefined, properties: Property[]): string => {
  if (!propertyId) return 'Unknown';
  const property = properties.find(p => p.id === propertyId);
  if (!property) return propertyId;
  return (property.fullAddress as string | undefined) || property.address || propertyId;
};

// Отримуємо актуальне ім'я/прізвище/назву компанії для звернення
const getClientGreetingName = (item: Booking | CalendarEvent): string => {
  // Якщо це компанія - використовуємо назву компанії
  if ('clientType' in item && item.clientType === 'Company') {
    if ('companyName' in item && item.companyName) {
      return item.companyName;
    }
    if ('company' in item && item.company && item.company !== 'N/A') {
      return item.company;
    }
  }
  
  // Якщо це приватна особа - використовуємо ім'я та прізвище
  if ('firstName' in item && 'lastName' in item) {
    if (item.firstName && item.lastName) {
      return `${item.firstName} ${item.lastName}`;
    }
    if (item.lastName) {
      return item.lastName;
    }
    if (item.firstName) {
      return item.firstName;
    }
  }
  
  // Якщо є тільки lastName
  if ('lastName' in item && item.lastName) {
    return item.lastName;
  }
  
  // Якщо є тільки firstName
  if ('firstName' in item && item.firstName) {
    return item.firstName;
  }
  
  // Fallback на guest
  if ('guest' in item && item.guest) {
    return item.guest;
  }
  
  return 'Шановний/а';
};

const getGuestName = (item: Booking | CalendarEvent): string => {
  if ('lastName' in item && item.lastName) {
    // Використовуємо прізвище якщо є
    return item.lastName;
  }
  if ('firstName' in item && item.firstName && 'lastName' in item && item.lastName) {
    // Якщо є і ім'я і прізвище, використовуємо прізвище
    return item.lastName;
  }
  if ('guest' in item) {
    // Якщо немає прізвища, використовуємо guest (може містити повне ім'я)
    const guest = item.guest || '';
    // Спробуємо витягти прізвище з guest (останнє слово)
    const parts = guest.trim().split(/\s+/);
    if (parts.length > 1) {
      return parts[parts.length - 1]; // Останнє слово (прізвище)
    }
    return guest || 'Unknown';
  }
  if ('title' in item) {
    return item.title || 'Unknown';
  }
  return 'Unknown';
};

const getPhone = (item: Booking | CalendarEvent): string => {
  if ('phone' in item) {
    return item.phone || '-';
  }
  return '-';
};

const getDateTime = (item: Booking | CalendarEvent, type: string): string => {
  if (type === 'checkin' && 'checkInTime' in item) {
    return `${item.start || '-'} ${item.checkInTime || '-'}`;
  }
  if (type === 'checkout' && 'checkOutTime' in item) {
    return `${item.end || '-'} ${item.checkOutTime || '-'}`;
  }
  if (type === 'cleaning' && 'date' in item && 'time' in item) {
    return `${item.date || '-'} ${item.time || '-'}`;
  }
  if (type === 'reminder' && 'checkOutTime' in item) {
    return `${item.end || '-'} ${item.checkOutTime || '-'}`;
  }
  return '-';
};

const getPropertyId = (item: Booking | CalendarEvent): string | undefined => {
  if ('roomId' in item) {
    return item.roomId;
  }
  if ('propertyId' in item) {
    return item.propertyId;
  }
  return undefined;
};


// Генерація Excel файлу (CSV формат з BOM для правильного відображення Unicode)
const generateExcel = (
  items: (Booking | CalendarEvent)[],
  type: string,
  date: Date,
  properties: Property[]
) => {
  try {
    // Заголовки колонок (додано колонку Apartment на початку)
    const headers = ['Apartment', 'Address', 'Guest', 'Phone', 'Date/Time'];
    
    // Формуємо рядки даних
    const rows = items.map((item) => {
      const propertyId = getPropertyId(item);
      const apartmentName = getApartmentName(propertyId, properties);
      const address = getAddress(propertyId, properties);
      const guestName = getGuestName(item);
      const phone = getPhone(item);
      const dateTime = getDateTime(item, type);
      
      return [apartmentName, address, guestName, phone, dateTime];
    });

    // Функція для екранування CSV значень (обробка ком, лапок, переносів рядків)
    const escapeCSV = (value: string): string => {
      if (!value) return '';
      const stringValue = String(value);
      // Якщо значення містить кому, лапки або перенос рядка, обгортаємо в лапки
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        // Подвоюємо лапки всередині значення
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Формуємо CSV контент
    const csvContent = [
      headers.map(escapeCSV).join(','),
      ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    // Додаємо BOM (Byte Order Mark) для правильного відображення Unicode в Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Створюємо посилання для завантаження
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${type}-${formatDateISO(date)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating Excel:', error);
    alert('Failed to generate Excel file. Please try again.');
  }
};

const BookingListModal: React.FC<BookingListModalProps> = ({
  isOpen,
  onClose,
  title,
  items,
  type,
  properties,
  date,
}) => {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map((_, index) => index)));
    }
  };

  const handleSelectItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const handleDownloadAll = () => {
    generateExcel(items, type, date, properties);
  };

  const handleDownloadSelected = () => {
    const selected = Array.from(selectedItems).map(index => items[index]);
    generateExcel(selected, type, date, properties);
  };

  const handleSendEmailToSelected = async () => {
    if (selectedItems.size === 0) {
      return; // Не показуємо alert, кнопка просто disabled
    }

    const selected = Array.from(selectedItems).map(index => items[index]);
    await sendEmails(selected, 'selected');
  };

  const sendEmails = async (itemsToSend: (Booking | CalendarEvent)[], type: 'all' | 'selected') => {
    // Формуємо дані для email
    const emailData = itemsToSend.map(item => {
      const propertyId = getPropertyId(item);
      const property = properties.find(p => p.id === propertyId);
      const apartmentName = getApartmentName(propertyId, properties);
      const address = getAddress(propertyId, properties);
      const guestName = getGuestName(item);
      const clientGreetingName = getClientGreetingName(item); // Актуальне ім'я/компанія
      const email = 'email' in item ? item.email : undefined;
      const checkOutDate = 'end' in item ? item.end : undefined;
      const checkOutTime = 'checkOutTime' in item ? item.checkOutTime : undefined;

      // Формуємо текст email з актуальним ім'ям/компанією на початку
      const emailSubject = `Нагадування про виїзд - ${apartmentName}`;
      const emailBody = `${clientGreetingName},

Нагадуємо, що у вас через 2 дні виїзд:
- Квартира: ${apartmentName}
- Адреса: ${address}
- Дата виїзду: ${checkOutDate}${checkOutTime ? ` о ${checkOutTime}` : ''}

Чи будете ви виїзджати, чи можливо хочете продовження перебування?

Будь ласка, підтвердіть ваші плани.

З повагою,
Команда управління нерухомістю`;

      return {
        email,
        guestName,
        clientGreetingName, // Додаємо для логування
        apartmentName,
        address,
        checkOutDate,
        checkOutTime,
        subject: emailSubject,
        body: emailBody
      };
    }).filter(item => item.email); // Фільтруємо тільки ті, у яких є email

    if (emailData.length === 0) {
      alert('У гостей немає email адрес');
      return;
    }

    // МОК: Показуємо дані в консолі та alert (замість реального надсилання)
    console.log(`📧 Email data to send (${type}):`, emailData);
    
    // Показуємо preview першого email
    const firstEmail = emailData[0];
    const preview = `
📧 Email буде надіслано на: ${firstEmail.email}
👤 Звернення: ${firstEmail.clientGreetingName}

Тема: ${firstEmail.subject}

Текст:
${firstEmail.body}

${emailData.length > 1 ? `\n... та ще ${emailData.length - 1} email(ів)` : ''}
    `.trim();

    // Підтвердження перед "надсиланням"
    const confirmed = window.confirm(
      `Надіслати нагадування ${emailData.length} орендарю(ям)?\n\n${preview}`
    );

    if (confirmed) {
      // МОК: Імітуємо надсилання
      console.log(`✅ Sending emails (${type})...`, emailData);
      
      // Симулюємо затримку
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert(`✅ Нагадування успішно надіслано ${emailData.length} орендарю(ям)!\n\n(Це тестова версія - реальні email не надсилаються)`);
      
      // Очищаємо вибір після "надсилання" (тільки якщо надсилали виділеним)
      if (type === 'selected') {
        setSelectedItems(new Set());
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#161B22] border border-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400">No items found for this date.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === items.length && items.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4"
                  />
                  <span>Select All</span>
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Apartment</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Address</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Guest</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Phone</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Date/Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const propertyId = getPropertyId(item);
                      const apartmentName = getApartmentName(propertyId, properties);
                      const address = getAddress(propertyId, properties);
                      const guestName = getGuestName(item);
                      const phone = getPhone(item);
                      const dateTime = getDateTime(item, type);
                      const isSelected = selectedItems.has(index);

                      return (
                        <tr
                          key={index}
                          className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${
                            isSelected ? 'bg-gray-800/30' : ''
                          }`}
                          onClick={() => handleSelectItem(index)}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectItem(index)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4"
                              />
                              <span className="text-white">{apartmentName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-white">{address}</td>
                          <td className="py-3 px-4 text-white">{guestName}</td>
                          <td className="py-3 px-4 text-gray-300">{phone}</td>
                          <td className="py-3 px-4 text-gray-300">{dateTime}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-800 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {selectedItems.size > 0 ? `${selectedItems.size} selected` : `${items.length} total`}
          </div>
          <div className="flex gap-3">
            {/* Кнопка Send - тільки для reminder, завжди видима, disabled якщо немає вибраних */}
            {type === 'reminder' && (
              <button
                onClick={handleSendEmailToSelected}
                disabled={selectedItems.size === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Send
              </button>
            )}
            {/* Кнопки Download - завжди видимі */}
            <button
              onClick={handleDownloadSelected}
              disabled={selectedItems.size === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleDownloadAll}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingListModal;

