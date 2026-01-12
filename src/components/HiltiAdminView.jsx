import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { User, ChevronRight, ArrowLeft } from 'lucide-react';
import HiltiUserView from './HiltiUserView';

const HiltiAdminView = () => {
    const { users, hiltiTools } = useAppContext();
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const getToolCount = (userId) => hiltiTools.filter(t => t.assigned_to == userId).length;

    if (selectedUserId) {
        const selectedUser = users.find(u => u.id === selectedUserId);
        return (
            <div className="space-y-4 animate-in slide-in-from-right-4">
                <button
                    onClick={() => setSelectedUserId(null)}
                    className="flex items-center text-slate-400 hover:text-white transition-colors mb-4"
                >
                    <ArrowLeft size={20} className="mr-2" />
                    Retour à la liste des utilisateurs
                </button>
                <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-4">
                    Outils de <span className="text-red-500">{selectedUser?.name}</span>
                </h2>
                <HiltiUserView targetUserId={selectedUserId} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <input
                type="text"
                placeholder="Rechercher un utilisateur..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-red-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredUsers.map(user => (
                    <div
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-red-500 transition-all cursor-pointer flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-slate-300 font-bold text-lg">
                                {user.name.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-white group-hover:text-red-400 transition-colors">{user.name}</h3>
                                <p className="text-sm text-slate-400">{user.role === 'admin' ? 'Administrateur' : 'Technicien'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="px-3 py-1 bg-slate-900 rounded-full text-xs text-slate-400 font-mono border border-slate-700">
                                {getToolCount(user.id)} outils
                            </span>
                            <ChevronRight className="text-slate-500 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default HiltiAdminView;
