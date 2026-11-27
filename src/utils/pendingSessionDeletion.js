// UI guard only: Supabase RLS remains authoritative for each DELETE.
export function canDeletePendingSession({ user, companyRoleLoading, companyId, sessionId, session }) {
    return Boolean(user?.id && user.role === 'admin' && !companyRoleLoading &&
        companyId && sessionId != null && session?.id != null &&
        String(session.id) === String(sessionId) &&
        String(session.company_id) === String(companyId) &&
        session.approved !== true && session.punch_end_at);
}
