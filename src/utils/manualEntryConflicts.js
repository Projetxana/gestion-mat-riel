// Weekly manual rows contain synthetic start times (08:00), so two different
// tasks may legitimately have overlapping stored intervals. Never compare them
// as if they were GPS punch intervals.
const startOf = row => Date.parse(row.corrected_start_at || row.punch_start_at);
const endOf = row => Date.parse(row.corrected_end_at || row.punch_end_at);
const sameKey = (a, b) => a.company_id != null && a.user_id != null &&
    a.site_id != null && a.section_id != null &&
    ['company_id', 'user_id', 'site_id', 'section_id'].every(key =>
        b[key] != null && String(a[key]) === String(b[key]));

export function manualEntriesOverlap(a, b) {
    if (a.manual_entry !== true || b.manual_entry !== true || !sameKey(a,b)) return false;
    const as = startOf(a), ae = endOf(a), bs = startOf(b), be = endOf(b);
    return [as, ae, bs, be].every(Number.isFinite) && as < ae && bs < be &&
        as < be && bs < ae;
}

// Compare each unsaved candidate with the persisted records and the earlier
// candidates of the same batch. Historical overlaps alone do not block unrelated work.
export function findManualEntryConflict(candidates, existing = []) {
    const seen = existing.filter(row => row.manual_entry === true);
    for (const candidate of candidates) {
        const previous = seen.find(row => manualEntriesOverlap(candidate, row));
        if (previous) return { candidate, previous };
        seen.push(candidate);
    }
    return null;
}

export function weeklyManualPayload(entry, userId, companyId) {
    const start = new Date(entry.date + 'T08:00:00');
    return {
        user_id: userId,
        company_id: companyId,
        site_id: Number(entry.siteId),
        section_id: Number(entry.taskId),
        punch_start_at: start.toISOString(),
        punch_end_at: new Date(start.getTime() + entry.hours * 3600000).toISOString(),
        manual_entry: true,
    };
}
