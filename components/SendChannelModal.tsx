import React from 'react';
import { X, Mail, MessageCircle } from 'lucide-react';
import {
  toWhatsAppDigits,
  whatsappPhoneValidationMessage,
} from '../utils/internationalPhone';

export interface SendChannelPayload {
  messageBody: string;
  documentLink?: string;
  subject?: string;
  recipientEmail?: string;
  recipientPhone?: string;
}

interface SendChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: SendChannelPayload | null;
  /** Called with neutral result message after an action (e.g. "Offer saved and prepared for Email"). Parent shows toast. */
  onResultMessage?: (message: string) => void;
  /** WhatsApp-only failures (invalid / missing phone). Parent should show toast. */
  onError?: (message: string) => void;
}

/**
 * Channel picker after save: Email | WhatsApp | Email + WhatsApp.
 * Uses mailto and wa.me; neutral wording only (no claim of definitive send).
 */
const SendChannelModal: React.FC<SendChannelModalProps> = ({
  isOpen,
  onClose,
  payload,
  onResultMessage,
  onError,
}) => {
  if (!isOpen) return null;

  const rawPhone = payload?.recipientPhone?.trim() ?? '';
  const waDigits = rawPhone ? toWhatsAppDigits(rawPhone) : null;
  const hasValidPhone = waDigits != null;
  const hasEmail = Boolean(payload?.recipientEmail?.trim());
  /** Show action buttons when there is at least email, a valid phone, or a phone string to hint validation. */
  const hasAny = hasEmail || hasValidPhone || Boolean(rawPhone);

  const buildText = () =>
    [payload?.messageBody, payload?.documentLink].filter(Boolean).join('\n\n');

  const runEmail = () => {
    if (!payload?.recipientEmail?.trim()) return;
    const body = [payload.messageBody, payload.documentLink].filter(Boolean).join('\n\n');
    const subject = payload.subject || 'Offer';
    window.location.href = `mailto:${encodeURIComponent(payload.recipientEmail!.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onResultMessage?.('Prepared for Email');
    onClose();
  };

  const runWhatsApp = () => {
    const text = buildText();
    if (!waDigits) {
      onError?.(whatsappPhoneValidationMessage);
      return;
    }
    window.open(`https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`, '_blank');
    onResultMessage?.('Opened in WhatsApp');
    onClose();
  };

  const runBoth = () => {
    if (!payload) {
      onClose();
      return;
    }
    const body = [payload.messageBody, payload.documentLink].filter(Boolean).join('\n\n');
    const text = buildText();
    const subject = payload.subject || 'Offer';

    let didEmail = false;
    if (payload.recipientEmail?.trim()) {
      window.location.href = `mailto:${encodeURIComponent(payload.recipientEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      didEmail = true;
    }

    if (waDigits) {
      window.open(`https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`, '_blank');
      if (didEmail) {
        onResultMessage?.('Prepared for Email and opened in WhatsApp');
      } else {
        onResultMessage?.('Opened in WhatsApp');
      }
    } else {
      if (didEmail) {
        onResultMessage?.(
          `Prepared for Email. WhatsApp: ${whatsappPhoneValidationMessage}`
        );
      } else if (!payload.recipientEmail?.trim()) {
        onResultMessage?.(
          `Email could not be prepared (missing contact data). ${whatsappPhoneValidationMessage}`
        );
      } else {
        onError?.(whatsappPhoneValidationMessage);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center px-4 font-sans">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Send via</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!hasAny ? (
            <p className="text-sm text-gray-400">Add client email or phone to send.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={runEmail}
                disabled={!hasEmail}
                className="flex items-center justify-center gap-2 bg-[#2A2E35] hover:bg-[#32363F] disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <Mail className="w-4 h-4" />
                Email
              </button>
              <button
                onClick={runWhatsApp}
                disabled={!hasValidPhone}
                className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                onClick={runBoth}
                disabled={!hasEmail && !hasValidPhone}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <Mail className="w-4 h-4" />
                <MessageCircle className="w-4 h-4" />
                Email + WhatsApp
              </button>
              {rawPhone && !hasValidPhone ? (
                <p className="text-xs text-amber-400/90">{whatsappPhoneValidationMessage}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SendChannelModal;
