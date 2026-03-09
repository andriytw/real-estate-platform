/**
 * Virtual Documents Manager — lazy-loaded aggregation of existing document sources.
 * No DB or storage changes. Read-only: list, open, navigate.
 * Plan: two top-level folders (Документи, Оренди); Оренди = one subfolder per booking.
 */

import { supabase } from '../utils/supabase/client';
import {
  bookingsService,
  invoicesService,
  offersService,
  tasksService,
  propertyDocumentsService,
  propertyDepositProofsService,
  paymentChainService,
  paymentProofsService,
  getTaskChatMessages,
  getTaskAttachmentSignedUrl,
} from './supabaseService';
import { propertyInventoryService } from './propertyInventoryService';
import { propertyExpenseService } from './propertyExpenseService';

const PROPERTY_DOCS_BUCKET = 'property-docs';
const SIGNED_URL_EXPIRY_SEC = 600;

export interface RentalFolderMeta {
  bookingId: string;
  label: string;
  startDate?: string;
  endDate?: string;
  tenantLabel?: string;
}

/** Type badge for rental folder list (Offer / Proforma / Invoice / Payment Proof / upload / task / workflow). */
export type VirtualEntryType = 'invoice' | 'proforma' | 'offer' | 'payment_proof' | 'upload' | 'task' | 'workflow';

/** Single file entry for list view; getOpenUrl() used when user opens the file. */
export interface VirtualEntry {
  id: string;
  label: string;
  /** For stable sort: document date if available, else created_at, else null */
  sortDate: string | null;
  /** Created at (ISO) for secondary sort */
  createdAt: string;
  getOpenUrl: () => Promise<string>;
  /** Optional type for badge in rental folder (e.g. Offer, Proforma, Invoice, Payment Proof). */
  entryType?: VirtualEntryType;
}

/** Format date for rental folder label: DD.MM.YYYY or ... for open end */
function formatDateForLabel(d: string | null | undefined): string {
  if (!d) return '...';
  try {
    const [y, m, day] = d.split('-');
    if (y && m && day) return `${day.padStart(2, '0')}.${m}.${y}`;
  } catch {
    // ignore
  }
  return d;
}

/** Surname for rental folder: last_name ?? guest ?? first_name ?? 'Guest' */
function getBookingSurname(b: { lastName?: string; guest?: string; firstName?: string }): string {
  return b.lastName?.trim() || b.guest?.trim() || b.firstName?.trim() || 'Guest';
}

/** Active = not yet ended (end date in future or null). Plan: active first, then finished; by start date desc */
function isBookingActive(booking: { end?: string }): boolean {
  if (!booking.end) return true;
  try {
    return new Date(booking.end) >= new Date();
  } catch {
    return true;
  }
}

/** Initial load: only top-level structure + rental folder labels. No file lists. */
export async function getInitialVirtualFolders(propertyId: string): Promise<{
  rentalFolders: RentalFolderMeta[];
}> {
  const bookings = await bookingsService.getByPropertyId(propertyId);
  const active: typeof bookings = [];
  const finished: typeof bookings = [];
  for (const b of bookings) {
    if (isBookingActive(b)) active.push(b);
    else finished.push(b);
  }
  const sortByStartDesc = (a: { start?: string }, c: { start?: string }) =>
    (c.start || '').localeCompare(a.start || '');
  active.sort(sortByStartDesc);
  finished.sort(sortByStartDesc);
  const ordered = [...active, ...finished];

  const rentalFolders: RentalFolderMeta[] = ordered.map((b) => {
    const id = typeof b.id === 'string' ? b.id : String(b.id);
    const startFormatted = formatDateForLabel(b.start);
    const endFormatted = b.end ? formatDateForLabel(b.end) : '...';
    const surname = getBookingSurname(b);
    const label = `${startFormatted}–${endFormatted} — ${surname}`;
    return {
      bookingId: id,
      label,
      startDate: b.start ?? undefined,
      endDate: b.end ?? undefined,
      tenantLabel: surname,
    };
  });

  return { rentalFolders };
}

/** Stable sort for Документи: (1) document date desc, (2) else created_at desc, (3) else file name asc */
function sortDocumentEntries(entries: VirtualEntry[]): void {
  entries.sort((a, b) => {
    const dateA = a.sortDate || a.createdAt;
    const dateB = b.sortDate || b.createdAt;
    const cmp = (dateB || '').localeCompare(dateA || '');
    if (cmp !== 0) return cmp;
    return (a.label || '').localeCompare(b.label || '');
  });
}

/** Load Документи file list (property-level docs only). Sorted per plan. */
export async function loadDocumentsFolder(propertyId: string): Promise<VirtualEntry[]> {
  const [
    propertyDocs,
    depositProofs,
    chainState,
    inventoryDocsRows,
    expenseDocsRows,
  ] = await Promise.all([
    propertyDocumentsService.listPropertyDocuments(propertyId),
    propertyDepositProofsService.getByPropertyId(propertyId),
    paymentChainService.getPaymentChain(propertyId),
    supabase
      .from('property_inventory_documents')
      .select('id, storage_path, file_name, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .then((r) => (r.error ? [] : (r.data || []))),
    supabase
      .from('property_expense_documents')
      .select('id, storage_path, file_name, invoice_date, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .then((r) => (r.error ? [] : (r.data || []))),
  ]);

  const entries: VirtualEntry[] = [];

  for (const d of propertyDocs) {
    entries.push({
      id: `pd-${d.id}`,
      label: d.title || d.filePath.split('/').pop() || d.id,
      sortDate: d.docDate || null,
      createdAt: d.createdAt,
      getOpenUrl: () =>
        propertyDocumentsService.getDocumentSignedUrl(d.filePath, SIGNED_URL_EXPIRY_SEC),
    });
  }

  for (const p of depositProofs) {
    entries.push({
      id: `dp-${p.id}`,
      label: p.originalFilename || p.filePath.split('/').pop() || `${p.proofType}-${p.id}`,
      sortDate: null,
      createdAt: p.createdAt,
      getOpenUrl: () =>
        propertyDepositProofsService.getSignedUrl(p.filePath, SIGNED_URL_EXPIRY_SEC),
    });
  }

  const tileKeys = ['C1_TO_OWNER', 'C2_TO_C1', 'OWNER_RECEIPT'] as const;
  for (const key of tileKeys) {
    const files = chainState.filesByTile[key] || [];
    for (const f of files) {
      entries.push({
        id: `pcf-${f.id}`,
        label: f.file_name || f.storage_path?.split('/').pop() || f.id,
        sortDate: null,
        createdAt: f.created_at,
        getOpenUrl: () =>
          paymentChainService.getFileSignedUrl(f.storage_path, SIGNED_URL_EXPIRY_SEC),
      });
    }
  }

  for (const row of inventoryDocsRows as { id: string; storage_path: string | null; file_name: string | null; created_at: string }[]) {
    const path = row.storage_path;
    if (!path) continue;
    entries.push({
      id: `inv-${row.id}`,
      label: row.file_name || path.split('/').pop() || row.id,
      sortDate: null,
      createdAt: row.created_at,
      getOpenUrl: () =>
        propertyInventoryService.getDocumentSignedUrl(path, SIGNED_URL_EXPIRY_SEC),
    });
  }

  for (const row of expenseDocsRows as { id: string; storage_path: string; file_name: string | null; invoice_date: string | null; created_at: string }[]) {
    entries.push({
      id: `exp-${row.id}`,
      label: row.file_name || row.storage_path?.split('/').pop() || row.id,
      sortDate: row.invoice_date || null,
      createdAt: row.created_at,
      getOpenUrl: () =>
        propertyExpenseService.getDocumentSignedUrl(row.storage_path, SIGNED_URL_EXPIRY_SEC),
    });
  }

  sortDocumentEntries(entries);
  return entries;
}

/** List property-docs prefix for Übergabeprotokoll: try client-side first (plan: no API by default). On failure returns []. */
async function listPropertyDocsBookingPrefix(propertyId: string, bookingId: string): Promise<{ name: string }[]> {
  const path = `properties/${propertyId}/bookings/${bookingId}`;
  const { data, error } = await supabase.storage.from(PROPERTY_DOCS_BUCKET).list(path);
  if (error) return [];
  return (data || []).map((o) => ({ name: o.name }));
}

/**
 * Relation chain for rental folder commercial docs (no heuristics):
 * - Booking: source_reservation_id (FK to reservations).
 * - Invoices: booking_id (direct) OR reservation_id (proformas/invoices before booking created); file_url, document_type ('proforma'|'invoice').
 * - Offers: reservation_id only; no file_url; open = linked proforma/invoice (invoice.offer_id = offer.id) file_url when present.
 * Resolution: (A) Invoices by booking_id. (B) If booking.source_reservation_id set: add invoices by reservation_id and offers by reservation_id.
 */
export async function loadRentalFolderFiles(propertyId: string, bookingId: string): Promise<VirtualEntry[]> {
  const entries: VirtualEntry[] = [];
  const bookingIdStr = String(bookingId);

  const [booking, events, listResult] = await Promise.all([
    bookingsService.getById(bookingIdStr),
    tasksService.getCalendarEventsByPropertyAndBookingIds(propertyId, [bookingIdStr]),
    listPropertyDocsBookingPrefix(propertyId, bookingIdStr).catch(() => []),
  ]);

  const invoicesByBooking = await invoicesService.getInvoicesByBookingIds([bookingIdStr]);
  const reservationId = booking?.sourceReservationId ?? undefined;
  const invoicesByReservation = reservationId
    ? await invoicesService.getInvoicesByReservationIds([reservationId])
    : [];
  const seenIds = new Set<string>(invoicesByBooking.map((i) => i.id));
  const invoices: typeof invoicesByBooking = [...invoicesByBooking];
  for (const inv of invoicesByReservation) {
    if (!seenIds.has(inv.id)) {
      seenIds.add(inv.id);
      invoices.push(inv);
    }
  }

  for (const inv of invoices) {
    const isProforma = inv.documentType === 'proforma';
    const label = isProforma
      ? `Proforma ${inv.invoiceNumber}`
      : `Invoice ${inv.invoiceNumber}`;
    entries.push({
      id: `inv-${inv.id}`,
      label,
      sortDate: inv.date || null,
      createdAt: inv.date || '',
      entryType: isProforma ? 'proforma' : 'invoice',
      getOpenUrl: async () => {
        if (inv.fileUrl) return inv.fileUrl;
        throw new Error('No file URL for this document');
      },
    });
  }

  if (reservationId) {
    const offers = await offersService.getByReservationId(reservationId);
    for (const offer of offers) {
      const linkedInv = invoices.find((inv) => inv.offerId === offer.id && inv.fileUrl);
      const offerLabel = offer.offerNo ? `Offer ${offer.offerNo}` : `Offer ${offer.id.slice(0, 8)}`;
      entries.push({
        id: `offer-${offer.id}`,
        label: offerLabel,
        sortDate: offer.createdAt || null,
        createdAt: offer.createdAt || '',
        entryType: 'offer',
        getOpenUrl: async () => {
          if (linkedInv?.fileUrl) return linkedInv.fileUrl;
          throw new Error('No linked document for this offer');
        },
      });
    }
  }

  const invoiceIds = invoices.map((i) => i.id);
  for (const invId of invoiceIds) {
    const proofs = await paymentProofsService.getByInvoiceId(invId);
    for (const pp of proofs) {
      if (!pp.filePath) continue;
      entries.push({
        id: `pp-${pp.id}`,
        label: pp.fileName || `Payment proof ${pp.documentNumber || pp.id}`,
        sortDate: pp.createdAt || null,
        createdAt: pp.createdAt || '',
        entryType: 'payment_proof',
        getOpenUrl: () =>
          paymentProofsService.getPaymentProofSignedUrl(pp.filePath!, SIGNED_URL_EXPIRY_SEC),
      });
    }
  }

  const prefix = `properties/${propertyId}/bookings/${bookingIdStr}`;
  for (const obj of listResult) {
    const fullPath = `${prefix}/${obj.name}`;
    entries.push({
      id: `ubk-${fullPath}`,
      label: obj.name,
      sortDate: null,
      createdAt: '',
      entryType: 'upload',
      getOpenUrl: () =>
        propertyDocumentsService.getDocumentSignedUrl(fullPath, SIGNED_URL_EXPIRY_SEC),
    });
  }

  for (const ev of events) {
    const messages = await getTaskChatMessages(ev.id);
    for (const msg of messages) {
      const atts = (msg.attachments || []) as { bucket?: string; path: string; filename?: string }[];
      for (let i = 0; i < atts.length; i++) {
        const att = atts[i];
        if (!att?.path) continue;
        const bucket = att.bucket || 'task-media';
        entries.push({
          id: `tcm-${ev.id}-${msg.id}-${i}`,
          label: att.filename || att.path.split('/').pop() || `Attachment ${i + 1}`,
          sortDate: msg.createdAt || null,
          createdAt: msg.createdAt || '',
          entryType: 'task',
          getOpenUrl: () => getTaskAttachmentSignedUrl(bucket, att.path, SIGNED_URL_EXPIRY_SEC),
        });
      }
    }
    if (ev.type === 'Einzug' || ev.type === 'Auszug') {
      const steps = ev.workflowSteps || [];
      for (const step of steps) {
        const urls = [...(step.photos || []), ...(step.videos || [])];
        for (let i = 0; i < urls.length; i++) {
          const url = urls[i];
          if (!url) continue;
          entries.push({
            id: `wf-${ev.id}-${step.stepNumber}-${i}`,
            label: `${ev.type} Step ${step.stepNumber} ${step.stepName} (${i + 1})`,
            sortDate: step.completedAt || null,
            createdAt: step.completedAt || '',
            entryType: 'workflow',
            getOpenUrl: async () => url,
          });
        }
      }
    }
  }

  sortDocumentEntries(entries);
  return entries;
}
