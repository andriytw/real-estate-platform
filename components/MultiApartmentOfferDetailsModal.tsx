import React from 'react';
import { CheckCircle2, FileText, Link as LinkIcon, X } from 'lucide-react';
import { OfferHeaderData, OfferItemData } from '../types';
import { formatApartmentIdentificationLine } from '../utils/salesOfferFlow';

interface MultiApartmentOfferDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  header: OfferHeaderData | null;
  items: OfferItemData[];
  onSelectItem: (item: OfferItemData) => void;
  onAddProforma: (item: OfferItemData) => void;
}

const MultiApartmentOfferDetailsModal: React.FC<MultiApartmentOfferDetailsModalProps> = ({
  isOpen,
  onClose,
  header,
  items,
  onSelectItem,
  onAddProforma,
}) => {
  if (!isOpen || !header) return null;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-800 bg-[#23262b] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Multi-apartment offer</h2>
            <p className="text-sm text-gray-400">
              {header.offerNo ?? 'Draft'} · {header.clientName} · {header.startDate} – {header.endDate}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111315] border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Header</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div>Offer No: <span className="text-white">{header.offerNo ?? '—'}</span></div>
                <div>Status: <span className="text-white">{header.status}</span></div>
                <div>Client: <span className="text-white">{header.clientName}</span></div>
                <div>Internal company: <span className="text-white">{header.internalCompany}</span></div>
                <div>Dates: <span className="text-white">{header.startDate} – {header.endDate}</span></div>
                <div>Nights: <span className="text-white">{header.nights}</span></div>
              </div>
            </div>
            <div className="bg-[#111315] border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Communication</h3>
              <div className="space-y-2 text-sm text-gray-300">
                <div>Email: <span className="text-white">{header.recipientEmail || header.email || '—'}</span></div>
                <div>Phone: <span className="text-white">{header.recipientPhone || header.phone || '—'}</span></div>
                <div>Address: <span className="text-white">{header.address || '—'}</span></div>
              </div>
              {header.clientMessage && (
                <div className="mt-4 text-xs text-gray-400 whitespace-pre-wrap bg-[#161B22] border border-gray-800 rounded-lg p-3">
                  {header.clientMessage}
                </div>
              )}
            </div>
          </section>

          <section className="bg-[#111315] border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">Offer items</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-[#161B22] text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Apartment</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#16181D]">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">
                        {formatApartmentIdentificationLine({
                          street: item.street,
                          houseNumber: item.houseNumber,
                          zip: item.zip,
                          city: item.city,
                          apartmentCode: item.apartmentCode,
                        })}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                        {item.apartmentGroupName ? <span>{item.apartmentGroupName}</span> : null}
                        {item.marketplaceUrl ? (
                          <a
                            href={item.marketplaceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <LinkIcon className="w-3 h-3" />
                            Listing
                          </a>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs font-medium border border-gray-700 text-gray-200">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">
                      {item.grossTotal.toFixed(2)} EUR
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-2">
                        {item.status === 'Offered' && (
                          <button
                            onClick={() => onSelectItem(item)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Select
                          </button>
                        )}
                        {item.status === 'Selected' && (
                          <button
                            onClick={() => onAddProforma(item)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition-colors inline-flex items-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Add Proforma
                          </button>
                        )}
                        {item.status === 'Converted' && (
                          <span className="px-3 py-1.5 text-xs text-gray-500">Converted</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MultiApartmentOfferDetailsModal;
