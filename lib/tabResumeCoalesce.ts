/**
 * Coalesces tab-return work: visibilitychange + pageshow (bfcache) can fire close together.
 * Debounces so one logical "resume" per return; exposes a monotonic generation for stale guards.
 */

import { isClientDebugIngestEnabled, isClientDebugLogsEnabled } from './clientDebug';

const DEBOUNCE_MS = 100;

let resumeGeneration = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const subscribers = new Set<(generation: number) => void>();

export function getTabResumeGeneration(): number {
  return resumeGeneration;
}

function dumpDomLayers(): Array<{tag:string,z:string,classes:string}> {
  try {
    const els = document.querySelectorAll('*');
    const layers: Array<{tag:string,z:number,classes:string}> = [];
    els.forEach(el => {
      const s = getComputedStyle(el);
      if (s.position === 'fixed' && s.inset === '0px') {
        layers.push({tag:el.tagName.toLowerCase(),z:parseInt(s.zIndex)||0,classes:(el.className||'').toString().slice(0,120)});
      }
    });
    layers.sort((a,b) => b.z - a.z);
    return layers.slice(0,5).map(l => ({tag:l.tag,z:String(l.z),classes:l.classes}));
  } catch { return []; }
}

function _dbg(loc: string, msg: string, data: Record<string, unknown>) {
  if (!isClientDebugLogsEnabled()) return;
  const entry = { t: Date.now(), loc, msg, ...data };
  try {
    console.warn('[DBG-978438]', JSON.stringify(entry));
  } catch {
    /* ignore */
  }
  try {
    const arr = JSON.parse(localStorage.getItem('__dbg978438') || '[]');
    arr.push(entry);
    if (arr.length > 60) arr.splice(0, arr.length - 60);
    localStorage.setItem('__dbg978438', JSON.stringify(arr));
  } catch {
    /* ignore */
  }
  if (!isClientDebugIngestEnabled()) return;
  try {
    fetch('http://127.0.0.1:7242/ingest/1aed333d-0076-47f3-8bf4-1ca5f822ecdd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '978438' },
      body: JSON.stringify({ sessionId: '978438', location: loc, message: msg, data, timestamp: Date.now() }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export { _dbg };

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
    if (isClientDebugLogsEnabled()) {
      setTimeout(() => {
        _dbg('tabResume:postFlush', 'DOM layers 2s after resume', {
          gen: g,
          layers: dumpDomLayers(),
          bodyChildren: document.body.childElementCount,
          bodyText: document.body.innerText?.slice(0, 300),
        });
      }, 2000);
    }
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
