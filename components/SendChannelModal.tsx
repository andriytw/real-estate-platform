import React, { useState } from 'react';
import { X, Mail, MessageCircle, Loader2 } from 'lucide-react';
import {
  commandPostJson,
  CommandClientError,
  parseCommandApiErrorMessage,
} from '../services/commandClient';

export interface SendChannelPayload {
  messageBody: string;
  documentLink?: string;
  subject?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  /** When set, Email uses server send with PDF attachment (no mailto). */
  proformaInvoiceId?: string;
}

interface SendChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: SendChannelPayload | null;
  /** Called with neutral result message after an action (e.g. "Offer saved and prepared for Email"). Parent shows toast. */
  onResultMessage?: (message: string) => void;
  /** Errors (e.g. failed server email). Parent may style differently. */
  onErrorMessage?: (message: string) => void;
}

/**
 * Channel picker after save: Email | WhatsApp | Email + WhatsApp.
 * Proforma Email uses server API with PDF attachment; WhatsApp unchanged (text + link).
 */
const SendChannelModal: React.FC<SendChannelModalProps> = ({
  isOpen,
  onClose,
  payload,
  onResultMessage,
  onErrorMessage,
}) => {
  const [emailBusy, setEmailBusy] = useState(false);

  if (!isOpen) return null;

  const proformaServerEmail = Boolean(payload?.proformaInvoiceId);
  const hasEmailChannel = Boolean(payload?.recipientEmail?.trim()) || proformaServerEmail;
  const hasPhone = Boolean(payload?.recipientPhone?.trim());
  const hasAny = hasEmailChannel || hasPhone;

  const proformaEmailError = (e: unknown): string => {
    if (e instanceof CommandClientError && e.body != null) {
      const parsed = parseCommandApiErrorMessage(e.body);
      if (parsed && parsed !== 'Request failed') return parsed;
    }
    if (e instanceof Error && e.message && e.message !== 'Request failed') return e.message;
    return 'Failed to attach proforma PDF to email.';
  };

  const notifyError = (msg: string) => {
    if (onErrorMessage) onErrorMessage(msg);
    else onResultMessage?.(msg);
  };

  const runEmail = async () => {
    if (!payload) return;

    if (payload.proformaInvoiceId) {
      setEmailBusy(true);
      try {
        await commandPostJson<{ ok: boolean }>('/api/commands/send-proforma-email', {
          invoiceId: payload.proformaInvoiceId,
        });
        onResultMessage?.('Proforma email sent with PDF attachment.');
        onClose();
      } catch (e) {
        notifyError(proformaEmailError(e));
      } finally {
        setEmailBusy(false);
      }
      return;
    }

    if (!payload.recipientEmail?.trim()) return;
    const body = [payload.messageBody, payload.documentLink].filter(Boolean).join('\n\n');
    const subject = payload.subject || 'Offer';
    window.location.href = `mailto:${encodeURIComponent(payload.recipientEmail!.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onResultMessage?.('Prepared for Email');
    onClose();
  };

  const runWhatsApp = () => {
    const text = [payload?.messageBody, payload?.documentLink].filter(Boolean).join('\n\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    onResultMessage?.('Opened in WhatsApp');
    onClose();
  };

  const runBoth = async () => {
    if (!payload) {
      onClose();
      return;
    }
    const text = [payload.messageBody, payload.documentLink].filter(Boolean).join('\n\n');
    const subject = payload.subject || 'Offer';
    const body = [payload.messageBody, payload.documentLink].filter(Boolean).join('\n\n');

    if (payload.proformaInvoiceId && hasEmailChannel) {
      setEmailBusy(true);
      try {
        await commandPostJson<{ ok: boolean }>('/api/commands/send-proforma-email', {
          invoiceId: payload.proformaInvoiceId,
        });
        if (hasPhone) {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
          onResultMessage?.('Proforma email sent with PDF attachment. WhatsApp opened with link.');
        } else {
          onResultMessage?.('Proforma email sent with PDF attachment.');
        }
        onClose();
      } catch (e) {
        notifyError(proformaEmailError(e));
      } finally {
        setEmailBusy(false);
      }
      return;
    }

    if (payload.recipientEmail?.trim()) {
      window.location.href = `mailto:${encodeURIComponent(payload.recipientEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    if (hasPhone) {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }

    if (payload.recipientEmail?.trim() && hasPhone) {
      onResultMessage?.('Prepared for Email and opened in WhatsApp');
    } else if (payload.recipientEmail?.trim()) {
      onResultMessage?.('Prepared for Email. WhatsApp could not be prepared (missing contact data).');
    } else if (hasPhone) {
      onResultMessage?.('Opened in WhatsApp. Email could not be prepared (missing contact data).');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center px-4 font-sans">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={() => !emailBusy && onClose()}
      />
      <div className="relative bg-[#1C1F24] border border-gray-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Send via</h3>
          <button
            type="button"
            onClick={() => !emailBusy && onClose()}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Close"
            disabled={emailBusy}
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
                type="button"
                onClick={() => void runEmail()}
                disabled={!hasEmailChannel || emailBusy}
                className="flex items-center justify-center gap-2 bg-[#2A2E35] hover:bg-[#32363F] disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                {emailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {emailBusy ? 'Sending…' : 'Email'}
              </button>
              <button
                type="button"
                onClick={runWhatsApp}
                disabled={!hasPhone || emailBusy}
                className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => void runBoth()}
                disabled={!hasAny || emailBusy}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                {emailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                <MessageCircle className="w-4 h-4" />
                {emailBusy ? 'Sending…' : 'Email + WhatsApp'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SendChannelModal;
