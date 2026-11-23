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
        const hours=(end-start)/3600000;
        const source=hoursByTask.get(key) || {all:0,manual:0,employee:0};
        source.all+=hours;
        // The time-sheet has two kinds of entries: manual_entry=true is
        // also MANUAL, so it may already be represented in completed_hours.
        if(row.manual_entry===true) source.manual+=hours;
        else source.employee+=hours;
        hoursByTask.set(key,source);
    }
    return tasks.map(task => {
        const budget = Number(task.planned_hours) || 0;
        const historical = Math.max(0, Number(task.completed_hours) || 0);
        const {all:sessionsHours,manual:manualSessionHours,employee:employeePunchHours}
            = hoursByTask.get(String(task.id)) || {all:0,manual:0,employee:0};
        // An administrator can confirm that manual start-up hours are
        // distinct from EMPLOYEE punches, but that does not establish whether
        // manually entered time-sheet sessions overlap the old task totals.
        // Keep those time-sheet rows visible but do not add them silently.
        const manualSessionOverlap=historical>0 && manualSessionHours>0 &&
            historyMode!=='additive';
        let actual;
        if(historyMode==='additive') actual=historical+sessionsHours;
        else if(manualHoursDistinct && historical>0) actual=historical+employeePunchHours;
        else if(historical>0 && sessionsHours===0) actual=historical;
        else if(historyMode==='sessions_only' || historical===0) actual=sessionsHours;
        else actual=null;
        const overlapUnverified=actual===null;
        return {
            ...task,budget,actual,historical,sessionsHours,
            manualSessionHours,employeePunchHours,manualSessionOverlap,
            overlapUnverified,manualHoursDistinct,
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
