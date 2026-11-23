// Task bars are based on currently recorded hours. 100%-completion badges
// MUST use the immutable task snapshot from the last validated IPMO report.
export const computeTaskHours = ({
    tasks = [], sessions = [], siteId, historyMode = 'unverified',
    // Site-level, admin-confirmed policy independent from the IPMO report.
    manualHoursDistinct = false,
}) => {
    const hoursByTask = new Map();
    for (const row of sessions) {
        if (String(row.site_id) !== String(siteId) || !row.punch_end_at) continue;
        const start = Date.parse(row.corrected_start_at || row.punch_start_at);
        const end = Date.parse(row.corrected_end_at || row.punch_end_at);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > Date.now()) continue;
        const key = String(row.section_id);
        hoursByTask.set(key, (hoursByTask.get(key) || 0) + (end - start) / 3600000);
    }
    return tasks.map(task => {
        const budget = Number(task.planned_hours) || 0;
        const historical = Math.max(0, Number(task.completed_hours) || 0);
        const sessionsHours = hoursByTask.get(String(task.id)) || 0;
        // Historical manually entered time is always a valid recorded fact.
        // If there is no punch for the task there can be no overlap. When
        // both sources exist, only sum them if explicitly distinguished by
        // the administrator for this site, or if previously IPMO-confirmed.
        // Crucially, this display setting never publishes a performance report.
        const overlapUnverified = historical > 0 && sessionsHours > 0 &&
            !manualHoursDistinct && historyMode === 'unverified';
        const actual = manualHoursDistinct || historyMode === 'additive'
            ? historical + sessionsHours
            : historical > 0 && sessionsHours === 0
                ? historical
                : historyMode === 'sessions_only' || historical === 0
                    ? sessionsHours
                    : null;
        return {
            ...task, budget, actual, historical, sessionsHours,
            overlapUnverified,
            manualHoursDistinct,
        };
    });
};

export const taskCompletionBadge = (snapshot) => {
    // A draft slider at 100% is not a validated completion.
    if (!snapshot || Number(snapshot.physical_percent) !== 100) return null;
    const ipmo = snapshot.task_performance_index == null
        ? null : Number(snapshot.task_performance_index);
    const planned = Number(snapshot.planned_hours);
    const consumed = Number(snapshot.consumed_hours);
    if (!(planned > 0) || !(consumed > 0) || !Number.isFinite(ipmo) || ipmo <= 0) {
        return { completed: true, verified: false };
    }
    const hoursSaved = Math.round((planned - consumed) * 100) / 100;
    return { completed: true, verified: true, ipmo, hoursSaved, favorable: hoursSaved > 0.01 };
};

export const barConsumption = (budget, actual) => {
    if (!(budget > 0) || actual == null || !Number.isFinite(actual)) {
        return { width: 0, overBudget: false, known: false };
    }
    return { width: Math.max(0, Math.min(100, actual / budget * 100)),
        overBudget: actual > budget + 0.01, known: true };
};
