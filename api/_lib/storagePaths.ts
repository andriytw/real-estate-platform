const INVOICE_PDFS_MARKER = 'invoice-pdfs/';

/** Extract storage object path from public file URL for invoice-pdfs bucket. */
export function extractInvoicePdfStoragePath(fileUrl: string | null | undefined): string | null {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const trimmed = fileUrl.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(INVOICE_PDFS_MARKER);
  if (idx === -1) return null;
  const after = trimmed.slice(idx + INVOICE_PDFS_MARKER.length);
  const path = after.split('?')[0].split('#')[0].trim();
  return path.length > 0 ? path : null;
}
