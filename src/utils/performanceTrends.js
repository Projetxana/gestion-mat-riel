// Group immutable IPMO validation snapshots by the LOCAL Quebec calendar week.
// Multiple validations in a week must NEVER masquerade as multiple data points.
const reportingCalendar = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const getQuebecMondayKey = (timestamp) => {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return null;
    const pieces = Object.fromEntries(reportingCalendar.formatToParts(date)
        .filter(part => ['year', 'month', 'day'].includes(part.type))
        .map(part => [part.type, Number(part.value)]));
    if (!pieces.year || !pieces.month || !pieces.day) return null;
    const monday = new Date(Date.UTC(pieces.year, pieces.month - 1, pieces.day));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
};

const validPercent = value => value !== null && value !== undefined &&
    value !== '' && Number.isFinite(Number(value)) &&
    Number(value) >= 0 && Number(value) <= 100;

const validIndex = report => report.performance_index !== null &&
    report.performance_index !== undefined && report.performance_index !== '' &&
    Number.isFinite(Number(report.performance_index)) &&
    Number(report.performance_index) > 0 &&
    Number.isFinite(Number(report.consumed_hours)) &&
    Number(report.consumed_hours) > 0 &&
    Number.isFinite(Number(report.planned_hours)) &&
    Number(report.planned_hours) > 0;

// This is the *cumulative* IPMO measured at each validation, NOT a separately
// calculated IPMO for just that week's labor. Keep those labels distinct.
export const buildWeeklyPerformanceTrends = (reports = [], maxWeeks = 12) => {
    const byWeek = new Map();
    for (const report of reports) {
        if (!report || !report.validated_at) continue;
        const week = getQuebecMondayKey(report.validated_at);
        if (!week) continue;
        const stamp = new Date(report.validated_at).getTime();
        const previous = byWeek.get(week);
        if (!previous || stamp > previous.stamp ||
            (stamp === previous.stamp && Number(report.id) > Number(previous.report.id))) {
            byWeek.set(week, { report, stamp });
        }
    }
    const weekly = [...byWeek.entries()]
        .sort(([weekA], [weekB]) => weekA.localeCompare(weekB))
        .map(([week, item]) => ({ week, ...item.report }));

    const physical = weekly.filter(row => validPercent(row.physical_percent))
        .map(row => ({
            week: row.week, value: Number(row.physical_percent),
            validatedAt: row.validated_at, reportId: row.id,
        })).slice(-maxWeeks);
    const ipmo = weekly.filter(validIndex)
        .map(row => ({
            week: row.week, value: Number(row.performance_index),
            validatedAt: row.validated_at, reportId: row.id,
        })).slice(-maxWeeks);

    return {
        physical,
        ipmo,
        showPhysical: physical.length >= 2,
        showIpmo: ipmo.length >= 3,
    };
};

export const formatWeeklyLabel = week => {
    const day = new Date(week + 'T12:00:00Z');
    return new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'UTC', day: 'numeric', month: 'short', year: '2-digit',
    }).format(day);
};
