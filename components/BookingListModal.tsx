import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { Booking, CalendarEvent, Property } from '../types';
import jsPDF from 'jspdf';

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

  const street = (property.fullAddress as string | undefined) || property.address;
  const title = property.title;
  const parts = [street, title].filter(Boolean) as string[];

  return parts.join(' — ');
};

const getGuestName = (item: Booking | CalendarEvent): string => {
  if ('guest' in item) {
    return item.guest || 'Unknown';
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

const generatePDF = (
  items: (Booking | CalendarEvent)[],
  type: string,
  date: Date,
  properties: Property[]
) => {
  try {
    const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10; // More space on the right side for Date/Time column
  const startY = 30;
  let currentY = startY;

  // Title
  doc.setFontSize(18);
  doc.text(`${type.charAt(0).toUpperCase() + type.slice(1)} List`, margin, currentY);
  currentY += 10;

  doc.setFontSize(12);
  doc.text(`Date: ${formatDateISO(date)}`, margin, currentY);
  currentY += 15;

  // Table headers
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  const colWidths = [80, 50, 35, 25]; // Sum should fit within page width minus margins
  const headers = ['Property', 'Guest', 'Phone', 'Date/Time'];
  let xPos = margin;

  headers.forEach((header, index) => {
    doc.text(header, xPos, currentY);
    xPos += colWidths[index];
  });

  currentY += 8;
  doc.setFont(undefined, 'normal');

  // Table rows
  items.forEach((item, index) => {
    if (currentY > pageHeight - 30) {
      doc.addPage();
      currentY = margin + 10;
    }

    const propertyName = getPropertyName(getPropertyId(item), properties);
    const guestName = getGuestName(item);
    const phone = getPhone(item);
    const dateTime = getDateTime(item, type);

    xPos = margin;
    const rowData = [
      propertyName.length > 40 ? propertyName.substring(0, 40) + '...' : propertyName,
      guestName.length > 20 ? guestName.substring(0, 20) + '...' : guestName,
      phone.length > 15 ? phone.substring(0, 15) + '...' : phone,
      dateTime.length > 16 ? dateTime.substring(0, 16) + '...' : dateTime,
    ];

    rowData.forEach((data, colIndex) => {
      doc.text(data, xPos, currentY);
      xPos += colWidths[colIndex];
    });

    currentY += 7;
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Generated on ${new Date().toLocaleString()}`,
    margin,
    pageHeight - 10
  );

    // Save
    const fileName = `${type}-${formatDateISO(date)}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
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
    generatePDF(items, type, date, properties);
  };

  const handleDownloadSelected = () => {
    const selected = Array.from(selectedItems).map(index => items[index]);
    generatePDF(selected, type, date, properties);
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
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Property</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Guest</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Phone</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Date/Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const propertyName = getPropertyName(getPropertyId(item), properties);
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
                              <span className="text-white">{propertyName}</span>
                            </div>
                          </td>
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
            {selectedItems.size > 0 && (
              <button
                onClick={handleDownloadSelected}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Selected ({selectedItems.size})
              </button>
            )}
            <button
              onClick={handleDownloadAll}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download All ({items.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingListModal;

