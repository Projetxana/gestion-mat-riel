import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Clock3, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useCompanyPerformance } from '../hooks/useCompanyPerformance';
import { supabase } from '../supabaseClient';
import { monitoringProjects } from '../utils/projectMonitoring';

const decimal = (value, digits = 1) => Number(value).toLocaleString('fr-CA', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
});

const verifiedDate = (timestamp) => new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
}).format(new Date(timestamp));

const Status = ({ status }) => {
    const styles = {
        below: 'bg-red-950/50 border-red-700/60 text-red-200',
        unverified: 'bg-amber-950/40 border-amber-700/50 text-amber-200',
        unreviewed: 'bg-slate-700/40 border-slate-600 text-slate-300',
        favorable: 'bg-emerald-950/40 border-emerald-700/40 text-emerald-200',
    };
    const labels = {
        below: 'IPMO inférieur à 1',
        unverified: 'Indice à confirmer',
        unreviewed: 'En attente de bilan',
        favorable: 'Productivité favorable',
    };
    return <span className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
        {labels[status]}
    </span>;
};

const ProgressMetric = ({ label, percent, color, extra }) => {
    const known = Number.isFinite(percent);
    const width = known ? Math.min(100, Math.max(0, percent)) : 0;
    return (
        <div className="space-y-1.5 min-w-0">
            <div className="flex justify-between items-baseline gap-2">
                <span className="text-xs text-slate-300">{label}</span>
                <strong className="shrink-0 text-sm tabular-nums text-white">
                    {known ? decimal(percent) + ' %' : '—'}
                </strong>
            </div>
            <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={known ? width : undefined}
                aria-valuetext={known ? decimal(percent) + ' pour cent' : 'Non disponible'}
                className="h-2.5 w-full overflow-hidden rounded-full bg-slate-700"
            >
                {known && <div className={`h-full rounded-full ${color}`}
                    style={{ width: `${width}%` }}/>}
            </div>
            {extra && <p className="text-xs text-slate-400">{extra}</p>}
        </div>
    );
};

// This screen deliberately avoids the former calendar-based "theoretical"
// hours and any invented budget gap. IPMO numbers come only from immutable,
// administrator-validated records, not from live punches.
const ProjectMonitoringModal = ({ onClose }) => {
    const { sites, projectTasks, currentCompanyId } = useAppContext();
    const { enabled, isAdmin, loading: accessLoading, error: accessError } = useCompanyPerformance();
    const navigate = useNavigate();
    const closeRef = useRef(null);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);

    const activeWithBudget = useMemo(() => (sites || [])
        .filter(site => String(site.company_id) === String(currentCompanyId) && site.status === 'active')
        .filter(site => Number(site.planned_hours) > 0 ||
            (projectTasks || []).some(task => String(task.project_id) === String(site.id)
                && Number(task.planned_hours) > 0)), [sites, projectTasks, currentCompanyId]);
    const activeIds = activeWithBudget.map(site => Number(site.id));
    const idsKey = activeIds.join(',');
    const canReadReports = !accessLoading && isAdmin && enabled;

    useEffect(() => {
        closeRef.current?.focus();
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = oldOverflow;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        if (!canReadReports || !currentCompanyId || !idsKey) {
            setReports([]);
            setLoading(false);
            setError('');
            return () => { cancelled = true; };
        }
        const load = async () => {
            setLoading(true);
            setError('');
            // One verified latest snapshot per project, regardless of the
            // total number of historical reports for the company.
            const results = await Promise.all(activeIds.map(siteId =>
                supabase.from('bt_performance_reports')
                    .select('id, company_id, site_id, validated_at, planned_hours, earned_hours, consumed_hours, physical_percent, performance_index')
                    .eq('company_id', currentCompanyId)
                    .eq('site_id', siteId)
                    .order('validated_at', { ascending: false })
                    .order('id', { ascending: false })
                    .limit(1)
            ));
            if (cancelled) return;
            const failed = results.find(result => result.error);
            if (failed) {
                setReports([]);
                setError('Impossible de charger les bilans validés : ' + failed.error.message);
            } else {
                setReports(results.flatMap(result => result.data || []));
            }
            setLoading(false);
        };
        void load();
        return () => { cancelled = true; };
        // idsKey is a stable list of currently eligible sites.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canReadReports, currentCompanyId, idsKey, refresh]);

    const projects = useMemo(() => monitoringProjects(
        activeWithBudget, projectTasks || [], reports, currentCompanyId
    ), [activeWithBudget, projectTasks, reports, currentCompanyId]);
    const withReview = projects.filter(project => Boolean(project.report)).length;
    const belowTarget = projects.filter(project => project.status === 'below').length;

    const goToProject = siteId => {
        onClose();
        navigate('/sites/' + siteId);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 sm:p-4"
             onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="project-monitoring-title"
                className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-slate-900 text-slate-100 shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-slate-700">
                <header className="shrink-0 border-b border-slate-700 px-4 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="shrink-0 rounded-xl bg-indigo-500/20 p-2.5">
                                <Activity size={22} className="text-indigo-300"/>
                            </span>
                            <div className="min-w-0">
                                <h2 id="project-monitoring-title" className="text-lg font-bold sm:text-xl">Suivi des projets</h2>
                                <p className="text-xs text-slate-400">Avancement physique · Budget consommé · IPMO</p>
                            </div>
                        </div>
                        <button ref={closeRef} type="button" onClick={onClose}
                            aria-label="Fermer le suivi des projets"
                            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
                            <X size={22}/>
                        </button>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-300">
                        <span>{projects.length} chantier(s) avec budget</span>
                        <span className="text-slate-600" aria-hidden="true">•</span>
                        <span>{withReview} bilan(s) disponible(s)</span>
                        {belowTarget > 0 && <>
                            <span className="text-slate-600" aria-hidden="true">•</span>
                            <span className="flex items-center gap-1 text-red-300"><AlertTriangle size={13}/> {belowTarget} IPMO sous 1</span>
                        </>}
                        {canReadReports && (
                            <button type="button" disabled={loading}
                                onClick={() => setRefresh(value => value + 1)}
                                className="ml-auto flex min-h-10 items-center gap-1 rounded-lg border border-slate-600 px-3 font-semibold text-blue-200 disabled:opacity-50">
                                <RefreshCw size={14}/> Actualiser
                            </button>
                        )}
                    </div>
                </header>

                <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
                    {accessLoading && <p role="status" className="rounded-xl bg-slate-800 p-4 text-slate-300">Vérification des accès…</p>}
                    {!accessLoading && !isAdmin && (
                        <p className="mb-4 rounded-xl border border-slate-600 bg-slate-800 p-4 text-sm text-slate-300">
                            Les bilans IPMO sont réservés aux administrateurs. Les budgets restent consultables ci-dessous.
                        </p>
                    )}
                    {!accessLoading && isAdmin && !enabled && (
                        <p className="mb-4 rounded-xl border border-slate-600 bg-slate-800 p-4 text-sm text-slate-300">
                            Le module IPMO est désactivé pour cette entreprise. Active-le dans les paramètres pour consulter les bilans.
                        </p>
                    )}
                    {accessError && <p role="alert" className="mb-4 rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">{accessError}</p>}
                    {error && <p role="alert" className="mb-4 rounded-xl border border-red-700/60 bg-red-950/40 p-4 text-sm text-red-200">{error}</p>}
                    {loading && <p role="status" className="mb-3 text-sm text-blue-200">Actualisation des derniers bilans…</p>}
                    {!projects.length && !loading && (
                        <p className="rounded-xl border border-slate-700 bg-slate-800 p-6 text-center text-sm text-slate-300">
                            Aucun chantier actif avec budget d'heures.
                        </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {projects.map(project => (
                            <button key={project.id} type="button" onClick={() => goToProject(project.id)}
                                aria-label={`Ouvrir la fiche du chantier ${project.name}`}
                                className="min-w-0 space-y-4 rounded-2xl border border-slate-700 bg-slate-800/80 p-4 text-left shadow-sm transition-colors hover:border-blue-500 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 sm:p-5">
                                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="break-words text-base font-bold text-white sm:text-lg">{project.name}</h3>
                                        <p className="mt-1 text-xs text-slate-400">{project.report
                                            ? 'Bilan du ' + verifiedDate(project.report.validated_at)
                                            : 'Aucun bilan physique validé'}</p>
                                    </div>
                                    <ArrowUpRight size={21} className="shrink-0 text-blue-300"/>
                                </div>
                                <Status status={project.status}/>
                                <div className="space-y-4">
                                    <ProgressMetric label="Avancement physique validé"
                                        percent={project.physicalPercent} color="bg-blue-500"
                                        extra={project.physicalPercent === null ? 'À renseigner sur la fiche chantier' : null}/>
                                    <ProgressMetric label="Budget d’heures consommé au bilan"
                                        percent={project.consumedPercent} color={project.consumedPercent > 100 ? 'bg-red-500' : 'bg-amber-500'}
                                        extra={project.consumedHours === null
                                            ? `Budget prévu : ${decimal(project.budget)} h · Heures à confirmer`
                                            : `${decimal(project.consumedHours)} h / ${decimal(project.budget)} h prévues`}/>
                                </div>
                                <div className="grid grid-cols-2 gap-3 border-t border-slate-700 pt-3">
                                    <div className="min-w-0">
                                        <p className="text-xs text-slate-400">IPMO validé</p>
                                        <p className={`text-xl font-bold tabular-nums ${project.ipmo === null ? 'text-slate-300'
                                            : project.ipmo < 1 ? 'text-red-300' : 'text-emerald-300'}`}>
                                            {project.ipmo === null ? '—' : decimal(project.ipmo,2)}
                                        </p>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs text-slate-400">Écart de productivité</p>
                                        <p className={`break-words text-xl font-bold tabular-nums ${project.productivityGap === null ? 'text-slate-300'
                                            : project.productivityGap >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                            {project.productivityGap === null ? '—'
                                                : (project.productivityGap > 0 ? '+' : '') + decimal(project.productivityGap,1) + ' h'}
                                        </p>
                                    </div>
                                </div>
                                <p className="flex items-center gap-1 text-xs font-semibold text-blue-200">
                                    Voir l'analyse du chantier <ArrowUpRight size={13}/>
                                </p>
                            </button>
                        ))}
                    </div>
                </main>
                <footer className="shrink-0 border-t border-slate-700 bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-400 sm:px-6">
                    <p className="flex items-start gap-2">
                        <Clock3 size={15} className="mt-0.5 shrink-0"/>
                        Ces indicateurs sont figés au dernier bilan validé. Les pointages récents ne recalculent pas automatiquement l'IPMO.
                    </p>
                </footer>
            </div>
        </div>
    );
};

export default ProjectMonitoringModal;
