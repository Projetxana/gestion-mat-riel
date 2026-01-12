import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import HiltiAdminView from '../components/HiltiAdminView';
import HiltiUserView from '../components/HiltiUserView';

const HiltiPage = () => {
    const { currentUser } = useAppContext();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.email === 'admin@antigravity.com';

    return (
        <div className="min-h-screen bg-slate-900 pb-20">
            {/* Header */}
            <div className="bg-slate-900/90 backdrop-blur-xl sticky top-0 z-40 border-b border-slate-800">
                <div className="px-4 py-4 flex items-center gap-4 max-w-5xl mx-auto">
                    <Link to="/" className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={24} />
                    </Link>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <img src="/hilti-logo.png" alt="Hilti" className="h-6 object-contain" />
                            <span className="text-xl font-bold bg-gradient-to-r from-red-600 to-red-400 bg-clip-text text-transparent">Connect</span>
                        </div>
                        <p className="text-xs text-slate-400">Parc Outillage</p>
                    </div>
                    {/* User Profile Tiny */}
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-red-500 font-bold uppercase tracking-wider">{isAdmin ? 'Mode Administrateur' : 'Mon Inventaire'}</span>
                        <span className="text-sm font-bold text-white">{currentUser?.name}</span>
                    </div>
                </div>
            </div>

            <div className="p-4 max-w-5xl mx-auto mt-4">
                {isAdmin ? <HiltiAdminView /> : <HiltiUserView />}
            </div>
        </div>
    );
};

export default HiltiPage;
