import { tryCloseAuxWindow } from './browserAuxWindow';

/**
 * After synchronously opening a blank tab (`window.open('', '_blank')`), resolve a URL
 * asynchronously and assign it. Handles null window, empty URL, and errors per stay-modal plan.
 */
export async function openUrlInPreOpenedWindow(
  preOpenedWindow: Window | null,
  resolveUrl: () => Promise<string | null | undefined>,
  showError: (message: string) => void,
  emptyUrlMessage = 'No file link available.'
): Promise<void> {
  if (!preOpenedWindow) {
    showError('Could not open a new tab. Allow pop-ups for this site and try again.');
    return;
  }

  let url: string | null | undefined;
  try {
    url = await resolveUrl();
  } catch {
    tryCloseAuxWindow(preOpenedWindow);
    showError('Network error. Please try again.');
    return;
  }

  if (typeof url !== 'string' || !url.trim()) {
    tryCloseAuxWindow(preOpenedWindow);
    showError(emptyUrlMessage);
    return;
  }

  try {
    preOpenedWindow.location.href = url.trim();
  } catch {
    tryCloseAuxWindow(preOpenedWindow);
    showError('Could not open the document in the new tab.');
  }
}
