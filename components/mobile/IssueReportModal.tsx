import React, { useState } from 'react';
import { X, Camera, AlertTriangle, Send } from 'lucide-react';
import { tasksService } from '../../services/supabaseService';
import { useWorker } from '../../contexts/WorkerContext';

interface IssueReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReported: () => void;
}

const IssueReportModal: React.FC<IssueReportModalProps> = ({ isOpen, onClose, onReported }) => {
  const { worker } = useWorker();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState<'facility' | 'accounting'>('facility');
  const [images, setImages] = useState<string[]>([]); // Placeholder for images
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worker) return;

    try {
      setLoading(true);
      await tasksService.reportIssue({
        title,
        description,
        images, // In real app, handle file upload to Storage and get URLs
        department,
        reporterId: worker.id
      });
      onReported();
      onClose();
      setTitle('');
      setDescription('');
      setDepartment('facility');
    } catch (error) {
      console.error('Error reporting issue:', error);
      alert('Failed to report issue');
    } finally {
      setLoading(false);
    }
  };

  // Mock image upload
  const handleImageUpload = () => {
    // In a real app, this would trigger file input and upload to Supabase Storage
    const mockUrl = `https://placehold.co/600x400?text=Issue+Photo+${images.length + 1}`;
    setImages([...images, mockUrl]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1F24] w-full sm:max-w-md rounded-t-xl sm:rounded-xl border-t sm:border border-gray-800 shadow-2xl overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#111315]">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-bold">Report Issue</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          
          {/* Department */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDepartment('facility')}
              className={`py-2 rounded-lg border font-medium text-sm transition-colors ${
                department === 'facility' 
                  ? 'bg-red-500/10 border-red-500 text-red-400' 
                  : 'bg-[#0D0F11] border-gray-700 text-gray-400'
              }`}
            >
              Facility (Technical)
            </button>
            <button
              type="button"
              onClick={() => setDepartment('accounting')}
              className={`py-2 rounded-lg border font-medium text-sm transition-colors ${
                department === 'accounting' 
                  ? 'bg-red-500/10 border-red-500 text-red-400' 
                  : 'bg-[#0D0F11] border-gray-700 text-gray-400'
              }`}
            >
              Accounting (Finance)
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">What happened?</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Broken Chair, Leak"
              className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-3 text-white focus:border-red-500 focus:outline-none"
              required
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Photos</label>
            <div className="flex gap-2 overflow-x-auto py-1">
              <button
                type="button"
                onClick={handleImageUpload}
                className="flex-shrink-0 w-20 h-20 bg-[#0D0F11] border border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-gray-400"
              >
                <Camera className="w-6 h-6 mb-1" />
                <span className="text-[10px]">Add Photo</span>
              </button>
              {images.map((url, index) => (
                <div key={index} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-gray-700">
                  <img src={url} alt={`Issue ${index}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, i) => i !== index))}
                    className="absolute top-0 right-0 bg-black/50 p-1 text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Details..."
              className="w-full bg-[#0D0F11] border border-gray-700 rounded-lg px-3 py-3 text-white focus:border-red-500 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
          >
            {loading ? 'Sending...' : 'Report Issue'}
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default IssueReportModal;

