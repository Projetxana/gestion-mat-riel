import React, { useState } from 'react';
import { X, Clock, Trash2, Calendar, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { formatHoursHHMM } from '../utils/quarterHours';

const DayDetailModal = ({ dateStr, sessions, sites, projectTasks, onClose }) => {
    const { deleteTimeSession, currentUser } = useAppContext();
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');
    const sortedSessions = [...sessions].sort((a, b) =>
        new Date(a.corrected_start_at || a.punch_start_at) -
        new Date(b.corrected_start_at || b.punch_start_at));

    const deletePending = async (session) => {
        if (session.approved) return;
        if (!window.confirm('Supprimer définitivement ces heures non validées ?')) return;
        setBusyId(session.id);
        setError('');
        const result = await deleteTimeSession(session.id);
        setBusyId(null);
        if (!result?.success) setError(result?.error || 'Suppression non confirmée.');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-5">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Calendar className="text-blue-600" /> {dateStr}
                        </h3>
                        <p className="text-slate-500 text-sm">Détail des heures enregistrées</p>
                    </div>
                    <button type="button" aria-label="Fermer" onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-full">
                        <X size={24} className="text-slate-400" />
                    </button>
                </div>
                {error && <p role="alert" className="mb-3 text-sm rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
                {currentUser?.role === 'admin' && <Link
                    to="/timetracking/validation" onClick={onClose}
                    className="mb-4 flex items-center gap-2 rounded-lg bg-blue-50 text-blue-700 font-semibold px-4 py-3">
                    <ShieldCheck size={18} /> Corriger ou valider des heures
                </Link>}
                <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                    {sortedSessions.length === 0 ? (
                        <p className="text-center text-slate-400 py-8 italic">Aucune activité enregistrée ce jour-là.</p>
                    ) : sortedSessions.map(session => {
                        const site = sites.find(item => String(item.id) === String(session.site_id));
                        const task = projectTasks?.find(item => String(item.id) === String(session.section_id));
                        const start = session.corrected_start_at || session.punch_start_at;
                        const end = session.corrected_end_at || session.punch_end_at;
                        const minutes = end ? (new Date(end) - new Date(start)) / 60000 : 0;
                        return <div key={session.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <h4 className="font-bold text-slate-800">{site?.name || 'Chantier inconnu'}</h4>
                                    <p className="text-xs text-slate-500">{task?.name || 'Tâche inconnue'}</p>
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-md ${session.approved
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'}`}>
                                    {session.approved ? 'Validé' : 'À valider'}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                                <Clock size={15} className="text-slate-400" />
                                {new Date(start).toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' })}
                                <span>–</span>
                                {end ? new Date(end).toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' }) : 'En cours'}
                                {minutes > 0 && <strong>{formatHoursHHMM(minutes / 60)}</strong>}
                            </div>
                            {(session.corrected_start_at || session.corrected_end_at) && <p className="text-xs text-amber-700">Horaire corrigé par un administrateur</p>}
                            {!session.approved && <button type="button" disabled={busyId != null}
                                onClick={() => void deletePending(session)}
                                className="min-h-10 flex items-center gap-2 text-red-600 text-sm font-semibold disabled:opacity-50">
                                <Trash2 size={15} /> {busyId === session.id ? 'Suppression…' : 'Supprimer les heures non validées'}
                            </button>}
                        </div>;
                    })}
                </div>
                <button type="button" onClick={onClose}
                    className="mt-4 w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl">Fermer</button>
            </div>
        </div>
    );
};

export default DayDetailModal;
