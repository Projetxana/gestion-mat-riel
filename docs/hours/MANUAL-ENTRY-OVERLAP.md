# Manual entry duplicate guard — deployment gate

Weekly manual records use 08:00 as a synthetic start; overlap on different tasks is not evidence of duplicated time. The UI rejects overlapping manual entries with the same tenant, employee, site and task, including two drafts in one batch. The proposed INSERT trigger uses the same key and effective intervals, with a transaction advisory lock for concurrent READ COMMITTED writers. Existing duplicates are not removed.

Before applying the proposed SQL on production:
- On a restored test database, confirm employee RLS permits reading own time sessions and denies other tenants; check admin visibility and existing INSERT trigger order.
- Test identical and different-duration overlapping entries on the same task, adjacent intervals, different tasks/site/employee/company, corrected timestamps, old duplicates, and bulk insert rollback.
- Two concurrent authenticated transactions inserting the same task/interval: second transaction waits and fails with 23505 after the first commits. Test with PostgREST's default READ COMMITTED isolation; do not claim stronger isolation support.
- Confirm regular GPS punch start/end, legitimate multi-task weekly entry and deletion/correction are unaffected.
- Run SQL migration and mobile Safari checks before merging/releasing. The trigger only guards new INSERTs; authorized admin corrections and mixed GPS/manual entries are not blocked by it.
- Rollback: DROP TRIGGER IF EXISTS bt_time_session_manual_overlap_guard ON public.time_sessions; DROP FUNCTION IF EXISTS public.bt_guard_manual_time_overlap();
