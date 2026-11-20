import React, { useState } from 'react';
import { Award, CheckCircle2, AlertTriangle } from 'lucide-react';
import { barConsumption, taskCompletionBadge } from '../utils/taskPerformance';

const fmt = (n, digits = 1) => Number(n || 0).toLocaleString('fr-CA', { maximumFractionDigits: digits });
const fmtIndex = (value) => Number(value).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The two graphic layers are TOTAL budget (slate) and ACTUAL hours (blue/red).
// No "earned hours" layer: physical progress is entered elsewhere.
const TaskPerformanceBars = ({ rows, snapshotRows, validatedAt, historyMode }) => {
    const [showAll, setShowAll] = useState(false);
    const snapshotMap = new Map(snapshotRows.map(row => [String(row.task_id), row]));
    const sorted = [...rows].sort((a, b) => {
        const aDone = Number(snapshotMap.get(String(a.id))?.physical_percent) === 100;
        const bDone = Number(snapshotMap.get(String(b.id))?.physical_percent) === 100;
        return Number(bDone) - Number(aDone) || a.name.localeCompare(b.name, 'fr');
    });
    const visible = showAll ? sorted : sorted.slice(0, 8);
    if (!rows.length) return null;

    return (
        <section aria-label="Heures par tâche" className="space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                    <h4 className="font-bold text-base">Heures prévues et réalisées par tâche</h4>
                    <p className="text-xs text-slate-400">
                        Les barres affichent les heures enregistrées à jour, sans confondre consommation et avancement.
                    </p>
                </div>
                <div className="flex gap-3 text-xs text-slate-300" aria-label="Légende">
                    <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded bg-slate-500" /> Prévu</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded bg-blue-500" /> Réalisé</span>
                    <span className="flex items-center gap-1"><span className="h-2.5 w-4 rounded bg-red-500" /> Dépassé</span>
                </div>
            </div>
            {historyMode === 'unverified' && (
                <p className="text-xs text-amber-200 flex items-start gap-2" role="status">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    Heures historiques non rapprochées : les heures réellement consommées de certaines tâches ne peuvent pas encore être comparées.
                </p>
            )}
            <div className="space-y-2">
                {visible.map(task => {
                    const snap = snapshotMap.get(String(task.id));
                    const completion = taskCompletionBadge(snap);
                    const bar = barConsumption(task.budget, task.actual);
                    return (
                        <div key={task.id} className="rounded-lg border border-slate-700/60 bg-slate-900/60 p-3">
                            <div className="grid grid-cols-1 sm:grid-cols-[minmax(120px,220px)_minmax(0,1fr)] gap-2 sm:gap-4 sm:items-center">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-100 break-words">{task.name}</p>
                                    {completion?.completed && (
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300 mt-1">
                                            <CheckCircle2 size={13} /> Travaux terminés (100 % validés)
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 space-y-2">
                                    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                                        <span className="text-slate-300">Prévu : <strong>{fmt(task.budget)} h</strong></span>
                                        <span className={bar.overBudget ? 'text-red-300' : 'text-slate-300'}>
                                            Réalisé : <strong>{bar.known ? fmt(task.actual, 2) + ' h' : 'À confirmer'}</strong>
                                        </span>
                                    </div>
                                    <div role="img" aria-label={`${task.name} : ${fmt(task.budget)} heures prévues, ${bar.known ? fmt(task.actual,2) + ' heures réalisées' : 'heures à confirmer'}`}
                                        className="relative h-3.5 rounded-full bg-slate-500 overflow-hidden">
                                        {bar.known && <div className={`absolute inset-y-0 left-0 rounded-full ${bar.overBudget ? 'bg-red-500' : 'bg-blue-500'}`}
                                            style={{ width: `${bar.width}%` }} />}
                                    </div>
                                    {bar.overBudget && (
                                        <p className="text-xs text-red-300 font-medium">
                                            Dépassement de {fmt(task.actual - task.budget, 2)} h
                                        </p>
                                    )}
                                </div>
                            </div>
                            {completion?.verified && (
                                <div className={`mt-2 inline-flex flex-wrap items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${completion.favorable
                                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                                    : 'bg-slate-800 border-slate-600 text-slate-200'}`}>
                                    {completion.favorable ? <Award size={16}/> : <CheckCircle2 size={16}/>}
                                    <span>Tâche terminée · IPMO {fmtIndex(completion.ipmo)}</span>
                                    {completion.favorable && <span>· {fmt(completion.hoursSaved,2)} h économisées</span>}
                                </div>
                            )}
                            {completion?.completed && !completion.verified && (
                                <p className="mt-2 text-xs text-amber-200">
                                    Tâche terminée · IPMO final à confirmer au prochain bilan fiable
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
            {sorted.length > 8 && (
                <button type="button" onClick={() => setShowAll(value => !value)}
                    className="min-h-10 px-3 rounded-lg border border-slate-600 text-blue-300 text-sm font-semibold">
                    {showAll ? 'Afficher moins de tâches' : `Afficher les ${sorted.length-8} autres tâches`}
                </button>
            )}
            <p className="text-xs text-slate-400">
                L'IPMO de tâche apparaît uniquement à 100 % d'avancement validé, avec des heures rapprochées. Il correspond au bilan du {validatedAt ? new Date(validatedAt).toLocaleDateString('fr-CA') : 'dernier contrôle'} et reste figé jusqu'à une nouvelle validation.
            </p>
        </section>
    );
};

export default TaskPerformanceBars;
