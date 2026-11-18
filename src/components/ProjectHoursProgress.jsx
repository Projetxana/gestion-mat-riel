import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const hours = value => Number(value).toLocaleString('fr-CA', { maximumFractionDigits: 1 });

export default function ProjectHoursProgress({ companyId, userId, showSites, showTasks, refreshKey }) {
    const [result, setResult] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let cancelled = false;
        if (!showSites && !showTasks || !companyId || !userId) return;
        const load = async () => {
            setResult(null);
            try {
                const { data, error } = await supabase.rpc('collective_hours_progress', { requested_company: String(companyId) });
                if (!cancelled) setResult({ companyId, userId, data: error ? [] : data || [], error: Boolean(error) });
            } catch {
                if (!cancelled) setResult({ companyId, userId, data: [], error: true });
            }
        };
        load();
        return () => { cancelled = true; };
    }, [companyId, userId, showSites, showTasks, refreshKey, attempt]);
    if (!showSites && !showTasks) return null;
    const current = result?.companyId === companyId && result?.userId === userId ? result : null;
    return <section className="space-y-4 mt-4" aria-label="Heures collectives">
        <h3 className="font-bold">HEURES COLLECTIVES — DEPUIS LE DÉMARRAGE</h3>
        {!current ? <p role="status">Chargement des heures collectives…</p> : current.error ? <div role="alert">Heures collectives indisponibles. <button onClick={() => setAttempt(n => n + 1)}>Réessayer</button></div> :
            <ProjectHoursCards rows={current.data} showSites={showSites} showTasks={showTasks} />}
    </section>;
}

function Metrics({ row }) {
    const consumed = Number(row.consumed_hours);
    const budget = Number(row.budget_hours);
    const percent = budget > 0 ? consumed / budget * 100 : null;
    return <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
            <div><p className="text-slate-500">Prévues</p><strong>{budget > 0 ? `${hours(budget)} h` : '—'}</strong></div>
            <div><p className="text-slate-500">Consommées</p><strong>{hours(consumed)} h</strong></div>
            <div><p className="text-slate-500">{consumed > budget && budget > 0 ? 'Dépassement' : 'Restantes'}</p><strong>{budget > 0 ? `${hours(Math.abs(budget - consumed))} h` : '—'}</strong></div>
        </div>
        {percent === null ? <p className="text-sm text-slate-500">Budget non défini</p> : <>
            <div className="flex justify-between text-sm"><span>{consumed > budget ? 'Budget dépassé' : 'Consommation du budget'}</span><strong>{hours(percent)} %</strong></div>
            <progress className={`w-full h-2 ${consumed > budget ? 'accent-amber-500' : 'accent-blue-500'}`} aria-label={`Consommation du budget : ${row.name}`} max="100" value={Math.min(100, percent)} />
        </>}
    </div>;
}

export function ProjectHoursCards({ rows, showSites, showTasks }) {
    if (!showSites && !showTasks) return null;
    const groups = new Map();
    rows.forEach(row => {
        if (!groups.has(row.site_id)) groups.set(row.site_id, { name: row.site_name, tasks: [] });
        const group = groups.get(row.site_id);
        if (row.kind === 'site') group.site = row;
        else if (row.kind === 'task') group.tasks.push(row);
    });
    const visible = [...groups.entries()].filter(([, group]) => (showSites && group.site) || (showTasks && group.tasks.length));
    return <div className="space-y-4">{!visible.length && <p>Aucune activité terminée.</p>}{visible.map(([id, group]) =>
        <article key={id} className="rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm overflow-hidden min-w-0">
            <div className="p-4 sm:p-5 space-y-4"><h4 className="font-bold break-words">{group.name}</h4>{showSites && group.site && <Metrics row={group.site} />}</div>
            {showTasks && group.tasks.length > 0 && <div className="border-t border-slate-200 bg-slate-50 px-4 sm:px-5 divide-y divide-slate-200">{group.tasks.map(task => <div key={task.section_id} className="py-4 space-y-3"><h5 className="font-semibold break-words">{task.name}</h5><Metrics row={task} /></div>)}</div>}
        </article>
    )}</div>;
}
