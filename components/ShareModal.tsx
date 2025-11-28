import React, { useState } from 'react';
import { X, Copy, Check, Mail, Phone, Link as LinkIcon } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle: string;
  propertyAddress: string;
  propertyId: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, propertyTitle, propertyAddress, propertyId }) => {
  const [copied, setCopied] = useState(false);

  // Simulate a real URL
  const shareUrl = `${window.location.origin}/property/${propertyId}`;
  const shareText = `Check out this apartment: ${propertyTitle} at ${propertyAddress}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} - ${shareUrl}`)}`;
    window.open(url, '_blank');
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Apartment viewing: ${propertyAddress}`);
    const body = encodeURIComponent(`Hi,\n\nI found this interesting apartment and wanted to share it with you:\n\n${shareText}\n${shareUrl}\n\nBest regards`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 font-sans">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Share Apartment</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Preview Info */}
          <div className="flex gap-3 items-center bg-[#111315] p-3 rounded-lg border border-gray-800">
             <div className="bg-emerald-500/10 p-2 rounded-md">
                <LinkIcon className="w-5 h-5 text-emerald-500" />
             </div>
             <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">{propertyAddress}</p>
                <p className="text-xs text-gray-500 truncate">{propertyTitle}</p>
             </div>
          </div>

          {/* Link Input */}
          <div>
             <label className="block text-xs font-medium text-gray-400 mb-2">Apartment Link</label>
             <div className="flex gap-2">
                <input 
                  readOnly 
                  value={shareUrl}
                  className="flex-1 bg-[#111315] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button 
                  onClick={handleCopy}
                  className={`px-4 rounded-lg font-medium text-sm transition-all flex items-center gap-2 border ${
                    copied 
                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                    : 'bg-[#2A2E35] border-gray-700 text-white hover:bg-[#32363F]'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
             </div>
          </div>

          {/* Social Buttons */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Share via</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <Phone className="w-4 h-4 fill-current" />
                WhatsApp
              </button>
              <button 
                onClick={handleEmail}
                className="flex items-center justify-center gap-2 bg-[#2A2E35] hover:bg-[#32363F] border border-gray-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ShareModal;