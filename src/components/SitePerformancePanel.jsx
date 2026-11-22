import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import { useCompanyPerformance } from '../hooks/useCompanyPerformance';
import TaskPerformanceBars from './TaskPerformanceBars';
import PerformanceTrends from './PerformanceTrends';
import { computeTaskHours } from '../utils/taskPerformance';

const number = (value, digits = 1) =>
    Number(value || 0).toLocaleString('fr-CA', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });

const statusColor = (index) => {
    if (index == null) return 'text-amber-300';
    if (Number(index) < 1) return 'text-red-300';
    if (Number(index) >= 1) return 'text-emerald-300';
    return 'text-slate-200';
};

// Admin-only, company-opted-in weekly physical progress validation.
// Each save creates an immutable, timestamped snapshot of BOTH earned and actual
// hours, so future punches cannot silently change a past productivity index.
const SitePerformancePanel = ({ site, onReportSaved }) => {
    const { projectTasks, timeSessions } = useAppContext();
    const { enabled, isAdmin, loading: accessLoading } = useCompanyPerformance();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [reports, setReports] = useState([]);
    const [latestTaskSnapshots, setLatestTaskSnapshots] = useState([]);
    const [showValidation, setShowValidation] = useState(false);
    const [percentages, setPercentages] = useState({});
    const [historyMode, setHistoryMode] = useState('unverified');

    const siteTasks = useMemo(() => (projectTasks || [])
        .filter(task => String(task.project_id) === String(site?.id) && Number(task.planned_hours) > 0)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr')),
    [projectTasks, site?.id]);

    const taskBudget = siteTasks.reduce((sum, task) => sum + Number(task.planned_hours || 0), 0);
    const historicalHours = (projectTasks || [])
        .filter(task => String(task.project_id) === String(site?.id))
        .reduce((sum, task) => sum + Math.max(0, Number(task.completed_hours || 0)), 0);
    const siteBudget = site?.planned_hours == null ? taskBudget : Number(site.planned_hours);
    const mismatchedBudget = Math.abs(siteBudget - taskBudget) >= 0.01;

    const loadReports = useCallback(async () => {
        if (!site?.id) return;
        setLoading(true);
        setError('');
        const { data, error: reportsError } = await supabase
            .from('bt_performance_reports').select('*')
            .eq('site_id', site.id)
            .order('validated_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(250);
        if (reportsError) {
            setError('Impossible de charger les bilans : ' + reportsError.message);
            setLoading(false);
            return;
        }
        const list = data || [];
        setReports(list);
        if (!list.length) setShowValidation(true);
        let saved = [];
        if (list.length) {
            const { data: rows, error: rowsError } = await supabase
                .from('bt_performance_report_tasks')
                .select('task_id, physical_percent, planned_hours, consumed_hours, task_performance_index')
                .eq('report_id', list[0].id);
            if (rowsError) {
                setError('Impossible de charger les avancements : ' + rowsError.message);
                setLoading(false);
                return;
            }
            saved = rows || [];
        }
        setLatestTaskSnapshots(saved);
        const draft = {};
        for (const task of siteTasks) {
            const last = saved.find(row => String(row.task_id) === String(task.id));
            draft[String(task.id)] = String(last ? Number(last.physical_percent) : 0);
        }
        setPercentages(draft);
        setHistoryMode(list[0]?.history_mode || 'unverified');
        setLoading(false);
    }, [site?.id, siteTasks]);

    useEffect(() => {
        if (accessLoading || !isAdmin || !enabled || site?.status === 'archived') return;
        void loadReports();
    }, [accessLoading, isAdmin, enabled, site?.status, loadReports]);

    const latest = reports[0] || null;
    const taskRows = useMemo(() => computeTaskHours({
        tasks: siteTasks,
        sessions: timeSessions || [],
        siteId: site?.id,
        historyMode: latest?.history_mode || 'unverified',
    }), [siteTasks, timeSessions, site?.id, latest?.history_mode]);

    if (accessLoading || !isAdmin || !enabled || site?.status === 'archived') return null;
    const earnedPreview = siteTasks.reduce((sum, task) =>
        sum + Number(task.planned_hours || 0) * Number(percentages[String(task.id)] || 0) / 100, 0);
    const physicalPreview = taskBudget > 0 ? earnedPreview / taskBudget * 100 : 0;

    const submit = async () => {
        if (!siteTasks.length || saving) return;
        const invalid = siteTasks.some(task => {
            const raw = percentages[String(task.id)];
            return raw === '' || raw == null || !Number.isFinite(Number(raw)) ||
                Number(raw) < 0 || Number(raw) > 100;
        });
        if (invalid) {
            setError('Indiquez un avancement de 0 à 100 % pour chaque tâche.');
            return;
        }
        if (!window.confirm('Valider cet avancement physique ? Le bilan sera enregistré dans l’historique avec les heures consommées à cet instant.')) return;
        setSaving(true);
        setSuccess('');
        setError('');
        const payload = siteTasks.map(task => ({
            task_id: task.id,
            percent: Number(percentages[String(task.id)]),
        }));
        try {
            const { error: saveError } = await supabase.rpc('bt_publish_performance_report', {
                p_site_id: Number(site.id),
                p_progress: payload,
                p_history_mode: historicalHours > 0 ? historyMode : 'unverified',
            });
            if (saveError) {
                setError('Validation non enregistrée : ' + saveError.message);
                return;
            }
            await loadReports();
            onReportSaved?.();
            setShowValidation(false);
            setSuccess('Bilan enregistré. Les pointages futurs ne modifieront pas cet indice historique.');
        } catch (exception) {
            setError(exception?.message || 'Impossible d’enregistrer le bilan.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section aria-label="Suivi de performance du chantier"
            className="rounded-2xl border border-indigo-700/50 bg-slate-900 p-4 sm:p-6 my-5 space-y-5 text-slate-100">
            <div className="flex gap-3 items-center">
                <BarChart3 size={21} className="text-indigo-300" />
                <div>
                    <h3 className="font-bold text-lg">Avancement physique et performance (IPMO)</h3>
                    <p className="text-xs text-slate-400">Option activée · Bilan réservé à l’administrateur</p>
                </div>
            </div>

            {latest ? (
                <div className="bg-slate-800 rounded-xl p-4 space-y-3" aria-label="Tableau de bord de performance du chantier">
                    <p className="text-xs text-slate-400 flex items-center gap-2">
                        <Clock3 size={14} />
                        Dernier bilan validé : {new Date(latest.validated_at).toLocaleString('fr-CA', {
                            dateStyle: 'medium', timeStyle: 'short'
                        })}
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <p className="text-xs text-slate-400">Travaux réalisés</p>
                            <p className="text-xl font-bold">{number(latest.physical_percent)} %</p>
                            <div className="mt-2 h-2 rounded-full bg-slate-700 overflow-hidden">
                                <div className="h-full rounded-full bg-blue-500" style={{width: `${Math.min(100,Number(latest.physical_percent))}%`}}/>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Budget consommé</p>
                            <p className="text-xl font-bold">{latest.consumed_hours == null ? 'À confirmer' : number(latest.consumed_hours) + ' h'}</p>
                            <p className="text-xs text-slate-400">sur {number(latest.planned_hours)} h prévues</p>
                            {latest.consumed_hours != null && <div className="mt-2 h-2 rounded-full bg-slate-700 overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500" style={{width: `${Math.min(100,Number(latest.consumed_hours)/Number(latest.planned_hours||1)*100)}%`}}/>
                            </div>}
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Indice de performance</p>
                            <p className={`text-2xl font-bold ${statusColor(latest.performance_index)}`}>
                                {latest.performance_index == null ? '—' : number(latest.performance_index, 2)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400">Écart de productivité</p>
                            <p className={`text-xl font-bold ${latest.performance_index == null
                                ? 'text-amber-300'
                                : Number(latest.earned_hours) >= Number(latest.consumed_hours) ? 'text-emerald-300' : 'text-red-300'}`}>
                                {latest.performance_index == null ? 'À confirmer' : `${Number(latest.earned_hours) >= Number(latest.consumed_hours) ? '+' : ''}${number(Number(latest.earned_hours)-Number(latest.consumed_hours),2)} h`}
                            </p>
                        </div>
                    </div>
                    {latest.performance_index == null && (
                        <p className="text-sm text-amber-200">
                            Indice suspendu : heures historiques non rapprochées, budget incohérent ou absence d'heures consommées.
                        </p>
                    )}
                    <p className="text-xs text-slate-400">
                        Résultats figés au dernier bilan. Les barres des tâches ci-dessous reflètent les heures enregistrées depuis.
                    </p>
                </div>
            ) : (
                <p className="rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
                    Aucun bilan validé. Renseignez l'avancement physique ci-dessous pour démarrer le suivi.
                </p>
            )}

            {!loading && <TaskPerformanceBars
                rows={taskRows}
                snapshotRows={latestTaskSnapshots}
                historyMode={latest?.history_mode || 'unverified'}
                validatedAt={latest?.validated_at}
            />}

            {/* Each trend appears when its distinct-week validation threshold is reached.
                Until then, keep the dashboard uncluttered. */}
            {!loading && <PerformanceTrends reports={reports} />}

            <button type="button" aria-expanded={showValidation}
                onClick={() => setShowValidation(value => !value)}
                className="w-full min-h-11 text-left rounded-xl border border-slate-600 bg-slate-800 p-3 font-semibold text-blue-200">
                {showValidation ? 'Masquer la validation de l’avancement ▲' : 'Mettre à jour l’avancement physique ▼'}
            </button>
            {showValidation && (loading ? <p role="status" className="text-slate-300">Chargement des validations…</p> : (
                <>
                    <div>
                        <h4 className="font-semibold mb-1">Validation de l'avancement des tâches</h4>
                        <p className="text-xs text-slate-400 mb-3">
                            Une seule validation hebdomadaire suffit. Déplacez le curseur selon les travaux réellement exécutés, indépendamment des heures consommées.
                        </p>
                        {siteTasks.length === 0 ? (
                            <p role="alert" className="text-amber-300">Aucune tâche avec budget d'heures. Ajoutez les budgets avant de valider.</p>
                        ) : (
                            <div className="space-y-3">
                                {siteTasks.map(task => {
                                    const key = String(task.id);
                                    const value = Number(percentages[key] ?? 0);
                                    return (
                                        <div key={task.id} className="bg-slate-800/60 p-4 sm:p-5 rounded-xl space-y-2">
                                            <div className="flex items-center justify-between gap-4">
                                                <label htmlFor={`bt-performance-slider-${task.id}`} className="min-w-0 cursor-pointer">
                                                    <span className="block text-sm font-semibold text-slate-100">{task.name}</span>
                                                    <span className="block text-xs text-slate-400 mt-1">{number(task.planned_hours)} h prévues</span>
                                                </label>
                                                <span aria-hidden="true" className="shrink-0 font-bold text-xl tabular-nums text-blue-300">
                                                    {value} %
                                                </span>
                                            </div>
                                            <input
                                                id={`bt-performance-slider-${task.id}`}
                                                className="bt-performance-slider"
                                                type="range"
                                                min="0"
                                                max="100"
                                                step="1"
                                                value={value}
                                                aria-label={`Avancement physique de ${task.name}`}
                                                aria-valuetext={`${value} pour cent`}
                                                style={{ '--progress': `${value}%` }}
                                                onChange={event => setPercentages(prev => ({
                                                    ...prev,
                                                    [key]: event.target.value
                                                }))}
                                            />
                                            <div aria-hidden="true" className="flex justify-between text-xs text-slate-400">
                                                <span>0 %</span>
                                                <span>100 %</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-800/70 rounded-xl p-3 flex flex-wrap gap-4 justify-between">
                        <div><p className="text-xs text-slate-400">Avancement proposé</p><p className="font-bold text-lg">{number(physicalPreview)} %</p></div>
                        <div><p className="text-xs text-slate-400">Budget correspondant aux travaux exécutés</p><p className="font-bold text-lg">{number(earnedPreview)} h</p></div>
                    </div>

                    {historicalHours > 0 && (
                        <label className="block">
                            <span className="block font-semibold text-sm mb-1">Rapprochement des heures historiques</span>
                            <span className="block text-xs text-slate-400 mb-2">
                                {number(historicalHours)} h déjà saisies dans les tâches. Confirmez leur relation avec les pointages avant d'afficher un IPMO.
                            </span>
                            <select
                                value={historyMode}
                                onChange={event => setHistoryMode(event.target.value)}
                                className="w-full p-3 rounded-lg border border-slate-600 bg-slate-800 text-white"
                            >
                                <option value="unverified">À vérifier — ne pas calculer l'indice</option>
                                <option value="additive">Heures historiques distinctes — les ajouter aux pointages</option>
                                <option value="sessions_only">Heures historiques déjà incluses — n'utiliser que les pointages</option>
                            </select>
                            <span className="block text-xs text-amber-200 mt-2">
                                En cas de chevauchement partiel, gardez « À vérifier » pour éviter un indice erroné.
                            </span>
                        </label>
                    )}

                    {mismatchedBudget && (
                        <p role="alert" className="text-amber-200 text-sm">
                            Le budget du chantier ({number(siteBudget)} h) diffère de la somme des tâches ({number(taskBudget)} h).
                            L'indice restera indisponible tant que les budgets ne seront pas réconciliés.
                        </p>
                    )}

                    {error && <p role="alert" className="p-3 bg-red-950/40 text-red-200 rounded-lg text-sm">{error}</p>}
                    {success && <p role="status" className="flex items-start gap-2 p-3 bg-emerald-950/30 text-emerald-200 rounded-lg text-sm"><CheckCircle2 size={18} />{success}</p>}
                    <button
                        type="button" disabled={saving || siteTasks.length === 0}
                        onClick={() => void submit()}
                        className="w-full sm:w-auto min-h-11 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                    >
                        {saving ? 'Enregistrement…' : 'Valider l’avancement du chantier'}
                    </button>
                </>
            ))}

            {reports.length > 1 && (
                <div className="border-t border-slate-700 pt-4">
                    <h4 className="font-semibold text-sm mb-2">Historique des derniers bilans</h4>
                    <div className="space-y-2 text-sm">
                        {reports.slice(0, 6).map(report => (
                            <div key={report.id} className="flex flex-wrap gap-2 justify-between bg-slate-800/50 rounded-lg p-2">
                                <span>{new Date(report.validated_at).toLocaleDateString('fr-CA')}</span>
                                <span>Avancement : {number(report.physical_percent)} %</span>
                                <span>IPMO : {report.performance_index == null ? 'Non calculé' : number(report.performance_index, 2)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
};

export default SitePerformancePanel;
