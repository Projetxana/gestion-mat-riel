import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

const localDate = (date) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const mondayOf = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
};
const hoursBetween = (start, end) => {
    const ms = Date.parse(end) - Date.parse(start);
    return Number.isFinite(ms) && ms > 0 ? ms / 3600000 : 0;
};

export default function AdminHoursView() {
    const { currentUser, currentCompanyId, users, sites, timeSessions } = useAppContext();
    const [week, setWeek] = useState(() => mondayOf(new Date()));
    const end = new Date(week);
    end.setDate(end.getDate() + 7);
    const rows = useMemo(() => {
        if (currentUser?.role !== 'admin' || !currentCompanyId) return [];
        const employees = new Map();
        for (const u of users || []) {
            employees.set(String(u.id), u.name || u.email || 'Employé');
            if (u.auth_user_id) employees.set(String(u.auth_user_id), u.name || u.email || 'Employé');
        }
        const siteNames = new Map((sites || []).map(s => [String(s.id), s.name]));
        const totals = new Map();
        for (const s of timeSessions || []) {
            // Fail closed: never display sessions without an explicit company match.
            if (String(s.company_id || '') !== String(currentCompanyId)) continue;
            if (!s.punch_start_at || !s.punch_end_at) continue;
            const t = new Date(s.punch_start_at);
            if (t < week || t >= end) continue;
            const employeeKey = String(s.user_id);
            if (!employees.has(employeeKey)) continue;
            const item = totals.get(employeeKey) || { name: employees.get(employeeKey), hours: 0, sessions: 0, bySite: {} };
            const h = hoursBetween(s.punch_start_at, s.punch_end_at);
            item.hours += h;
            item.sessions += 1;
            const site = siteNames.get(String(s.site_id)) || 'Chantier non identifié';
            item.bySite[site] = (item.bySite[site] || 0) + h;
            totals.set(employeeKey, item);
        }
        return [...totals.values()].sort((a,b)=>a.name.localeCompare(b.name));
    }, [currentUser?.role, currentCompanyId, users, sites, timeSessions, week]);
    if (currentUser?.role !== 'admin') return null;
    const changeWeek = (step) => setWeek(prev => { const next = new Date(prev); next.setDate(next.getDate() + step * 7); return next; });
    const number = value => value.toLocaleString('fr-CA', { maximumFractionDigits: 2, minimumFractionDigits: 1 });
    return (
        <div className="mx-auto max-w-4xl p-4 pb-24 text-slate-100 space-y-5">
            <div><h1 className="text-2xl font-bold">Heures des employés</h1><p className="text-slate-400">Consultation seulement — aucune modification des pointages.</p></div>
            <div className="flex items-center gap-3 rounded-xl bg-slate-800 p-3">
                <button className="rounded-lg bg-slate-700 px-4 py-2" onClick={() => changeWeek(-1)} aria-label="Semaine précédente">←</button>
                <span className="flex-1 text-center font-semibold">Semaine du {localDate(week)} au {localDate(new Date(end.getTime() - 86400000))}</span>
                <button className="rounded-lg bg-slate-700 px-4 py-2" onClick={() => changeWeek(1)} aria-label="Semaine suivante">→</button>
            </div>
            <div className="rounded-xl bg-slate-800 p-4"><span className="text-slate-300">Total de la semaine</span><p className="text-3xl font-bold">{number(rows.reduce((sum, x) => sum + x.hours, 0))} h</p></div>
            {!currentCompanyId && <p className="text-amber-300">Entreprise non chargée : aucun relevé affiché.</p>}
            {rows.length === 0 && <p className="rounded-xl bg-slate-800 p-4 text-slate-300">Aucune heure terminée et attribuée à cette entreprise pour cette semaine. Les anciennes entrées sans entreprise associée ne sont pas incluses.</p>}
            {rows.map((r, i) => <section key={`${r.name}-${i}`} className="rounded-xl bg-slate-800 p-4 space-y-2">
                <div className="flex justify-between gap-3"><h2 className="font-bold">{r.name}</h2><strong>{number(r.hours)} h</strong></div>
                <p className="text-sm text-slate-400">{r.sessions} entrée(s)</p>
                {Object.entries(r.bySite).sort().map(([name,h]) => <div key={name} className="flex justify-between gap-3 border-t border-slate-700 pt-2 text-sm"><span>{name}</span><span>{number(h)} h</span></div>)}
            </section>)}
            <p className="text-xs text-slate-400">Calcul provisoire sur les pointages terminés, sans déduction automatique des pauses ni validation de paie. Ne pas utiliser pour la paie avant rapprochement.</p>
        </div>
    );
}
