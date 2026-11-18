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
            [['site', showSites, 'Par chantier'], ['task', showTasks, 'Par tâche et chantier']].filter(([, enabled]) => enabled).map(([kind, , title]) => <div key={kind} className="space-y-3">
                <h4 className="font-semibold">{title}</h4>
                {current.data.filter(row => row.kind === kind).length === 0 && <p>Aucune activité terminée.</p>}
                {current.data.filter(row => row.kind === kind).map(row => {
                    const consumed = Number(row.consumed_hours);
                    const budget = Number(row.budget_hours);
                    const percentage = budget > 0 ? consumed / budget * 100 : null;
                    return <article key={`${row.site_id}:${row.section_id || ''}`} className="p-4 rounded-xl border border-slate-300 space-y-2 break-words">
                        <h5 className="font-semibold">{row.name}{kind === 'task' && <span className="block text-sm font-normal">{row.site_name}</span>}</h5>
                        <p>{hours(consumed)} h consommées{budget > 0 ? ` / ${hours(budget)} h prévues — ${hours(percentage)} %` : ' — Budget non défini'}</p>
                        {percentage !== null && <><p>{consumed > budget ? `Dépassement : ${hours(consumed - budget)} h` : `Restantes : ${hours(budget - consumed)} h`}</p><progress className="w-full" aria-label={`Consommation du budget : ${row.name}`} max="100" value={Math.min(100, percentage)} /></>}
                    </article>;
                })}
            </div>)}
    </section>;
}
