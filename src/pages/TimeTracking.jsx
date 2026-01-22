import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Clock, Play, Square, RefreshCw, MapPin, AlertCircle, CheckCircle } from 'lucide-react';

const TimeTracking = () => {
    const {
        timeSessions,
        tasks,
        sites,
        currentUser,
        startTimeSession,
        endTimeSession,
        switchTask,
        logManualTime
    } = useAppContext();

    const [activeSession, setActiveSession] = useState(null);
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Timer state
    const [elapsedTime, setElapsedTime] = useState('00:00:00');

    useEffect(() => {
        // Find active session for current user
        const active = timeSessions.find(s =>
            String(s.user_id) === String(currentUser?.id) &&
            s.punch_end_at === null
        );
        setActiveSession(active);

        // Timer Logic
        let interval;
        if (active) {
            const start = new Date(active.punch_start_at).getTime();

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
    }, [timeSessions, currentUser]);

    // Helpers to get Names
    const getSiteName = (id) => sites.find(s => String(s.id) === String(id))?.name || 'Inconnu';
    const getTaskName = (id) => tasks.find(t => String(t.id) === String(id))?.name || 'Inconnu';

    // Actions
    const handleStartDay = async () => {
        if (!selectedSiteId || !selectedTaskId) return;
        setIsSubmitting(true);

        // Mock GPS for now (TODO: Implement real navigator.geolocation)
        const mockGps = { entryAt: new Date() };

        const result = await startTimeSession(selectedSiteId, selectedTaskId, mockGps);
        if (result.error) alert(result.error);
        setIsSubmitting(false);
    };

    const handleEndDay = async () => {
        if (!activeSession) return;
        if (!window.confirm("Terminer la journée ?")) return;

        setIsSubmitting(true);
        const mockGps = { exitAt: new Date() };

        const result = await endTimeSession(activeSession.id, mockGps);
        if (result.error) alert(result.error);
        setIsSubmitting(false);
    };

    const handleChangeTask = async () => {
        if (!activeSession) return;
        const newTaskId = prompt("Entrez l'ID de la nouvelle tâche (1=Inst, 2=Insp, 3=Maint, 4=Transp, 5=Autre)");
        // Better UI needed later, but standard prompt for MVP speed
        if (!newTaskId) return;

        // Validate task ID exists
        if (!tasks.find(t => String(t.id) === String(newTaskId))) {
            alert("Tâche invalide");
            return;
        }

        setIsSubmitting(true);
        const result = await switchTask(activeSession.id, activeSession.site_id, newTaskId);
        if (result.error) alert(result.error);
        setIsSubmitting(false);
    };

    // --- RENDER ---

    return (
        <div className="max-w-md mx-auto space-y-6 pb-20">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="text-blue-600" />
                Mes Heures
            </h1>

            {/* ACTIVE SESSION CARD */}
            {activeSession ? (
                <div className="bg-white rounded-2xl shadow-lg border border-blue-100 overflow-hidden relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-green-400 animate-pulse"></div>

                    <div className="p-8 text-center space-y-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                            En cours
                        </div>

                        <div>
                            <p className="text-slate-500 text-sm font-medium uppercase tracking-wide">Temps écoulé</p>
                            <div className="text-6xl font-black text-slate-800 font-mono tracking-tighter my-2">
                                {elapsedTime}
                            </div>
                            <p className="text-slate-400 text-xs">Début : {new Date(activeSession.punch_start_at).toLocaleTimeString().slice(0, 5)}</p>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4 text-left space-y-3 border border-slate-100">
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase">Chantier</p>
                                <p className="font-bold text-slate-800 text-lg">{getSiteName(activeSession.site_id)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase">Tâche</p>
                                <p className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    {getTaskName(activeSession.task_id)}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleChangeTask}
                                disabled={isSubmitting}
                                className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-colors"
                            >
                                <RefreshCw size={20} />
                                Changer Tâche
                            </button>
                            <button
                                onClick={handleEndDay}
                                disabled={isSubmitting}
                                className="py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex flex-col items-center justify-center gap-1 shadow-lg shadow-slate-900/20 transition-colors"
                            >
                                <Square size={20} fill="currentColor" />
                                Terminer
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* START DAY CARD */
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Play size={32} fill="currentColor" className="ml-1" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">Débuter ma journée</h2>
                        <p className="text-slate-500 text-sm">Sélectionnez le chantier et votre tâche</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Chantier</label>
                            <select
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-lg font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                                value={selectedSiteId}
                                onChange={e => setSelectedSiteId(e.target.value)}
                            >
                                <option value="">Choisir un chantier...</option>
                                {sites.filter(s => s.status === 'active').map(site => (
                                    <option key={site.id} value={site.id}>{site.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Tâche</label>
                            <div className="grid grid-cols-2 gap-2">
                                {tasks.map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => setSelectedTaskId(task.id)}
                                        className={`p-3 rounded-xl border text-sm font-bold transition-all ${String(selectedTaskId) === String(task.id)
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/30'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {task.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleStartDay}
                        disabled={!selectedSiteId || !selectedTaskId || isSubmitting}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all ${selectedSiteId && selectedTaskId
                                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30 transform active:scale-95'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {isSubmitting ? 'Démarrage...' : 'COMMEEEEENCER !'} 🚀
                    </button>

                    {/* Manual Entry Link */}
                    <div className="pt-4 text-center border-t border-slate-100 mt-2">
                        <button className="text-sm text-slate-400 underline hover:text-slate-600">
                            J'ai oublié de puncher (Ajout Manuel)
                        </button>
                    </div>
                </div>
            )}

            {/* Recent History / Debug */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Historique Récent</h3>
                {timeSessions.filter(s => String(s.user_id) === String(currentUser?.id)).slice(0, 3).map(session => (
                    <div key={session.id} className="bg-white p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                        <div>
                            <p className="font-bold text-slate-800">{getSiteName(session.site_id)}</p>
                            <p className="text-xs text-slate-500">{getTaskName(session.task_id)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-400">{new Date(session.punch_start_at).toLocaleDateString()}</p>
                            <div className="font-mono font-bold text-slate-600">
                                {new Date(session.punch_start_at).toLocaleTimeString().slice(0, 5)}
                                <span className="text-slate-300 mx-1">➜</span>
                                {session.punch_end_at ? new Date(session.punch_end_at).toLocaleTimeString().slice(0, 5) : '...'}
                            </div>
                        </div>
                    </div>
                ))}
                {timeSessions.length === 0 && (
                    <p className="text-center text-slate-400 text-sm italic py-4">Aucune session enregistrée</p>
                )}
            </div>
        </div>
    );
};

export default TimeTracking;
