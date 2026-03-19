/**
 * Helpers for popup-safe async document opens (pre-opened auxiliary windows).
 */

export function tryCloseAuxWindow(win: Window | null): void {
  if (!win) return;
  try {
    if (!win.closed) win.close();
  } catch {
    // Cross-origin or policy may block close; ignore.
  }
}
