// Project-monitoring cards are read-only snapshots from the validated IPMO
// reports, never a time-elapsed ("theoretical") schedule calculation.

const finiteNumber = value => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const safeNonnegative = value => {
    const number = finiteNumber(value);
    return number !== null && number >= 0 ? number : null;
};

export const latestReportsBySite = (reports = [], companyId) => {
    const map = new Map();
    const sorted = [...reports].sort((a, b) => {
        const delta = Date.parse(b.validated_at) - Date.parse(a.validated_at);
        return (Number.isFinite(delta) ? delta : 0) || Number(b.id) - Number(a.id);
    });
    for (const report of sorted) {
        if (!report || String(report.company_id) !== String(companyId)) continue;
        if (!report.site_id || !report.validated_at) continue;
        const id = String(report.site_id);
        if (!map.has(id)) map.set(id, report);
    }
    return map;
};

export const summarizeProjectMonitoring = (site, tasks = [], report = null) => {
    const taskBudget = tasks
        .filter(task => String(task.project_id) === String(site.id))
        .reduce((total, task) => total + Math.max(0, Number(task.planned_hours) || 0), 0);
    const siteBudget = safeNonnegative(site.planned_hours);
    const currentBudget = siteBudget !== null && siteBudget > 0 ? siteBudget : taskBudget;
    const validReport = report &&
        String(report.site_id) === String(site.id) &&
        String(report.company_id) === String(site.company_id) &&
        Number.isFinite(Date.parse(report.validated_at))
        ? report : null;

    const budgetAtReview = safeNonnegative(validReport?.planned_hours);
    const budget = budgetAtReview !== null && budgetAtReview > 0 ? budgetAtReview : currentBudget;
    const physical = safeNonnegative(validReport?.physical_percent);
    const physicalPercent = physical !== null && physical <= 100 ? physical : null;
    const consumed = safeNonnegative(validReport?.consumed_hours);
    const consumedPercent = budget > 0 && consumed !== null
        ? consumed / budget * 100 : null;
    const earned = safeNonnegative(validReport?.earned_hours);
    const rawIndex = finiteNumber(validReport?.performance_index);
    const ipmo = rawIndex !== null && rawIndex > 0 && consumed !== null &&
        consumed > 0 && budget > 0 && earned !== null ? rawIndex : null;
    return {
        id: site.id,
        name: site.name,
        budget,
        report: validReport,
        physicalPercent,
        consumedHours: consumed,
        consumedPercent,
        earnedHours: earned,
        ipmo,
        productivityGap: ipmo !== null ? earned - consumed : null,
        status: !validReport ? 'unreviewed' : ipmo === null ? 'unverified' : ipmo < 1 ? 'below' : 'favorable',
    };
};

export const monitoringProjects = (sites = [], tasks = [], reports = [], companyId) => {
    const byId = latestReportsBySite(reports, companyId);
    return sites
        .filter(site => String(site.company_id) === String(companyId) && site.status === 'active')
        .map(site => summarizeProjectMonitoring(site, tasks, byId.get(String(site.id))))
        // Existing monitoring covers projects with a labor budget. Don't
        // flood the executive panel with warehouse/service shells.
        .filter(site => site.budget > 0 || site.report)
        .sort((a, b) => {
            const priority = { below: 0, unverified: 1, unreviewed: 2, favorable: 3 };
            return priority[a.status] - priority[b.status] || a.name.localeCompare(b.name, 'fr');
        });
};
