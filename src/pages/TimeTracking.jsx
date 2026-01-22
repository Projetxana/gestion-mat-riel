import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, Play, Square, RefreshCw, MapPin, AlertCircle, ChevronRight, ArrowLeft, Calendar, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SmartCorrectionPopup from '../components/SmartCorrectionPopup';

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
        lastGeofenceEntry
    } = useAppContext();
    const navigate = useNavigate();

    // VIEW STATE: 'INITIAL' | 'WIZARD_SITE' | 'WIZARD_TASK' | 'ACTIVE'
    const [viewMode, setViewMode] = useState('INITIAL');
    const [activeSession, setActiveSession] = useState(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    // WIZARD STATE
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // COMPANION DATA STATE
    const [companionStats, setCompanionStats] = useState(null);

    // --- EFFECTS ---

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

        setCompanionStats({
            siteName: site.name,
            totalHours,
            planned,
            progress,
            remaining,
            tasksStats
        });
    };

    // --- ACTIONS ---

    const handleSelectSite = (id) => {
        setSelectedSiteId(id);
        calculateCompanionStats(id); // Show stats for selected site immediately in next step? Or keep previous?
        // Actually, Wizard-Step 2 is Task selection. Maybe show site stats there?
        setViewMode('WIZARD_TASK');
    };

    const handleStartSession = async (taskId) => {
        setIsSubmitting(true);
        // Mock GPS
        const mockGps = { entryAt: new Date() };
        const result = await startTimeSession(selectedSiteId, taskId, mockGps);
        setIsSubmitting(false);
        if (result.error) {
            alert(result.error);
        } else {
            // Auto transition to ACTIVE happens via useEffect
        }
    };

    // CORRECTION STATE
    const [showCorrection, setShowCorrection] = useState(false);
    const [pendingEndSession, setPendingEndSession] = useState(false); // To resume after popup

    // Removed redundant declaration since we already have it from context destructuring at the top

    const handleEndDay = async () => {
        // W3: Workflow End Day
        // Check Smart Correction condition (W4)
        // If GPS exit exists and is diff > 5 mins from now, show popup. 
        // For MVP, if we have ANY geofence exit recorded that hasn't been used, we could propose it.
        // OR simply: If we are OUTSIDE the site right now (lastGeofenceExit is set).

        const exit = lastGeofenceExit;
        // Check if exit matches current session site
        const isRelevantExit = exit && String(exit.siteId) === String(activeSession.site_id);

        if (isRelevantExit) {
            // Check diff
            const diffMin = Math.abs(new Date().getTime() - new Date(exit.exitAt).getTime()) / 60000;
            if (diffMin > 5) {
                // Show Popup
                console.log("Smart Correction Triggered: Exit was", exit.exitAt);
                setPendingEndSession(true);
                setShowCorrection(true);
                return;
            }
        }

        // Standard End
        if (!window.confirm("Terminer la journée ?")) return;
        confirmEndDay(null);
    };

    const confirmEndDay = async (correction) => {
        setIsSubmitting(true);
        // If we have a correction, use it. Else use standard or GPS exit if available (W3 step 1)
        const mockGps = lastGeofenceExit ? { exitAt: lastGeofenceExit.exitAt } : { exitAt: new Date() };

        await endTimeSession(activeSession.id, mockGps, correction);
        setIsSubmitting(false);
        setShowCorrection(false);
        setPendingEndSession(false);
        setViewMode('INITIAL');
    };

    const handleChangeTask = async () => {
        // Simple prompt for now, waiting for Modal component
        const newTaskId = prompt("ID Nouvelle tâche (1=Inst, 2=Insp, 3=Maint, 4=Transp, 5=Autre)");
        if (!newTaskId) return;

        if (!tasks.find(t => String(t.id) === String(newTaskId))) {
            alert("Tâche invalide");
            return;
        }

        setIsSubmitting(true);
        await switchTask(activeSession.id, activeSession.site_id, newTaskId);
        setIsSubmitting(false);
    };


    // --- HELPERS ---
    const getTaskName = (id) => tasks.find(t => String(t.id) === String(id))?.name || 'Inconnu';


    // --- RENDERERS ---

    const renderCompanionView = () => {
        if (!companionStats) return null; // Or show generic "Select a site to see progress"

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
            </div>
        );
    };


    // 1. INITIAL VIEW
    if (viewMode === 'INITIAL') {
        return (
            <div className="max-w-md mx-auto pb-24 space-y-6">
                <header className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Clock className="text-blue-600" />
                        Heures
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

                {/* Companion View Placeholder showing "Last Site" or "Most Frequent" could be nice here. 
                    For now, finding the most recent session's site to show stats. */}
                {(() => {
                    const lastSession = timeSessions.find(s => String(s.user_id) === String(currentUser?.id));
                    if (lastSession) {
                        // Calc stats only if not already set or different site
                        // Safe to call inline render if we trigger calc in effect? 
                        // Better to use an Effect to set initial companion stats based on history.
                        // For MVP: Effect above handles active session. 
                        // Let's rely on user selecting site in wizard to see stats, 
                        // OR show last visited if available. 
                        // (Requires refactor to set companionStats on mount).
                        return null; // Keep simple for now
                    }
                    return null;
                })()}

                {/* Hint */}
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm flex gap-3">
                    <AlertCircle className="shrink-0 text-blue-500" size={20} />
                    <p>
                        Bienvenue ! N'oubliez pas de lancer le chrono dès votre arrivée sur le chantier.
                    </p>
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
        const siteName = sites.find(s => String(s.id) === String(selectedSiteId))?.name;

        return (
            <div className="max-w-md mx-auto pb-24 flex flex-col h-[calc(100vh-140px)]">
                <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setViewMode('WIZARD_SITE')} className="p-2 -ml-2 text-slate-400 hover:text-slate-600">
                        <ArrowLeft />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">Quelle tâche ?</h2>
                </div>
                <p className="text-sm text-slate-500 mb-6 ml-10">Sur : <span className="font-bold text-blue-600">{siteName}</span></p>

                {/* Show Site Stats here for motivation */}
                <div className="mb-6">
                    {renderCompanionView()}
                </div>

                <div className="grid grid-cols-2 gap-3 pb-4">
                    {tasks.map(task => (
                        <button
                            key={task.id}
                            disabled={isSubmitting}
                            onClick={() => handleStartSession(task.id)}
                            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:bg-blue-50 hover:border-blue-200 hover:shadow-md transition-all flex flex-col items-center gap-3 text-center h-32 justify-center active:scale-95"
                        >
                            {/* Icons could be mapped here based on task name */}
                            <span className="font-bold text-slate-800">{task.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // 4. ACTIVE SESSION
    if (viewMode === 'ACTIVE' && activeSession) {
        // Ensure companion stats are visible for active session
        // (Handled by Effect 1, but safe to render)

        return (
            <div className="max-w-md mx-auto pb-24 space-y-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="text-blue-600 animate-pulse" />
                    En cours
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
                                <p className="text-lg font-bold text-slate-800 text-left truncate">
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
                                    {getTaskName(activeSession.task_id)}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={handleChangeTask}
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
            </div>
        );
    }

    return <div className="p-8 text-center text-slate-400">Loading...</div>;
};

export default TimeTracking;
