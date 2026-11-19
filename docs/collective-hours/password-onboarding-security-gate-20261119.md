# BuildTrack — password and onboarding security gate (2026-11-19)

**Status: candidate remediation only, NOT deployed.** Production is in active use.

## Confirmed production observations (read-only)

- `public.create_company_user(p_name,p_email,p_password,p_role,p_level)` is `SECURITY DEFINER` and `authenticated` currently has `EXECUTE`.
- It manually inserts into `auth.users` and `auth.identities`, stores `p_password` **verbatim** in `public.users.password`, then returns `row_to_json(new_user_record)`, including the password field.
- Exactly **19** `public.users` rows have a non-empty password field at the time of the read-only query; this does **not** establish whether those values remain valid as current Auth credentials.
- Anonymous and authenticated SQL roles currently lack direct `SELECT` grant on `public.users`. This is not a defense against the privileged legacy function.
- `src/pages/Settings.jsx` uses Supabase Edge Function `buildtrack-invite-user` for the visible admin invitation form. That function was inspected: Auth Admin invitation and tenant-admin checks are distinct from the legacy SQL RPC and `public.invites`.
- `src/components/UserModal.jsx` remains an old, unsafe flow: it generates client-side temporary passwords with `Math.random()` and builds a `mailto:` containing a plaintext password. `src/context/AppContext.jsx` also contains `addUser`/`updateUser` paths that write a password to `public.users`. Do not expose those paths in the SaaS UI.
- Frontend `joinCompanySaaS` on this branch depends on `bt_accept_invite_secure`, whose proposed SQL must be installed **before** that frontend reaches production.
- Current `company_info` policy permits all public access. Removing it may hide company name/address in AppContext; confirm UI behavior in integration tests.
- Production feature branch PR #6 targets `hotfix/admin-production`, while Vercel production follows `main`.

## Immediate candidate to block legacy RPC

See `docs/collective-hours/proposed-disable-legacy-user-rpc.sql`. It only revokes `EXECUTE` from `PUBLIC`, `anon` and `authenticated`. No data mutation, user deletion, or password reset.

**Release preflight required:** search all active web/mobile builds, jobs and backend consumers for the RPC; confirm no legitimate live caller relies on it. The current user-invitation form calls the Edge Function, but older deployed clients may still invoke the legacy RPC. Test admin invite, activation and login before the revoke. Restrict server-only compatibility to `service_role`, and remove the obsolete function once all callers are retired.

## Treatment of existing plaintext password fields

Do not share, export or inspect actual password values. Do not attempt to migrate these values back into Auth. After verifying the canonical Supabase Auth flow and recording affected profile IDs in a private secure operational report, plan a controlled `public.users.password` scrub with an authenticated-session and password-reset compatibility check. Consider mandatory credential rotation for any password believed still valid. A DB-only `UPDATE` does **not** revoke any Auth password or session.

## Acceptance tests for the complete release

1. Run isolated Supabase Auth/PostgREST (two test tenants, admin/member/invitee) with fictitious identities only.
2. Verify auth signup/login, invite mail/token, activation, reset, logout, tenant change, access denial on other tenant records, admin and member permissions.
3. Ensure REST call to the legacy RPC is denied (403/permission denied) for anon and authenticated, while the Edge Function invite succeeds for authorized admin and rejects other tenants.
4. Confirm read-only worker/admin hours workflow and company info UI under the proposed RLS policies.
5. Confirm existing profile passwords are neither returned from `public.users` APIs nor sent by mail; audit the old `UserModal` path.
6. Maintain verified production SQL backup with encrypted offline copy; validate exact change window and reversible frontend release.
7. Apply migrations **only after** test evidence; then verify with read-only grants/policies and browser smoke tests.

**No production SQL changes, password scrubbing, PR merge or deploy were performed by this document.**
