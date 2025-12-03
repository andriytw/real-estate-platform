import React from 'react';
import { X, Calendar, User, Mail, Phone, Building2, Users, MessageSquare, ArrowRight } from 'lucide-react';
import { RequestData } from '../types';

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: RequestData | null;
  onGoToCalendar: () => void;
}

const RequestModal: React.FC<RequestModalProps> = ({ isOpen, onClose, request, onGoToCalendar }) => {
  if (!isOpen || !request) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col animate-in zoom-in duration-200">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold text-white">Request Details</h3>
            <p className="text-xs text-gray-400">ID: #{request.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              request.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
              request.status === 'processed' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' :
              'bg-gray-500/20 text-gray-500 border border-gray-500/30'
            }`}>
              {request.status}
            </span>
            <span className="text-sm text-gray-500">Created: {new Date(request.createdAt).toLocaleString()}</span>
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4" /> Contact Information
              </h4>
              <div className="bg-[#111315] rounded-lg p-4 border border-gray-800 space-y-3">
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Name</span>
                  <span className="text-white font-bold">{request.firstName} {request.lastName}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Email</span>
                  <div className="flex items-center gap-2 text-white">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{request.email}</span>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Phone</span>
                  <div className="flex items-center gap-2 text-white">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{request.phone}</span>
                  </div>
                </div>
                {request.companyName && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">Company</span>
                    <div className="flex items-center gap-2 text-white">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span>{request.companyName}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Booking Details
              </h4>
              <div className="bg-[#111315] rounded-lg p-4 border border-gray-800 space-y-3">
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Check-In</span>
                  <span className="text-white font-bold">{request.startDate}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Check-Out</span>
                  <span className="text-white font-bold">{request.endDate}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Number of People</span>
                  <div className="flex items-center gap-2 text-white">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="font-bold">{request.peopleCount}</span>
                  </div>
                </div>
                {request.propertyId && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">Property ID</span>
                    <span className="text-white">{request.propertyId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Message */}
          {request.message && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Message
              </h4>
              <div className="bg-[#111315] p-4 rounded-lg border border-gray-800 text-sm text-gray-300">
                {request.message}
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-4 border-t border-gray-800">
            <button
              onClick={() => {
                onGoToCalendar();
                onClose();
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/20"
            >
              <ArrowRight className="w-4 h-4" />
              Go to Calendar
            </button>
          </div>
        </div>

        <div className="p-5 border-t border-gray-800 bg-[#161B22] flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestModal;












