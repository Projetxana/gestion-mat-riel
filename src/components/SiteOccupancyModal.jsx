import React from 'react';
import { X, Clock, User, HardHat } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

const SiteOccupancyModal = ({ site, onClose }) => {
    const { timeSessions, users, tasks } = useAppContext();

    // Filter active sessions for this site
    const activeSessions = timeSessions.filter(s =>
        String(s.site_id) === String(site.id) &&
        s.punch_end_at === null
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{site.name}</h2>
                        <p className="text-sm text-slate-500">{activeSessions.length} {activeSessions.length === 1 ? 'personne' : 'personnes'} sur site</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
                    {activeSessions.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <HardHat size={48} className="mx-auto mb-3 opacity-20" />
                            <p>Personne n'est pointé sur ce chantier actuellement.</p>
                        </div>
                    ) : (
                        activeSessions.map((session) => {
                            const user = users.find(u => String(u.id) === String(session.user_id));
                            const task = tasks.find(t => String(t.id) === String(session.task_id));
                            const startTime = new Date(session.punch_start_at);
                            const now = new Date();
                            const diff = now - startTime;
                            const hours = Math.floor(diff / (1000 * 60 * 60));
                            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                            return (
                                <div key={session.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-slate-200 text-slate-400 font-bold text-lg">
                                            {user?.name?.charAt(0) || <User size={20} />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{user?.name || 'Utilisateur inconnu'}</p>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{task?.name || 'Tâche'}</span>
                                                {user?.level && (
                                                    <span className="text-slate-400">• {user.level}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 text-green-600 font-mono font-bold text-sm bg-green-50 px-2 py-1 rounded-lg">
                                            <Clock size={12} />
                                            {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            Depuis {startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default SiteOccupancyModal;
