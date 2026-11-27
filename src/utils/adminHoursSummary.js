// One source of truth for employee and jobsite summaries. Group by stable IDs,
 // not display names (two jobsites may have identical names).
const byName = (a,b) => a.name.localeCompare(b.name, 'fr-CA') || a.id.localeCompare(b.id);
const hoursBetween = (start,end) => {
    const ms = Date.parse(end) - Date.parse(start);
    return Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0;
};
const add = (map,id,name,hours) => {
    const row = map.get(id) || {id,name,hours:0,sessions:0,details:new Map()};
    row.hours += hours;
    row.sessions += 1;
    map.set(id,row);
    return row;
};
export function summarizeAdminHours({sessions=[],users=[],sites=[],companyId,weekStart,weekEnd}) {
    if (!companyId) return {employees:[],jobsites:[],total:0};
    const people = new Map();
    for (const u of users) {
        const id = String(u.auth_user_id || u.id);
        const person = {id,name:u.name || u.email || 'Employé'};
        people.set(String(u.id),person);
        if (u.auth_user_id) people.set(String(u.auth_user_id),person);
    }
    const siteNames = new Map(sites.filter(s => String(s.company_id) === String(companyId))
        .map(s => [String(s.id),s.name]));
    const employees = new Map(), jobsites = new Map();
    let total = 0;
    for (const s of sessions) {
        if (String(s.company_id || '') !== String(companyId) || !s.punch_start_at || !s.punch_end_at) continue;
        const start = s.corrected_start_at || s.punch_start_at;
        const time = Date.parse(start);
        if (!Number.isFinite(time) || time < +weekStart || time >= +weekEnd) continue;
        const person = people.get(String(s.user_id));
        if (!person) continue;
        const siteId = s.site_id == null ? 'unassigned' : String(s.site_id);
        const siteName = siteNames.get(siteId) || 'Chantier non identifié';
        const hours = hoursBetween(start,s.corrected_end_at || s.punch_end_at);
        const employee = add(employees,person.id,person.name,hours);
        const jobsite = add(jobsites,siteId,siteName,hours);
        add(employee.details,siteId,siteName,hours);
        add(jobsite.details,person.id,person.name,hours);
        total += hours;
    }
    const finish = map => [...map.values()].sort(byName).map(row => ({
        ...row,details:[...row.details.values()].sort(byName).map(({id,name,hours,sessions})=>({id,name,hours,sessions})),
    }));
    return {employees:finish(employees),jobsites:finish(jobsites),total};
}
