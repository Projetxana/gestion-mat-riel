import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Hammer, HardHat, AlertTriangle, Activity, Camera, ClipboardList } from 'lucide-react';
import { supabase } from '../supabaseClient';
import DeliveryNoteModal from '../components/DeliveryNoteModal';
import DailyReportModal from '../components/DailyReportModal';

const Dashboard = () => {
    const { materials, sites, addLog } = useAppContext();
    const navigate = useNavigate();
    const [showCamera, setShowCamera] = useState(false);
    const [showDailyReport, setShowDailyReport] = useState(false);

    const totalTools = materials.length;
    const toolsOnSite = materials.filter(m => m.locationType === 'site').length;
    const toolsInRepair = materials.filter(m => m.locationType === 'repair').length;
    const toolsAvailable = materials.filter(m => m.locationType === 'warehouse').length;

    const handleCameraClick = () => {
        setShowCamera(true);
    };

    // Determine color variables based on stats
    const stats = [
        {
            label: 'Total Outils',
            value: totalTools,
            icon: Hammer,
            color: 'blue',
            path: '/material',
            className: 'bg-blue-600 border-blue-500 shadow-blue-900/40 hover:bg-blue-500',
            iconClass: 'bg-white/20 text-white'
        },
        {
            label: 'Sur Chantier',
            value: toolsOnSite,
            icon: HardHat,
            color: 'green',
            path: '/sites',
            className: 'bg-emerald-600 border-emerald-500 shadow-emerald-900/40 hover:bg-emerald-500',
            iconClass: 'bg-white/20 text-white'
        },
        {
            label: 'En Réparation',
            value: toolsInRepair,
            icon: AlertTriangle,
            color: 'orange',
            path: '/material?filter=repair',
            className: 'bg-orange-600 border-orange-500 shadow-orange-900/40 hover:bg-orange-500',
            iconClass: 'bg-white/20 text-white'
        },
        {
            label: 'Disponible',
            value: toolsAvailable,
            icon: Activity,
            color: 'purple',
            path: '/material?filter=available',
            className: 'bg-indigo-600 border-indigo-500 shadow-indigo-900/40 hover:bg-indigo-500',
            iconClass: 'bg-white/20 text-white'
        },
    ];

    return (
        <div className="h-full flex flex-col justify-center max-w-6xl mx-auto px-6 py-8">
            <div className="text-center mb-10 md:mb-16">
                <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
                    Tableau de bord
                </h1>
                <p className="text-xl text-slate-300 font-light">Bienvenue sur votre espace de gestion</p>
            </div>



            {/* Action Buttons */}
            <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Delivery Note */}
                <button
                    onClick={handleCameraClick}
                    className="group relative flex flex-col items-center justify-center gap-3 px-8 py-6 text-lg font-bold text-white transition-all duration-300 bg-amber-500 border border-amber-400 rounded-2xl shadow-lg hover:bg-amber-400 hover:scale-[1.02] hover:shadow-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                    <div className="p-3 bg-white/20 rounded-full group-hover:rotate-12 transition-transform">
                        <Camera size={32} />
                    </div>
                    <div>
                        <span className="block text-xl">Bon de Livraison</span>
                        <span className="text-sm text-amber-100 font-normal">Scanner et envoyer</span>
                    </div>
                </button>

                {/* Daily Report */}
                <button
                    onClick={() => setShowDailyReport(true)}
                    className="group relative flex flex-col items-center justify-center gap-3 px-8 py-6 text-lg font-bold text-white transition-all duration-300 bg-emerald-500 border border-emerald-400 rounded-2xl shadow-lg hover:bg-emerald-400 hover:scale-[1.02] hover:shadow-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                    <div className="p-3 bg-white/20 rounded-full group-hover:rotate-12 transition-transform">
                        <ClipboardList size={32} />
                    </div>
                    <div>
                        <span className="block text-xl">Rapport Journalier</span>
                        <span className="text-sm text-emerald-100 font-normal">Photos et notes du jour</span>
                    </div>
                </button>
            </div>

            {/* KPI Cards as Main Navigation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
                <Link to="/hilti" className="group relative overflow-hidden p-6 md:p-8 rounded-3xl border border-red-900/50 bg-gradient-to-br from-red-950/50 to-slate-900 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-red-900/20 text-left shadow-lg">
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-red-600/20 rounded-full blur-2xl group-hover:bg-red-600/30 transition-all" />
                    <div className="relative z-10 flex flex-col h-full justify-between min-h-[140px]">
                        <div className="flex items-center justify-between">
                            <div className="p-3 bg-white/5 rounded-2xl backdrop-blur-sm border border-white/10">
                                <img src="/hilti-logo.png" alt="Hilti" className="h-8 w-auto object-contain" />
                            </div>
                            <div className="px-3 py-1 bg-red-600/20 rounded-full border border-red-600/30 text-xs font-bold text-red-400 uppercase tracking-wider">
                                Module Externe
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-2">HILTI</h2>
                            <p className="text-slate-400">Gestion du parc outillage spécifique</p>
                        </div>
                    </div>
                </Link>

                {stats.map((stat, index) => (
                    <button
                        key={index}
                        onClick={() => navigate(stat.path)}
                        className={`group relative overflow-hidden p-6 md:p-8 rounded-3xl border transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl text-left shadow-lg ${stat.className}`}
                    >
                        {/* Decorative background shape */}
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-8">
                                <div className={`p-4 rounded-2xl ${stat.iconClass}`}>
                                    <stat.icon size={36} />
                                </div>
                                <span className="text-5xl font-bold text-white tracking-tight">
                                    {stat.value}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">
                                    {stat.label}
                                </h3>
                                <div className="h-1 w-12 bg-white/30 rounded-full group-hover:w-full transition-all duration-500" />
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {showCamera && <DeliveryNoteModal onClose={() => setShowCamera(false)} />}
            {showDailyReport && <DailyReportModal onClose={() => setShowDailyReport(false)} />}
        </div>
    );
};

export default Dashboard;
