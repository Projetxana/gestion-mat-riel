import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ArrowLeft, MapPin, Hammer, ExternalLink, Clock, BarChart3 } from 'lucide-react';
import MaterialDetailsModal from '../components/MaterialDetailsModal';
import SiteFormModal from '../components/SiteFormModal';

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { sites, materials, timeSessions, tasks, importTasksFromExcel, importProjectProgress, updateSite, updateTask, addTask } = useAppContext();
    const [selectedTool, setSelectedTool] = useState(null);
    const [isEditingSite, setIsEditingSite] = useState(false);
    const [editPlannedHours, setEditPlannedHours] = useState(0);
    const [showSiteForm, setShowSiteForm] = useState(false);

    const handleImportProgress = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (confirm("Attention : Cet import va créer des sessions de temps 'historiques' et mettre à jour les heures prévues. Continuer ?")) {
            const result = await importProjectProgress(site.id, file);
            if (result.success) {
                alert(`Import réussi !\n${result.tasksCreated} tâches créées\n${result.sessionsCreated} entrées d'historique générées`);
            } else {
                alert(`Erreur : ${result.error}`);
            }
        }
        e.target.value = null; // Reset
    };

    const site = sites.find(s => s.id === Number(id));
    const siteTools = materials.filter(m => m.locationType === 'site' && m.locationId === Number(id));

    if (!site) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-bold">Chantier Introuvable</h2>
                <button onClick={() => navigate('/sites')} className="text-blue-400 mt-4">Retour aux chantiers</button>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={() => navigate('/sites')}
                className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
            >
                <ArrowLeft size={20} />
                <span>Retour aux chantiers</span>
            </button>

            <div className="glass-panel p-8 mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold">{site.name}</h1>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${site.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-500/10 text-slate-400'
                                }`}>
                                {site.status}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                            <MapPin size={18} />
                            <p>{site.address}</p>
                            {(site.geofence_lat && site.geofence_lng) && (
                                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-900/50 text-blue-300 border border-blue-800">
                                    <MapPin size={10} />
                                    GPS Actif
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => setShowSiteForm(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition-colors"
                    >
                        Modifier
                    </button>
                </div>

                <div className="flex gap-8 mt-8 border-t border-slate-800 pt-6">
                    <div>
                        <p className="text-3xl font-bold text-white">{siteTools.length}</p>
                        <p className="text-xs text-slate-500 uppercase font-medium">Matériel Assigné</p>
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-white">{siteTools.filter(t => t.status === 'in_use').length}</p>
                        <p className="text-xs text-slate-500 uppercase font-medium">En Utilisation</p>
                    </div>
                </div>
            </div>


            {/* SUIVI DES HEURES (ADMIN / FOREMAN) */}
            <div className="glass-panel p-8 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BarChart3 size={100} />
                </div>

                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Clock className="text-blue-500" />
                        Suivi des Heures
                    </h2>
                    <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition-colors flex items-center gap-2">
                        <span className="hidden sm:inline">Import Avancement</span>
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportProgress} />
                    </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Main Stats */}
                    <div className="col-span-1 space-y-6">
                        <div>
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-slate-400 text-sm font-bold uppercase">Progression</span>
                                <span className="text-2xl font-bold text-blue-400">
                                    {(() => {
                                        const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                        const totalMs = siteSessions.reduce((acc, s) => {
                                            const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                            const end = (s.corrected_end_at || s.punch_end_at)
                                                ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                                : new Date().getTime();
                                            return acc + (end - start);
                                        }, 0);
                                        const totalHours = Math.round(totalMs / (1000 * 60 * 60));
                                        const planned = site.planned_hours || 0;
                                        return planned > 0 ? Math.min(100, Math.round((totalHours / planned) * 100)) : 0;
                                    })()}%
                                </span>
                            </div>
                            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-cyan-400"
                                    style={{
                                        width: `${(() => {
                                            const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                            const totalMs = siteSessions.reduce((acc, s) => {
                                                const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                                const end = (s.corrected_end_at || s.punch_end_at)
                                                    ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                                    : new Date().getTime();
                                                return acc + (end - start);
                                            }, 0);
                                            const totalHours = Math.round(totalMs / (1000 * 60 * 60));
                                            const planned = site.planned_hours || 0;
                                            return planned > 0 ? Math.min(100, Math.round((totalHours / planned) * 100)) : 0;
                                        })()}%`
                                    }}
                                ></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Réalisées</p>
                                <p className="text-xl font-bold text-white">
                                    {(() => {
                                        const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                        const totalMs = siteSessions.reduce((acc, s) => {
                                            const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                            const end = (s.corrected_end_at || s.punch_end_at)
                                                ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                                : new Date().getTime();
                                            return acc + (end - start);
                                        }, 0);
                                        return Math.round(totalMs / (1000 * 60 * 60));
                                    })()} h
                                </p>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Prévues</p>
                                <p className="text-xl font-bold text-slate-400">{site.planned_hours || 0} h</p>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded-xl border border-slate-700 text-center">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Restantes</p>
                                <p className="text-xl font-bold text-green-400">
                                    {(() => {
                                        const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                        const totalMs = siteSessions.reduce((acc, s) => {
                                            const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                            const end = (s.corrected_end_at || s.punch_end_at)
                                                ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                                : new Date().getTime();
                                            return acc + (end - start);
                                        }, 0);
                                        const realized = Math.round(totalMs / (1000 * 60 * 60));
                                        const planned = site.planned_hours || 0;
                                        return Math.max(0, planned - realized);
                                    })()} h
                                </p>
                            </div>
                        </div>

                        {/* RHYTHM INDICATOR */}
                        {(site.start_date || site.created_at) && site.end_date && site.planned_hours > 0 && (
                            <div className="mt-4 bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                                {(() => {
                                    // 1. Calculate Time Totals
                                    // Use explicit start_date if available, else created_at
                                    const start = new Date(site.start_date || site.created_at).getTime();
                                    const end = new Date(site.end_date).getTime();
                                    const now = new Date().getTime();

                                    if (end <= start) return null;

                                    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
                                    const elapsedDays = Math.max(0.1, (now - start) / (1000 * 60 * 60 * 24)); // Avoid div by zero, min 0.1 day

                                    if (elapsedDays <= 0) return null; // Not started yet

                                    // 2. Planned Burn Rate (Hours per Day)
                                    const plannedHoursPerDay = site.planned_hours / totalDays;

                                    // 3. Realized Burn Rate (Hours per Day)
                                    const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                                    const totalMs = siteSessions.reduce((acc, s) => {
                                        const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                        const end = (s.corrected_end_at || s.punch_end_at)
                                            ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                            : new Date().getTime();
                                        return acc + (end - start);
                                    }, 0);
                                    const totalRealizedHours = totalMs / (1000 * 60 * 60);
                                    const realizedHoursPerDay = totalRealizedHours / elapsedDays;

                                    // 4. Comparison Ratio
                                    // If Realized > Planned * 1.15 -> Drift
                                    const ratio = realizedHoursPerDay / plannedHoursPerDay;

                                    if (ratio > 1.15) {
                                        const percentOver = Math.round((ratio - 1) * 100);
                                        return (
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-red-500/20 text-red-500 rounded-full animate-pulse">
                                                    <BarChart3 size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-red-500">Rythme du chantier</p>
                                                    <p className="text-xs text-slate-300">⚠️ Consommation + rapide (+{percentOver}%)</p>
                                                </div>
                                            </div>
                                        );
                                    } else if (ratio > 1.10) {
                                        const percentOver = Math.round((ratio - 1) * 100);
                                        return (
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-amber-500/20 text-amber-500 rounded-full">
                                                    <BarChart3 size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-amber-500">Rythme du chantier</p>
                                                    <p className="text-xs text-slate-300">🟠 À surveiller (+{percentOver}%)</p>
                                                </div>
                                            </div>
                                        );
                                    } else {
                                        return (
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-green-500/20 text-green-400 rounded-full">
                                                    <BarChart3 size={20} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-green-400">Rythme du chantier</p>
                                                    <p className="text-xs text-slate-300">✅ Rythme normal</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* SUIVI PLANIFIÉ (Admin / Foreman Only) */}
            <div className="glass-panel p-8 mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase">Suivi Planifié</h3>
                    <button
                        onClick={() => {
                            if (isEditingSite) {
                                updateSite(site.id, { planned_hours: Number(editPlannedHours) });
                                setIsEditingSite(false);
                            } else {
                                setEditPlannedHours(site.planned_hours || 0);
                                setIsEditingSite(true);
                            }
                        }}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-1 rounded border border-slate-700 transition-colors"
                    >
                        {isEditingSite ? 'Enregistrer' : 'Modifier Heures'}
                    </button>
                </div>
                {(() => {
                    if (!site.planned_hours || !site.end_date || (!site.start_date && !site.created_at)) {
                        return <p className="text-slate-500 text-sm italic">Données insuffisantes (Heures prévues, Date de fin ou Date de début manquantes).</p>;
                    }

                    // 1. Theoretical Hours to Date (Day-based precision)
                    const startDate = new Date(site.start_date || site.created_at);
                    const endDate = new Date(site.end_date);
                    const today = new Date();

                    // Normalize to set time to midnight to calculate pure days difference
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(0, 0, 0, 0);
                    today.setHours(0, 0, 0, 0);

                    if (endDate <= startDate) return <p className="text-red-500 text-sm">Erreur: Date de fin antérieure au début.</p>;

                    const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
                    const elapsedDays = Math.max(0, (today - startDate) / (1000 * 60 * 60 * 24));

                    let theoreticalHours = 0;
                    if (today >= endDate) {
                        theoreticalHours = site.planned_hours;
                    } else {
                        const hoursPerDay = site.planned_hours / totalDays;
                        theoreticalHours = Math.round(hoursPerDay * elapsedDays);
                    }

                    // 2. Realized Hours
                    const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                    const totalMs = siteSessions.reduce((acc, s) => {
                        const startH = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                        const endH = (s.corrected_end_at || s.punch_end_at)
                            ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                            : new Date().getTime();
                        return acc + (endH - startH);
                    }, 0);
                    const realizedHours = Math.round(totalMs / (1000 * 60 * 60));

                    // 3. Gap Calculation
                    const gap = realizedHours - theoreticalHours; // Positive = Over-consumption
                    const gapPercent = theoreticalHours > 0 ? (gap / theoreticalHours) : 0;

                    // Color Coding
                    let gapColor = 'text-green-400';
                    let gapBg = 'bg-green-500/10 border-green-500/20';
                    let gapIcon = '✅';

                    if (gapPercent > 0.20) {
                        gapColor = 'text-red-400';
                        gapBg = 'bg-red-500/10 border-red-500/20';
                        gapIcon = '🔴';
                    } else if (gapPercent > 0.10) {
                        gapColor = 'text-amber-400';
                        gapBg = 'bg-amber-500/10 border-amber-500/20';
                        gapIcon = '🟠';
                    } else if (gapPercent < -0.10) {
                        gapColor = 'text-blue-400'; // Under budget (good)
                        gapBg = 'bg-blue-500/10 border-blue-500/20';
                        gapIcon = '❄️';
                    }

                    return (
                        <div className={`p-4 rounded-xl border ${gapBg} flex flex-col sm:flex-row justify-between items-center gap-4`}>
                            <div className="space-y-1 text-center sm:text-left">
                                <p className="text-xs text-slate-400 uppercase font-bold">Heures Prévues</p>
                                {isEditingSite ? (
                                    <input
                                        type="number"
                                        className="bg-slate-900 border border-slate-700 text-white rounded p-1 w-24 font-bold"
                                        value={editPlannedHours}
                                        onChange={(e) => setEditPlannedHours(e.target.value)}
                                    />
                                ) : (
                                    <p className="text-xl font-mono font-bold text-white">{site.planned_hours} h</p>
                                )}
                            </div>
                            <div className="space-y-1 text-center sm:text-left">
                                <p className="text-xs text-slate-400 uppercase font-bold">Théoriques à date</p>
                                <p className="text-xl font-mono font-bold text-slate-300">{theoreticalHours} h</p>
                            </div>
                            <div className="space-y-1 text-center sm:text-left">
                                <p className="text-xs text-slate-400 uppercase font-bold">Réalisées</p>
                                <p className="text-xl font-mono font-bold text-white">{realizedHours} h</p>
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded-lg text-center min-w-[120px]">
                                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Écart</p>
                                <div className={`text-2xl font-bold ${gapColor} flex items-center justify-center gap-2`}>
                                    <span>{gap > 0 ? '+' : ''}{gap} h</span>
                                    <span className="text-sm">{gapIcon}</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Task Breakdown */}
            <div className="glass-panel p-8 mb-8">
                <div className="flex flex-wrap gap-2 justify-between items-end mb-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase">Répartition par tâche</h3>
                    <div className="flex gap-2">
                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition-colors flex items-center gap-2">
                            <span>Imp. Excel</span>
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        if (window.confirm(`Importer les tâches depuis ${file.name} ?`)) {
                                            const result = await importTasksFromExcel(Number(id), file);
                                            if (result.success) alert(`Succès ! ${result.count} tâches importées.`);
                                            else alert(`Erreur: ${result.error}`);
                                        }
                                    }
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>
                </div>

                {/* Add Task Form */}
                <div className="mb-4 bg-slate-900/30 p-3 rounded-lg border border-slate-800 flex gap-2 items-center">
                    <input type="text" placeholder="Nouvelle tâche..." id="new-task-name" className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white" />
                    <input type="number" placeholder="Heures" id="new-task-hours" className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white" />
                    <button
                        onClick={() => {
                            const nameEl = document.getElementById('new-task-name');
                            const hoursEl = document.getElementById('new-task-hours');
                            if (nameEl.value) {
                                addTask({
                                    name: nameEl.value,
                                    planned_hours: Number(hoursEl.value) || 0,
                                    site_id: Number(id), // Ensuring number type for match
                                    is_active: true
                                });
                                nameEl.value = '';
                                hoursEl.value = '';
                            }
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded font-bold"
                    >
                        Ajouter
                    </button>
                </div>

                <div className="space-y-3">
                    {/* TABLE HEADER */}
                    <div className="grid grid-cols-4 gap-4 px-3 py-2 text-[10px] uppercase font-bold text-slate-500">
                        <div className="col-span-1">Tâche</div>
                        <div className="text-right">Prévu</div>
                        <div className="text-right">Réalisé</div>
                        <div className="text-right">Écart</div>
                    </div>

                    {(() => {
                        const siteSessions = timeSessions?.filter(s => String(s.site_id) === String(id)) || [];
                        const siteSpecificTasks = tasks.filter(t => String(t.site_id) === String(id));

                        // Merge tasks from DB and tasks found in sessions (if legacy/global)
                        const allTaskIds = new Set([
                            ...siteSpecificTasks.map(t => t.id),
                            ...siteSessions.map(s => s.task_id)
                        ]);

                        const stats = Array.from(allTaskIds).map(tId => {
                            const taskDef = tasks.find(t => String(t.id) === String(tId));
                            const name = taskDef?.name || 'Inconnu';
                            const planned = taskDef?.planned_hours || 0;

                            const relevantSessions = siteSessions.filter(s => String(s.task_id) === String(tId));
                            const totalMs = relevantSessions.reduce((acc, s) => {
                                const start = new Date(s.corrected_start_at || s.punch_start_at).getTime();
                                const end = (s.corrected_end_at || s.punch_end_at)
                                    ? new Date(s.corrected_end_at || s.punch_end_at).getTime()
                                    : new Date().getTime();
                                return acc + (end - start);
                            }, 0);

                            const realized = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100; // 2 decimals
                            const gap = realized - planned;

                            return { name, planned, realized, gap };
                        }).sort((a, b) => b.realized - a.realized);

                        if (stats.length === 0) return <p className="text-slate-500 text-sm italic px-3">Aucune tâche configurée.</p>;

                        return stats.map((stat, idx) => (
                            <div key={idx} className="bg-slate-800/50 hover:bg-slate-800 p-3 rounded-lg border border-slate-700 grid grid-cols-4 gap-4 items-center text-sm transition-colors">
                                <div className="font-medium text-slate-200 truncate" title={stat.name}>{stat.name}</div>
                                <div className="text-right">
                                    <input
                                        type="number"
                                        className="bg-transparent border-b border-slate-600 w-16 text-right font-mono text-slate-400 focus:text-white focus:border-blue-500 outline-none"
                                        defaultValue={stat.planned}
                                        onBlur={(e) => {
                                            // Find task ID to update
                                            const t = tasks.find(t => t.name === stat.name && String(t.site_id) === String(id));
                                            if (t && Number(e.target.value) !== t.planned_hours) {
                                                updateTask(t.id, { planned_hours: Number(e.target.value) });
                                            }
                                        }}
                                    />
                                </div>
                                <div className="text-right font-mono text-white font-bold">{stat.realized}h</div>
                                <div className={`text-right font-mono font-bold ${stat.planned === 0 ? 'text-slate-600' :
                                    stat.gap > 0 ? 'text-red-400' : 'text-green-400'
                                    }`}>
                                    {stat.planned > 0 ? (stat.gap > 0 ? '+' : '') + Math.round(stat.gap * 10) / 10 : '-'}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            </div>

            <h2 className="text-xl font-bold mb-4">Matériel Assigné</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {siteTools.map((tool) => (
                    <div key={tool.id} className="glass-panel p-4 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="p-2 rounded bg-slate-800 text-slate-400">
                                <Hammer size={20} />
                            </div>
                            <div>
                                <p className="font-bold text-slate-200">{tool.name}</p>
                                <p className="text-xs text-slate-500">{tool.serialNumber}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setSelectedTool(tool)}
                            className="p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-blue-400 transition-colors"
                        >
                            <ExternalLink size={18} />
                        </button>
                    </div>
                ))}
                {siteTools.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                        <p>Aucun matériel sur ce site.</p>
                        <p className="text-sm mt-2">Allez dans "Matériel" pour affecter de l'équipement.</p>
                    </div>
                )}
            </div>

            {selectedTool && (
                <MaterialDetailsModal
                    tool={selectedTool}
                    onClose={() => setSelectedTool(null)}
                />
            )}
            {showSiteForm && (
                <SiteFormModal
                    siteToEdit={site}
                    onClose={() => setShowSiteForm(false)}
                />
            )}
        </div>
    );
};

export default SiteDetails;
