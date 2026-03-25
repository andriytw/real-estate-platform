import React, { useState, useRef, useCallback } from 'react';
import { X, Upload } from 'lucide-react';
import { InvoiceData } from '../types';
import {
  commandPostFormData,
  CommandClientError,
  COMMAND_UPLOAD_TIMEOUT_MS,
  parseCommandApiErrorMessage,
} from '../services/commandClient';

// #region agent log
const __PROOF_ENDPOINT_978438 =
  'http://127.0.0.1:7242/ingest/1aed333d-0076-47f3-8bf4-1ca5f822ecdd' as const;
function __getProofRunId978438(): string {
  try {
    const k = '__proofRunId978438';
    const existing = sessionStorage.getItem(k);
    if (existing) return existing;
    const id = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(k, id);
    return id;
  } catch {
    return `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
const __proofRunId978438 = __getProofRunId978438();
function __proofMark978438(location: string, marker: string, data?: Record<string, unknown>) {
  try {
    fetch(__PROOF_ENDPOINT_978438, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '978438' },
      body: JSON.stringify({
        sessionId: '978438',
        runId: __proofRunId978438,
        hypothesisId: 'proof',
        location,
        message: marker,
        data: { proofRunId: __proofRunId978438, ...(data ?? {}) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch {}
}
// #endregion

function formatConfirmPaymentFailure(e: CommandClientError): string {
  const base = parseCommandApiErrorMessage(e.body) || e.message;
  if (!e.body || typeof e.body !== 'object') return base;
  const o = e.body as Record<string, unknown>;
  const bits: string[] = [base];
  if (typeof o.step === 'string' && o.step) bits.push(`step: ${o.step}`);
  if (typeof o.code === 'string' && o.code) bits.push(`code: ${o.code}`);
  if (typeof o.details === 'string' && o.details && !base.includes(o.details)) bits.push(o.details);
  return bits.join(' · ');
}

const CONFIRM_PAYMENT_PDF_INPUT_ID = 'confirm-payment-pdf-upload';
const CONFIRM_PAYMENT_DOC_NUMBER_ID = 'confirm-payment-document-number';

interface ConfirmPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  proforma: InvoiceData | null;
  onConfirmed: (newBookingId: string) => Promise<void>;
}

const ConfirmPaymentModal: React.FC<ConfirmPaymentModalProps> = ({
  isOpen,
  onClose,
  proforma,
  onConfirmed,
}) => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const getOrCreateIdempotencyKey = useCallback(() => {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cpm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return idempotencyKeyRef.current;
  }, []);

  const resetForm = () => {
    setPdfFile(null);
    setDocumentNumber('');
    setError(null);
    idempotencyKeyRef.current = null;
  };

  const handleClose = () => {
    if (uploading) return;
    resetForm();
    onClose();
  };

  const handleSaveAndConfirm = async () => {
    if (!proforma) return;
    const offerId = proforma.offerId || proforma.offerIdSource;
    if (!offerId) {
      setError('Щоб підтвердити оплату, проформа має бути прив\'язана до оффера. Додайте проформу з розділу Оффери (Offers).');
      return;
    }
    setError(null);
    setUploading(true);
    const idemKey = getOrCreateIdempotencyKey();
    try {
      const fd = new FormData();
      fd.append('proformaId', proforma.id);
      fd.append('documentNumber', documentNumber.trim());
      if (pdfFile) {
        fd.append('file', pdfFile, pdfFile.name);
      }
      const { bookingId } = await commandPostFormData<{ bookingId: string; proofId: string }>(
        '/api/commands/confirm-payment',
        fd,
        { idempotencyKey: idemKey, timeoutMs: COMMAND_UPLOAD_TIMEOUT_MS }
      );
      // #region agent log
      __proofMark978438('ConfirmPaymentModal.tsx:afterCommandResolved', 'confirmPayment:afterCommandResolved', {
        hasBookingId: !!bookingId,
      });
      // #endregion
      idempotencyKeyRef.current = null;
      // #region agent log
      __proofMark978438('ConfirmPaymentModal.tsx:beforeOnConfirmed', 'confirmPayment:beforeOnConfirmed', {});
      // #endregion
      await onConfirmed(bookingId);
      // #region agent log
      __proofMark978438('ConfirmPaymentModal.tsx:afterOnConfirmed', 'confirmPayment:afterOnConfirmed', {});
      // #endregion
      handleClose();
    } catch (e: unknown) {
      if (e instanceof CommandClientError) {
        if (e.kind === 'conflict') {
          setError(formatConfirmPaymentFailure(e));
          return;
        }
        if (e.kind === 'timeout') {
          setError('Request timed out. You can safely retry — the same operation will not be duplicated.');
          return;
        }
        setError(`Failed to confirm payment. ${formatConfirmPaymentFailure(e)}`);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to confirm payment. ${msg}`);
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
  if (!proforma) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#1C1F24] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-700 shadow-2xl flex flex-col">
        <div className="p-5 border-b border-gray-800 bg-[#23262b] flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">Підтвердити оплату</h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-gray-400">
            Проформа: <span className="font-mono text-white">{proforma.invoiceNumber}</span> — {proforma.clientName}
          </p>

          <div>
            <label htmlFor={CONFIRM_PAYMENT_DOC_NUMBER_ID} className="text-xs font-medium text-gray-400 block mb-2">
              Confirmation number
            </label>
            <input
              id={CONFIRM_PAYMENT_DOC_NUMBER_ID}
              name="confirm-payment-document-number"
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-[#111315] text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-gray-500"
              placeholder="PAY-2026-000001"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor={CONFIRM_PAYMENT_PDF_INPUT_ID} className="text-xs font-medium text-gray-400 block mb-2">
              Payment proof PDF (optional)
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
                  id={CONFIRM_PAYMENT_PDF_INPUT_ID}
                  onChange={handleFileChange}
                />
                <label
                  htmlFor={CONFIRM_PAYMENT_PDF_INPUT_ID}
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-gray-500" />
                  <span className="text-xs text-gray-400">Drop PDF or click to upload</span>
                  <span className="text-xs text-gray-500">Upload PDF</span>
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
                  id={CONFIRM_PAYMENT_PDF_INPUT_ID}
                  onChange={handleFileChange}
                />
                <label htmlFor={CONFIRM_PAYMENT_PDF_INPUT_ID} className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer">
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
            onClick={handleSaveAndConfirm}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-500 transition-colors disabled:opacity-50"
          >
            {uploading ? 'Saving…' : 'Save & Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmPaymentModal;
