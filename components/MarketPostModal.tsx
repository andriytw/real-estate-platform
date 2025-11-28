
import React, { useState, useRef } from 'react';
import { X, Upload, Image, Loader2, CheckCircle } from 'lucide-react';

interface MarketPostModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MarketPostModal: React.FC<MarketPostModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setTimeout(() => setStatus('success'), 1500);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 font-sans">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden">
        
        <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-[#23262b]">
          <h2 className="text-lg font-bold text-white">Post Ad to Market</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6">
          {status === 'success' ? (
             <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                   <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Ad Posted Successfully!</h3>
                <p className="text-gray-400 mb-6">Your listing is now visible on the community market.</p>
                <button onClick={onClose} className="bg-emerald-500 text-white py-2 px-6 rounded-lg font-bold">Close</button>
             </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Ad Title</label>
                <input required placeholder="e.g. Cozy room in WG" className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Price (€)</label>
                  <input required type="number" placeholder="500" className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Location</label>
                  <input required placeholder="Berlin, Mitte" className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Description</label>
                <textarea required rows={3} placeholder="Describe the place..." className="w-full bg-[#111315] border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-emerald-500 focus:outline-none resize-none" />
              </div>
              
              <div>
                 <label className="block text-xs font-medium text-gray-400 mb-1.5">Photo</label>
                 <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-700 hover:border-emerald-500 bg-[#111315] rounded-lg p-6 text-center cursor-pointer transition-colors"
                 >
                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageSelect} />
                    {selectedImage ? (
                      <div className="flex items-center justify-center gap-2 text-emerald-500">
                        <Image className="w-5 h-5" />
                        <span className="text-sm font-medium">{selectedImage.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <Upload className="w-6 h-6" />
                        <span className="text-xs">Upload main photo</span>
                      </div>
                    )}
                 </div>
              </div>

              <button 
                type="submit" 
                disabled={status === 'submitting'}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {status === 'submitting' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Post Ad'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketPostModal;