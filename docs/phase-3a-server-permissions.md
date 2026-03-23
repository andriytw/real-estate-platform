# Phase 3A — server-side permission alignment (без RLS)

**Канонічний план у Cursor:** `.cursor/plans/phase_3a_server_permissions_eebbe3ea.plan.md` — цей файл у `docs/` є **дублем для git**; при зміні правил спочатку оновлюй план у Cursor, потім узгоджуй цей документ.

## Контекст

- **Pass 1 / Pass 2** завершені на рівні профілю та UI ([lib/permissions.ts](../lib/permissions.ts), [lib/uiAccess.ts](../lib/uiAccess.ts)).
- **Сервер команд** (`api/`): [api/_lib/command-auth.ts](../api/_lib/command-auth.ts) завантажує `department_scope`, `can_manage_users`, `can_be_task_assignee` (+ legacy `department`, `category_access`). `CommandProfile` = `CommandAuthProfile` з [api/_lib/server-permissions.ts](../api/_lib/server-permissions.ts).
- **Assert-и** делегують у `canCreateOffersServer` / `canSaveInvoiceServer` / `canConfirmPaymentServer` (primary scope + `LEGACY` fallback).

## Межі (суворо)

| Робити | Не робити |
|--------|-----------|
| Розширити профіль + хелпери + assert-и в `api/` | RLS, SQL migrations з політиками |
| Перевірити edge functions (gates) | Видаляти `department` / `category_access` |
| Зберегти сумісність робочих flows | Широкий рефакторинг booking/offers |

## Фаза 1 — аудит

- [api/_lib/command-auth.ts](../api/_lib/command-auth.ts)
- [api/commands/create-multi-offer.ts](../api/commands/create-multi-offer.ts), [create-direct-booking.ts](../api/commands/create-direct-booking.ts), [save-invoice.ts](../api/commands/save-invoice.ts), [confirm-payment.ts](../api/commands/confirm-payment.ts)
- [supabase/functions/admin-create-user/index.ts](../supabase/functions/admin-create-user/index.ts), [invite-user/index.ts](../supabase/functions/invite-user/index.ts)

Результат: таблиця «шлях → поточна логіка → ризик vs UI».

## Фаза 2 — канонічний server profile

Розширити `select` + `CommandProfile`: `department_scope`, `can_manage_users`, `can_be_task_assignee`; legacy поля залишити transitional.

## Фаза 3 — api/_lib/server-permissions.ts (новий)

Хелпери: `effectiveDepartmentScope`, `hasFullScopeAccess`, `canManageUsersServer`, бізнес-гейти для offers / invoices / confirm-payment. `can_be_task_assignee` — не для бізнес-команд у цій фазі.

## Фаза 4 — оновлення assert-ів

`assertCanCreateOffers`, `assertCanSaveInvoice`, `assertCanConfirmPayment` → через хелпери; `category_access` лише як `LEGACY` fallback.

## Фаза 5 — user management (edge)

`can_manage_users` як gate для **admin-create-user** та **invite-user** (JWT у `Authorization`; клієнт: [services/supabaseService.ts](../services/supabaseService.ts) — `create`, `resendInvite`, `createWithoutInvite` передають `session.access_token`, не anon key).

## Фаза 6 — legacy fallback (коментарі в коді)

Primary: `department_scope`, `can_manage_users`. Fallback: `department`, `category_access`.

## Фаза 7 — не чіпати

RLS, SQL helpers, видалення колонок, UI guards, `must_change_password`, великі зміни в домені booking.

## Критерії приймання та deliverable

Див. повний список у канонічному плані в Cursor (критерії 1–6, deliverable 1–8, mermaid-діаграма).

### Стан імплементації (Phase 3A)

| Область | Файли / зміна |
|--------|----------------|
| Server profile + asserts | `api/_lib/command-auth.ts`, `api/_lib/server-permissions.ts` |
| Команди (без змін сигнатур) | `api/commands/create-multi-offer.ts`, `create-direct-booking.ts`, `save-invoice.ts`, `confirm-payment.ts` |
| Edge UM | `supabase/functions/invite-user/index.ts` (gate), `admin-create-user` (без змін логіки — вже `can_manage_users`) |
| Клієнт invite | `services/supabaseService.ts` — Bearer = user JWT |

**Ручний чеклист (staging):** користувач з `can_manage_users` — invite / resend / skipInvite; без права — 403; команди offers / booking / invoice / confirm-payment під різними scope; legacy `category_access` / `department` ще дозволяють старі сценарії.

**Build:** `npm run build` (корінь) — OK після змін.
