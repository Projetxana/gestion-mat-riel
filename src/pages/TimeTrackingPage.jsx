import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, Play, Square, RefreshCw, AlertCircle, ChevronRight, ArrowLeft, PenLine, AlertTriangle, Info } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import WeeklySummary from '../components/WeeklySummary';
import AdminHoursView from '../modules/hours_v2/AdminHoursView';
import LeaderHoursView from '../modules/hours_v2/LeaderHoursView';
import BreakReportModal from '../components/BreakReportModal';

const TimeTracking = () => {
    const {
        timeSessions,
        sites,
        currentUser,
        startTimeSession,
        endTimeSession,
        switchTask,
        addProjectTask,
        projectTasks
    } = useAppContext();
    const navigate = useNavigate();
    const location = useLocation();

    // --- HOURS V2 LOGIC ---
    if (currentUser?.role === 'admin') {
        return <AdminHoursView />;
    }
    const isLeader = currentUser?.role === 'leader';

    // VIEW STATE: 'INITIAL' | 'WIZARD_SITE' | 'WIZARD_TASK' | 'ACTIVE'
    const [viewMode, setViewMode] = useState('INITIAL');
    const [activeSession, setActiveSession] = useState(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    // WIZARD STATE
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // TASK SWITCH STATE
    const [showChangeTaskModal, setShowChangeTaskModal] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const [switchedTaskStats, setSwitchedTaskStats] = useState(null);

    // BREAK REPORT STATE
    const [showBreakReport, setShowBreakReport] = useState(false);

    // OVERTIME STATE
    const [showOvertimeModal, setShowOvertimeModal] = useState(false);
    const [pendingAdjustment, setPendingAdjustment] = useState(0);
    const [showOvertimeConfirmed, setShowOvertimeConfirmed] = useState(false);

    // --- HANDLERS ---

    const handleEndDay = async () => {
        if (!window.confirm("Terminer la journée ?")) return;
        const isValidRole = currentUser?.role !== 'admin';
        if (isValidRole) {
            setShowBreakReport(true);
        } else {
            confirmEndDay(0);
        }
    };

    const handleBreakConfirm = (reportData) => {
        setShowBreakReport(false);
        // After break report, check if overtime
        checkOvertime(reportData.adjustmentMinutes);
    };

    const checkOvertime = (adjustmentMinutes) => {
        if (!activeSession) {
            confirmEndDay(adjustmentMinutes);
            return;
        }
        const startTime = new Date(activeSession.punch_start_at).getTime();
        const now = new Date().getTime();
        // Calculate effective hours including break adjustment
        const effectiveMs = (now - startTime) + (adjustmentMinutes * 60000);
        const effectiveHours = effectiveMs / (1000 * 60 * 60);

        if (effectiveHours > 8) {
            // Session exceeds 8h — ask about overtime
            setPendingAdjustment(adjustmentMinutes);
            setShowOvertimeModal(true);
        } else {
            confirmEndDay(adjustmentMinutes);
        }
    };

    const handleOvertimeDecision = (isOvertime) => {
        setShowOvertimeModal(false);
        if (isOvertime) {
            // Confirmed overtime — show info message then end
            setShowOvertimeConfirmed(true);
        } else {
            // Adjust to exactly 8h from start
            const startTime = new Date(activeSession.punch_start_at).getTime();
            const eightHoursMs = 8 * 60 * 60 * 1000;
            const adjustedEnd = new Date(startTime + eightHoursMs);
            const adjustmentFromNow = adjustedEnd.getTime() - new Date().getTime();
            // adjustmentFromNow is in ms, convert to minutes
            confirmEndDay(Math.round(adjustmentFromNow / 60000));
        }
    };

    const handleOvertimeConfirmedClose = () => {
        setShowOvertimeConfirmed(false);
        confirmEndDay(pendingAdjustment);
    };

    const confirmEndDay = async (adjustmentMinutes = 0) => {
        setIsSubmitting(true);
        const baseTime = new Date();
        const adjustedTime = new Date(baseTime.getTime() + (adjustmentMinutes * 60000));
        const finalCorrection = {
            time: adjustedTime,
            isModified: adjustmentMinutes !== 0,
        };
        await endTimeSession(activeSession.id, null, finalCorrection);
        setIsSubmitting(false);
        setViewMode('INITIAL');
    };

    // --- EFFECTS ---

    useEffect(() => {
        if (location.state?.autoSelectSiteId && viewMode === 'INITIAL') {
            handleSelectSite(location.state.autoSelectSiteId);
            window.history.replaceState({}, document.title);
        }
    }, [location.state, viewMode]);

    useEffect(() => {
        const active = timeSessions.find(s =>
            String(s.user_id) === String(currentUser?.id) &&
            s.punch_end_at === null
        );
        if (active?.id === activeSession?.id) return;
        setActiveSession(active);
        if (active) {
            setViewMode('ACTIVE');
            setIsSwitching(false);
        } else if (!isSwitching) {
            setViewMode('INITIAL');
        }
    }, [timeSessions, currentUser]);

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
            updateTimer();
            interval = setInterval(updateTimer, 1000);
        } else {
            setElapsedTime('00:00:00');
        }
        return () => clearInterval(interval);
    }, [activeSession]);

    // --- ACTIONS ---

    const handleSelectSite = (id) => {
        setSelectedSiteId(id);
        setSelectedTaskId('');
        setViewMode('WIZARD_TASK');
    };

    const handleStartSession = async (sectionId) => {
        setIsSubmitting(true);
        const result = await startTimeSession(selectedSiteId, sectionId, null);
        setIsSubmitting(false);
        if (result.error) {
            alert(result.error);
        }
    };

    // --- RENDERERS ---

    // 0. SWITCHING SUMMARY
    if (switchedTaskStats) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                <div className="bg-slate-900 w-full max-w-sm rounded-2xl p-8 space-y-6 shadow-2xl border border-slate-700 text-center">
                    <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
                        <RefreshCw className="text-white animate-spin-slow" size={32} />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Activité Terminée</h3>
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase font-bold mb-1">Tâche précédente</p>
                        <p className="text-lg font-bold text-blue-300">{switchedTaskStats.name || 'Inconnue'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <p className="text-xs text-slate-400 uppercase mb-1">Durée</p>
                            <p className="text-2xl font-mono font-bold text-white">
                                {Math.floor(switchedTaskStats.hours)}h {Math.round((switchedTaskStats.hours % 1) * 60)}m
                            </p>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-center">
                            <span className="text-green-400 font-bold text-sm">✅ Enregistré</span>
                        </div>
                    </div>
                    <button
                        onClick={() => setSwitchedTaskStats(null)}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95"
                    >
                        Continuer vers la nouvelle tâche
                    </button>
                </div>
            </div>
        );
    }

    // 0.5 SWITCHING LOADER
    if (isSwitching && !activeSession) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 text-white">
                <div className="text-center space-y-4">
                    <RefreshCw className="animate-spin text-blue-500 mx-auto" size={48} />
                    <p className="text-xl font-bold">Changement d'activité...</p>
                    <p className="text-slate-400 text-sm">Nous enregistrons votre session.</p>
                </div>
            </div>
        );
    }

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

                <button
                    onClick={() => setViewMode('WIZARD_SITE')}
                    className="w-full py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex flex-col items-center justify-center gap-2 transition-transform active:scale-95"
                >
                    <Play size={32} fill="currentColor" />
                    <span className="text-xl font-bold tracking-wide">DÉBUTER MA JOURNÉE</span>
                </button>

                <button
                    onClick={() => navigate('/timetracking/manual')}
                    className="w-full py-4 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl border-2 border-slate-200 hover:border-blue-300 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-95"
                >
                    <PenLine size={20} className="text-blue-500" />
                    <span className="text-base font-bold">Ajouter des heures manuellement</span>
                </button>

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm flex gap-3">
                    <AlertCircle className="shrink-0 text-blue-500" size={20} />
                    <p>Bienvenue ! N'oubliez pas de lancer le chrono dès votre arrivée sur le chantier.</p>
                </div>

                <div className="pt-4 border-t border-slate-200 mt-4">
                    <h3 className="text-sm font-bold text-slate-500 mb-4 px-1">MES HEURES SEMAINE</h3>
                    <WeeklySummary sessions={timeSessions} sites={sites} projectTasks={projectTasks} />
                </div>

                {isLeader && <LeaderHoursView />}
            </div>
        );
    }

    // 2. WIZARD STEP 1: SITE
    if (viewMode === 'WIZARD_SITE') {
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

    // 3. WIZARD STEP 2: TASK (kept — but NO progress/stats shown)
    if (viewMode === 'WIZARD_TASK') {
        const site = sites.find(s => String(s.id) === String(selectedSiteId));
        const liveSiteTasks = projectTasks && projectTasks.length > 0
            ? projectTasks.filter(pt => String(pt.project_id) === String(selectedSiteId))
            : [];
        const legacyTasks = site?.project_tasks && site.project_tasks.length > 0 ? site.project_tasks : (site?.tasks || []);
        const siteTasks = liveSiteTasks.length > 0 ? liveSiteTasks : legacyTasks;

        return (
            <div className="max-w-md mx-auto pb-24 flex flex-col h-[calc(100vh-140px)]">
                <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => setViewMode('WIZARD_SITE')} className="p-2 -ml-2 text-slate-400 hover:text-slate-600">
                        <ArrowLeft />
                    </button>
                    <h2 className="text-xl font-bold text-slate-800">Quelle tâche ?</h2>
                </div>
                <p className="text-sm text-slate-500 mb-6 ml-10">Sur : <span className="font-bold text-black">{site?.name}</span></p>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                    {siteTasks.length === 0 ? (
                        <div className="text-center space-y-4 py-4">
                            <p className="text-slate-500">Aucune section définie pour ce chantier.</p>
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
                                                const result = await addProjectTask({
                                                    name: nameEl.value,
                                                    project_id: Number(selectedSiteId),
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
                                        <option key={task.id} value={task.id}>{task.name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                    <ChevronRight className="rotate-90" />
                                </div>
                            </div>
                            <div className="mt-4 text-center">
                                <button
                                    onClick={async () => {
                                        const name = window.prompt("Ajouter une tâche :");
                                        if (name) {
                                            const result = await addProjectTask({
                                                name,
                                                project_id: Number(selectedSiteId),
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

    // 4. ACTIVE SESSION — Shows task name but NO progress/stats
    if (viewMode === 'ACTIVE' && activeSession) {
        const currentSection = projectTasks?.find(pt => String(pt.id) === String(activeSession.section_id));
        const taskName = currentSection ? currentSection.name : 'Tâche en cours';
        const siteName = sites.find(s => String(s.id) === String(activeSession.site_id))?.name || 'Chantier';

        return (
            <div className="max-w-md mx-auto pb-24 space-y-6">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="text-blue-600 animate-pulse" />
                    Session Active
                </h1>

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
                                <p className="text-lg font-bold text-black text-left truncate">{siteName}</p>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="text-xs text-blue-400 uppercase font-bold text-left mb-1">Tâche en cours</p>
                                <p className="text-lg font-bold text-blue-800 text-left flex items-center gap-2">
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                    </span>
                                    <span className="truncate">{taskName}</span>
                                </p>
                            </div>
                        </div>

                        {/* No progress bar, no companion view — just action buttons */}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <button
                                onClick={() => setShowChangeTaskModal(true)}
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

                {showBreakReport && (
                    <BreakReportModal onConfirm={handleBreakConfirm} />
                )}

                {showOvertimeModal && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
                            <div className="bg-amber-50 p-6 border-b border-amber-100 text-center">
                                <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <AlertTriangle className="text-amber-600" size={28} />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800">Temps supplémentaire détecté</h2>
                                <p className="text-slate-500 text-sm mt-2">
                                    Votre journée dépasse <span className="font-bold">8 heures</span>.
                                </p>
                            </div>
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-slate-600 text-center">
                                    Avez-vous réellement fait du temps supplémentaire aujourd'hui ?
                                </p>
                                <button
                                    onClick={() => handleOvertimeDecision(true)}
                                    className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                                >
                                    Oui, j'ai fait du temps supplémentaire
                                </button>
                                <button
                                    onClick={() => handleOvertimeDecision(false)}
                                    className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all active:scale-95"
                                >
                                    Non, ajuster ma journée à 8h
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showOvertimeConfirmed && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl">
                            <div className="bg-blue-50 p-6 border-b border-blue-100 text-center">
                                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Info className="text-blue-600" size={28} />
                                </div>
                                <h2 className="text-xl font-bold text-slate-800">Information importante</h2>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                    <p className="text-sm text-amber-800 font-medium text-center leading-relaxed">
                                        ⚠️ Le temps supplémentaire doit <span className="font-bold">impérativement être validé par la direction</span> pour être comptabilisé.
                                    </p>
                                </div>
                                <button
                                    onClick={handleOvertimeConfirmedClose}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                                >
                                    J'ai compris, terminer ma journée
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showChangeTaskModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl">
                            <h3 className="text-lg font-bold text-slate-800">Changer d'activité</h3>
                            <p className="text-sm text-slate-500">Sélectionnez la nouvelle tâche en cours.</p>
                            <div className="relative">
                                <select
                                    className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-3 pr-10 focus:ring-blue-500"
                                    onChange={async (e) => {
                                        if (e.target.value) {
                                            if (window.confirm('Confirmer le changement ?')) {
                                                const newSectionId = e.target.value;
                                                setIsSwitching(true);
                                                setShowChangeTaskModal(false);
                                                const startTime = new Date(activeSession.punch_start_at).getTime();
                                                const now = new Date().getTime();
                                                const hours = (now - startTime) / (1000 * 60 * 60);
                                                const oldTaskName = projectTasks?.find(pt => String(pt.id) === String(activeSession.section_id))?.name
                                                    || `Section #${activeSession.section_id}`;
                                                const result = await switchTask(activeSession.id, activeSession.site_id, newSectionId);
                                                if (result.error) {
                                                    alert("Erreur lors du changement de tâche : " + result.error);
                                                    setIsSwitching(false);
                                                    return;
                                                }
                                                setSwitchedTaskStats({ name: oldTaskName, hours });
                                            }
                                        }
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>-- Sélectionner --</option>
                                    {(() => {
                                        const site = sites.find(s => s.id === activeSession.site_id);
                                        const liveTasks = projectTasks?.filter(pt => String(pt.project_id) === String(activeSession.site_id)) || [];
                                        const tasks = liveTasks.length > 0 ? liveTasks : (site?.project_tasks || site?.tasks || []);
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

                {isLeader && <LeaderHoursView />}
            </div>
        );
    }

    return <div className="p-8 text-center text-slate-400">Loading...</div>;
};

export default TimeTracking;
