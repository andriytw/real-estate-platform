# Admin user creation (password flow)

This document matches the **admin password user creation** implementation. It does not change the broader access model (Pass 1).

## Primary path

| Step | What happens |
|------|----------------|
| 1 | Admin opens `UserManagement` and submits the create form (including password + confirm). |
| 2 | Client calls `usersService.createUserWithPassword` → `POST /functions/v1/admin-create-user` with **`Authorization: Bearer <session JWT>`**. |
| 3 | Edge function `admin-create-user` validates the JWT, loads caller `profiles` row, requires **`can_manage_users === true`**. |
| 4 | Edge function creates the Auth user with `auth.admin.createUser` using the provided password (see **Password rules**). |
| 5 | Edge function upserts `profiles` with Pass 1 fields (`department_scope`, mirrored `department`, flags, etc.). |
| 6 | If profile upsert fails after Auth user exists, the function **deletes** the new Auth user to avoid half-created accounts. |

More detail: [admin-user-creation-flow.md](./admin-user-creation-flow.md).

## Password rules (create form)

- Minimum **8** characters.
- At least **one letter** (A–Z / a–z) and **one digit** (0–9).
- Client validates before submit; edge function validates again.

## Security rules

- **Never** log passwords (client or edge function).
- **Never** store passwords in `profiles` or any non-Auth table.
- **Never** print password fields in debug logs.
- Service role / admin API only runs in the **edge function**, not in the browser.

## Legacy / transitional

- **`invite-user`** edge function: still used for **invite** and **resend** flows (e.g. `usersService.resendInvite`). The **`skipInvite`** branch is **legacy**; main UI create no longer uses it.
- **`usersService.createWithoutInvite`**: deprecated; retained only for transitional callers. **`UserManagement`** uses **`createUserWithPassword`** only.

## Deferred: forced password change on first login

**Not implemented in this pass.** A future pass may add e.g. `profiles.must_change_password` and post-login enforcement. Until then, new users sign in with the admin-set password as-is.

## Deploy note

Deploy the **`admin-create-user`** edge function to Supabase (`supabase functions deploy admin-create-user` or your CI) so production matches local code.
