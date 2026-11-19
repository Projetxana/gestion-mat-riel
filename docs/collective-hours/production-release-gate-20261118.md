# BuildTrack PR #6 — release gate (2026-11-18)

Target: `feature/collective-hours-progress` → `hotfix/admin-production`.
Supabase production: `hxjkhkpgacaioghcanhp`. **Never deploy this SQL to a different project.**

## Automated validation (PASS)
- GitHub Actions workflow `BuildTrack Security Tests` (PostgreSQL 17 container, fake data only).
- Actual PostgreSQL 17 `SET ROLE anon/authenticated` RLS fixture: PASS.
- PGlite: collective-hours aggregate 128/160 fixture and cross-tenant RLS: PASS.
- Vite `npm run build`: PASS.
- GitHub Vercel commit status: success, not a confirmation of production routing.

## Not yet certified
- Real Supabase PostgREST JWT claims, Realtime, Edge Function invitation flow, `create_company` onboarding in an actual Supabase stack.
- Release branch/domain relationship: GitHub default branch is `main`; PR base is `hotfix/admin-production`. Connected Vercel account lists zero accessible projects.
- Backup recovery rehearsal and browser smoke tests for admin/member (mobile and desktop).

## Production security blockers (read-only observed)
- `companies`, `invites`, `company_modules`, `bookings`: RLS disabled.
- `company_info`: permissive PUBLIC ALL.
- `tasks`: permissive all-authenticated policy; 35 legacy tasks have NULL `company_id`, but all reference a valid `sites` row.
- Do not treat application UI filtering as a security boundary.

## Ordered rollout AFTER approvals and complete tests
1. Verify Vercel account, production project/domain, exact production branch and target SHA.
2. Obtain independent DB backup / snapshot; record verified restore process and baseline policies.
3. Run `docs/collective-hours/proposed-tenant-rls-hardening.sql` only after a Supabase integration test on an isolated stack validates the signup/invite flows and APIs. This migration has no DML but changes effective access.
4. Validate tenant isolation with distinct member/admin accounts, no anon reads, and negative cross-tenant requests; validate invitations, employee hours, administrator reports, frontend company name/settings and Realtime subscriptions.
5. Merge PR #6 only after security gate. Confirm that desired deployment target follows its base branch (otherwise promote reviewed commit via verified hosting team).
6. Smoke test `https://app.buildtrackapp.ca` and review errors. Record final SHA/time.

## Recovery
- Roll back **frontend deployment** to the previously verified release if frontend breaks.
- Do NOT casually disable RLS or restore broadly permissive policies to undo a database change: that would reopen the proven exposure.
- Prepare least-privilege forward fixes to correct blocked flows instead. Database rollback needs dedicated security approval.

**Status: HOLD / not released.** CI unit tests passing alone are not a production approval.

## Invitation flow validation (2026-11-18)
- Live Edge Function `buildtrack-invite-user` v5 was inspected read-only. `src/pages/Settings.jsx` invokes it. Its backend validates the authenticated caller and membership `admin` in the requested company, then uses Supabase Admin Auth invitation plus service-role profile and membership writes. This path does **not** use `public.invites` or `public.accept_invite`.
- Legacy `joinCompanySaaS` previously called `accept_invite` with parameter names not matching its SQL signature. The new branch calls `bt_accept_invite_secure(invite_token)`; staged migration `docs/collective-hours/proposed-secure-invite.sql` adds verified-email, pending token and single-use checks. It is **not yet applied to production**.
- PostgreSQL 17 test fixture verifies mismatched-email rejection, exact recipient acceptance, and replay rejection with fictitious users. Passing this fixture is not evidence of a real email delivery/activation E2E test.
- Security issue [#9](https://github.com/Projetxana/gestion-mat-riel/issues/9) tracks legacy `create_company_user` which writes and returns password fields. Do not publish broad onboarding features until remediated.
- **Deployment order:** validate Edge Function invite and existing login; apply vetted DB functions and RLS changes with a verified backup first; then publish frontend from `main`. Changing frontend before the secure RPC is installed breaks legacy token joining.
