# BuildTrack — security release gate (2026-11-18)

Database: `hxjkhkpgacaioghcanhp` (Protection CD Gestion Matériel). PR #6 is `feature/collective-hours-progress` → `hotfix/admin-production`.

Read-only production inspection: 3 companies, 11 sites, 91 project_tasks, 35 legacy tasks, 7 time_sessions. The collective_hours_progress(text) RPC is installed and executable by authenticated users, not anon. Existing time_sessions SELECT policy restricts non-admin members to their own records.

**Release blockers:** `company_info` has a PUBLIC FOR ALL USING true WITH CHECK true policy; `tasks` has permissive policies exposing all 35 legacy tasks to authenticated members; `companies`, `invites`, `company_modules`, and `bookings` have RLS disabled with broad client grants. A simulated anon role read all 3 companies and 1 company_info record. All 35 legacy tasks have NULL company_id, valid site_id, and belong to exactly one parent-company by site.

**Do not merge/deploy until:** review and validate a targeted RLS hardening SQL on an isolated copy, run cross-tenant PostgREST JWT/Realtime tests and onboarding/invite regression, preserve backup and rollback steps. **No production migration applied by this document.**
