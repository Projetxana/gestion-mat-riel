export const getProjectStats = (siteId, projectTasks, timeSessions) => {
    // 1. Filter Sections
    const sections = projectTasks.filter(pt => String(pt.project_id) === String(siteId));

    // 2. Calculate Planned Hours
    const planned = sections.reduce((sum, s) => sum + (Number(s.planned_hours) || 0), 0);

    // 3. Calculate Realized (Imported)
    const importedRealized = sections.reduce((sum, s) => sum + (Number(s.completed_hours) || 0), 0);

    // 4. Calculate Realized (Sessions)
    const sessions = timeSessions.filter(ts => String(ts.site_id) === String(siteId));

    const sessionHours = sessions.reduce((sum, ts) => {
        // Only count finished sessions OR calculate duration for active ones?
        // User logic snippet: "if (!ts.punch_end_at) return sum;" -> skips active sessions?
        // Let's stick to the requested logic strictly first.
        if (!ts.punch_end_at) return sum;
        const start = new Date(ts.punch_start_at);
        const end = new Date(ts.punch_end_at);
        return sum + (end - start) / 3600000;
    }, 0);

    // Note: The user might want active sessions to count in real-time views, 
    // but the provided snippet strictly filters !punch_end_at. 
    // I will implement strictly as requested.

    const realized = importedRealized + sessionHours;

    return {
        planned,
        realized: Math.round(realized * 10) / 10, // Round to 1 decimal for cleanliness
        remaining: Math.round((planned - realized) * 10) / 10,
        progress: planned > 0 ? Math.min(100, Math.round((realized / planned) * 100)) : 0
    };
};
