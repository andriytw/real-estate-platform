import { tryCloseAuxWindow } from './browserAuxWindow';

/**
 * Übergabeprotokoll DOCX via POST .../get-url — same contract as SalesCalendar hover.
 * Caller must open a blank tab synchronously on user gesture and pass it here.
 */
export async function openUebergabeProtocolFromBooking(params: {
  bookingId: string | number;
  propertyId: string;
  preOpenedWindow: Window | null;
  showError: (message: string) => void;
}): Promise<void> {
  const { bookingId, propertyId, preOpenedWindow, showError } = params;

  if (!preOpenedWindow) {
    showError('Could not open a new tab. Allow pop-ups for this site and try again.');
    return;
  }

  try {
    const res = await fetch('/api/protocols/uebergabeprotokoll/get-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, propertyId, format: 'docx' }),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; stage?: string };

    if (!res.ok) {
      tryCloseAuxWindow(preOpenedWindow);
      const msg = `${json?.error ?? 'Could not open protocol'}${json?.stage ? ` (${json.stage})` : ''}`;
      showError(msg);
      return;
    }

    const url = json?.url;
    if (typeof url !== 'string' || !url.trim()) {
      tryCloseAuxWindow(preOpenedWindow);
      showError('No download link was returned.');
      return;
    }

    try {
      preOpenedWindow.location.href = url.trim();
    } catch {
      tryCloseAuxWindow(preOpenedWindow);
      showError('Could not open the document in the new tab.');
    }
  } catch {
    tryCloseAuxWindow(preOpenedWindow);
    showError('Network error. Please try again.');
  }
}
