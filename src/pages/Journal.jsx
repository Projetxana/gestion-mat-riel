import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { ClipboardList, Clock, User, FileText } from 'lucide-react';

const Journal = () => {
    const { logs, users } = useAppContext();
    const [filterUser, setFilterUser] = useState('all');

    const getUserName = (id) => {
        const user = users.find(u => u.id === id);
        return user ? user.name : 'Utilisateur Inconnu';
    };

    const filteredLogs = filterUser === 'all'
        ? logs
        : logs.filter(log => log.userId === Number(filterUser));

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="page-title">Journal d'Activité</h1>
                    <p className="text-slate-400">Suivez tous les mouvements et mises à jour</p>
                </div>
            </div>

            <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <ClipboardList className="text-blue-400" size={20} />
                        Logs Système
                    </h2>
                    <select
                        className="w-48 text-sm"
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                    >
                        <option value="all">Tous les utilisateurs</option>
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                <div className="relative border-l border-slate-800 ml-4 space-y-8">
                    {filteredLogs.map((log, index) => (
                        <div key={log.id} className="relative pl-8">
                            <span className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-800 border border-slate-600 ring-4 ring-slate-900" />

                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                                <span className="text-sm font-medium text-blue-400 flex items-center gap-2">
                                    <User size={14} />
                                    {getUserName(log.userId)}
                                </span>
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <Clock size={12} />
                                    {new Date(log.timestamp).toLocaleString()}
                                </span>
                            </div>

                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-800">
                                <p className="text-slate-300 text-sm flex items-start gap-2">
                                    <FileText size={16} className="mt-0.5 text-slate-500 shrink-0" />
                                    {log.details}
                                </p>
                            </div>
                        </div>
                    ))}
                    {filteredLogs.length === 0 && (
                        <div className="py-8 text-center text-slate-500 ml-4">
                            Aucun log trouvé pour les critères sélectionnés.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Journal;
