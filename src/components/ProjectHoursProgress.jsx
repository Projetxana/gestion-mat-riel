import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const formatHours = (value) => Number(value).toLocaleString('fr-CA', {
    maximumFractionDigits: 1,
});

function ProgressBar({ ratio, label, color }) {
    if (ratio === null) return null;
    const percent = ratio * 100;
    const width = Math.min(100, Math.max(0, percent));
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={width}
            aria-valuetext={`${formatHours(percent)} % du budget consommé`}
            className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
        >
            <div
                className={`h-full rounded-full ${ratio > 1 ? 'bg-red-600' : color}`}
                style={{ width: `${width}%` }}
            />
        </div>
    );
}

function SiteMetrics({ row }) {
    const consumed = Math.max(0, Number(row.consumed_hours) || 0);
    const budget = Number(row.budget_hours);
    const hasBudget = row.budget_hours !== null && budget > 0;
    const ratio = hasBudget ? consumed / budget : null;
    const remaining = hasBudget ? budget - consumed : null;
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div><p className="text-xs sm:text-sm text-slate-500">Prévues</p><p className="text-base sm:text-xl font-bold">{hasBudget ? `${formatHours(budget)} h` : '—'}</p></div>
                <div><p className="text-xs sm:text-sm text-slate-500">Consommées</p><p className="text-base sm:text-xl font-bold">{formatHours(consumed)} h</p></div>
                <div><p className="text-xs sm:text-sm text-slate-500">{remaining < 0 ? 'Dépassement' : 'Restantes'}</p><p className={`text-base sm:text-xl font-bold ${remaining < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{hasBudget ? `${formatHours(Math.abs(remaining))} h` : '—'}</p></div>
            </div>
            {hasBudget ? (
                <>
                    <ProgressBar ratio={ratio} label={`Budget d'heures du chantier ${row.name}`} color="bg-amber-500" />
                    <div className="flex flex-wrap justify-between gap-2 text-xs sm:text-sm text-slate-600"><span>Budget d'heures consommé</span><strong>{formatHours(ratio * 100)} %</strong></div>
                </>
            ) : <p className="text-sm text-slate-500">Budget non défini · heures consommées uniquement</p>}
        </div>
    );
}

function TaskMetrics({ row }) {
    const consumed = Math.max(0, Number(row.consumed_hours) || 0);
    const budget = Number(row.budget_hours);
    const hasBudget = row.budget_hours !== null && budget > 0;
    const ratio = hasBudget ? consumed / budget : null;
    return (
        <div className="space-y-2 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <h5 className="font-medium break-words">{row.name}</h5>
                <span className="font-semibold tabular-nums">{formatHours(consumed)}{hasBudget ? ` / ${formatHours(budget)} h` : ' h consommées'}</span>
            </div>
            {hasBudget ? <ProgressBar ratio={ratio} label={`Budget de la tâche ${row.name}`} color="bg-blue-500" /> : <p className="text-xs text-slate-500">Budget non défini</p>}
            {ratio > 1 && <p className="text-xs font-semibold text-red-700">Dépassement : {formatHours(consumed - budget)} h</p>}
        </div>
    );
}

export function ProjectHoursCards({ rows, showSites, showTasks }) {
    if (!showSites && !showTasks) return null;
    const groups = new Map();
    rows.forEach((row) => {
        const key = String(row.site_id);
        if (!groups.has(key)) groups.set(key, { name: row.site_name, tasks: [] });
        const group = groups.get(key);
        if (row.kind === 'site') group.site = row;
        if (row.kind === 'task') group.tasks.push(row);
    });
    const visible = [...groups.entries()]
        .filter(([, group]) => (showSites && group.site) || (showTasks && group.tasks.length))
        .sort((a, b) => a[1].name.localeCompare(b[1].name, 'fr-CA'));
    return (
        <div className="space-y-4">
            {visible.length === 0 && <p>Aucun chantier ou aucune tâche disponible.</p>}
            {visible.map(([id, group]) => (
                <article key={id} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm">
                    <div className="space-y-4 p-4 sm:p-5">
                        <h4 className="text-base sm:text-lg font-bold break-words">Chantier — {group.name}</h4>
                        {showSites && group.site && <SiteMetrics row={group.site} />}
                    </div>
                    {showTasks && group.tasks.length > 0 && (
                        <div className="border-t border-slate-200 bg-slate-50 px-4 pb-1 pt-3 sm:px-5">
                            <h5 className="font-semibold">Détail par tâche</h5>
                            <div className="divide-y divide-slate-200">
                                {group.tasks.sort((a, b) => a.name.localeCompare(b.name, 'fr-CA')).map((task) => (
                                    <TaskMetrics key={task.section_id} row={task} />
                                ))}
                            </div>
                        </div>
                    )}
                </article>
            ))}
        </div>
    );
}

export default function ProjectHoursProgress({ companyId, userId, showSites, showTasks, refreshKey }) {
    const [result, setResult] = useState(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let cancelled = false;
        if ((!showSites && !showTasks) || !companyId || !userId) return undefined;
        setResult(null);
        const load = async () => {
            try {
                const { data, error } = await supabase.rpc('collective_hours_progress', {
                    requested_company: String(companyId),
                });
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
    return (
        <section className="mt-4 space-y-4" aria-label="Heures collectives">
            <h3 className="font-bold">HEURES COLLECTIVES — DEPUIS LE DÉMARRAGE</h3>
            {!companyId || !userId ? <p role="status">Compte et entreprise requis.</p> :
                !current ? <p role="status">Chargement des heures collectives…</p> :
                    current.error ? <div role="alert">Heures collectives indisponibles. <button className="underline" onClick={() => setAttempt(n => n + 1)}>Réessayer</button></div> :
                        <ProjectHoursCards rows={current.data} showSites={showSites} showTasks={showTasks} />}
        </section>
    );
}
