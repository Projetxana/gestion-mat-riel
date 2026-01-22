import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { CheckCircle, AlertTriangle, Clock, MapPin, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

const ValidationPage = () => {
    const { currentUser, users, sites, tasks, timeSessions, addLog } = useAppContext();
    const navigate = useNavigate();
    const [unapprovedSessions, setUnapprovedSessions] = useState([]);
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const canValidate =
            currentUser?.role === 'admin' ||
            currentUser?.role === 'foreman' ||
            currentUser?.level === "Chef d'équipe" ||
            currentUser?.level === 'Compagnon';

        if (!canValidate) {
            navigate('/timetracking'); // Redirect unauthorized
        }
    }, [currentUser, navigate]);

    useEffect(() => {
        // Filter local sessions for speed (or fetch from DB for reliability, but local is fine for optimistic app)
        const unapproved = timeSessions.filter(s =>
            !s.approved &&
            s.punch_end_at !== null // Only finished sessions
        ).sort((a, b) => new Date(b.punch_start_at) - new Date(a.punch_start_at));

        setUnapprovedSessions(unapproved);
    }, [timeSessions]);

    const handleValidate = async (sessionId) => {
        // Optimistic update in context happens automatically if we used a setTimeSessions there?
        // AppContext handles real-time updates, so if we update DB, it should reflect.
        // We do strictly DB update here.

        const { error } = await supabase.from('time_sessions').update({ approved: true }).eq('id', sessionId);

        if (error) {
            alert("Erreur: " + error.message);
        } else {
            addLog(`VALIDATION: ${currentUser.name} approved session ${sessionId}`);
            // Optimistic UI Removal
            setUnapprovedSessions(prev => prev.filter(s => s.id !== sessionId));
        }
    };

    const getDuration = (start, end) => {
        const diff = new Date(end).getTime() - new Date(start).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.round((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '--:--';
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Group by Date for better readability? Or simply list. List is fine for MVP.

    return (
        <div className="max-w-3xl mx-auto pb-24">
            <h1 className="page-title text-slate-800 mb-6 flex items-center gap-2">
                <CheckCircle className="text-green-600" />
                Validation des Heures
            </h1>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="font-bold text-slate-700">En attente ({unapprovedSessions.length})</h2>
                    <div className="text-sm text-slate-400">
                        {/* Could add filters here */}
                    </div>
                </div>

                {unapprovedSessions.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
                        <p>Tout est validé ! Bon travail.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {unapprovedSessions.map(session => {
                            const user = users.find(u => String(u.id) === String(session.user_id));
                            const site = sites.find(s => String(s.id) === String(session.site_id));
                            const task = tasks.find(t => String(t.id) === String(session.task_id));

                            // Check for Flags
                            const manualFlag = session.manual_entry;
                            const gpsDiffStart = session.gps_first_entry_at && Math.abs(new Date(session.punch_start_at) - new Date(session.gps_first_entry_at)) > 5 * 60000;
                            const gpsDiffEnd = session.gps_last_exit_at && Math.abs(new Date(session.punch_end_at) - new Date(session.gps_last_exit_at)) > 5 * 60000;
                            const hasFlag = manualFlag || gpsDiffStart || gpsDiffEnd;

                            // Effective times (use corrected if present)
                            const startTime = session.corrected_start_at || session.punch_start_at;
                            const endTime = session.corrected_end_at || session.punch_end_at;

                            return (
                                <div key={session.id} className="p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-slate-900">{user?.name || 'Inconnu'}</span>
                                                <span className="text-xs text-slate-400">• {new Date(session.punch_start_at).toLocaleDateString()}</span>
                                                {hasFlag && <AlertTriangle size={14} className="text-amber-500" />}
                                            </div>
                                            <div className="text-sm text-slate-600 mb-2">
                                                <span className="font-semibold text-blue-600">{site?.name}</span>
                                                <span className="mx-2 text-slate-300">|</span>
                                                <span>{task?.name}</span>
                                            </div>

                                            <div className="flex items-center gap-6 text-sm">
                                                <div className="flex items-center gap-1.5" title="Début">
                                                    <Clock size={14} className="text-green-500" />
                                                    <span className={session.corrected_start_at ? 'text-amber-600 font-bold' : ''}>
                                                        {formatTime(startTime)}
                                                    </span>
                                                    {gpsDiffStart && <span className="text-[10px] text-red-400 ml-1">(GPS: {formatTime(session.gps_first_entry_at)})</span>}
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Fin">
                                                    <Clock size={14} className="text-red-500" />
                                                    <span className={session.corrected_end_at ? 'text-amber-600 font-bold' : ''}>
                                                        {formatTime(endTime)}
                                                    </span>
                                                </div>
                                                <div className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-xs">
                                                    {getDuration(startTime, endTime)}
                                                </div>
                                            </div>

                                            {manualFlag && (
                                                <p className="text-[10px] text-amber-600 mt-1 font-medium uppercase tracking-wide">Saisie Manuelle</p>
                                            )}
                                        </div>

                                        <div className="flex items-center">
                                            <button
                                                onClick={() => handleValidate(session.id)}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
                                            >
                                                <CheckCircle size={16} />
                                                Valider
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ValidationPage;
