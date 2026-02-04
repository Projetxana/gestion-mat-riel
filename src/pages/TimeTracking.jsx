import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, Play, Square, RefreshCw, MapPin, AlertCircle, ChevronRight, ArrowLeft, Calendar, BarChart3 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SmartCorrectionPopup from '../components/SmartCorrectionPopup';
import WeeklySummary from '../components/WeeklySummary';

const TimeTracking = () => {
    const {
        timeSessions,
        tasks,
        sites,
        currentUser,
        startTimeSession,
        endTimeSession,
        switchTask,
        lastGeofenceExit,
        lastGeofenceEntry,
        addTask
    } = useAppContext();
    const navigate = useNavigate();
    const location = useLocation();

    // VIEW STATE: 'INITIAL' | 'WIZARD_SITE' | 'WIZARD_TASK' | 'ACTIVE'
    const [viewMode, setViewMode] = useState('INITIAL');
    const [activeSession, setActiveSession] = useState(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    // WIZARD STATE
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState(''); // MOVED TO TOP LEVEL
    const [isSubmitting, setIsSubmitting] = useState(false);

    // COMPANION DATA STATE
    const [companionStats, setCompanionStats] = useState(null);

    // CORRECTION STATE
    const [showCorrection, setShowCorrection] = useState(false);
    const [correctionType, setCorrectionType] = useState('end'); // 'end' or 'start'
    const [showChangeTaskModal, setShowChangeTaskModal] = useState(false);

    // --- EFFECTS ---

    // 0. Handle Auto-Selection from Geofence
    useEffect(() => {
        if (location.state?.autoSelectSiteId && viewMode === 'INITIAL') {
            handleSelectSite(location.state.autoSelectSiteId);
            // Clear state to prevent re-trigger on simple renders
            window.history.replaceState({}, document.title)
        }
    }, [location.state, viewMode]);

    // 1. Check for Active Session
    useEffect(() => {
        const active = timeSessions.find(s =>
            String(s.user_id) === String(currentUser?.id) &&
            s.punch_end_at === null
        );
        setActiveSession(active);
        if (active) {
            setViewMode('ACTIVE');
            // Update companion stats for current active site
            calculateCompanionStats(active.site_id);
        } else if (viewMode === 'ACTIVE') {
            // If we were in ACTIVE view but no session found (e.g. ended elsewhere), go back
            setViewMode('INITIAL');
        }
    }, [timeSessions, currentUser]);

    // 2. Timer Logic
    useEffect(() => {
        let interval;
        if (activeSession) {
            const start = new Date(activeSession.punch_start_at).getTime();

            const updateTimer = () => {
                const now = new Date().getTime();
                const diff = now - start;

                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                setElapsedTime(
                    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
                );
            };

            updateTimer(); // Immediate
            interval = setInterval(updateTimer, 1000);
        } else {
            setElapsedTime('00:00:00');
        }
        return () => clearInterval(interval);
    }, [activeSession]);

    // 3. Companion Stats Logic
    const calculateCompanionStats = (siteId) => {
        if (!siteId) return;

        const site = sites.find(s => String(s.id) === String(siteId));
        if (!site) return;

        // Calculate total hours for this site (all users)
        // This includes finished sessions + currently active ones (approximated)
        const siteSessions = timeSessions.filter(s => String(s.site_id) === String(siteId));

        let totalMs = 0;
        siteSessions.forEach(s => {
            const start = new Date(s.punch_start_at).getTime();
            const end = s.punch_end_at ? new Date(s.punch_end_at).getTime() : new Date().getTime(); // Count active time properly
            totalMs += (end - start);
        });

        const totalHours = Math.round(totalMs / (1000 * 60 * 60));
        const planned = site.planned_hours || 0;
        const progress = planned > 0 ? Math.min(100, Math.round((totalHours / planned) * 100)) : 0;
        const remaining = Math.max(0, planned - totalHours);

        // Breakdown by task for TODAY
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todaySessions = siteSessions.filter(s => new Date(s.punch_start_at) >= startOfDay);
        const taskBreakdown = {};

        todaySessions.forEach(s => {
            const tId = s.task_id;
            if (!taskBreakdown[tId]) taskBreakdown[tId] = 0;

            const start = new Date(s.punch_start_at).getTime();
            const end = s.punch_end_at ? new Date(s.punch_end_at).getTime() : new Date().getTime();
            taskBreakdown[tId] += (end - start);
        });

        const tasksStats = Object.entries(taskBreakdown).map(([tId, ms]) => ({
            name: getTaskName(tId),
            hours: Math.round((ms / (1000 * 60 * 60)) * 10) / 10 // 1 decimal
        })).sort((a, b) => b.hours - a.hours);

        // Project Rhythm Calculation
        let rhythm = null;
        if (site.planned_hours > 0 && site.end_date && (site.start_date || site.created_at)) {
            const start = new Date(site.start_date || site.created_at).getTime();
            const end = new Date(site.end_date).getTime();
            const now = new Date().getTime();

            if (end > start) {
                const totalDays = (end - start) / (1000 * 60 * 60 * 24);
                const elapsedDays = Math.max(0.1, (now - start) / (1000 * 60 * 60 * 24));

                if (elapsedDays > 0) {
                    const plannedPerDay = site.planned_hours / totalDays;
                    const realizedPerDay = totalHours / elapsedDays;

                    const ratio = realizedPerDay / plannedPerDay;

                    if (ratio > 1.15) {
                        rhythm = { status: 'drift', message: '⚠️ Plus rapide que prévu' };
                    } else if (ratio > 1.10) {
                        rhythm = { status: 'watch', message: '⚠️ À surveiller' };
                    } else {
                        rhythm = { status: 'ok', message: '✅ Rythme normal' };
                    }
                }
            }
        }

        setCompanionStats({
            siteName: site.name,
            totalHours,
            planned,
            progress,
            remaining,
            tasksStats,
            rhythm
        });
    };

    // --- ACTIONS ---

    const handleSelectSite = (id) => {
        setSelectedSiteId(id);
        setSelectedTaskId(''); // Reset task selection
        calculateCompanionStats(id);
        setViewMode('WIZARD_TASK');
    };

    const handleStartSession = async (taskId) => {
        setIsSubmitting(true);
        // Use real GPS entry if available
        const gpsEntry = lastGeofenceEntry && String(lastGeofenceEntry.siteId) === String(selectedSiteId) ? lastGeofenceEntry : null;

        const result = await startTimeSession(selectedSiteId, taskId, gpsEntry);
        setIsSubmitting(false);
        if (result.error) {
            alert(result.error);
        }
    };

    const handleEndDay = async () => {
        const exit = lastGeofenceExit;
        // Check if exit matches current session site
        // And if the exit was somewhat recent (e.g. within last 2 hours? or just today?)
        // Let's assume relevant if it happened AFTER session start
        const isRelevantExit = exit &&
            String(exit.siteId) === String(activeSession.site_id) &&
            new Date(exit.exitAt) > new Date(activeSession.punch_start_at);

        if (isRelevantExit) {
            // Check diff > 5 mins
            const diffMin = Math.abs(new Date().getTime() - new Date(exit.exitAt).getTime()) / 60000;
            if (diffMin > 5) {
                console.log("Smart Correction Triggered: Exit was", exit.exitAt);
                setCorrectionType('end');
                setShowCorrection(true);
                return;
            }
        }

        if (!window.confirm("Terminer la journée ?")) return;
        confirmEndDay(null);
    };

    const confirmEndDay = async (correction) => {
        setIsSubmitting(true);
        const mockGps = lastGeofenceExit ? { exitAt: lastGeofenceExit.exitAt } : null; // Pass exit even if not corrected

        await endTimeSession(activeSession.id, mockGps, correction);
        setIsSubmitting(false);
        setShowCorrection(false);
        setViewMode('INITIAL');
    };


    const getTaskName = (taskId, siteId = null) => {
        // Try to find in specific site first
        if (siteId) {
            const site = sites.find(s => String(s.id) === String(siteId));
            const pTask = site?.project_tasks?.find(t => String(t.id) === String(taskId));
            if (pTask) return pTask.name;
            const task = site?.tasks?.find(t => String(t.id) === String(taskId));
            if (task) return task.name;
        }
        // Fallback to global tasks (legacy) - KEEPING ONLY FOR HISTORICAL DATA DISPLAY
        const globalTask = tasks.find(t => String(t.id) === String(taskId));
        if (globalTask) return globalTask.name;

        // Deep search in all sites (slow but safe fallback)
        for (const s of sites) {
            const t = s.tasks?.find(k => String(k.id) === String(taskId));
            if (t) return t.name;
        }

        return 'Tâche Inconnue';
    };

    // --- RENDERERS ---

    const renderCompanionView = () => {
        if (!companionStats) return null;

        return (
            <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Chantier</p>
                        <h3 className="text-xl font-bold">{companionStats.siteName}</h3>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold text-blue-400">{companionStats.progress}%</p>
                        <p className="text-xs text-slate-400">Progression</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-6">
                    <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-1000"
                        style={{ width: `${companionStats.progress}%` }}
                    ></div>
                </div>

                {/* Rhythm Indicator */}
                {
                    companionStats.rhythm && (
                        <div className={`mb-6 p-3 rounded-lg flex items-center gap-3 border ${companionStats.rhythm.status === 'drift' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                            companionStats.rhythm.status === 'watch' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                'bg-green-500/10 border-green-500/30 text-green-400'
                            }`}>
                            <BarChart3 size={18} />
                            <div>
                                <p className="text-[10px] uppercase font-bold opacity-70">Rythme du chantier</p>
                                <p className="text-sm font-bold">{companionStats.rhythm.message}</p>
                            </div>
                        </div>
                    )
                }

                <div className="grid grid-cols-2 gap-4 mb-6 border-b border-slate-800 pb-6">
                    <div>
                        <p className="text-slate-400 text-xs">Prévues</p>
                        <p className="font-mono text-lg">{companionStats.planned} h</p>
                    </div>
                    <div className="text-right">
                        <p className="text-slate-400 text-xs text-green-400">Restantes</p>
                        <p className="font-mono text-lg text-green-400">{companionStats.remaining} h</p>
                    </div>
                </div>

                <div>
                    <p className="text-slate-400 text-xs font-bold uppercase mb-3">Aujourd'hui sur ce chantier</p>
                    {companionStats.tasksStats.length > 0 ? (
                        <div className="space-y-2">
                            {companionStats.tasksStats.map((stat, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span className="text-slate-300">{stat.name}</span>
                                    <span className="font-mono font-bold">{stat.hours} h</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm italic">Aucune heure enregistrée aujourd'hui</p>
                    )}
                </div>
            </div >
        );
    };


    // 1. INITIAL VIEW
    if (viewMode === 'INITIAL') {
        return (
            <div className="max-w-md mx-auto pb-24 space-y-6">
                <header className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Clock className="text-blue-600" />
                        Heures de travail
                    </h1>
                </header>

                {/* Main Action */}
                <button
                    onClick={() => setViewMode('WIZARD_SITE')}
                    className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95"
                >
                    <Play size={32} fill="currentColor" />
                    <span className="text-xl font-bold tracking-wide">DÉBUTER MA JOURNÉE</span>
                </button>

                {/* Secondary Action */}
                <div className="text-center">
                    <button
                        onClick={() => navigate('/timetracking/manual')}
                        className="text-sm text-slate-400 font-medium hover:text-slate-600 underline"
                    >
                        Ajouter une entrée manuellement
                    </button>
                </div>

                {/* Hint */}
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm flex gap-3">
                    <AlertCircle className="shrink-0 text-blue-500" size={20} />
                    <p>
                        Bienvenue ! N'oubliez pas de lancer le chrono dès votre arrivée sur le chantier.
                    </p>
                </div>

                {/* WEEKLY SUMMARY SECTION */}
                <div className="pt-4 border-t border-slate-200 mt-4">
                    <h3 className="text-sm font-bold text-slate-500 mb-4 px-1">MES HEURES SEMAINE</h3>
                    <WeeklySummary sessions={timeSessions} sites={sites} />
                </div>
            </div>
        );
    }

    // 2. WIZARD STEP 1: SITE
    if (viewMode === 'WIZARD_SITE') {
        // Sort sites: Active first, then alphabetically
        const activeSites = sites.filter(s => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name));

        return (
            <div className="max-w-md mx-auto pb-24 flex flex-col h-[calc(100vh-140px)]">
                <div className="flex items-center gap-2 mb-6">
                    <button onClick={() => setViewMode('INITIAL')} className="p-2 -ml-2 text-slate-400 hover:text-slate-600">
                        <ArrowLeft />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">Choisir le chantier</h2>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                    {activeSites.map(site => (
                        <button
                            key={site.id}
                            onClick={() => handleSelectSite(site.id)}
                            className="w-full text-left bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all group"
                        >
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-lg text-slate-800 group-hover:text-blue-700">{site.name}</span>
                                <ChevronRight className="text-slate-300 group-hover:text-blue-500" />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{site.address || 'Aucune adresse'}</p>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // 3. WIZARD STEP 2: TASK
    if (viewMode === 'WIZARD_TASK') {
        const site = sites.find(s => String(s.id) === String(selectedSiteId));
        // Use site specific tasks (strict)
        const siteTasks = site?.project_tasks && site.project_tasks.length > 0 ? site.project_tasks : (site?.tasks || []);

        return (
            <div className="max-w-md mx-auto pb-24 flex flex-col h-[calc(100vh-140px)]">
                <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setViewMode('WIZARD_SITE')} className="p-2 -ml-2 text-slate-400 hover:text-slate-600">
                        <ArrowLeft />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">Quelle tâche ?</h2>
                </div>
                <p className="text-sm text-slate-500 mb-6 ml-10">Sur : <span className="font-bold text-black">{site?.name}</span></p>

                {/* Show Site Stats here for motivation */}
                <div className="mb-6">
                    {renderCompanionView()}
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                    {siteTasks.length === 0 ? (
                        <div className="text-center space-y-4 py-4">
                            <p className="text-slate-500">Aucune section définie pour ce chantier.</p>

                            {/* REAL UI FOR EMPTY STATE */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <p className="text-sm text-slate-600 mb-3">Créez une première tâche pour démarrer :</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        id="quick-task-name"
                                        placeholder="Nom (ex: Installation)"
                                        className="flex-1 bg-white border border-slate-300 rounded px-3 py-2"
                                    />
                                    <button
                                        onClick={async () => {
                                            const nameEl = document.getElementById('quick-task-name');
                                            if (nameEl && nameEl.value) {
                                                const result = await addTask({
                                                    name: nameEl.value,
                                                    site_id: Number(selectedSiteId),
                                                    is_active: true,
                                                    planned_hours: 0
                                                });
                                                if (result.success && result.task) {
                                                    setSelectedTaskId(result.task.id);
                                                }
                                            }
                                        }}
                                        className="bg-blue-600 text-white px-4 rounded font-bold"
                                    >
                                        OK
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Sélectionnez une activité</label>
                            <div className="relative">
                                <select
                                    className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-900 text-lg rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-4 pr-10"
                                    value={selectedTaskId}
                                    onChange={(e) => setSelectedTaskId(e.target.value)}
                                >
                                    <option value="" disabled>-- Choisir --</option>
                                    {siteTasks.map(task => (
                                        <option key={task.id} value={task.id}>
                                            {task.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                    <ChevronRight className="rotate-90" />
                                </div>
                            </div>

                            {/* Sticky Add Button */}
                            <div className="mt-4 text-center">
                                <button
                                    onClick={async () => {
                                        const name = window.prompt("Ajouter une tâche :");
                                        if (name) {
                                            const result = await addTask({
                                                name,
                                                site_id: Number(selectedSiteId),
                                                is_active: true,
                                                planned_hours: 0
                                            });
                                            if (result.success && result.task) {
                                                setSelectedTaskId(result.task.id);
                                            }
                                        }
                                    }}
                                    className="text-xs text-blue-500 hover:text-blue-700 font-medium flex items-center justify-center gap-1"
                                >
                                    + Ajouter une autre tâche
                                </button>
                            </div>
                        </div>
                    )}

                    <button
                        disabled={!selectedTaskId || isSubmitting}
                        onClick={() => handleStartSession(selectedTaskId)}
                        className={`w-full py-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-lg transition-all ${!selectedTaskId
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30'
                            }`}
                    >
                        <Play size={24} fill="currentColor" className="mb-1" />
                        <span className="text-lg">COMMENCER</span>
                    </button>
                </div>
            </div>
        );
    }

    // 4. ACTIVE SESSION
    if (viewMode === 'ACTIVE' && activeSession) {
        return (
            <div className="max-w-md mx-auto pb-24 space-y-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="text-blue-600 animate-pulse" />
                    Session Active
                </h1>

                {/* Live Card */}
                <div className="bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden relative">
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400 animate-gradient"></div>

                    <div className="p-8 text-center space-y-8">
                        <div>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Temps écoulé</p>
                            <div className="text-6xl font-black text-slate-900 font-mono tracking-tighter tabular-nums">
                                {elapsedTime}
                            </div>
                            <p className="text-slate-400 text-xs mt-2">
                                Début : {new Date(activeSession.punch_start_at).toLocaleTimeString().slice(0, 5)}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs text-slate-400 uppercase font-bold text-left mb-1">Chantier</p>
                                <p className="text-lg font-bold text-black text-left truncate">
                                    {sites.find(s => String(s.id) === String(activeSession.site_id))?.name}
                                </p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="text-xs text-blue-400 uppercase font-bold text-left mb-1">Tâche en cours</p>
                                <p className="text-lg font-bold text-blue-800 text-left flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                    </span>
                                    {getTaskName(activeSession.task_id, activeSession.site_id)}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={() => {
                                    setShowChangeTaskModal(true);
                                }}
                                disabled={isSubmitting}
                                className="py-4 bg-white border-2 border-slate-100 hover:border-slate-300 text-slate-700 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:bg-slate-50"
                            >
                                <RefreshCw size={20} className="mb-1" />
                                Changer Tâche
                            </button>
                            <button
                                onClick={handleEndDay}
                                disabled={isSubmitting}
                                className="py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-lg shadow-slate-900/20 transition-all active:scale-95"
                            >
                                <Square size={20} fill="currentColor" className="mb-1" />
                                Terminer
                            </button>
                        </div>
                    </div>
                </div>

                {/* Companion View below active card */}
                {renderCompanionView()}

                {showCorrection && (
                    <SmartCorrectionPopup
                        title="Correction - Départ"
                        punchTime={new Date()}
                        gpsTime={lastGeofenceExit?.exitAt}
                        type="end"
                        onConfirm={(time, isModified) => confirmEndDay({ time, isModified })}
                        onCancel={() => confirmEndDay(null)}
                    />
                )}

                {showChangeTaskModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl">
                            <h3 className="text-lg font-bold text-slate-800">Changer d'activité</h3>
                            <p className="text-sm text-slate-500">Sélectionnez la nouvelle tâche en cours.</p>

                            <div className="relative">
                                <select
                                    className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-3 pr-10 focus:ring-blue-500"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            if (window.confirm('Confirmer le changement ?')) {
                                                switchTask(activeSession.id, activeSession.site_id, e.target.value);
                                                setShowChangeTaskModal(false);
                                            }
                                        }
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>-- Sélectionner --</option>
                                    {(() => {
                                        const site = sites.find(s => s.id === activeSession.site_id);
                                        const tasks = site?.project_tasks && site.project_tasks.length > 0 ? site.project_tasks : (site?.tasks || []);
                                        return tasks.map(task => (
                                            <option key={task.id} value={task.id}>{task.name}</option>
                                        ));
                                    })()}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                    <ChevronRight className="rotate-90" />
                                </div>
                            </div>

                            <button
                                onClick={() => setShowChangeTaskModal(false)}
                                className="w-full py-3 text-slate-500 font-bold"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return <div className="p-8 text-center text-slate-400">Loading...</div>;
};

export default TimeTracking;
