
import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, Building, MapPin, Trash2, Loader2 } from 'lucide-react';

interface PartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SubmissionStatus = 'idle' | 'submitting' | 'success';

const PartnerModal: React.FC<PartnerModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<SubmissionStatus>('idle');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    propertyAddress: '',
    propertyType: 'Apartment',
    area: '',
    expectedRent: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    
    // Simulate API upload
    setTimeout(() => {
      setStatus('success');
      console.log("Partner Application Submitted:", { formData, files });
    }, 2000);
  };

  const handleClose = () => {
    setStatus('idle');
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      propertyAddress: '',
      propertyType: 'Apartment',
      area: '',
      expectedRent: ''
    });
    setFiles([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 font-sans">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={handleClose}
      />

      {/* Modal Content */}
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-[#1C1F24] z-10">
          <div>
            <h2 className="text-xl font-bold text-white">Become a Partner</h2>
            <p className="text-sm text-gray-400">List your property with BIM/LAF Management</p>
          </div>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#111315]">
          
          {status === 'success' ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Application Received!</h3>
              <p className="text-gray-400 max-w-md mb-8">
                Thank you for proposing your property. Our acquisition team will review your documents and contact you within 24 hours.
              </p>
              <button 
                onClick={handleClose}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* Section 1: Owner Details */}
              <div>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  Owner Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">First Name</label>
                    <input 
                      required
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Last Name</label>
                    <input 
                      required
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                      placeholder="Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Email Address</label>
                    <input 
                      required
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone Number</label>
                    <input 
                      required
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                      placeholder="+49 123 456 789"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Property Details */}
              <div>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                  Property Details
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Property Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input 
                        required
                        name="propertyAddress"
                        value={formData.propertyAddress}
                        onChange={handleInputChange}
                        className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 pl-10 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                        placeholder="Street, Number, Zip, City"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Property Type</label>
                      <select 
                        name="propertyType"
                        value={formData.propertyType}
                        onChange={handleInputChange}
                        className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      >
                        <option>Apartment</option>
                        <option>House</option>
                        <option>Commercial</option>
                        <option>Land</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Size (m²)</label>
                      <input 
                        required
                        type="number"
                        name="area"
                        value={formData.area}
                        onChange={handleInputChange}
                        className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                        placeholder="e.g. 85"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Expected Rent (€/mo)</label>
                      <input 
                        type="number"
                        name="expectedRent"
                        value={formData.expectedRent}
                        onChange={handleInputChange}
                        className="w-full bg-[#1C1F24] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" 
                        placeholder="e.g. 1200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Documents */}
              <div>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-500 w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                  Documents & Photos
                </h3>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-700 hover:border-emerald-500 bg-[#1C1F24] hover:bg-[#23262b] rounded-lg p-8 text-center cursor-pointer transition-all"
                >
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                  />
                  <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Upload className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-white">Click to upload documents</p>
                  <p className="text-xs text-gray-500 mt-1">Floor plans, Energy certificate, Photos (Max 10MB)</p>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-[#1C1F24] p-3 rounded-lg border border-gray-800">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div>
                            <p className="text-sm text-white truncate max-w-[200px]">{file.name}</p>
                            <p className="text-[10px] text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-gray-800">
                <button 
                  type="submit"
                  disabled={status === 'submitting'}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg transition-colors shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                >
                  {status === 'submitting' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Submitting Application...
                    </>
                  ) : (
                    'Submit Proposal'
                  )}
                </button>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
};

export default PartnerModal;
