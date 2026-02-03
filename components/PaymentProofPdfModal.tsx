import React, { useState, useRef } from 'react';
import { X, Upload } from 'lucide-react';
import { PaymentProof } from '../types';
import { paymentProofsService } from '../services/supabaseService';
import { supabase } from '../utils/supabase/client';

const PAYMENT_PROOF_PDF_INPUT_ID = 'payment-proof-pdf-upload';

type Mode = 'add' | 'replace';

interface PaymentProofPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: Mode;
  proof: PaymentProof | null;
  onDone: () => void;
}

const PaymentProofPdfModal: React.FC<PaymentProofPdfModalProps> = ({
  isOpen,
  onClose,
  mode,
  proof,
  onDone,
}) => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    setPdfFile(null);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    if (!proof || !pdfFile) {
      setError('Please select a PDF file.');
      return;
    }
    const invoiceId = proof.invoiceId;
    setError(null);
    setUploading(true);
    try {
      if (mode === 'add') {
        const filePath = await paymentProofsService.uploadPaymentProofFile(pdfFile, invoiceId, proof.id);
        await paymentProofsService.update(proof.id, {
          filePath,
          fileName: pdfFile.name || 'document.pdf',
          fileUploadedAt: new Date().toISOString(),
        });
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const createdBy = session?.user?.id ?? undefined;
        const newProof = await paymentProofsService.create({ invoiceId, createdBy });
        const filePath = await paymentProofsService.uploadPaymentProofFile(pdfFile, invoiceId, newProof.id);
        await paymentProofsService.update(newProof.id, {
          filePath,
          fileName: pdfFile.name || 'document.pdf',
          fileUploadedAt: new Date().toISOString(),
          replacesProofId: proof.id,
        });
        await paymentProofsService.update(proof.id, {
          isCurrent: false,
          state: 'replaced',
          replacedByProofId: newProof.id,
        });
        await paymentProofsService.setCurrentProof(invoiceId, newProof.id);
      }
      await onDone();
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to upload. ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-purple-500');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') setPdfFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') setPdfFile(f);
  };

  if (!isOpen) return null;
  if (!proof) return null;

  const title = mode === 'add' ? 'Add confirmation PDF' : 'Replace PDF';

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#1C1F24] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-gray-400">
            Proof created {new Date(proof.createdAt).toLocaleString()}
          </p>
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-2">
              PDF file
            </label>
            {!pdfFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('border-purple-500');
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove('border-purple-500')}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-lg p-6 min-h-[140px] hover:border-gray-600 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  id={PAYMENT_PROOF_PDF_INPUT_ID}
                  onChange={handleFileChange}
                />
                <label
                  htmlFor={PAYMENT_PROOF_PDF_INPUT_ID}
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-gray-500" />
                  <span className="text-xs text-gray-400">Drop PDF or click to upload</span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-gray-700 bg-[#111315]">
                <span className="text-emerald-400 text-sm truncate flex-1">{pdfFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-gray-400 hover:text-white whitespace-nowrap"
                >
                  Remove
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  id={PAYMENT_PROOF_PDF_INPUT_ID}
                  onChange={handleFileChange}
                />
                <label htmlFor={PAYMENT_PROOF_PDF_INPUT_ID} className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer">
                  Change
                </label>
              </div>
            )}
          </div>
          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-gray-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={uploading || !pdfFile}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentProofPdfModal;
