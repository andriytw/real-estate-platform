/**
 * Coalesces tab-return work: visibilitychange + pageshow (bfcache) can fire close together.
 * Debounces so one logical "resume" per return; exposes a monotonic generation for stale guards.
 */

const DEBOUNCE_MS = 100;

let resumeGeneration = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<(generation: number) => void>();

export function getTabResumeGeneration(): number {
  return resumeGeneration;
}

export function scheduleTabResumeWork(): void {
  if (debounceTimer != null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    resumeGeneration += 1;
    const g = resumeGeneration;
    subscribers.forEach((fn) => {
      try {
        fn(g);
      } catch {
        /* isolate subscriber errors */
      }
    });
  }, DEBOUNCE_MS);
}

export function subscribeTabResume(callback: (generation: number) => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Register once (e.g. WorkerProvider): visibility + bfcache pageshow → single debounced flush. */
export function registerBrowserTabResumeListeners(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') scheduleTabResumeWork();
  };
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted && document.visibilityState === 'visible') scheduleTabResumeWork();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
  };
}
