# Production Hanging Flows Investigation

## Scope / guardrails

- Investigation-only phase for stuck/hanging UX in:
  - direct booking from calendar
  - multi-offer save/send
  - proforma/invoice save/upload
  - confirm payment with/without PDF
- No fixes implemented in this phase.
- No changes to auth/permission cleanup work; Track C remains paused after 4K2.5b.
- No changes to:
  - `api/_lib/server-permissions.ts`
  - `api/_lib/command-auth.ts`

## Hypothesis matrix

| Hypothesis | What would look like a hang | Current code signal | Initial confidence |
|---|---|---|---|
| UI stale lock (ref/state not reset) | Click ignored, button stays disabled, no new request | per-flow `*SaveInProgressRef` guards and modal local loading states | medium |
| Modal sequencing dependency | Save succeeded but user still sees pending next step | `SendChannelModal` closes flow only on its own close callback | high |
| Timeout/retry confusion | User sees timeout, retries, original request may still finish | `Promise.race` timeout in `MultiApartmentOfferModal` does not cancel underlying request | high |
| Server latency | Long wait before response or timeout | `commandClient` 90s/120s AbortController timeouts | medium |
| Backend error path | Request fails but UI message looks like indefinite wait | catch/alert paths vary across flows | medium |
| Not reproducible from code alone | No deterministic stall path without runtime traces | several branches require live timing + logs correlation | medium |

## Per-flow control-flow maps

### 1) Direct booking from calendar

- Entry: `MultiApartmentOfferModal` in `directBookingMode`, button `Create booking` -> `handleSubmit('directBooking')`.
- Local loading state: `savingMode='directBooking'` in modal.
- Parent lock: `directBookingSaveInProgressRef.current=true` in `handleSaveDirectBookingFromCalendar`.
- Idempotency: `directBookingIdempotencyKeyRef` reused per logical action; passed as `X-Idempotency-Key`.
- API call: `commandPostJson('/api/commands/create-direct-booking', ...)`.
- Success path: prepend offer, set send-channel payload, close-on-send callback.
- Error path: alert with `CommandClientError` message.
- Unlock path: parent `finally` resets `directBookingSaveInProgressRef`; modal `finally` clears `savingMode`.
- Close path: modal close during save triggers `onStuckClearLock` (global lock clear escape hatch).
- Follow-up dependency: yes, send-channel modal flow.

### 2) Multi-offer save

- Entry: `MultiApartmentOfferModal` save/send control uses `handleSubmit`.
- Local loading state: `savingMode='send'` (UI has one submit branch for non-direct mode).
- Parent lock: `multiOfferSaveInProgressRef.current=true` in `handleSaveMultiApartmentOffer`.
- Idempotency: `multiOfferIdempotencyKeyRef` reused for retries in same action.
- API call: `commandPostJson('/api/commands/create-multi-offer', { draft, mode })`.
- Success path (`mode='draft'`): set sales tab and refresh data.
- Error path: toast + rethrow to modal handler.
- Unlock path: parent `finally` resets lock; modal `finally` clears `savingMode`.
- Close path: while saving, close triggers global lock clear callback.
- Follow-up dependency: no for pure draft save.

### 3) Multi-offer send

- Same as flow 2 until success.
- Success path (`mode='send'`): sets `sendChannelPayload`; close action is deferred to `SendChannelModal` `onClose` callback.
- Potential perceived hang: save completed but user is blocked in send-channel step.
- Unlock path still in parent/modal `finally`.
- Follow-up dependency: yes (primary).

### 4) Invoice/proforma save without upload

- Entry: `InvoiceModal` save buttons -> `handleSave('save'|'send')`.
- Local loading states: `saving=true`, `uploading=false`.
- Parent lock: `invoiceSaveInProgressRef.current=true` in `handleSaveInvoice`.
- Idempotency: `invoiceIdempotencyKeyRef` stable during action.
- API call: `commandPostJson('/api/commands/save-invoice', ...)`.
- Success path:
  - non-send: close invoice modal and route to invoices/proformas tabs.
  - proforma send: open `SendChannelModal`.
- Error path: alert with normalized message.
- Unlock path: parent `finally` resets lock; modal `finally` clears `saving/uploading`.
- Close path: `onAbandonStuck('persist')` can force-clear parent lock and remount modal.
- Follow-up dependency: yes for proforma send only.

### 5) Invoice/proforma save with PDF upload

- Same as flow 4 with `pdfFile` present.
- Local loading states: `uploading=true`, then `saving=true`.
- API call: `commandPostFormData('/api/commands/save-invoice', fd, ...)`.
- Timeout layer: upload path uses longer `commandClient` timeout (120s).
- Close path while uploading: `onAbandonStuck('upload')` closes/remounts modal; parent lock may remain if request still active.
- Follow-up dependency: same as flow 4.

### 6) Confirm payment without PDF

- Entry: `ConfirmPaymentModal` -> `handleSaveAndConfirm`.
- Local loading state: `uploading=true` (same state used with/without file).
- Idempotency: `idempotencyKeyRef` persisted in modal; reset on success/close.
- API call: `commandPostFormData('/api/commands/confirm-payment', fd, ...)`.
- Success path: `onConfirmed(bookingId)` then close/reset.
- Error path: detailed error text based on `kind` + parsed body.
- Unlock path: modal `finally` resets `uploading`.
- Follow-up dependency: no send-channel dependency.

### 7) Confirm payment with PDF

- Same as flow 6, with `fd.append('file', pdf)`.
- Additional stall surface: larger upload payload + 120s timeout.
- Unlock and error handling identical.

## Lock-reset audit

### AccountDashboard per-flow locks

- `multiOfferSaveInProgressRef`, `directBookingSaveInProgressRef`, `invoiceSaveInProgressRef` are set before API calls and reset in `finally` blocks in each corresponding handler.
- There is a global escape hatch `onStuckClearAccountDashboardSaveLock()` that clears **all** three locks.

### Modal local states

- `MultiApartmentOfferModal`: `savingMode` set before request, reset in `finally`.
- `InvoiceModal`: `uploading`/`saving` reset in `finally`; has `onAbandonStuck` to force-close.
- `ConfirmPaymentModal`: `uploading` reset in `finally`.

### Lock-safety conclusions

- No obvious static path where parent per-flow lock remains true after normal `try/catch/finally`.
- Perceived stuck risk exists when user closes a modal while request is still in flight and then retries, because forced unlock/remount can obscure whether prior request eventually succeeded.
- Global lock clear can remove unrelated in-progress guard state, which is useful operationally but can blur causality during triage.

## Timeout audit

| Layer | Location | Value | Classification |
|---|---|---:|---|
| JSON command timeout | `commandPostJson` | 90s | baseline |
| FormData upload timeout | `commandPostFormData` | 120s | baseline upload |
| Modal timeout guard | `MultiApartmentOfferModal` `Promise.race` | 90s | potentially conflicting (does not cancel parent request) |
| Upload/persist labels | `InvoiceModal` | state-only | UI-only indicator |

### Timeout layering conclusions

- Direct booking / multi-offer / invoice JSON paths are aligned with 90s command timeout.
- Upload paths use 120s; expected longer waits can be interpreted as hang without progress UI.
- `MultiApartmentOfferModal` timeout guard is the strongest mismatch: timeout clears UI and lock via callback but underlying request may still complete later.

## Send-channel dependency audit

- `handleSaveDirectBookingFromCalendar`, `handleSaveMultiApartmentOffer(mode='send')`, and `handleSaveInvoice` for proforma-send set `sendChannelPayload` and defer full completion UX to `SendChannelModal` close callback.
- This creates a valid sequencing dependency: backend save may already be complete while UI still expects user action in channel picker.
- High chance of user interpreting this as a stalled save if transition messaging is unclear.

## Findings table

| Flow | Primary entry point | Reproducer status | Suspected hang class | High-confidence root cause? | Evidence source | Affected file(s) | Affected function(s) | Candidate fix scope | Fix risk | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Direct booking from calendar | `MultiApartmentOfferModal` -> `handleSaveDirectBookingFromCalendar` | reproducible path in code, runtime correlation needed | sequencing dependency / stale-state after forced close | no | code audit | `components/MultiApartmentOfferModal.tsx`, `components/AccountDashboard.tsx` | `handleSubmit`, `handleSaveDirectBookingFromCalendar` | improve progress messaging + close behavior contracts | medium | save success may wait behind send-channel action |
| Multi-offer save | `MultiApartmentOfferModal` -> `handleSaveMultiApartmentOffer(mode='draft')` | reproducible path in code, runtime traces pending | timeout/retry confusion | yes | code audit | `components/MultiApartmentOfferModal.tsx`, `components/AccountDashboard.tsx` | `handleSubmit`, `handleSaveMultiApartmentOffer` | unify timeout ownership; avoid uncancelled race timeout | medium | modal timeout can fire while parent request still in flight |
| Multi-offer send | same with `mode='send'` | reproducible path in code, runtime traces pending | sequencing dependency + timeout layering | yes | code audit | same as above + `SendChannelModal` wiring in dashboard | same | explicit stage indicator (saved vs awaiting send) | low-medium | likely perceived hang, not backend stall |
| Invoice/proforma save without upload | `InvoiceModal` -> `handleSaveInvoice` JSON path | reproducible path in code, live evidence needed | stale-state on close/reopen / sequencing dependency (send only) | no | code audit | `components/InvoiceModal.tsx`, `components/AccountDashboard.tsx` | `handleSave`, `handleSaveInvoice` | tighten abandon semantics + success visibility | medium | forced abandon can hide late success |
| Invoice/proforma save with PDF upload | `InvoiceModal` upload path | reproducible path in code, live evidence needed | server latency perception + stale-state after abandon | no | code audit | same + `services/commandClient.ts` | `handleSave`, `commandPostFormData` | add progress telemetry and completion reconciliation UX | medium | 120s timeout with large uploads can look frozen |
| Confirm payment without PDF | `ConfirmPaymentModal` -> `handleSaveAndConfirm` | not reproducible from current code evidence | backend latency/error or live-only issue | no | code audit | `components/ConfirmPaymentModal.tsx`, `services/commandClient.ts` | `handleSaveAndConfirm`, `commandPostFormData` | live trace correlation first | low | local state cleanup in finally appears safe |
| Confirm payment with PDF | same with attached PDF | not reproducible from current code evidence | upload latency perception | no | code audit | same | same | live capture first; evaluate payload-size UX later | low-medium | no static deadlock path identified |

## Root-cause ranking

| Rank | Root cause | Confidence | Flows impacted | Why it fits evidence | Target fix phase |
|---:|---|---|---|---|---|
| 1 | Timeout ownership mismatch (`Promise.race` timeout in modal without request cancellation) | high | multi-offer save/send, direct-booking modal behavior | explicit comment + code path where UI timeout can win while request continues | phase 1 UX/control-flow hardening |
| 2 | Save-success but UI waiting on send-channel step interpreted as hang | high | direct booking, multi-offer send, proforma send | save handlers intentionally defer closure to send modal on-close callback | phase 1 UX staging clarity |
| 3 | Abandon/remount escape hatch can hide late success and create retry confusion | medium | invoice/proforma save (esp upload), multi-offer/direct booking when manually closed | forced unlock/remount is diagnostic escape hatch, not transactional reconciliation | phase 2 resilience/reconciliation |
| 4 | Long upload/server latency without explicit progress granularity | medium | invoice/proforma with PDF, confirm-payment with PDF | 120s timeout, single busy label, no intermediate milestone feedback | phase 2 UX observability |
| 5 | Backend error path misread as hang due sparse correlation | low-medium | all command flows | trace id/idempotency exists but not surfaced to user-facing diagnostics | phase 2 diagnostics tooling |

## Missing evidence / next live capture requirements

- For any user-reported hang, capture:
  - browser network entry (request start/end, status, response body)
  - browser console logs around trace/idempotency and modal close action
  - matching Vercel function log line for same timestamp/path
- Required to disambiguate:
  - true server stall vs successful save + UI sequencing wait
  - timeout-induced retry confusion vs backend error
- Flows currently marked "not reproducible from current code evidence" require live trace correlation before selecting fixes.

## Proposed fix phase split (not implemented here)

### Phase A: control-flow and UX clarity
- Single source of timeout ownership per flow.
- Explicit UI stage messages: `Saving`, `Saved`, `Awaiting send-channel action`.
- Prevent ambiguous close while in-flight unless state is reconciled.

### Phase B: diagnostics and reconciliation
- Correlation surface for trace/idempotency in user-visible error details.
- Re-entry reconciliation after abandoned modal (detect late success and refresh state).
- Optional richer upload progress indication for long-running FormData paths.

## Implementation Follow-up (bounded fix phase)

### Root causes fixed in code

- Timeout ownership mismatch for multi-offer/direct-booking modal guard:
  - `MultiApartmentOfferModal` now uses shared command timeout constant from command client and clears timeout handles on completion.
- Scoped stale-lock reset behavior:
  - `AccountDashboard` stuck-clear path now supports per-flow reset (`multiOffer`, `directBooking`, `invoice`) and clears matching idempotency keys, avoiding broad cross-flow unlock side effects.
- Sequencing/close determinism improvements:
  - `ConfirmPaymentModal` blocks close while request is in-flight.
  - `InvoiceModal` save/send buttons are consistently disabled while any save/upload is active.

### Files changed

- `services/commandClient.ts`
- `components/MultiApartmentOfferModal.tsx`
- `components/AccountDashboard.tsx`
- `components/InvoiceModal.tsx`
- `components/ConfirmPaymentModal.tsx`

### Flows covered by implementation

- Direct booking from calendar
- Multi-offer save
- Multi-offer send
- Invoice/proforma save without upload
- Invoice/proforma save with PDF upload
- Confirm payment without PDF
- Confirm payment with PDF

### Deferred / still live-correlation dependent

- End-to-end confirmation of reduced perceived hanging under production latency requires live browser+Vercel correlation captures.
- Rich upload progress granularity remains deferred (no broad UX refactor in this bounded phase).

## Dashboard / shell broken-state after tab return

### Strong reproduction summary

- **Observed:** Fresh page load restores normal behavior immediately.
- **Observed:** Same-tab repeated actions often work across offer, booking, and invoice/proforma flows.
- **Observed:** Switching to another tab/app and returning is the strongest trigger for the broken state.
- **Observed:** In the same broken window, multiple unrelated controls can fail together (create flows, logout click, assignee dropdown opening, task chat loading).
- **Observed:** Backend `2xx` for command routes can coexist with stuck-looking UI, so route success is not sufficient proof of healthy UI finalize.
- **Code-derived:** App-level and session-level visibility listeners run on tab return and can trigger overlapping refresh/sync work while the shell remains mounted.

### Evidence discipline

#### Observed manual evidence

- Reload heals immediately.
- Tab return is the primary trigger.
- Cross-feature failures occur together.
- Logout can be dead in the same incident as modal/feature issues.
- Facility assignee dropdown and chat loader can fail in the same incident.

#### Code-derived evidence

- `App.tsx` runs `syncViewWithPath()` on `visibilitychange` and `pageshow`.
- `WorkerContext.tsx` runs `syncSessionAndWorker()` on `visibilitychange`, which re-checks session and can start profile reload.
- `AccountDashboard.tsx` renders many full-viewport modal backdrops (`fixed inset-0`) with z-indexes above navbar z-index.
- `AdminCalendar.tsx` gates assignee interactivity with `loadingWorkers` and has async chat loading paths that may overlap lifecycle transitions.

#### Still-unproven hypotheses

- A stale overlay/backdrop or portal layer occasionally remains mounted after tab resume and intercepts clicks.
- Visibility-triggered concurrent refresh paths race and leave shell in a half-ready state.
- Stale async completion ordering in calendar chat/worker loads contributes to "visually alive but logically broken" UI.

#### Missing evidence

- Runtime snapshot of topmost element/hit target during dead-click.
- Timing-correlated event logs for visibility listeners and resulting fetches.
- Performance trace around tab return that shows whether clicks fire and where they are consumed.

### Cross-feature symptom matrix

| Feature/surface | Observed symptom | Command/backend involved? | Why this points to shell-level issue |
|---|---|---|---|
| Create offer / direct booking / multi-offer | Submit appears stuck after tab return | Sometimes yes (`2xx` seen) | UI can remain blocked despite successful backend response |
| Proforma/invoice actions | Save/upload appears stuck after tab return | Sometimes yes | Same trigger pattern as non-invoice features |
| Logout | Dead click in broken state | No command route dependency | Strong canary for global interactivity blocker |
| Facility assignee dropdown | Control does not open/respond | No command route dependency | Points to shared interactivity/lifecycle layer |
| Facility task chat/messages | Stays loading | No command route dependency | Indicates shared async/lifecycle degradation |
| Reload behavior | Immediate recovery | N/A | Typical of client-state reset rather than persistent backend fault |

### Same-tab vs tab-return comparison

| Dimension | Same-tab behavior | Tab-return behavior | Evidence class |
|---|---|---|---|
| Action reliability | Often normal across repeated attempts | Elevated failure probability on next critical action | observed |
| Trigger dependency | No special trigger needed | Correlates with visibility transition | observed |
| Cross-feature blast radius | Usually local when issues happen | Multiple controls can fail together | observed |
| Route health correlation | UI often matches route outcome | `2xx` can coexist with broken UI | observed + code-derived |
| Best-fit mechanism | Local flow bugs possible | Shared lifecycle/overlay/resume race more likely | hypothesis |

### Visibility / focus / resume lifecycle audit

| File | Symbol/hook | Trigger | Shared state touched | Race potential |
|---|---|---|---|---|
| `App.tsx` | visibility effect (`handleVisibilityChange`) | `document.visibilitychange` to visible | `currentView` via `syncViewWithPath()` | **Medium**: can overlap with profile refresh and route guards |
| `App.tsx` | bfcache effect (`handlePageShow`) | `window.pageshow` persisted | `currentView` via `syncViewWithPath()` | **Low-Medium** |
| `WorkerContext.tsx` | visibility effect (`handleVisibilityChange`) | `document.visibilitychange` to visible | `session`, `profileLoadStatus`, `worker`, `workerError` | **High**: async session/profile reload while shell still mounted |
| `MarketMap.tsx` | visibility/focus/pageshow handlers | visible/focus/pageshow | local map refresh state | **Low** for shell-wide freeze, but contributes background work |

Cleanup quality:

- Add/remove symmetry exists for listed listeners.
- No obvious leaked listener from the inspected hooks.
- Remaining risk is not missing cleanup but **concurrent resume-triggered async work** and ordering side effects.

### Dashboard bootstrap / shell readiness audit

| Area | State variable(s) | Set by | Cleared by | Suspicion |
|---|---|---|---|---|
| Worker bootstrap | `profileLoadStatus`, `worker`, `session` | `syncSessionAndWorker`, initial session load | success/error/idle branches | **Medium-High**: visibility-triggered refresh can run while UI tree stays mounted |
| Protected view gate | `worker == null` + `profileLoadStatus` checks in `App.tsx` | render path guards | next successful worker/profile state | **Medium**: half-ready appearance possible if worker remains while refreshs run |
| Dashboard modals/overlays | many `is*ModalOpen` flags | local component actions | close handlers / success flows | **High**: stale open flag or interrupted close can block global clicks |
| Facility worker readiness | `loadingWorkers` | `loadWorkers` effect | `finally` in worker loader | **Medium**: dropdown disabled path overlaps resume timing |
| Facility chat readiness | `chatLoading`, `taskMessages`, `chatError` | chat effect on `viewEvent` | effect branches and `finally` | **Medium**: stale completion may produce misleading loading/error state |

### AccountDashboard async/race audit (suspicious areas)

| Symbol/path | Why suspicious | Can explain cross-symptoms? |
|---|---|---|
| `components/AccountDashboard.tsx` many modal booleans and `fixed inset-0` backdrops | Large number of independent overlay states with high z-indexes | **Yes** for dead logout/dropdown clicks if stale layer remains |
| `components/AccountDashboard.tsx` in-dashboard logout button path | Uses same logical action as navbar logout | **Yes** (if both dead, points to click interception/global blocker) |
| `components/AccountDashboard.tsx` top-level shell wrappers | Shell can appear visually active while interaction path is blocked | **Yes** |
| Offer/invoice lock refs (`*SaveInProgressRef`) | Can create local stale submit state | **Partially**; weaker for dead logout/dropdown unless coupled with shell blocker |

### AdminCalendar state-machine audit

| Subsystem | Start | Success | Failure | Finally symmetry | Notes |
|---|---|---|---|---|---|
| Workers load | `setLoadingWorkers(true)` | `setWorkers(data)` | log error | `setLoadingWorkers(false)` | Symmetric, but disabled-select state depends on timely settle |
| Chat load | `setChatLoading(true)` + clear error | `setTaskMessages(mapped)` | `setChatError(...)`, `setTaskMessages([])` | `setChatLoading(false)` always runs | `cancelled` guard exists, but stale `finally` ordering can still alter UI timing |
| Dropdown close listener | add `mousedown` listener | close dropdown flags | N/A | remove listener on cleanup | Not an obvious leak; still test for immediate-close behavior under blocked click paths |
| ESC lightbox listener | add on open | close on escape | N/A | remove listener on cleanup | Local risk only |

### Interaction blocker inventory (beyond z-index)

| Blocker class | Code-derived status | Confidence |
|---|---|---|
| z-index overlays / backdrops | Present heavily in dashboard + modal surfaces | **High** |
| `pointer-events` geometry blockers | Present across modals/chat/map decorations; some full-screen wrappers use pointer-events layering | **Medium-High** |
| `inert` attribute | No meaningful usage found in audited paths | **Low** |
| `aria-hidden` | Present mostly on decorative/non-interactive elements | **Low** as primary click blocker |
| body/root scroll lock (`overflow-hidden` on `body/html`) | No explicit global body lock mechanism found in audited paths | **Low-Medium** |
| portal lifecycle corruption | `createPortal` usage not a dominant pattern in current audited shell paths; standard modal trees still may orphan via state races | **Medium** |

### Top-level shell interactivity audit

| Surface | Code path | What to verify during repro | Suspicion |
|---|---|---|---|
| Navbar | `components/Navbar.tsx`, nav at `z-50` | Whether click handler fires or click is intercepted | **High** (as canary) |
| Logout (navbar + sidebar) | `Navbar.handleLogout` and in-dashboard logout button | If both fail simultaneously, treat as shell-level blocker first | **High** |
| Sidebar | `AccountDashboard` fixed left hover strip + panel | Whether sidebar captures unintended pointer area | **Low-Medium** |
| Facility assignee dropdown | `AdminCalendar` native select with `disabled={loadingWorkers}` | Distinguish disabled state vs blocked click path | **Medium** |
| Page wrappers/layout | `App.tsx` / `AccountDashboard` root wrappers and modal layers | Detect any full-screen element above intended target | **High** |

### Submit-boundary interpretation (primary vs secondary)

- **Code-derived:** direct booking/multi-offer/invoice/confirm flows have their own local locks and async finalize complexity.
- **Observed:** tab-return can also break logout/dropdown/chat.
- **Conclusion:** command-submit hangs are now treated as **secondary symptoms** when reproduction includes tab return and simultaneous shell-interactivity degradation.

### Why reload heals immediately

- **Observed:** page reload restores full interactivity.
- **Code-derived:** reload resets React state/ref trees, unmounts modal/backdrop DOM, and rebuilds event/listener graph.
- **Hypothesis:** broken state depends on long-lived session tab lifecycle plus resume ordering; hard reload removes stale in-memory branches and orphaned interaction blockers.
- **Implication:** this pattern favors client-shell lifecycle/interactivity root causes over persistent backend command-route failures.

### Shared-state / common-denominator analysis

Narrowest shared layer that can explain all failures together:

1. **Shell-level interaction plane** (global overlays/backdrops/pointer routing above content, including navbar).
2. **Visibility-resume orchestration** (`App` route sync + `WorkerContext` session/profile refresh) that can run concurrently after tab return.
3. **Feature-level async state machines** (calendar chat/workers, submit modals) inheriting an already-degraded shell.

This explains why command `2xx` can coexist with dead controls and why reload immediately heals.

### Root-cause class ranking (A-J)

| Class | Confidence | Supporting code-derived evidence | Supporting manual evidence | Missing evidence |
|---|---|---|---|---|
| A. Visibility/focus-triggered resume race | **High** | `App` + `WorkerContext` visibility-driven reload/sync paths | tab return is deterministic trigger | event timeline proving harmful overlap |
| B. Stale async completion / stale finally overwrite | **Medium** | AdminCalendar chat loader has overlapping async branches with unconditional finally state set | chat can remain loading in broken state | trace showing stale completion overwriting newer intent |
| C. Broken global loading or disabled-shell state | **Medium** | multiple readiness gates and local disabled states | multi-feature deadness after tab return | concrete stuck flag capture |
| D. Invisible overlay / pointer-events blocker | **High** | many full-screen backdrops with high z-index + pointer-event layering patterns | dead logout/dropdown with visually alive UI | DOM hit-test at failure moment |
| E. Portal/modal/dropdown lifecycle corruption | **Medium-High** | many modal booleans and close paths | reload heals immediately | proof of orphaned mounted layer |
| F. Background tab timer/throttling side effect | **Medium** | async-heavy UI + timers/network waits | failure tied to tab switching duration | performance trace showing resumed delayed tasks causing conflict |
| G. Duplicate subscriptions / duplicate reload triggers | **Medium** | multiple resume handlers (`visibilitychange`, `pageshow`) | trigger linked to return | subscription count / duplicate handler evidence |
| H. Clear-to-empty on transient failure | **Medium** | calendar chat path sets empty/error states on failures | chat stuck/empty symptoms observed | request/response evidence of transient fail on return |
| I. Direct-booking-specific finalize bug (secondary) | **Low-Medium** | submit-flow complexity exists but localized | cross-feature failures include non-booking controls | proof that issue reproduces without any booking flow |
| J. Session/profile/bootstrap degradation | **Medium-High** | `syncSessionAndWorker` on visibility can alter profile/session state while shell mounted | tab-return trigger + broad impact | state snapshots around failure |

### What would prove or disprove top hypotheses

| Hypothesis | Proof signal | Disproof signal |
|---|---|---|
| Overlay/pointer blocker (D/E) | `document.elementFromPoint` over dead controls returns backdrop/overlay; click handlers do not fire | click handlers fire and no overlay sits above target |
| Resume race (A/J/G) | timeline shows visibility event -> overlapping sync/refetch -> degraded interactivity state | ordered single refresh without state corruption |
| Stale async completion (B/H) | older request completion mutates state after newer UI intent | strictly monotonic request lifecycle and state transitions |

### Recommended next bounded implementation scope (if diagnosis accepted)

1. **Phase 1: Shell interactivity instrumentation + blocker hardening**
   - Add temporary diagnostics for topmost click target, active modal/backdrop flags, and visibility/resume sequence IDs.
   - Enforce deterministic modal/backdrop ownership and unmount guarantees for high-z overlays in dashboard shell.
2. **Phase 2: Resume orchestration hardening**
   - Coalesce/serialize tab-return refresh triggers (`App` + `WorkerContext`) and ignore stale completions by generation token.
3. **Phase 3: AdminCalendar resilience follow-up**
   - Guard chat/worker loaders against stale finally overwrites and add explicit readiness transitions.

Guardrails remain unchanged: Track C paused, no auth/permission file changes, no broad refactor in this phase.
