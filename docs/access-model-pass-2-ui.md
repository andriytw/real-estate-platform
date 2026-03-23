# Access Model Redesign — Pass 2 (UI route guards + module access)

**Канонічний план у Cursor:** `.cursor/plans/pass_2_ui_access_model_828760f0.plan.md` — цей файл у `docs/` є **дублем для git**; при зміні правил спочатку оновлюй план у Cursor, потім узгоджуй цей документ.

**Версія тексту:** 3 (фінальні уточнення перед execution)

## Мета

Забезпечити **однакову** поведінку для sidebar, прямих URL, route guards, точок входу в модулі та assignee UI для задач / Kanban.

## Межі (out of scope)

RLS, command-auth, `must_change_password` / перший вхід зі зміною пароля, окремі глибокі зміни booking / offers / invoices / payments (крім мінімально потрібного для доступу до екранів).

## Уточнення перед execution (v3)

### A. Доступ до Tasks (desktop)

| Роль | Поведінка |
|------|-----------|
| **super_manager** | Desktop tasks дозволені (`canViewModule` для модуля `tasks`). |
| **manager** | Tasks дозволені **лише в межах власного department scope** — технічно `canViewModule(user, 'tasks')` (facility / accounting / `all` або legacy `category_access`). Без доступу до чужих областей через URL. |
| **worker** | **Без** desktop tasks: лише **`/worker`**; `/tasks` та `/admin/tasks` заборонені → redirect. |

### B. `isEligibleTaskAssignee` — лише призначення

Використовувати **тільки** в assignee **dropdowns / selectors**. **Не** для видимості модулів, route guards, доступу до відділів.

### C. `/admin/tasks`

Гейт: **`canViewModule(user, 'tasks')`**, **не** `can_manage_users`. Це не «user admin» route.

### D. Прямі URL

1. **Заборонений маршрут верхнього рівня** → **`replace` redirect** на **`defaultAuthenticatedPath(worker)`**.
2. **Некоректний стан всередині дозволеного маршруту** (наприклад `/account`) → **«Немає доступу»** або кламп `activeDepartment` до `firstAllowedDashboardModule`, якщо застосовно.

## Джерело правди (код)

| Код | Призначення |
|-----|-------------|
| [lib/permissions.ts](../lib/permissions.ts) | `canViewModule`, `canAccessDepartment`, `canManageUsers`; `isEligibleTaskAssignee` — лише assignee UI (п. B). |
| [lib/uiAccess.ts](../lib/uiAccess.ts) | `firstAllowedDashboardModule`, `canAccessDashboardModule`. |

## Ключові маршрути

| URL | Гейт |
|-----|------|
| `/account`, `/dashboard` | Desktop managers / super_manager; worker → redirect |
| `/worker` | Лише worker |
| `/tasks`, `/admin/tasks` | **`canViewModule(user, 'tasks')`** (п. C); не `can_manage_users` |

## Фази роботи (коротко)

1. Аудит: App, Navbar, AccountDashboard, AdminCalendar, kanban, assigneeUtils — шукати порушення п. A–D.
2. Централізація модулів на `canViewModule` / `canAccessDashboardModule`.
3. App: guards, п. D (redirect vs in-app повідомлення).
4. AccountDashboard: кламп, worker / нема модулів.
5. Assignee: лише `isEligibleTaskAssignee` у селекторах.
6. AdminTasksBoard: `canViewModule(tasks)` + `canAccessDepartment` для вкладок.
7. Navbar через App: worker → `/worker`.

## Критерії приймання

Відповідають плану v3 у `.cursor/plans/...` (таблиці A–D, критерії 1–12).

## Файли (орієнтир)

[App.tsx](../App.tsx), [AccountDashboard.tsx](../components/AccountDashboard.tsx), [lib/uiAccess.ts](../lib/uiAccess.ts), kanban (`assigneeUtils`, TaskCreateModal, AdminCalendar, WorkerSelectDropdown), [AdminTasksBoard.tsx](../components/AdminTasksBoard.tsx).

## Ручне тестування

Sidebar, `/tasks`, `/admin/tasks` (перевірити що **не** `can_manage_users`), `/account`, `/worker`, assignee у календарі та create task modal; сценарії redirect (п. D.1) vs повідомлення всередині `/account` (п. D.2).
