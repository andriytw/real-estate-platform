# Admin User Creation Flow

Canonical overview and password rules: [admin-user-creation.md](./admin-user-creation.md).

## What changed

- Main create flow in `UserManagement` now uses direct password-based creation via `usersService.createUserWithPassword`.
- Backend path is `supabase/functions/admin-create-user`, not `invite-user` with `skipInvite`.
- Invite/resend flow remains available as legacy/transitional behavior for existing operations, but it is no longer the primary create path.

## Security rules

- Passwords are only sent to the trusted edge function and only used for `auth.admin.createUser`.
- Passwords are never stored in `profiles`.
- Password fields are never printed in client/server logs.
- Server-side authorization is mandatory:
  - requires `Authorization: Bearer <JWT>`
  - loads caller profile
  - enforces `can_manage_users = true`

## New create sequence

1. Admin opens `UserManagement` and submits create form with password.
2. Client sends request to `functions/v1/admin-create-user` with session JWT.
3. Edge function validates caller and permission (`can_manage_users`).
4. Edge function creates auth user with provided password.
5. Edge function upserts `profiles` row with Pass 1 canonical fields.
6. If profile upsert fails, edge function rolls back created auth user.
7. New user can log in immediately with email + password.
