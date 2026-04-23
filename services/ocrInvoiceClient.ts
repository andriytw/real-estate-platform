import { safeGetSession } from '../lib/supabaseAuthGuard';

export type OcrInvoiceItem = {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  sku: string;
};

export type OcrInvoiceData = {
  invoiceNumber: string;
  purchaseDate: string;
  vendor: string;
  items: OcrInvoiceItem[];
};

export type OcrInvoiceErrorCode = 'RATE_LIMIT' | 'AUTH' | 'CONFIG' | 'BAD_RESPONSE' | 'UNKNOWN';

export type OcrInvoiceResult =
  | { ok: true; data: OcrInvoiceData }
  | { ok: false; code: OcrInvoiceErrorCode; message: string; status?: number };

function fileToBase64Payload(file: File): Promise<{ base64Data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const base64String = String(reader.result || '');
        const base64Data = base64String.split(',')[1] || '';
        if (!base64Data) {
          reject(new Error('Failed to read file'));
          return;
        }
        resolve({ base64Data, mimeType: file.type || 'application/octet-stream' });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function recognizeInvoiceWithOcr(file: File, fileName?: string | null): Promise<OcrInvoiceResult> {
  const session = await safeGetSession();
  if (!session) return { ok: false, code: 'AUTH', message: 'Not authenticated. Please log in again.' };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return { ok: false, code: 'CONFIG', message: 'Missing Supabase env.' };
  }

  const requestId = crypto.randomUUID();
  // Temporary diagnostics (can be removed after stabilization)
  console.log('OCR_START', { requestId, fileName: fileName ?? file.name, mimeType: file.type, size: file.size });

  const { base64Data, mimeType } = await fileToBase64Payload(file);

  const response = await fetch(`${supabaseUrl}/functions/v1/ocr-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      requestId,
      fileBase64: base64Data,
      mimeType,
      fileName: fileName ?? file.name,
    }),
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // ignore parse errors; we'll handle below
  }

  if (response.status === 429 || body?.code === 'RATE_LIMIT') {
    console.warn('OCR_ERROR', { requestId, status: response.status, code: 'RATE_LIMIT' });
    return {
      ok: false,
      code: 'RATE_LIMIT',
      status: 429,
      message: 'OCR temporarily unavailable (rate limit). Please try again.',
    };
  }

  if (!response.ok) {
    console.warn('OCR_ERROR', { requestId, status: response.status, body });
    return {
      ok: false,
      code: 'BAD_RESPONSE',
      status: response.status,
      message: body?.error || `OCR failed: ${response.status}`,
    };
  }

  if (!body?.success || !body?.data) {
    console.warn('OCR_ERROR', { requestId, status: response.status, body });
    return { ok: false, code: 'BAD_RESPONSE', status: response.status, message: 'Invalid OCR response' };
  }

  console.log('OCR_RESPONSE', { requestId, items: Array.isArray(body.data.items) ? body.data.items.length : 0 });
  return { ok: true, data: body.data as OcrInvoiceData };
}

