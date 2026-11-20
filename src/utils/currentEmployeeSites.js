// Extra client-side guard: the authoritative collective-hours RPC enforces
// employee ownership and tenant membership on the server. This helper merely
// prevents cached, archived or deleted sites from appearing in the UI.
export const filterCurrentEmployeeSites = (rows = [], sites = [], companyId, now = Date.now(), maxAgeDays = 60) => {
    if (!companyId || !Array.isArray(rows) || !Array.isArray(sites)) return [];
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    const allowed = new Set(sites
        .filter(site => site?.status === 'active'
            && String(site.company_id || '') === String(companyId))
        .map(site => String(site.id)));
    return rows.filter(row => {
        if (!allowed.has(String(row?.site_id ?? ''))) return false;
        const latest = Date.parse(row?.last_worked_at || '');
        return Number.isFinite(latest) && latest >= cutoff && latest <= now;
    });
};
